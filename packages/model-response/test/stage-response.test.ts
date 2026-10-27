import assert from "node:assert/strict";
import { test } from "node:test";

import { contract } from "../../contracts/src/index";
import {
    createUnifiedToolDeclarations,
    isModelAssistantMessage,
    SystemCompletionReviewDeclaration,
} from "../../model-contracts/src/index";
import type { LLMResponse } from "../../llm-core/src/index";
import { blockResponse, textResponse, toolCallResponse } from "../../llm-core/test/response-fixtures";
import {
    LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    LLMResponseProtocolError,
    assertNativeResponseIdentity,
    classifyDecideResponse,
    decodeCompletionReviewResponse,
    decodeThinkResponse,
    decodeToolCallOutcome,
    nativeResponseMessage,
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

test("classifyDecideResponse 区分单调用、批次、Assistant 消息与无可用结果", () => {
    const call = { callId: "call-1", toolId: "read_file", argumentsJson: "{\"path\":\"a.ts\"}" };
    assert.deepEqual(classifyDecideResponse(toolCallResponse(call)), { kind: "call", call });
    assert.deepEqual(
        classifyDecideResponse(blockResponse(
            { type: "tool_call", ...call },
            { type: "tool_call", ...call, callId: "call-2" },
        )),
        { kind: "batch", calls: [call, { ...call, callId: "call-2" }] },
    );
    assert.deepEqual(
        classifyDecideResponse(textResponse("直接回答")),
        { kind: "assistant_message", text: "直接回答" },
    );
    assert.deepEqual(
        classifyDecideResponse(blockResponse(
            { type: "text", text: "先说明再调用" },
            { type: "tool_call", ...call, callId: "call-3" },
        )),
        { kind: "call", call: { ...call, callId: "call-3" } },
    );
});

test("classifyDecideResponse 对零调用且无可用正文抛出 no_usable_result", () => {
    assert.throws(
        () => classifyDecideResponse(textResponse("   ")),
        (error: unknown) => error instanceof LLMResponseProtocolError
            && error.code === LLM_RESPONSE_PROTOCOL_ERROR_CODE
            && error.issues?.[0]?.code === "no_usable_result"
            && error.issues[0]!.path.join(".") === "toolCalls",
    );
});

test("requireSingleToolCall 区分缺失与多调用", () => {
    assert.throws(
        () => requireSingleToolCall(textResponse("text")),
        (error: unknown) => error instanceof LLMResponseProtocolError
            && error.issues?.[0]?.code === "missing_tool_call",
    );
    assert.throws(
        () => requireSingleToolCall(blockResponse(
            { type: "tool_call", callId: "c1", toolId: "read_file", argumentsJson: "{}" },
            { type: "tool_call", callId: "c2", toolId: "read_file", argumentsJson: "{}" },
        )),
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

test("decodeToolCallOutcome 容错解包 action/input 外壳与修剪多余元字段", () => {
    // 1. 带 action 外壳与多余元字段 (stageId, kind, thought, reason)
    const wrappedCall = {
        callId: "call-wrap",
        toolId: "read_file",
        argumentsJson: JSON.stringify({
            kind: "action",
            stageId: "stage-1",
            thought: "I should inspect the file",
            action: { path: "src/index.ts" },
        }),
    };
    const output = decodeToolCallOutcome(wrappedCall, declarations, AUTHORIZED_TOOL_IDS);
    assert.equal(output.kind, "tool_call");
    if (output.kind === "tool_call") {
        assert.equal(output.action.toolId, "read_file");
        assert.deepEqual(output.action.input, { path: "src/index.ts" });
    }

    // 2. 带 input 外壳且附带 reason
    const inputWrappedCall = {
        callId: "call-wrap-2",
        toolId: "read_file",
        argumentsJson: JSON.stringify({
            reason: "need to read config",
            input: { path: "config.json" },
        }),
    };
    const output2 = decodeToolCallOutcome(inputWrappedCall, declarations, AUTHORIZED_TOOL_IDS);
    assert.equal(output2.kind, "tool_call");
    if (output2.kind === "tool_call") {
        assert.equal(output2.action.toolId, "read_file");
        assert.deepEqual(output2.action.input, { path: "config.json" });
    }

    // 3. 带 parameters 外壳与多层嵌套外壳解包 ({ action: { input: { path: "nested.ts" } } })
    const nestedWrappedCall = {
        callId: "call-wrap-3",
        toolId: "read_file",
        argumentsJson: JSON.stringify({
            action: {
                parameters: { path: "nested.ts" },
            },
            approvalRequest: false,
        }),
    };
    const output3 = decodeToolCallOutcome(nestedWrappedCall, declarations, AUTHORIZED_TOOL_IDS);
    assert.equal(output3.kind, "tool_call");
    if (output3.kind === "tool_call") {
        assert.equal(output3.action.toolId, "read_file");
        assert.deepEqual(output3.action.input, { path: "nested.ts" });
    }

    // 4. 同名工具单键外壳解包 ({ read_file: { path: "same-name.ts" } })
    const sameNameCall = {
        callId: "call-wrap-4",
        toolId: "read_file",
        argumentsJson: JSON.stringify({
            read_file: { path: "same-name.ts" },
        }),
    };
    const output4 = decodeToolCallOutcome(sameNameCall, declarations, AUTHORIZED_TOOL_IDS);
    assert.equal(output4.kind, "tool_call");
    if (output4.kind === "tool_call") {
        assert.equal(output4.action.toolId, "read_file");
        assert.deepEqual(output4.action.input, { path: "same-name.ts" });
    }

    // 5. 空 sandboxAccess.network.targets 自动清理以避免硬校验报错
    const emptyNetworkCall = {
        callId: "call-wrap-5",
        toolId: "read_file",
        argumentsJson: JSON.stringify({
            path: "target.ts",
            sandboxAccess: { network: { targets: [] } },
        }),
    };
    const output5 = decodeToolCallOutcome(emptyNetworkCall, declarations, AUTHORIZED_TOOL_IDS);
    assert.equal(output5.kind, "tool_call");
    if (output5.kind === "tool_call") {
        assert.equal(output5.action.toolId, "read_file");
        assert.deepEqual(output5.action.input, { path: "target.ts" });
    }

    // 6. 支持带 toolId/input 多键包装与嵌套 action.input 解包
    const toolIdInputCall = {
        callId: "call-wrap-6",
        toolId: "read_file",
        argumentsJson: JSON.stringify({
            toolId: "read_file",
            input: { path: "from-toolId-input.ts" },
        }),
    };
    const output6 = decodeToolCallOutcome(toolIdInputCall, declarations, AUTHORIZED_TOOL_IDS);
    assert.equal(output6.kind, "tool_call");
    if (output6.kind === "tool_call") {
        assert.equal(output6.action.toolId, "read_file");
        assert.deepEqual(output6.action.input, { path: "from-toolId-input.ts" });
    }
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
        () => assertNativeResponseIdentity(textResponse("text"), identity),
        /Invalid native response identity or continuation data/,
    );
    assert.throws(
        () => assertNativeResponseIdentity({
            ...textResponse("text"),
            continuation: { identity: { ...identity, model: "other" } },
        } as LLMResponse, identity),
        /Invalid native response identity or continuation data/,
    );
});

test("decodeThinkResponse 拒绝工具调用与空文本，保留去除空白后的文本", () => {
    assert.equal(decodeThinkResponse(textResponse("  分析结果\n")), "分析结果");
    assert.throws(
        () => decodeThinkResponse(blockResponse(
            { type: "text", text: "text" },
            { type: "tool_call", callId: "c", toolId: "read_file", argumentsJson: "{}" },
        )),
        /Think stage must not return tool calls/,
    );
    assert.throws(
        () => decodeThinkResponse(textResponse("  \n ")),
        /Think stage returned empty text/,
    );
});

test("nativeResponseMessage 从完整块派生 Assistant 历史并保留续接", () => {
    const continuation = {
        identity: {
            provider: "google" as const,
            endpoint: "https://generativelanguage.googleapis.com/v1beta",
            model: "model",
            protocol: "gemini-content" as const,
        },
        parts: [{ functionCall: { name: "read_file", id: "call-1", args: { path: "a.ts" } }, thoughtSignature: "opaque-signature" }],
    };
    const message = nativeResponseMessage({
        ...blockResponse(
            { type: "text", text: "读取文件" },
            { type: "reasoning", text: "需要先查看实现" },
            { type: "tool_call", callId: "call-1", toolId: "read_file", argumentsJson: '{"path":"a.ts"}' },
        ),
        continuation,
    });

    assert.equal(message.content, "读取文件");
    assert.equal(message.reasoning, "需要先查看实现");
    assert.deepEqual(message.toolCalls, [{ callId: "call-1", toolId: "read_file", argumentsJson: '{"path":"a.ts"}' }]);
    assert.equal(message.continuation?.parts?.[0]?.thoughtSignature, "opaque-signature");
    assert.ok(isModelAssistantMessage(message));
    assert.equal(nativeResponseMessage(textResponse("无调用")).toolCalls, undefined);
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
        decodeCompletionReviewResponse(toolCallResponse({
            callId: "review-1",
            toolId: SystemCompletionReviewDeclaration.id,
            argumentsJson: JSON.stringify({ result: { kind: "accept" } }),
        })),
        { kind: "accept" },
    );
    assert.deepEqual(
        decodeCompletionReviewResponse(toolCallResponse({
            callId: "review-2",
            toolId: SystemCompletionReviewDeclaration.id,
            argumentsJson: JSON.stringify({ result: { kind: "reject", feedback: "缺少验证" } }),
        })),
        { kind: "reject", feedback: "缺少验证" },
    );

    assert.throws(
        () => decodeCompletionReviewResponse(textResponse("no call")),
        (error: unknown) => error instanceof LLMResponseProtocolError
            && error.issues?.[0]?.code === "missing_tool_call",
    );
    assert.throws(
        () => decodeCompletionReviewResponse(toolCallResponse({
            callId: "review-3",
            toolId: "system_find_tools",
            argumentsJson: "{}",
        })),
        /Completion review returned an undeclared result call/,
    );
});
