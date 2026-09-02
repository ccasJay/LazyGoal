import type {
    Goal,
    GoalCatalogEntry,
    GoalProgressResult,
    GoalTask,
    LaunchResult,
} from "../../runtime/src/index";
import {
    UI_BUSY_CODE,
    UI_SHUTTING_DOWN_CODE,
    UiDispatchRejectedError,
    type SessionControllerDependencies,
    type UiCommand,
    type UiError,
    type UiSessionViewModel,
    type UiSubscriber,
    type UiTerminalSummary,
    type UiViewModel,
} from "./types";

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
 * 最新 Goal 转换成不可变 ViewModel。一次调用未完成前，后续 dispatch 会以
 * `UI_BUSY` 拒绝；业务错误会保留当前 Goal/最近快照并显示稳定错误。
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
    private snapshot: UiViewModel = {
        screen: "intent_input",
        busy: false,
    };
    private readonly subscribers = new Set<UiSubscriber>();

    /** @param dependencies - Launcher、Coordinator、Store、Catalog 与身份依赖。 */
    constructor(dependencies: SessionControllerDependencies) {
        this.dependencies = dependencies;
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
        const goal = this.snapshot.screen === "session"
            ? structuredClone(this.snapshot.goal)
            : undefined;

        this.setSnapshot({
            screen: "shutting_down",
            busy: true,
            ...(goal === undefined ? {} : { goal }),
        });
    }

    /**
     * 串行处理一个 UI 命令。
     *
     * @param command - 不携带运行时状态的用户意图。
     * @returns 命令处理完成；业务失败会体现在 ViewModel.error 中。
     * @throws `UiDispatchRejectedError` 表示已有命令执行中或 Controller 正在关闭。
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

        if (this.snapshot.busy) {
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
                await this.resumeSession({
                    kind: "message",
                    content: command.content,
                });
                return;
            case "approveTask":
                await this.resumeSession({ kind: "approve" });
                return;
            case "retryPreparation":
                await this.retryPreparation();
                return;
            case "approveAction":
                await this.resumeSession({
                    kind: "approve_action",
                    actionId: command.actionId,
                });
                return;
            case "rejectAction":
                await this.resumeSession({
                    kind: "reject_action",
                    actionId: command.actionId,
                    reason: command.reason,
                });
                return;
        }
    }

    private async createGoal(intent: string): Promise<void> {
        if (this.snapshot.screen !== "intent_input") {
            this.setError({
                code: "CREATE_NOT_ALLOWED",
                message: "A Goal can only be created from the intent screen",
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
            ...(this.dependencies.maxSteps === undefined
                ? {}
                : { maxSteps: this.dependencies.maxSteps }),
        };
        let result: LaunchResult;
        try {
            result = await this.dependencies.launcher.launch(
                request,
                this.dependencies.control,
            );
        } catch (error: unknown) {
            const savedGoal = await this.restoreAfterLaunchFailure(request.goalId);
            if (savedGoal !== undefined) {
                this.setSnapshot(this.toSessionView(savedGoal, undefined, false));
                this.setError(toUiError(error));
                return;
            }
            throw error;
        }

        if (!result.ok) {
            const savedGoal = await this.restoreAfterLaunchFailure(request.goalId);
            if (savedGoal !== undefined) {
                this.setSnapshot(this.toSessionView(savedGoal, undefined, false));
                this.setError(result.error);
                return;
            }
        }

        this.applyProgress(result);
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

    private async listResumableIntoGoalSelect(): Promise<GoalCatalogEntry[] | undefined> {
        if (this.snapshot.screen === "session") {
            this.setError({
                code: "SESSION_ACTIVE",
                message: "A Goal session is already active",
            });
            return undefined;
        }

        let goals: readonly GoalCatalogEntry[];
        try {
            goals = await this.dependencies.catalog.listResumable();
        } catch (error: unknown) {
            this.setGoalSelectError(toUiError(error));
            return undefined;
        }

        const entries = goals.map((entry) => ({ ...entry }));
        this.setSnapshot({
            screen: "goal_select",
            busy: true,
            goals: entries,
        });

        if (entries.length === 0) {
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

        this.setSnapshot(this.toSessionView(goal, undefined, true));
        const result = await this.dependencies.coordinator.advance(
            { goalId: goal.id, runId: goal.state.run.id },
            this.dependencies.control,
        );
        this.applyProgress(result);
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
        this.applyProgress(result);
    }

    /**
     * 重新推进一个停滞在 Preparation 中间态的当前 Goal Session。
     *
     * @remarks
     * 只依赖内存中最新的 Session 快照，不再从 Store 恢复：进入本方法前页面
     * 已处于 `session`，快照即代表用户当前正在观察的 Goal。推进等价于对
     * 最新快照再执行一次 `advance()`，由 Runtime 重跑 preparation executor。
     * 该方法本身不写入快照，也不改变 Runtime 的状态转换语义；成功与失败
     * 都通过 `applyProgress` 反映到 ViewModel。
     *
     * @returns 推进完成；无活动 Session 时写入 `NO_ACTIVE_SESSION` 业务错误。
     * @throws Coordinator 或 Store 失败时传播原始异常，由 `dispatch` 统一转换。
     * @example
     * ```ts
     * await controller.dispatch({ kind: "retryPreparation" });
     * ```
     */
    private async retryPreparation(): Promise<void> {
        if (this.snapshot.screen !== "session") {
            this.setError({
                code: "NO_ACTIVE_SESSION",
                message: "There is no active Goal session",
            });
            return;
        }

        const goal = this.snapshot.goal;
        const result = await this.dependencies.coordinator.advance(
            { goalId: goal.id, runId: goal.state.run.id },
            this.dependencies.control,
        );
        this.applyProgress(result);
    }

    private applyProgress(result: ProgressResult): void {
        if (!result.ok) {
            this.setError(result.error);
            return;
        }

        this.setSnapshot(this.toSessionView(result.goal, result, false));
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

    private toSessionView(
        goal: Goal,
        progress: ProgressResult | undefined,
        busy: boolean,
    ): UiSessionViewModel {
        const snapshot = structuredClone(goal);
        const waitingFor = progress?.ok === true && progress.kind === "waiting"
            ? progress.waitingFor
            : deriveWaitingFor(snapshot);
        const question = waitingFor === "question"
            ? deriveQuestion(snapshot)
            : undefined;
        const proposal = waitingFor === "approval"
            ? deriveProposal(snapshot)
            : undefined;
        const blockedReason = waitingFor === "blocked"
            ? deriveBlockedReason(snapshot)
            : undefined;
        const preparationStalled = isStalledPreparation(snapshot, waitingFor);
        const terminal = deriveTerminalSummary(snapshot);

        return {
            screen: "session",
            busy,
            goal: snapshot,
            phase: snapshot.state.workflow.phase,
            runStatus: snapshot.state.run.status,
            stepCount: snapshot.state.run.stepCount,
            messages: snapshot.state.messages,
            ...(waitingFor === undefined ? {} : { waitingFor }),
            ...(preparationStalled ? { preparationStalled } : {}),
            ...(question === undefined ? {} : { question }),
            ...(proposal === undefined ? {} : { proposal }),
            ...(blockedReason === undefined ? {} : { blockedReason }),
            ...(snapshot.state.run.pendingAction === undefined
                ? {}
                : { pendingAction: snapshot.state.run.pendingAction }),
            ...(terminal === undefined ? {} : { terminal }),
        };
    }

    private setBusy(busy: boolean, clearError = false): void {
        const current = this.snapshot;

        switch (current.screen) {
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
        this.setSnapshot({
            screen: "goal_select",
            busy: false,
            goals,
            error,
        });
    }

    private setError(error: UiError): void {
        switch (this.snapshot.screen) {
            case "intent_input":
                this.setSnapshot({ screen: "intent_input", busy: false, error });
                return;
            case "goal_select":
                this.setSnapshot({
                    screen: "goal_select",
                    busy: false,
                    goals: this.snapshot.goals,
                    error,
                });
                return;
            case "session":
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
        for (const subscriber of this.subscribers) {
            subscriber();
        }
    }
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
    const workflow = goal.state.workflow;

    if (
        workflow.phase === "gathering_context"
        && workflow.preparation.status === "waiting_input"
    ) {
        return "question";
    }

    if (
        workflow.phase === "planning"
        && workflow.preparation.status === "waiting_approval"
    ) {
        return "approval";
    }

    if (workflow.phase !== "executing" || goal.state.run.status !== "waiting") {
        return undefined;
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

/**
 * 判断 Goal 的 Preparation 阶段是否停滞在无法自行推进的中间态。
 *
 * @remarks
 * `preparation.status === "active"` 表示一次推进已经开始但尚未产出等待点。
 * 若该瞬时态被持久化为检查点（例如推进被中断或 executor 失败），Goal 既不
 * 在等待用户输入，`resume` 也会被 Runtime 拒绝，用户将无从恢复；本函数用于
 * 识别这种状态并交给 UI 提供重试入口。
 *
 * 领域类型保证 `active` 只出现在 `gathering_context` 与 `planning`，
 * `executing` 阶段的 preparation 恒为 `completed`，因此无需另行排除
 * executing 阶段。
 *
 * 本函数只反映快照自身的事实，不感知是否正在异步推进中：`busy` 是快照上
 * 的活字段，会在推进开始与结束时被原地覆盖，而派生字段不会随之重算，因此
 * 把 `busy` 固化进本函数的结果会让一次推进失败后得到的快照永远停留在
 * 「推进中」。是否展示重试入口由 UI 结合当前 `busy` 实时判断。
 *
 * @param goal - 最新完整 Goal 快照。
 * @param waitingFor - 从同一次推进结果或快照派生的等待点；存在等待点时 Goal
 *   正在等待用户输入，不算停滞。
 * @returns Preparation 阶段开始但未产出等待点时返回 `true`，否则返回 `false`。
 * @example
 * ```ts
 * const stalled = isStalledPreparation(goal, waitingFor);
 * ```
 */
function isStalledPreparation(
    goal: Goal,
    waitingFor: WaitingProgress["waitingFor"] | undefined,
): boolean {
    return waitingFor === undefined
        && goal.state.workflow.preparation.status === "active";
}

function deriveQuestion(goal: Goal): string | undefined {
    for (let index = goal.state.messages.length - 1; index >= 0; index -= 1) {
        const message = goal.state.messages[index];
        if (message?.role === "assistant") {
            return message.content;
        }
    }

    return undefined;
}

function deriveProposal(goal: Goal): GoalTask | undefined {
    const workflow = goal.state.workflow;
    return workflow.phase === "planning"
        && workflow.preparation.status === "waiting_approval"
        ? workflow.preparation.proposal
        : undefined;
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
