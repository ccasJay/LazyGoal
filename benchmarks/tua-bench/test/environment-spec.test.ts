import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EnvironmentHandle, ProcessOptions, ProcessResult } from "../../src/index.js";
import { TuaBenchEnvironmentSpec } from "../src/environment-spec.js";
import type { TuaBenchTaskDefinition } from "../src/types.js";

function createMockHandle(commandsHandler: (cmd: string) => ProcessResult): EnvironmentHandle {
    return {
        workdir: "/home/agent",
        async exec(command: string, _options?: Partial<ProcessOptions>): Promise<ProcessResult> {
            return commandsHandler(command);
        },
        async copyInto(_src: string, _tgt: string): Promise<void> {},
        async copyOut(_src: string, tgt: string): Promise<string> {
            return tgt;
        },
    };
}

const baseTask: TuaBenchTaskDefinition = {
    taskId: "test-01",
    name: "test-01",
    instruction: "run tests",
    taskFamily: "document",
    imageRef: "tua-bench/test-01:latest",
    networkMode: "none",
    agentTimeoutSec: 600,
    verifierTimeoutSec: 600,
    verifierUser: "root",
    taskDir: "/workspace/tasks/test-01",
    setupScript: "environment/setup.sh",
    verifierPath: "tests/test.sh",
};

describe("TuaBenchEnvironmentSpec", () => {
    it("resolveImage 返回 custom 镜像模式与 imageRef", () => {
        const spec = new TuaBenchEnvironmentSpec({ task: baseTask });
        const image = spec.resolveImage(baseTask);
        assert.deepEqual(image, { mode: "custom", image: "tua-bench/test-01:latest" });
    });

    it("resolveNetworkMode 根据 task.networkMode 返回 none 或 bridge", () => {
        const noneSpec = new TuaBenchEnvironmentSpec({ task: baseTask });
        assert.equal(noneSpec.resolveNetworkMode(baseTask), "none");

        const publicTask: TuaBenchTaskDefinition = { ...baseTask, networkMode: "public" };
        const publicSpec = new TuaBenchEnvironmentSpec({ task: publicTask });
        assert.equal(publicSpec.resolveNetworkMode(publicTask), "bridge");
    });

    it("getWorkerEntryConfig 返回 cwd 为 /home/agent 且携带 workerArtifact", () => {
        const spec = new TuaBenchEnvironmentSpec({
            task: baseTask,
            workerArtifact: {
                workerPath: "/tmp/worker.mjs",
                nodePath: "/tmp/node",
                manifestPath: "/tmp/manifest.json",
            },
        });
        const config = spec.getWorkerEntryConfig(baseTask);
        assert.equal(config.cwd, "/home/agent");
        assert.equal(config.artifact?.workerPath, "/tmp/worker.mjs");
    });

    it("prepareEnvironment 执行 setup 脚本", async () => {
        const executed: string[] = [];
        const handle = createMockHandle((cmd) => {
            executed.push(cmd);
            return { code: 0, stdout: "", stderr: "" };
        });

        const spec = new TuaBenchEnvironmentSpec({ task: baseTask });
        await spec.prepareEnvironment(handle);
        assert.ok(executed.some((cmd) => cmd.includes("environment/setup.sh")));
    });

    it("preflight 验证 tests/test.sh 存在且可执行", async () => {
        // 成功场景
        const successHandle = createMockHandle((cmd) => {
            if (cmd.includes("test -f") && cmd.includes("test -x")) {
                return { code: 0, stdout: "", stderr: "" };
            }
            return { code: 1, stdout: "", stderr: "unknown command" };
        });
        const spec = new TuaBenchEnvironmentSpec({ task: baseTask });
        const resOk = await spec.preflight(successHandle);
        assert.equal(resOk.ok, true);

        // 失败场景
        const failHandle = createMockHandle(() => ({
            code: 1,
            stdout: "",
            stderr: "tests/test.sh not found",
        }));
        const resFail = await spec.preflight(failHandle);
        assert.equal(resFail.ok, false);
        assert.match(resFail.message ?? "", /Verifier script not found or not executable/);
    });

    it("collectArtifacts 执行验证脚本并解析 reward 判定 passed", async () => {
        const executed: string[] = [];
        const handle = createMockHandle((cmd) => {
            executed.push(cmd);
            if (cmd.includes("tests/test.sh")) {
                return { code: 0, stdout: "Running verification tests... All pass", stderr: "" };
            }
            if (cmd.includes("cat /logs/verifier/reward.txt")) {
                return { code: 0, stdout: "1.0\n", stderr: "" };
            }
            return { code: 0, stdout: "", stderr: "" };
        });

        const spec = new TuaBenchEnvironmentSpec({ task: baseTask });
        const artifacts = await spec.collectArtifacts(handle, "/tmp/out", 30_000);

        assert.equal(artifacts.reward, 1.0);
        assert.equal(artifacts.domainResult.passed, true);
        assert.equal(artifacts.domainResult.taskFamily, "document");
        assert.equal(artifacts.domainResult.verifierError, null);
    });
});
