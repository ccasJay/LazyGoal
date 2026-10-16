import assert from "node:assert/strict";
import { test } from "node:test";
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
    reset() {
      queue.length = 0;
    },
  };
}

test("text batcher coalesces deltas within one frame into a single commit", () => {
  const scheduler = fakeScheduler();
  const commits: string[] = [];
  const batcher = createTextBatcher((delta) => commits.push(delta), scheduler.schedule);

  batcher.push("a");
  batcher.push("b");
  assert.equal(commits.length, 0, "deltas wait for the scheduled frame");

  scheduler.flushOnce();
  assert.deepEqual(commits, ["ab"], "one frame coalesces buffered order");

  batcher.push("c");
  assert.equal(commits.length, 1, "next frame is scheduled with fresh buffer");
  scheduler.flushOnce();
  assert.deepEqual(commits, ["ab", "c"]);
});

test("text batcher maintains order and never drops trailing deltas", () => {
  const scheduler = fakeScheduler();
  const commits: string[] = [];
  const batcher = createTextBatcher((delta) => commits.push(delta), scheduler.schedule);

  batcher.push("hello ");
  scheduler.flushOnce();
  batcher.push("wor");
  batcher.push("ld");
  assert.equal(commits.length, 1);
  scheduler.flushOnce();
  scheduler.flushOnce();
  assert.deepEqual(commits.join(""), "hello world");
  assert.equal(scheduler.queue.length, 0, "no pending callback after final flush");
});

test("clear discards buffered deltas and neutralizes pending frames", () => {
  const scheduler = fakeScheduler();
  const commits: string[] = [];
  const batcher = createTextBatcher((delta) => commits.push(delta), scheduler.schedule);

  batcher.push("stale");
  batcher.clear();
  scheduler.flushOnce();
  assert.deepEqual(commits, [], "cleared buffer must not reach the commit callback");

  batcher.push("fresh");
  scheduler.flushOnce();
  assert.deepEqual(commits, ["fresh"], "push after clear starts a new stream");
});

test("cancelling the scheduled frame prevents a flush without an extra edge", () => {
  const scheduler = fakeScheduler();
  const commits: string[] = [];
  let cancel!: () => void;
  const batcher = createTextBatcher(
    (delta) => commits.push(delta),
    (callback) => {
      cancel = scheduler.schedule(callback);
      return cancel;
    },
  );

  batcher.push("a");
  cancel();
  scheduler.flushOnce();
  assert.deepEqual(commits, []);
});
