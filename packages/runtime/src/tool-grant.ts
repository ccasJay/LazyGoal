import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

import type { JsonValue, ToolCallAction } from "./domain";

/** 用户授权期限；单次 Action 沿用 Runtime 的瞬时批准状态。 */
export type ToolGrantScope = "goal" | "workspace";

/**
 * 一个可比较的 Tool 操作身份。
 *
 * @remarks
 * `exact_input` 通过稳定 JSON 序列化摘要绑定完整输入；写文件与编辑文件使用
 * `target_path`，有意忽略内容字段。规则语义变化时必须递增 `version`，使旧授权
 * 自动失配。
 *
 * @example
 * ```ts
 * const matcher: ToolGrantMatcher = {
 *   kind: "exact_input", toolId: "bash", version: 1, digest: "sha256:...",
 * };
 * ```
 */
export type ToolGrantMatcher =
    | {
        readonly kind: "exact_input";
        readonly toolId: string;
        readonly version: 1;
        readonly digest: `sha256:${string}`;
    }
    | {
        readonly kind: "target_path";
        readonly toolId: "write_file" | "edit_file";
        readonly version: 1;
        readonly path: string;
    };

/**
 * 一条会话或工作区级的用户 Tool 授权。
 *
 * @remarks
 * `pending` 只用于审批提交恢复，不得匹配新 Action；仅 `active` 授权可用于查询。
 * `source` 保留最初批准它的 Action 身份，以便协调器验证创建和重启恢复。
 *
 * @example
 * ```ts
 * const grant: ToolGrant = {
 *   id: "grant-1", scope: "goal", workspaceId: "workspace-1", goalId: "goal-1",
 *   source: { goalId: "goal-1", runId: "run-1", actionId: "action-1" },
 *   matcher: { kind: "exact_input", toolId: "bash", version: 1, digest: "sha256:abc" },
 *   status: "active",
 * };
 * ```
 */
export interface ToolGrant {
    readonly id: string;
    readonly scope: ToolGrantScope;
    readonly workspaceId: string;
    readonly goalId?: string;
    readonly source: {
        readonly goalId: string;
        readonly runId: string;
        readonly actionId: string;
    };
    readonly matcher: ToolGrantMatcher;
    readonly status: "pending" | "active" | "revoked";
}

/**
 * Runtime 查询当前操作是否已有持续授权的读取边界。
 *
 * @example
 * ```ts
 * const grant = await grants.findActiveMatching({ workspaceId, goalId, matcher });
 * ```
 */
export interface ToolGrantLookup {
    /**
     * 查询严格匹配当前 Workspace、Goal 和操作身份的有效授权。
     *
     * @param query - 当前执行身份及由已验证 canonical 输入派生的匹配器。
     * @returns 唯一匹配的 active 授权；不存在时返回 `undefined`。
     * @throws 授权账本无法读取或违反协议时抛出异常；调用方必须失败关闭。
     */
    findActiveMatching(query: {
        readonly workspaceId: string;
        readonly goalId: string;
        readonly matcher: ToolGrantMatcher;
    }): Promise<ToolGrant | undefined>;
}

/**
 * 支持审批事务与授权管理的持久化 Grant 边界。
 *
 * @remarks
 * 同一来源 Action 的重复 `stage` 必须幂等；相同来源但期限或匹配器不同属于冲突。
 * `pending` 记录不得被查询为授权，只有 Coordinator 在 Goal 批准快照提交后才能激活。
 *
 * @example
 * ```ts
 * const grant = await store.stage(candidate);
 * await store.activate(grant.id, grant.source);
 * ```
 */
export interface ToolGrantStore extends ToolGrantLookup {
    /**
     * 按来源 Action 创建或恢复一条待生效 Grant。
     *
     * @param grant - 不含 ID 且状态固定为 pending 的授权申请。
     * @returns 已持久化的 pending Grant；相同申请重复调用返回原记录。
     * @throws 相同来源已绑定不同授权内容或账本损坏时拒绝。
     */
    stage(grant: Omit<ToolGrant, "id" | "status">): Promise<ToolGrant>;

    /**
     * 在 Coordinator 确认审批快照已提交后激活 Grant。
     *
     * @param grantId - 待生效授权的稳定 ID。
     * @param source - 必须与 Grant 保存的原始 Goal/Run/Action 身份完全相同。
     * @returns 激活后的 Grant；重复激活保持幂等。
     * @throws ID、来源不匹配或 Grant 已撤销时拒绝。
     */
    activate(
        grantId: string,
        source: ToolGrant["source"],
    ): Promise<ToolGrant>;

    /**
     * 列出当前用户有权查看的 Goal 与 Workspace Grant。
     *
     * @param query - 当前 Workspace，以及可选的 Goal 过滤条件。
     * @returns 按创建 ID 稳定排序的授权列表，不包含其它 Workspace 数据。
     */
    list(query: { readonly workspaceId: string; readonly goalId?: string }): Promise<readonly ToolGrant[]>;

    /**
     * 撤销当前 Workspace 中指定的 Grant。
     *
     * @param query - 授权 ID、Workspace 身份和可选 Goal 身份。
     * @returns 已撤销记录；对已撤销记录重复调用幂等。
     * @throws Grant 不存在、跨 Workspace/Goal 或仍处于 pending 时拒绝。
     */
    revoke(query: {
        readonly grantId: string;
        readonly workspaceId: string;
        readonly goalId?: string;
    }): Promise<ToolGrant>;
}

/**
 * 从经过 Tool Contract 与语义校验的 Action 输入生成稳定授权匹配器。
 *
 * @param toolId - 已解析的 Tool 标识。
 * @param input - Tool Registration 返回的 canonical JSON 输入。
 * @param workspaceRoot - 文件 Tool 的 Workspace 根目录；其他 Tool 不使用。
 * @returns `bash` 与其他 Tool 的完整输入摘要，或写入类 Tool 的规范化目标路径。
 * @throws 文件目标路径字段无效或文件系统无法解析必要 Workspace 边界时抛出异常。
 * @example
 * ```ts
 * const matcher = await createToolGrantMatcher("bash", { command: "git status" });
 * ```
 */
export async function createToolGrantMatcher(
    toolId: string,
    input: JsonValue,
    workspaceRoot?: string,
): Promise<ToolGrantMatcher> {
    if (toolId === "write_file" || toolId === "edit_file") {
        if (workspaceRoot === undefined || !isRecord(input) || typeof input.path !== "string") {
            throw new Error(`${toolId} 授权匹配需要有效的工作区路径输入`);
        }

        return {
            kind: "target_path",
            toolId,
            version: 1,
            path: await resolveGrantTargetPath(workspaceRoot, input.path),
        };
    }

    return {
        kind: "exact_input",
        toolId,
        version: 1,
        digest: `sha256:${createHash("sha256")
            .update(JSON.stringify(canonicalize(input)), "utf8")
            .digest("hex")}`,
    };
}

/**
 * 比较两条授权匹配器是否绑定同一 Tool 操作。
 *
 * @param left - 已保存的授权身份。
 * @param right - 当前已验证 Action 的授权身份。
 * @returns Tool、规则版本及匹配字段全部相等时返回 `true`。
 * @example
 * ```ts
 * if (toolGrantMatchersEqual(saved.matcher, current)) allowAction();
 * ```
 */
export function toolGrantMatchersEqual(
    left: ToolGrantMatcher,
    right: ToolGrantMatcher,
): boolean {
    if (
        left.kind !== right.kind
        || left.toolId !== right.toolId
        || left.version !== right.version
    ) {
        return false;
    }

    return left.kind === "exact_input" && right.kind === "exact_input"
        ? left.digest === right.digest
        : left.kind === "target_path" && right.kind === "target_path"
            ? left.path === right.path
            : false;
}

function isRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: JsonValue): JsonValue {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value)
                .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
                .map(([key, child]) => [key, canonicalize(child)]),
        );
    }
    return value;
}

async function resolveGrantTargetPath(workspaceRoot: string, requestedPath: string): Promise<string> {
    const root = await realpath(workspaceRoot);
    const candidate = resolve(root, requestedPath);
    let target: string;

    try {
        target = await realpath(candidate);
    } catch (error) {
        if (!isNodeError(error) || error.code !== "ENOENT") throw error;

        try {
            target = resolve(await realpath(dirname(candidate)), basename(candidate));
        } catch (parentError) {
            if (!isNodeError(parentError) || parentError.code !== "ENOENT") throw parentError;
            target = candidate;
        }
    }

    const pathFromRoot = relative(root, target);
    if (
        pathFromRoot === ".."
        || pathFromRoot.startsWith(`..${sep}`)
        || isAbsolute(pathFromRoot)
    ) {
        return target;
    }

    return resolve(root, pathFromRoot);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return typeof error === "object"
        && error !== null
        && "code" in error
        && typeof error.code === "string";
}
