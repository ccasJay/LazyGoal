import type { RunState } from "./domain";

export interface RunStore {
    save(run: RunState): Promise<void>;
    load(runId: string): Promise<RunState | undefined>;
}

export class InMemoryRunStore implements RunStore {
    async save(run: RunState): Promise<void> {
        // EXERCISE-2: 保存或替换该 Run 的最新状态快照。
        // 要求: 使用 run.id 作为键；第一版不保留历史记录。
        // HINT-1: 后续可以用 Map<string, RunState> 保存数据。
        throw new Error("TODO: EXERCISE-2");
    }

    async load(runId: string): Promise<RunState | undefined> {
        // EXERCISE-3: 根据 Run ID 读取最新状态快照。
        // 要求: 对应 Run 不存在时返回 undefined，而不是抛出异常。
        // HINT-1: 返回与 save 使用的同一个 Map 中的查询结果。
        throw new Error("TODO: EXERCISE-3");
    }
}
