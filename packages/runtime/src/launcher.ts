import type { AgentProfileRegistry } from "./agent-profile";
import { createGoal } from "./domain";
import type {
    GoalInput,
    GoalMessage,
    RunState,
} from "./domain";
import type { GoalStore } from "./goal-store";
import type { RunScheduler } from "./scheduler";

/** 向启动边界提交的任务定义；不包含 Run 状态或 Profile 实例。 */
export interface LaunchRequest {
    /** 由调用方定义的 Goal ID、目标与完成条件。 */
    readonly goal: GoalInput;
    /** 需要从 Registry 解析并冻结到 Goal 的 Profile ID。 */
    readonly profileId: string;
    /** 创建 Goal 时按原顺序写入的可选历史消息。 */
    readonly messages?: readonly GoalMessage[];
}

/** 由调用方注入；生产环境可生成 UUID，测试可返回固定值。 */
export type RunIdGenerator = () => string;

/** Launcher 的成功结果或来自 Profile/Scheduler 的稳定业务失败。 */
export type LaunchResult =
    | {
        readonly ok: true;
        readonly goalId: string;
        readonly runId: string;
        readonly profileId: string;
        readonly state: RunState;
    }
    | {
        readonly ok: false;
        readonly error: {
            readonly code:
                | "PROFILE_NOT_FOUND"
                | "RUN_NOT_FOUND"
                | "RUN_NOT_WAITING";
            readonly message: string;
        };
    };

/** Launcher 的 Profile、身份生成、持久化与调度依赖。 */
export interface LauncherDependencies {
    /** 用于按 ID 解析 Profile。 */
    readonly profiles: AgentProfileRegistry;
    /** 每次 launch 调用一次，用于生成独立 runId。 */
    readonly runIdGenerator: RunIdGenerator;
    /** 在调度前保存初始完整 Goal。 */
    readonly store: Pick<GoalStore, "save">;
    /** 接收已持久化 Goal 的 RunRef。 */
    readonly scheduler: RunScheduler;
}

/**
 * 启动一个新的 Goal/Run 聚合。
 *
 * 固定顺序为：Profile lookup → 生成 runId → 组装并保存完整 Goal → 调度。
 * 依赖失败保持原错误传播；保存未成功时绝不调用 Scheduler。
 *
 * @param request - Goal 定义、Profile ID 与可选初始消息。
 * @param dependencies - Profile Registry、Run ID 生成器、Store 与 Scheduler。
 * @returns 启动后的 Goal/Run 标识和当前状态，或稳定业务失败。
 * @throws Run ID 生成、持久化或调度依赖抛出的原始异常。
 *
 * @example
 * ```ts
 * const result = await launch(
 *   { goal: { id: "goal-1", objective: "完成任务", completionCriteria: ["已完成"] }, profileId: "default" },
 *   { profiles, runIdGenerator, store, scheduler },
 * );
 * ```
 */
export async function launch(
    request: LaunchRequest,
    dependencies: LauncherDependencies,
): Promise<LaunchResult> {
    const profile = dependencies.profiles.get(request.profileId);

    if (profile === undefined) {
        return {
            ok: false,
            error: {
                code: "PROFILE_NOT_FOUND",
                message: `Profile "${request.profileId}" was not found`,
            },
        };
    }

    const runId = dependencies.runIdGenerator();
    const goal = createGoal({
        id: request.goal.id,
        task: {
            objective: request.goal.objective,
            completionCriteria: request.goal.completionCriteria,
        },
        profile,
        runId,
        ...(request.messages === undefined
            ? {}
            : { messages: request.messages }),
    });

    await dependencies.store.save(goal);
    const scheduleResult = await dependencies.scheduler.schedule({
        goalId: goal.id,
        runId,
    });

    if (!scheduleResult.ok) {
        return scheduleResult;
    }

    return {
        ok: true,
        goalId: goal.id,
        runId,
        profileId: goal.definition.profile.id,
        state: scheduleResult.state,
    };
}
