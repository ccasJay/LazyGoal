import { CheckpointGateGoalStore } from "./checkpoint-gate";

/**
 * 由当前进程拥有、需要在关闭时释放的资源。
 *
 * @remarks
 * `close` 用于正常的 grace period 清理；如果它未在 grace period 内完成，
 * ShutdownCoordinator 会调用可选的 `forceClose`。没有提供强制实现时会再次
 * 调用 `close`，因此资源实现应使两个方法都具备幂等性。
 *
 * @example
 * ```ts
 * const resource: ManagedResource = {
 *     close: () => server.close(),
 *     forceClose: () => server.destroy(),
 * };
 * ```
 */
export interface ManagedResource {
    /** 尝试正常释放资源；可以异步等待网络、监听器或子进程退出。 */
    close(): void | Promise<void>;
    /** 超过 grace period 后立即释放资源；未提供时回退到 `close`。 */
    forceClose?(): void | Promise<void>;
}

/** 关闭后拒绝注册新资源时使用的稳定错误代码。 */
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

interface ResourceEntry {
    readonly resource: ManagedResource;
    gracefulOperation?: Promise<void>;
    forceOperation?: Promise<void>;
}

/**
 * 当前进程拥有资源的生命周期注册表。
 *
 * @remarks
 * 注册表只允许在关闭前注册资源。`closeAll` 会并发请求所有资源正常关闭；
 * 正常关闭失败的资源会保留在注册表中，供 `forceCloseAll` 再次处理。强制
 * 关闭无论资源自身是否抛错都会移除对应注册，避免关闭流程永久等待。
 *
 * @example
 * ```ts
 * const registry = new ManagedResourceRegistry();
 * const unregister = registry.register(resource);
 * unregister();
 * ```
 */
export class ManagedResourceRegistry {
    private readonly entries = new Set<ResourceEntry>();
    private readonly idleResolvers: Array<() => void> = [];
    private closing = false;

    /** 当前仍未完成关闭的资源数量。 */
    get size(): number {
        return this.entries.size;
    }

    /**
     * 注册一个由当前进程拥有的资源。
     *
     * @param resource - 提供正常和可选强制关闭操作的资源。
     * @returns 注销函数；重复调用没有副作用。
     * @throws ManagedResourceRegistryClosedError 当关闭流程已经开始。
     */
    register(resource: ManagedResource): () => void {
        if (this.closing) {
            throw new ManagedResourceRegistryClosedError();
        }

        const entry: ResourceEntry = { resource };
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
     * 资源继续处理，失败资源会保留到强制关闭阶段。
     * @remarks 该方法会把注册表置为 closing，之后不能注册新资源。
     */
    async closeAll(): Promise<void> {
        this.closing = true;
        const entries = [...this.entries];
        await Promise.all(entries.map((entry) => this.invokeClose(entry, false)));
    }

    /**
     * 强制处理所有仍然注册的资源。
     *
     * @returns 所有强制关闭请求完成或失败后完成；无论资源是否抛错，都会
     * 从注册表移除，允许父进程继续请求退出。
     */
    async forceCloseAll(): Promise<void> {
        this.closing = true;
        const entries = [...this.entries];
        await Promise.all(entries.map((entry) => this.invokeClose(entry, true)));
    }

    /**
     * 等待注册表变为空。
     *
     * @returns 当前所有注册资源被注销或关闭后完成；空注册表立即完成。
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
                () => {
                    if (force) {
                        this.remove(entry);
                    }
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

/**
 * ShutdownCoordinator 使用的可注入计时器边界。
 *
 * @remarks
 * 生产实现使用 Node.js 的全局计时器；测试可以注入手动推进的 fake clock，
 * 不必真实等待 2 秒 grace period。
 *
 * @example
 * ```ts
 * const clock: ShutdownClock = {
 *     setTimeout: (callback) => fakeClock.schedule(callback),
 *     clearTimeout: (handle) => fakeClock.cancel(handle),
 * };
 * ```
 */
export interface ShutdownClock {
    /** 注册一次性超时并返回可取消的句柄。 */
    setTimeout(callback: () => void, delayMs: number): unknown;
    /** 取消之前注册的超时。 */
    clearTimeout(handle: unknown): void;
}

/**
 * 父进程退出请求的可注入边界。
 *
 * @example
 * ```ts
 * const exitPort: ExitPort = {
 *     exit: (code) => recordedCodes.push(code),
 * };
 * ```
 */
export interface ExitPort {
    /** 请求父进程以指定退出码结束。 */
    exit(code: number): void | Promise<void>;
}

/** 生产环境使用的退出码；与用户按下 Ctrl+C 的 shell 约定一致。 */
export const SHUTDOWN_EXIT_CODE = 130 as const;

/** 关闭流程等待正常资源清理的默认 grace period。 */
export const SHUTDOWN_GRACE_PERIOD_MS = 2_000 as const;

/**
 * 调度关闭流程所需的依赖。
 *
 * @remarks
 * `clock` 和 `exitPort` 是可替换的测试边界；其他依赖代表生产关闭流程中
 * 必须共享的 Checkpoint Gate、根 AbortController 和资源注册表。
 *
 * @example
 * ```ts
 * const dependencies: ShutdownCoordinatorDependencies = {
 *     checkpointStore: gate,
 *     resources: registry,
 *     abortController,
 *     exitPort,
 * };
 * ```
 */
export interface ShutdownCoordinatorDependencies {
    /** 保护最近成功快照的单向写入闸门。 */
    readonly checkpointStore: CheckpointGateGoalStore;
    /** 当前进程拥有的监听器、请求、计时器和子进程资源。 */
    readonly resources: ManagedResourceRegistry;
    /** 与 Runtime 调用链共享、需要在关闭时 abort 的根控制器。 */
    readonly abortController: AbortController;
    /** 生产环境或测试环境的退出请求实现。 */
    readonly exitPort: ExitPort;
    /** 可选的 fake clock；默认使用全局计时器。 */
    readonly clock?: ShutdownClock;
    /** 可选 grace period；默认 2 秒，必须是非负有限数。 */
    readonly gracePeriodMs?: number;
}

const systemClock: ShutdownClock = {
    setTimeout(callback, delayMs) {
        return globalThis.setTimeout(callback, delayMs);
    },
    clearTimeout(handle) {
        globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
};

/**
 * 生产环境调用 process.exit 的 ExitPort 实现。
 *
 * @example
 * ```ts
 * const exitPort = new ProcessExitPort();
 * exitPort.exit(130);
 * ```
 */
export class ProcessExitPort implements ExitPort {
    /** @param code - 传给父进程的退出码。 */
    exit(code: number): never {
        process.exit(code);
    }
}

/**
 * 协调 Goal 快照保护、根 AbortSignal、资源清理和父进程退出的幂等关闭器。
 *
 * @remarks
 * 第一次 `shutdown()` 按以下顺序执行：冻结 Checkpoint Gate、abort 根控制器、
 * 请求资源正常关闭，并在 grace period 内等待已进入的保存和资源清理。超时
 * 后强制处理剩余资源；关闭流程不会创建 `cancelled` 状态，也不会回滚或写入
 * 尚未成功进入 Gate 的 Goal。重复调用返回同一个 Promise，不会重复 abort、
 * 清理资源或请求退出。
 *
 * @example
 * ```ts
 * const coordinator = new ShutdownCoordinator(dependencies);
 * await coordinator.shutdown();
 * ```
 */
export class ShutdownCoordinator {
    private readonly clock: ShutdownClock;
    private readonly gracePeriodMs: number;
    private shutdownPromise: Promise<void> | undefined;

    private readonly checkpointStore: CheckpointGateGoalStore;
    private readonly resources: ManagedResourceRegistry;
    private readonly abortController: AbortController;
    private readonly exitPort: ExitPort;

    /** @param dependencies - 关闭流程所需的可注入边界。 */
    constructor(dependencies: ShutdownCoordinatorDependencies) {
        const gracePeriodMs = dependencies.gracePeriodMs
            ?? SHUTDOWN_GRACE_PERIOD_MS;

        if (!Number.isFinite(gracePeriodMs) || gracePeriodMs < 0) {
            throw new Error("gracePeriodMs must be a non-negative finite number");
        }

        this.checkpointStore = dependencies.checkpointStore;
        this.resources = dependencies.resources;
        this.abortController = dependencies.abortController;
        this.exitPort = dependencies.exitPort;
        this.clock = dependencies.clock ?? systemClock;
        this.gracePeriodMs = gracePeriodMs;
    }

    /** 是否已经开始或完成关闭流程。 */
    get isShuttingDown(): boolean {
        return this.shutdownPromise !== undefined;
    }

    /**
     * 幂等地启动关闭流程。
     *
     * @returns 关闭清理和退出请求完成的 Promise；超时后不会等待无法结束的
     * 保存或资源，而是先执行强制资源清理并请求退出码 130。
     * @throws ExitPort 实现主动抛出的错误；资源自身关闭错误会被注册表吸收。
     */
    shutdown(): Promise<void> {
        if (this.shutdownPromise !== undefined) {
            return this.shutdownPromise;
        }

        this.shutdownPromise = this.performShutdown();
        return this.shutdownPromise;
    }

    private async performShutdown(): Promise<void> {
        this.checkpointStore.freeze();
        this.abortController.abort();

        const gracefulCompletion = Promise.all([
            this.checkpointStore.waitForIdle(),
            this.resources.closeAll(),
            this.resources.waitForIdle(),
        ]);
        const completedInGracePeriod = await this.waitForGracePeriod(
            gracefulCompletion,
        );

        if (!completedInGracePeriod) {
            await this.resources.forceCloseAll();
        }

        await this.exitPort.exit(SHUTDOWN_EXIT_CODE);
    }

    private waitForGracePeriod(
        completion: Promise<unknown>,
    ): Promise<boolean> {
        return new Promise((resolve) => {
            let settled = false;
            let timer: unknown;
            const settle = (completed: boolean): void => {
                if (settled) {
                    return;
                }

                settled = true;
                this.clock.clearTimeout(timer);
                resolve(completed);
            };
            timer = this.clock.setTimeout(
                () => settle(false),
                this.gracePeriodMs,
            );

            void completion.then(
                () => settle(true),
                () => settle(false),
            );
        });
    }
}
