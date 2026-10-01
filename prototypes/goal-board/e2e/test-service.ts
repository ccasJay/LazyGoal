import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { contract } from "../../../packages/contracts/src/index";
import type { LLMAdapter, LLMRequest, LLMResponse } from "../../../packages/llm/src/core/adapter";
import {
    createToolRegistration,
    InMemoryToolRegistry,
} from "../../../packages/runtime/src/index";
import type { AgentProfile, Tool, ToolPolicy } from "../../../packages/runtime/src/index";
import {
    createBrowserGoalRoutes,
    createBrowserTrajectoryRoutes,
    createBrowserSessionAccess,
    createBrowserStaticRoutes,
    BrowserGoalCommandService,
    BrowserGoalStreamService,
    listBrowserGoals,
    readBrowserGoalSession,
} from "../../../packages/browser/src/index";
import { createCompositionRoot } from "../../../packages/tui/src/cli";

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
let planTaskProposed = false;
let compositionRoot: Awaited<ReturnType<typeof createCompositionRoot>> | undefined;

class DeterministicAdapter implements LLMAdapter {
    readonly structuredOutputMode = "strict" as const;
    calls = Number(process.env.LAZYGOAL_E2E_MODEL_OFFSET ?? "0");

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.calls += 1;
        await writeStatus();
        const isPlanFlow = request.messages.some((message) => message.content.includes("Plan flow:"));
        const result = isPlanFlow
            ? !planTaskProposed
                ? (planTaskProposed = true, {
                    kind: "task_proposal",
                    task: {
                        objective: "Finish the controlled plan-flow check",
                        completionCriteria: [{ text: "Plan Run completed", acceptance: null }],
                    },
                    approvalRequest: "Approve the deterministic plan-flow task?",
                    memoryPatch: null,
                })
                : this.calls === 6
                    ? {
                        kind: "tool_call",
                        action: {
                            actionId: "action-browser-e2e-plan-1",
                            toolId: "browser_fixture_write",
                            input: { value: "controlled plan write" },
                        },
                        memoryPatch: null,
                    }
                    : await completedPlanDecision()
            : this.calls === 1
            ? {
                kind: "ask_user",
                questions: [{
                    header: "Choose a source",
                    question: "Which notes should I include?",
                    options: [
                        { label: "Approved notes", description: null },
                        { label: "All notes", description: null },
                    ],
                    multiSelect: false,
                }],
                memoryPatch: null,
            }
            : this.calls === 2
                ? {
                    kind: "tool_call",
                    action: {
                        actionId: "action-browser-e2e-1",
                        toolId: "browser_fixture_write",
                        input: { value: "controlled write" },
                    },
                    memoryPatch: null,
                }
                : await completedDecision();
        return { content: JSON.stringify({ result }) };
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
    };
}

async function completedPlanDecision() {
    const result = await completedDecision();
    return {
        kind: "complete",
        summary: "The controlled plan flow is complete.",
        completionEvidence: [{ criterionIndex: 0, evidenceSequences: result.evidenceSequences }],
        memoryPatch: null,
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
    saveNotifications: root.notifyingStore,
    launcher: root.launcher,
    coordinator: root.coordinator,
    profileId: root.profile.id,
    control: { signal: root.abortController.signal },
});
const streams = new BrowserGoalStreamService({
    store: root.workspaceGoalStore,
    saveNotifications: root.notifyingStore,
    publisher: root.executionStream,
});
root.httpService.mount("/", createBrowserGoalRoutes({
    list: () => listBrowserGoals(root.workspaceGoalStore),
    read: (goalId) => readBrowserGoalSession(
        goalId,
        root.workspaceGoalStore,
        root.readWorkspaceTrajectory,
    ),
    create: (command) => {
        activeGoalId = command.goalId;
        return commands.create(command);
    },
    interact: (goalId, command) => {
        activeGoalId = goalId;
        return commands.interact(goalId, command);
    },
    message: (goalId, command) => {
        activeGoalId = goalId;
        return commands.message(goalId, command);
    },
    enterPlanMode: (goalId, command) => {
        activeGoalId = goalId;
        return commands.enterPlanMode(goalId, command);
    },
    openStream: (goalId, runId, signal) => streams.open(goalId, runId, signal),
}));
root.httpService.mount("/", createBrowserTrajectoryRoutes(root.workspaceGoalStore, root.readWorkspaceTrajectory));
root.httpService.mount("/", createBrowserStaticRoutes(resolve("packages/browser/static")));
const address = await root.httpService.start(0);
access.bindOrigin(address.origin);
console.log(`LG_TEST_READY:${JSON.stringify({ origin: address.origin, launchUrl: access.createLaunchUrl(address.origin) })}`);

let closing = false;
async function close(): Promise<void> {
    if (closing) return;
    closing = true;
    await root.httpService.close();
    root.abortController.abort();
    root.controller.dispose();
    await root.resources.closeAll();
}
process.once("SIGTERM", () => {
    void close().then(() => process.exit(0), () => process.exit(1));
});
