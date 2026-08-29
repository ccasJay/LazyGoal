import type { AgentProfileRegistry } from "./agent-profile";
import {
    createGoal,
    GoalProtocolError,
    isMemoryProtocol,
    resolveModelContextProtocol,
    type ModelContextProtocol,
    type MemoryProtocol,
    type GoalProtocolValidator,
} from "./domain";
import {
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "./execution-control";
import type { GoalStore } from "./goal-store";
import type {
    GoalCoordinator,
    GoalProgressResult,
} from "./goal-coordinator";
import type { TrajectorySink } from "./trajectory";
import {
    allocateDiagnosticTraceRecord,
    TrajectoryAppendError,
    TrajectoryCommitMarkerError,
    type DiagnosticTraceSink,
} from "./trajectory";

/**
 * 创建并启动一个准备工作流 Goal 的公开输入。
 *
 * @remarks
 * `intent` 是创建后冻结的原始用户意图；`maxSteps` 只限制批准后 executing
 * 阶段的 Step，省略或传 `0` 表示无限。
 *
 * @example
 * ```ts
 * const request: LaunchRequest = {
 *   goalId: "goal-1",
 *   intent: "Build a resumable session",
 *   profileId: "default",
 *   maxSteps: 10,
 * };
 * ```
 */
export interface LaunchRequest {
    /** 由调用方提供的稳定 Session 标识。 */
    readonly goalId: string;
    /** 按原文保存到 definition 和首条 user 消息的初始意图。 */
    readonly intent: string;
    /** 从 Registry 解析并冻结到 Goal 的 Profile ID。 */
    readonly profileId: string;
    /** 非负 executing Step 上限；`0` 或省略表示无限。 */
    readonly maxSteps?: number;
}

/** 由调用方注入；生产环境可生成 UUID，测试可返回固定值。 */
export type RunIdGenerator = () => string;

/** Launcher 的 Goal 推进结果，额外包含 Profile 查找失败。 */
export type LaunchResult =
    | GoalProgressResult
    | {
        readonly ok: false;
        readonly error: {
            readonly code: "PROFILE_NOT_FOUND";
            readonly message: string;
        };
    };

/**
 * Launcher 的 Profile、身份生成、持久化与协调依赖。
 *
 * @remarks
 * `store` 必须与 Coordinator 使用同一持久化边界，否则 Coordinator 无法恢复
 * Launcher 刚保存的初始 Goal。
 *
 * @example
 * ```ts
 * const dependencies: LauncherDependencies = {
 *   profiles,
 *   runIdGenerator: () => crypto.randomUUID(),
 *   store,
 *   coordinator,
 * };
 * ```
 */
export interface LauncherDependencies {
    /** 用于按 ID 解析待冻结 Profile。 */
    readonly profiles: AgentProfileRegistry;
    /** 每次合法 launch 调用一次，用于生成当前 runId。 */
    readonly runIdGenerator: RunIdGenerator;
    /** 在任何 Preparation 调用前保存初始完整 Goal。 */
    readonly store: Pick<GoalStore, "save">;
    /** 从已保存的 gathering Goal 推进到下一等待点或终态。 */
    readonly coordinator: Pick<GoalCoordinator, "advance">;
    /** Agent 当前生效、由 Composition Root 注入并在新 Goal 创建时冻结的 Prompt Bundle 版本。 */
    readonly promptBundleVersion: number;
    /**
     * 新 Goal 冻结的 Memory 协议；legacy v1–v3 省略时按 `checkpoint@1` 兼容。
     * v4/structured Goal 必须显式提供该字段。
     */
    readonly memoryProtocol?: MemoryProtocol;
    /** 新 Goal 冻结的模型上下文协议；省略时按 `conversation@1` 兼容。 */
    readonly modelContextProtocol?: ModelContextProtocol;
    /**
     * 在首次 Profile lookup、保存或模型调用前校验 Prompt/Memory 组合的适配器。
     * structured Goal 缺少该依赖时 Launcher fail-closed。
     */
    readonly protocolValidator?: GoalProtocolValidator;
    /** 可选 Domain Event Sink；省略时保留旧 Launcher 持久化行为。 */
    readonly trajectorySink?: TrajectorySink;
    /** 可选诊断边界；写入失败不回滚已保存的初始 Snapshot。 */
    readonly traceSink?: DiagnosticTraceSink;
}

/**
 * 创建、保存并自动推进一个准备工作流 Goal。
 *
 * @remarks
 * 固定顺序为：输入校验 → Profile lookup → 生成 runId → 保存
 * `gathering_context/active` Goal → Coordinator.advance。intent 为空白或
 * maxSteps 非非负整数时返回 `INVALID_GOAL_INPUT`，且不会查找 Profile、生成
 * runId、保存或调用 Coordinator。初始快照未保存成功时同样不会推进。
 *
 * @param request - Goal ID、原始意图、Profile ID 与可选 Step 上限。
 * @param dependencies - Profile Registry、Run ID 生成器、Store 与 Coordinator。
 * @param control - 当前 Goal 启动调用共享的中止控制。
 * @returns Coordinator 的最新 Goal 结果或稳定输入/Profile 业务失败。
 * @throws Run ID 生成、GoalStore 或 Coordinator 依赖失败时传播原始异常；中止时
 *   抛出 `ExecutionAbortedError`。
 *
 * @example
 * ```ts
 * const result = await launch(
 *   { goalId: "goal-1", intent: "Build a session", profileId: "default" },
 *   { profiles, runIdGenerator, store, coordinator },
 * );
 * ```
 */
export async function launch(
    request: LaunchRequest,
    dependencies: LauncherDependencies,
    control?: ExecutionControl,
): Promise<LaunchResult> {
    throwIfAborted(control);

    if (request.intent.trim().length === 0) {
        return invalidGoalInput("Intent must not be empty");
    }

    const maxSteps = request.maxSteps ?? 0;

    if (!Number.isInteger(maxSteps) || maxSteps < 0) {
        return invalidGoalInput("maxSteps must be a non-negative integer");
    }

    const memoryProtocol = resolveLaunchMemoryProtocol(dependencies);
    if (memoryProtocol.kind === "structured" && dependencies.protocolValidator === undefined) {
        throw new GoalProtocolError(
            "structured@1 Goal requires an injected GoalProtocolValidator",
        );
    }
    dependencies.protocolValidator?.validate({
        promptBundleVersion: dependencies.promptBundleVersion,
        memoryProtocol,
        modelContextProtocol: resolveModelContextProtocol(dependencies),
    });

    const profile = dependencies.profiles.get(request.profileId);
    throwIfAborted(control);

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
    throwIfAborted(control);
    const goal = createGoal({
        id: request.goalId,
        intent: request.intent,
        promptBundleVersion: dependencies.promptBundleVersion,
        ...(dependencies.memoryProtocol === undefined
            ? {}
            : { memoryProtocol }),
        ...(dependencies.modelContextProtocol === undefined
            ? {}
            : { modelContextProtocol: resolveModelContextProtocol(dependencies) }),
        profile,
        runId,
        maxSteps,
    });
    const ref = { goalId: goal.id, runId };

    let initialGoal = goal;
    if (dependencies.trajectorySink !== undefined) {
        throwIfAborted(control);
        let created;
        try {
            created = await dependencies.trajectorySink.append({
                goalId: goal.id,
                runId,
                phase: "gathering_context",
                eventType: "goal_created",
                payload: { type: "goal_created", intent: request.intent },
            });
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            throw new TrajectoryAppendError(
                error instanceof Error ? error.message : String(error),
                { cause: error },
            );
        }
        initialGoal = {
            ...goal,
            state: {
                ...goal.state,
                run: {
                    ...goal.state.run,
                    committedThroughSequence: created.sequence,
                },
            },
        };
    }

    throwIfAborted(control);
    await dependencies.store.save(initialGoal);
    throwIfAborted(control);
    if (dependencies.trajectorySink !== undefined) {
        try {
            await dependencies.trajectorySink.append({
                goalId: initialGoal.id,
                runId,
                phase: "gathering_context",
                eventType: "state_committed",
                payload: {
                    type: "state_committed",
                    committedThroughSequence: initialGoal.state.run.committedThroughSequence ?? 0,
                },
            });
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            if (dependencies.traceSink !== undefined) {
                try {
                    await dependencies.traceSink.append(allocateDiagnosticTraceRecord({
                        goalId: initialGoal.id,
                        runId,
                        kind: "trajectory_commit_marker_failed",
                        payload: {
                            eventType: "state_committed",
                            error: error instanceof Error ? error.message : String(error),
                        },
                    }));
                } catch {
                    // Trace 是旁路，不能覆盖已经持久化的初始 Snapshot。
                }
            }
            throw new TrajectoryCommitMarkerError(
                error instanceof Error ? error.message : String(error),
                { cause: error },
            );
        }
        throwIfAborted(control);
    }
    const result = await dependencies.coordinator.advance(ref, control);
    throwIfAborted(control);
    return result;
}

function resolveLaunchMemoryProtocol(
    dependencies: Pick<LauncherDependencies, "promptBundleVersion" | "memoryProtocol">,
): MemoryProtocol {
    if (dependencies.memoryProtocol !== undefined) {
        if (!isMemoryProtocol(dependencies.memoryProtocol)) {
            throw new GoalProtocolError(
                "Memory 协议必须是 checkpoint@1 或 structured@1",
            );
        }

        return {
            kind: dependencies.memoryProtocol.kind,
            version: dependencies.memoryProtocol.version,
        };
    }

    if (
        Number.isInteger(dependencies.promptBundleVersion)
        && dependencies.promptBundleVersion >= 1
        && dependencies.promptBundleVersion <= 3
    ) {
        return { kind: "checkpoint", version: 1 };
    }

    throw new GoalProtocolError(
        "structured Goal 必须显式提供 memoryProtocol",
    );
}

function invalidGoalInput(message: string): LaunchResult {
    return {
        ok: false,
        error: {
            code: "INVALID_GOAL_INPUT",
            message,
        },
    };
}
