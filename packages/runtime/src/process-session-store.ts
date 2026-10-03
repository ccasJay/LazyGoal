import type { ExecutionControl } from "./execution-control";

/**
 * 受管进程生命周期的持久化状态。
 *
 * @remarks
 * - `starting`: 进程正在启动中或刚完成启动，尚未进入稳定循环。
 * - `running`: 进程处于正常运行状态。
 * - `exited`: 进程已自然退出（包含成功或非零错误退出）。
 * - `stopped`: 进程已被用户或宿主通过 stop 明确终止。
 * - `failed`: 进程启动失败或执行发生不可恢复的基础设施错误。
 * - `interrupted`: 跨宿主重启或崩溃恢复后，原存活进程被投影为中断状态（不重连/不误杀）。
 */
export type ProcessSessionStatus =
    | "starting"
    | "running"
    | "exited"
    | "stopped"
    | "failed"
    | "interrupted";

/**
 * 进程标准输出/标准错误单通道名称。
 */
export type ProcessOutputChannel = "stdout" | "stderr";

/**
 * 单条受管进程会话持久化元数据。
 *
 * @example
 * ```ts
 * const session: ProcessSessionRecord = {
 *   goalId: "goal-1",
 *   processId: "proc-1",
 *   command: "npm test",
 *   status: "running",
 *   hostInstanceId: "host-uuid-1",
 *   startedAt: "2026-03-31T00:00:00.000Z",
 * };
 * ```
 */
export interface ProcessSessionRecord {
    /** 所属 Goal 的稳定唯一标识。 */
    readonly goalId: string;
    /** 该进程会话的稳定唯一标识。 */
    readonly processId: string;
    /** 启动时执行的完整 Shell 命令。 */
    readonly command: string;
    /** 当前记录的进程生命周期状态。 */
    readonly status: ProcessSessionStatus;
    /** 启动该进程的宿主运行时实例随机标识（用于跨宿主实例隔离与中断投影）。 */
    readonly hostInstanceId: string;
    /** 进程启动的 ISO-8601 时间戳。 */
    readonly startedAt: string;
    /** 进程退出的 ISO-8601 时间戳（若已结束）。 */
    readonly exitedAt?: string | undefined;
    /** 退出时的数字状态码（若正常退出）。 */
    readonly exitCode?: number | null | undefined;
    /** 退出时的终止信号（若被信号杀死）。 */
    readonly signal?: NodeJS.Signals | string | null | undefined;
    /** 失败或终止时的错误诊断信息。 */
    readonly error?: string | undefined;
    /** 启动该进程所关联的 Action 标识。 */
    readonly actionId?: string | undefined;
}

/**
 * 单通道日志读取返回的有界分片。
 *
 * @example
 * ```ts
 * const chunk: ProcessOutputChunk = {
 *   text: "Compilation succeeded\n",
 *   nextCursor: 1024,
 *   headCursor: 0,
 *   gap: false,
 * };
 * ```
 */
export interface ProcessOutputChunk {
    /** 读取到的文本内容。 */
    readonly text: string;
    /** 下一次继续读取的绝对字节游标。 */
    readonly nextCursor: number;
    /** 当前留存日志最早可读的起始绝对字节偏移。 */
    readonly headCursor: number;
    /** 传入的 cursor 是否落后于最早留存字节而发生了日志缺口（被轮转覆盖丢弃）。 */
    readonly gap: boolean;
}

/**
 * 读取多通道进程日志的组合结果。
 *
 * @example
 * ```ts
 * const result: ProcessReadOutputResult = {
 *   stdout: { text: "...", nextCursor: 100, headCursor: 0, gap: false },
 *   stderr: { text: "", nextCursor: 0, headCursor: 0, gap: false },
 * };
 * ```
 */
export interface ProcessReadOutputResult {
    /** stdout 读取分片。 */
    readonly stdout: ProcessOutputChunk;
    /** stderr 读取分片。 */
    readonly stderr: ProcessOutputChunk;
}

/**
 * 进程会话持久化与轮转日志 Storage Port。
 *
 * @remarks
 * 定义按 Goal 隔离的长进程生命周期元数据存储与轮转日志管理边界。
 * 遵循 0700 目录与 0600 文件安全权限，支持绝对字节偏移游标消费与宿主实例中断投影。
 *
 * @example
 * ```ts
 * await store.saveSession(session);
 * const record = await store.getSession("goal-1", "proc-1");
 * ```
 */
export interface ProcessSessionStore {
    /**
     * 保存或更新进程会话元数据（原子写）。
     *
     * @param session - 进程会话记录。
     */
    saveSession(session: ProcessSessionRecord): Promise<void>;

    /**
     * 获取指定 Goal 下单个进程会话的最新元数据。
     *
     * @param goalId - 所属 Goal 标识。
     * @param processId - 目标进程标识。
     * @returns 进程会话元数据；不存在时返回 `undefined`。
     */
    getSession(goalId: string, processId: string): Promise<ProcessSessionRecord | undefined>;

    /**
     * 列出指定 Goal 下的所有进程会话（支持按创建时间倒序）。
     *
     * @param goalId - 所属 Goal 标识。
     * @returns 进程会话记录数组。
     */
    listSessions(goalId: string): Promise<readonly ProcessSessionRecord[]>;

    /**
     * 追加进程输出到指定通道的轮转日志文件中。
     *
     * @param goalId - 所属 Goal 标识。
     * @param processId - 目标进程标识。
     * @param channel - 输出通道 ("stdout" | "stderr")。
     * @param text - 待追加的文本块。
     */
    appendOutput(
        goalId: string,
        processId: string,
        channel: ProcessOutputChannel,
        text: string,
    ): Promise<void>;

    /**
     * 从指定绝对字节游标开始，有界读取指定通道的输出日志。
     *
     * @param goalId - 所属 Goal 标识。
     * @param processId - 目标进程标识。
     * @param channel - 输出通道 ("stdout" | "stderr")。
     * @param cursor - 绝对字节偏移游标（省略或 0 从当前最早留存或指定位置起读）。
     * @param maxBytes - 单次最大读取字节数限制。
     * @returns 包含读取文本、新游标和缺口标志的分片。
     */
    readOutput(
        goalId: string,
        processId: string,
        channel: ProcessOutputChannel,
        cursor?: number,
        maxBytes?: number,
    ): Promise<ProcessOutputChunk>;

    /**
     * 删除指定 Goal 下的所有进程会话及其日志文件（在 Goal 销毁/删除时调用）。
     *
     * @param goalId - 待清理的目标 Goal 标识。
     */
    deleteGoalSessions(goalId: string): Promise<void>;
}
