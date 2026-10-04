import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    createToolRegistration,
    Runner,
    type AgentDecision,
    type Goal,
    type StepExecutionInput,
    type StepExecutor,
    type Tool,
    type ToolStreamEvent,
} from "../src/index";
import { contract } from "../../contracts/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import {
    InMemoryExecutionStreamPublisher,
    type ExecutionStreamPublisher,
} from "../../execution-stream/src/index";
import { BaseTestStepExecutor, currentProtocols, trajectoryStoreFor, withDiscoveredProfileTools } from "./current-fixtures";

const inputContract = contract.record(contract.string());

function createStreamGoal(): Goal {
    const created = withDiscoveredProfileTools(createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "goal-stream-runtime",
        intent: "exercise execution stream",
        profile: {
            id: "profile-stream",
            systemPrompt: "test",
            instructions: [],
            toolIds: ["stream-tool"],
        },
        runId: "run-stream-runtime",
    }));
    return {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "executing",
            },
            run: { ...created.state.run, mode: "plan", approvedTask: { objective: "stream", completionCriteria: [] } },
        },
    };
}

class StreamDecisionExecutor extends BaseTestStepExecutor {
    private calls = 0;

    constructor() {
        super();
    }

    async execute(_input: StepExecutionInput): Promise<AgentDecision> {
        this.calls += 1;
        return this.calls === 1
            ? {
                kind: "tool_call",
                action: {
                    actionId: "action-stream-runtime",
                    toolId: "stream-tool",
                    input: { command: "echo stream" },
                },
            }
            : { kind: "complete", summary: "done", completionEvidence: [] };
    }
}

function createStreamingTool(): Tool<typeof inputContract> {
    const definition = {
        id: "stream-tool",
        description: "stream test",
        inputContract,
        isReadOnly: true,
    } as const;
    return {
        definition,
        replayPolicy: "safe",
        validate: () => ({ ok: true } as const),
        async execute() {
            throw new Error("execute fallback must not be used");
        },
        async *stream(): AsyncIterable<ToolStreamEvent> {
            yield { kind: "output", channel: "stdout", text: "stream\n" };
            yield {
                kind: "completed",
                observation: {
                    kind: "success",
                    output: { stdout: "stream\n", stderr: "" },
                    summary: "streamed",
                },
            };
        },
    };
}

test("Runner 映射 Step/Tool 生命周期并在提交边界发布 step_committed", async () => {
    const store = new InMemoryGoalStore();
    const goal = createStreamGoal();
    await store.save(goal);
    const publisher = new InMemoryExecutionStreamPublisher();
    const events: string[] = [];
    const subscription = publisher.subscribe(
        { goalId: goal.id, runId: goal.state.run.id },
        { minimumVisibility: "diagnostic", includeReasoning: true },
    );
    subscription.onEvent((event) => events.push(event.kind));

    const runner = new Runner({
        store,
        executor: new StreamDecisionExecutor(),
        toolRegistry: { get: () => createToolRegistration(createStreamingTool()) },
        trajectoryStore: trajectoryStoreFor(store),
        executionStream: publisher,
    });
    const result = await runner.runUntilBlocked({ goalId: goal.id, runId: goal.state.run.id });

    assert.equal(result.ok, true);
    assert.ok(events.includes("run_started"));
    assert.ok(events.includes("step_started"));
    assert.ok(events.includes("tool_started"));
    assert.ok(events.includes("tool_output_delta"));
    assert.ok(events.includes("tool_finished"));
    assert.ok(events.includes("observation_recorded"));
    assert.ok(events.includes("step_committed"));
    assert.ok(events.includes("run_completed"));
});

test("Runner 发布执行流失败时不改变执行结果", async () => {
    const store = new InMemoryGoalStore();
    const goal = createStreamGoal();
    await store.save(goal);
    const failingPublisher: ExecutionStreamPublisher = {
        publish() {
            throw new Error("stream unavailable");
        },
        subscribe() {
            throw new Error("not used");
        },
        close() {},
        dispose() {},
    };
    const runner = new Runner({
        store,
        executor: new StreamDecisionExecutor(),
        toolRegistry: { get: () => createToolRegistration(createStreamingTool()) },
        trajectoryStore: trajectoryStoreFor(store),
        executionStream: failingPublisher,
    });

    const result = await runner.runUntilBlocked({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.state.status, "completed");
});
