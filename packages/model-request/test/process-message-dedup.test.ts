import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { ModelAssistantMessage, NativeConversationIdentity } from "../../model-contracts/src/index";
import {
    allocateImmutableEvent,
    createGoal,
    type Goal,
    type TrajectoryEvent,
    type TrajectoryEventPayload,
} from "../../runtime/src/index";
import { JsonFileGoalStore } from "../../storage/src/index";
import { TrajectoryModelContextAssembler } from "../../model-context/src/index";
import { buildStepRequest } from "../../model-request/src/index";
import { createDefaultPromptBundleRenderer } from "../../prompt-bundle/src/index";
import {
    createModelContextBudgetPolicy,
    DropOldestContextCompactor,
} from "../../context-budget/src/index";
import {
    bindMessagesToGoal,
    currentProtocols,
    testAssistantMessage,
    testUserMessage,
} from "../../runtime/test/current-fixtures";
import {
    createInMemoryTrajectoryStore,
    currentWorkingMemory,
} from "../../model-context/test/current-fixtures";

const identity: NativeConversationIdentity = {
    provider: "google",
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    model: "test",
    protocol: "gemini-content",
};
const otherIdentity: NativeConversationIdentity = { ...identity, model: "other-model" };
const renderer = await createDefaultPromptBundleRenderer();
const compactor = new DropOldestContextCompactor();
const profile = { id: "dedup", systemPrompt: "Follow task", instructions: [], toolIds: ["read_file"] };

const PROCESS_BODY = "Process body";
const SAME_TEXT = "Same text";
const INTENT = "Read files";

/** 构造一条已结算的原生调用／结果交换；模型调用身份固定为 `call-0`。 */
function settledExchange(options: { readonly observationOutput?: string; readonly signature?: string } = {}): readonly TrajectoryEvent[] {
    const events: TrajectoryEvent[] = [];
    const add = (payload: TrajectoryEventPayload, unit = "unit-1"): TrajectoryEvent => {
        const event = allocateImmutableEvent({
            goalId: "dedup-goal",
            runId: "dedup-run",
            phase: "executing",
            executionUnitId: unit,
            eventType: payload.type,
            payload,
        } as never, events.length + 1);
        events.push(event);
        return event;
    };
    const message: ModelAssistantMessage = {
        role: "assistant",
        content: PROCESS_BODY,
        toolCalls: [{ callId: "provider-call", toolId: "read_file", argumentsJson: JSON.stringify({ path: "README.md" }) }],
        continuation: {
            identity,
            parts: [
                { text: PROCESS_BODY },
                { functionCall: { name: "read_file", args: { path: "README.md" } }, thoughtSignature: options.signature ?? "signature" },
            ],
        },
    };
    add({
        type: "model_response_received",
        stage: "decide",
        modelCallId: "call-0",
        epochNumber: 0,
        conversationPosition: 0,
        message,
    });
    add({
        type: "decision_received",
        decision: { kind: "tool_call", action: { actionId: "runtime-action", toolId: "read_file", input: { path: "README.md" } } },
    });
    add({
        type: "action_staged",
        action: { actionId: "runtime-action", toolId: "read_file", input: { path: "README.md" } },
        approvalStatus: "approved",
    });
    add({
        type: "observation_recorded",
        actionId: "runtime-action",
        observation: { kind: "success", output: options.observationOutput ?? "ok", summary: "Observed" },
    });
    return events;
}

/** 构造带同源过程正文、同文用户消息与同文独立答案的 Goal。 */
function createGoalWithProcessMessage(modelCallId = "call-0"): Goal {
    const goal = createGoal({
        ...currentProtocols,
        id: "dedup-goal",
        runId: "dedup-run",
        intent: INTENT,
        promptBundleVersion: 1,
        profile,
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            messages: [
                ...goal.state.messages,
                ...bindMessagesToGoal(goal, [
                    testAssistantMessage(PROCESS_BODY, {
                        profileId: profile.id,
                        runId: "dedup-run",
                        source: { kind: "model_text", modelCallId, blockIndex: 0 },
                    }),
                    testUserMessage(SAME_TEXT, {
                        runId: "dedup-run",
                        source: { kind: "user_input", inputId: "input-same-text" },
                    }),
                    testAssistantMessage(SAME_TEXT, {
                        profileId: profile.id,
                        runId: "dedup-run",
                        purpose: "answer",
                        source: { kind: "completion_candidate", candidateId: "candidate-same-text" },
                    }),
                ], "dedup-run"),
            ],
            run: {
                ...goal.state.run,
                status: "running",
                exposedToolIds: [...profile.toolIds],
            },
        },
    };
}

interface RenderedRequest {
    readonly messages: readonly { readonly role: string; readonly content: string }[];
}

async function buildRequest(options: {
    readonly events: readonly TrajectoryEvent[];
    readonly boundary: number;
    readonly nativeIdentity?: NativeConversationIdentity;
    readonly budget?: number;
    readonly goal?: Goal;
}): Promise<RenderedRequest> {
    const store = createInMemoryTrajectoryStore();
    for (const event of options.events) {
        const { eventId: _eventId, occurredAt: _occurredAt, sequence: _sequence, ...draft } = event;
        await store.append(draft as never);
    }
    const goal = options.goal ?? createGoalWithProcessMessage();
    const running: Goal = {
        ...goal,
        state: { ...goal.state, run: { ...goal.state.run, committedThroughSequence: options.boundary } },
    };
    const plan = await buildStepRequest(
        running,
        [],
        renderer,
        compactor,
        undefined,
        currentWorkingMemory,
        new TrajectoryModelContextAssembler({
            trajectoryStore: store,
            policy: createModelContextBudgetPolicy({ modelInputBudget: options.budget ?? 100_000 }),
        }),
        undefined,
        undefined,
        "strict",
        "decide",
        undefined,
        options.nativeIdentity ?? identity,
    );
    return plan.request;
}

function countByText(request: RenderedRequest, text: string): number {
    return request.messages.filter((message) => message.content === text).length;
}

test("已结算且实际选入请求的原生交换覆盖同源过程正文，正文只出现一次", async () => {
    const events = settledExchange();
    const request = await buildRequest({ events, boundary: events.length });

    // 原生 assistant 正文与已提交过程正文同源，只保留原生一份。
    assert.equal(countByText(request, PROCESS_BODY), 1);
    const toolIndex = request.messages.findIndex((message) => message.role === "tool");
    const assistantIndex = request.messages.findIndex((message) => message.content === PROCESS_BODY);
    assert.ok(toolIndex > 0);
    // 调用与结果保持相邻。
    assert.equal(toolIndex, assistantIndex + 1);
});

test("用户消息与独立答案即使同文也不被覆盖删除", async () => {
    const events = settledExchange();
    const request = await buildRequest({ events, boundary: events.length });

    assert.equal(countByText(request, SAME_TEXT), 2);
});

test("原生交换未结算时保留仍在对话预算内的过程正文", async () => {
    const events = settledExchange();
    const request = await buildRequest({ events, boundary: events.length - 1 });

    assert.equal(request.messages.filter((message) => message.role === "tool").length, 0);
    assert.equal(countByText(request, PROCESS_BODY), 1);
    assert.equal(countByText(request, SAME_TEXT), 2);
    // 没有原生交换时，过程正文仍在真实对话位置（意图之后）。
    const intentIndex = request.messages.findIndex((message) => message.content === INTENT);
    const processIndex = request.messages.findIndex((message) => message.content === PROCESS_BODY);
    assert.ok(intentIndex >= 0 && processIndex > intentIndex);
});

test("协议身份切换时保留过程正文", async () => {
    const events = settledExchange();
    const request = await buildRequest({ events, boundary: events.length, nativeIdentity: otherIdentity });

    assert.equal(request.messages.filter((message) => message.role === "tool").length, 0);
    assert.equal(countByText(request, PROCESS_BODY), 1);
    assert.equal(countByText(request, SAME_TEXT), 2);
});

test("原生交换被预算淘汰时保留过程正文", async () => {
    const events = settledExchange({ signature: "s".repeat(1_000_000) });
    const request = await buildRequest({ events, boundary: events.length, budget: 100_000 });

    assert.equal(request.messages.filter((message) => message.role === "tool").length, 0);
    assert.equal(countByText(request, PROCESS_BODY), 1);
    assert.equal(countByText(request, SAME_TEXT), 2);
});

test("没有对应原生交换的过程正文按来源保留", async () => {
    const request = await buildRequest({
        events: settledExchange(),
        boundary: settledExchange().length,
        goal: createGoalWithProcessMessage("call-other"),
    });

    assert.equal(countByText(request, PROCESS_BODY), 2);
    assert.equal(countByText(request, SAME_TEXT), 2);
});

test("文件存储重建后按已提交来源得到同样的最终请求", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-process-dedup-"));
    try {
        const events = settledExchange();
        const store = createInMemoryTrajectoryStore();
        for (const event of events) {
            const { eventId: _eventId, occurredAt: _occurredAt, sequence: _sequence, ...draft } = event;
            await store.append(draft as never);
        }
        const goalStore = new JsonFileGoalStore(join(directory, "goals"));
        await goalStore.save(createGoalWithProcessMessage());

        const rebuilt = new JsonFileGoalStore(join(directory, "goals"));
        const restored = await rebuilt.restore("dedup-goal");
        assert.ok(restored);
        const running: Goal = {
            ...restored,
            state: { ...restored.state, run: { ...restored.state.run, committedThroughSequence: events.length } },
        };
        const plan = await buildStepRequest(
            running,
            [],
            renderer,
            compactor,
            undefined,
            currentWorkingMemory,
            new TrajectoryModelContextAssembler({
                trajectoryStore: store,
                policy: createModelContextBudgetPolicy({ modelInputBudget: 100_000 }),
            }),
            undefined,
            undefined,
            "strict",
            "decide",
            undefined,
            identity,
        );

        assert.equal(plan.request.messages.filter((message) => message.content === PROCESS_BODY).length, 1);
        assert.equal(plan.request.messages.filter((message) => message.content === SAME_TEXT).length, 2);
        assert.equal(plan.request.messages.filter((message) => message.role === "tool").length, 1);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
