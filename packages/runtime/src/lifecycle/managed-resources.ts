/**
 * 由运行实例拥有、需要在实例关闭时释放的资源。
 *
 * @remarks
 * `close` 用于正常关闭；未在 grace period 内完成时，关闭核心会调用可选的
 * `forceClose`。成功返回表示该实现拥有的资源及必要写入已经结算；拒绝表示
 * 清理失败；未完成的 Promise 表示尚未确认活动停止。实现应使两个方法都具备
 * 幂等性，未提供 `forceClose` 时关闭核心回退到 `close`。资源内部句柄如何
 * 停止由实现负责，通用生命周期不读取其内部状态。
 *
 * @example
 * ```ts
 * const resource: ManagedResource = {
 *     close: () => session.stop(),
 *     forceClose: () => session.kill(),
 * };
 * ```
 */
export interface ManagedResource {
    /** 尝试正常释放资源；可以异步等待监听器、写入或子进程退出。 */
    close(): void | Promise<void>;
    /** 正常关闭未在 grace period 内结算时立即释放资源；未提供时回退到 `close`。 */
    forceClose?(): void | Promise<void>;
}

/** 关闭流程拒绝注册新资源时使用的稳定错误代码。 */
export const MANAGED_RESOURCE_REGISTRY_CLOSED_CODE =
    "MANAGED_RESOURCE_REGISTRY_CLOSED" as const;

/**
 * 表示受管资源注册表已经进入关闭流程。
 *
 * @example
 * ```ts
 * if (error instanceof ManagedResourceRegistryClosedError) {
 *     // 关闭期间不再创建新的受管资源
 * }
 * ```
 */
export class ManagedResourceRegistryClosedError extends Error {
    readonly code = MANAGED_RESOURCE_REGISTRY_CLOSED_CODE;

    constructor(message = "Managed resource registry is closing") {
        super(message);
        this.name = "ManagedResourceRegistryClosedError";
    }
}

/** 资源关闭的尝试阶段：`graceful` 为正常阶段，`force` 为超时后的强制阶段。 */
export type ManagedResourceClosePhase = "graceful" | "force";

/**
 * 一次未能确认资源结算的关闭尝试。
 *
 * @remarks
 * 记录项在该资源最终结算或所有者显式注销前一直保留，便于关闭核心报告
 * 具体原因，而不是用空注册表掩盖失败。
 */
export interface ManagedResourceCloseFailure {
    /** 未能完成关闭的资源。 */
    readonly resource: ManagedResource;
    /** 失败发生的关闭阶段。 */
    readonly phase: ManagedResourceClosePhase;
    /** 资源实现抛出的原始错误。 */
    readonly error: unknown;
}

interface ResourceEntry {
    readonly resource: ManagedResource;
    gracefulOperation?: Promise<void>;
    forceOperation?: Promise<void>;
    readonly failures: Array<{
        readonly phase: ManagedResourceClosePhase;
        readonly error: unknown;
    }>;
}

/**
 * 运行实例自有资源的生命周期注册表。
 *
 * @remarks
 * 注册表只允许在关闭前注册资源。`closeAll` 并发请求所有资源正常关闭；失败的
 * 资源保留注册和失败原因，供 `forceCloseAll` 升级处理。资源只有在确认结算
 * （正常关闭成功，或强制关闭成功）或所有者显式注销后才被移除，因此空的注册表
 * 一定表示所有资源已确认结算。两种关闭请求都不会永久等待：调用方按自己的期限
 * 决定何时放弃，并通过 `failures` 与 `pendingResources` 读取未结算身份。
 *
 * @example
 * ```ts
 * const registry = new ManagedResourceRegistry();
 * const unregister = registry.register(resource);
 * await registry.closeAll();
 * if (registry.pendingResources.length > 0) {
 *     await registry.forceCloseAll();
 * }
 * ```
 */
export class ManagedResourceRegistry {
    private readonly entries = new Set<ResourceEntry>();
    private readonly idleResolvers: Array<() => void> = [];
    private closing = false;

    /** 仍未确认结算的资源数量。 */
    get size(): number {
        return this.entries.size;
    }

    /** 注册表是否已经进入关闭流程、不再接受新资源。 */
    get isClosing(): boolean {
        return this.closing;
    }

    /** 至今未能确认结算的关闭尝试，按资源注册顺序排列。 */
    get failures(): readonly ManagedResourceCloseFailure[] {
        const failures: ManagedResourceCloseFailure[] = [];
        for (const entry of this.entries) {
            for (const failure of entry.failures) {
                failures.push({
                    resource: entry.resource,
                    phase: failure.phase,
                    error: failure.error,
                });
            }
        }
        return failures;
    }

    /** 尚未确认释放的资源，按注册顺序排列。 */
    get pendingResources(): readonly ManagedResource[] {
        return [...this.entries].map((entry) => entry.resource);
    }

    /**
     * 注册一个由运行实例拥有的资源。
     *
     * @param resource - 提供正常和可选强制关闭操作的资源。
     * @returns 注销函数；重复调用没有副作用，注销同时丢弃该资源的失败记录。
     * @throws ManagedResourceRegistryClosedError 当关闭流程已经开始。
     */
    register(resource: ManagedResource): () => void {
        if (this.closing) {
            throw new ManagedResourceRegistryClosedError();
        }

        const entry: ResourceEntry = { resource, failures: [] };
        this.entries.add(entry);
        let registered = true;

        return () => {
            if (!registered) {
                return;
            }

            registered = false;
            this.remove(entry);
        };
    }

    /**
     * 请求所有资源正常关闭。
     *
     * @returns 所有正常关闭请求完成或失败后完成；资源关闭错误不会阻止其余
     * 资源继续处理，失败资源保留注册和原因供强制阶段处理。
     * @remarks 该方法会把注册表置为 closing，之后不能注册新资源；它不设期限，
     * 由调用方决定等待上限。
     */
    async closeAll(): Promise<void> {
        this.closing = true;
        const entries = [...this.entries];
        await Promise.all(entries.map((entry) => this.invokeClose(entry, false)));
    }

    /**
     * 强制处理所有仍未确认结算的资源。
     *
     * @returns 所有强制关闭请求完成或失败后完成；成功的资源被移除，拒绝的
     * 资源保留注册和失败原因，供调用方报告未完成关闭。
     */
    async forceCloseAll(): Promise<void> {
        this.closing = true;
        const entries = [...this.entries];
        await Promise.all(entries.map((entry) => this.invokeClose(entry, true)));
    }

    /**
     * 等待注册表变为空。
     *
     * @returns 当前所有资源确认结算或被注销后完成；空注册表立即完成。
     * @remarks 已拒绝且仍注册的资源永远不会触发该等待，调用方应结合自己的
     * 期限与 `failures` 判断关闭是否完成。
     */
    waitForIdle(): Promise<void> {
        if (this.entries.size === 0) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this.idleResolvers.push(resolve);
        });
    }

    private invokeClose(
        entry: ResourceEntry,
        force: boolean,
    ): Promise<void> {
        const existing = force
            ? entry.forceOperation
            : entry.gracefulOperation;

        if (existing !== undefined) {
            return existing;
        }

        const operation = Promise.resolve()
            .then(() => {
                if (force) {
                    return entry.resource.forceClose === undefined
                        ? entry.resource.close()
                        : entry.resource.forceClose();
                }

                return entry.resource.close();
            })
            .then(
                () => {
                    if (force || entry.forceOperation === undefined) {
                        this.remove(entry);
                    }
                },
                (error: unknown) => {
                    entry.failures.push({
                        phase: force ? "force" : "graceful",
                        error,
                    });
                },
            );

        if (force) {
            entry.forceOperation = operation;
        } else {
            entry.gracefulOperation = operation;
        }

        return operation;
    }

    private remove(entry: ResourceEntry): void {
        if (!this.entries.delete(entry) || this.entries.size !== 0) {
            return;
        }

        const resolvers = this.idleResolvers.splice(0);
        for (const resolve of resolvers) {
            resolve();
        }
    }
}
