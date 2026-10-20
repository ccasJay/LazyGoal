import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_LIVE_PREVIEW_LENGTH,
  MAX_LIVE_PREVIEW_SOURCES,
  applyTextDelta,
  createLivePreviewState,
  latestSource,
  openSource,
  readSource,
  releaseSources,
  settleSource,
} from "../src/streaming-render";
import { createTextBatcher } from "../src/live-text-batch";

type ScheduledCallback = () => void;

function fakeScheduler() {
  const queue: ScheduledCallback[] = [];
  return {
    queue,
    schedule(callback: ScheduledCallback): () => void {
      queue.push(callback);
      return () => {
        const index = queue.indexOf(callback);
        if (index >= 0) queue.splice(index, 1);
      };
    },
    flushOnce() {
      const callback = queue.shift();
      callback?.();
    },
  };
}

test("大量增量只更新当前来源，帧内合并为一次提交", () => {
  const scheduler = fakeScheduler();
  let state = createLivePreviewState();
  state = openSource(state, { sourceKey: "run-1:segment:1", runId: "run-1" });
  const batcher = createTextBatcher((delta: string) => {
    state = applyTextDelta(state, { sourceKey: "run-1:segment:1", runId: "run-1", text: delta, cursor: 0 });
  }, scheduler.schedule);

  for (let index = 0; index < 500; index += 1) batcher.push("x");
  assert.equal(readSource(state, "run-1:segment:1")?.content, "", "帧内不提交，正文等待合并帧");

  scheduler.flushOnce();
  assert.equal(readSource(state, "run-1:segment:1")?.content.length, 500);
  assert.equal(state.sources.length, 1, "只更新当前来源");
  assert.equal(scheduler.queue.length, 0, "一帧只提交一次");
});

test("换源时旧来源保留已到达正文，新来源独立累积", () => {
  let state = createLivePreviewState();
  state = applyTextDelta(state, { sourceKey: "call-1", runId: "run-1", text: "第一段", cursor: 1 });
  state = applyTextDelta(state, { sourceKey: "call-2", runId: "run-1", text: "第二段", cursor: 2 });

  assert.equal(readSource(state, "call-1")?.content, "第一段");
  assert.equal(readSource(state, "call-2")?.content, "第二段");
  assert.equal(state.sources.length, 2);

  state = settleSource(state, "call-1");
  assert.equal(readSource(state, "call-1"), undefined);
  assert.equal(readSource(state, "call-2")?.content, "第二段");
});

test("结算边界提交待合并尾部，不丢已经到达的正文", () => {
  const scheduler = fakeScheduler();
  let state = createLivePreviewState();
  state = openSource(state, { sourceKey: "call-1", runId: "run-1" });
  const batcher = createTextBatcher((delta: string) => {
    state = applyTextDelta(state, { sourceKey: "call-1", runId: "run-1", text: delta, cursor: 0 });
  }, scheduler.schedule);

  batcher.push("尾部");
  batcher.flush();
  assert.equal(readSource(state, "call-1")?.content, "尾部", "结算边界立即提交待合并增量");
  assert.equal(scheduler.queue.length, 0);
});

test("正文超过公开上限时保留开头并标记截断，不丢弃已到达内容", () => {
  let state = createLivePreviewState();
  state = applyTextDelta(state, { sourceKey: "call-1", runId: "run-1", text: "a".repeat(MAX_LIVE_PREVIEW_LENGTH + 10), cursor: 1 });

  const source = readSource(state, "call-1");
  assert.equal(source?.content.length, MAX_LIVE_PREVIEW_LENGTH);
  assert.equal(source?.truncated, true);
  assert.equal(source?.content.startsWith("aaa"), true);
});

test("同时保留的临时正文来源有界，更早的来源被释放", () => {
  let state = createLivePreviewState();
  for (let index = 0; index < MAX_LIVE_PREVIEW_SOURCES + 3; index += 1) {
    state = applyTextDelta(state, { sourceKey: `call-${index}`, runId: "run-1", text: "x", cursor: index });
  }
  assert.equal(state.sources.length, MAX_LIVE_PREVIEW_SOURCES);
  assert.equal(readSource(state, "call-0"), undefined);
  assert.notEqual(readSource(state, `call-${MAX_LIVE_PREVIEW_SOURCES + 2}`), undefined);
});

test("切换 Run 时释放该 Run 的临时正文，正式消息不受影响", () => {
  let state = createLivePreviewState();
  state = applyTextDelta(state, { sourceKey: "call-1", runId: "run-1", text: "旧 Run", cursor: 1 });
  state = applyTextDelta(state, { sourceKey: "call-2", runId: "run-2", text: "新 Run", cursor: 2 });

  state = releaseSources(state, "run-1");
  assert.equal(readSource(state, "call-1"), undefined);
  assert.equal(latestSource(state, "run-2")?.content, "新 Run");
});
