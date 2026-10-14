import { readFile, mkdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { WORKER_NODE_IMAGE } from "../../src/worker-builder.js";
import { resolveBenchmarkHomePaths } from "../../src/default-paths.js";
import { buildContextWorker, captureScenario, runPairedCase } from "./runner.js";
import { loadContextRoles } from "./cli.js";
import { freezeCandidate, reviewCandidate } from "./corpus.js";
import { parseScenario } from "./scenario.js";

/** 真实模型底座探针，三个角色必须由显式配置指定，不自动降级替身。 */
export async function runModelSmoke(configPath: string, output?: string, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const roles = await loadContextRoles(config.roles, dirname(configPath));
    const paths = await resolveBenchmarkHomePaths(process.cwd(), "context");
    const directory = output ?? join(paths.runsDirectory, "model-smoke-" + randomUUID());
    await mkdir(directory, { recursive: true });
    const worker = await buildContextWorker(process.cwd(), join(paths.cacheDirectory, "worker"));
    let failed = false;
    for (const kind of ["continue", "resume"] as const) {
        signal?.throwIfAborted();
        const scenario = parseScenario({
            id: "model-smoke-" + kind, image: WORKER_NODE_IMAGE, initialFiles: { "config.json": '{"timeout":5}' }, checkpointAfter: 0,
            profile: { id: "context-model-smoke", systemPrompt: "Follow the current request. Use context_shell to inspect, edit and verify project files. Pause only when explicitly requested.", instructions: ["Act on the latest user request for the current Run. Earlier requests and the original Goal intent are background. For these infrastructure fixture tasks, pass memoryPatch as null; do not record temporary file configuration in working memory. Do not add protocolVersion at the top level of any tool arguments; use only fields declared by that tool schema."], toolIds: ["context_shell"] },
            budget: { maxSteps: 15, maxCalls: 40, stageTimeoutMs: 120000, totalTimeoutMs: 240000 },
            stages: [
                { operation: "launch", prompt: kind === "continue"
                    ? "In config.json set timeout to 30, preserving other values. Verify the file, report the current value, and complete this request."
                    : "In config.json set timeout to 30, preserving other values. Verify the file. Then use ask_user to ask exactly one question for the retry count. After the user answers, set retryCount to that count, verify config.json, explain timeout and retryCount, and complete. Do not complete before receiving the answer.",
                    expect: kind === "resume" ? "waiting" : "completed", ...(kind === "resume" ? { waitingFor: "ask_user" } : {}) },
                { operation: kind, prompt: kind === "resume" ? "3" : "Set retryCount to 3 in config.json, retaining the existing timeout. Verify the resulting file and explain its current timeout and retryCount. Complete the request.", expect: "completed", ...(kind === "resume" ? { answers: [{ questionId: "q-1", answer: "3" }] } : {}) },
            ],
            verifier: `/opt/lazygoal/node -e 'const c=require("./config.json");if(c.timeout!==30||c.retryCount!==3)process.exit(1);console.log(JSON.stringify(c))'`,
            rubric: { text: "The explanation must correctly state timeout=30 and retryCount=3 and refer to verification of config.json.", threshold: 0.8 },
            limitations: "Two infrastructure scenarios without working-memory patch updates; no claim of broad context quality or strict causal improvement.",
        });
        try {
            const candidate = await captureScenario(scenario, worker, roles.capture, join(directory, kind, "capture"), signal);
            const frozen = await freezeCandidate(candidate, join(directory, "corpus"), "challenge", "model-smoke", await reviewCandidate(candidate), "test-only-review-action-fixture");
            const report = await runPairedCase(frozen, worker, roles.execution, roles.judge, join(directory, kind, "pair"), signal);
            const checkpoint = JSON.parse(await readFile(join(candidate, "checkpoint.json"), "utf8"));
            const restored = report.groups[0]?.stages[0]?.boundary;
            if (restored !== undefined && (restored.workerInstanceId === checkpoint.boundary.workerInstanceId || restored.goalId !== checkpoint.boundary.goalId ||
                ((kind === "resume") !== (restored.runId === checkpoint.boundary.runId)))) throw new Error("Real Worker/Goal/Run restoration identity mismatch");
            failed ||= !report.pairable || report.groups.some(group => group.score?.combined !== "passed");
        } catch (error) { failed = true; process.stderr.write(kind + ": " + String(error) + "\n"); }
    }
    if (failed) throw new Error("Real model smoke did not pass; evidence: " + directory);
    return directory;
}
if (process.argv[1]?.endsWith("model-smoke.ts")) {
    const { values } = parseArgs({ options: { config: { type: "string" }, output: { type: "string" } } });
    if (!values.config) { process.stderr.write("Model smoke requires --config\n"); process.exitCode = 1; }
    else {
        const controller = new AbortController();
        const cancel = () => controller.abort();
        process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
        runModelSmoke(resolve(values.config), values.output === undefined ? undefined : resolve(values.output), controller.signal)
            .then(path => process.stdout.write(path + "\n"))
            .catch(error => { process.stderr.write(String(error) + "\n"); process.exitCode = 1; })
            .finally(() => { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); });
    }
}
