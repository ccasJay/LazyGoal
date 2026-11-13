import type {
    EffectiveExtraFile,
    EffectiveSandboxScope,
    SandboxMode,
} from "../../sandbox/src/index";

export type {
    EffectiveExtraFile,
    EffectiveSandboxScope,
};

/**
 * 技术沙箱边界档位。
 *
 * @remarks
 * 取值与 `@lazygoal/sandbox` 的 Seatbelt 策略生成共用：`read-only` 只允许读取，
 * `workspace-write` 允许工作区树读写，`danger-full-access` 取消本机文件与网络边界。
 * 该档位只描述内核强制的边界，不含审批策略。
 *
 * @example
 * ```ts
 * const sandbox: SandboxMode = "workspace-write";
 * ```
 */
export type { SandboxMode };

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
        /**
         * 批准该授权的稳定决定身份。
         *
         * @remarks 同一 Action 的不同决定（如修订参数或更换期限）拥有不同身份，
         * 因此可以各自暂存；只有被已提交批准引用的一条会被激活。
         */
        readonly approvalInputId: string;
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
 * 同一来源 Action 与同一决定身份的重复 `stage` 必须幂等；相同来源但期限或匹配器
 * 不同属于冲突。不同决定身份可以各自暂存一条 pending 记录。
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
 * 越界 Action 的审批策略。
 *
 * @remarks
 * `on-request` 只对越过权限边界的 Action 发起裁决，边界内的 Action 直接执行；
 * `never` 直接拒绝越界 Action，不产生等待。该策略不改变内核强制的文件与网络边界。
 *
 * @example
 * ```ts
 * const approvals: ApprovalPolicy = "on-request";
 * ```
 */
export type ApprovalPolicy = "on-request" | "never";

/**
 * 越界 Action 的裁决者。
 *
 * @remarks
 * `user` 交由人工审阅；`auto_review` 按确定性规则表裁决，只在命中规则表时等待人工。
 * 该取值仅在 `approvals` 为 `on-request` 时生效。
 *
 * @example
 * ```ts
 * const reviewer: ApprovalReviewer = "auto_review";
 * ```
 */
export type ApprovalReviewer = "user" | "auto_review";

/**
 * 一个工作区的权限档位。
 *
 * @remarks
 * `sandbox` 决定内核强制的文件与网络边界；`approvals` 与 `reviewer` 只决定越界 Action 的裁决方式。
 * `writableRoots` 列出自工作区树之外额外允许读写的工作区外根目录，为空表示只允许工作区树。
 * 创建 Goal 不再冻结沙箱上限，执行期以工作区当前档位为准。
 *
 * @example
 * ```ts
 * const profile: PermissionProfile = {
 *   sandbox: "workspace-write",
 *   approvals: "on-request",
 *   reviewer: "user",
 *   writableRoots: ["/Users/me/shared"],
 * };
 * ```
 */
export interface PermissionProfile {
    /** 内核强制的沙箱边界档位。 */
    readonly sandbox: SandboxMode;
    /** 越界 Action 的审批策略。 */
    readonly approvals: ApprovalPolicy;
    /** 越界 Action 的裁决者。 */
    readonly reviewer: ApprovalReviewer;
    /** 工作区树之外额外允许读写的工作区外根目录，元素为绝对路径。 */
    readonly writableRoots: readonly string[];
}

/**
 * 工作区当前权限档位及其并发版本。
 *
 * @remarks
 * `revision` 单调递增，写入方必须携带读取到的版本；记录缺失时以默认档位与 `0` 表示。
 * 该结构只描述持久化事实，不携带决策期判定结果。
 *
 * @example
 * ```ts
 * const current: ProjectPermissionProfile = {
 *   workspaceId: "ws-1",
 *   profile: { sandbox: "workspace-write", approvals: "on-request", reviewer: "user", writableRoots: [] },
 *   revision: 1,
 * };
 * ```
 */
export interface ProjectPermissionProfile {
    /** 工作区唯一稳定标识。 */
    readonly workspaceId: string;
    /** 当前生效的权限档位。 */
    readonly profile: PermissionProfile;
    /** 档位记录的单调递增版本号，用于防止并发写覆盖。 */
    readonly revision: number;
}

/**
 * 权限档位并发更新冲突。
 *
 * @remarks
 * 当调用方提交的期望版本与已持久化版本不一致时抛出，表示其它写入已先行提交。
 * 存储不会静默覆盖既有值；调用方可重新读取当前值后再次提交。
 *
 * @example
 * ```ts
 * throw new PermissionProfileConflictError("ws-1", 1, 2);
 * ```
 */
export class PermissionProfileConflictError extends Error {
    constructor(
        readonly workspaceId: string,
        readonly expectedRevision: number,
        readonly actualRevision: number,
    ) {
        super(
            `Project ${workspaceId} permission profile update conflict: expected revision ${expectedRevision}, actual revision ${actualRevision}`,
        );
        this.name = "PermissionProfileConflictError";
    }
}

/**
 * 工作区权限档位的持久化边界。
 *
 * @remarks
 * 每个工作区只保存当前档位，不保留历史版本。读取失败关闭：损坏或不受支持的记录必须抛出，
 * 不得退回默认档位，也不得据此放行越界 Action。
 *
 * @example
 * ```ts
 * const current = await store.get("ws-1");
 * const updated = await store.update("ws-1", nextProfile, current.revision);
 * ```
 */
export interface ProjectPermissionProfileStore {
    /**
     * 读取工作区当前权限档位。
     *
     * @param workspaceId - 工作区稳定标识。
     * @returns 当前档位与版本；无记录或记录属于其它工作区时返回默认档位与 `0`。
     * @throws 记录损坏、协议版本不受支持或底层读取失败时抛出；调用方必须按权限故障处理。
     */
    get(workspaceId: string): Promise<ProjectPermissionProfile>;

    /**
     * 以乐观并发写入工作区权限档位。
     *
     * @param workspaceId - 工作区稳定标识。
     * @param profile - 期望生效的完整档位，整体替换旧值。
     * @param expectedRevision - 调用方读取到的当前版本。
     * @returns 写入后的档位，`revision` 为 `expectedRevision + 1`。
     * @throws 版本不匹配时抛出 `PermissionProfileConflictError`；记录损坏或写入失败时抛出异常。
     */
    update(
        workspaceId: string,
        profile: PermissionProfile,
        expectedRevision: number,
    ): Promise<ProjectPermissionProfile>;
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

/**
 * 沙箱能力审阅视图模型。
 *
 * @remarks
 * 面向用户审阅，展示实际可强制的文件路径、读写方向以及真实网络访问范围。
 *
 * @example
 * ```ts
 * const review: EffectiveSandboxReview = {
 *     extraFiles: [{ canonicalPath: "/etc/hosts", access: "read", kind: "file" }],
 *     network: "all_outbound",
 *     networkNotice: "任意出站目标，含本机回环 (Any outbound network access, including loopback)",
 * };
 * ```
 */
export interface EffectiveSandboxReview {
    /** 规范化后的外部文件或目录访问列表。 */
    readonly extraFiles: readonly EffectiveExtraFile[];
    /** 内核实际可强制的网络范围。 */
    readonly network: "none" | "all_outbound";
    /** 当开放网络时提供的真实范围明示说明。 */
    readonly networkNotice?: string;
}

/**
 * 沙箱授权评估上下文。
 *
 * @remarks
 * 包含平台是否支持 Seatbelt 沙箱、当前工作区根路径以及已解析的实际能力范围。
 *
 * @example
 * ```ts
 * const context: SandboxAuthorizationContext = {
 *     isSeatbeltSupported: true,
 *     workspaceRoot: "/workspace",
 *     effectiveScope: { extraFiles: [], network: "none" },
 * };
 * ```
 */
export interface SandboxAuthorizationContext {
    /** 当前宿主环境是否支持 macOS Seatbelt 沙箱。 */
    readonly isSeatbeltSupported: boolean;
    /** 工作区真实绝对路径。 */
    readonly workspaceRoot?: string | undefined;
    /** 规范化的实际沙箱能力范围。 */
    readonly effectiveScope: EffectiveSandboxScope;
}

/**
 * 沙箱能力授权评估结果。
 *
 * @remarks
 * - `allow`：在默认沙箱内或非受限平台，无需额外审批；
 * - `approval_required`：存在越界文件或网络能力，必须经用户审批。
 *
 * @example
 * ```ts
 * const decision: SandboxAuthorizationDecision = { decision: "allow" };
 * ```
 */
export type SandboxAuthorizationDecision =
    | { readonly decision: "allow" }
    | {
        readonly decision: "approval_required";
        readonly review: EffectiveSandboxReview;
    };

/**
 * 沙箱持续授权作用域范围。
 *
 * @remarks
 * - `goal`：当前 Goal 作用域，供该 Goal 后续 Run 复用，跨重启有效。
 * - `workspace`：当前项目工作区作用域，供该项目下所有 Goal 复用，跨重启有效。
 *
 * @example
 * ```ts
 * const scope: SandboxGrantScope = "workspace";
 * ```
 */
export type SandboxGrantScope = "goal" | "workspace";

/**
 * 沙箱能力授权身份匹配器。
 *
 * @remarks
 * 严格绑定受限命令标识（目前为 bash）、执行的具体命令文本、已核准的实际文件范围与出站网络能力。
 * 当授权规则语义发生演进时递增 `version`，使旧授权自动失配。
 *
 * @example
 * ```ts
 * const matcher: SandboxGrantMatcher = {
 *     toolId: "bash",
 *     inputDigest: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
 *     scope: { extraFiles: [], network: "all_outbound" },
 *     version: 1,
 * };
 * ```
 */
export interface SandboxGrantMatcher {
    readonly toolId: string;
    readonly inputDigest: string;
    readonly scope: EffectiveSandboxScope;
    readonly version: 1;
}

/**
 * 一条会话或工作区级的用户 Sandbox 持续授权。
 *
 * @remarks
 * `pending` 只用于审批提交恢复，不得匹配新 Action；仅 `active` 授权可用于查询。
 * `source` 保留最初批准它的 Action 身份，以便协调器验证创建和重启恢复。
 *
 * @example
 * ```ts
 * const grant: SandboxGrant = {
 *     id: "grant-s1",
 *     scope: "goal",
 *     workspaceId: "workspace-1",
 *     goalId: "goal-1",
 *     source: { goalId: "goal-1", runId: "run-1", actionId: "action-1" },
 *     matcher: {
 *         toolId: "bash",
 *         inputDigest: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
 *         scope: { extraFiles: [], network: "all_outbound" },
 *         version: 1,
 *     },
 *     status: "active",
 * };
 * ```
 */
export interface SandboxGrant {
    readonly id: string;
    readonly scope: SandboxGrantScope;
    readonly workspaceId: string;
    readonly goalId?: string;
    readonly source: {
        readonly goalId: string;
        readonly runId: string;
        readonly actionId: string;
        /**
         * 批准该授权的稳定决定身份。
         *
         * @remarks 同一 Action 的不同决定（如修订参数或更换期限）拥有不同身份，
         * 因此可以各自暂存；只有被已提交批准引用的一条会被激活。
         */
        readonly approvalInputId: string;
    };
    readonly matcher: SandboxGrantMatcher;
    readonly status: GrantStatus;
}

/**
 * Sandbox 持续授权的查询读取端口。
 *
 * @example
 * ```ts
 * const grant = await lookup.findActiveMatching({ workspaceId, goalId, matcher });
 * ```
 */
export interface SandboxGrantLookup {
    /**
     * 查询严格匹配当前 Workspace、Goal 和操作能力身份的有效授权。
     *
     * @param query - 当前执行身份及由已验证命令与沙箱范围派生的匹配器。
     * @returns 唯一匹配的 active 授权；不存在时返回 `undefined`。
     * @throws 授权账本无法读取或违反协议时抛出异常；调用方必须失败关闭。
     */
    findActiveMatching(query: {
        readonly workspaceId: string;
        readonly goalId: string;
        readonly matcher: SandboxGrantMatcher;
    }): Promise<SandboxGrant | undefined>;
}

/**
 * 支持审批事务与授权管理的持久化 Sandbox Grant 存储端口。
 *
 * @remarks
 * 同一来源 Action 与同一决定身份的重复 `stage` 必须幂等；相同来源但期限或匹配器
 * 不同属于冲突。不同决定身份可以各自暂存一条 pending 记录。
 * `pending` 记录不得被查询为授权，只有 Coordinator 在 Goal 批准快照提交后才能激活。
 *
 * @example
 * ```ts
 * const grant = await store.stage(candidate);
 * await store.activate(grant.id, grant.source);
 * ```
 */
export interface SandboxGrantStore extends SandboxGrantLookup {
    /**
     * 按来源 Action 创建或恢复一条待生效 Grant。
     *
     * @param grant - 不含 ID 且状态固定为 pending 的授权申请。
     * @returns 已持久化的 pending Grant；相同申请重复调用返回原记录。
     * @throws 相同来源已绑定不同授权内容或账本损坏时拒绝。
     */
    stage(grant: Omit<SandboxGrant, "id" | "status">): Promise<SandboxGrant>;

    /**
     * 在 Coordinator 确认审批快照已提交后激活 Grant。
     *
     * @param grantId - 待生效授权的稳定 ID。
     * @param source - 必须与 Grant 保存的原始 Goal/Run/Action 身份完全相同。
     * @returns 激活后的 Grant；重复激活保持幂等。
     * @throws ID、来源不匹配或 Grant 已撤销时拒绝。
     */
    activate(grantId: string, source: SandboxGrant["source"]): Promise<SandboxGrant>;

    /**
     * 列出当前用户有权查看的 Goal 与 Workspace Grant。
     *
     * @param query - 当前 Workspace，以及可选的 Goal 过滤条件。
     * @returns 按创建 ID 稳定排序的授权列表，不包含其它 Workspace 数据。
     */
    list(query: { readonly workspaceId: string; readonly goalId?: string }): Promise<readonly SandboxGrant[]>;

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
    }): Promise<SandboxGrant>;
}

/**
 * 跨 Tool 与 Sandbox 账本的统一授权展示摘要。
 *
 * @remarks
 * 供 UI 统一列出和审阅当前项目或会话中已存在的持续授权。
 *
 * @example
 * ```ts
 * const summary: UnifiedGrantSummary = {
 *     kind: "sandbox",
 *     id: "grant-1",
 *     scope: "workspace",
 *     workspaceId: "ws-1",
 *     toolId: "bash",
 *     command: "curl https://example.com",
 *     status: "active",
 *     extraFiles: [],
 *     network: "all_outbound",
 * };
 * ```
 */
export type UnifiedGrantSummary =
    | {
        readonly kind: "tool";
        readonly id: string;
        readonly scope: ToolGrantScope;
        readonly workspaceId: string;
        readonly goalId?: string;
        readonly toolId: string;
        readonly status: GrantStatus;
        readonly targetPath?: string;
        readonly digest?: string;
    }
    | {
        readonly kind: "sandbox";
        readonly id: string;
        readonly scope: SandboxGrantScope;
        readonly workspaceId: string;
        readonly goalId?: string;
        readonly toolId: string;
        readonly inputDigest: string;
        readonly status: GrantStatus;
        readonly extraFiles: readonly EffectiveExtraFile[];
        readonly network: "none" | "all_outbound";
    };

/**
 * 统一授权管理服务接口。
 *
 * @remarks
 * 聚合 Tool 与 Sandbox 两个独立账本，提供统一的列表查询与精确撤销功能。
 *
 * @example
 * ```ts
 * const grants = await service.list({ workspaceId: "ws-1" });
 * await service.revoke({ kind: "sandbox", grantId: "grant-1", workspaceId: "ws-1" });
 * ```
 */
export interface PermissionGrantService {
    /**
     * 列出当前 Workspace 及可选 Goal 作用域下的所有 Tool 与 Sandbox 持续授权。
     */
    list(query: { readonly workspaceId: string; readonly goalId?: string }): Promise<readonly UnifiedGrantSummary[]>;

    /**
     * 精确撤销指定类别与 ID 的持续授权。
     */
    revoke(query: {
        readonly kind: "tool" | "sandbox";
        readonly grantId: string;
        readonly workspaceId: string;
        readonly goalId?: string;
    }): Promise<void>;
}

