import { randomUUID } from "node:crypto";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

import type {
    ManagedResource,
    ManagedResourceRegistry,
    ProcessSessionRecord,
    ProcessSessionStore,
    ToolExecutionContext,
} from "../../runtime/src/index";
import {
    killProcessGroup,
    spawnRestrictedCommand,
    type SpawnRestrictedCommandOptions,
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

/**
 * 按 Goal 隔离的长进程生命周期管理器。
 *
 * @remarks
 * 负责跨 Goal 并发额度控制、受管进程启动、管道流式监听、轮转持久化、受管退出监听与受管终止。
 * 注入 ManagedResourceRegistry，确保宿主正常或强制关闭时整组清理所有受管进程。
 *
 * @example
 * ```ts
 * const manager = new ProcessManager({
 *   store,
 *   resources,
 *   hostInstanceId: "host-uuid-1",
 * });
 * ```
 */
export class ProcessManager implements ManagedResource {
    private readonly store: ProcessSessionStore;
    private readonly resources?: ManagedResourceRegistry | undefined;
    private readonly hostInstanceId: string;
    private readonly activeProcesses = new Map<string, ActiveManagedProcess>();
    private closing = false;

    constructor(options: {
        readonly store: ProcessSessionStore;
        readonly hostInstanceId: string;
        readonly resources?: ManagedResourceRegistry | undefined;
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
     */
    getTotalRunningCount(): number {
        return this.activeProcesses.size;
    }

    /**
     * 启动一个新的受管长进程。
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
            unregisterResource();
            this.activeProcesses.delete(key);
            resolveDone();

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
        });

        return { processId, status: "running" };
    }

    /**
     * 等待指定进程产生输出或退出，或超时到达。
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
     * 停止指定 Goal 下的受管进程。
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
     * 宿主正常关闭：整组终止所有受管任务。
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
     * 宿主强制关闭：升级立即强制终止。
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
