import { encodePathSegment } from "./path-segment";
import { isRecord, canonicalJson } from "../../contracts/src/index";
import { createHash } from "node:crypto";
import {
    appendFile,
    mkdir,
    open,
    readFile,
    readdir,
    rm,
    stat,
    writeFile,
    type FileHandle,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type {
    TrajectoryEvent,
    TrajectoryEventCategory,
    TrajectoryEventDetail,
    TrajectoryEventDraft,
    TrajectoryEventPayload,
    TrajectoryEventSummary,
    TrajectoryEventType,
    TrajectoryExecutionUnitPage,
    TrajectoryIncrementalReadPort,
    TrajectoryPage,
    TrajectoryPageQuery,
    TrajectoryPayloadReference,
    TrajectoryQueryContext,
    TrajectoryQueryPort,
    TrajectoryReadQuery,
    TrajectoryReadResult,
    TrajectoryStore,
    TrajectoryTimeline,
} from "../../runtime/src/index";
import {
    allocateImmutableEvent,
    assertValidTrajectoryEventDraft,
    classifyTrajectoryTail,
    freezeTrajectoryEvent,
    projectTrajectoryEventCorrelation,
    projectTrajectoryEventSummary,
    TrajectoryProtocolError,
} from "../../runtime/src/index";
import {
    appendJsonl,
    WRITE_RETRY_THREE_ATTEMPTS,
} from "./json-file-write";
import { KeyedSerialQueue } from "./keyed-serial-queue";
import {
    TrajectoryIndex,
    type TrajectoryIndexEntry,
    type TrajectoryIndexFilter,
    type TrajectoryIndexLocation,
    type TrajectoryIndexRow,
} from "./trajectory-index";

/** 尾部反向扫描的单次回读块大小(字节)。 */
const TAIL_SCAN_BLOCK_BYTES = 4_096;

/** Payload 外置到 Blob 的默认字节阈值。 */
const BLOB_THRESHOLD_BYTES = 64 * 1024;

/** 单个 JSONL 分段的默认字节阈值。 */
const SEGMENT_THRESHOLD_BYTES = 64 * 1024 * 1024;

/** 当前存储编码版本；不兼容的旧编码直接失败。 */
const STORAGE_ENCODING_VERSION = 2;

type JsonTrajectoryFileOperations = Partial<Pick<
    typeof import("node:fs/promises"),
    "appendFile" | "mkdir" | "open" | "readFile" | "readdir" | "stat" | "writeFile"
>>;

/** 外置 payload 的内容寻址引用。 */
interface StoredPayloadReference {
    readonly sha256: string;
    readonly bytes: number;
    readonly encoding: "canonical-json";
}

/** JSONL 行内的存储编码；领域事件由读取路径重新物化。 */
interface TrajectoryStoredEvent {
    readonly storageEncodingVersion: 2;
    readonly eventSchemaVersion: 1;
    readonly eventId: string;
    readonly goalId: string;
    readonly runId: string;
    readonly phase: "executing";
    readonly executionUnitId?: string;
    readonly stepIndex?: number;
    readonly actionId?: string;
    readonly parentEventId?: string;
    readonly programId?: string;
    readonly callIndex?: number;
    readonly sequence: number;
    readonly occurredAt: string;
    readonly eventType: string;
    readonly payload?: TrajectoryEventPayload;
    readonly payloadRef?: StoredPayloadReference;
}

/** 单个 Run 当前的分段与已写入字节数。 */
interface SegmentState {
    readonly segment: number;
    readonly size: number;
}

/** 扫描到的一条存储行及其字节位置。 */
interface StoredLineLocation {
    readonly segment: number;
    readonly byteOffset: number;
    readonly byteLength: number;
    readonly parsed: unknown;
}

/** 存储编码结果及其 payload 字节数。 */
interface EncodedStoredEvent {
    readonly stored: TrajectoryStoredEvent;
    readonly payloadBytes: number;
}

/** 尚未写入派生索引的一条已落盘事件。 */
interface PendingIndexEntry {
    readonly event: Readonly<TrajectoryEvent>;
    readonly location: { readonly segment: number; readonly byteOffset: number; readonly byteLength: number };
    readonly payloadBytes: number;
    readonly payloadRef: StoredPayloadReference | undefined;
}

/** 触发一次索引事务的行数上限。 */
const INDEX_BATCH_SIZE = 128;

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

const TRAJECTORY_CATEGORIES = new Set<TrajectoryEventCategory>([
    "lifecycle",
    "decision",
    "memory",
    "action",
    "tool",
    "observation",
    "terminal",
    "commit",
]);

interface TrajectoryCursorPayload {
    readonly v: 1;
    readonly runId: string;
    readonly watermark: number;
    readonly filter: string;
    readonly sequence: number;
}

function encodeTrajectoryCursor(
    context: TrajectoryQueryContext,
    filter: string,
    sequence: number,
): string {
    const payload: TrajectoryCursorPayload = {
        v: 1,
        runId: context.runId,
        watermark: context.committedThroughSequence,
        filter,
        sequence,
    };
    return Buffer.from(JSON.stringify(payload), "utf8").toString("hex");
}

function decodeTrajectoryCursor(
    cursor: string,
    context: TrajectoryQueryContext,
    filter: string,
): number {
    let parsed: unknown;

    if (!/^(?:[0-9a-f]{2})+$/.test(cursor)) {
        throw new TrajectoryProtocolError("Invalid Trajectory cursor");
    }

    try {
        parsed = JSON.parse(Buffer.from(cursor, "hex").toString("utf8"));
    } catch {
        throw new TrajectoryProtocolError("Invalid Trajectory cursor");
    }

    if (!isRecord(parsed)
        || parsed.v !== 1
        || parsed.runId !== context.runId
        || parsed.watermark !== context.committedThroughSequence
        || parsed.filter !== filter
        || typeof parsed.sequence !== "number"
        || !Number.isSafeInteger(parsed.sequence)
        || parsed.sequence < 0) {
        throw new TrajectoryProtocolError("Trajectory cursor does not match the current query");
    }

    return parsed.sequence;
}

function trajectoryFilterKey(query: TrajectoryPageQuery): string {
    return JSON.stringify([
        query.category ?? null,
        query.executionUnitId ?? null,
        query.actionId ?? null,
        query.modelCallId ?? null,
        query.fromSequence ?? null,
        query.toSequence ?? null,
    ]);
}

function toTrajectorySummary(row: TrajectoryIndexRow): TrajectoryEventSummary {
    return {
        eventId: row.eventId,
        sequence: row.sequence,
        occurredAt: row.occurredAt,
        eventType: row.eventType as TrajectoryEventType,
        category: row.category as TrajectoryEventCategory,
        ...(row.executionUnitId === undefined ? {} : { executionUnitId: row.executionUnitId }),
        ...(row.stepIndex === undefined ? {} : { stepIndex: row.stepIndex }),
        ...(row.actionId === undefined ? {} : { actionId: row.actionId }),
        ...(row.modelCallId === undefined ? {} : { modelCallId: row.modelCallId }),
        ...(row.modelStage === "think" || row.modelStage === "decide" ? { modelStage: row.modelStage } : {}),
        ...(row.programId === undefined ? {} : { programId: row.programId }),
        ...(row.callIndex === undefined ? {} : { callIndex: row.callIndex }),
        ...(row.parentActionId === undefined ? {} : { parentActionId: row.parentActionId }),
        title: row.title,
        preview: row.preview,
        previewTruncated: row.previewTruncated,
        ...(row.inputPreview === undefined ? {} : { inputPreview: row.inputPreview }),
        ...(row.resultPreview === undefined ? {} : { resultPreview: row.resultPreview }),
    };
}

/**
 * 基于 JSONL 文件的单进程 Trajectory Store。
 *
 * @remarks
 * 每个 `(goalId, runId)` 使用
 * `<directory>/<base64url(goalId)>/<base64url(runId)>.jsonl` 作为第一个分段，超过
 * 分段阈值后继续写入 `<run>.part2.jsonl` 等文件。超过阈值的 payload 以规范 JSON
 * 写入同 Goal 的 `blobs/<sha256>.json`，JSONL 行只保留 `payloadRef`；读取时重新
 * 物化完整领域事件。实例内追加按 Run 串行化，下一序号优先取实例内会话级序号缓存，
 * 缓存 miss 时从最后一个分段向前反向扫描最后非空行取得，不读取全部历史；缓存只
 * 承担性能角色，实例重建后自然失效，恢复权威始终是读取路径的全量协议校验。不兼容的
 * 存储编码直接失败。该实现不提供跨进程锁、Outbox 或 exactly-once 语义。Snapshot 的
 * `committedThroughSequence` 由调用方传入，不从 `state_committed` marker 推导。
 *
 * 派生索引按 Run 缓冲：事件行仍逐条落盘，索引行在缓冲达到上限、显式 `flushIndex`
 * 或任何索引读取前合并为一个事务写入。缓冲未写入时索引只是滞后，JSONL 仍是唯一
 * 事实源；写入失败时丢弃缓冲并把索引标记为脏，后续读取从 JSONL 修复。
 *
 * @example
 * ```ts
 * const store = new JsonFileTrajectoryStore("~/.lazygoal/workspaces/<workspace-id>/trajectories");
 * await store.append(draft);
 * const view = await store.readWithBoundary(
 *     { goalId: "goal-1", runId: "run-1" },
 *     3,
 * );
 * ```
 */
export class JsonFileTrajectoryStore implements TrajectoryStore, TrajectoryQueryPort, TrajectoryIncrementalReadPort {
    private readonly appendQueue = new KeyedSerialQueue();
    private readonly sequenceCache = new Map<string, number>();
    private readonly segmentState = new Map<string, SegmentState>();
    private readonly indexes = new Map<string, TrajectoryIndex>();
    private readonly verifiedIndexes = new Set<string>();
    private readonly dirtyIndexes = new Set<string>();
    private readonly pendingIndexEntries = new Map<string, PendingIndexEntry[]>();
    private readonly directory: string;
    private readonly fileOperations: Required<JsonTrajectoryFileOperations>;
    private readonly blobThresholdBytes: number;
    private readonly segmentThresholdBytes: number;

    /**
     * @param directory - Trajectory 根目录；追加时按需创建 Goal 子目录与 Blob 目录。
     * @param fileOperations - 可选文件操作替身，用于确定性验证写入故障；生产默认使用 Node 文件系统。
     * @param limits - 可选存储阈值；生产使用固定默认值，测试可缩小以覆盖 Blob 与分段。
     */
    constructor(
        directory: string,
        fileOperations: JsonTrajectoryFileOperations = {},
        limits: {
            readonly blobThresholdBytes?: number;
            readonly segmentThresholdBytes?: number;
        } = {},
    ) {
        this.directory = directory;
        this.fileOperations = {
            appendFile,
            mkdir,
            open,
            readFile,
            readdir,
            stat,
            writeFile,
            ...fileOperations,
        };
        this.blobThresholdBytes = limits.blobThresholdBytes ?? BLOB_THRESHOLD_BYTES;
        this.segmentThresholdBytes = limits.segmentThresholdBytes ?? SEGMENT_THRESHOLD_BYTES;
    }

    private async writeEventLine(
        filePath: string,
        goalDirectory: string,
        event: TrajectoryStoredEvent,
    ): Promise<void> {
        await this.fileOperations.mkdir(goalDirectory, { recursive: true, mode: 0o700 });
        await appendJsonl({
            path: filePath,
            value: event,
            durable: event.eventType === "program_time_reserved",
            retry: WRITE_RETRY_THREE_ATTEMPTS,
            verify: async (line) => await this.inspectAppendOutcome(filePath, line, event),
            operations: this.fileOperations,
        });
    }

    private async inspectAppendOutcome(
        filePath: string,
        line: string,
        event: TrajectoryStoredEvent,
    ): Promise<"applied" | "absent"> {
        let content: string;
        try {
            content = await this.fileOperations.readFile(filePath, "utf8");
        } catch (error) {
            if (error instanceof Error
                && (error as NodeJS.ErrnoException).code === "ENOENT"
                && event.sequence === 1) {
                return "absent";
            }
            throw new TrajectoryProtocolError("Cannot verify the result of a temporary Trajectory append failure");
        }

        if (content.length === 0 && event.sequence === 1) return "absent";
        if (!content.endsWith("\n")) {
            throw new TrajectoryProtocolError("Trajectory append left an incomplete JSONL tail");
        }
        const lastLine = content.slice(0, -1).split(/\r?\n/).filter((entry) => entry.trim().length > 0).at(-1);
        if (lastLine === line.slice(0, -1)) return "applied";
        if (lastLine === undefined) {
            if (event.sequence === 1) return "absent";
            throw new TrajectoryProtocolError("Cannot verify the preceding Trajectory sequence");
        }

        const lastSequence = parseTailSequence(
            lastLine,
            0,
            event.goalId,
            event.runId,
        );
        if (lastSequence === event.sequence - 1) return "absent";
        throw new TrajectoryProtocolError("Trajectory append outcome conflicts with the expected event sequence");
    }

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
        return this.appendQueue.run(key, async () => {
            const index = await this.ensureIndex(draft.goalId, draft.runId);
            const lastSequence = this.sequenceCache.get(key)
                ?? await this.readLastStoredSequence(draft.goalId, draft.runId);
            const sequence = lastSequence + 1;
            const event = allocateImmutableEvent(draft, sequence);
            const encoded = await this.encodeStoredEvent(event);
            const active = await this.resolveActiveSegment(draft.goalId, draft.runId);
            const filePath = this.segmentFilePath(draft.goalId, draft.runId, active.segment);
            const lineBytes = Buffer.byteLength(`${JSON.stringify(encoded.stored)}\n`, "utf8");

            await this.writeEventLine(
                filePath,
                this.goalDirectory(draft.goalId),
                encoded.stored,
            );
            this.sequenceCache.set(key, sequence);
            this.segmentState.set(key, {
                segment: active.segment,
                size: active.size + lineBytes,
            });

            try {
                this.indexEvent(key, index, event, {
                    segment: active.segment,
                    byteOffset: active.size,
                    byteLength: lineBytes,
                }, encoded);
            } catch {
                this.verifiedIndexes.delete(key);
                this.dirtyIndexes.add(key);
            }

            return event;
        });
    }

    /**
     * 把已缓冲的派生索引行写入一次事务。
     *
     * @remarks
     * 只影响可重建的索引，不改变 JSONL 事实。缓冲为空时不打开或创建索引。
     * 写入失败时丢弃本批缓冲并把索引标记为脏，后续读取通过 repair 或 rebuild
     * 从 JSONL 恢复，不返回不完整结果。
     *
     * @param goalId - 事件所属 Goal。
     * @param runId - 事件所属 Run。
     * @returns 缓冲已提交或已被丢弃时 resolve。
     * @throws 无效标识符或底层索引打开失败时拒绝；事务内的插入错误不传播。
     * @example
     * ```ts
     * await store.flushIndex("goal-1", "run-1");
     * ```
     */
    async flushIndex(goalId: string, runId: string): Promise<void> {
        const key = this.keyFor(goalId, runId);
        if ((this.pendingIndexEntries.get(key)?.length ?? 0) === 0) return;
        await this.appendQueue.run(key, async () => {
            this.flushPendingIndex(key, await this.openIndex(goalId, runId));
        });
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
        const events = await this.readStoredEvents(query.goalId, query.runId);
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
     * 只读取并校验已校验前缀之后的事件。
     *
     * @remarks
     * 调用方必须已经通过同一 Store 实例的 `read` 或 `readWithBoundary` 校验过
     * `afterSequence` 及之前的全部事件。实现优先使用已验证索引从该事件的下一
     * 字节开始读取；索引缺失、损坏、行身份不匹配或读取失败时回退到全量 `read`，
     * 因此不会改变 `read` 的全量 fail-closed 语义。后缀本身仍执行完整事件协议
     * 校验，非法 JSON、身份不匹配或序列非单调照常抛出 `TrajectoryProtocolError`。
     *
     * @param query - Goal/Run 与已校验前缀的最后序号。
     * @param committedThroughSequence - Snapshot 记录的最大已提交序号。
     * @returns 只包含 `afterSequence` 之后事件并按提交边界分类的结果。
     * @throws 边界非法、后缀损坏或全量回退读取失败时拒绝。
     */
    async readAfter(
        query: {
            readonly goalId: string;
            readonly runId: string;
            readonly afterSequence: number;
        },
        committedThroughSequence: number,
    ): Promise<Readonly<TrajectoryReadResult>> {
        this.assertQuery({ goalId: query.goalId, runId: query.runId });
        if (!Number.isSafeInteger(query.afterSequence) || query.afterSequence < 0) {
            throw new TrajectoryProtocolError("afterSequence must be a non-negative integer");
        }
        if (!Number.isSafeInteger(committedThroughSequence) || committedThroughSequence < 0) {
            throw new TrajectoryProtocolError(
                "committedThroughSequence must be a non-negative integer",
            );
        }

        try {
            const index = await this.readyIndex(query.goalId, query.runId);
            const maxSequence = index.maxSequence();
            if (query.afterSequence >= maxSequence) {
                return Object.freeze({
                    committed: Object.freeze([]),
                    uncommittedTail: Object.freeze([]),
                });
            }

            const after = index.rowAt(query.afterSequence, maxSequence);
            if (after === undefined
                || !(await this.locationMatches(query.goalId, query.runId, after))) {
                return this.readAfterFallback(
                    query.goalId,
                    query.runId,
                    query.afterSequence,
                    committedThroughSequence,
                );
            }

            const events = await this.readStoredEvents(
                query.goalId,
                query.runId,
                after,
                query.afterSequence,
            );
            if (events.length === 0 || events[0]!.sequence !== query.afterSequence + 1) {
                return this.readAfterFallback(
                    query.goalId,
                    query.runId,
                    query.afterSequence,
                    committedThroughSequence,
                );
            }
            return classifyTrajectoryTail(events, committedThroughSequence);
        } catch (error) {
            if (error instanceof TrajectoryProtocolError) throw error;
            return this.readAfterFallback(
                query.goalId,
                query.runId,
                query.afterSequence,
                committedThroughSequence,
            );
        }
    }

    private async readAfterFallback(
        goalId: string,
        runId: string,
        afterSequence: number,
        committedThroughSequence: number,
    ): Promise<Readonly<TrajectoryReadResult>> {
        const events = await this.readStoredEvents(goalId, runId);
        return classifyTrajectoryTail(
            events.filter((event) => event.sequence > afterSequence),
            committedThroughSequence,
        );
    }

    async queryPage(
        context: TrajectoryQueryContext,
        query: TrajectoryPageQuery,
    ): Promise<TrajectoryPage> {
        this.assertQueryContext(context);
        this.assertPageQuery(query);
        const filterKey = trajectoryFilterKey(query);
        const cursorSequence = query.cursor === undefined
            ? undefined
            : decodeTrajectoryCursor(query.cursor, context, filterKey);
        const direction = query.direction ?? "forward";
        const index = await this.readyIndex(context.goalId, context.runId);
        const base = this.indexFilter(context, query, direction, query.limit);
        const rows = index.queryRows({
            ...base,
            ...(cursorSequence === undefined ? {} : direction === "forward"
                ? { afterSequence: cursorSequence }
                : { beforeSequence: cursorSequence }),
        });
        const first = rows[0];
        const last = rows.at(-1);
        const hasBefore = first !== undefined
            && index.countRows({ ...base, beforeSequence: first.sequence }, true) > 0;
        const hasAfter = last !== undefined
            && index.countRows({ ...base, afterSequence: last.sequence }, true) > 0;

        return {
            entries: rows.map(toTrajectorySummary),
            total: index.countRows(base),
            committedCount: index.countVisible(context.committedThroughSequence),
            previousCursor: first !== undefined && hasBefore
                ? encodeTrajectoryCursor(context, filterKey, first.sequence) : null,
            nextCursor: last !== undefined && hasAfter
                ? encodeTrajectoryCursor(context, filterKey, last.sequence) : null,
            locatedSequence: query.executionUnitId === undefined
                ? null
                : index.locateExecutionUnit(query.executionUnitId, context.committedThroughSequence) ?? null,
            committedThroughSequence: context.committedThroughSequence,
        };
    }

    async readDetail(
        context: TrajectoryQueryContext,
        sequence: number,
    ): Promise<TrajectoryEventDetail | undefined> {
        this.assertQueryContext(context);
        this.assertSequence(sequence);
        const index = await this.readyIndex(context.goalId, context.runId);
        const row = index.rowAt(sequence, context.committedThroughSequence);
        if (row === undefined) return undefined;

        const event = await this.readEventAtRow(context, row);
        const relatedRows = row.actionId === undefined
            ? []
            : index.rowsByAction(row.actionId, context.committedThroughSequence);
        const find = (eventType: string) => relatedRows.find((candidate) => candidate.eventType === eventType);
        const decisionRow = find("decision_received");
        const actionRow = find("action_staged");
        const startedRow = find("tool_started");
        const finishedRow = find("tool_finished");
        const observationRow = find("observation_recorded");
        const startedEvent = startedRow === undefined ? undefined : await this.readEventAtRow(context, startedRow);
        const stagedEvent = actionRow === undefined ? undefined : await this.readEventAtRow(context, actionRow);
        const decisionEvent = decisionRow === undefined ? undefined : await this.readEventAtRow(context, decisionRow);
        const finishedEvent = finishedRow === undefined ? undefined : await this.readEventAtRow(context, finishedRow);
        const observationEvent = observationRow === undefined ? undefined : await this.readEventAtRow(context, observationRow);
        const input = startedEvent?.eventType === "tool_started" ? startedEvent.payload.input
            : stagedEvent?.eventType === "action_staged" ? stagedEvent.payload.action.input
                : decisionEvent?.eventType === "decision_received" && decisionEvent.payload.decision.kind === "tool_call"
                    ? decisionEvent.payload.decision.action.input
                    : undefined;
        const observation = observationEvent?.eventType === "observation_recorded" ? observationEvent.payload.observation
            : finishedEvent?.eventType === "tool_finished" ? finishedEvent.payload.observation
                : undefined;
        const startedAt = startedEvent?.occurredAt;
        const finishedAt = finishedEvent?.occurredAt;
        const duration = startedAt === undefined || finishedAt === undefined
            ? Number.NaN
            : Date.parse(finishedAt) - Date.parse(startedAt);

        const eventCorrelation = projectTrajectoryEventCorrelation(event);
        const correlation = {
            ...eventCorrelation,
            ...(eventCorrelation.actionId === undefined && row.actionId !== undefined ? { actionId: row.actionId } : {}),
            ...(eventCorrelation.modelCallId === undefined && row.modelCallId !== undefined ? { modelCallId: row.modelCallId } : {}),
            ...(eventCorrelation.programId === undefined && row.programId !== undefined ? { programId: row.programId } : {}),
            ...(eventCorrelation.parentActionId === undefined && row.parentActionId !== undefined ? { parentActionId: row.parentActionId } : {}),
        };

        return {
            event,
            correlation,
            related: {
                ...(decisionRow === undefined ? {} : { decision: decisionRow.sequence }),
                ...(actionRow === undefined ? {} : { action: actionRow.sequence }),
                ...(startedRow === undefined ? {} : { toolStarted: startedRow.sequence }),
                ...(finishedRow === undefined ? {} : { toolFinished: finishedRow.sequence }),
                ...(observationRow === undefined ? {} : { observation: observationRow.sequence }),
            },
            ...(input === undefined ? {} : { input }),
            ...(observation === undefined ? {} : { observation }),
            ...(startedAt === undefined ? {} : { toolStartedAt: startedAt }),
            ...(finishedAt === undefined ? {} : { toolFinishedAt: finishedAt }),
            toolDurationMs: Number.isFinite(duration) && duration >= 0 ? duration : null,
            observationConfirmed: observationRow !== undefined,
            payloadBytes: row.payloadBytes,
            ...(row.payloadRef === undefined ? {} : { payloadRef: this.parsePayloadReference(row.payloadRef) }),
        };
    }

    async locateExecutionUnit(
        context: TrajectoryQueryContext,
        executionUnitId: string,
    ): Promise<number | undefined> {
        this.assertQueryContext(context);
        this.assertIdentifierValue(executionUnitId, "executionUnitId");
        const index = await this.readyIndex(context.goalId, context.runId);
        return index.locateExecutionUnit(executionUnitId, context.committedThroughSequence);
    }

    async queryExecutionUnitPage(
        context: TrajectoryQueryContext,
        executionUnitId: string,
        query: TrajectoryPageQuery,
    ): Promise<TrajectoryExecutionUnitPage> {
        this.assertQueryContext(context);
        this.assertIdentifierValue(executionUnitId, "executionUnitId");
        const unitQuery: TrajectoryPageQuery = { ...query, executionUnitId };
        this.assertPageQuery(unitQuery);
        const filterKey = trajectoryFilterKey(unitQuery);
        const cursorSequence = query.cursor === undefined
            ? undefined
            : decodeTrajectoryCursor(query.cursor, context, filterKey);
        const direction = query.direction ?? "forward";
        const index = await this.readyIndex(context.goalId, context.runId);
        const base = this.indexFilter(context, unitQuery, direction, query.limit);
        const rows = index.queryRows({
            ...base,
            ...(cursorSequence === undefined ? {} : direction === "forward"
                ? { afterSequence: cursorSequence }
                : { beforeSequence: cursorSequence }),
        });
        const last = rows.at(-1);
        const hasAfter = last !== undefined
            && index.countRows({ ...base, afterSequence: last.sequence }, true) > 0;
        const firstSequence = index.locateExecutionUnit(executionUnitId, context.committedThroughSequence);
        const lastSequence = index.lastExecutionUnitSequence(executionUnitId, context.committedThroughSequence);

        return {
            entries: rows.map(toTrajectorySummary),
            total: index.countRows(base),
            nextCursor: last !== undefined && hasAfter
                ? encodeTrajectoryCursor(context, filterKey, last.sequence) : null,
            contextBefore: firstSequence === undefined
                ? []
                : index.contextRows(context.committedThroughSequence, firstSequence, "before", 5, executionUnitId).map(toTrajectorySummary),
            contextAfter: lastSequence === undefined
                ? []
                : index.contextRows(context.committedThroughSequence, lastSequence, "after", 5, executionUnitId).map(toTrajectorySummary),
        };
    }

    async queryTimeline(
        context: TrajectoryQueryContext,
        bucketSize: number,
    ): Promise<TrajectoryTimeline> {
        this.assertQueryContext(context);

        if (!Number.isSafeInteger(bucketSize) || bucketSize < 1 || bucketSize > 10_000) {
            throw new TrajectoryProtocolError("Trajectory timeline bucket size must be between 1 and 10000");
        }

        const index = await this.readyIndex(context.goalId, context.runId);
        return index.timeline(context.committedThroughSequence, bucketSize);
    }

    async listModelCallIds(
        context: TrajectoryQueryContext,
    ): Promise<readonly string[]> {
        this.assertQueryContext(context);
        const index = await this.readyIndex(context.goalId, context.runId);
        return index.modelCallIds(context.committedThroughSequence);
    }

    async readPayload(
        context: TrajectoryQueryContext,
        sequence: number,
    ): Promise<string | undefined> {
        this.assertQueryContext(context);
        this.assertSequence(sequence);
        const index = await this.readyIndex(context.goalId, context.runId);
        const row = index.rowAt(sequence, context.committedThroughSequence);
        if (row === undefined) return undefined;

        if (row.payloadRef !== undefined) {
            return canonicalJson(await this.readPayloadBlob(context.goalId, this.parsePayloadReference(row.payloadRef)));
        }

        return canonicalJson((await this.readEventAtRow(context, row)).payload);
    }

    private async readyIndex(goalId: string, runId: string): Promise<TrajectoryIndex> {
        const key = this.keyFor(goalId, runId);
        return this.appendQueue.run(key, () => this.ensureIndex(goalId, runId));
    }

    private async readEventAtRow(
        context: TrajectoryQueryContext,
        row: TrajectoryIndexRow,
    ): Promise<Readonly<TrajectoryEvent>> {
        const filePath = this.segmentFilePath(context.goalId, context.runId, row.segment);
        let handle: FileHandle;

        try {
            handle = await this.fileOperations.open(filePath, "r");
        } catch {
            throw new TrajectoryProtocolError(`Missing Trajectory segment for event ${row.sequence}`);
        }

        try {
            const buffer = Buffer.alloc(row.byteLength);
            const { bytesRead } = await handle.read(buffer, 0, row.byteLength, row.byteOffset);

            if (bytesRead !== row.byteLength) {
                throw new TrajectoryProtocolError(`Trajectory index location is out of bounds for event ${row.sequence}`);
            }

            let parsed: unknown;

            try {
                parsed = JSON.parse(buffer.toString("utf8").replace(/\r?\n$/, ""));
            } catch {
                throw new TrajectoryProtocolError(`Invalid Trajectory JSONL at index row ${row.sequence}`);
            }

            const event = await this.decodeStoredEvent(parsed, context.goalId, context.runId, `index row ${row.sequence}`);

            if (event.sequence !== row.sequence || event.eventId !== row.eventId) {
                throw new TrajectoryProtocolError(`Trajectory index location does not match event ${row.sequence}`);
            }

            return event;
        } finally {
            await handle.close();
        }
    }

    private indexFilter(
        context: TrajectoryQueryContext,
        query: TrajectoryPageQuery,
        direction: "forward" | "backward",
        limit: number,
    ): TrajectoryIndexFilter {
        return {
            committedThroughSequence: context.committedThroughSequence,
            ...(query.category === undefined ? {} : { category: query.category }),
            ...(query.executionUnitId === undefined ? {} : { executionUnitId: query.executionUnitId }),
            ...(query.actionId === undefined ? {} : { actionId: query.actionId }),
            ...(query.modelCallId === undefined ? {} : { modelCallId: query.modelCallId }),
            ...(query.fromSequence === undefined ? {} : { fromSequence: query.fromSequence }),
            ...(query.toSequence === undefined ? {} : { toSequence: query.toSequence }),
            direction,
            limit,
        };
    }

    private assertQueryContext(context: TrajectoryQueryContext): void {
        this.keyFor(context.goalId, context.runId);

        if (!Number.isSafeInteger(context.committedThroughSequence) || context.committedThroughSequence < 0) {
            throw new TrajectoryProtocolError("Trajectory query watermark must be a non-negative safe integer");
        }
    }

    private assertPageQuery(query: TrajectoryPageQuery): void {
        if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 200) {
            throw new TrajectoryProtocolError("Trajectory page limit must be between 1 and 200");
        }

        if (query.direction !== undefined && query.direction !== "forward" && query.direction !== "backward") {
            throw new TrajectoryProtocolError("Trajectory page direction is invalid");
        }

        if (query.category !== undefined && !TRAJECTORY_CATEGORIES.has(query.category)) {
            throw new TrajectoryProtocolError("Trajectory page category is invalid");
        }

        for (const value of [query.fromSequence, query.toSequence]) {
            if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
                throw new TrajectoryProtocolError("Trajectory sequence range must use non-negative integers");
            }
        }

        if (query.fromSequence !== undefined && query.toSequence !== undefined
            && query.fromSequence > query.toSequence) {
            throw new TrajectoryProtocolError("Trajectory sequence range is inverted");
        }

        if (query.cursor !== undefined && query.cursor.length === 0) {
            throw new TrajectoryProtocolError("Trajectory cursor must be non-empty");
        }

        for (const value of [query.executionUnitId, query.actionId, query.modelCallId]) {
            if (value !== undefined) this.assertIdentifierValue(value, "Trajectory filter");
        }
    }

    private assertSequence(sequence: number): void {
        if (!Number.isSafeInteger(sequence) || sequence < 1) {
            throw new TrajectoryProtocolError("Trajectory sequence must be a positive safe integer");
        }
    }

    private assertIdentifierValue(value: string, field: string): void {
        if (typeof value !== "string" || value.trim().length === 0) {
            throw new TrajectoryProtocolError(`${field} must be a non-empty string`);
        }
    }

    private parsePayloadReference(value: string): StoredPayloadReference {
        let parsed: unknown;

        try {
            parsed = JSON.parse(value);
        } catch {
            throw new TrajectoryProtocolError("Invalid Trajectory payload reference in index");
        }

        this.assertPayloadReference(parsed, "index");
        return parsed;
    }

    /**
     * 从最后一个分段向前定位最近的已写入序号。
     *
     * @param goalId - Goal 稳定标识。
     * @param runId - Run 稳定标识。
     * @returns 最近一个非空事件的序号;整个 Run 无事件时为 0。
     * @throws 任一分段尾部行协议非法时抛 `TrajectoryProtocolError`。
     */
    private async readLastStoredSequence(goalId: string, runId: string): Promise<number> {
        const segments = await this.listSegmentNumbers(goalId, runId);

        for (let index = segments.length - 1; index >= 0; index -= 1) {
            const segment = segments[index];

            if (segment === undefined) continue;

            const sequence = await this.readLastSequenceInFile(
                this.segmentFilePath(goalId, runId, segment),
                goalId,
                runId,
            );

            if (sequence > 0) return sequence;
        }

        return 0;
    }

    /**
     * 从单个分段尾部反向扫描最后一个非空 JSONL 行,返回其 `sequence`。
     *
     * @remarks
     * 以固定块(4 KiB)从文件尾向前回读,累积到能完整框住最后一个非空行为止;
     * 行首可能被块边界截断时继续向前读,读到文件头后首段即完整行。文件不
     * 存在、为空或只有空行时返回 0。只做定位序号所需的最小校验:JSON 可
     * 解析、`goalId`/`runId` 匹配、`sequence` 为正整数;完整协议校验仍由
     * 读取路径负责。
     *
     * @param filePath - 目标 JSONL 分段。
     * @param goalId - 期望的 Goal 标识。
     * @param runId - 期望的 Run 标识。
     * @returns 分段中最后一个非空事件的序号;无事件时为 0。
     * @throws 尾部行 JSON 非法、标识不匹配或序号非正整数时抛
     *   `TrajectoryProtocolError`,错误信息含行起始字节偏移。
     */
    private async readLastSequenceInFile(
        filePath: string,
        goalId: string,
        runId: string,
    ): Promise<number> {
        let handle: FileHandle;

        try {
            handle = await this.fileOperations.open(filePath, "r");
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
        goalId: string,
        runId: string,
        after?: TrajectoryIndexLocation,
        previousSequence = 0,
    ): Promise<readonly TrajectoryEvent[]> {
        const lines = await this.scanStoredLines(goalId, runId, after);
        const events: TrajectoryEvent[] = [];

        for (const line of lines) {
            const location = this.describeLine(runId, line);
            const event = await this.decodeStoredEvent(line.parsed, goalId, runId, location);

            if (event.sequence <= previousSequence) {
                throw new TrajectoryProtocolError(
                    `Trajectory sequence must increase at ${location}`,
                );
            }

            previousSequence = event.sequence;
            events.push(event);
        }

        return Object.freeze(events);
    }

    /**
     * 将一行存储编码物化为领域事件；外置 payload 从内容寻址 Blob 读取。
     *
     * @param parsed - 已解析的 JSONL 行。
     * @param goalId - 期望的 Goal 标识。
     * @param runId - 期望的 Run 标识。
     * @param location - 错误诊断使用的分段与行号。
     * @returns 通过完整协议校验的冻结事件。
     * @throws 存储编码版本、payload 形状、Blob 或领域事件非法时抛 `TrajectoryProtocolError`。
     */
    private async decodeStoredEvent(
        parsed: unknown,
        goalId: string,
        runId: string,
        location: string,
    ): Promise<Readonly<TrajectoryEvent>> {
        if (!isRecord(parsed)) {
            throw new TrajectoryProtocolError(`Invalid Trajectory event at ${location}`);
        }
        if (parsed.storageEncodingVersion !== STORAGE_ENCODING_VERSION) {
            throw new TrajectoryProtocolError(`Unsupported Trajectory storage encoding at ${location}`);
        }

        const hasPayload = parsed.payload !== undefined;
        const hasReference = parsed.payloadRef !== undefined;

        if (hasPayload === hasReference) {
            throw new TrajectoryProtocolError(`Trajectory payload encoding is ambiguous at ${location}`);
        }

        let payload: unknown;

        if (hasReference) {
            this.assertPayloadReference(parsed.payloadRef, location);
            payload = await this.readPayloadBlob(goalId, parsed.payloadRef);
        } else {
            payload = parsed.payload;
        }

        const { storageEncodingVersion: _version, payloadRef: _reference, ...envelope } = parsed;
        let event: Readonly<TrajectoryEvent>;

        try {
            event = freezeTrajectoryEvent({ ...envelope, payload } as unknown as TrajectoryEvent);
        } catch {
            throw new TrajectoryProtocolError(`Invalid Trajectory event at ${location}`);
        }

        if (event.goalId !== goalId || event.runId !== runId) {
            throw new TrajectoryProtocolError(
                `Trajectory event identity mismatch at ${location}`,
            );
        }

        return event;
    }

    /**
     * 把领域事件编码为存储行；超过阈值的 payload 写入内容寻址 Blob。
     *
     * @param event - 已分配序号的冻结事件。
     * @returns 只包含一份 payload 或一个 `payloadRef` 的存储行。
     * @throws Blob 写入失败或既有内容摘要不匹配时拒绝。
     */
    private async encodeStoredEvent(
        event: Readonly<TrajectoryEvent>,
    ): Promise<EncodedStoredEvent> {
        const { payload, ...envelope } = event;
        const text = canonicalJson(payload);
        const payloadBytes = Buffer.byteLength(text, "utf8");

        if (payloadBytes <= this.blobThresholdBytes) {
            return {
                stored: { storageEncodingVersion: STORAGE_ENCODING_VERSION, ...envelope, payload } as TrajectoryStoredEvent,
                payloadBytes,
            };
        }

        const payloadRef = await this.writePayloadBlob(event.goalId, payload);
        return {
            stored: { storageEncodingVersion: STORAGE_ENCODING_VERSION, ...envelope, payloadRef } as TrajectoryStoredEvent,
            payloadBytes,
        };
    }

    private async writePayloadBlob(
        goalId: string,
        payload: TrajectoryEventPayload,
    ): Promise<StoredPayloadReference> {
        const text = canonicalJson(payload);
        const bytes = Buffer.byteLength(text, "utf8");
        const sha256 = createHash("sha256").update(text).digest("hex");
        const directory = this.blobDirectory(goalId);
        const path = join(directory, `${sha256}.json`);

        await this.fileOperations.mkdir(directory, { recursive: true, mode: 0o700 });

        try {
            await this.fileOperations.writeFile(path, text, { encoding: "utf8", flag: "wx", mode: 0o600 });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;

            const existing = await this.fileOperations.readFile(path, "utf8");

            if (createHash("sha256").update(existing).digest("hex") !== sha256) {
                throw new TrajectoryProtocolError(`Trajectory payload blob hash mismatch for ${sha256}`);
            }
        }

        return { sha256, bytes, encoding: "canonical-json" };
    }

    private async readPayloadBlob(
        goalId: string,
        reference: StoredPayloadReference,
    ): Promise<TrajectoryEventPayload> {
        const path = join(this.blobDirectory(goalId), `${reference.sha256}.json`);
        let text: string;

        try {
            text = await this.fileOperations.readFile(path, "utf8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                throw new TrajectoryProtocolError(`Missing Trajectory payload blob ${reference.sha256}`);
            }

            throw error;
        }

        if (Buffer.byteLength(text, "utf8") !== reference.bytes
            || createHash("sha256").update(text).digest("hex") !== reference.sha256) {
            throw new TrajectoryProtocolError(`Trajectory payload blob mismatch for ${reference.sha256}`);
        }

        try {
            return JSON.parse(text) as TrajectoryEventPayload;
        } catch {
            throw new TrajectoryProtocolError(`Invalid Trajectory payload blob ${reference.sha256}`);
        }
    }

    private assertPayloadReference(
        value: unknown,
        location: string,
    ): asserts value is StoredPayloadReference {
        if (!isRecord(value)
            || typeof value.sha256 !== "string"
            || !/^[a-f0-9]{64}$/.test(value.sha256)
            || !Number.isSafeInteger(value.bytes)
            || (value.bytes as number) < 0
            || value.encoding !== "canonical-json") {
            throw new TrajectoryProtocolError(`Invalid Trajectory payload reference at ${location}`);
        }
    }

    private async resolveActiveSegment(goalId: string, runId: string): Promise<SegmentState> {
        const key = this.keyFor(goalId, runId);
        const cached = this.segmentState.get(key);

        if (cached !== undefined) {
            return cached.size >= this.segmentThresholdBytes
                ? { segment: cached.segment + 1, size: 0 }
                : cached;
        }

        const segments = await this.listSegmentNumbers(goalId, runId);
        const segment = segments.at(-1) ?? 0;
        return {
            segment,
            size: await this.fileSize(this.segmentFilePath(goalId, runId, segment)),
        };
    }

    private async listSegmentNumbers(goalId: string, runId: string): Promise<number[]> {
        const base = basename(this.baseFilePath(goalId, runId));
        let entries: string[];

        try {
            entries = await this.fileOperations.readdir(dirname(this.baseFilePath(goalId, runId)));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
            throw error;
        }

        const numbers: number[] = [];

        for (const entry of entries) {
            if (entry === `${base}.jsonl`) {
                numbers.push(0);
                continue;
            }

            const prefix = `${base}.part`;
            if (!entry.startsWith(prefix) || !entry.endsWith(".jsonl")) continue;

            const middle = entry.slice(prefix.length, -".jsonl".length);
            if (!/^\d+$/.test(middle)) continue;

            const part = Number(middle);
            if (Number.isSafeInteger(part) && part >= 2) numbers.push(part - 1);
        }

        return numbers.sort((left, right) => left - right);
    }

    private async fileSize(path: string): Promise<number> {
        try {
            return (await this.fileOperations.stat(path)).size;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
            throw error;
        }
    }

    private async ensureIndex(goalId: string, runId: string): Promise<TrajectoryIndex> {
        const key = this.keyFor(goalId, runId);
        const index = await this.openIndex(goalId, runId);
        this.flushPendingIndex(key, index);

        if (this.verifiedIndexes.has(key) && !this.dirtyIndexes.has(key)) return index;

        if (await this.normalizeTrailingSegment(goalId, runId)) {
            this.sequenceCache.delete(key);
            this.segmentState.delete(key);
        }

        const segments = await this.listSegmentNumbers(goalId, runId);
        const lastSegment = segments.at(-1);
        const jsonlLast = lastSegment === undefined
            ? 0
            : await this.readLastSequenceInFile(this.segmentFilePath(goalId, runId, lastSegment), goalId, runId);
        const indexLast = index.maxSequence();

        if (indexLast > jsonlLast) {
            await this.rebuildIndex(goalId, runId, index);
        } else if (indexLast < jsonlLast) {
            const after = indexLast === 0 ? undefined : index.lastLocation();

            if (after === undefined || !(await this.locationMatches(goalId, runId, after))) {
                await this.rebuildIndex(goalId, runId, index);
            } else {
                await this.repairIndex(goalId, runId, index, after);
            }
        } else if (indexLast > 0) {
            const last = index.lastLocation();

            if (last === undefined || !(await this.locationMatches(goalId, runId, last))) {
                await this.rebuildIndex(goalId, runId, index);
            }
        }

        if (index.count() !== jsonlLast) {
            await this.rebuildIndex(goalId, runId, index);
        }

        this.verifiedIndexes.add(key);
        this.dirtyIndexes.delete(key);
        return index;
    }

    private async openIndex(goalId: string, runId: string): Promise<TrajectoryIndex> {
        const key = this.keyFor(goalId, runId);
        const existing = this.indexes.get(key);
        if (existing !== undefined) return existing;

        await this.fileOperations.mkdir(this.goalDirectory(goalId), { recursive: true, mode: 0o700 });
        const path = this.indexPath(goalId, runId);
        let index: TrajectoryIndex;

        try {
            index = new TrajectoryIndex(path);
        } catch {
            for (const suffix of ["", "-journal", "-wal", "-shm"]) {
                await rm(`${path}${suffix}`, { force: true });
            }
            index = new TrajectoryIndex(path);
        }

        this.indexes.set(key, index);
        return index;
    }

    private async rebuildIndex(
        goalId: string,
        runId: string,
        index: TrajectoryIndex,
    ): Promise<void> {
        const lines = await this.scanStoredLines(goalId, runId);
        const decoded: Array<{
            event: Readonly<TrajectoryEvent>;
            location: StoredLineLocation;
            payloadBytes: number;
            payloadRef: StoredPayloadReference | undefined;
        }> = [];

        for (const line of lines) {
            decoded.push({
                event: await this.decodeStoredEvent(line.parsed, goalId, runId, this.describeLine(runId, line)),
                location: line,
                payloadBytes: this.storedPayloadBytes(line.parsed),
                payloadRef: this.storedPayloadRef(line.parsed),
            });
        }

        index.clear();
        index.runInTransaction(() => {
            for (const item of decoded) {
                this.indexDecodedEvent(index, item.event, item.location, item.payloadBytes, item.payloadRef);
            }
        });
    }

    private async repairIndex(
        goalId: string,
        runId: string,
        index: TrajectoryIndex,
        after: TrajectoryIndexLocation,
    ): Promise<void> {
        const lines = await this.scanStoredLines(goalId, runId, after);
        const decoded: Array<{
            event: Readonly<TrajectoryEvent>;
            location: StoredLineLocation;
            payloadBytes: number;
            payloadRef: StoredPayloadReference | undefined;
        }> = [];

        for (const line of lines) {
            decoded.push({
                event: await this.decodeStoredEvent(line.parsed, goalId, runId, this.describeLine(runId, line)),
                location: line,
                payloadBytes: this.storedPayloadBytes(line.parsed),
                payloadRef: this.storedPayloadRef(line.parsed),
            });
        }

        index.runInTransaction(() => {
            for (const item of decoded) {
                this.indexDecodedEvent(index, item.event, item.location, item.payloadBytes, item.payloadRef);
            }
        });
    }

    private indexEvent(
        key: string,
        index: TrajectoryIndex,
        event: Readonly<TrajectoryEvent>,
        location: { readonly segment: number; readonly byteOffset: number; readonly byteLength: number },
        encoded: EncodedStoredEvent,
    ): void {
        const pending = this.pendingIndexEntries.get(key) ?? [];
        pending.push({
            event,
            location,
            payloadBytes: encoded.payloadBytes,
            payloadRef: encoded.stored.payloadRef,
        });
        this.pendingIndexEntries.set(key, pending);
        if (pending.length >= INDEX_BATCH_SIZE) this.flushPendingIndex(key, index);
    }

    /**
     * 把一条 Run 的缓冲索引行写入单个事务。
     *
     * @remarks
     * 事务失败时丢弃缓冲并把索引标记为脏；索引是派生数据，不从失败中恢复。
     */
    private flushPendingIndex(key: string, index: TrajectoryIndex): void {
        const pending = this.pendingIndexEntries.get(key);
        if (pending === undefined || pending.length === 0) return;
        this.pendingIndexEntries.delete(key);
        try {
            index.runInTransaction(() => {
                for (const item of pending) {
                    this.indexDecodedEvent(
                        index,
                        item.event,
                        item.location,
                        item.payloadBytes,
                        item.payloadRef,
                    );
                }
            });
        } catch {
            this.verifiedIndexes.delete(key);
            this.dirtyIndexes.add(key);
        }
    }

    private indexDecodedEvent(
        index: TrajectoryIndex,
        event: Readonly<TrajectoryEvent>,
        location: { readonly segment: number; readonly byteOffset: number; readonly byteLength: number },
        payloadBytes: number,
        payloadRef: StoredPayloadReference | undefined,
    ): void {
        const relation = projectTrajectoryEventCorrelation(event);
        const summary = projectTrajectoryEventSummary(event);
        const stage = event.eventType === "think_completed" ? "think"
            : event.eventType === "decision_received" ? "decide"
                : summary.modelStage;
        const modelCallId = summary.modelCallId
            ?? (event.executionUnitId !== undefined && stage !== undefined
                ? index.latestModelCallId(event.executionUnitId, stage, event.sequence)
                : undefined);
        const parentActionId = relation.parentActionId
            ?? (relation.programId === undefined ? undefined : index.programParent(relation.programId));
        const entry: TrajectoryIndexEntry = {
            sequence: event.sequence,
            eventId: event.eventId,
            occurredAt: event.occurredAt,
            eventType: event.eventType,
            category: summary.category,
            ...(event.executionUnitId === undefined ? {} : { executionUnitId: event.executionUnitId }),
            ...(event.stepIndex === undefined ? {} : { stepIndex: event.stepIndex }),
            ...(relation.actionId === undefined ? {} : { actionId: relation.actionId }),
            ...(modelCallId === undefined ? {} : { modelCallId }),
            ...(stage === undefined ? {} : { modelStage: stage }),
            ...(relation.programId === undefined ? {} : { programId: relation.programId }),
            ...(parentActionId === undefined ? {} : { parentActionId }),
            ...(event.callIndex === undefined ? {} : { callIndex: event.callIndex }),
            segment: location.segment,
            byteOffset: location.byteOffset,
            byteLength: location.byteLength,
            payloadBytes,
            ...(payloadRef === undefined ? {} : { payloadRef: JSON.stringify(payloadRef) }),
            title: summary.title,
            preview: summary.preview,
            previewTruncated: summary.previewTruncated,
            ...(summary.inputPreview === undefined ? {} : { inputPreview: summary.inputPreview }),
            ...(summary.resultPreview === undefined ? {} : { resultPreview: summary.resultPreview }),
        };

        index.insert(entry);

        if (relation.programId !== undefined && relation.parentActionId !== undefined
            && (event.eventType === "program_started" || event.eventType === "program_settled")) {
            index.insertProgram(relation.programId, relation.parentActionId);
        }

        if (event.eventType === "tool_finished" && relation.actionId !== undefined && summary.resultPreview !== undefined) {
            index.updateResultPreview(relation.actionId, summary.resultPreview);
        }
    }

    private async scanStoredLines(
        goalId: string,
        runId: string,
        after?: TrajectoryIndexLocation,
    ): Promise<StoredLineLocation[]> {
        const segments = await this.listSegmentNumbers(goalId, runId);
        const result: StoredLineLocation[] = [];

        for (const segment of segments) {
            if (after !== undefined && segment < after.segment) continue;

            const filePath = this.segmentFilePath(goalId, runId, segment);
            const baseOffset = after !== undefined && segment === after.segment
                ? after.byteOffset + after.byteLength
                : 0;
            let buffer: Buffer;

            try {
                buffer = baseOffset === 0
                    ? await this.fileOperations.readFile(filePath) as Buffer
                    : await this.readSegmentFrom(filePath, baseOffset);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
                throw error;
            }

            let offset = 0;

            while (offset < buffer.length) {
                const newline = buffer.indexOf(0x0a, offset);
                if (newline < 0) break;

                const end = newline + 1;
                const text = buffer.subarray(offset, end).toString("utf8").replace(/\r?\n$/, "");

                if (text.trim().length > 0) {
                    let parsed: unknown;

                    try {
                        parsed = JSON.parse(text);
                    } catch {
                        throw new TrajectoryProtocolError(
                            `Invalid Trajectory JSONL at ${basename(filePath)} byte ${baseOffset + offset}`,
                        );
                    }

                    result.push({
                        segment,
                        byteOffset: baseOffset + offset,
                        byteLength: end - offset,
                        parsed,
                    });
                }

                offset = end;
            }
        }

        return result;
    }

    private async readSegmentFrom(filePath: string, offset: number): Promise<Buffer> {
        const handle = await this.fileOperations.open(filePath, "r");

        try {
            const { size } = await handle.stat();
            if (size <= offset) return Buffer.alloc(0);

            const length = size - offset;
            const buffer = Buffer.alloc(length);
            let total = 0;

            while (total < length) {
                const { bytesRead } = await handle.read(
                    buffer,
                    total,
                    length - total,
                    offset + total,
                );
                if (bytesRead === 0) break;
                total += bytesRead;
            }

            return total === length ? buffer : buffer.subarray(0, total);
        } finally {
            await handle.close();
        }
    }

    private async normalizeTrailingSegment(goalId: string, runId: string): Promise<boolean> {
        const segments = await this.listSegmentNumbers(goalId, runId);
        const last = segments.at(-1);
        if (last === undefined) return false;

        const filePath = this.segmentFilePath(goalId, runId, last);
        let handle: FileHandle;

        try {
            handle = await this.fileOperations.open(filePath, "r+");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
            throw error;
        }

        try {
            const { size } = await handle.stat();
            if (size === 0) return false;

            const lastByte = Buffer.alloc(1);
            await handle.read(lastByte, 0, 1, size - 1);
            if (lastByte[0] === 0x0a) return false;

            let position = size;
            let lineStart = 0;

            while (position > 0) {
                const readSize = Math.min(TAIL_SCAN_BLOCK_BYTES, position);
                position -= readSize;
                const block = Buffer.alloc(readSize);
                await handle.read(block, 0, readSize, position);
                const newline = block.lastIndexOf(0x0a);

                if (newline >= 0) {
                    lineStart = position + newline + 1;
                    break;
                }
            }

            const tailLength = size - lineStart;
            if (tailLength === 0) return false;

            const tail = Buffer.alloc(tailLength);
            await handle.read(tail, 0, tailLength, lineStart);
            let complete = false;

            try {
                JSON.parse(tail.toString("utf8"));
                complete = true;
            } catch {
                complete = false;
            }

            if (complete) {
                await handle.write(Buffer.from("\n"), 0, 1, size);
            } else {
                await handle.truncate(lineStart);
            }

            return true;
        } finally {
            await handle.close();
        }
    }

    private async locationMatches(
        goalId: string,
        runId: string,
        location: TrajectoryIndexLocation,
    ): Promise<boolean> {
        const filePath = this.segmentFilePath(goalId, runId, location.segment);
        let handle: FileHandle;

        try {
            handle = await this.fileOperations.open(filePath, "r");
        } catch {
            return false;
        }

        try {
            const buffer = Buffer.alloc(location.byteLength);
            const { bytesRead } = await handle.read(buffer, 0, location.byteLength, location.byteOffset);
            if (bytesRead !== location.byteLength) return false;

            const parsed = JSON.parse(buffer.toString("utf8").replace(/\r?\n$/, "")) as {
                sequence?: unknown;
                eventId?: unknown;
            };
            return parsed.sequence === location.sequence && parsed.eventId === location.eventId;
        } catch {
            return false;
        } finally {
            await handle.close();
        }
    }

    private storedPayloadBytes(parsed: unknown): number {
        if (!isRecord(parsed)) return 0;
        const reference = parsed.payloadRef;

        if (isRecord(reference) && typeof reference.bytes === "number") return reference.bytes;
        if (parsed.payload === undefined) return 0;

        return Buffer.byteLength(canonicalJson(parsed.payload as TrajectoryEventPayload), "utf8");
    }

    private storedPayloadRef(parsed: unknown): StoredPayloadReference | undefined {
        if (!isRecord(parsed) || !isRecord(parsed.payloadRef)) return undefined;
        return parsed.payloadRef as unknown as StoredPayloadReference;
    }

    private describeLine(runId: string, line: StoredLineLocation): string {
        return `${runId} segment ${line.segment} byte ${line.byteOffset}`;
    }

    private indexPath(goalId: string, runId: string): string {
        return `${this.baseFilePath(goalId, runId)}.index.db`;
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

    private goalDirectory(goalId: string): string {
        return join(this.directory, this.encodeIdentifier(goalId));
    }

    private baseFilePath(goalId: string, runId: string): string {
        return join(this.goalDirectory(goalId), this.encodeIdentifier(runId));
    }

    private segmentFilePath(goalId: string, runId: string, segment: number): string {
        const base = this.baseFilePath(goalId, runId);
        return segment === 0 ? `${base}.jsonl` : `${base}.part${segment + 1}.jsonl`;
    }

    private blobDirectory(goalId: string): string {
        return join(this.goalDirectory(goalId), "blobs");
    }

    private encodeIdentifier(value: string): string {
        this.assertIdentifier(value, "trajectory identifier");
        return encodePathSegment(value);
    }

    private assertIdentifier(value: string, field: string): void {
        if (typeof value !== "string" || value.length === 0) {
            throw new TrajectoryProtocolError(`${field} must be a non-empty string`);
        }
    }
}
