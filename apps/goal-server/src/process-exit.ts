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
}

/**
 * 宿主退出协调：调用唯一的实例关闭核心并按应用决定退出。
 *
 * @remarks
 * 首次 `shutdown()` 执行 `lifecycle.close()`，无论关闭是否完整都请求一次退出码
 * 130，使 SIGINT 路径与普通关闭路径共享同一实例关闭能力；关闭不完整时
 * `shutdown()` 以 `RuntimeLifecycleIncompleteError` 拒绝，宿主可以据此告警后
 * 自行决定退出。重复调用返回同一个 Promise，不会重复关闭或重复请求退出。
 *
 * @example
 * ```ts
 * const coordinator = new HostShutdownCoordinator({ lifecycle, exitPort });
 * await coordinator.shutdown();
 * ```
 */
export class HostShutdownCoordinator {
    private readonly lifecycle: RuntimeLifecycle;
    private readonly exitPort: ExitPort;
    private shutdownPromise: Promise<void> | undefined;

    /** @param dependencies - 实例生命周期与宿主退出请求实现。 */
    constructor(dependencies: HostShutdownCoordinatorDependencies) {
        this.lifecycle = dependencies.lifecycle;
        this.exitPort = dependencies.exitPort;
    }

    /** 是否已经开始或完成宿主关闭流程。 */
    get isShuttingDown(): boolean {
        return this.shutdownPromise !== undefined;
    }

    /**
     * 幂等地启动宿主关闭流程。
     *
     * @returns 实例关闭完成并已请求退出后完成。
     * @throws RuntimeLifecycleIncompleteError 当实例关闭未完整结算；退出请求
     * 仍已发出，原始关闭原因不会因为退出而丢失。
     */
    shutdown(): Promise<void> {
        if (this.shutdownPromise !== undefined) {
            return this.shutdownPromise;
        }

        this.shutdownPromise = this.performShutdown();
        return this.shutdownPromise;
    }

    private async performShutdown(): Promise<void> {
        try {
            await this.lifecycle.close();
        } finally {
            await this.exitPort.exit(SHUTDOWN_EXIT_CODE);
        }
    }
}
