import type { LLMResponse } from "../../llm/src/core/types";

/**
 * 将测试中既有的决策 fixture 编码为模型工具调用，不参与生产解码。
 * 非法 JSON fixture 原样作为工具参数，用于验证参数解码失败。
 */
export function toolResponseFixture(content: string): LLMResponse {
    let decision: Record<string, any>;
    try {
        decision = JSON.parse(content).result;
    } catch {
        return { content: "", toolCalls: [{ callId: "fixture-call", toolId: "system_complete_task", argumentsJson: content }] };
    }
    if (decision.kind === "tool_call" && decision.action === undefined) {
        return { content: "", toolCalls: [{ callId: "fixture-call", toolId: "undeclared-fixture-tool", argumentsJson: JSON.stringify(decision) }] };
    }
    if (decision.kind === "tool_call") {
        return { content: "", toolCalls: [{ callId: decision.action.actionId, toolId: decision.action.toolId,
            argumentsJson: JSON.stringify(decision.action.input) }] };
    }
    const { kind, contextNotes: _notes, ...args } = decision;
    const names: Record<string, string> = {
        complete: "system_complete_task", wait: "system_wait_for_input", fail: "system_fail_goal",
        request_think: "system_request_think", tool_discovery: "system_find_tools",
        run_stage_update: "system_update_run_stage", run_stage_complete: "system_complete_run_stage",
        task_proposal: "system_propose_task_plan", context_checkpoint: "system_context_checkpoint",
        context_lookup: "system_context_lookup", goal_plan_update: "system_update_goal_plan",
    };
    return { content: "", toolCalls: [{ callId: "fixture-call", toolId: kind === "accept" || kind === "reject" ? "system_review_completion" : names[kind] ?? "undeclared-fixture-tool",
        argumentsJson: JSON.stringify(kind === "accept" || kind === "reject" ? { result: decision } : args) }] };
}
