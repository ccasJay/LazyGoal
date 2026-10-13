import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import { WORKER_NODE_IMAGE } from "../../src/worker-builder.js";
import { captureScenario, buildContextWorker, runPairedCase } from "./runner.js";
import { freezeCandidate, reviewCandidate } from "./corpus.js";
import { JsonFileBenchmarkPersistenceAdapter } from "../../src/file-persistence-adapter.js";
import { parseScenario } from "./scenario.js";

/** 离线替身只用于 Docker 生命周期探针，不替代真实模型验收。 */
export async function runWorkerSmoke(output?: string): Promise<string> {
    const directory = output ?? await mkdtemp(join(tmpdir(), "context-worker-smoke-"));
    const worker = await buildContextWorker(process.cwd(), join(directory, "cache"));
    for (const kind of ["retry", "waiting"] as const) {
        const scenario = parseScenario({
            id: "smoke-" + kind, image: WORKER_NODE_IMAGE, initialFiles: { "config.json": '{"timeout":30}' }, checkpointAfter: 0,
            profile: { id: "context-smoke", systemPrompt: "Follow the current request using context_shell.", instructions: [], toolIds: ["context_shell"] },
            budget: { maxSteps: 8, maxCalls: 20, stageTimeoutMs: 30000, totalTimeoutMs: 90000 },
            stages: [{ operation: "launch", prompt: kind === "retry" ? "Expected failure" : "Wait for user input", expect: kind === "retry" ? "failed" : "waiting", ...(kind === "waiting" ? { waitingFor: "blocked" } : {}) },
                { operation: kind === "retry" ? "continue" : "resume", prompt: "Say hello. FuturePromptSentinel_7139", expect: "completed" }],
            verifier: "test -f config.json && test ! -e hidden-verifier.json # HiddenVerifierSentinel_2197",
            rubric: { text: "The answer must greet the user. HiddenRubricSentinel_4081", threshold: 0.5 }, limitations: "Infrastructure smoke with deterministic model substitute.",
        });
        const adapter: LLMAdapter = { structuredOutputMode: "prompt_only", generate: async request => {
            const messages = JSON.stringify(request.messages);
            const result = request.tools?.[0]?.id === "system_review_completion" ? { kind: "accept" }
                : messages.includes("Say hello") ? { kind: "complete", summary: "Hello.", evidenceSequences: [], memoryPatch: null, contextNotes: null }
                : kind === "retry" ? { kind: "fail", error: "Expected probe failure", memoryPatch: null, contextNotes: null }
                : { kind: "wait", reason: "Await user input", memoryPatch: null, contextNotes: null };
            return { content: JSON.stringify({ result }) };
        } };
        const judge: LLMAdapter = { structuredOutputMode: "prompt_only", generate: async () => ({ content: JSON.stringify({ score: 1, rationale: "The supplied output is a greeting.", evidence: ["output"] }) }) };
        const candidate = await captureScenario(scenario, worker, { id: "offline-probe-capture", adapter }, join(directory, kind, "capture"));
        const checkpoint = JSON.parse(await readFile(join(candidate, "checkpoint.json"), "utf8"));
        const bindings = await new JsonFileBenchmarkPersistenceAdapter({ rootDirectory: join(candidate, "state"), namespaceFor: () => "session" }).open({
            benchmarkId: "context", namespace: "session", goalId: checkpoint.boundary.goalId, runId: checkpoint.boundary.runId,
        });
        const encode = (value: string) => Buffer.from(value).toString("base64url");
        const traceFile = join(candidate, "state", encode("context"), encode("session"), "traces", encode(checkpoint.boundary.goalId), encode(checkpoint.boundary.runId) + ".jsonl");
        const traces = (await readFile(traceFile, "utf8")).trim().split("\n").map(line => JSON.parse(line));
        const requestTrace = traces.find(record => record.kind === "model_request");
        if (typeof requestTrace?.payload.callId !== "string" || !traces.some(record => record.kind === "model_response" && record.payload.callId === requestTrace.payload.callId)) {
            throw new Error("Correlated model diagnostics were not collected");
        }
        const inputs = JSON.stringify(await bindings.modelInputStore!.read(checkpoint.boundary.goalId, checkpoint.boundary.runId));
        for (const secret of ["FuturePromptSentinel_7139", "HiddenVerifierSentinel_2197", "HiddenRubricSentinel_4081"]) {
            if (inputs.includes(secret)) throw new Error("Hidden material leaked into captured model input");
        }
        const hash = await reviewCandidate(candidate);
        const frozen = await freezeCandidate(candidate, join(directory, "corpus"), "challenge", "smoke", hash, "explicit-infrastructure-smoke");
        const report = await runPairedCase(frozen, worker, { id: "offline-probe-execution", adapter }, { id: "offline-probe-judge", adapter: judge }, join(directory, kind, "pair"));
        if (!report.pairable || report.groups.some(group => group.score?.combined !== "passed")) throw new Error("Worker smoke failed: " + join(directory, kind, "pair", "report.json"));
        const original = JSON.parse(await readFile(join(candidate, "checkpoint.json"), "utf8")).boundary;
        const restored = report.groups[0]!.stages[0]!.boundary;
        if (original.workerInstanceId === restored.workerInstanceId || original.goalId !== restored.goalId || ((kind === "waiting") !== (original.runId === restored.runId))) throw new Error("Recovery identity mismatch");
    }
    const failureScenario = parseScenario({
        id: "smoke-budget", image: WORKER_NODE_IMAGE, initialFiles: { "config.json": "{}" }, checkpointAfter: 0,
        profile: { id: "budget-smoke", systemPrompt: "Follow the request.", instructions: [], toolIds: ["context_shell"] },
        budget: { maxSteps: 8, maxCalls: 1, stageTimeoutMs: 30000, totalTimeoutMs: 90000 },
        stages: [{ operation: "launch", prompt: "Expected failure", expect: "failed" }, { operation: "continue", prompt: "Say hello", expect: "completed" }],
        verifier: "test -f config.json", rubric: { text: "A greeting", threshold: 0.5 }, limitations: "Controlled call budget termination.",
    });
    const budgetAdapter: LLMAdapter = { structuredOutputMode: "prompt_only", generate: async request => ({
        content: JSON.stringify({ result: JSON.stringify(request.messages).includes("Say hello")
            ? { kind: "complete", summary: "Hello.", evidenceSequences: [], memoryPatch: null, contextNotes: null }
            : { kind: "fail", error: "Expected failure", memoryPatch: null, contextNotes: null } }),
    }) };
    const highJudge: LLMAdapter = { structuredOutputMode: "prompt_only", generate: async () => ({ content: JSON.stringify({ score: 1, rationale: "Hello", evidence: ["output"] }) }) };
    const budgetCandidate = await captureScenario(failureScenario, worker, { id: "offline-budget", adapter: budgetAdapter }, join(directory, "budget", "capture"));
    const budgetFrozen = await freezeCandidate(budgetCandidate, join(directory, "corpus"), "challenge", "smoke", await reviewCandidate(budgetCandidate), "test-only-review-action-fixture");
    const budgetReport = await runPairedCase(budgetFrozen, worker, { id: "offline-budget", adapter: budgetAdapter }, { id: "offline-high-judge", adapter: highJudge }, join(directory, "budget", "pair"));
    if (budgetReport.groups.some(group => group.category !== "budget_exceeded" || group.score?.combined !== "failed")) throw new Error("Budget termination was not recorded correctly");
    await writeFile(join(directory, "smoke-result.json"), JSON.stringify({ status: "passed", checks: ["cross-run", "waiting-restart", "paired-isolation", "hidden-materials", "call-budget", "grading-priority", "collected-model-diagnostics"], offlineModelSubstitute: true }, null, 2));
    return directory;
}
if (process.argv[1]?.endsWith("worker-smoke.ts")) {
    runWorkerSmoke().then(directory => process.stdout.write(directory + "\n")).catch(error => { process.stderr.write(String(error) + "\n"); process.exitCode = 1; });
}
