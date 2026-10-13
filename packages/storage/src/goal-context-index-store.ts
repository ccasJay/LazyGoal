import {
    chmod,
    mkdir,
    open,
    readFile,
    rename,
    unlink,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { GoalContextIndexSnapshot } from "../../context-retrieval/src/index";

/**
 * Goal 派生上下文索引的读取选项。
 *
 * @remarks
 * 用于校验缓存是否有效；若实际缓存超前、过旧或摘要失配则放弃缓存。
 *
 * @example
 * ```ts
 * const options: GoalContextIndexRestoreOptions = {
 *     expectedSourceDigest: "sha256...",
 *     expectedBoundaries: [{ runId: "run-1", committedThroughSequence: 10 }],
 * };
 * ```
 */
export interface GoalContextIndexRestoreOptions {
    /** 预期的来源稳定哈希；失配时判定缓存无效。 */
    readonly expectedSourceDigest?: string;
    /** 预期的来源 Run 边界集合；任意 Run 边界不一致均判定缓存无效。 */
    readonly expectedBoundaries?: readonly {
        readonly runId: string;
        readonly committedThroughSequence: number;
    }[];
}

/**
 * Goal 上下文索引持久化与缓存边界接口。
 *
 * @remarks
 * 负责 Goal 级派生索引的原子保存、带失效校验的读取以及删除重建。
 *
 * @example
 * ```ts
 * const store: GoalContextIndexStore = new JsonFileGoalContextIndexStore(directory);
 * await store.save(snapshot);
 * const cached = await store.restore("goal-1");
 * ```
 */
export interface GoalContextIndexStore {
    /**
     * @param snapshot - 派生索引快照。
     * @throws 底层 IO 写入失败时抛出异常。
     */
    save(snapshot: GoalContextIndexSnapshot): Promise<void>;

    /**
     * @param goalId - Goal 稳定标识。
     * @param options - 校验选项。
     * @returns 有效快照；缺失、损坏或失配时返回 `undefined`。
     */
    restore(
        goalId: string,
        options?: GoalContextIndexRestoreOptions,
    ): Promise<GoalContextIndexSnapshot | undefined>;

    /**
     * @param goalId - Goal 稳定标识。
     * @remarks 幂等删除，文件不存在时不报错。
     */
    delete(goalId: string): Promise<void>;
}

function isMissingFile(error: unknown): boolean {
    return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
    if (typeof value !== "object" || value === null || seen.has(value as object)) return value;
    seen.add(value as object);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
    return Object.freeze(value);
}

/**
 * 基于本地 JSON 文件的 Goal 上下文索引存储实现。
 *
 * @remarks
 * 文件路径为 `<directory>/<base64url(goalId)>/goal-index.json`。
 * 保存使用同目录临时文件、fsync 和 rename，目录权限 `0700`、文件权限 `0600`。
 *
 * @example
 * ```ts
 * const store = new JsonFileGoalContextIndexStore("~/.lazygoal/workspaces/ws-1/context-sidecars");
 * await store.save(snapshot);
 * const restored = await store.restore("goal-1");
 * ```
 */
export class JsonFileGoalContextIndexStore implements GoalContextIndexStore {
    /**
     * @param directory - 索引 Sidecar 根目录。
     */
    constructor(private readonly directory: string) {}

    private goalDirectory(goalId: string): string {
        const encodedGoalId = Buffer.from(goalId).toString("base64url");
        return join(this.directory, encodedGoalId);
    }

    private filePath(goalId: string): string {
        return join(this.goalDirectory(goalId), "goal-index.json");
    }

    /** @inheritdoc */
    async save(snapshot: GoalContextIndexSnapshot): Promise<void> {
        const goalDir = this.goalDirectory(snapshot.goalId);
        await mkdir(goalDir, { recursive: true, mode: 0o700 });
        const tempPath = join(goalDir, `goal-index.json.tmp.${randomUUID()}`);
        const targetPath = this.filePath(snapshot.goalId);

        const handle = await open(tempPath, "w", 0o600);
        try {
            await handle.writeFile(JSON.stringify(snapshot, null, 2), "utf8");
            await handle.sync();
        } finally {
            await handle.close();
        }
        await chmod(tempPath, 0o600);
        await rename(tempPath, targetPath);
    }

    /** @inheritdoc */
    async restore(
        goalId: string,
        options: GoalContextIndexRestoreOptions = {},
    ): Promise<GoalContextIndexSnapshot | undefined> {
        let content: string;
        try {
            content = await readFile(this.filePath(goalId), "utf8");
        } catch (error) {
            if (isMissingFile(error)) return undefined;
            return undefined;
        }

        let parsed: any;
        try {
            parsed = JSON.parse(content);
        } catch {
            return undefined;
        }

        if (
            typeof parsed !== "object"
            || parsed === null
            || parsed.schemaVersion !== 1
            || parsed.goalId !== goalId
            || typeof parsed.sourceDigest !== "string"
            || !Array.isArray(parsed.sourceBoundaries)
            || !Array.isArray(parsed.stages)
            || !Array.isArray(parsed.notes)
        ) {
            return undefined;
        }

        if (
            options.expectedSourceDigest !== undefined
            && parsed.sourceDigest !== options.expectedSourceDigest
        ) {
            return undefined;
        }

        if (options.expectedBoundaries !== undefined) {
            const cachedBoundaries = new Map<string, number>(
                parsed.sourceBoundaries.map((b: any) => [b.runId, b.committedThroughSequence]),
            );
            if (cachedBoundaries.size !== options.expectedBoundaries.length) {
                return undefined;
            }
            for (const expected of options.expectedBoundaries) {
                const cachedSeq = cachedBoundaries.get(expected.runId);
                if (cachedSeq === undefined || cachedSeq !== expected.committedThroughSequence) {
                    return undefined;
                }
            }
        }

        return deepFreeze(parsed as GoalContextIndexSnapshot);
    }

    /** @inheritdoc */
    async delete(goalId: string): Promise<void> {
        try {
            await unlink(this.filePath(goalId));
        } catch (error) {
            if (isMissingFile(error)) return;
            throw error;
        }
    }
}
