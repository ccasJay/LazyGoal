import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { JsonFileGoalStore } from "../../../packages/storage/src/index.js";
import { getCommittedRunBoundaries } from "../../../packages/runtime/src/index.js";
import { JsonFileBenchmarkPersistenceAdapter } from "../../src/file-persistence-adapter.js";
import type { ContextScenario } from "./scenario.js";
import { record, textValue } from "./scenario.js";
import type { ScriptBoundary } from "./script-driver.js";
import { identity } from "./artifacts.js";

/**
 * 人工冻结的语义判据；决定可以修订，用户要求仍然有效。
 * @example
 * ```ts
 * const annotation: ContinuityAnnotation = { kind: "constraint", text: "Preserve API", sources: ["user:0"] };
 * ```
 */
export interface ContinuityAnnotation {
    readonly kind: "constraint" | "decision" | "superseded_decision" | "obligation";
    readonly text: string;
    readonly sources: readonly string[];
}
/** 从已提交事实读取审核证据；不把模型内部思考作为决定依据。 */
export async function readSourceEvidence(directory: string, boundary: ScriptBoundary): Promise<Record<string, string>> {
    const rootDirectory = join(directory, "state");
    const base = join(rootDirectory, "Y29udGV4dA", "c2Vzc2lvbg");
    const goal = await new JsonFileGoalStore(join(base, "goals")).restore(boundary.goalId);
    if (!goal || goal.state.run.id !== boundary.runId || goal.state.run.committedThroughSequence !== boundary.sequence) throw new Error("Evidence Snapshot boundary mismatch");
    const evidence: Record<string, string> = {};
    goal.state.messages.forEach((message, index) => {
        if (message.role === "user") evidence[`user:${index}`] = message.content;
        if (message.role === "assistant") evidence[`report:${index}`] = message.content;
    });
    const persistence = new JsonFileBenchmarkPersistenceAdapter({ rootDirectory, namespaceFor: () => "session" });
    const bindings = await persistence.open({ benchmarkId: "context", namespace: "session", goalId: goal.id, runId: boundary.runId });
    const accepted = new Set(["tool_finished", "observation_recorded", "run_waiting", "run_completed", "run_resumed", "ask_user_answered", "run_stage_declared", "run_stage_accepted", "run_stage_rejected", "context_note_declared", "goal_plan_updated"]);
    for (const source of getCommittedRunBoundaries(goal)) {
        const events = await bindings.trajectoryStore.readWithBoundary({ goalId: goal.id, runId: source.runId }, source.committedThroughSequence);
        for (const event of events.committed) {
            if (accepted.has(event.eventType)) evidence[`trajectory:${source.runId}:${event.sequence}`] = JSON.stringify(event);
        }
    }
    return evidence;
}
/** 校验人工标注与采集原始来源；评分前冻结，不按结果生成答案。 */
export async function validateAnnotations(directory: string, scenario: ContextScenario): Promise<readonly ContinuityAnnotation[]> {
    const checkpoint = record(JSON.parse(await readFile(join(directory, "checkpoint.json"), "utf8")));
    const evidence = await readSourceEvidence(directory, checkpoint.boundary as unknown as ScriptBoundary);
    const raw: unknown = JSON.parse(await readFile(join(directory, "annotations.json"), "utf8"));
    if (!Array.isArray(raw) || !raw.length) throw new Error("Source case requires reviewed annotations");
    const annotations = raw.map(item => {
        const v = record(item);
        if (Object.keys(v).some(k => !["kind", "text", "sources"].includes(k)) || !["constraint", "decision", "superseded_decision", "obligation"].includes(String(v.kind)) ||
            !Array.isArray(v.sources) || !v.sources.length || !v.sources.every(id => typeof id === "string" && Object.hasOwn(evidence, id))) throw new Error("Annotation source unavailable");
        return { kind: v.kind as ContinuityAnnotation["kind"], text: textValue(v.text), sources: v.sources as string[] };
    });
    if (scenario.source && identity(JSON.parse(await readFile(join(directory, "task.json"), "utf8"))) !== identity(scenario.source)) throw new Error("Candidate task projection changed");
    return annotations;
}
/**
 * Context 语义审查材料，full 组只携带用户约束；采集决定不作为 full 的正确路线。
 * @example
 * ```ts
 * const evidence = await continuityJudgeEvidence(candidate, artifacts, scenario, "restore", boundary);
 * ```
 */
export async function continuityJudgeEvidence(candidate: string, artifacts: string, scenario: ContextScenario, group: "restore" | "full", boundary: ScriptBoundary): Promise<Record<string, string>> {
    const annotations = await validateAnnotations(candidate, scenario);
    const actual = await readSourceEvidence(artifacts, boundary);
    const rubricAnnotations = group === "full" ? annotations.filter(a => a.kind === "constraint" || a.kind === "obligation").map(a => ({ kind: a.kind, text: a.text })) : annotations;
    const evidence: Record<string, string> = { requirements: scenario.source!.problemStatement, rubric_annotations: JSON.stringify(rubricAnnotations), ...actual };
    if (group === "restore") {
        const checkpoint = record(JSON.parse(await readFile(join(candidate, "checkpoint.json"), "utf8")));
        const captured = await readSourceEvidence(candidate, checkpoint.boundary as unknown as ScriptBoundary);
        for (const annotation of annotations) {
            for (const ref of annotation.sources) evidence[`capture:${ref}`] = captured[ref]!;
        }
    }
    return evidence;
}
