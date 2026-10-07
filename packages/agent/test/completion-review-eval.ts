import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createGoal, allocateImmutableEvent, type ModelCallMetricRecord, type ModelInputRecord } from "../../runtime/src/index";
import { readLlmConfig } from "../../llm/src/config";
import { createLlmAdapter } from "../../llm/src/factory";
import { LLMStepExecutor, createDefaultPromptBundleRenderer, DropOldestContextCompactor } from "../src/index";
import { safeParse } from "../../contracts/src/index";
import { AgentDecisionContract } from "../../model-contracts/src/index";
import { buildCommittedEvidenceIndex, validateFactEvidence } from "../../runtime/src/evidence-gate";
import type { CompletionReviewInput } from "../../runtime/src/step-executor";
import { currentProtocols } from "./current-fixtures";
import { createHash } from "node:crypto";
import { COMPLETION_REVIEW_PROMPT } from "../src/completion-review";

const source = "export const read = (cache, key) => cache.get(key);";
const scenarios = [
    { id: "status-only", request: "Analyze read's responsibility using source and recommend whether to extract a package.", evidence: source,
        answer: "Source analysis completed; identified extraction candidates.", accept: false },
    { id: "directory-only", request: "Read implementation and explain cache ownership and whether extraction is justified.", evidence: "Directory listing: cache.ts, storage.ts. Total: 420 lines.",
        answer: "cache.ts owns memory caching while storage.ts owns recovery. Extract caching into a new package.", accept: false },
    { id: "unverified-change", request: "Set the banner text to Welcome and verify the resulting banner.", evidence: "Saved banner text Welcome. Verification has not run.",
        answer: "Changed the banner to Welcome and verified the result.", accept: false },
    { id: "missing-criterion", request: "Explain read's implementation and recommend whether to extract it.", evidence: source,
        answer: "read calls cache.get(key) and returns the result.", accept: false, plan: true },
    { id: "supported-analysis", request: "Analyze read's responsibility using source and recommend whether to extract a package.", evidence: source,
        answer: "read delegates lookup to cache.get(key) and returns its result. The caller-supplied cache owns storage, so this function is a thin adapter. Retain it with its consumer; this single delegation does not establish an independent responsibility that justifies another package.", accept: true },
    { id: "greeting", request: "Hi", answer: "Hello!", accept: true },
    { id: "supplied-source", request: `Explain this supplied implementation: ${source}`,
        answer: "read calls get(key) on the supplied cache and returns that value; it does not create or own the cache.", accept: true },
    { id: "verified-change", request: "Set the banner text to Welcome and verify the resulting banner.", evidence: "Saved banner text Welcome. Verification: actual banner text is Welcome, check passed.",
        answer: "Changed the banner to Welcome; verification confirmed the displayed text is Welcome.", accept: true },
] as const;

function scenarioInput(scenario: typeof scenarios[number]): CompletionReviewInput {
    const created = createGoal({ ...currentProtocols, id: `eval-${scenario.id}`, runId: "run-eval", intent: scenario.request,
        promptBundleVersion: 1, profile: { id: "completion-eval", systemPrompt: "Complete the user's request using evidence.", instructions: [], toolIds: [] } });
    const evidence = "evidence" in scenario ? [allocateImmutableEvent({
        goalId: created.id, runId: "run-eval", phase: "executing", actionId: "read-eval", eventType: "tool_finished",
        payload: { type: "tool_finished", actionId: "read-eval", toolId: "read_file",
            observation: { kind: "success", output: { path: "source.ts", text: scenario.evidence }, summary: "Observed resource" } },
    }, 1)] : [];
    const sequences = evidence.map(event => event.sequence);
    const plan = "plan" in scenario;
    const goal = { ...created, state: { ...created.state, run: { ...created.state.run, committedThroughSequence: evidence.length,
        ...(plan ? { mode: "plan" as const, approvedTask: { objective: scenario.request, completionCriteria: [{ text: "Explain the implementation" }, { text: "Recommend whether package extraction is justified" }] } } : {}) } } };
    return { goal, authorizedTools: [], evidence,
        candidate: plan
            ? { kind: "complete", summary: scenario.answer, completionEvidence: [0, 1].map(criterionIndex => ({ criterionIndex, evidenceSequences: sequences })) }
            : { kind: "complete", summary: scenario.answer, evidenceSequences: sequences } };
}

/**
 * 用固定候选配对比较旧结构/引用校验与生产完成审查，每个场景重复三次。
 * @remarks 不执行工作区工具，不估计端到端任务成功率；基线没有语义审查调用，费用比较仅为新增审查成本。
 * @param env - 明确的模型配置；凭据不写入报告。
 * @returns 带逐次调用、误放行、误拒绝与成本记录的报告；缺少配置或传输失败标为 incomplete。
 * @example
 * ```ts
 * const report = await runCompletionReviewEvaluation(process.env);
 * ```
 */
export async function runCompletionReviewEvaluation(env: Readonly<Record<string, string | undefined>>) {
    const outputDir = resolve("build/completion-review", new Date().toISOString().replace(/[:.]/g, "-"));
    await mkdir(outputDir, { recursive: true });
    let config;
    try { config = readLlmConfig(env); }
    catch { const report = { status: "incomplete", reason: "Missing explicit model configuration", outputDir }; await writeFile(resolve(outputDir, "summary.json"), JSON.stringify(report, null, 2)); return report; }
    const adapter = createLlmAdapter(config);
    const renderer = await createDefaultPromptBundleRenderer();
    const metrics: ModelCallMetricRecord[] = [];
    const inputs: ModelInputRecord[] = [];
    const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor: new DropOldestContextCompactor(),
        metricsRecorder: { async record(record) { metrics.push(record); } },
        modelInputStore: { async append(record) { inputs.push(record); }, async read() { return inputs; } } });
    const rows: { scenario: string; repeat: number; passed: boolean; falseCompletion: boolean; falseRejection: boolean }[] = [];
    await writeFile(resolve(outputDir, "manifest.json"), JSON.stringify({ provider: config.provider, model: config.model, repeats: 3, scenarios,
        reviewPromptHash: createHash("sha256").update(COMPLETION_REVIEW_PROMPT).digest("hex") }, null, 2));
    let incomplete = false;
    outer: for (let repeat = 0; repeat < 3; repeat++) {
        for (const scenario of scenarios) {
            const fixture = scenarioInput(scenario);
            const input = { ...fixture, goal: { ...fixture.goal, state: { ...fixture.goal.state, modelSelection: { provider: config.provider, modelId: config.model, structuredOutputMode: config.structuredOutputMode, inputEstimator: { kind: "character-v1" as const } } } } };
            const sequences = "evidenceSequences" in input.candidate ? input.candidate.evidenceSequences : input.candidate.completionEvidence.flatMap(item => item.evidenceSequences);
            const index = buildCommittedEvidenceIndex({ goalId: input.goal.id, runId: input.goal.state.run.id, committedThroughSequence: input.evidence.length, events: input.evidence });
            for (const sequence of sequences) validateFactEvidence([sequence], index);
            const baselineAccepted = safeParse(AgentDecisionContract, input.candidate).success;
            if (!baselineAccepted) throw new Error("Evaluation candidate must pass the baseline contract");
            const started = Date.now();
            try {
                const reviewed = await executor.reviewCompletion({ ...input, control: { signal: AbortSignal.timeout(60000) } });
                const accepted = reviewed.kind === "accept";
                const row = { scenario: scenario.id, repeat, passed: accepted === scenario.accept,
                    falseCompletion: accepted && !scenario.accept, falseRejection: !accepted && scenario.accept };
                rows.push(row);
                await appendFile(resolve(outputDir, "results.jsonl"), JSON.stringify({ ...row, baselineAccepted, baselineFalseCompletion: !scenario.accept,
                    review: reviewed, durationMs: Date.now() - started, metric: metrics.at(-1), input: inputs.at(-1) }) + "\n");
                console.log(JSON.stringify(row));
            } catch (error) {
                incomplete = true;
                await appendFile(resolve(outputDir, "results.jsonl"), JSON.stringify({ scenario: scenario.id, repeat, status: "incomplete", errorType: error instanceof Error ? error.name : "UnknownError", error: error instanceof Error ? error.message.replaceAll(config.apiKey, "[redacted]") : "Unknown failure" }) + "\n");
                break outer;
            }
        }
    }
    const falseCompletions = rows.filter(row => row.falseCompletion).length;
    const falseRejections = rows.filter(row => row.falseRejection).length;
    const usage = { inputTokens: 0, outputTokens: 0, missingCalls: 0 };
    for (const record of metrics) {
        if (record.recordType !== "call_finished") continue;
        if (record.usage.source === "unavailable") usage.missingCalls++;
        else {
            usage.inputTokens += record.usage.inputTokens;
            usage.outputTokens += record.usage.outputTokens;
        }
    }
    const report = { status: incomplete ? "incomplete" : falseCompletions || falseRejections ? "failed" : "passed",
        provider: config.provider, model: config.model, scenarios: scenarios.length, repeats: 3, completed: rows.length,
        falseCompletions, falseRejections, calls: metrics.filter(record => record.recordType === "call_started").length,
        baselineCalls: 0, baselineFalseCompletions: rows.filter(row => scenarios.find(item => item.id === row.scenario)?.accept === false).length,
        baselineUsage: { inputTokens: 0, outputTokens: 0, missingCalls: 0 }, reviewUsage: usage,
        outputDir, conclusion: "Fixed-candidate comparison of the previous completion gate and production review; not an end-to-end success estimate. Per-call usage and latency are in results.jsonl." };
    await writeFile(resolve(outputDir, "summary.json"), JSON.stringify(report, null, 2));
    return report;
}
