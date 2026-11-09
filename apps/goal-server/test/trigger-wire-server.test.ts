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
import { TriggerStore } from "../../../packages/storage/src/trigger-store";
import { publishTriggerGoal } from "../../../packages/storage/src/trigger-goal-publication";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { createGoal } from "../../../packages/runtime/src/domain";
import { currentProtocols } from "../../../packages/runtime/test/current-fixtures";
import { waitingTrigger, workTrigger } from "../../../packages/runtime/test/trigger-fixtures";

test("process ingress authenticates generation, target and credential revocation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-wire-"));
    let server: Server | undefined;
    let owner: SupervisorOwnership | undefined;
    let triggers: TriggerStore | undefined;
    try {
        owner = new SupervisorOwnership(join(dir, "owner.db"));
        triggers = new TriggerStore(join(dir, "triggers.db"));
        const credentials = new TriggerCredentials();
        const secret = credentials.issue({ role: "worker", workerId: "worker", generation: "generation-2", goalId: "goal-1", mayCreateGoal: false });
        server = await startTriggerWireServer(owner, triggers, credentials);
        const address = server.address();
        if (address === null || typeof address === "string") throw new Error("Expected TCP listener");
        assert.equal(address.address, "127.0.0.1");
        const port = address.port;
        const child = fileURLToPath(new URL("./fixtures/trigger-wire-client.ts", import.meta.url));
        const run = promisify(execFile);
        const trigger = waitingTrigger("waiting-1", "goal-1", "work-1", "run-1", "worker", "generation-2");
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
        assert.deepEqual(triggers.unroutedTriggers(), []);
        assert.equal((await send(trigger)).ok, true);
        assert.equal((await send(trigger)).ok, false);
        assert.equal(triggers.routeStatus(trigger.id), "unrouted");

        const workerToWorker = {
            id: "worker-relay",
            name: "Worker relay",
            type: "collaboration" as const,
            source: { role: "worker" as const, workerId: "worker", generation: "generation-2" },
            target: "worker" as const,
            goalId: "goal-1",
            payload: { action: "requested" as const },
            sentAt: trigger.sentAt,
        };
        assert.equal((await send(workerToWorker)).ok, true);
        assert.equal(triggers.read(workerToWorker.id)?.target, "worker");
        credentials.revoke(secret);
        assert.equal((await send(trigger)).ok, false);
        assert.deepEqual(triggers.unroutedTriggers().map((item) => item.id), ["waiting-1", "worker-relay"]);
    } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
        await owner?.close();
        triggers?.close();
        await rm(dir, { recursive: true, force: true });
    }
});

test("a wire-received work Trigger can be routed and claimed without receiving it again", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-wire-work-"));
    let server: Server | undefined;
    let owner: SupervisorOwnership | undefined;
    let triggers: TriggerStore | undefined;
    try {
        owner = new SupervisorOwnership(join(dir, "owner.db"));
        triggers = new TriggerStore(join(dir, "triggers.db"));
        const goals = new JsonFileGoalStore(join(dir, "goals"));
        const principal = { role: "user", externalId: "test-actor", mayCreateGoal: true, goalIds: [] } as const;
        const credentials = new TriggerCredentials();
        const secret = credentials.issue(principal);
        server = await startTriggerWireServer(owner, triggers, credentials);
        const address = server.address();
        if (address === null || typeof address === "string") throw new Error("Expected TCP listener");
        const trigger = workTrigger("work-1", "work");
        const child = fileURLToPath(new URL("./fixtures/trigger-wire-client.ts", import.meta.url));
        const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", child, String(address.port)], {
            env: { ...process.env, TRIGGER_TEST_REQUEST: JSON.stringify({ secret, trigger }) },
        });
        assert.equal((JSON.parse(stdout) as { ok: boolean }).ok, true);
        assert.equal(triggers.routeStatus(trigger.id), "unrouted");

        const goal = createGoal({ ...currentProtocols, id: "goal-1", runId: "run-1", intent: "work", promptBundleVersion: 1,
            profile: { id: "profile", systemPrompt: "", instructions: [], toolIds: [] } });
        triggers.reserveGoal(trigger.id, goal.id);
        triggers.freezeGoal(trigger.id, goal);
        assert.deepEqual(await publishTriggerGoal(owner, triggers, goals, trigger.id), { kind: "accepted", goalId: goal.id });
        assert.equal(triggers.routeStatus(trigger.id), "routed");
        assert.equal(await triggers.claimNextGoal(owner, "worker-1", "generation-1"), "goal-1");
        assert.equal(await triggers.claimNextGoal(owner, "worker-2", "generation-1"), undefined);
        assert.equal(triggers.queueRecord("goal-1")?.triggerId, trigger.id);
        assert.equal((await goals.restore("goal-1"))?.id, "goal-1");
    } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
        await owner?.close();
        triggers?.close();
        await rm(dir, { recursive: true, force: true });
    }
});
