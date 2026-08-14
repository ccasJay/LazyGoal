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

function cloneValidatedGoal(input: unknown): Goal {
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
