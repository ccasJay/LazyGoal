import { EventSourceParserStream } from "eventsource-parser/stream";

/**
 * 一条按 SSE 规范完成分帧的消息。
 *
 * @remarks
 * 只保留调用方需要的事件名称与正文；`id`、`retry` 与注释由解析器消费，不进入
 * 业务层。未声明 `event:` 的默认事件保留 `event === undefined`，由调用方决定
 * 是否接受。
 *
 * @example
 * ```ts
 * const message: SseMessage = { event: "snapshot", data: "{\"goalId\":\"goal-1\"}" };
 * ```
 */
export interface SseMessage {
  /** `event:` 字段；未声明时为 `undefined`，表示规范默认事件。 */
  readonly event?: string;
  /** 同一事件全部 `data:` 行以 `\n` 连接后的正文。 */
  readonly data: string;
}

/**
 * 把响应字节流解码并按 Server-Sent Events 规范分帧。
 *
 * @remarks
 * 使用 `EventSourceParserStream` 与 `TextDecoderStream` 处理任意 chunk 边界、
 * CRLF／LF／单独 CR、注释行、空行以及可选的 `id`／`retry` 字段；同一事件的多行
 * `data:` 以 `\n` 连接。本函数只负责传输分帧，不识别 metrics 或 Goal 事件的
 * DTO；事件名称映射与 wire 校验由调用方完成。默认容错解析错误：注释、未知字段
 * 与无效 `retry` 不终止流；不可恢复的解析错误或底层读取失败才抛出。
 * 生成器返回、调用方提前结束或 `signal` 中止时都会取消底层 reader。
 *
 * @param body - fetch 响应的字节流；所有权转移给本生成器。
 * @param signal - 可选取消信号；中止后停止产出并取消 reader。
 * @returns 按到达顺序产出的事件消息。
 * @throws 底层流读取失败或不可恢复的解析错误时抛出。
 * @example
 * ```ts
 * for await (const message of readSseMessages(response.body, signal)) {
 *   if (message.event === "snapshot") apply(JSON.parse(message.data));
 * }
 * ```
 */
export async function* readSseMessages(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseMessage> {
  // 标准库将 TextDecoderStream 的 writable 声明为 BufferSource，比 fetch body 的 Uint8Array 更宽。
  const decoded = body.pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>);
  const messages = decoded.pipeThrough(new EventSourceParserStream());
  const reader = messages.getReader();
  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal?.aborted === true) return;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return;
      const { event, data } = chunk.value;
      yield event === undefined ? { data } : { event, data };
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await reader.cancel().catch(() => undefined);
  }
}
