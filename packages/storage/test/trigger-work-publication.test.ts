import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGoal } from "../../runtime/src/domain";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import { SupervisorOwnership } from "../src/supervisor-ownership";
import { JsonFileGoalStore } from "../src/goal-store";
import { TriggerStore } from "../src/trigger-store";
import { publishAuthorizedWork } from "../src/trigger-work-publication";
import { publishTriggerGoal } from "../src/trigger-goal-publication";
import { workTrigger } from "../../runtime/test/trigger-fixtures";

function goal(id: string) {
    return createGoal({ ...currentProtocols, id, runId: `run-${id}`, intent: "work", promptBundleVersion: 1,
        profile: { id: "profile", systemPrompt: "", instructions: [], toolIds: [] } });
}

test("different direct work Triggers can publish duplicate work as separate Goals", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-work-publication-"));
    try {
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const triggers = new TriggerStore(join(dir, "triggers.db"));
        const goals = new JsonFileGoalStore(join(dir, "goals"));
        const principal = { role: "user", externalId: "test-actor", mayCreateGoal: true, goalIds: [] } as const;
        const firstTrigger = workTrigger("work-trigger-1", "same requested work");
        const secondTrigger = workTrigger("work-trigger-2", "same requested work");
        let factoryCalls = 0;
        const create = async (reservedGoalId: string | undefined) => {
            assert.equal(reservedGoalId, undefined);
            factoryCalls += 1;
            return goal(`goal-${factoryCalls}`);
        };

        const first = await publishAuthorizedWork(owner, triggers, goals, firstTrigger, principal, create);
        const second = await publishAuthorizedWork(owner, triggers, goals, secondTrigger, principal, create);
        assert.deepEqual(first, { kind: "accepted", goalId: "goal-1" });
        assert.deepEqual(second, { kind: "accepted", goalId: "goal-2" });
        assert.equal(factoryCalls, 2);
        assert.deepEqual(triggers.goalQueueRecords().map((record) => record.triggerId), [firstTrigger.id, secondTrigger.id]);
        assert.equal(triggers.routeStatus(firstTrigger.id), "routed");
        assert.equal(triggers.routeStatus(secondTrigger.id), "routed");
        assert.deepEqual(triggers.unroutedTriggers(), []);
        assert.deepEqual((await goals.restore("goal-1"))?.id, "goal-1");
        assert.deepEqual((await goals.restore("goal-2"))?.id, "goal-2");

        await assert.rejects(publishAuthorizedWork(owner, triggers, goals, firstTrigger, principal, create), /Trigger identity conflict/);
        assert.equal(factoryCalls, 2);
        const forged = workTrigger("forged-trigger", "work", { role: "supervisor" });
        await assert.rejects(publishAuthorizedWork(owner, triggers, goals, forged, principal, create), /source/);
        assert.equal(triggers.routeStatus(forged.id), undefined);
        await owner.close();
        triggers.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a frozen Goal reservation is published after reopening without receiving the Trigger again", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-work-recovery-"));
    try {
        const path = join(dir, "triggers.db");
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const first = new TriggerStore(path);
        const trigger = workTrigger("reserved-work-trigger");
        first.receive(trigger);
        first.reserveGoal(trigger.id, "reserved-goal");
        first.freezeGoal(trigger.id, goal("reserved-goal"));
        first.close();

        const reopened = new TriggerStore(path);
        assert.equal(reopened.routeStatus(trigger.id), "unrouted");
        assert.equal(reopened.reservedGoal(trigger.id), "reserved-goal");
        assert.equal(reopened.frozenGoal(trigger.id)?.id, "reserved-goal");
        const result = await publishTriggerGoal(owner, reopened, new JsonFileGoalStore(join(dir, "goals")), trigger.id);
        assert.deepEqual(result, { kind: "accepted", goalId: "reserved-goal" });
        assert.equal(reopened.routeStatus(trigger.id), "routed");
        assert.deepEqual(reopened.unroutedTriggers(), []);
        assert.deepEqual(reopened.goalQueueRecords().map((record) => record.triggerId), [trigger.id]);
        await owner.close();
        reopened.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});
