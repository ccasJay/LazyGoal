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
                this.setError(toUiError(error));
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
            case "openGoalSelect":
            case "resume":
                await this.openGoalSelect();
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
        if (this.snapshot.screen === "session") {
            this.setError({
                code: "SESSION_ACTIVE",
                message: "A Goal session is already active",
            });
            return;
        }

        let goals: readonly GoalCatalogEntry[];
        try {
            goals = await this.dependencies.catalog.listResumable();
        } catch (error: unknown) {
            this.setGoalSelectError(toUiError(error));
            return;
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
            return;
        }

        const latest = entries[0];
        if (latest === undefined) {
            this.setError({
                code: "NO_RESUMABLE_GOAL",
                message: "No resumable Goal was found",
            });
            return;
        }

        await this.restoreAndAdvance(latest.goalId, entries);
    }

    private async openGoalSelect(): Promise<void> {
        if (this.snapshot.screen === "session") {
            this.setError({
                code: "SESSION_ACTIVE",
                message: "A Goal session is already active",
            });
            return;
        }

        let goals: readonly GoalCatalogEntry[];
        try {
            goals = await this.dependencies.catalog.listResumable();
        } catch (error: unknown) {
            this.setGoalSelectError(toUiError(error));
            return;
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
        }
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
        const terminal = deriveTerminalSummary(snapshot);

        return {
            screen: "session",
            busy,
            goal: snapshot,
            phase: snapshot.state.workflow.phase,
            runStatus: snapshot.state.run.status,
            stepCount: snapshot.state.run.stepCount,
            messages: structuredClone(snapshot.state.messages),
            ...(snapshot.state.run.checkpoint === undefined
                ? {}
                : { checkpoint: snapshot.state.run.checkpoint }),
            ...(waitingFor === undefined ? {} : { waitingFor }),
            ...(question === undefined ? {} : { question }),
            ...(proposal === undefined ? {} : { proposal }),
            ...(blockedReason === undefined ? {} : { blockedReason }),
            ...(snapshot.state.run.pendingAction === undefined
                ? {}
                : { pendingAction: structuredClone(snapshot.state.run.pendingAction) }),
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
            case "fatal":
                this.setSnapshot({ ...current, busy });
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
            goals: structuredClone(goals),
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
            case "fatal":
                this.setSnapshot({ ...this.snapshot, busy: false, error });
                return;
        }
    }

    private setSnapshot(snapshot: UiViewModel): void {
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
        ? structuredClone(workflow.preparation.proposal)
        : undefined;
}

function deriveBlockedReason(goal: Goal): string | undefined {
    const lastStep = goal.state.run.lastStep;

    if (lastStep?.kind === "decision" && lastStep.result.kind === "wait") {
        return lastStep.result.reason;
    }

    if (lastStep?.kind === "legacy" && lastStep.result.kind === "wait") {
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
    } else if (lastStep?.kind === "legacy") {
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
