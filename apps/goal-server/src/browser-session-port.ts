import type { JsonValue } from "../../../packages/contracts/src/index";
import {
    queryGoalMessages,
    readGoalMessageBody,
    projectInteractionView,
    type Goal,
    type GoalModelSelection,
    type SessionMessageQuery,
    type GoalUserAction,
} from "../../../packages/runtime/src/index";
import {
    WorkerExecutionUnavailableError,
    WorkerScheduler,
    allocateGoalWorkspace,
    admitTrigger,
    summarizeTriggerName,
    type RuntimeComposition,
} from "./runtime/index";
import type { GoalTriggerContext } from "../../../packages/runtime/src/domain";
import type { Trigger } from "../../../packages/runtime/src/trigger";
import {
    readBrowserControlSnapshot,
    type BrowserGoalLiveFeed,
    type BrowserGoalSessionPort,
    type BrowserSessionEventsResult,
} from "../../../packages/browser/src/index";
import type {
    BrowserControlSnapshot,
    BrowserCreateSessionCommand,
    BrowserCreateSessionResult,
    BrowserExecutionState,
    BrowserGoalContinuation,
    BrowserGoalEvent,
    BrowserSessionInputCommand,
    BrowserSessionInputQueryResult,
    BrowserSessionInputReceipt,
    BrowserSessionInputResult,
    BrowserSessionInteractionResponse,
} from "../../../packages/web-contracts/src/index";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { TriggerStore } from "../../../packages/storage/src/trigger-store";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";

const EVENT_POLL_INTERVAL_MS = 250;

/**
 * 把 Web 创建与交互端口接到 Supervisor 的 Trigger 队列和 Worker 调度器。
 *
 * @remarks 新 Goal 的创建、取消、结构化回答及已确认 Worker 退出后的恢复均以
 * Trigger 持久化；普通消息、Steer、续聊与队列控制明确返回不支持。读取从 Supervisor
 * 持有的 Goal 快照与已提交消息构造，事件流跨进程轮询提交修订并在重连后重新同步。
 * @param dependencies - 当前宿主的认证外部 Actor ID、模型选择器、Goal Store、Trigger Store、所有权与调度器。
 * @returns 可交给浏览器路由的 Trigger 驱动端口。
 * @example
 * ```ts
 * const session = createTriggerBrowserSessionPort({ externalId: access.externalId, root, owner, triggers, scheduler, goals, resolveModelSelection });
 * ```
 */
export function createTriggerBrowserSessionPort(dependencies: TriggerBrowserSessionPortDependencies): BrowserGoalSessionPort & {
    /** 从同一提交读取当前 Goal 控制状态，Goal 不存在时返回 undefined。 */
    readControlSnapshot(goalId: string): Promise<BrowserControlSnapshot | undefined>;
} {
    const { root, owner, triggers, scheduler, goals } = dependencies;
    const browserActor = { role: "external" as const, externalId: dependencies.externalId };
    const browserPrincipal = { role: "user" as const, externalId: dependencies.externalId, mayCreateGoal: true, goalIds: [] as readonly string[] };
    const isShuttingDown = (): boolean => root.abortController.signal.aborted;
    const executionOwner = (goalId: string): boolean => scheduler.assignments().some((assignment) => assignment.goalId === goalId);
    const executionState = (goalId: string): BrowserExecutionState => {
        if (triggers.workerRecovery(goalId)?.status === "pending") return "recoverable";
        const queued = triggers.queueRecord(goalId);
        if (executionOwner(goalId) || queued?.status === "queued" || queued?.status === "claimed" || queued?.status === "waiting") return "active";
        return "inactive";
    };
    const continuationState = (goal: Goal): BrowserGoalContinuation => {
        const triggerId = goal.definition.triggerContext?.triggerId;
        if (triggerId === undefined || triggers.goalOrigin(triggerId) !== "web-manual") {
            return { available: false, reason: "not_web_created" };
        }
        const status = goal.state.run.status;
        if (status !== "completed" && status !== "failed" && status !== "cancelled") {
            return { available: false, reason: "run_not_terminal" };
        }
        const settled = triggers.queueRecord(goal.id)?.status === "terminal"
            && triggers.workerRecovery(goal.id)?.status !== "pending";
        return settled ? { available: true } : { available: false, reason: "run_settling" };
    };

    async function readSnapshot(goalId: string): Promise<BrowserControlSnapshot | undefined> {
        const snapshot = await readBrowserControlSnapshot(
            goalId,
            goals,
            () => executionOwner(goalId),
            (goal) => ({ continuation: continuationState(goal) }),
        );
        if (snapshot === undefined) return undefined;
        return {
            goal: {
                ...snapshot.goal,
                execution: {
                    state: executionState(goalId),
                    committedThroughSequence: snapshot.goal.execution?.committedThroughSequence ?? 0,
                },
            },
            session: {
                ...snapshot.session,
                needsRecovery: !snapshot.session.executionOwner && triggers.workerRecovery(goalId)?.status === "pending",
            },
        };
    }

    function toReceipt(
        trigger: Trigger,
        triggerStore: TriggerStore,
        goalId: string,
        kind: BrowserSessionInputReceipt["kind"],
        sequence: number,
        admittedAtRevision: number,
        targetRunId?: string,
        appliedRunId?: string,
    ): BrowserSessionInputReceipt {
        const routeStatus = triggerStore.routeStatus(trigger.id);
        if (routeStatus === undefined) throw new Error("Stored Trigger route state is unavailable");
        const status: BrowserSessionInputReceipt["status"] = routeStatus === "unrouted" ? "pending"
            : kind === "message" && triggerStore.queuedGoalForTrigger(trigger.id) === undefined ? "cleared" : "applied";
        return {
            goalId,
            inputId: trigger.id,
            kind,
            sequence,
            status,
            admittedAtRevision,
            ...(targetRunId === undefined ? {} : { targetRunId }),
            ...(appliedRunId === undefined ? {} : { appliedRunId }),
        };
    }


    async function submit(goalId: string, input: BrowserSessionInputCommand): Promise<BrowserSessionInputResult> {
        if (isShuttingDown()) return { ok: false, error: "session_unavailable" };
        if (triggers.read(input.inputId) !== undefined) {
            const existing = existingMessageReceipt(goalId, input);
            return existing ?? { ok: false, error: "INPUT_CONFLICT" };
        }
        const kind = input.kind;
        const admittedAtRevision = input.kind === "resume" ? input.commitRevision : 0;

        if (input.kind === "interrupt") {
            const trigger: Trigger = {
                id: input.inputId,
                name: "Cancel Goal run",
                type: "instruction",
                source: browserActor,
                target: "worker",
                goalId,
                payload: { action: "cancel", runId: input.runId },
                sentAt: triggerSentAt(triggers, input.inputId),
            };

            const principal = { ...browserPrincipal, goalIds: [goalId] } as const;
            try {
                await scheduler.handleCancelTrigger(trigger, principal);
                await scheduler.pump();
            } catch (error) {
                if (isTriggerIdentityConflict(error)) return { ok: false, error: "INPUT_CONFLICT" };
                return { ok: false, error: isShuttingDown() ? "session_unavailable" : "RUN_CONTROL_UNAVAILABLE" };
            }
            const saved = triggers.read(input.inputId);
            if (saved === undefined) return { ok: false, error: "input_admission_failed" };
            const goal = await goals.restore(goalId);
            return { ok: true, existing: false, receipt: toReceipt(saved, triggers, goalId, kind,
                requiredTriggerSequence(triggers, input.inputId), 0, input.runId, goal?.state.run.id) };
        }

        if (input.kind === "respond") {
            const goal = await goals.restore(goalId);
            if (goal === undefined) return { ok: false, error: "GOAL_NOT_FOUND" };
            const answer = toGoalUserAction(input.response, input.requestId, input.inputId);

            const interaction = projectInteractionView(goal);
            const queue = triggers.queueRecord(goalId);
            if (goal.state.run.status !== "waiting" || goal.state.run.id !== input.runId
                || interaction === undefined || !sameInteractionTarget(goal, input.requestId)
                || queue?.workerId === undefined || queue.generation === undefined) {
                return { ok: false, error: "INTERACTION_MISMATCH" };
            }
            const commitRevision = goal.state.commitRevision ?? 0;
            const pendingActionId = goal.state.run.pendingAction?.action.actionId;
            const permissionRequest = pendingActionId === undefined ? undefined
                : scheduler.actionPermissionStatuses(goalId).find((item) => item.pending && item.request.actionId === pendingActionId);
            const replyTo = permissionRequest?.request.requestId ?? goal.definition.triggerContext?.triggerId;
            if (replyTo === undefined) return { ok: false, error: "INTERACTION_MISMATCH" };
            const trigger: Trigger = {
                id: input.inputId,
                name: "Answer Goal interaction",
                type: "interaction",
                source: browserActor,
                target: "worker",
                goalId,
                replyTo,
                payload: { action: "answered", answer },
                sentAt: triggerSentAt(triggers, input.inputId),
            };
            try {
                await scheduler.handleInteractionTrigger(trigger, { ...browserPrincipal, goalIds: [goalId] });
            } catch (error) {
                if (isTriggerIdentityConflict(error)) return { ok: false, error: "INPUT_CONFLICT" };
                return { ok: false, error: isShuttingDown() ? "session_unavailable" : "INTERACTION_MISMATCH" };
            }
            const saved = triggers.read(input.inputId);
            if (saved === undefined) return { ok: false, error: "input_admission_failed" };
            if (triggers.routeStatus(saved.id) === "unrouted") return { ok: false, error: "INTERACTION_MISMATCH" };
            const current = await goals.restore(goalId);
            return { ok: true, existing: false, receipt: toReceipt(saved, triggers, goalId, kind,
                requiredTriggerSequence(triggers, input.inputId), commitRevision, input.runId, current?.state.run.id) };
        }

        if (input.kind === "resume") {
            const goal = await goals.restore(goalId);
            const recovery = triggers.workerRecovery(goalId);
            if (goal === undefined) return { ok: false, error: "GOAL_NOT_FOUND" };
            if (recovery === undefined || goal.state.run.id !== input.runId
                || (goal.state.commitRevision ?? 0) !== input.commitRevision) {
                return { ok: false, error: "RUN_CONTROL_UNAVAILABLE" };
            }
            const lifecycle = triggers.read(recovery.lifecycleTriggerId);
            if (lifecycle === undefined) return { ok: false, error: "RUN_CONTROL_UNAVAILABLE" };
            const trigger: Trigger = {
                id: input.inputId,
                name: "Resume Goal checkpoint",
                type: "instruction",
                source: browserActor,
                target: "supervisor",
                goalId,
                replyTo: lifecycle.id,
                payload: { action: "resume", runId: input.runId, acknowledgeUnknownEffects: input.acknowledgeUnknownEffects === true },
                sentAt: triggerSentAt(triggers, input.inputId),
            };

            if (recovery.status !== "pending") return { ok: false, error: "RUN_CONTROL_UNAVAILABLE" };
            try {
                await scheduler.handleWorkerRecoveryTrigger(trigger, { ...browserPrincipal, goalIds: [goalId] });
                await scheduler.pump();
            } catch (error) {
                if (isTriggerIdentityConflict(error)) return { ok: false, error: "INPUT_CONFLICT" };
                return { ok: false, error: isShuttingDown() ? "session_unavailable" : "RUN_CONTROL_UNAVAILABLE" };
            }
            const saved = triggers.read(input.inputId);
            if (saved === undefined) return { ok: false, error: "input_admission_failed" };
            const current = await goals.restore(goalId);
            return { ok: true, existing: false, receipt: toReceipt(saved, triggers, goalId, kind,
                requiredTriggerSequence(triggers, input.inputId), admittedAtRevision, input.runId, current?.state.run.id) };
        }

        if (input.kind === "message") {
            const goal = await goals.restore(goalId);
            if (goal === undefined) return { ok: false, error: "GOAL_NOT_FOUND" };
            if (input.content.trim().length === 0) return { ok: false, error: "INVALID_INPUT" };
            if (!continuationState(goal).available) return { ok: false, error: "CONTINUATION_UNAVAILABLE" };
            if (goal.state.run.id !== input.runId) return { ok: false, error: "RUN_NOT_FOUND" };
            const replyTo = latestTerminalResponse(goalId, input.runId);
            if (replyTo === undefined) return { ok: false, error: "CONTINUATION_UNAVAILABLE" };
            const trigger: Trigger = {
                id: input.inputId,
                name: "Continue goal",
                type: "instruction",
                source: browserActor,
                target: "supervisor",
                goalId,
                replyTo,
                payload: { action: "continue", runId: input.runId, content: input.content },
                sentAt: triggerSentAt(triggers, input.inputId),
            };
            let result;
            try {
                result = await scheduler.handleContinueTrigger(trigger, { ...browserPrincipal, goalIds: [goalId] });
            } catch (error) {
                if (isTriggerIdentityConflict(error)) return { ok: false, error: "INPUT_CONFLICT" };
                return { ok: false, error: isShuttingDown() ? "session_unavailable" : "CONTINUATION_UNAVAILABLE" };
            }
            if (result.kind === "rejected") {
                return { ok: false, error: result.code === "INVALID_GOAL_INPUT" ? "INVALID_INPUT" : "CONTINUATION_UNAVAILABLE" };
            }
            const saved = triggers.read(input.inputId);
            if (saved === undefined) return { ok: false, error: "input_admission_failed" };
            return { ok: true, existing: false, receipt: toReceipt(saved, triggers, goalId, "message",
                requiredTriggerSequence(triggers, input.inputId), 0, input.runId, result.runId) };
        }

        return { ok: false, error: "RUN_CONTROL_UNAVAILABLE" };
    }

    function existingMessageReceipt(goalId: string, input: BrowserSessionInputCommand): BrowserSessionInputResult | undefined {
        if (input.kind !== "message") return undefined;
        const stored = triggers.read(input.inputId);
        if (stored === undefined || stored.type !== "instruction" || stored.payload.action !== "continue"
            || !("goalId" in stored) || stored.goalId !== goalId
            || stored.payload.runId !== input.runId || stored.payload.content !== input.content) {
            return undefined;
        }
        const appliedRunId = triggers.continuationForTrigger(stored.id)?.appliedRunId;
        return {
            ok: true,
            existing: true,
            receipt: toReceipt(stored, triggers, goalId, "message", requiredTriggerSequence(triggers, stored.id), 0,
                input.runId, appliedRunId),
        };
    }

    function latestTerminalResponse(goalId: string, runId: string): string | undefined {
        const candidates = triggers.listGoalTriggers(goalId).filter((trigger) => trigger.type === "response"
            && "runId" in trigger.payload && trigger.payload.runId === runId
            && (trigger.payload.action === "completed" || trigger.payload.action === "failed" || trigger.payload.action === "cancelled")
            && triggers.routeStatus(trigger.id) === "routed");
        return candidates.at(-1)?.id;
    }

    return {
        create: async (command: BrowserCreateSessionCommand): Promise<BrowserCreateSessionResult> => {
            if (isShuttingDown()) return { ok: false, error: "service_shutting_down" };
            if (triggers.read(command.inputId) !== undefined) return { ok: false, error: "input_conflict" };
            const resolved = await dependencies.resolveModelSelection(command);
            if (!resolved.ok) return { ok: false, error: resolved.error };
            let admission;
            try {
                const summaryAdapter = root.createSummaryAdapterForSelection(resolved.selection);
                const name = await summarizeTriggerName(summaryAdapter, command.intent, command.goalId, {
                    ...(resolved.selection.maxOutputTokens === undefined ? {} : { maxOutputTokens: resolved.selection.maxOutputTokens }),
                });
                const trigger: Trigger = {
                    id: command.inputId,
                    name,
                    type: "work",
                    source: browserActor,
                    target: "supervisor",
                    payload: { action: "submitted", material: { kind: "text", text: command.intent } },
                    sentAt: triggerSentAt(triggers, command.inputId),
                };
                admission = await admitTrigger(owner, triggers, goals, root.adapter, trigger, browserPrincipal, async (intent, reservedGoalId, workspaceMode) => {
                    const id = reservedGoalId ?? command.goalId;
                    const workspace = await allocateGoalWorkspace(root.workspaceRoot, root.dataDirectory, id, workspaceMode);
                    const goal = await scheduler.createGoal({
                        goalId: id,
                        intent,
                        mode: command.mode ?? "normal",
                        modelSelection: resolved.selection,
                    }, workspace);
                    const authorization: GoalTriggerContext["authorization"] = {
                        workspace,
                        toolIds: goal.definition.profile.toolIds.filter((toolId) => root.toolRegistry.get(toolId) !== undefined),
                    };
                    return { goal, authorization };
                });
                if (admission.kind === "rejected") return { ok: false, error: "goal_id_conflict" };
                if (admission.kind !== "accepted") return { ok: false, error: "create_failed" };
                await scheduler.pump();
            } catch (error) {
                if (isTriggerIdentityConflict(error)) return { ok: false, error: "input_conflict" };
                if (error instanceof WorkerExecutionUnavailableError) {
                    reportExecutionUnavailable(error);
                    return { ok: false, error: "execution_unavailable" };
                }
                return { ok: false, error: isShuttingDown() ? "service_shutting_down" : "create_failed" };
            }
            const goal = await goals.restore(admission.goalId);
            const saved = triggers.read(command.inputId);
            if (goal === undefined || saved === undefined) return { ok: false, error: "create_failed" };
            const receipt = toReceipt(saved, triggers, admission.goalId, "message", requiredTriggerSequence(triggers, command.inputId), 0, goal.state.run.id, goal.state.run.id);
            return { ok: true, existing: false, goalId: admission.goalId, runId: goal.state.run.id, receipt };
        },
        submit,
        readInput: async (goalId: string, inputId: string): Promise<BrowserSessionInputQueryResult> => {
            const trigger = triggers.read(inputId);
            if (trigger === undefined) return { ok: true, found: false };
            const ownedGoalId = triggerGoalId(trigger) ?? triggers.reservedGoal(inputId) ?? triggers.queuedGoalForTrigger(inputId);
            if (ownedGoalId !== goalId) return { ok: true, found: false };
            const goal = await goals.restore(goalId);
            const kind = browserInputKind(trigger);
            return {
                ok: true,
                found: true,
                receipt: toReceipt(trigger, triggers, goalId, kind, requiredTriggerSequence(triggers, inputId), triggerCommitRevision(trigger),
                    triggerRunId(trigger), triggers.routeStatus(trigger.id) === "routed" ? goal?.state.run.id : undefined),
            };
        },
        readState: async (goalId) => (await readSnapshot(goalId))?.session,
        readControlSnapshot: readSnapshot,
        openEvents: async (goalId: string, signal?: AbortSignal): Promise<BrowserSessionEventsResult> => {
            const initial = await readSnapshot(goalId);
            if (initial === undefined) return { ok: false, error: "goal_not_found" };
            let closed = signal?.aborted === true;
            const onAbort = (): void => { closed = true; };
            signal?.addEventListener("abort", onAbort, { once: true });
            const events = pollGoalEvents(goalId, async () => readSnapshot(goalId), initial, () => closed, signal);
            const feed: BrowserGoalLiveFeed = {
                events,
                close: () => {
                    closed = true;
                    signal?.removeEventListener("abort", onAbort);
                },
            };
            return { ok: true, feed };
        },
        listMessages: async (goalId: string, query: SessionMessageQuery) => {
            const goal = await goals.restore(goalId);
            if (goal === undefined) return { ok: false, error: "goal_not_found" };
            const result = queryGoalMessages(goal.state.messages, query);
            if (!result.ok) return { ok: false, error: "message_range_invalid" };
            return {
                ok: true,
                messages: result.messages.map((message) => {
                    const { purpose, ...entry } = message;
                    return { ...entry, ...(purpose === undefined ? {} : { purpose }) };
                }),
                ...(result.nextAfterMessageId === undefined ? {} : { nextAfterMessageId: result.nextAfterMessageId }),
                ...(result.throughMessageId === undefined ? {} : { throughMessageId: result.throughMessageId }),
                total: result.total,
            };
        },
        readMessage: async (goalId: string, messageId: string, offset?: number) => {
            const goal = await goals.restore(goalId);
            if (goal === undefined) return { ok: false, error: "goal_not_found" };
            const result = readGoalMessageBody(goal.state.messages, messageId, offset);
            if (!result.ok) return { ok: false, error: "message_not_found" };
            const { purpose, ...entry } = result.entry;
            return { ok: true, message: { ...entry, ...(purpose === undefined ? {} : { purpose }) },
                ...(result.nextOffset === undefined ? {} : { nextOffset: result.nextOffset }) };
        },
    };
}

function isTriggerIdentityConflict(error: unknown): boolean {
    return error instanceof Error && error.message === "Trigger identity conflict";
}

/**
 * 记录本机执行通道不可用的分类诊断。
 *
 * @remarks
 * 只输出失败类别与有界错误文本；不输出堆栈，也不把内部路径返回浏览器。诊断写入失败
 * 不改变创建结果。
 */
function reportExecutionUnavailable(error: WorkerExecutionUnavailableError): void {
    try {
        process.stderr.write(`[lazygoal] Goal creation could not reach local execution (${error.kind}): ${error.message}\n`);
    } catch {
        // Diagnostic output must not change the creation result.
    }
}

function requiredTriggerSequence(triggers: TriggerStore, triggerId: string): number {
    const sequence = triggers.sequence(triggerId);
    if (sequence === undefined) throw new Error("Trigger sequence is unavailable");
    return sequence;
}

interface TriggerBrowserSessionPortDependencies {
    readonly externalId: string;
    readonly root: RuntimeComposition;
    readonly owner: SupervisorOwnership;
    readonly triggers: TriggerStore;
    readonly scheduler: WorkerScheduler;
    readonly goals: JsonFileGoalStore;
    readonly resolveModelSelection: (command: BrowserCreateSessionCommand) => Promise<
        | { readonly ok: true; readonly selection: GoalModelSelection }
        | { readonly ok: false; readonly error: "model_not_selectable" | "model_catalog_unavailable" }
    >;
}

function toGoalUserAction(
    response: BrowserSessionInteractionResponse,
    requestId: string,
    approvalInputId: string,
): GoalUserAction {
    switch (response.kind) {
        case "answer_ask_user": return { kind: "answer_ask_user", requestId, answers: response.answers };
        case "reply_to_question": return { kind: "reply_to_question", requestId, content: response.content };
        case "skip_question": return { kind: "skip_question", requestId };
        case "approve_task": return { kind: "approve_task", requestId };
        case "feedback_task": return { kind: "feedback_task", requestId, feedback: response.feedback };
        case "approve_action": return {
            kind: "approve_action", actionId: response.actionId,
            ...(response.scope === undefined ? {} : { scope: response.scope }), approvalInputId,
        };
        case "approve_action_revision": return {
            kind: "approve_action_revision", actionId: response.actionId,
            input: response.input as JsonValue, reviewRef: response.reviewRef,
            ...(response.scope === undefined ? {} : { scope: response.scope }), approvalInputId,
        };
        case "reject_action": return { kind: "reject_action", actionId: response.actionId, reason: response.reason };
        case "retry_unknown_action": return {
            kind: "retry_unknown_action", actionId: response.actionId, recoveryRef: response.recoveryRef,
        };
        case "decline_unknown_action_retry": return {
            kind: "decline_unknown_action_retry", actionId: response.actionId,
            recoveryRef: response.recoveryRef, reason: response.reason,
        };
    }
}

async function* pollGoalEvents(
    goalId: string,
    read: () => Promise<BrowserControlSnapshot | undefined>,
    initial: BrowserControlSnapshot,
    isClosed: () => boolean,
    signal?: AbortSignal,
): AsyncGenerator<BrowserGoalEvent> {
    let previous = initial;
    yield { type: "state_sync", goalId, state: initial.session, snapshot: initial };
    while (!isClosed()) {
        await waitForNextPoll(isClosed, signal);
        if (isClosed()) return;
        let current: typeof initial | undefined;
        try {
            current = await read();
        } catch {
            yield { type: "stream_fault", goalId, code: "read_failed", resync: ["session"] };
            return;
        }
        if (current === undefined) {
            yield { type: "stream_fault", goalId, code: "read_failed", resync: ["session"] };
            return;
        }
        if (JSON.stringify(current) === JSON.stringify(previous)) continue;
        if (current.session.commitRevision !== previous.session.commitRevision) {
            yield {
                type: "state_committed",
                goalId,
                runId: current.session.runId,
                commitRevision: current.session.commitRevision,
                changed: ["session", "activity", "trajectory", "metrics"],
            };
        }
        yield { type: "state_sync", goalId, state: current.session, snapshot: current };
        previous = current;
    }
}

function waitForNextPoll(isClosed: () => boolean, signal?: AbortSignal): Promise<void> {
    if (isClosed() || signal?.aborted === true) return Promise.resolve();
    return new Promise((resolve) => {
        const timer = setTimeout(done, EVENT_POLL_INTERVAL_MS);
        function done(): void {
            clearTimeout(timer);
            signal?.removeEventListener("abort", done);
            resolve();
        }
        signal?.addEventListener("abort", done, { once: true });
    });
}

function sameInteractionTarget(goal: Goal, requestId: string): boolean {
    const actionId = goal.state.run.pendingAction?.action.actionId;
    const interactionRequestId = goal.state.run.pendingInteraction?.requestId;
    return actionId === requestId || interactionRequestId === requestId;
}

function triggerGoalId(trigger: Trigger): string | undefined {
    return "goalId" in trigger ? trigger.goalId : undefined;
}

function triggerCommitRevision(_trigger: Trigger): number {
    return 0;
}

function triggerRunId(trigger: Trigger): string | undefined {
    if (trigger.type === "instruction") return trigger.payload.runId;
    if (trigger.type === "response" && trigger.payload.action !== "goal_created") return trigger.payload.runId;
    return undefined;
}

function browserInputKind(trigger: Trigger): BrowserSessionInputReceipt["kind"] {
    if (trigger.type === "instruction" && trigger.payload.action === "cancel") return "interrupt";
    if (trigger.type === "interaction" && trigger.payload.action === "answered") return "respond";
    if (trigger.type === "instruction" && trigger.payload.action === "resume") return "resume";
    return "message";
}

function triggerSentAt(triggers: TriggerStore, triggerId: string): string {
    return triggers.read(triggerId)?.sentAt ?? new Date().toISOString();
}
