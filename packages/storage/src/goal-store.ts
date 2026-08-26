import { randomUUID } from "node:crypto";
import {
    mkdir,
    open,
    readFile,
    readdir,
    rename,
    stat,
    unlink,
} from "node:fs/promises";
import { join } from "node:path";

import type {
    Goal,
    GoalCatalog,
    GoalCatalogEntry,
    GoalStore,
} from "../../runtime/src/index";
import { goalSnapshotCodec } from "./goal-snapshot-codec";
import type { GoalSnapshotV6 } from "./goal-snapshot";
import { GoalSnapshotProtocolError } from "./goal-snapshot";

/**
 * 单进程内的 Goal 快照存储。
 *
 * @remarks
 * `save` 先将 Goal 编码为严格 v6 Snapshot，`restore` 再解码回 Runtime
 * Goal；两侧都执行完整协议校验，调用方不能通过修改原对象或恢复结果污染
 * Store 内部保存的快照。数据只存在于当前 Store 实例的内存中，不支持跨
 * 实例或进程恢复。
 */
export class InMemoryGoalStore implements GoalStore {
    private readonly snapshots = new Map<string, GoalSnapshotV6>();

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
 * 经 Codec 编码并校验严格 v6 协议；恢复时解码，v1 至 v4 与
 * 未知版本统一抛出 {@link GoalSnapshotProtocolError}，读取失败绝不触发
 * 写回，之后显式保存恢复结果时才以 v6 原子替换。
 *
 * 多个写入者并发保存同一 Goal 时采用最后完成替换者覆盖的语义，不提供
 * 乐观锁、租约或版本冲突检测。文件系统错误原样传播。
 */
export class JsonFileGoalStore implements GoalStore, GoalCatalog {
    /**
     * @param directory - 保存 Goal JSON 文件的目录；保存时按需递归创建。
     */
    constructor(private readonly directory: string) {}

    /**
     * 编码并原子替换指定 Goal 的最新 JSON 快照。
     *
     * @throws Goal 不满足快照协议时抛出 GoalSnapshotProtocolError；目录创建、
     * 临时文件写入或替换失败时传播原始文件系统错误。
     */
    async save(goal: Goal): Promise<void> {
        const snapshot = goalSnapshotCodec.encode(goal);
        const filePath = this.filePath(snapshot.id);
        const temporaryPath = `${filePath}.${randomUUID()}.tmp`;

        await mkdir(this.directory, { recursive: true });

        try {
            const handle = await open(temporaryPath, "wx", 0o600);

            try {
                await handle.writeFile(
                    `${JSON.stringify(snapshot, null, 2)}\n`,
                    "utf8",
                );
                await handle.sync();
            } finally {
                await handle.close();
            }

            await rename(temporaryPath, filePath);
        } catch (error) {
            await unlink(temporaryPath).catch(() => undefined);
            throw error;
        }
    }

    /**
     * 扫描目录中的正式快照并生成稳定的可恢复候选项。
     *
     * @returns 过滤 `completed`、`failed`、`cancelled` 后按最近快照时间倒序
     * 排列的摘要；同一时间按 `goalId` 升序。`.tmp` 和非普通文件会被忽略。
     * @throws JSON、Goal Schema 或跨字段不变量损坏时抛出
     * `GoalSnapshotProtocolError`；目录或文件读取失败时传播文件系统错误。
     */
    async listResumable(): Promise<readonly GoalCatalogEntry[]> {
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
                runStatus === "completed"
                || runStatus === "failed"
                || runStatus === "cancelled"
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
                    updatedAt: new Date(fileStats.mtimeMs).toISOString(),
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
     * @returns 文件不存在时返回 `undefined`，否则返回与存储隔离的 v5/v6 Goal。
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
