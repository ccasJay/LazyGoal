import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearStoredQueue,
  readStoredQueue,
  writeStoredQueue,
} from "../src/queue-persistence";

type MemoryStorage = Record<string, string>;

function installStorage(initial: MemoryStorage = {}): {
  store: MemoryStorage;
  restore: () => void;
} {
  const store: MemoryStorage = { ...initial };
  const storageStub = {
    getItem: (key: string) => (key in store ? store[key]! : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
  const previous = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = storageStub;
  return {
    store,
    restore: () => {
      (globalThis as { localStorage?: unknown }).localStorage = previous;
    },
  };
}

test("queue mirror round-trips per goal without cross-goal mixing", () => {
  const { store, restore } = installStorage();
  try {
    const queueA = { items: [{ messageId: "m-1", content: "First" }], paused: false };
    const queueB = { items: [{ messageId: "m-2", content: "Second" }, { messageId: "m-3", content: "Third" }], paused: true };
    writeStoredQueue("goal-a", queueA);
    writeStoredQueue("goal-b", queueB);

    assert.deepEqual(readStoredQueue("goal-a"), queueA);
    assert.deepEqual(readStoredQueue("goal-b"), queueB);
    assert.ok(`lazygoal.queue.goal-a` in store, "per-goal keys are independent");
    clearStoredQueue("goal-a");
    assert.ok(!(`lazygoal.queue.goal-a` in store), "cleared goal removes its key");
    assert.deepEqual(readStoredQueue("goal-b").paused, true, "other goal keeps its mirror");
  } finally {
    restore();
  }
});

test("corrupt stored queue data is treated as empty and cleared", () => {
  const { store, restore } = installStorage({
    "lazygoal.queue.goal-c": "{not json",
    "lazygoal.queue.goal-d": JSON.stringify({ items: [{ messageId: 7, content: "bad" }], paused: false }),
    "lazygoal.queue.goal-e": JSON.stringify({ items: "not-array", paused: false }),
  });
  try {
    assert.deepEqual(readStoredQueue("goal-c"), { items: [], paused: false });
    assert.deepEqual(readStoredQueue("goal-d"), { items: [], paused: false });
    assert.deepEqual(readStoredQueue("goal-e"), { items: [], paused: false });
    for (const goalId of ["goal-c", "goal-d", "goal-e"]) {
      assert.ok(!(`lazygoal.queue.${goalId}` in store), "corrupt keys are removed instead of re-entering the state machine");
    }
  } finally {
    restore();
  }
});

test("empty unpaused queue removes the mirror instead of keeping orphans", () => {
  const { store, restore } = installStorage();
  try {
    writeStoredQueue("goal-f", { items: [{ messageId: "m-9", content: "Pending" }], paused: false });
    assert.ok(`lazygoal.queue.goal-f` in store);
    writeStoredQueue("goal-f", { items: [], paused: false });
    assert.ok(!(`lazygoal.queue.goal-f` in store), "consumed queue leaves no orphan key");

    writeStoredQueue("goal-g", { items: [], paused: true });
    assert.ok(`lazygoal.queue.goal-g` in store, "paused empty queue stays to signal the paused state");
  } finally {
    restore();
  }
});

test("unavailable storage degrades to in-memory behavior", async () => {
  const previous = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = {
    get getItem(): string {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
    removeItem() {
      throw new Error("SecurityError");
    },
  };
  try {
    assert.doesNotThrow(() => writeStoredQueue("goal-h", { items: [{ messageId: "m", content: "x" }], paused: false }));
    assert.deepEqual(readStoredQueue("goal-h"), { items: [], paused: false });
    assert.doesNotThrow(() => clearStoredQueue("goal-h"));
  } finally {
    (globalThis as { localStorage?: unknown }).localStorage = previous;
  }
});
