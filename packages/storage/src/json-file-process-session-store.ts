import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

import type {
    ProcessOutputChannel,
    ProcessOutputChunk,
    ProcessSessionRecord,
    ProcessSessionStatus,
    ProcessSessionStore,
} from "../../runtime/src/index";

/** 单个轮转日志文件的最大字节数（512 KiB）。 */
export const PROCESS_LOG_MAX_FILE_BYTES = 512 * 1024;

/** 单个通道保留的轮转日志文件数量（固定 2 个：part-0.log 与 part-1.log）。 */
const PROCESS_LOG_MAX_ROTATION_PARTS = 2;

/**
 * 进程会话记录持久化 DTO Schema。
 */
export const ProcessSessionDtoSchema = z.object({
    goalId: z.string().min(1),
    processId: z.string().min(1),
    command: z.string().min(1),
    status: z.enum([
        "starting",
        "running",
        "exited",
        "stopped",
        "failed",
        "interrupted",
    ]),
    hostInstanceId: z.string().min(1),
    startedAt: z.string().datetime(),
    exitedAt: z.string().datetime().optional(),
    exitCode: z.number().int().nullable().optional(),
    signal: z.string().nullable().optional(),
    error: z.string().optional(),
    actionId: z.string().min(1).optional(),
}).strict();

export type ProcessSessionDto = z.infer<typeof ProcessSessionDtoSchema>;

/**
 * 轮转日志元数据文件 Schema。
 */
const ChannelMetaSchema = z.object({
    /** 当前已被覆盖丢弃的最早绝对字节偏移。 */
    headOffset: z.number().int().nonnegative(),
    /** 当前已写入的总绝对字节偏移。 */
    tailOffset: z.number().int().nonnegative(),
    /** 各分片文件的绝对起始字节偏移与大小。 */
    parts: z.array(z.object({
        index: z.number().int().nonnegative(),
        startOffset: z.number().int().nonnegative(),
        bytes: z.number().int().nonnegative(),
    })),
}).strict();

type ChannelMeta = z.infer<typeof ChannelMetaSchema>;

/**
 * 基于本地 JSON 文件与轮转日志的 ProcessSessionStore 实现。
 *
 * @remarks
 * 存储目录结构：`<baseDirectory>/processes/<encodedGoalId>/<encodedProcessId>/`。
 * 所有目录权限使用 0700，元数据与日志文件使用 0600。
 * 元数据通过临时文件及原子替换（rename）写入。
 * 每个通道（stdout / stderr）维护最多 2 个分片文件（part-0.log, part-1.log），每片最多 512 KiB，
 * 记录全局绝对字节偏移；当游标落后于最早留存字节时，设置 gap: true 明确告知日志缺口。
 * 宿主实例重启时，如果读取到的记录非终态且宿主标识不属于当前活跃实例，投影为 "interrupted"。
 *
 * @example
 * ```ts
 * const store = new JsonFileProcessSessionStore("/workspace/.lazygoal", "host-uuid-1");
 * await store.saveSession(record);
 * ```
 */
export class JsonFileProcessSessionStore implements ProcessSessionStore {
    private readonly baseDirectory: string;
    private readonly currentHostInstanceId: string;
    private readonly writeLocks = new Map<string, Promise<void>>();

    /**
     * @param baseDirectory - 进程存储的根目录（通常为 `<workspaceHome>/processes` 或 `<baseDirectory>`）。
     * @param currentHostInstanceId - 当前宿主运行时实例随机标识。
     */
    constructor(baseDirectory: string, currentHostInstanceId: string) {
        this.baseDirectory = baseDirectory;
        this.currentHostInstanceId = currentHostInstanceId;
    }

    private encodeGoalId(goalId: string): string {
        return Buffer.from(goalId, "utf8").toString("base64url");
    }

    private encodeProcessId(processId: string): string {
        return Buffer.from(processId, "utf8").toString("base64url");
    }

    private getProcessDirectory(goalId: string, processId: string): string {
        return join(
            this.baseDirectory,
            "processes",
            this.encodeGoalId(goalId),
            this.encodeProcessId(processId),
        );
    }

    private getSessionFilePath(goalId: string, processId: string): string {
        return join(this.getProcessDirectory(goalId, processId), "session.json");
    }

    private getChannelDirectory(goalId: string, processId: string, channel: ProcessOutputChannel): string {
        return join(this.getProcessDirectory(goalId, processId), channel);
    }

    private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
        const prev = this.writeLocks.get(key) ?? Promise.resolve();
        let release: () => void;
        const next = new Promise<void>((r) => { release = r; });
        this.writeLocks.set(key, prev.then(() => next));
        try {
            await prev;
            return await fn();
        } finally {
            release!();
            if (this.writeLocks.get(key) === next) {
                this.writeLocks.delete(key);
            }
        }
    }

    /**
     * 保存或更新进程会话元数据（原子替换）。
     */
    async saveSession(session: ProcessSessionRecord): Promise<void> {
        const validated = ProcessSessionDtoSchema.parse(session);
        const lockKey = `${session.goalId}:${session.processId}:session`;

        await this.withLock(lockKey, async () => {
            const dir = this.getProcessDirectory(session.goalId, session.processId);
            await mkdir(dir, { recursive: true, mode: 0o700 });

            const filePath = this.getSessionFilePath(session.goalId, session.processId);
            const tempPath = join(dir, `.session-${randomUUID()}.tmp`);

            const handle = await open(tempPath, "w", 0o600);
            try {
                await handle.writeFile(JSON.stringify(validated, null, 2), "utf8");
                await handle.sync();
            } finally {
                await handle.close();
            }

            try {
                await rename(tempPath, filePath);
            } catch (err) {
                try {
                    await unlink(tempPath);
                } catch {}
                // 如果父目录在此期间被清理，则忽略
                if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
                    throw err;
                }
            }
        });
    }

    /**
     * 读取指定 Goal 下单个进程会话的元数据。若属于旧宿主实例且非终态，投影为 interrupted。
     */
    async getSession(goalId: string, processId: string): Promise<ProcessSessionRecord | undefined> {
        const filePath = this.getSessionFilePath(goalId, processId);
        let content: string;
        try {
            content = await readFile(filePath, "utf8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return undefined;
            }
            throw error;
        }

        const raw = JSON.parse(content);
        const parsed = ProcessSessionDtoSchema.parse(raw);

        // 投影检查：非终态（starting / running）且不是当前宿主实例，投影为 interrupted
        const isTerminal = parsed.status === "exited"
            || parsed.status === "stopped"
            || parsed.status === "failed"
            || parsed.status === "interrupted";

        if (!isTerminal && parsed.hostInstanceId !== this.currentHostInstanceId) {
            return {
                ...parsed,
                status: "interrupted",
                error: parsed.error ?? "Process was interrupted by host restart or termination.",
            } as ProcessSessionRecord;
        }

        return parsed as ProcessSessionRecord;
    }

    /**
     * 列出指定 Goal 下的所有进程会话。
     */
    async listSessions(goalId: string): Promise<readonly ProcessSessionRecord[]> {
        const goalDir = join(this.baseDirectory, "processes", this.encodeGoalId(goalId));
        let entries: string[];
        try {
            entries = await readdir(goalDir);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return [];
            }
            throw error;
        }

        const sessions: ProcessSessionRecord[] = [];
        for (const entry of entries) {
            const sessionPath = join(goalDir, entry, "session.json");
            try {
                const content = await readFile(sessionPath, "utf8");
                const parsed = ProcessSessionDtoSchema.parse(JSON.parse(content));
                const isTerminal = parsed.status === "exited"
                    || parsed.status === "stopped"
                    || parsed.status === "failed"
                    || parsed.status === "interrupted";

                if (!isTerminal && parsed.hostInstanceId !== this.currentHostInstanceId) {
                    sessions.push({
                        ...parsed,
                        status: "interrupted",
                        error: parsed.error ?? "Process was interrupted by host restart or termination.",
                    } as ProcessSessionRecord);
                } else {
                    sessions.push(parsed as ProcessSessionRecord);
                }
            } catch {
                // 跳过不完整或非进程目录
            }
        }

        // 按 startedAt 降序排列
        return sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    }

    private async readMeta(channelDir: string): Promise<ChannelMeta> {
        const metaPath = join(channelDir, "meta.json");
        try {
            const content = await readFile(metaPath, "utf8");
            return ChannelMetaSchema.parse(JSON.parse(content));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return {
                    headOffset: 0,
                    tailOffset: 0,
                    parts: [],
                };
            }
            throw error;
        }
    }

    private async writeMeta(channelDir: string, meta: ChannelMeta): Promise<void> {
        const metaPath = join(channelDir, "meta.json");
        const tempPath = join(channelDir, `.meta-${randomUUID()}.tmp`);
        try {
            await mkdir(channelDir, { recursive: true, mode: 0o700 });
            const handle = await open(tempPath, "w", 0o600);
            try {
                await handle.writeFile(JSON.stringify(meta, null, 2), "utf8");
                await handle.sync();
            } finally {
                await handle.close();
            }
            await rename(tempPath, metaPath);
        } catch (error) {
            // 如果底层目录在进程退出或清理阶段已不存在，静默忽略以避免未捕获异常
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return;
            }
            throw error;
        }
    }

    /**
     * 追加进程输出到指定通道的轮转日志文件中。
     */
    async appendOutput(
        goalId: string,
        processId: string,
        channel: ProcessOutputChannel,
        text: string,
    ): Promise<void> {
        if (text.length === 0) return;

        const channelDir = this.getChannelDirectory(goalId, processId, channel);
        await mkdir(channelDir, { recursive: true, mode: 0o700 });

        const lockKey = `${goalId}:${processId}:${channel}`;
        await this.withLock(lockKey, async () => {
            const meta = await this.readMeta(channelDir);
            const textBuffer = Buffer.from(text, "utf8");
            let remaining = textBuffer;

            while (remaining.length > 0) {
                let currentPart = meta.parts[meta.parts.length - 1];
                if (currentPart === undefined || currentPart.bytes >= PROCESS_LOG_MAX_FILE_BYTES) {
                    // 需要新建分片
                    const nextIndex = currentPart === undefined ? 0 : currentPart.index + 1;
                    const newPart = {
                        index: nextIndex,
                        startOffset: meta.tailOffset,
                        bytes: 0,
                    };
                    meta.parts.push(newPart);
                    currentPart = newPart;

                    // 轮转清理：如果分片超过最大保留数量，移除最旧的分片并删除文件
                    while (meta.parts.length > PROCESS_LOG_MAX_ROTATION_PARTS) {
                        const dropped = meta.parts.shift()!;
                        meta.headOffset = dropped.startOffset + dropped.bytes;
                        const droppedFile = join(channelDir, `part-${dropped.index}.log`);
                        try {
                            await unlink(droppedFile);
                        } catch {
                            // 忽略删除失败
                        }
                    }
                }

                const availableInPart = PROCESS_LOG_MAX_FILE_BYTES - currentPart.bytes;
                const toWrite = remaining.subarray(0, availableInPart);
                remaining = remaining.subarray(availableInPart);

                const partFile = join(channelDir, `part-${currentPart.index}.log`);
                try {
                    const handle = await open(partFile, "a", 0o600);
                    try {
                        await handle.writeFile(toWrite);
                        await handle.sync();
                    } finally {
                        await handle.close();
                    }
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                        return;
                    }
                    throw error;
                }

                currentPart.bytes += toWrite.length;
                meta.tailOffset += toWrite.length;
            }

            await this.writeMeta(channelDir, meta);
        });
    }

    /**
     * 从指定绝对字节游标开始，有界读取指定通道的输出日志。
     */
    async readOutput(
        goalId: string,
        processId: string,
        channel: ProcessOutputChannel,
        cursor?: number,
        maxBytes = 64 * 1024,
    ): Promise<ProcessOutputChunk> {
        const channelDir = this.getChannelDirectory(goalId, processId, channel);
        const lockKey = `${goalId}:${processId}:${channel}`;

        return await this.withLock(lockKey, async () => {
            const meta = await this.readMeta(channelDir);
            const reqCursor = cursor ?? meta.headOffset;

            let gap = false;
            let readStart = reqCursor;

            if (readStart < meta.headOffset) {
                gap = true;
                readStart = meta.headOffset;
            }

            if (readStart >= meta.tailOffset || meta.parts.length === 0) {
                return {
                    text: "",
                    nextCursor: meta.tailOffset,
                    headCursor: meta.headOffset,
                    gap,
                };
            }

            let collected = Buffer.alloc(0);
            let currentOffset = readStart;
            const targetEnd = Math.min(readStart + maxBytes, meta.tailOffset);

            for (const part of meta.parts) {
                const partEnd = part.startOffset + part.bytes;
                if (currentOffset >= partEnd) continue;
                if (currentOffset < part.startOffset) currentOffset = part.startOffset;

                const offsetInPart = currentOffset - part.startOffset;
                const bytesToRead = Math.min(partEnd - currentOffset, targetEnd - currentOffset);
                if (bytesToRead <= 0) break;

                const partFile = join(channelDir, `part-${part.index}.log`);
                try {
                    const handle = await open(partFile, "r");
                    try {
                        const buf = Buffer.alloc(bytesToRead);
                        const { bytesRead } = await handle.read(buf, 0, bytesToRead, offsetInPart);
                        collected = Buffer.concat([collected, buf.subarray(0, bytesRead)]);
                        currentOffset += bytesRead;
                    } finally {
                        await handle.close();
                    }
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                        // 分片文件已丢失，更新 gap
                        gap = true;
                    } else {
                        throw error;
                    }
                }

                if (currentOffset >= targetEnd) break;
            }

            return {
                text: collected.toString("utf8"),
                nextCursor: currentOffset,
                headCursor: meta.headOffset,
                gap,
            };
        });
    }

    /**
     * 删除指定 Goal 下的所有进程会话及日志。
     */
    async deleteGoalSessions(goalId: string): Promise<void> {
        const goalDir = join(this.baseDirectory, "processes", this.encodeGoalId(goalId));
        try {
            await rm(goalDir, { recursive: true, force: true });
        } catch {
            // 忽略删除失败
        }
    }
}
