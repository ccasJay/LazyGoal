import { DatabaseSync } from "node:sqlite";
import { closeSync, openSync } from "node:fs";
import { canonicalJson, isRecord } from "../../contracts/src/index";
import { triggerDeliveryFileBinding } from "./generated/trigger-delivery-binding";
import type { TriggerDeliveryFile, TriggerDeliveryOutcome } from "./trigger-delivery-file";
import { triggerDeliveryOutcomeBinding } from "./generated/trigger-delivery-outcome-binding";
import type { Goal } from "../../runtime/src/domain";
import { goalSnapshotCodec } from "./goal-snapshot-codec";
import { SupervisorOwnership } from "./supervisor-ownership";
import { decodeTriggerActionPermissionReply, decodeTriggerActionPermissionRequest } from "./trigger-permission-codec";

/** 单次投递的持久化处理结果。 */
export type TriggerDeliveryResult =
    | { readonly status: "pending"; readonly delivery: TriggerDeliveryFile; readonly reason?: "model-failed" | "invalid-model-result" | "invalid-work" }
    | { readonly status: "settled"; readonly delivery: TriggerDeliveryFile; readonly result: TriggerDeliveryOutcome };

/**
 * 已接受 Goal 在持久派发队列中的当前记录。
 *
 * @example
 * ```ts
 * const item: TriggerGoalQueueRecord = { sequence: 1, goalId: "goal-1", status: "queued" };
 * ```
 */
export interface TriggerGoalQueueRecord {
    readonly sequence: number;
    readonly goalId: string;
    readonly deliveryId: string;
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
 *   lifecycleDeliveryId: "delivery-exit-1", status: "pending",
 * };
 * ```
 */
export interface TriggerWorkerRecoveryRecord {
    readonly goalId: string;
    readonly workerId: string;
    readonly generation: string;
    readonly lifecycleDeliveryId: string;
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

/**
 * 使用 SQLite 事务保存 Trigger 与投递收据。
 *
 * @remarks
 * 实例可以由多个进程同时打开同一个数据库。相同投递的重试返回原记录，身份相同但
 * 内容不同会被拒绝。此存储不验证发送者的真实身份和目标授权，调用方必须先验证。
 * 数据库父目录由宿主创建并保护；完成后必须关闭实例。
 *
 * @example
 * ```ts
 * const store = new TriggerDeliveryStore("/private/trigger.db");
 * store.receive({ deliveryId: "d", trigger: { id: "t", purpose: "work", source: "user", payload: "{}" } });
 * store.close();
 * ```
 */
export class TriggerDeliveryStore {
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
                content TEXT NOT NULL
            ) STRICT;
            CREATE TABLE IF NOT EXISTS trigger_deliveries (
                id TEXT PRIMARY KEY,
                trigger_id TEXT NOT NULL REFERENCES trigger_events(id),
                content TEXT NOT NULL,
                result TEXT,
                pending_reason TEXT CHECK (pending_reason IS NULL OR pending_reason IN ('model-failed', 'invalid-model-result', 'invalid-work'))
            ) STRICT;
            CREATE TABLE IF NOT EXISTS trigger_goal_reservations (
                delivery_id TEXT PRIMARY KEY REFERENCES trigger_deliveries(id),
                goal_id TEXT NOT NULL UNIQUE,
                snapshot TEXT
            ) STRICT;
            CREATE TABLE IF NOT EXISTS trigger_goal_queue (
                sequence INTEGER PRIMARY KEY,
                delivery_id TEXT NOT NULL UNIQUE REFERENCES trigger_deliveries(id),
                goal_id TEXT NOT NULL UNIQUE,
                worker_id TEXT,
                generation TEXT,
                status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'claimed', 'waiting', 'terminal')),
                CHECK ((worker_id IS NULL AND generation IS NULL) OR (worker_id IS NOT NULL AND generation IS NOT NULL))
            ) STRICT;
            CREATE INDEX IF NOT EXISTS trigger_deliveries_goal ON trigger_deliveries(json_extract(content, '$.goalId'));
            CREATE TABLE IF NOT EXISTS trigger_worker_recoveries (
                goal_id TEXT PRIMARY KEY REFERENCES trigger_goal_queue(goal_id),
                worker_id TEXT NOT NULL,
                generation TEXT NOT NULL,
                lifecycle_delivery_id TEXT NOT NULL REFERENCES trigger_deliveries(id),
                status TEXT NOT NULL CHECK (status IN ('pending', 'resumed'))
            ) STRICT;
            DROP INDEX IF EXISTS trigger_goal_queue_worker;
            CREATE UNIQUE INDEX trigger_goal_queue_worker ON trigger_goal_queue(worker_id) WHERE worker_id IS NOT NULL AND status IN ('claimed', 'waiting');
            CREATE TABLE IF NOT EXISTS trigger_permission_failures (
                delivery_id TEXT PRIMARY KEY REFERENCES trigger_deliveries(id),
                reason TEXT NOT NULL CHECK (reason IN ('missing-goal-ceiling', 'goal-scope-exceeded', 'model-failed', 'invalid-model-result', 'worker-unavailable', 'reply-rejected'))
            ) STRICT;
            PRAGMA foreign_keys = ON;
        `);
    }

    /**
     * 保存新投递或查询同一投递的原状态。
     *
     * @param input - 已认证来源及目标授权的投递；结构仍在此边界校验。
     * @returns 新建或既有投递状态。
     * @throws 结构、JSON、身份冲突或存储失败时抛出；事务不会部分提交。
     */
    receive(input: unknown): TriggerDeliveryResult {
        const normalized = normalizeDelivery(input);
        const event = normalized.trigger;
        const triggerContent = canonicalJson(normalized.trigger);
        const deliveryContent = canonicalJson(normalized);
        this.database.exec("BEGIN IMMEDIATE");
        try {
            const existingEvent = this.database.prepare("SELECT content FROM trigger_events WHERE id = ?").get(event.id) as { content: string } | undefined;
            if (existingEvent !== undefined && existingEvent.content !== triggerContent) throw new Error("Trigger identity conflict");
            const existing = this.read(normalized.deliveryId);
            if (existing !== undefined) {
                if (canonicalJson(existing.delivery) !== deliveryContent) throw new Error("Delivery identity conflict");
                this.database.exec("COMMIT");
                return existing;
            }
            if (existingEvent === undefined) this.database.prepare("INSERT INTO trigger_events (id, content) VALUES (?, ?)").run(event.id, triggerContent);
            this.database.prepare("INSERT INTO trigger_deliveries (id, trigger_id, content) VALUES (?, ?, ?)").run(normalized.deliveryId, event.id, deliveryContent);
            this.database.exec("COMMIT");
            return { status: "pending", delivery: normalized };
        } catch (error) {
            this.database.exec("ROLLBACK");
            throw error;
        }
    }

    /** @returns 投递状态；不存在时返回 undefined，损坏时抛出。 */
    read(deliveryId: string): TriggerDeliveryResult | undefined {
        const row = this.database.prepare(`SELECT d.content, d.result, d.pending_reason, t.content AS event_content
            FROM trigger_deliveries d LEFT JOIN trigger_events t ON t.id = d.trigger_id WHERE d.id = ?`).get(deliveryId) as { content: string; result: string | null; pending_reason: "model-failed" | "invalid-model-result" | "invalid-work" | null; event_content: string | null } | undefined;
        if (row === undefined) return undefined;
        const delivery = normalizeDelivery(JSON.parse(row.content) as unknown);
        if (delivery.deliveryId !== deliveryId || canonicalJson(delivery.trigger) !== row.event_content
            || canonicalJson(delivery) !== row.content) throw new Error("Invalid stored trigger delivery");
        if (row.result === null) return { status: "pending", delivery, ...(row.pending_reason === null ? {} : { reason: row.pending_reason }) };
        const parsedResult = triggerDeliveryOutcomeBinding.read(JSON.parse(row.result) as unknown, "reject");
        if (!parsedResult.ok || canonicalJson(parsedResult.data) !== row.result
            || ((parsedResult.data.kind === "accepted" || parsedResult.data.kind === "rejected") && !parsedResult.data.goalId.trim())) {
            throw new Error("Invalid stored trigger outcome");
        }
        const result = parsedResult.data;
        if (result.kind === "accepted" || result.kind === "rejected") {
            const reservation = this.reservedGoal(deliveryId);
            const queued = this.database.prepare("SELECT goal_id FROM trigger_goal_queue WHERE delivery_id = ?").get(deliveryId) as { goal_id: string } | undefined;
            if (reservation !== result.goalId || this.frozenGoal(deliveryId)?.id !== result.goalId
                || (result.kind === "accepted" && queued?.goal_id !== result.goalId)
                || (result.kind === "rejected" && queued !== undefined)) throw new Error("Inconsistent trigger outcome");
        }
        if ((result.kind === "ignored" && delivery.trigger.purpose !== "work")
            || (result.kind === "handled" && delivery.trigger.purpose === "work" && delivery.goalId === undefined)) {
            throw new Error("Inconsistent trigger outcome");
        }
        return { status: "settled", delivery, result };
    }

    /**
     * 按首次持久化顺序列出待处理投递身份。
     *
     * @remarks
     * 调用方应逐项调用 `read` 并独立处理错误，使一条损坏记录不阻塞其他记录。
     * 本方法不声明处理所有权；调用方须通过 Supervisor 所有权协调处理。
     *
     * @returns 尚未结算的投递身份，按首次写入顺序排列。
     * @throws 存储查询失败时抛出。
     */
    pendingIds(): readonly string[] {
        const rows = this.database.prepare("SELECT id FROM trigger_deliveries WHERE result IS NULL ORDER BY rowid").all() as { id: string }[];
        return rows.map(({ id }) => id);
    }

    /**
     * 按接收顺序读取关联指定 Goal 的 Trigger 投递。
     *
     * @remarks
     * 返回待处理与已结算记录，供宿主恢复交互、进度和结果视图；调用方仍须按
     * `trigger.purpose` 解释载荷，不应把其内容当作可执行授权。
     *
     * @param goalId - Trigger 投递关联的 Goal 身份。
     * @returns 该 Goal 的已校验投递记录；没有记录时返回空数组。
     * @throws 持久记录损坏或数据库读取失败时抛出。
     * @example
     * ```ts
     * const reports = store.listGoalDeliveries("goal-1");
     * ```
     */
    listGoalDeliveries(goalId: string): readonly TriggerDeliveryResult[] {
        if (!goalId.trim()) throw new Error("Goal identity is required");
        const rows = this.database.prepare("SELECT id FROM trigger_deliveries WHERE json_extract(content, '$.goalId') = ? ORDER BY rowid").all(goalId) as { id: string }[];
        return rows.map(({ id }) => this.read(id)).filter((result): result is TriggerDeliveryResult => result !== undefined);
    }

    /**
     * 按接收顺序列出指定 Worker 代次的生命周期 Trigger。
     *
     * @param workerId - Worker 的稳定逻辑身份。
     * @param generation - 待审计的 OS 进程代次。
     * @returns 该进程代次的生命周期收据；没有事件时返回空数组。
     * @throws 持久记录损坏或数据库读取失败时抛出。
     */
    listWorkerLifecycle(workerId: string, generation: string): readonly TriggerDeliveryResult[] {
        if (!workerId.trim() || !generation.trim()) throw new Error("Worker identity is required");
        const rows = this.database.prepare(`SELECT id FROM trigger_deliveries
            WHERE json_extract(content, '$.trigger.purpose') = 'lifecycle'
                AND json_extract(content, '$.trigger.workerId') = ?
                AND json_extract(content, '$.trigger.generation') = ?
            ORDER BY rowid`).all(workerId, generation) as { id: string }[];
        return rows.map(({ id }) => this.read(id)).filter((result): result is TriggerDeliveryResult => result !== undefined);
    }

    /**
     * 保存 Action 权限 Trigger 当前需要人工处理的失败关闭原因。
     *
     * @remarks 投递保持 pending；相同请求的后续失败会更新原因，处理成功后由 `settle` 清除。
     * @param deliveryId - 持久化的 Action 权限请求投递。
     * @param reason - 不含原始 Action 参数的稳定故障分类。
     * @throws 投递不是待处理权限请求或存储失败时抛出。
     */
    recordActionPermissionFailure(deliveryId: string, reason: TriggerActionPermissionFailureReason): void {
        const current = this.read(deliveryId);
        if (current?.status !== "pending" || current.delivery.trigger.purpose !== "permission"
            || current.delivery.trigger.source !== "worker" || current.delivery.goalId === undefined
            || current.delivery.trigger.workerId === undefined || current.delivery.trigger.generation === undefined) {
            throw new Error("Action permission failure requires a pending permission delivery");
        }
        const request = decodeTriggerActionPermissionRequest(current.delivery.trigger.payload);
        if (request.requestId !== current.delivery.trigger.id) throw new Error("Action permission failure request identity is invalid");
        this.database.prepare(`INSERT INTO trigger_permission_failures (delivery_id, reason) VALUES (?, ?)
            ON CONFLICT(delivery_id) DO UPDATE SET reason = excluded.reason`).run(deliveryId, reason);
    }

    /** @returns 待处理 Action 权限请求的失败关闭原因；尚未失败或不存在时返回 undefined。 */
    actionPermissionFailure(deliveryId: string): TriggerActionPermissionFailureReason | undefined {
        const row = this.database.prepare("SELECT reason FROM trigger_permission_failures WHERE delivery_id = ?").get(deliveryId) as { reason: TriggerActionPermissionFailureReason } | undefined;
        return row?.reason;
    }

    /**
     * 原子结算一组已由 Worker Runtime 应用的权限请求与回复。
     *
     * @remarks 两条投递必须属于同一 Goal 的权限事件；重复结算只接受原 `handled` 收据。
     * @param requestDeliveryId - Worker 权限请求投递身份。
     * @param replyDeliveryId - 已应用的 Supervisor／用户回复投递身份。
     * @returns 已结算的请求与回复记录。
     * @throws 身份、Goal、用途或既有结果不一致时抛出；事务不会部分结算。
     */
    settleActionPermissionExchange(requestDeliveryId: string, replyDeliveryId: string): readonly [TriggerDeliveryResult, TriggerDeliveryResult] {
        this.database.exec("BEGIN IMMEDIATE");
        try {
            const request = this.read(requestDeliveryId);
            const reply = this.read(replyDeliveryId);
            if (request === undefined || reply === undefined
                || request.delivery.trigger.purpose !== "permission" || request.delivery.trigger.source !== "worker"
                || reply.delivery.trigger.purpose !== "permission"
                || (reply.delivery.trigger.source !== "user" && reply.delivery.trigger.source !== "supervisor")
                || request.delivery.goalId === undefined || request.delivery.goalId !== reply.delivery.goalId) {
                throw new Error("Action permission exchange identity is inconsistent");
            }
            const requestPayload = decodeTriggerActionPermissionRequest(request.delivery.trigger.payload);
            const replyPayload = decodeTriggerActionPermissionReply(reply.delivery.trigger.payload);
            if (request.delivery.trigger.id !== requestPayload.requestId
                || replyPayload.requestDeliveryId !== requestDeliveryId
                || replyPayload.requestId !== requestPayload.requestId || replyPayload.runId !== requestPayload.runId
                || replyPayload.actionId !== requestPayload.actionId || replyPayload.interactionId !== requestPayload.interactionId
                || replyPayload.commitRevision !== requestPayload.commitRevision
                || replyPayload.workerId !== request.delivery.trigger.workerId
                || replyPayload.generation !== request.delivery.trigger.generation) {
                throw new Error("Action permission exchange payload identity is inconsistent");
            }
            for (const current of [request, reply]) {
                if (current.status === "settled" && current.result.kind !== "handled") {
                    throw new Error("Action permission exchange has a conflicting result");
                }
            }
            const result = canonicalJson({ kind: "handled" });
            for (const deliveryId of [requestDeliveryId, replyDeliveryId]) {
                this.database.prepare("UPDATE trigger_deliveries SET result = ? WHERE id = ? AND result IS NULL").run(result, deliveryId);
                this.database.prepare("DELETE FROM trigger_permission_failures WHERE delivery_id = ?").run(deliveryId);
            }
            this.database.exec("COMMIT");
            return [this.read(requestDeliveryId)!, this.read(replyDeliveryId)!];
        } catch (error) {
            this.database.exec("ROLLBACK");
            throw error;
        }
    }

    /**
     * 保存可重试的准入失败原因，不结算投递。
     * @param deliveryId - 待处理投递身份。
     * @param reason - 不包含模型正文或凭据的稳定失败分类。
     * @throws 投递不存在、已结算或存储失败时抛出。
     */
    recordAdmissionFailure(deliveryId: string, reason: "model-failed" | "invalid-model-result" | "invalid-work"): void {
        this.database.exec("BEGIN IMMEDIATE");
        try {
            const current = this.read(deliveryId);
            if (current === undefined || current.status !== "pending") throw new Error("Pending trigger delivery does not exist");
            this.database.prepare("UPDATE trigger_deliveries SET pending_reason = ? WHERE id = ?").run(reason, deliveryId);
            this.database.exec("COMMIT");
        } catch (error) {
            this.database.exec("ROLLBACK");
            throw error;
        }
    }

    /**
     * 为待处理工作投递保留 Goal 身份，以便故障恢复使用同一身份。
     *
     * @remarks
     * 同一投递的重复保留必须使用同一 Goal ID，其他投递不能占用该 ID。此操作不
     * 检查旧快照目录；创建者仍须以不覆盖方式检查目标快照并持久化创建意图。
     *
     * @param deliveryId - 已保存的工作投递。
     * @param goalId - 该次投递拟创建的 Goal 身份。
     * @throws 投递不存在、已结算、不是工作或身份冲突时抛出。
     */
    reserveGoal(deliveryId: string, goalId: string): void {
        if (!goalId.trim()) throw new Error("Invalid Goal identity");
        this.database.exec("BEGIN IMMEDIATE");
        try {
            const delivery = this.read(deliveryId);
            if (delivery === undefined || delivery.status !== "pending" || delivery.delivery.trigger.purpose !== "work" || delivery.delivery.goalId !== undefined) {
                throw new Error("Goal reservation requires a pending work delivery");
            }
            const current = this.database.prepare("SELECT goal_id FROM trigger_goal_reservations WHERE delivery_id = ?").get(deliveryId) as { goal_id: string } | undefined;
            if (current !== undefined && current.goal_id !== goalId) throw new Error("Goal reservation conflict");
            const owner = this.database.prepare("SELECT delivery_id FROM trigger_goal_reservations WHERE goal_id = ?").get(goalId) as { delivery_id: string } | undefined;
            if (owner !== undefined && owner.delivery_id !== deliveryId) throw new Error("Goal identity already reserved");
            if (current === undefined) this.database.prepare("INSERT INTO trigger_goal_reservations (delivery_id, goal_id) VALUES (?, ?)").run(deliveryId, goalId);
            this.database.exec("COMMIT");
        } catch (error) {
            this.database.exec("ROLLBACK");
            throw error;
        }
    }

    /** @returns 此投递已保留的 Goal ID，尚未保留时返回 undefined。 */
    reservedGoal(deliveryId: string): string | undefined {
        const row = this.database.prepare("SELECT goal_id FROM trigger_goal_reservations WHERE delivery_id = ?").get(deliveryId) as { goal_id: string } | undefined;
        return row?.goal_id;
    }

    /**
     * 冻结完整 Goal 创建意图，用于发布中断后恢复相同内容。
     *
     * @param deliveryId - 已保留 Goal ID 的工作投递。
     * @param goal - 尚未发布的完整 Goal；重试须使用相同内容。
     * @throws Goal 与保留身份不符、意图冲突或存储失败时抛出。
     */
    freezeGoal(deliveryId: string, goal: Goal): void {
        const snapshot = canonicalJson(goalSnapshotCodec.encode(goal));
        this.database.exec("BEGIN IMMEDIATE");
        try {
            const row = this.database.prepare("SELECT goal_id, snapshot FROM trigger_goal_reservations WHERE delivery_id = ?").get(deliveryId) as { goal_id: string; snapshot: string | null } | undefined;
            const delivery = this.read(deliveryId);
            if (row === undefined || delivery?.status !== "pending" || row.goal_id !== goal.id) throw new Error("Goal reservation does not match pending delivery");
            if (row.snapshot !== null && row.snapshot !== snapshot) throw new Error("Goal creation intent conflict");
            if (row.snapshot === null) this.database.prepare("UPDATE trigger_goal_reservations SET snapshot = ? WHERE delivery_id = ?").run(snapshot, deliveryId);
            this.database.exec("COMMIT");
        } catch (error) {
            this.database.exec("ROLLBACK");
            throw error;
        }
    }

    /** @returns 经过当前快照协议校验的已冻结 Goal；尚未冻结时返回 undefined。 */
    frozenGoal(deliveryId: string): Goal | undefined {
        const row = this.database.prepare("SELECT goal_id, snapshot FROM trigger_goal_reservations WHERE delivery_id = ?").get(deliveryId) as { goal_id: string; snapshot: string | null } | undefined;
        if (row === undefined || row.snapshot === null) return undefined;
        const goal = goalSnapshotCodec.decode(JSON.parse(row.snapshot));
        if (goal.id !== row.goal_id) throw new Error("Goal creation intent identity conflict");
        return goal;
    }

    /**
     * 为已完成持久化的 Goal 原子提交收据和派发队列。
     *
     * @remarks
     * 宿主必须先确认该 Goal 是本投递创建且已持久化；此方法不检查文件。每次事务
     * 提交决定入队顺序，重复调用返回同一结果。队列只记录准入，不声明执行所有权。
     *
     * @param deliveryId - 保留 Goal 身份的待处理投递。
     * @returns 已结算的投递。
     * @throws 目标未保留、收据冲突或存储失败时抛出。
     */
    acceptGoal(deliveryId: string): TriggerDeliveryResult {
        this.database.exec("BEGIN IMMEDIATE");
        try {
            const current = this.read(deliveryId);
            const goalId = this.reservedGoal(deliveryId);
            if (current === undefined || goalId === undefined) throw new Error("Goal reservation does not exist");
            if (this.frozenGoal(deliveryId) === undefined) throw new Error("Goal creation intent is not frozen");
            const result: TriggerDeliveryOutcome = { kind: "accepted", goalId };
            if (current.status === "settled" && canonicalJson(current.result) !== canonicalJson(result)) throw new Error("Trigger delivery result conflict");
            const queued = this.database.prepare("SELECT goal_id FROM trigger_goal_queue WHERE delivery_id = ?").get(deliveryId) as { goal_id: string } | undefined;
            if (queued !== undefined && queued.goal_id !== goalId) throw new Error("Goal queue identity conflict");
            if (current.status === "settled" && queued === undefined) throw new Error("Accepted delivery is missing its queue entry");
            if (current.status === "pending") {
                if (queued !== undefined) throw new Error("Pending delivery has an unexpected queue entry");
                this.database.prepare("INSERT INTO trigger_goal_queue (delivery_id, goal_id) VALUES (?, ?)").run(deliveryId, goalId);
                this.database.prepare("UPDATE trigger_deliveries SET result = ? WHERE id = ?").run(canonicalJson(result), deliveryId);
            }
            this.database.exec("COMMIT");
            return { status: "settled", delivery: current.delivery, result };
        } catch (error) {
            this.database.exec("ROLLBACK");
            throw error;
        }
    }

    /** @returns 已准入 Goal 的身份，按收据与队列事务提交顺序排列。 */
    queuedGoalIds(): readonly string[] {
        const rows = this.database.prepare("SELECT goal_id FROM trigger_goal_queue WHERE status <> 'terminal' ORDER BY sequence").all() as { goal_id: string }[];
        return rows.map(({ goal_id }) => goal_id);
    }

    /** @returns 当前队首未绑定 Goal；已认领和终态项目不会被再次派发。 */
    nextQueuedGoal(): string | undefined {
        const row = this.database.prepare("SELECT goal_id FROM trigger_goal_queue WHERE status = 'queued' ORDER BY sequence LIMIT 1").get() as { goal_id: string } | undefined;
        return row?.goal_id;
    }

    /** @returns 持久队列中的指定 Goal 记录；不存在时返回 undefined。 */
    queueRecord(goalId: string): TriggerGoalQueueRecord | undefined {
        const row = this.database.prepare("SELECT sequence, goal_id, delivery_id, status, worker_id, generation FROM trigger_goal_queue WHERE goal_id = ?").get(goalId) as {
            sequence: number; goal_id: string; delivery_id: string; status: TriggerGoalQueueRecord["status"]; worker_id: string | null; generation: string | null;
        } | undefined;
        if (row === undefined) return undefined;
        if ((row.worker_id === null) !== (row.generation === null)
            || (row.status === "queued" && row.worker_id !== null)
            || (row.status !== "queued" && row.worker_id === null)) throw new Error("Invalid stored Goal queue record");
        return {
            sequence: row.sequence,
            goalId: row.goal_id,
            deliveryId: row.delivery_id,
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
     * 仅接受已结算的同代 Worker `worker_exited` 生命周期 Trigger 和仍绑定该 Worker
     * 的活动 Goal。此记录保留原队列归属，不能通过 PID、超时或断连推断退出。
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
                const lifecycle = this.read(input.lifecycleDeliveryId);
                if (lifecycle?.status !== "settled" || lifecycle.result.kind !== "handled"
                    || lifecycle.delivery.trigger.purpose !== "lifecycle" || lifecycle.delivery.trigger.source !== "worker"
                    || lifecycle.delivery.trigger.workerId !== input.workerId || lifecycle.delivery.trigger.generation !== input.generation) {
                    throw new Error("Worker recovery requires a settled lifecycle Trigger from the same generation");
                }
                const payload: unknown = JSON.parse(lifecycle.delivery.trigger.payload);
                if (!isRecord(payload) || payload.type !== "worker_exited") throw new Error("Worker exit lifecycle evidence is invalid");
                const existing = this.workerRecovery(input.goalId);
                if (existing !== undefined) {
                    if (existing.workerId !== input.workerId || existing.generation !== input.generation
                        || existing.lifecycleDeliveryId !== input.lifecycleDeliveryId) throw new Error("Worker recovery identity conflict");
                    this.database.exec("COMMIT");
                    return existing;
                }
                this.database.prepare(`INSERT INTO trigger_worker_recoveries
                    (goal_id, worker_id, generation, lifecycle_delivery_id, status) VALUES (?, ?, ?, ?, 'pending')`)
                    .run(input.goalId, input.workerId, input.generation, input.lifecycleDeliveryId);
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
        const row = this.database.prepare(`SELECT goal_id, worker_id, generation, lifecycle_delivery_id, status
            FROM trigger_worker_recoveries WHERE goal_id = ?`).get(goalId) as {
            goal_id: string; worker_id: string; generation: string; lifecycle_delivery_id: string; status: "pending" | "resumed";
        } | undefined;
        return row === undefined ? undefined : {
            goalId: row.goal_id,
            workerId: row.worker_id,
            generation: row.generation,
            lifecycleDeliveryId: row.lifecycle_delivery_id,
            status: row.status,
        };
    }

    /** @returns 尚待明确恢复决定的 Worker Goal，按原队列顺序排列。 */
    workerRecoveries(): readonly TriggerWorkerRecoveryRecord[] {
        const rows = this.database.prepare(`SELECT r.goal_id, r.worker_id, r.generation, r.lifecycle_delivery_id, r.status
            FROM trigger_worker_recoveries r JOIN trigger_goal_queue q ON q.goal_id = r.goal_id
            WHERE r.status = 'pending' ORDER BY q.sequence`).all() as {
            goal_id: string; worker_id: string; generation: string; lifecycle_delivery_id: string; status: "pending" | "resumed";
        }[];
        return rows.map((row) => ({ goalId: row.goal_id, workerId: row.worker_id, generation: row.generation,
            lifecycleDeliveryId: row.lifecycle_delivery_id, status: row.status }));
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

    /**
     * 记录已确认被其他文件占用的 Goal ID，并结算对应投递。
     *
     * @remarks 调用方须先通过文件身份核对确认现有目标不属于本次创建意图。
     * @throws 没有冻结意图、已有不同结果或存储失败时抛出。
     */
    rejectOccupiedGoal(deliveryId: string): TriggerDeliveryResult {
        this.database.exec("BEGIN IMMEDIATE");
        try {
            const delivery = this.read(deliveryId);
            const goal = this.frozenGoal(deliveryId);
            if (delivery === undefined || goal === undefined) throw new Error("Goal creation intent is not frozen");
            const result: TriggerDeliveryOutcome = { kind: "rejected", reason: "goal-id-occupied", goalId: goal.id };
            if (delivery.status === "settled" && canonicalJson(delivery.result) !== canonicalJson(result)) throw new Error("Trigger delivery result conflict");
            if (delivery.status === "pending") this.database.prepare("UPDATE trigger_deliveries SET result = ? WHERE id = ?").run(canonicalJson(result), deliveryId);
            this.database.exec("COMMIT");
            return { status: "settled", delivery: delivery.delivery, result };
        } catch (error) {
            this.database.exec("ROLLBACK");
            throw error;
        }
    }

    /**
     * 结算投递；重复提交相同结果是幂等的。
     * @throws 投递不存在或已有不同结果时抛出。
     */
    settle(deliveryId: string, result: Extract<TriggerDeliveryOutcome, { kind: "ignored" | "handled" }>): TriggerDeliveryResult {
        this.database.exec("BEGIN IMMEDIATE");
        try {
            const current = this.read(deliveryId);
            if (current === undefined) throw new Error("Trigger delivery does not exist");
            if (current.status === "pending" && this.frozenGoal(deliveryId) !== undefined) throw new Error("Frozen Goal requires publication settlement");
            if ((result.kind === "ignored" && current.delivery.trigger.purpose !== "work")
                || (result.kind === "handled" && current.delivery.trigger.purpose === "work" && current.delivery.goalId === undefined)) {
                throw new Error("Trigger outcome does not match purpose");
            }
            if (current.status === "settled" && canonicalJson(current.result) !== canonicalJson(result)) throw new Error("Trigger delivery result conflict");
            if (current.status === "pending") this.database.prepare("UPDATE trigger_deliveries SET result = ? WHERE id = ?").run(canonicalJson(result), deliveryId);
            if (result.kind === "handled") this.database.prepare("DELETE FROM trigger_permission_failures WHERE delivery_id = ?").run(deliveryId);
            this.database.exec("COMMIT");
            return { status: "settled", delivery: current.delivery, result };
        } catch (error) {
            this.database.exec("ROLLBACK");
            throw error;
        }
    }

    /** 释放数据库连接。 */
    close(): void { this.database.close(); }
}

function normalizeDelivery(input: unknown): TriggerDeliveryFile {
    const validated = triggerDeliveryFileBinding.read(input, "reject");
    if (!validated.ok) throw new Error("Invalid trigger delivery");
    const delivery = validated.data;
    const event = delivery.trigger;
    if (!delivery.deliveryId.trim() || !event.id.trim()
        || (delivery.goalId !== undefined && !delivery.goalId.trim())
        || (event.source === "worker" && (!event.workerId?.trim() || !event.generation?.trim()))
        || (event.source !== "worker" && (event.workerId !== undefined || event.generation !== undefined))) {
        throw new Error("Invalid trigger identity");
    }
    let payload: unknown;
    try { payload = JSON.parse(event.payload); } catch { throw new Error("Invalid trigger payload JSON"); }
    return { ...delivery, trigger: { ...event, payload: canonicalJson(payload) } };
}
