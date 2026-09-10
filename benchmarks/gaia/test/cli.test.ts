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
    providerName: "mock",
    modelName: "mock-model",
    structuredOutputMode: "strict",
    async generate(request: LLMRequest): Promise<LLMResponse> {
        return {
            content: "4",
            raw: "4",
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
                    durationMs: 500,
                    usage: null,
                    errors: [],
                    artifacts: {
                        submittedAnswer: "4",
                        answerTaskId: dummyTask.taskId,
                        persistence: null,
                        errors: [],
                    },
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
        assert.equal(capturedOptions.acp.sessionMeta.taskId, dummyTask.taskId);
        assert.equal(capturedOptions.acp.sessionMeta.structuredOutputMode, "strict");
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});
