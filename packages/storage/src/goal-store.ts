import { encodePathSegment } from "./path-segment";
import {
    mkdir,
    link,
    lstat,
    open,
    readFile,
    readdir,
    rename,
    stat,
    unlink,
    writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

import type {
    Goal,
    GoalCatalog,
    GoalCatalogEntry,
    GoalCatalogScan,
    GoalStore,
} from "../../runtime/src/index";
import { goalSnapshotCodec } from "./goal-snapshot-codec";
import type { GoalSnapshotV1 } from "./goal-snapshot";
import { GoalSnapshotProtocolError } from "./goal-snapshot";
import {
    atomicWriteJson,
    TRANSIENT_FILE_ERROR_CODES,
    WRITE_RETRY_THREE_ATTEMPTS,
} from "./json-file-write";
import { KeyedSerialQueue } from "./keyed-serial-queue";

type GoalFileOperations = Partial<Pick<typeof import("node:fs/promises"), "mkdir" | "link" | "lstat" | "open" | "readFile" | "rename" | "unlink">>;

interface GoalRevisionHint {
    readonly revision: number;
    readonly mtimeMs: number;
    readonly size: number;
}

/** 派生 catalog 摘要的格式版本；不匹配时按未命中处理。 */
const CATALOG_SUMMARY_SCHEMA_VERSION = 1;

/** 单个 Goal 的派生列表摘要及其快照指纹。 */
interface GoalCatalogSummary {
    readonly schemaVersion: number;
    readonly goalId: string;
    readonly runId: string;
    readonly intent: string;
    readonly workflowPhase: GoalCatalogEntry["workflowPhase"];
    readonly runStatus: GoalCatalogEntry["runStatus"];
    readonly committedThroughSequence?: number;
    readonly commitRevision: number;
    readonly snapshotMtimeMs: number;
    readonly snapshotSize: number;
}

const RUN_STATUSES: ReadonlySet<string> = new Set([
    "created",
    "running",
    "waiting",
    "completed",
    "failed",
    "cancelled",
]);

function isTerminalRunStatus(status: GoalCatalogEntry["runStatus"]): boolean {
    return status === "completed" || status === "failed" || status === "cancelled";
}

/** @returns 结构完整的摘要；任何字段非法时返回 `undefined`。 */
function parseCatalogSummary(value: unknown): GoalCatalogSummary | undefined {
    if (value === null || typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    if (record.schemaVersion !== CATALOG_SUMMARY_SCHEMA_VERSION) return undefined;
    if (typeof record.goalId !== "string" || record.goalId.length === 0) return undefined;
    if (typeof record.runId !== "string" || record.runId.length === 0) return undefined;
    if (typeof record.intent !== "string") return undefined;
    if (record.workflowPhase !== "executing") return undefined;
    if (typeof record.runStatus !== "string" || !RUN_STATUSES.has(record.runStatus)) return undefined;
    if (record.committedThroughSequence !== undefined
        && (!Number.isSafeInteger(record.committedThroughSequence) || (record.committedThroughSequence as number) < 0)) {
        return undefined;
    }
    if (!Number.isSafeInteger(record.commitRevision) || (record.commitRevision as number) < 0) return undefined;
    if (typeof record.snapshotMtimeMs !== "number" || !Number.isFinite(record.snapshotMtimeMs)) return undefined;
    if (!Number.isSafeInteger(record.snapshotSize) || (record.snapshotSize as number) < 0) return undefined;
    return {
        schemaVersion: CATALOG_SUMMARY_SCHEMA_VERSION,
        goalId: record.goalId,
        runId: record.runId,
        intent: record.intent,
        workflowPhase: "executing",
        runStatus: record.runStatus as GoalCatalogEntry["runStatus"],
        ...(record.committedThroughSequence === undefined
            ? {}
            : { committedThroughSequence: record.committedThroughSequence as number }),
        commitRevision: record.commitRevision as number,
        snapshotMtimeMs: record.snapshotMtimeMs,
        snapshotSize: record.snapshotSize as number,
    };
}

/**
 * 单进程内的 Goal 快照存储。
 *
 * @remarks
 * `save` 先将 Goal 编码为严格 v1 Snapshot，`restore` 再解码回 Runtime
 * Goal；两侧都执行完整协议校验，调用方不能通过修改原对象或恢复结果污染
 * Store 内部保存的快照。数据只存在于当前 Store 实例的内存中，不支持跨
 * 实例或进程恢复。
 */
export class InMemoryGoalStore implements GoalStore {
    private readonly snapshots = new Map<string, GoalSnapshotV1>();

    async save(goal: Goal): Promise<void> {
        const snapshot = goalSnapshotCodec.encode(goal);
        this.snapshots.set(snapshot.id, snapshot);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        const snapshot = this.snapshots.get(goalId);

        if (snapshot === undefined) {
            return undefined;
        }

        return goalSnapshotCodec.decode(snapshot);
    }

    async readRevision(goalId: string): Promise<number | undefined> {
        const snapshot = this.snapshots.get(goalId);
        return snapshot === undefined ? undefined : snapshot.state.commitRevision ?? 0;
    }
}

/**
 * 基于本地 JSON 文件的 Goal 最新快照存储。
 *
 * @remarks
 * 每个 Goal 只对应一个文件，文件名由 goalId 的 base64url 编码生成；
 * 写入通过同目录临时文件和 rename 完成，避免恢复到半写入快照。保存前
 * 经 Codec 编码并校验严格 v1 协议；恢复时解码，历史版本与未知版本统一
 * 抛出 {@link GoalSnapshotProtocolError}，读取失败绝不触发写回。
 *
 * 多个写入者并发保存同一 Goal 时采用最后完成替换者覆盖的语义，不提供
 * 乐观锁、租约或版本冲突检测。文件系统错误原样传播。
 */
export class JsonFileGoalStore implements GoalStore, GoalCatalog {
    private readonly saveQueue = new KeyedSerialQueue();
    private readonly directory: string;
    private readonly fileOperations: Required<GoalFileOperations>;
    private readonly revisionHints = new Map<string, GoalRevisionHint>();

    /**
     * @param directory - 保存 Goal JSON 文件的目录；保存时按需递归创建。
     * @param fileOperations - 可选文件操作替身，用于确定性验证写入故障；生产默认使用 Node 文件系统。
     */
    constructor(directory: string, fileOperations: GoalFileOperations = {}) {
        this.directory = directory;
        this.fileOperations = {
            mkdir,
            link,
            lstat,
            open,
            readFile,
            rename,
            unlink,
            ...fileOperations,
        };
    }

    /**
     * 以可核对的创建意图创建 Goal 快照。
     *
     * @remarks
     * 调用方必须先持久化投递与同一完整 Goal 创建意图。快照先作为持久化暂存文件
     * 保存，再通过不覆盖的硬链接发布；重试以 inode 确认目标确由该意图创建。占用
     * 身份的旧文件即使内容相同也不会被认作本次创建。成功后暂存文件保留，直至
     * 调用方完成收据与队列事务并调用 `releaseCreationIntent`。
     *
     * @param deliveryId - 已持久化的稳定投递身份。
     * @param goal - 此意图冻结的完整 Goal，重试时必须完全一致。
     * @returns 成功创建或确认之前已创建时为 true；目标被其他文件占用时为 false。
     * @throws 同一投递的意图内容冲突或底层存储失败时抛出。
     */
    async createForDelivery(deliveryId: string, goal: Goal): Promise<boolean> {
        if (!deliveryId.trim()) throw new Error("Invalid delivery identity");
        const snapshot = goalSnapshotCodec.encode(goal);
        const serialized = `${JSON.stringify(snapshot)}\n`;
        await this.fileOperations.mkdir(this.directory, { recursive: true, mode: 0o700 });
        const intent = this.creationIntentPath(deliveryId);
        const temporary = `${intent}.${randomUUID()}.tmp`;
        try {
            const handle = await this.fileOperations.open(temporary, "wx", 0o600);
            try {
                await handle.writeFile(serialized, "utf8");
                await handle.sync();
            } finally { await handle.close(); }
            try {
                await this.fileOperations.link(temporary, intent);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
            }
            const intentInfo = await this.fileOperations.lstat(intent);
            if (!intentInfo.isFile() || await this.fileOperations.readFile(intent, "utf8") !== serialized) {
                throw new Error("Goal creation intent conflict");
            }
            const directory = await this.fileOperations.open(this.directory, "r");
            try { await directory.sync(); } finally { await directory.close(); }
            const target = this.filePath(snapshot.id);
            try {
                await this.fileOperations.link(intent, target);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
                const [intentStat, targetStat] = await Promise.all([
                    this.fileOperations.lstat(intent), this.fileOperations.lstat(target),
                ]);
                if (intentStat.dev !== targetStat.dev || intentStat.ino !== targetStat.ino) return false;
            }
            const parent = await this.fileOperations.open(this.directory, "r");
            try { await parent.sync(); } finally { await parent.close(); }
            return true;
        } finally {
            await this.fileOperations.unlink(temporary).catch(() => undefined);
        }
    }

    /**
     * 清理已完成收据和排队事务的创建意图文件。
     * @param deliveryId - 已结算投递的稳定身份。
     * @throws 底层删除失败时抛出；不存在时视为已清理。
     */
    async releaseCreationIntent(deliveryId: string): Promise<void> {
        if (!deliveryId.trim()) throw new Error("Invalid delivery identity");
        try {
            await this.fileOperations.unlink(this.creationIntentPath(deliveryId));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
    }

    private creationIntentPath(deliveryId: string): string {
        const digest = createHash("sha256").update(deliveryId).digest("hex");
        return join(this.directory, `.trigger-create-${digest}.tmp`);
    }

    /**
     * 编码并原子替换指定 Goal 的最新 JSON 快照。
     *
     * @throws Goal 不满足快照协议时抛出 GoalSnapshotProtocolError；确定性文件错误、
     * 无法确认的替换结果或三次临时故障重试耗尽时传播错误。
     */
    save(goal: Goal): Promise<void> {
        const snapshot = goalSnapshotCodec.encode(goal);
        return this.saveQueue.run(snapshot.id, async () => {
            await this.saveSnapshot(snapshot, goal);
        });
    }

    private async saveSnapshot(
        snapshot: GoalSnapshotV1,
        goal: Goal,
    ): Promise<void> {
        const filePath = this.filePath(snapshot.id);

        await atomicWriteJson({
            path: filePath,
            value: snapshot,
            indent: undefined,
            trailingNewline: true,
            durable: true,
            retry: WRITE_RETRY_THREE_ATTEMPTS,
            verify: async (serialized) => await this.snapshotMatches(filePath, serialized)
                ? "applied"
                : "absent",
            operations: this.fileOperations,
        });

        const status = goal.state.run.status;
        if (status !== "completed" && status !== "failed" && status !== "cancelled") {
            await this.removeArchiveMarkerWithRetry(this.archivePath(goal.id));
        }

        try {
            const stats = await stat(filePath);
            this.revisionHints.set(goal.id, {
                revision: snapshot.state.commitRevision ?? 0,
                mtimeMs: stats.mtimeMs,
                size: stats.size,
            });
            await this.writeCatalogSummary(goal, stats).catch(() => undefined);
        } catch {
            this.revisionHints.delete(goal.id);
        }
    }

    private async snapshotMatches(filePath: string, expected: string): Promise<boolean> {
        try {
            return await this.fileOperations.readFile(filePath, "utf8") === expected;
        } catch (error) {
            if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT") {
                return false;
            }
            throw error;
        }
    }

    private async removeArchiveMarkerWithRetry(markerPath: string): Promise<void> {
        for (let attempt = 1; attempt <= WRITE_RETRY_THREE_ATTEMPTS.attempts; attempt += 1) {
            try {
                await this.fileOperations.unlink(markerPath);
                return;
            } catch (error) {
                if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT") return;
                const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
                if (code === undefined || !TRANSIENT_FILE_ERROR_CODES.has(code)) throw error;
                try {
                    await this.fileOperations.readFile(markerPath);
                } catch (readError) {
                    if (readError instanceof Error && (readError as NodeJS.ErrnoException).code === "ENOENT") return;
                    throw readError;
                }
                if (attempt === WRITE_RETRY_THREE_ATTEMPTS.attempts) throw error;
                await new Promise((resolve) => setTimeout(resolve, WRITE_RETRY_THREE_ATTEMPTS.delayMs));
            }
        }
    }

    /**
     * 扫描并按最近更新时间倒序返回非终态 Goal。
     *
     * @returns 过滤 `completed`、`failed`、`cancelled` 后按最近快照时间倒序
     * 排列的摘要；同一时间按 `goalId` 升序。`.tmp` 和非普通文件会被忽略。
     * @throws JSON、Goal Schema 或跨字段不变量损坏时抛出
     * `GoalSnapshotProtocolError`；目录或文件读取失败时传播文件系统错误。
     */
    async listResumable(): Promise<readonly GoalCatalogEntry[]> {
        const scan = await this.scanEntries(false, false);
        return scan.entries;
    }

    /**
     * 扫描并按最近更新时间倒序返回所有 Goal（包含终态）。
     *
     * @remarks
     * 单条快照无法解码时跳过该条并计入 {@link GoalCatalogScan.unreadableCount}，
     * 使历史列表不因一条旧版本快照整体不可用；目录级读取失败仍拒绝。
     *
     * @returns 包含 `completed`、`failed`、`cancelled` 在内按最近快照时间倒序
     * 排列的摘要与被跳过的不可解码快照数量；同一时间按 `goalId` 升序。
     * `.tmp` 和非普通文件会被忽略。
     * @throws 目录读取失败时抛出异常。
     * @example
     * ```ts
     * const store = new JsonFileGoalStore("/path/to/goals");
     * const scan = await store.listHistory();
     * ```
     */
    async listHistory(): Promise<GoalCatalogScan> {
        return this.scanEntries(true, true);
    }

    /**
     * 设置终态 Goal 的归档标记；快照与运行历史仍可恢复。
     *
     * @param goalId - 正式工作区 Goal 身份。
     * @param archived - 是否从默认看板移入归档视图。
     * @returns Goal 不存在或尚未终止时返回 false；否则返回 true。
     * @throws 文件系统读取或写入失败时传播异常。
     * @example
     * ```ts
     * await store.setArchived("goal-1", true);
     * ```
     */
    async setArchived(goalId: string, archived: boolean): Promise<boolean> {
        const goal = await this.restore(goalId);
        if (goal === undefined) return false;
        const status = goal.state.run.status;
        if (status !== "completed" && status !== "failed" && status !== "cancelled") return false;
        if (archived) await writeFile(this.archivePath(goalId), "", { flag: "w", mode: 0o600 });
        else await unlink(this.archivePath(goalId)).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
        });
        return true;
    }

    /**
     * 移除一个 Goal 的快照与归档标记；调用者负责清理其他存储中的运行数据。
     *
     * @param goalId - 要删除的正式工作区 Goal 身份。
     * @returns 快照不存在时为 false；删除成功时为 true。
     * @throws Goal 未终止或文件系统失败时拒绝。
     * @example
     * ```ts
     * await store.deleteTerminal("goal-1");
     * ```
     */
    async deleteTerminal(goalId: string): Promise<boolean> {
        const goal = await this.restore(goalId);
        if (goal === undefined) return false;
        const status = goal.state.run.status;
        if (status !== "completed" && status !== "failed" && status !== "cancelled") throw new Error("goal_not_terminal");
        await unlink(this.archivePath(goalId)).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
        });
        await unlink(this.filePath(goalId));
        await this.fileOperations.unlink(this.catalogSummaryPath(goalId)).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
        });
        this.revisionHints.delete(goalId);
        return true;
    }

    private async scanEntries(includeTerminal: boolean, tolerateUnreadable: boolean): Promise<GoalCatalogScan> {
        let files;

        try {
            files = await readdir(this.directory, { withFileTypes: true });
        } catch (error) {
            if (
                error instanceof Error
                && (error as NodeJS.ErrnoException).code === "ENOENT"
            ) {
                return { entries: [], unreadableCount: 0 };
            }

            throw error;
        }

        const archived = new Set(files.map((file) => file.name));
        const summaries = await this.readCatalogSummaries();
        const candidates: Array<{
            readonly entry: GoalCatalogEntry;
            readonly mtimeMs: number;
        }> = [];
        let unreadableCount = 0;

        const snapshotFiles = files
            .filter((file) => file.isFile() && file.name.endsWith(".json"))
            .sort((left, right) => left.name < right.name
                ? -1
                : left.name > right.name
                    ? 1
                    : 0);

        for (const file of snapshotFiles) {
            const filePath = join(this.directory, file.name);
            let fileStats: Awaited<ReturnType<typeof stat>>;

            try {
                fileStats = await stat(filePath);
            } catch (error) {
                if (!tolerateUnreadable) throw error;
                unreadableCount += 1;
                continue;
            }

            const isArchived = archived.has(`${file.name}.archived`);
            const summary = summaries.get(file.name.slice(0, -".json".length));
            const entry = summary !== undefined && this.summaryMatches(summary, file, fileStats)
                ? this.entryFromSummary(summary, fileStats, isArchived)
                : await this.entryFromSnapshot(file, filePath, fileStats, isArchived)
                    .catch((error: unknown) => {
                        if (!tolerateUnreadable) throw error;
                        unreadableCount += 1;
                        return undefined;
                    });

            if (entry === undefined) continue;

            if (!includeTerminal && isTerminalRunStatus(entry.runStatus)) continue;

            candidates.push({ entry, mtimeMs: fileStats.mtimeMs });
        }

        candidates.sort((left, right) => {
            const timeDifference = right.mtimeMs - left.mtimeMs;

            if (timeDifference !== 0) {
                return timeDifference;
            }

            return left.entry.goalId < right.entry.goalId
                ? -1
                : left.entry.goalId > right.entry.goalId
                    ? 1
                    : 0;
        });

        return { entries: candidates.map(({ entry }) => entry), unreadableCount };
    }

    /** 状态来自派生摘要时，用快照指纹确认摘要仍然对应当前文件。 */
    private summaryMatches(
        summary: GoalCatalogSummary,
        file: { readonly name: string },
        fileStats: { readonly mtimeMs: number; readonly size: number },
    ): boolean {
        return encodePathSegment(summary.goalId) === file.name.slice(0, -".json".length)
            && summary.snapshotMtimeMs === fileStats.mtimeMs
            && summary.snapshotSize === fileStats.size;
    }

    /** @returns 由摘要与快照指纹构造的目录条目；不读取快照正文。 */
    private entryFromSummary(
        summary: GoalCatalogSummary,
        fileStats: { readonly mtimeMs: number; readonly size: number },
        archived: boolean,
    ): GoalCatalogEntry {
        this.revisionHints.set(summary.goalId, {
            revision: summary.commitRevision,
            mtimeMs: fileStats.mtimeMs,
            size: fileStats.size,
        });
        return {
            goalId: summary.goalId,
            runId: summary.runId,
            intent: summary.intent,
            workflowPhase: summary.workflowPhase,
            runStatus: summary.runStatus,
            ...(summary.committedThroughSequence === undefined
                ? {}
                : { committedThroughSequence: summary.committedThroughSequence }),
            updatedAt: new Date(fileStats.mtimeMs).toISOString(),
            ...(archived ? { archived: true } : {}),
        };
    }

    /** 摘要缺失或指纹不匹配时解码快照，并回写派生摘要。 */
    private async entryFromSnapshot(
        file: { readonly name: string },
        filePath: string,
        fileStats: { readonly mtimeMs: number; readonly size: number },
        archived: boolean,
    ): Promise<GoalCatalogEntry> {
        const goal = this.decodeSnapshot(
            await this.fileOperations.readFile(filePath, "utf8"),
            file.name,
        );

        if (this.filePath(goal.id) !== filePath) {
            throw new GoalSnapshotProtocolError(
                `Goal snapshot filename does not match Goal ID in "${file.name}"`,
            );
        }

        this.revisionHints.set(goal.id, {
            revision: goal.state.commitRevision ?? 0,
            mtimeMs: fileStats.mtimeMs,
            size: fileStats.size,
        });
        await this.writeCatalogSummary(goal, fileStats).catch(() => undefined);

        const entry = {
            goalId: goal.id,
            runId: goal.state.run.id,
            intent: goal.definition.intent,
            workflowPhase: goal.state.workflow.phase,
            runStatus: goal.state.run.status,
            ...(goal.state.run.committedThroughSequence === undefined
                ? {}
                : { committedThroughSequence: goal.state.run.committedThroughSequence }),
            updatedAt: new Date(fileStats.mtimeMs).toISOString(),
            ...(archived ? { archived: true } : {}),
        };
        return entry;
    }

    /** @returns 已落盘的派生 catalog 摘要，按快照文件名（不含扩展名）索引。 */
    private async readCatalogSummaries(): Promise<ReadonlyMap<string, GoalCatalogSummary>> {
        const summaries = new Map<string, GoalCatalogSummary>();
        let names: string[];

        try {
            names = await readdir(this.catalogDirectory());
        } catch (error) {
            if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT") {
                return summaries;
            }
            throw error;
        }

        for (const name of names) {
            if (!name.endsWith(".json")) continue;
            try {
                const summary = parseCatalogSummary(JSON.parse(
                    await this.fileOperations.readFile(join(this.catalogDirectory(), name), "utf8"),
                ));
                if (summary !== undefined) {
                    summaries.set(name.slice(0, -".json".length), summary);
                }
            } catch {
                // 损坏的派生摘要按未命中处理，由快照解码重建。
            }
        }

        return summaries;
    }

    /**
     * 写入派生 catalog 摘要。
     *
     * @remarks
     * 摘要只用于加速列表，可在下次解码时重建；写入失败或进程中断不会改变
     * 已完成的快照。
     */
    private async writeCatalogSummary(
        goal: Goal,
        fileStats: { readonly mtimeMs: number; readonly size: number },
    ): Promise<void> {
        await this.fileOperations.mkdir(this.catalogDirectory(), { recursive: true, mode: 0o700 });
        await atomicWriteJson({
            path: this.catalogSummaryPath(goal.id),
            value: {
                schemaVersion: CATALOG_SUMMARY_SCHEMA_VERSION,
                goalId: goal.id,
                runId: goal.state.run.id,
                intent: goal.definition.intent,
                workflowPhase: goal.state.workflow.phase,
                runStatus: goal.state.run.status,
                ...(goal.state.run.committedThroughSequence === undefined
                    ? {}
                    : { committedThroughSequence: goal.state.run.committedThroughSequence }),
                commitRevision: goal.state.commitRevision ?? 0,
                snapshotMtimeMs: fileStats.mtimeMs,
                snapshotSize: fileStats.size,
            } satisfies GoalCatalogSummary,
            indent: undefined,
            trailingNewline: true,
            durable: false,
            operations: this.fileOperations,
        });
    }

    /**
     * 从 JSON 文件恢复并校验最新 Goal 快照。
     *
     * @returns 文件不存在时返回 `undefined`，否则返回与存储隔离的当前 Goal。
     * @throws 快照违反协议时抛出 GoalSnapshotProtocolError；其他读取错误原样传播。
     */
    async restore(goalId: string): Promise<Goal | undefined> {
        let content: string;

        try {
            content = await readFile(this.filePath(goalId), "utf8");
        } catch (error) {
            if (
                error instanceof Error
                && (error as NodeJS.ErrnoException).code === "ENOENT"
            ) {
                return undefined;
            }

            throw error;
        }

        let goal: Goal;

        goal = this.decodeSnapshot(content, goalId);

        if (goal.id !== goalId) {
            throw new GoalSnapshotProtocolError(
                `Goal snapshot ID mismatch: expected "${goalId}", got "${goal.id}"`,
            );
        }

        return goal;
    }

    /**
     * 读取只用于变更检测的提交修订。
     *
     * @remarks
     * 同实例保存或扫描过的 Goal 使用内存 hint；文件 mtime/size 未变化时只做一次
     * `stat`。文件被外部替换时回退完整 `restore`，并用恢复结果刷新 hint。该值
     * 不保证跨进程实时，也不能替代快照恢复。
     *
     * @param goalId - Goal 的稳定标识。
     * @returns 当前提交修订；Goal 不存在时返回 `undefined`。
     * @throws 文件读取失败或快照损坏时传播异常。
     */
    async readRevision(goalId: string): Promise<number | undefined> {
        const filePath = this.filePath(goalId);
        const hint = this.revisionHints.get(goalId);

        if (hint !== undefined) {
            try {
                const stats = await stat(filePath);
                if (stats.mtimeMs === hint.mtimeMs && stats.size === hint.size) {
                    return hint.revision;
                }
            } catch (error) {
                if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT") {
                    this.revisionHints.delete(goalId);
                    return undefined;
                }
                throw error;
            }
        }

        const before = await stat(filePath).catch((error: unknown) => {
            if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT") {
                return undefined;
            }
            throw error;
        });
        if (before === undefined) {
            this.revisionHints.delete(goalId);
            return undefined;
        }

        const goal = await this.restore(goalId);
        if (goal === undefined) {
            this.revisionHints.delete(goalId);
            return undefined;
        }

        const revision = goal.state.commitRevision ?? 0;
        const after = await stat(filePath).catch((error: unknown) => {
            if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT") {
                return undefined;
            }
            throw error;
        });
        if (after !== undefined
            && after.mtimeMs === before.mtimeMs
            && after.size === before.size) {
            this.revisionHints.set(goalId, {
                revision,
                mtimeMs: after.mtimeMs,
                size: after.size,
            });
        }
        return revision;
    }

    private filePath(goalId: string): string {
        const encodedGoalId = encodePathSegment(goalId);
        return join(this.directory, `${encodedGoalId}.json`);
    }

    private archivePath(goalId: string): string {
        return `${this.filePath(goalId)}.archived`;
    }

    private catalogDirectory(): string {
        return join(this.directory, "catalog");
    }

    private catalogSummaryPath(goalId: string): string {
        return join(this.catalogDirectory(), `${encodePathSegment(goalId)}.json`);
    }

    private decodeSnapshot(content: string, label: string): Goal {
        let parsed: unknown;

        try {
            parsed = JSON.parse(content);
        } catch (error) {
            throw new GoalSnapshotProtocolError(
                `Invalid Goal snapshot for "${label}"`,
                { cause: error },
            );
        }

        try {
            return goalSnapshotCodec.decode(parsed);
        } catch (error) {
            if (error instanceof GoalSnapshotProtocolError) {
                throw new GoalSnapshotProtocolError(
                    `Invalid Goal snapshot for "${label}"`,
                    { cause: error },
                );
            }

            throw error;
        }
    }
}
