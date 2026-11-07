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
        const trigger = { id: "t", purpose: "progress", source: "worker", workerId: "worker", generation: "generation-2", payload: "{}" };
        async function send(delivery: unknown, password = secret) {
            const { stdout } = await run(process.execPath, ["--import", "tsx", child, String(port)], {
                env: { ...process.env, TRIGGER_TEST_REQUEST: JSON.stringify({ secret: password, delivery }) },
            });
            return JSON.parse(stdout) as { ok: boolean };
        }
        assert.equal((await send({ deliveryId: "stale", trigger: { ...trigger, generation: "generation-1" }, goalId: "g" })).ok, false);
        assert.equal((await send({ deliveryId: "other", trigger, goalId: "other-goal" })).ok, false);
        assert.equal((await send({ deliveryId: "fake", trigger, goalId: "g" }, "forged-secret")).ok, false);
        assert.equal((await send({ deliveryId: "extra", trigger, goalId: "g", unauthorized: true })).ok, false);
        assert.deepEqual(store.pendingIds(), []);
        const delivery = { deliveryId: "valid", trigger, goalId: "g" };
        assert.equal((await send(delivery)).ok, true);
        assert.equal((await send(delivery)).ok, true);
        credentials.revoke(secret);
        assert.equal((await send({ ...delivery, deliveryId: "revoked" })).ok, false);
        assert.deepEqual(store.pendingIds(), ["valid"]);
    } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
        await owner?.close();
        store?.close();
        await rm(dir, { recursive: true, force: true });
    }
});


test("real process work delivery is created, queued and claimed only once", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-wire-work-"));
    let server: Server | undefined;
    let owner: SupervisorOwnership | undefined;
    let store: TriggerDeliveryStore | undefined;
    try {
        owner = new SupervisorOwnership(join(dir, "owner.db"));
        store = new TriggerDeliveryStore(join(dir, "receipts.db"));
        const goals = new JsonFileGoalStore(dir);
        const principal = { role: "user", mayCreateGoal: true, goalIds: [] } as const;
        const credentials = new TriggerCredentials();
        const secret = credentials.issue(principal);
        server = await startTriggerWireServer(owner, store, credentials);
        const address = server.address();
        if (address === null || typeof address === "string") throw new Error("Expected TCP listener");
        const delivery = { deliveryId: "d", trigger: { id: "t", purpose: "work", source: "user", payload: "{}" } };
        const child = fileURLToPath(new URL("./fixtures/trigger-wire-client.ts", import.meta.url));
        const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", child, String(address.port)], {
            env: { ...process.env, TRIGGER_TEST_REQUEST: JSON.stringify({ secret, delivery }) },
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
