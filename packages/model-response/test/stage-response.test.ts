import assert from "node:assert/strict";
import { test } from "node:test";

import { contract } from "../../contracts/src/index";
import {
    createUnifiedToolDeclarations,
    SystemCompletionReviewDeclaration,
} from "../../model-contracts/src/index";
import type { LLMResponse } from "../../llm-core/src/index";
import {
    LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    LLMResponseProtocolError,
    assertNativeResponseIdentity,
    classifyDecideResponse,
    decodeCompletionReviewResponse,
    decodeThinkResponse,
    decodeToolCallOutcome,
    normalizeRequestThinkGoal,
    requireSingleToolCall,
} from "../src/index";

const AUTHORIZED_TOOL_IDS = ["read_file"] as const;

const declarations = createUnifiedToolDeclarations(
    [{
        id: "read_file",
        inputContract: contract.object({ path: contract.string() }),
        isReadOnly: true,
    }],
    true,
    false,
    false,
    false,
);

function response(overrides: Partial<LLMResponse> = {}): LLMResponse {
    return { content: "", ...overrides };
}

test("classifyDecideResponse 区分单调用、批次、Assistant 消息与无可用结果", () => {
    const call = { callId: "call-1", toolId: "read_file", argumentsJson: "{\"path\":\"a.ts\"}" };
    assert.deepEqual(classifyDecideResponse(response({ toolCalls: [call] })), { kind: "call", call });
    assert.deepEqual(
        classifyDecideResponse(response({ toolCalls: [call, { ...call, callId: "call-2" }] })),
        { kind: "batch", calls: [call, { ...call, callId: "call-2" }] },
    );
    assert.deepEqual(
        classifyDecideResponse(response({ content: "直接回答" })),
        { kind: "assistant_message", text: "直接回答" },
    );
});

test("classifyDecideResponse 对零调用且无可用正文抛出 no_usable_result", () => {
    assert.throws(
        () => classifyDecideResponse(response({ content: "   " })),
        (error: unknown) => error instanceof LLMResponseProtocolError
            && error.code === LLM_RESPONSE_PROTOCOL_ERROR_CODE
            && error.issues?.[0]?.code === "no_usable_result"
            && error.issues[0]!.path.join(".") === "toolCalls",
    );
});

test("requireSingleToolCall 区分缺失与多调用", () => {
    assert.throws(
        () => requireSingleToolCall(response({ content: "text", toolCalls: [] })),
        (error: unknown) => error instanceof LLMResponseProtocolError
            && error.issues?.[0]?.code === "missing_tool_call",
    );
    assert.throws(
        () => requireSingleToolCall(response({
            toolCalls: [
                { callId: "c1", toolId: "read_file", argumentsJson: "{}" },
                { callId: "c2", toolId: "read_file", argumentsJson: "{}" },
            ],
        })),
        (error: unknown) => error instanceof LLMResponseProtocolError
            && error.issues?.[0]?.code === "multiple_tool_calls",
    );
});

test("decodeToolCallOutcome 解码合法调用并保留 actionId 契约结果", () => {
    const output = decodeToolCallOutcome(
        { callId: "call-1", toolId: "read_file", argumentsJson: JSON.stringify({ path: "a.ts" }) },
        declarations,
        AUTHORIZED_TOOL_IDS,
    );

    assert.equal(output.kind, "tool_call");
    if (output.kind !== "tool_call") return;
    assert.equal(output.action.toolId, "read_file");
    assert.deepEqual(output.action.input, { path: "a.ts" });
});

test("decodeToolCallOutcome 对非法 JSON 与契约违规保持稳定 issue 与业务路径", () => {
    assert.throws(
        () => decodeToolCallOutcome(
            { callId: "call-1", toolId: "read_file", argumentsJson: "not json" },
            declarations,
            AUTHORIZED_TOOL_IDS,
        ),
        (error: unknown) => error instanceof LLMResponseProtocolError
            && error.issues?.[0]?.code === "invalid_tool_arguments"
            && error.issues[0]!.path.join(".") === "arguments",
    );

    assert.throws(
        () => decodeToolCallOutcome(
            { callId: "call-1", toolId: "read_file", argumentsJson: JSON.stringify({ path: 42 }) },
            declarations,
            AUTHORIZED_TOOL_IDS,
        ),
        (error: unknown) => error instanceof LLMResponseProtocolError
            && error.issues?.[0]?.path.join(".") === "action.input.path"
            && error.toolCallShape?.toolId === "read_file"
            && error.toolCallShape?.requiredFields.includes("path"),
    );

    assert.throws(
        () => decodeToolCallOutcome(
            { callId: "call-1", toolId: "system_complete_task", argumentsJson: JSON.stringify({ summary: 1 }) },
            declarations,
            AUTHORIZED_TOOL_IDS,
        ),
        (error: unknown) => error instanceof LLMResponseProtocolError
            && error.issues?.[0]?.path.join(".") === "summary",
    );
});

test("assertNativeResponseIdentity 在缺少续接或身份不匹配时失败", () => {
    const identity = {
        provider: "google" as const,
        endpoint: "https://generativelanguage.googleapis.com/v1beta",
        model: "model",
        protocol: "gemini-content" as const,
    };

    assert.throws(
        () => assertNativeResponseIdentity(response({ content: "text" }), identity),
        /Invalid native response identity or continuation data/,
    );
    assert.throws(
        () => assertNativeResponseIdentity(response({
            content: "text",
            continuation: { identity: { ...identity, model: "other" } },
        } as LLMResponse), identity),
        /Invalid native response identity or continuation data/,
    );
});

test("decodeThinkResponse 拒绝工具调用与空文本，保留去除空白后的文本", () => {
    assert.equal(decodeThinkResponse(response({ content: "  分析结果\n" })), "分析结果");
    assert.throws(
        () => decodeThinkResponse(response({ content: "text", toolCalls: [{ callId: "c", toolId: "read_file", argumentsJson: "{}" }] })),
        /Think stage must not return tool calls/,
    );
    assert.throws(
        () => decodeThinkResponse(response({ content: "  \n " })),
        /Think stage returned empty text/,
    );
});

test("normalizeRequestThinkGoal 去除空白并拒绝空白目标", () => {
    assert.equal(normalizeRequestThinkGoal({ goal: "  分析协议  " }), "分析协议");
    assert.throws(
        () => normalizeRequestThinkGoal({ goal: " \n " }),
        (error: unknown) => error instanceof LLMResponseProtocolError
            && error.issues?.[0]?.code === "blank_think_goal"
            && error.issues[0]!.path.join(".") === "goal",
    );
});

test("decodeCompletionReviewResponse 解码接受与拒绝，并拒绝调用数量错误", () => {
    assert.deepEqual(
        decodeCompletionReviewResponse(response({
            toolCalls: [{
                callId: "review-1",
                toolId: SystemCompletionReviewDeclaration.id,
                argumentsJson: JSON.stringify({ result: { kind: "accept" } }),
            }],
        })),
        { kind: "accept" },
    );
    assert.deepEqual(
        decodeCompletionReviewResponse(response({
            toolCalls: [{
                callId: "review-2",
                toolId: SystemCompletionReviewDeclaration.id,
                argumentsJson: JSON.stringify({ result: { kind: "reject", feedback: "缺少验证" } }),
            }],
        })),
        { kind: "reject", feedback: "缺少验证" },
    );

    assert.throws(
        () => decodeCompletionReviewResponse(response({ content: "no call" })),
        (error: unknown) => error instanceof LLMResponseProtocolError
            && error.issues?.[0]?.code === "missing_tool_call",
    );
    assert.throws(
        () => decodeCompletionReviewResponse(response({
            toolCalls: [{
                callId: "review-3",
                toolId: "system_find_tools",
                argumentsJson: "{}",
            }],
        })),
        /Completion review returned an undeclared result call/,
    );
});
