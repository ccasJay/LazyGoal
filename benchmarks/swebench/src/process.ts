import { spawn } from "node:child_process";
import { ExecutionAbortedError } from "../../../packages/runtime/src/index.js";

/**
 * 无 shell 插值的子进程请求；超时或中止终止进程组，输出上限按字节计算。
 * @example
 * ```ts
 * const result = await runProcess("docker", ["info"], { timeoutMs: 10000 });
 * ```
 */
export interface ProcessOptions {
    readonly timeoutMs: number;
    readonly signal?: AbortSignal | undefined;
    readonly cwd?: string;
    readonly maxBytes?: number;
    /** shell Observation 可截断；协议与补丁输出超限必须失败。 */
    readonly truncate?: boolean;
}

/**
 * 子进程退出事实；非零退出码由调用方按命令语义解释。
 * @example
 * ```ts
 * const result: ProcessResult = { code: 0, stdout: "ok", stderr: "" };
 * ```
 */
export interface ProcessResult {
    readonly code: number;
    readonly stdout: string;
    readonly stderr: string;
}

export type ProcessRunner = (command: string, args: readonly string[], options: ProcessOptions) => Promise<ProcessResult>;

/** 启动参数数组指定的进程；启动失败、超时、协议输出超限和中止均抛错。 */
export const runProcess: ProcessRunner = async (command, args, options) => {
    if (options.signal?.aborted) throw new ExecutionAbortedError();
    return new Promise((resolve, reject) => {
        const child = spawn(command, [...args], {
            cwd: options.cwd,
            stdio: ["ignore", "pipe", "pipe"],
            detached: process.platform !== "win32",
        });
        const maxBytes = options.maxBytes ?? 1024 * 1024;
        let stdout: Buffer = Buffer.alloc(0);
        let stderr: Buffer = Buffer.alloc(0);
        let stdoutTruncated = false;
        let stderrTruncated = false;
        let failure: Error | undefined;
        let killTimer: ReturnType<typeof setTimeout> | undefined;
        const kill = (signal: NodeJS.Signals) => {
            if (child.pid === undefined) return;
            try {
                if (process.platform === "win32") child.kill(signal);
                else process.kill(-child.pid, signal);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ESRCH") failure ??= error as Error;
            }
        };
        const stop = (error: Error) => {
            if (failure !== undefined) return;
            failure = error;
            kill("SIGTERM");
            killTimer = setTimeout(() => kill("SIGKILL"), 1000);
        };
        const collect = (previous: Buffer, chunk: Buffer): Buffer => {
            const next = Buffer.concat([previous, chunk]);
            if (next.length <= maxBytes) return next;
            if (!options.truncate) stop(new Error(`${command} output exceeds ${maxBytes} bytes`));
            return next.subarray(-maxBytes);
        };
        child.stdout.on("data", (chunk: Buffer) => {
            stdoutTruncated ||= stdout.length + chunk.length > maxBytes;
            stdout = collect(stdout, chunk);
        });
        child.stderr.on("data", (chunk: Buffer) => {
            stderrTruncated ||= stderr.length + chunk.length > maxBytes;
            stderr = collect(stderr, chunk);
        });
        const abort = () => stop(new ExecutionAbortedError());
        const timer = setTimeout(() => stop(new Error(`${command} exceeded ${options.timeoutMs}ms`)), options.timeoutMs);
        options.signal?.addEventListener("abort", abort, { once: true });
        if (options.signal?.aborted) abort();
        child.on("error", (error) => { failure ??= error; });
        child.on("close", (code) => {
            clearTimeout(timer);
            if (failure !== undefined) kill("SIGKILL");
            if (killTimer !== undefined) clearTimeout(killTimer);
            options.signal?.removeEventListener("abort", abort);
            if (failure !== undefined) reject(failure);
            else resolve({
                code: code ?? 1,
                stdout: (stdoutTruncated ? "[earlier output truncated]\n" : "") + stdout.toString("utf8"),
                stderr: (stderrTruncated ? "[earlier output truncated]\n" : "") + stderr.toString("utf8"),
            });
        });
    });
};

/** 基础设施命令必须正常退出；错误保留有界 stderr 供诊断。 */
export function requireSuccess(result: ProcessResult, operation: string): string {
    if (result.code !== 0) throw new Error(`${operation} exited ${result.code}: ${result.stderr || result.stdout}`);
    return result.stdout;
}
