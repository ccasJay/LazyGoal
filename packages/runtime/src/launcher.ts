/**
 * Launcher 的公开边界。
 *
 * Launcher 负责选择并冻结 Profile、组装初始 Goal 聚合、先保存完整快照，
 * 再把独立的 Run ID 交给当前 Scheduler。Runner/ Scheduler 的 RunRef 迁移
 * 留给后续任务。
 */

import type { AgentProfileRegistry } from "./agent-profile";
import { createGoal } from "./domain";
import type {
    GoalDefinition,
    GoalMessage,
    RunState,
} from "./domain";
import type { GoalStore } from "./goal-store";
import type { RunScheduler } from "./scheduler";

/** 向启动边界提交的任务定义；不包含 Run 状态或 Profile 实例。 */
export interface LaunchRequest {
    readonly goal: GoalDefinition;
    readonly profileId: string;
    readonly messages?: readonly GoalMessage[];
}

/** 由调用方注入；生产环境可生成 UUID，测试可返回固定值。 */
export type RunIdGenerator = () => string;

/** Launcher 的成功或业务失败结果。 */
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

/** Launcher 的依赖注入接口。 */
export interface LauncherDependencies {
    readonly profiles: AgentProfileRegistry;
    readonly runIdGenerator: RunIdGenerator;
    readonly store: Pick<GoalStore, "save">;
    readonly scheduler: RunScheduler;
}

/**
 * 启动一个新的 Goal/Run 聚合。
 *
 * 固定顺序为：Profile lookup → 生成 runId → 组装并保存完整 Goal → 调度。
 * 依赖失败保持原错误传播；保存未成功时绝不调用 Scheduler。
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
    const scheduleResult = await dependencies.scheduler.schedule(runId);

    if (!scheduleResult.ok) {
        return scheduleResult;
    }

    return {
        ok: true,
        goalId: goal.id,
        runId,
        profileId: goal.profile.id,
        state: scheduleResult.state,
    };
}
