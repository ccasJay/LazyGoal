import { createHash, randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { GoalProgressResult } from "../../../../packages/runtime/src/goal-coordinator";
import { isRecord } from "../../../../packages/contracts/src/index";
import { goalSnapshotCodec, type GoalSnapshotV1 } from "../../../../packages/storage/src/index";
import { JsonFileGoalStore } from "../../../../packages/storage/src/goal-store";
import { TriggerDeliveryStore } from "../../../../packages/storage/src/trigger-delivery-store";
import { SupervisorOwnership } from "../../../../packages/storage/src/supervisor-ownership";

type WorkerMessage =
    | { readonly kind: "ready"; readonly workerId: string; readonly generation: string; readonly pid: number }
    | { readonly kind: "probe-result"; readonly requestId: string; readonly pid: number; readonly workerId: string; readonly generation: string }
    | { readonly kind: "store-read"; readonly requestId: string; readonly workerId: string; readonly generation: string; readonly goalId: string }
    | { readonly kind: "store-save"; readonly requestId: string; readonly workerId: string; readonly generation: string; readonly goalId: string; readonly snapshot: unknown }
    | { readonly kind: "advance-result"; readonly requestId: string; readonly result: WorkerProgress }
    | { readonly kind: "cancel-result"; readonly requestId: string; readonly result: WorkerProgress }
    | { readonly kind: "closed" };

type WorkerCommand =
    | { readonly kind: "probe"; readonly requestId: string }
    | { readonly kind: "advance"; readonly requestId: string; readonly goalId: string; readonly runId: string }
    | { readonly kind: "cancel"; readonly requestId: string; readonly interruptId: string; readonly goalId: string; readonly runId: string }
    | { readonly kind: "store-reply"; readonly requestId: string; readonly ok: true; readonly snapshot?: GoalSnapshotV1 }
    | { readonly kind: "store-reply"; readonly requestId: string; readonly ok: false }
    | { readonly kind: "close" };

/** Worker 推进 Goal 后向 Supervisor 报告的最小进度。 */
export type WorkerProgress =
    | { readonly kind: "waiting"; readonly waitingFor: Extract<GoalProgressResult, { ok: true; kind: "waiting" }>['waitingFor'] }
    | { readonly kind: "terminal"; readonly status: "completed" | "failed" | "cancelled" }
    | { readonly kind: "rejected"; readonly code: string; readonly message: string };

/**
 * 独立 Worker 子进程的创建配置。
 *
 * @remarks
 * 子进程使用相同 workspace 和数据目录装配执行器；Goal 快照读写通过 Supervisor
 * IPC Port 完成，并按已持久化的 Worker ID、generation 与 Goal 绑定授权。
 *
 * @example
 * ```ts
 * const worker = await SupervisorWorkerProcess.start({
 *   workerId: "worker-1", generation: "generation-1", cwd, dataDirectory, owner, deliveries, goals,
 * });
 * ```
 */
export interface SupervisorWorkerProcessOptions {
    readonly workerId: string;
    readonly generation: string;
    readonly cwd: string;
    /** 项目权限账本身份；与 Worker 的执行目录分离。 */
    readonly workspaceIdentityRoot: string;
    readonly dataDirectory: string;
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
    private readonly child: ChildProcess;
    private readonly ready: Promise<void>;
    private readonly pending = new Map<string, { readonly resolve: (message: WorkerMessage) => void; readonly reject: (error: Error) => void }>();
    private busy = false;
    private cancelling = false;
    private advanceCommandSent: Promise<void> | undefined;
    private goalId: string | undefined;
    private closed = false;
    private readonly cancelRequests = new Map<string, Promise<WorkerProgress>>();

    private constructor(private readonly options: SupervisorWorkerProcessOptions, child: ChildProcess) {
        this.child = child;
        this.ready = new Promise<void>((resolve, reject) => {
            const onMessage = (value: unknown): void => {
                const message = parseWorkerMessage(value);
                if (message?.kind === "ready") {
                    if (message.workerId !== options.workerId || message.generation !== options.generation || message.pid !== child.pid) {
                        reject(new Error("Worker identity handshake mismatch"));
                    } else {
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
                this.pending.get(message.requestId)?.resolve(message);
                this.pending.delete(message.requestId);
            };
            const failPending = (error: Error): void => {
                for (const request of this.pending.values()) request.reject(error);
                this.pending.clear();
            };
            child.on("message", onMessage);
            child.on("error", (error) => { reject(error); failPending(error); });
            child.once("exit", (code, signal) => {
                const error = new Error(`Worker process exited (${signal ?? code})`);
                reject(error);
                failPending(error);
            });
        });
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
        const entry = fileURLToPath(new URL("./worker-process-entry.ts", import.meta.url));
        const child = fork(entry, [], {
            cwd: options.cwd,
            env: { ...(options.env ?? process.env), LAZYGOAL_WORKER_ID: options.workerId, LAZYGOAL_WORKER_GENERATION: options.generation,
                LAZYGOAL_WORKER_DATA_DIRECTORY: options.dataDirectory,
                LAZYGOAL_WORKSPACE_IDENTITY_ROOT: options.workspaceIdentityRoot },
            execArgv: process.execArgv,
            stdio: ["ignore", "inherit", "inherit", "ipc"],
        });
        const worker = new SupervisorWorkerProcess(options, child);
        try {
            await worker.ready;
        } catch (error) {
            child.kill("SIGKILL");
            throw error;
        }
        return worker;
    }

    /** @returns Worker 当前是否保留一个未结算 Goal。 */
    get assignedGoalId(): string | undefined { return this.goalId; }

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
            || message.generation !== this.options.generation || message.pid !== this.child.pid) {
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
        this.child.send({ kind: "close" } satisfies WorkerCommand);
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Worker close was not confirmed")), 5000);
            this.child.once("exit", () => { clearTimeout(timeout); resolve(); });
            this.child.once("error", (error) => { clearTimeout(timeout); reject(error); });
        });
    }

    private request(command: Extract<WorkerCommand, { readonly requestId: string }>): Promise<WorkerMessage> {
        if (this.closed || !this.child.connected) return Promise.reject(new Error("Worker process is disconnected"));
        return new Promise((resolve, reject) => {
            this.pending.set(command.requestId, { resolve, reject });
            this.child.send(command, (error) => {
                if (error !== null && this.pending.delete(command.requestId)) {
                    reject(error);
                }
            });
        });
    }

    private async handleStoreRequest(message: Extract<WorkerMessage, { readonly kind: "store-read" | "store-save" }>): Promise<void> {
        const sendReply = (reply: WorkerCommand): void => { if (this.child.connected) this.child.send(reply); };
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
    if (value.kind === "ready" && typeof value.workerId === "string" && typeof value.generation === "string" && typeof value.pid === "number") return value as unknown as WorkerMessage;
    if (value.kind === "probe-result" && typeof value.requestId === "string" && typeof value.pid === "number" && typeof value.workerId === "string" && typeof value.generation === "string") return value as unknown as WorkerMessage;
    if ((value.kind === "store-read" || value.kind === "store-save") && typeof value.requestId === "string" && typeof value.workerId === "string" && typeof value.generation === "string" && typeof value.goalId === "string"
        && (value.kind !== "store-save" || "snapshot" in value)) return value as unknown as WorkerMessage;
    if ((value.kind === "advance-result" || value.kind === "cancel-result") && typeof value.requestId === "string" && isWorkerProgress(value.result)) return value as unknown as WorkerMessage;
    if (value.kind === "closed") return value as unknown as WorkerMessage;
    return undefined;
}

function isWorkerProgress(value: unknown): value is WorkerProgress {
    if (!isRecord(value) || typeof value.kind !== "string") return false;
    if (value.kind === "waiting") return ["ask_user", "task_approval", "action_approval", "action_recovery", "blocked"].includes(String(value.waitingFor));
    if (value.kind === "terminal") return ["completed", "failed", "cancelled"].includes(String(value.status));
    return value.kind === "rejected" && typeof value.code === "string" && typeof value.message === "string";
}
