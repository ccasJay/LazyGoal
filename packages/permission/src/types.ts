/**
 * 项目权限模式。
 *
 * @remarks
 * - `default`：默认模式。只读工具与 macOS 默认 Seatbelt 沙箱内的 bash 自动执行，其他工具和越界沙箱能力需经用户逐项审批。
 * - `yolo`：自动执行模式。对当前 Profile 和输入合法的 Tool 自动批准，但不创建持续授权，也不放宽沙箱文件或网络边界。
 *
 * @example
 * ```ts
 * const mode: PermissionMode = "default";
 * ```
 */
export type PermissionMode = "default" | "yolo";

/**
 * 授权申请的作用域范围。
 *
 * @remarks
 * - `action`：单次 Action 瞬时放行，不生成持久化授权。
 * - `goal`：当前 Goal 作用域，供该 Goal 后续 Run 复用，跨重启有效。
 * - `workspace`：当前项目工作区作用域，供该项目下所有 Goal 复用，跨重启有效。
 *
 * @example
 * ```ts
 * const scope: PermissionScope = "goal";
 * ```
 */
export type PermissionScope = "action" | "goal" | "workspace";

/**
 * 持续授权的生命周期状态。
 *
 * @remarks
 * - `pending`：已暂存待生效，等待 Goal 审批快照提交后由 Coordinator 激活。
 * - `active`：已激活生效，可供匹配查询放行。
 * - `revoked`：已撤销失效，不再匹配后续操作。
 *
 * @example
 * ```ts
 * const status: GrantStatus = "active";
 * ```
 */
export type GrantStatus = "pending" | "active" | "revoked";

/**
 * 用户 Tool 持续授权期限；单次 Action 沿用 Runtime 的瞬时批准状态。
 *
 * @example
 * ```ts
 * const scope: ToolGrantScope = "workspace";
 * ```
 */
export type ToolGrantScope = "goal" | "workspace";

/**
 * 一个可比较的 Tool 操作身份匹配器。
 *
 * @remarks
 * `exact_input` 通过稳定 JSON 序列化摘要绑定完整输入；写文件与编辑文件使用
 * `target_path`，有意忽略内容字段。规则语义变化时必须递增 `version`，使旧授权
 * 自动失配。
 *
 * @example
 * ```ts
 * const matcher: ToolGrantMatcher = {
 *   kind: "exact_input",
 *   toolId: "bash",
 *   version: 1,
 *   digest: "sha256:abc...",
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
 *   id: "grant-1",
 *   scope: "goal",
 *   workspaceId: "workspace-1",
 *   goalId: "goal-1",
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
    readonly status: GrantStatus;
}

/**
 * Tool 持续授权的查询读取端口。
 *
 * @example
 * ```ts
 * const grant = await lookup.findActiveMatching({ workspaceId, goalId, matcher });
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
 * 支持审批事务与授权管理的持久化 Tool Grant 存储端口。
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
 * 项目持久化权限模式事实记录。
 *
 * @remarks
 * 记录项目工作区的默认与当前执行模式，包含用于并发更新校验的单调递增修订号。
 *
 * @example
 * ```ts
 * const projectMode: ProjectPermissionMode = {
 *   workspaceId: "ws-1",
 *   mode: "default",
 *   revision: 1,
 * };
 * ```
 */
export interface ProjectPermissionMode {
    /** 工作区唯一稳定标识。 */
    readonly workspaceId: string;
    /** 当前生效的权限模式。 */
    readonly mode: PermissionMode;
    /** 模式记录的单调递增版本号，用于防止并发写覆盖。 */
    readonly revision: number;
}

/**
 * 权限模式并发更新冲突异常。
 *
 * @remarks
 * 当客户端提交的期望修订号与服务端已持久化的修订号不一致时抛出，指示并发修改冲突。
 *
 * @example
 * ```ts
 * throw new PermissionModeConflictError("ws-1", 1, 2);
 * ```
 */
export class PermissionModeConflictError extends Error {
    constructor(
        readonly workspaceId: string,
        readonly expectedRevision: number,
        readonly actualRevision: number,
    ) {
        super(
            `项目 ${workspaceId} 权限模式更新冲突：期望修订号 ${expectedRevision}，当前实际修订号 ${actualRevision}`,
        );
        this.name = "PermissionModeConflictError";
    }
}

/**
 * 项目级权限执行模式的持久化存储边界。
 *
 * @remarks
 * 负责读写工作区的 Default/YOLO 模式配置，使用版本修订号进行乐观并发控制。
 * 记录不存在时默认返回 Default 模式（revision 为 0）。
 *
 * @example
 * ```ts
 * const current = await store.get("ws-1");
 * const updated = await store.set("ws-1", "yolo", current.revision);
 * ```
 */
export interface ProjectPermissionModeStore {
    /**
     * 获取指定工作区的当前权限模式事实。
     * 若尚无记录，默认返回 `{ workspaceId, mode: "default", revision: 0 }`。
     *
     * @param workspaceId - 项目工作区标识。
     * @returns 当前权限模式事实。
     * @throws 存储损坏或读取不可用时抛出异常。
     */
    get(workspaceId: string): Promise<ProjectPermissionMode>;

    /**
     * 乐观并发原子更新项目权限模式。
     *
     * @param workspaceId - 项目工作区标识。
     * @param mode - 期望切换到的权限模式。
     * @param expectedRevision - 调用方持有的期望修订号。
     * @returns 更新后的新模式事实（revision + 1）。
     * @throws 修订号不匹配抛出 PermissionModeConflictError；存储失败时抛出异常。
     */
    set(
        workspaceId: string,
        mode: PermissionMode,
        expectedRevision: number,
    ): Promise<ProjectPermissionMode>;
}

/**
 * Action 来源与执行身份的稳定引用。
 *
 * @example
 * ```ts
 * const actionRef: ActionRef = {
 *   workspaceId: "ws-1",
 *   goalId: "goal-1",
 *   runId: "run-1",
 *   actionId: "act-1",
 * };
 * ```
 */
export interface ActionRef {
    readonly workspaceId: string;
    readonly goalId: string;
    readonly runId: string;
    readonly actionId: string;
}

/**
 * 跨账本统一引用的授权凭证摘要。
 *
 * @example
 * ```ts
 * const ref: GrantRef = {
 *   kind: "tool",
 *   id: "grant-1",
 *   scope: "workspace",
 * };
 * ```
 */
export interface GrantRef {
    readonly kind: "tool" | "sandbox";
    readonly id: string;
    readonly scope: ToolGrantScope;
}
