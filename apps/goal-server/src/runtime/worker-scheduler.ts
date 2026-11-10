import { createHash, randomUUID } from "node:crypto";
import { canonicalJson } from "../../../../packages/contracts/src/index";
import type { LLMAdapter } from "../../../../packages/llm-core/src/index";
import type { Goal, GoalTriggerContext } from "../../../../packages/runtime/src/domain";
import type { Trigger } from "../../../../packages/runtime/src/trigger";
import { projectInteractionView } from "../../../../packages/runtime/src/interaction-view";
import { JsonFileGoalStore } from "../../../../packages/storage/src/goal-store";
import { TriggerStore } from "../../../../packages/storage/src/trigger-store";
import { SupervisorOwnership } from "../../../../packages/storage/src/supervisor-ownership";
import { receiveAuthorizedTrigger, type TriggerIngressPrincipal } from "../../../../packages/storage/src/trigger-ingress";
import {
    decodeTriggerActionPermissionReply,
    decodeTriggerActionPermissionRequest,
} from "../../../../packages/storage/src/trigger-permission-codec";
import type { TriggerActionPermissionFailureReason } from "../../../../packages/storage/src/trigger-store";
import type { TriggerActionPermissionReply, TriggerActionPermissionRequest } from "../../../../packages/storage/src/trigger-permission";
import { decodeWorkerInteractionPayload } from "./worker-interaction";
import { decideWorkerActionPermission } from "./worker-permission";
import { SupervisorWorkerProcess, type WorkerGoalCreationRequest, type WorkerProcessExit, type WorkerProgress } from "./worker-process";
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
 * `pending` 反映权限请求 Trigger 尚未与已应用回复一并标记路由；失败原因只对仍需人工处理的请求存在。此视图不
 * 暴露可执行授权，决定必须经 `handleActionPermissionReply` 核验并由原 Worker Runtime 应用。
 *
 * @example
 * ```ts
 * const status: WorkerActionPermissionStatus = { requestId: "request-1", request, pending: true };
 * ```
 */
export interface WorkerActionPermissionStatus {
    readonly requestId: string;
    readonly request: TriggerActionPermissionRequest;
    readonly pending: boolean;
    readonly failure?: TriggerActionPermissionFailureReason;
}

/**
 * Supervisor 接收一条 Trigger 权限回复后的结果。
 *
 * @remarks 已持久路由的回复返回 `settled`；新回复在 Worker 应用并保存后返回 `handled`。
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
 * @remarks 新回应在 Worker Runtime 应用并保存后返回 `handled`；Trigger 路由状态与 Goal 队列状态分别持久化。
 * @example
 * ```ts
 * const result: WorkerInteractionResult = { kind: "handled", progress: { kind: "waiting", waitingFor: "blocked" } };
 * ```
 */
export type WorkerInteractionResult = { readonly kind: "handled"; readonly progress: WorkerProgress };

/**
 * 显式恢复已确认退出 Worker 所持 Goal 的处理结果。
 *
 * @example
 * ```ts
 * const result: WorkerRecoveryResult = { kind: "resumed", goalId: "goal-1" };
 * ```
 */
export type WorkerRecoveryResult = { readonly kind: "resumed"; readonly goalId: string };

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
 * const scheduler = new WorkerScheduler({ owner, triggers, goals, cwd, dataDirectory, permissionAdapter });
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
        readonly triggers: TriggerStore;
        readonly goals: JsonFileGoalStore;
        readonly cwd: string;
        readonly dataDirectory: string;
        readonly env?: NodeJS.ProcessEnv;
        /** Supervisor 直接调用的默认权限判断模型。 */
        readonly permissionAdapter: LLMAdapter;
    }) {}

    /**
     * 在独立 Worker Runtime 中构造尚未持久化的 Goal 候选。
     *
     * @remarks Worker 从自身 Profile、协议与默认配置构造 Goal；Supervisor 仍负责补齐来源授权、保存 Snapshot、写入队列并发布创建响应。
     * @param request - Goal 身份、原始意图与首个 Run 配置。
     * @param workspace - 已由 Supervisor 决定并准备的项目与执行工作区。
     * @returns Worker 构造的 Goal 候选；本方法不保存 Goal 或改变 Trigger 队列。
     * @throws Worker 启动、配置解析、Goal 构造或进程通信失败时拒绝。
     * @example
     * ```ts
     * const goal = await scheduler.createGoal({ goalId: "goal-1", intent: "检查测试", mode: "normal" }, workspace);
     * ```
     */
    async createGoal(request: WorkerGoalCreationRequest, workspace: GoalTriggerContext["authorization"]["workspace"]): Promise<Goal> {
        if (!workspace.projectRoot.trim() || !workspace.executionRoot.trim()) throw new Error("Worker Goal creation requires an authorized workspace");
        const workerId = `worker-creation-${randomUUID()}`;
        const generation = randomUUID();
        const registration = await createWorkerProcessRegistration(this.options.dataDirectory, workerId, generation, workspace);
        let process: SupervisorWorkerProcess | undefined;
        try {
            process = await SupervisorWorkerProcess.start(this.workerOptions(registration));
            return await process.createGoal(request);
        } finally {
            if (process !== undefined) await process.close().catch(() => undefined);
            await removeWorkerProcessRegistration(this.options.dataDirectory, workerId);
        }
    }

    /**
     * 派发当前所有可处理的队列项，不等待 Worker 完成。
     *
     * @remarks 先恢复存活 Worker，再从持久化记录尝试路由取消、交互、权限决定和 checkpoint resume Trigger；不重新接收这些事件。目标当前不可用或身份/状态不匹配时保留未路由记录，后续 `pump()` 可继续尝试。未定义的协作消息不在此处理。
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
                await this.resumeUnroutedControlTriggers();
                await this.dispatchQueuedGoals();
                await this.resumeUnroutedControlTriggers();
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
     * Trigger 先持久保存；Worker 只有在 Runtime 中断结果及 Supervisor 对应 Goal 进度
     * 已持久化后才标记该 Trigger 已路由。队列的等待或终态状态仍由独立的 Goal 队列记录。
     * 断连、过期代次或未确认停止会保留原队列绑定，不终止进程，也不重新派发副作用未知的工作。未路由 Trigger 留在 Store 供 `pump()` 使用原事件恢复；调用方不得重交相同 ID。
     *
     * @param trigger - 关联既有 Goal 的取消 Trigger。
     * @param principal - 由宿主认证的来源与 Goal 授权。
     * @returns Worker 已报告的终态、等待状态或拒绝原因。
     * @throws 载荷、授权或持久存储错误时抛出；未路由的 Trigger 可由所属处理器重试。
     * @example
     * ```ts
     * const progress = await scheduler.handleCancelTrigger(trigger, authenticatedExternalActor);
     * ```
     */
    async handleCancelTrigger(trigger: Trigger, principal: TriggerIngressPrincipal): Promise<WorkerProgress> {
        if (trigger.type !== "instruction" || trigger.payload.action !== "cancel"
            || trigger.target !== "worker" || !("goalId" in trigger)) {
            throw new Error("Cancellation requires a Goal-bound cancel Trigger");
        }
        const goalId = trigger.goalId;
        receiveAuthorizedTrigger(this.options.triggers, trigger, principal);

        await this.pump();
        return this.routeCancelTrigger(trigger);
    }

    private async routeCancelTrigger(trigger: Trigger): Promise<WorkerProgress> {
        if (trigger.type !== "instruction" || trigger.payload.action !== "cancel"
            || trigger.target !== "worker" || !("goalId" in trigger)) {
            throw new Error("Cancellation requires a Goal-bound cancel Trigger");
        }
        const goalId = trigger.goalId;
        const routeStatus = this.options.triggers.routeStatus(trigger.id);
        if (routeStatus === "routed") return this.currentProgress(goalId);
        if (routeStatus !== "unrouted") throw new Error("Cancellation Trigger is not stored");

        const queue = this.options.triggers.queueRecord(goalId);
        if (queue === undefined) throw new Error("Cancellation target is not in the Goal queue");
        if (queue.status === "terminal") {
            const progress = await this.currentTerminalProgress(goalId);
            this.options.triggers.markRouted(trigger.id);
            return progress;
        }
        const slot = queue.workerId === undefined || queue.generation === undefined
            ? undefined
            : this.workers.get(queue.workerId);
        if (slot === undefined || slot.generation !== queue.generation || slot.process.assignedGoalId !== goalId) {
            throw new Error("Cancellation target has no confirmed active Worker");
        }
        const progress = await slot.process.cancel(goalId, trigger.id);
        if (progress.kind === "rejected") return progress;
        await this.reportProgress(slot, goalId, progress);
        this.options.triggers.markRouted(trigger.id);
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
        return this.options.triggers.listGoalTriggers(goalId).flatMap((trigger) => {
            if (trigger.type !== "permission" || trigger.payload.action !== "requested"
                || trigger.source.role !== "worker") return [];
            const request = decodeTriggerActionPermissionRequest(trigger);
            const routeStatus = this.options.triggers.routeStatus(trigger.id);
            if (routeStatus === undefined) throw new Error("Permission request Trigger route state is unavailable");
            const failure = this.options.triggers.actionPermissionFailure(trigger.id);
            return [{
                requestId: trigger.id,
                request,
                pending: routeStatus === "unrouted",
                ...(failure === undefined ? {} : { failure }),
            }];
        });
    }

    /**
     * 接收并路由已认证的 Action 权限回复。
     *
     * @remarks 回复通过 `replyTo` 查找权限请求，并按其 Goal 与当前 Worker 等待路由；
     * Worker Runtime 再次核验当前 Action 等待。只有保存恢复进度后才会原子标记请求与回复已路由。
     * @param trigger - `permission.decided` Trigger。
     * @param principal - 已认证且可访问目标 Goal 的用户或 Supervisor 身份。
     * @returns 已应用回复后的 Worker 进度，或已路由的回复结果。
     * @throws 来源、请求、Goal、Action、Run 或 generation 不匹配及 Worker/存储失败时抛出；已存储但未路由的回复由 `pump()` 使用原事件继续处理，不应由来源重复提交。
     * @example
     * ```ts
     * const result = await scheduler.handleActionPermissionReply(trigger, authenticatedExternalActor);
     * ```
     */
    async handleActionPermissionReply(trigger: Trigger, principal: TriggerIngressPrincipal): Promise<WorkerPermissionReplyResult> {
        return this.routeActionPermissionReply(trigger, principal, false);
    }

    private async routeActionPermissionReply(
        trigger: Trigger,
        principal: TriggerIngressPrincipal,
        alreadyReceived: boolean,
    ): Promise<WorkerPermissionReplyResult> {
        if (trigger.type !== "permission" || trigger.payload.action !== "decided"
            || trigger.target !== "worker" || !("goalId" in trigger) || !("replyTo" in trigger)
            || (principal.role !== "user" && principal.role !== "external" && principal.role !== "supervisor")
            || !triggerActorMatchesPrincipal(trigger.source, principal.role)) {
            throw new Error("Action permission reply requires an authorized Goal-bound external or Supervisor Trigger");
        }
        const requestTrigger = this.options.triggers.read(trigger.replyTo);
        if (requestTrigger === undefined || !("goalId" in requestTrigger) || requestTrigger.goalId !== trigger.goalId) {
            throw new Error("Permission reply does not reference a stored request Trigger");
        }
        const reply = decodeTriggerActionPermissionReply(trigger, requestTrigger);
        return this.options.owner.runExclusive(JSON.stringify(["permission-reply", reply.requestId]), async () => {
            const route = await this.dispatchPermissionReply(trigger, principal, reply, alreadyReceived);
            if (route.kind === "settled") return route;
            await this.recordProgress(route.slot, route.goalId, route.progress, {
                requestTriggerId: reply.requestId,
                replyTriggerId: trigger.id,
            });
            return { kind: "handled", progress: route.progress };
        });
    }

    /**
     * 接收并路由已认证的 Goal 结构化交互回应。
     *
     * @remarks 回复以 Goal 身份和 `replyTo` 匹配当前等待，并由当前持有该 Goal 的 Worker
     * Runtime 再次验证领域决定。只有恢复进度保存后才标记 Trigger 已路由；Action 权限请求与其回复由存储原子标记。
     * @param trigger - `interaction.answered` Trigger。
     * @param principal - 已认证且可访问目标 Goal 的用户或 Supervisor 身份。
     * @returns Worker 已应用回应后的等待、终态或拒绝进度。
     * @throws 来源、Goal、等待、Run、修订或 Worker 代次不匹配及 IPC/存储故障时抛出；未路由事件由 `pump()` 从存储恢复，不应由来源重复提交。
     * @example
     * ```ts
     * const result = await scheduler.handleInteractionTrigger(trigger, authenticatedExternalActor);
     * ```
     */
    async handleInteractionTrigger(trigger: Trigger, principal: TriggerIngressPrincipal): Promise<WorkerInteractionResult> {
        return this.routeInteractionTrigger(trigger, principal, false);
    }

    private async routeInteractionTrigger(
        trigger: Trigger,
        principal: TriggerIngressPrincipal,
        alreadyReceived: boolean,
    ): Promise<WorkerInteractionResult> {
        if (trigger.type !== "interaction" || trigger.payload.action !== "answered"
            || trigger.target !== "worker" || !("goalId" in trigger) || (principal.role !== "user" && principal.role !== "external" && principal.role !== "supervisor")
            || !triggerActorMatchesPrincipal(trigger.source, principal.role)) {
            throw new Error("Goal interaction requires an authorized external or Supervisor Trigger");
        }
        const goalId = trigger.goalId;
        return this.options.owner.runExclusive(JSON.stringify(["interaction-trigger", goalId, trigger.id]), async () => {
            if (alreadyReceived) {
                assertStoredUnroutedTrigger(this.options.triggers, trigger);
            } else {
                receiveAuthorizedTrigger(this.options.triggers, trigger, principal);
            }
            const payload = decodeWorkerInteractionPayload(trigger);
            const queue = this.options.triggers.queueRecord(goalId);
            const slot = queue?.workerId === undefined || queue.generation === undefined
                ? undefined
                : this.workers.get(queue.workerId);
            if (queue?.status !== "waiting" || slot === undefined || slot.generation !== queue.generation
                || slot.process.assignedGoalId !== goalId) {
                throw new Error("Interaction target has no matching waiting Worker");
            }
            const goal = await this.options.goals.restore(goalId);
            const interaction = goal === undefined ? undefined : projectInteractionView(goal);
            if (goal === undefined || interaction === undefined || goal.state.run.status !== "waiting") {
                throw new Error("Interaction Trigger does not match the current Goal wait");
            }
            const actionId = goal.state.run.pendingAction?.action.actionId;
            const permissionRequest = actionId === undefined ? undefined
                : this.actionPermissionStatuses(goalId).find((item) => item.pending && item.request.actionId === actionId);
            const expectedReplyTo = permissionRequest?.request.requestId ?? goal.definition.triggerContext?.triggerId;
            if (expectedReplyTo === undefined || payload.replyTo !== expectedReplyTo
                || (payload.interactionRequestId !== undefined && interactionLocalId(goal) !== payload.interactionRequestId)) {
                throw new Error("Interaction Trigger does not match the current Goal wait");
            }
            const progress = await slot.process.respondInteraction(trigger);
            await this.recordProgress(slot, goalId, progress);
            if (progress.kind !== "rejected") {
                if (permissionRequest === undefined) this.options.triggers.markRouted(trigger.id);
                else this.options.triggers.markActionPermissionReplyRouted(permissionRequest.request.requestId, trigger.id);
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
     * @param trigger - `instruction.resume` Trigger；`replyTo` 必须指向当前 Goal 的退出事件。
     * @param principal - 已认证且有权访问目标 Goal 的用户或 Supervisor。
     * @returns 首次恢复为 `resumed`。
     * @throws Worker 退出证据、Goal 授权、回复关联或明确确认不匹配时抛出；跨提交边界的恢复中断由后续 `pump()` 从原 Trigger 继续。
     * @example
     * ```ts
     * await scheduler.handleWorkerRecoveryTrigger(trigger, userPrincipal);
     * ```
     */
    async handleWorkerRecoveryTrigger(trigger: Trigger, principal: TriggerIngressPrincipal): Promise<WorkerRecoveryResult> {
        return this.routeWorkerRecoveryTrigger(trigger, principal, false);
    }

    private async routeWorkerRecoveryTrigger(
        trigger: Trigger,
        principal: TriggerIngressPrincipal,
        alreadyReceived: boolean,
    ): Promise<WorkerRecoveryResult> {
        if (trigger.type !== "instruction" || trigger.payload.action !== "resume"
            || trigger.target !== "supervisor" || !("goalId" in trigger) || !("replyTo" in trigger)
            || (principal.role !== "user" && principal.role !== "external" && principal.role !== "supervisor")
            || !triggerActorMatchesPrincipal(trigger.source, principal.role)) {
            throw new Error("Worker recovery requires an authorized Goal-bound resume Trigger");
        }
        const payload = trigger.payload;
        const goalId = trigger.goalId;
        const replyTo = trigger.replyTo;
        return this.options.owner.runExclusive(JSON.stringify(["worker-recovery-trigger", goalId, trigger.id]), async () => {
            if (alreadyReceived) {
                assertStoredUnroutedTrigger(this.options.triggers, trigger);
            } else {
                receiveAuthorizedTrigger(this.options.triggers, trigger, principal);
            }
            const recovery = this.options.triggers.workerRecovery(goalId);
            const exit = recovery === undefined ? undefined : this.options.triggers.read(recovery.lifecycleTriggerId);
            if (recovery === undefined || (recovery.status !== "pending" && recovery.status !== "resumed")
                || exit === undefined || exit.id !== replyTo) {
                throw new Error("Goal has no matching confirmed Worker exit to recover");
            }
            const queue = this.options.triggers.queueRecord(goalId);
            if (recovery.status === "resumed" && queue?.status !== "queued") {
                throw new Error("Recovered Goal is not in its queued state");
            }
            const slot = recovery.status === "pending" ? this.workers.get(recovery.workerId) : undefined;
            if (slot !== undefined && slot.generation === recovery.generation) {
                let responsive = true;
                try { await slot.process.probe(); } catch { responsive = false; }
                if (responsive) throw new Error("Worker is still responding and cannot be recovered as exited");
            }
            const goal = await this.options.goals.restore(goalId);
            if (goal === undefined || goal.state.run.id !== payload.runId
                || ["completed", "failed", "cancelled"].includes(goal.state.run.status)) {
                throw new Error("Terminal, missing, or stale Goal cannot be resumed");
            }
            if (goal.state.run.status === "running" && payload.acknowledgeUnknownEffects !== true) {
                throw new Error("Resuming a running Goal requires explicit acknowledgement of possible external effects");
            }
            await this.options.triggers.requeueRecoveredGoal(this.options.owner, goalId, recovery.workerId, recovery.generation);
            this.workers.delete(recovery.workerId);
            await removeWorkerRegistration(this.options.dataDirectory, recovery.workerId);
            this.options.triggers.markRouted(trigger.id);
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
            const nextGoalId = this.options.triggers.nextQueuedGoal();
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

            const claimed = await this.options.triggers.claimNextGoal(this.options.owner, slot.workerId, slot.generation);
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
            }).then(async (lifecycleTriggerId) => {
                if (exit.normal || goalId === undefined) return;
                const queue = this.options.triggers.queueRecord(goalId);
                if (queue?.workerId !== slot.workerId || queue.generation !== slot.generation
                    || (queue.status !== "claimed" && queue.status !== "waiting")) return;
                await this.options.triggers.recordWorkerRecovery(this.options.owner, {
                    goalId, workerId: slot.workerId, generation: slot.generation, lifecycleTriggerId,
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
            const digest = createHash("sha256").update(canonicalJson({ workerId, generation, event })).digest("hex");
            const triggerId = `worker-lifecycle-${digest}`;
            const sentAt = triggerSentAt(this.options.triggers, triggerId);
            const trigger: Trigger = event.type === "worker_exited"
                ? {
                    id: triggerId,
                    name: "Worker exited",
                    type: "lifecycle",
                    source: { role: "supervisor" },
                    target: "supervisor",
                    payload: { action: "exited", outcome: event.normal ? "normal" : "unexpected" },
                    sentAt,
                }
                : {
                    id: triggerId,
                    name: "Worker started",
                    type: "lifecycle",
                    source: { role: "supervisor" },
                    target: "supervisor",
                    payload: { action: "started" },
                    sentAt,
                };
            const existing = this.options.triggers.read(triggerId);
            if (existing === undefined) {
                receiveAuthorizedTrigger(this.options.triggers, trigger, { role: "supervisor", mayCreateGoal: false, goalIds: [] });
            } else if (canonicalJson(existing) !== canonicalJson(trigger)) {
                throw new Error("Worker lifecycle Trigger identity conflict");
            }
            this.options.triggers.markRouted(triggerId);
            return triggerId;
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
            triggers: this.options.triggers,
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
            try { claimedGoalId = this.options.triggers.workerClaim(registration.workerId, registration.generation); } catch { /* Keep the assignment unresolved. */ }
            if (assignedGoalId !== claimedGoalId || (assignedGoalId !== undefined && this.options.triggers.queueRecord(assignedGoalId)?.status === "terminal")) {
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

    private async resumeUnroutedControlTriggers(): Promise<void> {
        for (const trigger of this.options.triggers.unroutedTriggers()) {
            const principal = principalForStoredTrigger(trigger);
            try {
                if (trigger.type === "instruction" && trigger.payload.action === "cancel") {
                    const queue = "goalId" in trigger ? this.options.triggers.queueRecord(trigger.goalId) : undefined;
                    if (queue?.status === "terminal"
                        || (queue !== undefined && queue.workerId !== undefined && queue.generation !== undefined
                            && this.workers.get(queue.workerId)?.generation === queue.generation)) {
                        await this.routeCancelTrigger(trigger);
                    }
                    continue;
                }
                if (trigger.type === "instruction" && trigger.payload.action === "resume") {
                    const recovery = "goalId" in trigger ? this.options.triggers.workerRecovery(trigger.goalId) : undefined;
                    if (recovery !== undefined && (recovery.status === "pending" || recovery.status === "resumed")) {
                        await this.routeWorkerRecoveryTrigger(trigger, principal, true);
                    }
                    continue;
                }
                if (trigger.type === "interaction" && trigger.payload.action === "answered") {
                    const queue = "goalId" in trigger ? this.options.triggers.queueRecord(trigger.goalId) : undefined;
                    if (queue?.status === "waiting" && queue.workerId !== undefined && queue.generation !== undefined
                        && this.workers.get(queue.workerId)?.generation === queue.generation) {
                        await this.routeInteractionTrigger(trigger, principal, true);
                    }
                    continue;
                }
                if (trigger.type === "permission" && trigger.payload.action === "decided" && "replyTo" in trigger) {
                    const request = this.options.triggers.read(trigger.replyTo);
                    const queue = "goalId" in trigger ? this.options.triggers.queueRecord(trigger.goalId) : undefined;
                    if (request?.type === "permission" && request.payload.action === "requested"
                        && this.options.triggers.routeStatus(request.id) === "unrouted"
                        && queue?.status === "waiting" && queue.workerId !== undefined && queue.generation !== undefined
                        && this.workers.get(queue.workerId)?.generation === queue.generation) {
                        await this.routeActionPermissionReply(trigger, principal, true);
                    }
                }
            } catch {
                // A control event remains unrouted until its current Goal and Worker state permit application.
            }
        }
    }

    private async recoverProgress(slot: WorkerSlot, event: WorkerOfflineProgress): Promise<void> {
        if (this.options.triggers.workerClaim(slot.workerId, slot.generation) !== event.goalId) return;
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
        consumedExchange?: { readonly requestTriggerId: string; readonly replyTriggerId: string },
    ): Promise<void> {
        let progress = initialProgress;
        let exchange = consumedExchange;
        for (;;) {
            await this.persistProgress(slot, goalId, progress);
            if (exchange !== undefined) {
                this.options.triggers.markActionPermissionReplyRouted(exchange.requestTriggerId, exchange.replyTriggerId);
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
        const queue = this.options.triggers.queueRecord(goalId);
        if (queue === undefined || queue.workerId !== slot.workerId || queue.generation !== slot.generation) {
            throw new Error("Worker progress does not match its durable Goal binding");
        }
        const goal = await this.options.goals.restore(goalId);
        if (goal === undefined) throw new Error("Worker reported progress for a missing Goal");
        if (progress.kind === "waiting" && goal.state.run.status !== "waiting") throw new Error("Worker waiting report does not match the Goal snapshot");
        if (progress.kind === "terminal" && goal.state.run.status !== progress.status) throw new Error("Worker terminal report does not match the Goal snapshot");

        if (progress.kind === "waiting") {
            const replyTo = goal.definition.triggerContext?.triggerId;
            if (replyTo === undefined) throw new Error("Worker progress has no source Trigger association");
            const report = { workerId: slot.workerId, generation: slot.generation, goalId, runId: goal.state.run.id, waitingFor: progress.waitingFor };
            const digest = createHash("sha256").update(canonicalJson(report)).digest("hex");
            const triggerId = `worker-progress-${digest}`;
            const trigger: Trigger = {
                id: triggerId,
                name: "Goal is waiting",
                type: "response",
                source: { role: "worker", workerId: slot.workerId, generation: slot.generation },
                target: "supervisor",
                goalId,
                replyTo,
                payload: { action: "progress", runId: goal.state.run.id, status: "waiting", waitingFor: progress.waitingFor },
                sentAt: triggerSentAt(this.options.triggers, triggerId),
            };
            const existing = this.options.triggers.read(triggerId);
            if (existing === undefined) {
                receiveAuthorizedTrigger(this.options.triggers, trigger, {
                    role: "worker", workerId: slot.workerId, generation: slot.generation, goalId, mayCreateGoal: false,
                });
            } else if (canonicalJson(existing) !== canonicalJson(trigger)) {
                throw new Error("Worker progress Trigger identity conflict");
            }
            await this.options.triggers.markWorkerGoalStatus(this.options.owner, slot.workerId, slot.generation, goalId, "waiting");
            this.options.triggers.markRouted(triggerId);
            return;
        }
        if (progress.kind === "terminal") {
            await this.options.triggers.markWorkerGoalStatus(this.options.owner, slot.workerId, slot.generation, goalId, "terminal");
            slot.process.confirmTerminal(goalId);
            void this.pump();
        }
    }

    private async autoHandleActionPermission(
        slot: WorkerSlot,
        goalId: string,
    ): Promise<{ readonly progress: WorkerProgress; readonly exchange: { readonly requestTriggerId: string; readonly replyTriggerId: string } } | undefined> {
        const goal = await this.options.goals.restore(goalId);
        if (goal === undefined) throw new Error("Action permission target Goal snapshot is missing");
        const requestTrigger = this.ensureActionPermissionRequest(slot, goal);
        if (this.options.triggers.routeStatus(requestTrigger.id) !== "unrouted") return undefined;
        const request = decodeTriggerActionPermissionRequest(requestTrigger);

        const existingReply = this.findPendingPermissionReply(goalId, requestTrigger.id);
        if (existingReply !== undefined) {
            const reply = decodeTriggerActionPermissionReply(existingReply, requestTrigger);
            const replyPrincipal: TriggerIngressPrincipal = existingReply.source.role === "external"
                ? { role: "external", externalId: existingReply.source.externalId, mayCreateGoal: false, goalIds: [goalId] }
                : { role: "supervisor", mayCreateGoal: false, goalIds: [goalId] };
            const route = await this.dispatchPermissionReply(existingReply, replyPrincipal, reply, true);
            return route.kind === "settled" ? undefined : {
                progress: route.progress,
                exchange: { requestTriggerId: request.requestId, replyTriggerId: existingReply.id },
            };
        }

        const advice = await decideWorkerActionPermission(this.options.permissionAdapter, goal);
        if (advice.kind === "pending") {
            this.options.triggers.recordActionPermissionFailure(requestTrigger.id, advice.reason);
            return undefined;
        }
        const decision = advice.decision;
        const replyIdentity = { requestId: request.requestId, decision };
        const digest = createHash("sha256").update(canonicalJson(replyIdentity)).digest("hex");
        const replyTriggerId = `worker-permission-reply-${digest}`;
        const base = {
            id: replyTriggerId,
            name: decision.kind === "approve" ? "Approve Action" : "Reject Action",
            type: "permission" as const,
            source: { role: "supervisor" as const },
            target: "worker" as const,
            goalId,
            replyTo: requestTrigger.id,
            sentAt: triggerSentAt(this.options.triggers, replyTriggerId),
        };
        const replyTrigger: Trigger = decision.kind === "approve"
            ? { ...base, payload: { action: "decided", decision: "approve", scope: "action" } }
            : { ...base, payload: { action: "decided", decision: "reject", scope: "action", reason: decision.reason } };
        const reply = decodeTriggerActionPermissionReply(replyTrigger, requestTrigger);
        const principal: TriggerIngressPrincipal = { role: "supervisor", mayCreateGoal: false, goalIds: [goalId] };
        const route = await this.dispatchPermissionReply(replyTrigger, principal, reply);
        return route.kind === "settled" ? undefined : {
            progress: route.progress,
            exchange: { requestTriggerId: request.requestId, replyTriggerId: replyTrigger.id },
        };
    }

    private ensureActionPermissionRequest(slot: WorkerSlot, goal: Goal): Trigger {
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
        const trigger: Trigger = {
            id: requestId,
            name: "Action approval requested",
            type: "permission",
            source: { role: "worker", workerId: slot.workerId, generation: slot.generation },
            target: "supervisor",
            goalId: goal.id,
            payload: {
                action: "requested",
                runId: view.runId,
                actionId: view.actionId,
                interactionId: view.interactionId,
                commitRevision,
            },
            sentAt: triggerSentAt(this.options.triggers, requestId),
        };
        const existing = this.options.triggers.read(requestId);
        if (existing !== undefined) {
            if (canonicalJson(existing) !== canonicalJson(trigger)) throw new Error("Action permission request Trigger identity conflict");
            return existing;
        }
        return receiveAuthorizedTrigger(this.options.triggers, trigger, {
            role: "worker",
            workerId: slot.workerId,
            generation: slot.generation,
            goalId: goal.id,
            mayCreateGoal: false,
        });
    }

    private findPendingPermissionReply(goalId: string, requestTriggerId: string): Trigger | undefined {
        const request = this.options.triggers.read(requestTriggerId);
        if (request === undefined) return undefined;
        return this.options.triggers.listGoalTriggers(goalId).find((trigger) => {
            return this.options.triggers.routeStatus(trigger.id) === "unrouted"
                && trigger.type === "permission" && trigger.payload.action === "decided"
                && "replyTo" in trigger && trigger.replyTo === request.id;
        });
    }

    private async dispatchPermissionReply(
        trigger: Trigger,
        principal: TriggerIngressPrincipal,
        reply: TriggerActionPermissionReply,
        alreadyReceived = false,
    ): Promise<
        | { readonly kind: "settled"; readonly progress: WorkerProgress }
        | { readonly kind: "routed"; readonly slot: WorkerSlot; readonly goalId: string; readonly progress: WorkerProgress }
    > {
        const goalId = "goalId" in trigger ? trigger.goalId : undefined;
        if (goalId === undefined || (principal.role !== "user" && principal.role !== "external" && principal.role !== "supervisor")
            || !principal.goalIds.includes(goalId) || !triggerActorMatchesPrincipal(trigger.source, principal.role)) {
            throw new Error("Permission reply source or Goal authorization is invalid");
        }
        const requestTrigger = this.options.triggers.read(reply.requestId);
        if (requestTrigger === undefined || !("goalId" in requestTrigger) || requestTrigger.goalId !== goalId
            || requestTrigger.type !== "permission" || requestTrigger.payload.action !== "requested"
            || requestTrigger.source.role !== "worker") {
            throw new Error("Permission reply does not reference a stored Worker request");
        }
        const request = decodeTriggerActionPermissionRequest(requestTrigger);
        const verifiedReply = decodeTriggerActionPermissionReply(trigger, requestTrigger);
        if (canonicalJson(verifiedReply) !== canonicalJson(reply)
            || reply.requestId !== request.requestId || reply.runId !== request.runId || reply.actionId !== request.actionId
            || reply.interactionId !== request.interactionId || reply.commitRevision !== request.commitRevision) {
            throw new Error("Permission reply identity does not match its Worker request");
        }

        const requestRouteStatus = this.options.triggers.routeStatus(requestTrigger.id);
        if (requestRouteStatus !== "unrouted") throw new Error("Permission request has already been routed");
        if (alreadyReceived) {
            const existing = this.options.triggers.read(trigger.id);
            if (existing === undefined || canonicalJson(existing) !== canonicalJson(trigger)) {
                throw new Error("Stored permission reply Trigger identity changed");
            }
        } else {
            receiveAuthorizedTrigger(this.options.triggers, trigger, principal);
        }
        const routeStatus = this.options.triggers.routeStatus(trigger.id);
        if (routeStatus === "routed") return { kind: "settled", progress: await this.currentProgress(goalId) };
        if (routeStatus !== "unrouted") throw new Error("Permission reply Trigger was not persisted");

        const queue = this.options.triggers.queueRecord(goalId);
        if (queue?.workerId !== reply.workerId || queue.generation !== reply.generation || queue.status !== "waiting") {
            throw new Error("Permission reply targets an old or inactive Worker generation");
        }
        const slot = this.workers.get(reply.workerId);
        if (slot === undefined || slot.generation !== reply.generation || slot.process.assignedGoalId !== goalId) {
            this.options.triggers.recordActionPermissionFailure(reply.requestId, "worker-unavailable");
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
        const competingReply = this.options.triggers.listGoalTriggers(goalId).find((candidate) => {
            return candidate.id !== trigger.id && this.options.triggers.routeStatus(candidate.id) === "unrouted"
                && candidate.type === "permission" && candidate.payload.action === "decided"
                && "replyTo" in candidate && candidate.replyTo === requestTrigger.id;
        });
        if (competingReply !== undefined) throw new Error("Another permission reply already owns this request");

        let progress: WorkerProgress;
        try {
            progress = await slot.process.respondActionPermission(trigger);
        } catch (error) {
            this.options.triggers.recordActionPermissionFailure(reply.requestId, "worker-unavailable");
            throw error;
        }
        const updated = await this.options.goals.restore(goalId);
        if (updated === undefined || updated.state.run.id !== reply.runId) {
            this.options.triggers.recordActionPermissionFailure(reply.requestId, "reply-rejected");
            throw new Error("Worker reply did not produce a current Goal snapshot");
        }
        const stillWaitingForAction = updated.state.run.status === "waiting"
            && updated.state.run.pendingAction?.status === "awaiting_approval"
            && updated.state.run.pendingAction.action.actionId === reply.actionId;
        if (stillWaitingForAction) {
            this.options.triggers.recordActionPermissionFailure(reply.requestId, "reply-rejected");
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

function triggerSentAt(triggers: TriggerStore, triggerId: string): string {
    return triggers.read(triggerId)?.sentAt ?? new Date().toISOString();
}

function principalForStoredTrigger(trigger: Trigger): TriggerIngressPrincipal {
    const goalIds = "goalId" in trigger ? [trigger.goalId] : [];
    switch (trigger.source.role) {
        case "external":
            return { role: "external", externalId: trigger.source.externalId, mayCreateGoal: false, goalIds };
        case "worker":
            return {
                role: "worker",
                workerId: trigger.source.workerId,
                generation: trigger.source.generation,
                ...("goalId" in trigger ? { goalId: trigger.goalId } : {}),
                mayCreateGoal: false,
            };
        case "supervisor":
            return { role: "supervisor", mayCreateGoal: false, goalIds };
    }
}

function assertStoredUnroutedTrigger(triggers: TriggerStore, trigger: Trigger): void {
    const stored = triggers.read(trigger.id);
    if (stored === undefined || triggers.routeStatus(trigger.id) !== "unrouted"
        || canonicalJson(stored) !== canonicalJson(trigger)) {
        throw new Error("Stored Trigger is missing, routed, or has changed");
    }
}

function triggerActorMatchesPrincipal(source: Trigger["source"], role: TriggerIngressPrincipal["role"]): boolean {
    return source.role === (role === "user" ? "external" : role);
}
