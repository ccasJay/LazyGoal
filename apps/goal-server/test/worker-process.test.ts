import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { TriggerDeliveryStore } from "../../../packages/storage/src/trigger-delivery-store";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";
import { SupervisorWorkerProcess } from "../src/runtime/worker-process";

test("Supervisor 启动独立 Worker 并在同一进程中重复确认身份", async () => {
    const root = await mkdtemp(join(tmpdir(), "lg-worker-process-"));
    const owner = new SupervisorOwnership(join(root, "owner.db"));
    const deliveries = new TriggerDeliveryStore(join(root, "deliveries.db"));
    const goals = new JsonFileGoalStore(join(root, "goals"));
    const worker = await SupervisorWorkerProcess.start({
        workerId: "worker-1",
        generation: "generation-1",
        cwd: root,
        workspaceIdentityRoot: root,
        dataDirectory: join(root, "worker-data"),
        owner,
        deliveries,
        goals,
    });
    try {
        const first = await worker.probe();
        const second = await worker.probe();
        assert.notEqual(first, process.pid);
        assert.equal(second, first);
        assert.equal(worker.assignedGoalId, undefined);
    } finally {
        await worker.close();
        deliveries.close();
        await owner.close();
        await rm(root, { recursive: true, force: true });
    }
});
