import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { ExecutionAbortedError } from "../../packages/runtime/src/index.js";

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

/**
 * 可交互子进程的 stdin/stdout 与退出事实。
 *
 * @remarks
 * `input` 和 `output` 是唯一的控制通道；Worker 日志应走 `errorOutput`。调用方负责
 * 在关闭 ACP/Mux 后调用 `kill`，`closed` 会在子进程退出时完成。
 *
 * @example
 * ```ts
 * const worker = await runInteractiveProcess("docker", ["exec", "-i", "worker"], {
 *     timeoutMs: 120_000,
 * });
 * await worker.input.getWriter().write(new TextEncoder().encode("frame\n"));
 * ```
 */
export interface InteractiveProcess {
    readonly input: WritableStream<Uint8Array>;
    readonly output: ReadableStream<Uint8Array>;
    readonly errorOutput: ReadableStream<Uint8Array>;
    readonly closed: Promise<ProcessResult>;
    /** 尽力终止进程及其进程组；重复调用幂等。 */
    kill(): void;
}

/** 交互式 Worker 进程的可替换启动边界。 */
export type InteractiveProcessRunner = (
    command: string,
    args: readonly string[],
    options: ProcessOptions,
) => Promise<InteractiveProcess>;

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

/**
 * 启动一个不经过 shell 的交互式子进程，并把 stdin/stdout 映射为 Web Stream。
 *
 * @param command - 可执行文件名或绝对路径。
 * @param args - 原样传递的参数数组。
 * @param options - 超时、取消和输出上限；输出上限只约束 stderr 诊断。
 * @returns 可接入 Mux 的进程句柄。
 * @throws 启动失败、超时或外部取消时拒绝 `closed`。
 * @example
 * ```ts
 * const process = await runInteractiveProcess("node", ["worker.mjs"], { timeoutMs: 120_000 });
 * ```
 */
export const runInteractiveProcess: InteractiveProcessRunner = async (command, args, options) => {
    if (options.signal?.aborted) throw new ExecutionAbortedError();
    const child = spawn(command, [...args], {
        cwd: options.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
    });
    if (child.stdin === null || child.stdout === null || child.stderr === null) {
        child.kill();
        throw new Error(`${command} did not expose interactive stdio`);
    }
    const maxBytes = options.maxBytes ?? 16 * 1024 * 1024;
    let stderr = Buffer.alloc(0);
    let stderrTruncated = false;
    let failure: Error | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    let stopped = false;
    const kill = (signal: NodeJS.Signals = "SIGTERM") => {
        if (child.pid === undefined) return;
        try {
            if (process.platform === "win32") child.kill(signal);
            else process.kill(-child.pid, signal);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") failure ??= error as Error;
        }
    };
    const stop = (error: Error) => {
        if (failure !== undefined || closed) return;
        failure = error;
        kill("SIGTERM");
        killTimer = setTimeout(() => kill("SIGKILL"), 1000);
    };
    child.stderr.on("data", (chunk: Buffer) => {
        const next = Buffer.concat([stderr, chunk]);
        stderrTruncated ||= next.length > maxBytes;
        stderr = next.length <= maxBytes ? next : next.subarray(-maxBytes);
    });
    const timer = setTimeout(() => stop(new Error(`${command} exceeded ${options.timeoutMs}ms`)), options.timeoutMs);
    const abort = () => stop(new ExecutionAbortedError());
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const closedPromise = new Promise<ProcessResult>((resolve, reject) => {
        child.once("error", (error) => { if (!stopped) failure ??= error; });
        child.once("close", (code) => {
            closed = true;
            clearTimeout(timer);
            if (killTimer !== undefined) clearTimeout(killTimer);
            options.signal?.removeEventListener("abort", abort);
            const diagnostic = (stderrTruncated ? "[earlier output truncated]\n" : "") + stderr.toString("utf8");
            if (failure !== undefined) reject(failure);
            else resolve({ code: code ?? 1, stdout: "", stderr: diagnostic });
        });
    });
    return {
        input: Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
        output: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
        errorOutput: Readable.toWeb(child.stderr) as ReadableStream<Uint8Array>,
        closed: closedPromise,
        kill: () => {
            if (closed || stopped) return;
            stopped = true;
            kill("SIGTERM");
            killTimer = setTimeout(() => kill("SIGKILL"), 1000);
        },
    };
};

/** 基础设施命令必须正常退出；错误保留有界 stderr 供诊断。 */
export function requireSuccess(result: ProcessResult, operation: string): string {
    if (result.code !== 0) throw new Error(`${operation} exited ${result.code}: ${result.stderr || result.stdout}`);
    return result.stdout;
}
