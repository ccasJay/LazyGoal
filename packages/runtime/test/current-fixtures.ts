import type {
    ContextRetrievalProtocol,
    ModelContextProtocol,
} from "../src/domain";
import type { MemoryProtocol } from "../../working-memory/src/index";
import type {
    AgentDecision,
    AssistantMessage,
    AssistantMessagePurpose,
    GoalMessage,
    GoalMessageSource,
    StepExecutionInput,
    StepExecutor,
    UserMessage,
} from "../src/index";
import type { Goal } from "../src/index";
import { createAssistantMessage, createUserMessage } from "../src/goal-message";
import {
    allocateImmutableEvent,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
    type TrajectoryReadQuery,
    type TrajectoryStore,
} from "../src/trajectory";

/** Tests use the same protocol tuple that production Goal creation accepts. */
export const currentProtocols: {
    readonly memoryProtocol: MemoryProtocol;
    readonly modelContextProtocol: ModelContextProtocol;
    readonly contextRetrievalProtocol: ContextRetrievalProtocol;
} = {
    memoryProtocol: { kind: "structured", version: 1 },
    modelContextProtocol: { kind: "trajectory-layered", version: 1 },
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
};

/** Marks the business tools directly scripted by a legacy Runtime fixture as discovered and active in an executing stage. */
export function withDiscoveredProfileTools(goal: Goal): Goal {
    return {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                exposedToolIds: [...goal.definition.profile.toolIds],
                currentStage: goal.state.run.currentStage ?? {
                    stageId: "stage-1",
                    revision: 1,
                    status: "executing",
                    target: goal.definition.intent || "测试阶段",
                    acceptanceCriteria: ["测试条件"],
                },
            },
        },
    };
}

/** Base StepExecutor for tests that adapt single execute() to decide()/think(). */
export abstract class BaseTestStepExecutor implements StepExecutor {
    async reviewCompletion() { return { kind: "accept" as const }; }
    abstract execute(input: StepExecutionInput): Promise<AgentDecision>;

    async decide(input: StepExecutionInput): Promise<{ kind: "decision"; decision: AgentDecision }> {
        const decision = await this.execute(input);
        return { kind: "decision", decision };
    }

    async think(): Promise<never> {
        throw new Error("think not supported in test");
    }
}

/** Minimal in-memory Trajectory port for Runtime tests without domain events. */
export class InMemoryTrajectoryStore implements TrajectoryStore {
    readonly events: TrajectoryEvent[] = [];

    async append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        const event = allocateImmutableEvent(
            draft,
            this.events.length === 0 ? 1 : this.events[this.events.length - 1]!.sequence + 1,
        );
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

    async readWithBoundary(
        query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ): Promise<{
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

/**
 * 投影消息数组的稳定轮廓，供断言比较角色、正文与用途。
 *
 * @remarks
 * 轮廓刻意省略 `messageId` 与 `source` 身份，避免断言绑定随机身份；需要验证
 * 身份与来源时直接断言完整消息对象。
 *
 * @param messages - 已提交消息数组。
 * @returns 只含角色、正文与助手用途的稳定轮廓。
 * @example
 * ```ts
 * assert.deepEqual(messageOutline(goal.state.messages), [
 *   { role: "assistant", content: "完成", purpose: "answer" },
 * ]);
 * ```
 */
export function messageOutline(
    messages: readonly GoalMessage[],
): readonly {
    readonly role: "user" | "assistant";
    readonly content: string;
    readonly purpose?: AssistantMessagePurpose | undefined;
}[] {
    return messages.map((message) => message.role === "user"
        ? { role: "user", content: message.content }
        : { role: "assistant", content: message.content, purpose: message.purpose });
}

const trajectoryStoresByGoalStore = new WeakMap<object, InMemoryTrajectoryStore>();

let fixtureMessageCounter = 0;

/**
 * 计算夹具消息在目标 Goal 内的 Run 归属与 Run 内位置。
 *
 * @remarks
 * 目标 Goal 的当前 Run 边界是消息的事实锚点；同一锚点内已有多少条消息，
 * 新消息就使用多大的 `order`。这让夹具消息放进 Goal 后天然满足 Snapshot
 * 的 Run 归属与位置不变量。
 *
 * @param goal - 目标 Goal 快照。
 * @param runId - 消息归属的 Run；省略时使用当前 Run。
 * @returns 该 Run 内的合法位置。
 */
export function fixtureMessagePosition(
    goal: Goal,
    runId: string = goal.state.run.id,
): { readonly afterSequence: number; readonly order: number } {
    const afterSequence = runId === goal.state.run.id
        ? goal.state.run.committedThroughSequence ?? 0
        : goal.state.completedRuns?.find((history) => history.runId === runId)?.committedThroughSequence ?? 0;
    const order = goal.state.messages.filter((message) =>
        message.runId === runId && message.position.afterSequence === afterSequence).length;
    return { afterSequence, order };
}

/**
 * 把一组夹具消息绑定到指定 Run，并按次序分配同锚点位置。
 *
 * @remarks
 * 用于直接替换 Goal 消息集的夹具：替换进来的消息必须自带合法的 Run 归属与
 * 位置，否则 Snapshot 不变量会拒绝该 Goal。
 *
 * @param messages - 待绑定的消息集。
 * @param runId - 消息集归属的 Run。
 * @param afterSequence - 消息集的事实锚点；省略时使用 `0`。
 * @param startOrder - 同一锚点内的起始序号；省略时使用 `0`。
 * @returns 归属该 Run、位置连续的只读消息集。
 * @example
 * ```ts
 * const messages = bindMessagesToRun([testUserMessage("继续")], "run-1");
 * ```
 */
export function bindMessagesToRun(
    messages: readonly GoalMessage[],
    runId: string,
    afterSequence = 0,
    startOrder = 0,
): readonly GoalMessage[] {
    return messages.map((message, index) => ({
        ...message,
        runId,
        position: { afterSequence, order: startOrder + index },
    }));
}

/**
 * 把一组夹具消息追加到目标 Goal 的 Run，并分配连续的 Run 内位置。
 *
 * @remarks
 * 追加位置接续目标 Goal 在同一事实锚点下已有消息的数量，因此追加后的消息集
 * 仍满足 Snapshot 的 Run 归属与位置不变量。
 *
 * @param goal - 目标 Goal 快照。
 * @param messages - 待追加的消息集。
 * @param runId - 消息归属的 Run；省略时使用当前 Run。
 * @returns 归属该 Run、位置连续的只读消息集。
 * @example
 * ```ts
 * const messages = bindMessagesToGoal(goal, [testUserMessage("继续")]);
 * ```
 */
export function bindMessagesToGoal(
    goal: Goal,
    messages: readonly GoalMessage[],
    runId: string = goal.state.run.id,
): readonly GoalMessage[] {
    const { afterSequence, order } = fixtureMessagePosition(goal, runId);
    return bindMessagesToRun(messages, runId, afterSequence, order);
}

/**
 * 构造带稳定身份与来源的测试用户消息。
 *
 * @remarks
 * 省略 `messageId` 与来源时按调用顺序生成唯一值，满足同一 Goal 内身份与来源
 * 唯一的不变量；需要固定身份时显式传入。提供 `goal` 时，消息归属该 Goal 的
 * 当前 Run 并获得合法的 Run 内位置；否则使用占位 Run 与占位位置，放入 Goal
 * 前必须自行指定 `runId` 与 `position`。
 *
 * @param content - 消息正文。
 * @param options - 可选的 Run 归属、来源、固定身份与目标 Goal。
 * @returns 满足当前消息契约的只读用户消息。
 * @example
 * ```ts
 * const message = testUserMessage("继续", { runId: "run-1" });
 * ```
 */
export function testUserMessage(
    content: string,
    options: {
        readonly runId?: string | undefined;
        readonly source?: GoalMessageSource | undefined;
        readonly messageId?: string | undefined;
        readonly position?: { readonly afterSequence: number; readonly order: number } | undefined;
        readonly goal?: Goal | undefined;
    } = {},
): UserMessage {
    fixtureMessageCounter += 1;
    const runId = options.runId ?? options.goal?.state.run.id ?? "run-fixture";
    return createUserMessage({
        content,
        runId,
        source: options.source ?? { kind: "user_input", inputId: `input-fixture-${fixtureMessageCounter}` },
        position: options.position
            ?? (options.goal === undefined ? { afterSequence: 0, order: 0 } : fixtureMessagePosition(options.goal, runId)),
        ...(options.messageId === undefined ? {} : { messageId: options.messageId }),
    });
}

/**
 * 构造带稳定身份、用途与来源的测试助手消息。
 *
 * @remarks
 * 省略 `messageId` 与来源时按调用顺序生成唯一值；需要固定身份时显式传入。
 * 提供 `goal` 时，消息归属该 Goal 的当前 Run 并获得合法的 Run 内位置；否则
 * 使用占位 Run 与占位位置，放入 Goal 前必须自行指定 `runId` 与 `position`。
 *
 * @param content - 消息正文。
 * @param options - 可选的 Run 归属、用途、来源、Profile、固定身份与目标 Goal。
 * @returns 满足当前消息契约的只读助手消息。
 * @example
 * ```ts
 * const message = testAssistantMessage("先检查配置", { purpose: "process" });
 * ```
 */
export function testAssistantMessage(
    content: string,
    options: {
        readonly runId?: string | undefined;
        readonly purpose?: AssistantMessagePurpose | undefined;
        readonly source?: GoalMessageSource | undefined;
        readonly profileId?: string | undefined;
        readonly messageId?: string | undefined;
        readonly position?: { readonly afterSequence: number; readonly order: number } | undefined;
        readonly goal?: Goal | undefined;
    } = {},
): AssistantMessage {
    fixtureMessageCounter += 1;
    const runId = options.runId ?? options.goal?.state.run.id ?? "run-fixture";
    return createAssistantMessage({
        content,
        runId,
        purpose: options.purpose ?? "process",
        source: options.source ?? { kind: "stage_output", executionUnitId: `unit-fixture-${fixtureMessageCounter}`, blockIndex: 0 },
        profileId: options.profileId ?? "profile-fixture",
        position: options.position
            ?? (options.goal === undefined ? { afterSequence: 0, order: 0 } : fixtureMessagePosition(options.goal, runId)),
        ...(options.messageId === undefined ? {} : { messageId: options.messageId }),
    });
}
/** Reuses one in-memory Trajectory for all Runner instances sharing a GoalStore. */
export function trajectoryStoreFor(goalStore: object): InMemoryTrajectoryStore {
    const existing = trajectoryStoresByGoalStore.get(goalStore);

    if (existing !== undefined) {
        return existing;
    }

    const created = new InMemoryTrajectoryStore();
    trajectoryStoresByGoalStore.set(goalStore, created);
    return created;
}
