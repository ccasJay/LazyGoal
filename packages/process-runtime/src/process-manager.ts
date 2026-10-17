import { randomUUID } from "node:crypto";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

import type {
    ManagedResource,
    ManagedResourceRegistry,
    ProcessSessionRecord,
    ProcessSessionStatus,
    ProcessSessionStore,
} from "../../runtime/src/index";
import {
    killProcessGroup,
    sendSignalToProcessGroup,
    spawnRestrictedCommand,
} from "../../sandbox/src/index";
import { ProcessSessionError, type ProcessFailureStage, type ProcessSessionFailure } from "./errors";

/** 单个 Goal 允许的最大并发运行进程数。 */
export const PROCESS_MAX_RUNNING_PER_GOAL = 4;

/** 单个宿主进程允许的最大并发运行进程数。 */
export const PROCESS_MAX_RUNNING_PER_HOST = 16;

/** 单个 Goal 允许保留的最大历史进程记录数。 */
export const PROCESS_MAX_SESSIONS_PER_GOAL = 32;

/** 显式停止等待进程退出与记录结算的时间上限（毫秒）。 */
const PROCESS_STOP_WAIT_MS = 2_500;

/** 管理器需要的最小资源注册类型面；只要求注册能力，不接管注册表生命周期。 */
type ProcessResourceRegistration = Pick<ManagedResourceRegistry, "register">;

/** 由调用方准备的沙箱执行选项。 */
interface ProcessSandboxOptions {
    readonly policy: string;
    readonly env: NodeJS.ProcessEnv;
}

/** 已受理会话的内部状态；从同步受理到终态结算由同一所有者序列化。 */
interface ManagedSession {
    readonly key: string;
    readonly goalId: string;
    readonly processId: string;
    readonly command: string;
    readonly cwd: string;
    readonly actionId: string | undefined;
    readonly sandbox: ProcessSandboxOptions | undefined;
    readonly startedAt: string;
    readonly outputEmitter: EventEmitter;
    readonly done: Promise<void>;
    resolveDone: () => void;
    /** 同一会话的记录写入串行链，避免迟到 running 覆盖终态。 */
    writeChain: Promise<void>;
    phase: "admitting" | "running" | "terminal";
    /** 初始记录已成功保存，本会话计入已知磁盘记录。 */
    persisted: boolean;
    /** 已取得历史名额但尚未落盘，用于并发历史上限仲裁。 */
    historyReserved: boolean;
    child: ChildProcess | undefined;
    cancelGrace: (() => void) | undefined;
    stopRequested: boolean;
    /** 每通道串行追加链；保证同一通道按接收顺序结算。 */
    readonly outputChains: Map<"stdout" | "stderr", Promise<void>>;
    /** 尚未结算的已接收输出追加数。 */
    pendingOutputWrites: number;
    /** 待结算写入清零时唤醒的等待者。 */
    readonly quiescentResolvers: Array<() => void>;
    /** 首个已知结算失败；保留最早故障，不被后续清理故障覆盖。 */
    firstFailure: { readonly stage: ProcessFailureStage; readonly error: unknown } | undefined;
    /** 已向调用方报告的失败；避免同一失败在关闭时重复报告。 */
    reportedFailure: { readonly stage: ProcessFailureStage; readonly error: unknown } | undefined;
}

/**
 * 按 Goal 隔离的长进程生命周期管理器。
 *
 * @remarks
 * 负责跨 Goal 并发额度控制、受管进程启动、管道流式监听、日志追加、受管退出监听与受管终止。
 * 同步受理并预留每次启动，额度覆盖已受理未结算启动与活跃句柄；关闭在后续异步边界被重新检查，
 * 已创建的句柄仍由同一所有者清理。只管理本实例实际创建并持有的句柄：不扫描系统 PID、不重连
 * 或终止历史 PID，也不关闭注入的 Store、注册表或其它管理器的进程。提供 resources 时把自身
 * 注册为资源，宿主资源集合可在正常或强制关闭时请求本管理器清理；是否设置关闭期限由宿主生命
 * 周期所有者决定，本管理器不自定义实例关闭期限。
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
    private readonly sessions = new Map<string, ManagedSession>();
    /** 各 Goal 已确认存在于 Store 的会话标识；用于历史上限与并发预留判定。 */
    private readonly knownSessions = new Map<string, Set<string>>();
    /** 各 Goal 已获历史名额但尚未落盘的受理数。 */
    private readonly reservedHistory = new Map<string, number>();
    /** 会话结算中未向调用方报告的已知失败；关闭时统一报告，不能静默丢失。 */
    private readonly settlementFailures: ProcessSessionFailure[] = [];
    private closing = false;
    private closeOperation: Promise<void> | undefined;

    /**
     * @param options - 管理器装配参数。
     * @param options.store - 进程会话持久化 Port；管理器借用该实现，不取得其关闭权。
     * @param options.hostInstanceId - 当前宿主实例标识，用于记录归属与旧宿主中断投影。
     * @param options.resources - 可选的资源注册入口；提供时管理器注册自身以参与宿主关闭。
     * @throws ProcessSessionError 资源注册失败（如注册表已关闭）时抛出；此时不创建任何进程。
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
            try {
                this.resources.register(this);
            } catch (error) {
                throw new ProcessSessionError("Failed to register ProcessManager as a managed resource", {
                    stage: "admission",
                    cause: error,
                });
            }
        }
    }

    /**
     * 获取指定 Goal 已受理未结算启动与活跃句柄的数量。
     *
     * @param goalId - Goal 的稳定标识。
     * @returns 本管理器当前占用该 Goal 额度的会话数，包含尚未创建 OS 进程的已受理启动。
     */
    getRunningCount(goalId: string): number {
        let count = 0;
        for (const session of this.sessions.values()) {
            if (session.goalId === goalId) {
                count += 1;
            }
        }
        return count;
    }

    /**
     * 获取当前宿主已受理未结算启动与活跃句柄的总数。
     *
     * @returns 本管理器持有的全部会话数，用于宿主并发额度判断。
     */
    getTotalRunningCount(): number {
        return this.sessions.size;
    }

    /**
     * 启动一个新的受管长进程，并返回其会话标识与初始状态。
     *
     * @remarks
     * 调用方提供 Goal 归属键、命令、工作目录与已准备的沙箱执行选项；管理器不解析配置，
     * 也不扩大沙箱权限。首次异步存储前同步受理并预留本次启动；额度覆盖已受理未结算启动与
     * 活跃句柄，超出每 Goal 4 个、宿主 16 个或每 Goal 32 项历史记录上限时拒绝，不排队。
     * 初始记录先于创建进程保存；取得句柄后立即安装事件处理，再异步结算 running 记录。
     *
     * @param options - 启动参数。
     * @param options.goalId - 会话归属的 Goal 标识，不授予业务权限。
     * @param options.command - 完整 Shell 命令。
     * @param options.cwd - 命令工作目录的真实绝对路径。
     * @param options.actionId - 可选的关联 Action 标识。
     * @param options.sandbox - 可选的沙箱策略与环境变量，由调用方准备。
     * @returns 新会话的 processId 与初始状态；启动已受理并创建句柄时返回 `running`。
     * @throws ProcessSessionError 关闭、额度耗尽、历史超限、记录保存失败或创建进程失败时抛出；
     * 失败时不对调用方报告成功，已创建句柄仍由本管理器清理。
     */
    async startProcess(options: {
        readonly goalId: string;
        readonly command: string;
        readonly cwd: string;
        readonly actionId?: string;
        readonly sandbox?: ProcessSandboxOptions;
    }): Promise<{ readonly processId: string; readonly status: "starting" | "running" }> {
        this.assertAdmissible(options.goalId);

        const processId = `proc-${randomUUID().slice(0, 8)}`;
        const session = this.createSession(options, processId);

        try {
            await this.admitSession(session);
            await this.spawnSession(session);
        } catch (error) {
            // 启动失败已通过本次抛出报告；同一失败不在关闭时重复上报
            session.reportedFailure = session.firstFailure;
            if (session.child === undefined) {
                this.releaseSession(session);
            }
            throw error;
        }

        return { processId, status: "running" };
    }

    /**
     * 等待指定进程产生输出或退出，或等待窗口到期。
     *
     * @remarks
     * 只负责唤醒等待者，不证明日志已经写入，也不改变进程或 Goal 状态；调用方随后仍应以 Store
     * 为准读取。目标进程不属于本管理器或已不在会话集合时立即返回。
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
        const session = this.sessions.get(`${goalId}:${processId}`);
        if (session === undefined) return;

        await new Promise<void>((resolve) => {
            let timer: NodeJS.Timeout | undefined;
            const done = (): void => {
                clearTimeout(timer);
                session.outputEmitter.off("output", onOut);
                session.child?.off("close", onClose);
                resolve();
            };
            const onOut = (): void => done();
            const onClose = (): void => done();

            timer = setTimeout(done, waitMs);
            session.outputEmitter.once("output", onOut);
            session.child?.once("close", onClose);
        });
    }

    /**
     * 停止本管理器当前拥有的受管进程，并返回结算后的会话记录。
     *
     * @remarks
     * 仅对本实例实际持有的句柄发送进程组信号；无活跃句柄的历史记录按现有读取语义返回，
     * 不据此重新获得 OS 控制权。`force` 跳过宽限直接升级终止。只有确认句柄实际退出、
     * 终态记录与已接收输出均结算且无已知失败时才返回成功；已写 `stopped` 记录或已发送
     * 信号都不是退出证明，等待窗口到期仍未确认时抛出类型化失败并保留未确认状态。
     *
     * @param goalId - 会话归属的 Goal 标识。
     * @param processId - 目标进程标识。
     * @param options - 可选的强制终止选项。
     * @returns 结算后的最新会话记录；该会话必须实际退出且结算完成。
     * @throws ProcessSessionError 记录不存在、未确认退出/结算或读写失败时抛出；失败可能
     * 发生在信号已发出之后，不能由失败返回推断进程未被终止。
     */
    async stopProcess(
        goalId: string,
        processId: string,
        options?: { readonly force?: boolean },
    ): Promise<ProcessSessionRecord> {
        const key = `${goalId}:${processId}`;
        const session = this.sessions.get(key);

        const current = await this.store.getSession(goalId, processId);
        if (current === undefined) {
            throw new ProcessSessionError(`Process ${processId} not found in Goal ${goalId}`, {
                stage: "stop",
                goalId,
                processId,
            });
        }

        if (session === undefined || session.child === undefined) {
            // 无当前句柄：历史记录不授予杀进程权，也不重新写终态
            return current;
        }

        this.requestHandleTermination(session, options?.force ?? false);
        const settled = await this.awaitSettlement(session, PROCESS_STOP_WAIT_MS);
        if (!settled) {
            throw new ProcessSessionError(
                `Stop of process ${processId} did not confirm settlement within ${PROCESS_STOP_WAIT_MS}ms`,
                {
                    stage: "stop",
                    goalId,
                    processId,
                    unconfirmed: session.phase === "terminal" ? "settlement" : "exit",
                },
            );
        }

        const failure = this.takeSettlementFailure(goalId, processId);
        if (failure !== undefined) {
            throw new ProcessSessionError(
                `Process ${processId} stopped but settlement failed: ${describeUnknown(failure.reason)}`,
                {
                    stage: failure.stage,
                    goalId,
                    processId,
                    cause: failure.reason,
                },
            );
        }

        return (await this.store.getSession(goalId, processId)) ?? current;
    }

    /**
     * 停止新启动受理，并请求清理本实例拥有的全部会话。
     *
     * @remarks
     * 首次调用同步停止受理；已受理未创建进程的启动会在后续异步边界被拒绝，已创建句柄由本次
     * 清理终止，已接收输出与终态记录未结算前不会完成。重复调用复用同一清理过程。管理器不关闭
     * 借用的 Store、注册表或其它资源；实例关闭期限和结果汇总由宿主生命周期所有者负责。
     *
     * @returns 所有自有会话实际退出且写入结算完成后完成。
     * @throws ProcessSessionError 存在未报告的结算失败时抛出，携带各失败会话的阶段、身份与
     * 原因；此时不报告关闭成功，外层生命周期应保留失败信息继续强制处理。
     */
    async close(): Promise<void> {
        if (this.closeOperation === undefined) {
            this.closeOperation = this.performClose(false).then(() => this.assertCleanClose());
        }
        return this.closeOperation;
    }

    /**
     * 停止新启动受理，并对仍拥有的进程组升级强制终止。
     *
     * @remarks
     * 可在正常关闭等待期间或直接调用；发送终止信号不等待 Store 写入完成，也不关闭借用资源
     * 或自行退出宿主进程。重复调用升级终止仍拥有的句柄并复用同一清理过程与失败报告。
     *
     * @throws ProcessSessionError 与 `close` 相同的未报告结算失败；强制升级不吞掉这些错误。
     */
    async forceClose(): Promise<void> {
        if (this.closeOperation === undefined) {
            this.closeOperation = this.performClose(true).then(() => this.assertCleanClose());
            return this.closeOperation;
        }

        for (const session of [...this.sessions.values()]) {
            this.requestHandleTermination(session, true);
        }
        return this.closeOperation;
    }

    /** 同步受理检查：关闭、Goal/宿主额度与历史预留预筛。 */
    private assertAdmissible(goalId: string): void {
        if (this.closing) {
            throw this.closingError(goalId);
        }
        if (this.getRunningCount(goalId) >= PROCESS_MAX_RUNNING_PER_GOAL) {
            throw new ProcessSessionError(
                `Goal ${goalId} reached concurrency limit of ${PROCESS_MAX_RUNNING_PER_GOAL} running processes`,
                { stage: "admission", goalId },
            );
        }
        if (this.getTotalRunningCount() >= PROCESS_MAX_RUNNING_PER_HOST) {
            throw new ProcessSessionError(
                `Host reached global concurrency limit of ${PROCESS_MAX_RUNNING_PER_HOST} running processes`,
                { stage: "admission", goalId },
            );
        }
        const known = this.knownSessions.get(goalId)?.size ?? 0;
        if (known + this.unpersistedCount(goalId) > PROCESS_MAX_SESSIONS_PER_GOAL) {
            throw this.historyLimitError(goalId);
        }
    }

    private historyLimitError(goalId: string): ProcessSessionError {
        return new ProcessSessionError(
            `Goal ${goalId} reached maximum session history limit of ${PROCESS_MAX_SESSIONS_PER_GOAL} processes`,
            { stage: "admission", goalId },
        );
    }

    private closingError(goalId: string, processId?: string): ProcessSessionError {
        return new ProcessSessionError("ProcessManager is closing, cannot start new process", {
            stage: "admission",
            goalId,
            processId,
        });
    }

    private createSession(
        options: {
            readonly goalId: string;
            readonly command: string;
            readonly cwd: string;
            readonly actionId?: string;
            readonly sandbox?: ProcessSandboxOptions;
        },
        processId: string,
    ): ManagedSession {
        let resolveDone!: () => void;
        const done = new Promise<void>((resolve) => {
            resolveDone = resolve;
        });
        const session: ManagedSession = {
            key: `${options.goalId}:${processId}`,
            goalId: options.goalId,
            processId,
            command: options.command,
            cwd: options.cwd,
            actionId: options.actionId,
            sandbox: options.sandbox,
            startedAt: new Date().toISOString(),
            outputEmitter: new EventEmitter(),
            done,
            resolveDone,
            writeChain: Promise.resolve(),
            phase: "admitting",
            persisted: false,
            historyReserved: false,
            child: undefined,
            cancelGrace: undefined,
            stopRequested: false,
            outputChains: new Map(),
            pendingOutputWrites: 0,
            quiescentResolvers: [],
            firstFailure: undefined,
            reportedFailure: undefined,
        };
        this.sessions.set(session.key, session);
        return session;
    }

    /** 等待 list/初始保存并完成历史上限仲裁；关闭在异步边界被重新检查。 */
    private async admitSession(session: ManagedSession): Promise<void> {
        let listed: readonly ProcessSessionRecord[];
        try {
            listed = await this.store.listSessions(session.goalId);
        } catch (error) {
            throw new ProcessSessionError(
                `Failed to list process sessions for Goal ${session.goalId}`,
                { stage: "persistence", goalId: session.goalId, processId: session.processId, cause: error },
            );
        }
        this.mergeKnownSessions(session.goalId, listed);

        if (!this.historyReserve(session)) {
            throw this.historyLimitError(session.goalId);
        }
        if (this.closing) {
            throw this.closingError(session.goalId, session.processId);
        }

        const startingRecord: ProcessSessionRecord = {
            goalId: session.goalId,
            processId: session.processId,
            command: session.command,
            status: "starting",
            hostInstanceId: this.hostInstanceId,
            startedAt: session.startedAt,
            ...(session.actionId !== undefined ? { actionId: session.actionId } : {}),
        };
        try {
            await this.enqueueWrite(session, () => this.store.saveSession(startingRecord));
        } catch (error) {
            throw new ProcessSessionError(
                `Failed to persist initial process record for ${session.processId}`,
                { stage: "persistence", goalId: session.goalId, processId: session.processId, cause: error },
            );
        }
        session.persisted = true;
        this.releaseHistoryReservation(session);
        this.markKnownSession(session.goalId, session.processId);

        if (this.closing) {
            const cleanupError = await this.persistFailedRecord(
                session,
                "ProcessManager is closing before the process was spawned",
            );
            throw new ProcessSessionError("ProcessManager is closing, cannot start new process", {
                stage: "admission",
                goalId: session.goalId,
                processId: session.processId,
                cleanupError,
            });
        }
    }

    /** 创建子进程、立即取得句柄所有权并结算 running 记录；关闭在异步边界被重新检查。 */
    private async spawnSession(session: ManagedSession): Promise<void> {
        let child: ChildProcess;
        try {
            child = spawnRestrictedCommand({
                command: session.command,
                cwd: session.cwd,
                ...(session.sandbox !== undefined ? { sandbox: session.sandbox } : {}),
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const cleanupError = await this.persistFailedRecord(session, message);
            throw new ProcessSessionError(message, {
                stage: "spawn",
                goalId: session.goalId,
                processId: session.processId,
                cause: error,
                cleanupError,
            });
        }

        // 取得句柄所有权后立即安装事件与输出处理，快速退出或异步错误不能落在监听空隙
        session.child = child;
        session.phase = "running";
        this.installProcessHandlers(session, child);

        if (child.pid === undefined || this.closing) {
            this.requestHandleTermination(session, true);
            await this.awaitSettlement(session, PROCESS_STOP_WAIT_MS);
            if (child.pid === undefined) {
                throw new ProcessSessionError("Failed to spawn process (PID undefined)", {
                    stage: "spawn",
                    goalId: session.goalId,
                    processId: session.processId,
                });
            }
            throw this.closingError(session.goalId, session.processId);
        }

        try {
            await this.enqueueWrite(session, async () => {
                if (session.phase === "terminal") {
                    return;
                }
                await this.store.saveSession({
                    goalId: session.goalId,
                    processId: session.processId,
                    command: session.command,
                    status: "running",
                    hostInstanceId: this.hostInstanceId,
                    startedAt: session.startedAt,
                    ...(session.actionId !== undefined ? { actionId: session.actionId } : {}),
                });
            });
        } catch (error) {
            this.recordFailure(session, "persistence", error);
            this.requestHandleTermination(session, true);
            throw new ProcessSessionError(
                `Failed to persist running process record for ${session.processId}`,
                { stage: "persistence", goalId: session.goalId, processId: session.processId, cause: error },
            );
        }

        if (this.closing) {
            this.requestHandleTermination(session, true);
            throw this.closingError(session.goalId, session.processId);
        }
    }

    /** 安装退出、异步错误与输出监听；同一会话只结算一次。 */
    private installProcessHandlers(session: ManagedSession, child: ChildProcess): void {
        let settled = false;
        const settle = (exit: { readonly code: number | null; readonly signal: NodeJS.Signals | null } | undefined, failure: unknown): void => {
            if (settled) {
                return;
            }
            settled = true;
            void this.finishSession(session, exit, failure);
        };

        child.once("error", (error) => settle(undefined, error));
        child.once("close", (code, signal) => settle(
            { code: code ?? null, signal: signal ?? null },
            undefined,
        ));

        child.stdout?.setEncoding("utf8");
        child.stdout?.on("data", (chunk: string) => {
            this.appendOutput(session, "stdout", chunk);
        });
        child.stderr?.setEncoding("utf8");
        child.stderr?.on("data", (chunk: string) => {
            this.appendOutput(session, "stderr", chunk);
        });
    }

    /**
     * 按通道串行追加已接收输出，并登记为待结算写入。
     *
     * @remarks
     * 同一通道的分片必须按接收顺序结算；不同通道互不阻塞。追加失败记录为可辨识的结算失败，
     * 不等同于日志写入成功，也不阻止其它写入与终态结算。等待者的唤醒发生在本次追加结果
     * （成功或失败）确定之后。
     */
    private appendOutput(
        session: ManagedSession,
        channel: "stdout" | "stderr",
        chunk: string,
    ): void {
        const previous = session.outputChains.get(channel) ?? Promise.resolve();
        const write = previous
            .then(async () => {
                try {
                    await this.store.appendOutput(session.goalId, session.processId, channel, chunk);
                } catch (error) {
                    this.recordFailure(session, "output", error);
                } finally {
                    session.outputEmitter.emit("output", channel, chunk);
                }
            })
            .catch((error: unknown) => {
                this.recordFailure(session, "output", error);
            });
        session.outputChains.set(channel, write);
        session.pendingOutputWrites += 1;
        void write.finally(() => {
            session.pendingOutputWrites -= 1;
            if (session.pendingOutputWrites === 0) {
                const resolvers = session.quiescentResolvers.splice(0);
                for (const resolve of resolvers) {
                    resolve();
                }
            }
        });
    }

    /** 等待已接收输出写入全部结算；调用方据此决定能否报告关闭成功。 */
    private awaitOutputWritesQuiescent(session: ManagedSession): Promise<void> {
        if (session.pendingOutputWrites === 0) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            session.quiescentResolvers.push(resolve);
        });
    }

    /** 终态结算：以同一所有者写入唯一终态记录并释放额度。 */
    private async finishSession(
        session: ManagedSession,
        exit: { readonly code: number | null; readonly signal: NodeJS.Signals | null } | undefined,
        failure: unknown,
    ): Promise<void> {
        session.phase = "terminal";
        session.cancelGrace?.();
        session.cancelGrace = undefined;

        const status: ProcessSessionStatus = failure !== undefined
            ? "failed"
            : session.stopRequested
                ? "stopped"
                : "exited";
        const errorMessage = failure !== undefined
            ? failure instanceof Error ? failure.message : String(failure)
            : undefined;

        try {
            await this.enqueueWrite(session, () => this.store.saveSession({
                goalId: session.goalId,
                processId: session.processId,
                command: session.command,
                status,
                hostInstanceId: this.hostInstanceId,
                startedAt: session.startedAt,
                ...(session.actionId !== undefined ? { actionId: session.actionId } : {}),
                exitedAt: new Date().toISOString(),
                exitCode: exit?.code ?? null,
                signal: exit?.signal ?? null,
                ...(errorMessage !== undefined ? { error: errorMessage } : {}),
            }));
        } catch (error) {
            this.recordFailure(session, "settlement", error);
        }

        // 退出后的已接收输出仍属于本管理器；写入未结算前不释放会话
        await this.awaitOutputWritesQuiescent(session);
        this.releaseSession(session);
    }

    /** 尽力保存失败记录；返回清理步骤自身的故障（没有则返回 undefined）。 */
    private async persistFailedRecord(session: ManagedSession, message: string): Promise<unknown | undefined> {
        try {
            await this.enqueueWrite(session, () => this.store.saveSession({
                goalId: session.goalId,
                processId: session.processId,
                command: session.command,
                status: "failed",
                hostInstanceId: this.hostInstanceId,
                startedAt: session.startedAt,
                ...(session.actionId !== undefined ? { actionId: session.actionId } : {}),
                exitedAt: new Date().toISOString(),
                error: message,
            }));
            return undefined;
        } catch (error) {
            this.recordFailure(session, "settlement", error);
            return error;
        }
    }

    /** 串行化同一会话的记录写入；单次失败不阻塞后续结算任务。 */
    private enqueueWrite(session: ManagedSession, write: () => Promise<void>): Promise<void> {
        const next = session.writeChain.then(write, write);
        session.writeChain = next.then(
            () => undefined,
            () => undefined,
        );
        return next;
    }

    private requestHandleTermination(session: ManagedSession, force: boolean): void {
        const child = session.child;
        if (child === undefined) {
            return;
        }
        // 已退出的句柄不再发送信号：PID 可能已被复用，迟到信号不得指向新进程
        if (child.exitCode !== null || child.signalCode !== null) {
            session.stopRequested = true;
            return;
        }

        session.stopRequested = true;
        session.cancelGrace?.();
        session.cancelGrace = undefined;
        try {
            if (force) {
                // 强制升级直接发 SIGKILL，不保留可迟到的 0ms 宽限定时器
                sendSignalToProcessGroup(child, "SIGKILL");
                return;
            }
            const { cancelGrace } = killProcessGroup(child);
            session.cancelGrace = cancelGrace;
        } catch (error) {
            this.recordFailure(session, "stop", error);
        }
    }

    /** 等待会话结算；窗口到期时返回 false，未确认退出由调用方保留处理权。 */
    private awaitSettlement(session: ManagedSession, timeoutMs: number): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            let timer: NodeJS.Timeout | undefined;
            const settle = (value: boolean): void => {
                clearTimeout(timer);
                timer = undefined;
                resolve(value);
            };
            timer = setTimeout(() => settle(false), timeoutMs);
            void session.done.then(() => settle(true));
        });
    }

    private async performClose(force: boolean): Promise<void> {
        this.closing = true;
        const sessions = [...this.sessions.values()];
        for (const session of sessions) {
            if (session.child !== undefined) {
                this.requestHandleTermination(session, force);
            }
        }
        await Promise.allSettled(sessions.map((session) => session.done));
    }

    private releaseSession(session: ManagedSession): void {
        this.sessions.delete(session.key);
        this.releaseHistoryReservation(session);

        const failure = session.firstFailure;
        if (failure !== undefined && failure !== session.reportedFailure) {
            session.reportedFailure = failure;
            this.settlementFailures.push({
                goalId: session.goalId,
                processId: session.processId,
                stage: failure.stage,
                reason: failure.error,
                unconfirmed: undefined,
            });
        }
        session.resolveDone();
    }

    /** 取出并移除指定会话的未报告失败；用于已向调用方报告的停止结果。 */
    private takeSettlementFailure(goalId: string, processId: string): ProcessSessionFailure | undefined {
        const index = this.settlementFailures.findIndex(
            (failure) => failure.goalId === goalId && failure.processId === processId,
        );
        if (index < 0) {
            return undefined;
        }
        const [failure] = this.settlementFailures.splice(index, 1);
        return failure;
    }

    /** 关闭只能在所有自有会话结算且无未报告失败时报告成功。 */
    private assertCleanClose(): void {
        if (this.settlementFailures.length === 0) {
            return;
        }
        const failures = [...this.settlementFailures];
        const primary = failures[0]!;
        throw new ProcessSessionError(
            `Process manager close completed with ${failures.length} unreported settlement failure(s)`,
            {
                stage: primary.stage,
                goalId: primary.goalId,
                processId: primary.processId,
                cause: primary.reason,
                failures,
            },
        );
    }

    private recordFailure(session: ManagedSession, stage: ProcessFailureStage, error: unknown): void {
        if (session.firstFailure === undefined) {
            session.firstFailure = { stage, error };
        }
    }

    private unpersistedCount(goalId: string): number {
        let count = 0;
        for (const session of this.sessions.values()) {
            if (session.goalId === goalId && !session.persisted) {
                count += 1;
            }
        }
        return count;
    }

    /** 历史名额仲裁：已确认磁盘记录 + 已授予名额 + 本次自身。 */
    private historyReserve(session: ManagedSession): boolean {
        const known = this.knownSessions.get(session.goalId)?.size ?? 0;
        const reserved = this.reservedHistory.get(session.goalId) ?? 0;
        if (known + reserved + 1 > PROCESS_MAX_SESSIONS_PER_GOAL) {
            return false;
        }
        session.historyReserved = true;
        this.reservedHistory.set(session.goalId, reserved + 1);
        return true;
    }

    private releaseHistoryReservation(session: ManagedSession): void {
        if (!session.historyReserved) {
            return;
        }
        session.historyReserved = false;
        const reserved = this.reservedHistory.get(session.goalId) ?? 0;
        if (reserved > 0) {
            this.reservedHistory.set(session.goalId, reserved - 1);
        }
    }

    private markKnownSession(goalId: string, processId: string): void {
        const known = this.knownSessions.get(goalId) ?? new Set<string>();
        known.add(processId);
        this.knownSessions.set(goalId, known);
    }

    private mergeKnownSessions(goalId: string, listed: readonly ProcessSessionRecord[]): void {
        const known = this.knownSessions.get(goalId) ?? new Set<string>();
        for (const record of listed) {
            known.add(record.processId);
        }
        this.knownSessions.set(goalId, known);
    }
}

/** 将未知失败原因转换为诊断文本，不附加命令、环境或输出正文。 */
function describeUnknown(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
