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
 * GoalStore 以 goalId 定位一个 Goal 的最新完整快照，不提供历史或事件查询。
 */
export interface GoalStore {
    save(goal: Goal): Promise<void>;
    restore(goalId: string): Promise<Goal | undefined>;
}

/**
 * 单进程内的 Goal 快照存储。
 *
 * 保存和恢复都会经过 Schema 校验并进行结构化克隆，调用方不能通过修改
 * 原对象或恢复结果污染 Store 内部保存的快照。
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
 * 每个 Goal 只对应一个文件，文件名由 goalId 的 base64url 编码生成；
 * 写入通过同目录临时文件和 rename 完成，避免恢复到半写入快照。
 */
export class JsonFileGoalStore implements GoalStore {
    constructor(private readonly directory: string) {}

    async save(goal: Goal): Promise<void> {
        const snapshot = cloneValidatedGoal(goal);
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

        const goal = cloneValidatedGoal(JSON.parse(content));

        if (goal.id !== goalId) {
            throw new Error(
                `Goal snapshot ID mismatch: expected "${goalId}", got "${goal.id}"`,
            );
        }

        return goal;
    }

    private filePath(goalId: string): string {
        const encodedGoalId = Buffer.from(goalId, "utf8").toString("base64url");
        return join(this.directory, `${encodedGoalId}.json`);
    }
}
