import assert from "node:assert/strict";
import { test } from "node:test";

import {
    GoalCoordinator,
    InMemoryToolRegistry,
    InlineScheduler,
    launch,
    Runner,
    createToolRegistration,
} from "../src/index";
import { contract } from "../../contracts/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { trajectoryStoreFor } from "./current-fixtures";
import type {
    AgentDecision,
    AgentProfile,
    AgentProfileRegistry,
    Goal,
    GoalProgressResult,
    GoalStore,
    LaunchResult,
    StepExecutionInput,
    StepExecutor,
    Tool,
} from "../src/index";

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Clarify with ask_user, propose task, then execute continuously."],
    toolIds: ["read_file"],
};

const readFileTool: Tool = {
    definition: {
        id: "read_file",
        description: "Read a file",
        inputContract: contract.object({ path: contract.string() }),
        isReadOnly: true,
    },
    replayPolicy: "safe",
    validate: () => ({ ok: true }),
    async execute({ input }) {
        return {
            kind: "success",
            output: { path: (input as { readonly path: string }).path, content: "workflow facts" },
            summary: "Read workflow facts",
        };
    },
};

class SingleProfileRegistry implements AgentProfileRegistry {
    get(profileId: string): AgentProfile | undefined {
        return profileId === profile.id ? profile : undefined;
    }
}

class WorkflowStore implements GoalStore {
    private readonly delegate = new InMemoryGoalStore();

    constructor(private readonly events: string[]) {}

    async save(goal: Goal): Promise<void> {
        this.events.push([
            "save",
            goal.state.workflow.phase,
            goal.state.run.status,
            goal.state.run.stepCount,
        ].join(":"));
        await this.delegate.save(goal);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        this.events.push(`restore:${goalId}`);
        return this.delegate.restore(goalId);
    }
}

class WorkflowStepExecutor implements StepExecutor {
    private readonly decisions: readonly AgentDecision[] = [
        {
            kind: "ask_user",
            questions: [
                {
                    header: "持久化后端",
                    question: "Which persistence backend should be used?",
                    options: [
                        { label: "JSON" },
                        { label: "SQLite" },
                    ],
                    multiSelect: false,
                },
            ],
        },
        {
            kind: "tool_call",
            action: {
                actionId: "workflow-read-1",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        },
        {
            kind: "task_proposal",
            task: {
                objective: "Implement JSON session persistence",
                completionCriteria: [],
            },
            approvalRequest: "Approve this implementation task?",
        },
        {
            kind: "wait",
            reason: "Write permission required",
        },
        {
            kind: "complete",
            summary: "Persistence implemented",
            completionEvidence: [],
        },
    ];
    private callCount = 0;

    constructor(private readonly events: string[]) {}

    async execute({ goal }: StepExecutionInput): Promise<AgentDecision> {
        this.events.push(`step:${goal.state.run.stepCount}`);
        const decision = this.decisions[this.callCount];
        this.callCount += 1;

        if (decision === undefined) {
            throw new Error("Unexpected StepExecutor call");
        }

        return decision;
    }
}

function requireSuccess(
    result: LaunchResult,
): Extract<LaunchResult, { readonly ok: true }> {
    if (!result.ok) {
        assert.fail(`${result.error.code}: ${result.error.message}`);
    }

    return result;
}

test("runs the complete ask_user, ordinary read, task approval, blocked resume, and execution flow", async () => {
    const events: string[] = [];
    const store = new WorkflowStore(events);
    const runner = new Runner({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        executor: new WorkflowStepExecutor(events),
        toolRegistry: new InMemoryToolRegistry([
            createToolRegistration(readFileTool),
        ]),
    });
    const coordinator = new GoalCoordinator({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        scheduler: new InlineScheduler(runner),
    });
    const ref = { goalId: "goal-e2e", runId: "run-e2e" };

    const launched = requireSuccess(await launch(
        {
            goalId: ref.goalId,
            intent: "Build resumable persistence",
            profileId: profile.id,
        },
        {
            profiles: new SingleProfileRegistry(),
            runIdGenerator: () => ref.runId,
            store,
            coordinator,
        },
    ));

    assert.equal(launched.kind, "waiting");
    assert.equal(launched.phase, "executing");
    assert.equal(launched.waitingFor, "ask_user");
    assert.equal(launched.goal.state.run.stepCount, 0);
    assert.equal(launched.goal.state.workflow.task, undefined);
    assert.equal(launched.goal.state.run.pendingInteraction?.kind, "ask_user");

    const askUserInteraction = launched.goal.state.run.pendingInteraction;
    assert.equal(askUserInteraction.kind, "ask_user");
    const question = askUserInteraction.questions[0]!;
    const option = question.options[0]!;

    const proposed = requireSuccess(await coordinator.resume({
        ref,
        action: {
            kind: "answer_ask_user",
            requestId: askUserInteraction.requestId,
            answers: [
                {
                    questionId: question.id,
                    optionIds: [option.id],
                },
            ],
        },
    }));

    assert.equal(proposed.kind, "waiting");
    assert.equal(proposed.phase, "executing");
    assert.equal(proposed.waitingFor, "task_approval");
    assert.equal(proposed.goal.state.run.stepCount, 1);
    assert.equal(proposed.goal.state.run.lastStep?.kind, "action");
    if (proposed.goal.state.run.lastStep?.kind === "action") {
        assert.equal(proposed.goal.state.run.lastStep.action.actionId, "workflow-read-1");
        assert.equal(proposed.goal.state.run.lastStep.observation.kind, "success");
    }
    assert.equal(proposed.goal.state.workflow.task, undefined);
    assert.equal(proposed.goal.state.run.pendingInteraction?.kind, "task_approval");

    const trajectory = await trajectoryStoreFor(store).read({
        goalId: ref.goalId,
        runId: ref.runId,
    });
    assert.ok(trajectory.some((event) => event.eventType === "action_staged"));
    assert.ok(trajectory.some((event) => event.eventType === "observation_recorded"));

    events.length = 0;
    const blocked = requireSuccess(await coordinator.resume({
        ref,
        action: { kind: "approve_task" },
    }));

    assert.equal(blocked.kind, "waiting");
    assert.equal(blocked.phase, "executing");
    assert.equal(blocked.waitingFor, "blocked");
    assert.equal(blocked.goal.state.run.stepCount, 2);
    assert.deepEqual(blocked.goal.state.workflow.task, {
        objective: "Implement JSON session persistence",
        completionCriteria: [],
    });

    events.length = 0;
    const completed = requireSuccess(await coordinator.resume({
        ref,
        action: { kind: "message", content: "Permission granted" },
    }));

    assert.equal(completed.kind, "terminal");
    assert.equal(completed.phase, "executing");
    assert.equal(completed.goal.state.run.status, "completed");
    assert.equal(completed.goal.state.run.stepCount, 3);
});
