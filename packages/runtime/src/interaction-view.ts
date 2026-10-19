import type { AskUserQuestion } from "../../model-contracts/src/index";
import type { EffectiveSandboxScope } from "../../sandbox/src/index";
import { resolveActionRecoveryRef } from "./action-approval";
import type { Goal, JsonValue } from "./domain";

/**
 * 当前已提交等待点的类型化交互视图种类。
 *
 * @remarks
 * `question` 对应模型发起的结构化问卷（可携带路线扩展审批）；`task_approval`
 * 对应 Plan 任务提案审批；`action_approval` 对应工具／沙箱审批；`action_recovery`
 * 对应结果未知的 Action 恢复等待。等待之外不产生交互视图。
 *
 * @example
 * ```ts
 * const kind: InteractionViewKind = "action_recovery";
 * ```
 */
export type InteractionViewKind =
    | "question"
    | "task_approval"
    | "action_approval"
    | "action_recovery";

/**
 * 交互视图公开的可用决定。
 *
 * @remarks
 * 决定只描述当前等待允许的响应种类；Interrupt 是独立的 Run 级输入，不属于
 * 交互响应联合，因此不在该列表中。`action_recovery` 只允许单次重试或拒绝。
 *
 * @example
 * ```ts
 * const decisions: readonly InteractionDecision[] = ["retry_action", "reject_action"];
 * ```
 */
export type InteractionDecision =
    | "answer_questions"
    | "reply_to_question"
    | "skip_question"
    | "approve_task"
    | "send_task_feedback"
    | "approve_action"
    | "approve_action_revision"
    | "reject_action"
    | "retry_unknown_action"
    | "decline_unknown_action_retry";

/**
 * 交互视图的稳定引用。
 *
 * @remarks
 * `interactionId` 由种类与等待身份构成（`question:<requestId>`、
 * `task_approval:<requestId>`、`action_approval:<actionId>`、
 * `action_recovery:<actionId>`），因此同一等待在初始同步、重复通知与重连后
 * 得到相同引用；不同 Goal／Run 或新等待不会继承旧引用。
 *
 * @example
 * ```ts
 * const ref: InteractionViewRef = { runId: "run-1", interactionId: "question:ask-1" };
 * ```
 */
export interface InteractionViewRef {
    /** 等待所属的 Run 身份。 */
    readonly runId: string;
    /** 种类与等待身份构成的稳定引用。 */
    readonly interactionId: string;
}

/**
 * 从当前已提交等待派生的类型化交互视图。
 *
 * @remarks
 * 视图只描述身份、种类与可用决定；展示正文由安全投影或显式详情读取提供，
 * 不在 Snapshot 中复制一份可变请求。任务审批与工具审批都携带可决定范围，
 * 恢复等待只允许既有单次恢复选择，不提供持续授权。
 *
 * @example
 * ```ts
 * const view = projectInteractionView(goal);
 * if (view?.kind === "question") console.log(view.decisions);
 * ```
 */
export type GoalInteractionView =
    | {
        readonly kind: "question";
        readonly goalId: string;
        readonly runId: string;
        readonly interactionId: string;
        readonly requestId: string;
        readonly mode: "plan" | "execution";
        /** 是否携带 Plan 路线扩展审批。 */
        readonly routeApproval: boolean;
        readonly decisions: readonly InteractionDecision[];
    }
    | {
        readonly kind: "task_approval";
        readonly goalId: string;
        readonly runId: string;
        readonly interactionId: string;
        readonly requestId: string;
        /** 候选路线阶段数量；完整有序路线由详情读取提供。 */
        readonly stageCount: number;
        readonly decisions: readonly InteractionDecision[];
    }
    | {
        readonly kind: "action_approval";
        readonly goalId: string;
        readonly runId: string;
        readonly interactionId: string;
        readonly actionId: string;
        readonly toolId: string;
        readonly approvalKind?: "tool" | "sandbox";
        /** 当前允许的授权期限；持续授权仍受既有可用性与完整审阅限制。 */
        readonly scopeOptions: readonly ("action" | "goal" | "workspace")[];
        /** 调用是否来自 PTC 程序批次。 */
        readonly fromProgram: boolean;
        readonly decisions: readonly InteractionDecision[];
    }
    | {
        readonly kind: "action_recovery";
        readonly goalId: string;
        readonly runId: string;
        readonly interactionId: string;
        readonly actionId: string;
        readonly toolId: string;
        readonly approvalKind?: "tool" | "sandbox";
        /**
         * 本次未知结果等待的恢复身份。
         *
         * @remarks 重执行决定必须原样带回该引用；同一 Action 再次产生未知结果时
         * 引用改变，旧决定不能授权新一轮重执行。
         */
        readonly recoveryRef: string;
        /** 恢复只允许单次重试或拒绝。 */
        readonly scopeOptions: readonly ["action"];
        readonly fromProgram: boolean;
        readonly decisions: readonly InteractionDecision[];
    };

/**
 * 当前交互的完整审阅内容。
 *
 * @remarks
 * 详情读取只返回身份匹配的当前等待内容：问题的完整正文与选项、任务提案的完整
 * 目标／验收／有序路线，或待审 Action 的完整 canonical 输入。读取不推进状态、
 * 不调用模型或工具，也不返回其他 Action 的数据。
 *
 * @example
 * ```ts
 * const detail = readInteractionDetail(goal, { runId: "run-1", interactionId: "question:ask-1" });
 * ```
 */
export type InteractionDetail =
    | {
        readonly kind: "question";
        readonly mode: "plan" | "execution";
        readonly questions: readonly AskUserQuestion[];
        readonly routeRevision?: {
            readonly baseRevision: number;
            readonly reason: string;
            readonly approvalRequest: string;
            readonly approvalOptionId: string;
            readonly stages: readonly {
                readonly target: string;
                readonly acceptanceCriteria: readonly string[];
            }[];
        } | undefined;
    }
    | {
        readonly kind: "task_approval";
        readonly objective: string;
        readonly approvalRequest: string;
        readonly completionCriteria: readonly string[];
        readonly stages: readonly {
            readonly target: string;
            readonly acceptanceCriteria: readonly string[];
        }[];
    }
    | {
        readonly kind: "action_approval" | "action_recovery";
        readonly actionId: string;
        readonly toolId: string;
        readonly approvalKind?: "tool" | "sandbox" | undefined;
        readonly input: JsonValue;
        /**
         * 本次未知结果等待的恢复身份。
         *
         * @remarks 仅 `action_recovery` 提供；重执行决定必须原样带回。
         */
        readonly recoveryRef?: string | undefined;
        readonly effectiveSandboxScope?: EffectiveSandboxScope | undefined;
        readonly parentProgram?: {
            readonly actionId: string;
            readonly callNumber: number;
        } | undefined;
    };

/** 详情读取的稳定结果；失败表示引用与当前等待不匹配，等待保持不变。 */
export type InteractionDetailResult =
    | {
        readonly ok: true;
        readonly interactionId: string;
        readonly detail: InteractionDetail;
    }
    | {
        readonly ok: false;
        readonly code: "INTERACTION_NOT_WAITING" | "INTERACTION_MISMATCH";
        readonly message: string;
    };

/** 由种类与等待身份构成稳定引用。 */
export function formatInteractionId(kind: InteractionViewKind, localId: string): string {
    return `${kind}:${localId}`;
}

/**
 * 从当前 Goal 快照派生类型化交互视图。
 *
 * @remarks
 * 只读取已提交 Snapshot 的 `pendingInteraction`／`pendingAction`；Run 不处于
 * waiting、等待已被决定（`approved`）或只有 Interrupt 时返回 `undefined`。
 * 该函数不修改 Goal，也不触发任何执行。
 *
 * @param goal - 当前已提交的 Goal 快照。
 * @returns 类型化交互视图；没有可决定等待时返回 `undefined`。
 * @example
 * ```ts
 * const view = projectInteractionView(goal);
 * ```
 */
export function projectInteractionView(goal: Goal): GoalInteractionView | undefined {
    const run = goal.state.run;
    if (run.status !== "waiting") return undefined;

    const interaction = run.pendingInteraction;
    if (interaction !== undefined) {
        if (interaction.kind === "ask_user") {
            return {
                kind: "question",
                goalId: goal.id,
                runId: run.id,
                interactionId: formatInteractionId("question", interaction.requestId),
                requestId: interaction.requestId,
                mode: interaction.mode,
                routeApproval: interaction.routeRevision !== undefined,
                decisions: ["answer_questions", "reply_to_question", "skip_question"],
            };
        }
        return {
            kind: "task_approval",
            goalId: goal.id,
            runId: run.id,
            interactionId: formatInteractionId("task_approval", interaction.requestId),
            requestId: interaction.requestId,
            stageCount: interaction.planRouteCandidate.stages.length,
            decisions: ["approve_task", "send_task_feedback"],
        };
    }

    const pending = run.pendingAction;
    if (pending === undefined || pending.status === "approved") return undefined;
    const fromProgram = run.pendingProgram !== undefined;
    if (pending.status === "outcome_unknown") {
        return {
            kind: "action_recovery",
            goalId: goal.id,
            runId: run.id,
            interactionId: formatInteractionId("action_recovery", pending.action.actionId),
            actionId: pending.action.actionId,
            toolId: pending.action.toolId,
            ...(pending.approvalKind === undefined ? {} : { approvalKind: pending.approvalKind }),
            recoveryRef: resolveActionRecoveryRef(pending),
            scopeOptions: ["action"],
            fromProgram,
            decisions: ["retry_unknown_action", "decline_unknown_action_retry"],
        };
    }
    return {
        kind: "action_approval",
        goalId: goal.id,
        runId: run.id,
        interactionId: formatInteractionId("action_approval", pending.action.actionId),
        actionId: pending.action.actionId,
        toolId: pending.action.toolId,
        ...(pending.approvalKind === undefined ? {} : { approvalKind: pending.approvalKind }),
        scopeOptions: ["action", "goal", "workspace"],
        fromProgram,
        decisions: ["approve_action", "approve_action_revision", "reject_action"],
    };
}

/**
 * 按稳定引用读取当前交互的完整审阅内容。
 *
 * @remarks
 * 引用必须同时匹配当前 Run 与当前等待身份；过期引用、已决定等待和只有 Interrupt
 * 的 Run 返回稳定拒绝，且不会返回其他 Action 的输入或触发执行。
 *
 * @param goal - 当前已提交的 Goal 快照。
 * @param ref - 调用方保存的 Run 与交互引用。
 * @returns 完整内容，或不匹配的稳定拒绝。
 * @example
 * ```ts
 * const detail = readInteractionDetail(goal, { runId: "run-1", interactionId: "action_approval:act-1" });
 * ```
 */
export function readInteractionDetail(goal: Goal, ref: InteractionViewRef): InteractionDetailResult {
    const view = projectInteractionView(goal);
    if (view === undefined) {
        return {
            ok: false,
            code: "INTERACTION_NOT_WAITING",
            message: `Goal "${goal.id}" has no pending interaction`,
        };
    }
    if (view.runId !== ref.runId || view.interactionId !== ref.interactionId) {
        return {
            ok: false,
            code: "INTERACTION_MISMATCH",
            message: `Interaction "${ref.interactionId}" is not the current pending interaction of Run "${ref.runId}"`,
        };
    }

    const run = goal.state.run;
    if (view.kind === "question") {
        const interaction = run.pendingInteraction;
        if (interaction === undefined || interaction.kind !== "ask_user") {
            return mismatch(goal, ref);
        }
        return {
            ok: true,
            interactionId: view.interactionId,
            detail: {
                kind: "question",
                mode: interaction.mode,
                questions: interaction.questions.map((question) => ({
                    id: question.id,
                    header: question.header,
                    question: question.question,
                    multiSelect: question.multiSelect,
                    options: question.options.map((option) => ({
                        id: option.id,
                        label: option.label,
                        ...(option.description === undefined ? {} : { description: option.description }),
                    })),
                })),
                ...(interaction.routeRevision === undefined ? {} : {
                    routeRevision: {
                        baseRevision: interaction.routeRevision.baseRevision,
                        reason: interaction.routeRevision.reason,
                        approvalRequest: interaction.routeRevision.approvalRequest,
                        approvalOptionId: interaction.routeRevision.approvalOptionId,
                        stages: interaction.routeRevision.candidate.stages.map((stage) => ({
                            target: stage.target,
                            acceptanceCriteria: [...stage.acceptanceCriteria],
                        })),
                    },
                }),
            },
        };
    }

    if (view.kind === "task_approval") {
        const interaction = run.pendingInteraction;
        if (interaction === undefined || interaction.kind !== "task_approval") {
            return mismatch(goal, ref);
        }
        return {
            ok: true,
            interactionId: view.interactionId,
            detail: {
                kind: "task_approval",
                objective: interaction.proposal.objective,
                approvalRequest: interaction.approvalRequest,
                completionCriteria: interaction.proposal.completionCriteria.map((criterion) => criterion.text),
                stages: interaction.planRouteCandidate.stages.map((stage) => ({
                    target: stage.target,
                    acceptanceCriteria: [...stage.acceptanceCriteria],
                })),
            },
        };
    }

    const pending = run.pendingAction;
    if (pending === undefined || pending.action.actionId !== view.actionId) {
        return mismatch(goal, ref);
    }
    return {
        ok: true,
        interactionId: view.interactionId,
        detail: {
            kind: view.kind,
            actionId: pending.action.actionId,
            toolId: pending.action.toolId,
            ...(pending.approvalKind === undefined ? {} : { approvalKind: pending.approvalKind }),
            input: structuredClone(pending.action.input),
            ...(view.kind === "action_recovery"
                ? {
                    recoveryRef: resolveActionRecoveryRef(pending),
                }
                : {}),
            ...(pending.effectiveSandboxScope === undefined
                ? {}
                : { effectiveSandboxScope: structuredClone(pending.effectiveSandboxScope) }),
            ...(run.pendingProgram === undefined ? {} : {
                parentProgram: {
                    actionId: run.pendingProgram.action.actionId,
                    callNumber: run.pendingProgram.nextCallIndex + 1,
                },
            }),
        },
    };
}

function mismatch(goal: Goal, ref: InteractionViewRef): InteractionDetailResult {
    return {
        ok: false,
        code: "INTERACTION_MISMATCH",
        message: `Interaction "${ref.interactionId}" no longer matches the pending wait of Goal "${goal.id}"`,
    };
}
