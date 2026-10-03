import type {
    Goal,
    GoalCatalogEntry,
    GoalProgressResult,
    GoalTask,
    LaunchResult,
    TrajectoryReadResult,
} from "../../runtime/src/index";
import {
    UI_BUSY_CODE,
    UI_SHUTTING_DOWN_CODE,
    UiDispatchRejectedError,
    type ExecutionMode,
    type SessionControllerDependencies,
    type UiCommand,
    type UiError,
    type UiExecutionActivity,
    type UiInspectorStep,
    type UiModelSelectOrigin,
    type UiModelSelectViewModel,
    type UiNotice,
    type UiSessionViewModel,
    type UiStepSummary,
    type UiSubscriber,
    type UiTerminalSummary,
    type UiTimelineItem,
    type UiStreamingTail,
    type UiToolGrantSummary,
    type UiToolPermissionsViewModel,
    type UiViewModel,
} from "./types";
import type { LlmModelDescriptor } from "../../llm/src/model-catalog";
import type { LlmConfig } from "../../llm/src/config";
import type {
    ExecutionStreamEvent,
    ExecutionStreamSubscription,
    StreamJsonValue,
} from "../../execution-stream/src/index";
import { projectTrajectoryEvents } from "./trajectory-projector";
import {
    StreamingTranscriptController,
    type TranscriptSnapshot,
} from "./streaming-transcript-controller";
import type {
    PermissionMode,
    ProjectPermissionMode,
    UnifiedGrantSummary,
} from "../../permission/src/index";

type ProgressResult = GoalProgressResult | LaunchResult;
type WaitingProgress = Extract<
    GoalProgressResult,
    { readonly ok: true; readonly kind: "waiting" }
>;

/**
 * 装配 Runtime 边界并向 React/Ink 暴露单 Goal 会话状态。
 *
 * @remarks
 * Controller 是唯一的 UI 命令串行化入口。它不复制 Runtime 状态机：创建、
 * 恢复、消息和批准命令分别委托给 Launcher、Store 与 Coordinator，然后把
 * 最新 Goal 转换成不可变 ViewModel。异步业务命令一次调用未完成前，后续
 * dispatch 会以 `UI_BUSY` 拒绝；Inspector 的本地浏览和执行模式切换只替换
 * 内存 ViewModel，不被该锁阻塞。模式切换不取消已经发出的操作，下一等待点
 * 使用最新模式决定是否自动批准。业务错误会保留当前
 * Goal/最近快照并显示稳定错误。已提交后继 Run 的通知会在消息区间和
 * `completedRuns` 证明其来源后刷新当前会话；旧 Run 的迟到通知仍会被丢弃。
 *
 * @example
 * ```ts
 * const controller = new SessionController(dependencies);
 * const unsubscribe = controller.subscribe(() => render(controller.getSnapshot()));
 * await controller.dispatch({ kind: "create", intent: "Review the code" });
 * unsubscribe();
 * ```
 */
export class SessionController {
    private readonly dependencies: SessionControllerDependencies;
    private shuttingDown = false;
    private lastCommittedStepCount = -1;
    private storeUnsubscribe: (() => void) | undefined;
    private executionStreamSubscription: ExecutionStreamSubscription | undefined;
    private committedSteps: UiStepSummary[] = [];
    private executionMode: ExecutionMode;
    private permissionMode: PermissionMode = "default";
    private permissionRevision = 0;
    private modelCatalogGeneration = 0;
    private modelCatalogAbortController: AbortController | undefined;
    private previousSnapshotBeforeModelSelect: UiViewModel | undefined;
    private selectedModelId: string | undefined;
    private pendingLaunchMode: "normal" | "plan" = "normal";
    private readonly transcriptController: StreamingTranscriptController;
    private readonly transcriptUnsubscribe: () => void;
    private timeline: UiTimelineItem[] = [];
    private liveActivity: UiExecutionActivity | undefined;
    private activeAssistantStream: {
        readonly streamId: string;
        readonly messageId: string;
        readonly messageIndex: number;
        hasCommittedBlock: boolean;
        committedBlockCount: number;
    } | null = null;
    private processedMessageCount = 0;
    private committedStepKeys = new Set<string>();
    private streamingTail: UiStreamingTail | undefined = undefined;
    private currentGoalId: string | null = null;
    private currentRunId: string | null = null;
    /** 当前正在创建、但 Launcher 尚未返回最终推进结果的 Goal。 */
    private pendingLaunchGoalId: string | null = null;
    private grantsRunKey: string | null = null;
    private snapshot: UiViewModel = {
        screen: "intent_input",
        busy: false,
    };
    private readonly subscribers = new Set<UiSubscriber>();

    /** @param dependencies - Launcher、Coordinator、Store、Catalog 与身份依赖。 */
    constructor(dependencies: SessionControllerDependencies) {
        this.dependencies = dependencies;
        this.executionMode = dependencies.initialExecutionMode ?? "confirm";
        this.permissionMode = this.executionMode === "yolo" ? "yolo" : "default";
        void this.refreshPermissionMode();
        this.transcriptController = new StreamingTranscriptController({
            ...(dependencies.transcriptScheduler !== undefined
                ? { scheduler: dependencies.transcriptScheduler }
                : {}),
        });
        this.transcriptUnsubscribe = this.transcriptController.subscribe((snapshot) => {
            this.onTranscriptSnapshot(snapshot);
        });
        if (dependencies.initialGoal !== undefined) {
            this.hydrateInitialGoal(dependencies.initialGoal);
            this.snapshot = this.toSessionView(dependencies.initialGoal, undefined, false);
            this.lastCommittedStepCount = dependencies.initialGoal.state.run.stepCount;
        } else if (dependencies.initialScreen === "home") {
            this.snapshot = {
                screen: "home",
                busy: false,
                ...(dependencies.environmentSummary !== undefined
                    ? { environmentSummary: dependencies.environmentSummary }
                    : {}),
            };
        } else if (dependencies.initialScreen === "goal_select") {
            this.snapshot = {
                screen: "goal_select",
                busy: false,
                goals: [],
                ...(dependencies.initialGoalSelectMode !== undefined
                    ? { mode: dependencies.initialGoalSelectMode }
                    : {}),
            };
        } else if (dependencies.initialScreen === "settings") {
            this.snapshot = {
                screen: "settings",
                busy: false,
                settings: {
                    workspaceRoot: dependencies.environmentSummary?.workspaceRoot ?? process.cwd(),
                    profileId: dependencies.profileId,
                    ...(dependencies.environmentSummary?.modelName !== undefined
                        ? { modelName: dependencies.environmentSummary.modelName }
                        : {}),
                    ...(dependencies.environmentSummary?.dataDirectory !== undefined
                        ? { dataDirectory: dependencies.environmentSummary.dataDirectory }
                        : {}),
                },
            };
        } else {
            this.snapshot = {
                screen: "intent_input",
                busy: false,
            };
        }
        if (dependencies.notifyingStore !== undefined) {
            this.storeUnsubscribe = dependencies.notifyingStore.onSave((goal) => {
                this.onGoalCommitted(goal);
            });
        }
        if (this.snapshot.screen === "session") {
            this.ensureExecutionStreamSubscription(this.snapshot.goal);
            void this.refreshToolGrants(this.snapshot.goal);
        }
    }

    /**
     * 返回最近一次完整 UI 快照。
     *
     * @returns 不可变 ViewModel；调用方不应修改其中的对象。
     */
    getSnapshot(): UiViewModel {
        return this.snapshot;
    }

    /**
     * 订阅快照替换通知。
     *
     * @param subscriber - 快照发生替换后调用的无参回调。
     * @returns 幂等取消订阅函数。
     */
    subscribe(subscriber: UiSubscriber): () => void {
        this.subscribers.add(subscriber);
        return () => {
            this.subscribers.delete(subscriber);
        };
    }

    /**
     * 将当前 UI 快照切换为关闭状态并拒绝后续命令。
     *
     * @remarks
     * 该方法只替换内存中的 ViewModel，不冻结 Store、不 abort Runtime，也不
     * 写入 `cancelled` 快照；这些动作由 CLI 的 `ShutdownCoordinator` 按顺序
     * 执行。当前 Session 的最近 Goal 会被结构化克隆到关闭页面，其他页面不
     * 虚构 Goal。重复调用没有副作用。
     *
     * @returns 无返回值；调用方应随后等待其拥有的关闭流程完成。
     * @example
     * ```ts
     * controller.beginShutdown();
     * await assert.rejects(controller.dispatch({ kind: "create", intent: "later" }));
     * ```
     */
    beginShutdown(): void {
        if (this.shuttingDown) {
            return;
        }

        this.shuttingDown = true;
        this.storeUnsubscribe?.();
        this.storeUnsubscribe = undefined;
        this.executionStreamSubscription?.close();
        this.executionStreamSubscription = undefined;
        this.transcriptController.dispose();
        this.activeAssistantStream = null;
        this.streamingTail = undefined;
        this.liveActivity = undefined;
        const goal = this.snapshot.screen === "session"
            ? structuredClone(this.snapshot.goal)
            : this.snapshot.screen === "tool_permissions"
                ? structuredClone(this.snapshot.goal)
            : undefined;

        this.setSnapshot({
            screen: "shutting_down",
            busy: true,
            ...(goal === undefined ? {} : { goal }),
        });
    }

    /**
     * 释放 Controller 持有的外部订阅资源。
     *
     * @remarks
     * 注销对底层 GoalStore 的提交监听，并清空所有 UI 订阅者与流式 Transcript 定时器。
     *
     * @example
     * ```ts
     * controller.dispose();
     * ```
     */
    dispose(): void {
        this.storeUnsubscribe?.();
        this.storeUnsubscribe = undefined;
        this.executionStreamSubscription?.close();
        this.executionStreamSubscription = undefined;
        this.transcriptController.dispose();
        this.transcriptUnsubscribe?.();
        this.activeAssistantStream = null;
        this.streamingTail = undefined;
        this.liveActivity = undefined;
        this.subscribers.clear();
    }

    /**
     * 获取当前活动或刚结束流累积的原始文本。
     *
     * @remarks
     * 独立于 Markdown Block 切分保存，用于在测试与集成中校验与 canonical GoalMessage.content 逐字符一致。
     *
     * @returns 累积的原始字符串。
     *
     * @example
     * ```ts
     * const raw = controller.getTranscriptText();
     * ```
     */
    getTranscriptText(): string {
        return this.transcriptController.getText();
    }

    /**
     * 接入模型文本通道流式输出的思考推演增量。
     *
     * @remarks
     * 对应需求 4.1：当模型在自由文本通道以流式方式产生思考内容时，本方法将文本增量实时同步至
     * 内部 `StreamingTranscriptController`，驱动动态 `streamingTail` 在终端流式渲染思维链。
     * 若当前尚无针对该 `streamId` 的活跃流，将先自动触发 `started` 事件初始化新流。
     * 若 Controller 已处于关闭状态（`shuttingDown`），增量将被安全丢弃。
     *
     * @param streamId - 关联的模型推理流或步骤唯一标识。
     * @param deltaText - 本次到达的思考文本增量片段。
     * @param messageId - 可选的消息标识；未提供时默认为 `thought-${streamId}`。
     *
     * @example
     * ```ts
     * controller.feedThinkingDelta("stream-step-1", "正在分析项目目录结构...\n");
     * ```
     */
    feedThinkingDelta(streamId: string, deltaText: string, messageId?: string): void {
        if (this.shuttingDown) return;
        const targetMessageId = messageId ?? `thought-${streamId}`;
        if (this.activeAssistantStream === null || this.activeAssistantStream.streamId !== streamId) {
            this.flushActiveStreamBarrier();
            this.activeAssistantStream = {
                streamId,
                messageId: targetMessageId,
                messageIndex: -1,
                hasCommittedBlock: false,
                committedBlockCount: 0,
            };
            this.transcriptController.started({ streamId, messageId: targetMessageId });
        }
        this.transcriptController.delta({ streamId, text: deltaText });
    }

    /**
     * 结束指定流的思考推演过程。
     *
     * @remarks
     * 标记当前思考流已完成，触发 `StreamingTranscriptController` 收束剩余尾部并排期提交 Tick，
     * 保证在后续动作审批抽屉弹出或步骤执行前思维推演渲染完整。
     * 若当前流标识不匹配或处于关闭态，不产生副作用。
     *
     * @param streamId - 待完成的思考推演流标识。
     *
     * @example
     * ```ts
     * controller.completeThinking("stream-step-1");
     * ```
     */
    completeThinking(streamId: string): void {
        if (this.shuttingDown) return;
        if (this.activeAssistantStream !== null && this.activeAssistantStream.streamId === streamId) {
            this.transcriptController.completed({ streamId });
        }
    }

    /**
     * 处理一个 UI 命令。
     *
     * @remarks
     * 创建、恢复、消息、批准和页面数据加载等异步业务命令保持串行处理，
     * 同时进行时以 `UI_BUSY` 拒绝。Inspector 浏览和执行模式切换可在 busy
     * 期间更新本地状态；切换模式不会并发调用 Coordinator，也不撤销已批准的
     * Action。YOLO 自动推进期间保持 busy，直到最终等待点或终态。
     *
     * @param command - 不携带运行时状态的用户意图。
     * @returns 命令处理完成；业务失败会体现在 ViewModel.error 中。
     * @throws `UiDispatchRejectedError` 表示异步业务命令已有命令执行中，或
     * Controller 正在关闭。
     */
    dispatch(command: UiCommand): Promise<void> {
        if (this.snapshot.screen === "shutting_down") {
            return Promise.reject(
                new UiDispatchRejectedError(
                    UI_SHUTTING_DOWN_CODE,
                    "The session controller is shutting down",
                ),
            );
        }

        if (command.kind === "inspectStep") {
            this.inspectStep(command.stepIndex);
            return Promise.resolve();
        }

        if (command.kind === "toggleReasoning") {
            this.toggleReasoning();
            return Promise.resolve();
        }

        if (command.kind === "toggleObservation") {
            this.toggleObservation();
            return Promise.resolve();
        }

        if (command.kind === "openModelSelector" || command.kind === "cancelModelSelect" || command.kind === "selectModel") {
            if (this.snapshot.busy && command.kind !== "cancelModelSelect") {
                return Promise.reject(new UiDispatchRejectedError(UI_BUSY_CODE, "Another UI command is already in progress"));
            }
        }

        if (this.snapshot.busy) {
            if (command.kind === "toggleExecutionMode" || command.kind === "setExecutionMode") {
                return this.setMode(command.kind === "setExecutionMode"
                    ? command.mode : (this.permissionMode === "default" ? "yolo" : "confirm"));
            }
            if (command.kind === "cancelModelSelect" && this.snapshot.screen === "model_select") {
                this.cancelModelSelect();
                return Promise.resolve();
            }
            return Promise.reject(
                new UiDispatchRejectedError(
                    UI_BUSY_CODE,
                    "Another UI command is already in progress",
                ),
            );
        }

        this.setBusy(true, true);

        return this.execute(command)
            .catch((error: unknown) => {
                if (this.snapshot.screen !== "shutting_down") {
                    this.setError(toUiError(error));
                }
            })
            .finally(() => {
                if (this.snapshot.screen !== "shutting_down") {
                    this.setBusy(false);
                }
            });
    }

    private async execute(command: UiCommand): Promise<void> {
        switch (command.kind) {
            case "create":
                await this.createGoal(command.intent);
                return;
            case "resume":
                await this.showGoalSelect();
                return;
            case "continueLatest":
                await this.continueLatest();
                return;
            case "selectGoal":
                await this.selectGoal(command.goalId);
                return;
            case "submitMessage":
                await this.submitSessionMessage(command.content);
                return;
            case "enterPlanMode":
                await this.enterPlanMode();
                return;
            case "approveTask":
                await this.resumeSession({
                    kind: "approve_task",
                    requestId: command.requestId,
                });
                return;
            case "feedbackTask":
                await this.resumeSession({
                    kind: "feedback_task",
                    requestId: command.requestId,
                    feedback: command.feedback,
                });
                return;
            case "answerAskUser":
                await this.resumeSession({
                    kind: "answer_ask_user",
                    requestId: command.requestId,
                    answers: command.answers,
                });
                return;
            case "approveAction":
                await this.resumeSession({
                    kind: "approve_action",
                    actionId: command.actionId,
                    scope: command.scope ?? "action",
                });
                return;
            case "openToolPermissions":
                await this.openToolPermissions();
                return;
            case "closeToolPermissions":
                if (this.snapshot.screen === "tool_permissions") this.setSnapshot(this.snapshot.session);
                return;
            case "revokeToolGrant":
                await this.revokeToolGrant(command.grantId, command.scope, command.grantKind);
                return;
            case "rejectAction":
                await this.resumeSession({
                    kind: "reject_action",
                    actionId: command.actionId,
                    reason: command.reason,
                });
                return;
            case "openHome":
                this.openHome();
                return;
            case "openIntentInput":
                this.openIntentInput();
                return;
            case "openSettings":
                this.openSettings();
                return;
            case "openHistory":
                await this.openHistory();
                return;
            case "toggleExecutionMode":
                await this.setMode(this.permissionMode === "default" ? "yolo" : "confirm");
                return;
            case "setExecutionMode":
                await this.setMode(command.mode);
                return;
            case "openInspector":
                this.openInspector(command.goalId, command.steps);
                return;
            case "inspectStep":
                this.inspectStep(command.stepIndex);
                return;
            case "toggleReasoning":
                this.toggleReasoning();
                return;
            case "toggleObservation":
                this.toggleObservation();
                return;
            case "openModelSelector":
                this.openModelSelector();
                return;
            case "cancelModelSelect":
                this.cancelModelSelect();
                return;
            case "selectModel":
                await this.selectModel(command.model);
                return;
        }
    }

    private async createGoal(intent: string): Promise<void> {
        if (this.snapshot.screen !== "intent_input" && this.snapshot.screen !== "home") {
            this.setError({
                code: "CREATE_NOT_ALLOWED",
                message: "A Goal can only be created from the intent or home screen",
            });
            return;
        }

        if (intent.trim().length === 0) {
            this.setError({
                code: "INVALID_GOAL_INPUT",
                message: "Intent must not be empty",
            });
            return;
        }

        const request = {
            goalId: this.dependencies.goalIdGenerator(),
            intent,
            profileId: this.dependencies.profileId,
            ...(this.pendingLaunchMode === "normal" ? {} : { mode: this.pendingLaunchMode }),
            ...(this.dependencies.maxSteps === undefined
                ? {}
                : { maxSteps: this.dependencies.maxSteps }),
            ...(this.selectedModelId !== undefined
                ? {
                    modelSelection: {
                        ...(this.dependencies.defaultModelSelection ?? {
                            structuredOutputMode: "strict" as const,
                            inputEstimator: { kind: "character-v1" as const },
                        }),
                        provider: this.dependencies.defaultModelSelection?.provider
                            ?? this.dependencies.llmConfig?.provider
                            ?? "openai",
                        modelId: this.selectedModelId,
                    },
                }
                : this.dependencies.defaultModelSelection !== undefined
                    ? { modelSelection: this.dependencies.defaultModelSelection }
                    : {}),
        };
        this.pendingLaunchGoalId = request.goalId;
        try {
            let result: LaunchResult;
            try {
                result = await this.dependencies.launcher.launch(
                    request,
                    this.dependencies.control,
                );
            } catch (error: unknown) {
                const savedGoal = await this.restoreAfterLaunchFailure(request.goalId);
                if (savedGoal !== undefined) {
                    this.pendingLaunchMode = "normal";
                    this.setSnapshot(this.toSessionView(savedGoal, undefined, false));
                    this.setError(toUiError(error));
                    return;
                }
                throw error;
            }

            if (!result.ok) {
                const savedGoal = await this.restoreAfterLaunchFailure(request.goalId);
                if (savedGoal !== undefined) {
                    this.pendingLaunchMode = "normal";
                    this.setSnapshot(this.toSessionView(savedGoal, undefined, false));
                    this.setError(result.error);
                    return;
                }
            }

            if (result.ok) {
                this.pendingLaunchMode = "normal";
            }

            await this.applyProgress(result);
        } finally {
            if (this.pendingLaunchGoalId === request.goalId) {
                this.pendingLaunchGoalId = null;
            }
        }
    }

    private async enterPlanMode(): Promise<void> {
        if (this.snapshot.screen === "intent_input") {
            this.pendingLaunchMode = "plan";
            this.setSnapshot({
                ...this.snapshot,
                notice: { kind: "info", message: "Plan Mode will be enabled for the next Goal." },
            });
            return;
        }
        if (this.snapshot.screen === "home") {
            this.pendingLaunchMode = "plan";
            this.openIntentInput();
            return;
        }
        if (this.snapshot.screen !== "session") {
            this.setError({
                code: "PLAN_MODE_NOT_ALLOWED",
                message: "Plan Mode can only be entered from a Goal session or intent input",
            });
            return;
        }
        const enterPlanMode = this.dependencies.coordinator.enterPlanMode;
        if (enterPlanMode === undefined) {
            this.setError({
                code: "PLAN_MODE_NOT_CONFIGURED",
                message: "Plan Mode is not configured for this session",
            });
            return;
        }
        const result = await enterPlanMode.call(this.dependencies.coordinator, {
            goalId: this.snapshot.goal.id,
            runId: this.snapshot.goal.state.run.id,
        }, this.dependencies.control);
        await this.applyProgress(result);
    }

    private async continueLatest(): Promise<void> {
        const entries = await this.listResumableIntoGoalSelect();
        if (entries === undefined) {
            return;
        }

        const latest = entries[0];
        if (latest === undefined) {
            return;
        }

        await this.restoreAndAdvance(latest.goalId, entries);
    }

    private async showGoalSelect(): Promise<void> {
        await this.listResumableIntoGoalSelect();
    }

    private async openHistory(): Promise<void> {
        const entries = await this.listResumableIntoGoalSelect("inspect");
        if (entries === undefined) {
            return;
        }
        this.setSnapshot({
            screen: "goal_select",
            busy: false,
            goals: entries,
            mode: "inspect",
        });
    }

    private async listResumableIntoGoalSelect(
        mode: "resume" | "inspect" = "resume",
    ): Promise<GoalCatalogEntry[] | undefined> {
        if (this.snapshot.screen === "session") {
            this.setError({
                code: "SESSION_ACTIVE",
                message: "A Goal session is already active",
            });
            return undefined;
        }

        this.setSnapshot({
            screen: "goal_select",
            busy: true,
            goals: [],
            ...(mode === "inspect" ? { mode: "inspect" as const } : {}),
        });
        let goals: readonly GoalCatalogEntry[];
        try {
            if (mode === "inspect" && typeof this.dependencies.catalog.listHistory === "function") {
                goals = await this.dependencies.catalog.listHistory();
            } else {
                goals = await this.dependencies.catalog.listResumable();
            }
        } catch (error: unknown) {
            this.setGoalSelectError(toUiError(error));
            return undefined;
        }

        const entries = goals.map((entry) => ({ ...entry }));
        this.setSnapshot({
            screen: "goal_select",
            busy: true,
            goals: entries,
            ...(mode === "inspect" ? { mode: "inspect" } : {}),
        });

        if (entries.length === 0 && mode === "resume") {
            this.setError({
                code: "NO_RESUMABLE_GOAL",
                message: "No resumable Goal was found",
            });
            return undefined;
        }

        return entries;
    }

    private async selectGoal(goalId: string): Promise<void> {
        if (this.snapshot.screen === "session") {
            this.setError({
                code: "SESSION_ACTIVE",
                message: "A Goal session is already active",
            });
            return;
        }

        const normalizedGoalId = goalId.trim();
        if (normalizedGoalId.length === 0) {
            this.setGoalSelectError({
                code: "INVALID_GOAL_ID",
                message: "Goal ID must not be empty",
            });
            return;
        }

        if (this.snapshot.screen === "goal_select" && this.snapshot.mode === "inspect") {
            let goal: Goal | undefined;
            try {
                goal = await this.dependencies.store.restore(normalizedGoalId);
            } catch (error: unknown) {
                this.setGoalSelectError(toUiError(error), this.snapshot.goals);
                return;
            }

            if (goal === undefined) {
                this.setGoalSelectError({
                    code: "RUN_NOT_FOUND",
                    message: `Goal "${normalizedGoalId}" was not found`,
                }, this.snapshot.goals);
                return;
            }

            if (!this.dependencies.readTrajectory) {
                this.setGoalSelectError({
                    code: "TRAJECTORY_NOT_FOUND",
                    message: `Trajectory reading is not configured for Goal "${normalizedGoalId}"`,
                }, this.snapshot.goals);
                return;
            }

            let trajectoryResult: Readonly<TrajectoryReadResult>;
            try {
                trajectoryResult = await this.dependencies.readTrajectory({
                    goalId: normalizedGoalId,
                    runId: goal.state.run.id,
                });
            } catch (error: unknown) {
                this.setGoalSelectError({
                    code: "TRAJECTORY_NOT_FOUND",
                    message: `Failed to read trajectory for Goal "${normalizedGoalId}": ${error instanceof Error ? error.message : String(error)}`,
                }, this.snapshot.goals);
                return;
            }

            const hasCommitted = trajectoryResult.committed.length > 0;
            const hasUncommitted = (trajectoryResult.uncommittedTail?.length ?? 0) > 0;
            if (!hasCommitted && !hasUncommitted) {
                this.setGoalSelectError({
                    code: "TRAJECTORY_NOT_FOUND",
                    message: `Trajectory for Goal "${normalizedGoalId}" contains no events`,
                }, this.snapshot.goals);
                return;
            }

            const steps = projectTrajectoryEvents({
                goalId: normalizedGoalId,
                goal,
                committedEvents: trajectoryResult.committed,
                ...(trajectoryResult.uncommittedTail !== undefined
                    ? { uncommittedTail: trajectoryResult.uncommittedTail }
                    : {}),
            });

            if (steps.length === 0) {
                this.setGoalSelectError({
                    code: "TRAJECTORY_NOT_FOUND",
                    message: `Trajectory for Goal "${normalizedGoalId}" yielded no inspectable steps`,
                }, this.snapshot.goals);
                return;
            }

            this.openInspector(normalizedGoalId, steps);
            return;
        }

        const goals = this.snapshot.screen === "goal_select"
            ? this.snapshot.goals
            : [];
        await this.restoreAndAdvance(normalizedGoalId, goals);
    }

    private async restoreAndAdvance(
        goalId: string,
        goals: readonly GoalCatalogEntry[],
    ): Promise<void> {
        let goal: Goal | undefined;
        try {
            goal = await this.dependencies.store.restore(goalId);
        } catch (error: unknown) {
            this.setGoalSelectError(toUiError(error), goals);
            return;
        }

        if (goal === undefined) {
            this.setGoalSelectError({
                code: "RUN_NOT_FOUND",
                message: `Goal "${goalId}" was not found`,
            }, goals);
            return;
        }

        if (this.dependencies.modelRestorer !== undefined) {
            const restoreResult = await this.dependencies.modelRestorer.restoreModel({ goal });
            if (!restoreResult.ok) {
                this.previousSnapshotBeforeModelSelect = this.snapshot;
                this.modelCatalogGeneration += 1;
                this.setSnapshot({
                    screen: "model_select",
                    busy: false,
                    origin: "blocked",
                    goal,
                    currentModelId: goal.state.modelSelection?.modelId ?? "unknown",
                    state: {
                        status: "error",
                        generation: this.modelCatalogGeneration,
                        error: restoreResult.error,
                    },
                    error: restoreResult.error,
                });
                return;
            }
        }

        this.setSnapshot(this.toSessionView(goal, undefined, true));
        const result = await this.dependencies.coordinator.advance(
            { goalId: goal.id, runId: goal.state.run.id },
            this.dependencies.control,
        );
        await this.applyProgress(result);
    }

    private async resumeSession(
        action: Parameters<
            SessionControllerDependencies["coordinator"]["resume"]
        >[0]["action"],
    ): Promise<void> {
        if (this.snapshot.screen !== "session") {
            this.setError({
                code: "NO_ACTIVE_SESSION",
                message: "There is no active Goal session",
            });
            return;
        }

        const validationError = validateUserAction(action);
        if (validationError !== undefined) {
            this.setError(validationError);
            return;
        }

        const request = {
            ref: {
                goalId: this.snapshot.goal.id,
                runId: this.snapshot.goal.state.run.id,
            },
            action,
        };
        const result = await this.dependencies.coordinator.resume(
            request,
            this.dependencies.control,
        );
        await this.applyProgress(result);
    }

    private async submitSessionMessage(content: string): Promise<void> {
        if (this.snapshot.screen !== "session") {
            this.setError({
                code: "NO_ACTIVE_SESSION",
                message: "There is no active Goal session",
            });
            return;
        }
        if (content.trim().length === 0) {
            this.setError({
                code: "INVALID_GOAL_INPUT",
                message: "Message must not be empty",
            });
            return;
        }

        const ref = {
            goalId: this.snapshot.goal.id,
            runId: this.snapshot.goal.state.run.id,
        };
        if (this.snapshot.goal.state.run.status === "waiting") {
            await this.resumeSession({ kind: "message", content });
            return;
        }
        if (this.snapshot.goal.state.run.status !== "completed") {
            // 保留旧的 Controller 适配语义：真实交互面板只会在 waiting 显示输入，
            // 但测试/宿主可能在安全的外部等待点直接提交 message。
            await this.resumeSession({ kind: "message", content });
            return;
        }
        const continueGoal = this.dependencies.coordinator.continue;
        if (continueGoal === undefined) {
            this.setError({
                code: "CONTINUE_NOT_CONFIGURED",
                message: "Continuing a completed Run is not configured for this session",
            });
            return;
        }
        const result = await continueGoal.call(
            this.dependencies.coordinator,
            ref,
            content,
            this.dependencies.control,
        );
        await this.applyProgress(result);
    }

    private async applyProgress(result: ProgressResult): Promise<void> {
        if (this.shuttingDown) return;
        if (!result.ok) {
            this.setError(result.error);
            return;
        }
        this.setSnapshot(this.toSessionView(result.goal, result, true));
    }

    private openHome(): void {
        this.setSnapshot({
            screen: "home",
            busy: false,
            ...(this.dependencies.environmentSummary !== undefined
                ? { environmentSummary: this.dependencies.environmentSummary }
                : {}),
        });
    }

    private openIntentInput(): void {
        this.setSnapshot({
            screen: "intent_input",
            busy: false,
        });
    }

    private openSettings(): void {
        this.setSnapshot({
            screen: "settings",
            busy: false,
            settings: {
                workspaceRoot: this.dependencies.environmentSummary?.workspaceRoot ?? process.cwd(),
                profileId: this.dependencies.profileId,
                ...(this.dependencies.environmentSummary?.modelName !== undefined
                    ? { modelName: this.dependencies.environmentSummary.modelName }
                    : {}),
                ...(this.dependencies.environmentSummary?.dataDirectory !== undefined
                    ? { dataDirectory: this.dependencies.environmentSummary.dataDirectory }
                    : {}),
            },
        });
    }

    private async refreshPermissionMode(): Promise<void> {
        if (this.dependencies.coordinator.getPermissionMode === undefined) return;
        try {
            const modeRecord = await this.dependencies.coordinator.getPermissionMode();
            this.permissionMode = modeRecord.mode;
            this.permissionRevision = modeRecord.revision;
            this.executionMode = modeRecord.mode === "yolo" ? "yolo" : "confirm";
            if (this.snapshot.screen === "session") {
                this.setSnapshot({
                    ...this.snapshot,
                    executionMode: this.executionMode,
                    permissionMode: this.permissionMode,
                    permissionRevision: this.permissionRevision,
                });
            }
        } catch {
            // 保留本地状态
        }
    }

    private async setMode(mode: ExecutionMode): Promise<void> {
        const targetPermissionMode: PermissionMode = mode === "yolo" ? "yolo" : "default";
        if (this.dependencies.coordinator.setPermissionMode !== undefined) {
            try {
                const updated = await this.dependencies.coordinator.setPermissionMode(
                    targetPermissionMode,
                    this.permissionRevision,
                );
                this.permissionMode = updated.mode;
                this.permissionRevision = updated.revision;
                this.executionMode = updated.mode === "yolo" ? "yolo" : "confirm";
            } catch (error) {
                await this.refreshPermissionMode();
                if (this.snapshot.screen === "session") {
                    this.setSnapshot({
                        ...this.snapshot,
                        error: {
                            code: "PERMISSION_MODE_ERROR",
                            message: error instanceof Error ? error.message : "Failed to update permission mode",
                        },
                    });
                }
                return;
            }
        } else {
            this.executionMode = mode;
            this.permissionMode = targetPermissionMode;
        }

        if (this.snapshot.screen === "session") {
            this.setSnapshot({
                ...this.snapshot,
                executionMode: this.executionMode,
                permissionMode: this.permissionMode,
                permissionRevision: this.permissionRevision,
            });
        }
    }

    private openInspector(goalId: string, steps: readonly UiInspectorStep[]): void {
        this.setSnapshot({
            screen: "inspector",
            busy: false,
            goalId,
            currentStepIndex: 0,
            totalSteps: steps.length,
            steps,
            showReasoning: false,
            expandObservation: false,
        });
    }

    private inspectStep(stepIndex: number): void {
        if (this.snapshot.screen !== "inspector") {
            return;
        }
        const maxIndex = Math.max(0, this.snapshot.totalSteps - 1);
        const boundedIndex = Math.max(0, Math.min(stepIndex, maxIndex));
        this.setSnapshot({
            ...this.snapshot,
            currentStepIndex: boundedIndex,
        });
    }

    private toggleReasoning(): void {
        if (this.snapshot.screen !== "inspector") {
            return;
        }
        this.setSnapshot({
            ...this.snapshot,
            showReasoning: !this.snapshot.showReasoning,
        });
    }

    private toggleObservation(): void {
        if (this.snapshot.screen !== "inspector") {
            return;
        }
        this.setSnapshot({
            ...this.snapshot,
            expandObservation: !this.snapshot.expandObservation,
        });
    }

    private async restoreAfterLaunchFailure(
        goalId: string,
    ): Promise<Goal | undefined> {
        try {
            return await this.dependencies.store.restore(goalId);
        } catch {
            return undefined;
        }
    }

    private hydrateInitialGoal(goal: Goal): void {
        this.currentGoalId = goal.id;
        this.timeline = [];
        this.committedStepKeys.clear();
        this.activeAssistantStream = null;
        this.streamingTail = undefined;
        this.committedSteps = [];

        // 需求 4.2：恢复已有 Goal 或初次进入时，把快照中的完整消息直接初始化为 committed history，不回放动画
        for (let i = 0; i < goal.state.messages.length; i++) {
            const message = goal.state.messages[i]!;
            this.timeline.push({
                kind: "message",
                id: `msg-${goal.id}-${i}`,
                message,
            });
        }
        this.processedMessageCount = goal.state.messages.length;

        const initialStep = deriveStepSummary(goal);
        if (initialStep !== undefined) {
            this.committedSteps = [initialStep];
            this.committedStepKeys.add(stepKey(goal, initialStep));
            this.timeline.push({
                kind: "step",
                id: `step-${initialStep.stepNumber}-${initialStep.actionId}`,
                step: initialStep,
            });
        }
    }

    private flushActiveStreamBarrier(): void {
        if (this.activeAssistantStream !== null) {
            this.transcriptController.flush();
        }
    }

    private syncTimelineWithGoal(goal: Goal): void {
        if (this.currentGoalId === null || this.currentGoalId !== goal.id) {
            this.transcriptController.reset();
            this.hydrateInitialGoal(goal);
            return;
        }

        // 检查新增消息
        if (goal.state.messages.length > this.processedMessageCount) {
            for (let i = this.processedMessageCount; i < goal.state.messages.length; i++) {
                const message = goal.state.messages[i]!;
                if (message.role === "user") {
                    this.flushActiveStreamBarrier();
                    this.timeline.push({
                        kind: "message",
                        id: `msg-${goal.id}-${i}`,
                        message,
                    });
                } else if (message.role === "assistant") {
                    this.flushActiveStreamBarrier();
                    // 需求 4.1：将新增完整 Assistant 消息转换为合成流事件
                    const streamId = `stream-${goal.id}-${i}`;
                    const messageId = `msg-${goal.id}-${i}`;
                    this.activeAssistantStream = {
                        streamId,
                        messageId,
                        messageIndex: i,
                        hasCommittedBlock: false,
                        committedBlockCount: 0,
                    };
                    this.transcriptController.started({ streamId, messageId });
                    this.transcriptController.delta({ streamId, text: message.content });
                    this.transcriptController.completed({ streamId });
                }
            }
            this.processedMessageCount = goal.state.messages.length;
        }

        // 检查新增步骤
        const newStep = deriveStepSummary(goal);
        if (newStep !== undefined && !this.committedStepKeys.has(stepKey(goal, newStep))) {
            this.flushActiveStreamBarrier();
            this.committedStepKeys.add(stepKey(goal, newStep));
            this.committedSteps.push(newStep);
            this.timeline.push({
                kind: "step",
                id: `step-${newStep.stepNumber}-${newStep.actionId}`,
                step: newStep,
            });
        }
    }

    private onTranscriptSnapshot(snapshot: TranscriptSnapshot): void {
        if (this.shuttingDown || this.activeAssistantStream === null) {
            return;
        }
        if (snapshot.streamId !== this.activeAssistantStream.streamId) {
            return;
        }

        if (snapshot.committedBlocks.length > this.activeAssistantStream.committedBlockCount) {
            for (let i = this.activeAssistantStream.committedBlockCount; i < snapshot.committedBlocks.length; i++) {
                const block = snapshot.committedBlocks[i]!;
                const showAuthor = !this.activeAssistantStream.hasCommittedBlock;
                this.timeline.push({
                    kind: "assistant_markdown",
                    id: `${this.activeAssistantStream.messageId}-blk-${i}`,
                    block,
                    showAuthor,
                });
                this.activeAssistantStream.hasCommittedBlock = true;
            }
            this.activeAssistantStream.committedBlockCount = snapshot.committedBlocks.length;
        }

        if (snapshot.liveTail.length > 0) {
            this.streamingTail = {
                messageId: this.activeAssistantStream.messageId,
                content: snapshot.liveTail,
                showAuthor: !this.activeAssistantStream.hasCommittedBlock,
            };
        } else {
            this.streamingTail = undefined;
            if (!snapshot.isStreaming && snapshot.pendingBlocks.length === 0) {
                this.activeAssistantStream = null;
            }
        }

        if (this.snapshot.screen === "session") {
            const current = this.snapshot;
            const nextSession: UiSessionViewModel = {
                ...current,
                timeline: this.timeline.slice(),
                ...(this.streamingTail !== undefined ? { streamingTail: this.streamingTail } : {}),
            };
            if (this.streamingTail === undefined) {
                delete (nextSession as any).streamingTail;
            }
            this.setSnapshot(nextSession);
        }
    }

    private ensureExecutionStreamSubscription(goal: Goal): void {
        const publisher = this.dependencies.executionStream;
        if (publisher === undefined) return;
        if (
            this.executionStreamSubscription !== undefined
            && this.currentGoalId === goal.id
            && this.currentRunId === goal.state.run.id
        ) {
            return;
        }
        this.executionStreamSubscription?.close();
        this.liveActivity = undefined;
        const subscription = publisher.subscribe(
            { goalId: goal.id, runId: goal.state.run.id },
            { minimumVisibility: "restricted", includeReasoning: true, maxQueueSize: 256 },
        );
        this.executionStreamSubscription = subscription;
        subscription.onEvent((event) => this.onExecutionStreamEvent(event));
    }

    private onExecutionStreamEvent(event: ExecutionStreamEvent): void {
        if (this.shuttingDown || this.snapshot.screen !== "session") return;
        const executionUnitId = event.executionUnitId ?? this.currentRunId ?? "run";
        const payload = isExecutionPayloadRecord(event.payload) ? event.payload : undefined;
        switch (event.kind) {
            case "step_started":
                this.setLiveActivity({
                    kind: "step",
                    executionUnitId,
                    label: payload?.stepCount === undefined
                        ? "Starting step..."
                        : `Starting step ${String(payload.stepCount)}`,
                });
                return;
            case "model_started":
                this.setLiveActivity({ kind: "model", executionUnitId, label: "Generating response..." });
                return;
            case "assistant_text_delta":
            case "reasoning_delta": {
                const text = typeof payload?.text === "string" ? payload.text : undefined;
                if (text === undefined || text.length === 0) return;
                this.feedThinkingDelta(executionUnitId, text, `thought-${executionUnitId}`);
                this.setLiveActivity({ kind: "model", executionUnitId, label: "Generating response..." });
                return;
            }
            case "tool_started": {
                const toolId = typeof payload?.toolId === "string" ? payload.toolId : "tool";
                const actionId = event.actionId
                    ?? (typeof payload?.actionId === "string" ? payload.actionId : undefined);
                this.setLiveActivity({
                    kind: "tool",
                    executionUnitId,
                    label: `Running ${toolId}...`,
                    toolId,
                    ...(actionId === undefined ? {} : { actionId }),
                });
                return;
            }
            case "tool_output_delta": {
                const text = typeof payload?.text === "string" ? payload.text : "";
                const current = this.liveActivity;
                if (current === undefined || current.executionUnitId !== executionUnitId) return;
                const output = `${current.output ?? ""}${text}`;
                this.setLiveActivity({
                    ...current,
                    output: output.length > 4000 ? output.slice(-4000) : output,
                });
                return;
            }
            case "tool_finished":
                if (this.liveActivity?.executionUnitId === executionUnitId) {
                    this.setLiveActivity({ ...this.liveActivity, label: "Tool completed" });
                }
                return;
            case "model_completed":
                this.completeThinking(executionUnitId);
                if (this.liveActivity?.executionUnitId === executionUnitId) {
                    this.setLiveActivity({ ...this.liveActivity, label: "Model response received" });
                }
                return;
            case "step_committed":
                this.completeThinking(executionUnitId);
                this.setLiveActivity(undefined);
                return;
            case "run_waiting":
            case "run_completed":
            case "run_failed":
            case "run_cancelled":
                this.completeThinking(executionUnitId);
                this.setLiveActivity(undefined);
                return;
            default:
                return;
        }
    }

    private setLiveActivity(activity: UiExecutionActivity | undefined): void {
        this.liveActivity = activity;
        if (this.snapshot.screen !== "session") return;
        if (activity === undefined) {
            const { liveActivity: _liveActivity, ...rest } = this.snapshot;
            this.setSnapshot(rest as UiSessionViewModel);
            return;
        }
        this.setSnapshot({ ...this.snapshot, liveActivity: activity });
    }

    private toSessionView(
        goal: Goal,
        progress: ProgressResult | undefined,
        busy: boolean,
    ): UiSessionViewModel {
        if (this.currentRunId !== goal.state.run.id) {
            this.currentRunId = goal.state.run.id;
            this.lastCommittedStepCount = goal.state.run.stepCount;
        } else {
            this.lastCommittedStepCount = Math.max(this.lastCommittedStepCount, goal.state.run.stepCount);
        }
        if (this.currentGoalId === null || (this.snapshot.screen === "session" && this.snapshot.goal.id !== goal.id)) {
            this.transcriptController.reset();
            this.hydrateInitialGoal(goal);
        } else {
            this.syncTimelineWithGoal(goal);
        }
        const snapshot = structuredClone(goal);
        this.ensureExecutionStreamSubscription(snapshot);
        const waitingFor = progress?.ok === true && progress.kind === "waiting"
            ? progress.waitingFor
            : deriveWaitingFor(snapshot);
        const interaction = snapshot.state.run.pendingInteraction;
        const askUser = interaction?.kind === "ask_user" ? {
            requestId: interaction.requestId,
            mode: interaction.mode,
            questions: interaction.questions,
        } : undefined;
        const interactionMode = askUser?.mode;
        const proposal = interaction?.kind === "task_approval" ? interaction.proposal : deriveProposal(snapshot);
        const proposalRequestId = interaction?.kind === "task_approval" ? interaction.requestId : undefined;
        const approvalRequest = interaction?.kind === "task_approval" ? interaction.approvalRequest : undefined;
        const blockedReason = waitingFor === "blocked"
            ? deriveBlockedReason(snapshot)
            : undefined;
        const terminal = deriveTerminalSummary(snapshot);

        const currentSession = this.snapshot?.screen === "session" ? this.snapshot : undefined;
        const sameRun = currentSession?.goal.state.run.id === snapshot.state.run.id;
        const mode = this.dependencies.mode ?? currentSession?.mode;
        const taskTitle = this.dependencies.taskTitle ?? currentSession?.taskTitle;

        return {
            screen: "session",
            busy,
            goal: snapshot,
            phase: snapshot.state.workflow.phase,
            runStatus: snapshot.state.run.status,
            stepCount: snapshot.state.run.stepCount,
            messages: snapshot.state.messages,
            executionMode: this.executionMode,
            permissionMode: this.permissionMode,
            permissionRevision: this.permissionRevision,
            timeline: this.timeline.slice(),
            ...(this.streamingTail !== undefined ? { streamingTail: this.streamingTail } : {}),
            ...(sameRun && this.liveActivity !== undefined ? { liveActivity: this.liveActivity } : {}),
            committedSteps: this.committedSteps.slice(),
            ...(mode !== undefined ? { mode } : {}),
            ...(taskTitle !== undefined ? { taskTitle } : {}),
            ...(sameRun && currentSession?.lastCommittedAction !== undefined
                ? { lastCommittedAction: currentSession.lastCommittedAction }
                : {}),
            ...(sameRun && currentSession?.lastCommittedObservation !== undefined
                ? { lastCommittedObservation: currentSession.lastCommittedObservation }
                : {}),
            ...(currentSession?.cleaning !== undefined ? { cleaning: currentSession.cleaning } : {}),
            ...(waitingFor === undefined ? {} : { waitingFor }),
            ...(askUser !== undefined ? { askUser } : {}),
            ...(interactionMode !== undefined ? { interactionMode } : {}),
            ...(proposal === undefined ? {} : { proposal }),
            ...(proposalRequestId === undefined ? {} : { proposalRequestId }),
            ...(approvalRequest === undefined ? {} : { approvalRequest }),
            ...(blockedReason === undefined ? {} : { blockedReason }),
            ...(snapshot.state.run.pendingAction === undefined
                ? {}
                : { pendingAction: snapshot.state.run.pendingAction }),
            ...(snapshot.state.run.pendingAction === undefined || snapshot.state.run.pendingProgram === undefined
                ? {}
                : { pendingProgramParent: {
                    actionId: snapshot.state.run.pendingProgram.action.actionId,
                    callNumber: snapshot.state.run.pendingProgram.nextCallIndex + 1,
                } }),
            ...(terminal === undefined ? {} : { terminal }),
            ...(snapshot.state.goalPlan !== undefined
                ? { goalPlan: snapshot.state.goalPlan }
                : {}),
            ...(sameRun && currentSession?.toolGrants !== undefined
                ? { toolGrants: currentSession.toolGrants }
                : {}),
            ...(sameRun && currentSession?.toolGrantError !== undefined
                ? { toolGrantError: currentSession.toolGrantError }
                : {}),
        };
    }

    /**
     * 处理外部原子提交的 Goal 快照更新。
     *
     * @remarks
     * 对应 req-5-2、req-5-3：
     * 1. 过滤已关闭（shuttingDown）、非当前 Goal 与无法证明为后继 Run 的迟到事件；
     * 2. 对当前创建请求的首个匹配快照建立 Session 页面，再持续接收该 Goal 的提交通知；
     * 3. 按 stepCount 单调递增去重，拒绝迟到的旧读取结果；
     * 4. 提取已提交的 Action/Observation 事实；
     * 5. 严守契约：绝不修改当前的 busy 状态（保证在途 dispatch 的锁不受污染）；
     * 6. 立即通知 UI 订阅者渲染增量帧。
     *
     * @param savedGoal - 成功保存到持久化存储的不可变 Goal 快照。
     *
     * @example
     * ```ts
     * controller.onGoalCommitted(committedGoal);
     * ```
     */
    onGoalCommitted(savedGoal: Goal): void {
        if (this.shuttingDown) {
            return;
        }

        if (
            this.snapshot.screen !== "session"
            && this.snapshot.busy
            && this.pendingLaunchGoalId === savedGoal.id
        ) {
            // Launcher 先保存初始快照，再等待 Coordinator.advance 返回。
            // 首次提交是 UI 从 intent_input 进入 session 的边界；后续提交
            // 将沿用下面的同一条单调投影路径，持续显示执行中的每个 Step。
            this.setSnapshot(this.toSessionView(savedGoal, undefined, true));
        }

        if (this.snapshot.screen !== "session") {
            return;
        }

        const currentGoal = this.snapshot.goal;
        if (savedGoal.id !== currentGoal.id) {
            return;
        }

        const isCurrentRun = savedGoal.state.run.id === currentGoal.state.run.id;
        if (!isCurrentRun && !isForwardRunSnapshot(currentGoal, savedGoal)) {
            return;
        }

        const committedStep = savedGoal.state.run.stepCount;
        if (isCurrentRun && committedStep < this.lastCommittedStepCount) {
            return;
        }
        this.lastCommittedStepCount = committedStep;

        let lastAction = isCurrentRun ? this.snapshot.lastCommittedAction : undefined;
        let lastObservation = isCurrentRun ? this.snapshot.lastCommittedObservation : undefined;
        const lastStep = savedGoal.state.run.lastStep;
        if (lastStep !== undefined && lastStep.kind === "action") {
            lastAction = {
                toolId: lastStep.action.toolId,
                actionId: lastStep.action.actionId,
            };
            lastObservation = {
                toolId: lastStep.action.toolId,
                status: lastStep.observation.kind,
            };
        } else {
            const pendingAction = savedGoal.state.run.pendingAction;
            if (pendingAction !== undefined && pendingAction.action !== undefined) {
                lastAction = {
                    toolId: pendingAction.action.toolId,
                    actionId: pendingAction.action.actionId,
                };
            }
        }

        const newStep = deriveStepSummary(savedGoal);
        if (newStep !== undefined && !this.committedStepKeys.has(stepKey(savedGoal, newStep))) {
            this.flushActiveStreamBarrier();
            this.committedStepKeys.add(stepKey(savedGoal, newStep));
            this.committedSteps.push(newStep);
            this.timeline.push({
                kind: "step",
                id: `step-${newStep.stepNumber}-${newStep.actionId}`,
                step: newStep,
            });
        }

        const projected = this.toSessionView(savedGoal, undefined, this.snapshot.busy);
        this.setSnapshot({
            ...projected,
            ...(lastAction !== undefined ? { lastCommittedAction: lastAction } : {}),
            ...(lastObservation !== undefined ? { lastCommittedObservation: lastObservation } : {}),
        });
    }

    /**
     * 设置当前会话的沙箱资源清理状态。
     *
     * @param cleaning - 是否处于清理阶段。
     *
     * @example
     * ```ts
     * controller.setCleaning(true);
     * ```
     */
    setCleaning(cleaning: boolean): void {
        if (this.snapshot.screen === "session") {
            this.setSnapshot({
                ...this.snapshot,
                cleaning,
            });
        }
    }

    /** 打开模型选择界面，并在当前 Provider 范围内异步获取模型目录。 */
    openModelSelector(): void {
        let origin: UiModelSelectOrigin;
        let currentModelId: string;
        let goal: Goal | undefined;

        if (this.snapshot.screen === "intent_input") {
            origin = "intent";
            currentModelId = this.selectedModelId
                ?? this.dependencies.defaultModelId
                ?? this.dependencies.llmConfig?.model
                ?? "unknown";
        } else if (this.snapshot.screen === "session") {
            const waitingFor = this.snapshot.waitingFor;
            if (waitingFor === "ask_user") origin = "ask_user";
            else if (waitingFor === "task_approval") origin = "task_approval";
            else if (waitingFor === "blocked") origin = "blocked";
            else {
                this.setError({ code: "MODEL_SWITCH_NOT_ALLOWED", message: "Model switching is only allowed at a text waiting point" });
                return;
            }
            goal = this.snapshot.goal;
            currentModelId = goal.state.modelSelection?.modelId
                ?? this.dependencies.defaultModelId
                ?? "unknown";
        } else {
            this.setError({ code: "MODEL_SWITCH_NOT_ALLOWED", message: "Model switching is not allowed on the current screen" });
            return;
        }

        this.previousSnapshotBeforeModelSelect = this.snapshot;
        const generation = ++this.modelCatalogGeneration;
        this.modelCatalogAbortController?.abort();
        const abortController = new AbortController();
        this.modelCatalogAbortController = abortController;
        this.setSnapshot({
            screen: "model_select",
            busy: false,
            origin,
            ...(goal === undefined ? {} : { goal }),
            currentModelId,
            state: { status: "loading", generation },
        });
        void this.fetchModelCatalog(generation, abortController.signal);
    }

    private async fetchModelCatalog(generation: number, signal: AbortSignal): Promise<void> {
        if (this.dependencies.modelCatalog === undefined) {
            if (this.modelCatalogGeneration !== generation || signal.aborted || this.snapshot.screen !== "model_select") return;
            const id = this.snapshot.currentModelId;
            const fallback: LlmModelDescriptor = {
                provider: this.dependencies.llmConfig?.provider ?? "openai",
                id,
                displayName: id,
                contextWindowTokens: 128_000,
                maxOutputTokens: 4096,
                availabilitySource: "configured",
                metadataSource: "configured",
                selectable: true,
            };
            this.setSnapshot({ ...this.snapshot, state: { status: "list", generation, models: [fallback] } });
            return;
        }

        try {
            const currentModelId = this.snapshot.screen === "model_select" ? this.snapshot.currentModelId : "default";
            const defaultSelection = this.dependencies.defaultModelSelection;
            const config: LlmConfig = this.dependencies.llmConfig ?? {
                provider: (defaultSelection?.provider ?? "openai") as LlmConfig["provider"],
                model: currentModelId,
                apiKey: "",
                structuredOutputMode: defaultSelection?.structuredOutputMode ?? "strict",
            } as LlmConfig;
            const currentSelection = this.snapshot.screen === "model_select"
                ? this.snapshot.goal?.state.modelSelection
                : undefined;
            const requireTokenCapacity = (currentSelection ?? defaultSelection)?.inputEstimator.kind === "token-encoding";
            const models = await this.dependencies.modelCatalog.list(config, { signal, requireTokenCapacity });
            if (signal.aborted || this.modelCatalogGeneration !== generation || this.snapshot.screen !== "model_select") return;
            this.setSnapshot({ ...this.snapshot, state: { status: "list", generation, models } });
        } catch (error: unknown) {
            if (signal.aborted || this.modelCatalogGeneration !== generation || this.snapshot.screen !== "model_select") return;
            this.setSnapshot({ ...this.snapshot, state: { status: "error", generation, error: toUiError(error) } });
        }
    }

    /** 取消模型选择并恢复原页面。 */
    cancelModelSelect(): void {
        if (this.snapshot.screen !== "model_select") return;
        this.modelCatalogAbortController?.abort();
        this.modelCatalogAbortController = undefined;
        this.modelCatalogGeneration += 1;
        this.restoreOriginView({ kind: "info", message: "Model selection cancelled." });
    }

    private async selectModel(model: LlmModelDescriptor): Promise<void> {
        if (this.snapshot.screen !== "model_select") return;
        if (!model.selectable) {
            this.setSnapshot({ ...this.snapshot, error: { code: "MODEL_NOT_SELECTABLE", message: model.unavailableReason ?? "This model is not selectable." } });
            return;
        }
        if (model.id === this.snapshot.currentModelId) {
            this.restoreOriginView({ kind: "info", message: `Current model kept: ${model.displayName || model.id}.` });
            return;
        }

        const currentGoal = this.snapshot.goal;
        if (this.dependencies.modelSwitcher !== undefined) {
            const result = await this.dependencies.modelSwitcher.switchModel({
                ...(currentGoal === undefined ? {} : { goal: currentGoal }),
                targetModel: model,
            });
            if (!result.ok) {
                this.setSnapshot({ ...this.snapshot, error: result.error });
                return;
            }
            if (result.goal !== undefined && this.previousSnapshotBeforeModelSelect?.screen === "session") {
                this.previousSnapshotBeforeModelSelect = this.toSessionView(result.goal, undefined, false);
            }
        }
        if (currentGoal === undefined) this.selectedModelId = model.id;
        this.restoreOriginView({ kind: "info", message: `Model switched to ${model.displayName || model.id}.` });
    }

    private restoreOriginView(notice?: UiNotice): void {
        const previous = this.previousSnapshotBeforeModelSelect;
        this.previousSnapshotBeforeModelSelect = undefined;
        if (previous !== undefined) {
            const { error: _error, ...rest } = previous as UiViewModel & { readonly error?: UiError };
            this.setSnapshot({ ...rest, busy: false, ...(notice === undefined ? {} : { notice }) } as UiViewModel);
            return;
        }
        this.setSnapshot({ screen: "intent_input", busy: false, ...(notice === undefined ? {} : { notice }) });
    }

    private setBusy(busy: boolean, clearError = false): void {
        const current = this.snapshot;

        switch (current.screen) {
            case "home":
                this.setSnapshot(clearError
                    ? { screen: "home", busy, ...(current.environmentSummary !== undefined ? { environmentSummary: current.environmentSummary } : {}) }
                    : { ...current, busy });
                return;
            case "settings":
                this.setSnapshot(clearError
                    ? { screen: "settings", busy, settings: current.settings }
                    : { ...current, busy });
                return;
            case "inspector":
                this.setSnapshot(clearError
                    ? {
                        screen: "inspector",
                        busy,
                        goalId: current.goalId,
                        currentStepIndex: current.currentStepIndex,
                        totalSteps: current.totalSteps,
                        steps: current.steps,
                        showReasoning: current.showReasoning,
                    }
                    : { ...current, busy });
                return;
            case "intent_input":
                this.setSnapshot(clearError
                    ? { screen: "intent_input", busy }
                    : { ...current, busy });
                return;
            case "goal_select":
                this.setSnapshot(clearError
                    ? {
                        screen: "goal_select",
                        busy,
                        goals: current.goals,
                        ...(current.mode !== undefined ? { mode: current.mode } : {}),
                    }
                    : { ...current, busy });
                return;
            case "session": {
                if (clearError) {
                    const { error: _error, ...withoutError } = current;
                    this.setSnapshot({ ...withoutError, busy });
                } else {
                    this.setSnapshot({ ...current, busy });
                }
                return;
            }
            case "tool_permissions": {
                if (clearError) {
                    const { error: _error, ...withoutError } = current;
                    this.setSnapshot({ ...withoutError, busy });
                } else this.setSnapshot({ ...current, busy });
                return;
            }
            case "tool_permissions": {
                if (clearError) {
                    const { error: _error, ...withoutError } = current;
                    this.setSnapshot({ ...withoutError, busy });
                } else this.setSnapshot({ ...current, busy });
                return;
            }
            case "model_select":
                if (clearError) {
                    const { error: _error, ...withoutError } = current;
                    this.setSnapshot({ ...withoutError, busy });
                } else {
                    this.setSnapshot({ ...current, busy });
                }
                return;
            case "shutting_down":
                if (clearError) {
                    const { error: _error, ...withoutError } = current;
                    this.setSnapshot({ ...withoutError, busy });
                } else {
                    this.setSnapshot({ ...current, busy });
                }
                return;
        }
    }

    private setGoalSelectError(
        error: UiError,
        goals: readonly GoalCatalogEntry[] =
            this.snapshot.screen === "goal_select" ? this.snapshot.goals : [],
    ): void {
        const mode = this.snapshot.screen === "goal_select" ? this.snapshot.mode : undefined;
        this.setSnapshot({
            screen: "goal_select",
            busy: false,
            goals,
            error,
            ...(mode !== undefined ? { mode } : {}),
        });
    }

    private setError(error: UiError): void {
        switch (this.snapshot.screen) {
            case "home":
                this.setSnapshot({ ...this.snapshot, busy: false, error });
                return;
            case "settings":
                this.setSnapshot({ ...this.snapshot, busy: false, error });
                return;
            case "inspector":
                this.setSnapshot({ ...this.snapshot, busy: false, error });
                return;
            case "intent_input":
                this.setSnapshot({ screen: "intent_input", busy: false, error });
                return;
            case "goal_select":
                this.setSnapshot({
                    ...this.snapshot,
                    busy: false,
                    error,
                });
                return;
            case "session":
                this.setSnapshot({ ...this.snapshot, busy: false, error });
                return;
            case "tool_permissions":
                this.setSnapshot({ ...this.snapshot, busy: false, error });
                return;
            case "tool_permissions":
                this.setSnapshot({ ...this.snapshot, busy: false, error });
                return;
            case "model_select":
                this.setSnapshot({ ...this.snapshot, busy: false, error });
                return;
            case "shutting_down":
                this.setSnapshot({ ...this.snapshot, busy: false, error });
                return;
        }
    }

    private setSnapshot(snapshot: UiViewModel): void {
        if (this.shuttingDown && snapshot.screen !== "shutting_down") {
            return;
        }

        this.snapshot = snapshot;
        if (snapshot.screen === "session") {
            void this.refreshToolGrants(snapshot.goal);
        }
        for (const subscriber of this.subscribers) {
            subscriber();
        }
    }

    private async fetchGrantSummaries(ref: { readonly goalId: string; readonly runId: string }): Promise<readonly UiToolGrantSummary[]> {
        const coordinator = this.dependencies.coordinator;
        if (coordinator.listGrants !== undefined) {
            const grants = await coordinator.listGrants(ref);
            return grants.map(toUiUnifiedGrantSummary);
        }
        if (coordinator.listToolGrants !== undefined) {
            const grants = await coordinator.listToolGrants(ref);
            return grants.map(toUiToolGrantSummary);
        }
        return [];
    }

    private async refreshToolGrants(goal: Goal): Promise<void> {
        const coordinator = this.dependencies.coordinator;
        if (coordinator.listGrants === undefined && coordinator.listToolGrants === undefined) return;
        const ref = { goalId: goal.id, runId: goal.state.run.id };
        const key = `${ref.goalId}\0${ref.runId}`;
        if (this.grantsRunKey === key) return;
        this.grantsRunKey = key;
        try {
            const summaries = await this.fetchGrantSummaries(ref);
            if (this.snapshot.screen !== "session"
                || this.snapshot.goal.id !== ref.goalId
                || this.snapshot.goal.state.run.id !== ref.runId) return;
            this.setSnapshot({
                ...this.snapshot,
                toolGrants: summaries,
            });
        } catch (error: unknown) {
            if (this.snapshot.screen !== "session"
                || this.snapshot.goal.id !== ref.goalId
                || this.snapshot.goal.state.run.id !== ref.runId) return;
            this.setSnapshot({
                ...this.snapshot,
                toolGrantError: toUiError(error),
            });
        }
    }

    private async revokeToolGrant(grantId: string, scope: "goal" | "workspace", kind: "tool" | "sandbox" = "tool"): Promise<void> {
        if (this.snapshot.screen !== "tool_permissions") return;
        const coordinator = this.dependencies.coordinator;
        if (coordinator.revokeGrant === undefined && coordinator.revokeToolGrant === undefined) {
            this.setError({ code: "TOOL_GRANTS_UNAVAILABLE", message: "Tool permissions are unavailable" });
            return;
        }
        const current = this.snapshot;
        const goal = current.goal;
        const ref = { goalId: goal.id, runId: goal.state.run.id };
        try {
            if (coordinator.revokeGrant !== undefined) {
                await coordinator.revokeGrant({ ref, kind, grantId });
            } else {
                await coordinator.revokeToolGrant!({ ref, grantId, scope });
            }
            const summaries = await this.fetchGrantSummaries(ref);
            const session = { ...current.session, toolGrants: summaries };
            this.setSnapshot({ ...current, session, grants: summaries, busy: false });
        } catch (error: unknown) {
            this.setError(toUiError(error));
        }
    }

    private async openToolPermissions(): Promise<void> {
        if (this.snapshot.screen !== "session") return;
        const session = this.snapshot;
        const coordinator = this.dependencies.coordinator;
        if (coordinator.listGrants === undefined && coordinator.listToolGrants === undefined) {
            this.setSnapshot({
                screen: "tool_permissions",
                busy: true,
                goal: session.goal,
                grants: [],
                session,
                error: { code: "TOOL_GRANTS_UNAVAILABLE", message: "Tool permissions are unavailable" },
            });
            return;
        }
        const ref = { goalId: session.goal.id, runId: session.goal.state.run.id };
        try {
            const summaries = await this.fetchGrantSummaries(ref);
            this.setSnapshot({
                screen: "tool_permissions",
                busy: true,
                goal: session.goal,
                grants: summaries,
                session: { ...session, toolGrants: summaries },
            });
        } catch (error: unknown) {
            this.setSnapshot({
                screen: "tool_permissions",
                busy: true,
                goal: session.goal,
                grants: [],
                session,
                error: toUiError(error),
            });
        }
    }
}

function toUiUnifiedGrantSummary(grant: UnifiedGrantSummary): UiToolGrantSummary {
    if (grant.kind === "sandbox") {
        return {
            grantId: grant.id,
            scope: grant.scope,
            toolId: "bash",
            status: grant.status,
            kind: "sandbox",
            command: grant.command,
            network: grant.network,
        };
    }
    return {
        grantId: grant.id,
        scope: grant.scope,
        toolId: grant.toolId,
        status: grant.status,
        kind: "tool",
        ...(grant.targetPath !== undefined ? { targetPath: grant.targetPath } : {}),
    };
}

function toUiToolGrantSummary(grant: import("../../runtime/src/index").ToolGrant): UiToolGrantSummary {
    return {
        grantId: grant.id,
        scope: grant.scope,
        toolId: grant.matcher.toolId,
        status: grant.status,
        ...(grant.matcher.kind === "target_path" ? { targetPath: grant.matcher.path } : {}),
    };
}

function isExecutionPayloadRecord(
    value: ExecutionStreamEvent["payload"],
): value is { readonly [key: string]: StreamJsonValue } {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateUserAction(
    action: Parameters<
        SessionControllerDependencies["coordinator"]["resume"]
    >[0]["action"],
): UiError | undefined {
    switch (action.kind) {
        case "message":
            return action.content.trim().length === 0
                ? {
                    code: "INVALID_GOAL_INPUT",
                    message: "Message must not be empty",
                }
                : undefined;
        case "approve":
            return undefined;
        case "approve_action":
            return action.actionId.trim().length === 0
                ? {
                    code: "INVALID_ACTION_ID",
                    message: "Action ID must not be empty",
                }
                : undefined;
        case "reject_action":
            if (action.actionId.trim().length === 0) {
                return {
                    code: "INVALID_ACTION_ID",
                    message: "Action ID must not be empty",
                };
            }
            return action.reason.trim().length === 0
                ? {
                    code: "INVALID_REJECTION_REASON",
                    message: "Rejection reason must not be empty",
                }
                : undefined;
    }
}

function toUiError(error: unknown): UiError {
    if (typeof error === "object" && error !== null) {
        const candidate = error as {
            readonly code?: unknown;
            readonly message?: unknown;
        };
        if (
            typeof candidate.code === "string"
            && typeof candidate.message === "string"
        ) {
            return { code: candidate.code, message: candidate.message };
        }
    }

    if (error instanceof Error) {
        return { code: "INTERNAL_ERROR", message: error.message };
    }

    return {
        code: "INTERNAL_ERROR",
        message: "The session controller failed unexpectedly",
    };
}

function deriveWaitingFor(goal: Goal): WaitingProgress["waitingFor"] | undefined {
    if (goal.state.run.status !== "waiting") {
        return undefined;
    }

    const interaction = goal.state.run.pendingInteraction;
    if (interaction !== undefined) {
        if (interaction.kind === "ask_user") {
            return "ask_user";
        }
        if (interaction.kind === "task_approval") {
            return "task_approval";
        }
    }

    switch (goal.state.run.pendingAction?.status) {
        case "awaiting_approval":
            return "action_approval";
        case "outcome_unknown":
            return "action_recovery";
        default:
            return "blocked";
    }
}

function deriveProposal(goal: Goal): GoalTask | undefined {
    const interaction = goal.state.run.pendingInteraction;
    if (interaction?.kind === "task_approval") {
        return interaction.proposal;
    }
    return goal.state.run.approvedTask;
}

function deriveBlockedReason(goal: Goal): string | undefined {
    const lastStep = goal.state.run.lastStep;

    if (lastStep?.kind === "decision" && lastStep.result.kind === "wait") {
        return lastStep.result.reason;
    }

    return undefined;
}

function deriveTerminalSummary(goal: Goal): UiTerminalSummary | undefined {
    const status = goal.state.run.status;
    if (status !== "completed" && status !== "failed" && status !== "cancelled") {
        return undefined;
    }

    let summary: string | undefined;
    let reason: string | undefined;
    const lastStep = goal.state.run.lastStep;

    if (lastStep?.kind === "decision") {
        if (lastStep.result.kind === "complete") {
            summary = lastStep.result.summary;
        } else if (lastStep.result.kind === "fail") {
            reason = lastStep.result.error;
        }
    }

    if (goal.state.run.stopReason?.kind === "max_steps_exceeded") {
        reason = "Maximum step limit exceeded";
    } else if (goal.state.run.stopReason?.kind === "execution_error") {
        reason = goal.state.run.stopReason.message;
    } else if (status === "cancelled" && reason === undefined) {
        reason = "Run cancelled";
    }

    return {
        status,
        ...(summary === undefined ? {} : { summary }),
        ...(reason === undefined ? {} : { reason }),
    };
}

function summarizeInput(input: unknown): string | undefined {
    if (input === undefined || input === null) return undefined;
    if (typeof input === "object") {
        const record = input as Record<string, unknown>;
        for (const key of ["command", "path", "query"]) {
            if (typeof record[key] === "string") return record[key].trim();
        }
        try {
            return JSON.stringify(input);
        } catch {
            return undefined;
        }
    }
    return String(input);
}

function deriveStepSummary(goal: Goal): UiStepSummary | undefined {
    const lastStep = goal.state.run.lastStep;
    if (lastStep === undefined || lastStep.kind !== "action") return undefined;
    const observation = lastStep.observation;
    const inputSummary = summarizeInput(lastStep.action.input);
    return {
        stepNumber: goal.state.run.stepCount,
        toolId: lastStep.action.toolId,
        actionId: lastStep.action.actionId,
        status: observation.kind === "success" ? "success" : "failure",
        ...(inputSummary === undefined ? {} : { inputSummary }),
        ...(observation.kind === "success"
            ? { outputSummary: observation.summary }
            : observation.kind === "failure"
                ? { outputSummary: observation.message }
                : { outputSummary: observation.reason }),
    };
}

function stepKey(goal: Goal, step: UiStepSummary): string {
    return `${goal.id}:${goal.state.run.id}:${step.stepNumber}`;
}

function isForwardRunSnapshot(current: Goal, candidate: Goal): boolean {
    if (candidate.state.run.id === current.state.run.id) {
        return false;
    }
    if (candidate.state.messages.length <= current.state.messages.length) {
        return false;
    }
    return (candidate.state.completedRuns ?? []).some((record) =>
        record.runId === current.state.run.id
        && record.messageRange.end <= candidate.state.messages.length,
    );
}
