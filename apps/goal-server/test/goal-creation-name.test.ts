import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { LLMAdapter, LLMContentBlock } from "../../../packages/llm-core/src/index";
import { createGoal, type GoalModelSelection, type RunMode } from "../../../packages/runtime/src/domain";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";
import { TriggerStore } from "../../../packages/storage/src/trigger-store";
import { InMemoryToolRegistry } from "../../../packages/tool-core/src/index";
import { createTriggerBrowserSessionPort } from "../src/browser-session-port";
import type { RuntimeComposition } from "../src/runtime/index";
import {
    DEFAULT_TRIGGER_NAME_TIMEOUT_MS,
    MAX_TRIGGER_NAME_LENGTH,
    deriveTriggerName,
    summarizeTriggerName,
} from "../src/runtime/trigger-name";
import type { WorkerGoalCreationRequest } from "../src/runtime/worker-process";
import type { WorkerScheduler } from "../src/runtime/worker-scheduler";

const modelSelection: GoalModelSelection = {
    provider: "openai-compatible",
    modelId: "test-model",
    inputEstimator: { kind: "character-v1" },
};
const profile = {
    id: "default",
    name: "Naming",
    description: "Naming behavior profile",
    systemPrompt: "Follow the submitted instruction.",
    instructions: [],
    toolIds: [],
};

function textResponse(...texts: readonly string[]): { blocks: readonly LLMContentBlock[] } {
    return {
        blocks: texts.map((text, index) => ({ index, type: "text" as const, format: "plain" as const, text })),
    };
}

function recordingAdapter(
    respond: (request: Parameters<LLMAdapter["generate"]>[0]) => ReturnType<LLMAdapter["generate"]>,
): { readonly adapter: LLMAdapter; readonly requests: Parameters<LLMAdapter["generate"]>[0][] } {
    const requests: Parameters<LLMAdapter["generate"]>[0][] = [];
    return {
        requests,
        adapter: {
            structuredOutputMode: "prompt_only",
            async generate(request) {
                requests.push(request);
                return respond(request);
            },
        },
    };
}

interface CreationHarness {
    readonly port: ReturnType<typeof createTriggerBrowserSessionPort>;
    readonly triggers: TriggerStore;
    readonly goals: JsonFileGoalStore;
    readonly close: () => Promise<void>;
}

async function createHarness(summaryAdapter: LLMAdapter): Promise<CreationHarness> {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-creation-name-"));
    const dataDirectory = join(workspaceRoot, "data");
    await mkdir(dataDirectory, { recursive: true });
    const owner = new SupervisorOwnership(join(dataDirectory, "owner.db"));
    const triggers = new TriggerStore(join(dataDirectory, "triggers.db"));
    const goals = new JsonFileGoalStore(join(dataDirectory, "goals"));
    const root = {
        abortController: new AbortController(),
        adapter: {
            structuredOutputMode: "prompt_only",
            async generate() { throw new Error("Supervisor admission is not exercised by explicit browser work"); },
        } satisfies LLMAdapter,
        createSummaryAdapterForSelection: () => summaryAdapter,
        workspaceRoot,
        dataDirectory,
        toolRegistry: new InMemoryToolRegistry(),
    } as unknown as RuntimeComposition;
    const scheduler = {
        async createGoal(request: WorkerGoalCreationRequest) {
            return createGoal({
                id: request.goalId,
                intent: request.intent,
                runId: `run-${request.goalId}`,
                profile,
                modelSelection: request.modelSelection ?? modelSelection,
                promptBundleVersion: 1,
                memoryProtocol: { kind: "structured", version: 1 },
                modelContextProtocol: { kind: "trajectory-layered", version: 1 },
                contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
                mode: request.mode as RunMode,
            });
        },
        async pump() { /* Worker dispatch is outside this test's boundary. */ },
    } as unknown as WorkerScheduler;
    const port = createTriggerBrowserSessionPort({
        externalId: "browser-owner",
        root,
        owner,
        triggers,
        scheduler,
        goals,
        resolveModelSelection: async () => ({ ok: true, selection: modelSelection }),
    });
    return {
        port,
        triggers,
        goals,
        close: async () => {
            triggers.close();
            await owner.close();
            await rm(workspaceRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
        },
    };
}

const intent = "Rename the dependency manifest entries.";

test("名称派生去掉控制字符、围栏与引号并折叠空白", () => {
    assert.equal(deriveTriggerName("```text\nRename dependency\n```"), "Rename dependency");
    assert.equal(deriveTriggerName("   \"Quoted   label\"  "), "Quoted label");
    assert.equal(deriveTriggerName("First\u0007 line\nSecond line"), "First line");
    assert.equal(deriveTriggerName("\n\n   \n"), "New goal");
    assert.equal(deriveTriggerName(""), "New goal");
    assert.equal(Array.from(deriveTriggerName("x".repeat(MAX_TRIGGER_NAME_LENGTH + 40))).length, MAX_TRIGGER_NAME_LENGTH);
});

test("名称摘要请求纯文本标签且不携带结构化输出", async () => {
    const { adapter, requests } = recordingAdapter(async () => textResponse("Rename manifest entries"));
    const name = await summarizeTriggerName(adapter, intent, "goal-name", { maxOutputTokens: 4_096 });
    assert.equal(name, "Rename manifest entries");
    assert.equal(requests.length, 1);
    const request = requests[0]!;
    assert.equal(request.structuredOutput, undefined);
    assert.equal(request.toolChoice, "none");
    assert.equal(request.tools, undefined);
    assert.equal(request.sessionId, "goal-name");
    assert.equal(request.maxOutputTokens, 256);
    assert.equal(request.messages[0]?.role, "system");
    assert.match(String(request.messages[0]?.content), /plain text/i);
    assert.deepEqual(request.messages[1], { role: "user", content: intent });
});

test("名称摘要的异常、空正文与超时都回退本地名称", async () => {
    const empty = recordingAdapter(async () => ({ blocks: [] }));
    assert.equal(await summarizeTriggerName(empty.adapter, intent, "goal-empty"), deriveTriggerName(intent));

    const reasoningOnly = recordingAdapter(async () => ({
        blocks: [{ index: 0, type: "reasoning", text: "The user wants a rename." }],
    }));
    assert.equal(await summarizeTriggerName(reasoningOnly.adapter, intent, "goal-reasoning"), deriveTriggerName(intent));

    const throwing = recordingAdapter(async () => { throw new Error("Injected summary failure"); });
    assert.equal(await summarizeTriggerName(throwing.adapter, intent, "goal-throw"), deriveTriggerName(intent));

    const hanging: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        generate: () => new Promise(() => { /* Never settles, ignoring the abort signal. */ }),
    };
    const startedAt = Date.now();
    const name = await summarizeTriggerName(hanging, intent, "goal-hang", { timeoutMs: 25 });
    assert.equal(name, deriveTriggerName(intent));
    assert.ok(Date.now() - startedAt < 1_000, "Summary must stop waiting at the configured limit");
    assert.equal(DEFAULT_TRIGGER_NAME_TIMEOUT_MS, 5_000);
});

test("名称摘要清洗围栏与超长模型输出并截断到上限", async () => {
    const fenced = recordingAdapter(async () => textResponse("```text\nRename manifest entries\n```"));
    assert.equal(await summarizeTriggerName(fenced.adapter, intent, "goal-fenced"), "Rename manifest entries");

    const overlong = recordingAdapter(async () => textResponse("y".repeat(400)));
    const name = await summarizeTriggerName(overlong.adapter, intent, "goal-long");
    assert.equal(Array.from(name).length, MAX_TRIGGER_NAME_LENGTH);
    assert.match(name, /^y+$/);
});

test("创建 Goal 在名称摘要为空、仅 reasoning、围栏、超长与抛错时仍然成功", async (context) => {
    const cases: readonly {
        readonly label: string;
        readonly respond: () => ReturnType<LLMAdapter["generate"]>;
        readonly expected: string;
    }[] = [
        { label: "empty", respond: async () => ({ blocks: [] }), expected: deriveTriggerName(intent) },
        {
            label: "reasoning-only",
            respond: async () => ({ blocks: [{ index: 0, type: "reasoning", text: "Rename it" }] }),
            expected: deriveTriggerName(intent),
        },
        { label: "fenced", respond: async () => textResponse("```\nRename manifest entries\n```"), expected: "Rename manifest entries" },
        {
            label: "overlong",
            respond: async () => textResponse("z".repeat(400)),
            expected: "z".repeat(MAX_TRIGGER_NAME_LENGTH),
        },
        { label: "throw", respond: async () => { throw new Error("Injected summary failure"); }, expected: deriveTriggerName(intent) },
    ];
    for (const testCase of cases) {
        await context.test(testCase.label, async () => {
            const harness = await createHarness({ structuredOutputMode: "prompt_only", generate: testCase.respond });
            try {
                const goalId = `goal-name-${testCase.label}`;
                const result = await harness.port.create({ goalId, inputId: `input-name-${testCase.label}`, intent, modelId: modelSelection.modelId });
                assert.equal(result.ok, true, JSON.stringify(result));
                if (!result.ok) return;
                assert.equal(result.goalId, goalId);
                const trigger = harness.triggers.read(`input-name-${testCase.label}`);
                assert.ok(trigger !== undefined);
                assert.equal(trigger.name, testCase.expected);
                assert.equal(trigger.name.length > 0, true);
                assert.deepEqual(trigger.payload, { action: "submitted", material: { kind: "text", text: intent } });
                const goal = await harness.goals.restore(goalId);
                assert.ok(goal !== undefined);
                assert.equal(goal.definition.intent, intent);
            } finally {
                await harness.close();
            }
        });
    }
});
