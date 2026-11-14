import { isRunEnded } from "./domain";
import type { Goal } from "./domain";
import type { GoalStore } from "./goal-store";
import { withGoalMutationGate } from "./goal-mutation-gate";
import type { TrajectoryCheckpointCommitterPort } from "./trajectory-checkpoint-committer";
import {
    appendQueuedMessage,
    clearPendingSessionInputs,
    clearQueuedMessages,
    computeSessionInputDigest,
    findSessionInputRecord,
    MAX_PENDING_SESSION_INPUTS,
    MAX_PENDING_SESSION_INPUT_TEXT_LENGTH,
    measurePendingInputUsage,
    nextSessionInputSequence,
    removeQueuedMessage,
    SessionInputAdmissionError,
    toSessionInputReceipt,
    validateSessionInputShape,
    withoutQueuePause,
    type SessionInput,
    type SessionInputAdmissionResult,
    type SessionInputQueryResult,
    type SessionInputRecord,
    type SessionInputRejectionCode,
} from "./session-input";

/**
 * 会话输入受理依赖。
 *
 * @remarks
 * `store` 与 `committer` 必须与执行链共用同一 GoalStore 实例，受理才能与
 * Runner、Coordinator 的提交按 Goal 线性化。`onAdmitted` 只做唤醒通知，
 * 不得在回调内等待业务执行。
 *
 * @example
 * ```ts
 * const admission = new SessionInputAdmission({ store, committer });
 * ```
 */
export interface SessionInputAdmissionDependencies {
    /** 最新 Goal 快照存储。 */
    readonly store: GoalStore;
    /** 与执行链共享的 Trajectory/Snapshot 提交器。 */
    readonly committer: TrajectoryCheckpointCommitterPort;
    /** 受理成功后的通知回调；省略时只完成持久化受理。 */
    readonly onAdmitted?: ((goalId: string, input: SessionInput) => void) | undefined;
}

function rejection(
    code: SessionInputRejectionCode,
    message: string,
): SessionInputAdmissionResult {
    return { ok: false, code, message };
}

/**
 * Goal 会话输入的持久化受理与收据查询边界。
 *
 * @remarks
 * 受理在共享短 mutation Gate 内读取最新快照并提交单次 Snapshot 变更：先按
 * `inputId` 与规范化载荷摘要判定重复或身份冲突，再校验状态与文本额度，然后
 * 追加输入账本、队列与控制事实。受理成功只表示输入已保存，不表示消息已应用、
 * 工具已停止或 Run 已完成；受理本身不调用模型或工具。
 * 已结束 Run 的空队列受理新消息时同时解除暂停；已有积压消息时保留暂停与 FIFO。
 *
 * 保存失败或结果不明时抛出 {@link SessionInputAdmissionError}；调用方必须使用
 * 原 `inputId` 查询或重试，不得生成新身份。业务拒绝不写入账本。
 *
 * @example
 * ```ts
 * const admission = new SessionInputAdmission({ store, committer });
 * const result = await admission.admit("goal-1", { kind: "message", inputId: "i-1", content: "继续" });
 * ```
 */
export class SessionInputAdmission {
    private readonly store: GoalStore;
    private readonly committer: TrajectoryCheckpointCommitterPort;
    private readonly onAdmitted: ((goalId: string, input: SessionInput) => void) | undefined;

    /** @param dependencies - GoalStore、共享提交器与可选受理通知。 */
    constructor(dependencies: SessionInputAdmissionDependencies) {
        this.store = dependencies.store;
        this.committer = dependencies.committer;
        this.onAdmitted = dependencies.onAdmitted;
    }

    /**
     * 持久化受理一条会话输入。
     *
     * @param goalId - 目标 Goal。
     * @param input - 带稳定 `inputId` 的会话输入。
     * @returns 已受理收据、既有收据或稳定业务拒绝。
     * @throws SessionInputAdmissionError 保存失败或结果不明；Goal 快照缺失时
     *   返回 `GOAL_NOT_FOUND` 拒绝而不是抛出。
     * @example
     * ```ts
     * const result = await admission.admit("goal-1", input);
     * ```
     */
    async admit(goalId: string, input: SessionInput): Promise<SessionInputAdmissionResult> {
        const shape = validateSessionInputShape(input);
        if (shape !== undefined) return rejection(shape.code, shape.message);

        let admitted: SessionInputAdmissionResult;
        try {
            admitted = await withGoalMutationGate(this.store, goalId, async () => {
                const goal = await this.store.restore(goalId);
                if (goal === undefined) {
                    return rejection("GOAL_NOT_FOUND", `Goal "${goalId}" was not found`);
                }

                const digest = computeSessionInputDigest(input);
                const existing = findSessionInputRecord(goal, input.inputId);
                if (existing !== undefined) {
                    return existing.digest === digest && existing.kind === input.kind
                        ? { ok: true, existing: true, receipt: toSessionInputReceipt(goalId, existing) }
                        : rejection(
                            "INPUT_CONFLICT",
                            `Input "${input.inputId}" already exists with a different kind or payload`,
                        );
                }

                const plan = this.planAdmission(goal, input, digest);
                if (!plan.planned) return plan.result;

                const committed = await this.committer.commit(plan.goal, {
                    facts: [{
                        goalId,
                        runId: plan.goal.state.run.id,
                        phase: plan.goal.state.workflow.phase,
                        eventType: "session_input_admitted",
                        payload: {
                            type: "session_input_admitted",
                            inputId: input.inputId,
                            kind: input.kind,
                            sequence: plan.record.sequence,
                        },
                    }],
                    sessionState: "caller",
                });
                return { ok: true, existing: false, receipt: toSessionInputReceipt(goalId, plan.record) };
            });
        } catch (error) {
            if (error instanceof SessionInputAdmissionError) throw error;
            throw new SessionInputAdmissionError(
                goalId,
                input.inputId,
                error instanceof Error ? error.message : String(error),
                error,
            );
        }
        // 唤醒通知在短边界之外触发：后台执行不得继承提交边界上下文。
        if (admitted.ok) this.onAdmitted?.(goalId, input);
        return admitted;
    }

    /**
     * 按输入身份查询已持久化的收据。
     *
     * @param goalId - 目标 Goal。
     * @param inputId - 首次调用方保存的输入身份。
     * @returns 收据、未找到或 Goal 缺失的稳定结果；读取故障原样抛出。
     * @throws Goal 快照损坏或底层读取失败时传播原始异常。
     * @example
     * ```ts
     * const result = await admission.query("goal-1", "i-1");
     * ```
     */
    async query(goalId: string, inputId: string): Promise<SessionInputQueryResult> {
        const goal = await this.store.restore(goalId);
        if (goal === undefined) {
            return { ok: false, code: "GOAL_NOT_FOUND", message: `Goal "${goalId}" was not found` };
        }
        const record = findSessionInputRecord(goal, inputId);
        if (record === undefined) return { ok: true, found: false };
        return { ok: true, found: true, receipt: toSessionInputReceipt(goalId, record) };
    }

    /**
     * 读取 Goal 的安全会话状态投影所需的已受理输入账本。
     *
     * @param goalId - 目标 Goal。
     * @returns 账本副本；Goal 不存在时返回 `undefined`。
     * @throws 底层读取失败时传播原始异常。
     * @example
     * ```ts
     * const ledger = await admission.listInputs("goal-1");
     * ```
     */
    async listInputs(goalId: string): Promise<readonly SessionInputRecord[] | undefined> {
        const goal = await this.store.restore(goalId);
        return goal?.state.inputLedger;
    }

    private planAdmission(
        goal: Goal,
        input: SessionInput,
        digest: SessionInputRecord["digest"],
    ): { readonly planned: true; readonly goal: Goal; readonly record: SessionInputRecord }
        | { readonly planned: false; readonly result: SessionInputAdmissionResult } {
        const sequence = nextSessionInputSequence(goal);
        // 本次受理与提交在同一短边界内完成，提交修订固定推进一档。
        const admittedAtRevision = (goal.state.commitRevision ?? 0) + 1;
        const baseRecord: SessionInputRecord = {
            inputId: input.inputId,
            kind: input.kind,
            digest,
            sequence,
            status: "pending",
            admittedAtRevision,
        };

        switch (input.kind) {
            case "message": {
                const quota = this.checkTextQuota(goal, input.content.length);
                if (quota !== undefined) return { planned: false, result: quota };
                const queue = goal.state.messageQueue;
                const status = goal.state.run.status;
                const startsFreshRun = isRunEnded(status) && (queue?.items.length ?? 0) === 0;
                const nextGoal: Goal = {
                    ...goal,
                    state: {
                        ...goal.state,
                        inputLedger: [...(goal.state.inputLedger ?? []), baseRecord],
                        messageQueue: appendQueuedMessage(startsFreshRun ? withoutQueuePause(queue) : queue, {
                            inputId: input.inputId,
                            content: input.content,
                            sequence,
                        }),
                    },
                };
                return { planned: true, goal: nextGoal, record: baseRecord };
            }
            case "queue_control": {
                // 队列控制没有后续应用步骤：受理本身即生效，因此直接记为已应用。
                const controlRecord: SessionInputRecord = {
                    ...baseRecord,
                    status: "applied",
                    appliedRunId: goal.state.run.id,
                };
                const queue = goal.state.messageQueue ?? { revision: 0, items: [] };
                if (input.queueRevision !== queue.revision) {
                    return {
                        planned: false,
                        result: rejection(
                            "QUEUE_REVISION_MISMATCH",
                            `queueRevision ${input.queueRevision} does not match current revision ${queue.revision}`,
                        ),
                    };
                }
                if (input.action === "continue") {
                    if (queue.pause === undefined) {
                        return {
                            planned: false,
                            result: rejection("QUEUE_NOT_PAUSED", "The Goal message queue is not paused"),
                        };
                    }
                    const nextGoal: Goal = {
                        ...goal,
                        state: {
                            ...goal.state,
                            inputLedger: [...(goal.state.inputLedger ?? []), controlRecord],
                            messageQueue: withoutQueuePause(queue),
                        },
                    };
                    return { planned: true, goal: nextGoal, record: controlRecord };
                }

                if (input.action === "remove") {
                    const removal = removeQueuedMessage(queue, input.messageId!);
                    if (removal === undefined) {
                        return {
                            planned: false,
                            result: rejection("QUEUED_MESSAGE_NOT_FOUND", `Queued message "${input.messageId}" was not found`),
                        };
                    }
                    const ledger = clearPendingSessionInputs(
                        goal.state.inputLedger,
                        new Set([removal.item.inputId]),
                    ) ?? [];
                    const nextGoal: Goal = {
                        ...goal,
                        state: {
                            ...goal.state,
                            inputLedger: [...ledger, controlRecord],
                            messageQueue: removal.queue,
                        },
                    };
                    return { planned: true, goal: nextGoal, record: controlRecord };
                }

                const cleared = new Set(queue.items.map((item) => item.inputId));
                const ledger = clearPendingSessionInputs(goal.state.inputLedger, cleared) ?? [];
                const nextGoal: Goal = {
                    ...goal,
                    state: {
                        ...goal.state,
                        inputLedger: [...ledger, controlRecord],
                        messageQueue: clearQueuedMessages(queue),
                    },
                };
                return { planned: true, goal: nextGoal, record: controlRecord };
            }
            case "steer":
            case "interrupt":
            case "respond":
            case "resume":
            case "compact": {
                return {
                    planned: false,
                    result: rejection(
                        "RUN_CONTROL_UNAVAILABLE",
                        `The session execution owner does not admit "${input.kind}" inputs yet`,
                    ),
                };
            }
        }
    }

    private checkTextQuota(
        goal: Goal,
        textLength: number,
    ): SessionInputAdmissionResult | undefined {
        const usage = measurePendingInputUsage(goal);
        if (usage.items + 1 > MAX_PENDING_SESSION_INPUTS) {
            return rejection(
                "QUEUE_FULL",
                `The Goal already holds ${usage.items} pending text inputs`,
            );
        }
        if (usage.textLength + textLength > MAX_PENDING_SESSION_INPUT_TEXT_LENGTH) {
            return rejection(
                "QUEUE_TEXT_TOO_LARGE",
                `Pending text inputs already hold ${usage.textLength} UTF-16 code units`,
            );
        }
        return undefined;
    }
}
