import { randomUUID } from "node:crypto";
import {
    mkdir,
    open,
    readFile,
    readdir,
    rename,
    stat,
    unlink,
    writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import type {
    Goal,
    GoalCatalog,
    GoalCatalogEntry,
    GoalStore,
} from "../../runtime/src/index";
import { goalSnapshotCodec } from "./goal-snapshot-codec";
import type { GoalSnapshotV1 } from "./goal-snapshot";
import { GoalSnapshotProtocolError } from "./goal-snapshot";

type GoalFileOperations = Partial<Pick<typeof import("node:fs/promises"), "mkdir" | "open" | "readFile" | "rename" | "unlink">>;
const GOAL_WRITE_RETRY_LIMIT = 3;
const GOAL_WRITE_RETRY_DELAY_MS = 10;
const RETRYABLE_GOAL_FILE_ERROR_CODES = new Set(["EINTR", "EAGAIN", "EBUSY"]);

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
    private readonly saveQueues = new Map<string, Promise<unknown>>();
    private readonly directory: string;
    private readonly fileOperations: Required<GoalFileOperations>;

    /**
     * @param directory - 保存 Goal JSON 文件的目录；保存时按需递归创建。
     * @param fileOperations - 可选文件操作替身，用于确定性验证写入故障；生产默认使用 Node 文件系统。
     */
    constructor(directory: string, fileOperations: GoalFileOperations = {}) {
        this.directory = directory;
        this.fileOperations = {
            mkdir,
            open,
            readFile,
            rename,
            unlink,
            ...fileOperations,
        };
    }

    /**
     * 编码并原子替换指定 Goal 的最新 JSON 快照。
     *
     * @throws Goal 不满足快照协议时抛出 GoalSnapshotProtocolError；确定性文件错误、
     * 无法确认的替换结果或三次临时故障重试耗尽时传播错误。
     */
    save(goal: Goal): Promise<void> {
        const snapshot = goalSnapshotCodec.encode(goal);
        const key = snapshot.id;
        const previous = this.saveQueues.get(key) ?? Promise.resolve();
        const operation = previous.catch(() => undefined).then(() => this.saveSnapshot(snapshot, goal));
        let tracked: Promise<unknown>;
        tracked = operation
            .catch(() => undefined)
            .finally(() => {
                if (this.saveQueues.get(key) === tracked) this.saveQueues.delete(key);
            });
        this.saveQueues.set(key, tracked);
        return operation;
    }

    private async saveSnapshot(
        snapshot: GoalSnapshotV1,
        goal: Goal,
    ): Promise<void> {
        const filePath = this.filePath(snapshot.id);
        const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
        const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
        let saved = false;

        for (let attempt = 1; attempt <= GOAL_WRITE_RETRY_LIMIT; attempt += 1) {
            try {
                await this.fileOperations.mkdir(this.directory, { recursive: true });
                const handle = await this.fileOperations.open(temporaryPath, "wx", 0o600);
                try {
                    await handle.writeFile(serialized, "utf8");
                    await handle.sync();
                } finally {
                    await handle.close();
                }
                await this.fileOperations.rename(temporaryPath, filePath);
                saved = true;
                break;
            } catch (error) {
                const code = error instanceof Error
                    ? (error as NodeJS.ErrnoException).code
                    : undefined;
                if (code === undefined || !RETRYABLE_GOAL_FILE_ERROR_CODES.has(code)) {
                    await this.fileOperations.unlink(temporaryPath).catch(() => undefined);
                    throw error;
                }

                let snapshotWasReplaced: boolean;
                try {
                    snapshotWasReplaced = await this.snapshotMatches(filePath, serialized);
                } catch (verificationError) {
                    await this.fileOperations.unlink(temporaryPath).catch(() => undefined);
                    throw verificationError;
                }
                if (snapshotWasReplaced) {
                    saved = true;
                    break;
                }
                await this.fileOperations.unlink(temporaryPath).catch(() => undefined);
                if (attempt === GOAL_WRITE_RETRY_LIMIT) throw error;
                await new Promise((resolve) => setTimeout(resolve, GOAL_WRITE_RETRY_DELAY_MS));
            }
        }

        if (!saved) throw new Error("Goal Snapshot save did not reach a verified state");
        const status = goal.state.run.status;
        if (status !== "completed" && status !== "failed" && status !== "cancelled") {
            await this.removeArchiveMarkerWithRetry(this.archivePath(goal.id));
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
        for (let attempt = 1; attempt <= GOAL_WRITE_RETRY_LIMIT; attempt += 1) {
            try {
                await this.fileOperations.unlink(markerPath);
                return;
            } catch (error) {
                if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT") return;
                const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
                if (code === undefined || !RETRYABLE_GOAL_FILE_ERROR_CODES.has(code)) throw error;
                try {
                    await this.fileOperations.readFile(markerPath);
                } catch (readError) {
                    if (readError instanceof Error && (readError as NodeJS.ErrnoException).code === "ENOENT") return;
                    throw readError;
                }
                if (attempt === GOAL_WRITE_RETRY_LIMIT) throw error;
                await new Promise((resolve) => setTimeout(resolve, GOAL_WRITE_RETRY_DELAY_MS));
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
        return this.scanEntries(false);
    }

    /**
     * 扫描并按最近更新时间倒序返回所有 Goal（包含终态）。
     *
     * @returns 包含 `completed`、`failed`、`cancelled` 在内按最近快照时间倒序
     * 排列的摘要；同一时间按 `goalId` 升序。`.tmp` 和非普通文件会被忽略。
     * @throws JSON、Goal Schema 或跨字段不变量损坏时抛出
     * `GoalSnapshotProtocolError`；目录或文件读取失败时传播文件系统错误。
     * @example
     * ```ts
     * const store = new JsonFileGoalStore("/path/to/goals");
     * const history = await store.listHistory();
     * ```
     */
    async listHistory(): Promise<readonly GoalCatalogEntry[]> {
        return this.scanEntries(true);
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
        return true;
    }

    private async scanEntries(includeTerminal: boolean): Promise<readonly GoalCatalogEntry[]> {
        let files;

        try {
            files = await readdir(this.directory, { withFileTypes: true });
        } catch (error) {
            if (
                error instanceof Error
                && (error as NodeJS.ErrnoException).code === "ENOENT"
            ) {
                return [];
            }

            throw error;
        }

        const candidates: Array<{
            readonly entry: GoalCatalogEntry;
            readonly mtimeMs: number;
        }> = [];

        const snapshotFiles = files
            .filter((file) => file.isFile() && file.name.endsWith(".json"))
            .sort((left, right) => left.name < right.name
                ? -1
                : left.name > right.name
                    ? 1
                    : 0);

        for (const file of snapshotFiles) {
            const filePath = join(this.directory, file.name);
            const content = await readFile(filePath, "utf8");
            const goal = this.decodeSnapshot(content, file.name);

            if (this.filePath(goal.id) !== filePath) {
                throw new GoalSnapshotProtocolError(
                    `Goal snapshot filename does not match Goal ID in "${file.name}"`,
                );
            }

            const fileStats = await stat(filePath);
            const runStatus = goal.state.run.status;

            if (
                !includeTerminal
                && (
                    runStatus === "completed"
                    || runStatus === "failed"
                    || runStatus === "cancelled"
                )
            ) {
                continue;
            }

            candidates.push({
                entry: {
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    intent: goal.definition.intent,
                    workflowPhase: goal.state.workflow.phase,
                    runStatus,
                    committedThroughSequence: goal.state.run.committedThroughSequence,
                    updatedAt: new Date(fileStats.mtimeMs).toISOString(),
                    ...(files.some((candidate) => candidate.name === `${file.name}.archived`) ? { archived: true } : {}),
                },
                mtimeMs: fileStats.mtimeMs,
            });
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

        return candidates.map(({ entry }) => entry);
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

    private filePath(goalId: string): string {
        const encodedGoalId = Buffer.from(goalId, "utf8").toString("base64url");
        return join(this.directory, `${encodedGoalId}.json`);
    }

    private archivePath(goalId: string): string {
        return `${this.filePath(goalId)}.archived`;
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
