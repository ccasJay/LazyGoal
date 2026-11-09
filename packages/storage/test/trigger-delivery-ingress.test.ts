import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TriggerDeliveryStore } from "../src/trigger-delivery-store";
import { receiveAuthorizedTrigger } from "../src/trigger-delivery-ingress";
import { cancelTrigger, workTrigger, waitingTrigger } from "../../runtime/test/trigger-fixtures";

test("ingress rejects forged process identity and targets before storing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-ingress-"));
    try {
        const store = new TriggerDeliveryStore(join(dir, "db"));
        const principal = { role: "worker", workerId: "w", generation: "2", goalId: "g1", mayCreateGoal: false } as const;
        const trigger = waitingTrigger("t", "g1", "work-1", "run-1", "w", "2");
        assert.throws(() => receiveAuthorizedTrigger(store, { deliveryId: "stale", trigger: { ...trigger, source: { role: "worker", workerId: "w", generation: "1" } } }, principal), /identity/);
        assert.throws(() => receiveAuthorizedTrigger(store, { deliveryId: "other", trigger: { ...trigger, goalId: "g2" } }, principal), /authorized/);
        assert.throws(() => receiveAuthorizedTrigger(store, { deliveryId: "forged", trigger: { ...trigger, source: { role: "external", externalId: "forged" } } }, principal), /source/);
        assert.deepEqual(store.pendingIds(), []);
        assert.equal(receiveAuthorizedTrigger(store, { deliveryId: "valid", trigger }, principal).status, "pending");
        store.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("ingress does not interpret control events as creation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-ingress-"));
    try {
        const store = new TriggerDeliveryStore(join(dir, "db"));
        const principal = { role: "external", externalId: "test-actor", mayCreateGoal: true, goalIds: ["g1"] } as const;
        const trigger = cancelTrigger("t", "g1", "run-1");
        assert.throws(() => receiveAuthorizedTrigger(store, { deliveryId: "missing", trigger: { ...trigger, goalId: undefined } }, principal), /Invalid trigger delivery/);
        assert.throws(() => receiveAuthorizedTrigger(store, { deliveryId: "other", trigger: { ...trigger, goalId: "g2" } }, principal), /authorized/);
        assert.deepEqual(store.pendingIds(), []);
        assert.equal(receiveAuthorizedTrigger(store, { deliveryId: "valid", trigger }, principal).status, "pending");
        store.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("external identity is authenticated while source/action direction remains open", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-ingress-"));
    try {
        const store = new TriggerDeliveryStore(join(dir, "db"));
        const principal = { role: "external", externalId: "browser-1", mayCreateGoal: true, goalIds: ["g1"] } as const;
        const work = workTrigger("work", "Submit work", { role: "external", externalId: "forged" });
        assert.throws(() => receiveAuthorizedTrigger(store, { deliveryId: "forged", trigger: work }, principal), /external identity/);

        const unusualButAuthorized = {
            id: "external-progress",
            name: "External progress event",
            type: "response" as const,
            source: { role: "external" as const, externalId: "browser-1" },
            target: "supervisor" as const,
            goalId: "g1",
            replyTo: "work-origin",
            payload: { action: "progress" as const, runId: "run-1", status: "running" as const },
            sentAt: "2026-11-09T00:00:00.000Z",
        };
        const accepted = receiveAuthorizedTrigger(store, { deliveryId: unusualButAuthorized.id, trigger: unusualButAuthorized }, principal);
        assert.equal(accepted.status, "pending");

        const workerTarget = cancelTrigger("worker-target", "g1", "run-1", { role: "external", externalId: "browser-1" });
        assert.equal(receiveAuthorizedTrigger(store, { deliveryId: workerTarget.id, trigger: workerTarget }, principal).status, "pending");
        assert.throws(() => receiveAuthorizedTrigger(store, {
            deliveryId: "unknown-goal-target",
            trigger: { ...workerTarget, id: "unknown-goal-target", goalId: "g2" },
        }, principal), /authorized/);
        store.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("worker work creation requires an explicit host grant", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-ingress-"));
    try {
        const store = new TriggerDeliveryStore(join(dir, "db"));
        const principal = { role: "worker", workerId: "w", generation: "1", goalId: "g1", mayCreateGoal: false } as const;
        const trigger = workTrigger("t", "work", { role: "worker", workerId: "w", generation: "1" });
        assert.throws(() => receiveAuthorizedTrigger(store, { deliveryId: "d", trigger }, principal), /create/);
        assert.equal(receiveAuthorizedTrigger(store, { deliveryId: "d", trigger }, { ...principal, mayCreateGoal: true }).status, "pending");
        store.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});
