import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { Server } from "node:net";
import { TriggerCredentials, startTriggerWireServer } from "../src/runtime/trigger-wire-server";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";
import { TriggerDeliveryStore } from "../../../packages/storage/src/trigger-delivery-store";
import { publishAuthorizedWork } from "../../../packages/storage/src/trigger-work-publication";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { createGoal } from "../../../packages/runtime/src/domain";
import { currentProtocols } from "../../../packages/runtime/test/current-fixtures";
import { waitingTrigger, workTrigger } from "../../../packages/runtime/test/trigger-fixtures";

test("process ingress authenticates generation, target and revocation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-wire-"));
    let server: Server | undefined;
    let owner: SupervisorOwnership | undefined;
    let store: TriggerDeliveryStore | undefined;
    try {
        owner = new SupervisorOwnership(join(dir, "owner.db"));
        store = new TriggerDeliveryStore(join(dir, "receipts.db"));
        const credentials = new TriggerCredentials();
        const secret = credentials.issue({ role: "worker", workerId: "worker", generation: "generation-2", goalId: "g", mayCreateGoal: false });
        server = await startTriggerWireServer(owner, store, credentials);
        const address = server.address();
        if (address === null || typeof address === "string") throw new Error("Expected TCP listener");
        assert.equal(address.address, "127.0.0.1");
        const port = address.port;
        const child = fileURLToPath(new URL("./fixtures/trigger-wire-client.ts", import.meta.url));
        const run = promisify(execFile);
        const trigger = waitingTrigger("t", "g", "work-1", "run-1", "worker", "generation-2");
        async function send(value: unknown, password = secret) {
            const { stdout } = await run(process.execPath, ["--import", "tsx", child, String(port)], {
                env: { ...process.env, TRIGGER_TEST_REQUEST: JSON.stringify({ secret: password, trigger: value }) },
            });
            return JSON.parse(stdout) as { ok: boolean };
        }
        assert.equal((await send({ ...trigger, source: { role: "worker", workerId: "worker", generation: "generation-1" } })).ok, false);
        assert.equal((await send({ ...trigger, goalId: "other-goal" })).ok, false);
        assert.equal((await send(trigger, "forged-secret")).ok, false);
        assert.equal((await send({ ...trigger, payload: { ...trigger.payload, extra: true } })).ok, false);
        assert.equal((await send({ ...trigger, extra: true })).ok, false);
        assert.deepEqual(store.pendingIds(), []);
        assert.equal((await send(trigger)).ok, true);
        assert.equal((await send(trigger)).ok, true);
        const workerToWorker = {
            id: "worker-relay",
            name: "Worker relay",
            type: "collaboration" as const,
            source: { role: "worker" as const, workerId: "worker", generation: "generation-2" },
            target: "worker" as const,
            goalId: "g",
            payload: { action: "requested" as const },
            sentAt: trigger.sentAt,
        };
        assert.equal((await send(workerToWorker)).ok, true);
        assert.equal(store.read(workerToWorker.id)?.delivery.trigger.target, "worker");
        credentials.revoke(secret);
        assert.equal((await send(trigger)).ok, false);
        assert.deepEqual(store.pendingIds(), ["t", "worker-relay"]);
    } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
        await owner?.close();
        store?.close();
        await rm(dir, { recursive: true, force: true });
    }
});


test("real process work Trigger is created, queued and claimed only once", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-wire-work-"));
    let server: Server | undefined;
    let owner: SupervisorOwnership | undefined;
    let store: TriggerDeliveryStore | undefined;
    try {
        owner = new SupervisorOwnership(join(dir, "owner.db"));
        store = new TriggerDeliveryStore(join(dir, "receipts.db"));
        const goals = new JsonFileGoalStore(dir);
        const principal = { role: "user", externalId: "test-actor", mayCreateGoal: true, goalIds: [] } as const;
        const credentials = new TriggerCredentials();
        const secret = credentials.issue(principal);
        server = await startTriggerWireServer(owner, store, credentials);
        const address = server.address();
        if (address === null || typeof address === "string") throw new Error("Expected TCP listener");
        const trigger = workTrigger("t", "work");
        const delivery = { deliveryId: trigger.id, trigger };
        const child = fileURLToPath(new URL("./fixtures/trigger-wire-client.ts", import.meta.url));
        const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", child, String(address.port)], {
            env: { ...process.env, TRIGGER_TEST_REQUEST: JSON.stringify({ secret, trigger }) },
        });
        assert.equal((JSON.parse(stdout) as { ok: boolean }).ok, true);
        const makeGoal = async () => createGoal({ ...currentProtocols, id: "g", runId: "r", intent: "work", promptBundleVersion: 1,
            profile: { id: "profile", systemPrompt: "", instructions: [], toolIds: [] } });
        assert.equal((await publishAuthorizedWork(owner, store, goals, delivery, principal, makeGoal)).status, "settled");
        assert.equal(await store.claimNextGoal(owner, "worker-1", "generation-1"), "g");
        assert.equal((await publishAuthorizedWork(owner, store, goals, delivery, principal, makeGoal)).status, "settled");
        assert.equal(await store.claimNextGoal(owner, "worker-2", "generation-1"), undefined);
        assert.equal((await goals.restore("g"))?.id, "g");
    } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
        await owner?.close();
        store?.close();
        await rm(dir, { recursive: true, force: true });
    }
});
