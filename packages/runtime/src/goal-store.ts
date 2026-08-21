import type { Goal, RunStatus } from "./domain";

/**
 * Goal 聚合的持久化边界。
 *
 * @remarks
 * GoalStore 以 goalId 定位一个 Goal 的最新完整快照，不提供历史或事件查询。
 * 对同一 ID 再次保存会覆盖先前版本，实现必须在 resolve 前完成本次保存。
 * 具体内存与 JSON 文件实现由 `@lazygoal/storage` 提供。
 */
export interface GoalStore {
    /**
     * 校验并保存一个完整 Goal 快照。
     *
     * @param goal - 需要成为最新版本的完整 Session 聚合。
     * @throws 快照不符合协议或底层存储写入失败时抛出异常。
     *
     * @example
     * ```ts
     * await store.save(goal);
     * ```
     */
    save(goal: Goal): Promise<void>;

    /**
     * 恢复指定 Goal 的最新完整快照。
     *
     * @param goalId - Session 的稳定标识。
     * @returns 最新快照；不存在时返回 `undefined`。
     * @throws 已存在快照损坏或底层存储读取失败时抛出异常。
     */
    restore(goalId: string): Promise<Goal | undefined>;
}

/**
 * 可恢复 Goal 列表中的轻量摘要。
 *
 * @remarks
 * `updatedAt` 是正式 JSON 快照最近一次成功原子替换后的文件修改时间，使用
 * ISO 8601 UTC 字符串表示。条目不包含完整 Goal，调用方需要通过 `goalId`
 * 再次恢复快照；终态 Run 不会出现在列表中。
 *
 * @example
 * ```ts
 * const entry: GoalCatalogEntry = {
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     intent: "实现恢复能力",
 *     workflowPhase: "planning",
 *     runStatus: "waiting",
 *     updatedAt: "2026-08-17T00:00:00.000Z",
 * };
 * ```
 */
export interface GoalCatalogEntry {
    /** Goal 的稳定标识，用于后续 restore。 */
    readonly goalId: string;
    /** 当前快照中 Run 的稳定标识。 */
    readonly runId: string;
    /** Goal 创建时冻结的原始意图。 */
    readonly intent: string;
    /** 当前 Preparation/Execution 工作流阶段。 */
    readonly workflowPhase: Goal["state"]["workflow"]["phase"];
    /** 当前 Run 状态；该列表不会返回三个终态。 */
    readonly runStatus: RunStatus;
    /** 最近成功快照的 ISO 8601 UTC 修改时间。 */
    readonly updatedAt: string;
}

/**
 * 查询可恢复 Goal 摘要的目录边界。
 *
 * @remarks
 * 目录只反映最近成功持久化的完整快照，不提供历史版本或事件查询；实现
 * 必须对正式快照执行完整协议校验，损坏快照应阻止本次查询并暴露协议错误。
 *
 * @example
 * ```ts
 * const catalog: GoalCatalog = store;
 * const resumable = await catalog.listResumable();
 * ```
 */
export interface GoalCatalog {
    /**
     * 扫描并按最近更新时间倒序返回非终态 Goal。
     *
     * @returns 按 `mtime` 降序排列的摘要；相同时间使用 `goalId` 升序。
     * @throws 正式 JSON 快照损坏或目录读取失败时抛出异常；目录不存在时返回空列表。
     */
    listResumable(): Promise<readonly GoalCatalogEntry[]>;
}
