import assert from "node:assert/strict";
import { test } from "node:test";

import {
    allocateImmutableEvent,
    classifyTrajectoryTail,
    CONTEXT_LOOKUP_CHAIN_LIMIT_CODE,
    CONTEXT_LOOKUP_PROTOCOL_ERROR_CODE,
    ContextLookupProtocolError,
    createGoal,
    invokeContextLookup,
    normalizeContextLookupRequest,
    Runner,
    type AgentDecision,
    type AgentProfile,
    type ContextLookupPort,
    type ContextLookupRequest,
    type Goal,
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

function createTestGoal(): Goal {
    const created = createGoal({
        id: "goal-protocol",
        runId: "run-protocol",
        intent: "验证检索协议与来源限制",
        promptBundleVersion: 1,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        profile,
    });
    return {
            ...created,
            state: {
                ...created.state,
                workflow: {
                    phase: "executing",
                },
                run: {
                    ...created.state.run,
                    status: "running",
                    committedThroughSequence: 0,

                    mode: "plan", approvedTask: { objective: "测试任务", completionCriteria: [] },
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

test("Runner 将规范化请求直接交给 invokeContextLookup", async () => {
    const store = new InMemoryGoalStore();
    const executingGoal = createTestGoal();
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

test("invokeContextLookup 在 sequenceRange.to 超过 committedThroughSequence 时将其 clamp 到当前已提交边界并成功检索", async () => {
    const goal: Goal = {
        ...createTestGoal(),
        state: {
            ...createTestGoal().state,
            run: {
                ...createTestGoal().state.run,
                committedThroughSequence: 22,
            },
        },
    };

    let capturedRequest: ContextLookupRequest | undefined;
    const port: ContextLookupPort = {
        async lookup(input) {
            capturedRequest = input.request;
            return {
                status: "not_found",
                lookupId: input.lookupId,
                reason: "未匹配",
            };
        },
    };

    const invocation = await invokeContextLookup({
        goal,
        phase: "executing",
        request: {
            kind: "context_lookup",
            need: "historical_execution",
            question: "查找历史",
            filters: {
                sequenceRange: { from: 1, to: 100 },
            },
        },
        port,
    });

    assert.equal(invocation.result.status, "not_found");
    assert.ok(capturedRequest !== undefined);
    assert.deepEqual(capturedRequest.filters?.sequenceRange, { from: 1, to: 22 });
    assert.deepEqual(invocation.request.filters?.sequenceRange, { from: 1, to: 22 });
});

test("invokeContextLookup 在 sequenceRange.from 超过 committedThroughSequence 时安全返回 not_found 而不抛出协议错误", async () => {
    const goal: Goal = {
        ...createTestGoal(),
        state: {
            ...createTestGoal().state,
            run: {
                ...createTestGoal().state.run,
                committedThroughSequence: 10,
            },
        },
    };

    let portCalled = false;
    const port: ContextLookupPort = {
        async lookup(input) {
            portCalled = true;
            return {
                status: "not_found",
                lookupId: input.lookupId,
                reason: "未匹配",
            };
        },
    };

    const invocation = await invokeContextLookup({
        goal,
        phase: "executing",
        request: {
            kind: "context_lookup",
            need: "historical_execution",
            question: "查找历史",
            filters: {
                sequenceRange: { from: 50, to: 100 },
            },
        },
        port,
    });

    assert.equal(portCalled, false, "当范围完全超过当前已提交边界时，不应调用底层端口");
    assert.equal(invocation.result.status, "not_found");
    assert.equal(invocation.facts.length, 2);
    assert.equal(invocation.facts[0]?.eventType, "context_lookup_requested");
    assert.equal(invocation.facts[1]?.eventType, "context_lookup_not_found");
});
