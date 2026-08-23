import assert from "node:assert/strict";
import { test } from "node:test";

import {
    GoalCoordinator,
    InlineScheduler,
    launch,
    Runner,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import type {
    AgentDecision,
    AgentProfile,
    AgentProfileRegistry,
    Goal,
    GoalProgressResult,
    GoalStore,
    LaunchResult,
    PreparationExecutor,
    PreparationResult,
    StepExecutor,
} from "../src/index";

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Prepare, request approval, then execute continuously."],
    toolIds: [],
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

class WorkflowPreparationExecutor implements PreparationExecutor {
    private readonly results: readonly PreparationResult[] = [
        { kind: "question", question: "Which persistence backend should be used?" },
        { kind: "context_ready" },
        {
            kind: "task_proposal",
            task: {
                objective: "Implement JSON session persistence",
                completionCriteria: ["The session can be restored"],
            },
            approvalRequest: "Approve this implementation task?",
        },
    ];
    private callCount = 0;

    constructor(private readonly events: string[]) {}

    async execute(goal: Goal): Promise<PreparationResult> {
        this.events.push(`prepare:${goal.state.workflow.phase}`);
        const result = this.results[this.callCount];
        this.callCount += 1;

        if (result === undefined) {
            throw new Error("Unexpected PreparationExecutor call");
        }

        return result;
    }
}

class WorkflowStepExecutor implements StepExecutor {
    private readonly decisions: readonly AgentDecision[] = [
        {
            kind: "wait",
            checkpoint: "需要写入权限才能继续",
            reason: "Write permission required",
        },
        {
            kind: "complete",
            checkpoint: "持久化已实现",
            summary: "Persistence implemented",
        },
    ];
    private callCount = 0;

    constructor(private readonly events: string[]) {}

    async execute(goal: Goal): Promise<AgentDecision> {
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

test("runs the complete preparation, approval, blocked resume, and execution flow", async () => {
    const events: string[] = [];
    const store = new WorkflowStore(events);
    const runner = new Runner({
        store,
        executor: new WorkflowStepExecutor(events),
    });
    const coordinator = new GoalCoordinator({
        store,
        preparationExecutor: new WorkflowPreparationExecutor(events),
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
            promptBundleVersion: 1,
        },
    ));

    assert.equal(launched.kind, "waiting");
    assert.equal(launched.phase, "gathering_context");
    assert.ok(
        events.indexOf("save:gathering_context:created:0")
        < events.indexOf("prepare:gathering_context"),
    );

    const proposed = requireSuccess(await coordinator.resume({
        ref,
        action: { kind: "message", content: "Use a JSON file" },
    }));

    assert.equal(proposed.kind, "waiting");
    assert.equal(proposed.phase, "planning");
    assert.equal(proposed.waitingFor, "approval");
    assert.equal(proposed.goal.state.run.stepCount, 0);

    events.length = 0;
    const blocked = requireSuccess(await coordinator.resume({
        ref,
        action: { kind: "approve" },
    }));

    assert.equal(blocked.kind, "waiting");
    assert.equal(blocked.phase, "executing");
    assert.equal(blocked.waitingFor, "blocked");
    assert.ok(
        events.indexOf("save:executing:created:0")
        < events.indexOf("step:0"),
    );
    assert.equal(blocked.goal.state.run.stepCount, 1);

    events.length = 0;
    const completed = requireSuccess(await coordinator.resume({
        ref,
        action: { kind: "message", content: "Permission granted" },
    }));

    assert.equal(completed.kind, "terminal");
    assert.equal(completed.phase, "executing");
    assert.equal(completed.goal.state.run.status, "completed");
    assert.equal(completed.goal.state.run.stepCount, 2);
    assert.ok(
        events.indexOf("save:executing:running:1")
        < events.indexOf("step:1"),
    );
    assert.deepEqual(completed.goal.state.messages, [
        { role: "user", content: "Build resumable persistence" },
        {
            role: "assistant",
            assistant: { profileId: profile.id },
            content: "Which persistence backend should be used?",
        },
        { role: "user", content: "Use a JSON file" },
        {
            role: "assistant",
            assistant: { profileId: profile.id },
            content: [
                "Objective: Implement JSON session persistence",
                "Completion criteria:",
                "1. The session can be restored",
                "Approval request: Approve this implementation task?",
            ].join("\n"),
        },
        {
            role: "assistant",
            assistant: { profileId: profile.id },
            content: "Write permission required",
        },
        { role: "user", content: "Permission granted" },
        {
            role: "assistant",
            assistant: { profileId: profile.id },
            content: "Persistence implemented",
        },
    ]);
});
