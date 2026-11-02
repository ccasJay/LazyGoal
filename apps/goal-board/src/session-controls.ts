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


