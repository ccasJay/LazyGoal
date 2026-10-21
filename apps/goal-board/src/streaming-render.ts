/**
 * 流式正文的有界按来源渲染状态。
 *
 * @remarks
 * 临时正文按来源身份独立累积，不再由一条全局字符串承载：换源时旧来源结算，新来源
 * 单独累积，因此不同调用／块的正文不会接在同一条尾部。每个来源的正文有界，超出上限
 * 时显式标记截断而不是丢弃开头。整块响应与从存储恢复的正式消息不经过本状态。
 */

/** 单个来源的临时正文。 */
export interface LivePreviewSource {
  /** 来源身份；同一来源的增量累积到同一条正文。 */
  readonly sourceKey: string;
  /** 所属 Run 身份。 */
  readonly runId: string;
  /** 已累积的公开正文。 */
  readonly content: string;
  /** 最近一次增量的来源游标。 */
  readonly cursor: number;
  /** 正文是否因公开上限被截断。 */
  readonly truncated: boolean;
}

/**
 * 按来源索引的临时正文状态。
 *
 * @remarks
 * 状态只保留最近打开的有限来源；更早的来源在结算后被释放。
 */
export interface LivePreviewState {
  /** 按开启顺序排列的临时正文来源。 */
  readonly sources: readonly LivePreviewSource[];
}

/** 同时保留的临时正文来源上限。 */
export const MAX_LIVE_PREVIEW_SOURCES = 4;
/** 单个来源的公开正文上限（UTF-16 code unit）。 */
export const MAX_LIVE_PREVIEW_LENGTH = 64_000;

/**
 * 创建空的临时正文状态。
 *
 * @returns 没有任何来源的初始状态。
 * @example
 * ```ts
 * createLivePreviewState();
 * ```
 */
export function createLivePreviewState(): LivePreviewState {
  return { sources: [] };
}

/**
 * 打开一个来源。
 *
 * @remarks
 * 同一来源重复打开只更新其 Run 身份；来源数超出上限时释放最早的来源。
 *
 * @param state - 当前状态。
 * @param source - 来源身份。
 * @returns 更新后的状态。
 * @example
 * ```ts
 * openSource(state, { sourceKey: "call-1", runId: "run-1" });
 * ```
 */
export function openSource(
  state: LivePreviewState,
  source: { readonly sourceKey: string; readonly runId: string },
): LivePreviewState {
  const existing = state.sources.find((item) => item.sourceKey === source.sourceKey);
  if (existing !== undefined) {
    return {
      sources: state.sources.map((item) => item.sourceKey === source.sourceKey
        ? { ...item, runId: source.runId }
        : item),
    };
  }
  const next: LivePreviewSource = {
    sourceKey: source.sourceKey,
    runId: source.runId,
    content: "",
    cursor: 0,
    truncated: false,
  };
  return { sources: [...state.sources, next].slice(-MAX_LIVE_PREVIEW_SOURCES) };
}

/**
 * 追加一段来源增量。
 *
 * @remarks
 * 增量按到达顺序累积到同一来源；超出公开上限时保留开头并标记截断，不丢尾部以外的
 * 内容，也不丢弃先前累积的正文。
 *
 * @param state - 当前状态。
 * @param delta - 增量与其来源身份。
 * @returns 更新后的状态。
 * @example
 * ```ts
 * applyTextDelta(state, { sourceKey: "call-1", runId: "run-1", text: "hi", cursor: 3 });
 * ```
 */
export function applyTextDelta(
  state: LivePreviewState,
  delta: {
    readonly sourceKey: string;
    readonly runId: string;
    readonly text: string;
    readonly cursor: number;
  },
): LivePreviewState {
  const opened = openSource(state, delta);
  return {
    sources: opened.sources.map((item) => {
      if (item.sourceKey !== delta.sourceKey) return item;
      const content = `${item.content}${delta.text}`;
      const truncated = content.length > MAX_LIVE_PREVIEW_LENGTH;
      return {
        ...item,
        content: truncated ? content.slice(0, MAX_LIVE_PREVIEW_LENGTH) : content,
        cursor: Math.max(item.cursor, delta.cursor),
        truncated,
      };
    }),
  };
}

/**
 * 结算一个来源。
 *
 * @remarks
 * 结算表示该来源不会再继续累积；正文保留到正式消息接管或被显式释放为止。
 *
 * @param state - 当前状态。
 * @param sourceKey - 来源身份。
 * @returns 更新后的状态。
 * @example
 * ```ts
 * settleSource(state, "call-1");
 * ```
 */
export function settleSource(state: LivePreviewState, sourceKey: string): LivePreviewState {
  return { sources: state.sources.filter((item) => item.sourceKey !== sourceKey) };
}

/**
 * 释放某个 Run 的全部临时正文来源。
 *
 * @remarks
 * 换 Goal、切换 Run 或正式消息接管后调用；只释放临时正文，不影响正式消息与候选。
 *
 * @param state - 当前状态。
 * @param runId - Run 身份；省略时释放全部来源。
 * @returns 更新后的状态。
 * @example
 * ```ts
 * releaseSources(state, "run-1");
 * ```
 */
export function releaseSources(state: LivePreviewState, runId?: string): LivePreviewState {
  if (runId === undefined) return createLivePreviewState();
  return { sources: state.sources.filter((item) => item.runId !== runId) };
}

/**
 * 取得某个来源当前的临时正文。
 *
 * @param state - 当前状态。
 * @param sourceKey - 来源身份。
 * @returns 该来源的正文；不存在时返回 `undefined`。
 * @example
 * ```ts
 * readSource(state, "call-1")?.content;
 * ```
 */
export function readSource(state: LivePreviewState, sourceKey: string): LivePreviewSource | undefined {
  return state.sources.find((item) => item.sourceKey === sourceKey);
}

/**
 * 取得某个 Run 最近的临时正文来源。
 *
 * @param state - 当前状态。
 * @param runId - Run 身份。
 * @returns 最近的来源；不存在时返回 `undefined`。
 * @example
 * ```ts
 * latestSource(state, "run-1");
 * ```
 */
export function latestSource(state: LivePreviewState, runId: string): LivePreviewSource | undefined {
  return [...state.sources].reverse().find((item) => item.runId === runId);
}
