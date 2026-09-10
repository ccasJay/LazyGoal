import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { AlfworldEnvironmentSpec, ALFWORLD_MANAGED_INSTALL_COMMANDS } from "../src/environment-spec.js";
import { resolveAlfworldContainerEnvironment } from "../src/environment-config.js";
import { ALFWORLD_CONTAINER_SIDECAR_PATH } from "../src/worker-config.js";

const task = {
    order: 0,
    taskId: "task-1",
    split: "valid_seen" as const,
    gameFile: "valid_seen/task-1/game.tw-pddl",
    seed: 7,
    maxSteps: 10,
};

test("AlfworldEnvironmentSpec declares managed image and uses only EnvironmentHandle", async (t) => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-alfworld-spec-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const dataRoot = join(root, "data");
    const spec = new AlfworldEnvironmentSpec({
        task,
        environment: resolveAlfworldContainerEnvironment({ env: { ALFWORLD_DATA: dataRoot }, cwd: root }),
        sidecarScriptPath: join(root, "sidecar.py"),
    });
    assert.deepEqual(spec.resolveImage(task), {
        mode: "managed",
        platform: "linux/amd64",
        installCommands: ALFWORLD_MANAGED_INSTALL_COMMANDS,
    });
    assert.deepEqual(spec.getWorkerEntryConfig(task).cwd, "/workspace");
    const calls: string[] = [];
    const copyOutSources: string[] = [];
    const env = {
        workdir: "/workspace",
        exec: async (command: string) => {
            calls.push(`exec:${command}`);
            if (command.includes("alfworld-sidecar.py")) return { code: 0, stdout: JSON.stringify({ requestId: 1, ok: true, result: { pythonVersion: "3.9", alfworldVersion: "0.4.2", textworldVersion: "1.6.2", dataRoot: "/opt/alfworld/data", textworldOnly: true } }), stderr: "" };
            if (command.startsWith("set -eu")) return { code: 0, stdout: JSON.stringify({ pythonVersion: "3.9", alfworldVersion: "0.4.2", textworldVersion: "1.6.2", textworldOnly: true }), stderr: "" };
            return { code: 0, stdout: "", stderr: "" };
        },
        copyInto: async (source: string, target: string) => { calls.push(`copy:${source}->${target}`); },
        copyOut: async (source: string, target: string) => { copyOutSources.push(source); return target; },
    };
    await spec.prepareEnvironment(env);
    const preflight = await spec.preflight(env);
    assert.equal(preflight.ok, true);
    await spec.collectArtifacts(env, root, 1000);
    assert.ok(calls.some((call) => call.includes(ALFWORLD_CONTAINER_SIDECAR_PATH)));
    assert.equal(copyOutSources.length, 3);
    assert.ok(copyOutSources.every((source) => source.startsWith("/opt/lazygoal/state/YWxmd29ybGQ/")));
    assert.equal(Object.keys(env).includes("containerName"), false);
});
