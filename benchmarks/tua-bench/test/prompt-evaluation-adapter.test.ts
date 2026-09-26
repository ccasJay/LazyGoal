import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { IsolatedEnvironment } from "../../src/isolated-environment.js";
import type { PromptEvaluationTaskInput } from "../../src/prompt-evaluation/runner.js";
import { TuaBenchPromptEvaluationAdapter } from "../src/prompt-evaluation-adapter.js";
import { TUA_BENCH_WORKER_PROFILE } from "../src/worker-entry.js";
import type { TuaBenchManifest, TuaBenchTaskDefinition } from "../src/types.js";

const task: TuaBenchTaskDefinition = {
    taskId: "task-1",
    name: "task-1",
    instruction: "edit a file",
    taskFamily: "document",
    imageRef: "tua-bench/task-1:latest",
    networkMode: "none",
    agentTimeoutSec: 60,
    verifierTimeoutSec: 60,
    verifierUser: "root",
    taskDir: "/tmp/tua-task-1",
    verifierPath: "tests/test.sh",
};

describe("TuaBenchPromptEvaluationAdapter", () => {
    it("uses the official finite reward as metricScore and exposes only the safe score projection", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "tua-prompt-eval-"));
        try {
            const manifestPath = path.join(root, "task.json");
            await writeFile(manifestPath, JSON.stringify({
                benchmark: "tua-bench",
                repoRoot: root,
                tasks: [{ taskId: task.taskId }],
            }));
            const manifest: TuaBenchManifest = {
                tasks: [task],
                repoRoot: root,
                loadedAt: "2026-09-24T00:00:00.000Z",
                byFamily: { document: [task] },
            };
            let runInput: Record<string, unknown> | undefined;
            const isolatedEnvironment = {
                async run(input: Record<string, unknown>) {
                    runInput = input;
                    return {
                        status: "completed",
                        artifact: {
                            reward: 0.4,
                            rewardRaw: "0.4",
                            verifierStdout: "private verifier output",
                            verifierStderr: "",
                            verifierExitCode: 0,
                            domainResult: {
                                taskFamily: "document",
                                passed: false,
                                reward: 0.4,
                                verifierOutput: "private verifier output",
                                verifierError: null,
                            },
                        },
                        errors: [],
                    };
                },
            } as unknown as IsolatedEnvironment;
            const adapter = new TuaBenchPromptEvaluationAdapter({
                isolatedEnvironment,
                loadManifestFile: async () => manifest,
            });
            const tasks = await adapter.loadManifest(manifestPath);
            assert.deepEqual(tasks, [task]);

            const profile = {
                ...TUA_BENCH_WORKER_PROFILE,
                systemPrompt: "candidate prompt",
                instructions: ["candidate instruction"],
            };
            const llmAdapter = { structuredOutputMode: "strict" } as PromptEvaluationTaskInput<TuaBenchTaskDefinition>["llmAdapter"];
            const result = await adapter.runTask({
                evaluationId: "eval-1",
                candidateId: "candidate-1",
                modelConfigId: "default",
                modelId: "model-1",
                task,
                profile,
                baseProfile: TUA_BENCH_WORKER_PROFILE,
                fingerprint: {
                    promptSha256: "a".repeat(64),
                    promptSummary: {
                        systemPromptCharacters: 15,
                        instructionCount: 1,
                        instructionCharacters: 21,
                    },
                },
                outputDirectory: root,
                llmAdapter,
            });

            assert.equal(result.status, "failed");
            assert.equal(result.metricScore, 0.4);
            assert.deepEqual(result.domainResult, {
                taskFamily: "document",
                passed: false,
                reward: 0.4,
            });
            assert.equal(JSON.stringify(result).includes("private verifier output"), false);
            assert.equal((runInput?.acp as { sessionMeta: Record<string, unknown> }).sessionMeta.profile, profile);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("returns an infrastructure result without metricScore when the verifier boundary fails", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "tua-prompt-eval-error-"));
        try {
            const adapter = new TuaBenchPromptEvaluationAdapter({
                isolatedEnvironment: {
                    async run() {
                        return {
                            status: "infrastructure_error",
                            artifact: null,
                            errors: [{ stage: "artifact_collect", message: "TUA verifier isolation failed" }],
                        };
                    },
                } as unknown as IsolatedEnvironment,
                loadManifestFile: async () => ({
                    tasks: [task], repoRoot: root, loadedAt: "2026-09-24T00:00:00.000Z", byFamily: {},
                }),
            });
            const llmAdapter = { structuredOutputMode: "strict" } as PromptEvaluationTaskInput<TuaBenchTaskDefinition>["llmAdapter"];
            const result = await adapter.runTask({
                evaluationId: "eval-1", candidateId: "candidate-1", modelConfigId: "default", modelId: "model-1",
                task, profile: TUA_BENCH_WORKER_PROFILE, baseProfile: TUA_BENCH_WORKER_PROFILE,
                fingerprint: {
                    promptSha256: "a".repeat(64),
                    promptSummary: { systemPromptCharacters: 1, instructionCount: 1, instructionCharacters: 1 },
                },
                outputDirectory: root, llmAdapter,
            });

            assert.equal(result.status, "infrastructure_error");
            assert.equal(result.domainResult, null);
            assert.equal("metricScore" in result, false);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
