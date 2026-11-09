import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGoal } from "../../runtime/src/domain";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import { JsonFileGoalStore } from "../src/goal-store";
import { SupervisorOwnership } from "../src/supervisor-ownership";
import { TriggerDeliveryStore } from "../src/trigger-delivery-store";
import { publishAuthorizedWork } from "../src/trigger-work-publication";
import { workTrigger } from "../../runtime/test/trigger-fixtures";

test("authorized work is persisted and duplicate deliveries return the original result", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-work-"));
    try {
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const receipts = new TriggerDeliveryStore(join(dir, "receipts.db"));
        const goals = new JsonFileGoalStore(dir);
        const principal = { role: "user", mayCreateGoal: true, goalIds: [] } as const;
        const trigger = workTrigger("t");
        const goal = createGoal({ ...currentProtocols, id: "g", runId: "r", intent: "work", promptBundleVersion: 1,
            profile: { id: "profile", systemPrompt: "", instructions: [], toolIds: [] } });
        const delivery = { deliveryId: "d", trigger };
        let factoryCalls = 0;
        const create = async () => { factoryCalls++; await Promise.resolve(); return goal; };
        const [first, second] = await Promise.all([
            publishAuthorizedWork(owner, receipts, goals, delivery, principal, create),
            publishAuthorizedWork(owner, receipts, goals, delivery, principal, create),
        ]);
        assert.equal(factoryCalls, 1);
        assert.deepEqual(second, first);
        assert.deepEqual(receipts.queuedGoalIds(), ["g"]);
        assert.equal((await goals.restore("g"))?.id, "g");
        await assert.rejects(publishAuthorizedWork(owner, receipts, goals, { deliveryId: "bad", trigger: { ...trigger, source: { role: "supervisor" } } }, principal, async () => goal), /source/);
        await owner.close();
        receipts.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a retry reuses the Goal ID reserved before interruption", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-work-"));
    try {
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const receipts = new TriggerDeliveryStore(join(dir, "receipts.db"));
        const goals = new JsonFileGoalStore(dir);
        const principal = { role: "user", mayCreateGoal: true, goalIds: [] } as const;
        const delivery = { deliveryId: "d", trigger: workTrigger("t") };
        receipts.receive(delivery);
        receipts.reserveGoal("d", "reserved-g");
        const result = await publishAuthorizedWork(owner, receipts, goals, delivery, principal, async (reserved) => {
            assert.equal(reserved, "reserved-g");
            return createGoal({ ...currentProtocols, id: reserved, runId: "r", intent: "work", promptBundleVersion: 1,
                profile: { id: "profile", systemPrompt: "", instructions: [], toolIds: [] } });
        });
        assert.equal(result.status, "settled");
        assert.deepEqual(receipts.queuedGoalIds(), ["reserved-g"]);
        await owner.close();
        receipts.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});
