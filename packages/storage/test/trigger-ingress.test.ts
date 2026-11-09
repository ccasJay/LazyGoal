import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TriggerStore } from "../src/trigger-store";
import { receiveAuthorizedTrigger } from "../src/trigger-ingress";
import { cancelTrigger, workTrigger, waitingTrigger } from "../../runtime/test/trigger-fixtures";

test("ingress rejects forged process identity and targets before storing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-ingress-"));
    try {
        const store = new TriggerStore(join(dir, "triggers.db"));
        const principal = { role: "worker", workerId: "worker-1", generation: "generation-2", goalId: "goal-1", mayCreateGoal: false } as const;
        const trigger = waitingTrigger("waiting-1", "goal-1", "work-1", "run-1", "worker-1", "generation-2");
        assert.throws(() => receiveAuthorizedTrigger(store, {
            ...trigger,
            source: { role: "worker", workerId: "worker-1", generation: "generation-1" },
        }, principal), /identity/);
        assert.throws(() => receiveAuthorizedTrigger(store, { ...trigger, goalId: "goal-2" }, principal), /authorized/);
        assert.throws(() => receiveAuthorizedTrigger(store, {
            ...trigger,
            source: { role: "external", externalId: "forged" },
        }, principal), /source/);
        assert.deepEqual(store.unroutedTriggers(), []);
        assert.equal(store.routeStatus(trigger.id), undefined);
        assert.deepEqual(receiveAuthorizedTrigger(store, trigger, principal), trigger);
        assert.equal(store.routeStatus(trigger.id), "unrouted");
        store.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("ingress does not treat control events as Goal creation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-ingress-"));
    try {
        const store = new TriggerStore(join(dir, "triggers.db"));
        const principal = { role: "external", externalId: "test-actor", mayCreateGoal: true, goalIds: ["goal-1"] } as const;
        const trigger = cancelTrigger("cancel-1", "goal-1", "run-1");
        const missingGoal = { ...trigger } as Record<string, unknown>;
        delete missingGoal.goalId;
        assert.throws(() => receiveAuthorizedTrigger(store, missingGoal, principal), /Invalid Trigger/);
        assert.throws(() => receiveAuthorizedTrigger(store, { ...trigger, goalId: "goal-2" }, principal), /authorized/);
        assert.deepEqual(store.unroutedTriggers(), []);
        assert.deepEqual(receiveAuthorizedTrigger(store, trigger, principal), trigger);
        assert.equal(store.routeStatus(trigger.id), "unrouted");
        store.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("external identity is authenticated without closing the source-action direction matrix", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-ingress-"));
    try {
        const store = new TriggerStore(join(dir, "triggers.db"));
        const principal = { role: "external", externalId: "browser-1", mayCreateGoal: true, goalIds: ["goal-1"] } as const;
        const forged = workTrigger("forged-work", "Submit work", { role: "external", externalId: "forged" });
        assert.throws(() => receiveAuthorizedTrigger(store, forged, principal), /external identity/);

        const unusualButAuthorized = {
            id: "external-progress",
            name: "External progress event",
            type: "response" as const,
            source: { role: "external" as const, externalId: "browser-1" },
            target: "supervisor" as const,
            goalId: "goal-1",
            replyTo: "work-origin",
            payload: { action: "progress" as const, runId: "run-1", status: "running" as const },
            sentAt: "2026-11-09T00:00:00.000Z",
        };
        assert.deepEqual(receiveAuthorizedTrigger(store, unusualButAuthorized, principal), unusualButAuthorized);
        assert.equal(store.routeStatus(unusualButAuthorized.id), "unrouted");

        const workerTarget = cancelTrigger("worker-target", "goal-1", "run-1", { role: "external", externalId: "browser-1" });
        assert.deepEqual(receiveAuthorizedTrigger(store, workerTarget, principal), workerTarget);
        assert.throws(() => receiveAuthorizedTrigger(store, {
            ...workerTarget,
            id: "unknown-goal-target",
            goalId: "goal-2",
        }, principal), /authorized/);
        store.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Worker work creation requires an explicit host grant", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-ingress-"));
    try {
        const store = new TriggerStore(join(dir, "triggers.db"));
        const principal = { role: "worker", workerId: "worker-1", generation: "generation-1", goalId: "goal-1", mayCreateGoal: false } as const;
        const trigger = workTrigger("worker-work", "work", { role: "worker", workerId: "worker-1", generation: "generation-1" });
        assert.throws(() => receiveAuthorizedTrigger(store, trigger, principal), /create/);
        assert.deepEqual(receiveAuthorizedTrigger(store, trigger, { ...principal, mayCreateGoal: true }), trigger);
        assert.equal(store.routeStatus(trigger.id), "unrouted");
        store.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});
