import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGoal } from "../../../packages/runtime/src/domain";
import { transition } from "../../../packages/runtime/src/transition";
import { currentProtocols } from "../../../packages/runtime/test/current-fixtures";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";
import { TriggerDeliveryStore } from "../../../packages/storage/src/trigger-delivery-store";
import { admitTrigger } from "../src/runtime/trigger-admission";
import { WorkerScheduler } from "../src/runtime/worker-scheduler";

const never = { structuredOutputMode: "prompt_only" as const, async generate() { throw new Error("Waiting Goals must not call a model"); } };
const principal = { role: "user", mayCreateGoal: true, goalIds: [] } as const;

function createWaitingGoal(id: string, intent: string, workspaceRoot: string) {
    const goal = createGoal({ ...currentProtocols, id, intent, runId: `run-${id}`, promptBundleVersion: 1,
        profile: { id: "default", systemPrompt: "test", instructions: ["test"], toolIds: [] } });
    const started = transition(goal.state.run, { kind: "start" });
    assert.equal(started.ok, true);
    const waiting = transition(started.state, { kind: "decision", decision: { kind: "wait", reason: "Supervisor input" } });
    assert.equal(waiting.ok, true);
    return {
        goal: { ...goal, state: { ...goal.state, run: waiting.state } },
        authorization: { workspaceRoot, toolIds: [], sandbox: { extraFiles: [], network: "none" as const } },
    };
}

function createFailedRun(goal: Awaited<ReturnType<typeof createWaitingGoal>>["goal"]) {
    const baseline = createGoal({ ...currentProtocols, id: goal.id, intent: goal.definition.intent, runId: goal.state.run.id,
        promptBundleVersion: 1, profile: goal.definition.profile });
    const started = transition(baseline.state.run, { kind: "start" });
    assert.equal(started.ok, true);
    const failed = transition(started.state, { kind: "decision", decision: { kind: "fail", error: "test terminal" } });
    assert.equal(failed.ok, true);
    return { ...goal, state: { ...goal.state, run: failed.state } };
}

async function waitFor(predicate: () => boolean, timeoutMs = 10000): Promise<void> {
    const end = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() >= end) throw new Error("Timed out waiting for Worker scheduler state");
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

test("FIFO 派发让不同 Goal 并行，等待绑定保留，终态后复用匹配 Worker", async () => {
    const root = await mkdtemp(join(tmpdir(), "lg-worker-scheduler-"));
    const workspace = join(root, "workspace");
    const home = join(root, "home");
    const dataDirectory = join(root, "data");
    await Promise.all([mkdir(workspace, { recursive: true }), mkdir(join(home, "agent-profiles"), { recursive: true }), mkdir(dataDirectory, { recursive: true })]);
    await writeFile(join(home, "agent-profiles", "default.json"), JSON.stringify({ schemaVersion: 1, id: "default", name: "Test", description: "Test", systemPrompt: "Test", instructions: ["Test"], toolIds: [] }));
    const env = { LAZYGOAL_HOME: home, LLM_PROVIDER: "openai", LLM_MODEL: "gpt-4o-mini", LLM_API_KEY: "test" } as NodeJS.ProcessEnv;
    const owner = new SupervisorOwnership(join(dataDirectory, "owner.db"));
    const deliveries = new TriggerDeliveryStore(join(dataDirectory, "deliveries.db"));
    const goals = new JsonFileGoalStore(join(dataDirectory, "goals"));
    const factory = async (intent: string, reserved: string | undefined) => createWaitingGoal(reserved ?? `goal-${intent}`, intent, workspace);
    const event = (suffix: string) => ({ deliveryId: `delivery-${suffix}`, trigger: { id: `trigger-${suffix}`, purpose: "work", source: "user", payload: JSON.stringify({ intent: `goal-${suffix}` }) } });
    const acceptedIds: string[] = [];
    const scheduler = new WorkerScheduler({ owner, deliveries, goals, cwd: workspace, dataDirectory, env });
    try {
        for (const suffix of ["a", "b"]) {
            const result = await admitTrigger(owner, deliveries, goals, never, event(suffix), principal, factory);
            assert.equal(result.kind, "settled");
            if (result.kind === "settled" && result.receipt.result.kind === "accepted") acceptedIds.push(result.receipt.result.goalId);
        }
        await scheduler.pump();
        await waitFor(() => acceptedIds.every((goalId) => deliveries.queueRecord(goalId)?.status === "waiting"));
        const records = acceptedIds.map((goalId) => deliveries.queueRecord(goalId)!);
        assert.ok(records[0]!.sequence < records[1]!.sequence);
        assert.deepEqual(records.map((item) => item.status), ["waiting", "waiting"]);
        assert.notEqual(records[0]!.workerId, records[1]!.workerId);
        const pids = await scheduler.processIds();
        assert.equal(new Set(pids.map((item) => item.pid)).size, 2);
        assert.deepEqual(scheduler.assignments().map((item) => item.goalId).sort(), [...acceptedIds].sort());

        await goals.save(createFailedRun((await goals.restore(acceptedIds[0]!))!));
        const firstTerminal = await scheduler.advanceGoal(acceptedIds[0]!);
        assert.equal(firstTerminal.kind, "terminal");
        assert.equal(deliveries.queueRecord(acceptedIds[0]!)?.status, "terminal");

        const third = await admitTrigger(owner, deliveries, goals, never, event("c"), principal, factory);
        assert.equal(third.kind, "settled");
        assert.ok(third.kind === "settled" && third.receipt.result.kind === "accepted");
        const thirdGoalId = third.kind === "settled" && third.receipt.result.kind === "accepted" ? third.receipt.result.goalId : "";
        await scheduler.pump();
        await waitFor(() => deliveries.queueRecord(thirdGoalId)?.status === "waiting");
        assert.equal(deliveries.queueRecord(thirdGoalId)?.workerId, records[0]!.workerId);

        for (const goalId of [acceptedIds[1]!, thirdGoalId]) {
            await goals.save(createFailedRun((await goals.restore(goalId))!));
            assert.equal((await scheduler.advanceGoal(goalId)).kind, "terminal");
        }
        await scheduler.closeIdle();
    } finally {
        await scheduler.closeIdle().catch(() => undefined);
        deliveries.close();
        await owner.close();
        await rm(root, { recursive: true, force: true });
    }
});
