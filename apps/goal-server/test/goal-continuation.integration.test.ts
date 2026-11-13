import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { LLMAdapter } from "../../../packages/llm-core/src/index";
import { createGoal, type Goal, type GoalModelSelection } from "../../../packages/runtime/src/domain";
import { transition } from "../../../packages/runtime/src/transition";
import { currentProtocols } from "../../../packages/runtime/test/current-fixtures";
import type { Trigger } from "../../../packages/runtime/src/trigger";
import { cancelTrigger, workTrigger } from "../../../packages/runtime/test/trigger-fixtures";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";
import { TriggerStore } from "../../../packages/storage/src/trigger-store";
import { createRuntimeComposition } from "../src/runtime/index";
import { WorkerScheduler } from "../src/runtime/index";

const EXTERNAL_ID = "continuation-actor";
const principal = { role: "user", externalId: EXTERNAL_ID, mayCreateGoal: false, goalIds: [] as readonly string[] } as const;

function chatChunk(delta: Record<string, unknown>, finishReason: string | null = null): Record<string, unknown> {
    return {
        id: "continuation-test",
        object: "chat.completion.chunk",
        created: 0,
        model: "test-model",
        choices: [{ index: 0, delta, finish_reason: finishReason }],
    };
}

function toolFrames(toolId: string, args: Record<string, unknown>, callId: string): string {
    return [
        { tool_calls: [{ index: 0, id: callId, type: "function", function: { name: toolId, arguments: JSON.stringify(args) } }] },
        {},
    ].map((delta, index) => `data: ${JSON.stringify(chatChunk(delta, index === 1 ? "tool_calls" : null))}\n\n`).join("")
        + "data: [DONE]\n\n";
}

async function waitFor(predicate: () => boolean | Promise<boolean>, message: string, timeoutMs = 30000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!(await predicate())) {
        if (Date.now() >= deadline) throw new Error(message);
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

type Terminal = "completed" | "failed" | "cancelled";

/**
 * 后继 Run 的模型调用保持挂起，用于证明回执先于模型完成返回。
 */
function suspendedModel(): {
    readonly server: ReturnType<typeof createServer>;
    readonly baseURL: () => string;
    readonly close: () => Promise<void>;
    readonly started: Promise<unknown>;
    readonly calls: () => number;
} {
    let calls = 0;
    let started!: (model: unknown) => void;
    const startedPromise = new Promise<unknown>((resolve) => { started = resolve; });
    const server = createServer((request, response) => {
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => { body += chunk; });
        request.on("end", () => {
            calls += 1;
            started(JSON.parse(body).model);
            response.writeHead(200, { "content-type": "text/event-stream" });
            response.flushHeaders();
        });
    });
    return {
        server,
        baseURL: () => {
            const address = server.address();
            assert.ok(address !== null && typeof address !== "string");
            return `http://127.0.0.1:${address.port}/v1`;
        },
        close: async () => {
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
        },
        started: startedPromise,
        calls: () => calls,
    };
}

function terminalGoal(goalId: string, terminal: Terminal, workspaceRoot: string, modelSelection: GoalModelSelection): Goal {
    const created = createGoal({ ...currentProtocols, id: goalId, intent: "Complete the requested work", runId: `run-${goalId}`,
        promptBundleVersion: 1, modelSelection, profile: { id: "default", systemPrompt: "Test", instructions: ["Complete the work."], toolIds: [] } });
    const started = transition(created.state.run, { kind: "start" });
    if (!started.ok) throw new Error("Could not start the fixture Run");
    const ended = terminal === "completed"
        ? transition(started.state, { kind: "decision", decision: { kind: "complete", summary: "Fixture complete", evidenceSequences: [] } })
        : terminal === "failed"
            ? transition(started.state, { kind: "execution_error", code: "INVALID_AGENT_DECISION", message: "Fixture failure" })
            : transition(started.state, { kind: "cancel" });
    if (!ended.ok) throw new Error(`Could not reach ${terminal}`);
    return {
        ...created,
        state: { ...created.state, run: { ...ended.state, status: terminal } },
        definition: {
            ...created.definition,
            triggerContext: {
                triggerId: `work-${goalId}`,
                authorization: {
                    workspace: { mode: "shared", projectRoot: workspaceRoot, executionRoot: workspaceRoot },
                    toolIds: [],
                    sandbox: { extraFiles: [], network: "none" },
                },
            },
        },
    };
}

function terminalReply(triggers: TriggerStore, goalId: string, runId: string): string {
    const reply = triggers.listGoalTriggers(goalId).filter((trigger) => trigger.type === "response"
        && "runId" in trigger.payload && trigger.payload.runId === runId
        && (trigger.payload.action === "completed" || trigger.payload.action === "failed" || trigger.payload.action === "cancelled"))
        .at(-1);
    assert.ok(reply !== undefined, `terminal response for ${runId} is missing`);
    return reply.id;
}

function continuationTrigger(inputId: string, goalId: string, runId: string, content: string, replyTo: string): Trigger {
    return {
        id: inputId,
        name: "Continue goal",
        type: "instruction",
        source: { role: "external", externalId: EXTERNAL_ID },
        target: "supervisor",
        goalId,
        replyTo,
        payload: { action: "continue", runId, content },
        sentAt: new Date().toISOString(),
    };
}

async function prepare(terminal: Terminal) {
    const root = await mkdtemp(join(tmpdir(), `lazygoal-continuation-${terminal}-`));
    const workspace = join(root, "workspace");
    const home = join(root, "home");
    const dataDirectory = join(root, "data");
    await Promise.all([
        mkdir(workspace, { recursive: true }),
        mkdir(join(home, "agent-profiles"), { recursive: true }),
        mkdir(dataDirectory, { recursive: true }),
    ]);
    const profile = {
        id: "default",
        name: "Continuation",
        description: "Continuation integration profile",
        systemPrompt: "Follow the test instruction.",
        instructions: ["Complete the work."],
        toolIds: [],
    };
    await writeFile(join(home, "agent-profiles", "default.json"), JSON.stringify({ schemaVersion: 1, ...profile }));
    const model = suspendedModel();
    await new Promise<void>((resolve) => model.server.listen(0, "127.0.0.1", resolve));
    const env = {
        LAZYGOAL_HOME: home,
        LLM_PROVIDER: "openai-compatible",
        LLM_MODEL: "test-model",
        LLM_API_KEY: "test-key",
        LLM_BASE_URL: model.baseURL(),
        LLM_CONTEXT_WINDOW_TOKENS: "16000",
        LLM_MAX_OUTPUT_TOKENS: "4096",
        LLM_TOKENIZER_ENCODING: "cl100k_base",
    } as NodeJS.ProcessEnv;
    const goals = new JsonFileGoalStore(join(dataDirectory, "goals"));
    const supervisorAdapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        async generate() { return { blocks: [{ index: 0, type: "text", format: "json", text: JSON.stringify({ name: "Continue work" }) }] }; },
    };
    const composition = await createRuntimeComposition({
        cwd: workspace,
        dataDirectory,
        env,
        profile,
        adapter: supervisorAdapter,
        adapterFactory: () => supervisorAdapter,
        goalStore: goals,
    });
    const owner = new SupervisorOwnership(join(dataDirectory, "supervisor-owner.db"));
    const triggers = new TriggerStore(join(dataDirectory, "triggers.db"));
    const scheduler = new WorkerScheduler({
        owner,
        triggers,
        goals,
        cwd: workspace,
        dataDirectory,
        env,
        permissionAdapter: supervisorAdapter,
        commitContinuation: ({ goalId, runId, inputId, content }) =>
            composition.commands.commitContinuation({ goalId, runId }, content, inputId),
    });

    const goalId = `goal-${terminal}`;
    const goal = terminalGoal(goalId, terminal, workspace, composition.defaultModelSelection);
    await goals.save(goal);
    const work = workTrigger(`work-${goalId}`, "Complete the requested work", { role: "external", externalId: EXTERNAL_ID });
    triggers.receive(work, "web-manual");
    triggers.reserveGoal(work.id, goalId);
    triggers.freezeGoal(work.id, goal);
    triggers.acceptGoal(work.id);
    assert.equal(await triggers.claimNextGoal(owner, "worker-run1", "generation-run1"), goalId);
    await triggers.markWorkerGoalStatus(owner, "worker-run1", "generation-run1", goalId, "terminal");
    const reply: Trigger = {
        id: `response-${goalId}-${terminal}`,
        name: `Goal ${terminal}`,
        type: "response",
        source: { role: "worker", workerId: "worker-run1", generation: "generation-run1" },
        target: "supervisor",
        goalId,
        replyTo: work.id,
        payload: terminal === "completed"
            ? { action: "completed", runId: goal.state.run.id, answer: "Fixture complete" }
            : { action: terminal, runId: goal.state.run.id },
        sentAt: new Date().toISOString(),
    } as Trigger;
    triggers.receive(reply);
    triggers.markRouted(reply.id);
    return { composition, owner, triggers, goals, scheduler, model, goalId, goal, workspace, dataDirectory };
}

for (const terminal of ["completed", "failed", "cancelled"] as const) {
    test(`手动 Goal 在 ${terminal} 终态后于同一 Goal 续接下一 Run 并只追加一次输入`, { timeout: 60_000 }, async () => {
        const { composition, owner, triggers, goals, scheduler, model, goalId, goal } = await prepare(terminal);
        try {
            const previousRunId = goal.state.run.id;
            const selectedModel = "next-run-model";
            const selection = await composition.goalModelSelectionCoordinator.updateModelSelection({
                ref: { goalId, runId: previousRunId },
                selection: { ...goal.state.modelSelection, modelId: selectedModel },
            });
            assert.equal(selection.ok, true);
            const input = `Continue after ${terminal}`;
            const trigger = continuationTrigger(`continue-${terminal}`, goalId, previousRunId, input, terminalReply(triggers, goalId, previousRunId));

            const result = await scheduler.handleContinueTrigger(trigger, { ...principal, goalIds: [goalId] });
            assert.equal(result.kind, "accepted");
            if (result.kind !== "accepted") return;

            // 回执：新 Run 已提交，正文只追加一次，历史保留原终态。
            const committed = await goals.restore(goalId);
            assert.ok(committed !== undefined);
            assert.equal(committed.id, goalId);
            assert.notEqual(committed.state.run.id, previousRunId);
            assert.equal(committed.state.run.id, result.runId);
            assert.equal(committed.state.messages.filter((message) => message.content === input).length, 1);
            assert.equal(committed.state.completedRuns?.[0]?.runId, previousRunId);
            assert.equal(committed.state.completedRuns?.[0]?.status, terminal);
            assert.equal(triggers.continuationForTrigger(trigger.id)?.appliedRunId, result.runId);
            assert.equal(triggers.routeStatus(trigger.id), "routed");

            // 同一终态不再接受第二个不同身份。
            const second = continuationTrigger(`continue-again-${terminal}`, goalId, previousRunId, "Second attempt",
                terminalReply(triggers, goalId, previousRunId));
            const rejected = await scheduler.handleContinueTrigger(second, { ...principal, goalIds: [goalId] });
            assert.equal(rejected.kind, "rejected");
            const unchanged = await goals.restore(goalId);
            assert.equal(unchanged?.state.run.id, result.runId);
            assert.equal(unchanged?.state.messages.filter((message) => message.content === "Second attempt").length, 0);

            // 真实 Worker 派发后继 Run；模型挂起期间已能读到上面的收据。
            assert.equal(await model.started, selectedModel);
            assert.deepEqual(scheduler.assignments().map((assignment) => assignment.goalId), [goalId]);
            await waitFor(() => triggers.queueRecord(goalId)?.status === "claimed", "Successor Run was not claimed");

            // 用真实取消收敛后继 Run，避免依赖完成决策的语义。
            const cancel = cancelTrigger(`cancel-successor-${terminal}`, goalId, result.runId,
                { role: "external", externalId: EXTERNAL_ID });
            await scheduler.handleCancelTrigger(cancel, { ...principal, goalIds: [goalId] });
            await waitFor(async () => {
                const current = await goals.restore(goalId);
                return current?.state.run.status === "cancelled" && triggers.queueRecord(goalId)?.status === "terminal";
            }, "Successor Run did not settle after cancellation");

            const after = await goals.restore(goalId);
            assert.ok(after !== undefined);
            assert.equal(after.id, goalId);
            assert.equal(after.state.messages.filter((message) => message.content === input).length, 1);
            assert.deepEqual(after.state.completedRuns?.map((record) => record.runId), [previousRunId]);
            assert.equal(after.state.run.status, "cancelled");
            assert.equal(triggers.routeStatus(second.id), "routed");
        } finally {
            await scheduler.detachAll().catch(() => undefined);
            await model.close();
            await composition.resources.closeAll().catch(() => undefined);
            triggers.close();
            await owner.close();
        }
    });
}
