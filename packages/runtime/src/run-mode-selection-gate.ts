import type { GoalStore } from "./goal-store";

const gatesByStore = new WeakMap<object, Map<string, Promise<void>>>();

/**
 * 串行化同一 Store 中某个 Goal 的 Run 模式选择与启动提交。
 *
 * @remarks
 * 这是进程内提交边界：`operation` 必须在完成影响 Run.mode、nextRunMode 或
 * `run_started` 的 Snapshot 提交后返回。模型调用和 Run 执行不能放在此边界内。
 * 同一 GoalStore 实例上的 Runner 与 Coordinator 共用队列。
 *
 * @param store - Runner 与 Coordinator 共同使用的 GoalStore 实例。
 * @param goalId - 需要线性化模式选择与启动的 Goal。
 * @param operation - 读取最新快照并提交单个模式或启动转换的操作。
 * @returns 操作的返回值。
 * @example
 * ```ts
 * await withRunModeSelectionGate(store, goalId, async () => store.restore(goalId));
 * ```
 */
export async function withRunModeSelectionGate<T>(
    store: GoalStore,
    goalId: string,
    operation: () => Promise<T>,
): Promise<T> {
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
    try {
        return await operation();
    } finally {
        release();
        if (gates.get(goalId) === current) gates.delete(goalId);
    }
}
