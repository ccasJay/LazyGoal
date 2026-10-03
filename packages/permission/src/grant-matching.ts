import { createHash } from "node:crypto";
import type {
    EffectiveSandboxScope,
} from "../../sandbox/src/index";
import { canonicalize } from "./tool-grant-matcher";
import type {
    SandboxGrant,
    SandboxGrantMatcher,
    ToolGrant,
    ToolGrantMatcher,
} from "./types";

/**
 * 校验 Tool 匹配器是否能放行候选请求。
 *
 * @remarks
 * - exact_input: 输入摘要必须完全一致；
 * - target_path: 目标文件真实路径一致，允许后续不同写入内容。
 *
 * @param requested - 当前 Action 经校验的候选匹配器。
 * @param approved - 已存在的持久化授权匹配器。
 * @returns 是否完全匹配放行。
 *
 * @example
 * ```ts
 * const matched = matchesToolGrantMatcher(reqMatcher, appMatcher);
 * ```
 */
export function matchesToolGrantMatcher(
    requested: ToolGrantMatcher,
    approved: ToolGrantMatcher,
): boolean {
    if (requested.kind !== approved.kind || requested.toolId !== approved.toolId || requested.version !== approved.version) {
        return false;
    }
    if (requested.kind === "exact_input" && approved.kind === "exact_input") {
        return requested.digest === approved.digest;
    }
    if (requested.kind === "target_path" && approved.kind === "target_path") {
        return requested.path === approved.path;
    }
    return false;
}

/**
 * 计算规范化输入的 sha256 摘要（64 字符十六进制）。
 *
 * @param input - 待摘要的 Tool 结构化输入。
 * @returns 规范化 JSON 序列化后的 sha256 摘要。
 *
 * @example
 * ```ts
 * const digest = computeInputDigest({ command: "curl https://example.com" });
 * ```
 */
export function computeInputDigest(input: unknown): string {
    return createHash("sha256")
        .update(JSON.stringify(canonicalize(input)), "utf8")
        .digest("hex");
}

/**
 * 校验已核准的沙箱能力是否足以覆盖本次 Action 请求的实际能力范围。
 *
 * @remarks
 * - 严格比对目标工具标识与输入 sha256 摘要；
 * - 网络：若已核准 all_outbound，可放行 none 或 all_outbound；若已核准 none，仅放行 none；
 * - 文件：请求的每个外部文件/目录，在核准列表中必须存在相同真实路径且访问级别不越权（read_write 可放行 read）。
 *
 * @param requested - 当前 Action 请求的沙箱能力匹配器。
 * @param approved - 已核准的持续授权匹配器。
 * @returns 实际请求能力是否在已核准能力安全子集内。
 *
 * @example
 * ```ts
 * const matched = matchesSandboxGrantMatcher(reqMatcher, appMatcher);
 * ```
 */
export function matchesSandboxGrantMatcher(
    requested: SandboxGrantMatcher,
    approved: SandboxGrantMatcher,
): boolean {
    if (requested.toolId !== approved.toolId || requested.version !== approved.version) {
        return false;
    }
    if (requested.inputDigest !== approved.inputDigest) {
        return false;
    }

    if (requested.scope.network === "all_outbound" && approved.scope.network !== "all_outbound") {
        return false;
    }

    for (const reqFile of requested.scope.extraFiles) {
        const appFile = approved.scope.extraFiles.find((f) => f.canonicalPath === reqFile.canonicalPath);
        if (appFile === undefined) {
            return false;
        }
        if (appFile.kind !== reqFile.kind) {
            return false;
        }
        if (reqFile.access === "write" && appFile.access !== "write") {
            return false;
        }
    }

    return true;
}

/**
 * 校验 Tool 持续授权是否适用于当前查询。
 *
 * @param query - 工作区、会话以及待核对的操作匹配器。
 * @param grant - 持久化授权记录。
 * @returns 是否匹配生效。
 *
 * @example
 * ```ts
 * const matched = matchesToolGrant({ workspaceId: "ws-1", matcher }, grant);
 * ```
 */
export function matchesToolGrant(
    query: { readonly workspaceId: string; readonly goalId?: string; readonly matcher: ToolGrantMatcher },
    grant: ToolGrant,
): boolean {
    if (grant.status !== "active") return false;
    if (grant.workspaceId !== query.workspaceId) return false;
    if (grant.scope === "goal" && (query.goalId === undefined || grant.goalId !== query.goalId)) return false;
    return matchesToolGrantMatcher(query.matcher, grant.matcher);
}

/**
 * 校验 Sandbox 持续授权是否适用于当前查询。
 *
 * @param query - 工作区、会话以及待核对的沙箱能力匹配器。
 * @param grant - 持久化沙箱授权记录。
 * @returns 是否匹配生效。
 *
 * @example
 * ```ts
 * const matched = matchesSandboxGrant({ workspaceId: "ws-1", matcher }, grant);
 * ```
 */
export function matchesSandboxGrant(
    query: { readonly workspaceId: string; readonly goalId?: string; readonly matcher: SandboxGrantMatcher },
    grant: SandboxGrant,
): boolean {
    if (grant.status !== "active") return false;
    if (grant.workspaceId !== query.workspaceId) return false;
    if (grant.scope === "goal" && (query.goalId === undefined || grant.goalId !== query.goalId)) return false;
    return matchesSandboxGrantMatcher(query.matcher, grant.matcher);
}

/**
 * 构造标准规范的沙箱能力授权匹配器。
 *
 * @param toolId - 目标工具的唯一标识。
 * @param input - 目标工具输入对象（自动计算 sha256 摘要）或预计算的 64 位十六进制 inputDigest。
 * @param scope - 经解析校验的实际沙箱能力范围。
 * @returns 标准匹配器。
 *
 * @example
 * ```ts
 * const matcher = createSandboxGrantMatcher("bash", { command: "curl https://example.com" }, scope);
 * ```
 */
export function createSandboxGrantMatcher(
    toolId: string,
    input: unknown,
    scope: EffectiveSandboxScope,
): SandboxGrantMatcher {
    const inputDigest = typeof input === "string" && /^[0-9a-f]{64}$/.test(input)
        ? input
        : computeInputDigest(input);
    return {
        toolId,
        inputDigest,
        scope,
        version: 1,
    };
}
