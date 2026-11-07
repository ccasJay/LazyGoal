import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TriggerDeliveryStore } from "../src/trigger-delivery-store";
import { receiveAuthorizedTrigger } from "../src/trigger-delivery-ingress";

test("ingress rejects forged process identity and targets before storing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-ingress-"));
    try {
        const store = new TriggerDeliveryStore(join(dir, "db"));
        const principal = { role: "worker", workerId: "w", generation: "2", goalId: "g1", mayCreateGoal: false } as const;
        const trigger = { id: "t", purpose: "progress", source: "worker", workerId: "w", generation: "2", payload: "{}" };
        assert.throws(() => receiveAuthorizedTrigger(store, { deliveryId: "stale", trigger: { ...trigger, generation: "1" }, goalId: "g1" }, principal), /identity/);
        assert.throws(() => receiveAuthorizedTrigger(store, { deliveryId: "other", trigger, goalId: "g2" }, principal), /authorized/);
        assert.throws(() => receiveAuthorizedTrigger(store, { deliveryId: "forged", trigger: { ...trigger, source: "user" }, goalId: "g1" }, principal), /source/);
        assert.deepEqual(store.pendingIds(), []);
        assert.equal(receiveAuthorizedTrigger(store, { deliveryId: "valid", trigger, goalId: "g1" }, principal).status, "pending");
        store.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("ingress does not interpret control events as creation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-ingress-"));
    try {
        const store = new TriggerDeliveryStore(join(dir, "db"));
        const principal = { role: "external", mayCreateGoal: true, goalIds: ["g1"] } as const;
        const trigger = { id: "t", purpose: "cancel", source: "external", payload: "{}" };
        assert.throws(() => receiveAuthorizedTrigger(store, { deliveryId: "missing", trigger }, principal), /create/);
        assert.throws(() => receiveAuthorizedTrigger(store, { deliveryId: "other", trigger, goalId: "g2" }, principal), /authorized/);
        assert.deepEqual(store.pendingIds(), []);
        assert.equal(receiveAuthorizedTrigger(store, { deliveryId: "valid", trigger, goalId: "g1" }, principal).status, "pending");
        store.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("worker work creation requires an explicit host grant", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-ingress-"));
    try {
        const store = new TriggerDeliveryStore(join(dir, "db"));
        const principal = { role: "worker", workerId: "w", generation: "1", goalId: "g1", mayCreateGoal: false } as const;
        const trigger = { id: "t", purpose: "work", source: "worker", workerId: "w", generation: "1", payload: "{}" };
        assert.throws(() => receiveAuthorizedTrigger(store, { deliveryId: "d", trigger }, principal), /create/);
        assert.equal(receiveAuthorizedTrigger(store, { deliveryId: "d", trigger }, { ...principal, mayCreateGoal: true }).status, "pending");
        store.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});
