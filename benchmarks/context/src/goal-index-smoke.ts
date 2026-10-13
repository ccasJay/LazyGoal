import { readFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import { WORKER_NODE_IMAGE } from "../../src/worker-builder.js";
import { resolveBenchmarkHomePaths } from "../../src/default-paths.js";
import { buildContextWorker, captureScenario, runPairedCase, type ModelRole } from "./runner.js";
import { loadContextRoles } from "./cli.js";
import { freezeCandidate, reviewCandidate } from "./corpus.js";
import { parseScenario } from "./scenario.js";

/**
 * 目标上下文索引与分层检索探针。
 * 支持传入真实模型配置 (--config) 执行，也支持无配置时自动使用确定性离线替身执行 Docker 容器探针与质量验证。
 *
 * @param configPath - 可选的真实模型配置文件路径。
 * @param output - 可选的输出目录。
 * @param signal - 可选的取消信号。
 * @returns 最终运行证据目录路径。
 *
 * @example
 * ```ts
 * const outDir = await runGoalIndexSmoke(configPath, outputDir);
 * ```
 */
export async function runGoalIndexSmoke(configPath?: string, output?: string, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    const directory = output ?? (configPath
        ? join((await resolveBenchmarkHomePaths(process.cwd(), "context")).runsDirectory, "goal-index-smoke-" + randomUUID())
        : await mkdtemp(join(tmpdir(), "context-goal-index-smoke-")));

    await mkdir(directory, { recursive: true });
    const worker = await buildContextWorker(process.cwd(), join(directory, "cache"));

    if (configPath) {
        // 真实模型执行路径
        const config = JSON.parse(await readFile(configPath, "utf8"));
        const roles = await loadContextRoles(config.roles, dirname(configPath));
        let failed = false;

        const scenario = parseScenario({
            id: "goal-index-smoke-real",
            image: WORKER_NODE_IMAGE,
            initialFiles: { "config.json": '{"mode":"development","database":"sqlite"}' },
            checkpointAfter: 0,
            profile: {
                id: "context-index-smoke",
                systemPrompt: "Follow the current request. Use context_shell to inspect, edit and verify project files. Check navigation for historical decisions.",
                instructions: ["Pass memoryPatch as null and contextNotes as null for these verification tasks."],
                toolIds: ["context_shell"],
            },
            budget: { maxSteps: 15, maxCalls: 40, stageTimeoutMs: 120000, totalTimeoutMs: 240000 },
            stages: [
                {
                    operation: "launch",
                    prompt: "Inspect configuration and wait for confirmation",
                    expect: "waiting",
                    waitingFor: "blocked",
                },
                {
                    operation: "resume",
                    prompt: "In config.json, update database to postgresql as per production requirement. Verify config.json and complete.",
                    expect: "completed",
                },
            ],
            verifier: `/opt/lazygoal/node -e 'const c=require("./config.json");if(c.database!=="postgresql")process.exit(1);console.log(JSON.stringify(c))'`,
            rubric: { text: "The database configuration must be postgresql.", threshold: 0.8 },
            limitations: "Goal index evaluation probe.",
        });

        try {
            const candidate = await captureScenario(scenario, worker, roles.capture, join(directory, "capture"), signal);
            const frozen = await freezeCandidate(candidate, join(directory, "corpus"), "challenge", "index-smoke", await reviewCandidate(candidate), "goal-index-fixture");
            const report = await runPairedCase(frozen, worker, roles.execution, roles.judge, join(directory, "pair"), signal);
            failed ||= !report.pairable || report.groups.some(group => group.score?.combined !== "passed");
        } catch (error) {
            failed = true;
            process.stderr.write("Real model goal index smoke failed: " + String(error) + "\n");
        }

        if (failed) throw new Error("Goal index smoke did not pass; evidence: " + directory);
        return directory;
    }

    // 离线确定性探针路径
    const scenario = parseScenario({
        id: "goal-index-smoke-offline",
        image: WORKER_NODE_IMAGE,
        initialFiles: { "config.json": '{"database":"sqlite"}' },
        checkpointAfter: 0,
        profile: {
            id: "context-index-smoke-offline",
            systemPrompt: "Follow the current request using context_shell.",
            instructions: [],
            toolIds: ["context_shell"],
        },
        budget: { maxSteps: 8, maxCalls: 20, stageTimeoutMs: 30000, totalTimeoutMs: 90000 },
        stages: [
            {
                operation: "launch",
                prompt: "Wait for confirmation",
                expect: "waiting",
                waitingFor: "blocked",
            },
            {
                operation: "resume",
                prompt: "Update database to postgresql",
                expect: "completed",
            },
        ],
        verifier: "test -f config.json",
        rubric: { text: "Database updated", threshold: 0.5 },
        limitations: "Deterministic offline substitute.",
    });

    const adapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        generate: async request => {
            const messages = JSON.stringify(request.messages);
            const result = request.tools?.[0]?.id === "system_review_completion"
                ? { kind: "accept" }
                : messages.includes("Update database")
                    ? {
                        kind: "complete",
                        summary: "Database updated to postgresql",
                        evidenceSequences: [],
                        memoryPatch: null,
                        contextNotes: null,
                    }
                    : {
                        kind: "wait",
                        reason: "Wait for confirmation",
                        memoryPatch: null,
                        contextNotes: null,
                    };
            return { content: JSON.stringify({ result }) };
        },
    };

    const judge: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        generate: async () => ({
            content: JSON.stringify({ score: 1, rationale: "Database updated", evidence: ["output"] }),
        }),
    };

    const candidate = await captureScenario(scenario, worker, { id: "offline-index-capture", adapter }, join(directory, "capture"));
    const hash = await reviewCandidate(candidate);
    const frozen = await freezeCandidate(candidate, join(directory, "corpus"), "challenge", "smoke", hash, "goal-index-smoke-fixture");
    const report = await runPairedCase(frozen, worker, { id: "offline-index-execution", adapter }, { id: "offline-index-judge", adapter: judge }, join(directory, "pair"));

    if (!report.pairable || report.groups.some(group => group.score?.combined !== "passed")) {
        throw new Error("Goal index offline smoke failed: " + join(directory, "pair", "report.json"));
    }

    await writeFile(
        join(directory, "smoke-result.json"),
        JSON.stringify({ status: "passed", type: "goal-index-smoke", timestamp: Date.now() }, null, 2),
    );

    return directory;
}

if (process.argv[1]?.endsWith("goal-index-smoke.ts")) {
    const { values } = parseArgs({ options: { config: { type: "string" }, output: { type: "string" } } });
    const controller = new AbortController();
    const cancel = () => controller.abort();
    process.once("SIGINT", cancel);
    process.once("SIGTERM", cancel);
    runGoalIndexSmoke(values.config ? resolve(values.config) : undefined, values.output ? resolve(values.output) : undefined, controller.signal)
        .then(path => process.stdout.write(path + "\n"))
        .catch(error => {
            process.stderr.write(String(error) + "\n");
            process.exitCode = 1;
        })
        .finally(() => {
            process.removeListener("SIGINT", cancel);
            process.removeListener("SIGTERM", cancel);
        });
}
