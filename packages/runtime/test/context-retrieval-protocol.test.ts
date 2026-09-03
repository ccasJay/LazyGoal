import assert from "node:assert/strict";
import { test } from "node:test";

import {
    allocateImmutableEvent,
    classifyTrajectoryTail,
    CONTEXT_LOOKUP_CHAIN_LIMIT_CODE,
    CONTEXT_LOOKUP_PROTOCOL_ERROR_CODE,
    ContextLookupProtocolError,
    createGoal,
    GoalCoordinator,
    invokeContextLookup,
    normalizeContextLookupRequest,
    Runner,
    type AgentDecision,
    type AgentProfile,
    type ContextLookupPort,
    type ContextLookupRequest,
    type Goal,
    type PreparationExecutionInput,
    type PreparationExecutor,
    type StepExecutionInput,
    type StepExecutor,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
    type TrajectoryReadQuery,
    type TrajectoryReadResult,
    type TrajectoryStore,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";

const profile: AgentProfile = {
    id: "context-protocol-profile",
    systemPrompt: "test",
    instructions: [],
    toolIds: [],
};

class MemoryTrajectoryStore implements TrajectoryStore {
    readonly events: TrajectoryEvent[] = [];

    async append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        const event = allocateImmutableEvent(
            draft,
            this.events.length + 1,
            `event-${this.events.length + 1}`,
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

function createTestGoal(phase: "gathering_context" | "executing" = "gathering_context"): Goal {
    const created = createGoal({
        id: `goal-protocol-${phase}`,
        runId: `run-protocol-${phase}`,
        intent: "验证检索协议与来源限制",
        promptBundleVersion: 1,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        profile,
    });
    return phase === "executing"
        ? {
            ...created,
            state: {
                ...created.state,
                workflow: {
                    phase: "executing",
                    preparation: { status: "completed" },
                    task: { objective: "测试任务", completionCriteria: [] },
                },
                run: {
                    ...created.state.run,
                    status: "running",
                    committedThroughSequence: 0,
                },
            },
        }
        : {
            ...created,
            state: {
                ...created.state,
                run: {
                    ...created.state.run,
                    committedThroughSequence: 0,
                },
            },
        };
}

test("normalizeContextLookupRequest 仅接受三类历史需求", () => {
    const validNeeds = [
        "conversation_history",
        "historical_execution",
        "decision_rationale",
    ] as const;

    for (const need of validNeeds) {
        const normalized = normalizeContextLookupRequest({
            kind: "context_lookup",
            need,
            question: "历史情况如何？",
        });
        assert.equal(normalized.kind, "context_lookup");
        assert.equal(normalized.need, need);
        assert.equal(normalized.question, "历史情况如何？");
    }
});

test("权威来源需求和未知需求被严格拒绝，不得伪装成 context_lookup", () => {
    const nonHistoricalNeeds = [
        "current_workspace_state",
        "current_environment_state",
        "verification_status",
        "task_contract",
        "user_constraints",
        "unknown_need",
    ];

    for (const need of nonHistoricalNeeds) {
        assert.throws(
            () => normalizeContextLookupRequest({
                kind: "context_lookup",
                need,
                question: "当前状态是什么？",
            }),
            (error: unknown) => {
                assert.ok(error instanceof ContextLookupProtocolError);
                assert.match(error.message, /need is invalid/);
                return true;
            },
        );
    }
});

test("非法结构、额外字段或空问题在检索前直接拒绝", () => {
    // 缺少 question
    assert.throws(
        () => normalizeContextLookupRequest({
            kind: "context_lookup",
            need: "historical_execution",
        }),
        ContextLookupProtocolError,
    );

    // 空白 question
    assert.throws(
        () => normalizeContextLookupRequest({
            kind: "context_lookup",
            need: "historical_execution",
            question: "   ",
        }),
        ContextLookupProtocolError,
    );

    // 含有协议外字段（如尝试伪装 workspace 覆盖）
    assert.throws(
        () => normalizeContextLookupRequest({
            kind: "context_lookup",
            need: "historical_execution",
            question: "问题",
            extraField: "hack",
        }),
        ContextLookupProtocolError,
    );
});

test("Coordinator 与 Runner 将规范化请求直接交给 invokeContextLookup", async () => {
    const goal = createTestGoal("gathering_context");
    const store = new InMemoryGoalStore();
    await store.save(goal);
    const trajectory = new MemoryTrajectoryStore();

    let lookedUpRequest: ContextLookupRequest | undefined;
    const port: ContextLookupPort = {
        async lookup(input) {
            lookedUpRequest = input.request;
            return {
                status: "not_found",
                lookupId: input.lookupId,
                reason: "未找到历史记录",
            };
        },
    };

    let coordinatorPreparationCalls = 0;
    const preparationExecutor: PreparationExecutor = {
        async execute(input: PreparationExecutionInput) {
            coordinatorPreparationCalls += 1;
            if (coordinatorPreparationCalls === 1) {
                return {
                    kind: "context_lookup",
                    need: "historical_execution",
                    question: "之前的执行记录",
                };
            }
            if (input.goal.state.workflow.phase === "gathering_context") {
                return { kind: "context_ready" };
            }
            return {
                kind: "task_proposal",
                task: { objective: "规划目标", completionCriteria: [] },
                approvalRequest: "请批准",
            };
        },
    };

    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore: trajectory,
        preparationExecutor,
        contextLookupPort: port,
        scheduler: { async schedule() { throw new Error("not scheduled"); } },
    });

    const coordinatorResult = await coordinator.advance({
        goalId: goal.id,
        runId: goal.state.run.id,
    });

    assert.ok(coordinatorResult.ok);
    assert.ok(lookedUpRequest !== undefined);
    assert.equal(lookedUpRequest.need, "historical_execution");
    assert.equal(lookedUpRequest.question, "之前的执行记录");

    // Runner 直接调用测试
    const executingGoal = createTestGoal("executing");
    await store.save(executingGoal);
    const runnerTrajectory = new MemoryTrajectoryStore();

    let runnerLookedUpRequest: ContextLookupRequest | undefined;
    const runnerPort: ContextLookupPort = {
        async lookup(input) {
            runnerLookedUpRequest = input.request;
            return {
                status: "not_found",
                lookupId: input.lookupId,
                reason: "未找到历史记录",
            };
        },
    };

    let stepCalls = 0;
    const stepExecutor: StepExecutor = {
        async execute(input: StepExecutionInput): Promise<AgentDecision> {
            stepCalls += 1;
            if (stepCalls === 1) {
                return {
                    kind: "context_lookup",
                    need: "conversation_history",
                    question: "之前的对话",
                };
            }
            return {
                kind: "complete",
                summary: "完成",
                completionEvidence: [],
            };
        },
    };

    const runner = new Runner({
        store,
        trajectoryStore: runnerTrajectory,
        executor: stepExecutor,
        contextLookupPort: runnerPort,
    });

    const runnerResult = await runner.run({
        goalId: executingGoal.id,
        runId: executingGoal.state.run.id,
    });

    assert.ok(runnerResult.ok);
    assert.ok(runnerLookedUpRequest !== undefined);
    assert.equal(runnerLookedUpRequest.need, "conversation_history");
    assert.equal(runnerLookedUpRequest.question, "之前的对话");
});
