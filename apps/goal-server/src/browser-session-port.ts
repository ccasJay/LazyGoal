import type { JsonValue } from "../../../packages/contracts/src/index";
import {
    projectGoalSessionState,
    queryGoalMessages,
    readGoalMessageBody,
    projectInteractionView,
    createGoal,
    type Goal,
    type GoalModelSelection,
    type SessionMessageQuery,
    type GoalUserAction,
} from "../../../packages/runtime/src/index";
import { WorkerScheduler, allocateGoalWorkspace, admitTrigger, type RuntimeComposition } from "./runtime/index";
import type { GoalTriggerContext } from "../../../packages/runtime/src/domain";
import type { Trigger } from "../../../packages/runtime/src/trigger";
import {
    projectSessionState,
    type BrowserGoalLiveFeed,
    type BrowserGoalSessionPort,
    type BrowserSessionEventsResult,
} from "../../../packages/browser/src/index";
import {
    readBrowserGoalSessionState,
} from "../../../packages/browser/src/browser-projection";
import type {
    BrowserCreateSessionCommand,
    BrowserCreateSessionResult,
    BrowserExecutionState,
    BrowserGoalEvent,
    BrowserGoalSessionState,
    BrowserSessionInputCommand,
    BrowserSessionInputQueryResult,
    BrowserSessionInputReceipt,
    BrowserSessionInputResult,
    BrowserSessionInteractionResponse,
    BrowserSessionState,
} from "../../../packages/web-contracts/src/index";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { TriggerDeliveryStore, type TriggerDeliveryResult } from "../../../packages/storage/src/trigger-delivery-store";
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
 * const session = createTriggerBrowserSessionPort({ externalId: access.externalId, root, owner, deliveries, scheduler, goals, resolveModelSelection });
 * ```
 */
export function createTriggerBrowserSessionPort(dependencies: TriggerBrowserSessionPortDependencies): BrowserGoalSessionPort {
    const { root, owner, deliveries, scheduler, goals } = dependencies;
    const browserActor = { role: "external" as const, externalId: dependencies.externalId };
    const browserPrincipal = { role: "user" as const, externalId: dependencies.externalId, mayCreateGoal: true, goalIds: [] as readonly string[] };
    const isShuttingDown = (): boolean => root.abortController.signal.aborted;
    const executionOwner = (goalId: string): boolean => scheduler.assignments().some((assignment) => assignment.goalId === goalId);
    const executionState = (goalId: string): BrowserExecutionState => {
        if (deliveries.workerRecovery(goalId)?.status === "pending") return "recoverable";
        const queued = deliveries.queueRecord(goalId);
        if (executionOwner(goalId) || queued?.status === "queued" || queued?.status === "claimed" || queued?.status === "waiting") return "active";
        return "inactive";
    };

    async function readState(goalId: string): Promise<BrowserSessionState | undefined> {
        const goal = await goals.restore(goalId);
        if (goal === undefined) return undefined;
        const ownsExecution = executionOwner(goalId);
        const state = projectSessionState(goalId, projectGoalSessionState({ goal, executionOwner: ownsExecution }));
        return {
            ...state,
            needsRecovery: !ownsExecution && deliveries.workerRecovery(goalId)?.status === "pending",
            executionOwner: ownsExecution,
        };
    }

    async function readSnapshot(goalId: string): Promise<{
        readonly state: BrowserSessionState;
        readonly goal: BrowserGoalSessionState;
    } | undefined> {
        const [state, goal] = await Promise.all([
            readState(goalId),
            readBrowserGoalSessionState(goalId, goals),
        ]);
        if (state === undefined || goal === undefined || state.runId !== goal.currentRunId) return undefined;
        return {
            state,
            goal: {
                ...goal,
                execution: {
                    state: executionState(goalId),
                    committedThroughSequence: goal.execution?.committedThroughSequence ?? 0,
                },
            },
        };
    }

    function toReceipt(
        delivery: TriggerDeliveryResult,
        goalId: string,
        kind: BrowserSessionInputReceipt["kind"],
        sequence: number,
        admittedAtRevision: number,
        targetRunId?: string,
        appliedRunId?: string,
    ): BrowserSessionInputReceipt {
        const status: BrowserSessionInputReceipt["status"] = delivery.status === "pending" ? "pending"
            : delivery.result.kind === "accepted" || delivery.result.kind === "handled" ? "applied" : "cleared";
        return {
            goalId,
            inputId: delivery.delivery.deliveryId,
            kind,
            sequence,
            status,
            admittedAtRevision,
            ...(targetRunId === undefined ? {} : { targetRunId }),
            ...(appliedRunId === undefined ? {} : { appliedRunId }),
        };
    }

    async function priorReceipt(
        deliveryId: string,
        goalId: string,
        kind: BrowserSessionInputReceipt["kind"],
        admittedAtRevision: number,
        targetRunId?: string,
    ): Promise<BrowserSessionInputReceipt | undefined> {
        const delivery = deliveries.read(deliveryId);
        if (delivery === undefined) return undefined;
        const reservedGoalId = triggerGoalId(delivery) ?? deliveries.reservedGoal(deliveryId);
        if (reservedGoalId !== goalId) return undefined;
        const goal = await goals.restore(goalId);
        const appliedRunId = goal?.state.run.id;
        return toReceipt(delivery, goalId, kind, requiredDeliverySequence(deliveries, deliveryId), triggerCommitRevision(delivery) || admittedAtRevision,
            targetRunId, delivery.status === "settled" && delivery.result.kind === "handled" ? appliedRunId : undefined);
    }

    async function submit(goalId: string, input: BrowserSessionInputCommand): Promise<BrowserSessionInputResult> {
        if (isShuttingDown()) return { ok: false, error: "session_unavailable" };
        const kind = input.kind;
        const admittedAtRevision = input.kind === "resume" ? input.commitRevision : 0;
        const targetRunId = input.kind === "interrupt" || input.kind === "respond" || input.kind === "resume"
            ? input.runId : undefined;
        const existingReceipt = await priorReceipt(input.inputId, goalId, kind, admittedAtRevision, targetRunId);
        if (existingReceipt !== undefined && existingReceipt.status !== "pending") {
            return { ok: true, existing: true, receipt: existingReceipt };
        }

        if (input.kind === "interrupt") {
            const trigger: Trigger = {
                id: input.inputId,
                name: "Cancel Goal run",
                type: "instruction",
                source: browserActor,
                target: "worker",
                goalId,
                payload: { action: "cancel", runId: input.runId },
                sentAt: deliverySentAt(deliveries, input.inputId),
            };
            const delivery = { deliveryId: input.inputId, trigger };
            const principal = { ...browserPrincipal, goalIds: [goalId] } as const;
            const queued = deliveries.read(input.inputId);
            try {
                await scheduler.handleCancelTrigger(delivery, principal);
                await scheduler.pump();
            } catch {
                return { ok: false, error: isShuttingDown() ? "session_unavailable" : "RUN_CONTROL_UNAVAILABLE" };
            }
            const saved = deliveries.read(input.inputId);
            if (saved === undefined) return { ok: false, error: "input_admission_failed" };
            const goal = await goals.restore(goalId);
            return { ok: true, existing: queued !== undefined, receipt: toReceipt(saved, goalId, kind,
                requiredDeliverySequence(deliveries, input.inputId), 0, input.runId, goal?.state.run.id) };
        }

        if (input.kind === "respond") {
            const goal = await goals.restore(goalId);
            const interaction = goal === undefined ? undefined : projectInteractionView(goal);
            const queue = deliveries.queueRecord(goalId);
            if (goal === undefined) return { ok: false, error: "GOAL_NOT_FOUND" };
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
                payload: { action: "answered", answer: toGoalUserAction(input.response, input.requestId, input.inputId) },
                sentAt: deliverySentAt(deliveries, input.inputId),
            };
            const delivery = { deliveryId: input.inputId, trigger };
            const prior = deliveries.read(input.inputId);
            try {
                await scheduler.handleInteractionTrigger(delivery, { ...browserPrincipal, goalIds: [goalId] });
            } catch {
                return { ok: false, error: isShuttingDown() ? "session_unavailable" : "INTERACTION_MISMATCH" };
            }
            const saved = deliveries.read(input.inputId);
            if (saved === undefined) return { ok: false, error: "input_admission_failed" };
            if (saved.status === "pending") return { ok: false, error: "INTERACTION_MISMATCH" };
            const current = await goals.restore(goalId);
            return { ok: true, existing: prior !== undefined, receipt: toReceipt(saved, goalId, kind,
                requiredDeliverySequence(deliveries, input.inputId), commitRevision, input.runId, current?.state.run.id) };
        }

        if (input.kind === "resume") {
            const goal = await goals.restore(goalId);
            const recovery = deliveries.workerRecovery(goalId);
            if (goal === undefined) return { ok: false, error: "GOAL_NOT_FOUND" };
            if (recovery?.status !== "pending" || goal.state.run.id !== input.runId
                || (goal.state.commitRevision ?? 0) !== input.commitRevision) {
                return { ok: false, error: "RUN_CONTROL_UNAVAILABLE" };
            }
            const lifecycle = deliveries.read(recovery.lifecycleDeliveryId);
            if (lifecycle === undefined) return { ok: false, error: "RUN_CONTROL_UNAVAILABLE" };
            const trigger: Trigger = {
                id: input.inputId,
                name: "Resume Goal checkpoint",
                type: "instruction",
                source: browserActor,
                target: "supervisor",
                goalId,
                replyTo: lifecycle.delivery.trigger.id,
                payload: { action: "resume", runId: input.runId, acknowledgeUnknownEffects: input.acknowledgeUnknownEffects === true },
                sentAt: deliverySentAt(deliveries, input.inputId),
            };
            const delivery = { deliveryId: input.inputId, trigger };
            const prior = deliveries.read(input.inputId);
            try {
                await scheduler.handleWorkerRecoveryTrigger(delivery, { ...browserPrincipal, goalIds: [goalId] });
                await scheduler.pump();
            } catch {
                return { ok: false, error: isShuttingDown() ? "session_unavailable" : "RUN_CONTROL_UNAVAILABLE" };
            }
            const saved = deliveries.read(input.inputId);
            if (saved === undefined) return { ok: false, error: "input_admission_failed" };
            const current = await goals.restore(goalId);
            return { ok: true, existing: prior !== undefined, receipt: toReceipt(saved, goalId, kind,
                requiredDeliverySequence(deliveries, input.inputId), admittedAtRevision, input.runId, current?.state.run.id) };
        }

        return { ok: false, error: "RUN_CONTROL_UNAVAILABLE" };
    }

    return {
        create: async (command: BrowserCreateSessionCommand): Promise<BrowserCreateSessionResult> => {
            if (isShuttingDown()) return { ok: false, error: "service_shutting_down" };
            const resolved = await dependencies.resolveModelSelection(command);
            if (!resolved.ok) return { ok: false, error: resolved.error };
            const trigger: Trigger = {
                id: command.inputId,
                name: "Submit work",
                type: "work",
                source: browserActor,
                target: "supervisor",
                payload: { action: "submitted", material: { kind: "text", text: command.intent } },
                sentAt: deliverySentAt(deliveries, command.inputId),
            };
            const delivery = { deliveryId: command.inputId, trigger };
            const prior = deliveries.read(command.inputId);
            let admission;
            try {
                admission = await admitTrigger(owner, deliveries, goals, root.adapter, delivery, browserPrincipal, async (intent, reservedGoalId, workspaceMode) => {
                    const id = reservedGoalId ?? command.goalId;
                    const workspace = await allocateGoalWorkspace(root.workspaceRoot, root.dataDirectory, id, workspaceMode);
                    const goal = createGoal({
                        id,
                        intent,
                        profile: root.profile,
                        runId: root.runIdGenerator(),
                        promptBundleVersion: 1,
                        memoryProtocol: { kind: "structured", version: 1 },
                        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
                        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
                        mode: command.mode ?? "normal",
                        modelSelection: resolved.selection,
                    });
                    const authorization: GoalTriggerContext["authorization"] = {
                        workspace,
                        toolIds: root.profile.toolIds.filter((toolId) => root.toolRegistry.get(toolId) !== undefined),
                        sandbox: { extraFiles: [], network: "none" },
                    };
                    return { goal, authorization };
                });
                if (admission.kind !== "settled" || admission.receipt.status !== "settled") return { ok: false, error: "create_failed" };
                if (admission.receipt.result.kind === "rejected") return { ok: false, error: "goal_id_conflict" };
                if (admission.receipt.result.kind !== "accepted") return { ok: false, error: "create_failed" };
                await scheduler.pump();
            } catch {
                return { ok: false, error: isShuttingDown() ? "service_shutting_down" : "create_failed" };
            }
            if (admission.kind !== "settled" || admission.receipt.status !== "settled"
                || admission.receipt.result.kind !== "accepted") return { ok: false, error: "create_failed" };
            const goalId = admission.receipt.result.goalId;
            const goal = await goals.restore(goalId);
            const saved = deliveries.read(command.inputId);
            if (goal === undefined || saved === undefined) return { ok: false, error: "create_failed" };
            const receipt = toReceipt(saved, goalId, "message", requiredDeliverySequence(deliveries, command.inputId), 0, goal.state.run.id, goal.state.run.id);
            return { ok: true, existing: prior !== undefined, goalId, runId: goal.state.run.id, receipt };
        },
        submit,
        readInput: async (goalId: string, inputId: string): Promise<BrowserSessionInputQueryResult> => {
            const delivery = deliveries.read(inputId);
            if (delivery === undefined) return { ok: true, found: false };
            const ownedGoalId = triggerGoalId(delivery) ?? deliveries.reservedGoal(inputId);
            if (ownedGoalId !== goalId) return { ok: true, found: false };
            const goal = await goals.restore(goalId);
            const kind = browserInputKind(delivery);
            return {
                ok: true,
                found: true,
                receipt: toReceipt(delivery, goalId, kind, requiredDeliverySequence(deliveries, inputId), triggerCommitRevision(delivery),
                    triggerRunId(delivery), delivery.status === "settled" && (delivery.result.kind === "handled" || delivery.result.kind === "accepted")
                        ? goal?.state.run.id : undefined),
            };
        },
        readState,
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

function requiredDeliverySequence(deliveries: TriggerDeliveryStore, deliveryId: string): number {
    const sequence = deliveries.sequence(deliveryId);
    if (sequence === undefined) throw new Error("Trigger delivery sequence is unavailable");
    return sequence;
}

interface TriggerBrowserSessionPortDependencies {
    readonly externalId: string;
    readonly root: RuntimeComposition;
    readonly owner: SupervisorOwnership;
    readonly deliveries: TriggerDeliveryStore;
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
    read: () => Promise<{ readonly state: BrowserSessionState; readonly goal: BrowserGoalSessionState } | undefined>,
    initial: { readonly state: BrowserSessionState; readonly goal: BrowserGoalSessionState },
    isClosed: () => boolean,
    signal?: AbortSignal,
): AsyncGenerator<BrowserGoalEvent> {
    let previous = initial;
    yield { type: "state_sync", goalId, state: initial.state, snapshot: { goal: initial.goal, session: initial.state } };
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
        if (current.state.commitRevision !== previous.state.commitRevision) {
            yield {
                type: "state_committed",
                goalId,
                runId: current.state.runId,
                commitRevision: current.state.commitRevision,
                changed: ["session", "activity", "trajectory", "metrics"],
            };
        }
        yield { type: "state_sync", goalId, state: current.state, snapshot: { goal: current.goal, session: current.state } };
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

function triggerGoalId(delivery: TriggerDeliveryResult): string | undefined {
    if ("goalId" in delivery.delivery.trigger) return delivery.delivery.trigger.goalId;
    if (delivery.status === "settled" && (delivery.result.kind === "accepted" || delivery.result.kind === "rejected")) {
        return delivery.result.goalId;
    }
    return undefined;
}

function triggerCommitRevision(_delivery: TriggerDeliveryResult): number {
    return 0;
}

function triggerRunId(delivery: TriggerDeliveryResult): string | undefined {
    const trigger = delivery.delivery.trigger;
    if (trigger.type === "instruction") return trigger.payload.runId;
    if (trigger.type === "response" && trigger.payload.action !== "goal_created") return trigger.payload.runId;
    return undefined;
}

function browserInputKind(delivery: TriggerDeliveryResult): BrowserSessionInputReceipt["kind"] {
    const trigger = delivery.delivery.trigger;
    if (trigger.type === "instruction" && trigger.payload.action === "cancel") return "interrupt";
    if (trigger.type === "interaction" && trigger.payload.action === "answered") return "respond";
    if (trigger.type === "instruction" && trigger.payload.action === "resume") return "resume";
    return "message";
}

function deliverySentAt(deliveries: TriggerDeliveryStore, deliveryId: string): string {
    return deliveries.read(deliveryId)?.delivery.trigger.sentAt ?? new Date().toISOString();
}
