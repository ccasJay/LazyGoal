import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { LLMAdapter, LLMRequest, LLMResponse } from "../../../packages/agent/src/index.js";
import type {
    IsolatedEnvironment,
    IsolatedEnvironmentRunOptions,
    IsolatedEnvironmentResult,
} from "../../src/isolated-environment.js";
import {
    runGaiaCli,
    runGaiaEvalCli,
    runGaiaLoadCli,
    runGaiaSupervisor,
    type GaiaCollectedArtifacts,
    type GaiaManifestTask,
} from "../src/index.js";

const dummyTask: GaiaManifestTask = {
    taskId: "gaia-cli-task-1",
    question: "What is 2+2?",
    expectedAnswer: "4",
    level: 1,
    split: "validation",
    attachments: [],
};

const dummyAdapter: LLMAdapter = {
    structuredOutputMode: "strict",
    async generate(_request: LLMRequest): Promise<LLMResponse> {
        return {
            content: "4",
        };
    },
};

test("CLI eval gaia 缺失 --manifest 时打印错误并返回 1", async () => {
    const exitCode = await runGaiaEvalCli(["eval", "gaia"]);
    assert.equal(exitCode, 1);
});

test("CLI load gaia 遇到非法 split 时返回 1", async () => {
    const exitCode = await runGaiaLoadCli(["load", "gaia", "--split", "invalid_split"]);
    assert.equal(exitCode, 1);
});

test("CLI 主入口路由未知命令返回 1", async () => {
    const exitCode = await runGaiaCli(["unknown", "gaia"]);
    assert.equal(exitCode, 1);
});

test("runGaiaSupervisor 正确构造 GaiaEnvironmentSpec 并传递给伪 IsolatedEnvironment", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "gaia-sup-test-"));
    try {
        let capturedOptions: IsolatedEnvironmentRunOptions<GaiaManifestTask, GaiaCollectedArtifacts> | undefined;

        const fakeIsolatedEnv = {
            async run(
                options: IsolatedEnvironmentRunOptions<GaiaManifestTask, GaiaCollectedArtifacts>,
            ): Promise<IsolatedEnvironmentResult<GaiaCollectedArtifacts>> {
                capturedOptions = options;
                return {
                    status: "completed",
                    artifact: {
                        submittedAnswer: "4",
                        answerTaskId: dummyTask.taskId,
                        persistence: null,
                        errors: [],
                    },
                    imageId: null,
                    acp: null,
                    errors: [],
                };
            },
        } as unknown as IsolatedEnvironment;

        const result = await runGaiaSupervisor({
            task: dummyTask,
            dataRoot: "/tmp/fake-data",
            outputDirectory: tmpDir,
            llmAdapter: dummyAdapter,
            isolatedEnvironment: fakeIsolatedEnv,
        });

        // 验证 Supervisor 状态与答案评分
        assert.equal(result.status, "completed");
        assert.equal(result.domainResult.correct, true);
        assert.equal(result.domainResult.submittedAnswer, "4");

        // 验证传递给 IsolatedEnvironment 的 Spec 是 GaiaEnvironmentSpec
        assert.ok(capturedOptions !== undefined);
        assert.equal(capturedOptions.task.taskId, dummyTask.taskId);
        assert.equal(capturedOptions.spec.benchmarkId, "gaia");

        // 验证 sessionMeta 正确传递
        assert.ok(capturedOptions !== undefined && capturedOptions.acp !== undefined && capturedOptions.acp.sessionMeta !== undefined);
        const meta = capturedOptions.acp.sessionMeta as Record<string, unknown>;
        assert.equal(meta.taskId, dummyTask.taskId);
        assert.equal(meta.structuredOutputMode, "strict");
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("CLI eval gaia --tui 参数校验：缺失参数、非法模式、包含 resume 快速返回 2", async () => {
    // 缺失 --manifest 返回 2
    const code1 = await runGaiaEvalCli(["eval", "gaia", "--tui", "--task", "t-1", "--output-dir", "out"]);
    assert.equal(code1, 2);

    // 缺失 --task 返回 2
    const code2 = await runGaiaEvalCli(["eval", "gaia", "--tui", "--manifest", "m.json", "--output-dir", "out"]);
    assert.equal(code2, 2);

    // 缺失 --output-dir 返回 2
    const code3 = await runGaiaEvalCli(["eval", "gaia", "--tui", "--manifest", "m.json", "--task", "t-1"]);
    assert.equal(code3, 2);

    // 包含 --resume 返回 2
    const code4 = await runGaiaEvalCli(["eval", "gaia", "--tui", "--manifest", "m.json", "--task", "t-1", "--output-dir", "out", "--resume", "123"]);
    assert.equal(code4, 2);

    // 非法 mode 返回 2
    const code5 = await runGaiaEvalCli(["eval", "gaia", "--tui", "--manifest", "m.json", "--task", "t-1", "--output-dir", "out", "--mode", "bad"]);
    assert.equal(code5, 2);
});

test("CLI eval gaia --tui 正常命令成功进入 runner 并传递正确配置", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "gaia-tui-cli-"));
    const manifestFile = join(tmpDir, "manifest.json");
    const outDir = join(tmpDir, "out");

    const manifestData = {
        source: "huggingface",
        loadedAt: new Date().toISOString(),
        split: "validation",
        dataRoot: "/tmp/data",
        tasks: [
            {
                taskId: "gaia-tui-task-1",
                question: "What is 3+3?",
                expectedAnswer: "6",
                level: 1,
                split: "validation",
                attachments: [],
            },
        ],
    };

    const { writeFile } = await import("node:fs/promises");
    await writeFile(manifestFile, JSON.stringify(manifestData, null, 2));

    try {
        let capturedOptions: any;
        const exitCode = await runGaiaEvalCli(
            [
                "eval", "gaia",
                "--tui",
                "--manifest", manifestFile,
                "--task", "gaia-tui-task-1",
                "--output-dir", outDir,
                "--mode", "auto",
                "--max-steps", "20",
            ],
            {
                adapter: dummyAdapter,
                workerArtifact: {
                    tarballPath: "/tmp/fake.tar",
                    manifest: {
                        entrypoint: "fake",
                        nodeRuntime: { version: "20.0.0", platform: "linux", arch: "x64", downloadUrl: "fake", checksumSha256: "fake" },
                    },
                },
                runner: async (opts) => {
                    capturedOptions = opts;
                    return {
                        exitCode: 0,
                        status: "completed",
                        artifact: { submittedAnswer: "6" },
                        errors: [],
                    };
                },
            },
        );

        assert.equal(exitCode, 0);
        assert.ok(capturedOptions !== undefined);
        assert.equal(capturedOptions.benchmarkId, "gaia");
        assert.equal(capturedOptions.mode, "auto");
        assert.equal(capturedOptions.maxSteps, 20);
        assert.equal(capturedOptions.task.taskId, "gaia-tui-task-1");
        assert.equal(capturedOptions.descriptor.intent, "What is 3+3?");
        assert.equal(capturedOptions.descriptor.maxSteps, 20);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});
