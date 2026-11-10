import { DatabaseSync } from "node:sqlite";
import { closeSync, openSync } from "node:fs";
import { canonicalJson } from "../../contracts/src/index";
import { readTrigger } from "./trigger-wire";
import type { Goal } from "../../runtime/src/domain";
import type { Trigger } from "../../runtime/src/trigger";
import { goalSnapshotCodec } from "./goal-snapshot-codec";
import { SupervisorOwnership } from "./supervisor-ownership";
import { decodeTriggerActionPermissionReply, decodeTriggerActionPermissionRequest } from "./trigger-permission-codec";


/**
 * 已接受 Goal 在持久派发队列中的当前记录。
 *
 * @example
 * ```ts
 * const item: TriggerGoalQueueRecord = { sequence: 1, goalId: "goal-1", triggerId: "trigger-1", status: "queued" };
 * ```
 */
export interface TriggerGoalQueueRecord {
    readonly sequence: number;
    readonly goalId: string;
    readonly triggerId: string;
    readonly status: "queued" | "claimed" | "waiting" | "terminal";
    readonly workerId?: string;
    readonly generation?: string;
}

/**
 * 已观察到 Worker 退出、等待明确恢复决定的 Goal 绑定。
 *
 * @remarks
 * 此记录不会清除原 Worker 身份或自动重放 Goal；只有经过认证的恢复 Trigger 才能
 * 将其重新放回队列。`resumed` 表示显式恢复已经提交。
 *
 * @example
 * ```ts
 * const recovery: TriggerWorkerRecoveryRecord = {
 *   goalId: "goal-1", workerId: "worker-1", generation: "generation-1",
 *   lifecycleTriggerId: "trigger-exit-1", status: "pending",
 * };
 * ```
 */
export interface TriggerWorkerRecoveryRecord {
    readonly goalId: string;
    readonly workerId: string;
    readonly generation: string;
    readonly lifecycleTriggerId: string;
    readonly status: "pending" | "resumed";
}

/**
 * Action 权限请求在人工介入前保留的失败关闭原因。
 *
 * @remarks
 * 分类只说明等待为何未自动结算，不携带模型正文或 Action 输入；请求仍保持待处理。
 *
 * @example
 * ```ts
 * const reason: TriggerActionPermissionFailureReason = "model-failed";
 * ```
 */
export type TriggerActionPermissionFailureReason =
    | "missing-goal-ceiling"
    | "goal-scope-exceeded"
    | "model-failed"
    | "invalid-model-result"
    | "worker-unavailable"
    | "reply-rejected";

/** work Trigger 路由期间可重试的准入故障分类。 */
export type TriggerAdmissionFailureReason = "model-failed" | "invalid-model-result" | "invalid-work";

/**
 * 使用 SQLite 事务保存不可变 Trigger、路由标记和 Goal 派发状态。
 *
 * @remarks
 * Trigger ID 是唯一事件身份；任何重复 ID 都冲突，即使内容完全相同。路由标记与
 * Trigger JSON 分开保存。此存储不验证发送者身份和目标授权，调用方必须先验证。
 * 多进程可并发打开同一数据库；数据库父目录由宿主创建并保护，完成后必须关闭实例。
 *
 * @example
 * ```ts
 * const store = new TriggerStore("/private/trigger.db");
 * store.receive(trigger);
 * store.close();
 * ```
 */
export class TriggerStore {
    private readonly database: DatabaseSync;

    /** @param path - 数据库路径，其父目录必须已存在。 */
    constructor(path: string) {
        if (path !== ":memory:") closeSync(openSync(path, "a", 0o600));
        this.database = new DatabaseSync(path);
        this.database.exec(`
            PRAGMA busy_timeout = 5000;
            PRAGMA synchronous = FULL;
            CREATE TABLE IF NOT EXISTS trigger_events (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                routed INTEGER NOT NULL DEFAULT 0 CHECK (routed IN (0, 1))
            ) STRICT;
            CREATE TABLE IF NOT EXISTS trigger_goal_reservations (
                trigger_id TEXT PRIMARY KEY REFERENCES trigger_events(id),
                goal_id TEXT NOT NULL UNIQUE,
                snapshot TEXT
            ) STRICT;
            CREATE TABLE IF NOT EXISTS trigger_goal_queue (
                sequence INTEGER PRIMARY KEY,
                trigger_id TEXT NOT NULL UNIQUE REFERENCES trigger_events(id),
                goal_id TEXT NOT NULL UNIQUE,
                worker_id TEXT,
                generation TEXT,
                status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'claimed', 'waiting', 'terminal')),
                CHECK ((worker_id IS NULL AND generation IS NULL) OR (worker_id IS NOT NULL AND generation IS NOT NULL))
            ) STRICT;
            CREATE INDEX IF NOT EXISTS trigger_events_goal ON trigger_events(json_extract(content, '$.goalId'));
            CREATE TABLE IF NOT EXISTS trigger_worker_recoveries (
                goal_id TEXT PRIMARY KEY REFERENCES trigger_goal_queue(goal_id),
                worker_id TEXT NOT NULL,
                generation TEXT NOT NULL,
                lifecycle_trigger_id TEXT NOT NULL REFERENCES trigger_events(id),
                status TEXT NOT NULL CHECK (status IN ('pending', 'resumed'))
            ) STRICT;
            CREATE UNIQUE INDEX IF NOT EXISTS trigger_goal_queue_worker ON trigger_goal_queue(worker_id) WHERE worker_id IS NOT NULL AND status IN ('claimed', 'waiting');
            CREATE TABLE IF NOT EXISTS trigger_permission_failures (
                trigger_id TEXT PRIMARY KEY REFERENCES trigger_events(id),
                reason TEXT NOT NULL CHECK (reason IN ('missing-goal-ceiling', 'goal-scope-exceeded', 'model-failed', 'invalid-model-result', 'worker-unavailable', 'reply-rejected'))
            ) STRICT;
            CREATE TABLE IF NOT EXISTS trigger_admission_failures (
                trigger_id TEXT PRIMARY KEY REFERENCES trigger_events(id),
                reason TEXT NOT NULL CHECK (reason IN ('model-failed', 'invalid-model-result', 'invalid-work'))
            ) STRICT;
            PRAGMA foreign_keys = ON;
        `);
    }

    /**
     * 持久化新的不可变 Trigger。
     *
     * @param input - 已认证来源及目标授权的 Trigger；结构仍在此边界校验。
     * @returns 新写入的 Trigger。
     * @throws Trigger 结构或身份无效、ID 已存在或 SQLite 写入失败时抛出；事务不会部分提交。
     */
    receive(input: unknown): Trigger {
        const trigger = normalizeTrigger(input);
        const content = canonicalJson(trigger);
        this.database.exec("BEGIN IMMEDIATE");
        try {
            const existing = this.database.prepare("SELECT 1 AS present FROM trigger_events WHERE id = ?").get(trigger.id);
            if (existing !== undefined) throw new Error("Trigger identity conflict");
            this.database.prepare("INSERT INTO trigger_events (id, content, routed) VALUES (?, ?, 0)").run(trigger.id, content);
            this.database.exec("COMMIT");
            return trigger;
        } catch (error) {
            this.database.exec("ROLLBACK");
            throw error;
        }
    }

    /** @returns 按 Trigger ID 读取已校验事件；不存在时返回 `undefined`，损坏时抛出。 */
    read(triggerId: string): Trigger | undefined {
        const row = this.database.prepare("SELECT id, content FROM trigger_events WHERE id = ?").get(triggerId) as { id: string; content: string } | undefined;
        if (row === undefined) return undefined;
        const trigger = readTrigger(JSON.parse(row.content) as unknown);
        if (trigger === undefined || trigger.id !== row.id || canonicalJson(trigger) !== row.content) {
            throw new Error("Invalid stored Trigger");
        }
        return normalizeTrigger(trigger);
    }

    /**
     * 读取 Trigger 是否已持久交接给其所属处理器。
     *
     * @param triggerId - 已接收事件的稳定身份。
     * @returns 未路由、已路由或不存在；路由标记不表示 Goal 已完成。
     * @throws 路由元数据损坏或数据库读取失败时抛出。
     */
    routeStatus(triggerId: string): "unrouted" | "routed" | undefined {
        const row = this.database.prepare("SELECT routed FROM trigger_events WHERE id = ?").get(triggerId) as { routed: number } | undefined;
        if (row === undefined) return undefined;
        if (row.routed !== 0 && row.routed !== 1) throw new Error("Invalid stored Trigger route state");
        return row.routed === 1 ? "routed" : "unrouted";
    }

    /**
     * 列出尚未路由的 Trigger，按首次持久化顺序返回。
     *
     * @returns 每个 Trigger 均通过当前生成绑定验证的不可变事件。
     * @throws 持久事件损坏或 SQLite 读取失败时抛出。
     */
    unroutedTriggers(): readonly Trigger[] {
        const rows = this.database.prepare("SELECT id FROM trigger_events WHERE routed = 0 ORDER BY rowid").all() as { id: string }[];
        return rows.map(({ id }) => {
            const trigger = this.read(id);
            if (trigger === undefined) throw new Error("Unrouted Trigger disappeared");
            return trigger;
        });
    }

    /**
     * 在所属处理器完成持久交接后记录路由完成；重复确认不改变事件内容。
     *
     * @param triggerId - 已持久化 Trigger 的身份。
     * @throws Trigger 不存在、路由元数据损坏或 SQLite 写入失败时抛出。
     */
    markRouted(triggerId: string): void {
        this.database.exec("BEGIN IMMEDIATE");
        try {
            const state = this.routeStatus(triggerId);
            if (state === undefined) throw new Error("Trigger does not exist");
            this.database.prepare("UPDATE trigger_events SET routed = 1 WHERE id = ?").run(triggerId);
            this.database.prepare("DELETE FROM trigger_admission_failures WHERE trigger_id = ?").run(triggerId);
            this.database.exec("COMMIT");
        } catch (error) {
            this.database.exec("ROLLBACK");
            throw error;
        }
    }

    /**
     * 读取 Trigger 首次写入时由 SQLite 分配的稳定顺序号。
     *
     * @param triggerId - 事件的稳定身份。
     * @returns 数据库插入顺序；Trigger 不存在时返回 `undefined`。
     * @throws SQLite 读取失败时抛出。
     * @example
     * ```ts
     * const sequence = store.sequence("trigger-1");
     * ```
     */
    sequence(triggerId: string): number | undefined {
        const row = this.database.prepare("SELECT rowid AS sequence FROM trigger_events WHERE id = ?")
            .get(triggerId) as { sequence: number } | undefined;
        if (row === undefined) return undefined;
        if (!Number.isSafeInteger(row.sequence) || row.sequence < 1) throw new Error("Invalid Trigger sequence");
        return row.sequence;
    }

    /**
     * 按接收顺序读取关联指定 Goal 的不可变 Trigger。
     *
     * @param goalId - Trigger 顶层关联的 Goal 身份。
     * @returns 该 Goal 的已校验事件；没有事件时返回空数组。
     * @throws 持久记录损坏或数据库读取失败时抛出。
     * @example
     * ```ts
     * const reports = store.listGoalTriggers("goal-1");
     * ```
     */
    listGoalTriggers(goalId: string): readonly Trigger[] {
        if (!goalId.trim()) throw new Error("Goal identity is required");
        const rows = this.database.prepare("SELECT id FROM trigger_events WHERE json_extract(content, '$.goalId') = ? ORDER BY rowid").all(goalId) as { id: string }[];
        return rows.map(({ id }) => {
            const trigger = this.read(id);
            if (trigger === undefined) throw new Error("Goal Trigger disappeared");
            return trigger;
        });
    }


    /**
     * 保存 Action 权限请求等待人工处理时的失败关闭原因。
     *
     * @param triggerId - 持久化的 `permission.requested` Trigger ID。
     * @param reason - 不含原始 Action 参数的稳定故障分类。
     * @throws Trigger 不是有效的 Worker Action 权限请求或存储失败时抛出。
     */
    recordActionPermissionFailure(triggerId: string, reason: TriggerActionPermissionFailureReason): void {
        const trigger = this.read(triggerId);
        if (trigger === undefined || trigger.type !== "permission" || trigger.payload.action !== "requested"
            || trigger.target !== "supervisor" || trigger.source.role !== "worker" || !("goalId" in trigger)
            || !trigger.source.workerId.trim() || !trigger.source.generation.trim()) {
            throw new Error("Action permission failure requires a stored permission request Trigger");
        }
        const request = decodeTriggerActionPermissionRequest(trigger);
        if (request.requestId !== trigger.id) throw new Error("Action permission failure request identity is invalid");
        this.database.prepare(`INSERT INTO trigger_permission_failures (trigger_id, reason) VALUES (?, ?)
            ON CONFLICT(trigger_id) DO UPDATE SET reason = excluded.reason`).run(triggerId, reason);
    }

    /** @returns 指定权限请求 Trigger 的失败关闭原因；尚未失败或不存在时返回 undefined。 */
    actionPermissionFailure(triggerId: string): TriggerActionPermissionFailureReason | undefined {
        const row = this.database.prepare("SELECT reason FROM trigger_permission_failures WHERE trigger_id = ?").get(triggerId) as { reason: TriggerActionPermissionFailureReason } | undefined;
        return row?.reason;
    }

    /**
     * 保存 work Trigger 尚未路由的准入故障，供 Supervisor 恢复处理时诊断。
     *
     * @param triggerId - 已持久化的 work Trigger ID。
     * @param reason - 不含原始材料的准入故障分类。
     * @throws Trigger 不存在、已路由、不是 work Trigger 或 SQLite 写入失败时抛出。
     * @example
     * ```ts
     * store.recordAdmissionFailure("work-1", "model-failed");
     * ```
     */
    recordAdmissionFailure(triggerId: string, reason: TriggerAdmissionFailureReason): void {
        const trigger = this.read(triggerId);
        if (trigger === undefined || !isWorkTrigger(trigger) || this.routeStatus(triggerId) !== "unrouted") {
            throw new Error("Admission failure requires an unrouted work Trigger");
        }
        this.database.prepare(`INSERT INTO trigger_admission_failures (trigger_id, reason) VALUES (?, ?)
            ON CONFLICT(trigger_id) DO UPDATE SET reason = excluded.reason`).run(triggerId, reason);
    }

    /** @returns 指定 work Trigger 的准入故障；未记录或 Trigger 不存在时返回 undefined。 */
    admissionFailure(triggerId: string): TriggerAdmissionFailureReason | undefined {
        const row = this.database.prepare("SELECT reason FROM trigger_admission_failures WHERE trigger_id = ?").get(triggerId) as { reason: TriggerAdmissionFailureReason } | undefined;
        return row?.reason;
    }

    /**
     * 原子确认权限请求与已应用回复的持久路由状态。
     *
     * @remarks 仅在 Worker 已应用回复并持久化 Goal 进度后调用；请求和回复必须绑定同一 Goal 与 Worker 代次。
     * @param requestTriggerId - Worker 发出的权限请求 Trigger ID。
     * @param replyTriggerId - 已应用的 permission 或 interaction 回复 Trigger ID。
     * @throws 请求、回复、Action、Goal 或 Worker 身份不匹配时回滚并抛出。
     * @example
     * ```ts
     * store.markActionPermissionReplyRouted("permission-request-1", "interaction-reply-1");
     * ```
     */
    markActionPermissionReplyRouted(requestTriggerId: string, replyTriggerId: string): void {
        this.database.exec("BEGIN IMMEDIATE");
        try {
            const request = this.read(requestTriggerId);
            const reply = this.read(replyTriggerId);
            if (request === undefined || request.type !== "permission" || request.payload.action !== "requested"
                || request.target !== "supervisor" || request.source.role !== "worker" || !("goalId" in request)) {
                throw new Error("Action permission request Trigger is invalid");
            }
            const requestPayload = decodeTriggerActionPermissionRequest(request);
            if (request.id !== requestPayload.requestId) throw new Error("Action permission request identity is invalid");
            if (reply === undefined || !("goalId" in reply) || reply.goalId !== request.goalId || !("replyTo" in reply)
                || reply.replyTo !== request.id || reply.target !== "worker"
                || (reply.source.role !== "external" && reply.source.role !== "supervisor")) {
                throw new Error("Action permission reply identity is inconsistent");
            }
            if (reply.type === "permission" && reply.payload.action === "decided") {
                const replyPayload = decodeTriggerActionPermissionReply(reply, request);
                if (replyPayload.requestId !== requestTriggerId
                    || replyPayload.actionId !== requestPayload.actionId || replyPayload.runId !== requestPayload.runId
                    || replyPayload.interactionId !== requestPayload.interactionId || replyPayload.commitRevision !== requestPayload.commitRevision
                    || replyPayload.workerId !== request.source.workerId || replyPayload.generation !== request.source.generation) {
                    throw new Error("Action permission reply payload identity is inconsistent");
                }
            } else if (reply.type === "interaction" && reply.payload.action === "answered") {
                const answer = reply.payload.answer;
                const isActionDecision = answer.kind === "approve_action" || answer.kind === "approve_action_revision" || answer.kind === "reject_action";
                if (!isActionDecision || answer.actionId !== requestPayload.actionId
                    || ((answer.kind === "approve_action" || answer.kind === "approve_action_revision") && answer.approvalInputId !== reply.id)
                    || (answer.kind === "reject_action" && !answer.reason.trim())) {
                    throw new Error("Action permission interaction payload is inconsistent");
                }
            } else {
                throw new Error("Trigger is not an Action permission reply");
            }
            this.database.prepare("UPDATE trigger_events SET routed = 1 WHERE id IN (?, ?)").run(requestTriggerId, replyTriggerId);
            this.database.prepare("DELETE FROM trigger_permission_failures WHERE trigger_id = ?").run(requestTriggerId);
            this.database.exec("COMMIT");
        } catch (error) {
            this.database.exec("ROLLBACK");
            throw error;
        }
    }


    /**
     * 为尚未路由的 work Trigger 保留 Goal 身份，以便故障恢复使用同一身份。
     *
     * @remarks 同一 Trigger 的重复保留必须使用同一 Goal ID；其他 Trigger 不能占用该 ID。
     * @param triggerId - 已保存 work Trigger 的 ID。
     * @param goalId - 该事件拟创建的 Goal 身份。
     * @throws Trigger 不存在、已路由、不是 Supervisor-targeted work 或身份冲突时抛出。
     */
    reserveGoal(triggerId: string, goalId: string): void {
        if (!goalId.trim()) throw new Error("Invalid Goal identity");
        this.database.exec("BEGIN IMMEDIATE");
        try {
            const trigger = this.read(triggerId);
            if (trigger === undefined || this.routeStatus(triggerId) !== "unrouted" || !isWorkTrigger(trigger)
                || trigger.target !== "supervisor") throw new Error("Goal reservation requires an unrouted work Trigger");
            const current = this.database.prepare("SELECT goal_id FROM trigger_goal_reservations WHERE trigger_id = ?").get(triggerId) as { goal_id: string } | undefined;
            if (current !== undefined && current.goal_id !== goalId) throw new Error("Goal reservation conflict");
            const owner = this.database.prepare("SELECT trigger_id FROM trigger_goal_reservations WHERE goal_id = ?").get(goalId) as { trigger_id: string } | undefined;
            if (owner !== undefined && owner.trigger_id !== triggerId) throw new Error("Goal identity already reserved");
            if (current === undefined) this.database.prepare("INSERT INTO trigger_goal_reservations (trigger_id, goal_id) VALUES (?, ?)").run(triggerId, goalId);
            this.database.exec("COMMIT");
        } catch (error) {
            this.database.exec("ROLLBACK");
            throw error;
        }
    }

    /** @returns 此 Trigger 已保留的 Goal ID，尚未保留时返回 `undefined`。 */
    reservedGoal(triggerId: string): string | undefined {
        const row = this.database.prepare("SELECT goal_id FROM trigger_goal_reservations WHERE trigger_id = ?").get(triggerId) as { goal_id: string } | undefined;
        return row?.goal_id;
    }

    /**
     * 冻结完整 Goal 创建意图，用于发布中断后恢复相同内容。
     *
     * @param triggerId - 已保留 Goal ID 的 work Trigger。
     * @param goal - 尚未发布的完整 Goal；重试须使用相同内容。
     * @throws Goal 与保留身份不符、Trigger 已路由、意图冲突或存储失败时抛出。
     */
    freezeGoal(triggerId: string, goal: Goal): void {
        const snapshot = canonicalJson(goalSnapshotCodec.encode(goal));
        this.database.exec("BEGIN IMMEDIATE");
        try {
            const row = this.database.prepare("SELECT goal_id, snapshot FROM trigger_goal_reservations WHERE trigger_id = ?").get(triggerId) as { goal_id: string; snapshot: string | null } | undefined;
            if (row === undefined || this.routeStatus(triggerId) !== "unrouted" || row.goal_id !== goal.id) throw new Error("Goal reservation does not match unrouted Trigger");
            if (row.snapshot !== null && row.snapshot !== snapshot) throw new Error("Goal creation intent conflict");
            if (row.snapshot === null) this.database.prepare("UPDATE trigger_goal_reservations SET snapshot = ? WHERE trigger_id = ?").run(snapshot, triggerId);
            this.database.exec("COMMIT");
        } catch (error) {
            this.database.exec("ROLLBACK");
            throw error;
        }
    }

    /** @returns 经过当前快照协议校验的已冻结 Goal；尚未冻结时返回 `undefined`。 */
    frozenGoal(triggerId: string): Goal | undefined {
        const row = this.database.prepare("SELECT goal_id, snapshot FROM trigger_goal_reservations WHERE trigger_id = ?").get(triggerId) as { goal_id: string; snapshot: string | null } | undefined;
        if (row === undefined || row.snapshot === null) return undefined;
        const goal = goalSnapshotCodec.decode(JSON.parse(row.snapshot));
        if (goal.id !== row.goal_id) throw new Error("Goal creation intent identity conflict");
        return goal;
    }

    /**
     * 原子写入已发布 Goal 的 FIFO 派发队列。
     *
     * @remarks 队列记录 Goal 的 FIFO 准入与 Worker 所有权；入队和 Trigger 路由标记在同一事务提交。
     * @param triggerId - 保留 Goal 身份的 work Trigger ID。
     * @throws Goal 未保留或未冻结、队列绑定冲突或存储失败时抛出。
     */
    acceptGoal(triggerId: string): void {
        this.database.exec("BEGIN IMMEDIATE");
        try {
            const trigger = this.read(triggerId);
            const goalId = this.reservedGoal(triggerId);
            if (trigger === undefined || !isWorkTrigger(trigger) || goalId === undefined) throw new Error("Goal reservation does not exist");
            if (this.frozenGoal(triggerId) === undefined) throw new Error("Goal creation intent is not frozen");
            const queued = this.database.prepare("SELECT goal_id FROM trigger_goal_queue WHERE trigger_id = ?").get(triggerId) as { goal_id: string } | undefined;
            if (queued !== undefined && queued.goal_id !== goalId) throw new Error("Goal queue identity conflict");
            if (queued === undefined) this.database.prepare("INSERT INTO trigger_goal_queue (trigger_id, goal_id) VALUES (?, ?)").run(triggerId, goalId);
            this.database.prepare("UPDATE trigger_events SET routed = 1 WHERE id = ?").run(triggerId);
            this.database.prepare("DELETE FROM trigger_admission_failures WHERE trigger_id = ?").run(triggerId);
            this.database.exec("COMMIT");
        } catch (error) {
            this.database.exec("ROLLBACK");
            throw error;
        }
    }

    /** @returns 已由指定 Trigger 入队的 Goal ID；尚未入队时返回 `undefined`。 */
    queuedGoalForTrigger(triggerId: string): string | undefined {
        const row = this.database.prepare("SELECT goal_id FROM trigger_goal_queue WHERE trigger_id = ?").get(triggerId) as { goal_id: string } | undefined;
        return row?.goal_id;
    }

    /** @returns 已准入 Goal 的身份，按队列事务提交顺序排列。 */
    queuedGoalIds(): readonly string[] {
        const rows = this.database.prepare("SELECT goal_id FROM trigger_goal_queue WHERE status <> 'terminal' ORDER BY sequence").all() as { goal_id: string }[];
        return rows.map(({ goal_id }) => goal_id);
    }

    /**
     * 列出持久 Goal 队列记录，用于在 Supervisor 重启后结算已路由 Goal 的文件创建意图。
     *
     * @returns 按 FIFO 顺序返回当前和终态 Goal 的队列记录。
     * @throws 队列记录损坏或 SQLite 读取失败时抛出。
     * @example
     * ```ts
     * for (const item of store.goalQueueRecords()) await cleanup(item.triggerId);
     * ```
     */
    goalQueueRecords(): readonly TriggerGoalQueueRecord[] {
        const rows = this.database.prepare("SELECT goal_id FROM trigger_goal_queue ORDER BY sequence").all() as { goal_id: string }[];
        return rows.map(({ goal_id }) => {
            const record = this.queueRecord(goal_id);
            if (record === undefined) throw new Error("Goal queue record disappeared");
            return record;
        });
    }

    /** @returns 当前队首未绑定 Goal；已认领和终态项目不会被再次派发。 */
    nextQueuedGoal(): string | undefined {
        const row = this.database.prepare("SELECT goal_id FROM trigger_goal_queue WHERE status = 'queued' ORDER BY sequence LIMIT 1").get() as { goal_id: string } | undefined;
        return row?.goal_id;
    }

    /** @returns 持久队列中的指定 Goal 记录；不存在时返回 `undefined`。 */
    queueRecord(goalId: string): TriggerGoalQueueRecord | undefined {
        const row = this.database.prepare("SELECT sequence, goal_id, trigger_id, status, worker_id, generation FROM trigger_goal_queue WHERE goal_id = ?").get(goalId) as {
            sequence: number; goal_id: string; trigger_id: string; status: TriggerGoalQueueRecord["status"]; worker_id: string | null; generation: string | null;
        } | undefined;
        if (row === undefined) return undefined;
        if ((row.worker_id === null) !== (row.generation === null)
            || (row.status === "queued" && row.worker_id !== null)
            || (row.status !== "queued" && row.worker_id === null)) throw new Error("Invalid stored Goal queue record");
        return {
            sequence: row.sequence,
            goalId: row.goal_id,
            triggerId: row.trigger_id,
            status: row.status,
            ...(row.worker_id === null ? {} : { workerId: row.worker_id }),
            ...(row.generation === null ? {} : { generation: row.generation }),
        };
    }

    /**
     * 按入队顺序把队首 Goal 持久绑定到空闲 Worker 进程。
     *
     * @remarks
     * 调用方须持有 Supervisor 所有权并确认 Worker 身份。绑定只表示派发意图，
     * 不证明进程已收到或完成；中断后不得仅凭超时解除绑定或盲目重派。
     *
     * @param owner - 当前工作区的 Supervisor 所有权。
     * @param workerId - 空闲逻辑 Worker 身份。
     * @param generation - 已确认的 Worker 进程代次。
     * @returns 队首 Goal ID；没有未绑定项时返回 undefined。
     * @throws 身份为空、Worker 已绑定 Goal 或存储失败时抛出。
     */
    async claimNextGoal(owner: SupervisorOwnership, workerId: string, generation: string): Promise<string | undefined> {
        return owner.run(async () => this.claimNextGoalOwned(workerId, generation));
    }

    private claimNextGoalOwned(workerId: string, generation: string): string | undefined {
        if (!workerId.trim() || !generation.trim()) throw new Error("Invalid Worker identity");
        this.database.exec("BEGIN IMMEDIATE");
        try {
            const busy = this.database.prepare("SELECT goal_id FROM trigger_goal_queue WHERE worker_id = ? AND status IN ('claimed', 'waiting')").get(workerId);
            if (busy !== undefined) throw new Error("Worker already has a Goal");
            const row = this.database.prepare("SELECT goal_id FROM trigger_goal_queue WHERE status = 'queued' ORDER BY sequence LIMIT 1").get() as { goal_id: string } | undefined;
            if (row !== undefined) this.database.prepare("UPDATE trigger_goal_queue SET worker_id = ?, generation = ?, status = 'claimed' WHERE goal_id = ? AND status = 'queued'").run(workerId, generation, row.goal_id);
            this.database.exec("COMMIT");
            return row?.goal_id;
        } catch (error) {
            this.database.exec("ROLLBACK");
            throw error;
        }
    }

    /**
     * 查询 Worker 的持久派发绑定，供响应丢失和重启后的身份核对使用。
     *
     * @param workerId - 逻辑 Worker 身份。
     * @param generation - 待核对的进程代次。
     * @returns 该进程绑定的 Goal ID；无绑定时返回 undefined。
     * @throws 存在其他进程代次的绑定或存储失败时抛出。
     */
    workerClaim(workerId: string, generation: string): string | undefined {
        const row = this.database.prepare("SELECT goal_id, generation FROM trigger_goal_queue WHERE worker_id = ? AND status IN ('claimed', 'waiting')").get(workerId) as { goal_id: string; generation: string } | undefined;
        if (row !== undefined && row.generation !== generation) throw new Error("Worker process generation does not match its Goal binding");
        return row?.goal_id;
    }

    /**
     * 记录由当前 Supervisor 的子进程退出事件确证的未决 Worker Goal。
     *
     * @remarks
     * 仅接受已路由的 Supervisor `lifecycle.exited` unexpected 观察及仍绑定该 Worker
     * 的活动 Goal。Worker 身份来自内部队列绑定，不能由 Trigger payload 或 PID 推断。
     *
     * @param owner - 当前工作区的 Supervisor 所有权。
     * @param input - 已观察到退出的 Worker 与 Goal 身份。
     * @returns 已存在或新建的待恢复记录。
     * @throws 生命周期证据、队列绑定或存储失败时抛出。
     */
    async recordWorkerRecovery(
        owner: SupervisorOwnership,
        input: Omit<TriggerWorkerRecoveryRecord, "status">,
    ): Promise<TriggerWorkerRecoveryRecord> {
        return owner.runExclusive(JSON.stringify(["worker-recovery", input.goalId]), async () => {
            this.database.exec("BEGIN IMMEDIATE");
            try {
                const queue = this.queueRecord(input.goalId);
                if (queue === undefined || queue.workerId !== input.workerId || queue.generation !== input.generation
                    || (queue.status !== "claimed" && queue.status !== "waiting")) {
                    throw new Error("Worker recovery does not match an active Goal binding");
                }
                const lifecycle = this.read(input.lifecycleTriggerId);
                if (lifecycle?.type !== "lifecycle" || this.routeStatus(input.lifecycleTriggerId) !== "routed"
                    || lifecycle.source.role !== "supervisor" || lifecycle.target !== "supervisor"
                    || lifecycle.payload.action !== "exited" || lifecycle.payload.outcome !== "unexpected") {
                    throw new Error("Worker recovery requires a routed Supervisor unexpected-exit observation");
                }
                const existing = this.workerRecovery(input.goalId);
                if (existing !== undefined) {
                    if (existing.workerId !== input.workerId || existing.generation !== input.generation
                        || existing.lifecycleTriggerId !== input.lifecycleTriggerId) throw new Error("Worker recovery identity conflict");
                    this.database.exec("COMMIT");
                    return existing;
                }
                this.database.prepare(`INSERT INTO trigger_worker_recoveries
                    (goal_id, worker_id, generation, lifecycle_trigger_id, status) VALUES (?, ?, ?, ?, 'pending')`)
                    .run(input.goalId, input.workerId, input.generation, input.lifecycleTriggerId);
                this.database.exec("COMMIT");
                return { ...input, status: "pending" };
            } catch (error) {
                this.database.exec("ROLLBACK");
                throw error;
            }
        });
    }

    /** @returns 指定 Goal 的 Worker 恢复记录；尚未观察到可信退出时返回 `undefined`。 */
    workerRecovery(goalId: string): TriggerWorkerRecoveryRecord | undefined {
        const row = this.database.prepare(`SELECT goal_id, worker_id, generation, lifecycle_trigger_id, status
            FROM trigger_worker_recoveries WHERE goal_id = ?`).get(goalId) as {
            goal_id: string; worker_id: string; generation: string; lifecycle_trigger_id: string; status: "pending" | "resumed";
        } | undefined;
        return row === undefined ? undefined : {
            goalId: row.goal_id,
            workerId: row.worker_id,
            generation: row.generation,
            lifecycleTriggerId: row.lifecycle_trigger_id,
            status: row.status,
        };
    }

    /** @returns 尚待明确恢复决定的 Worker Goal，按原队列顺序排列。 */
    workerRecoveries(): readonly TriggerWorkerRecoveryRecord[] {
        const rows = this.database.prepare(`SELECT r.goal_id, r.worker_id, r.generation, r.lifecycle_trigger_id, r.status
            FROM trigger_worker_recoveries r JOIN trigger_goal_queue q ON q.goal_id = r.goal_id
            WHERE r.status = 'pending' ORDER BY q.sequence`).all() as {
            goal_id: string; worker_id: string; generation: string; lifecycle_trigger_id: string; status: "pending" | "resumed";
        }[];
        return rows.map((row) => ({ goalId: row.goal_id, workerId: row.worker_id, generation: row.generation,
            lifecycleTriggerId: row.lifecycle_trigger_id, status: row.status }));
    }

    /**
     * 在已验证的显式恢复决定后，保留队列顺序并释放原 Worker 绑定。
     *
     * @param owner - 当前工作区的 Supervisor 所有权。
     * @param goalId - 等待恢复决定的 Goal。
     * @param workerId - 生命周期证据中的 Worker。
     * @param generation - 生命周期证据中的 OS 进程代次。
     * @returns 首次恢复时返回 `true`；重复调用返回 `false`。
     * @throws 恢复记录、原队列绑定不匹配或存储失败时抛出。
     */
    async requeueRecoveredGoal(owner: SupervisorOwnership, goalId: string, workerId: string, generation: string): Promise<boolean> {
        return owner.runExclusive(JSON.stringify(["worker-recovery", goalId]), async () => {
            this.database.exec("BEGIN IMMEDIATE");
            try {
                const recovery = this.workerRecovery(goalId);
                if (recovery === undefined || recovery.workerId !== workerId || recovery.generation !== generation) {
                    throw new Error("Goal has no matching confirmed Worker recovery");
                }
                if (recovery.status === "resumed") {
                    this.database.exec("COMMIT");
                    return false;
                }
                const queue = this.queueRecord(goalId);
                if (queue === undefined || queue.workerId !== workerId || queue.generation !== generation
                    || (queue.status !== "claimed" && queue.status !== "waiting")) {
                    throw new Error("Goal queue assignment changed before recovery");
                }
                this.database.prepare(`UPDATE trigger_goal_queue SET worker_id = NULL, generation = NULL, status = 'queued'
                    WHERE goal_id = ? AND worker_id = ? AND generation = ?`).run(goalId, workerId, generation);
                this.database.prepare("UPDATE trigger_worker_recoveries SET status = 'resumed' WHERE goal_id = ?").run(goalId);
                this.database.exec("COMMIT");
                return true;
            } catch (error) {
                this.database.exec("ROLLBACK");
                throw error;
            }
        });
    }

    /**
     * 持久化 Worker 对 Goal 的等待或终态报告。
     *
     * @remarks
     * 只有当前 generation 对应的活动绑定可更新。终态收据保留原 Worker 身份作审计，
     * 但释放 Worker 独占约束，后续可复用同一进程；重复写入相同状态幂等，终态不能回退。
     *
     * @param owner - 当前 Supervisor 所有权。
     * @param workerId - 已登记的逻辑 Worker。
     * @param generation - 本次 OS 进程代次。
     * @param goalId - 当前绑定的 Goal。
     * @param status - Runtime 已报告的等待或终态。
     * @throws 身份、绑定或状态转换不一致时抛出。
     * @example
     * ```ts
     * await store.markWorkerGoalStatus(owner, "worker-1", "generation-1", "goal-1", "waiting");
     * ```
     */
    async markWorkerGoalStatus(
        owner: SupervisorOwnership,
        workerId: string,
        generation: string,
        goalId: string,
        status: "waiting" | "terminal",
    ): Promise<void> {
        await owner.runExclusive(JSON.stringify(["worker-status", workerId, goalId]), async () => {
            this.database.exec("BEGIN IMMEDIATE");
            try {
                const row = this.database.prepare("SELECT generation, status FROM trigger_goal_queue WHERE worker_id = ? AND goal_id = ?").get(workerId, goalId) as { generation: string; status: string } | undefined;
                const isActive = row?.status === "claimed" || row?.status === "waiting";
                const isRepeatedTerminal = row?.status === "terminal" && status === "terminal";
                if (row === undefined || row.generation !== generation || (!isActive && !isRepeatedTerminal)) {
                    throw new Error("Worker Goal status binding conflict");
                }
                if (row.status !== status) {
                    this.database.prepare("UPDATE trigger_goal_queue SET status = ? WHERE worker_id = ? AND goal_id = ?").run(status, workerId, goalId);
                }
                this.database.exec("COMMIT");
            } catch (error) {
                this.database.exec("ROLLBACK");
                throw error;
            }
        });
    }


    /** 释放数据库连接。 */
    close(): void { this.database.close(); }
}

function normalizeTrigger(input: unknown): Trigger {
    const trigger = readTrigger(input);
    if (trigger === undefined) throw new Error("Invalid Trigger");
    const goalId = "goalId" in trigger ? trigger.goalId : undefined;
    if (!trigger.id.trim() || (goalId !== undefined && !goalId.trim())
        || (trigger.source.role === "worker" && (!trigger.source.workerId.trim() || !trigger.source.generation.trim()))
        || (trigger.source.role === "external" && !trigger.source.externalId.trim())) {
        throw new Error("Invalid Trigger identity");
    }
    return trigger;
}

function isWorkTrigger(trigger: Trigger): trigger is Extract<Trigger, { readonly type: "work" }> {
    return trigger.type === "work";
}
