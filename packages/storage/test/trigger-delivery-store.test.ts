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
import { cancelTrigger, permissionDecisionTrigger, permissionRequestTrigger, waitingTrigger, workTrigger } from "../../runtime/test/trigger-fixtures";

test("trigger deliveries survive reopening and reject identity conflicts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lazygoal-trigger-"));
    try {
        const path = join(dir, "deliveries.db");
        const first = new TriggerDeliveryStore(path);
        const trigger = workTrigger("t1", "inspect files");
        const item = { deliveryId: "d1", trigger };
        assert.equal(first.receive(item).status, "pending");
        assert.equal(first.receive(item).status, "pending");
        assert.equal(first.receive({ ...item, deliveryId: "d2" }).status, "pending");
        assert.throws(() => first.receive({ ...item, goalId: "other" }), /Invalid trigger delivery/);
        assert.throws(() => first.receive({ ...item, deliveryId: "d3", trigger: workTrigger("t1", "different work") }), /Trigger identity conflict/);
        assert.deepEqual(first.pendingIds(), ["d1", "d2"]);
        first.settle("d1", { kind: "ignored" });
        first.close();
        const second = new TriggerDeliveryStore(path);
        assert.equal(second.receive(item).status, "settled");
        assert.equal(second.read("d2")?.status, "pending");
        assert.deepEqual(second.pendingIds(), ["d2"]);
        assert.equal(second.settle("d1", { kind: "ignored" }).status, "settled");
        second.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("trigger delivery validates structure and worker process identity", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lazygoal-trigger-"));
    try {
        const store = new TriggerDeliveryStore(join(dir, "deliveries.db"));
        const trigger = waitingTrigger("t", "g", "work", "run", "w", "1");
        assert.equal(store.receive({ deliveryId: "d", trigger }).status, "pending");
        assert.throws(() => store.receive({ deliveryId: "bad", trigger: { ...trigger, source: { role: "worker", workerId: "w", generation: "" } } }), /identity/);
        assert.throws(() => store.receive({ deliveryId: "invalid", trigger: { ...trigger, payload: { action: "progress", runId: "run", status: "waiting", extra: true } } }), /Invalid trigger delivery/);
        assert.equal(store.read("invalid"), undefined);
        store.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Action 权限请求只接受绑定原请求身份的回复并原子结算", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lazygoal-trigger-permission-"));
    try {
        const store = new TriggerDeliveryStore(join(dir, "deliveries.db"));
        const request = {
            type: "action_approval_request" as const,
            requestId: "permission-request-1",
            runId: "run-1",
            actionId: "action-1",
            interactionId: "action_approval:action-1",
            commitRevision: 4,
        };
        const requestTrigger = permissionRequestTrigger(request.requestId, "goal-1", "worker-1", "generation-1", {
            runId: request.runId, actionId: request.actionId, interactionId: request.interactionId, commitRevision: request.commitRevision,
        });
        const requestDelivery = { deliveryId: "permission-request-delivery-1", trigger: requestTrigger };
        store.receive(requestDelivery);
        store.recordActionPermissionFailure(requestDelivery.deliveryId, "model-failed");
        assert.equal(store.actionPermissionFailure(requestDelivery.deliveryId), "model-failed");

        const mismatchedReply = {
            deliveryId: "permission-reply-mismatch",
            trigger: permissionDecisionTrigger("permission-reply-event-mismatch", "goal-1", "other-request", "approve"),
        };
        store.receive(mismatchedReply);
        assert.throws(() => store.settleActionPermissionExchange(requestDelivery.deliveryId, mismatchedReply.deliveryId), /reply Trigger|identity/);
        assert.equal(store.read(requestDelivery.deliveryId)?.status, "pending");
        assert.equal(store.read(mismatchedReply.deliveryId)?.status, "pending");

        const validReply = {
            deliveryId: "permission-reply-valid",
            trigger: permissionDecisionTrigger("permission-reply-event-valid", "goal-1", requestTrigger.id, "approve"),
        };
        store.receive(validReply);
        const settled = store.settleActionPermissionExchange(requestDelivery.deliveryId, validReply.deliveryId);
        assert.deepEqual(settled.map((item) => item.status), ["settled", "settled"]);
        assert.equal(store.actionPermissionFailure(requestDelivery.deliveryId), undefined);
        const requestResult = store.read(requestDelivery.deliveryId);
        assert.equal(requestResult?.status === "settled" ? requestResult.result.kind : undefined, "handled");
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
        const input = { deliveryId: "d", trigger: workTrigger("t") };
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
        const event = workTrigger("t");
        first.receive({ deliveryId: "d1", trigger: event });
        first.receive({ deliveryId: "d2", trigger: event });
        first.receive({ deliveryId: "linked", trigger: cancelTrigger("linked-trigger", "existing-goal", "run-existing") });
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
        const trigger = workTrigger("t");
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
        store.receive({ deliveryId: "d", trigger: workTrigger("t") });
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
