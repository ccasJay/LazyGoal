import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { BrowserGoalSessionPort } from "../../../packages/browser/src/browser-session-port";
import { createBrowserGoalRoutes, type BrowserGoalApiPort } from "../../../packages/browser/src/browser-goal-routes";
import type { LLMAdapter } from "../../../packages/llm-core/src/index";
import type { GoalModelSelection } from "../../../packages/runtime/src/domain";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";
import { TriggerStore } from "../../../packages/storage/src/trigger-store";
import { InMemoryToolRegistry } from "../../../packages/tool-core/src/index";
import { createTriggerBrowserSessionPort } from "../src/browser-session-port";
import type { RuntimeComposition } from "../src/runtime/index";
import {
    WorkerExecutionUnavailableError,
    WorkerGoalCreationRejectedError,
} from "../src/runtime/worker-execution-error";
import type { WorkerGoalCreationRequest } from "../src/runtime/worker-process";
import type { WorkerScheduler } from "../src/runtime/worker-scheduler";

const modelSelection: GoalModelSelection = {
    provider: "openai-compatible",
    modelId: "test-model",
    inputEstimator: { kind: "character-v1" },
};
const profile = {
    id: "default",
    name: "Creation errors",
    description: "Creation error classification profile",
    systemPrompt: "Follow the submitted instruction.",
    instructions: [],
    toolIds: [],
};

async function createHarness(createGoalFailure: Error): Promise<{
    readonly port: ReturnType<typeof createTriggerBrowserSessionPort>;
    readonly triggers: TriggerStore;
    readonly close: () => Promise<void>;
}> {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-creation-error-"));
    const dataDirectory = join(workspaceRoot, "data");
    await mkdir(dataDirectory, { recursive: true });
    const owner = new SupervisorOwnership(join(dataDirectory, "owner.db"));
    const triggers = new TriggerStore(join(dataDirectory, "triggers.db"));
    const goals = new JsonFileGoalStore(join(dataDirectory, "goals"));
    const root = {
        abortController: new AbortController(),
        adapter: {
            async generate() { throw new Error("Supervisor admission is not exercised by explicit browser work"); },
        } satisfies LLMAdapter,
        createSummaryAdapterForSelection: (): LLMAdapter => ({
            async generate() { return { blocks: [{ index: 0, type: "text", format: "plain", text: "Local creation" }] }; },
        }),
        workspaceRoot,
        dataDirectory,
        toolRegistry: new InMemoryToolRegistry(),
    } as unknown as RuntimeComposition;
    const scheduler = {
        async createGoal(request: WorkerGoalCreationRequest) {
            throw createGoalFailure;
        },
        async pump() { /* Worker dispatch is outside this test's boundary. */ },
    } as unknown as WorkerScheduler;
    return {
        port: createTriggerBrowserSessionPort({
            externalId: "browser-owner",
            root,
            owner,
            triggers,
            scheduler,
            goals,
            resolveModelSelection: async () => ({ ok: true, selection: modelSelection }),
        }),
        triggers,
        close: async () => {
            triggers.close();
            await owner.close();
            await rm(workspaceRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
        },
    };
}

async function captureStderr<T>(run: () => Promise<T>): Promise<{ readonly value: T; readonly diagnostics: readonly string[] }> {
    const original = process.stderr.write;
    const diagnostics: string[] = [];
    process.stderr.write = ((chunk: string | Uint8Array) => {
        diagnostics.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
        return true;
    }) as typeof process.stderr.write;
    try {
        return { value: await run(), diagnostics };
    } finally {
        process.stderr.write = original;
    }
}

test("Worker 启动失败归类为 execution_unavailable 并记录分类诊断", async () => {
    const failure = new WorkerExecutionUnavailableError("start", "Worker process exited before the identity handshake");
    const harness = await createHarness(failure);
    try {
        const { value: result, diagnostics } = await captureStderr(() =>
            harness.port.create({ goalId: "goal-unavailable", inputId: "input-unavailable", intent: "Wait for review.", modelId: "test-model" }));
        assert.deepEqual(result, { ok: false, error: "execution_unavailable" });
        assert.equal(harness.triggers.routeStatus("input-unavailable"), "unrouted");
        const report = diagnostics.join("");
        assert.match(report, /Goal creation could not reach local execution \(start\)/u);
        assert.match(report, /identity handshake/u);
        assert.doesNotMatch(report, /Workspace|data\/goals/u);
    } finally {
        await harness.close();
    }
});

test("Worker 拒绝构造 Goal 归类为 create_failed", async () => {
    const harness = await createHarness(new WorkerGoalCreationRejectedError("Worker Goal creation failed: creation-failed"));
    try {
        const { value: result } = await captureStderr(() =>
            harness.port.create({ goalId: "goal-rejected", inputId: "input-rejected", intent: "Wait for review.", modelId: "test-model" }));
        assert.deepEqual(result, { ok: false, error: "create_failed" });
    } finally {
        await harness.close();
    }
});

function createStubRoutes(error: "execution_unavailable" | "create_failed") {
    const session = {
        async create() { return { ok: false as const, error }; },
        async submit() { return { ok: false as const, error: "session_unavailable" as const }; },
        async readInput() { return { ok: true as const, found: false as const }; },
        async readState() { return undefined; },
        async openEvents() { return { ok: false as const, error: "goal_not_found" as const }; },
    } as unknown as BrowserGoalSessionPort;
    return createBrowserGoalRoutes({
        list: async () => ({ goals: [], unreadableCount: 0 }),
        read: async () => undefined,
        enterPlanMode: async () => ({ ok: false as const, error: "plan_mode_failed" as const }),
        models: async () => ({ ok: false as const, error: "model_catalog_unavailable" as const }),
        setModelPreference: async () => ({ ok: false as const, error: "model_catalog_unavailable" as const }),
        selectModel: async () => ({ ok: false as const, error: "model_selection_failed" as const }),
        session,
    } as unknown as BrowserGoalApiPort);
}

const createCommand = {
    goalId: "goal-status",
    inputId: "input-status",
    intent: "Wait for review.",
    modelId: "test-model",
};

test("执行不可用与内部创建失败在两个创建入口使用 503 与 500", async () => {
    const unavailable = createStubRoutes("execution_unavailable");
    const unavailableBody = JSON.stringify({ ...createCommand, kind: "create_session", intentId: "input-status" });
    const unavailableGoals = await unavailable.request("/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createCommand),
    });
    assert.equal(unavailableGoals.status, 503);
    assert.deepEqual(await unavailableGoals.json(), { error: "execution_unavailable" });
    const unavailableControl = await unavailable.request("/api/control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: unavailableBody,
    });
    assert.equal(unavailableControl.status, 503);
    assert.deepEqual(await unavailableControl.json(), { intentId: "input-status", status: "rejected", error: "execution_unavailable" });

    const failed = createStubRoutes("create_failed");
    const failedGoals = await failed.request("/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createCommand),
    });
    assert.equal(failedGoals.status, 500);
    assert.deepEqual(await failedGoals.json(), { error: "create_failed" });
    const failedControl = await failed.request("/api/control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: unavailableBody,
    });
    assert.equal(failedControl.status, 500);
    assert.deepEqual(await failedControl.json(), { intentId: "input-status", status: "rejected", error: "create_failed" });
});
