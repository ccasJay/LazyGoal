import { ReadFileTool } from "../../tools/src/read-file";
import { projectContextLookupResult } from "../src/context-lookup-projection";
import { createMemoryPatchFeedback, type RuntimeFeedback } from "../../runtime/src/runtime-feedback";
import type { ContextLookupResult } from "../../runtime/src/context-retrieval";
import { validateMemoryPatchEvidence, buildCommittedEvidenceIndex, EvidenceGateError } from "../../runtime/src/evidence-gate";
import { normalizeMemoryPatch } from "../../working-memory/src/index";
import { contract } from "../../contracts/src/index";
import type { AgentDecision } from "../../model-contracts/src/index";
import { allocateImmutableEvent, type TrajectoryEventDraft } from "../../runtime/src/trajectory";
import { TrajectoryEventProjector } from "../src/trajectory-event-projector";
import type { Observation } from "../../runtime/src/domain";
import { createGoal, type Goal } from "../../runtime/src/domain";
import type { ToolDefinition } from "../../tool-core/src/index";
import { ModelInferenceProjector } from "../src/model-inference-projector";
import type { ModelInferenceView } from "../src/model-inference-view";
import { currentProtocols, currentWorkingMemory, currentContextEpoch } from "./current-fixtures";

type Scenario = {
    id: string;
    approved: boolean;
    normal?: boolean;
    intent: string;
    observation?: { tool: string; target: string; outcome: "success" | "failure"; text: string };
    checkpoint?: boolean;
    expected: readonly string[];
    target?: string;
    detail?: RegExp;
    fileSource?: boolean;
    required?: boolean;
    lookupResult?: ContextLookupResult;
    runtimeFeedback?: RuntimeFeedback;
};

const input = contract.object({ target: contract.string(), value: contract.optional(contract.string()) });

export const decisionTools: readonly ToolDefinition[] = [
    { id: "read_state", description: "Inspect a named current project or service resource without changing it.", inputContract: input, isReadOnly: true },
    { id: "apply_change", description: "Apply the supplied value to a named project resource.", inputContract: input, isReadOnly: false },
    { id: "verify", description: "Run the checks for a named project resource without changing it.", inputContract: input, isReadOnly: true },
    { id: "fetch_data", description: "Fetch a named service resource without changing it.", inputContract: input, isReadOnly: true },
];

// 判据先于实测固定；工具名称与输入约束不随旧、新 Prompt 改变。
function memoryRejectionFeedback(): RuntimeFeedback {
    const query: TrajectoryEventDraft = { goalId: "decision-eval", runId: "run-1", phase: "executing", eventType: "context_lookup_requested",
        payload: { type: "context_lookup_requested", lookupId: "history", request: { kind: "context_lookup", need: "conversation_history", question: "Any project decisions?" } } };
    const index = buildCommittedEvidenceIndex({ goalId: "decision-eval", runId: "run-1", committedThroughSequence: 12, events: [allocateImmutableEvent(query, 11)] });
    try {
        validateMemoryPatchEvidence({ protocolVersion: 1, operations: [{ type: "upsert_fact", fact: {
            subject: "project_memory", predicate: "searched_project_memory", value: ["no_historical_decision_found"], stability: "stable", evidenceSequences: [11],
        } }] }, index);
    } catch (error) {
        if (!(error instanceof EvidenceGateError)) throw error;
        return createMemoryPatchFeedback(error, { goalId: "decision-eval", runId: "run-1", executionUnitId: "unit-1", stepOrdinal: 2 }, index);
    }
    throw new Error("The negative Memory fixture must be rejected by the production Evidence Gate");
}

export const decisionScenarios: readonly Scenario[] = [
    { id: "proposal", approved: false, intent: "Change the existing banner text to Welcome. Scope is banner text only. Acceptance: verify reports the banner text is Welcome.", expected: ["task_proposal"] },
    { id: "inspect", approved: false, intent: "Fix the failing checkout. Its current failure is unknown, and the scope depends on the checkout error. Resource: checkout.", expected: ["read_state", "verify"], target: "checkout" },
    { id: "default", approved: true, intent: "Change the banner text to Welcome. Preserve its current behavior and choose any reversible formatting details yourself. Verify banner afterward.", observation: { tool: "read_state", target: "banner", outcome: "success", text: "Banner is editable; current text is Hello. Formatting is unconstrained. No changes have been applied." }, expected: ["apply_change"], target: "banner", detail: /Welcome/ },
    { id: "question", approved: true, intent: "Set the account currency to the owner's preferred currency and verify it. Resource: account.", observation: { tool: "read_state", target: "account", outcome: "success", text: "No preferred currency is stored. Only the owner can choose USD or EUR. Neither is a default. All available sources were checked." }, expected: ["ask_user"], detail: /currency|USD|EUR/i },
    { id: "lookup", approved: true, intent: "Apply the exact banner wording I selected earlier in this conversation, then verify banner. The earlier choice is not visible in this context.", expected: ["context_lookup"] },
    { id: "verify-change", approved: true, intent: "Set banner text to Welcome and verify banner.", observation: { tool: "apply_change", target: "banner", outcome: "success", text: "Saved banner text Welcome. Verification has not been run." }, expected: ["verify"], target: "banner" },
    { id: "adjust", approved: true, intent: "Update config to use timeout 30 seconds and verify config.", observation: { tool: "apply_change", target: "config", outcome: "failure", text: "Rejected timeout=30: this resource accepts the key timeout_ms only, with value 30000. Retrying the same input cannot succeed. No change was applied." }, expected: ["apply_change"], target: "config", detail: /timeout_ms[\s\S]*30000/ },
    { id: "transient", approved: true, intent: "Retrieve catalog and verify that the requested catalog data was returned.", observation: { tool: "fetch_data", target: "catalog", outcome: "failure", text: "HTTP 503 during a transient restart. Health check now reports ready; retry the same read. No other error was observed." }, expected: ["fetch_data"], target: "catalog" },
    { id: "wait", approved: true, intent: "Retrieve restricted-report once administrator access is available.", observation: { tool: "fetch_data", target: "restricted-report", outcome: "failure", text: "Access denied. Administrator has an open access ticket and must grant permission externally. User already confirmed the request; no user answer or available tool can grant access. No other task work can proceed." }, expected: ["wait"], detail: /access|permission|administrator/i },
    { id: "fail", approved: true, intent: "Recover the original archive bytes exactly. Substitutes are not acceptable.", observation: { tool: "read_state", target: "archive", outcome: "success", text: "Recovery audit is complete: archive bytes are permanently destroyed; every replica and backup is destroyed; no reconstruction or external recovery is possible." }, expected: ["fail"], detail: /destroy|recover|backup|permanent/i },
    { id: "complete", approved: true, intent: "Set banner text to Welcome and verify banner.", observation: { tool: "verify", target: "banner", outcome: "success", text: "All criteria passed: banner text is Welcome, banner verification passed. No relevant state changed after this observation." }, expected: ["complete"] },
    { id: "checkpoint", approved: true, intent: "Set banner text to Welcome and verify banner.", checkpoint: true, expected: ["context_checkpoint"] },
    { id: "repository-listing", approved: false, normal: true, intent: "Evaluate this repository's development rules based on their contents.", observation: { tool: "read_state", target: "repository", outcome: "success", text: "Directory listing: AGENTS.md, CLAUDE.md, packages/. No file contents have been read." }, expected: ["read_state"], target: "AGENTS.md" },
    { id: "repository-content", approved: false, normal: true, intent: "Explain the contract documentation rule stated in AGENTS.md. Evaluate only that stated rule, not implementation compliance.", observation: { tool: "read_state", target: "AGENTS.md", outcome: "success", text: "AGENTS.md contents: Every public TypeScript interface must include contract-level documentation covering responsibilities, lifecycle semantics and a minimal example. These are the complete relevant rules for this request." }, expected: ["complete"], detail: /contract|TypeScript|documentation/i },
    { id: "greeting", approved: false, normal: true, intent: "Hi!", expected: ["complete"] },
    { id: "repository-history-no-match", approved: false, normal: true, fileSource: true, required: true,
        intent: "Read project-memory/index.md, choose a real historical decision from the repository documents and propose its reversal condition. The file contents have not been provided.",
        lookupResult: { status: "not_found", lookupId: "history", reason: "no_context_match" }, expected: ["read_file"], target: "project-memory/index.md" },
    { id: "memory-feedback-source", approved: false, normal: true, fileSource: true, required: true,
        intent: "Read project-memory/index.md, choose a real historical decision and propose a reversal condition. Its contents have not been read.",
        lookupResult: { status: "not_found", lookupId: "history", reason: "no_context_match" },
        runtimeFeedback: memoryRejectionFeedback(),
        expected: ["read_file"], target: "project-memory/index.md" },

];

/** 采用实际只读文件工具 Schema 的来源场景，不执行该工具。 */
export function decisionScenarioTools(scenario: Scenario): readonly ToolDefinition[] {
    return scenario.fileSource ? [new ReadFileTool(process.cwd()).definition] : decisionTools.filter(t => scenario.approved || t.isReadOnly);
}

/** 构造固定的模型输入夹具；观察作为已提交轨迹投影提供，不执行任何业务工具。 */
export function decisionScenarioView(scenario: Scenario): ModelInferenceView {
    const profile = { id: "decision-eval", systemPrompt: "You are a general-purpose task agent.", instructions: [], toolIds: decisionScenarioTools(scenario).map(t => t.id) };
    const base = createGoal({ ...currentProtocols, promptBundleVersion: 1, id: "decision-eval", runId: "run-1", intent: scenario.intent, profile });
    const goal: Goal = { ...base, state: { ...base.state,
        workflow: { phase: "executing", ...(scenario.approved ? { } : {}) },
        run: {
            ...base.state.run,
            status: "running",
            ...(scenario.fileSource ? { stepCount: 1, committedThroughSequence: 12, exposedToolIds: decisionScenarioTools(scenario).map(t => t.id) } : {}),
            mode: scenario.approved || scenario.id === "proposal" ? "plan" : "normal",
            ...(scenario.approved
                ? { approvedTask: { objective: scenario.intent, completionCriteria: [{ text: scenario.intent }] } }
                : {}),
        },
    } };
    const view = new ModelInferenceProjector().project(goal, decisionScenarioTools(scenario), scenario.fileSource ? { ...currentWorkingMemory, derivedThroughSequence: 12 } : currentWorkingMemory);
    const observation = scenario.observation;
    if (scenario.checkpoint) return { ...view, contextEpoch: { ...currentContextEpoch, control: { status: "checkpoint_required", reason: "input_threshold" } } };
    if (!observation) return scenario.lookupResult === undefined ? view : { ...view, contextLookupResult: projectContextLookupResult(scenario.lookupResult) };
    const action = { actionId: "action-1", toolId: observation.tool, input: { target: observation.target, ...(observation.tool === "apply_change" ? { value: scenario.id === "adjust" ? "timeout=30" : "Welcome" } : {}) } };
    const result: Exclude<Observation, { kind: "rejected" }> = observation.outcome === "success"
        ? { kind: "success", output: { text: observation.text }, summary: observation.text }
        : { kind: "failure", code: "FIXTURE_FAILURE", message: observation.text, retryable: scenario.id === "transient" };
    const common = { goalId: goal.id, runId: "run-1", phase: "executing" as const, executionUnitId: "unit-1", actionId: "action-1" };
    const drafts: TrajectoryEventDraft[] = [
        { ...common, eventType: "action_staged", payload: { type: "action_staged", action, approvalStatus: "approved" } },
        { ...common, eventType: "tool_started", payload: { type: "tool_started", actionId: action.actionId, toolId: action.toolId, input: action.input } },
        { ...common, eventType: "tool_finished", payload: { type: "tool_finished", actionId: action.actionId, toolId: action.toolId, observation: result } },
        { ...common, eventType: "observation_recorded", payload: { type: "observation_recorded", actionId: action.actionId, observation: result } },
    ];
    const projector = new TrajectoryEventProjector({ previewLimit: 4096 });
    const events = drafts.map((draft, index) => projector.project(allocateImmutableEvent(draft, index + 1, `event-${index + 1}`, "2026-01-01T00:00:00Z")));
    return { ...view,
        workingMemory: { ...currentWorkingMemory, derivedThroughSequence: 4 },
        workingContext: { ...view.workingContext, execution: { stepCount: 1, previousStep: { kind: "action", action, observation: result } } },
        trajectoryContext: { measuredAs: "character", softOverflow: false, warm: [],
            budget: { measuredAs: "character", modelInputBudget: 100000, responseReserve: 10000,
                fixedInput: { unit: "character", count: 0 }, historyBudget: 90000, warmBudget: 0, hotBudget: 90000, softOverflow: false },
            hot: [{ ...common, firstSequence: 1, lastSequence: 4, events }],
        },
    };
}

/** 用固定允许集合及关键参数判断单步决策；不依赖模型对自己的解释。 */
export function scoreDecision(scenario: Scenario, decision: AgentDecision): boolean {
    if (scenario.fileSource && "memoryPatch" in decision && decision.memoryPatch !== undefined) {
        try {
            validateMemoryPatchEvidence(decision.memoryPatch, buildCommittedEvidenceIndex({ goalId: "decision-eval", runId: "run-1", committedThroughSequence: 0, events: [] }), "execution", currentWorkingMemory);
            normalizeMemoryPatch(decision.memoryPatch, { phase: "executing", originSequence: 1, workingMemory: currentWorkingMemory });
        } catch { return false; }
    }
    const key = decision.kind === "tool_call" ? decision.action.toolId : decision.kind;
    if (!scenario.expected.includes(key)) return false;
    if (decision.kind === "tool_call") {
        const args = decision.action.input as { target?: string; value?: string };
        if (scenario.fileSource) return (decision.action.input as { path?: string }).path === scenario.target;
        return args.target === scenario.target && (!scenario.detail || scenario.detail.test(args.value ?? ""));
    }
    switch (decision.kind) {
        case "ask_user": return decision.questions.some(q => scenario.detail!.test(q.question));
        case "context_lookup": return Boolean(decision.need && ["conversation_history", "decision_rationale"].includes(decision.need))
            && Boolean(decision.question && /banner|wording|select|chose|chosen/i.test(decision.question));
        case "wait": return scenario.detail!.test(decision.reason) && /grant|enable|restor|approv|resum/i.test(decision.reason);
        case "fail": return scenario.detail!.test(decision.error);
        case "task_proposal": return /banner/i.test(decision.task.objective) && /Welcome/.test(decision.task.objective)
            && decision.task.completionCriteria.some(c => /Welcome|banner/i.test(c.text))
            && decision.task.completionCriteria.every(c => c.acceptance === undefined || decisionTools.some(t => t.id === c.acceptance?.expectToolId))
            && decision.approvalRequest.trim().length > 0;
        case "complete":
            if (scenario.normal) return decision.summary.trim().length > 0
                && (!scenario.detail || scenario.detail.test(decision.summary))
                && "evidenceSequences" in decision
                && (scenario.observation
                    ? decision.evidenceSequences.length > 0 && decision.evidenceSequences.every(sequence => sequence === 3 || sequence === 4)
                    : decision.evidenceSequences.length === 0);
            return decision.summary.trim().length > 0
            && "completionEvidence" in decision
            && decision.completionEvidence.length === 1
            && decision.completionEvidence[0]!.criterionIndex === 0
            && decision.completionEvidence[0]!.evidenceSequences.length > 0
            && decision.completionEvidence[0]!.evidenceSequences.every((sequence: number) => sequence === 3 || sequence === 4);
        case "context_checkpoint": return true;
        default: return false;
    }
}
