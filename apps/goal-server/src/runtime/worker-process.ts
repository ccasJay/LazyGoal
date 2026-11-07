import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { connect, Socket } from "node:net";
import { fileURLToPath } from "node:url";
import type { GoalProgressResult } from "../../../../packages/runtime/src/goal-coordinator";
import { isRecord } from "../../../../packages/contracts/src/index";
import { goalSnapshotCodec, type GoalSnapshotV1 } from "../../../../packages/storage/src/index";
import { JsonFileGoalStore } from "../../../../packages/storage/src/goal-store";
import { TriggerDeliveryStore } from "../../../../packages/storage/src/trigger-delivery-store";
import { SupervisorOwnership } from "../../../../packages/storage/src/supervisor-ownership";
import type { TriggerDeliveryFile } from "../../../../packages/storage/src/trigger-delivery-file";
import type { WorkerOfflineProgress, WorkerProcessRegistration } from "./worker-process-registry";

type WorkerMessage =
    | { readonly kind: "ready"; readonly workerId: string; readonly generation: string; readonly pid: number; readonly proof?: string; readonly assignedGoalId?: string; readonly operationActive?: boolean }
    | { readonly kind: "probe-result"; readonly requestId: string; readonly pid: number; readonly workerId: string; readonly generation: string }
    | { readonly kind: "store-read"; readonly requestId: string; readonly workerId: string; readonly generation: string; readonly goalId: string }
    | { readonly kind: "store-save"; readonly requestId: string; readonly workerId: string; readonly generation: string; readonly goalId: string; readonly snapshot: unknown }
    | { readonly kind: "advance-result"; readonly requestId: string; readonly goalId: string; readonly result: WorkerProgress }
    | { readonly kind: "cancel-result"; readonly requestId: string; readonly goalId: string; readonly result: WorkerProgress }
    | { readonly kind: "permission-result"; readonly requestId: string; readonly goalId: string; readonly result: WorkerProgress }
    | { readonly kind: "interaction-result"; readonly requestId: string; readonly goalId: string; readonly result: WorkerProgress }
    | { readonly kind: "replay-complete"; readonly requestId: string }
    | { readonly kind: "closed" }
    | { readonly kind: "detached"; readonly requestId: string };

type WorkerCommand =
    | { readonly kind: "probe"; readonly requestId: string }
    | { readonly kind: "advance"; readonly requestId: string; readonly goalId: string; readonly runId: string }
    | { readonly kind: "cancel"; readonly requestId: string; readonly interruptId: string; readonly goalId: string; readonly runId: string }
    | { readonly kind: "permission-response"; readonly requestId: string; readonly delivery: TriggerDeliveryFile }
    | { readonly kind: "interaction-response"; readonly requestId: string; readonly delivery: TriggerDeliveryFile }
    | { readonly kind: "replay-offline"; readonly requestId: string }
    | { readonly kind: "worker-ack"; readonly requestId: string }
    | { readonly kind: "detach"; readonly requestId: string }
    | { readonly kind: "store-reply"; readonly requestId: string; readonly ok: true; readonly snapshot?: GoalSnapshotV1 }
    | { readonly kind: "store-reply"; readonly requestId: string; readonly ok: false }
    | { readonly kind: "close" };

/** Worker 推进 Goal 后向 Supervisor 报告的最小进度。 */
export type WorkerProgress =
    | { readonly kind: "waiting"; readonly waitingFor: Extract<GoalProgressResult, { ok: true; kind: "waiting" }>['waitingFor'] }
    | { readonly kind: "terminal"; readonly status: "completed" | "failed" | "cancelled" }
    | { readonly kind: "rejected"; readonly code: string; readonly message: string };

/**
 * Supervisor 直接子进程收到的 Worker 退出观察。
 *
 * @remarks
 * `normal` 仅表示本 Supervisor 请求的优雅关闭获得零退出码；异常退出保留 OS
 * 提供的 code 与 signal，不从 PID 或经过时间推断原因。
 *
 * @example
 * ```ts
 * const exit: WorkerProcessExit = { pid: 42, code: null, signal: "SIGKILL", normal: false };
 * ```
 */
export interface WorkerProcessExit {
    readonly pid: number;
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
    readonly normal: boolean;
}

/**
 * 独立 Worker 子进程的创建配置。
 *
 * @remarks
 * 子进程使用相同 workspace 和数据目录装配执行器；Goal 快照读写通过 Supervisor
 * 通道完成，并按已持久化的 Worker ID、generation 与 Goal 绑定授权。注册信息为
 * Worker 提供断开后的本地认证通道和耐久消息日志，PID 不作为重新接管凭证。
 *
 * @example
 * ```ts
 * const worker = await SupervisorWorkerProcess.start(options);
 * ```
 */
export interface SupervisorWorkerProcessOptions {
    readonly workerId: string;
    readonly generation: string;
    readonly cwd: string;
    /** 项目权限账本身份；与 Worker 的执行目录分离。 */
    readonly workspaceIdentityRoot: string;
    readonly dataDirectory: string;
    readonly registration: WorkerProcessRegistration;
    /** Worker 构造同一模型供应商与 Home 配置所需的宿主环境快照。 */
    readonly env?: NodeJS.ProcessEnv;
    readonly owner: SupervisorOwnership;
    readonly deliveries: TriggerDeliveryStore;
    readonly goals: JsonFileGoalStore;
}

/**
 * 一个可复用的独立 Worker OS 进程。
 *
 * @remarks
 * 同一代 Worker 同时只接受一个 Goal。`waiting` 保留现有 Goal 绑定；Worker 返回
 * 终态后仍由 Supervisor 校验快照、持久化进度与队列状态，再显式释放进程绑定。
 * Worker 无权直接写 Goal 文件，所有快照经 Supervisor 校验、核对队列绑定并提交。
 * 异常退出不释放队列绑定或自动重派。
 *
 * @example
 * ```ts
 * const worker = await SupervisorWorkerProcess.start(options);
 * const result = await worker.advance(goalId);
 * ```
 */
export class SupervisorWorkerProcess {
    private readonly child: ChildProcess | undefined;
    private readonly socket: Socket | undefined;
    private workerPid: number | undefined;
    private readonly ready: Promise<void>;
    private readonly pending = new Map<string, { readonly resolve: (message: WorkerMessage) => void; readonly reject: (error: Error) => void }>();
    private readonly offlineProgress: WorkerOfflineProgress[] = [];
    private readonly progressReceipts = new Map<string, string[]>();
    private offlineProgressHandler: ((event: WorkerOfflineProgress) => void) | undefined;
    private busy = false;
    private cancelling = false;
    private remoteActive: boolean | undefined;
    private exitRecord: WorkerProcessExit | undefined;
    private exitHandler: ((exit: WorkerProcessExit) => void) | undefined;
    private closeRequested = false;
    private advanceCommandSent: Promise<void> | undefined;
    private goalId: string | undefined;
    private closed = false;
    private readonly cancelRequests = new Map<string, Promise<WorkerProgress>>();

    private constructor(private readonly options: SupervisorWorkerProcessOptions, transport: ChildProcess | Socket, private readonly reconnecting: boolean, private readonly attachNonce = "") {
        this.child = transport instanceof Socket ? undefined : transport;
        this.socket = transport instanceof Socket ? transport : undefined;
        this.workerPid = this.child?.pid ?? undefined;
        this.ready = new Promise<void>((resolve, reject) => {
            let socketBuffer = "";
            const onMessage = (value: unknown): void => {
                const message = parseWorkerMessage(value);
                if (message?.kind === "ready") {
                    const validIdentity = message.workerId === options.workerId && message.generation === options.generation
                        && (this.child === undefined || message.pid === this.child.pid);
                    const validProof = !reconnecting || (typeof message.proof === "string"
                        && hasValidProof(message.proof, attachProof(options.registration.secret, attachNonce, "worker")));
                    if (!validIdentity || !validProof) {
                        reject(new Error("Worker identity handshake mismatch"));
                    } else {
                        this.workerPid = message.pid;
                        this.goalId = message.assignedGoalId;
                        this.remoteActive = message.operationActive;
                        resolve();
                    }
                    return;
                }
                if (message === undefined) return;
                if (message.kind === "store-read" || message.kind === "store-save") {
                    void this.handleStoreRequest(message);
                    return;
                }
                if (message.kind === "closed") return;
                if (message.kind === "advance-result" || message.kind === "permission-result" || message.kind === "cancel-result" || message.kind === "interaction-result") {
                    const progress = { requestId: message.requestId, goalId: message.goalId, result: message.result, kind: message.kind } satisfies WorkerOfflineProgress;
                    if (this.pending.has(message.requestId)) {
                        const key = progressKey(progress.goalId, progress.result);
                        const receipts = this.progressReceipts.get(key) ?? [];
                        receipts.push(progress.requestId);
                        this.progressReceipts.set(key, receipts);
                    } else {
                        const key = progressKey(progress.goalId, progress.result);
                        const receipts = this.progressReceipts.get(key) ?? [];
                        receipts.push(progress.requestId);
                        this.progressReceipts.set(key, receipts);
                        if (this.offlineProgressHandler === undefined) this.offlineProgress.push(progress);
                        else this.offlineProgressHandler(progress);
                    }
                }
                if (!("requestId" in message)) return;
                this.pending.get(message.requestId)?.resolve(message);
                this.pending.delete(message.requestId);
            };
            const failPending = (error: Error): void => {
                for (const request of this.pending.values()) request.reject(error);
                this.pending.clear();
            };
            if (this.child !== undefined) {
                this.child.on("message", onMessage);
                this.child.on("error", (error) => { reject(error); failPending(error); });
                this.child.once("exit", (code, signal) => {
                    const error = new Error(`Worker process exited (${signal ?? code})`);
                    reject(error);
                    failPending(error);
                    const exit: WorkerProcessExit = { pid: this.child!.pid!, code, signal,
                        normal: this.closeRequested && code === 0 && signal === null };
                    this.exitRecord = exit;
                    this.exitHandler?.(exit);
                });
            } else if (this.socket !== undefined) {
                this.socket.on("data", (chunk: Buffer) => {
                    socketBuffer += chunk.toString("utf8");
                    for (;;) {
                        const newline = socketBuffer.indexOf("\n");
                        if (newline < 0) break;
                        const line = socketBuffer.slice(0, newline);
                        socketBuffer = socketBuffer.slice(newline + 1);
                        try { onMessage(JSON.parse(line) as unknown); } catch { /* Invalid wire frames are ignored. */ }
                    }
                });
                this.socket.on("error", (error) => { reject(error); failPending(error); });
                this.socket.on("close", () => {
                    const error = new Error("Worker control channel closed");
                    reject(error);
                    failPending(error);
                });
            }
        });
        void this.ready.catch(() => undefined);
    }

    /**
     * 启动并认证 Worker 子进程。
     *
     * @param options - 工作区路径与该 Worker 当前的持久化绑定。
     * @returns 已完成身份握手的 Worker。
     * @throws 启动失败、退出或身份不匹配时拒绝。
     * @example
     * ```ts
     * const worker = await SupervisorWorkerProcess.start(options);
     * ```
     */
    static async start(options: SupervisorWorkerProcessOptions): Promise<SupervisorWorkerProcess> {
        if (!options.workerId.trim() || !options.generation.trim()) throw new Error("Worker identity is required");
        const entry = fileURLToPath(new URL("../worker-process-entry.ts", import.meta.url));
        const child = fork(entry, [], {
            cwd: options.cwd,
            env: { ...(options.env ?? process.env), LAZYGOAL_WORKER_ID: options.workerId, LAZYGOAL_WORKER_GENERATION: options.generation,
                LAZYGOAL_WORKER_DATA_DIRECTORY: options.dataDirectory,
                LAZYGOAL_WORKSPACE_IDENTITY_ROOT: options.workspaceIdentityRoot,
                LAZYGOAL_WORKER_SOCKET_PATH: options.registration.socketPath,
                LAZYGOAL_WORKER_JOURNAL_PATH: options.registration.journalPath,
                LAZYGOAL_WORKER_SECRET: options.registration.secret },
            execArgv: process.execArgv,
            stdio: ["ignore", "inherit", "inherit", "ipc"],
        });
        const worker = new SupervisorWorkerProcess(options, child, false);
        try {
            await worker.ready;
        } catch (error) {
            child.kill("SIGKILL");
            throw error;
        }
        return worker;
    }

    /**
     * 通过持久注册的本机认证通道重新接管仍存活的 Worker。
     *
     * @param options - 注册信息及当前 Supervisor 的 Goal 与 Trigger 存储。
     * @returns 已通过随机挑战认证的 Worker；其当前 Goal 绑定从进程握手恢复。
     * @throws 通道不可用、认证失败或 Worker 身份与注册记录不符时抛出。
     * @example
     * ```ts
     * const worker = await SupervisorWorkerProcess.attach(options);
     * ```
     */
    static async attach(options: SupervisorWorkerProcessOptions): Promise<SupervisorWorkerProcess> {
        const nonce = randomUUID();
        const socket = connect(options.registration.socketPath);
        const worker = new SupervisorWorkerProcess(options, socket, true, nonce);
        try {
            await new Promise<void>((resolve, reject) => {
                const onError = (error: Error): void => { socket.off("connect", onConnect); reject(error); };
                const onConnect = (): void => { socket.off("error", onError); resolve(); };
                socket.once("error", onError);
                socket.once("connect", onConnect);
            });
            await worker.writeSocket({ kind: "attach", workerId: options.workerId, generation: options.generation, nonce,
                proof: attachProof(options.registration.secret, nonce, "supervisor") });
            await worker.ready;
            return worker;
        } catch (error) {
            socket.destroy();
            throw error;
        }
    }

    /** @returns Worker 当前是否保留一个未结算 Goal。 */
    get assignedGoalId(): string | undefined { return this.goalId; }

    /**
     * 注册此 Supervisor 直接观察 Worker 退出的监听器。
     *
     * @remarks 若退出已在注册前发生，监听器会立即收到保存的 OS 退出记录。
     * @param handler - 接收退出码、信号及是否为已确认优雅关闭的回调。
     * @example
     * ```ts
     * worker.onExit((exit) => recordExit(exit));
     * ```
     */
    onExit(handler: (exit: WorkerProcessExit) => void): void {
        this.exitHandler = handler;
        if (this.exitRecord !== undefined) handler(this.exitRecord);
    }

    /** @returns Worker 握手报告其仍在执行操作；状态不明时返回 `undefined`。 */
    get remoteOperationActive(): boolean | undefined { return this.remoteActive; }

    /** @returns 重新接管后收到但尚未持久处理的离线进度消息。 */
    drainOfflineProgress(): readonly WorkerOfflineProgress[] { return this.offlineProgress.splice(0); }

    /** 接收此进程之后重放或完成的 Worker 进度通知。 */
    setOfflineProgressHandler(handler: (event: WorkerOfflineProgress) => void): void {
        this.offlineProgressHandler = handler;
        for (const event of this.offlineProgress.splice(0)) handler(event);
    }

    /** 在进度和 Goal 队列均已持久化后确认对应 Worker 离线消息。 */
    acknowledgeProgress(goalId: string, progress: WorkerProgress): void {
        const key = progressKey(goalId, progress);
        const requestId = this.progressReceipts.get(key)?.shift();
        if (requestId === undefined) return;
        if (this.progressReceipts.get(key)?.length === 0) this.progressReceipts.delete(key);
        void this.writeCommand({ kind: "worker-ack", requestId }).catch(() => undefined);
    }

    /** 请求 Worker 重放断连期间持久保存的请求与进度。 */
    async replayOfflineMessages(): Promise<void> {
        const response = await this.request({ kind: "replay-offline", requestId: randomUUID() });
        if (response.kind !== "replay-complete") throw new Error("Worker did not finish offline message replay");
    }

    /**
     * 关闭 Supervisor 通道并保持 Worker 进程与当前 Goal 绑定继续运行。
     *
     * @throws 已关闭的 Worker 或断开的进程通道无法完成确认时抛出。
     * @example
     * ```ts
     * await worker.detach();
     * ```
     */
    async detach(): Promise<void> {
        if (this.closed) return;
        if (!this.isConnected()) throw new Error("Worker process is disconnected");
        const response = await this.request({ kind: "detach", requestId: randomUUID() });
        if (response.kind !== "detached") throw new Error("Worker did not confirm detachment");
        this.closed = true;
        if (this.child?.connected === true) this.child.disconnect();
        this.socket?.end();
    }

    /**
     * 查询 OS 进程身份，核实 Worker 仍是当前登记的子进程。
     *
     * @returns 与握手身份一致的 OS 进程标识。
     * @throws Worker 已关闭或进程不再响应时抛出。
     * @example
     * ```ts
     * const pid = await worker.probe();
     * ```
     */
    async probe(): Promise<number> {
        const message = await this.request({ kind: "probe", requestId: randomUUID() });
        if (message.kind !== "probe-result" || message.workerId !== this.options.workerId
            || message.generation !== this.options.generation || message.pid !== this.workerPid) {
            throw new Error("Worker process identity changed");
        }
        return message.pid;
    }

    /**
     * 要求 Worker 用其 Runtime 推进已由 Supervisor 绑定的 Goal 一次。
     *
     * @param goalId - 该 Worker 当前唯一获派的 Goal。
     * @returns 等待、终态或显式拒绝结果；终态仍须由 Supervisor 持久化后释放绑定。
     * @throws 进程身份、队列绑定或 IPC 错误时拒绝；失败时保留原绑定。
     * @example
     * ```ts
     * const progress = await worker.advance("goal-1");
     * ```
     */
    async advance(goalId: string): Promise<WorkerProgress> {
        if (this.closed || this.busy || this.cancelling) throw new Error("Worker is unavailable");
        const claim = this.options.deliveries.workerClaim(this.options.workerId, this.options.generation);
        if (claim !== goalId) throw new Error("Worker Goal does not match its durable assignment");
        if (this.goalId !== undefined && this.goalId !== goalId) throw new Error("Worker still owns another Goal");
        this.goalId = goalId;
        this.busy = true;
        let markCommandSent!: () => void;
        const commandSent = new Promise<void>((resolve) => { markCommandSent = resolve; });
        this.advanceCommandSent = commandSent;
        try {
            const goal = await this.options.goals.restore(goalId);
            if (goal === undefined) throw new Error("Assigned Goal snapshot is unavailable");
            const request = this.request({ kind: "advance", requestId: randomUUID(), goalId, runId: goal.state.run.id });
            markCommandSent();
            const response = await request;
            if (response.kind !== "advance-result") throw new Error("Unexpected Worker response");
            return response.result;
        } finally {
            markCommandSent();
            if (this.advanceCommandSent === commandSent) this.advanceCommandSent = undefined;
            this.busy = false;
        }
    }

    /**
     * 请求运行时中断当前 Goal，并等待 Worker 确认快照已经进入取消终态。
     *
     * @remarks
     * 中断受理本身不会释放进程绑定。Worker 等待当前推进完全结算后返回快照对应
     * 的状态；Supervisor 仍须持久化报告和队列终态，再调用 `confirmTerminal`。
     * 断连或拒绝会保留绑定。
     *
     * @param goalId - 此 Worker 当前持有的 Goal。
     * @param requestId - 稳定中断身份；同一请求重试共享进行中的 IPC 操作。
     * @returns Worker 观察到的最终等待、取消或拒绝结果。
     * @throws Goal 快照读取、进程断连或 IPC 协议错误时抛出。
     * @example
     * ```ts
     * const progress = await worker.cancel("goal-1", "cancel-trigger-1");
     * ```
     */
    cancel(goalId: string, requestId: string): Promise<WorkerProgress> {
        if (!requestId.trim()) return Promise.reject(new Error("Cancellation request identity is required"));
        const key = JSON.stringify([goalId, requestId]);
        const existing = this.cancelRequests.get(key);
        if (existing !== undefined) return existing;
        if (this.closed || this.goalId !== goalId) return Promise.reject(new Error("Worker does not own the cancellation target"));
        if (this.cancelling) return Promise.reject(new Error("Worker already has a cancellation request"));
        this.cancelling = true;
        const operation = (async (): Promise<WorkerProgress> => {
            await this.advanceCommandSent;
            const goal = await this.options.goals.restore(goalId);
            if (goal === undefined) throw new Error("Cancellation target snapshot is unavailable");
            const response = await this.request({ kind: "cancel", requestId: randomUUID(), interruptId: requestId, goalId, runId: goal.state.run.id });
            if (response.kind !== "cancel-result") throw new Error("Unexpected Worker cancellation response");
            return response.result;
        })().finally(() => { this.cancelling = false; });
        this.cancelRequests.set(key, operation);
        void operation.finally(() => { if (this.cancelRequests.get(key) === operation) this.cancelRequests.delete(key); }).catch(() => undefined);
        return operation;
    }

    /**
     * 将已认证并持久化的权限回复交给当前 Worker Runtime。
     *
     * @remarks Worker 再按当前 Goal、Run、Action 与 Snapshot 修订核对回复；只有 Runtime
     * 结算结果返回后，Supervisor 才能结算对应权限 Trigger。
     * @param delivery - 已通过 Supervisor 认证的权限回复投递。
     * @returns Runtime 恢复后的等待、终态或稳定拒绝。
     * @throws Worker 已断开、目标不匹配或 IPC 失败时拒绝，持久投递保持待处理。
     * @example
     * ```ts
     * const progress = await worker.respondActionPermission(replyDelivery);
     * ```
     */
    async respondActionPermission(delivery: TriggerDeliveryFile): Promise<WorkerProgress> {
        const goalId = delivery.goalId;
        if (goalId === undefined || this.closed || this.busy || this.cancelling || this.goalId !== goalId) {
            throw new Error("Worker does not own the permission target");
        }
        this.busy = true;
        let markCommandSent!: () => void;
        const commandSent = new Promise<void>((resolve) => { markCommandSent = resolve; });
        this.advanceCommandSent = commandSent;
        try {
            const response = this.request({ kind: "permission-response", requestId: randomUUID(), delivery });
            markCommandSent();
            const result = await response;
            if (result.kind !== "permission-result") throw new Error("Unexpected Worker permission response");
            return result.result;
        } finally {
            markCommandSent();
            if (this.advanceCommandSent === commandSent) this.advanceCommandSent = undefined;
            this.busy = false;
        }
    }

    /**
     * 将已认证并持久化的结构化交互 Trigger 交给当前 Worker Runtime。
     *
     * @remarks Worker 按当前 Goal、Run、等待身份及提交修订重新核验回应；只有恢复进度
     * 经 Supervisor 持久化后，交互投递才会结算。
     * @param delivery - 已通过 Supervisor 认证的 Goal 交互投递。
     * @returns Runtime 恢复后的等待、终态或稳定拒绝。
     * @throws Worker 已断开、目标不匹配或 IPC 失败时拒绝，持久投递保持待处理。
     * @example
     * ```ts
     * const progress = await worker.respondInteraction(delivery);
     * ```
     */
    async respondInteraction(delivery: TriggerDeliveryFile): Promise<WorkerProgress> {
        const goalId = delivery.goalId;
        if (goalId === undefined || this.closed || this.busy || this.cancelling || this.goalId !== goalId) {
            throw new Error("Worker does not own the interaction target");
        }
        this.busy = true;
        let markCommandSent!: () => void;
        const commandSent = new Promise<void>((resolve) => { markCommandSent = resolve; });
        this.advanceCommandSent = commandSent;
        try {
            const response = await this.request({ kind: "interaction-response", requestId: randomUUID(), delivery });
            if (response.kind !== "interaction-result") throw new Error("Unexpected Worker interaction response");
            return response.result;
        } finally {
            markCommandSent();
            if (this.advanceCommandSent === commandSent) this.advanceCommandSent = undefined;
            this.busy = false;
        }
    }

    /**
     * 在 Supervisor 已保存对应终态报告与队列状态后释放本地 Worker 绑定。
     *
     * @param goalId - 已由该 Worker 终止并由 Supervisor 持久结算的 Goal。
     * @throws Goal 仍在推进或身份不匹配时抛出；重复确认已释放的绑定是幂等的。
     * @example
     * ```ts
     * worker.confirmTerminal("goal-1");
     * ```
     */
    confirmTerminal(goalId: string): void {
        if (this.goalId === undefined) return;
        if (this.goalId !== goalId || this.busy) throw new Error("Worker terminal report is not settled");
        this.goalId = undefined;
    }

    /**
     * 请求 Worker 优雅关闭；仍有等待 Goal 时先拒绝关闭。
     *
     * @throws Worker 正在执行或持有等待中的 Goal、关闭超时或子进程失败时抛出。
     * @example
     * ```ts
     * await worker.close();
     * ```
     */
    async close(): Promise<void> {
        if (this.closed) return;
        if (this.busy || this.cancelling || this.goalId !== undefined) throw new Error("Worker still owns an unsettled Goal");
        this.closed = true;
        this.closeRequested = true;
        const closed = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Worker close was not confirmed")), 5000);
            if (this.child !== undefined) {
                this.child.once("exit", () => { clearTimeout(timeout); resolve(); });
                this.child.once("error", (error) => { clearTimeout(timeout); reject(error); });
            } else if (this.socket !== undefined) {
                this.socket.once("close", () => { clearTimeout(timeout); resolve(); });
                this.socket.once("error", (error) => { clearTimeout(timeout); reject(error); });
            }
        });
        await this.writeCommand({ kind: "close" });
        await closed;
    }

    private request(command: Extract<WorkerCommand, { readonly requestId: string }>): Promise<WorkerMessage> {
        if (this.closed || !this.isConnected()) return Promise.reject(new Error("Worker process is disconnected"));
        return new Promise((resolve, reject) => {
            this.pending.set(command.requestId, { resolve, reject });
            void this.writeCommand(command).catch((error: Error) => {
                if (this.pending.delete(command.requestId)) reject(error);
            });
        });
    }

    private async handleStoreRequest(message: Extract<WorkerMessage, { readonly kind: "store-read" | "store-save" }>): Promise<void> {
        const sendReply = (reply: WorkerCommand): void => { void this.writeCommand(reply).catch(() => undefined); };
        if (message.workerId !== this.options.workerId || message.generation !== this.options.generation
            || message.goalId !== this.goalId
            || this.options.deliveries.workerClaim(this.options.workerId, this.options.generation) !== message.goalId) {
            sendReply({ kind: "store-reply", requestId: message.requestId, ok: false });
            return;
        }
        try {
            const snapshot = message.kind === "store-read"
                ? await this.options.goals.restore(message.goalId).then((goal) => goal === undefined ? undefined : goalSnapshotCodec.encode(goal))
                : await this.saveWorkerSnapshot(message.goalId, message.snapshot);
            sendReply({ kind: "store-reply", requestId: message.requestId, ok: true, ...(snapshot === undefined ? {} : { snapshot }) });
        } catch {
            sendReply({ kind: "store-reply", requestId: message.requestId, ok: false });
        }
    }

    private isConnected(): boolean {
        return this.child?.connected ?? (this.socket !== undefined && !this.socket.destroyed);
    }

    private writeCommand(command: WorkerCommand): Promise<void> {
        if (this.child !== undefined) {
            if (!this.child.connected) return Promise.reject(new Error("Worker process is disconnected"));
            return new Promise((resolve, reject) => this.child!.send(command, (error) => error === null ? resolve() : reject(error)));
        }
        return this.writeSocket(command);
    }

    private writeSocket(message: unknown): Promise<void> {
        if (this.socket === undefined || this.socket.destroyed) return Promise.reject(new Error("Worker control channel is disconnected"));
        return new Promise((resolve, reject) => this.socket!.write(`${JSON.stringify(message)}\n`, (error) => error == null ? resolve() : reject(error)));
    }

    private async saveWorkerSnapshot(goalId: string, input: unknown): Promise<GoalSnapshotV1> {
        return this.options.owner.runExclusive(JSON.stringify(["worker-save", this.options.workerId, goalId]), async () => {
            if (this.options.deliveries.workerClaim(this.options.workerId, this.options.generation) !== goalId) {
                throw new Error("Worker assignment changed");
            }
            const goal = goalSnapshotCodec.decode(input);
            if (goal.id !== goalId) throw new Error("Worker snapshot Goal identity mismatch");
            await this.options.goals.save(goal);
            return goalSnapshotCodec.encode(goal);
        });
    }
}

function parseWorkerMessage(value: unknown): WorkerMessage | undefined {
    if (!isRecord(value) || typeof value.kind !== "string") return undefined;
    if (value.kind === "ready" && typeof value.workerId === "string" && typeof value.generation === "string" && typeof value.pid === "number"
        && (value.proof === undefined || typeof value.proof === "string")
        && (value.assignedGoalId === undefined || typeof value.assignedGoalId === "string")
        && (value.operationActive === undefined || typeof value.operationActive === "boolean")) return value as unknown as WorkerMessage;
    if (value.kind === "probe-result" && typeof value.requestId === "string" && typeof value.pid === "number" && typeof value.workerId === "string" && typeof value.generation === "string") return value as unknown as WorkerMessage;
    if ((value.kind === "store-read" || value.kind === "store-save") && typeof value.requestId === "string" && typeof value.workerId === "string" && typeof value.generation === "string" && typeof value.goalId === "string"
        && (value.kind !== "store-save" || "snapshot" in value)) return value as unknown as WorkerMessage;
    if ((value.kind === "advance-result" || value.kind === "cancel-result" || value.kind === "permission-result" || value.kind === "interaction-result")
        && typeof value.requestId === "string" && typeof value.goalId === "string" && isWorkerProgress(value.result)) return value as unknown as WorkerMessage;
    if (value.kind === "replay-complete" && typeof value.requestId === "string") return value as unknown as WorkerMessage;
    if (value.kind === "detached" && typeof value.requestId === "string") return value as unknown as WorkerMessage;
    if (value.kind === "closed") return value as unknown as WorkerMessage;
    if (value.kind === "detached") return value as unknown as WorkerMessage;
    return undefined;
}

function attachProof(secret: string, nonce: string, role: "supervisor" | "worker"): string {
    return createHmac("sha256", secret).update(`${role}:${nonce}`).digest("hex");
}

function hasValidProof(actual: string, expected: string): boolean {
    if (!/^[a-f0-9]{64}$/.test(actual)) return false;
    return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function progressKey(goalId: string, result: WorkerProgress): string {
    return JSON.stringify([goalId, result]);
}

function isWorkerProgress(value: unknown): value is WorkerProgress {
    if (!isRecord(value) || typeof value.kind !== "string") return false;
    if (value.kind === "waiting") return ["ask_user", "task_approval", "action_approval", "action_recovery", "blocked"].includes(String(value.waitingFor));
    if (value.kind === "terminal") return ["completed", "failed", "cancelled"].includes(String(value.status));
    return value.kind === "rejected" && typeof value.code === "string" && typeof value.message === "string";
}
