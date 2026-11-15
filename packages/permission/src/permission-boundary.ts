import { isAbsolute, join, relative, sep } from "node:path";

import type { EffectiveSandboxScope } from "../../sandbox/src/index";
import type { PermissionProfile } from "./types";

/**
 * 越界 Action 的风险类别。
 *
 * @remarks
 * `auto_review` 只对命中规则表的越界类别发起人工裁决；其它越界由规则表放行。
 * 类别集合为空表示越界本身不涉及规则表命中项，例如只读访问工作区外路径。
 *
 * @example
 * ```ts
 * const risk: PermissionRiskClass = "outside_write";
 * ```
 */
export type PermissionRiskClass = "outside_write" | "network" | "destructive_command" | "git_write";

/**
 * 一次 Action 的权限边界判定输入。
 *
 * @remarks
 * `effectiveScope` 只包含工作区之外的增量文件访问与网络能力；工作区树与 `.git` 读取属于边界 baseline，
 * 不出现在该范围中。`workspaceRoot` 必须是已解析的绝对真实路径，`writableRoots` 中的路径按绝对路径比较。
 *
 * @example
 * ```ts
 * const request: PermissionBoundaryRequest = {
 *   toolId: "bash",
 *   effectiveScope: { extraFiles: [], network: "all_outbound" },
 *   workspaceRoot: "/Users/me/project",
 *   destructiveCommand: false,
 * };
 * ```
 */
export interface PermissionBoundaryRequest {
    /** 待执行 Action 的工具唯一标识。 */
    readonly toolId: string;
    /** 工作区之外的增量文件访问与网络能力。 */
    readonly effectiveScope: EffectiveSandboxScope;
    /** 已解析的当前工作区根目录绝对真实路径。 */
    readonly workspaceRoot: string;
    /** 命令是否命中破坏性命令规则表；非命令类 Action 不设置。 */
    readonly destructiveCommand?: boolean;
}

/**
 * 权限边界判定结果。
 *
 * @remarks
 * - `allow`：无需裁决即可执行；`source` 区分档位内直接放行与规则表自动放行。
 * - `approval`：越界且需要人工审阅；`risk` 是去重后的规则表命中类别，`reason` 列出真实越界项。
 * - `deny`：越界且不允许执行；`reason` 说明拒绝依据与越界项。
 *
 * 三种结果都不改写 Action 输入、路径或网络范围。
 *
 * @example
 * ```ts
 * const decision = evaluatePermissionBoundary({ profile, request });
 * if (decision.kind === "approval") showApproval(decision.reason, decision.risk);
 * ```
 */
export type PermissionBoundaryDecision =
    | { readonly kind: "allow"; readonly source: "profile" | "auto_review" }
    | {
        readonly kind: "approval";
        readonly approvalKind: "sandbox";
        readonly risk: readonly PermissionRiskClass[];
        readonly reason: string;
    }
    | { readonly kind: "deny"; readonly reason: string };

const RISK_ORDER: readonly PermissionRiskClass[] = [
    "outside_write",
    "network",
    "destructive_command",
    "git_write",
];

interface OutsideItem {
    readonly label: string;
    readonly risk?: PermissionRiskClass;
}

/**
 * 破坏性命令的显式规则表。
 *
 * @remarks
 * 逐条匹配已知危险写法，不做命令语义推断；未列出的写法即使具有破坏性也不会命中。
 */
const DESTRUCTIVE_COMMAND_PATTERNS: readonly RegExp[] = [
    /\brm\s+-[a-zA-Z]*(?:[rR][a-zA-Z]*[fF]|[fF][a-zA-Z]*[rR])[a-zA-Z]*\b/,
    /\bgit\s+reset\s+--hard\b/,
    /\bgit\s+clean\b[^\n]*\s-[a-zA-Z]*[fF]/,
    /\bgit\s+push\b[^\n]*\s(?:-f|--force)\b/,
    /\bdd\b[^\n]*\bif=/,
    /\bmkfs(?:\.[a-zA-Z0-9]+)?\b/,
    /\bshutdown\b/,
    /\breboot\b/,
];

/**
 * 判断命令是否命中破坏性命令规则表。
 *
 * @remarks
 * 只按显式规则表做文本匹配：`rm file` 这类不带强制递归删除的命令不命中，未列入规则表的
 * 破坏性写法也不会命中。调用方须自行决定是否把命中结果作为 `destructiveCommand` 传入边界判定。
 *
 * @param command - 待判定的命令文本。
 * @returns 命中任一规则时返回 `true`。
 * @example
 * ```ts
 * const destructive = isDestructiveCommand("rm -rf build");
 * ```
 */
export function isDestructiveCommand(command: string): boolean {
    return DESTRUCTIVE_COMMAND_PATTERNS.some(pattern => pattern.test(command));
}

/**
 * 按工作区档位判定一次 Action 是否越过权限边界。
 *
 * @remarks
 * 判定顺序：
 * 1. `.lazygoal` 内部状态在任何档位下都拒绝，优先于其它规则。
 * 2. `danger-full-access` 直接放行，不检查文件、网络与破坏性命令。
 * 3. 其余档位下，工作区树内读写、`.git` 读取与 `writableRoots` 读写属于边界内；
 *    `read-only` 的任何写入立即拒绝；工作区外读写、`.git` 写入、出站网络与破坏性命令属于越界。
 * 4. 无越界时按档位放行；有越界时由 `approvals` 与 `reviewer` 决定拒绝、人工裁决或规则表放行。
 *
 * @param input - 已持久化的权限档位与本次 Action 的实际边界请求。
 * @returns 边界判定结果。
 * @example
 * ```ts
 * const decision = evaluatePermissionBoundary({
 *   profile: PERMISSION_PRESETS.ask,
 *   request: {
 *     toolId: "bash",
 *     effectiveScope: { extraFiles: [], network: "all_outbound" },
 *     workspaceRoot: "/Users/me/project",
 *   },
 * });
 * ```
 */
export function evaluatePermissionBoundary(input: {
    readonly profile: PermissionProfile;
    readonly request: PermissionBoundaryRequest;
}): PermissionBoundaryDecision {
    const { profile, request } = input;
    const protectedRoot = join(request.workspaceRoot, ".lazygoal");

    for (const file of request.effectiveScope.extraFiles) {
        if (isWithin(protectedRoot, file.canonicalPath)) {
            return {
                kind: "deny",
                reason: `LazyGoal internal state is never accessible: ${file.canonicalPath}`,
            };
        }
    }

    if (profile.sandbox === "danger-full-access") {
        return { kind: "allow", source: "profile" };
    }

    const outside: OutsideItem[] = [];
    for (const file of request.effectiveScope.extraFiles) {
        if (file.access === "write" && profile.sandbox === "read-only") {
            return {
                kind: "deny",
                reason: `Sandbox mode "read-only" does not allow writes: ${file.canonicalPath}`,
            };
        }

        const placement = classifyPath(request.workspaceRoot, profile.writableRoots, file.canonicalPath);
        if (placement === "outside") {
            outside.push(file.access === "write"
                ? { label: `write ${file.canonicalPath}`, risk: "outside_write" }
                : { label: `read ${file.canonicalPath}` });
            continue;
        }

        if (
            placement === "inside"
            && file.access === "write"
            && containsGitSegment(request.workspaceRoot, file.canonicalPath)
        ) {
            outside.push({ label: `write ${file.canonicalPath}`, risk: "git_write" });
        }
    }

    if (request.effectiveScope.network === "all_outbound") {
        outside.push({ label: "network all_outbound", risk: "network" });
    }

    if (request.destructiveCommand === true) {
        outside.push({ label: "destructive command", risk: "destructive_command" });
    }

    if (outside.length === 0) {
        return { kind: "allow", source: "profile" };
    }

    if (profile.approvals === "never") {
        return {
            kind: "deny",
            reason: `Permission profile approvals "never" blocks outside actions under sandbox "${profile.sandbox}": ${formatOutside(outside)}`,
        };
    }

    const risk = RISK_ORDER.filter(kind => outside.some(item => item.risk === kind));
    if (profile.reviewer === "auto_review" && risk.length === 0) {
        return { kind: "allow", source: "auto_review" };
    }

    return {
        kind: "approval",
        approvalKind: "sandbox",
        risk,
        reason: `Outside-workspace permission boundary requires approval: ${formatOutside(outside)}`,
    };
}

function classifyPath(
    workspaceRoot: string,
    writableRoots: readonly string[],
    canonicalPath: string,
): "inside" | "root" | "outside" {
    if (isWithin(workspaceRoot, canonicalPath)) return "inside";
    if (writableRoots.some(root => isWithin(root, canonicalPath))) return "root";
    return "outside";
}

function isWithin(parent: string, candidate: string): boolean {
    const pathFromParent = relative(parent, candidate);
    return pathFromParent === ""
        || (pathFromParent !== ".."
            && !pathFromParent.startsWith(`..${sep}`)
            && !isAbsolute(pathFromParent));
}

function containsGitSegment(workspaceRoot: string, canonicalPath: string): boolean {
    return relative(workspaceRoot, canonicalPath).split(sep).includes(".git");
}

function formatOutside(outside: readonly OutsideItem[]): string {
    return outside
        .map(item => item.risk === undefined ? item.label : `${item.label} (${item.risk})`)
        .join(", ");
}
