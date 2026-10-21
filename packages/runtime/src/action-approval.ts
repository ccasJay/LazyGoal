import { createHash } from "node:crypto";

import type { EffectiveExtraFile, EffectiveSandboxScope } from "../../sandbox/src/index";
import type { JsonValue, PendingAction, ToolCallAction } from "./domain";

/**
 * 工具审批可用的授权期限。
 *
 * @remarks `action` 是单次放行，不产生持久化授权；`goal` 与 `workspace` 是持续
 * 授权期限，其可用性由当前 workspace 的授权账本决定。
 *
 * @example
 * ```ts
 * const scope: ActionApprovalScope = "action";
 * ```
 */
export type ActionApprovalScope = "action" | "goal" | "workspace";

/**
 * 一次只读审批预检的请求。
 *
 * @remarks 预检只描述“打算审阅什么”，不产生任何授权或执行许可。省略 `input`
 * 表示按原样审阅当前请求。
 *
 * @example
 * ```ts
 * const request: ActionApprovalReviewRequest = { actionId: "action-1" };
 * ```
 */
export interface ActionApprovalReviewRequest {
    /** 当前待审批 Action 的稳定标识。 */
    readonly actionId: string;
    /** 拟审阅的最终参数；省略表示原样审阅。 */
    readonly input?: JsonValue | undefined;
    /** 拟申请的授权期限；省略表示单次放行。 */
    readonly scope?: ActionApprovalScope | undefined;
}

/**
 * 预检重新计算出的实际能力范围。
 *
 * @remarks 只描述内核可强制的真实范围与目标路径，不包含模型自述目的。
 *
 * @example
 * ```ts
 * const capability: ActionApprovalCapability = {
 *     network: "none",
 *     extraFiles: [],
 *     targetPaths: ["/workspace/project/out.txt"],
 * };
 * ```
 */
export interface ActionApprovalCapability {
    /** 实际出站网络范围。 */
    readonly network: "none" | "all_outbound";
    /** 实际越界文件范围。 */
    readonly extraFiles: readonly EffectiveExtraFile[];
    /** 实际写入或读取的目标路径。 */
    readonly targetPaths: readonly string[];
}

/**
 * 一次只读审批预检的可审阅结果。
 *
 * @remarks `reviewRef` 是内容一致性引用而非认证令牌：它绑定原审批基准、最终
 * canonical 参数、期限与能力范围，确认时必须原样带回并重新计算比对。
 *
 * @example
 * ```ts
 * const review: ActionApprovalReview = {
 *     actionId: "action-1",
 *     toolId: "write_file",
 *     originalInput: { path: "a.txt", content: "x" },
 *     finalInput: { path: "b.txt", content: "x" },
 *     changed: true,
 *     scope: "action",
 *     availableScopes: ["action", "goal", "workspace"],
 *     capability: { network: "none", extraFiles: [], targetPaths: ["/workspace/project/b.txt"] },
 *     requiresSandboxApproval: false,
 *     reviewRef: "review:0123456789abcdef",
 * };
 * ```
 */
export interface ActionApprovalReview {
    /** 当前待审批 Action 的稳定标识。 */
    readonly actionId: string;
    /** 被审阅的 Tool 标识；修订不能替换工具身份。 */
    readonly toolId: string;
    /** 原请求参数。 */
    readonly originalInput: JsonValue;
    /** 重新准备后的最终 canonical 参数。 */
    readonly finalInput: JsonValue;
    /** 最终参数是否与原请求不同。 */
    readonly changed: boolean;
    /** 本次审阅对应的授权期限。 */
    readonly scope: ActionApprovalScope;
    /** 当前真正可用的授权期限。 */
    readonly availableScopes: readonly ActionApprovalScope[];
    /** 重新计算出的实际能力范围。 */
    readonly capability: ActionApprovalCapability;
    /** 最终范围是否超出默认沙箱，需要沙箱能力审批。 */
    readonly requiresSandboxApproval: boolean;
    /** 审阅指纹；确认时必须原样带回。 */
    readonly reviewRef: string;
}

/** 只读审批预检的稳定拒绝代码。 */
export type ActionApprovalReviewErrorCode =
    | "ACTION_NOT_AWAITING_APPROVAL"
    | "ACTION_ID_MISMATCH"
    | "TOOL_NOT_FOUND"
    | "INVALID_TOOL_INPUT"
    | "SCOPE_UNAVAILABLE"
    | "SANDBOX_SCOPE_UNAVAILABLE"
    | "REVIEW_UNAVAILABLE";

/**
 * 只读审批预检的结果。
 *
 * @remarks 失败时保留当前等待与调用方本地草稿；预检不裁剪参数、不降级权限，
 * 也不执行原操作作为补偿。
 *
 * @example
 * ```ts
 * const result = await coordinator.reviewActionApproval({ actionId: "action-1" });
 * if (!result.ok) console.error(result.code, result.message);
 * ```
 */
export type ActionApprovalReviewResult =
    | { readonly ok: true; readonly review: ActionApprovalReview }
    | {
        readonly ok: false;
        readonly code: ActionApprovalReviewErrorCode;
        readonly message: string;
        /** 可定位的字段级问题；解析或语义错误时提供。 */
        readonly issues?: readonly { readonly path: readonly (string | number)[]; readonly message: string }[] | undefined;
    };

/**
 * 已获批 Action 的最终执行版本。
 *
 * @remarks 保留原请求引用与最终 canonical 参数的关联；原始模型响应、程序请求与
 * `action_staged` 事实不被覆盖，执行、授权激活与恢复都只使用该版本。
 *
 * @example
 * ```ts
 * const version: ActionExecutionVersion = {
 *     original: { actionId: "action-1", toolId: "write_file", input: { path: "a.txt" } },
 *     input: { path: "b.txt" },
 *     reviewRef: "review:0123456789abcdef",
 *     scope: "action",
 *     revision: { source: "user" },
 * };
 * ```
 */
export interface ActionExecutionVersion {
    /** 原请求的稳定引用与原始参数。 */
    readonly original: {
        readonly actionId: string;
        readonly toolId: string;
        readonly input: JsonValue;
    };
    /** 最终 canonical 执行参数。 */
    readonly input: JsonValue;
    /** 绑定的审阅指纹。 */
    readonly reviewRef: string;
    /** 实际获批的授权期限。 */
    readonly scope: ActionApprovalScope;
    /** 修订来源；未修订的批准省略。 */
    readonly revision?: { readonly source: "user" | "host" } | undefined;
}

/**
 * 结果未知的 Action 恢复等待身份。
 *
 * @remarks 由本次已提交尝试派生，跨重启稳定；同一 Action 再次产生未知结果时
 * 身份改变，旧恢复决定不能授权新一轮重执行。
 *
 * @example
 * ```ts
 * const ref = computeActionRecoveryRef("action-1", 1);
 * ```
 */
export function computeActionRecoveryRef(actionId: string, attempt: number): string {
    return `recovery:${createHash("sha256")
        .update(`${actionId}\u0000${attempt}`, "utf8")
        .digest("hex")
        .slice(0, 32)}`;
}

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([, child]) => child !== undefined)
                .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
                .map(([key, child]) => [key, canonicalize(child)]),
        );
    }
    return value;
}

/**
 * 程序工具调用结果信封中的修订说明。
 *
 * @remarks 说明实际执行的最终参数与原请求差异；业务 Observation 输出本身不换形。
 * 程序可以据此调整后续逻辑，Runtime 不修改冻结代码。
 *
 * @example
 * ```ts
 * const revision: ProgramCallRevision = {
 *     reviewRef: "review:0123456789abcdef",
 *     originalInput: { path: "a.txt" },
 *     finalInput: { path: "b.txt" },
 *     source: "user",
 * };
 * ```
 */
export interface ProgramCallRevision {
    /** 绑定的审阅指纹。 */
    readonly reviewRef: string;
    /** 原请求参数。 */
    readonly originalInput: JsonValue;
    /** 实际执行的最终 canonical 参数。 */
    readonly finalInput: JsonValue;
    /** 修订来源。 */
    readonly source: "user" | "host";
}

/**
 * 从已获批 Action 派生程序结果信封中的修订说明。
 *
 * @remarks 未修订的批准不产生修订说明；修订批准返回原请求与最终参数的关联。
 *
 * @param pending - 当前待处理 Action；省略时返回 `undefined`。
 * @returns 修订说明；没有修订时返回 `undefined`。
 * @example
 * ```ts
 * const revision = resolveProgramCallRevision(pending);
 * ```
 */
export function resolveProgramCallRevision(
    pending: PendingAction | undefined,
): ProgramCallRevision | undefined {
    const version = pending?.executionVersion;
    if (version === undefined || version.revision === undefined) return undefined;
    return {
        reviewRef: version.reviewRef,
        originalInput: structuredClone(version.original.input),
        finalInput: structuredClone(version.input),
        source: version.revision.source,
    };
}

/**
 * 构造程序工具调用的结果信封。
 *
 * @remarks 信封固定包含观察结果与事实引用；发生修订时附带修订说明。信封字节计入
 * PTC 既有结果与帧额度，恢复重放返回同一形状。
 *
 * @param observation - 工具观察结果。
 * @param sourceReference - 事实引用序号。
 * @param revision - 可选的修订说明。
 * @returns 交给程序的结果信封。
 * @example
 * ```ts
 * const envelope = createProgramCallEnvelope(observation, 12, revision);
 * ```
 */
export function createProgramCallEnvelope(
    observation: unknown,
    sourceReference: number,
    revision?: ProgramCallRevision | undefined,
): { readonly observation: unknown; readonly sourceReferences: readonly number[]; readonly revision?: ProgramCallRevision } {
    return {
        observation,
        sourceReferences: [sourceReference],
        ...(revision === undefined ? {} : { revision }),
    };
}

/**
 * 计算审批审阅指纹。
 *
 * @remarks 指纹绑定原审批基准、最终 canonical 输入、Tool 身份、授权期限与最终
 * 能力范围。它是内容一致性引用，不是认证令牌；环境或策略变化导致内容变化时
 * 指纹随之改变，确认阶段据此要求重新审阅。
 *
 * @param input - 参与指纹的审阅内容。
 * @returns 稳定的审阅指纹。
 * @example
 * ```ts
 * const ref = computeActionApprovalReviewRef({
 *     actionId: "action-1", toolId: "write_file",
 *     originalInput: { path: "a.txt" }, finalInput: { path: "b.txt" },
 *     scope: "action", capability: { network: "none", extraFiles: [], targetPaths: [] },
 * });
 * ```
 */
export function computeActionApprovalReviewRef(input: {
    readonly actionId: string;
    readonly toolId: string;
    readonly originalInput: JsonValue;
    readonly finalInput: JsonValue;
    readonly scope: ActionApprovalScope;
    readonly capability: ActionApprovalCapability;
}): string {
    const payload = canonicalize({
        actionId: input.actionId,
        toolId: input.toolId,
        originalInput: input.originalInput,
        finalInput: input.finalInput,
        scope: input.scope,
        capability: {
            network: input.capability.network,
            extraFiles: input.capability.extraFiles,
            targetPaths: input.capability.targetPaths,
        },
    });
    return `review:${createHash("sha256")
        .update(JSON.stringify(payload), "utf8")
        .digest("hex")
        .slice(0, 32)}`;
}

/**
 * 计算批准决定的稳定身份。
 *
 * @remarks
 * 同一决定（同一 Action、期限与最终参数）拥有同一身份，因此重复提交复用同一条
 * 暂存授权；不同决定（例如修订参数或更换期限）拥有不同身份，可以各自暂存。
 * 会话入口优先使用会话输入身份，宿主直接调用时使用本函数的派生值。
 *
 * @param input - 参与身份计算的批准内容。
 * @returns 稳定的批准决定身份。
 * @example
 * ```ts
 * const id = computeApprovalInputId({
 *     actionId: "action-1", toolId: "write_file",
 *     scope: "action", finalInput: { path: "b.txt" },
 * });
 * ```
 */
export function computeApprovalInputId(input: {
    readonly actionId: string;
    readonly toolId: string;
    readonly scope: ActionApprovalScope;
    readonly finalInput: JsonValue;
}): string {
    const payload = canonicalize({
        actionId: input.actionId,
        toolId: input.toolId,
        scope: input.scope,
        finalInput: input.finalInput,
    });
    return `approval:${createHash("sha256")
        .update(JSON.stringify(payload), "utf8")
        .digest("hex")
        .slice(0, 32)}`;
}

/**
 * 计算当前待处理 Action 的有效恢复身份。
 *
 * @remarks
 * 恢复身份由本次已提交尝试派生，跨重启稳定；已提交快照保存同一引用。快照中缺少
 * 该字段时按同一规则派生，保证预检、决定提交与恢复视图使用同一身份。
 *
 * @param pending - 当前待处理 Action。
 * @returns 本次未知结果等待的恢复身份。
 * @example
 * ```ts
 * const ref = resolveActionRecoveryRef(pending);
 * ```
 */
export function resolveActionRecoveryRef(pending: PendingAction): string {
    return pending.recoveryRef
        ?? computeActionRecoveryRef(pending.action.actionId, pending.attemptsStarted ?? 1);
}

/**
 * 解析当前待审批 Action 实际应执行的参数版本。
 *
 * @remarks 未修订的 Action 直接使用原请求参数，不重复保存等价正文；已修订的
 * Action 使用获批版本中的最终 canonical 参数。
 *
 * @param pending - 当前待处理 Action。
 * @returns 实际应执行的 Action。
 * @example
 * ```ts
 * const action = resolveActionExecutionAction(pending);
 * ```
 */
export function resolveActionExecutionAction(pending: PendingAction): ToolCallAction {
    const version = pending.executionVersion;
    if (version === undefined) return pending.action;
    return {
        actionId: pending.action.actionId,
        toolId: pending.action.toolId,
        input: version.input,
    };
}

/**
 * 判断当前待处理 Action 是否处于可修订的首次审批等待。
 *
 * @remarks 只有 `awaiting_approval` 的等待可修订；已批准、已启动、结果未知、
 * 已结算或失效等待都不可修订。
 *
 * @param pending - 当前待处理 Action；省略时返回 `false`。
 * @returns 可修订时返回 `true`。
 * @example
 * ```ts
 * if (isRevisablePendingAction(pending)) await reviewActionApproval(request);
 * ```
 */
export function isRevisablePendingAction(pending: PendingAction | undefined): boolean {
    return pending !== undefined && pending.status === "awaiting_approval";
}

/**
 * 把沙箱能力范围投影为审阅可展示的目标路径集合。
 *
 * @remarks 只包含真实可强制的范围；受保护目录与内部状态目录不会出现在结果中，
 * 因为它们在能力解析阶段已经被拒绝。
 *
 * @param scope - 规范化后的沙箱能力范围。
 * @returns 额外文件目标路径列表。
 * @example
 * ```ts
 * const paths = projectSandboxTargetPaths(scope);
 * ```
 */
export function projectSandboxTargetPaths(scope: EffectiveSandboxScope): readonly string[] {
    return scope.extraFiles.map((file) => file.canonicalPath);
}
