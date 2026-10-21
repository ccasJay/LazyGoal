import {
    allocateImmutableEvent,
    createGoal,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    SessionManager,
    TrajectoryCheckpointCommitter,
    type AgentProfile,
    type Goal,
    type SessionInput,
    type StepExecutionInput,
    type StepExecutor,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
    type TrajectoryReadQuery,
    type TrajectoryStore,
} from "../../runtime/src/index";
import {
    InMemoryExecutionStreamPublisher,
} from "../../execution-stream/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";

/** 浏览器测试使用的最小内存 Trajectory 端口。 */
class InMemoryTrajectoryStore implements TrajectoryStore {
    private readonly events: TrajectoryEvent[] = [];

    async append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        const event = allocateImmutableEvent(draft, this.events.length === 0 ? 1 : this.events[this.events.length - 1]!.sequence + 1);
        this.events.push(event);
        return event;
    }

    async read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        return this.events.filter((event) =>
            event.goalId === query.goalId
            && event.runId === query.runId
            && (query.fromSequence === undefined || event.sequence >= query.fromSequence)
            && (query.toSequence === undefined || event.sequence <= query.toSequence));
    }

    async readWithBoundary(query: TrajectoryReadQuery, committedThroughSequence: number): Promise<{
        readonly committed: readonly TrajectoryEvent[];
        readonly uncommittedTail: readonly TrajectoryEvent[];
    }> {
        const events = await this.read(query);
        return {
            committed: events.filter((event) => event.sequence <= committedThroughSequence),
            uncommittedTail: events.filter((event) => event.sequence > committedThroughSequence),
        };
    }
}

export const sessionProtocols = {
    memoryProtocol: { kind: "structured", version: 1 } as const,
    modelContextProtocol: { kind: "trajectory-layered", version: 1 } as const,
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 } as const,
};

export const sessionProfile: AgentProfile = {
    id: "default",
    systemPrompt: "test",
    instructions: [],
    toolIds: [],
};

/** 完成当前 Step 的最小决定。 */
export function completeDecision(input: StepExecutionInput) {
    return {
        kind: "decision",
        decision: { kind: "complete", summary: "done", evidenceSequences: [] },
        modelContextFrame: {
            stage: "decide",
            epochNumber: input.goal.state.run.contextEpoch.number,
            conversationPosition: input.goal.state.messages.length,
            sections: [],
        },
    };
}

export interface SessionHarnessOptions {
    /** Run 身份前缀。 */
    readonly prefix?: string;
    /** 每次 decide 之前执行的阻塞或观察钩子。 */
    readonly onDecide?: () => Promise<void>;
}

/**
 * 真实 Runtime 会话所有者测试装置。
 *
 * @remarks
 * 使用内存 Goal/Trajectory 存储、内联调度器与确定性 StepExecutor；模型调用表现为
 * decide 计数，便于断言「受理不等于执行」以及重启后零调用。
 */
export function createSessionHarness(options: SessionHarnessOptions = {}) {
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    const committer = new TrajectoryCheckpointCommitter({ store, trajectoryStore: trajectory });
    const executionStream = new InMemoryExecutionStreamPublisher();
    let decideCalls = 0;
    let runCounter = 0;
    const nextRunId = (): string => `${options.prefix ?? "run"}-${runCounter += 1}`;
    const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" }; },
        async decide(input: StepExecutionInput) {
            decideCalls += 1;
            if (options.onDecide !== undefined) await options.onDecide();
            return completeDecision(input) as never;
        },
        async think() { throw new Error("unexpected Think call"); },
    };
    const runner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor,
        checkpointCommitter: committer,
    });
    const coordinator = new GoalCoordinator({
        store,
        scheduler: new InlineScheduler(runner),
        checkpointCommitter: committer,
        runIdGenerator: nextRunId,
    });
    const sessions = new SessionManager({
        store,
        committer,
        coordinator,
        profiles: { get: (profileId) => (profileId === sessionProfile.id ? sessionProfile : undefined) },
        runIdGenerator: nextRunId,
        executionStream,
    });
    return {
        sessions,
        store,
        trajectory,
        executionStream,
        decideCalls: (): number => decideCalls,
        runIds: (): readonly string[] => Array.from({ length: runCounter }, (_value, index) => `${options.prefix ?? "run"}-${index + 1}`),
    };
}

/** 构造一个未开始的 Goal 快照，用于只读与状态投影用例。 */
export function goalFor(goalId: string, options: {
    readonly runId?: string;
    readonly status?: "created" | "running" | "waiting" | "completed" | "failed" | "cancelled";
    readonly commitRevision?: number;
} = {}): Goal {
    const created = createGoal({
        ...sessionProtocols,
        promptBundleVersion: 1,
        id: goalId,
        intent: "session harness goal",
        profile: sessionProfile,
        runId: options.runId ?? "run-1",
    });
    if (options.status === undefined && options.commitRevision === undefined) return created;
    return {
        ...created,
        state: {
            ...created.state,
            ...(options.commitRevision === undefined ? {} : { commitRevision: options.commitRevision }),
            run: { ...created.state.run, ...(options.status === undefined ? {} : { status: options.status }) },
        },
    };
}

/** 便捷构造一条普通消息输入。 */
export function message(inputId: string, content: string): SessionInput {
    return { kind: "message", inputId, content };
}
