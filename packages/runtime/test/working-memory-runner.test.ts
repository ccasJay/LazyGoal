import assert from "node:assert/strict";
import { test } from "node:test";

import {
    allocateImmutableEvent,
    classifyTrajectoryTail,
    createGoal,
    rebuildWorkingMemory,
    Runner,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import type {
    AgentDecision,
    AgentProfile,
    Goal,
    JsonValue,
    StepExecutionInput,
    StepExecutor,
    Tool,
    ToolPolicy,
    ToolRegistry,
    TrajectoryEvent,
    TrajectoryEventDraft,
    TrajectoryReadQuery,
    TrajectoryReadResult,
    TrajectoryStore,
} from "../src/index";

const profile: AgentProfile = {
    id: "memory-runner-profile",
    systemPrompt: "test",
    instructions: [],
    toolIds: ["read_file"],
};

class MemoryTrajectoryStore implements TrajectoryStore {
    readonly events: TrajectoryEvent[];

    constructor(initial: readonly TrajectoryEvent[] = []) {
        this.events = [...initial];
    }

    async append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        const event = allocateImmutableEvent(
            draft,
            (this.events.at(-1)?.sequence ?? 0) + 1,
            `memory-runner-event-${this.events.length + 1}`,
        );
        this.events.push(event);
        return event;
    }

    async read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        return this.events.filter((event) =>
            event.goalId === query.goalId
            && event.runId === query.runId
            && (query.fromSequence === undefined || event.sequence >= query.fromSequence)
            && (query.toSequence === undefined || event.sequence <= query.toSequence)
        );
    }

    async readWithBoundary(
        query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ): Promise<Readonly<TrajectoryReadResult>> {
        return classifyTrajectoryTail(
            await this.read(query),
            committedThroughSequence,
        );
    }
}

class RecordingStepExecutor implements StepExecutor {
    readonly inputs: StepExecutionInput[] = [];
    private index = 0;

    constructor(private readonly decisions: readonly AgentDecision[]) {}

    async execute(input: StepExecutionInput): Promise<AgentDecision> {
        this.inputs.push({
            ...input,
            authorizedTools: structuredClone([...input.authorizedTools]),
            ...(input.workingMemory === undefined
                ? {}
                : { workingMemory: structuredClone(input.workingMemory) }),
        });
        const decision = this.decisions[this.index];
        this.index += 1;
        if (decision === undefined) throw new Error("unexpected StepExecutor call");
        return structuredClone(decision);
    }
}

function structuredExecutingGoal(
    id: string,
    runId: string,
    completionCriteria: readonly string[] = ["已完成读取"],
): Goal {
    const goal = createGoal({
        id,
        runId,
        intent: "执行结构化 Runner 测试",
        promptBundleVersion: 4,
        memoryProtocol: { kind: "structured", version: 1 },
        profile,
    });
    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: {
                    objective: "执行结构化 Runner 测试",
                    completionCriteria: [...completionCriteria],
                },
            },
            run: {
                ...goal.state.run,
                status: "running",
                committedThroughSequence: 1,
            },
        },
    };
}

function committedObservation(
    goal: Goal,
): Readonly<TrajectoryEvent> {
    return allocateImmutableEvent({
        goalId: goal.id,
        runId: goal.state.run.id,
        phase: "executing",
        executionUnitId: "seed-execution-unit",
        actionId: "seed-action",
        eventType: "observation_recorded",
        payload: {
            type: "observation_recorded",
            actionId: "seed-action",
            observation: {
                kind: "success",
                output: { source: "seed" },
                summary: "seed observation",
            },
        },
    }, 1, "seed-observation");
}

function findingPatch(statement = "读取结果已确认") {
    return {
        protocolVersion: 1 as const,
        operations: [{
            type: "add_finding" as const,
            finding: {
                id: "finding-runner",
                statement,
                evidenceSequences: [1],
            },
        }],
    };
}

function createTool(
    execute: Tool["execute"],
): Tool {
    return {
        definition: {
            id: "read_file",
            description: "读取文件",
            inputSchema: { type: "object" },
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        execute,
    };
}

function createRegistry(tool: Tool): ToolRegistry {
    return { get: (toolId) => toolId === tool.definition.id ? tool : undefined };
}

function createPolicy(result: "allow" | "require_approval"): ToolPolicy {
    return { evaluate: () => result };
}

function eventTypes(trajectory: MemoryTrajectoryStore): readonly string[] {
    return trajectory.events.map((event) => event.eventType);
}

test("Runner commits an accepted Patch with an allowed Action before the Tool effect", async () => {
    const goal = structuredExecutingGoal("goal-runner-allow", "run-runner-allow");
    const trajectory = new MemoryTrajectoryStore([committedObservation(goal)]);
    const store = new InMemoryGoalStore();
    await store.save(goal);
    let observedBeforeTool: readonly TrajectoryEvent[] = [];
    let persistedBeforeTool: Goal | undefined;
    const tool = createTool(async () => {
        observedBeforeTool = [...trajectory.events];
        persistedBeforeTool = await store.restore(goal.id);
        return {
            kind: "success",
            output: "file contents" as JsonValue,
            summary: "读取完成",
        };
    });
    const action: Extract<AgentDecision, { readonly kind: "tool_call" }> = {
        kind: "tool_call",
        action: {
            actionId: "action-allow",
            toolId: "read_file",
            input: { path: "README.md" },
        },
        memoryPatch: findingPatch(),
    };
    const executor = new RecordingStepExecutor([
        action,
        {
            kind: "complete",
            summary: "读取完成",
            completionEvidence: [{ criterionIndex: 0, evidenceSequences: [1] }],
        },
    ]);
    const runner = new Runner({
        store,
        executor,
        toolRegistry: createRegistry(tool),
        trajectoryStore: trajectory,
    });

    const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "completed");
    assert.equal(executor.inputs[0]?.workingMemory?.findings.length, 0);
    assert.equal(executor.inputs[1]?.workingMemory?.findings[0]?.id, "finding-runner");

    const patchEvent = trajectory.events.find((event) => event.eventType === "memory_patch_accepted");
    const actionEvent = trajectory.events.find((event) => event.eventType === "action_staged");
    assert.ok(patchEvent);
    assert.ok(actionEvent);
    assert.ok(observedBeforeTool.indexOf(patchEvent) < observedBeforeTool.findIndex((event) => event.eventType === "tool_started"));
    assert.equal(persistedBeforeTool?.state.run.pendingAction?.status, "approved");
    assert.deepEqual(persistedBeforeTool?.state.run.memoryRevision, {
        eventId: patchEvent.eventId,
        sequence: patchEvent.sequence,
    });
    assert.ok(actionEvent.sequence < patchEvent.sequence);
    assert.ok((persistedBeforeTool?.state.run.committedThroughSequence ?? 0) >= patchEvent.sequence);
    assert.ok(eventTypes(trajectory).includes("run_completed"));
});

test("Runner commits an accepted Patch with an awaiting-approval Action and does not execute the Tool", async () => {
    const goal = structuredExecutingGoal("goal-runner-approval", "run-runner-approval", []);
    const trajectory = new MemoryTrajectoryStore([committedObservation(goal)]);
    const store = new InMemoryGoalStore();
    await store.save(goal);
    let toolExecuted = false;
    const tool = createTool(async () => {
        toolExecuted = true;
        return { kind: "success", output: null, summary: "不应执行" };
    });
    const executor = new RecordingStepExecutor([{
        kind: "tool_call",
        action: {
            actionId: "action-approval",
            toolId: "read_file",
            input: { path: "README.md" },
        },
        memoryPatch: findingPatch("待批准的读取结果"),
    }]);
    const runner = new Runner({
        store,
        executor,
        toolRegistry: createRegistry(tool),
        toolPolicy: createPolicy("require_approval"),
        trajectoryStore: trajectory,
    });

    const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "waiting");
    assert.equal(result.state.pendingAction?.status, "awaiting_approval");
    assert.equal(toolExecuted, false);
    assert.equal(trajectory.events.some((event) => event.eventType === "memory_patch_accepted"), true);
    assert.equal(trajectory.events.some((event) => event.eventType === "tool_started"), false);
    const persisted = await store.restore(goal.id);
    assert.equal(persisted?.state.run.pendingAction?.status, "awaiting_approval");
    assert.equal(persisted?.state.run.memoryRevision?.sequence, trajectory.events.find((event) => event.eventType === "memory_patch_accepted")?.sequence);
});

test("Runner rejects a Tool Action after Decision validation without accepting its Patch", async () => {
    const goal = structuredExecutingGoal("goal-runner-rejected-action", "run-runner-rejected-action");
    const trajectory = new MemoryTrajectoryStore([committedObservation(goal)]);
    const store = new InMemoryGoalStore();
    await store.save(goal);
    let toolExecuted = false;
    const tool: Tool = {
        ...createTool(async () => {
            toolExecuted = true;
            return { kind: "success", output: null, summary: "不应执行" };
        }),
        validate: () => ({
            ok: false as const,
            error: { code: "INVALID_TOOL_INPUT" as const, message: "路径非法" },
        }),
    };
    const executor = new RecordingStepExecutor([{
        kind: "tool_call",
        action: {
            actionId: "action-rejected",
            toolId: "read_file",
            input: { path: "" },
        },
        memoryPatch: findingPatch("不应随着拒绝 Action 提交"),
    }]);
    const runner = new Runner({
        store,
        executor,
        toolRegistry: createRegistry(tool),
        trajectoryStore: trajectory,
    });

    const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "failed");
    if (result.state.stopReason?.kind === "execution_error") {
        assert.equal(result.state.stopReason.code, "INVALID_TOOL_INPUT");
    } else {
        assert.fail("expected INVALID_TOOL_INPUT execution error");
    }
    assert.equal(toolExecuted, false);
    assert.equal(trajectory.events.some((event) => event.eventType === "memory_patch_accepted"), false);
    const persisted = await store.restore(goal.id);
    assert.ok(persisted);
    const rebuilt = await rebuildWorkingMemory(persisted, { trajectoryStore: trajectory });
    assert.deepEqual(rebuilt.memory.findings, []);
});

test("Runner rejects an invalid Patch before decision commit and keeps Memory unchanged", async () => {
    const goal = structuredExecutingGoal("goal-runner-invalid-patch", "run-runner-invalid-patch");
    const trajectory = new MemoryTrajectoryStore([committedObservation(goal)]);
    const store = new InMemoryGoalStore();
    await store.save(goal);
    let toolExecuted = false;
    const tool = createTool(async () => {
        toolExecuted = true;
        return { kind: "success", output: null, summary: "不应执行" };
    });
    const executor = new RecordingStepExecutor([{
        kind: "tool_call",
        action: {
            actionId: "action-invalid-patch",
            toolId: "read_file",
            input: { path: "README.md" },
        },
        memoryPatch: {
            protocolVersion: 1,
            operations: [{
                type: "add_finding",
                finding: {
                    id: "finding-invalid",
                    statement: "未提交证据",
                    evidenceSequences: [99],
                },
            }],
        },
    }]);
    const runner = new Runner({
        store,
        executor,
        toolRegistry: createRegistry(tool),
        trajectoryStore: trajectory,
    });

    const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "failed");
    assert.equal(result.state.stopReason?.kind, "execution_error");
    if (result.state.stopReason?.kind === "execution_error") {
        assert.equal(result.state.stopReason.code, "INVALID_MEMORY_PATCH");
    }
    assert.equal(toolExecuted, false);
    assert.equal(trajectory.events.some((event) => event.eventType === "decision_received"), false);
    assert.equal(trajectory.events.some((event) => event.eventType === "memory_patch_accepted"), false);
    const persisted = await store.restore(goal.id);
    assert.ok(persisted);
    const rebuilt = await rebuildWorkingMemory(persisted, { trajectoryStore: trajectory });
    assert.deepEqual(rebuilt.memory.findings, []);
});

test("Runner requires exact committed Evidence for structured completion and commits terminal Patch atomically", async () => {
    const goal = structuredExecutingGoal("goal-runner-complete", "run-runner-complete");
    const trajectory = new MemoryTrajectoryStore([committedObservation(goal)]);
    const store = new InMemoryGoalStore();
    await store.save(goal);
    const executor = new RecordingStepExecutor([{
        kind: "complete",
        summary: "已完成",
        completionEvidence: [{ criterionIndex: 0, evidenceSequences: [1] }],
        memoryPatch: findingPatch("终态前保存的事实"),
    }]);
    const runner = new Runner({
        store,
        executor,
        trajectoryStore: trajectory,
    });

    const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "completed");
    const patchEvent = trajectory.events.find((event) => event.eventType === "memory_patch_accepted");
    const completedEvent = trajectory.events.find((event) => event.eventType === "run_completed");
    assert.ok(patchEvent);
    assert.ok(completedEvent);
    assert.ok(completedEvent.sequence < patchEvent.sequence);
    const persisted = await store.restore(goal.id);
    assert.ok(persisted);
    assert.equal(persisted.state.run.committedThroughSequence, patchEvent.sequence);
    assert.deepEqual(persisted.state.run.memoryRevision, {
        eventId: patchEvent.eventId,
        sequence: patchEvent.sequence,
    });
    const rebuilt = await rebuildWorkingMemory(persisted, { trajectoryStore: trajectory });
    assert.equal(rebuilt.memory.findings[0]?.statement, "终态前保存的事实");
});

test("Runner prevents completion when evidence does not cover every criterion", async () => {
    const goal = structuredExecutingGoal("goal-runner-incomplete-evidence", "run-runner-incomplete-evidence", [
        "第一项",
        "第二项",
    ]);
    const trajectory = new MemoryTrajectoryStore([committedObservation(goal)]);
    const store = new InMemoryGoalStore();
    await store.save(goal);
    const executor = new RecordingStepExecutor([{
        kind: "complete",
        summary: "错误完成",
        completionEvidence: [{ criterionIndex: 0, evidenceSequences: [1] }],
    }]);
    const runner = new Runner({
        store,
        executor,
        trajectoryStore: trajectory,
    });

    const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "failed");
    if (result.state.stopReason?.kind === "execution_error") {
        assert.equal(result.state.stopReason.code, "INVALID_AGENT_DECISION");
    } else {
        assert.fail("expected INVALID_AGENT_DECISION execution error");
    }
    assert.equal(trajectory.events.some((event) => event.eventType === "run_completed"), false);
});

test("Runner fails closed before a structured model call when Trajectory is unavailable", async () => {
    const goal = structuredExecutingGoal("goal-runner-no-trajectory", "run-runner-no-trajectory");
    const store = new InMemoryGoalStore();
    await store.save(goal);
    let calls = 0;
    const executor: StepExecutor = {
        async execute(): Promise<AgentDecision> {
            calls += 1;
            return { kind: "wait", reason: "不会调用" };
        },
    };
    const runner = new Runner({ store, executor });

    await assert.rejects(
        runner.run({ goalId: goal.id, runId: goal.state.run.id }),
        (error: unknown) =>
            error instanceof Error
            && "code" in error
            && error.code === "WORKING_MEMORY_TRAJECTORY_REQUIRED",
    );
    assert.equal(calls, 0);
});
