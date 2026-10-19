import assert from "node:assert/strict";
import { test } from "node:test";

import { contract } from "../../contracts/src/index";
import {
    createGoal,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    TrajectoryCheckpointCommitter,
    type AgentProfile,
    type Goal,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    type ToolDefinition,
} from "../../tool-core/src/index";
import {
    blockResponse,
    contentBlocks,
    type ContentBlockDraft,
} from "../../llm-core/test/response-fixtures";
import { createModelExecutionBinding, LLMStepExecutor } from "../../model-execution/src/index";
import { createDefaultPromptBundleRenderer } from "../../prompt-bundle/src/index";
import { DropOldestContextCompactor } from "../../context-budget/src/index";
import type { LLMAdapter, LLMRequest, LLMResponse } from "../../llm-core/src/index";
import type { NativeConversationIdentity } from "../../model-contracts/src/index";
import { currentProtocols, messageOutline, trajectoryStoreFor, withDiscoveredProfileTools } from "./current-fixtures";

const identity: NativeConversationIdentity = {
    provider: "google",
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    model: "test",
    protocol: "gemini-content",
};
const profile: AgentProfile = {
    id: "process-message-profile",
    systemPrompt: "Test",
    instructions: ["Test"],
    toolIds: ["read_file"],
};
const readTool: ToolDefinition = {
    id: "read_file",
    description: "Read a file",
    isReadOnly: true,
    inputContract: contract.object({ path: contract.string() }),
};
const renderer = await createDefaultPromptBundleRenderer();

function createGoalFixture(): Goal {
    return withDiscoveredProfileTools(createGoal({
        ...currentProtocols,
        id: "process-message-goal",
        runId: "process-message-run",
        intent: "读取并总结",
        promptBundleVersion: 1,
        profile,
    }));
}

/** 构造带原生续接的响应，正文与工具调用保持块顺序。 */
function nativeResponse(...drafts: readonly ContentBlockDraft[]): LLMResponse {
    const blocks = contentBlocks(...drafts);
    const texts = blocks.filter(block => block.type === "text");
    const call = blocks.find(block => block.type === "tool_call");
    return {
        blocks,
        continuation: {
            identity,
            parts: [
                ...texts.map(block => ({ text: block.text })),
                ...(call === undefined
                    ? []
                    : [{ functionCall: { name: call.toolId, args: JSON.parse(call.argumentsJson) } }]),
            ],
        },
    };
}

interface Harness {
    readonly runner: Runner;
    readonly store: InMemoryGoalStore;
    readonly requests: LLMRequest[];
}

function createHarness(options: {
    readonly respond: (request: LLMRequest, decideCallIndex: number) => LLMResponse;
    readonly review?: () => LLMResponse;
    readonly execute?: () => { readonly kind: "success"; readonly output: string; readonly summary: string }
        | { readonly kind: "failure"; readonly code: string; readonly message: string; readonly retryable: boolean };
    readonly requireApproval?: boolean;
}): Harness {
    const store = new InMemoryGoalStore();
    const trajectoryStore = trajectoryStoreFor(store);
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore });
    const requests: LLMRequest[] = [];
    let decideCalls = 0;
    const adapter: LLMAdapter = {
        structuredOutputMode: "strict",
        nativeConversationIdentity: identity,
        async generate(request) {
            requests.push(request);
            const toolIds = (request.tools ?? []).map((tool) => tool.id);
            if (toolIds.includes("system_review_completion")) {
                return options.review?.() ?? blockResponse({
                    type: "tool_call",
                    callId: "review-1",
                    toolId: "system_review_completion",
                    argumentsJson: JSON.stringify({ result: { kind: "accept" } }),
                });
            }
            decideCalls += 1;
            return options.respond(request, decideCalls);
        },
    };
    const binding = createModelExecutionBinding({
        generation: 1,
        selection: {
            provider: "google",
            modelId: "test",
            structuredOutputMode: "strict",
            inputEstimator: { kind: "character-v1" },
        },
        decideAdapter: adapter,
        thinkAdapter: { structuredOutputMode: "prompt_only", async generate() { throw new Error("unexpected Think call"); } },
        trajectoryStore,
    });
    const executor = new LLMStepExecutor({
        bindingProvider: { current: () => binding },
        renderer: renderer,
        contextCompactor: new DropOldestContextCompactor(),
    });
    const registry = new InMemoryToolRegistry([createToolRegistration({
        definition: readTool,
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute() {
            return options.execute?.() ?? { kind: "success", output: "文件内容", summary: "读取完成" };
        },
    })]);
    const runner = new Runner({
        store,
        trajectoryStore,
        executor,
        checkpointCommitter: committer,
        toolRegistry: registry,
        toolPolicy: { evaluate: () => (options.requireApproval === true ? "require_approval" : "allow") },
    });
    return { runner, store, requests };
}

test("混合工具响应的公开正文块按顺序保存为过程消息", async () => {
    const harness = createHarness({
        respond: (_request, callIndex) => callIndex === 1
            ? nativeResponse(
                { type: "text", text: "先检查配置" },
                { type: "tool_call", callId: "call-1", toolId: "read_file", argumentsJson: JSON.stringify({ path: "README.md" }) },
                { type: "text", text: "正在读取" },
            )
            : nativeResponse(
                { type: "tool_call", callId: "call-2", toolId: "system_complete_task", argumentsJson: JSON.stringify({ summary: "完成", completionEvidence: [] }) },
            ),
    });
    await harness.store.save(createGoalFixture());
    const result = await harness.runner.run({ goalId: "process-message-goal", runId: "process-message-run" });

    assert.equal(result.ok, true);
    const persisted = await harness.store.restore("process-message-goal");
    assert.ok(persisted);
    const processMessages = persisted.state.messages.filter((message) =>
        message.role === "assistant" && message.purpose === "process");
    assert.equal(processMessages.length, 2, JSON.stringify({
        status: persisted.state.run.status,
        messages: persisted.state.messages,
        stopReason: persisted.state.run.stopReason,
    }));
    assert.equal(processMessages[0]?.content, "先检查配置");
    assert.equal(processMessages[1]?.content, "正在读取");
    assert.deepEqual(processMessages[0]?.source, {
        kind: "model_text",
        modelCallId: processMessages[0]?.source.kind === "model_text" ? processMessages[0].source.modelCallId : "",
        blockIndex: 0,
    });
    assert.equal(processMessages[1]?.source.kind, "model_text");
    assert.equal(
        processMessages[1]?.source.kind === "model_text" ? processMessages[1].source.blockIndex : -1,
        2,
    );
    // 同一次模型调用的两段正文共享模型调用身份，只靠块下标区分。
    assert.equal(
        processMessages[0]?.source.kind === "model_text" ? processMessages[0].source.modelCallId : "",
        processMessages[1]?.source.kind === "model_text" ? processMessages[1].source.modelCallId : "",
    );
});

test("过程消息不推进 Step，也不新增模型调用或工具执行", async () => {
    const mixed = createHarness({
        respond: (_request, callIndex) => callIndex === 1
            ? nativeResponse(
                { type: "text", text: "先检查配置" },
                { type: "tool_call", callId: "call-1", toolId: "read_file", argumentsJson: JSON.stringify({ path: "README.md" }) },
            )
            : nativeResponse(
                { type: "tool_call", callId: "call-2", toolId: "system_complete_task", argumentsJson: JSON.stringify({ summary: "完成", completionEvidence: [] }) },
            ),
    });
    const plain = createHarness({
        respond: (_request, callIndex) => callIndex === 1
            ? nativeResponse(
                { type: "tool_call", callId: "call-1", toolId: "read_file", argumentsJson: JSON.stringify({ path: "README.md" }) },
            )
            : nativeResponse(
                { type: "tool_call", callId: "call-2", toolId: "system_complete_task", argumentsJson: JSON.stringify({ summary: "完成", completionEvidence: [] }) },
            ),
    });
    await mixed.store.save(createGoalFixture());
    await plain.store.save(createGoalFixture());
    const mixedResult = await mixed.runner.run({ goalId: "process-message-goal", runId: "process-message-run" });
    const plainResult = await plain.runner.run({ goalId: "process-message-goal", runId: "process-message-run" });

    assert.equal(mixedResult.ok, true);
    assert.equal(plainResult.ok, true);
    if (!mixedResult.ok || !plainResult.ok) return;
    // 过程正文不推进 Step，也不增加模型调用。
    assert.equal(mixedResult.state.stepCount, plainResult.state.stepCount);
    assert.equal(mixed.requests.length, plain.requests.length);
    assert.equal(mixedResult.state.stepCount, 1);
});

test("工具失败时已提交过程说明保留且不变成成功证据", async () => {
    const harness = createHarness({
        respond: (_request, callIndex) => callIndex === 1
            ? nativeResponse(
                { type: "text", text: "先检查配置" },
                { type: "tool_call", callId: "call-1", toolId: "read_file", argumentsJson: JSON.stringify({ path: "missing.md" }) },
            )
            : nativeResponse(
                { type: "tool_call", callId: "call-2", toolId: "system_fail_goal", argumentsJson: JSON.stringify({ error: "读取失败" }) },
            ),
        execute: () => ({ kind: "failure", code: "FILE_NOT_FOUND", message: "文件不存在", retryable: false }),
    });
    await harness.store.save(createGoalFixture());
    await harness.runner.run({ goalId: "process-message-goal", runId: "process-message-run" });

    const persisted = await harness.store.restore("process-message-goal");
    assert.ok(persisted);
    assert.deepEqual(messageOutline(persisted.state.messages), [
        { role: "user", content: "读取并总结" },
        { role: "assistant", content: "先检查配置", purpose: "process" },
        { role: "assistant", content: "读取失败", purpose: "notice" },
    ], JSON.stringify({
        status: persisted.state.run.status,
        messages: persisted.state.messages,
        stopReason: persisted.state.run.stopReason,
    }));
    const lastStep = persisted.state.run.lastStep;
    assert.ok(lastStep !== undefined);
});

test("工具审批等待时已提交过程说明保留，等待点不被当作已完成", async () => {
    const harness = createHarness({
        respond: () => nativeResponse(
            { type: "text", text: "先检查配置" },
            { type: "tool_call", callId: "call-1", toolId: "read_file", argumentsJson: JSON.stringify({ path: "README.md" }) },
        ),
        requireApproval: true,
    });
    await harness.store.save(createGoalFixture());
    const result = await harness.runner.run({ goalId: "process-message-goal", runId: "process-message-run" });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "waiting");
    const persisted = await harness.store.restore("process-message-goal");
    assert.ok(persisted);
    assert.deepEqual(messageOutline(persisted.state.messages), [
        { role: "user", content: "读取并总结" },
        { role: "assistant", content: "先检查配置", purpose: "process" },
    ]);
    assert.equal(persisted.state.run.pendingAction?.status, "awaiting_approval", JSON.stringify({
        status: persisted.state.run.status,
        pendingAction: persisted.state.run.pendingAction,
        stopReason: persisted.state.run.stopReason,
    }));
});

test("完成候选被审查拒绝时不留下提前的正式正文", async () => {
    const harness = createHarness({
        respond: (_request, callIndex) => {
            assert.equal(callIndex, 1);
            return nativeResponse(
                { type: "text", text: "这是完成候选" },
                { type: "tool_call", callId: "call-1", toolId: "system_complete_task", argumentsJson: JSON.stringify({ summary: "完成", completionEvidence: [] }) },
            );
        },
        review: () => blockResponse({
            type: "tool_call",
            callId: "review-1",
            toolId: "system_review_completion",
            argumentsJson: JSON.stringify({ result: { kind: "reject", feedback: "证据不足" } }),
        }),
    });
    await harness.store.save(createGoalFixture());
    const result = await harness.runner.run({ goalId: "process-message-goal", runId: "process-message-run" });

    assert.equal(result.ok, true);
    const persisted = await harness.store.restore("process-message-goal");
    assert.ok(persisted);
    const processMessages = persisted.state.messages.filter((message) =>
        message.role === "assistant" && message.purpose === "process");
    assert.equal(processMessages.length, 0);
    assert.equal(
        persisted.state.messages.some((message) => message.content === "这是完成候选"),
        false,
    );
});

test("零工具正文沿用既有单条消息行为，不按块重复保存", async () => {
    const harness = createHarness({
        respond: () => nativeResponse(
            { type: "text", text: "我先说明判断" },
        ),
    });
    await harness.store.save(createGoalFixture());
    const result = await harness.runner.run({ goalId: "process-message-goal", runId: "process-message-run" });

    assert.equal(result.ok, true);
    const persisted = await harness.store.restore("process-message-goal");
    assert.ok(persisted);
    const processMessages = persisted.state.messages.filter((message) =>
        message.role === "assistant" && message.purpose === "process");
    // 不推进类预算内每次尝试提交一条正文；每次响应只产生一条消息。
    assert.equal(processMessages.length, 3);
    assert.ok(processMessages.every((message) => message.content === "我先说明判断"));
    assert.ok(processMessages.every((message) => message.source.kind === "model_text"));
    const modelCallIds = new Set(processMessages.map((message) =>
        message.source.kind === "model_text" ? message.source.modelCallId : ""));
    assert.equal(modelCallIds.size, 3);
});

test("过程消息不进入模型可见的协议 JSON，也不包含工具参数", async () => {
    const harness = createHarness({
        respond: (_request, callIndex) => callIndex === 1
            ? nativeResponse(
                { type: "text", text: "先检查配置" },
                { type: "tool_call", callId: "call-1", toolId: "read_file", argumentsJson: JSON.stringify({ path: "README.md" }) },
            )
            : nativeResponse(
                { type: "tool_call", callId: "call-2", toolId: "system_complete_task", argumentsJson: JSON.stringify({ summary: "完成", completionEvidence: [] }) },
            ),
    });
    await harness.store.save(createGoalFixture());
    await harness.runner.run({ goalId: "process-message-goal", runId: "process-message-run" });

    const persisted = await harness.store.restore("process-message-goal");
    assert.ok(persisted);
    const processMessages = persisted.state.messages.filter((message) =>
        message.role === "assistant" && message.purpose === "process");
    assert.equal(processMessages.length, 1);
    assert.equal(processMessages[0]?.content.includes("README.md"), false);
});
