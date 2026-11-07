import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createGoal } from "../../runtime/src/domain";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import { SupervisorOwnership } from "../src/supervisor-ownership";
import { TriggerDeliveryStore } from "../src/trigger-delivery-store";

test("trigger deliveries survive reopening and reject identity conflicts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lazygoal-trigger-"));
    try {
        const path = join(dir, "deliveries.db");
        const first = new TriggerDeliveryStore(path);
        const item = { deliveryId: "d1", trigger: { id: "t1", purpose: "work", source: "user", payload: '{"b":2,"a":1}' }, goalId: "g1" };
        assert.equal(first.receive(item).status, "pending");
        assert.equal(first.receive({ ...item, trigger: { ...item.trigger, payload: '{"a":1,"b":2}' } }).status, "pending");
        assert.equal(first.receive({ ...item, deliveryId: "d2", goalId: "g2" }).status, "pending");
        assert.throws(() => first.receive({ ...item, goalId: "other" }), /Delivery identity conflict/);
        assert.throws(() => first.receive({ ...item, deliveryId: "d3", trigger: { ...item.trigger, payload: "{}" } }), /Trigger identity conflict/);
        assert.deepEqual(first.pendingIds(), ["d1", "d2"]);
        first.settle("d1", { kind: "handled" });
        first.close();
        const second = new TriggerDeliveryStore(path);
        assert.equal(second.receive(item).status, "settled");
        assert.equal(second.read("d2")?.status, "pending");
        assert.deepEqual(second.pendingIds(), ["d2"]);
        assert.throws(() => second.settle("d1", { kind: "ignored" }), /result conflict/);
        second.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("trigger delivery validates structure and worker process identity", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lazygoal-trigger-"));
    try {
        const store = new TriggerDeliveryStore(join(dir, "deliveries.db"));
        const trigger = { id: "t", purpose: "progress", source: "worker", payload: "{}" };
        assert.throws(() => store.receive({ deliveryId: "d", trigger }), /identity/);
        assert.throws(() => store.receive({ deliveryId: "d", trigger: { ...trigger, workerId: "w", generation: "1", payload: "bad" } }), /payload/);
        assert.equal(store.read("d"), undefined);
        store.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});


test("separate processes atomically deduplicate the same delivery", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lazygoal-trigger-"));
    try {
        const path = join(dir, "deliveries.db");
        const fixture = fileURLToPath(new URL("./fixtures/trigger-delivery-child.ts", import.meta.url));
        const run = promisify(execFile);
        const results = await Promise.all(Array.from({ length: 4 }, () =>
            run(process.execPath, ["--import", "tsx", fixture, path])));
        assert.deepEqual(results.map((result) => result.stdout), ["pending", "pending", "pending", "pending"]);
        const store = new TriggerDeliveryStore(path);
        assert.equal(store.read("shared-delivery")?.status, "pending");
        store.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});


test("corrupted persisted event does not become a missing delivery", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lazygoal-trigger-"));
    try {
        const path = join(dir, "deliveries.db");
        const store = new TriggerDeliveryStore(path);
        const input = { deliveryId: "d", trigger: { id: "t", purpose: "work", source: "user", payload: "{}" } };
        store.receive(input);
        store.receive({ deliveryId: "other", trigger: { ...input.trigger, id: "other-event" } });
        store.close();
        const db = new DatabaseSync(path);
        db.exec("PRAGMA foreign_keys = OFF; DELETE FROM trigger_events WHERE id = 't'");
        db.close();
        const reopened = new TriggerDeliveryStore(path);
        assert.deepEqual(reopened.pendingIds(), ["d", "other"]);
        assert.throws(() => reopened.read("d"), /Invalid stored trigger delivery/);
        assert.equal(reopened.read("other")?.status, "pending");
        assert.throws(() => reopened.receive(input), /Invalid stored trigger delivery/);
        reopened.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("goal reservations survive restart and acceptance atomically orders queue and receipts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lazygoal-trigger-"));
    try {
        const path = join(dir, "deliveries.db");
        const first = new TriggerDeliveryStore(path);
        const event = { id: "t", purpose: "work", source: "user", payload: "{}" };
        first.receive({ deliveryId: "d1", trigger: event });
        first.receive({ deliveryId: "d2", trigger: event });
        first.receive({ deliveryId: "linked", trigger: event, goalId: "existing-goal" });
        assert.throws(() => first.reserveGoal("linked", "new-goal"), /pending work/);
        first.reserveGoal("d1", "g1");
        first.reserveGoal("d1", "g1");
        assert.throws(() => first.reserveGoal("d1", "different"), /conflict/);
        assert.throws(() => first.reserveGoal("d2", "g1"), /reserved/);
        first.reserveGoal("d2", "g2");
        const makeGoal = (id: string) => createGoal({
            ...currentProtocols, id, runId: `run-${id}`, intent: "work", promptBundleVersion: 1,
            profile: { id: "profile", systemPrompt: "", instructions: [], toolIds: [] },
        });
        assert.throws(() => first.acceptGoal("d1"), /not frozen/);
        first.freezeGoal("d1", makeGoal("g1"));
        first.freezeGoal("d2", makeGoal("g2"));
        first.close();
        const next = new TriggerDeliveryStore(path);
        assert.equal(next.reservedGoal("d1"), "g1");
        assert.equal(next.frozenGoal("d1")?.id, "g1");
        assert.deepEqual(next.queuedGoalIds(), []);
        assert.equal(next.acceptGoal("d2").status, "settled");
        assert.equal(next.acceptGoal("d1").status, "settled");
        assert.equal(next.acceptGoal("d1").status, "settled");
        assert.deepEqual(next.queuedGoalIds(), ["g2", "g1"]);
        next.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("dispatch claims persist FIFO bindings and cannot reuse a busy Worker", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lazygoal-trigger-"));
    try {
        const path = join(dir, "receipts.db");
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const store = new TriggerDeliveryStore(path);
        const trigger = { id: "t", purpose: "work", source: "user", payload: "{}" };
        for (const id of ["1", "2"]) {
            store.receive({ deliveryId: `d${id}`, trigger });
            store.reserveGoal(`d${id}`, `g${id}`);
            store.freezeGoal(`d${id}`, createGoal({ ...currentProtocols, id: `g${id}`, runId: `r${id}`, intent: "work", promptBundleVersion: 1,
                profile: { id: "profile", systemPrompt: "", instructions: [], toolIds: [] } }));
            store.acceptGoal(`d${id}`);
        }
        assert.equal(await store.claimNextGoal(owner, "worker-1", "generation-1"), "g1");
        await assert.rejects(store.claimNextGoal(owner, "worker-1", "generation-2"), /already has/);
        store.close();
        const reopened = new TriggerDeliveryStore(path);
        assert.equal(reopened.workerClaim("worker-1", "generation-1"), "g1");
        assert.throws(() => reopened.workerClaim("worker-1", "generation-2"), /generation/);
        assert.equal(await reopened.claimNextGoal(owner, "worker-2", "generation-1"), "g2");
        assert.equal(await reopened.claimNextGoal(owner, "worker-3", "generation-1"), undefined);
        await owner.close();
        await assert.rejects(reopened.claimNextGoal(owner, "worker-4", "generation-1"), /closed/);
        reopened.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a forged accepted outcome without its atomic queue entry fails closed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lazygoal-trigger-"));
    try {
        const path = join(dir, "deliveries.db");
        const store = new TriggerDeliveryStore(path);
        store.receive({ deliveryId: "d", trigger: { id: "t", purpose: "work", source: "user", payload: "{}" } });
        store.reserveGoal("d", "g");
        store.close();
        const db = new DatabaseSync(path);
        db.prepare("UPDATE trigger_deliveries SET result = ? WHERE id = ?").run('{"goalId":"g","kind":"accepted"}', "d");
        db.close();
        const reopened = new TriggerDeliveryStore(path);
        assert.throws(() => reopened.read("d"), /Inconsistent trigger outcome/);
        reopened.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});
