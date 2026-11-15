import test from "node:test";
import assert from "node:assert/strict";
import { link, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createGoal } from "../../runtime/src/domain";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import { SupervisorOwnership } from "../src/supervisor-ownership";
import { goalDirectory, goalSnapshotPath } from "../src/index";
import { JsonFileGoalStore } from "../src/goal-store";
import { TriggerStore } from "../src/trigger-store";
import { workTrigger } from "../../runtime/test/trigger-fixtures";
import { publishTriggerGoal } from "../src/trigger-goal-publication";

function goal(id: string) {
    return createGoal({ ...currentProtocols, id, runId: `run-${id}`, intent: "work", promptBundleVersion: 1,
        profile: { id: "profile", systemPrompt: "", instructions: [], toolIds: [] } });
}

test("a stored work Trigger resumes Goal publication after the response is lost", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-publication-"));
    try {
        const path = join(dir, "triggers.db");
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const triggers = new TriggerStore(path);
        const trigger = workTrigger("work-1");
        triggers.receive(trigger);
        triggers.reserveGoal(trigger.id, "goal-1");
        triggers.freezeGoal(trigger.id, goal("goal-1"));
        let links = 0;
        const interrupted = new JsonFileGoalStore(dir, { link: async (source, target) => {
            await link(source, target);
            if (++links === 2) throw new Error("lost publication response");
        } });
        await assert.rejects(publishTriggerGoal(owner, triggers, interrupted, trigger.id), /lost publication response/);
        assert.equal(triggers.routeStatus(trigger.id), "unrouted");
        assert.deepEqual(triggers.queuedGoalIds(), []);
        triggers.close();

        const reopened = new TriggerStore(path);
        const result = await publishTriggerGoal(owner, reopened, new JsonFileGoalStore(dir), trigger.id);
        assert.deepEqual(result, { kind: "accepted", goalId: "goal-1" });
        assert.equal(reopened.routeStatus(trigger.id), "routed");
        assert.deepEqual(reopened.unroutedTriggers(), []);
        assert.deepEqual(reopened.goalQueueRecords().map((record) => record.triggerId), [trigger.id]);
        assert.equal((await new JsonFileGoalStore(dir).restore("goal-1"))?.id, "goal-1");
        reopened.close();
        await owner.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("an occupied unreadable Goal ID is rejected without changing its file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-publication-"));
    try {
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const triggers = new TriggerStore(join(dir, "triggers.db"));
        const trigger = workTrigger("work-1");
        triggers.receive(trigger);
        triggers.reserveGoal(trigger.id, "goal-1");
        triggers.freezeGoal(trigger.id, goal("goal-1"));
        const path = goalSnapshotPath(dir, "goal-1");
        await mkdir(goalDirectory(dir, "goal-1"), { recursive: true });
        await writeFile(path, "unreadable snapshot");
        const result = await publishTriggerGoal(owner, triggers, new JsonFileGoalStore(dir), trigger.id);
        assert.deepEqual(result, { kind: "rejected", reason: "goal-id-conflict", goalId: "goal-1" });
        assert.equal(await readFile(path, "utf8"), "unreadable snapshot");
        assert.equal(triggers.routeStatus(trigger.id), "routed");
        assert.deepEqual(triggers.queuedGoalIds(), []);
        assert.deepEqual(triggers.unroutedTriggers(), []);
        triggers.close();
        await owner.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("route and FIFO queue survive a cleanup failure and do not replay a result", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-publication-"));
    try {
        const path = join(dir, "triggers.db");
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const triggers = new TriggerStore(path);
        const trigger = workTrigger("work-1");
        triggers.receive(trigger);
        triggers.reserveGoal(trigger.id, "goal-1");
        triggers.freezeGoal(trigger.id, goal("goal-1"));
        const failingCleanup = new JsonFileGoalStore(dir, {
            unlink: async (file) => {
                if (String(file).includes(".trigger-create-") && !String(file).match(/\.tmp\..*\.tmp$/)) throw new Error("cleanup failed");
                const fs = await import("node:fs/promises");
                await fs.unlink(file);
            },
        });
        await assert.rejects(publishTriggerGoal(owner, triggers, failingCleanup, trigger.id), /cleanup failed/);
        assert.equal(triggers.routeStatus(trigger.id), "routed");
        assert.deepEqual(triggers.queuedGoalIds(), ["goal-1"]);
        triggers.close();

        const reopened = new TriggerStore(path);
        assert.equal(reopened.routeStatus(trigger.id), "routed");
        assert.deepEqual(reopened.queuedGoalIds(), ["goal-1"]);
        assert.deepEqual(reopened.goalQueueRecords().map((record) => record.triggerId), [trigger.id]);
        await assert.rejects(publishTriggerGoal(owner, reopened, new JsonFileGoalStore(dir), trigger.id), /Unrouted Supervisor work Trigger/);
        assert.deepEqual(reopened.queuedGoalIds(), ["goal-1"]);
        reopened.close();
        await owner.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("queue insertion rolls back when Trigger routing fails, then recovery publishes once", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-publication-"));
    try {
        const path = join(dir, "triggers.db");
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const triggers = new TriggerStore(path);
        const trigger = workTrigger("work-1");
        triggers.receive(trigger);
        triggers.reserveGoal(trigger.id, "goal-1");
        triggers.freezeGoal(trigger.id, goal("goal-1"));
        const faults = new DatabaseSync(path);
        faults.exec("CREATE TRIGGER fail_route BEFORE UPDATE OF routed ON trigger_events WHEN NEW.routed = 1 BEGIN SELECT RAISE(ABORT, 'route failure'); END");
        const goals = new JsonFileGoalStore(dir);
        await assert.rejects(publishTriggerGoal(owner, triggers, goals, trigger.id), /route failure/);
        assert.equal(triggers.routeStatus(trigger.id), "unrouted");
        assert.deepEqual(triggers.queuedGoalIds(), []);
        assert.equal((await goals.restore("goal-1"))?.id, "goal-1");
        faults.exec("DROP TRIGGER fail_route");
        faults.close();
        triggers.close();

        const reopened = new TriggerStore(path);
        const result = await publishTriggerGoal(owner, reopened, goals, trigger.id);
        assert.deepEqual(result, { kind: "accepted", goalId: "goal-1" });
        assert.equal(reopened.routeStatus(trigger.id), "routed");
        assert.deepEqual(reopened.queuedGoalIds(), ["goal-1"]);
        reopened.close();
        await owner.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a process crash after Goal file publication is recovered without receiving the stored Trigger again", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-publication-crash-"));
    try {
        const path = join(dir, "triggers.db");
        const triggers = new TriggerStore(path);
        const trigger = workTrigger("work-1");
        triggers.receive(trigger);
        triggers.reserveGoal(trigger.id, "goal-1");
        triggers.freezeGoal(trigger.id, goal("goal-1"));
        triggers.close();

        const child = fileURLToPath(new URL("./fixtures/trigger-publication-crash-child.ts", import.meta.url));
        await assert.rejects(promisify(execFile)(process.execPath, ["--import", "tsx", child, dir]), (error: unknown) => {
            assert.equal((error as { code?: number }).code, 71);
            return true;
        });

        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const reopened = new TriggerStore(path);
        assert.equal(reopened.routeStatus(trigger.id), "unrouted");
        const goals = new JsonFileGoalStore(dir);
        const result = await publishTriggerGoal(owner, reopened, goals, trigger.id);
        assert.deepEqual(result, { kind: "accepted", goalId: "goal-1" });
        assert.equal(reopened.routeStatus(trigger.id), "routed");
        assert.deepEqual(reopened.queuedGoalIds(), ["goal-1"]);
        assert.deepEqual(reopened.unroutedTriggers(), []);
        assert.equal((await goals.restore("goal-1"))?.id, "goal-1");
        reopened.close();
        await owner.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});
