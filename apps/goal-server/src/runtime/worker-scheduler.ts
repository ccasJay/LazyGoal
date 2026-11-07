import { createHash, randomUUID } from "node:crypto";
import { canonicalJson, isRecord } from "../../../../packages/contracts/src/index";
import type { LLMAdapter } from "../../../../packages/llm-core/src/index";
import type { Goal } from "../../../../packages/runtime/src/domain";
import { projectInteractionView } from "../../../../packages/runtime/src/interaction-view";
import { JsonFileGoalStore } from "../../../../packages/storage/src/goal-store";
import { TriggerDeliveryStore } from "../../../../packages/storage/src/trigger-delivery-store";
import { SupervisorOwnership } from "../../../../packages/storage/src/supervisor-ownership";
import { receiveAuthorizedTrigger, type TriggerIngressPrincipal } from "../../../../packages/storage/src/trigger-delivery-ingress";
import { triggerDeliveryFileBinding } from "../../../../packages/storage/src/generated/trigger-delivery-binding";
import {
    decodeTriggerActionPermissionReply,
    decodeTriggerActionPermissionRequest,
} from "../../../../packages/storage/src/trigger-permission-codec";
import type { TriggerDeliveryFile } from "../../../../packages/storage/src/trigger-delivery-file";
import type {
    TriggerActionPermissionFailureReason,
    TriggerDeliveryResult,
} from "../../../../packages/storage/src/trigger-delivery-store";
import type { TriggerActionPermissionReply, TriggerActionPermissionRequest } from "../../../../packages/storage/src/trigger-permission";
import { decodeWorkerInteractionPayload } from "./worker-interaction";
import { decideWorkerActionPermission } from "./worker-permission";
import { SupervisorWorkerProcess, type WorkerProcessExit, type WorkerProgress } from "./worker-process";
import {
    createWorkerProcessRegistration,
    listWorkerProcessRegistrations,
    removeWorkerProcessRegistration,
    removeWorkerRegistration,
    type WorkerOfflineProgress,
    type WorkerProcessRegistration,
} from "./worker-process-registry";

/**
 * 一条 Worker Action 权限请求及其持久处理状态。
 *
 * @remarks
 * `pending` 反映 Trigger 投递收据；失败原因只对仍需人工处理的请求存在。此视图不
 * 暴露可执行授权，决定必须经 `handleActionPermissionReply` 核验并由原 Worker Runtime 应用。
 *
 * @example
 * ```ts
 * const status: WorkerActionPermissionStatus = { deliveryId: "delivery-1", request, pending: true };
 * ```
 */
export interface WorkerActionPermissionStatus {
    readonly deliveryId: string;
    readonly request: TriggerActionPermissionRequest;
    readonly pending: boolean;
    readonly failure?: TriggerActionPermissionFailureReason;
}

/**
 * Supervisor 接收一条 Trigger 权限回复后的结果。
 *
 * @remarks 已结算重试返回 `settled`；新回复在 Worker 应用并保存后返回 `handled`。
 *
 * @example
 * ```ts
 * const result: WorkerPermissionReplyResult = { kind: "handled", progress: { kind: "waiting", waitingFor: "blocked" } };
 * ```
 */
export type WorkerPermissionReplyResult =
    | { readonly kind: "handled"; readonly progress: WorkerProgress }
    | { readonly kind: "settled"; readonly progress: WorkerProgress };

/**
 * Supervisor 接收一条 Goal 结构化交互 Trigger 后的结果。
 *
 * @remarks 新回应在 Worker Runtime 应用并保存后返回 `handled`；同一已结算投递重试返回 `settled`。
 * @example
 * ```ts
 * const result: WorkerInteractionResult = { kind: "handled", progress: { kind: "waiting", waitingFor: "blocked" } };
 * ```
 */
export type WorkerInteractionResult =
    | { readonly kind: "handled"; readonly progress: WorkerProgress }
    | { readonly kind: "settled"; readonly progress: WorkerProgress };

/**
 * 显式恢复已确认退出 Worker 所持 Goal 的处理结果。
 *
 * @example
 * ```ts
 * const result: WorkerRecoveryResult = { kind: "resumed", goalId: "goal-1" };
 * ```
 */
export type WorkerRecoveryResult =
    | { readonly kind: "resumed"; readonly goalId: string }
    | { readonly kind: "settled"; readonly goalId: string };

interface WorkerSlot {
    readonly workerId: string;
    readonly generation: string;
    readonly process: SupervisorWorkerProcess;
    readonly projectRoot: string;
    readonly executionRoot: string;
}

type WorkerLifecycleEvent =
    | { readonly type: "worker_started" | "worker_reconnected"; readonly pid: number }
    | { readonly type: "worker_exited"; readonly pid: number; readonly code: number | null; readonly signal: NodeJS.Signals | null; readonly normal: boolean };

/**
 * 将持久待派发队列按序绑定到可复用的独立 Worker。
 *
 * @remarks
 * 派发严格按 SQLite 队列顺序认领；没有空闲且工作区匹配的 Worker 时启动新进程。
 * 不限制不同 Goal 的并发。等待态继续占用 Worker；只有持久记录终态后才释放。
 * 已观察到的子进程退出会写入生命周期 Trigger 并留下待恢复记录，不自动重派。
 * Supervisor 重启时只重新接管能通过本机挑战握手的 Worker；显式恢复 Trigger 才能
 * 释放已确证退出进程的 Goal 绑定，运行中的不确定副作用需要单独确认。
 *
 * @example
 * ```ts
 * const scheduler = new WorkerScheduler({ owner, deliveries, goals, cwd, dataDirectory, permissionAdapter });
 * await scheduler.pump();
 * ```
 */
export class WorkerScheduler {
    private readonly workers = new Map<string, WorkerSlot>();
    private readonly progressTasks = new Set<Promise<void>>();
    private activePump: Promise<void> | undefined;
    private pumpRequested = false;

    /**
     * @param options - 同一 workspace 的 Supervisor 所有权、持久队列和文件存储。
     */
    constructor(private readonly options: {
        readonly owner: SupervisorOwnership;
        readonly deliveries: TriggerDeliveryStore;
        readonly goals: JsonFileGoalStore;
        readonly cwd: string;
        readonly dataDirectory: string;
        readonly env?: NodeJS.ProcessEnv;
        /** Supervisor 直接调用的默认权限判断模型。 */
        readonly permissionAdapter: LLMAdapter;
    }) {}

    /**
     * 派发当前所有可处理的队列项，不等待 Worker 完成。
     *
     * @returns 所有当前可派发 Goal 均已认领；执行继续在各 Worker 进程内进行。
     * @throws 队首快照损坏、缺少授权 workspace 或 Worker 启动失败时拒绝。
     * @example
     * ```ts
     * await scheduler.pump();
     * ```
     */
    pump(): Promise<void> {
        this.pumpRequested = true;
        if (this.activePump !== undefined) return this.activePump;
        this.activePump = (async () => {
            do {
                this.pumpRequested = false;
                await this.recoverWorkers();
                await this.dispatchQueuedGoals();
            } while (this.pumpRequested);
        })().finally(() => { this.activePump = undefined; });
        return this.activePump;
    }

    /**
     * 返回各 Worker 当前绑定的 Goal；只读读取进程池状态。
     *
     * @returns 按 Worker ID 排序的逻辑身份与绑定。
     * @example
     * ```ts
     * const assignments = scheduler.assignments();
     * ```
     */
    assignments(): readonly { readonly workerId: string; readonly goalId?: string }[] {
        return [...this.workers.values()].sort((left, right) => left.workerId.localeCompare(right.workerId)).map((slot) => ({
            workerId: slot.workerId,
            ...(slot.process.assignedGoalId === undefined ? {} : { goalId: slot.process.assignedGoalId }),
        }));
    }

    /**
     * 返回当前 Worker OS 进程 ID，用于核验进程存活与并行隔离。
     *
     * @returns 按 Worker ID 排序的子进程身份。
     * @throws Worker 无响应或身份与握手记录不符时抛出。
     * @example
     * ```ts
     * const processes = await scheduler.processIds();
     * ```
     */
    async processIds(): Promise<readonly { readonly workerId: string; readonly pid: number }[]> {
        return Promise.all([...this.workers.values()].sort((left, right) => left.workerId.localeCompare(right.workerId))
            .map(async (slot) => ({ workerId: slot.workerId, pid: await slot.process.probe() })));
    }

    /**
     * 要求当前持有 Goal 的 Worker 再推进一次。
     *
     * @param goalId - 该 Worker 已持久认领的 Goal。
     * @returns Runtime 报告的等待、终态或拒绝原因。
     * @throws Goal 未绑定到存活 Worker、代次不符或 IPC 故障时抛出。
     * @example
     * ```ts
     * const progress = await scheduler.advanceGoal("goal-1");
     * ```
     */
    async advanceGoal(goalId: string): Promise<WorkerProgress> {
        const slot = [...this.workers.values()].find((candidate) => candidate.process.assignedGoalId === goalId);
        if (slot === undefined) throw new Error("Goal has no active Worker");
        const progress = await slot.process.advance(goalId);
        await this.reportProgress(slot, goalId, progress);
        return progress;
    }

    /**
     * 将已认证的取消 Trigger 转发给 Goal 当前绑定的 Worker。
     *
     * @remarks
     * 投递先持久保存；Worker 只有在 Runtime 的中断检查点完成、Goal 快照确认
     * `cancelled` 且 Supervisor 保存终态进度后才释放。断连、过期代次或未确认停止
     * 会保持 Trigger 待处理及原队列绑定，不终止进程，也不重新派发副作用未知的工作。
     *
     * @param input - 关联既有 Goal 的取消投递。
     * @param principal - 由宿主认证的来源与 Goal 授权。
     * @returns Worker 已报告的终态、等待状态或拒绝原因。
     * @throws 载荷、授权或持久存储错误时抛出；未结算的取消投递仍可重试。
     * @example
     * ```ts
     * const progress = await scheduler.handleCancelTrigger(delivery, authenticatedUser);
     * ```
     */
    async handleCancelTrigger(input: unknown, principal: TriggerIngressPrincipal): Promise<WorkerProgress> {
        const parsed = triggerDeliveryFileBinding.read(input, "reject");
        if (!parsed.ok) throw new Error("Cancellation requires a Goal-bound cancel Trigger");
        const goalId = parsed.data.goalId;
        if (parsed.data.trigger.purpose !== "cancel" || goalId === undefined) {
            throw new Error("Cancellation requires a Goal-bound cancel Trigger");
        }
        const delivery: TriggerDeliveryFile = parsed.data;
        const receipt = receiveAuthorizedTrigger(this.options.deliveries, delivery, principal);
        if (receipt.status === "settled") {
            if (receipt.result.kind !== "handled") throw new Error("Cancellation delivery has a conflicting result");
            return this.currentTerminalProgress(goalId);
        }

        await this.pump();
        const queue = this.options.deliveries.queueRecord(goalId);
        if (queue === undefined) throw new Error("Cancellation target is not in the Goal queue");
        if (queue.status === "terminal") {
            const progress = await this.currentTerminalProgress(goalId);
            await this.options.deliveries.settle(delivery.deliveryId, { kind: "handled" });
            return progress;
        }
        const slot = queue.workerId === undefined || queue.generation === undefined
            ? undefined
            : this.workers.get(queue.workerId);
        if (slot === undefined || slot.generation !== queue.generation || slot.process.assignedGoalId !== goalId) {
            throw new Error("Cancellation target has no confirmed active Worker");
        }
        const progress = await slot.process.cancel(goalId, delivery.trigger.id);
        if (progress.kind !== "terminal") return progress;
        await this.reportProgress(slot, goalId, progress);
        await this.options.deliveries.settle(delivery.deliveryId, { kind: "handled" });
        return progress;
    }

    /**
     * 列出指定 Goal 的 Action 权限请求及需要人工处理的失败原因。
     *
     * @param goalId - 当前 Goal。
     * @returns 按 Trigger 接收顺序排列的权限请求，包括仍待处理的请求。
     * @throws 持久记录损坏或载荷不符合权限协议时抛出。
     * @example
     * ```ts
     * const pending = scheduler.actionPermissionStatuses("goal-1");
     * ```
     */
    actionPermissionStatuses(goalId: string): readonly WorkerActionPermissionStatus[] {
        return this.options.deliveries.listGoalDeliveries(goalId).flatMap((receipt) => {
            const delivery = receipt.delivery;
            if (delivery.trigger.purpose !== "permission" || delivery.trigger.source !== "worker") return [];
            const request = decodeTriggerActionPermissionRequest(delivery.trigger.payload);
            if (request.type !== "action_approval_request" || delivery.trigger.workerId === undefined
                || request.requestId !== delivery.trigger.id) throw new Error("Invalid stored Action permission request");
            const failure = this.options.deliveries.actionPermissionFailure(delivery.deliveryId);
            return [{
                deliveryId: delivery.deliveryId,
                request,
                pending: receipt.status === "pending",
                ...(failure === undefined ? {} : { failure }),
            }];
        });
    }

    /**
     * 接收并路由已认证的 Action 权限回复。
     *
     * @remarks 回复必须精确匹配仍待处理的请求、Goal Snapshot、Worker ID 与 generation；
     * Worker Runtime 再次核验当前 Action 等待。只有保存恢复进度后才会原子结算请求与回复。
     * @param input - `permission` Trigger 投递。
     * @param principal - 已认证且可访问目标 Goal 的用户或 Supervisor 身份。
     * @returns 已应用回复后的 Worker 进度，或既有已结算结果。
     * @throws 来源、请求、Goal、Action、Run 或 generation 不匹配及 Worker/存储失败时抛出。
     * @example
     * ```ts
     * const result = await scheduler.handleActionPermissionReply(delivery, authenticatedUser);
     * ```
     */
    async handleActionPermissionReply(input: unknown, principal: TriggerIngressPrincipal): Promise<WorkerPermissionReplyResult> {
        const parsed = triggerDeliveryFileBinding.read(input, "reject");
        if (!parsed.ok || parsed.data.trigger.purpose !== "permission" || parsed.data.goalId === undefined
            || (principal.role !== "user" && principal.role !== "supervisor")) {
            throw new Error("Action permission reply requires an authorized Goal-bound user or Supervisor Trigger");
        }
        const delivery = parsed.data;
        if (delivery.trigger.source !== principal.role) throw new Error("Permission reply source is not authenticated");
        const reply = decodeTriggerActionPermissionReply(delivery.trigger.payload);
        return this.options.owner.runExclusive(JSON.stringify(["permission-reply", reply.requestDeliveryId]), async () => {
            const route = await this.dispatchPermissionReply(delivery, principal, reply);
            if (route.kind === "settled") return route;
            await this.recordProgress(route.slot, route.goalId, route.progress, {
                requestDeliveryId: reply.requestDeliveryId,
                replyDeliveryId: delivery.deliveryId,
            });
            return { kind: "handled", progress: route.progress };
        });
    }

    /**
     * 接收并路由已认证的 Goal 结构化交互回应。
     *
     * @remarks 回应须绑定当前 Run、等待身份、Snapshot 修订及 Worker 代次；Worker Runtime
     * 再次验证领域决定。若等待是 Action 权限，请求与回应仅在进度保存后原子结算。
     * @param input - `interaction` Trigger 投递。
     * @param principal - 已认证且可访问目标 Goal 的用户或 Supervisor 身份。
     * @returns Worker 已应用回应后的等待、终态或拒绝进度，或既有收据。
     * @throws 来源、Goal、等待、Run、修订或 Worker 代次不匹配及 IPC/存储故障时抛出。
     * @example
     * ```ts
     * const result = await scheduler.handleInteractionTrigger(delivery, authenticatedUser);
     * ```
     */
    async handleInteractionTrigger(input: unknown, principal: TriggerIngressPrincipal): Promise<WorkerInteractionResult> {
        const parsed = triggerDeliveryFileBinding.read(input, "reject");
        if (!parsed.ok || parsed.data.trigger.purpose !== "interaction" || parsed.data.goalId === undefined
            || (principal.role !== "user" && principal.role !== "supervisor")
            || parsed.data.trigger.source !== principal.role) {
            throw new Error("Goal interaction requires an authorized user or Supervisor Trigger");
        }
        const delivery = parsed.data;
        const goalId = delivery.goalId;
        if (goalId === undefined) throw new Error("Goal interaction requires a Goal identity");
        return this.options.owner.runExclusive(JSON.stringify(["interaction-trigger", goalId, delivery.deliveryId]), async () => {
            const receipt = receiveAuthorizedTrigger(this.options.deliveries, delivery, principal);
            if (receipt.status === "settled") {
                if (receipt.result.kind !== "handled") throw new Error("Interaction Trigger has a conflicting result");
                return { kind: "settled", progress: await this.currentProgress(goalId) };
            }
            const payload = decodeWorkerInteractionPayload(delivery);
            const queue = this.options.deliveries.queueRecord(goalId);
            const slot = queue?.workerId === undefined || queue.generation === undefined
                ? undefined
                : this.workers.get(queue.workerId);
            if (queue?.status !== "waiting" || slot === undefined || slot.generation !== queue.generation
                || slot.process.assignedGoalId !== goalId || payload.workerId !== slot.workerId
                || payload.generation !== slot.generation) {
                throw new Error("Interaction target has no matching waiting Worker");
            }
            const goal = await this.options.goals.restore(goalId);
            const interaction = goal === undefined ? undefined : projectInteractionView(goal);
            if (goal === undefined || interaction === undefined || goal.state.run.status !== "waiting"
                || goal.state.run.id !== payload.runId
                || (goal.state.commitRevision ?? 0) !== payload.commitRevision
                || interaction.interactionId !== payload.interactionId
                || interaction.runId !== payload.runId
                || interactionLocalId(goal) !== payload.requestId) {
                throw new Error("Interaction Trigger does not match the current Goal wait");
            }
            const actionId = goal.state.run.pendingAction?.action.actionId;
            const permissionRequest = actionId === undefined ? undefined
                : this.actionPermissionStatuses(goalId).find((item) => item.pending && item.request.actionId === actionId);
            const progress = await slot.process.respondInteraction(delivery);
            await this.recordProgress(slot, goalId, progress);
            if (progress.kind !== "rejected") {
                if (permissionRequest === undefined) {
                    await this.options.deliveries.settle(delivery.deliveryId, { kind: "handled" });
                } else {
                    this.options.deliveries.settleActionPermissionInteraction(permissionRequest.deliveryId, delivery.deliveryId);
                }
            }
            return { kind: "handled", progress };
        });
    }

    /**
     * 处理用户明确要求从已确认退出 Worker 的最新 Goal 快照继续。
     *
     * @remarks
     * 必须存在本 Supervisor 观察并持久化的同代 Worker 退出记录。运行中的 Goal 可能
     * 已产生外部副作用，只有 Trigger 明确携带 `acknowledgeUnknownEffects: true` 时
     * 才会重新排队；进程断连、PID 不可达或超时本身不能满足此操作。
     *
     * @param input - `lifecycle` Trigger，载荷为 `{ type: "worker_recovery_decision",
     *   decision: "resume_checkpoint", workerId, generation, acknowledgeUnknownEffects }`。
     * @param principal - 已认证且有权访问目标 Goal 的用户或 Supervisor。
     * @returns 首次恢复为 `resumed`；已处理的同一投递返回 `settled`。
     * @throws Worker 退出证据、Goal 授权、恢复代次或明确确认不匹配时抛出。
     * @example
     * ```ts
     * await scheduler.handleWorkerRecoveryTrigger(delivery, userPrincipal);
     * ```
     */
    async handleWorkerRecoveryTrigger(input: unknown, principal: TriggerIngressPrincipal): Promise<WorkerRecoveryResult> {
        const parsed = triggerDeliveryFileBinding.read(input, "reject");
        if (!parsed.ok || parsed.data.trigger.purpose !== "lifecycle" || parsed.data.goalId === undefined
            || (principal.role !== "user" && principal.role !== "supervisor")
            || parsed.data.trigger.source !== principal.role) {
            throw new Error("Worker recovery requires an authorized Goal-bound lifecycle Trigger");
        }
        let payload: unknown;
        try { payload = JSON.parse(parsed.data.trigger.payload) as unknown; }
        catch { throw new Error("Worker recovery decision payload is invalid"); }
        if (!isRecord(payload) || payload.type !== "worker_recovery_decision" || payload.decision !== "resume_checkpoint"
            || typeof payload.workerId !== "string" || typeof payload.generation !== "string"
            || typeof payload.acknowledgeUnknownEffects !== "boolean") {
            throw new Error("Worker recovery decision payload is invalid");
        }
        const delivery = parsed.data;
        if (delivery.goalId === undefined) throw new Error("Worker recovery requires an authorized Goal identity");
        const goalId = delivery.goalId;
        return this.options.owner.runExclusive(JSON.stringify(["worker-recovery-trigger", goalId, delivery.deliveryId]), async () => {
            const receipt = receiveAuthorizedTrigger(this.options.deliveries, delivery, principal);
            if (receipt.status === "settled") {
                if (receipt.result.kind !== "handled") throw new Error("Worker recovery Trigger has a conflicting result");
                return { kind: "settled", goalId };
            }
            const recovery = this.options.deliveries.workerRecovery(goalId);
            if (recovery === undefined || recovery.status !== "pending" || recovery.workerId !== payload.workerId
                || recovery.generation !== payload.generation) {
                throw new Error("Goal has no matching confirmed Worker exit to recover");
            }
            const slot = this.workers.get(recovery.workerId);
            if (slot !== undefined && slot.generation === recovery.generation) {
                let responsive = true;
                try { await slot.process.probe(); } catch { responsive = false; }
                if (responsive) throw new Error("Worker is still responding and cannot be recovered as exited");
            }
            const goal = await this.options.goals.restore(goalId);
            if (goal === undefined || ["completed", "failed", "cancelled"].includes(goal.state.run.status)) {
                throw new Error("Terminal or missing Goal cannot be resumed");
            }
            if (goal.state.run.status === "running" && payload.acknowledgeUnknownEffects !== true) {
                throw new Error("Resuming a running Goal requires explicit acknowledgement of possible external effects");
            }
            await this.options.deliveries.requeueRecoveredGoal(this.options.owner, goalId, recovery.workerId, recovery.generation);
            this.workers.delete(recovery.workerId);
            await removeWorkerRegistration(this.options.dataDirectory, recovery.workerId);
            await this.options.deliveries.settle(delivery.deliveryId, { kind: "handled" });
            void this.pump();
            return { kind: "resumed", goalId };
        });
    }

    /**
     * 优雅关闭当前空闲 Worker。
     *
     * @remarks 活动或等待中的 Goal 保留原进程与持久绑定，调用方须先结算其运行状态。
     * @throws 任一空闲进程关闭失败时抛出。
     * @example
     * ```ts
     * await scheduler.closeIdle();
     * ```
     */
    async closeIdle(): Promise<void> {
        while (this.progressTasks.size > 0) await Promise.allSettled([...this.progressTasks]);
        for (const [workerId, slot] of this.workers) {
            if (slot.process.assignedGoalId !== undefined) continue;
            await slot.process.close();
            this.workers.delete(workerId);
            await removeWorkerProcessRegistration(this.options.dataDirectory, workerId);
        }
        while (this.progressTasks.size > 0) await Promise.allSettled([...this.progressTasks]);
    }

    /**
     * 关闭空闲 Worker 通道，并从仍持有 Goal 的 Worker 通道安全断开。
     *
     * @remarks 活动 Worker 的进程登记、Goal 绑定及本地 outbox 保留，供下一位
     * Supervisor 通过挑战握手重新接管；当前 Supervisor 不再持有这些进程句柄。
     * @throws 关闭或断开任一 Worker 失败时，继续处理其他 Worker 后聚合抛出。
     * @example
     * ```ts
     * await scheduler.detachAll();
     * ```
     */
    async detachAll(): Promise<void> {
        const failures: unknown[] = [];
        try { await this.closeIdle(); } catch (error) { failures.push(error); }
        for (const [workerId, slot] of this.workers) {
            try {
                await slot.process.detach();
            } catch (error) {
                failures.push(error);
            } finally {
                this.workers.delete(workerId);
            }
        }
        if (failures.length > 0) throw new AggregateError(failures, "Worker processes did not detach cleanly");
    }

    private async dispatchQueuedGoals(): Promise<void> {
        for (;;) {
            const nextGoalId = this.options.deliveries.nextQueuedGoal();
            if (nextGoalId === undefined) return;
            const goal = await this.options.goals.restore(nextGoalId);
            if (goal === undefined) throw new Error("Queued Goal snapshot is missing");
            const workspace = goal.definition.triggerContext?.authorization.workspace;
            if (workspace === undefined || !workspace.projectRoot.trim() || !workspace.executionRoot.trim()) throw new Error("Queued Goal has no authorized workspace");

            let slot = [...this.workers.values()].find((candidate) => candidate.projectRoot === workspace.projectRoot
                && candidate.executionRoot === workspace.executionRoot
                && candidate.process.assignedGoalId === undefined);
            if (slot === undefined) {
                const workerId = `worker-${randomUUID()}`;
                const generation = randomUUID();
                const registration = await createWorkerProcessRegistration(this.options.dataDirectory, workerId, generation, workspace);
                let process: SupervisorWorkerProcess;
                try {
                    process = await SupervisorWorkerProcess.start(this.workerOptions(registration));
                } catch (error) {
                    await removeWorkerProcessRegistration(this.options.dataDirectory, workerId);
                    throw error;
                }
                slot = { workerId, generation, process, projectRoot: workspace.projectRoot, executionRoot: workspace.executionRoot };
                this.workers.set(workerId, slot);
                this.observeWorkerExit(slot);
                await this.recordWorkerLifecycle(registration.workerId, registration.generation,
                    { type: "worker_started", pid: await process.probe() });
            }

            const claimed = await this.options.deliveries.claimNextGoal(this.options.owner, slot.workerId, slot.generation);
            if (claimed !== nextGoalId) throw new Error("Goal queue head changed before dispatch");
            void slot.process.advance(nextGoalId)
                .then((progress) => this.reportProgress(slot, nextGoalId, progress))
                .catch(() => undefined);
        }
    }

    private observeWorkerExit(slot: WorkerSlot): void {
        slot.process.onExit((exit) => {
            const goalId = slot.process.assignedGoalId;
            let task!: Promise<void>;
            task = this.recordWorkerLifecycle(slot.workerId, slot.generation, {
                type: "worker_exited", pid: exit.pid, code: exit.code, signal: exit.signal, normal: exit.normal,
            }).then(async (lifecycleDeliveryId) => {
                if (exit.normal || goalId === undefined) return;
                const queue = this.options.deliveries.queueRecord(goalId);
                if (queue?.workerId !== slot.workerId || queue.generation !== slot.generation
                    || (queue.status !== "claimed" && queue.status !== "waiting")) return;
                await this.options.deliveries.recordWorkerRecovery(this.options.owner, {
                    goalId, workerId: slot.workerId, generation: slot.generation, lifecycleDeliveryId,
                });
            }).catch(() => undefined).finally(() => this.progressTasks.delete(task));
            this.progressTasks.add(task);
        });
    }

    private async recordWorkerLifecycle(
        workerId: string,
        generation: string,
        event: WorkerLifecycleEvent,
    ): Promise<string> {
        return this.options.owner.runExclusive(JSON.stringify(["worker-lifecycle", workerId, generation, event]), async () => {
            const payload = canonicalJson(event);
            const digest = createHash("sha256").update(canonicalJson({ workerId, generation, payload })).digest("hex");
            const receipt = receiveAuthorizedTrigger(this.options.deliveries, {
                deliveryId: `worker-lifecycle-delivery-${digest}`,
                trigger: {
                    id: `worker-lifecycle-${digest}`,
                    purpose: "lifecycle",
                    source: "worker",
                    workerId,
                    generation,
                    payload,
                },
            }, { role: "worker", workerId, generation, mayCreateGoal: false });
            if (receipt.status === "pending") this.options.deliveries.settle(receipt.delivery.deliveryId, { kind: "handled" });
            return receipt.delivery.deliveryId;
        });
    }

    private workerOptions(registration: WorkerProcessRegistration) {
        return {
            workerId: registration.workerId,
            generation: registration.generation,
            cwd: registration.cwd,
            workspaceIdentityRoot: registration.workspaceIdentityRoot,
            dataDirectory: this.options.dataDirectory,
            registration,
            ...(this.options.env === undefined ? {} : { env: this.options.env }),
            owner: this.options.owner,
            deliveries: this.options.deliveries,
            goals: this.options.goals,
        };
    }

    private async recoverWorkers(): Promise<void> {
        for (const registration of await listWorkerProcessRegistrations(this.options.dataDirectory)) {
            if (this.workers.has(registration.workerId)) continue;
            let process: SupervisorWorkerProcess;
            try {
                process = await SupervisorWorkerProcess.attach(this.workerOptions(registration));
            } catch {
                // An absent or unauthenticated Worker provides no evidence that its work is safe to replay.
                continue;
            }
            const assignedGoalId = process.assignedGoalId;
            let claimedGoalId: string | undefined;
            try { claimedGoalId = this.options.deliveries.workerClaim(registration.workerId, registration.generation); } catch { /* Keep the assignment unresolved. */ }
            if (assignedGoalId !== claimedGoalId || (assignedGoalId !== undefined && this.options.deliveries.queueRecord(assignedGoalId)?.status === "terminal")) {
                await process.detach().catch(() => undefined);
                continue;
            }
            const slot: WorkerSlot = {
                workerId: registration.workerId,
                generation: registration.generation,
                process,
                projectRoot: registration.projectRoot,
                executionRoot: registration.executionRoot,
            };
            this.workers.set(slot.workerId, slot);
            process.setOfflineProgressHandler((event) => {
                let task!: Promise<void>;
                task = this.recoverProgress(slot, event).catch(() => undefined).finally(() => this.progressTasks.delete(task));
                this.progressTasks.add(task);
            });
            try {
                await process.replayOfflineMessages();
            } catch {
                continue;
            }
            await Promise.allSettled([...this.progressTasks]);
            await this.recordWorkerLifecycle(registration.workerId, registration.generation,
                { type: "worker_reconnected", pid: await process.probe() }).catch(() => undefined);
            if (assignedGoalId !== undefined && process.assignedGoalId === assignedGoalId) {
                await this.reconcileAttachedWorker(slot, assignedGoalId).catch(() => undefined);
            }
        }
    }

    private async recoverProgress(slot: WorkerSlot, event: WorkerOfflineProgress): Promise<void> {
        if (this.options.deliveries.workerClaim(slot.workerId, slot.generation) !== event.goalId) return;
        await this.recordProgress(slot, event.goalId, event.result);
    }

    private async reconcileAttachedWorker(slot: WorkerSlot, goalId: string): Promise<void> {
        if (slot.process.remoteOperationActive === true) return;
        const goal = await this.options.goals.restore(goalId);
        if (goal === undefined) return;
        if (goal.state.run.status === "created") {
            const progress = await slot.process.advance(goalId);
            await this.recordProgress(slot, goalId, progress);
            return;
        }
        if (goal.state.run.status === "waiting") {
            const waitingFor = goal.state.run.pendingInteraction?.kind === "ask_user" ? "ask_user"
                : goal.state.run.pendingInteraction?.kind === "task_approval" ? "task_approval"
                    : goal.state.run.pendingAction?.status === "awaiting_approval" ? "action_approval"
                        : goal.state.run.pendingAction?.status === "outcome_unknown" ? "action_recovery" : "blocked";
            await this.recordProgress(slot, goalId, { kind: "waiting", waitingFor });
            return;
        }
        if (goal.state.run.status === "completed" || goal.state.run.status === "failed" || goal.state.run.status === "cancelled") {
            await this.recordProgress(slot, goalId, { kind: "terminal", status: goal.state.run.status });
        }
    }

    private reportProgress(slot: WorkerSlot, goalId: string, progress: WorkerProgress): Promise<void> {
        let task!: Promise<void>;
        task = this.recordProgress(slot, goalId, progress).finally(() => this.progressTasks.delete(task));
        this.progressTasks.add(task);
        return task;
    }

    private async recordProgress(
        slot: WorkerSlot,
        goalId: string,
        initialProgress: WorkerProgress,
        consumedExchange?: { readonly requestDeliveryId: string; readonly replyDeliveryId: string },
    ): Promise<void> {
        let progress = initialProgress;
        let exchange = consumedExchange;
        for (;;) {
            await this.persistProgress(slot, goalId, progress);
            if (exchange !== undefined) {
                this.options.deliveries.settleActionPermissionExchange(exchange.requestDeliveryId, exchange.replyDeliveryId);
                exchange = undefined;
            }
            slot.process.acknowledgeProgress(goalId, progress);
            if (progress.kind !== "waiting" || progress.waitingFor !== "action_approval") return;
            const next = await this.autoHandleActionPermission(slot, goalId);
            if (next === undefined) return;
            progress = next.progress;
            exchange = next.exchange;
        }
    }

    private async persistProgress(slot: WorkerSlot, goalId: string, progress: WorkerProgress): Promise<void> {
        const queue = this.options.deliveries.queueRecord(goalId);
        if (queue === undefined || queue.workerId !== slot.workerId || queue.generation !== slot.generation) {
            throw new Error("Worker progress does not match its durable Goal binding");
        }
        const goal = await this.options.goals.restore(goalId);
        if (goal === undefined) throw new Error("Worker reported progress for a missing Goal");
        if (progress.kind === "waiting" && goal.state.run.status !== "waiting") throw new Error("Worker waiting report does not match the Goal snapshot");
        if (progress.kind === "terminal" && goal.state.run.status !== progress.status) throw new Error("Worker terminal report does not match the Goal snapshot");

        const report = progress.kind === "waiting"
            ? { kind: "waiting", waitingFor: progress.waitingFor, commitRevision: goal.state.commitRevision ?? 0, runId: goal.state.run.id }
            : progress.kind === "terminal"
                ? { kind: "terminal", status: progress.status, commitRevision: goal.state.commitRevision ?? 0, runId: goal.state.run.id }
                : { kind: "rejected", code: progress.code, commitRevision: goal.state.commitRevision ?? 0, runId: goal.state.run.id };
        const canonicalReport = canonicalJson(report);
        const digest = createHash("sha256").update(canonicalJson({ workerId: slot.workerId, generation: slot.generation, goalId, report })).digest("hex");
        const triggerId = `worker-progress-${digest}`;
        const receipt = receiveAuthorizedTrigger(this.options.deliveries, {
            deliveryId: `worker-progress-delivery-${digest}`,
            goalId,
            trigger: {
                id: triggerId,
                purpose: "progress",
                source: "worker",
                workerId: slot.workerId,
                generation: slot.generation,
                payload: canonicalReport,
            },
        }, { role: "worker", workerId: slot.workerId, generation: slot.generation, goalId, mayCreateGoal: false });
        if (receipt.status === "pending") await this.options.deliveries.settle(receipt.delivery.deliveryId, { kind: "handled" });

        if (progress.kind === "waiting") {
            await this.options.deliveries.markWorkerGoalStatus(this.options.owner, slot.workerId, slot.generation, goalId, "waiting");
            return;
        }
        if (progress.kind === "terminal") {
            await this.options.deliveries.markWorkerGoalStatus(this.options.owner, slot.workerId, slot.generation, goalId, "terminal");
            slot.process.confirmTerminal(goalId);
            void this.pump();
        }
    }

    private async autoHandleActionPermission(
        slot: WorkerSlot,
        goalId: string,
    ): Promise<{ readonly progress: WorkerProgress; readonly exchange: { readonly requestDeliveryId: string; readonly replyDeliveryId: string } } | undefined> {
        const goal = await this.options.goals.restore(goalId);
        if (goal === undefined) throw new Error("Action permission target Goal snapshot is missing");
        const requestReceipt = this.ensureActionPermissionRequest(slot, goal);
        if (requestReceipt.status !== "pending") return undefined;

        const existingReply = this.findPendingPermissionReply(goalId, requestReceipt.delivery.deliveryId);
        if (existingReply !== undefined) {
            const reply = decodeTriggerActionPermissionReply(existingReply.delivery.trigger.payload);
            const route = await this.dispatchPermissionReply(existingReply.delivery, {
                role: existingReply.delivery.trigger.source as "user" | "supervisor",
                mayCreateGoal: false,
                goalIds: [goalId],
            }, reply);
            return route.kind === "settled" ? undefined : {
                progress: route.progress,
                exchange: { requestDeliveryId: requestReceipt.delivery.deliveryId, replyDeliveryId: existingReply.delivery.deliveryId },
            };
        }

        const advice = await decideWorkerActionPermission(this.options.permissionAdapter, goal);
        if (advice.kind === "pending") {
            this.options.deliveries.recordActionPermissionFailure(requestReceipt.delivery.deliveryId, advice.reason);
            return undefined;
        }
        const request = decodeTriggerActionPermissionRequest(requestReceipt.delivery.trigger.payload);
        const actionId = goal.state.run.pendingAction?.action.actionId;
        if (actionId === undefined) throw new Error("Permission wait lost its pending Action identity");
        const replyPayload: TriggerActionPermissionReply = {
            type: "action_approval_reply",
            requestDeliveryId: requestReceipt.delivery.deliveryId,
            requestId: request.requestId,
            runId: request.runId,
            actionId: request.actionId,
            interactionId: request.interactionId,
            commitRevision: request.commitRevision,
            workerId: slot.workerId,
            generation: slot.generation,
            decision: advice.decision.kind,
            ...(advice.decision.kind === "approve" ? { scope: "action" } : { reason: advice.decision.reason }),
        };
        const payload = canonicalJson(replyPayload);
        const digest = createHash("sha256").update(canonicalJson({ requestDeliveryId: requestReceipt.delivery.deliveryId, payload })).digest("hex");
        const replyDelivery: TriggerDeliveryFile = {
            deliveryId: `worker-permission-reply-delivery-${digest}`,
            goalId,
            trigger: {
                id: `worker-permission-reply-${digest}`,
                purpose: "permission",
                source: "supervisor",
                payload,
            },
        };
        const principal: TriggerIngressPrincipal = { role: "supervisor", mayCreateGoal: false, goalIds: [goalId] };
        const route = await this.dispatchPermissionReply(replyDelivery, principal, replyPayload);
        return route.kind === "settled" ? undefined : {
            progress: route.progress,
            exchange: { requestDeliveryId: requestReceipt.delivery.deliveryId, replyDeliveryId: replyDelivery.deliveryId },
        };
    }

    private ensureActionPermissionRequest(slot: WorkerSlot, goal: Goal): TriggerDeliveryResult {
        const view = projectInteractionView(goal);
        if (view?.kind !== "action_approval" || goal.state.run.pendingAction?.status !== "awaiting_approval") {
            throw new Error("Worker reported Action approval without a matching persisted wait");
        }
        const commitRevision = goal.state.commitRevision ?? 0;
        const identity = {
            workerId: slot.workerId,
            generation: slot.generation,
            goalId: goal.id,
            runId: view.runId,
            actionId: view.actionId,
            interactionId: view.interactionId,
            commitRevision,
        };
        const digest = createHash("sha256").update(canonicalJson(identity)).digest("hex");
        const requestId = `worker-permission-request-${digest}`;
        const request: TriggerActionPermissionRequest = {
            type: "action_approval_request",
            requestId,
            runId: view.runId,
            actionId: view.actionId,
            interactionId: view.interactionId,
            commitRevision,
        };
        const delivery: TriggerDeliveryFile = {
            deliveryId: `worker-permission-request-delivery-${digest}`,
            goalId: goal.id,
            trigger: {
                id: requestId,
                purpose: "permission",
                source: "worker",
                workerId: slot.workerId,
                generation: slot.generation,
                payload: canonicalJson(request),
            },
        };
        return receiveAuthorizedTrigger(this.options.deliveries, delivery, {
            role: "worker",
            workerId: slot.workerId,
            generation: slot.generation,
            goalId: goal.id,
            mayCreateGoal: false,
        });
    }

    private findPendingPermissionReply(goalId: string, requestDeliveryId: string): Extract<TriggerDeliveryResult, { readonly status: "pending" }> | undefined {
        for (const receipt of this.options.deliveries.listGoalDeliveries(goalId)) {
            if (receipt.status !== "pending" || receipt.delivery.trigger.purpose !== "permission"
                || (receipt.delivery.trigger.source !== "user" && receipt.delivery.trigger.source !== "supervisor")) continue;
            const reply = decodeTriggerActionPermissionReply(receipt.delivery.trigger.payload);
            if (reply.requestDeliveryId === requestDeliveryId) return receipt;
        }
        return undefined;
    }

    private async dispatchPermissionReply(
        delivery: TriggerDeliveryFile,
        principal: TriggerIngressPrincipal,
        reply: TriggerActionPermissionReply,
    ): Promise<
        | { readonly kind: "settled"; readonly progress: WorkerProgress }
        | { readonly kind: "routed"; readonly slot: WorkerSlot; readonly goalId: string; readonly progress: WorkerProgress }
    > {
        const goalId = delivery.goalId;
        if (goalId === undefined || (principal.role !== "user" && principal.role !== "supervisor")
            || !principal.goalIds.includes(goalId) || delivery.trigger.source !== principal.role) {
            throw new Error("Permission reply source or Goal authorization is invalid");
        }
        const requestReceipt = this.options.deliveries.read(reply.requestDeliveryId);
        if (requestReceipt === undefined || requestReceipt.delivery.goalId !== goalId
            || requestReceipt.delivery.trigger.purpose !== "permission" || requestReceipt.delivery.trigger.source !== "worker") {
            throw new Error("Permission reply does not reference a stored Worker request");
        }
        const request = decodeTriggerActionPermissionRequest(requestReceipt.delivery.trigger.payload);
        if (requestReceipt.delivery.trigger.id !== request.requestId
            || reply.requestId !== request.requestId || reply.runId !== request.runId || reply.actionId !== request.actionId
            || reply.interactionId !== request.interactionId || reply.commitRevision !== request.commitRevision
            || reply.workerId !== requestReceipt.delivery.trigger.workerId
            || reply.generation !== requestReceipt.delivery.trigger.generation) {
            throw new Error("Permission reply identity does not match its Worker request");
        }

        const existing = this.options.deliveries.read(delivery.deliveryId);
        if (existing?.status === "settled") {
            const authenticated = receiveAuthorizedTrigger(this.options.deliveries, delivery, principal);
            if (authenticated.status !== "settled" || authenticated.result.kind !== "handled") {
                throw new Error("Permission reply has a conflicting settled result");
            }
            return { kind: "settled", progress: await this.currentProgress(goalId) };
        }
        if (requestReceipt.status !== "pending") throw new Error("Permission request has already been settled");

        const queue = this.options.deliveries.queueRecord(goalId);
        if (queue?.workerId !== reply.workerId || queue.generation !== reply.generation || queue.status !== "waiting") {
            throw new Error("Permission reply targets an old or inactive Worker generation");
        }
        const slot = this.workers.get(reply.workerId);
        if (slot === undefined || slot.generation !== reply.generation || slot.process.assignedGoalId !== goalId) {
            this.options.deliveries.recordActionPermissionFailure(reply.requestDeliveryId, "worker-unavailable");
            throw new Error("Permission target Worker is unavailable");
        }
        const goal = await this.options.goals.restore(goalId);
        if (goal === undefined || goal.state.run.id !== reply.runId || goal.state.run.status !== "waiting"
            || (goal.state.commitRevision ?? 0) !== reply.commitRevision
            || goal.state.run.pendingAction?.status !== "awaiting_approval"
            || goal.state.run.pendingAction.action.actionId !== reply.actionId
            || projectInteractionView(goal)?.interactionId !== reply.interactionId) {
            throw new Error("Permission reply is stale for the current Goal wait");
        }
        const competingReply = this.options.deliveries.listGoalDeliveries(goalId).find((candidate) => {
            if (candidate.delivery.deliveryId === delivery.deliveryId || candidate.delivery.trigger.purpose !== "permission"
                || (candidate.delivery.trigger.source !== "user" && candidate.delivery.trigger.source !== "supervisor")) return false;
            return decodeTriggerActionPermissionReply(candidate.delivery.trigger.payload).requestDeliveryId === reply.requestDeliveryId;
        });
        if (competingReply !== undefined) throw new Error("Another permission reply already owns this request");

        const receipt = receiveAuthorizedTrigger(this.options.deliveries, delivery, principal);
        if (receipt.status === "settled") {
            if (receipt.result.kind !== "handled") throw new Error("Permission reply has a conflicting receipt");
            return { kind: "settled", progress: await this.currentProgress(goalId) };
        }
        let progress: WorkerProgress;
        try {
            progress = await slot.process.respondActionPermission(receipt.delivery);
        } catch (error) {
            this.options.deliveries.recordActionPermissionFailure(reply.requestDeliveryId, "worker-unavailable");
            throw error;
        }
        const updated = await this.options.goals.restore(goalId);
        if (updated === undefined || updated.state.run.id !== reply.runId) {
            this.options.deliveries.recordActionPermissionFailure(reply.requestDeliveryId, "reply-rejected");
            throw new Error("Worker reply did not produce a current Goal snapshot");
        }
        const stillWaitingForAction = updated.state.run.status === "waiting"
            && updated.state.run.pendingAction?.status === "awaiting_approval"
            && updated.state.run.pendingAction.action.actionId === reply.actionId;
        if (stillWaitingForAction) {
            this.options.deliveries.recordActionPermissionFailure(reply.requestDeliveryId, "reply-rejected");
            throw new Error("Worker Runtime did not accept the permission reply");
        }
        if (progress.kind === "rejected" && (updated.state.run.status === "completed"
            || updated.state.run.status === "failed" || updated.state.run.status === "cancelled")) {
            progress = { kind: "terminal", status: updated.state.run.status };
        }
        return { kind: "routed", slot, goalId, progress };
    }

    private async currentProgress(goalId: string): Promise<WorkerProgress> {
        const goal = await this.options.goals.restore(goalId);
        if (goal === undefined) throw new Error("Permission target Goal is missing");
        if (goal.state.run.status === "completed" || goal.state.run.status === "failed" || goal.state.run.status === "cancelled") {
            return { kind: "terminal", status: goal.state.run.status };
        }
        if (goal.state.run.status === "waiting") {
            const view = projectInteractionView(goal);
            const waitingFor = view?.kind === "action_approval" ? "action_approval"
                : view?.kind === "action_recovery" ? "action_recovery"
                    : view?.kind === "task_approval" ? "task_approval"
                        : view?.kind === "question" ? "ask_user" : "blocked";
            return { kind: "waiting", waitingFor };
        }
        return { kind: "rejected", code: "GOAL_NOT_SETTLED", message: "Goal has not reached a stable wait or terminal state" };
    }

    private async currentTerminalProgress(goalId: string): Promise<WorkerProgress> {
        const goal = await this.options.goals.restore(goalId);
        if (goal === undefined) throw new Error("Cancellation target snapshot is missing");
        const status = goal.state.run.status;
        if (status === "completed" || status === "failed" || status === "cancelled") return { kind: "terminal", status };
        return { kind: "rejected", code: "GOAL_NOT_TERMINAL", message: "Goal has not reached a terminal state" };
    }
}

function interactionLocalId(goal: Goal): string | undefined {
    const action = goal.state.run.pendingAction;
    if (action !== undefined) return action.action.actionId;
    return goal.state.run.pendingInteraction?.requestId;
}
