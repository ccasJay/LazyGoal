/**
 * 会话输入控制的纯决策逻辑。
 *
 * @remarks
 * 这里只保存与 DOM 无关的语义：按键如何解释、一次提交冻结什么身份与载荷、受理结果
 * 如何区分明确拒绝与结果不明、以及队列清空需要确认的范围。真实受理、授权与执行仍由
 * Runtime 决定；本模块不发送请求，也不保存草稿正文。
 */

/** 一次按键在普通输入框中的语义。 */
export type ComposerKeyOutcome =
  | { readonly kind: "submit" }
  | { readonly kind: "newline" }
  | { readonly kind: "ignore" };

/**
 * 解释输入框的一次按键。
 *
 * @remarks
 * Enter 直接提交普通消息；Shift+Enter 保留换行；输入法组合期间的 Enter 不提交，
 * 也不插入额外换行。
 *
 * @param event - 按键事件的关键字段。
 * @returns 该按键的语义。
 * @example
 * ```ts
 * resolveComposerKey({ key: "Enter", shiftKey: false, isComposing: false }).kind; // "submit"
 * ```
 */
export function resolveComposerKey(event: {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly isComposing: boolean;
}): ComposerKeyOutcome {
  if (event.key !== "Enter") return { kind: "ignore" };
  if (event.isComposing) return { kind: "ignore" };
  if (event.shiftKey) return { kind: "newline" };
  return { kind: "submit" };
}

/**
 * 一次会话输入的冻结身份与载荷。
 *
 * @remarks
 * 冻结后的身份用于核验与原身份重试；迟到响应只能作用于该身份对应的 Goal 与 Run，
 * 不得写入新目标。
 */
export interface FrozenSubmission {
  /** 原输入身份；核验与重试必须沿用它。 */
  readonly inputId: string;
  /** 提交时的 Goal 身份。 */
  readonly goalId: string;
  /** 提交时的 Run 身份。 */
  readonly runId: string;
  /** 输入种类。 */
  readonly kind: "message" | "steer";
  /** 冻结载荷正文。 */
  readonly content: string;
}

/**
 * 受理结果的语义分类。
 *
 * @remarks
 * `rejected` 是服务端给出的明确业务拒绝；`unknown` 表示响应丢失或读取失败，页面不得
 * 把它显示为已受理，也不得改用新身份重复发送。
 */
export type SubmissionOutcome =
  | { readonly kind: "accepted"; readonly existing: boolean }
  | { readonly kind: "rejected"; readonly code: string }
  | { readonly kind: "unknown" };

/**
 * 把一次提交尝试归类为受理、明确拒绝或结果不明。
 *
 * @remarks
 * 只有服务端返回的结构化拒绝才算 `rejected`；网络异常与响应解析失败都属于
 * `unknown`，此时必须保留原身份与冻结载荷等待核验。
 *
 * @param accepted - 服务端返回的受理结果；未收到响应时为 `undefined`。
 * @param error - 捕获到的异常；未失败时省略。
 * @returns 该次提交尝试的语义分类。
 * @example
 * ```ts
 * classifySubmissionAttempt(undefined, new Error("network down")).kind; // "unknown"
 * ```
 */
export function classifySubmissionAttempt(
  accepted: { readonly ok: true; readonly existing: boolean } | { readonly ok: false; readonly error: string } | undefined,
  error?: unknown,
): SubmissionOutcome {
  if (accepted !== undefined) {
    if (accepted.ok) return { kind: "accepted", existing: accepted.existing };
    return { kind: "rejected", code: accepted.error };
  }
  if (isStructuredRejection(error)) return { kind: "rejected", code: error.code };
  return { kind: "unknown" };
}

/**
 * 判断异常是否为服务端给出的结构化拒绝。
 *
 * @remarks
 * 结构化拒绝带有稳定业务码与 `refresh` 标记；网络异常没有这些字段，因此不会与
 * 明确拒绝混淆。
 *
 * @param error - 待判断的异常。
 * @returns 是否为结构化拒绝。
 * @example
 * ```ts
 * if (isStructuredRejection(error)) console.log(error.code);
 * ```
 */
export function isStructuredRejection(error: unknown): error is { readonly code: string; readonly refresh: boolean } {
  return typeof error === "object"
    && error !== null
    && typeof (error as { readonly code?: unknown }).code === "string"
    && typeof (error as { readonly refresh?: unknown }).refresh === "boolean";
}

/**
 * 受理结果不明、等待核验或原身份重试的输入集合。
 *
 * @remarks
 * 每条记录保留原 `inputId` 与冻结载荷；核验成功后或用户放弃后移除。
 */
export interface UnverifiedSubmissionState {
  /** 当前等待核验的输入。 */
  readonly submissions: readonly FrozenSubmission[];
}

/**
 * 更新等待核验的输入集合。
 *
 * @remarks
 * 同一 `inputId` 只保留一条记录；核验成功与放弃都只移除该身份，不影响其它输入。
 *
 * @param current - 当前集合。
 * @param event - 集合变化。
 * @returns 更新后的集合。
 * @example
 * ```ts
 * reduceUnverifiedSubmissions([], { kind: "record", submission }).submissions.length; // 1
 * ```
 */
export function reduceUnverifiedSubmissions(
  current: readonly FrozenSubmission[],
  event:
    | { readonly kind: "record"; readonly submission: FrozenSubmission }
    | { readonly kind: "settled"; readonly inputId: string },
): readonly FrozenSubmission[] {
  if (event.kind === "settled") {
    return current.filter((item) => item.inputId !== event.inputId);
  }
  if (current.some((item) => item.inputId === event.submission.inputId)) return current;
  return [...current, event.submission];
}

/**
 * 判断一次迟到响应是否仍属于当前目标。
 *
 * @remarks
 * Goal 或 Run 已经变化时，迟到响应不得清空新目标的草稿，也不得把结果写给新目标。
 *
 * @param submission - 提交时冻结的身份。
 * @param target - 当前目标；未选择 Goal 时为 `undefined`。
 * @returns 是否仍属于同一目标。
 * @example
 * ```ts
 * isSameSubmissionTarget(submission, { goalId: "goal-1", currentRunId: "run-1" });
 * ```
 */
export function isSameSubmissionTarget(
  submission: { readonly goalId: string; readonly runId: string },
  target: { readonly goalId: string; readonly currentRunId: string } | undefined,
): boolean {
  if (target === undefined) return false;
  return submission.goalId === target.goalId && submission.runId === target.currentRunId;
}

/**
 * 生成队列清空的确认范围文案。
 *
 * @remarks
 * 清空只按服务端已受理队列的真实条数确认范围；页面不维护本地队列镜像。
 *
 * @param queuedCount - 服务端已受理队列的条数。
 * @returns 确认文案；队列为空时返回 `undefined`。
 * @example
 * ```ts
 * queueClearScope(2); // "Clear 2 accepted queued tasks?"
 * ```
 */
export function queueClearScope(queuedCount: number): string | undefined {
  if (queuedCount <= 0) return undefined;
  return queuedCount === 1
    ? "Clear 1 accepted queued task?"
    : `Clear ${queuedCount} accepted queued tasks?`;
}

/**
 * Steer 决定当前是否可用及其原因。
 *
 * @remarks
 * Steer 以“当前 Run 正在执行什么”为前提，因此状态可能过期时不可用；普通发送不受
 * 该限制。
 */
export type SteerActionState =
  | { readonly enabled: true }
  | { readonly enabled: false; readonly reason: "busy" | "stale" | "empty-draft" };

/**
 * 判断 Steer 入口当前是否可用。
 *
 * @param input - 提交在途、状态新鲜度与草稿状态。
 * @returns Steer 入口的可用性与原因。
 * @example
 * ```ts
 * steerActionState({ busy: false, stale: true, hasDraft: true }).enabled; // false
 * ```
 */
export function steerActionState(input: {
  readonly busy: boolean;
  readonly stale: boolean;
  readonly hasDraft: boolean;
}): SteerActionState {
  if (input.busy) return { enabled: false, reason: "busy" };
  if (input.stale) return { enabled: false, reason: "stale" };
  if (!input.hasDraft) return { enabled: false, reason: "empty-draft" };
  return { enabled: true };
}
