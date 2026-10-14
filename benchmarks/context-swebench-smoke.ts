import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createSwebenchContextSource } from "./swebench/src/context-source.js";
import { generateSourceScenarios } from "./context/src/source-scenario.js";
import { captureScenario, buildContextWorker, runPairedCase, type ModelRole } from "./context/src/runner.js";
import { freezeCandidate, reviewCandidate } from "./context/src/corpus.js";
import { parseScenario } from "./context/src/scenario.js";
import { readSourceEvidence } from "./context/src/source-evidence.js";
import type { LLMAdapter } from "../packages/agent/src/index.js";

/**
 * 显式脚本 Adapter，验证真实 Runtime/工具/恢复，不调用任何模型。
 * @example
 * ```ts
 * const role = scriptedEngineeringRole();
 * ```
 */
export function scriptedEngineeringRole(): ModelRole {
    const adapter: LLMAdapter = { structuredOutputMode: "prompt_only", async generate(request) {
        if (request.tools?.[0]?.id === "system_review_completion") return { content: JSON.stringify({ result: { kind: "accept" } }) };
        const messages = JSON.stringify(request.messages);
        const suffix = messages.includes("Continue resolving the original issue using the investigation and verify the change.") || messages.includes("Confirmed. Continue resolving the original issue and verify the change.");
        const payload = request.messages.map(m => { try { return typeof m.content === "string" ? JSON.parse(m.content) : null; } catch { return null; } }).reverse().find(p => p?.phase === "executing");
        if (!payload?.execution?.currentStage) return { content: "", toolCalls: [{ callId: "fixture-stage-call", toolId: "system_update_run_stage", argumentsJson: JSON.stringify({ target: "Validate infrastructure with actual engineering tools", acceptanceCriteria: ["Run the fixed infrastructure probe"], stageId: null, baseRevision: null, reason: null, memoryPatch: null }) }] };
        if (!request.tools?.some(tool => tool.id === "bash")) return { content: JSON.stringify({ result: { kind: "tool_discovery", query: "bash" } }) };
        const marker = suffix ? "SUFFIX_RESTORED_READY" : "PREFIX_ENV_READY";
        if (!messages.includes(marker)) return { content: JSON.stringify({ result: { kind: "tool_call", action: { actionId: suffix ? "fixture-suffix" : "fixture-prefix", toolId: "bash", input: { command: suffix
            ? "test -f /opt/lazygoal/context-sentinel && test -L /opt/lazygoal/context-link && cmp /opt/lazygoal/context-sentinel /opt/lazygoal/context-link && printf 'infrastructure probe\\n' > lazygoal-context-probe.txt && echo SUFFIX_RESTORED_READY"
            : "python -c 'import sys,pytest; print(sys.prefix)' && git status --porcelain && printf '\\000\\377context' > /opt/lazygoal/context-sentinel && ln -s context-sentinel /opt/lazygoal/context-link && echo PREFIX_ENV_READY", timeoutMs: null, sandboxAccess: null } }, memoryPatch: null } }) };
        if (!suffix && messages.includes('Then use ask_user')) return { content: JSON.stringify({ result: { kind: "ask_user", questions: [{ header: "Repair", question: "Proceed with repairing the original issue?", options: [{ label: "Proceed", description: null }, { label: "Stop", description: null }], multiSelect: false }], memoryPatch: null } }) };
        const evidenceSequences = payload?.trajectoryContext?.hot?.flatMap((unit: { events?: { eventType: string; sequence: number }[] }) => unit.events ?? []).filter((event: { eventType: string }) => event.eventType === "observation_recorded").map((event: { sequence: number }) => event.sequence).slice(-1) ?? [];
        if (!evidenceSequences.length) throw new Error("Infrastructure fixture requires a real committed tool observation before completion");
        return { content: JSON.stringify({ result: { kind: "complete", summary: suffix ? "Infrastructure continuation verified. This fixture does not solve the issue." : "Investigation infrastructure verified. Repository source unchanged.", evidenceSequences, memoryPatch: null, contextNotes: null } }) };
    } };
    return { id: "scripted-engineering-fixture", kind: "scripted", adapter, configuration: { fixture: "engineering-v1", actualModelCalls: 0 } };
}
/** 独立 Judge fixture，仍经真实评分解析；仅验证接线，不评估模型语义能力。 */
export function scriptedJudgeRole(): ModelRole {
    return { id: "scripted-judge-fixture", kind: "scripted", configuration: { fixture: "judge-v1", actualModelCalls: 0 }, adapter: { structuredOutputMode: "prompt_only", generate: async () => ({ content: JSON.stringify({ score: 1, rationale: "Fixed infrastructure Judge fixture; not a semantic capability assessment.", evidence: ["requirements", "rubric_annotations"] }) }) } };
}
/**
 * 真 Docker 和官方 harness 探针，默认单题；五题通过 manifest 显式选择。
 * @remarks 标准 patch 仅在宿主单独 grader 探针使用，永不交给执行 Adapter。
 * @example
 * ```ts
 * await runSweContextSmoke(output, manifest, python);
 * ```
 */
export async function runSweContextSmoke(output: string, manifest: string, python: string, signal?: AbortSignal): Promise<void> {
    await mkdir(output, { recursive: true });
    const source = createSwebenchContextSource({ privateDirectory: join(output, "private"), python });
    const packages = await source.importTasks(manifest, join(output, "tasks"), signal);
    const worker = await buildContextWorker(process.cwd(), join(output, "cache"), source);
    const reports: unknown[] = [];
    const failures: string[] = [];
    for (const path of packages) {
        signal?.throwIfAborted();
        const task = await source.readTask(path);
        for (const generated of generateSourceScenarios(task, source.profile, { maxSteps: 50, maxCalls: 200, stageTimeoutMs: 1_200_000, totalTimeoutMs: 2_400_000 })) {
            const directory = join(output, task.instanceId, generated.mode!);
            try {
                const candidate = await captureScenario(generated, worker, scriptedEngineeringRole(), join(directory, "capture"), signal, source);
                const checkpoint = JSON.parse(await readFile(join(candidate, "checkpoint.json"), "utf8"));
                const evidence = await readSourceEvidence(candidate, checkpoint.boundary);
                const ref = Object.keys(evidence).find(k => k.startsWith("user:"))!;
                await writeFile(join(candidate, "annotations.json"), JSON.stringify([{ kind: "constraint", text: "Resolve the original issue; investigation must precede the scripted repair phase.", sources: [ref] }]));
                const scenario = parseScenario(JSON.parse(await readFile(join(candidate, "scenario.json"), "utf8")));
                if (scenario.source?.contentHash !== task.contentHash) throw new Error("Task identity lost");
                const frozen = await freezeCandidate(candidate, join(output, "corpus"), "challenge", "scripted-validation", await reviewCandidate(candidate), "test-only-review-action-fixture");
                const report = await runPairedCase(frozen, worker, scriptedEngineeringRole(), scriptedJudgeRole(), join(directory, "pair"), signal, source);
                reports.push(report);
                const restored = report.groups[0]?.stages[0]?.boundary;
                if (!report.pairable || report.groups.some(g => g.score?.combined !== "passed" || !g.taskScore || g.taskScore.status === "grading_error" || g.evaluationKind !== "infrastructure_validation" || g.errors.length) || !restored || restored.workerInstanceId === checkpoint.boundary.workerInstanceId ||
                    restored.goalId !== checkpoint.boundary.goalId || (generated.mode === "waiting") !== (restored.runId === checkpoint.boundary.runId)) throw new Error("Infrastructure gate failed; inspect group and official-grade records");
            } catch (error) { failures.push(`${task.instanceId}:${generated.mode}: ${String(error)}`); }
            await writeFile(join(output, "validation.json"), JSON.stringify({ evaluationKind: "infrastructure_validation", actualModelCalls: 0, plannedGroups: packages.length * 4, attemptedGroups: reports.reduce((n: number, r: any) => n + r.groups.length, 0), worker: worker.manifest, reports, failures }, null, 2));
        }
    }
    // Trusted host-only positive/negative grading test, once on the first fixed task.
    const task = await source.readTask(packages[0]!);
    const rows = JSON.parse(await readFile(join(output, "private", "dataset.json"), "utf8"));
    const row = rows.find((r: { instance_id: string }) => r.instance_id === task.instanceId);
    try {
        if (failures.length) throw new Error("Official fixture probes deferred because lifecycle gates failed");
        const positive = await source.grade(task, row.patch, join(output, "official-positive"), signal);
        const negative = await source.grade(task, "diff --git a/lazygoal-context-probe.txt b/lazygoal-context-probe.txt\nnew file mode 100644\nindex 0000000..ce01362\n--- /dev/null\n+++ b/lazygoal-context-probe.txt\n@@ -0,0 +1 @@\n+hello\n", join(output, "official-negative"), signal);
        if (positive.status !== "resolved" || negative.status !== "unresolved") throw new Error("Official positive/negative gate failed");
    } catch (error) { failures.push(`official-fixtures: ${String(error)}`); }
    await writeFile(join(output, "validation.json"), JSON.stringify({ status: failures.length ? "failed" : "passed", evaluationKind: "infrastructure_validation", actualModelCalls: 0, plannedGroups: packages.length * 4, attemptedGroups: reports.reduce((n: number, r: any) => n + r.groups.length, 0), worker: worker.manifest, reports, failures }, null, 2));
    if (failures.length) throw new Error(`SWE Context infrastructure verification failed: ${output}/validation.json`);
}
if (process.argv[1]?.endsWith("context-swebench-smoke.ts")) {
    const { values } = parseArgs({ options: { output: { type: "string" }, manifest: { type: "string" }, python: { type: "string" } } });
    if (!values.output || !values.python) throw new Error("Specify --output and --python; this command never calls real models");
    const controller = new AbortController();
    const cancel = () => controller.abort();
    process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
    runSweContextSmoke(resolve(values.output), resolve(values.manifest ?? "benchmarks/swebench/manifests/single.json"), values.python, controller.signal).catch(error => { process.stderr.write(String(error) + "\n"); process.exitCode = 1; }).finally(() => { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); });
}
