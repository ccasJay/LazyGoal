import { DatabaseSync, type StatementSync } from "node:sqlite";
import { rm } from "node:fs/promises";

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
}
