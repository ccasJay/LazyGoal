/** 进程会话元数据文件的持久化 DTO。 */
export interface ProcessSessionFileRecord {
    readonly goalId: string;
    readonly processId: string;
    readonly command: string;
    readonly status: "starting" | "running" | "exited" | "stopped" | "failed" | "interrupted";
    readonly hostInstanceId: string;
    readonly startedAt: string;
    readonly exitedAt?: string;
    readonly exitCode?: number | null;
    readonly signal?: string | null;
    readonly error?: string;
    readonly actionId?: string;
}

/** 轮转日志元数据文件。 */
export interface ProcessChannelMetaFile {
    /** 当前已被覆盖丢弃的最早绝对字节偏移。 */
    headOffset: number;
    /** 当前已写入的总绝对字节偏移。 */
    tailOffset: number;
    /** 各分片文件的绝对起始字节偏移与大小。 */
    parts: {
        index: number;
        startOffset: number;
        bytes: number;
    }[];
}
