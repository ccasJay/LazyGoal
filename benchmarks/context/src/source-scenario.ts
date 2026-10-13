import type { AgentProfile } from "../../../packages/runtime/src/index.js";
import type { SourceTaskPackage } from "../../src/task-source.js";
import { parseScenario, type ContextScenario } from "./scenario.js";

/**
 * 从公开任务生成两种固定模板，完整原始 issue 保持原文。
 * @remarks 生成结果尚未批准；不生成修复路线或评分答案。预算必须由宿主显式冻结。
 * @example
 * ```ts
 * const scenarios = generateSourceScenarios(task, source.profile, budget);
 * ```
 */
export function generateSourceScenarios(task: SourceTaskPackage, profile: AgentProfile, budget: ContextScenario["budget"]): readonly ContextScenario[] {
    return (["cross-run", "waiting"] as const).map(mode => parseScenario({
        kind: "source", source: task, mode, id: `${task.instanceId}:${mode}`, image: task.imageId, checkpointAfter: 0, profile, budget,
        stages: [
            { operation: "launch", prompt: `${task.problemStatement}\n\nInvestigate the issue and record findings with sources. Do not modify repository source files yet. ${mode === "cross-run" ? "Complete this investigation phase with a report." : 'Then use ask_user to ask exactly one question: "Proceed with repairing the original issue?". Wait before repairing.'}`,
                expect: mode === "cross-run" ? "completed" : "waiting", ...(mode === "waiting" ? { waitingFor: "ask_user", waitingQuestion: "Proceed with repairing the original issue?" } : {}) },
            { operation: mode === "cross-run" ? "continue" : "resume", prompt: "Continue resolving the original issue using the investigation and verify the change.", expect: "completed",
                ...(mode === "waiting" ? { answers: [{ questionId: "q-1", answer: "Confirmed. Continue resolving the original issue and verify the change." }] } : {}) },
        ], verifier: "source-grader", rubric: { text: "Assess continuity against the reviewed annotations and original requirements. Plans may change with evidence; captured hypotheses are not gold answers. The full group has its own decisions and evidence. Cite actual supplied evidence IDs.", threshold: 0.8 },
        limitations: "Astropy subset; paired runs have different investigation prefixes. Not a causal index ablation.",
    }));
}
