import type { RuntimeLifecycle } from "../../../packages/runtime/src/index";

/** 宿主进程关闭后使用的退出码；与用户按下 Ctrl+C 的 shell 约定一致。 */
export const SHUTDOWN_EXIT_CODE = 130 as const;

/**
 * 宿主进程退出请求的可注入边界。
 *
 * @remarks
 * 退出决策属于宿主应用；Runtime 生命周期不导入该接口，也不注册进程信号。
 *
 * @example
 * ```ts
 * const exitPort: ExitPort = {
 *     exit: (code) => recordedCodes.push(code),
 * };
 * ```
 */
export interface ExitPort {
    /** 请求宿主进程以指定退出码结束。 */
    exit(code: number): void | Promise<void>;
}

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
    /** @param code - 传给宿主进程的退出码。 */
    exit(code: number): never {
        process.exit(code);
    }
}

export interface HostShutdownCoordinatorDependencies {
    /** 已交付给宿主协调的实例生命周期；其关闭包含写入冻结、中止与资源结算。 */
    readonly lifecycle: RuntimeLifecycle;
    /** 关闭结算后请求宿主进程退出的实现。 */
    readonly exitPort: ExitPort;
    /**
     * 应用自有资源清理（HTTP 服务、浏览器连接等）。
     *
     * @remarks
     * 与实例关闭并发启动；无论实例关闭是否完整都会尝试执行。应用资源失败不会覆盖
     * 实例关闭错误，但仍会请求退出，由宿主决定最终处置。
     */
    readonly closeAppResources?: () => Promise<void>;
}

/**
 * 宿主退出协调：调用唯一的实例关闭核心并按应用决定退出。
 *
 * @remarks
 * 首次 `shutdown()` 并发执行 `lifecycle.close()` 与应用自有资源清理，并在两者完成后
 * 请求一次退出码 130，使 SIGINT 路径与普通退出路径共享同一实例关闭能力。实例关闭
 * 不完整时 `shutdown()` 以 `RuntimeLifecycleIncompleteError` 拒绝；应用资源清理失败
 * 也会拒绝，但退出请求始终已发出。重复调用返回同一个 Promise。
 *
 * @example
 * ```ts
 * const coordinator = new HostShutdownCoordinator({ lifecycle, exitPort, closeAppResources });
 * await coordinator.shutdown();
 * ```
 */
export class HostShutdownCoordinator {
    private readonly lifecycle: RuntimeLifecycle;
    private readonly exitPort: ExitPort;
    private readonly closeAppResources: (() => Promise<void>) | undefined;
    private shutdownPromise: Promise<void> | undefined;

    /** @param dependencies - 实例生命周期、宿主退出请求实现与可选应用资源清理。 */
    constructor(dependencies: HostShutdownCoordinatorDependencies) {
        this.lifecycle = dependencies.lifecycle;
        this.exitPort = dependencies.exitPort;
        this.closeAppResources = dependencies.closeAppResources;
    }

    /** 是否已经开始或完成宿主关闭流程。 */
    get isShuttingDown(): boolean {
        return this.shutdownPromise !== undefined;
    }

    /**
     * 幂等地启动宿主关闭流程。
     *
     * @returns 实例关闭与应用资源清理完成后完成。
     * @throws RuntimeLifecycleIncompleteError 当实例关闭未完整结算；应用资源清理
     * 失败时传播其原始错误。两种情况下退出请求均已发出，原因不会因为退出而丢失。
     */
    shutdown(): Promise<void> {
        if (this.shutdownPromise !== undefined) {
            return this.shutdownPromise;
        }

        this.shutdownPromise = this.performShutdown();
        return this.shutdownPromise;
    }

    private async performShutdown(): Promise<void> {
        const [runtimeResult, appResult] = await Promise.allSettled([
            this.lifecycle.close(),
            this.closeAppResources === undefined
                ? Promise.resolve()
                : this.closeAppResources(),
        ]);

        await this.exitPort.exit(SHUTDOWN_EXIT_CODE);

        if (runtimeResult.status === "rejected") {
            throw runtimeResult.reason;
        }
        if (appResult.status === "rejected") {
            throw appResult.reason;
        }
    }
}
