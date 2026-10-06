import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { JsonFileModelPreferenceStore } from "../src/index";

test("工作区模型偏好持久化、隔离且只保存非敏感身份", async () => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-model-preference-"));
    try {
        const one = new JsonFileModelPreferenceStore(join(root, "one"));
        const two = new JsonFileModelPreferenceStore(join(root, "two"));
        assert.equal(await one.get(), undefined);
        await one.set({ provider: "openai", modelId: "model-a" });
        await one.set({ provider: "openai", modelId: "model-b" });
        assert.deepEqual(await new JsonFileModelPreferenceStore(join(root, "one")).get(), { provider: "openai", modelId: "model-b" });
        assert.equal(await two.get(), undefined);
        const path = join(root, "one", "model-preference.json");
        assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { version: 1, provider: "openai", modelId: "model-b" });
        assert.equal((await stat(path)).mode & 0o777, 0o600);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("损坏的偏好文件拒绝读取和覆盖", async () => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-model-preference-"));
    try {
        const path = join(root, "model-preference.json");
        await writeFile(path, '{"version":2,"provider":"openai","modelId":"old"}');
        const store = new JsonFileModelPreferenceStore(root);
        await assert.rejects(store.get(), /invalid or unsupported version/);
        await assert.rejects(store.set({ provider: "openai", modelId: "new" }), /invalid or unsupported version/);
        assert.equal(JSON.parse(await readFile(path, "utf8")).modelId, "old");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
