import { encodePathSegment } from "./path-segment";
import { deepFreeze } from "../../contracts/src/index";
import {
    readFile,
    unlink,
} from "node:fs/promises";
import { join } from "node:path";
import type { GoalContextIndexSnapshot } from "../../context-retrieval/src/index";
import { goalContextIndexFileBinding } from "./generated/goal-context-index-binding";
import type { GoalContextIndexSnapshotFile } from "./goal-context-index-file";
import { atomicWriteJson } from "./json-file-write";

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

function validateGoalContextIndexSnapshot(snapshot: GoalContextIndexSnapshotFile): readonly string[] {
    const issues: string[] = [];
    for (const [field, value] of [
        ["goalId", snapshot.goalId],
        ["buildId", snapshot.buildId],
        ["sourceDigest", snapshot.sourceDigest],
    ] as const) {
        if (value.length === 0) issues.push(`${field} must be a non-empty string`);
    }
    if (!Number.isInteger(snapshot.createdAt) || snapshot.createdAt < 0) {
        issues.push("createdAt must be a non-negative integer");
    }
    for (const [index, boundary] of snapshot.sourceBoundaries.entries()) {
        if (boundary.runId.length === 0) issues.push(`sourceBoundaries[${index}].runId must be a non-empty string`);
        if (!Number.isInteger(boundary.committedThroughSequence) || boundary.committedThroughSequence < 0) {
            issues.push(`sourceBoundaries[${index}].committedThroughSequence must be a non-negative integer`);
        }
    }
    for (const [index, stage] of snapshot.stages.entries()) {
        const label = `stages[${index}]`;
        for (const [field, value] of [
            ["goalId", stage.goalId],
            ["runId", stage.runId],
            ["stageId", stage.stageId],
            ["target", stage.target],
        ] as const) {
            if (value.length === 0) issues.push(`${label}.${field} must be a non-empty string`);
        }
        if (!Number.isInteger(stage.revision) || stage.revision < 1) issues.push(`${label}.revision must be a positive integer`);
        for (const [itemIndex, criterion] of stage.acceptanceCriteria.entries()) {
            if (criterion.length === 0) issues.push(`${label}.acceptanceCriteria[${itemIndex}] must be a non-empty string`);
        }
        if (!Number.isInteger(stage.source.firstSequence) || stage.source.firstSequence < 0
            || !Number.isInteger(stage.source.lastSequence) || stage.source.lastSequence < 0) {
            issues.push(`${label}.source sequences must be non-negative integers`);
        }
        for (const [itemIndex, eventId] of stage.source.eventIds.entries()) {
            if (eventId.length === 0) issues.push(`${label}.source.eventIds[${itemIndex}] must be a non-empty string`);
        }
    }
    for (const [index, note] of snapshot.notes.entries()) {
        const label = `notes[${index}]`;
        for (const [field, value] of [
            ["goalId", note.goalId],
            ["runId", note.runId],
            ["noteId", note.noteId],
            ["content", note.content],
        ] as const) {
            if (value.length === 0) issues.push(`${label}.${field} must be a non-empty string`);
        }
        if (!Number.isInteger(note.revision) || note.revision < 1) issues.push(`${label}.revision must be a positive integer`);
        if (note.source.kind === "user_message") {
            if (note.source.messageId.length === 0) issues.push(`${label}.source.messageId must be a non-empty string`);
            if (note.source.verbatimSnippet.length === 0) issues.push(`${label}.source.verbatimSnippet must be a non-empty string`);
        } else if (note.source.kind === "user_decision") {
            if (note.source.messageId !== undefined && note.source.messageId.length === 0) {
                issues.push(`${label}.source.messageId must be a non-empty string`);
            }
        } else if (note.source.actionId !== undefined && note.source.actionId.length === 0) {
            issues.push(`${label}.source.actionId must be a non-empty string`);
        }
    }
    return issues;
}

function isMissingFile(error: unknown): boolean {
    return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
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
        const encodedGoalId = encodePathSegment(goalId);
        return join(this.directory, encodedGoalId);
    }

    private filePath(goalId: string): string {
        return join(this.goalDirectory(goalId), "goal-index.json");
    }

    /** @inheritdoc */
    async save(snapshot: GoalContextIndexSnapshot): Promise<void> {
        const validated = goalContextIndexFileBinding.read(snapshot, "reject");
        if (!validated.ok || validateGoalContextIndexSnapshot(validated.data).length > 0) {
            throw new Error("Goal context index snapshot violates its current schema");
        }
        await atomicWriteJson({
            path: this.filePath(snapshot.goalId),
            value: validated.data,
            indent: 2,
            trailingNewline: false,
            durable: true,
        });
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

        let decoded: unknown;
        try {
            decoded = JSON.parse(content);
        } catch {
            return undefined;
        }

        const read = goalContextIndexFileBinding.read(decoded, "reject");
        if (!read.ok || read.data.goalId !== goalId || validateGoalContextIndexSnapshot(read.data).length > 0) {
            return undefined;
        }
        const parsed = read.data;

        if (
            options.expectedSourceDigest !== undefined
            && parsed.sourceDigest !== options.expectedSourceDigest
        ) {
            return undefined;
        }

        if (options.expectedBoundaries !== undefined) {
            const cachedBoundaries = new Map<string, number>(
                parsed.sourceBoundaries.map((boundary) => [boundary.runId, boundary.committedThroughSequence]),
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

        return deepFreeze(parsed) as GoalContextIndexSnapshot;
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
