import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContextEnvironment } from "../src/environment-spec.js";
import { candidate, scenario, worker } from "./fixtures.js";
import type { WorkerArtifact } from "../../src/worker-builder.js";
test("restore import includes only project/state, never frozen script or scoring files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "context-import-test-"));
    try {
        await candidate(directory);
        const spec = createContextEnvironment(scenario, { manifest: worker } as WorkerArtifact, directory, false);
        let copied = "";
        await spec.prepareEnvironment({
            workdir: "/workspace/project",
            exec: async () => ({ code: 0, stdout: "", stderr: "" }),
            copyInto: async source => { copied = await readFile(source, "utf8"); },
            copyOut: async () => "",
        });
        const payload = JSON.parse(copied);
        assert.ok(payload["project/config.json"]);
        assert.ok(Object.keys(payload).some(path => path.includes("/goals/")));
        assert.equal(Object.keys(payload).some(path => path.includes("context-index") || path === "scenario.json" || path === "capture.json" || path === "checkpoint.json"), false);
        assert.equal(spec.resolveNetworkMode?.(scenario), "none");
        assert.equal(spec.inheritHostProxyEnvironment, undefined);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
