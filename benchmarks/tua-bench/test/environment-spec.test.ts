import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import type { EnvironmentHandle, ProcessOptions, ProcessResult } from "../../src/index.js";
import { TuaBenchEnvironmentSpec } from "../src/environment-spec.js";
import type { TuaBenchTaskDefinition } from "../src/types.js";

function createMockHandle(
    commandsHandler: (cmd: string) => ProcessResult,
    calls: string[] = [],
): EnvironmentHandle {
    return {
        workdir: "/home/agent",
        async exec(command: string, _options?: Partial<ProcessOptions>): Promise<ProcessResult> {
            calls.push(`agent:${command}`);
            return commandsHandler(command);
        },
        async execAsRoot(command: string): Promise<ProcessResult> {
            calls.push(`root:${command}`);
            return commandsHandler(command);
        },
        async execAsUser(user: string, command: string): Promise<ProcessResult> {
            calls.push(`user:${user}:${command}`);
            return commandsHandler(command);
        },
        async captureAgentProcessBaseline(): Promise<void> { calls.push("capture-agent-baseline"); },
        async assertAgentProcessesExited(): Promise<void> { calls.push("assert-agent-exited"); },
        async copyInto(src: string, tgt: string): Promise<void> { calls.push(`copy-in:${src}->${tgt}`); },
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
    taskDir: fileURLToPath(new URL("../manifests/smoke-repo/tasks/doc-smoke-001", import.meta.url)),
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

    it("prepareEnvironment 只复制 setup，并在 Agent 启动前清除私有评分路径", async () => {
        const executed: string[] = [];
        const handle = createMockHandle((cmd) => {
            executed.push(cmd);
            return { code: 0, stdout: "", stderr: "" };
        }, executed);

        const spec = new TuaBenchEnvironmentSpec({ task: baseTask });
        await spec.prepareEnvironment(handle);
        assert.ok(executed.some((cmd) => cmd.includes("environment/setup.sh")));
        assert.ok(executed.some((cmd) => cmd.startsWith("root:rm -rf")));
        assert.equal(executed.some((cmd) => cmd.includes("copy-in:") && cmd.includes("test.sh")), false);
    });

    it("preflight 以 Agent 身份验证评分路径不可读、不可写并记录进程基线", async () => {
        // 成功场景
        const successCalls: string[] = [];
        const successHandle = createMockHandle((cmd) => {
            if (cmd.includes("id -u")) {
                return { code: 0, stdout: "1000\n", stderr: "" };
            }
            return { code: 1, stdout: "", stderr: "unknown command" };
        }, successCalls);
        const spec = new TuaBenchEnvironmentSpec({ task: baseTask });
        const resOk = await spec.preflight(successHandle);
        assert.equal(resOk.ok, true);
        assert.ok(successCalls.some((call) => call.startsWith("agent:for path in")));
        assert.ok(successCalls.includes("capture-agent-baseline"));

        // 失败场景
        const failHandle = createMockHandle(() => ({
            code: 1,
            stdout: "",
            stderr: "private path exists",
        }));
        const resFail = await spec.preflight(failHandle);
        assert.equal(resFail.ok, false);
        assert.match(resFail.message ?? "", /Agent identity can access/);
    });

    it("Agent 进程退出后才注入验证器并解析官方 reward", async () => {
        const executed: string[] = [];
        const handle = createMockHandle((cmd) => {
            executed.push(cmd);
            if (cmd.includes("bash '/run/lazygoal-verifier-")) {
                return { code: 0, stdout: "Running verification tests... All pass", stderr: "" };
            }
            if (cmd.includes("cat /logs/verifier/reward.txt")) {
                return { code: 0, stdout: "1.0\n", stderr: "" };
            }
            return { code: 0, stdout: "", stderr: "" };
        }, executed);

        const spec = new TuaBenchEnvironmentSpec({ task: baseTask });
        const artifacts = await spec.collectArtifacts(handle, "/tmp/out", 30_000);

        assert.equal(artifacts.reward, 1.0);
        assert.equal(artifacts.domainResult.passed, true);
        assert.equal(artifacts.domainResult.taskFamily, "document");
        assert.equal(artifacts.domainResult.verifierError, null);
        assert.ok(executed.includes("assert-agent-exited"));
        assert.ok(executed.some((call) => call.startsWith("copy-in:") && call.includes("/run/lazygoal-verifier-")));
        assert.ok(executed.some((call) => call.startsWith("user:root:")));
    });

    it("无法证明 Agent 进程已退出时不暂存或执行验证器", async () => {
        const calls: string[] = [];
        const handle = createMockHandle(() => ({ code: 0, stdout: "", stderr: "" }), calls);
        handle.assertAgentProcessesExited = async () => {
            calls.push("assert-agent-exited");
            throw new Error("Agent process remains");
        };

        const spec = new TuaBenchEnvironmentSpec({ task: baseTask });
        await assert.rejects(spec.collectArtifacts(handle, "/tmp/out", 1_000), /Agent process remains/u);
        assert.ok(calls.includes("assert-agent-exited"));
        assert.equal(calls.some((call) => call.startsWith("copy-in:")), false);
        assert.equal(calls.some((call) => call.startsWith("user:")), false);
    });

    it("collectArtifacts 保留零与部分 reward，缺失或非有限 reward 会失败", async () => {
        for (const [raw, expectedPassed] of [["0", false], ["0.35", false], ["1.0", true]] as const) {
            const spec = new TuaBenchEnvironmentSpec({ task: baseTask });
            const handle = createMockHandle((command) => command.includes("cat /logs/verifier/reward.txt")
                ? { code: 0, stdout: `${raw}\n`, stderr: "" }
                : { code: 0, stdout: "", stderr: "" });
            const artifacts = await spec.collectArtifacts(handle, "/tmp/out", 1_000);
            assert.equal(artifacts.reward, Number(raw));
            assert.equal(artifacts.domainResult.passed, expectedPassed);
        }

        for (const [rewardCode, raw] of [[1, ""], [0, "Infinity"], [0, "1e999"]] as const) {
            const spec = new TuaBenchEnvironmentSpec({ task: baseTask });
            const handle = createMockHandle((command) => command.includes("cat /logs/verifier/reward.txt")
                ? { code: rewardCode, stdout: raw, stderr: "" }
                : { code: 0, stdout: "", stderr: "" });
            await assert.rejects(spec.collectArtifacts(handle, "/tmp/out", 1_000), /reward/i);
        }
    });
});
