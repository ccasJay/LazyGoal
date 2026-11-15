import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LLMAdapter } from "../../../packages/llm-core/src/index";
import { createGoal } from "../../../packages/runtime/src/domain";
import { currentProtocols } from "../../../packages/runtime/test/current-fixtures";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";
import { TriggerStore } from "../../../packages/storage/src/trigger-store";
import { admitTrigger, resumeUnroutedWorkTrigger } from "../src/runtime/trigger-admission";
import { receiveAuthorizedTrigger } from "../../../packages/storage/src/trigger-ingress";
import { cancelTrigger, workTrigger } from "../../../packages/runtime/test/trigger-fixtures";

function mockAdapter(handler: LLMAdapter["generate"], structuredOutputMode: "strict" | "prompt_only" = "prompt_only"): LLMAdapter {
    return { structuredOutputMode, generate: handler };
}
function factory(intent: string, reserved: string | undefined, workspaceMode: "shared" | "worktree" = "shared") {
    return Promise.resolve({ goal: createGoal({ ...currentProtocols, id: reserved ?? `goal-${intent}`, runId: "run", intent,
        promptBundleVersion: 1, profile: { id: "profile", systemPrompt: "", instructions: [], toolIds: [] } }), authorization: { workspace: workspaceMode === "shared"
            ? { mode: "shared" as const, projectRoot: "/workspace", executionRoot: "/workspace" }
            : { mode: "worktree" as const, projectRoot: "/workspace", executionRoot: "/workspace/.worktrees/goal", branch: "lazygoal/goal-test", baseBranch: "main", baseCommit: "a".repeat(40) },
        toolIds: [] } });
}
const user = { role: "user", externalId: "test-actor", mayCreateGoal: true, goalIds: [] } as const;
const external = { role: "external", externalId: "test-actor", mayCreateGoal: true, goalIds: [] } as const;

test("explicit user work is accepted and control Trigger admission does not create a Goal", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-admission-"));
    try {
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const triggers = new TriggerStore(join(dir, "triggers.db"));
        const goals = new JsonFileGoalStore(join(dir, "goals"));
        const adapter = mockAdapter(async () => { throw new Error("unexpected model call"); });
        const trigger = workTrigger("work-1", "inspect");
        assert.deepEqual(await admitTrigger(owner, triggers, goals, adapter, trigger, user, factory), { kind: "accepted", goalId: "goal-inspect" });
        await assert.rejects(admitTrigger(owner, triggers, goals, adapter, trigger, user, factory), /Trigger identity conflict/);
        assert.equal(triggers.routeStatus(trigger.id), "routed");
        assert.deepEqual(triggers.queuedGoalIds(), ["goal-inspect"]);
        assert.deepEqual(triggers.goalQueueRecords().map((record) => record.triggerId), [trigger.id]);
        assert.deepEqual((await goals.restore("goal-inspect"))?.definition.triggerContext, {
            triggerId: trigger.id,
            authorization: { workspace: { mode: "shared", projectRoot: "/workspace", executionRoot: "/workspace" }, toolIds: [] },
        });

        const isolated = workTrigger("work-worktree", "change");
        const worktreeAdapter = mockAdapter(async () => ({ blocks: [{ index: 0, type: "text", format: "json", text: JSON.stringify({ kind: "accept", workspaceMode: "worktree" }) }] }), "strict");
        assert.deepEqual(await admitTrigger(owner, triggers, goals, worktreeAdapter, isolated, external, factory), { kind: "accepted", goalId: "goal-change" });
        assert.deepEqual((await goals.restore("goal-change"))?.definition.triggerContext?.authorization.workspace, {
            mode: "worktree", projectRoot: "/workspace", executionRoot: "/workspace/.worktrees/goal",
            branch: "lazygoal/goal-test", baseBranch: "main", baseCommit: "a".repeat(40),
        });

        const control = cancelTrigger("cancel-1", "goal-inspect", "run-goal-inspect");
        await assert.rejects(admitTrigger(owner, triggers, goals, adapter, control, { ...user, goalIds: ["goal-inspect"] }, factory), /requires a Supervisor-targeted work Trigger/);
        assert.equal(triggers.routeStatus(control.id), "unrouted");
        assert.deepEqual(triggers.queuedGoalIds(), ["goal-inspect", "goal-change"]);
        await owner.close();
        triggers.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("the Supervisor model can ignore or accept separate work Triggers in completion order", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-admission-"));
    try {
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const triggers = new TriggerStore(join(dir, "triggers.db"));
        const goals = new JsonFileGoalStore(join(dir, "goals"));
        let release!: () => void;
        const wait = new Promise<void>((resolve) => { release = resolve; });
        const adapter = mockAdapter(async (request) => {
            assert.ok(request.structuredOutput);
            const body = String(request.messages[1]?.content);
            if (body.includes("slow")) await wait;
            const decision = body.includes("ignore") ? { kind: "ignore", workspaceMode: null } : { kind: "accept", workspaceMode: "shared" };
            return { blocks: [{ index: 0, type: "text", format: "json", text: JSON.stringify(decision) }] };
        }, "strict");
        const trigger = (id: string) => workTrigger(`work-${id}`, id);
        const slowTrigger = trigger("slow");
        const slow = admitTrigger(owner, triggers, goals, adapter, slowTrigger, external, factory);
        const fastTrigger = trigger("fast");
        const fast = await admitTrigger(owner, triggers, goals, adapter, fastTrigger, external, factory);
        const ignoredTrigger = trigger("ignore");
        const ignored = await admitTrigger(owner, triggers, goals, adapter, ignoredTrigger, external, factory);
        assert.deepEqual(fast, { kind: "accepted", goalId: "goal-fast" });
        assert.deepEqual(ignored, { kind: "ignored" });
        release();
        assert.deepEqual(await slow, { kind: "accepted", goalId: "goal-slow" });
        assert.deepEqual(triggers.queuedGoalIds(), ["goal-fast", "goal-slow"]);
        assert.equal(triggers.routeStatus(ignoredTrigger.id), "routed");
        assert.deepEqual(triggers.unroutedTriggers(), []);
        await owner.close();
        triggers.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("failed admissions remain unrouted across restart while distinct Trigger IDs are independent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-admission-"));
    try {
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const path = join(dir, "triggers.db");
        let triggers = new TriggerStore(path);
        const goals = new JsonFileGoalStore(join(dir, "goals"));
        const failedTrigger = workTrigger("work-failed", "recover", { role: "external", externalId: "test-actor" });
        const fail = mockAdapter(async () => { throw new Error("private provider detail"); });
        assert.deepEqual(await admitTrigger(owner, triggers, goals, fail, failedTrigger, external, factory), { kind: "pending", reason: "model-failed" });
        assert.equal(triggers.routeStatus(failedTrigger.id), "unrouted");
        triggers.close();

        triggers = new TriggerStore(path);
        assert.equal(triggers.routeStatus(failedTrigger.id), "unrouted");
        assert.deepEqual(triggers.unroutedTriggers(), [failedTrigger]);
        const invalidTrigger = workTrigger("work-invalid", "invalid", { role: "external", externalId: "test-actor" });
        const invalid = mockAdapter(async () => ({ blocks: [{ index: 0, type: "text", format: "plain", text: '{"kind":"accept","workspaceMode":"shared","intent":"rewritten work"}' }] }));
        assert.deepEqual(await admitTrigger(owner, triggers, goals, invalid, invalidTrigger, external, factory), { kind: "pending", reason: "invalid-model-result" });
        const successTrigger = workTrigger("work-success", "recover", { role: "external", externalId: "test-actor" });
        const success = mockAdapter(async () => ({ blocks: [{ index: 0, type: "text", format: "plain", text: '{"kind":"accept","workspaceMode":"shared"}' }] }));
        assert.deepEqual(await admitTrigger(owner, triggers, goals, success, successTrigger, external, factory), { kind: "accepted", goalId: "goal-recover" });
        assert.equal(triggers.routeStatus(successTrigger.id), "routed");
        assert.deepEqual(triggers.queuedGoalIds(), ["goal-recover"]);
        assert.deepEqual(triggers.unroutedTriggers(), [failedTrigger, invalidTrigger]);
        await owner.close();
        triggers.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("持久化的手动创建来源在重启后决定准入，缺少来源的来源仍走模型准入", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-admission-"));
    try {
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const path = join(dir, "triggers.db");
        const goals = new JsonFileGoalStore(join(dir, "goals"));

        let triggers = new TriggerStore(path);
        const manual = workTrigger("work-manual", "resume");
        receiveAuthorizedTrigger(triggers, manual, user, "web-manual");
        assert.equal(triggers.goalOrigin(manual.id), "web-manual");
        const dispatched = workTrigger("work-dispatched", "dispatched");
        receiveAuthorizedTrigger(triggers, dispatched, external);
        assert.equal(triggers.goalOrigin(dispatched.id), undefined);
        triggers.close();

        triggers = new TriggerStore(path);
        const noModel = mockAdapter(async () => { throw new Error("unexpected model call"); });
        assert.deepEqual(await resumeUnroutedWorkTrigger(owner, triggers, goals, noModel, manual.id, factory),
            { kind: "accepted", goalId: "goal-resume" });

        let calls = 0;
        const accepting = mockAdapter(async () => {
            calls += 1;
            return { blocks: [{ index: 0, type: "text", format: "plain", text: '{"kind":"accept","workspaceMode":"shared"}' }] };
        });
        assert.deepEqual(await resumeUnroutedWorkTrigger(owner, triggers, goals, accepting, dispatched.id, factory),
            { kind: "accepted", goalId: "goal-dispatched" });
        assert.equal(calls, 1);
        await owner.close();
        triggers.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});
