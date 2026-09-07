import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    parseAlfworldEvalArgs,
    runAlfworldCli,
} from "../src/cli.js";
import {
    aggregateEvaluationReport,
    createEpisodeAttempt,
} from "../src/report.js";
import { ALFWORLD_MANIFEST_VERSION } from "../src/manifest.js";

const profile = {
    schemaVersion: 1,
    id: "alfworld-profile",
    name: "ALFWorld TextWorld",
    description: "Local ALFWorld TextWorld evaluation profile",
    systemPrompt: "ALFWorld TextWorld evaluator",
    instructions: [
        "Call alfworld_reset first.",
        "Use alfworld_step once per decision.",
        "Do not use Bash.",
        "Only complete when won=true.",
    ],
    toolIds: ["read_file", "grep", "alfworld_reset", "alfworld_step"],
};

test("parseAlfworldEvalArgs requires fixed eval alfworld command and manifest", () => {
    const command = parseAlfworldEvalArgs([
        "eval",
        "alfworld",
        "--manifest",
        "benchmarks/alfworld/manifests/smoke.json",
        "--profile",
        "alfworld-profile",
        "--min-success-rate",
        "0.75",
        "--max-infrastructure-retries",
        "2",
    ], "/workspace");

    assert.equal(command.profileId, "alfworld-profile");
    assert.equal(command.manifestPath, "/workspace/benchmarks/alfworld/manifests/smoke.json");
    assert.equal(command.minSuccessRate, 0.75);
    assert.equal(command.maxInfrastructureRetries, 2);
    assert.throws(
        () => parseAlfworldEvalArgs(["eval", "alfworld"]),
        /requires --manifest/,
    );
    assert.throws(
        () => parseAlfworldEvalArgs(["eval", "other", "--manifest", "x"]),
        /Usage:/,
    );
});

test("runAlfworldCli rejects a missing Profile before reading Conda or LLM settings", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-alfworld-cli-missing-profile-"));
    const errors: string[] = [];
    try {
        const exitCode = await runAlfworldCli(
            ["eval", "alfworld", "--manifest", "missing.json"],
            { cwd: workspace, env: {}, writeError: (message) => errors.push(message) },
        );
        assert.equal(exitCode, 1);
        assert.match(errors.join("\n"), /Profile/);
        assert.equal(errors.join("\n").includes("ALFWORLD_PYTHON"), false);
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
});

test("runAlfworldCli validates Bash-free Profile and writes a machine report before threshold exit", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-alfworld-cli-threshold-"));
    const dataRoot = join(workspace, "alfworld-data");
    const environmentFilePath = join(workspace, ".env.alfworld");
    const reportPath = join(workspace, "reports", "smoke.json");
    try {
        await mkdir(join(workspace, ".lazygoal/profiles"), { recursive: true });
        await mkdir(dataRoot, { recursive: true });
        await writeFile(
            environmentFilePath,
            `ALFWORLD_PYTHON="/fake/python"\nALFWORLD_DATA="${dataRoot}"\n`,
            "utf8",
        );
        await writeFile(
            join(workspace, ".lazygoal/profiles/alfworld-profile.json"),
            JSON.stringify(profile),
            "utf8",
        );
        const manifestPath = join(workspace, "manifest.json");
        await writeFile(manifestPath, JSON.stringify({
            version: ALFWORLD_MANIFEST_VERSION,
            name: "smoke",
            tasks: [{
                order: 0,
                taskId: "task-1",
                split: "valid_seen",
                gameFile: "valid_seen/task-1/game.tw-pddl",
                seed: 1,
                maxSteps: 10,
            }],
        }), "utf8");

        const output: string[] = [];
        const exitCode = await runAlfworldCli([
            "eval",
            "alfworld",
            "--manifest",
            manifestPath,
            "--report",
            reportPath,
            "--min-success-rate",
            "1",
        ], {
            cwd: workspace,
            env: { LLM_MODEL: "fake-model" },
            environmentFilePath,
            writeOutput: (text) => output.push(text),
            writeError: (message) => {
                throw new Error(message);
            },
            probePython: async (_executable, _script, env) => ({
                stdout: JSON.stringify({
                    pythonVersion: "3.9.19",
                    alfworldVersion: "0.4.2",
                    textworldVersion: "1.6.2",
                    dataRoot: env.ALFWORLD_DATA,
                    textworldOnly: true,
                }),
                stderr: "",
                exitCode: 0,
            }),
            evaluate: async (context) => {
                const attempt = createEpisodeAttempt(
                    context.manifest.tasks[0]!,
                    context.metadata,
                    {
                        environment: {
                            done: true,
                            won: true,
                            steps: 2,
                            goalConditionSuccessRate: 1,
                        },
                        model: { runStatus: "completed", completed: true },
                    },
                    0,
                    4,
                );
                return aggregateEvaluationReport(context.metadata, [attempt]);
            },
        });

        assert.equal(exitCode, 0);
        assert.deepEqual(output, []);
        const report = JSON.parse(await readFile(reportPath, "utf8")) as {
            summary: { successRate: number };
        };
        assert.equal(report.summary.successRate, 1);
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
});

test("runAlfworldCli returns non-zero while preserving stdout report when threshold is not met", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-alfworld-cli-fail-threshold-"));
    const dataRoot = join(workspace, "data");
    const output: string[] = [];
    try {
        await mkdir(join(workspace, ".lazygoal/profiles"), { recursive: true });
        await mkdir(dataRoot, { recursive: true });
        await writeFile(
            join(workspace, ".lazygoal/profiles/alfworld-profile.json"),
            JSON.stringify(profile),
            "utf8",
        );
        const manifestPath = join(workspace, "manifest.json");
        await writeFile(manifestPath, JSON.stringify({
            version: ALFWORLD_MANIFEST_VERSION,
            name: "smoke",
            tasks: [{
                order: 0,
                taskId: "task-1",
                split: "valid_seen",
                gameFile: "valid_seen/task-1/game.tw-pddl",
                seed: 1,
                maxSteps: 10,
            }],
        }), "utf8");

        const exitCode = await runAlfworldCli([
            "eval", "alfworld", "--manifest", manifestPath, "--min-success-rate", "1",
        ], {
            cwd: workspace,
            env: { ALFWORLD_PYTHON: "/fake/python", ALFWORLD_DATA: dataRoot },
            writeOutput: (text) => output.push(text),
            writeError: (message) => { throw new Error(message); },
            probePython: async (_executable, _script, env) => ({
                stdout: JSON.stringify({
                    pythonVersion: "3.9.19",
                    alfworldVersion: "0.4.2",
                    textworldVersion: "1.6.2",
                    dataRoot: env.ALFWORLD_DATA,
                    textworldOnly: true,
                }),
                stderr: "",
                exitCode: 0,
            }),
            evaluate: async (context) => aggregateEvaluationReport(context.metadata, []),
        });

        assert.equal(exitCode, 1);
        const report = JSON.parse(output.join("")) as { summary: { successRate: number } };
        assert.equal(report.summary.successRate, 0);
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
});

test("runAlfworldCli rejects missing or invalid LLM_STRUCTURED_OUTPUT_MODE in default evaluation", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-alfworld-cli-llm-mode-"));
    const dataRoot = join(workspace, "data");
    const errors: string[] = [];
    try {
        await mkdir(join(workspace, ".lazygoal/profiles"), { recursive: true });
        await mkdir(dataRoot, { recursive: true });
        await writeFile(
            join(workspace, ".lazygoal/profiles/alfworld-profile.json"),
            JSON.stringify(profile),
            "utf8",
        );
        const manifestPath = join(workspace, "manifest.json");
        await writeFile(manifestPath, JSON.stringify({
            version: ALFWORLD_MANIFEST_VERSION,
            name: "smoke",
            tasks: [{
                order: 0,
                taskId: "task-1",
                split: "valid_seen",
                gameFile: "valid_seen/task-1/game.tw-pddl",
                seed: 1,
                maxSteps: 10,
            }],
        }), "utf8");

        const probePython = async () => ({
            stdout: JSON.stringify({
                pythonVersion: "3.9.19",
                alfworldVersion: "0.4.2",
                textworldVersion: "1.6.2",
                dataRoot,
                textworldOnly: true,
            }),
            stderr: "",
            exitCode: 0,
        });

        // 1. Missing mode
        const missingExit = await runAlfworldCli([
            "eval", "alfworld", "--manifest", manifestPath,
        ], {
            cwd: workspace,
            env: {
                ALFWORLD_PYTHON: "/fake/python",
                ALFWORLD_DATA: dataRoot,
                LLM_API_KEY: "test-key",
                LLM_BASE_URL: "http://127.0.0.1/v1",
                LLM_MODEL: "test-model",
            },
            writeError: (message) => errors.push(message),
            probePython,
        });
        assert.equal(missingExit, 1);
        assert.match(errors.join("\n"), /Missing required .* LLM_STRUCTURED_OUTPUT_MODE/);

        // 2. Invalid mode
        errors.length = 0;
        const invalidExit = await runAlfworldCli([
            "eval", "alfworld", "--manifest", manifestPath,
        ], {
            cwd: workspace,
            env: {
                ALFWORLD_PYTHON: "/fake/python",
                ALFWORLD_DATA: dataRoot,
                LLM_API_KEY: "test-key",
                LLM_BASE_URL: "http://127.0.0.1/v1",
                LLM_MODEL: "test-model",
                LLM_STRUCTURED_OUTPUT_MODE: "invalid_mode",
            },
            writeError: (message) => errors.push(message),
            probePython,
        });
        assert.equal(invalidExit, 1);
        assert.match(errors.join("\n"), /Invalid LLM_STRUCTURED_OUTPUT_MODE "invalid_mode"/);
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
});
