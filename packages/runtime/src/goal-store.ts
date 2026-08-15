import { randomUUID } from "node:crypto";
import {
    mkdir,
    open,
    readFile,
    rename,
    unlink,
} from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import type { Goal } from "./domain";

const GoalMetadataSchema = z.object({
    schemaVersion: z.literal(1),
}).strict();

const GoalTaskSchema = z.object({
    objective: z.string(),
    completionCriteria: z.array(z.string()),
}).strict();

const AgentProfileSchema = z.object({
    id: z.string(),
    systemPrompt: z.string(),
    instructions: z.array(z.string()),
    toolIds: z.array(z.string()),
}).strict();

const GoalMessageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
}).strict();

const StepResultSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("continue"),
        summary: z.string(),
    }).strict(),
    z.object({
        kind: z.literal("wait"),
        reason: z.string(),
    }).strict(),
    z.object({
        kind: z.literal("complete"),
        summary: z.string(),
    }).strict(),
    z.object({
        kind: z.literal("fail"),
        error: z.string(),
    }).strict(),
]);

const RunStateSchema = z.object({
    id: z.string(),
    status: z.enum([
        "created",
        "running",
        "waiting",
        "completed",
        "failed",
        "cancelled",
    ]),
    stepCount: z.number().int().nonnegative(),
    lastResult: StepResultSchema.optional(),
}).strict();

/**
 * Goal 的版本化持久化协议。
 *
 * @remarks
 * 每一层对象都拒绝未声明字段，避免把 Registry、Adapter、函数或其他
 * 进程内对象意外写进可恢复快照。
 */
export const GoalSnapshotSchema = z.object({
    id: z.string(),
    metadata: GoalMetadataSchema,
    task: GoalTaskSchema,
    profile: AgentProfileSchema,
    messages: z.array(GoalMessageSchema),
    run: RunStateSchema,
}).strict();

export const INVALID_GOAL_SNAPSHOT_CODE = "INVALID_GOAL_SNAPSHOT" as const;

/**
 * 表示 Goal JSON 快照违反持久化协议的错误。
 *
 * @remarks
 * 文件系统本身的读写错误不使用该类型，以便调用方区分协议损坏和 I/O 故障。
 */
export class GoalSnapshotProtocolError extends Error {
    readonly code = INVALID_GOAL_SNAPSHOT_CODE;

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "GoalSnapshotProtocolError";
    }
}

export function cloneValidatedGoal(input: unknown): Goal {
    const parsed = structuredClone(GoalSnapshotSchema.parse(input));

    return {
        id: parsed.id,
        metadata: parsed.metadata,
        task: parsed.task,
        profile: parsed.profile,
        messages: parsed.messages,
        run: {
            id: parsed.run.id,
            status: parsed.run.status,
            stepCount: parsed.run.stepCount,
            ...(parsed.run.lastResult === undefined
                ? {}
                : { lastResult: parsed.run.lastResult }),
        },
    };
}

/**
 * Goal 聚合的持久化边界。
 *
 * @remarks
 * GoalStore 以 goalId 定位一个 Goal 的最新完整快照，不提供历史或事件查询。
 * 对同一 ID 再次保存会覆盖先前版本，实现必须在 resolve 前完成本次保存。
 */
export interface GoalStore {
    /**
     * 校验并保存一个完整 Goal 快照。
     *
     * @param goal - 需要成为最新版本的完整 Session 聚合。
     * @throws 快照不符合协议或底层存储写入失败时抛出异常。
     */
    save(goal: Goal): Promise<void>;

    /**
     * 恢复指定 Goal 的最新完整快照。
     *
     * @param goalId - Session 的稳定标识。
     * @returns 最新快照；不存在时返回 `undefined`。
     * @throws 已存在快照损坏或底层存储读取失败时抛出异常。
     */
    restore(goalId: string): Promise<Goal | undefined>;
}

/**
 * 单进程内的 Goal 快照存储。
 *
 * @remarks
 * 保存和恢复都会经过 Schema 校验并进行结构化克隆，调用方不能通过修改
 * 原对象或恢复结果污染 Store 内部保存的快照。数据只存在于当前 Store
 * 实例的内存中，不支持跨实例或进程恢复。
 */
export class InMemoryGoalStore implements GoalStore {
    private readonly snapshots = new Map<string, Goal>();

    async save(goal: Goal): Promise<void> {
        const snapshot = cloneValidatedGoal(goal);
        this.snapshots.set(snapshot.id, snapshot);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        const snapshot = this.snapshots.get(goalId);

        if (snapshot === undefined) {
            return undefined;
        }

        return cloneValidatedGoal(snapshot);
    }
}

/**
 * 基于本地 JSON 文件的 Goal 最新快照存储。
 *
 * @remarks
 * 每个 Goal 只对应一个文件，文件名由 goalId 的 base64url 编码生成；
 * 写入通过同目录临时文件和 rename 完成，避免恢复到半写入快照。
 *
 * 多个写入者并发保存同一 Goal 时采用最后完成替换者覆盖的语义，不提供
 * 乐观锁、租约或版本冲突检测。文件系统错误原样传播；非法 JSON、Schema
 * 不匹配和文件内 Goal ID 不一致统一抛出 {@link GoalSnapshotProtocolError}。
 */
export class JsonFileGoalStore implements GoalStore {
    /**
     * @param directory - 保存 Goal JSON 文件的目录；保存时按需递归创建。
     */
    constructor(private readonly directory: string) {}

    /**
     * 校验并原子替换指定 Goal 的最新 JSON 快照。
     *
     * @throws Goal 不符合快照协议时抛出 GoalSnapshotProtocolError；目录创建、
     * 临时文件写入或替换失败时传播原始文件系统错误。
     */
    async save(goal: Goal): Promise<void> {
        const snapshot = this.cloneFileSnapshot(goal);
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
     * 从 JSON 文件恢复并校验最新 Goal 快照。
     *
     * @returns 文件不存在时返回 `undefined`，否则返回与存储隔离的 Goal。
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

        try {
            goal = cloneValidatedGoal(JSON.parse(content));
        } catch (error) {
            throw new GoalSnapshotProtocolError(
                `Invalid Goal snapshot for "${goalId}"`,
                { cause: error },
            );
        }

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

    private cloneFileSnapshot(goal: Goal): Goal {
        try {
            return cloneValidatedGoal(goal);
        } catch (error) {
            throw new GoalSnapshotProtocolError(
                "Goal does not satisfy the snapshot schema",
                { cause: error },
            );
        }
    }
}
