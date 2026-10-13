import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkerArtifact } from "../../src/worker-builder.js";
import { createContextEnvironment } from "../src/environment-spec.js";
import { scenario, worker } from "./fixtures.js";
test("remaining agent processes prevent verifier invocation and artifact publication", async () => {
    let executed = 0;
    const spec = createContextEnvironment(scenario, { manifest: worker } as WorkerArtifact, "/unused", true);
    await assert.rejects(() => spec.collectArtifacts({
        workdir: "/workspace/project",
        assertAgentProcessesExited: async () => { throw new Error("Remaining agent child"); },
        exec: async () => { executed++; return { code: 0, stdout: "", stderr: "" }; },
        copyInto: async () => {},
        copyOut: async () => { throw new Error("Must not publish"); },
    }, "/unused", 1000), /Remaining/);
    assert.equal(executed, 0);
});
test("verifier changes cannot turn a failed artifact into an accepted artifact", async () => {
    const directory = await mkdtemp(join(tmpdir(), "context-verifier-test-"));
    try {
        const spec = createContextEnvironment(scenario, { manifest: worker } as WorkerArtifact, "/unused", true);
        const result = await spec.collectArtifacts({
            workdir: "/workspace/project",
            assertAgentProcessesExited: async () => {},
            exec: async () => ({ code: 0, stdout: "claimed pass", stderr: "" }),
            copyInto: async () => {},
            copyOut: async (_source, target) => {
                await mkdir(target, { recursive: true });
                await writeFile(join(target, "artifact.json"), target.includes("graded-project") ? "repaired" : "broken");
                return target;
            },
        }, directory, 1000);
        assert.deepEqual(result.violations, ["verifier_modified_artifact"]);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
