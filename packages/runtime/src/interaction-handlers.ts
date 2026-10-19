import type { SessionInteractionResponse } from "./session-input";
import type {
    GoalInteractionView,
    InteractionDetailResult,
    InteractionViewKind,
    InteractionViewRef,
} from "./interaction-view";

/**
 * 一次宿主交互处理调用的只读输入。
 *
 * @remarks
 * `request` 是当前已提交等待的类型化视图，`signal` 在请求被其他客户端结算、
 * Interrupt 取代、Run 结束、处理器解除连接或 Runtime 关闭时中止该次调用；
 * `readDetail` 复用与只读观察相同的访问边界，按稳定引用读取完整审阅内容。
 * 详情读取不推进等待，也不授予执行权限。
 *
 * @example
 * ```ts
 * const handlers: SessionInteractionHandlers = {
 *   onQuestion: async ({ request, readDetail }) => {
 *     const detail = await readDetail();
 *     return detail.ok && request.kind === "question"
 *       ? { kind: "respond", response: { kind: "skip_question" } }
 *       : { kind: "unhandled" };
 *   },
 * };
 * ```
 */
export interface InteractionHandlerCall {
    /** 当前等待的类型化视图；身份来自已提交快照。 */
    readonly request: GoalInteractionView;
    /** 本次调用的局部取消信号。 */
    readonly signal: AbortSignal;
    /**
     * 读取当前请求的完整审阅内容。
     *
     * @param ref - 省略时使用 `request` 自身的稳定引用；显式传入的引用必须匹配当前等待。
     * @returns 完整问题／任务范围／Action 输入，或引用不匹配的稳定拒绝。
     */
    readonly readDetail: (ref?: InteractionViewRef) => Promise<InteractionDetailResult>;
}

/**
 * 宿主函数返回的决定。
 *
 * @remarks
 * 结果只表达响应种类：`respond` 通过统一 `send` 受理，仍受 Runtime 身份、授权与
 * 提交规则约束；`unhandled` 表示本次不处理，等待保持不变且不会被反复重调。
 * 处理函数不返回值（Promise 悬挂）时保持等待真人，不伪造决定。
 *
 * @example
 * ```ts
 * const result: InteractionHandlerResult = { kind: "respond", response: { kind: "approve_task" } };
 * ```
 */
export type InteractionHandlerResult =
    | { readonly kind: "respond"; readonly response: SessionInteractionResponse }
    | { readonly kind: "unhandled" };

/**
 * 按交互种类注册的宿主处理函数集合。
 *
 * @remarks
 * 每个函数只处理对应种类：`onQuestion` 不得代答任务或 Action 审批，
 * `onActionApproval` 只处理工具／沙箱审批，`onActionRecovery` 必须单独注册；
 * 工具恢复请求不会降级调用普通审批函数，自动放行的工具不产生审批请求。
 *
 * @example
 * ```ts
 * const handlers: SessionInteractionHandlers = {
 *   onTaskApproval: async () => ({ kind: "respond", response: { kind: "approve_task" } }),
 * };
 * ```
 */
export interface SessionInteractionHandlers {
    /** 问答等待的处理函数；省略表示交由真人回答。 */
    readonly onQuestion?: (call: InteractionHandlerCall) => InteractionHandlerResult | Promise<InteractionHandlerResult>;
    /** 任务提案审批的处理函数；省略表示交由真人批准或反馈。 */
    readonly onTaskApproval?: (call: InteractionHandlerCall) => InteractionHandlerResult | Promise<InteractionHandlerResult>;
    /** 工具／沙箱审批的处理函数；不处理未知结果恢复请求。 */
    readonly onActionApproval?: (call: InteractionHandlerCall) => InteractionHandlerResult | Promise<InteractionHandlerResult>;
    /** Action 结果未知恢复的处理函数；批准意味着允许原操作再次执行。 */
    readonly onActionRecovery?: (call: InteractionHandlerCall) => InteractionHandlerResult | Promise<InteractionHandlerResult>;
}

/**
 * 已连接的自动处理器句柄。
 *
 * @remarks
 * `detach()` 幂等释放自动所有者并中止本地调用，不取消 Goal、不解除等待、也不
 * 撤销已经受理的决定。解除后可以显式重新连接；重新连接可能再次投递尚未解决的
 * 请求，本契约不承诺跨连接或跨进程的 exactly-once。
 *
 * @example
 * ```ts
 * const attached = session.attachInteractionHandlers({ onQuestion: async () => ({ kind: "unhandled" }) });
 * if (attached.ok) attached.handle.detach();
 * ```
 */
export interface InteractionHandlerHandle {
    /** 该句柄连接的 Goal。 */
    readonly goalId: string;
    /** 是否已解除连接。 */
    readonly detached: boolean;
    /** 幂等解除连接并中止仍在本地的调用。 */
    detach(): void;
}

/** 连接自动处理器的稳定结果。 */
export type InteractionHandlerAttachResult =
    | { readonly ok: true; readonly handle: InteractionHandlerHandle }
    | {
        readonly ok: false;
        readonly code: "HANDLER_CONFLICT" | "SESSION_DETACHED";
        readonly message: string;
    };

/**
 * 一次宿主处理调用可定位的故障报告。
 *
 * @remarks
 * `phase: "handler"` 表示宿主函数自身抛错或被中止；`phase: "admission"` 表示结果
 * 未能作为决定提交：`ADMISSION_REJECTED` 是 Runtime 业务规则拒绝，
 * `ADMISSION_UNKNOWN` 表示提交结果不明（保存可能已发生）。两者都保留原等待，
 * 不默认批准或拒绝，也不重调函数；`inputId` 指向本次决定冻结的稳定输入身份。
 *
 * @example
 * ```ts
 * const failure: InteractionHandlerFailure = {
 *   goalId: "goal-1", interactionId: "question:ask-1", kind: "question",
 *   phase: "handler", code: "HANDLER_FAILED", message: "boom",
 * };
 * ```
 */
export interface InteractionHandlerFailure {
    /** 目标 Goal。 */
    readonly goalId: string;
    /** 发生故障的等待引用。 */
    readonly interactionId: string;
    /** 等待种类。 */
    readonly kind: InteractionViewKind;
    /** 故障阶段。 */
    readonly phase: "handler" | "admission";
    /** 稳定故障分类。 */
    readonly code: "HANDLER_FAILED" | "ADMISSION_REJECTED" | "ADMISSION_UNKNOWN";
    /** 面向宿主的可定位说明。 */
    readonly message: string;
    /** 本次决定冻结的稳定输入身份；处理函数失败时为省略。 */
    readonly inputId?: string;
}

/**
 * 连接自动处理器时的可选宿主回调。
 *
 * @example
 * ```ts
 * const attached = session.attachInteractionHandlers(handlers, {
 *   onFailure: (failure) => console.error(failure.interactionId, failure.code),
 * });
 * ```
 */
export interface InteractionHandlerAttachOptions {
    /** 处理函数故障或决定未被受理时的可定位报告；省略时静默保留等待。 */
    readonly onFailure?: (failure: InteractionHandlerFailure) => void;
}

/** 交互种类到处理函数名称的映射；恢复请求不会落到普通工具审批函数。 */
export function handlerNameFor(view: GoalInteractionView): keyof SessionInteractionHandlers {
    switch (view.kind) {
        case "question": return "onQuestion";
        case "task_approval": return "onTaskApproval";
        case "action_approval": return "onActionApproval";
        case "action_recovery": return "onActionRecovery";
    }
}
