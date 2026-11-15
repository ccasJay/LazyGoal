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
import { TriggerStore } from "../src/trigger-store";
import {
    cancelTrigger,
    permissionDecisionTrigger,
    permissionRequestTrigger,
    waitingTrigger,
    workTrigger,
} from "../../runtime/test/trigger-fixtures";

test("direct Trigger identity conflicts and route state survive reopening", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lazygoal-trigger-store-"));
    try {
        const path = join(dir, "triggers.db");
        const first = new TriggerStore(path);
        const trigger = workTrigger("trigger-1", "inspect files");
        assert.deepEqual(first.receive(trigger), trigger);
        assert.throws(() => first.receive(trigger), /Trigger identity conflict/);
        assert.throws(() => first.receive(workTrigger("trigger-1", "different work")), /Trigger identity conflict/);

        const duplicateWork = workTrigger("trigger-2", "inspect files");
        assert.deepEqual(first.receive(duplicateWork), duplicateWork);
        first.recordAdmissionFailure(duplicateWork.id, "model-failed");
        assert.equal(first.admissionFailure(duplicateWork.id), "model-failed");
        assert.equal(first.admissionFailure("missing"), undefined);
        assert.equal(first.routeStatus("trigger-1"), "unrouted");
        assert.equal(first.routeStatus("missing"), undefined);
        assert.ok(first.sequence("trigger-1")! < first.sequence("trigger-2")!);
        assert.deepEqual(first.unroutedTriggers(), [trigger, duplicateWork]);

        first.markRouted("trigger-1");
        assert.equal(first.routeStatus("trigger-1"), "routed");
        assert.deepEqual(first.unroutedTriggers(), [duplicateWork]);
        first.close();

        const reopened = new TriggerStore(path);
        assert.deepEqual(reopened.read("trigger-1"), trigger);
        assert.equal(reopened.routeStatus("trigger-1"), "routed");
        assert.equal(reopened.routeStatus("trigger-2"), "unrouted");
        assert.equal(reopened.admissionFailure("trigger-2"), "model-failed");
        assert.deepEqual(reopened.unroutedTriggers(), [duplicateWork]);
        reopened.markRouted("trigger-2");
        assert.equal(reopened.admissionFailure("trigger-2"), undefined);
        assert.deepEqual(reopened.unroutedTriggers(), []);
        assert.throws(() => reopened.markRouted("missing"), /Trigger does not exist/);
        reopened.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Trigger storage validates structure and Worker process identity", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lazygoal-trigger-store-"));
    try {
        const store = new TriggerStore(join(dir, "triggers.db"));
        const trigger = waitingTrigger("waiting-1", "goal-1", "work-1", "run-1", "worker-1", "generation-1");
        assert.deepEqual(store.receive(trigger), trigger);
        assert.throws(() => store.receive({
            ...trigger,
            id: "invalid-identity",
            source: { role: "worker", workerId: "worker-1", generation: "" },
        }), /identity/i);
        assert.throws(() => store.receive({
            ...trigger,
            id: "invalid-payload",
            payload: { action: "progress", runId: "run-1", status: "waiting", extra: true },
        }), /Invalid Trigger/);
        assert.equal(store.read("invalid-payload"), undefined);
        store.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Action permission failures use the request Trigger ID and both events route atomically", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lazygoal-trigger-permission-"));
    try {
        const store = new TriggerStore(join(dir, "triggers.db"));
        const request = permissionRequestTrigger("permission-request-1", "goal-1", "worker-1", "generation-1", {
            runId: "run-1", actionId: "action-1", interactionId: "action_approval:action-1", commitRevision: 4,
        });
        store.receive(request);
        store.recordActionPermissionFailure(request.id, "model-failed");
        assert.equal(store.actionPermissionFailure(request.id), "model-failed");

        const mismatchedReply = permissionDecisionTrigger("permission-reply-mismatch", "goal-1", "other-request", "approve");
        store.receive(mismatchedReply);
        assert.throws(() => store.markActionPermissionReplyRouted(request.id, mismatchedReply.id), /reply|identity/i);
        assert.equal(store.routeStatus(request.id), "unrouted");
        assert.equal(store.routeStatus(mismatchedReply.id), "unrouted");
        assert.equal(store.actionPermissionFailure(request.id), "model-failed");

        const validReply = permissionDecisionTrigger("permission-reply-valid", "goal-1", request.id, "approve");
        store.receive(validReply);
        store.markActionPermissionReplyRouted(request.id, validReply.id);
        assert.equal(store.routeStatus(request.id), "routed");
        assert.equal(store.routeStatus(validReply.id), "routed");
        assert.equal(store.actionPermissionFailure(request.id), undefined);
        assert.deepEqual(store.unroutedTriggers(), [mismatchedReply]);
        assert.deepEqual(store.listGoalTriggers("goal-1"), [request, mismatchedReply, validReply]);
        store.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("concurrent processes allow one write for a repeated Trigger ID", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lazygoal-trigger-store-process-"));
    try {
        const path = join(dir, "triggers.db");
        const fixture = fileURLToPath(new URL("./fixtures/trigger-store-child.ts", import.meta.url));
        const run = promisify(execFile);
        const results = await Promise.all(Array.from({ length: 4 }, () =>
            run(process.execPath, ["--import", "tsx", fixture, path])));
        const outcomes = results.map((result) => result.stdout);
        assert.equal(outcomes.filter((outcome) => outcome === "received").length, 1);
        assert.equal(outcomes.filter((outcome) => outcome === "conflict").length, 3);
        const store = new TriggerStore(path);
        assert.equal(store.read("shared-trigger")?.id, "shared-trigger");
        assert.equal(store.routeStatus("shared-trigger"), "unrouted");
        store.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("corrupted persisted Trigger remains a stored record after reopening", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lazygoal-trigger-store-"));
    try {
        const path = join(dir, "triggers.db");
        const store = new TriggerStore(path);
        const trigger = workTrigger("trigger-1");
        const other = workTrigger("trigger-2");
        store.receive(trigger);
        store.receive(other);
        store.close();

        const db = new DatabaseSync(path);
        db.prepare("UPDATE trigger_events SET content = ? WHERE id = ?").run("{}", trigger.id);
        db.close();

        const reopened = new TriggerStore(path);
        assert.equal(reopened.routeStatus(trigger.id), "unrouted");
        assert.throws(() => reopened.read(trigger.id), /Invalid stored Trigger/);
        assert.throws(() => reopened.unroutedTriggers(), /Invalid stored Trigger/);
        assert.deepEqual(reopened.read(other.id), other);
        reopened.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Goal reservation survives restart and acceptance commits queue order with routing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lazygoal-trigger-store-"));
    try {
        const path = join(dir, "triggers.db");
        const first = new TriggerStore(path);
        const firstTrigger = workTrigger("work-1");
        const secondTrigger = workTrigger("work-2");
        const linkedTrigger = cancelTrigger("cancel-1", "existing-goal", "run-existing");
        first.receive(firstTrigger);
        first.receive(secondTrigger);
        first.receive(linkedTrigger);
        assert.throws(() => first.reserveGoal(linkedTrigger.id, "new-goal"), /unrouted work Trigger/);
        first.reserveGoal(firstTrigger.id, "goal-1");
        first.reserveGoal(firstTrigger.id, "goal-1");
        assert.throws(() => first.reserveGoal(firstTrigger.id, "different-goal"), /conflict/);
        assert.throws(() => first.reserveGoal(secondTrigger.id, "goal-1"), /reserved/);
        first.reserveGoal(secondTrigger.id, "goal-2");

        const makeGoal = (id: string) => createGoal({
            ...currentProtocols, id, runId: `run-${id}`, intent: "work", promptBundleVersion: 1,
            profile: { id: "profile", systemPrompt: "", instructions: [], toolIds: [] },
        });
        assert.throws(() => first.acceptGoal(firstTrigger.id), /not frozen/);
        first.freezeGoal(firstTrigger.id, makeGoal("goal-1"));
        first.freezeGoal(secondTrigger.id, makeGoal("goal-2"));
        first.close();

        const reopened = new TriggerStore(path);
        assert.equal(reopened.reservedGoal(firstTrigger.id), "goal-1");
        assert.equal(reopened.frozenGoal(firstTrigger.id)?.id, "goal-1");
        assert.deepEqual(reopened.queuedGoalIds(), []);
        assert.deepEqual(reopened.unroutedTriggers(), [firstTrigger, secondTrigger, linkedTrigger]);
        reopened.acceptGoal(secondTrigger.id);
        assert.equal(reopened.routeStatus(secondTrigger.id), "routed");
        assert.deepEqual(reopened.queuedGoalIds(), ["goal-2"]);
        reopened.acceptGoal(firstTrigger.id);
        reopened.acceptGoal(firstTrigger.id);
        assert.deepEqual(reopened.queuedGoalIds(), ["goal-2", "goal-1"]);
        assert.deepEqual(reopened.goalQueueRecords().map((record) => record.triggerId), ["work-2", "work-1"]);
        assert.equal(reopened.routeStatus(firstTrigger.id), "routed");
        assert.deepEqual(reopened.unroutedTriggers(), [linkedTrigger]);
        reopened.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("dispatch claims persist FIFO Trigger bindings and cannot reuse a busy Worker", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lazygoal-trigger-queue-"));
    try {
        const path = join(dir, "triggers.db");
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const store = new TriggerStore(path);
        for (const id of ["1", "2"]) {
            const trigger = workTrigger(`trigger-${id}`);
            store.receive(trigger);
            store.reserveGoal(trigger.id, `goal-${id}`);
            store.freezeGoal(trigger.id, createGoal({
                ...currentProtocols, id: `goal-${id}`, runId: `run-${id}`, intent: "work", promptBundleVersion: 1,
                profile: { id: "profile", systemPrompt: "", instructions: [], toolIds: [] },
            }));
            store.acceptGoal(trigger.id);
        }
        assert.equal(await store.claimNextGoal(owner, "worker-1", "generation-1"), "goal-1");
        await assert.rejects(store.claimNextGoal(owner, "worker-1", "generation-2"), /already has/);
        store.close();

        const reopened = new TriggerStore(path);
        assert.equal(reopened.queueRecord("goal-1")?.triggerId, "trigger-1");
        assert.equal(reopened.workerClaim("worker-1", "generation-1"), "goal-1");
        assert.throws(() => reopened.workerClaim("worker-1", "generation-2"), /generation/);
        assert.equal(await reopened.claimNextGoal(owner, "worker-2", "generation-1"), "goal-2");
        assert.equal(await reopened.claimNextGoal(owner, "worker-3", "generation-1"), undefined);
        await owner.close();
        await assert.rejects(reopened.claimNextGoal(owner, "worker-4", "generation-1"), /closed/);
        reopened.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Goal creation origin persists with the work Trigger and rejects other Trigger kinds", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lazygoal-trigger-store-"));
    try {
        const path = join(dir, "triggers.db");
        const first = new TriggerStore(path);
        const manual = workTrigger("trigger-manual", "inspect files");
        assert.deepEqual(first.receive(manual, "web-manual"), manual);
        assert.equal(first.goalOrigin(manual.id), "web-manual");
        const external = workTrigger("trigger-external", "inspect files");
        first.receive(external);
        assert.equal(first.goalOrigin(external.id), undefined);
        assert.equal(first.goalOrigin("missing"), undefined);
        assert.throws(() => first.receive(cancelTrigger("trigger-cancel", "goal-1", "run-1"), "web-manual"),
            /Goal origin requires a new Goal work Trigger/);
        assert.equal(first.routeStatus("trigger-cancel"), undefined);
        first.close();

        const reopened = new TriggerStore(path);
        assert.equal(reopened.goalOrigin(manual.id), "web-manual");
        assert.equal(reopened.goalOrigin(external.id), undefined);
        reopened.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("同一终态只接受一个续接输入，并可按受理顺序重新排队", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lazygoal-trigger-store-"));
    const owner = new SupervisorOwnership(join(dir, "owner.db"));
    try {
        const store = new TriggerStore(join(dir, "triggers.db"));
        const work = workTrigger("trigger-continue-work", "work");
        store.receive(work, "web-manual");
        store.reserveGoal(work.id, "goal-continue");
        store.freezeGoal(work.id, createGoal({
            ...currentProtocols, id: "goal-continue", runId: "run-1", intent: "work", promptBundleVersion: 1,
            profile: { id: "profile", systemPrompt: "", instructions: [], toolIds: [] },
        }));
        store.acceptGoal(work.id);
        assert.equal(await store.claimNextGoal(owner, "worker-1", "generation-1"), "goal-continue");
        await store.markWorkerGoalStatus(owner, "worker-1", "generation-1", "goal-continue", "terminal");

        const first = workTrigger("input-continue-1", "继续");
        const second = workTrigger("input-continue-2", "继续");
        store.receive(first);
        store.receive(second);
        assert.equal(store.reserveContinuation("goal-continue", "run-1", first.id), "reserved");
        assert.equal(store.reserveContinuation("goal-continue", "run-1", first.id), "existing");
        assert.throws(() => store.reserveContinuation("goal-continue", "run-1", second.id),
            /already has a continuation input/);
        assert.equal(store.continuationRecord("goal-continue", "run-1")?.appliedRunId, undefined);

        store.bindContinuationRun("goal-continue", "run-1", first.id, "run-2");
        assert.equal(store.continuationRecord("goal-continue", "run-1")?.appliedRunId, "run-2");
        assert.equal(store.continuationForTrigger(first.id)?.goalId, "goal-continue");
        assert.throws(() => store.bindContinuationRun("goal-continue", "run-1", first.id, "run-3"),
            /different Run/);

        // 更晚入队的 Goal 仍在续接 Goal 之前。
        const later = workTrigger("trigger-later", "later");
        store.receive(later);
        store.reserveGoal(later.id, "goal-later");
        store.freezeGoal(later.id, createGoal({
            ...currentProtocols, id: "goal-later", runId: "run-later", intent: "later", promptBundleVersion: 1,
            profile: { id: "profile", systemPrompt: "", instructions: [], toolIds: [] },
        }));
        store.acceptGoal(later.id);
        store.requeueGoalForContinuation("goal-continue");
        assert.equal(store.queueRecord("goal-continue")?.status, "queued");
        assert.equal(store.queueRecord("goal-continue")?.workerId, undefined);
        assert.equal(await store.claimNextGoal(owner, "worker-2", "generation-2"), "goal-later");
        assert.equal(await store.claimNextGoal(owner, "worker-3", "generation-3"), "goal-continue");
        store.close();
        await owner.close();
    } finally {
        await owner.close().catch(() => undefined);
        await rm(dir, { recursive: true, force: true });
    }
});
