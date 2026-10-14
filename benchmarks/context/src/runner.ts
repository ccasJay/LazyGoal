import type { BenchmarkTaskSource, SourceArtifacts, TaskGrade } from "../../src/task-source.js";
import { continuityJudgeEvidence } from "./source-evidence.js";
import { CONTEXT_HOST_BUILD, CONTEXT_SHARED_BUILD } from "./build-identity.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { executePairedGroups } from "./paired-runner.js";
import { summarizeGroups } from "./report.js";
import { randomUUID } from "node:crypto";
import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import { readNormalizedUsage } from "../../../packages/llm/src/core/usage.js";
import type { NormalizedUsage } from "../../../packages/llm/src/core/usage.js";
import { JsonFileGoalStore } from "../../../packages/storage/src/index.js";
import { AttemptRecorder } from "../../src/attempt-recorder.js";
import { IsolatedEnvironment } from "../../src/isolated-environment.js";
import { createLlmRpcServer } from "../../src/llm-rpc.js";
import { createAcpMuxStream } from "../../src/multiplex.js";
import { buildBenchmarkWorker, type WorkerArtifact } from "../../src/worker-builder.js";
import { CONTEXT_PROMPT_ASSETS } from "./worker-entry.js";
import { createContextEnvironment, prepareInitialEnvironment, type ContextArtifacts } from "./environment-spec.js";
import { runContextSession } from "./session-client.js";
import { ScriptMismatch, ScriptBudgetExceeded, type StageRecord } from "./script-driver.js";
import { publishCheckpoint, validateCheckpoint } from "./checkpoint.js";
import { readFrozenCase } from "./corpus.js";
import { runProcess, requireSuccess } from "../../src/process.js";
import { identity } from "./artifacts.js";
import type { ContextScenario } from "./scenario.js";
import { parseScenario } from "./scenario.js";
import { judgeExplanation } from "./judge.js";
import { evaluate, type ContextScore } from "./evaluator.js";

/**
 * 三个显式模型角色的执行依赖，不保存凭据。
 * @remarks id 是脱敏配置身份；adapter 仅在宿主持有。
 * @example
 * ```ts
 * const role: ModelRole = { id: "configured-model", adapter };
 * ```
 */
export interface ModelRole {
    readonly id: string;
    /** 显式离线 fixture；不得把该结果当作真实模型能力证据。 */
    readonly kind?: "scripted";
    readonly adapter: LLMAdapter;
    /** 脱敏配置事实；注入替身省略时不宣称保存了供应商配置。 */
    readonly configuration?: Readonly<Record<string, unknown>>;
}
/**
 * 一组隔离运行的审计结果与成本。
 * @example
 * ```ts
 * console.log(group.category, group.calls, group.artifacts?.directory);
 * ```
 */
export interface GroupResult {
    readonly group: "capture" | "restore" | "full";
    readonly category: "completed" | "behavior_failed" | "script_mismatch" | "budget_exceeded" | "cancelled" | "infrastructure_error";
    readonly stages: readonly StageRecord[];
    readonly model: string;
    readonly modelConfiguration?: Readonly<Record<string, unknown>>;
    readonly calls: readonly (NormalizedUsage | null)[];
    readonly durationMs: number;
    readonly imageId: string | null;
    readonly artifacts: ContextArtifacts | null;
    readonly score: ContextScore | null;
    /** 来源型场景的独立官方工程评分，不参与 Context 综合判定。 */
    readonly taskScore?: TaskGrade | null;
    readonly evaluationKind?: "infrastructure_validation" | "model_evaluation";
    /** 实际执行模型调用数；脚本 Adapter 的 generate 不计为真实模型调用。 */
    readonly actualModelCalls?: number;
    readonly errors: readonly unknown[];
}
/** 使用共享构建器；源码与模板摘要反映实际工作树。 */
export function buildContextWorker(projectRoot: string, cacheDirectory: string, source?: BenchmarkTaskSource): Promise<WorkerArtifact> {
    return buildBenchmarkWorker({ projectRoot, cacheDirectory, entryPoint: source?.workerEntryPoint ?? "benchmarks/context/src/worker-entry.ts", promptAssets: CONTEXT_PROMPT_ASSETS });
}
async function executeGroup(scenario: ContextScenario, worker: WorkerArtifact, role: ModelRole, output: string, group: GroupResult["group"], checkpointDirectory?: string, judge?: ModelRole, signal?: AbortSignal, source?: BenchmarkTaskSource, reviewDirectory?: string): Promise<GroupResult> {
    if (role.adapter.structuredOutputMode === "two_stage") throw new Error("Context Worker requires strict or prompt_only mode");
    const mode = role.adapter.structuredOutputMode;
    const started = Date.now();
    await mkdir(output, { recursive: true });
    if (scenario.kind === "source" && (!source || source.id !== scenario.source?.source)) throw new Error("Source adapter required");
    let initial = null;
    let archive: { directory: string; manifest: NonNullable<import("./checkpoint.js").ContextCheckpoint["archive"]> } | undefined;
    let consumedCalls = 0;
    let consumedDuration = 0;
    let start = 0;
    let inputDirectory: string;
    if (checkpointDirectory !== undefined) {
        const checkpoint = await validateCheckpoint(checkpointDirectory, scenario, worker.manifest, JSON.parse(await readFile(join(checkpointDirectory, "checkpoint.json"), "utf8")).imageId);
        if (scenario.kind === "source") {
            archive = { directory: checkpointDirectory, manifest: checkpoint.archive! };
            const capture = JSON.parse(await readFile(join(checkpointDirectory, "capture.json"), "utf8"));
            if (!Array.isArray(capture.calls) || !Number.isSafeInteger(capture.durationMs) || capture.durationMs < 0) throw new Error("Invalid frozen prefix budget record");
            consumedCalls = capture.calls.length;
            consumedDuration = capture.durationMs;
        }
        initial = checkpoint.boundary;
        start = checkpoint.afterStage + 1;
        inputDirectory = checkpointDirectory;
    } else {
        inputDirectory = join(output, "initial");
        if (scenario.kind !== "source") await prepareInitialEnvironment(inputDirectory, scenario);
    }
    const calls: (NormalizedUsage | null)[] = [];
    let budgetExceeded = false;
    const boundedAdapter: LLMAdapter = {
        structuredOutputMode: role.adapter.structuredOutputMode,
        ...(role.adapter.nativeConversationIdentity === undefined ? {} : { nativeConversationIdentity: role.adapter.nativeConversationIdentity }),
        async generate(request, control) {
            if (calls.length + consumedCalls >= scenario.budget.maxCalls) { budgetExceeded = true; throw new Error("Context model call budget exceeded"); }
            calls.push(null);
            const position = calls.length - 1;
            const response = await role.adapter.generate(request, control);
            calls[position] = readNormalizedUsage(response.providerMetadata) ?? null;
            return response;
        },
    };
    let stages: readonly StageRecord[] = [];
    let scriptError: string | null = null;
    let scriptCode = "SCRIPT_MISMATCH";
    const remainingBeforeSetup = scenario.budget.totalTimeoutMs - consumedDuration - (Date.now() - started);
    if (remainingBeforeSetup <= 0) throw new ScriptBudgetExceeded("Frozen prefix exhausted total time budget", []);
    const executionSignal = scenario.kind === "source" ? AbortSignal.any([AbortSignal.timeout(remainingBeforeSetup), ...(signal ? [signal] : [])]) : signal;
    let sourceSpec;
    try {
        sourceSpec = scenario.kind === "source" ? await source!.environment(scenario.source!, worker, group === "capture", archive, executionSignal) : undefined;
        executionSignal?.throwIfAborted();
    } catch (error) {
        if (executionSignal?.aborted && !signal?.aborted) throw new ScriptBudgetExceeded("Environment setup timeout budget exceeded", []);
        throw error;
    }
    const remainingForExecution = scenario.budget.totalTimeoutMs - consumedDuration - (Date.now() - started);
    if (remainingForExecution <= 0) throw new ScriptBudgetExceeded("Environment setup exhausted total time budget", []);
    const result = await new IsolatedEnvironment().run({
        task: scenario, spec: sourceSpec ? { ...sourceSpec, resolveImage: () => sourceSpec.resolveImage(scenario.source!), getWorkerEntryConfig: () => sourceSpec.getWorkerEntryConfig(scenario.source!), resolveNetworkMode: () => "none" as const, inheritHostProxyEnvironment: () => false,
            collectArtifacts: async (env, output, grace) => {
                if (group === "capture" && (scriptError !== null || stages.at(-1)?.boundary.status !== scenario.stages[scenario.checkpointAfter]!.expect)) {
                    const diagnostic = await source!.environment(scenario.source!, worker, false);
                    return diagnostic.collectArtifacts(env, output, grace);
                }
                return sourceSpec.collectArtifacts(env, output, grace);
            } } : createContextEnvironment(scenario, worker, inputDirectory, group !== "capture"),
        outputDirectory: join(output, "artifacts"), taskTimeoutMs: remainingForExecution,
        ...(sourceSpec ? { artifactGraceMs: 1_200_000 } : {}),
        ...(executionSignal === undefined ? {} : { signal: executionSignal }),
        runAgent: async ({ mux, worker: workerProcess, signal: agentSignal }) => {
            const rpc = createLlmRpcServer({ stream: mux.channel("llm"), adapter: boundedAdapter });
            try {
                stages = await Promise.race([
                    runContextSession(createAcpMuxStream(mux), scenario, mode, agentSignal, start,
                        group === "capture" ? scenario.checkpointAfter + 1 : scenario.stages.length, initial, role.adapter.nativeConversationIdentity),
                    workerProcess.closed.then(() => { throw new Error("Context Worker exited before stage response"); }),
                ]);
            } catch (error) {
                if (error instanceof ScriptMismatch) { stages = error.records; scriptError = error.message; scriptCode = error.code; }
                if (error instanceof ScriptBudgetExceeded) budgetExceeded = true;
                throw error;
            } finally { await rpc.close(); }
        },
    });
    const category: GroupResult["category"] = budgetExceeded || result.errors.some(error => error.code === "TASK_TIMEOUT") ? "budget_exceeded" : scriptError !== null ? "script_mismatch"
        : result.status === "completed" && !result.errors.length ? "completed"
        : result.status === "cancelled" ? "cancelled" : "infrastructure_error";
    const artifactErrors: { stage: string; message: string }[] = [];
    let runtimeCode: string | undefined;
    let answer = "";
    const lastBoundary = stages.at(-1)?.boundary;
    if (result.artifact !== null && lastBoundary !== undefined) {
        const goals = join(result.artifact.directory, "state", "Y29udGV4dA", "c2Vzc2lvbg", "goals");
        try {
            const goal = await new JsonFileGoalStore(goals).restore(lastBoundary.goalId);
            if (goal === undefined || goal.state.run.id !== lastBoundary.runId || goal.state.run.status !== lastBoundary.status ||
                goal.state.run.committedThroughSequence !== lastBoundary.sequence) throw new Error("Collected Snapshot does not match final Worker boundary");
            answer = goal.state.messages.filter(message => message.role === "assistant").at(-1)?.content ?? "";
            runtimeCode = goal.state.run.stopReason?.kind === "execution_error" ? goal.state.run.stopReason.code : undefined;
        } catch (error) { artifactErrors.push({ stage: "snapshot_read", message: String(error) }); }
    }
    const reportedCategory = artifactErrors.length ? "infrastructure_error" : category !== "script_mismatch" || lastBoundary?.status !== "failed" ? category
        : runtimeCode === "MODEL_REQUEST_FAILED" || runtimeCode === "TOOL_EXECUTION_ERROR" ? "infrastructure_error"
        : "behavior_failed";
    let score: ContextScore | null = null;
    let taskScore: TaskGrade | null = null;
    const gradingErrors: { stage: string; message: string }[] = [];
    if (scenario.kind === "source" && group !== "capture" && result.artifact) {
        try { taskScore = await source!.grade(scenario.source!, (result.artifact as SourceArtifacts).patch, join(output, "official-grade"), signal); }
        catch (error) { gradingErrors.push({ stage: "official_grade", message: String(error) }); }
    }
    if (group !== "capture") {
        let judgeRecord = null;
        if (result.artifact !== null && judge !== undefined) {
            let evidence: Readonly<Record<string, string>> = { output: answer, verifier: JSON.stringify(result.artifact.verifier), artifacts: JSON.stringify(result.artifact.files) };
            if (scenario.kind === "source") {
                try { evidence = lastBoundary ? await continuityJudgeEvidence(reviewDirectory!, result.artifact.directory, scenario, group, lastBoundary) : {}; }
                catch (error) { evidence = {}; gradingErrors.push({ stage: "context_evidence", message: String(error) }); }
            }
            judgeRecord = await judgeExplanation(judge.adapter, scenario.rubric.text, evidence,
                AbortSignal.any([AbortSignal.timeout(scenario.budget.stageTimeoutMs), ...(signal === undefined ? [] : [signal])]));
            await writeFile(join(output, "judge.json"), JSON.stringify({ model: judge.id, configuration: judge.configuration ?? null, record: judgeRecord }, null, 2));
        }
        score = evaluate(reportedCategory !== "completed" ? false : scenario.kind === "source" ? result.artifact !== null && artifactErrors.length === 0 : result.artifact?.verifier === null || result.artifact === null ? null : result.artifact.verifier.code === 0,
            judgeRecord, scenario.rubric.threshold, result.artifact?.violations ?? []);
    }
    const groupResult: GroupResult = { group, category: reportedCategory, stages, model: role.id, ...(role.configuration === undefined ? {} : { modelConfiguration: role.configuration }), calls, durationMs: Date.now() - started, imageId: result.imageId,
        artifacts: result.artifact, score, ...(scenario.kind === "source" ? { taskScore, actualModelCalls: role.kind === "scripted" ? 0 : calls.length, evaluationKind: role.kind === "scripted" && (!judge || judge.kind === "scripted") ? "infrastructure_validation" as const : "model_evaluation" as const } : {}), errors: [...result.errors, ...gradingErrors, ...artifactErrors, ...(scriptError === null ? [] : [{ code: scriptCode, message: scriptError, runtimeCode: runtimeCode ?? null }])] };
    await writeFile(join(output, "group.json"), JSON.stringify({ ...groupResult, hostBuild: CONTEXT_HOST_BUILD, sharedBuild: CONTEXT_SHARED_BUILD, sourceBuild: source?.buildIdentity ?? null, worker: worker.manifest, scenarioHash: identity(scenario) }, null, 2));
    const boundary = stages.at(-1)?.boundary;
    await new AttemptRecorder({ rootDirectory: output }).commit({
        benchmarkId: "context", taskId: scenario.id, goalId: boundary?.goalId ?? "unstarted", runId: boundary?.runId ?? "unstarted",
        attempt: 1, status: reportedCategory === "completed" ? "completed" : reportedCategory === "cancelled" ? "cancelled" : reportedCategory === "infrastructure_error" ? "infrastructure_error" : "failed",
        durationMs: groupResult.durationMs, usage: calls.length === 0 || calls.some(call => call === null) ? null
            : { inputTokens: calls.reduce((n, call) => n + call!.inputTokens, 0), outputTokens: calls.reduce((n, call) => n + call!.outputTokens, 0), missingCalls: 0 },
        errors: result.errors, artifactLocator: result.artifact === null ? null : { goalSnapshot: join(result.artifact.directory, "state", "Y29udGV4dA", "c2Vzc2lvbg", "goals"), trajectory: join(result.artifact.directory, "state", "Y29udGV4dA", "c2Vzc2lvbg", "trajectories"), modelInputs: join(result.artifact.directory, "state", "Y29udGV4dA", "c2Vzc2lvbg", "model-inputs") },
        domainResult: groupResult, worker: { ...worker.manifest }, environment: { imageId: result.imageId },
    });
    return groupResult;
}
/** 自动采集到声明边界；安全检查失败时只保留诊断，不发布候选检查点。 */
export async function captureScenario(scenario: ContextScenario, worker: WorkerArtifact, model: ModelRole, directory: string, signal?: AbortSignal, source?: BenchmarkTaskSource): Promise<string> {
    const result = await executeGroup(scenario, worker, model, directory, "capture", undefined, undefined, signal, source);
    if (result.category !== "completed" || result.artifacts === null || result.imageId === null) throw new Error("Capture did not reach safe boundary; see group.json");
    const candidate = result.artifacts.directory;
    const boundary = result.stages.at(-1)!.boundary;
    const archive = (result.artifacts as SourceArtifacts).archive;
    if (scenario.kind === "source" && (result.artifacts as SourceArtifacts).patch !== "") throw new Error("Investigation modified source; candidate rejected");
    await publishCheckpoint(candidate, scenario, boundary, worker.manifest, result.imageId, archive);
    if (scenario.kind === "source") {
        await writeFile(join(candidate, "task.json"), JSON.stringify(scenario.source, null, 2), { flag: "wx" });
        await writeFile(join(candidate, "annotations.json"), "[]\n", { flag: "wx" });
    }
    await writeFile(join(candidate, "scenario.json"), JSON.stringify(scenario, null, 2), { flag: "wx" });
    await writeFile(join(candidate, "capture.json"), JSON.stringify({ hostBuild: CONTEXT_HOST_BUILD, sharedBuild: CONTEXT_SHARED_BUILD, sourceBuild: source?.buildIdentity ?? null, model: model.id, kind: model.kind ?? "model", actualModelCalls: model.kind === "scripted" ? 0 : result.calls.length, configuration: model.configuration ?? null, worker: worker.manifest, stages: result.stages, calls: result.calls, durationMs: result.durationMs }, null, 2), { flag: "wx" });
    return candidate;
}
/**
 * 对一个人工冻结用例执行隔离配对；一组失败仍保留另一组。
 * @remarks 检查点教师前缀与 full 前缀有不同来源，不证明 context 因果贡献。
 * @example
 * ```ts
 * const report = await runPairedCase(frozenDirectory, worker, execution, judge, output);
 * ```
 */
export async function runPairedCase(frozenDirectory: string, worker: WorkerArtifact, execution: ModelRole, judge: ModelRole, directory: string, signal?: AbortSignal, source?: BenchmarkTaskSource) {
    const frozen = await readFrozenCase(frozenDirectory);
    const candidate = join(frozenDirectory, "case");
    const scenario = parseScenario(JSON.parse(await readFile(join(candidate, "scenario.json"), "utf8")));
    if (scenario.kind === "source") {
        if (!source) throw new Error("Source adapter required");
        if (identity(await source.readTask(join(candidate, "task.json"))) !== identity(scenario.source)) throw new Error("Source task changed");
        const capture = JSON.parse(await readFile(join(candidate, "capture.json"), "utf8"));
        if (identity(capture.sourceBuild) !== identity(source.buildIdentity) || identity(capture.sharedBuild) !== identity(CONTEXT_SHARED_BUILD) || capture.model !== execution.id || identity(capture.configuration ?? null) !== identity(execution.configuration ?? null) || capture.kind !== (execution.kind ?? "model")) {
            await mkdir(directory, { recursive: true });
            await writeFile(join(directory, "pairing-error.json"), JSON.stringify({ pairable: false, planned: 2, attempted: 0, reason: "Capture/execution configuration or source build mismatch", capture: { model: capture.model, configuration: capture.configuration, kind: capture.kind }, execution: { model: execution.id, configuration: execution.configuration ?? null, kind: execution.kind ?? "model" }, worker: worker.manifest, scenarioHash: identity(scenario) }, null, 2));
            throw new Error("Capture/execution configuration or source build mismatch; see pairing-error.json");
        }
    }
    const image = scenario.kind === "source" ? null : await runProcess("docker", ["image", "inspect", scenario.image, "--format", "{{.Id}}"], { timeoutMs: 15000 });
    if (image) requireSuccess(image, "Inspect frozen context image");
    await validateCheckpoint(candidate, scenario, worker.manifest, image?.stdout.trim() ?? scenario.source!.imageId);
    const groups = await executePairedGroups(directory, execution.id, (group, output) =>
        executeGroup(scenario, worker, execution, output, group, group === "restore" ? candidate : undefined, judge, signal, source, candidate));
    const capture = JSON.parse(await readFile(join(candidate, "capture.json"), "utf8"));
    const pairable = groups.every(group => group.category === "completed") && (scenario.kind === "source" || groups[0]!.imageId === groups[1]!.imageId);
    const report = { id: randomUUID(), hostBuild: CONTEXT_HOST_BUILD, sharedBuild: CONTEXT_SHARED_BUILD, sourceBuild: source?.buildIdentity ?? null, frozen, execution: execution.id, executionConfiguration: execution.configuration ?? null, judge: judge.id, judgeConfiguration: judge.configuration ?? null, worker: worker.manifest, scenarioHash: identity(scenario),
        capture, groups, pairable, comparisonLimit: "Teacher checkpoint and full execution have different prefixes; this is not a causal context ablation.",
        contextScores: groups.map(g => ({ group: g.group, mechanism: g.score?.deterministic ?? null, semantic: g.score?.judge ?? null, combined: g.score?.combined ?? "incomplete" })), taskScores: groups.map(g => ({ group: g.group, score: g.taskScore ?? null })), counts: summarizeGroups(groups, pairable) };
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2));
    await writeFile(join(directory, "report.md"), `# Context benchmark\n\nCase: ${frozen.caseId} (${frozen.set}/${frozen.version})\n\nPlanned: 2; completed: ${report.counts.completed}; incomplete: ${report.counts.incomplete}; pairable: ${pairable}\n\n${groups.map(group => `- ${group.group}: ${group.category}; context: ${group.score?.combined ?? "incomplete"}; engineering: ${group.taskScore?.status ?? "not_applicable"}; kind: ${group.evaluationKind ?? "model_evaluation"}; calls: ${group.calls.length}; usage: ${group.calls.some(call => call === null) ? "unavailable" : "recorded"}`).join("\n")}\n\n${report.comparisonLimit}\n`);
    return report;
}
