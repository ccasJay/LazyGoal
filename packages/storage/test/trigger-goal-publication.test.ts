import test from "node:test";
import assert from "node:assert/strict";
import { link, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createGoal } from "../../runtime/src/domain";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import { SupervisorOwnership } from "../src/supervisor-ownership";
import { JsonFileGoalStore } from "../src/goal-store";
import { TriggerDeliveryStore } from "../src/trigger-delivery-store";
import { workTrigger } from "../../runtime/test/trigger-fixtures";
import { publishTriggerGoal } from "../src/trigger-goal-publication";

function goal(id: string) {
    return createGoal({ ...currentProtocols, id, runId: `run-${id}`, intent: "work", promptBundleVersion: 1,
        profile: { id: "profile", systemPrompt: "", instructions: [], toolIds: [] } });
}

test("published Goal is recovered after losing its publication response", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-publication-"));
    try {
        const db = join(dir, "receipts.db");
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const deliveries = new TriggerDeliveryStore(db);
        deliveries.receive({ deliveryId: "d", trigger: workTrigger("t") });
        deliveries.reserveGoal("d", "g");
        deliveries.freezeGoal("d", goal("g"));
        let calls = 0;
        const interrupted = new JsonFileGoalStore(dir, { link: async (source, target) => {
            await link(source, target);
            if (++calls === 2) throw new Error("lost publication response");
        } });
        await assert.rejects(publishTriggerGoal(owner, deliveries, interrupted, "d"), /lost publication response/);
        assert.equal(deliveries.read("d")?.status, "pending");
        deliveries.close();
        const reopened = new TriggerDeliveryStore(db);
        const goals = new JsonFileGoalStore(dir);
        assert.equal((await publishTriggerGoal(owner, reopened, goals, "d")).status, "settled");
        assert.equal((await publishTriggerGoal(owner, reopened, goals, "d")).status, "settled");
        assert.deepEqual(reopened.queuedGoalIds(), ["g"]);
        assert.equal((await goals.restore("g"))?.id, "g");
        reopened.close();
        await owner.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("occupied unreadable Goal is rejected without changing its file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-publication-"));
    try {
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const deliveries = new TriggerDeliveryStore(join(dir, "receipts.db"));
        deliveries.receive({ deliveryId: "d", trigger: workTrigger("t") });
        deliveries.reserveGoal("d", "g");
        deliveries.freezeGoal("d", goal("g"));
        const path = join(dir, `${Buffer.from("g").toString("base64url")}.json`);
        await writeFile(path, "unreadable snapshot");
        const result = await publishTriggerGoal(owner, deliveries, new JsonFileGoalStore(dir), "d");
        assert.equal(result.status, "settled");
        assert.deepEqual(result.status === "settled" ? result.result : undefined, { kind: "rejected", reason: "goal-id-occupied", goalId: "g" });
        assert.equal(await readFile(path, "utf8"), "unreadable snapshot");
        assert.deepEqual(deliveries.queuedGoalIds(), []);
        deliveries.close();
        await owner.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("lost response after receipt commit is queryable and cannot enqueue twice", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-publication-"));
    try {
        const path = join(dir, "receipts.db");
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const deliveries = new TriggerDeliveryStore(path);
        deliveries.receive({ deliveryId: "d", trigger: workTrigger("t") });
        deliveries.reserveGoal("d", "g");
        deliveries.freezeGoal("d", goal("g"));
        const failingCleanup = new JsonFileGoalStore(dir, {
            unlink: async (file) => {
                if (String(file).includes(".trigger-create-") && !String(file).match(/\.tmp\..*\.tmp$/)) throw new Error("cleanup failed");
                const fs = await import("node:fs/promises");
                await fs.unlink(file);
            },
        });
        await assert.rejects(publishTriggerGoal(owner, deliveries, failingCleanup, "d"), /cleanup failed/);
        assert.equal(deliveries.read("d")?.status, "settled");
        deliveries.close();
        const reopened = new TriggerDeliveryStore(path);
        assert.equal((await publishTriggerGoal(owner, reopened, new JsonFileGoalStore(dir), "d")).status, "settled");
        assert.deepEqual(reopened.queuedGoalIds(), ["g"]);
        reopened.close();
        await owner.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("receipt failure rolls back queue and retry completes the published Goal", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-publication-"));
    try {
        const path = join(dir, "receipts.db");
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const deliveries = new TriggerDeliveryStore(path);
        deliveries.receive({ deliveryId: "d", trigger: workTrigger("t") });
        deliveries.reserveGoal("d", "g");
        deliveries.freezeGoal("d", goal("g"));
        const { DatabaseSync } = await import("node:sqlite");
        const faults = new DatabaseSync(path);
        faults.exec("CREATE TRIGGER fail_receipt BEFORE UPDATE OF result ON trigger_deliveries BEGIN SELECT RAISE(ABORT, 'receipt failure'); END");
        const goals = new JsonFileGoalStore(dir);
        await assert.rejects(publishTriggerGoal(owner, deliveries, goals, "d"), /receipt failure/);
        assert.equal(deliveries.read("d")?.status, "pending");
        assert.deepEqual(deliveries.queuedGoalIds(), []);
        assert.equal((await goals.restore("g"))?.id, "g");
        faults.exec("DROP TRIGGER fail_receipt");
        faults.close();
        deliveries.close();
        const reopened = new TriggerDeliveryStore(path);
        assert.equal((await publishTriggerGoal(owner, reopened, goals, "d")).status, "settled");
        assert.deepEqual(reopened.queuedGoalIds(), ["g"]);
        reopened.close();
        await owner.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});


test("recovery reconciles a Goal after the publishing process terminates", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trigger-crash-"));
    try {
        const path = join(dir, "receipts.db");
        const receipts = new TriggerDeliveryStore(path);
        receipts.receive({ deliveryId: "d", trigger: workTrigger("t") });
        receipts.reserveGoal("d", "g");
        receipts.freezeGoal("d", goal("g"));
        receipts.close();
        const child = fileURLToPath(new URL("./fixtures/trigger-publication-crash-child.ts", import.meta.url));
        await assert.rejects(promisify(execFile)(process.execPath, ["--import", "tsx", child, dir]), (error: unknown) => {
            assert.equal((error as { code?: number }).code, 71);
            return true;
        });
        const owner = new SupervisorOwnership(join(dir, "owner.db"));
        const reopened = new TriggerDeliveryStore(path);
        assert.equal(reopened.read("d")?.status, "pending");
        const goals = new JsonFileGoalStore(dir);
        assert.equal((await publishTriggerGoal(owner, reopened, goals, "d")).status, "settled");
        assert.deepEqual(reopened.queuedGoalIds(), ["g"]);
        assert.equal((await goals.restore("g"))?.id, "g");
        reopened.close();
        await owner.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
});
