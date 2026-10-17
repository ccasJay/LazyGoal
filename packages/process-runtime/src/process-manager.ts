import { randomUUID } from "node:crypto";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

import type {
    ManagedResource,
    ManagedResourceRegistry,
    ProcessSessionRecord,
    ProcessSessionStore,
} from "../../runtime/src/index";
import {
    killProcessGroup,
    spawnRestrictedCommand,
} from "../../sandbox/src/index";

/** 单个 Goal 允许的最大并发运行进程数。 */
export const PROCESS_MAX_RUNNING_PER_GOAL = 4;

/** 单个宿主进程允许的最大并发运行进程数。 */
export const PROCESS_MAX_RUNNING_PER_HOST = 16;

/** 单个 Goal 允许保留的最大历史进程记录数。 */
export const PROCESS_MAX_SESSIONS_PER_GOAL = 32;

/**
 * 内部受管活跃进程句柄。
 */
interface ActiveManagedProcess {
    readonly goalId: string;
    readonly processId: string;
    readonly child: ChildProcess;
    readonly unregisterResource: () => void;
    readonly cancelGrace?: (() => void) | undefined;
    readonly outputEmitter: EventEmitter;
    readonly promise: Promise<void>;
}

/** 管理器需要的最小资源注册类型面；只要求注册能力，不接管注册表生命周期。 */
type ProcessResourceRegistration = Pick<ManagedResourceRegistry, "register">;

/**
 * 按 Goal 隔离的长进程生命周期管理器。
 *
 * @remarks
 * 负责跨 Goal 并发额度控制、受管进程启动、管道流式监听、日志追加、受管退出监听与受管终止。
 * 只管理本实例实际创建并持有的句柄：不扫描系统 PID、不重连或终止历史 PID，也不关闭注入的
 * Store、注册表或其它管理器的进程。提供 resources 时把自身注册为资源，宿主资源集合可在
 * 正常或强制关闭时请求本管理器清理；是否设置关闭期限由宿主生命周期所有者决定，本管理器
 * 不自定义实例关闭期限。
 *
 * @example
 * ```ts
 * const manager = new ProcessManager({
 *   store,
 *   hostInstanceId: "host-uuid-1",
 * });
 * const started = await manager.startProcess({
 *   goalId: "goal-1",
 *   command: "npm run dev",
 *   cwd: "/workspace",
 * });
 * await manager.stopProcess("goal-1", started.processId);
 * ```
 */
export class ProcessManager implements ManagedResource {
    private readonly store: ProcessSessionStore;
    private readonly resources?: ProcessResourceRegistration | undefined;
    private readonly hostInstanceId: string;
    private readonly activeProcesses = new Map<string, ActiveManagedProcess>();
    private closing = false;

    /**
     * @param options - 管理器装配参数。
     * @param options.store - 进程会话持久化 Port；管理器借用该实现，不取得其关闭权。
     * @param options.hostInstanceId - 当前宿主实例标识，用于记录归属与旧宿主中断投影。
     * @param options.resources - 可选的资源注册入口；提供时管理器注册自身以参与宿主关闭。
     */
    constructor(options: {
        readonly store: ProcessSessionStore;
        readonly hostInstanceId: string;
        readonly resources?: ProcessResourceRegistration | undefined;
    }) {
        this.store = options.store;
        this.hostInstanceId = options.hostInstanceId;
        this.resources = options.resources;
        if (this.resources !== undefined) {
            this.resources.register(this);
        }
    }

    /**
     * 获取指定 Goal 当前正在运行的受管进程数量。
     *
     * @param goalId - Goal 的稳定标识。
     * @returns 本管理器当前持有该 Goal 的活跃句柄数。
     */
    getRunningCount(goalId: string): number {
        let count = 0;
        for (const item of this.activeProcesses.values()) {
            if (item.goalId === goalId) {
                count += 1;
            }
        }
        return count;
    }

    /**
     * 获取当前宿主正在运行的所有受管进程总数。
     *
     * @returns 本管理器持有的全部活跃句柄数，用于宿主并发额度判断。
     */
    getTotalRunningCount(): number {
        return this.activeProcesses.size;
    }

    /**
     * 启动一个新的受管长进程，并返回其会话标识与初始状态。
     *
     * @remarks
     * 调用方提供 Goal 归属键、命令、工作目录与已准备的沙箱执行选项；管理器不解析配置，
     * 也不扩大沙箱权限。首次异步存储前同步拒绝已关闭的管理器；额度只覆盖本管理器持有的
     * 句柄，超出每 Goal 或宿主上限时拒绝启动，不排队。
     *
     * @param options - 启动参数。
     * @param options.goalId - 会话归属的 Goal 标识，不授予业务权限。
     * @param options.command - 完整 Shell 命令。
     * @param options.cwd - 命令工作目录的真实绝对路径。
     * @param options.actionId - 可选的关联 Action 标识。
     * @param options.sandbox - 可选的沙箱策略与环境变量，由调用方准备。
     * @returns 新会话的 processId 与初始状态；进程已创建时返回 `running`。
     * @throws 管理器关闭、额度耗尽、历史会话超限或初始记录保存失败时抛出错误。
     */
    async startProcess(options: {
        readonly goalId: string;
        readonly command: string;
        readonly cwd: string;
        readonly actionId?: string;
        readonly sandbox?: {
            readonly policy: string;
            readonly env: NodeJS.ProcessEnv;
        };
    }): Promise<{ readonly processId: string; readonly status: "starting" | "running" }> {
        if (this.closing) {
            throw new Error("ProcessManager is closing, cannot start new process");
        }

        // 额度检查
        if (this.getRunningCount(options.goalId) >= PROCESS_MAX_RUNNING_PER_GOAL) {
            throw new Error(`Goal ${options.goalId} reached concurrency limit of ${PROCESS_MAX_RUNNING_PER_GOAL} running processes`);
        }
        if (this.getTotalRunningCount() >= PROCESS_MAX_RUNNING_PER_HOST) {
            throw new Error(`Host reached global concurrency limit of ${PROCESS_MAX_RUNNING_PER_HOST} running processes`);
        }

        const existingList = await this.store.listSessions(options.goalId);
        if (existingList.length >= PROCESS_MAX_SESSIONS_PER_GOAL) {
            throw new Error(`Goal ${options.goalId} reached maximum session history limit of ${PROCESS_MAX_SESSIONS_PER_GOAL} processes`);
        }

        const processId = `proc-${randomUUID().slice(0, 8)}`;
        const startedAt = new Date().toISOString();

        // 写入初始 session
        const sessionRecord: ProcessSessionRecord = {
            goalId: options.goalId,
            processId,
            command: options.command,
            status: "starting",
            hostInstanceId: this.hostInstanceId,
            startedAt,
            ...(options.actionId !== undefined ? { actionId: options.actionId } : {}),
        };
        await this.store.saveSession(sessionRecord);

        // 启动子进程
        let child: ChildProcess;
        try {
            child = spawnRestrictedCommand({
                command: options.command,
                cwd: options.cwd,
                ...(options.sandbox !== undefined ? { sandbox: options.sandbox } : {}),
            });
        } catch (error) {
            const failedRecord: ProcessSessionRecord = {
                ...sessionRecord,
                status: "failed",
                exitedAt: new Date().toISOString(),
                error: error instanceof Error ? error.message : String(error),
            };
            await this.store.saveSession(failedRecord);
            throw error;
        }

        if (child.pid === undefined) {
            const failedRecord: ProcessSessionRecord = {
                ...sessionRecord,
                status: "failed",
                exitedAt: new Date().toISOString(),
                error: "Failed to spawn process (PID undefined)",
            };
            await this.store.saveSession(failedRecord);
            throw new Error("Failed to spawn process (PID undefined)");
        }

        const key = `${options.goalId}:${processId}`;
        const outputEmitter = new EventEmitter();

        // 注册到 ManagedResource
        const procResource: ManagedResource = {
            close: async () => {
                await this.stopProcess(options.goalId, processId);
            },
            forceClose: async () => {
                await this.stopProcess(options.goalId, processId, { force: true });
            },
        };
        const unregisterResource = this.resources !== undefined
            ? this.resources.register(procResource)
            : () => undefined;

        let cancelGrace: (() => void) | undefined;
        let resolveDone: () => void;
        const promise = new Promise<void>((resolve) => {
            resolveDone = resolve;
        });

        const activeItem: ActiveManagedProcess = {
            goalId: options.goalId,
            processId,
            child,
            unregisterResource,
            get cancelGrace() { return cancelGrace; },
            outputEmitter,
            promise,
        };
        this.activeProcesses.set(key, activeItem);

        // 监听输出流
        child.stdout?.setEncoding("utf8");
        child.stdout?.on("data", (chunk: string) => {
            void this.store.appendOutput(options.goalId, processId, "stdout", chunk)
                .catch(() => {})
                .finally(() => {
                    outputEmitter.emit("output", "stdout", chunk);
                });
        });

        child.stderr?.setEncoding("utf8");
        child.stderr?.on("data", (chunk: string) => {
            void this.store.appendOutput(options.goalId, processId, "stderr", chunk)
                .catch(() => {})
                .finally(() => {
                    outputEmitter.emit("output", "stderr", chunk);
                });
        });

        // 更新状态为 running
        const runningRecord: ProcessSessionRecord = {
            ...sessionRecord,
            status: "running",
        };
        await this.store.saveSession(runningRecord);

        // 监听进程退出与关闭
        child.on("close", async (exitCode: number | null, signal: NodeJS.Signals | null) => {
            try {
                const current = await this.store.getSession(options.goalId, processId);
                if (current !== undefined && current.status === "stopped") {
                    // 已被显式 stop，保留 stopped 状态并更新 exitedAt
                    await this.store.saveSession({
                        ...current,
                        exitedAt: new Date().toISOString(),
                        exitCode: exitCode ?? null,
                        signal: signal ?? null,
                    });
                    return;
                }

                const exitedRecord: ProcessSessionRecord = {
                    ...sessionRecord,
                    status: "exited",
                    exitedAt: new Date().toISOString(),
                    exitCode: exitCode ?? null,
                    signal: signal ?? null,
                };
                await this.store.saveSession(exitedRecord);
            } finally {
                unregisterResource();
                this.activeProcesses.delete(key);
                resolveDone();
            }
        });

        return { processId, status: "running" };
    }

    /**
     * 等待指定进程产生输出或退出，或等待窗口到期。
     *
     * @remarks
     * 只负责唤醒等待者，不证明日志已经写入，也不改变进程或 Goal 状态；调用方随后仍应以 Store
     * 为准读取。目标进程不属于本管理器或已不在活跃集合时立即返回。
     *
     * @param goalId - 会话归属的 Goal 标识。
     * @param processId - 目标进程标识。
     * @param waitMs - 最长等待毫秒数；非正数立即返回。
     */
    async waitForOutput(
        goalId: string,
        processId: string,
        waitMs: number,
    ): Promise<void> {
        if (waitMs <= 0) return;
        const key = `${goalId}:${processId}`;
        const active = this.activeProcesses.get(key);
        if (active === undefined) return;

        await new Promise<void>((resolve) => {
            const timer = setTimeout(done, waitMs);
            function done(): void {
                clearTimeout(timer);
                active?.outputEmitter.off("output", onOut);
                active?.child.off("close", onClose);
                resolve();
            }
            function onOut(): void { done(); }
            function onClose(): void { done(); }

            active.outputEmitter.once("output", onOut);
            active.child.once("close", onClose);
        });
    }

    /**
     * 停止本管理器当前拥有的受管进程，并返回结算后的会话记录。
     *
     * @remarks
     * 仅对本实例实际持有的句柄发送进程组信号；无活跃句柄的历史记录按现有读取语义返回，
     * 不据此重新获得 OS 控制权。`force` 跳过宽限直接升级终止。管理器关闭后调用同样只处理
     * 已拥有的句柄。
     *
     * @param goalId - 会话归属的 Goal 标识。
     * @param processId - 目标进程标识。
     * @param options - 可选的强制终止选项。
     * @returns 最新持久化的会话记录。
     * @throws 记录不存在或持久化读写失败时抛出错误。
     */
    async stopProcess(
        goalId: string,
        processId: string,
        options?: { readonly force?: boolean },
    ): Promise<ProcessSessionRecord> {
        const key = `${goalId}:${processId}`;
        const active = this.activeProcesses.get(key);

        const current = await this.store.getSession(goalId, processId);
        if (current === undefined) {
            throw new Error(`Process ${processId} not found in Goal ${goalId}`);
        }

        if (active === undefined) {
            // 已经在内存中退出或属于外部历史记录
            return current;
        }

        // 标记为 stopped
        const stoppedRecord: ProcessSessionRecord = {
            ...current,
            status: "stopped",
        };
        await this.store.saveSession(stoppedRecord);

        // 终止进程组
        if (options?.force) {
            killProcessGroup(active.child, { graceMs: 0 });
        } else {
            killProcessGroup(active.child);
        }

        await Promise.race([
            active.promise,
            new Promise<void>((r) => setTimeout(r, 2500)),
        ]);

        return (await this.store.getSession(goalId, processId)) ?? stoppedRecord;
    }

    /**
     * 停止新启动受理，并请求清理本实例拥有的全部进程。
     *
     * @remarks
     * 重复调用复用同一清理过程，不重复写终态或重复注册监听器。管理器不关闭借用的 Store、
     * 注册表或其它资源；实例关闭期限和结果汇总由宿主生命周期所有者负责。
     */
    async close(): Promise<void> {
        this.closing = true;
        const promises: Promise<unknown>[] = [];
        for (const item of Array.from(this.activeProcesses.values())) {
            promises.push(this.stopProcess(item.goalId, item.processId));
        }
        await Promise.allSettled(promises);
    }

    /**
     * 停止新启动受理，并对仍拥有的进程组升级强制终止。
     *
     * @remarks
     * 可在正常关闭等待期间或直接调用；同样不关闭借用资源，不自行退出宿主进程。
     */
    async forceClose(): Promise<void> {
        this.closing = true;
        const promises: Promise<unknown>[] = [];
        for (const item of Array.from(this.activeProcesses.values())) {
            promises.push(this.stopProcess(item.goalId, item.processId, { force: true }));
        }
        await Promise.allSettled(promises);
    }
}
