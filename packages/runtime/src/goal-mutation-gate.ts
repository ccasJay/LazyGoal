import { AsyncLocalStorage } from "node:async_hooks";

import type { GoalStore } from "./goal-store";

const gatesByStore = new WeakMap<object, Map<string, Promise<void>>>();
const heldGates = new AsyncLocalStorage<{ readonly store: object; readonly goalIds: ReadonlySet<string> }>();

/**
 * 在单个 GoalStore 实例上串行化同一 Goal 的短提交边界。
 *
 * @remarks
 * 这是进程内提交边界：`operation` 必须在完成影响该 Goal 任一持久化字段的读取与
 * Snapshot 提交后返回。所有 Snapshot 写路径（Launcher、Runner、Coordinator、
 * 会话受理、模型选择与管理写入）共用同一按 Goal 的队列，使受理顺序、身份判定和
 * 状态提交线性化，避免旧快照覆盖并发受理。
 *
 * 边界内不得包含模型调用、工具执行或人工等待；需要长时间等待的工作必须先释放
 * 边界，再在等待结束后重新读取最新快照。同一异步调用链已持有同一 Store 与 Goal
 * 的边界时会直接进入，允许共享提交器在已受理路径内安全地重复进入。
 *
 * @param store - 所有写路径共同使用的 GoalStore 实例。
 * @param goalId - 需要线性化提交的 Goal。
 * @param operation - 读取最新快照并提交单个短转换的操作。
 * @returns 操作的返回值。
 * @example
 * ```ts
 * await withGoalMutationGate(store, goalId, async () => store.restore(goalId));
 * ```
 */
export async function withGoalMutationGate<T>(
    store: GoalStore,
    goalId: string,
    operation: () => Promise<T>,
): Promise<T> {
    const held = heldGates.getStore();
    if (held !== undefined && held.store === store && held.goalIds.has(goalId)) {
        return operation();
    }

    let gates = gatesByStore.get(store);
    if (gates === undefined) {
        gates = new Map();
        gatesByStore.set(store, gates);
    }

    const previous = gates.get(goalId);
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
        release = resolve;
    });
    gates.set(goalId, current);

    if (previous !== undefined) await previous;
    const goalIds = new Set(held !== undefined && held.store === store ? held.goalIds : []);
    goalIds.add(goalId);
    try {
        return await heldGates.run({ store, goalIds }, operation);
    } finally {
        release();
        if (gates.get(goalId) === current) gates.delete(goalId);
    }
}
