import { eventIsEvidence, type CommittedEvidenceIndex, type EvidenceGateError } from "./evidence-gate";
import type { WorkingMemoryPatchError } from "../../working-memory/src/index";

/** 可纠正模型输出所归属的模型阶段。 */
export type RuntimeFeedbackStage = "decide" | "think";

/** 触发纠错的具体校验边界。 */
export type RuntimeFeedbackOrigin =
    | "response_parse"
    | "output_contract"
    | "decision_semantics"
    | "tool_selection"
    | "tool_input"
    | "completion_evidence"
    | "completion_review"
    | "memory_patch";

/**
 * 一项经过界限化且不包含模型原始响应的修复提示。
 *
 * @example
 * ```ts
 * const issue: RuntimeFeedbackIssue = {
 *     code: "invalid_json_syntax",
 *     path: ["result"],
 *     message: "Return valid JSON matching the active response contract.",
 * };
 * ```
 */
export interface RuntimeFeedbackIssue {
    readonly code: string;
    readonly path: readonly (string | number)[];
    readonly message: string;
}

/**
 * Runtime 生成的、供原模型阶段修复当前无效输出的受限反馈。
 *
 * @remarks
 * 只携带 Goal/Run/Step 阶段身份、稳定错误码、有效约束和有界问题定位，不携带原始模型输出、
 * 用户消息、凭据或内部异常对象。该记录是阶段输入，不能并入真实 Goal Conversation。完成审查的缺口使用 completion_review 来源，
 * 仍归属 Decide，不新增恢复阶段。模型记忆提议的拒绝使用 memory_patch 来源，
 * 与恢复、存储或 Runtime 生命周期错误分流。
 *
 * @example
 * ```ts
 * const feedback: RuntimeFeedback = {
 *     goalId: "goal-1", runId: "run-1", executionUnitId: "unit-1", stepOrdinal: 1,
 *     stage: "decide", origin: "output_contract", code: "INVALID_LLM_RESPONSE",
 *     attempt: 1, issues: [{ code: "invalid_json", path: [], message: "Return valid JSON." }],
 * };
 * ```
 */
export interface RuntimeFeedback {
    readonly goalId: string;
    readonly runId: string;
    readonly executionUnitId: string;
    readonly stepOrdinal: number;
    readonly stage: RuntimeFeedbackStage;
    readonly origin: RuntimeFeedbackOrigin;
    readonly code: string;
    readonly attempt: number;
    readonly issues: readonly RuntimeFeedbackIssue[];
    readonly constraints?: readonly string[];
}

/**
 * Runtime 在模型输出的可纠正校验点抛出的类型化阶段失败。
 *
 * @remarks
 * Runner 可将 `feedback` 交回同一阶段执行器；`cause` 仅供进程内诊断，不得序列化进模型消息或公开投影。
 *
 * @example
 * ```ts
 * throw new ModelStageFeedbackError(feedback, "Decision output failed validation");
 * ```
 */
export class ModelStageFeedbackError extends Error {
    readonly cause: unknown;

    /**
     * @param feedback - 已移除原始输出的模型修复反馈。
     * @param message - 仅供进程内诊断的简短错误标题。
     * @param cause - 原始异常；不能转发到模型可见消息。
     */
    constructor(
        readonly feedback: RuntimeFeedback,
        message: string,
        cause?: unknown,
    ) {
        super(message);
        this.name = "ModelStageFeedbackError";
        this.cause = cause;
    }
}

/**
 * 为外部校验结果建立安全反馈，限制条数、路径长度和字段长度。
 *
 * @param input - Runtime 已判定来源和修复范围的反馈草稿。
 * @returns 所有文本字段和数组长度均受界限限制的不可变新对象。
 * @example
 * ```ts
 * const bounded = createRuntimeFeedback(feedbackDraft);
 * ```
 */
export function createRuntimeFeedback(
    input: RuntimeFeedback,
): RuntimeFeedback {
    return {
        ...input,
        code: boundText(input.code, 80),
        issues: input.issues.slice(0, 8).map((issue) => ({
            code: boundText(issue.code, 80),
            path: issue.path.slice(0, 8).map((part) => typeof part === "number"
                ? part
                : boundText(part, 80)),
            message: boundText(issue.message, 240),
        })),
        ...(input.constraints === undefined
            ? {}
            : { constraints: input.constraints.slice(0, 8).map((item) => boundText(item, 240)) }),
    };
}

function boundText(value: string, maxLength: number): string {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

/**
 * 将模型候选边界已判定的 Memory 拒绝转换为原 Decide 阶段的有界反馈。
 * @remarks 不执行校验、I/O 或持久化；恢复和配置错误不属于本入口。
 * @param error - 规则所有者生成的安全诊断，不接受模型原始响应。
 * @param identity - 当前阶段的可信身份。
 * @param index - 当前提交边界的证据索引，用于生成有限例子而非证明命题。
 * @returns 不携带事实值或文件正文的字段级反馈。
 * @example
 * ```ts
 * const feedback = createMemoryPatchFeedback(error, {
 *   goalId: "goal-1", runId: "run-1", executionUnitId: "unit-1", stepOrdinal: 2,
 * }, index);
 * ```
 */
export function createMemoryPatchFeedback(
    error: WorkingMemoryPatchError | EvidenceGateError,
    identity: Pick<RuntimeFeedback, "goalId" | "runId" | "executionUnitId" | "stepOrdinal">,
    index: CommittedEvidenceIndex,
): RuntimeFeedback {
    const valid = [...index.events.values()].filter(eventIsEvidence).map(event => event.sequence);
    const message = "sequence" in error && error.sequence !== undefined
        ? `Reference ${error.sequence}${error.eventType === undefined ? "" : ` (${error.eventType})`} is invalid: ${error.reason}.`
        : error.message;
    return createRuntimeFeedback({
        ...identity, stage: "decide", origin: "memory_patch", code: error.code, attempt: 1,
        issues: [{ code: error.reason, path: ["result", "memoryPatch", ...error.path], message }],
        constraints: [
            `Examples of valid committed Fact evidence: ${valid.slice(0, 5).join(", ") || "none"}. Examples are bounded and do not establish relevance to your claim.`,
            "Correct or omit the unsupported Fact, or obtain relevant Tool/Observation evidence. Continue the original task; a rejected Patch does not complete it.",
        ],
    });
}
