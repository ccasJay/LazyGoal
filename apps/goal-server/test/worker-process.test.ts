import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { TriggerStore } from "../../../packages/storage/src/trigger-store";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";
import { SupervisorWorkerProcess } from "../src/runtime/worker-process";
import { createWorkerProcessRegistration } from "../src/runtime/worker-process-registry";

test("Supervisor 启动独立 Worker 并在同一进程中重复确认身份", async () => {
    const root = await mkdtemp(join(tmpdir(), "lg-worker-process-"));
    const owner = new SupervisorOwnership(join(root, "owner.db"));
    const triggers = new TriggerStore(join(root, "triggers.db"));
    const goals = new JsonFileGoalStore(join(root, "goals"));
    const dataDirectory = join(root, "worker-data");
    const registration = await createWorkerProcessRegistration(dataDirectory, "worker-1", "generation-1", { projectRoot: root, executionRoot: root });
    const worker = await SupervisorWorkerProcess.start({
        workerId: "worker-1",
        generation: "generation-1",
        cwd: root,
        workspaceIdentityRoot: root,
        dataDirectory,
        registration,
        owner,
        triggers,
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
        triggers.close();
        await owner.close();
        await rm(root, { recursive: true, force: true });
    }
});
