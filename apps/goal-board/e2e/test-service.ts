import { JsonFileModelInputStore, JsonFileModelPreferenceStore } from "../../../packages/storage/src/index";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { contract } from "../../../packages/contracts/src/index";
import type { LLMAdapter, LLMRequest, LLMResponse } from "../../../packages/llm-core/src/index";
import { toolResponseFixture } from "../../../packages/agent/test/tool-response-fixture";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    type Tool,
} from "../../../packages/tool-core/src/index";
import type { AgentProfile, Goal, ToolPolicy } from "../../../packages/runtime/src/index";
import {
    createBrowserGoalRoutes,
    createBrowserGoalSessionPort,
    createBrowserTrajectoryRoutes,
    createBrowserModelInputRoutes,
    createBrowserSessionAccess,
    createBrowserStaticRoutes,
    BrowserGoalCommandService,
    listBrowserGoals,
    readBrowserGoalSession,
} from "../../../packages/browser/src/index";
import { createCompositionRoot } from "../../goal-server/src/composition-root";

const fixtureInput = contract.object({ value: contract.string() });
const profile: AgentProfile = {
    id: "browser-e2e",
    systemPrompt: "Use the deterministic browser acceptance flow.",
    instructions: [],
    toolIds: ["browser_fixture_write"],
};

let toolCalls = 0;
let nextRunId = Number(process.env.LAZYGOAL_E2E_RUN_COUNTER ?? "0");
let activeGoalId: string | undefined;
let compositionRoot: Awaited<ReturnType<typeof createCompositionRoot>> | undefined;

class DeterministicAdapter implements LLMAdapter {
    readonly structuredOutputMode = "strict" as const;
    calls = Number(process.env.LAZYGOAL_E2E_MODEL_OFFSET ?? "0");

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.calls += 1;
        await writeStatus();
        if (request.tools?.[0]?.id === "system_review_completion") return toolResponseFixture(JSON.stringify({ result: { kind: "accept" } }));
        if (compositionRoot === undefined || activeGoalId === undefined) throw new Error("The fixture needs the active Goal");
        const goal = await compositionRoot.workspaceGoalStore.restore(activeGoalId);
        if (goal === undefined) throw new Error("The active fixture Goal disappeared");
        const trajectory = await compositionRoot.readWorkspaceTrajectory({ goalId: goal.id, runId: goal.state.run.id });
        const answered = trajectory.committed.some(event => event.eventType === "ask_user_answered");
        const cancelled = trajectory.committed.some(event => event.eventType === "ask_user_skipped");
        const observed = trajectory.committed.some(event => event.eventType === "observation_recorded");
        const lastUser = goal.state.messages.filter(message => message.role === "user").at(-1)?.content ?? "";
        const cancellationFlow = goal.definition.intent.includes("Cancellation flow:");
        const needsQuestion = cancellationFlow ? !cancelled : goal.definition.intent.includes("Collect approved notes") && !lastUser.includes("follow-up") && !answered;
        // 人机交互验收流程：同一问卷覆盖逐题回答、整体回复、跳过与等待中停止，回答后按普通收尾继续。
        const humanFlow = goal.definition.intent.includes("Human interaction flow:");
        const humanResolved = trajectory.committed.some(event =>
            event.eventType === "ask_user_answered"
            || event.eventType === "ask_user_replied"
            || event.eventType === "ask_user_skipped");
        let result: Record<string, unknown>;
        if (goal.state.run.mode === "plan" && goal.state.run.approvedTask === undefined) {
            result = {
                kind: "task_proposal",
                planRoute: { stages: [{ target: "Complete the proposed task", acceptanceCriteria: ["The task outcome is verified"] }] },
                task: { objective: "Finish the controlled plan-flow check", completionCriteria: [{ text: "Plan Run completed", acceptance: null }] },
                approvalRequest: "Approve the deterministic plan-flow task?",
                memoryPatch: null,
            };
        } else if (humanFlow) {
            result = humanResolved ? await completedDecision() : {
                kind: "ask_user",
                questions: [
                    {
                        header: "Choose a source",
                        question: "Which notes should I include?",
                        options: [{ label: "Approved notes", description: null }, { label: "All notes", description: null }],
                        multiSelect: false,
                    },
                    {
                        header: "Choose sections",
                        question: "Which sections should I include?",
                        options: [{ label: "Summary", description: null }, { label: "Details", description: null }, { label: "Appendix", description: null }],
                        multiSelect: true,
                    },
                ],
                memoryPatch: null,
            };
        } else if (needsQuestion) {
            result = {
                kind: "ask_user",
                questions: [{ header: cancellationFlow ? "Stop check" : "Choose a source", question: cancellationFlow ? "Should this Run continue?" : "Which notes should I include?", options: cancellationFlow ? [{ label: "Continue", description: null }, { label: "Stop", description: null }] : [{ label: "Approved notes", description: null }, { label: "All notes", description: null }], multiSelect: false }],
                memoryPatch: null,
            };
        } else {
            const needsWrite = !cancellationFlow && !lastUser.includes("follow-up") && !observed;
            if (needsWrite && !goal.state.run.exposedToolIds.includes("browser_fixture_write")) {
                result = { kind: "tool_discovery", query: "browser_fixture_write" };
            } else if (goal.state.run.currentStage === undefined) {
                const plannedStage = goal.state.run.planRoute?.stages.find(stage => stage.status === "pending");
                result = {
                    kind: "run_stage_update",
                    stageId: null,
                    baseRevision: null,
                    reason: null,
                    contextNotes: null,
                    target: plannedStage?.target ?? "Complete the controlled acceptance flow",
                    acceptanceCriteria: plannedStage?.acceptanceCriteria ?? ["Complete the requested acceptance actions"],
                    memoryPatch: null,
                };
            } else if (needsWrite) {
                const plan = goal.state.run.mode === "plan";
                result = { kind: "tool_call", action: { actionId: plan ? "action-browser-e2e-plan-1" : "action-browser-e2e-1", toolId: "browser_fixture_write", input: { value: plan ? "controlled plan write" : "controlled write" } }, memoryPatch: null };
            } else {
                result = goal.state.run.mode === "plan" ? await completedPlanDecision() : await completedDecision();
            }
        }
        await appendFile(`${statusFile}.decisions`, JSON.stringify({ kind: result.kind, call: this.calls, feedback: request.messages.flatMap(message => { try { const data = JSON.parse(message.content); return data.source === "runtime_feedback" ? [{code: data.code, issues: data.issues.map((issue: {code: string; path: unknown}) => ({code: issue.code, path: issue.path}))}] : []; } catch { return []; } }) }) + "\n");
        const isComposerStatusFlow = request.messages.some(message => message.content.includes("Composer status flow:"));
        if (isComposerStatusFlow) await new Promise(resolve => setTimeout(resolve, 1200));
        const isStreamingSessionFlow = request.messages.some(message => message.content.includes("Streaming session flow:"));
        if (isStreamingSessionFlow) await new Promise(resolve => setTimeout(resolve, 8000));
        if (process.env.LAZYGOAL_E2E_DELAY_MODEL === "1" && !["run_stage_update", "tool_discovery"].includes(result.kind as string)) await new Promise(resolve => setTimeout(resolve, 5000));
        // 严格结构化输出以声明工具调用交付决策。
        return toolResponseFixture(JSON.stringify({ result }));
    }
}

const adapter = new DeterministicAdapter();

async function completedDecision() {
    if (compositionRoot === undefined || activeGoalId === undefined) {
        throw new Error("The deterministic completion needs the active persisted Goal");
    }
    const goal = await compositionRoot.workspaceGoalStore.restore(activeGoalId);
    if (goal === undefined) throw new Error("The active Goal disappeared before deterministic completion");
    const trajectory = await compositionRoot.readWorkspaceTrajectory({
        goalId: activeGoalId,
        runId: goal.state.run.id,
    });
    const evidenceSequences = trajectory.committed
        .filter((event) => event.eventType === "observation_recorded")
        .map((event) => event.sequence);
    return {
        kind: "complete",
        summary: "The controlled action completed.",
        evidenceSequences,
        memoryPatch: null,
        contextNotes: null,
    };
}

async function completedPlanDecision() {
    const result = await completedDecision();
    return {
        kind: "complete",
        summary: "The controlled plan flow is complete.",
        completionEvidence: [{ criterionIndex: 0, evidenceSequences: result.evidenceSequences }],
        memoryPatch: null,
        contextNotes: null,
    };
}

const workspace = process.env.LAZYGOAL_E2E_WORKSPACE;
const dataDirectory = process.env.LAZYGOAL_E2E_DATA;
const statusFile = process.env.LAZYGOAL_E2E_STATUS;
if (workspace === undefined || dataDirectory === undefined || statusFile === undefined) {
    throw new Error("Set the isolated workspace, data, and status paths for the browser acceptance service");
}
await mkdir(workspace, { recursive: true });
await mkdir(dataDirectory, { recursive: true });
await mkdir(dirname(statusFile), { recursive: true });
await writeStatus();

async function writeStatus(): Promise<void> {
    await writeFile(statusFile!, JSON.stringify({ modelCalls: adapter.calls, toolCalls }));
}
const controlledTool: Tool<typeof fixtureInput> = {
    definition: {
        id: "browser_fixture_write",
        description: "Write one deterministic value to the isolated acceptance workspace.",
        inputContract: fixtureInput,
        isReadOnly: false,
    },
    replayPolicy: "manual",
    validate: () => ({ ok: true }),
    async execute({ actionId, input }) {
        toolCalls += 1;
        await appendFile(resolve(workspace, "controlled-tool-actions.jsonl"), `${JSON.stringify({ actionId, value: input.value })}\n`);
        await writeStatus();
        return {
            kind: "success",
            output: "PRIVATE_CONTROLLED_TOOL_OUTPUT",
            summary: "Stored the controlled workspace value.",
        };
    },
};
const toolPolicy: ToolPolicy = {
    evaluate: () => "require_approval",
};
const access = createBrowserSessionAccess();
const root = await createCompositionRoot({
    cwd: workspace,
    dataDirectory,
    env: { LAZYGOAL_HOME: process.env.LAZYGOAL_E2E_HOME },
    adapter,
    profile,
    toolRegistry: new InMemoryToolRegistry([createToolRegistration(controlledTool)]),
    toolPolicy,
    runIdGenerator: () => `run-browser-e2e-${++nextRunId}`,
    httpMiddleware: access.middleware,
    exitPort: { exit() {} },
});
compositionRoot = root;

root.notifyingStore.onSave((goal) => {
    if (goal.state.run.stopReason !== undefined) {
        void writeFile(`${statusFile}.run-stop`, JSON.stringify({
            goalId: goal.id,
            runId: goal.state.run.id,
            status: goal.state.run.status,
            stopReason: goal.state.run.stopReason,
            pendingInteraction: goal.state.run.pendingInteraction?.kind,
        }));
    }
});
const commands = new BrowserGoalCommandService({
    store: root.workspaceGoalStore,
    coordinator: root.commands,
    modelSelectionCoordinator: root.goalModelSelectionCoordinator,
    readActiveGoalId: () => root.sessions.activeGoal,
    resolveModelSelection: async (modelId) => modelId === root.defaultModelSelection.modelId || modelId === "model-b"
        ? { ...root.defaultModelSelection, modelId } : undefined,
    control: { signal: root.abortController.signal },
});
/** 确定性 Adapter 需要知道当前受控 Goal；统一输入与事件流都由 Runtime 会话所有者处理。 */
const sessionPort = createBrowserGoalSessionPort({
    sessions: root.sessions,
    profileId: root.profile.id,
    isShuttingDown: () => root.abortController.signal.aborted,
    resolveModelSelection: async (command) => {
        const modelId = command.modelId ?? root.defaultModelSelection.modelId;
        if (modelId !== root.defaultModelSelection.modelId && modelId !== "model-b") {
            return { ok: false, error: "model_not_selectable" as const };
        }
        activeGoalId = command.goalId;
        return { ok: true as const, selection: { ...root.defaultModelSelection, modelId } };
    },
});
const browserSession = {
    ...sessionPort,
    submit: (goalId: string, input: Parameters<typeof sessionPort.submit>[1]) => {
        activeGoalId = goalId;
        return sessionPort.submit(goalId, input);
    },
    openEvents: (goalId: string, signal?: AbortSignal) => {
        activeGoalId = goalId;
        return sessionPort.openEvents(goalId, signal);
    },
};
const modelPreferenceStore = new JsonFileModelPreferenceStore(root.workspaceHomeDirectory);
root.httpService.mount("/", createBrowserGoalRoutes({
    list: () => listBrowserGoals(root.workspaceGoalStore, root.sessions.activeGoal),
    read: (goalId) => readBrowserGoalSession(
        goalId,
        root.workspaceGoalStore,
        root.readWorkspaceTrajectory,
        root.sessions.activeGoal,
    ),
    session: browserSession,
    enterPlanMode: (goalId, command) => {
        activeGoalId = goalId;
        return commands.enterPlanMode(goalId, command);
    },
    models: async (target) => ({ ok: true, catalog: {
        provider: root.defaultModelSelection.provider,
        currentModelId: target === undefined
            ? (await modelPreferenceStore.get())?.modelId ?? root.defaultModelSelection.modelId
            : (await root.workspaceGoalStore.restore(target.goalId))?.state.modelSelection.modelId ?? root.defaultModelSelection.modelId,
        models: [{
            id: root.defaultModelSelection.modelId,
            displayName: "Deterministic test model",
            availabilitySource: "configured",
            metadataSource: "configured",
            selectable: true,
        }, {
            id: "model-b",
            displayName: "Alternate test model",
            availabilitySource: "configured",
            metadataSource: "configured",
            selectable: true,
        }],
    } }),
    setModelPreference: async (modelId) => {
        if (modelId !== root.defaultModelSelection.modelId && modelId !== "model-b") return { ok: false, error: "model_not_selectable" };
        await modelPreferenceStore.set({ modelId });
        return { ok: true, modelId };
    },
    selectModel: (goalId, command) => commands.selectModel(goalId, command),
    readInteractionDetails: (goalId, runId, interactionId) => commands.readInteractionDetails(goalId, runId, interactionId),
    reviewActionApproval: (goalId, command) => commands.reviewActionApproval(goalId, command),
}));
root.httpService.mount("/", createBrowserTrajectoryRoutes(root.workspaceGoalStore, root.readWorkspaceTrajectory));
root.httpService.mount("/", createBrowserModelInputRoutes(root.workspaceGoalStore, (goalId, runId) => new JsonFileModelInputStore(resolve(dataDirectory, "model-inputs")).read(goalId, runId)));
root.httpService.mount("/", createBrowserStaticRoutes(resolve("apps/goal-board/dist")));
const address = await root.httpService.start(0);
access.bindOrigin(address.origin);
console.log(`LG_TEST_READY:${JSON.stringify({ origin: address.origin, launchUrl: access.createLaunchUrl(address.origin) })}`);

let closing = false;
async function close(): Promise<void> {
    if (closing) return;
    closing = true;
    await root.httpService.close();
    root.abortController.abort();
    await root.lifecycle.close().catch(() => undefined);
    await root.resources.closeAll().catch(() => undefined);
}
process.once("SIGTERM", () => {
    void close().then(() => process.exit(0), () => process.exit(1));
});
