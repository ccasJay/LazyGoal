/**
 * 会话输入控制的纯决策逻辑。
 *
 * @remarks
 * 这里只保存与 DOM 无关的语义：按键如何解释、一次提交冻结什么身份与载荷、受理结果
 * 如何区分明确拒绝与结果不明。真实受理、授权与执行仍由 Runtime 决定；本模块不发送
 * 请求，也不保存草稿正文。
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
 * 不得写入新目标。排队消息转为 Steer 时也保留其来源绑定，以便同一身份安全重试。
 *
 * @example
 * ```ts
 * const submission: FrozenSubmission = {
 *   inputId: "steer-1", goalId: "goal-1", runId: "run-1",
 *   kind: "steer", content: "聚焦当前步骤",
 * };
 * ```
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
  /** 可选的原排队消息与队列修订绑定；用于原子转换和身份重试。 */
  readonly queueBinding?: { readonly messageId: string; readonly queueRevision: number };
}
