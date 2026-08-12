/**
 * Launcher 的公开边界。
 *
 * 它接收一个明确的 Goal 和 profileId，并把已保存的 Run 交给 Scheduler。
 * `RunState.profile` 由 createRun 作为启动时的独立 Profile 快照保存。
 */

import type { AgentProfileRegistry } from "./agent-profile";
import { createRun } from "./domain";
import type { Goal, RunState } from "./domain";
import type { RunStore } from "./run-store";
import type { RunScheduler } from "./scheduler";

export interface LaunchRequest {
    // TODO-1: 定义启动请求的字段。
    // 要求：调用方必须提供 Goal 与明确的 profileId；不得由请求提供 Run ID。
    // HINT-1：这两个字段都不应在 Launcher 中被修改。
    // HINT-2：Goal 的类型已由 domain.ts 导出，profileId 是稳定的字符串标识。
    readonly goal: Goal;
    readonly profileId: string;
}

/** 由调用方注入；生产环境可生成 UUID，测试可返回固定值。 */
export type RunIdGenerator = () => string;

/**
 * LaunchResult 的业务分支。
 */
export type LaunchResult =
    | {
        // TODO-2: 定义成功启动的结果。
        // 要求：让调用方能拿到新 Run ID、created 状态和已冻结 Profile 的标识。
        // HINT-1：参考 TransitionResult 的成功分支，使用可区分的结果字段。
        // HINT-2：本阶段不需要返回完整 Profile、Tool 实例或 Scheduler 信息。
        readonly ok: true; 
        readonly runId: string;
        readonly profileId: string;
        readonly state: RunState;
    }
    | {
        // TODO-3: 定义 Profile 不存在时的业务失败结果。
        // 要求：错误码必须可与依赖抛出的异常区分；此分支不代表 Store 或 Scheduler 失败。
        // HINT-1：参考 TransitionResult 的错误对象结构。
        // HINT-2：成功与失败分支应共享同一个判别字段，但取相反值。
        readonly ok: false;
        readonly error: {
            readonly code:
                | "PROFILE_NOT_FOUND"
                | "RUN_NOT_FOUND"
                | "RUN_NOT_WAITING";
            readonly message: string;
        }
    };

/**
 *  Launcher 的依赖注入接口。
 */
export interface LauncherDependencies {
    readonly profiles: AgentProfileRegistry;
    readonly runIdGenerator: RunIdGenerator;
    readonly store: RunStore;
    readonly scheduler: RunScheduler;
}

/**
 * @abstract Launch 一个新的 Run。
 * @param request 
 * @param dependencies 
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
    const run = createRun(request.goal, runId, profile);

    await dependencies.store.save(run);
    const scheduleResult = await dependencies.scheduler.schedule(runId);

    if (!scheduleResult.ok) {
        return scheduleResult;
    }

    return {
        ok: true,
        runId,
        profileId: run.profile.id,
        state: scheduleResult.state,
    };
}
