import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import { contract } from "../../contracts/src/index";
import { InMemoryExecutionStreamPublisher } from "../../execution-stream/src/index";
import {
    createGoal,
    createToolRegistration,
    readTrajectoryAtSnapshot,
    Runner,
    transition,
} from "../../runtime/src/index";
import type {
    AgentProfile,
    Goal,
    Tool,
    TrajectoryEventDraft,
    TrajectoryReadQuery,
    TrajectoryReadResult,
    TrajectoryStore,
} from "../../runtime/src/index";
import { JsonFileGoalStore, JsonFileTrajectoryStore } from "../../storage/src/index";
import {
    BrowserGoalCommandService,
    BrowserGoalStreamService,
    createBrowserGoalRoutes,
    listBrowserGoals,
    readBrowserGoalSession,
    type BrowserGoalSaveNotifications,
} from "../src/index";

const protocols = {
    memoryProtocol: { kind: "structured", version: 1 } as const,
    modelContextProtocol: { kind: "trajectory-layered", version: 1 } as const,
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 } as const,
};

const profile: AgentProfile = {
    id: "browser-recovery-profile",
    systemPrompt: "Recover the current Goal from its saved state.",
    instructions: [],
    toolIds: ["manual_write"],
};

const inputContract = contract.record(contract.string());
const saveNotifications: BrowserGoalSaveNotifications = {
    onSave() { return () => undefined; },
};

test("recreated browser services restore committed messages, steps, wait, and plan", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-browser-recovery-view-"));
    try {
        const initialStore = new JsonFileGoalStore(join(directory, "goals"));
        const initialTrajectory = new JsonFileTrajectoryStore(join(directory, "trajectory"));
        const goal = await saveWaitingSession(initialStore, initialTrajectory, "goal-browser-recovery-view");
        await initialTrajectory.append({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId: "uncommitted-tail",
            stepIndex: 2,
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: { kind: "complete", summary: "not committed", completionEvidence: [] },
            },
        });

        const beforeRestart = await readSession(createApi(initialStore, initialTrajectory), goal.id);
        const restartedStore = new JsonFileGoalStore(join(directory, "goals"));
        const restartedTrajectory = new JsonFileTrajectoryStore(join(directory, "trajectory"));
        const afterRestart = await readSession(createApi(restartedStore, restartedTrajectory), goal.id);

        assert.deepEqual(afterRestart, beforeRestart);
        assert.deepEqual(afterRestart.messages.map((message) => message.content), [
            "Collect approved notes",
            "I found three notes.",
            "Which source should I use?",
        ]);
        assert.equal(afterRestart.currentRunId, goal.state.run.id);
        assert.equal(afterRestart.runStatus, "waiting");
        assert.equal(afterRestart.pendingInteraction?.kind, "ask_user");
        assert.equal(afterRestart.pendingInteraction?.requestId, "request-recovery-1");
        assert.deepEqual(afterRestart.goalPlan?.items.map((item) => item.content), ["Review saved notes"]);
        assert.equal(afterRestart.runs[0]?.steps.length, 1);
        assert.equal(afterRestart.runs[0]?.steps[0]?.status, "completed");
        assert.equal(afterRestart.runs[0]?.steps[0]?.summary, "Found three approved notes.");
        assert.equal(JSON.stringify(afterRestart).includes("uncommitted-tail"), false);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("manual Tool result recovered after restart stays unknown and stream reconnection does not rerun it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-browser-recovery-action-"));
    try {
        const goalDirectory = join(directory, "goals");
        const trajectoryDirectory = join(directory, "trajectory");
        const initialStore = new JsonFileGoalStore(goalDirectory);
        const initialTrajectory = new JsonFileTrajectoryStore(trajectoryDirectory);
        const interrupted = await saveApprovedAction(initialStore, "goal-browser-recovery-action");
        let toolCalls = 0;
        const tool: Tool<typeof inputContract> = {
            definition: {
                id: "manual_write",
                description: "A controlled non-repeatable workspace action.",
                inputContract,
                isReadOnly: false,
            },
            replayPolicy: "manual",
            validate: () => ({ ok: true }),
            async execute() {
                toolCalls += 1;
                return {
                    kind: "success",
                    output: "PRIVATE_UNSAVED_ACTION_RESULT",
                    summary: "Result awaiting durable observation.",
                };
            },
        };
        const registration = createToolRegistration(tool);
        const firstProcessTrajectory = new FailObservationTrajectoryStore(initialTrajectory);
        const firstRunner = new Runner({
            store: initialStore,
            trajectoryStore: firstProcessTrajectory,
            toolRegistry: { get: () => registration },
            executor: { async execute() { throw new Error("pending action must bypass the model"); } },
        });

        await assert.rejects(firstRunner.run(
            { goalId: interrupted.id, runId: interrupted.state.run.id },
            { authorizedActionId: "action-recovery-1" },
        ));
        assert.equal(toolCalls, 1);
        assert.equal((await initialStore.restore(interrupted.id))?.state.run.pendingAction?.status, "approved");

        const restartedStore = new JsonFileGoalStore(goalDirectory);
        const restartedTrajectory = new JsonFileTrajectoryStore(trajectoryDirectory);
        const restartedRunner = new Runner({
            store: restartedStore,
            trajectoryStore: restartedTrajectory,
            toolRegistry: { get: () => registration },
            executor: { async execute() { throw new Error("manual recovery must not request a new decision"); } },
        });
        const recovered = await restartedRunner.run({
            goalId: interrupted.id,
            runId: interrupted.state.run.id,
        });
        assert.equal(recovered.ok, true);
        if (!recovered.ok) return;
        assert.equal(recovered.state.status, "waiting");
        assert.equal(recovered.state.pendingAction?.status, "outcome_unknown");
        assert.equal(toolCalls, 1);

        const api = createApi(restartedStore, restartedTrajectory);
        const recoveredSession = await readSession(api, interrupted.id);
        assert.equal(recoveredSession.pendingAction?.status, "outcome_unknown");
        assert.equal(recoveredSession.pendingAction?.actionId, "action-recovery-1");
        assert.equal(recoveredSession.runs[0]?.steps[0]?.status, "recorded");
        assert.equal(recoveredSession.runs[0]?.steps[0]?.summary, undefined);
        assert.equal(JSON.stringify(recoveredSession).includes("PRIVATE_UNSAVED_ACTION_RESULT"), false);

        const stream = await api.request(
            `http://localhost/api/goals/${interrupted.id}/events?runId=${interrupted.state.run.id}`,
        );
        assert.equal(stream.status, 200);
        const reader = stream.body?.getReader();
        assert.ok(reader);
        const firstEvent = await reader.read();
        assert.equal(new TextDecoder().decode(firstEvent.value).includes("snapshot_changed"), true);
        await reader.cancel();
        assert.equal(toolCalls, 1);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

async function saveWaitingSession(
    store: JsonFileGoalStore,
    trajectory: JsonFileTrajectoryStore,
    goalId: string,
): Promise<Goal> {
    const initial = createGoal({
        ...protocols,
        id: goalId,
        intent: "Collect approved notes",
        promptBundleVersion: 1,
        profile,
        runId: "run-recovery-view-1",
    });
    let run = transition(initial.state.run, { kind: "start" });
    if (!run.ok) throw new Error(run.error.message);
    let next = transition(run.state, {
        kind: "stage_action",
        status: "approved",
        action: { actionId: "action-history-1", toolId: "manual_write", input: { value: "saved" } },
    });
    if (!next.ok) throw new Error(next.error.message);
    run = transition(next.state, {
        kind: "observe_action",
        actionId: "action-history-1",
        observation: { kind: "success", output: "saved", summary: "Found three approved notes." },
    });
    if (!run.ok) throw new Error(run.error.message);
    next = transition(run.state, {
        kind: "stage_interaction",
        interaction: {
            kind: "ask_user",
            requestId: "request-recovery-1",
            mode: "execution",
            questions: [{
                id: "source",
                header: "Choose a source",
                question: "Which notes should I include?",
                multiSelect: false,
                options: [
                    { id: "approved", label: "Approved notes" },
                    { id: "all", label: "All notes" },
                ],
            }],
        },
    });
    if (!next.ok) throw new Error(next.error.message);

    const facts = historyFacts(goalId, initial.state.run.id);
    for (const fact of facts) await trajectory.append(fact);
    const committedThroughSequence = facts.length;
    await trajectory.append({
        goalId,
        runId: initial.state.run.id,
        phase: "executing",
        eventType: "state_committed",
        payload: { type: "state_committed", committedThroughSequence },
    });
    const goal: Goal = {
        ...initial,
        state: {
            ...initial.state,
            workflow: { phase: "executing" },
            messages: [
                { role: "user", content: "Collect approved notes" },
                { role: "assistant", assistant: { profileId: profile.id }, content: "I found three notes." },
                { role: "assistant", assistant: { profileId: profile.id }, content: "Which source should I use?" },
            ],
            goalPlan: {
                revision: 1,
                items: [{ id: "plan-review", content: "Review saved notes", position: 0, status: "in_progress" }],
            },
            run: { ...next.state, committedThroughSequence },
        },
    };
    await store.save(goal);
    return goal;
}

async function saveApprovedAction(store: JsonFileGoalStore, goalId: string): Promise<Goal> {
    const initial = createGoal({
        ...protocols,
        id: goalId,
        intent: "Write one file exactly once",
        promptBundleVersion: 1,
        profile,
        runId: "run-recovery-action-1",
    });
    const started = transition(initial.state.run, { kind: "start" });
    if (!started.ok) throw new Error(started.error.message);
    const staged = transition(started.state, {
        kind: "stage_action",
        status: "approved",
        action: { actionId: "action-recovery-1", toolId: "manual_write", input: { value: "once" } },
    });
    if (!staged.ok) throw new Error(staged.error.message);
    const goal: Goal = {
        ...initial,
        state: { ...initial.state, workflow: { phase: "executing" }, run: staged.state },
    };
    await store.save(goal);
    return goal;
}

function historyFacts(goalId: string, runId: string): readonly TrajectoryEventDraft[] {
    const action = { actionId: "action-history-1", toolId: "manual_write", input: { value: "saved" } };
    const observation = {
        kind: "success" as const,
        output: "PRIVATE_SAVED_TOOL_OUTPUT",
        summary: "Found three approved notes.",
    };
    const shared = {
        goalId,
        runId,
        phase: "executing" as const,
        executionUnitId: "unit-history-1",
        stepIndex: 1,
        actionId: action.actionId,
    };
    return [
        {
            ...shared,
            eventType: "decision_received",
            payload: { type: "decision_received", decision: { kind: "tool_call", action } },
        },
        {
            ...shared,
            eventType: "action_staged",
            payload: { type: "action_staged", action, approvalStatus: "approved" },
        },
        {
            ...shared,
            eventType: "tool_finished",
            payload: { type: "tool_finished", actionId: action.actionId, toolId: action.toolId, observation },
        },
        {
            ...shared,
            eventType: "observation_recorded",
            payload: { type: "observation_recorded", actionId: action.actionId, observation },
        },
    ];
}

function createApi(store: JsonFileGoalStore, trajectory: JsonFileTrajectoryStore) {
    const commands = new BrowserGoalCommandService({
        store,
        saveNotifications,
        profileId: profile.id,
        launcher: {
            async launch() { throw new Error("Browser reads must not launch a Goal"); },
        },
        coordinator: {
            async resume() { throw new Error("Browser reads must not resume a Goal"); },
            async continue() { throw new Error("Browser reads must not continue a Goal"); },
            async enterPlanMode() { throw new Error("Browser reads must not change a Goal mode"); },
        },
    });
    const streams = new BrowserGoalStreamService({
        store,
        saveNotifications,
        publisher: new InMemoryExecutionStreamPublisher(),
    });
    return createBrowserGoalRoutes({
        list: () => listBrowserGoals(store),
        read: (goalId) => readBrowserGoalSession(
            goalId,
            store,
            (query) => readTrajectoryAtSnapshot(store, trajectory, query),
        ),
        create: (command) => commands.create(command),
        interact: (goalId, command) => commands.interact(goalId, command),
        message: (goalId, command) => commands.message(goalId, command),
        enterPlanMode: (goalId, command) => commands.enterPlanMode(goalId, command),
        openStream: (goalId, runId, signal) => streams.open(goalId, runId, signal),
    });
}

async function readSession(api: ReturnType<typeof createApi>, goalId: string) {
    const response = await api.request(`http://localhost/api/goals/${goalId}`);
    assert.equal(response.status, 200);
    const body = await response.json() as { goal: Awaited<ReturnType<typeof readBrowserGoalSession>> };
    assert.ok(body.goal);
    return body.goal;
}

class FailObservationTrajectoryStore implements TrajectoryStore {
    constructor(private readonly delegate: JsonFileTrajectoryStore) {}

    append(draft: TrajectoryEventDraft) {
        if (draft.eventType === "observation_recorded") {
            return Promise.reject(new Error("controlled interruption before Observation commit"));
        }
        return this.delegate.append(draft);
    }

    read(query: TrajectoryReadQuery) {
        return this.delegate.read(query);
    }

    readWithBoundary(query: TrajectoryReadQuery, committedThroughSequence: number): Promise<Readonly<TrajectoryReadResult>> {
        return this.delegate.readWithBoundary(query, committedThroughSequence);
    }
}
