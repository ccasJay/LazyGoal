import {
    createRuntimeFeedback,
    ModelStageFeedbackError,
    type RuntimeFeedback,
    type RuntimeFeedbackOrigin,
    type RuntimeFeedbackStage,
} from "../../runtime/src/runtime-feedback";
import type { Goal } from "../../runtime/src/domain";
import { LLMResponseProtocolError } from "./errors";

/** 将 Agent 的结构化解析异常转换成不含响应正文的 Runtime 阶段反馈。 */
export function toModelStageFeedback(
    error: unknown,
    input: { readonly goal: Goal; readonly executionUnitId?: string },
    stage: RuntimeFeedbackStage,
): unknown {
    if (!(error instanceof LLMResponseProtocolError)) return error;

    const issues = error.issues?.slice(0, 8).map((issue) => ({
        code: issue.code,
        path: issue.path,
        message: safeIssueMessage(issue.code),
    })) ?? [{
        code: error.code,
        path: [],
        message: safeStageMessage(stage),
    }];
    const origin = classifyOrigin(issues.map((issue) => issue.code), stage);
    const feedback: RuntimeFeedback = createRuntimeFeedback({
        goalId: input.goal.id,
        runId: input.goal.state.run.id,
        executionUnitId: input.executionUnitId ?? "unbound",
        stepOrdinal: input.goal.state.run.stepCount + 1,
        stage,
        origin,
        code: error.code,
        attempt: 1,
        issues,
        constraints: [
            "Follow the response schema and rules already included in this request.",
            ...(stage === "think" ? ["Keep the requested Think goal; provide non-empty text and no Tool call."] : []),
        ],
    });
    return new ModelStageFeedbackError(feedback, `${stage} output failed validation`, error);
}

function classifyOrigin(codes: readonly string[], stage: RuntimeFeedbackStage): RuntimeFeedbackOrigin {
    if (stage === "think") return "output_contract";
    if (codes.some((code) => code.includes("tool") || code.includes("argument"))) return "tool_input";
    if (codes.some((code) => code.includes("evidence"))) return "completion_evidence";
    if (codes.some((code) => code.includes("invalid_json"))
        || codes.includes("empty_response")
        || codes.includes("malformed_code_fence")) {
        return "response_parse";
    }
    if (codes.some((code) => code.includes("semantic")
        || code.includes("invalid_value")
        || code === "blank_string"
        || code === "invalid_sequence_range"
        || code === "empty_update"
        || code === "invalid_evidence_reference")) return "decision_semantics";
    return "output_contract";
}

function safeIssueMessage(code: string): string {
    if (code.toLowerCase().includes("invalid_json")) {
        return "Return valid JSON matching the active response contract.";
    }
    if (code === "empty_response" || code === "malformed_code_fence") {
        return "Return a non-empty JSON response without surrounding prose or malformed code fences.";
    }
    if (code.toLowerCase().includes("tool") || code.toLowerCase().includes("argument")) {
        return "Tool arguments must match the schema and description supplied in this request.";
    }
    if (code.toLowerCase().includes("evidence")) {
        return "Use only evidence sequence numbers listed in the current request.";
    }
    return "The value at this path does not satisfy the active response contract; return a valid value.";
}

function safeStageMessage(stage: RuntimeFeedbackStage): string {
    return stage === "think"
        ? "Return non-empty Think text without Tool calls."
        : "Return one response that satisfies the active response contract.";
}
