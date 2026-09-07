import {
    appendFile,
    mkdir,
    open,
    readFile,
    type FileHandle,
} from "node:fs/promises";
import { join } from "node:path";

import type {
    TrajectoryEvent,
    TrajectoryEventDraft,
    TrajectoryReadQuery,
    TrajectoryReadResult,
    TrajectoryStore,
} from "../../runtime/src/index";
import {
    allocateImmutableEvent,
    assertValidTrajectoryEventDraft,
    classifyTrajectoryTail,
    freezeTrajectoryEvent,
    TrajectoryProtocolError,
} from "../../runtime/src/index";

/** 尾部反向扫描的单次回读块大小(字节)。 */
const TAIL_SCAN_BLOCK_BYTES = 4_096;

/**
 * 解析尾部扫描定位到的最后一个非空行,提取其 `sequence`。
 *
 * @remarks
 * 只做序号确定所需的最小校验;与读取路径同类错误语义,错误信息以行起始
 * 字节偏移定位,区别于读取路径的行号。
 *
 * @param line - 完整的非空 JSONL 行文本。
 * @param lineOffset - 行起始字节偏移,用于错误信息。
 * @param goalId - 期望的 Goal 标识。
 * @param runId - 期望的 Run 标识。
 * @returns 行内事件的序号。
 * @throws JSON 非法、标识不匹配或序号非正整数时抛 `TrajectoryProtocolError`。
 */
function parseTailSequence(
    line: string,
    lineOffset: number,
    goalId: string,
    runId: string,
): number {
    let parsed: unknown;

    try {
        parsed = JSON.parse(line);
    } catch {
        throw new TrajectoryProtocolError(
            `Invalid Trajectory JSONL at byte offset ${lineOffset}`,
        );
    }

    const event = parsed as Record<string, unknown> | null;

    if (
        event === null
        || typeof event !== "object"
        || event.goalId !== goalId
        || event.runId !== runId
    ) {
        throw new TrajectoryProtocolError(
            `Trajectory event identity mismatch at byte offset ${lineOffset}`,
        );
    }

    const sequence = event.sequence;

    if (
        typeof sequence !== "number"
        || !Number.isInteger(sequence)
        || sequence < 1
    ) {
        throw new TrajectoryProtocolError(
            `Trajectory sequence must be a positive integer at byte offset ${lineOffset}`,
        );
    }

    return sequence;
}

/**
 * 基于 JSONL 文件的单进程 Trajectory Store。
 *
 * @remarks
 * 每个 `(goalId, runId)` 使用独立的
 * `<directory>/<base64url(goalId)>/<base64url(runId)>.jsonl` 文件。实例内追加
 * 按 Run 串行化,下一序号优先取实例内会话级序号缓存,缓存 miss 时从文件尾部
 * 反向扫描最后非空行取得,不读取全部历史;缓存只承担性能角色,实例重建后
 * 自然失效,恢复权威始终是读取路径的全量协议校验。该实现不提供跨进程锁、
 * Outbox 或 exactly-once 语义。Snapshot 的 `committedThroughSequence` 由调用方
 * 传入,不从 `state_committed` marker 推导。
 *
 * @example
 * ```ts
 * const store = new JsonFileTrajectoryStore(".lazygoal/trajectories");
 * await store.append(draft);
 * const view = await store.readWithBoundary(
 *     { goalId: "goal-1", runId: "run-1" },
 *     3,
 * );
 * ```
 */
export class JsonFileTrajectoryStore implements TrajectoryStore {
    private readonly appendQueues = new Map<string, Promise<unknown>>();

    private readonly sequenceCache = new Map<string, number>();

    /**
     * @param directory - JSONL 轨迹根目录；追加时按需创建 Goal 子目录。
     */
    constructor(private readonly directory: string) {}

    /**
     * 串行追加一个事实事件并分配同一 Run 内的下一个序号。
     *
     * @remarks
     * 下一序号优先取会话级序号缓存,缓存 miss 时从文件尾部反向扫描最后一个
     * 非空行确定;追加不读取、解析全部历史,因此历史中段的损坏不再于追加时
     * 发现,检测时机后移到读取(fail-closed 语义不变)。
     *
     * @param draft - 已发生事实的 Domain Event 草稿。
     * @returns 深度冻结且与输入隔离的事件。
     * @throws 草稿非法或尾部行最小校验失败(JSON 非法、Goal/Run 标识不匹配、
     *   序号非正整数)时抛出 `TrajectoryProtocolError`；文件系统错误原样传播。
     */
    append(draft: TrajectoryEventDraft): Promise<Readonly<TrajectoryEvent>> {
        assertValidTrajectoryEventDraft(draft);
        const key = this.keyFor(draft.goalId, draft.runId);
        const filePath = this.filePath(draft.goalId, draft.runId);
        const previous = this.appendQueues.get(key) ?? Promise.resolve();
        const operation = previous.catch(() => undefined).then(async () => {
            const lastSequence = this.sequenceCache.get(key)
                ?? await this.readLastStoredSequence(
                    filePath,
                    draft.goalId,
                    draft.runId,
                );
            const sequence = lastSequence + 1;
            const event = allocateImmutableEvent(draft, sequence);

            await mkdir(join(this.directory, this.encodeIdentifier(draft.goalId)), {
                recursive: true,
            });
            await appendFile(
                filePath,
                `${JSON.stringify(event)}\n`,
                { encoding: "utf8", mode: 0o600 },
            );
            this.sequenceCache.set(key, sequence);
            return event;
        });
        let tracked: Promise<unknown>;
        // tracked 只承担队列簿记,吞掉拒绝避免无人处理的 rejection;
        // 失败仍通过返回的 operation 传播给调用方。
        tracked = operation
            .catch(() => undefined)
            .finally(() => {
                if (this.appendQueues.get(key) === tracked) {
                    this.appendQueues.delete(key);
                }
            });
        this.appendQueues.set(key, tracked);
        return operation;
    }

    /**
     * 读取一个 Run 的严格 JSONL 事件。
     *
     * @param query - Goal/Run 标识和可选的闭区间序列范围。
     * @returns 按序号升序排列的深度冻结事件；文件不存在时返回空数组。
     * @throws 非法 JSON、事件协议、Goal/Run 标识或序列顺序错误时抛出
     * `TrajectoryProtocolError`。
     */
    async read(query: TrajectoryReadQuery): Promise<readonly TrajectoryEvent[]> {
        this.assertQuery(query);
        const events = await this.readStoredEvents(
            this.filePath(query.goalId, query.runId),
            query.goalId,
            query.runId,
        );
        const fromSequence = query.fromSequence ?? 1;
        const toSequence = query.toSequence ?? Number.POSITIVE_INFINITY;

        return Object.freeze(events.filter((event) =>
            event.sequence >= fromSequence && event.sequence <= toSequence,
        ));
    }

    /**
     * 读取事件并以最新有效 Snapshot 的提交边界分类。
     *
     * @param query - Goal/Run 标识和可选的闭区间序列范围。
     * @param committedThroughSequence - Snapshot 记录的最大已提交序号。
     * @returns 不合并已提交事件与未提交 tail 的只读结果。
     * @throws 边界、查询或 JSONL 协议非法时拒绝。
     */
    async readWithBoundary(
        query: TrajectoryReadQuery,
        committedThroughSequence: number,
    ): Promise<Readonly<TrajectoryReadResult>> {
        const events = await this.read(query);
        return classifyTrajectoryTail(events, committedThroughSequence);
    }

    /**
     * 从文件尾部反向扫描最后一个非空 JSONL 行,返回其 `sequence`。
     *
     * @remarks
     * 以固定块(4 KiB)从文件尾向前回读,累积到能完整框住最后一个非空行为止;
     * 行首可能被块边界截断时继续向前读,读到文件头后首段即完整行。文件不
     * 存在、为空或只有空行时返回 0。只做定位序号所需的最小校验:JSON 可
     * 解析、`goalId`/`runId` 匹配、`sequence` 为正整数;完整协议校验仍由
     * 读取路径负责。
     *
     * @param filePath - 目标 JSONL 文件。
     * @param goalId - 期望的 Goal 标识。
     * @param runId - 期望的 Run 标识。
     * @returns 文件中最后一个非空事件的序号;无事件时为 0。
     * @throws 尾部行 JSON 非法、标识不匹配或序号非正整数时抛
     *   `TrajectoryProtocolError`,错误信息含行起始字节偏移。
     */
    private async readLastStoredSequence(
        filePath: string,
        goalId: string,
        runId: string,
    ): Promise<number> {
        let handle: FileHandle;

        try {
            handle = await open(filePath, "r");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return 0;
            }

            throw error;
        }

        try {
            const { size } = await handle.stat();
            const chunks: Buffer[] = [];
            let position = size;

            while (position > 0) {
                const readSize = Math.min(TAIL_SCAN_BLOCK_BYTES, position);
                position -= readSize;
                const block = Buffer.alloc(readSize);
                await handle.read(block, 0, readSize, position);
                chunks.unshift(block);

                const segments = Buffer.concat(chunks).toString("utf8")
                    .split("\n");
                const headReached = position === 0;

                for (let index = segments.length - 1; index >= 0; index -= 1) {
                    const segment = segments[index];

                    if (segment === undefined || segment.trim() === "") {
                        continue;
                    }

                    // 未到文件头时最前段的行首可能被截断,需继续向前读。
                    if (index === 0 && !headReached) {
                        break;
                    }

                    let lineOffset = position;

                    for (let preceding = 0; preceding < index; preceding += 1) {
                        const precedingSegment = segments[preceding];

                        if (precedingSegment === undefined) {
                            continue;
                        }

                        lineOffset += Buffer.byteLength(precedingSegment) + 1;
                    }

                    return parseTailSequence(segment, lineOffset, goalId, runId);
                }
            }

            return 0;
        } finally {
            await handle.close();
        }
    }

    private async readStoredEvents(
        filePath: string,
        goalId: string,
        runId: string,
    ): Promise<readonly TrajectoryEvent[]> {
        let content: string;

        try {
            content = await readFile(filePath, "utf8");
        } catch (error) {
            if (
                error instanceof Error
                && (error as NodeJS.ErrnoException).code === "ENOENT"
            ) {
                return [];
            }

            throw error;
        }

        const events: TrajectoryEvent[] = [];
        let previousSequence = 0;
        const lines = content.split(/\r?\n/);

        for (const [index, line] of lines.entries()) {
            if (line.trim().length === 0) continue;

            let parsed: unknown;

            try {
                parsed = JSON.parse(line);
            } catch {
                throw new TrajectoryProtocolError(
                    `Invalid Trajectory JSONL at line ${index + 1}`,
                );
            }

            let event: Readonly<TrajectoryEvent>;

            try {
                event = freezeTrajectoryEvent(parsed as TrajectoryEvent);
            } catch {
                throw new TrajectoryProtocolError(
                    `Invalid Trajectory event at line ${index + 1}`,
                );
            }

            if (event.goalId !== goalId || event.runId !== runId) {
                throw new TrajectoryProtocolError(
                    `Trajectory event identity mismatch at line ${index + 1}`,
                );
            }

            if (event.sequence <= previousSequence) {
                throw new TrajectoryProtocolError(
                    `Trajectory sequence must increase at line ${index + 1}`,
                );
            }

            previousSequence = event.sequence;
            events.push(event);
        }

        return Object.freeze(events);
    }

    private assertQuery(query: TrajectoryReadQuery): void {
        this.keyFor(query.goalId, query.runId);
        const values = [query.fromSequence, query.toSequence];

        for (const value of values) {
            if (
                value !== undefined
                && (!Number.isInteger(value) || value < 0)
            ) {
                throw new TrajectoryProtocolError(
                    "Trajectory sequence range must use non-negative integers",
                );
            }
        }

        if (
            query.fromSequence !== undefined
            && query.toSequence !== undefined
            && query.fromSequence > query.toSequence
        ) {
            throw new TrajectoryProtocolError(
                "Trajectory sequence range is inverted",
            );
        }
    }

    private keyFor(goalId: string, runId: string): string {
        this.assertIdentifier(goalId, "goalId");
        this.assertIdentifier(runId, "runId");
        return `${goalId}\u0000${runId}`;
    }

    private filePath(goalId: string, runId: string): string {
        return join(
            this.directory,
            this.encodeIdentifier(goalId),
            `${this.encodeIdentifier(runId)}.jsonl`,
        );
    }

    private encodeIdentifier(value: string): string {
        this.assertIdentifier(value, "trajectory identifier");
        return Buffer.from(value, "utf8").toString("base64url");
    }

    private assertIdentifier(value: string, field: string): void {
        if (typeof value !== "string" || value.length === 0) {
            throw new TrajectoryProtocolError(`${field} must be a non-empty string`);
        }
    }
}
