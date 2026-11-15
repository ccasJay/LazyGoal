/**
 * GoalUserAction 中可提交的递归 JSON 值。
 *
 * @remarks
 * 此类型只描述只读 JSON 形状；Trigger 生成绑定在持久化或传输边界执行结构校验。
 *
 * @example
 * ```ts
 * const input: GoalActionJsonValue = { path: "src/index.ts" };
 * ```
 */
export type GoalActionJsonValue =
    | string
    | number
    | boolean
    | null
    | readonly GoalActionJsonValue[]
    | { readonly [key: string]: GoalActionJsonValue };

type GoalUserAskUserAnswer = {
    readonly questionId: string;
    readonly optionIds: readonly string[];
    readonly otherText?: string;
};

/**
 * 用户对 Goal 当前交互等待点提交的操作。
 *
 * @remarks
 * - `message` 向普通 wait/blocked 等待追加用户消息。
 * - `approve_task` 与 `feedback_task` 必须匹配当前提案请求；兼容分支 `approve` 与 `approve_task` 行为一致。
 * - `answer_ask_user`、`reply_to_question` 与 `skip_question` 分别表示结构化答案、整体回复和明确跳过；跳过不取消 Run。
 * - `approve_action` 只作用于当前待审批工具调用；`approve_action_revision` 还须绑定预审引用和最终参数版本。
 * - `retry_unknown_action` 与 `decline_unknown_action_retry` 只决定当前未知结果等待；拒绝保留效果未知事实。
 *
 * Trigger 接收方还须将操作与顶层 Goal、`replyTo` 及当前 Runtime 等待身份核对；消息结构校验本身不授予动作权限。
 *
 * @example
 * ```ts
 * const answer: GoalUserAction = { kind: "approve_task", requestId: "proposal-1" };
 * ```
 */
export type GoalUserAction =
    | { readonly kind: "message"; readonly content: string; readonly inputId?: string | undefined }
    | { readonly kind: "approve_task"; readonly requestId: string }
    | { readonly kind: "feedback_task"; readonly requestId: string; readonly feedback: string }
    | {
        readonly kind: "answer_ask_user";
        readonly requestId: string;
        readonly answers: readonly GoalUserAskUserAnswer[];
    }
    | { readonly kind: "reply_to_question"; readonly requestId: string; readonly content: string }
    | { readonly kind: "skip_question"; readonly requestId: string }
    | {
        readonly kind: "approve_action";
        readonly actionId: string;
        readonly scope?: "action" | "goal" | "workspace";
        readonly approvalInputId?: string;
    }
    | {
        readonly kind: "approve_action_revision";
        readonly actionId: string;
        readonly input: GoalActionJsonValue;
        readonly scope?: "action" | "goal" | "workspace";
        readonly reviewRef: string;
        readonly approvalInputId?: string;
    }
    | { readonly kind: "retry_unknown_action"; readonly actionId: string; readonly recoveryRef: string }
    | {
        readonly kind: "decline_unknown_action_retry";
        readonly actionId: string;
        readonly recoveryRef: string;
        readonly reason: string;
    }
    | { readonly kind: "reject_action"; readonly actionId: string; readonly reason: string }
    | { readonly kind: "approve"; readonly requestId: string };

/**
 * Trigger 中声明的可信参与者身份。
 *
 * @remarks
 * `worker` 身份绑定逻辑 Worker 与当前进程代次；`external` 身份由认证边界提供；
 * `supervisor` 表示当前 Supervisor。接收方仍须核对该声明与认证连接一致。
 *
 * @example
 * ```ts
 * const source: TriggerActor = { role: "worker", workerId: "worker-1", generation: "gen-1" };
 * ```
 */
export type TriggerActor =
    | { readonly role: "worker"; readonly workerId: string; readonly generation: string }
    | { readonly role: "external"; readonly externalId: string }
    | { readonly role: "supervisor" };

/**
 * Trigger 的逻辑投递角色。
 *
 * @remarks
 * `worker` 指向 Supervisor 路由的逻辑 Worker，不携带 OS 进程身份；`supervisor` 指向当前 Supervisor。
 *
 * @example
 * ```ts
 * const target: TriggerTarget = "supervisor";
 * ```
 */
export type TriggerTarget = "supervisor" | "worker";

/**
 * Supervisor、Worker 与外部生产者共享的不可变消息协议。
 *
 * @remarks
 * `type` 与 `payload.action` 共同判别封闭的消息分支；身份、关联和 Goal 引用位于顶层。
 * Wire、进程与持久化边界必须使用 Storage 生成的 `triggerBinding` 校验结构，
 * 并由接收方另行验证来源身份、路由权限及关联关系。
 *
 * @example
 * ```ts
 * const trigger: Trigger = {
 *   id: "trigger-1",
 *   name: "Submit work",
 *   type: "work",
 *   source: { role: "external", externalId: "browser-session-1" },
 *   target: "supervisor",
 *   payload: { action: "submitted", material: { kind: "text", text: "Inspect the failing test" } },
 *   sentAt: new Date().toISOString(),
 * };
 * ```
 */
export type Trigger =
    | {
        readonly id: string;
        readonly name: string;
        readonly type: "work";
        readonly source: TriggerActor;
        readonly target: TriggerTarget;
        readonly payload: { readonly action: "submitted"; readonly material: { readonly kind: "text"; readonly text: string } };
        readonly sentAt: string;
    }
    | {
        readonly id: string;
        readonly name: string;
        readonly type: "response";
        readonly source: TriggerActor;
        readonly target: TriggerTarget;
        readonly payload: { readonly action: "goal_created" };
        readonly sentAt: string;
        readonly goalId: string;
        readonly replyTo: string;
    }
    | {
        readonly id: string;
        readonly name: string;
        readonly type: "response";
        readonly source: TriggerActor;
        readonly target: TriggerTarget;
        readonly payload:
            | { readonly action: "progress"; readonly runId: string; readonly status: "running" }
            | {
                readonly action: "progress";
                readonly runId: string;
                readonly status: "waiting";
                readonly waitingFor: "ask_user" | "task_approval" | "action_approval" | "action_recovery" | "blocked";
            };
        readonly sentAt: string;
        readonly goalId: string;
        readonly replyTo: string;
    }
    | {
        readonly id: string;
        readonly name: string;
        readonly type: "response";
        readonly source: TriggerActor;
        readonly target: TriggerTarget;
        readonly payload: { readonly action: "completed"; readonly runId: string; readonly answer: string };
        readonly sentAt: string;
        readonly goalId: string;
        readonly replyTo: string;
    }
    | {
        readonly id: string;
        readonly name: string;
        readonly type: "response";
        readonly source: TriggerActor;
        readonly target: TriggerTarget;
        readonly payload: { readonly action: "failed" | "cancelled"; readonly runId: string };
        readonly sentAt: string;
        readonly goalId: string;
        readonly replyTo: string;
    }
    | {
        readonly id: string;
        readonly name: string;
        readonly type: "permission";
        readonly source: TriggerActor;
        readonly target: TriggerTarget;
        readonly payload: {
            readonly action: "requested";
            readonly runId: string;
            readonly actionId: string;
            readonly interactionId: string;
            readonly commitRevision: number;
        };
        readonly sentAt: string;
        readonly goalId: string;
    }
    | {
        readonly id: string;
        readonly name: string;
        readonly type: "permission";
        readonly source: TriggerActor;
        readonly target: TriggerTarget;
        readonly payload: {
            readonly action: "decided";
            readonly decision: "approve";
            readonly scope: "action";
            readonly reason?: string;
        };
        readonly sentAt: string;
        readonly goalId: string;
        readonly replyTo: string;
    }
    | {
        readonly id: string;
        readonly name: string;
        readonly type: "permission";
        readonly source: TriggerActor;
        readonly target: TriggerTarget;
        readonly payload: { readonly action: "decided"; readonly decision: "reject"; readonly scope: "action"; readonly reason: string };
        readonly sentAt: string;
        readonly goalId: string;
        readonly replyTo: string;
    }
    | {
        readonly id: string;
        readonly name: string;
        readonly type: "interaction";
        readonly source: TriggerActor;
        readonly target: TriggerTarget;
        readonly payload: { readonly action: "answered"; readonly answer: GoalUserAction };
        readonly sentAt: string;
        readonly goalId: string;
        readonly replyTo: string;
    }
    | {
        readonly id: string;
        readonly name: string;
        readonly type: "instruction";
        readonly source: TriggerActor;
        readonly target: TriggerTarget;
        readonly payload: { readonly action: "cancel"; readonly runId: string };
        readonly sentAt: string;
        readonly goalId: string;
    }
    | {
        readonly id: string;
        readonly name: string;
        readonly type: "instruction";
        readonly source: TriggerActor;
        readonly target: TriggerTarget;
        readonly payload: { readonly action: "resume"; readonly runId: string; readonly acknowledgeUnknownEffects: boolean };
        readonly sentAt: string;
        readonly goalId: string;
        readonly replyTo: string;
    }
    | {
        readonly id: string;
        readonly name: string;
        readonly type: "instruction";
        readonly source: TriggerActor;
        readonly target: TriggerTarget;
        readonly payload: { readonly action: "continue"; readonly runId: string; readonly content: string };
        readonly sentAt: string;
        readonly goalId: string;
        readonly replyTo: string;
    }
    | {
        readonly id: string;
        readonly name: string;
        readonly type: "lifecycle";
        readonly source: TriggerActor;
        readonly target: TriggerTarget;
        readonly payload: { readonly action: "started" };
        readonly sentAt: string;
    }
    | {
        readonly id: string;
        readonly name: string;
        readonly type: "lifecycle";
        readonly source: TriggerActor;
        readonly target: TriggerTarget;
        readonly payload: { readonly action: "exited"; readonly outcome: "normal" | "unexpected" };
        readonly sentAt: string;
    }
    | {
        readonly id: string;
        readonly name: string;
        readonly type: "collaboration";
        readonly source: TriggerActor;
        readonly target: TriggerTarget;
        readonly payload: { readonly action: "requested" };
        readonly sentAt: string;
        readonly goalId?: string;
    }
    | {
        readonly id: string;
        readonly name: string;
        readonly type: "collaboration";
        readonly source: TriggerActor;
        readonly target: TriggerTarget;
        readonly payload: { readonly action: "result" };
        readonly sentAt: string;
        readonly goalId?: string;
        readonly replyTo: string;
    };
