/** Warm Sidecar 中可持久化的语义分区。 */
export type WarmContextSidecarEntryKind =
    | "decision"
    | "finding"
    | "failure"
    | "blocker"
    | "unresolved";

/** Warm Sidecar 条目的生命周期状态。 */
export type WarmContextSidecarEntryStatus = "active" | "resolved" | "superseded";

/**
 * Sidecar 中保存的单个有损 Warm 条目。
 *
 * @remarks
 * 条目是从 committed Trajectory 派生的可丢弃缓存，不是 Goal 恢复事实；任何字段
 * 失配都应让调用方回退到 Trajectory 重建。
 *
 * @example
 * ```ts
 * const entry: WarmContextSidecarEntry = {
 *     id: "finding-1",
 *     kind: "finding",
 *     summary: "测试已通过",
 *     status: "active",
 *     lossy: true,
 *     evidenceSequences: [18],
 *     firstSequence: 18,
 *     lastSequence: 18,
 *     lastAccessedSequence: 18,
 *     reinforcementCount: 1,
 *     sourceHash: "sha256:...",
 * };
 * ```
 */
export interface WarmContextSidecarEntry {
    readonly id: string;
    readonly kind: WarmContextSidecarEntryKind;
    readonly summary: string;
    readonly status: WarmContextSidecarEntryStatus;
    readonly lossy: true;
    readonly evidenceSequences: readonly number[];
    readonly firstSequence: number;
    readonly lastSequence: number;
    readonly lastAccessedSequence: number;
    readonly reinforcementCount: number;
    readonly sourceHash: string;
}

/**
 * 可重建 Warm Context Sidecar 的严格数据结构。
 *
 * @remarks
 * `sourceDigest` 对应从 Trajectory genesis 到 `derivedThroughSequence` 的规范化
 * committed 前缀；Sidecar 可以落后 Snapshot，但不能领先。`compactorVersion`
 * 用于防止不同归约算法互相复用缓存。
 *
 * @example
 * ```ts
 * const sidecar: WarmContextSidecar = {
 *     schemaVersion: 1,
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     derivedThroughSequence: 42,
 *     sourceDigest: "sha256:prefix",
 *     compactorVersion: "deterministic-warm-v1",
 *     entries: [],
 * };
 * ```
 */
export interface WarmContextSidecar {
    readonly schemaVersion: 1;
    readonly goalId: string;
    readonly runId: string;
    readonly derivedThroughSequence: number;
    readonly sourceDigest: string;
    readonly compactorVersion: string;
    readonly entries: readonly WarmContextSidecarEntry[];
}

/**
 * Sidecar 恢复时可选的当前边界和版本校验。
 *
 * @example
 * ```ts
 * const options: WarmContextSidecarRestoreOptions = {
 *     committedThroughSequence: 42,
 *     compactorVersion: "deterministic-warm-v1",
 * };
 * ```
 */
export interface WarmContextSidecarRestoreOptions {
    /** 当前 Snapshot 的 committed 边界；Sidecar 超过该边界即失配。 */
    readonly committedThroughSequence?: number;
    /** 当前归约实现版本；失配时忽略 Sidecar。 */
    readonly compactorVersion?: string;
    /** 已计算的同一来源前缀摘要；失配时忽略 Sidecar。 */
    readonly expectedSourceDigest?: string;
}

/**
 * Warm Sidecar 的可选持久化 Port。
 *
 * @remarks
 * Port 不参与 Goal Snapshot 恢复权威判断。`restore` 返回 undefined 表示缓存缺失、
 * 损坏、失配或领先；调用方必须从 committed Trajectory 重建。`save` 只能在对应
 * Snapshot 成功提交后由上层调用，Port 本身无法证明提交顺序。
 *
 * @example
 * ```ts
 * const sidecar = await store.restore("goal-1", "run-1", {
 *     committedThroughSequence: 42,
 *     compactorVersion: "deterministic-warm-v1",
 * });
 * if (sidecar === undefined) rebuildFromTrajectory();
 * ```
 */
export interface WarmContextSidecarStore {
    /**
     * @param goalId - Goal 稳定标识。
     * @param runId - Run 稳定标识。
     * @param options - 可选 Snapshot 边界、版本和来源摘要校验。
     * @returns 通过结构和可选校验的 Sidecar；失配或不可读时返回 undefined。
     * @throws 底层实现决定是否暴露不可恢复的文件系统错误；调用方应隔离缓存故障。
     */
    restore(
        goalId: string,
        runId: string,
        options?: WarmContextSidecarRestoreOptions,
    ): Promise<WarmContextSidecar | undefined>;

    /**
     * @param sidecar - 已由上层确认对应 Snapshot 已成功提交的派生缓存。
     * @returns 原子替换完成后 resolve。
     * @throws Sidecar 协议非法或底层写入失败时拒绝。
     */
    save(sidecar: WarmContextSidecar): Promise<void>;

    /**
     * @param goalId - Goal 稳定标识。
     * @param runId - Run 稳定标识。
     * @returns 删除完成后 resolve；文件不存在视为成功。
     * @throws 底层删除失败时拒绝。
     */
    remove(goalId: string, runId: string): Promise<void>;
}
