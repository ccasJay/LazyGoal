import type { RunState } from "./domain";

export interface RunStore {
    save(run: RunState): Promise<void>;
    load(runId: string): Promise<RunState | undefined>;
}

export class InMemoryRunStore implements RunStore {
    // TODO-1: 声明该 Store 实例内部共享的内存容器。
    // 要求: 通过 Run ID 关联 RunState；每个 ID 只保留一个最新状态。
    // HINT-1: 选择适合按键读写的数据结构。
    // HINT-2: 键和值的类型分别是 string 和 RunState。
    // 在下方声明字段：
    private readonly states = new Map<string, RunState>();

    async save(run: RunState): Promise<void> {
        // TODO-2: 保存或替换该 Run 的最新状态快照。
        // 要求: 使用 run.id 作为键；第一版不保留历史记录。
        // HINT-1: 向 TODO-1 的容器写入一个键值对。
        // HINT-2: 选用的数据结构应能自动覆盖同一个键的旧值。
        this.states.set(run.id, run);
    }

    async load(runId: string): Promise<RunState | undefined> {
        // TODO-3: 根据 Run ID 读取最新状态快照。
        // 要求: 对应 Run 不存在时返回 undefined，而不是抛出异常。
        // HINT-1: 从 TODO-1 的同一个容器中按 runId 查询。
        // HINT-2: 优先使用查询 API 自带的“找不到”返回值。
        return this.states.get(runId);
    }
}
