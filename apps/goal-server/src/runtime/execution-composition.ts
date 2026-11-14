import { randomUUID } from "node:crypto";

import {
    GoalCoordinator,
    InlineScheduler,
    Runner,
    TrajectoryCheckpointCommitter,
    launch,
    type AgentProfileRegistry,
    type ContextCompactionCommandOutcome,
    type ContextLookupPort,
    type DiagnosticTraceSink,
    type GoalCoordinatorDependencies,
    type GoalProtocolValidator,
    type LaunchRequest,
    type LaunchResult,
    type RunnerDependencies,
    type RunRef,
    type SandboxGrantStore,
    type SandboxPlanResolver,
    type StepExecutor,
    type ToolPolicy,
    type TrajectoryCheckpointCommitterPort,
    type TrajectoryStore,
} from "../../../../packages/runtime/src/index";
import type { ToolRegistry } from "../../../../packages/tool-core/src/index";
import type { ExecutionStreamPublisher } from "../../../../packages/execution-stream/src/index";
import type { WorkingMemoryLimitsInput } from "../../../../packages/working-memory/src/index";
import type { ProjectPermissionProfileStore } from "../../../../packages/permission/src/index";

/** 与既有 Launcher 调用共享的中止控制类型；由 Runtime 入口签名派生。 */
type ExecutionControl = NonNullable<Parameters<typeof launch>[2]>;

/**
 * 执行装配组件接受的现有 Port。
 *
 * @remarks
 * 调用方负责准备 Executor、Profile Registry、Store、工具与授权依赖；组件只
 * 组合 Launcher、Runner、InlineScheduler、共享提交器与 Coordinator，不解析
 * 环境、不创建模型供应商、默认文件存储或默认工具，也不接管这些依赖的所有权。
 * 相同依赖只注入一次：`store`、`trajectoryStore`、`checkpointCommitter` 与
 * `sandboxGrantStore` 由 Launcher、Runner 和 Coordinator 共用。
 *
 * @example
 * ```ts
 * const dependencies: ExecutionComponentDependencies = {
 *     store,
 *     executor: deterministicExecutor,
 *     profiles,
 *     toolRegistry,
 * };
 * ```
 */
export interface ExecutionComponentDependencies {
    /** 完整 Goal 的最新快照存储；与提交器、Runner 和 Coordinator 共用同一实例。 */
    readonly store: RunnerDependencies["store"];
    /** 返回 AgentDecision 的确定性或生产 StepExecutor。 */
    readonly executor: StepExecutor;
    /** 冻结 Profile 解析。 */
    readonly profiles: AgentProfileRegistry;
    /** 按 Tool ID 查找实现的注册表；省略时由 Runtime 视为空 Registry。 */
    readonly toolRegistry?: ToolRegistry;
    /** Tool 执行前的策略边界；省略时由 Runtime 使用允许策略。 */
    readonly toolPolicy?: ToolPolicy;
    /** 会话或 Workspace 级持续 Tool 授权账本；同时作为 Runner 的授权查询。 */
    /** Sandbox 持续授权账本；同时作为 Runner 的授权查询。 */
    readonly sandboxGrantStore?: SandboxGrantStore;
    /** 项目权限档位存储；Runner 与 Coordinator 共用同一实例。 */
    readonly permissionProfileStore?: ProjectPermissionProfileStore;
    /** 用于隔离 Workspace 授权的稳定身份。 */
    readonly workspaceId?: string;
    /** 文件授权身份解析使用的 Workspace 根目录。 */
    readonly workspaceRoot?: string;
    /** Domain Event 追加与 Snapshot 边界读取端口；省略时只保存 Snapshot。 */
    readonly trajectoryStore?: TrajectoryStore;
    /** 诊断记录边界；诊断故障不改变 Snapshot 或事件语义。 */
    readonly traceSink?: DiagnosticTraceSink;
    /** structured@1 Patch 接受时使用的 Working Memory 限制。 */
    readonly workingMemoryLimits?: WorkingMemoryLimitsInput;
    /** Prompt/Memory 协议校验器；省略时不执行额外协议校验。 */
    readonly protocolValidator?: GoalProtocolValidator;
    /** 共享提交器；省略时按 `store`/`trajectoryStore`/`traceSink` 创建一份。 */
    readonly checkpointCommitter?: TrajectoryCheckpointCommitterPort;
    /** 只读 committed Trajectory 检索端口。 */
    readonly contextLookupPort?: ContextLookupPort;
    /** Goal/Run 实时事件发布端口；发布故障不改变执行语义。 */
    readonly executionStream?: ExecutionStreamPublisher;
    /** 受限 Action 获准执行前的沙箱执行计划解析器。 */
    readonly sandboxPlanResolver?: SandboxPlanResolver;
    /** 每次合法 launch 或后继 Run 生成 runId；省略时使用随机 UUID。 */
    readonly runIdGenerator?: () => string;
    /** 阈值压缩调度；省略时不调度压缩。 */
    readonly contextCompaction?: RunnerDependencies["contextCompaction"];
}

/**
 * 组件对调用方暴露的执行与控制命令。
 *
 * @remarks
 * 命令复用现有请求、结果与拒绝边界：`launch` 创建并推进新 Goal；`advance`
 * 推进已有 Run；`resume` 回答当前等待；`continue` 在终态后创建后继 Run；
 * `steer`、`interrupt`、`enterPlanMode` 与权限查询/撤销由对应规则所有者处理。
 * 组件不返回 Runner、提交器或整个 GoalCoordinator 实例，调用方也不需要这些
 * 内部对象即可完成任务。
 *
 * @example
 * ```ts
 * const { commands } = createExecutionComponents({ store, executor, profiles, toolRegistry });
 * const result = await commands.launch({ goalId: "goal-1", intent: "Build", profileId: "default" });
 * ```
 */
export type ExecutionCommands = Pick<
    GoalCoordinator,
    | "advance"
    | "resume"
    | "resumeForSession"
    | "scheduleAuthorizedAction"
    | "continue"
    | "commitContinuation"
    | "steer"
    | "interrupt"
    | "enterPlanMode"
    | "listGrants"
    | "revokeGrant"
    | "getPermissionProfile"
    | "setPermissionProfile"
    | "reviewActionApproval"
> & {
    /**
     * 创建并保存新 Goal，然后推进到下一等待点或终态。
     *
     * @param request - Goal ID、原始意图、Profile ID 与可选 Step 上限。
     * @param control - 当前调用共享的中止控制。
     * @returns 与既有 Launcher 相同的业务结果；初始快照未保存成功时不会调用
     * 模型或工具。
     * @throws Store、Trajectory、Run ID 生成或 Coordinator 依赖失败时传播原始
     * 异常。
     */
    launch(request: LaunchRequest, control?: ExecutionControl): Promise<LaunchResult>;
};

/**
 * 执行装配组件的返回值。
 *
 * @example
 * ```ts
 * const { commands } = createExecutionComponents(dependencies);
 * const ongoing = await commands.advance({ goalId, runId });
 * ```
 */
export interface ExecutionComponents {
    /** 调用方需要的执行与控制命令。 */
    readonly commands: ExecutionCommands;
    /** 用户命令触发的上下文整理；供会话层在安全边界调用。 */
    readonly compactContext: (ref: RunRef, control?: ExecutionControl) => Promise<ContextCompactionCommandOutcome>;
}

/**
 * 组合调用方提供的 Port，装配可独立调用的执行链。
 *
 * @remarks
 * 固定连接的内部对象为 Launcher、Runner、InlineScheduler、共享
 * `TrajectoryCheckpointCommitter` 与 GoalCoordinator；三者使用同一 Store、
 * Trajectory 与提交边界。构造不产生 I/O、不读取配置、不注册进程信号，也不
 * 包含关闭逻辑：内部资源的所有权仍属于调用方。当前生产消费者为
 * `goal-server` 组合根，不承诺对外发布 API。
 *
 * @param dependencies - 执行链需要的 Executor、Store、Profile、工具与可选 Port。
 * @returns 只包含 `commands` 的组件结果。
 *
 * @example
 * ```ts
 * const { commands } = createExecutionComponents({
 *     store,
 *     executor,
 *     profiles,
 *     toolRegistry,
 * });
 * const result = await commands.launch(request);
 * const saved = await store.restore(request.goalId);
 * ```
 */
export function createExecutionComponents(
    dependencies: ExecutionComponentDependencies,
): ExecutionComponents {
    const runIdGenerator = dependencies.runIdGenerator ?? (() => randomUUID());
    const checkpointCommitter = dependencies.checkpointCommitter
        ?? new TrajectoryCheckpointCommitter({
            store: dependencies.store,
            ...(dependencies.trajectoryStore === undefined
                ? {}
                : { trajectoryStore: dependencies.trajectoryStore }),
            ...(dependencies.traceSink === undefined ? {} : { traceSink: dependencies.traceSink }),
        });

    const runner = new Runner(collectRunnerDependencies(dependencies, checkpointCommitter));
    const coordinator = new GoalCoordinator(collectCoordinatorDependencies({
        dependencies,
        runIdGenerator,
        checkpointCommitter,
        runner,
    }));

    return {
        compactContext: (ref, control) => runner.compactContextNow(ref, control),
        commands: {
            launch: (request, control) => launch(
                request,
                {
                    profiles: dependencies.profiles,
                    runIdGenerator,
                    store: dependencies.store,
                    coordinator,
                    ...(dependencies.protocolValidator === undefined
                        ? {}
                        : { protocolValidator: dependencies.protocolValidator }),
                    ...(dependencies.trajectoryStore === undefined
                        ? {}
                        : { trajectoryStore: dependencies.trajectoryStore }),
                    ...(dependencies.traceSink === undefined ? {} : { traceSink: dependencies.traceSink }),
                },
                control,
            ),
            advance: (ref, control) => coordinator.advance(ref, control),
            resume: (request, control) => coordinator.resume(request, control),
            resumeForSession: (request, sessionInput, control) =>
                coordinator.resumeForSession(request, sessionInput, control),
            scheduleAuthorizedAction: (ref, authorizedActionId, control) =>
                coordinator.scheduleAuthorizedAction(ref, authorizedActionId, control),
            continue: (ref, content, control, continuation, queueBinding) =>
                coordinator.continue(ref, content, control, continuation, queueBinding),
            commitContinuation: (ref, content, inputId, control) =>
                coordinator.commitContinuation(ref, content, inputId, control),
            steer: (ref, messageId, content, ledger) => coordinator.steer(ref, messageId, content, ledger),
            interrupt: (ref, requestId, ledger) => coordinator.interrupt(ref, requestId, ledger),
            enterPlanMode: (ref, control) => coordinator.enterPlanMode(ref, control),
            listGrants: (ref) => coordinator.listGrants(ref),
            revokeGrant: (request) => coordinator.revokeGrant(request),
            reviewActionApproval: (request, control) => coordinator.reviewActionApproval(request, control),
            getPermissionProfile: () => coordinator.getPermissionProfile(),
            setPermissionProfile: (profile, expectedRevision) =>
                coordinator.setPermissionProfile(profile, expectedRevision),
        },
    };
}

function collectRunnerDependencies(
    dependencies: ExecutionComponentDependencies,
    checkpointCommitter: TrajectoryCheckpointCommitterPort,
): RunnerDependencies {
    return {
        store: dependencies.store,
        executor: dependencies.executor,
        ...(dependencies.toolRegistry === undefined ? {} : { toolRegistry: dependencies.toolRegistry }),
        ...(dependencies.toolPolicy === undefined ? {} : { toolPolicy: dependencies.toolPolicy }),
        ...(dependencies.sandboxGrantStore === undefined
            ? {}
            : { sandboxGrantLookup: dependencies.sandboxGrantStore }),
        ...(dependencies.permissionProfileStore === undefined
            ? {}
            : { permissionProfileStore: dependencies.permissionProfileStore }),
        ...(dependencies.workspaceId === undefined ? {} : { workspaceId: dependencies.workspaceId }),
        ...(dependencies.workspaceRoot === undefined ? {} : { workspaceRoot: dependencies.workspaceRoot }),
        ...(dependencies.trajectoryStore === undefined ? {} : { trajectoryStore: dependencies.trajectoryStore }),
        ...(dependencies.traceSink === undefined ? {} : { traceSink: dependencies.traceSink }),
        ...(dependencies.workingMemoryLimits === undefined
            ? {}
            : { workingMemoryLimits: dependencies.workingMemoryLimits }),
        ...(dependencies.protocolValidator === undefined
            ? {}
            : { protocolValidator: dependencies.protocolValidator }),
        checkpointCommitter,
        ...(dependencies.contextLookupPort === undefined
            ? {}
            : { contextLookupPort: dependencies.contextLookupPort }),
        ...(dependencies.executionStream === undefined ? {} : { executionStream: dependencies.executionStream }),
        ...(dependencies.sandboxPlanResolver === undefined
            ? {}
            : { sandboxPlanResolver: dependencies.sandboxPlanResolver }),
        ...(dependencies.contextCompaction === undefined
            ? {}
            : { contextCompaction: dependencies.contextCompaction }),
    };
}

function collectCoordinatorDependencies(options: {
    readonly dependencies: ExecutionComponentDependencies;
    readonly runIdGenerator: () => string;
    readonly checkpointCommitter: TrajectoryCheckpointCommitterPort;
    readonly runner: Runner;
}): GoalCoordinatorDependencies {
    const { dependencies } = options;

    return {
        store: dependencies.store,
        scheduler: new InlineScheduler(options.runner),
        runIdGenerator: options.runIdGenerator,
        ...(dependencies.toolRegistry === undefined ? {} : { toolRegistry: dependencies.toolRegistry }),
        ...(dependencies.sandboxGrantStore === undefined ? {} : { sandboxGrantStore: dependencies.sandboxGrantStore }),
        ...(dependencies.permissionProfileStore === undefined
            ? {}
            : { permissionProfileStore: dependencies.permissionProfileStore }),
        ...(dependencies.workspaceId === undefined ? {} : { workspaceId: dependencies.workspaceId }),
        ...(dependencies.workspaceRoot === undefined ? {} : { workspaceRoot: dependencies.workspaceRoot }),
        ...(dependencies.trajectoryStore === undefined ? {} : { trajectoryStore: dependencies.trajectoryStore }),
        ...(dependencies.traceSink === undefined ? {} : { traceSink: dependencies.traceSink }),
        ...(dependencies.workingMemoryLimits === undefined
            ? {}
            : { workingMemoryLimits: dependencies.workingMemoryLimits }),
        ...(dependencies.protocolValidator === undefined
            ? {}
            : { protocolValidator: dependencies.protocolValidator }),
        checkpointCommitter: options.checkpointCommitter,
        ...(dependencies.contextLookupPort === undefined
            ? {}
            : { contextLookupPort: dependencies.contextLookupPort }),
        ...(dependencies.executionStream === undefined ? {} : { executionStream: dependencies.executionStream }),
    };
}
