import { randomUUID } from "node:crypto";
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
    | { readonly kind: "closed" };

type WorkerCommand =
    | { readonly kind: "probe"; readonly requestId: string }
    | { readonly kind: "advance"; readonly requestId: string; readonly goalId: string }
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
 * 同一代 Worker 同时只接受一个 Goal。`waiting` 保留现有 Goal 绑定；只有 Runtime
 * 报告终态后才释放该进程。Worker 无权直接写 Goal 文件，所有快照经 Supervisor
 * 校验、核对队列绑定并提交。异常退出不释放队列绑定或自动重派。
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
    private readonly pending = new Map<string, (message: WorkerMessage) => void>();
    private busy = false;
    private goalId: string | undefined;
    private closed = false;

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
                this.pending.get(message.requestId)?.(message);
                this.pending.delete(message.requestId);
            };
            child.on("message", onMessage);
            child.once("error", reject);
            child.once("exit", (code, signal) => {
                const error = new Error(`Worker process exited (${signal ?? code})`);
                reject(error);
                for (const finish of this.pending.values()) {
                    finish({ kind: "advance-result", requestId: "", result: { kind: "rejected", code: "WORKER_EXITED", message: error.message } });
                }
                this.pending.clear();
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
                LAZYGOAL_WORKER_DATA_DIRECTORY: options.dataDirectory },
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
     * @returns 等待、终态或显式拒绝结果。
     * @throws 进程身份、队列绑定或 IPC 错误时拒绝；失败时保留原绑定。
     * @example
     * ```ts
     * const progress = await worker.advance("goal-1");
     * ```
     */
    async advance(goalId: string): Promise<WorkerProgress> {
        if (this.closed || this.busy) throw new Error("Worker is unavailable");
        const claim = this.options.deliveries.workerClaim(this.options.workerId, this.options.generation);
        if (claim !== goalId) throw new Error("Worker Goal does not match its durable assignment");
        if (this.goalId !== undefined && this.goalId !== goalId) throw new Error("Worker still owns another Goal");
        this.goalId = goalId;
        this.busy = true;
        try {
            const response = await this.request({ kind: "advance", requestId: randomUUID(), goalId });
            if (response.kind !== "advance-result") throw new Error("Unexpected Worker response");
            if (response.result.kind === "terminal") this.goalId = undefined;
            return response.result;
        } finally {
            this.busy = false;
        }
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
        if (this.busy || this.goalId !== undefined) throw new Error("Worker still owns an unsettled Goal");
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
            this.pending.set(command.requestId ?? randomUUID(), (message) => resolve(message));
            this.child.send(command, (error) => {
                if (error !== null) {
                    this.pending.delete(command.requestId ?? "");
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
    if (value.kind === "advance-result" && typeof value.requestId === "string" && isWorkerProgress(value.result)) return value as unknown as WorkerMessage;
    if (value.kind === "closed") return value as unknown as WorkerMessage;
    return undefined;
}

function isWorkerProgress(value: unknown): value is WorkerProgress {
    if (!isRecord(value) || typeof value.kind !== "string") return false;
    if (value.kind === "waiting") return ["ask_user", "task_approval", "action_approval", "action_recovery", "blocked"].includes(String(value.waitingFor));
    if (value.kind === "terminal") return ["completed", "failed", "cancelled"].includes(String(value.status));
    return value.kind === "rejected" && typeof value.code === "string" && typeof value.message === "string";
}
