import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    invokeContextLookup,
    RuntimeContextLookupAdapter,
    IndexedContextLookupService,
    type ContextLookupPort,
    type ContextLookupResult,
    type Goal,
} from "../src/index";
import type {
    ContextRetriever,
    ContextRetrieverInput,
} from "../../context-retrieval/src/index";
import type { ContextLookupRequest } from "../../model-contracts/src/index";

const goalId = "adapter-goal";
const runId = "adapter-run";
const request: ContextLookupRequest = {
    kind: "context_lookup",
    need: "historical_execution",
    question: "寻找关键配置",
};

function createTestGoal(): Goal {
    return createGoal({
        id: goalId,
        runId,
        intent: "测试适配器",
        promptBundleVersion: 1,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        profile: {
            id: "test-profile",
            systemPrompt: "test",
            instructions: [],
            toolIds: [],
        },
    });
}

test("RuntimeContextLookupAdapter 将 Goal/Trajectory 投影后正确委托给 ContextRetriever", async () => {
    let capturedInput: ContextRetrieverInput | undefined;
    const mockRetriever: ContextRetriever = {
        async retrieve(input: ContextRetrieverInput): Promise<ContextLookupResult> {
            capturedInput = input;
            return {
                status: "not_found",
                lookupId: input.lookupId,
                committedThroughSequence: input.committedThroughSequence,
                reason: "mock_not_found",
            };
        },
    };

    const adapter = new RuntimeContextLookupAdapter({
        retriever: mockRetriever,
    });

    const goal = createTestGoal();
    const invocation = await invokeContextLookup({
        goal,
        request,
        phase: "executing",
        port: adapter,
    });

    assert.ok(capturedInput);
    assert.equal(capturedInput.goalId, goalId);
    assert.equal(capturedInput.currentRunId, runId);
    assert.equal(capturedInput.request.question, request.question);
    assert.equal(invocation.result.status, "not_found");
    if (invocation.result.status === "not_found") {
        assert.equal(invocation.result.reason, "mock_not_found");
    }
});

test("invokeContextLookup 在接纳替换检索器结果前验证边界并拒绝越界结果", async () => {
    // 模拟恶意或错误的替换检索器：返回了超过 boundary 的命中
    const faultyRetriever: ContextRetriever = {
        async retrieve(input: ContextRetrieverInput): Promise<ContextLookupResult> {
            return {
                status: "found",
                lookupId: input.lookupId,
                committedThroughSequence: input.committedThroughSequence,
                truncated: false,
                matches: [{
                    documentId: "doc-illegal",
                    goalId: input.goalId,
                    runId: input.currentRunId,
                    firstSequence: 10,
                    lastSequence: 999, // 越界
                    matchedFields: ["body"],
                    score: 1.0,
                    preview: "越界内容",
                    truncated: false,
                    historical: true,
                    sourceEventIds: ["event-999"],
                }],
            };
        },
    };

    const adapter = new RuntimeContextLookupAdapter({
        retriever: faultyRetriever,
    });

    const goal = createTestGoal();
    const invocation = await invokeContextLookup({
        goal,
        request,
        phase: "executing",
        port: adapter,
    });

    // 越界结果被 Runtime 门禁截获并转为 lookup_error
    assert.equal(invocation.result.status, "lookup_error");
    if (invocation.result.status === "lookup_error") {
        assert.equal(invocation.result.code, "INVALID_CONTEXT_LOOKUP_RESULT");
    }
});

test("IndexedContextLookupService 默认使用 BM25-lite 检索器正常工作", async () => {
    const service = new IndexedContextLookupService();
    const goal = createTestGoal();
    const invocation = await invokeContextLookup({
        goal,
        request,
        phase: "executing",
        port: service,
    });

    assert.equal(invocation.result.status, "not_found");
});
