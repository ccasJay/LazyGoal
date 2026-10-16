/**
 * 高频流式文本增量的按帧合并缓冲边界。
 *
 * @remarks
 * SSE `assistant_text_delta` 可能逐字符高频到达；每个 delta 直接提交 React 状态会放大重渲染与强制同步布局。
 * 本缓冲在调度帧内把增量合并为一次提交回调，调用方在回调内把增量累积到自身状态；缓冲与状态分离，
 * 因此 `clear` 只丢弃未提交增量，不负责重置调用方已累积的最终态。
 * 调度帧语义默认取 `requestAnimationFrame`，无 rAF 环境退化为 16ms `setTimeout`。
 * 本缓冲不产生最终文本真值，只保证提交次数不超过帧率量级且顺序、内容与到达一致。
 *
 * @example
 * ```ts
 * const batcher = createTextBatcher((delta) => setLiveText((current) => (current + delta).slice(-8_000)));
 * batcher.push(text);      // 安排合并；同帧后续 push 一并提交
 * batcher.clear();         // 换阶段清屏时丢弃未提交增量
 * batcher.dispose();       // 流断开时取消已排程帧
 * ```
 */
export interface TextBatcher {
  /** 追加一段增量并确保已安排合并帧；同帧内多次调用只产生一次提交。 */
  push(text: string): void;
  /** 丢弃尚未提交的全部增量；清除后残留排程帧为空操作，不影响新流。 */
  clear(): void;
  /** 取消已排程的合并帧并清空缓冲；仅用于流关闭或组件卸载。 */
  dispose(): void;
}

/** 合并帧调度器契约：返回取消函数，重复取消必须安全。 */
export type TextBatchScheduler = (callback: () => void) => () => void;

function defaultScheduler(callback: () => void): () => void {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    const frame = window.requestAnimationFrame(callback);
    return () => window.cancelAnimationFrame(frame);
  }
  const timer = globalThis.setTimeout(callback, 16);
  return () => globalThis.clearTimeout(timer);
}

/**
 * 创建按帧合并的文本增量缓冲。
 *
 * @param apply - 每个合并帧的一次提交回调，参数为该帧内按到达顺序拼接的增量。
 * @param schedule - 合并帧调度器，默认 rAF/`setTimeout` 退化；测试可注入手动调度器。
 * @returns 按 {@link TextBatcher} 契约封装的缓冲实例。
 */
export function createTextBatcher(
  apply: (delta: string) => void,
  schedule: TextBatchScheduler = defaultScheduler,
): TextBatcher {
  let buffered = "";
  let frame: number | null = null;
  let cancelled: (() => void) | undefined;

  function flush(): void {
    frame = null;
    cancelled = undefined;
    if (buffered.length === 0) return;
    const delta = buffered;
    buffered = "";
    apply(delta);
  }

  return {
    push(text: string) {
      if (text.length === 0) return;
      buffered += text;
      if (frame === null) {
        frame = Number.POSITIVE_INFINITY;
        cancelled = schedule(flush);
      }
    },
    clear() {
      buffered = "";
    },
    dispose() {
      buffered = "";
      if (frame !== null) {
        cancelled?.();
        frame = null;
        cancelled = undefined;
      }
    },
  };
}
