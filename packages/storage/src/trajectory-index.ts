import { DatabaseSync, type StatementSync } from "node:sqlite";
import { rm } from "node:fs/promises";
import { TrajectoryProtocolError } from "../../runtime/src/index";

/** Trajectory 索引 schema 版本；不兼容时删除并重建。 */
const INDEX_SCHEMA_VERSION = 1;

/**
 * 索引行携带的查询元数据。
 *
 * @remarks
 * 不包含完整 payload；`payloadRef` 只在 payload 外置时出现。所有文本字段都由
 * Runtime 的摘要投影生成，索引不重新解释事件语义。
 */
export interface TrajectoryIndexEntry {
    readonly sequence: number;
    readonly eventId: string;
    readonly occurredAt: string;
    readonly eventType: string;
    readonly category: string;
    readonly executionUnitId?: string;
    readonly stepIndex?: number;
    readonly actionId?: string;
    readonly modelCallId?: string;
    readonly modelStage?: string;
    readonly programId?: string;
    readonly parentActionId?: string;
    readonly callIndex?: number;
    readonly segment: number;
    readonly byteOffset: number;
    readonly byteLength: number;
    readonly payloadBytes: number;
    readonly payloadRef?: string;
    readonly title: string;
    readonly preview: string;
    readonly previewTruncated: boolean;
    readonly inputPreview?: string;
    readonly resultPreview?: string;
}

/** 索引中一条事件的定位信息。 */
export interface TrajectoryIndexLocation {
    readonly sequence: number;
    readonly eventId: string;
    readonly segment: number;
    readonly byteOffset: number;
    readonly byteLength: number;
}

/** 索引查询的过滤条件；游标边界与其他过滤条件分开表达。 */
export interface TrajectoryIndexFilter {
    readonly committedThroughSequence: number;
    readonly category?: string;
    readonly executionUnitId?: string;
    readonly actionId?: string;
    readonly modelCallId?: string;
    readonly fromSequence?: number;
    readonly toSequence?: number;
    readonly afterSequence?: number;
    readonly beforeSequence?: number;
    readonly direction: "forward" | "backward";
    readonly limit: number;
}

/** 索引查询返回的完整元数据行。 */
export interface TrajectoryIndexRow extends TrajectoryIndexLocation {
    readonly occurredAt: string;
    readonly eventType: string;
    readonly category: string;
    readonly executionUnitId?: string;
    readonly stepIndex?: number;
    readonly actionId?: string;
    readonly modelCallId?: string;
    readonly modelStage?: string;
    readonly programId?: string;
    readonly parentActionId?: string;
    readonly callIndex?: number;
    readonly payloadBytes: number;
    readonly payloadRef?: string;
    readonly title: string;
    readonly preview: string;
    readonly previewTruncated: boolean;
    readonly inputPreview?: string;
    readonly resultPreview?: string;
}

/** 索引聚合出的时间线。 */
export interface TrajectoryIndexTimeline {
    readonly eventCount: number;
    readonly timeRange: { readonly start: string; readonly end: string } | null;
    readonly buckets: readonly {
        readonly startSequence: number;
        readonly endSequence: number;
        readonly eventCount: number;
        readonly eventTypes: Readonly<Record<string, number>>;
    }[];
}

/**
 * 单个 Run 的可重建 SQLite 索引。
 *
 * @remarks
 * 只保存查询元数据与 JSONL 字节位置；JSONL 与 Blob 仍是事实来源。使用 DELETE
 * journal，不使用 WAL，保证目录级 copy-out 不会遗漏已提交数据。schema 版本不匹配
 * 时构造失败，调用方负责删除并重建。
 */
export class TrajectoryIndex {
    private readonly database: DatabaseSync;
    private readonly path: string;
    private readonly insertStatement: StatementSync;
    private readonly insertProgramStatement: StatementSync;
    private readonly statementCache = new Map<string, StatementSync>();

    /**
     * @param path - 索引数据库文件；父目录必须已存在。
     * @throws 数据库损坏或 schema 版本不支持时抛出。
     */
    constructor(path: string) {
        this.path = path;
        this.database = new DatabaseSync(path);
        this.database.exec("PRAGMA journal_mode = DELETE");
        this.database.exec("PRAGMA busy_timeout = 5000");

        const version = Number((this.database.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);

        if (version !== 0 && version !== INDEX_SCHEMA_VERSION) {
            this.database.close();
            throw new Error(`Unsupported Trajectory index schema version ${version}`);
        }

        if (version === 0) {
            this.database.exec(`
                CREATE TABLE events (
                    sequence INTEGER PRIMARY KEY,
                    event_id TEXT NOT NULL UNIQUE,
                    occurred_at TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    category TEXT NOT NULL,
                    execution_unit_id TEXT,
                    step_index INTEGER,
                    action_id TEXT,
                    model_call_id TEXT,
                    model_stage TEXT,
                    program_id TEXT,
                    parent_action_id TEXT,
                    call_index INTEGER,
                    segment INTEGER NOT NULL,
                    byte_offset INTEGER NOT NULL,
                    byte_length INTEGER NOT NULL,
                    payload_bytes INTEGER NOT NULL,
                    payload_ref TEXT,
                    title TEXT NOT NULL,
                    preview TEXT NOT NULL,
                    preview_truncated INTEGER NOT NULL,
                    input_preview TEXT,
                    result_preview TEXT
                );
                CREATE INDEX events_execution_unit ON events(execution_unit_id, sequence);
                CREATE INDEX events_action ON events(action_id, sequence);
                CREATE INDEX events_model_call ON events(model_call_id, sequence);
                CREATE INDEX events_event_type ON events(event_type, sequence);
                CREATE INDEX events_occurred_at ON events(occurred_at);
                CREATE TABLE programs (
                    program_id TEXT PRIMARY KEY,
                    parent_action_id TEXT NOT NULL
                );
                PRAGMA user_version = ${INDEX_SCHEMA_VERSION};
            `);
        }

        this.insertStatement = this.database.prepare(`
            INSERT INTO events (
                sequence, event_id, occurred_at, event_type, category,
                execution_unit_id, step_index, action_id, model_call_id, model_stage,
                program_id, parent_action_id, call_index,
                segment, byte_offset, byte_length, payload_bytes, payload_ref,
                title, preview, preview_truncated, input_preview, result_preview
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        this.insertProgramStatement = this.database.prepare(`
            INSERT INTO programs (program_id, parent_action_id) VALUES (?, ?)
            ON CONFLICT(program_id) DO UPDATE SET parent_action_id = excluded.parent_action_id
        `);
    }

    /** @returns 索引中的最大序号；空索引返回 0。 */
    maxSequence(): number {
        const row = this.statement("SELECT COALESCE(MAX(sequence), 0) AS max_sequence FROM events")
            .get() as { max_sequence: number };
        return row.max_sequence;
    }

    /** @returns 索引中的事件行数。 */
    count(): number {
        const row = this.statement("SELECT COUNT(*) AS count FROM events").get() as { count: number };
        return row.count;
    }

    /** @returns 最后一条索引行的定位；空索引返回 `undefined`。 */
    lastLocation(): TrajectoryIndexLocation | undefined {
        const row = this.statement(`
            SELECT sequence, event_id, segment, byte_offset, byte_length
            FROM events ORDER BY sequence DESC LIMIT 1
        `).get() as {
            sequence: number;
            event_id: string;
            segment: number;
            byte_offset: number;
            byte_length: number;
        } | undefined;

        return row === undefined ? undefined : {
            sequence: row.sequence,
            eventId: row.event_id,
            segment: row.segment,
            byteOffset: row.byte_offset,
            byteLength: row.byte_length,
        };
    }

    /**
     * 在一个事务中执行同步索引写入。
     *
     * @param action - 只包含同步索引操作的回调。
     * @throws 回调失败时回滚并传播原始错误。
     */
    runInTransaction(action: () => void): void {
        this.database.exec("BEGIN");
        try {
            action();
            this.database.exec("COMMIT");
        } catch (error) {
            try {
                this.database.exec("ROLLBACK");
            } catch {
                // 回滚失败不掩盖原始错误。
            }
            throw error;
        }
    }

    /** @param entry - 已完成摘要投影的事件元数据。 @throws 主键或身份冲突时拒绝。 */
    insert(entry: TrajectoryIndexEntry): void {
        this.insertStatement.run(
            entry.sequence,
            entry.eventId,
            entry.occurredAt,
            entry.eventType,
            entry.category,
            entry.executionUnitId ?? null,
            entry.stepIndex ?? null,
            entry.actionId ?? null,
            entry.modelCallId ?? null,
            entry.modelStage ?? null,
            entry.programId ?? null,
            entry.parentActionId ?? null,
            entry.callIndex ?? null,
            entry.segment,
            entry.byteOffset,
            entry.byteLength,
            entry.payloadBytes,
            entry.payloadRef ?? null,
            entry.title,
            entry.preview,
            entry.previewTruncated ? 1 : 0,
            entry.inputPreview ?? null,
            entry.resultPreview ?? null,
        );
    }

    /** @param programId - Program 身份。 @param parentActionId - 启动事件记录的父 Action。 */
    insertProgram(programId: string, parentActionId: string): void {
        this.insertProgramStatement.run(programId, parentActionId);
    }

    /** @returns Program 的父 Action；未记录时返回 `undefined`。 */
    programParent(programId: string): string | undefined {
        const row = this.statement("SELECT parent_action_id FROM programs WHERE program_id = ?")
            .get(programId) as { parent_action_id: string } | undefined;
        return row?.parent_action_id;
    }

    /** @returns 同一执行单元在指定决策前最近的模型调用身份。 */
    latestModelCallId(
        executionUnitId: string,
        stage: string,
        beforeSequence: number,
    ): string | undefined {
        const row = this.statement(`
            SELECT model_call_id FROM events
            WHERE execution_unit_id = ? AND event_type = 'model_context_frame'
                AND model_stage = ? AND model_call_id IS NOT NULL AND sequence < ?
            ORDER BY sequence DESC LIMIT 1
        `).get(executionUnitId, stage, beforeSequence) as { model_call_id: string } | undefined;
        return row?.model_call_id;
    }

    /** @param actionId - 目标 Action。 @param resultPreview - 工具结束事件的有界观察预览。 */
    updateResultPreview(actionId: string, resultPreview: string): void {
        this.statement(`
            UPDATE events SET result_preview = ?
            WHERE action_id = ? AND event_type = 'tool_started'
        `).run(resultPreview, actionId);
    }

    /**
     * @param filter - 水位、过滤条件与游标边界。
     * @returns 按请求方向排序的元数据行；backward 结果仍按序号升序返回。
     * @throws 索引行校验失败时拒绝。
     */
    queryRows(filter: TrajectoryIndexFilter): TrajectoryIndexRow[] {
        const { sql, params } = this.filterSql(filter, true);
        const order = filter.direction === "backward" ? "DESC" : "ASC";
        const rows = this.statement(`SELECT ${SELECT_COLUMNS} FROM events WHERE ${sql} ORDER BY sequence ${order} LIMIT ?`)
            .all(...params, filter.limit) as unknown as RawIndexRow[];
        const mapped = rows.map(mapIndexRow);
        return filter.direction === "backward" ? mapped.reverse() : mapped;
    }

    /**
     * @param filter - 水位与过滤条件。
     * @param includeCursor - 为 `true` 时会计入游标边界，用于判断相邻页是否存在。
     * @returns 过滤范围内的可见事件数。
     */
    countRows(filter: TrajectoryIndexFilter, includeCursor = false): number {
        const { sql, params } = this.filterSql(filter, includeCursor);
        return (this.statement(`SELECT COUNT(*) AS count FROM events WHERE ${sql}`)
            .get(...params) as { count: number }).count;
    }

    /** @param committedThroughSequence - 固定水位。 @returns 水位内的全部事件数。 */
    countVisible(committedThroughSequence: number): number {
        return (this.statement("SELECT COUNT(*) AS count FROM events WHERE sequence <= ?")
            .get(committedThroughSequence) as { count: number }).count;
    }

    /** @returns 指定序号的事件行；不存在或超出水位时返回 `undefined`。 */
    rowAt(sequence: number, committedThroughSequence: number): TrajectoryIndexRow | undefined {
        const row = this.statement(`SELECT ${SELECT_COLUMNS} FROM events WHERE sequence = ? AND sequence <= ?`)
            .get(sequence, committedThroughSequence) as unknown as RawIndexRow | undefined;
        return row === undefined ? undefined : mapIndexRow(row);
    }

    /** @returns 同一 Action 在水位内的全部事件行，按序号升序。 */
    rowsByAction(actionId: string, committedThroughSequence: number): TrajectoryIndexRow[] {
        return (this.statement(`SELECT ${SELECT_COLUMNS} FROM events WHERE action_id = ? AND sequence <= ? ORDER BY sequence ASC`)
            .all(actionId, committedThroughSequence) as unknown as RawIndexRow[]).map(mapIndexRow);
    }

    /** @returns 执行单元首条显式归属事件的序号；不存在时返回 `undefined`。 */
    locateExecutionUnit(executionUnitId: string, committedThroughSequence: number): number | undefined {
        const row = this.statement("SELECT MIN(sequence) AS sequence FROM events WHERE execution_unit_id = ? AND sequence <= ?")
            .get(executionUnitId, committedThroughSequence) as { sequence: number | null };
        return row.sequence ?? undefined;
    }

    /** @returns 执行单元末条显式归属事件的序号；不存在时返回 `undefined`。 */
    lastExecutionUnitSequence(executionUnitId: string, committedThroughSequence: number): number | undefined {
        const row = this.statement("SELECT MAX(sequence) AS sequence FROM events WHERE execution_unit_id = ? AND sequence <= ?")
            .get(executionUnitId, committedThroughSequence) as { sequence: number | null };
        return row.sequence ?? undefined;
    }

    /** @returns 指定边界前后的上下文事件，排除目标执行单元自身的事件。 */
    contextRows(
        committedThroughSequence: number,
        boundary: number,
        direction: "before" | "after",
        limit: number,
        executionUnitId: string,
    ): TrajectoryIndexRow[] {
        const comparison = direction === "before" ? "<" : ">";
        const order = direction === "before" ? "DESC" : "ASC";
        const rows = this.statement(`
            SELECT ${SELECT_COLUMNS} FROM events
            WHERE sequence <= ? AND (execution_unit_id IS NULL OR execution_unit_id != ?)
                AND sequence ${comparison} ?
            ORDER BY sequence ${order} LIMIT ?
        `).all(committedThroughSequence, executionUnitId, boundary, limit) as unknown as RawIndexRow[];
        const mapped = rows.map(mapIndexRow);
        return direction === "before" ? mapped.reverse() : mapped;
    }

    /**
     * @param committedThroughSequence - 固定水位。
     * @param bucketSize - 每个序列桶覆盖的事件数。
     * @returns 水位内的事件数、时间范围与固定序列桶。
     * @throws 桶数量超过 500 时拒绝。
     */
    timeline(committedThroughSequence: number, bucketSize: number): TrajectoryIndexTimeline {
        const summary = this.statement(
            "SELECT COUNT(*) AS count, MIN(occurred_at) AS start, MAX(occurred_at) AS end FROM events WHERE sequence <= ?",
        ).get(committedThroughSequence) as { count: number; start: string | null; end: string | null };

        if (summary.count === 0) return { eventCount: 0, timeRange: null, buckets: [] };

        if (Math.ceil(summary.count / bucketSize) > 500) {
            throw new TrajectoryProtocolError("Trajectory timeline bucket count exceeds limit");
        }

        const buckets = this.statement(`
            SELECT CAST((sequence - 1) / ? AS INTEGER) AS bucket,
                COUNT(*) AS count, MIN(sequence) AS start, MAX(sequence) AS end
            FROM events WHERE sequence <= ? GROUP BY bucket ORDER BY bucket
        `).all(bucketSize, committedThroughSequence) as unknown as Array<{
            bucket: number;
            count: number;
            start: number;
            end: number;
        }>;
        const types = this.statement(`
            SELECT CAST((sequence - 1) / ? AS INTEGER) AS bucket, event_type, COUNT(*) AS count
            FROM events WHERE sequence <= ? GROUP BY bucket, event_type ORDER BY bucket
        `).all(bucketSize, committedThroughSequence) as unknown as Array<{
            bucket: number;
            event_type: string;
            count: number;
        }>;
        const eventTypes = new Map<number, Record<string, number>>();

        for (const item of types) {
            const target = eventTypes.get(item.bucket) ?? {};
            target[item.event_type] = item.count;
            eventTypes.set(item.bucket, target);
        }

        return {
            eventCount: summary.count,
            timeRange: summary.start === null || summary.end === null ? null : { start: summary.start, end: summary.end },
            buckets: buckets.map((bucket) => ({
                startSequence: bucket.start,
                endSequence: bucket.end,
                eventCount: bucket.count,
                eventTypes: eventTypes.get(bucket.bucket) ?? {},
            })),
        };
    }

    /** 清空全部索引行与 Program 关系；事实文件不变。 */
    clear(): void {
        this.database.exec("DELETE FROM events; DELETE FROM programs;");
    }

    /** 关闭数据库句柄。 */
    close(): void {
        this.database.close();
    }

    /** 关闭并删除索引文件及其 journal 旁文件。 */
    async destroy(): Promise<void> {
        try {
            this.database.close();
        } catch {
            // 已关闭或损坏的句柄不影响删除文件。
        }
        for (const suffix of ["", "-journal", "-wal", "-shm"]) {
            await rm(`${this.path}${suffix}`, { force: true });
        }
    }

    private statement(sql: string): StatementSync {
        const cached = this.statementCache.get(sql);
        if (cached !== undefined) return cached;
        const prepared = this.database.prepare(sql);
        this.statementCache.set(sql, prepared);
        return prepared;
    }

    private filterSql(
        filter: TrajectoryIndexFilter,
        includeCursor: boolean,
    ): { sql: string; params: Array<string | number> } {
        const clauses = ["sequence <= ?"];
        const params: Array<string | number> = [filter.committedThroughSequence];
        const addEquality = (column: string, value: string | undefined): void => {
            if (value === undefined) return;
            clauses.push(`${column} = ?`);
            params.push(value);
        };

        addEquality("category", filter.category);
        addEquality("execution_unit_id", filter.executionUnitId);
        addEquality("action_id", filter.actionId);
        addEquality("model_call_id", filter.modelCallId);

        if (filter.fromSequence !== undefined) {
            clauses.push("sequence >= ?");
            params.push(filter.fromSequence);
        }
        if (filter.toSequence !== undefined) {
            clauses.push("sequence <= ?");
            params.push(filter.toSequence);
        }
        if (includeCursor && filter.afterSequence !== undefined) {
            clauses.push("sequence > ?");
            params.push(filter.afterSequence);
        }
        if (includeCursor && filter.beforeSequence !== undefined) {
            clauses.push("sequence < ?");
            params.push(filter.beforeSequence);
        }

        return { sql: clauses.join(" AND "), params };
    }
}

const SELECT_COLUMNS = `
    sequence, event_id, occurred_at, event_type, category,
    execution_unit_id, step_index, action_id, model_call_id, model_stage,
    program_id, parent_action_id, call_index,
    segment, byte_offset, byte_length, payload_bytes, payload_ref,
    title, preview, preview_truncated, input_preview, result_preview
`;

interface RawIndexRow {
    readonly sequence: number;
    readonly event_id: string;
    readonly occurred_at: string;
    readonly event_type: string;
    readonly category: string;
    readonly execution_unit_id: string | null;
    readonly step_index: number | null;
    readonly action_id: string | null;
    readonly model_call_id: string | null;
    readonly model_stage: string | null;
    readonly program_id: string | null;
    readonly parent_action_id: string | null;
    readonly call_index: number | null;
    readonly segment: number;
    readonly byte_offset: number;
    readonly byte_length: number;
    readonly payload_bytes: number;
    readonly payload_ref: string | null;
    readonly title: string;
    readonly preview: string;
    readonly preview_truncated: number;
    readonly input_preview: string | null;
    readonly result_preview: string | null;
}

function mapIndexRow(row: RawIndexRow): TrajectoryIndexRow {
    if (typeof row.sequence !== "number" || typeof row.event_id !== "string"
        || typeof row.occurred_at !== "string" || typeof row.event_type !== "string"
        || typeof row.category !== "string" || typeof row.segment !== "number"
        || typeof row.byte_offset !== "number" || typeof row.byte_length !== "number"
        || typeof row.payload_bytes !== "number" || typeof row.title !== "string"
        || typeof row.preview !== "string" || typeof row.preview_truncated !== "number") {
        throw new TrajectoryProtocolError("Invalid Trajectory index row");
    }

    return {
        sequence: row.sequence,
        eventId: row.event_id,
        occurredAt: row.occurred_at,
        eventType: row.event_type,
        category: row.category,
        ...(row.execution_unit_id === null ? {} : { executionUnitId: row.execution_unit_id }),
        ...(row.step_index === null ? {} : { stepIndex: row.step_index }),
        ...(row.action_id === null ? {} : { actionId: row.action_id }),
        ...(row.model_call_id === null ? {} : { modelCallId: row.model_call_id }),
        ...(row.model_stage === null ? {} : { modelStage: row.model_stage }),
        ...(row.program_id === null ? {} : { programId: row.program_id }),
        ...(row.parent_action_id === null ? {} : { parentActionId: row.parent_action_id }),
        ...(row.call_index === null ? {} : { callIndex: row.call_index }),
        segment: row.segment,
        byteOffset: row.byte_offset,
        byteLength: row.byte_length,
        payloadBytes: row.payload_bytes,
        ...(row.payload_ref === null ? {} : { payloadRef: row.payload_ref }),
        title: row.title,
        preview: row.preview,
        previewTruncated: row.preview_truncated === 1,
        ...(row.input_preview === null ? {} : { inputPreview: row.input_preview }),
        ...(row.result_preview === null ? {} : { resultPreview: row.result_preview }),
    };
}
