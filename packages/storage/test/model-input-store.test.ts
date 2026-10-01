import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { JsonFileModelInputStore } from "../src/index";
import type { ModelInputRecord } from "../../runtime/src/model-input";

test("model input store reuses unchanged bodies across calls and restart without truncation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-input-"));
    try {
        const store = new JsonFileModelInputStore(directory);
        const first: ModelInputRecord = { goalId: "goal-1", runId: "run-1", callId: "call-1", executionUnitId: "unit-1", stage: "decide", stepIndex: 1, occurredAt: new Date().toISOString(), messages: [
            { role: "system", source: "system", content: "system\n" + "z".repeat(100_000) }, { role: "user", source: "conversation", content: "inspect architecture" },
        ] };
        const second = { ...first, callId: "call-2", stepIndex: 2 };
        const third = { ...first, callId: "call-3", messages: [{ ...first.messages[0]!, content: "changed system" }, first.messages[1]!] };
        await Promise.all([store.append(first), store.append(second), store.append(third)]);
        const runPath = join(directory, Buffer.from("goal-1").toString("base64url"), Buffer.from("run-1").toString("base64url"));
        assert.equal((await readdir(join(dirname(runPath), "messages"))).length, 3);
        const manifests = (await readFile(join(runPath, "requests.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
        assert.equal(manifests[0].messages[0].ref, manifests[1].messages[0].ref);
        assert.notEqual(manifests[1].messages[0].ref, manifests[2].messages[0].ref);
        assert.ok(!JSON.stringify(manifests).includes("inspect architecture"));
        assert.deepEqual(await new JsonFileModelInputStore(directory).read("goal-1", "run-1"), [first, second, third]);
        assert.deepEqual(await store.read("goal-1", "missing"), []);
        await store.append({ ...first, runId: "run-2", callId: "call-4" });
        assert.equal((await readdir(join(dirname(runPath), "messages"))).length, 3);
        assert.deepEqual((await store.read("goal-1", "run-2"))[0]!.messages, first.messages);
        await writeFile(join(dirname(runPath), "messages", `${manifests[0].messages[0].ref}.txt`), "corrupted");
        await assert.rejects(store.read("goal-1", "run-1"), /hash mismatch/);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test("model input durable boundary rejects unsupported schema and unsafe content references", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-input-"));
    try {
        const store = new JsonFileModelInputStore(directory);
        const record: ModelInputRecord = { goalId: "goal-1", runId: "run-1", callId: "call-1", stage: "think", stepIndex: 1, occurredAt: new Date().toISOString(), messages: [] };
        await store.append(record);
        const path = join(directory, Buffer.from("goal-1").toString("base64url"), Buffer.from("run-1").toString("base64url"), "requests.jsonl");
        await writeFile(path, JSON.stringify({ ...record, schemaVersion: 2 }) + "\n");
        await assert.rejects(store.read("goal-1", "run-1"), /manifest/);
        await writeFile(path, JSON.stringify({ ...record, schemaVersion: 1, messages: [{ role: "system", source: "system", ref: "../../outside" }] }) + "\n");
        await assert.rejects(store.read("goal-1", "run-1"), /reference/);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
