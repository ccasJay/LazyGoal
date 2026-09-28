/** 可纠正模型输出所归属的模型阶段。 */
export type RuntimeFeedbackStage = "decide" | "think";

/** 触发纠错的具体校验边界。 */
export type RuntimeFeedbackOrigin =
    | "response_parse"
    | "output_contract"
    | "decision_semantics"
    | "tool_selection"
    | "tool_input"
    | "completion_evidence";

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
 * 用户消息、凭据或内部异常对象。该记录是阶段输入，不能并入真实 Goal Conversation。
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
