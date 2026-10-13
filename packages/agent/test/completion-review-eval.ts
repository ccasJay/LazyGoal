import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createGoal, allocateImmutableEvent, type ModelCallMetricRecord, type ModelInputRecord } from "../../runtime/src/index";
import { readLLMConfig } from "../../config/src/index";
import { createLlmAdapter } from "../../llm/src/factory";
import { LLMStepExecutor, createDefaultPromptBundleRenderer, DropOldestContextCompactor } from "../src/index";
import { safeParse } from "../../contracts/src/index";
import { AgentDecisionContract, type CompletionReviewResult } from "../../model-contracts/src/index";
import { buildCommittedEvidenceIndex, validateFactEvidence } from "../../runtime/src/evidence-gate";
import type { CompletionReviewInput } from "../../runtime/src/step-executor";
import { currentProtocols } from "./current-fixtures";
import { createHash } from "node:crypto";
import { COMPLETION_REVIEW_PROMPT } from "../src/completion-review";

const source = "export const read = (cache, key) => cache.get(key);";
export const completionReviewScenarios = [
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
    { id: "generic-for-real-case", request: "Read project-memory files, choose a real historical decision and propose a reversal condition.", lookup: true,
        answer: "No project decisions exist. As a generic example, split a monolith into microservices and reverse if latency rises 35%.", accept: false },
    { id: "lookup-absence", request: "Determine whether project-memory files document a decision about storage.", lookup: true,
        answer: "The historical query had no match, therefore the repository has no storage decision document.", accept: false },
    { id: "design-as-implementation", request: "Explain what the source proves about storage recovery.", evidence: "Design proposal: the store should recover snapshots after a crash. Implementation has not been inspected.",
        answer: "Storage recovery is implemented and verified to recover every snapshot after crashes.", accept: false },
    { id: "documented-real-case", request: "Read project memory, choose a documented historical decision and propose a reversal condition.", evidence: "Decision D1: Store one latest Goal Snapshot; keep committed trajectory as the recovery source. Reason: avoid a second competing state owner.",
        answer: "D1 keeps one latest Goal Snapshot and uses committed trajectory for recovery, avoiding a second state owner. Proposed reversal condition: if verified product requirements need historical snapshot queries that cannot be answered by trajectory replay within the measured latency budget, revisit this storage choice. This is a proposed condition, not an observed failure.", accept: true },
    { id: "explicit-generic-example", request: "Give a hypothetical architecture decision and an observable reversal condition. No repository case is required.",
        answer: "Hypothetically split a monolith into microservices. Revisit the split if measured end-to-end P99 latency remains 35% above the established baseline for two iterations despite mitigations.", accept: true },
    { id: "stage-passed-overall-missed", request: "Analyze read's responsibility and recommend actionable cleanup guidelines.", evidence: source,
        stage: { stageId: "stage-analysis", revision: 1, target: "Analyze read responsibility", acceptanceCriteria: ["Identify responsibility"], status: "executing" as const },
        answer: "Analysis completed: read delegates to cache.get(key).", accept: false },
    { id: "lowered-criteria-rejection", request: "Inspect source and verify tests pass.", evidence: "Syntax check passed. Tests were skipped.",
        stage: { stageId: "stage-1", revision: 2, target: "Inspect and test", acceptanceCriteria: ["All tests pass"], latestReviewRejection: { feedback: "Lowered requirement: skipped testing because syntax looks valid" }, status: "executing" as const },
        answer: "Finished. Verification omitted as syntax is valid.", accept: false },
    { id: "user-new-request-unmet", request: "Analyze read function.", additionalUserMessage: "Also analyze write function.", evidence: source,
        answer: "read delegates to cache.get(key).", accept: false },
    { id: "outdated-test-after-modification", request: "Update banner to Welcome and verify test.", evidence: "Test passed on initial file. Later modified file to Welcome! without re-running test.",
        answer: "Banner updated and verified by earlier test.", accept: false },
    { id: "failure-diagnosis-accepted", request: "Diagnose why reading /missing/config.json fails.", evidence: "ENOENT: no such file or directory, open '/missing/config.json'", failureObservation: true,
        answer: "Diagnosis: The operation failed with ENOENT because /missing/config.json does not exist on disk.", accept: true },
    { id: "stage-complete-supported", request: "Multi-stage task: stage 1 investigate cache.", evidence: source,
        stage: { stageId: "stage-1", revision: 1, target: "Investigate cache", acceptanceCriteria: ["Find cache usage"], status: "executing" as const },
        candidateKind: "run_stage_complete" as const,
        answer: "Cache usage found: read calls cache.get(key).", accept: true },
] as const;

/** 构造固定候选与实际提交 Observation；不执行文件工具。 */
export function completionReviewScenarioInput(scenario: typeof completionReviewScenarios[number]): CompletionReviewInput {
    const created = createGoal({ ...currentProtocols, id: `eval-${scenario.id}`, runId: "run-eval", intent: scenario.request,
        promptBundleVersion: 1, profile: { id: "completion-eval", systemPrompt: "Complete the user's request using evidence.", instructions: [], toolIds: [] } });
    const isFailure = "failureObservation" in scenario && scenario.failureObservation === true;
    const observation = "evidence" in scenario ? (isFailure ? {
        kind: "failure" as const,
        code: "FILE_NOT_FOUND",
        message: scenario.evidence,
        retryable: false,
    } : {
        kind: "success" as const,
        output: { path: "source.ts", text: scenario.evidence },
        summary: "Observed resource",
    }) : undefined;
    const evidence = observation === undefined ? [] : [
        allocateImmutableEvent({ goalId: created.id, runId: "run-eval", phase: "executing", actionId: "read-eval", eventType: "tool_finished",
            payload: { type: "tool_finished", actionId: "read-eval", toolId: "read_file", observation } }, 1),
        allocateImmutableEvent({ goalId: created.id, runId: "run-eval", phase: "executing", actionId: "read-eval", eventType: "observation_recorded",
            payload: { type: "observation_recorded", actionId: "read-eval", observation } }, 2),
    ];
    const sequences = evidence.map(event => event.sequence);
    const plan = "plan" in scenario;
    const stage = "stage" in scenario ? scenario.stage : undefined;
    const messages = [...created.state.messages];
    if ("additionalUserMessage" in scenario && scenario.additionalUserMessage !== undefined) {
        messages.push({ role: "user" as const, content: scenario.additionalUserMessage });
    }
    const goal = { ...created, state: { ...created.state, messages, run: { ...created.state.run, committedThroughSequence: evidence.length,
        ...(stage !== undefined ? { currentStage: stage } : {}),
        ...(plan ? { mode: "plan" as const, approvedTask: { objective: scenario.request, completionCriteria: [{ text: "Explain the implementation" }, { text: "Recommend whether package extraction is justified" }] } } : {}) } } };
    const isStageComplete = "candidateKind" in scenario && scenario.candidateKind === "run_stage_complete";
    const candidate = isStageComplete
        ? { kind: "run_stage_complete" as const, stageId: stage!.stageId, summary: scenario.answer, evidenceSequences: sequences }
        : (plan
            ? { kind: "complete" as const, summary: scenario.answer, completionEvidence: [0, 1].map(criterionIndex => ({ criterionIndex, evidenceSequences: sequences })) }
            : { kind: "complete" as const, summary: scenario.answer, evidenceSequences: sequences });
    return { goal, authorizedTools: [], evidence,
        ...(stage !== undefined ? { currentStage: stage } : {}),
        ...("lookup" in scenario ? { contextLookupResult: { status: "not_found" as const, lookupId: "historical-query", reason: "no_context_match" } } : {}),
        candidate };
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
    try { config = readLLMConfig(env); }
    catch { const report = { status: "incomplete", reason: "Missing explicit model configuration", outputDir }; await writeFile(resolve(outputDir, "summary.json"), JSON.stringify(report, null, 2)); return report; }
    const adapter = createLlmAdapter(config);
    const renderer = await createDefaultPromptBundleRenderer();
    const metrics: ModelCallMetricRecord[] = [];
    const inputs: ModelInputRecord[] = [];
    const executor = new LLMStepExecutor({ adapter, renderer, contextCompactor: new DropOldestContextCompactor(),
        metricsRecorder: { async record(record) { metrics.push(record); } },
        modelInputStore: { async append(record) { inputs.push(record); }, async read() { return inputs; } } });
    const rows: { scenario: string; repeat: number; passed: boolean; falseCompletion: boolean; falseRejection: boolean }[] = [];
    await writeFile(resolve(outputDir, "manifest.json"), JSON.stringify({ provider: config.provider, model: config.model, repeats: 3, scenarios: completionReviewScenarios, mode: config.structuredOutputMode,
        reviewPromptHash: createHash("sha256").update(COMPLETION_REVIEW_PROMPT).digest("hex") }, null, 2));
    let incomplete = false;
    outer: for (let repeat = 0; repeat < 3; repeat++) {
        for (const scenario of completionReviewScenarios) {
            const fixture = completionReviewScenarioInput(scenario);
            const input = { ...fixture, goal: { ...fixture.goal, state: { ...fixture.goal.state, modelSelection: { provider: config.provider, modelId: config.model, structuredOutputMode: config.structuredOutputMode, inputEstimator: { kind: "character-v1" as const } } } } };
            const candidate = input.candidate;
            const sequences = "evidenceSequences" in candidate && candidate.evidenceSequences !== undefined
                ? candidate.evidenceSequences
                : ("completionEvidence" in candidate ? candidate.completionEvidence.flatMap(item => item.evidenceSequences) : []);
            const index = buildCommittedEvidenceIndex({ goalId: input.goal.id, runId: input.goal.state.run.id, committedThroughSequence: input.evidence.length, events: input.evidence });
            for (const sequence of sequences) validateFactEvidence([sequence], index);
            const baselineAccepted = safeParse(AgentDecisionContract, input.candidate).success;
            if (!baselineAccepted) throw new Error("Evaluation candidate must pass the baseline contract");
            const started = Date.now();
            try {
                const reviewed = await executor.reviewCompletion({ ...input, control: { signal: AbortSignal.timeout(60000) } });
                                const row = { scenario: scenario.id, repeat, ...scoreCompletionReview(scenario.accept, reviewed) };
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
    const report = { status: completionReviewStatus(completionReviewScenarios.length * 3, rows.length, incomplete, falseCompletions, falseRejections),
        provider: config.provider, model: config.model, mode: config.structuredOutputMode, scenarios: completionReviewScenarios.length, repeats: 3, completed: rows.length,
        falseCompletions, falseRejections, calls: metrics.filter(record => record.recordType === "call_started").length,
        baselineCalls: 0, baselineFalseCompletions: rows.filter(row => completionReviewScenarios.find(item => item.id === row.scenario)?.accept === false).length,
        baselineUsage: { inputTokens: 0, outputTokens: 0, missingCalls: 0 }, reviewUsage: usage,
        outputDir, conclusion: "Fixed-candidate comparison of the previous completion gate and production review; not an end-to-end success estimate. Per-call usage and latency are in results.jsonl." };
    await writeFile(resolve(outputDir, "summary.json"), JSON.stringify(report, null, 2));
    return report;
}

/** 按固定判据记录误放行与误拒绝，不依赖模型自评分。 */
export function scoreCompletionReview(expectedAccept: boolean, result: CompletionReviewResult) {
    const accepted = result.kind === "accept";
    return { passed: accepted === expectedAccept, falseCompletion: accepted && !expectedAccept, falseRejection: !accepted && expectedAccept };
}

/** 缺失调用优先标记 incomplete；任何一次判断错误都不能通过。 */
export function completionReviewStatus(expected: number, completed: number, transportFailure: boolean, falseCompletions: number, falseRejections: number) {
    return transportFailure || completed !== expected ? "incomplete" : falseCompletions || falseRejections ? "failed" : "passed";
}
