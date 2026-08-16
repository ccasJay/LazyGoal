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

const GoalV2MetadataSchema = z.object({
    schemaVersion: z.literal(2),
}).strict();

const GoalV1MetadataSchema = z.object({
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

const GoalMessageSchema = z.discriminatedUnion("role", [
    z.object({
        role: z.literal("user"),
        content: z.string(),
    }).strict(),
    z.object({
        role: z.literal("assistant"),
        assistant: z.object({ profileId: z.string() }).strict(),
        content: z.string(),
    }).strict(),
]);

const GoalV1MessageSchema = z.object({
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

const RunStatusSchema = z.enum([
    "created",
    "running",
    "waiting",
    "completed",
    "failed",
    "cancelled",
]);

const RunStateSchema = z.object({
    id: z.string(),
    status: RunStatusSchema,
    stepCount: z.number().int().nonnegative(),
    lastStep: z.object({ result: StepResultSchema }).strict().optional(),
    stopReason: z.object({
        kind: z.literal("max_steps_exceeded"),
    }).strict().optional(),
}).strict();

const GoalWorkflowSchema = z.discriminatedUnion("phase", [
    z.object({
        phase: z.literal("gathering_context"),
        preparation: z.object({
            status: z.enum(["active", "waiting_input"]),
        }).strict(),
    }).strict(),
    z.object({
        phase: z.literal("planning"),
        preparation: z.union([
            z.object({ status: z.literal("active") }).strict(),
            z.object({
                status: z.literal("waiting_approval"),
                proposal: GoalTaskSchema,
            }).strict(),
        ]),
    }).strict(),
    z.object({
        phase: z.literal("executing"),
        preparation: z.object({ status: z.literal("completed") }).strict(),
        task: GoalTaskSchema,
    }).strict(),
]);

function addInvariantIssue(
    context: z.RefinementCtx,
    message: string,
    path: PropertyKey[] = [],
): void {
    context.addIssue({ code: "custom", message, path });
}

function validateRunResultInvariant(
    run: z.infer<typeof RunStateSchema>,
    context: z.RefinementCtx,
): void {
    const result = run.lastStep?.result;

    if ((run.stepCount > 0) !== (result !== undefined)) {
        addInvariantIssue(
            context,
            "lastStep must exist if and only if stepCount is positive",
            ["state", "run", "lastStep"],
        );
    }

    if (run.status === "created" && result !== undefined) {
        addInvariantIssue(context, "created Run cannot have lastStep");
    }

    if (
        run.status === "running"
        && result !== undefined
        && result.kind !== "continue"
        && result.kind !== "wait"
    ) {
        addInvariantIssue(context, "running Run requires continue or resumed wait");
    }

    if (run.status === "waiting" && result?.kind !== "wait") {
        addInvariantIssue(context, "waiting Run requires a wait result");
    }

    if (run.status === "completed" && result?.kind !== "complete") {
        addInvariantIssue(context, "completed Run requires a complete result");
    }

    if (
        run.status === "cancelled"
        && result !== undefined
        && result.kind !== "continue"
        && result.kind !== "wait"
    ) {
        addInvariantIssue(context, "cancelled Run can only preserve continue or wait");
    }
}

const GoalV2SnapshotSchema = z.object({
    id: z.string(),
    metadata: GoalV2MetadataSchema,
    definition: z.object({
        intent: z.string(),
        profile: AgentProfileSchema,
        executionPolicy: z.object({
            maxSteps: z.number().int().nonnegative(),
        }).strict(),
    }).strict(),
    state: z.object({
        workflow: GoalWorkflowSchema,
        messages: z.array(GoalMessageSchema),
        run: RunStateSchema,
    }).strict(),
}).strict().superRefine((goal, context) => {
    const { run, workflow } = goal.state;
    const result = run.lastStep?.result;

    validateRunResultInvariant(run, context);

    if (
        workflow.phase !== "executing"
        && (
            run.status !== "created"
            || run.stepCount !== 0
            || run.lastStep !== undefined
            || run.stopReason !== undefined
        )
    ) {
        addInvariantIssue(
            context,
            "Preparation workflow requires a created Run with zero Steps",
            ["state", "run"],
        );
    }

    if (run.status !== "failed" && run.stopReason !== undefined) {
        addInvariantIssue(context, "stopReason is only valid for a failed Run");
    }

    if (run.status === "failed") {
        if (run.stopReason === undefined) {
            if (result?.kind !== "fail") {
                addInvariantIssue(context, "failed Run requires a fail result");
            }
        } else {
            const maxSteps = goal.definition.executionPolicy.maxSteps;

            if (result?.kind !== "continue" && result?.kind !== "wait") {
                addInvariantIssue(
                    context,
                    "maxSteps failure must preserve a continue or wait result",
                );
            }

            if (maxSteps <= 0 || run.stepCount < maxSteps) {
                addInvariantIssue(
                    context,
                    "maxSteps failure requires a reached positive execution limit",
                );
            }
        }
    }
});

const GoalV1RunSchema = z.object({
    id: z.string(),
    status: RunStatusSchema,
    stepCount: z.number().int().nonnegative(),
    lastResult: StepResultSchema.optional(),
}).strict();

const GoalV1SnapshotSchema = z.object({
    id: z.string(),
    metadata: GoalV1MetadataSchema,
    task: GoalTaskSchema,
    profile: AgentProfileSchema,
    messages: z.array(GoalV1MessageSchema),
    run: GoalV1RunSchema,
}).strict().superRefine((goal, context) => {
    const { run } = goal;
    const result = run.lastResult;

    if ((run.stepCount > 0) !== (result !== undefined)) {
        addInvariantIssue(
            context,
            "v1 lastResult must exist if and only if stepCount is positive",
            ["run", "lastResult"],
        );
    }

    if (run.status === "created" && (run.stepCount !== 0 || result !== undefined)) {
        addInvariantIssue(context, "v1 created Run cannot contain progress");
    }

    if (
        run.status === "running"
        && result !== undefined
        && result.kind !== "continue"
        && result.kind !== "wait"
    ) {
        addInvariantIssue(context, "v1 running Run requires continue or resumed wait");
    }

    if (run.status === "waiting" && result?.kind !== "wait") {
        addInvariantIssue(context, "v1 waiting Run requires a wait result");
    }

    if (run.status === "completed" && result?.kind !== "complete") {
        addInvariantIssue(context, "v1 completed Run requires a complete result");
    }

    if (run.status === "failed" && result?.kind !== "fail") {
        addInvariantIssue(context, "v1 failed Run requires a fail result");
    }

    if (
        run.status === "cancelled"
        && result !== undefined
        && result.kind !== "continue"
        && result.kind !== "wait"
    ) {
        addInvariantIssue(context, "v1 cancelled Run can only preserve continue or wait");
    }
});

function migrateV1Goal(
    goal: z.infer<typeof GoalV1SnapshotSchema>,
): Goal {
    return {
        id: goal.id,
        metadata: { schemaVersion: 2 },
        definition: {
            intent: goal.task.objective,
            profile: structuredClone(goal.profile),
            executionPolicy: { maxSteps: 0 },
        },
        state: {
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: structuredClone(goal.task),
            },
            messages: goal.messages.map((message) => message.role === "user"
                ? { role: "user", content: message.content }
                : {
                    role: "assistant",
                    assistant: { profileId: goal.profile.id },
                    content: message.content,
                }),
            run: {
                id: goal.run.id,
                status: goal.run.status,
                stepCount: goal.run.stepCount,
                ...(goal.run.lastResult === undefined
                    ? {}
                    : { lastStep: { result: goal.run.lastResult } }),
            },
        },
    };
}

/**
 * Goal 的版本化持久化协议。
 *
 * @remarks
 * 解码器先读取 `schemaVersion` 再选择对应的严格 Schema。v2 会校验
 * workflow 与 Run 的交叉字段；合法 v1 会在内存中确定性迁移为 v2。
 * 每一层对象都拒绝未声明字段，未知版本和损坏快照均验证失败。
 */
export const GoalSnapshotSchema = z.unknown().transform((input, context) => {
    const metadata = typeof input === "object" && input !== null
        ? Reflect.get(input, "metadata")
        : undefined;
    const schemaVersion = typeof metadata === "object" && metadata !== null
        ? Reflect.get(metadata, "schemaVersion")
        : undefined;

    if (schemaVersion === 1) {
        const result = GoalV1SnapshotSchema.safeParse(input);

        if (result.success) {
            return migrateV1Goal(result.data);
        }

        addInvariantIssue(context, "Invalid schemaVersion 1 Goal snapshot");
        return z.NEVER;
    }

    if (schemaVersion === 2) {
        const result = GoalV2SnapshotSchema.safeParse(input);

        if (result.success) {
            return result.data;
        }

        addInvariantIssue(context, "Invalid schemaVersion 2 Goal snapshot");
        return z.NEVER;
    }

    addInvariantIssue(context, "Unknown Goal snapshot schemaVersion");
    return z.NEVER;
}).pipe(GoalV2SnapshotSchema);

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

/**
 * 解码并结构化克隆一个版本化 Goal 快照。
 *
 * @param input - v2 Goal 或仍符合旧协议的 v1 快照。
 * @returns 与输入隔离的 v2 Goal；v1 输入不会被原地修改。
 * @throws 输入版本未知、结构损坏或违反跨字段不变量时抛出 ZodError。
 */
export function cloneValidatedGoal(input: unknown): Goal {
    const parsed = structuredClone(GoalSnapshotSchema.parse(input));

    return {
        ...parsed,
        state: {
            ...parsed.state,
            run: {
                id: parsed.state.run.id,
                status: parsed.state.run.status,
                stepCount: parsed.state.run.stepCount,
                ...(parsed.state.run.lastStep === undefined
                    ? {}
                    : { lastStep: parsed.state.run.lastStep }),
                ...(parsed.state.run.stopReason === undefined
                    ? {}
                    : { stopReason: parsed.state.run.stopReason }),
            },
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
     * @returns 最新 v2 快照；v1 数据只在返回值中迁移，不因恢复而写回。
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
 * 不匹配、未知版本和文件内 Goal ID 不一致统一抛出
 * {@link GoalSnapshotProtocolError}。恢复 v1 不改写文件，之后显式保存恢复
 * 结果时才以 v2 原子替换。
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
     * @returns 文件不存在时返回 `undefined`，否则返回与存储隔离的 v2 Goal。
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
