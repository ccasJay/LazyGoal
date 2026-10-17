import type { CheckpointGateGoalStore } from "../checkpoint-gate";
import type {
    ManagedResourceCloseFailure,
    ManagedResourceRegistry,
} from "./managed-resources";

/** 实例生命周期的可观察状态。 */
export type RuntimeLifecycleState = "open" | "closing" | "closed";

/** 生命周期已不可受理新操作时使用的稳定错误代码。 */
export const RUNTIME_LIFECYCLE_UNAVAILABLE_CODE =
    "RUNTIME_LIFECYCLE_UNAVAILABLE" as const;

/**
 * 表示运行实例在关闭中或已关闭，不能再受理新的执行与写控制。
 *
 * @remarks
 * 该错误只表示受理边界已经关闭；已经受理的调用仍在结算，其真实结果由调用
 * 方自己的 Promise 报告。调用方不应把它转换为 Goal 的取消或失败终态。
 *
 * @example
 * ```ts
 * try {
 *     lifecycle.beginOperation("advance");
 * } catch (error) {
 *     if (error instanceof RuntimeLifecycleUnavailableError) {
 *         // 服务适配为 busy 或关闭响应
 *     }
 * }
 * ```
 */
export class RuntimeLifecycleUnavailableError extends Error {
    readonly code = RUNTIME_LIFECYCLE_UNAVAILABLE_CODE;

    /** 拒绝受理时的生命周期状态。 */
    readonly state: Exclude<RuntimeLifecycleState, "open">;

    /** @param state - 拒绝受理时的生命周期状态，用于区分关闭中与已关闭。 */
    constructor(state: Exclude<RuntimeLifecycleState, "open">) {
        super(`Runtime lifecycle is ${state} and cannot accept new operations`);
        this.name = "RuntimeLifecycleUnavailableError";
        this.state = state;
    }
}

/** 关闭未在期限内完整结算时使用的稳定错误代码。 */
export const RUNTIME_LIFECYCLE_INCOMPLETE_CODE =
    "RUNTIME_LIFECYCLE_INCOMPLETE" as const;

/** 关闭未完成的原因类别，用于宿主按类别决定重试或告警。 */
export type RuntimeLifecycleIncompleteCategory =
    | "operations"
    | "writes"
    | "resources";

/**
 * 一条未能结算的关闭原因。
 *
 * @remarks
 * `message` 只包含类别、身份和资源实现提供的错误信息，用于定位是哪一类活动
 * 仍未结算；它不承诺外部副作用已经停止。
 */
export interface RuntimeLifecycleIncompleteReason {
    /** 未结算活动的类别。 */
    readonly category: RuntimeLifecycleIncompleteCategory;
    /** 可读的未结算原因。 */
    readonly message: string;
}

/**
 * 表示至少有一类活动未能在关闭期限内确认结算。
 *
 * @remarks
 * 抛出该错误后生命周期保持 `closing`，不再受理新操作，重复 `close()` 返回同一
 * 失败结果。错误不代表已知的取消或回滚：仍未结算的写入与资源副作用后果未知，
 * 不得据此认为同一持久化位置可以立即安全重用。
 *
 * @example
 * ```ts
 * try {
 *     await lifecycle.close();
 * } catch (error) {
 *     if (error instanceof RuntimeLifecycleIncompleteError) {
 *         for (const reason of error.reasons) {
 *             // 按 reason.category 决定告警或人工处理
 *         }
 *     }
 * }
 * ```
 */
export class RuntimeLifecycleIncompleteError extends Error {
    readonly code = RUNTIME_LIFECYCLE_INCOMPLETE_CODE;

    /** 未能结算的活动原因，按类别记录。 */
    readonly reasons: readonly RuntimeLifecycleIncompleteReason[];

    /** @param reasons - 未能结算的活动原因；至少包含一条。 */
    constructor(reasons: readonly RuntimeLifecycleIncompleteReason[]) {
        super(
            `Runtime lifecycle close did not settle: ${
                reasons.map((reason) => `${reason.category}: ${reason.message}`).join("; ")
            }`,
        );
        this.name = "RuntimeLifecycleIncompleteError";
        this.reasons = [...reasons];
    }
}

/**
 * 实例关闭使用的可注入计时器边界。
 *
 * @remarks
 * 生产实现使用 Node.js 的全局计时器；测试可以注入手动推进的 fake clock，
 * 不必真实等待 grace period。
 *
 * @example
 * ```ts
 * const clock: LifecycleClock = {
 *     setTimeout: (callback) => fakeClock.schedule(callback),
 *     clearTimeout: (handle) => fakeClock.cancel(handle),
 * };
 * ```
 */
export interface LifecycleClock {
    /** 注册一次性超时并返回可取消的句柄。 */
    setTimeout(callback: () => void, delayMs: number): unknown;
    /** 取消之前注册的超时。 */
    clearTimeout(handle: unknown): void;
}

/** 正常与强制清理阶段各自的默认等待上限。 */
export const DEFAULT_LIFECYCLE_GRACE_PERIOD_MS = 2_000 as const;

/**
 * 构造实例生命周期所需的依赖。
 *
 * @remarks
 * `checkpointStore`、`resources` 与 `abortController` 由资源所有者创建并明确
 * 交付给实例协调：生命周期会冻结 Gate、中止该控制器并结算注册表中的资源。
 * 借出的 Adapter、Registry、Policy、Store 与宿主信号不在交付范围内，不会被
 * 自动关闭。构造不产生 I/O，也不注册进程信号。
 *
 * @example
 * ```ts
 * const lifecycle = new RuntimeLifecycle({
 *     checkpointStore: gate,
 *     resources: registry,
 *     abortController: instanceController,
 * });
 * ```
 */
export interface RuntimeLifecycleDependencies {
    /** 保护最近成功快照、需要在关闭时冻结的写入闸门。 */
    readonly checkpointStore: CheckpointGateGoalStore;
    /** 实例自有的受管资源注册表。 */
    readonly resources: ManagedResourceRegistry;
    /** 实例自有、与执行链共享的中止控制器。 */
    readonly abortController: AbortController;
    /** 可选的 fake clock；默认使用全局计时器。 */
    readonly clock?: LifecycleClock;
    /** 每个清理阶段的等待上限；默认 2 秒，必须是非负有限数。 */
    readonly gracePeriodMs?: number;
}

const systemClock: LifecycleClock = {
    setTimeout(callback, delayMs) {
        return globalThis.setTimeout(callback, delayMs);
    },
    clearTimeout(handle) {
        globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
};

interface SettlementTracker {
    readonly promise: Promise<void>;
    isSettled(): boolean;
}

/** 观察一个不拒绝的完成 Promise 是否已结算。 */
function trackSettlement(promise: Promise<unknown>): SettlementTracker {
    let settled = false;
    const tracked = promise.then(
        () => {
            settled = true;
        },
        () => {
            settled = true;
        },
    );
    return { promise: tracked, isSettled: () => settled };
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * 与进程退出无关的运行实例生命周期。
 *
 * @remarks
 * 状态为 `open`、`closing` 与 `closed`。首次 `close()` 同步进入 `closing`、
 * 冻结 Checkpoint Gate、中止实例控制器，然后依次执行正常与强制清理：请求
 * 注册表中的资源关闭或升级，并等待已受理操作与已进入保存边界的写入结算。
 * 两个阶段各以 `gracePeriodMs` 为上限，不会因不响应的依赖无限延长。
 *
 * 只有已受理操作、写入与自有资源全部确认结算时，`close()` 才报告成功并把
 * 状态置为 `closed`。超时、资源拒绝或未确认结算产生
 * `RuntimeLifecycleIncompleteError`，携带未结算类别与原因；此时状态保持
 * `closing`，实例不可重新受理，重复 `close()` 返回同一结果。关闭只处理交付
 * 给实例的资源，不创建用户 Interrupt、失败或取消终态，也不改写 Goal 状态。
 *
 * @example
 * ```ts
 * const release = lifecycle.beginOperation("advance");
 * try {
 *     await advance();
 * } finally {
 *     release();
 * }
 * await lifecycle.close();
 * ```
 */
export class RuntimeLifecycle {
    private readonly clock: LifecycleClock;
    private readonly gracePeriodMs: number;

    private readonly checkpointStore: CheckpointGateGoalStore;
    private readonly resources: ManagedResourceRegistry;
    private readonly abortController: AbortController;

    private stateValue: RuntimeLifecycleState = "open";
    private closePromise: Promise<void> | undefined;
    private readonly operations = new Map<symbol, string>();
    private operationResolvers: Array<() => void> = [];

    /** @param dependencies - 实例自有的 Gate、资源注册表、中止控制器与期限配置。 */
    constructor(dependencies: RuntimeLifecycleDependencies) {
        const gracePeriodMs = dependencies.gracePeriodMs
            ?? DEFAULT_LIFECYCLE_GRACE_PERIOD_MS;

        if (!Number.isFinite(gracePeriodMs) || gracePeriodMs < 0) {
            throw new Error("gracePeriodMs must be a non-negative finite number");
        }

        this.checkpointStore = dependencies.checkpointStore;
        this.resources = dependencies.resources;
        this.abortController = dependencies.abortController;
        this.clock = dependencies.clock ?? systemClock;
        this.gracePeriodMs = gracePeriodMs;
    }

    /** 当前生命周期状态。 */
    get state(): RuntimeLifecycleState {
        return this.stateValue;
    }

    /** 是否仍可受理新的执行与写控制。 */
    get isOpen(): boolean {
        return this.stateValue === "open";
    }

    /** 已受理但尚未结算的操作数量。 */
    get activeOperationCount(): number {
        return this.operations.size;
    }

    /**
     * 登记一次已受理的调用。
     *
     * @param label - 用于关闭失败报告的操作类别，例如命令名。
     * @returns 幂等的结算函数；调用后该操作不再阻止关闭成功。
     * @throws RuntimeLifecycleUnavailableError 当实例已经进入 closing 或 closed。
     * @remarks 关闭只等待已登记操作的结算标记，不代表操作的业务结果，也不会
     * 取消操作本身。
     */
    beginOperation(label: string): () => void {
        if (this.stateValue !== "open") {
            throw new RuntimeLifecycleUnavailableError(this.stateValue);
        }

        const token = Symbol(label);
        this.operations.set(token, label);
        let released = false;

        return () => {
            if (released) {
                return;
            }

            released = true;
            this.operations.delete(token);
            if (this.operations.size === 0) {
                const resolvers = this.operationResolvers.splice(0);
                for (const resolve of resolvers) {
                    resolve();
                }
            }
        };
    }

    /**
     * 关闭实例并结算其自有活动与资源。
     *
     * @returns 所有已受理操作、写入与注册资源确认结算后完成；此时实例状态为
     * `closed`，可以按既有规则在同一持久化位置重建实例。
     * @throws RuntimeLifecycleIncompleteError 存在超时、资源拒绝或未确认结算；
     * 状态保持 `closing`，重复调用返回同一失败结果。
     * @remarks 关闭不请求进程退出，也不影响宿主进程继续运行。资源实现内部
     * 吞错或提前成功不在本方法能确认的范围内，生命周期不因此改写其报告。
     */
    close(): Promise<void> {
        if (this.closePromise !== undefined) {
            return this.closePromise;
        }

        this.stateValue = "closing";
        this.closePromise = this.performClose();
        return this.closePromise;
    }

    private async performClose(): Promise<void> {
        this.checkpointStore.freeze();
        this.abortController.abort();

        const writes = trackSettlement(this.checkpointStore.waitForIdle());
        const operations = trackSettlement(this.waitForOperationsIdle());
        const graceful = trackSettlement(this.resources.closeAll());
        const gracefulCompleted = await this.waitForGracePeriod(
            Promise.all([writes.promise, operations.promise, graceful.promise]),
        );

        if (!gracefulCompleted || this.resources.size > 0) {
            const forced = trackSettlement(Promise.all([
                this.resources.forceCloseAll(),
                writes.promise,
                operations.promise,
            ]));
            await this.waitForGracePeriod(forced.promise);
        }

        const reasons = this.collectRemainingReasons(writes, operations);

        if (reasons.length > 0) {
            throw new RuntimeLifecycleIncompleteError(reasons);
        }

        this.stateValue = "closed";
    }

    private collectRemainingReasons(
        writes: SettlementTracker,
        operations: SettlementTracker,
    ): RuntimeLifecycleIncompleteReason[] {
        const reasons: RuntimeLifecycleIncompleteReason[] = [];

        if (this.operations.size > 0) {
            const labels = [...new Set(this.operations.values())].join(", ");
            reasons.push({
                category: "operations",
                message: `${this.operations.size} accepted operations did not settle: ${labels}`,
            });
        }

        if (!writes.isSettled()) {
            reasons.push({
                category: "writes",
                message: "checkpoint writes that entered the save boundary did not settle within the grace period",
            });
        }

        for (const failure of this.resources.failures) {
            reasons.push({
                category: "resources",
                message: `${describeFailure(failure)}`,
            });
        }

        const pending = this.resources.pendingResources.length;
        if (pending > 0) {
            reasons.push({
                category: "resources",
                message: `${pending} managed resources did not confirm release`,
            });
        }

        return reasons;
    }

    private waitForOperationsIdle(): Promise<void> {
        if (this.operations.size === 0) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this.operationResolvers.push(resolve);
        });
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

function describeFailure(failure: ManagedResourceCloseFailure): string {
    const phase = failure.phase === "graceful" ? "graceful" : "force";
    return `managed resource ${phase} close failed: ${describeError(failure.error)}`;
}
