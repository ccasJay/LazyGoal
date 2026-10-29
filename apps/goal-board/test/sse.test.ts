import assert from "node:assert/strict";
import { test } from "node:test";

import { readSseMessages, type SseMessage } from "../src/sse";

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { location: { hash: "#test-access" } },
});
const { BrowserApiError, browserApi } = await import("../src/api");

const encoder = new TextEncoder();

/** 按给定字符串或字节片段构造字节流，并在取消时记录调用。 */
function chunkedStream(
  chunks: readonly (string | Uint8Array)[],
  onCancel?: () => void,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
    cancel() {
      onCancel?.();
    },
  });
}

/** 把一段 SSE 文本切成固定字节大小的 chunk，模拟任意网络分块边界。 */
function splitBytes(text: string, size: number): Uint8Array[] {
  const bytes = encoder.encode(text);
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += size) {
    chunks.push(bytes.subarray(offset, offset + size));
  }
  return chunks;
}

function eventStream(text: string, status = 200): Response {
  return new Response(chunkedStream(splitBytes(text, 5)), {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

async function collect(generator: AsyncGenerator<SseMessage>): Promise<SseMessage[]> {
  const messages: SseMessage[] = [];
  for await (const message of generator) messages.push(message);
  return messages;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 2_000) throw new Error("timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const snapshot = {
  goalId: "goal-1",
  roundCount: 1,
  stepCount: 2,
  reportedCalls: 1,
  missingCalls: 0,
  inputTokens: 120,
  outputTokens: 40,
  coverage: "complete",
  cacheMeasuredCalls: 1,
  cacheExcludedCalls: 0,
  cacheHitRate: 0.5,
  throughputMeasuredCalls: 1,
  throughputExcludedCalls: 0,
  tokensPerSecond: 25,
  contextRemainingPercent: 0.4,
  runs: [],
} as const;

const liveEvent = {
  type: "activity",
  goalId: "goal-1",
  runId: "run-1",
  activity: { kind: "model_started" },
} as const;

test("统一 SSE 解析器处理任意切分、换行符、注释与多行 data", async () => {
  const text = ": keepalive\r\n\r\n"
    + "id: 7\r\nretry: 500\r\n\r\n"
    + "event: update\r\ndata: {\"value\":1}\r\n\r\n"
    + "event: snapshot\rdata: 正文一行\rdata: 正文两行\r\r"
    + ": another comment\n\n"
    + "data: plain\n\n"
    + "event: no-data\n\n";
  // 逐字节切分既覆盖跨 chunk 行拼接，也覆盖 UTF-8 多字节字符被拆开的边界。
  const messages = await collect(readSseMessages(chunkedStream(splitBytes(text, 1))));
  assert.deepEqual(messages, [
    { event: "update", data: "{\"value\":1}" },
    { event: "snapshot", data: "正文一行\n正文两行" },
    { data: "plain" },
  ]);
});

test("统一 SSE 解析器在提前返回与 signal 中止时取消底层 reader", async () => {
  let earlyCancels = 0;
  const open = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("event: update\ndata: first\n\n"));
    },
    cancel() {
      earlyCancels += 1;
    },
  });
  const generator = readSseMessages(open);
  const first = await generator.next();
  assert.deepEqual(first.value, { event: "update", data: "first" });
  await generator.return(undefined);
  assert.equal(earlyCancels, 1, "生成器提前返回时取消 reader");

  let abortCancels = 0;
  const abort = new AbortController();
  const aborting = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("event: update\ndata: first\n\n"));
    },
    cancel() {
      abortCancels += 1;
    },
  });
  const received: SseMessage[] = [];
  for await (const message of readSseMessages(aborting, abort.signal)) {
    received.push(message);
    abort.abort();
  }
  assert.deepEqual(received, [{ event: "update", data: "first" }]);
  assert.equal(abortCancels, 1, "signal 中止时取消 reader");
});

test("metrics 映射只接受 snapshot 与 error，并区分无效数据与传输错误", async (t) => {
  t.mock.method(globalThis, "fetch", async () => eventStream(
    `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`
    + "event: unrelated\ndata: {\"ignored\":true}\n\n"
    + "data: {\"ignored\":true}\n\n"
    + `event: snapshot\ndata: ${JSON.stringify({ ...snapshot, tokensPerSecond: 30 })}\n\n`,
  ));
  const values = [];
  for await (const value of browserApi.metrics("goal-1", new AbortController().signal)) values.push(value);
  assert.deepEqual(values, [snapshot, { ...snapshot, tokensPerSecond: 30 }]);

  t.mock.method(globalThis, "fetch", async () => eventStream("event: error\ndata: {\"error\":\"metrics_unavailable\"}\n\n"));
  await assert.rejects(
    () => collect(browserApi.metrics("goal-1", new AbortController().signal)),
    /metrics_unavailable/,
  );

  t.mock.method(globalThis, "fetch", async () => eventStream("event: snapshot\ndata: not-json\n\n"));
  await assert.rejects(
    () => collect(browserApi.metrics("goal-1", new AbortController().signal)),
    /invalid_metrics_response/,
  );

  t.mock.method(globalThis, "fetch", async () => eventStream("event: snapshot\ndata: {\"goalId\":\"\"}\n\n"));
  await assert.rejects(
    () => collect(browserApi.metrics("goal-1", new AbortController().signal)),
    /invalid_metrics_response/,
  );

  t.mock.method(globalThis, "fetch", async () => eventStream("event: unrelated\ndata: {}\n\n"));
  assert.deepEqual(await collect(browserApi.metrics("goal-1", new AbortController().signal)), []);

  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "metrics_unavailable" }, { status: 503 }));
  await assert.rejects(
    () => collect(browserApi.metrics("goal-1", new AbortController().signal)),
    (error: unknown) => error instanceof BrowserApiError
      && error.code === "metrics_unavailable"
      && error.status === 503,
  );

  t.mock.method(globalThis, "fetch", async () => new Response(null));
  await assert.rejects(
    () => collect(browserApi.metrics("goal-1", new AbortController().signal)),
    /metrics_stream_missing_body/,
  );
});

test("Goal events 映射接受 update 与未命名事件，忽略未知事件并拒绝无效数据", async (t) => {
  t.mock.method(globalThis, "fetch", async () => eventStream(
    `event: update\ndata: ${JSON.stringify(liveEvent)}\n\n`
    + "event: future_event\ndata: {\"ignored\":true}\n\n"
    + `data: ${JSON.stringify(liveEvent)}\n\n`,
  ));
  const values = [];
  for await (const value of browserApi.events("goal-1", new AbortController().signal)) values.push(value);
  assert.deepEqual(values, [liveEvent, liveEvent]);

  t.mock.method(globalThis, "fetch", async () => eventStream("event: update\ndata: not-json\n\n"));
  await assert.rejects(
    () => collectValues(browserApi.events("goal-1", new AbortController().signal)),
    /invalid_event_response/,
  );

  t.mock.method(globalThis, "fetch", async () => eventStream("event: update\ndata: {\"type\":\"unknown\"}\n\n"));
  await assert.rejects(
    () => collectValues(browserApi.events("goal-1", new AbortController().signal)),
    /invalid_event_response/,
  );

  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "stream_unavailable" }, { status: 500 }));
  await assert.rejects(
    () => collectValues(browserApi.events("goal-1", new AbortController().signal)),
    (error: unknown) => error instanceof BrowserApiError && error.code === "stream_unavailable",
  );

  t.mock.method(globalThis, "fetch", async () => new Response(null));
  await assert.rejects(
    () => collectValues(browserApi.events("goal-1", new AbortController().signal)),
    /event_stream_missing_body/,
  );
});

test("Goal events 在客户端中止后停止产出并取消 reader", async (t) => {
  let cancelled = 0;
  const abort = new AbortController();
  t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`event: update\ndata: ${JSON.stringify(liveEvent)}\n\n`));
    },
    cancel() {
      cancelled += 1;
    },
  }), { status: 200, headers: { "content-type": "text/event-stream" } }));

  const received: unknown[] = [];
  const consuming = (async () => {
    for await (const value of browserApi.events("goal-1", abort.signal)) {
      received.push(value);
      abort.abort();
    }
  })();
  await waitFor(() => received.length === 1);
  await consuming;
  assert.deepEqual(received, [liveEvent]);
  assert.equal(cancelled, 1);
});

/** Goal 事件生成器产出的 DTO 与 metrics 不同，单独收集以避免交叉类型收窄。 */
async function collectValues<T>(generator: AsyncGenerator<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of generator) values.push(value);
  return values;
}
