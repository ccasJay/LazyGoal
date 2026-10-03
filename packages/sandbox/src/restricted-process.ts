import { spawn, type ChildProcess } from "node:child_process";
import { SANDBOX_EXEC_PATH } from "./macos-seatbelt";

/** 进程组两阶段终止默认宽限时间（毫秒）：SIGTERM 发出后等待自行退出，超期升级为 SIGKILL。 */
export const RESTRICTED_PROCESS_TERMINATION_GRACE_MS = 2_000;

/**
 * 启动受限命令的输入配置。
 *
 * @example
 * ```ts
 * const options: SpawnRestrictedCommandOptions = {
 *   command: "echo hello",
 *   cwd: "/path/to/workspace",
 * };
 * ```
 */
export interface SpawnRestrictedCommandOptions {
    /** 要执行的完整 Shell 命令。 */
    readonly command: string;
    /** 工作目录真实绝对路径。 */
    readonly cwd: string;
    /** 可选的沙箱策略与环境变量（Seatbelt 环境下生效）。 */
    readonly sandbox?: {
        readonly policy: string;
        readonly env: NodeJS.ProcessEnv;
    };
    /** 可选的标准流输入设置，默认为 "ignore"。 */
    readonly stdioStdin?: "ignore" | "pipe";
}

/**
 * 启动一个受限的进程组命令。
 *
 * @remarks
 * 在 macOS/Linux 上通过 detached 创建新进程组（以子进程 PID 为进程组组长 PGID），
 * 且在提供 sandbox 策略时通过 macOS Seatbelt 沙箱执行；Windows 维持单进程。
 * 标准输出和标准错误重定向为 pipe。
 *
 * @param options - 命令启动参数。
 * @returns 启动的 ChildProcess 实例。
 *
 * @example
 * ```ts
 * const child = spawnRestrictedCommand({
 *   command: "pytest tests/",
 *   cwd: "/workspace",
 * });
 * ```
 */
export function spawnRestrictedCommand(options: SpawnRestrictedCommandOptions): ChildProcess {
    if (options.sandbox !== undefined) {
        return spawn(
            SANDBOX_EXEC_PATH,
            ["-p", options.sandbox.policy, "/bin/bash", "-c", options.command],
            {
                cwd: options.cwd,
                env: options.sandbox.env,
                stdio: [options.stdioStdin ?? "ignore", "pipe", "pipe"],
                detached: true,
            },
        );
    }

    return spawn(options.command, {
        cwd: options.cwd,
        shell: process.platform === "win32" ? true : "/bin/bash",
        stdio: [options.stdioStdin ?? "ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
    });
}

/**
 * 向受管子进程及所属进程组发送指定信号。
 *
 * @remarks
 * POSIX 平台上信号发往以 `-child.pid` 标识的整个受管进程组；Windows 上直接向子进程发信号。
 * 若进程组或进程已退出（ESRCH 错误），静默忽略。
 *
 * @param child - 目标 ChildProcess 实例或目标数字 PID。
 * @param signal - 待发送的 POSIX 信号（如 SIGTERM, SIGKILL）。
 *
 * @example
 * ```ts
 * sendSignalToProcessGroup(child, "SIGTERM");
 * ```
 */
export function sendSignalToProcessGroup(child: ChildProcess | number, signal: NodeJS.Signals): void {
    const pid = typeof child === "number" ? child : child.pid;
    if (pid === undefined) {
        return;
    }

    if (process.platform === "win32") {
        if (typeof child !== "number") {
            child.kill(signal);
        } else {
            try {
                process.kill(pid, signal);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
                    throw error;
                }
            }
        }
        return;
    }

    try {
        process.kill(-pid, signal);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
            throw error;
        }
    }
}

/**
 * 对受管子进程执行两阶段受管终止（SIGTERM → 固定宽限 → SIGKILL）。
 *
 * @remarks
 * 优先向整组发送 SIGTERM，如果在 `graceMs` 毫秒内进程未退出，自动升级发送 SIGKILL。
 * 若提供 `onSettled` 回调或返回的 Promise，当进程已退出时清除宽限定时器。
 *
 * @param child - 目标 ChildProcess 实例。
 * @param options - 可选的宽限时间配置。
 * @returns 包含取消定时器与终止状态句柄的对象。
 *
 * @example
 * ```ts
 * const { cancelGrace } = killProcessGroup(child, { graceMs: 2000 });
 * child.on("close", () => cancelGrace());
 * ```
 */
export function killProcessGroup(
    child: ChildProcess,
    options?: { readonly graceMs?: number },
): { cancelGrace: () => void } {
    const graceMs = options?.graceMs ?? RESTRICTED_PROCESS_TERMINATION_GRACE_MS;
    sendSignalToProcessGroup(child, "SIGTERM");

    let timer: NodeJS.Timeout | undefined = setTimeout(() => {
        timer = undefined;
        sendSignalToProcessGroup(child, "SIGKILL");
    }, graceMs);

    return {
        cancelGrace: () => {
            if (timer !== undefined) {
                clearTimeout(timer);
                timer = undefined;
            }
        },
    };
}
