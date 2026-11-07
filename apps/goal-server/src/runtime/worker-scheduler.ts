import { randomUUID } from "node:crypto";
import { JsonFileGoalStore } from "../../../../packages/storage/src/goal-store";
import { TriggerDeliveryStore } from "../../../../packages/storage/src/trigger-delivery-store";
import { SupervisorOwnership } from "../../../../packages/storage/src/supervisor-ownership";
import { SupervisorWorkerProcess, type WorkerProgress } from "./worker-process";

interface WorkerSlot {
    readonly workerId: string;
    readonly generation: string;
    readonly process: SupervisorWorkerProcess;
    readonly workspaceRoot: string;
}

/**
 * 将持久待派发队列按序绑定到可复用的独立 Worker。
 *
 * @remarks
 * 派发严格按 SQLite 队列顺序认领；没有空闲且工作区匹配的 Worker 时启动新进程。
 * 不限制不同 Goal 的并发。等待态继续占用 Worker；只有持久记录终态后才释放，
 * 崩溃或不确定结果保留原绑定，不自动重派。
 *
 * @example
 * ```ts
 * const scheduler = new WorkerScheduler({ owner, deliveries, goals, cwd, dataDirectory });
 * await scheduler.pump();
 * ```
 */
export class WorkerScheduler {
    private readonly workers = new Map<string, WorkerSlot>();
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
        await this.recordProgress(slot, goalId, progress);
        return progress;
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
        for (const [workerId, slot] of this.workers) {
            if (slot.process.assignedGoalId !== undefined) continue;
            await slot.process.close();
            this.workers.delete(workerId);
        }
    }

    private async dispatchQueuedGoals(): Promise<void> {
        for (;;) {
            const nextGoalId = this.options.deliveries.nextQueuedGoal();
            if (nextGoalId === undefined) return;
            const goal = await this.options.goals.restore(nextGoalId);
            if (goal === undefined) throw new Error("Queued Goal snapshot is missing");
            const workspaceRoot = goal.definition.triggerContext?.authorization.workspaceRoot;
            if (workspaceRoot === undefined || workspaceRoot.trim() === "") throw new Error("Queued Goal has no authorized workspace");

            let slot = [...this.workers.values()].find((candidate) => candidate.workspaceRoot === workspaceRoot
                && candidate.process.assignedGoalId === undefined);
            if (slot === undefined) {
                const workerId = `worker-${randomUUID()}`;
                const generation = randomUUID();
                const process = await SupervisorWorkerProcess.start({
                    workerId,
                    generation,
                    cwd: workspaceRoot,
                    dataDirectory: this.options.dataDirectory,
                    ...(this.options.env === undefined ? {} : { env: this.options.env }),
                    owner: this.options.owner,
                    deliveries: this.options.deliveries,
                    goals: this.options.goals,
                });
                slot = { workerId, generation, process, workspaceRoot };
                this.workers.set(workerId, slot);
            }

            const claimed = await this.options.deliveries.claimNextGoal(this.options.owner, slot.workerId, slot.generation);
            if (claimed !== nextGoalId) throw new Error("Goal queue head changed before dispatch");
            void slot.process.advance(nextGoalId)
                .then((progress) => this.recordProgress(slot, nextGoalId, progress))
                .catch(() => undefined);
        }
    }

    private async recordProgress(slot: WorkerSlot, goalId: string, progress: WorkerProgress): Promise<void> {
        if (progress.kind === "waiting") {
            await this.options.deliveries.markWorkerGoalStatus(this.options.owner, slot.workerId, slot.generation, goalId, "waiting");
            return;
        }
        if (progress.kind === "terminal") {
            await this.options.deliveries.markWorkerGoalStatus(this.options.owner, slot.workerId, slot.generation, goalId, "terminal");
            await this.pump();
        }
    }
}
