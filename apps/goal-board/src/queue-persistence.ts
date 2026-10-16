/**
 * 队列的浏览器本地持久化边界（localStorage 镜像层）。
 *
 * @remarks
 * 内存中的队列状态（`useQueue` 的 `queuedByGoal` / `queuePausedByGoal`）是唯一真值；
 * 本模块把每个 Goal 的队列以独立 key `lazygoal.queue.<goalId>` 镜像到 `localStorage`，
 * 页面刷新后由钩子在初始渲染时完整恢复。读取属于 durable/wire 边界：
 * JSON 结构不符合契约时视为损坏，清除该 key 并按空队列恢复，不得将损坏数据放入状态机。
 * 写入失败（配额、隐私模式）静默降级为纯内存队列，不得阻塞入队状态机；
 * 队列空且未暂停时删除对应 key，不残留孤儿数据。
 * key 按 Goal 隔离：读取恢复只作用于各自 Goal，不存在跨 Goal 混用路径。
 *
 * @example
 * ```ts
 * const restored = readStoredQueue(goalId);          // 初始渲染时恢复
 * writeStoredQueue(goalId, { items: [...], paused }); // 状态变化时镜像
 * clearStoredQueue(goalId);                           // Goal 删除或队列消费为空
 * ```
 */
export interface StoredQueue {
  readonly items: readonly { messageId: string; content: string }[];
  readonly paused: boolean;
}

const KEY_PREFIX = "lazygoal.queue.";

function storage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function keyFor(goalId: string): string {
  return `${KEY_PREFIX}${goalId}`;
}

/**
 * 读取并恢复指定 Goal 的持久化队列；损坏或缺失时返回空恢复并清除残留数据。
 *
 * @param goalId - Goal 的稳定标识。
 * @returns 恢复的队列与暂停态；无有效数据时返回 `{ items: [], paused: false }`。
 * @throws `localStorage` 访问被拒绝时退化为空结果，不向上抛错。
 */
export function readStoredQueue(goalId: string): StoredQueue {
  try {
    const raw = storage()?.getItem(keyFor(goalId)) ?? null;
    if (raw === null) return { items: [], paused: false };
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isStoredQueue(parsed)) {
        storage()?.removeItem(keyFor(goalId));
        return { items: [], paused: false };
      }
      return parsed;
    } catch {
      // JSON 损坏与结构非法同属损坏边界：清除残留 key，按空队列恢复。
      storage()?.removeItem(keyFor(goalId));
      return { items: [], paused: false };
    }
  } catch {
    return { items: [], paused: false };
  }
}

/**
 * 把指定 Goal 的队列状态镜像写入 `localStorage`；空且未暂停时删除 key。
 *
 * @param goalId - Goal 的稳定标识。
 * @param queue - 最新内存队列状态。
 * @edges 幂等写；`localStorage` 不可用或配额失败时静默丢弃，不抛错。
 */
export function writeStoredQueue(goalId: string, queue: StoredQueue): void {
  try {
    if (queue.items.length === 0 && !queue.paused) {
      storage()?.removeItem(keyFor(goalId));
      return;
    }
    storage()?.setItem(keyFor(goalId), JSON.stringify(queue));
  } catch {
    // 持久化失败不阻塞内存队列。
  }
}

/** 删除指定 Goal 的队列 key；用于 Goal 删除或队列清理。 */
export function clearStoredQueue(goalId: string): void {
  try {
    storage()?.removeItem(keyFor(goalId));
  } catch {
    // 忽略存储访问失败。
  }
}

/**
 * 初始渲染一次性恢复全部 Goal 的队列镜像。
 *
 * @remarks
 * 键枚举来自 `localStorage` 的 `lazygoal.queue.` 前缀；损坏 key 就地清除并跳过，
 * 不进入状态机。返回两个按 Goal 索引的恢复字典型值，供钩子分别初始化
 * 队列与暂停态状态，避免恢复动作散落到会话效应里。
 */
export function readAllStoredQueues(): {
  items: Record<string, StoredQueue["items"]>;
  paused: Record<string, boolean>;
} {
  const items: Record<string, StoredQueue["items"]> = {};
  const paused: Record<string, boolean> = {};
  const store = storage();
  if (store === undefined) return { items, paused };
  try {
    const keys: string[] = [];
    for (let index = 0; index < store.length; index++) {
      const key = store.key(index);
      if (key !== null && key.startsWith(KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const goalId = key.slice(KEY_PREFIX.length);
      if (goalId.length === 0) continue;
      try {
        const parsed: unknown = JSON.parse(store.getItem(key) ?? "null");
        if (!isStoredQueue(parsed)) {
          store.removeItem(key);
          continue;
        }
        items[goalId] = parsed.items;
        paused[goalId] = parsed.paused;
      } catch {
        store.removeItem(key);
      }
    }
  } catch {
    // 存储不可用时按无镜像恢复。
  }
  return { items, paused };
}

function isStoredQueue(value: unknown): value is StoredQueue {
  if (typeof value !== "object" || value === null) return false;
  const queue = value as { items?: unknown; paused?: unknown };
  if (Array.isArray(queue.items) === false) return false;
  const validItems = (queue.items as readonly unknown[]).every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as { messageId?: unknown }).messageId === "string" &&
      (item as { messageId?: string }).messageId!.length > 0 &&
      typeof (item as { content?: unknown }).content === "string",
  );
  return validItems && (queue.paused === undefined || typeof queue.paused === "boolean");
}
