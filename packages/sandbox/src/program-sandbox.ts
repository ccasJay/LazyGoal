import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync, readFileSync, statSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Readable, Writable } from "node:stream";
import {
    buildProgramSeatbeltPolicy,
    cleanupPrivateTmpDir,
    createPrivateTmpDir,
    isSeatbeltSupported,
    SANDBOX_EXEC_PATH,
} from "./macos-seatbelt";

const WORKER_PATH = fileURLToPath(new URL("./program-worker.cjs", import.meta.url));
const FRAME_BYTES = 16 * 1024 * 1024;
const OUTPUT_BYTES = 64 * 1024;
const DIAGNOSTIC_BYTES = 4 * 1024;

/**
 * 程序 worker 产生、由宿主重新授权的工具请求。
 *
 * @example
 * ```ts
 * const request: ProgramToolCall = { toolId: "read_file", input: { path: "README.md" } };
 * ```
 */
export interface ProgramToolCall {
    readonly toolId: string;
    readonly input: unknown;
}

/** worker 因宿主执行控制信号停止时的边界错误。 */
export class ProgramSandboxAbortedError extends Error {
    constructor() {
        super("PTC_ABORTED");
        this.name = "ProgramSandboxAbortedError";
    }
}

/**
 * 运行一次独立、受 Seatbelt 保护的 JavaScript 程序。
 *
 * @remarks
 * 每次调用创建新的 Node.js 进程与私有目录。回调只收到未经信任的工具请求；
 * 宿主必须独立校验 Profile、输入、权限并提交结果。拒绝建立隔离时抛出稳定错误。
 *
 * @example
 * ```ts
 * const value = await runProgramSandbox({
 *   code: "return 1 + 2",
 *   onToolCall: async () => { throw new Error("No tools"); },
 * });
 * ```
 */
export async function runProgramSandbox(options: {
    readonly code: string;
    readonly onToolCall: (call: ProgramToolCall, signal: AbortSignal) => Promise<unknown>;
    readonly signal?: AbortSignal;
    readonly fixedTime?: number;
    readonly seed?: number;
    readonly timeoutMs?: number;
    /** 每次在 worker 可再运行一秒前，宿主先持久化该时间额度。 */
    readonly onReserveTime?: () => Promise<void>;
}): Promise<unknown> {
    if (!isSeatbeltSupported()) throw new Error("PTC_SANDBOX_UNAVAILABLE");
    if (Buffer.byteLength(options.code) > OUTPUT_BYTES) throw new Error("PTC_CODE_LIMIT");
    const workerPath = await realpath(WORKER_PATH);
    const nodePath = await realpath(process.execPath);
    const runtimeFiles = collectProgramRuntimeFiles(nodePath);
    runtimeFiles.add(workerPath);
    const privateTmpDir = await createPrivateTmpDir();
    let child: ChildProcess | undefined;
    let childClosed: Promise<void> | undefined;
    try {
        const policy = buildProgramSeatbeltPolicy({
            runtimeFiles: Array.from(runtimeFiles),
            privateTmpDir,
            nodeExecutable: nodePath,
        });
        await options.onReserveTime?.();
        child = spawn(SANDBOX_EXEC_PATH, [
            "-p", policy, nodePath, "--max-old-space-size=192", workerPath,
        ], {
            cwd: privateTmpDir,
            env: {
                HOME: privateTmpDir,
                TMPDIR: privateTmpDir,
                TEMP: privateTmpDir,
                TMP: privateTmpDir,
                PATH: "/usr/bin:/bin",
                LANG: "C",
                OPENSSL_CONF: "/dev/null",
            },
            stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"],
        });
        childClosed = new Promise<void>((resolveClosed) => child!.once("close", () => resolveClosed()));
        const running = child;
        const input = running.stdio[3] as Writable | undefined;
        const output = running.stdio[4] as Readable | undefined;
        if (input === undefined || output === undefined || running.pid === undefined) {
            throw new Error("PTC_SANDBOX_UNAVAILABLE");
        }
        const result = await new Promise<unknown>((resolveResult, rejectResult) => {
            const workAbort = new AbortController();
            let settled = false;
            let buffer = "";
            let diagnosticBytes = 0;
            let nextCallId = 1;
            let queue = Promise.resolve();
            let stopping = false;
            const finish = (error?: Error, value?: unknown): void => {
                if (settled) return;
                settled = true;
                if (error !== undefined) workAbort.abort(error);
                clearTimeout(watchdog);
                clearInterval(rssMonitor);
                clearInterval(leaseMonitor);
                options.signal?.removeEventListener("abort", onAbort);
                if (error === undefined) resolveResult(value);
                else rejectResult(error);
            };
            const onAbort = (): void => {
                running.kill("SIGKILL");
                finish(new ProgramSandboxAbortedError());
            };
            const watchdog = setTimeout(() => {
                running.kill("SIGKILL");
                finish(new Error("PTC_TIME_LIMIT"));
            }, Math.min(options.timeoutMs ?? 120_000, 120_000));
            const rssMonitor = setInterval(() => {
                if (settled || running.pid === undefined) return;
                try {
                    const rss = Number(execFileSync("/bin/ps", ["-o", "rss=", "-p", String(running.pid)], {
                        encoding: "utf8", timeout: 1000,
                    }).trim());
                    if (!Number.isFinite(rss) || rss > 256 * 1024) {
                        running.kill("SIGKILL");
                        finish(new Error("PTC_MEMORY_LIMIT"));
                    }
                } catch {
                    running.kill("SIGKILL");
                    finish(new Error("PTC_SANDBOX_UNAVAILABLE"));
                }
            }, 100);
            let leaseDeadline = performance.now() + 1000;
            let renewingLease = false;
            const leaseMonitor = setInterval(() => {
                if (settled || options.onReserveTime === undefined) return;
                const remaining = leaseDeadline - performance.now();
                if (remaining <= 0) {
                    running.kill("SIGKILL");
                    finish(new Error("PTC_TIME_LIMIT"));
                    return;
                }
                if (remaining > 500 || renewingLease) return;
                renewingLease = true;
                void options.onReserveTime().then(() => {
                    renewingLease = false;
                    if (!settled) leaseDeadline += 1000;
                }).catch((error: unknown) => {
                    running.kill("SIGKILL");
                    finish(error instanceof Error ? error : new Error("PTC_TIME_LIMIT"));
                });
            }, 50);
            const send = (message: unknown): void => {
                if (settled || input!.destroyed) return;
                const line = JSON.stringify(message) + "\n";
                if (Buffer.byteLength(line) > FRAME_BYTES) throw new Error("PTC_FRAME_LIMIT");
                input!.write(line);
            };
            const accept = (message: unknown): void => {
                if (typeof message !== "object" || message === null || Array.isArray(message)) {
                    throw new Error("PTC_PROTOCOL_ERROR");
                }
                const frame = message as Record<string, unknown>;
                if (frame.type === "call") {
                    if (frame.id !== nextCallId || typeof frame.toolId !== "string") {
                        throw new Error("PTC_PROTOCOL_ERROR");
                    }
                    nextCallId += 1;
                    queue = queue.then(async () => {
                        if (settled || stopping) return;
                        const value = await options.onToolCall({
                            toolId: frame.toolId as string,
                            input: frame.input,
                        }, workAbort.signal);
                        if (!settled) send({ type: "result", id: frame.id, value });
                    }).catch((error: unknown) => {
                        running.kill("SIGKILL");
                        finish(error instanceof Error ? error : new Error("PTC_TOOL_ERROR"));
                    });
                    return;
                }
                if (frame.type === "return") {
                    const encoded = JSON.stringify(frame.value);
                    if (encoded === undefined || Buffer.byteLength(encoded) > OUTPUT_BYTES) {
                        throw new Error("PTC_RETURN_LIMIT");
                    }
                    void queue.then(() => finish(undefined, frame.value));
                    return;
                }
                if (frame.type === "error" && typeof frame.code === "string") {
                    stopping = true;
                    void queue.then(() => finish(new Error((frame.code as string).slice(0, 120))));
                    return;
                }
                throw new Error("PTC_PROTOCOL_ERROR");
            };
            output!.setEncoding("utf8");
            output!.on("data", (chunk: string) => {
                if (settled) return;
                buffer += chunk;
                if (Buffer.byteLength(buffer) > FRAME_BYTES) {
                    running.kill("SIGKILL");
                    finish(new Error("PTC_FRAME_LIMIT"));
                    return;
                }
                let index: number;
                while ((index = buffer.indexOf("\n")) >= 0 && !settled) {
                    const line = buffer.slice(0, index);
                    buffer = buffer.slice(index + 1);
                    try { accept(JSON.parse(line)); }
                    catch (error) {
                        running.kill("SIGKILL");
                        finish(error instanceof Error ? error : new Error("PTC_PROTOCOL_ERROR"));
                    }
                }
            });
            for (const stream of [running.stdout, running.stderr]) {
                stream?.on("data", (chunk: Buffer) => {
                    diagnosticBytes += chunk.length;
                    if (diagnosticBytes > DIAGNOSTIC_BYTES && !settled) {
                        running.kill("SIGKILL");
                        finish(new Error("PTC_DIAGNOSTIC_LIMIT"));
                    }
                });
            }
            running.on("error", () => finish(new Error("PTC_SANDBOX_UNAVAILABLE")));
            input!.on("error", () => {
                // 子进程退出或被取消后的 EPIPE 由原始错误或 exit 路径结算。
            });
            running.on("exit", () => {
                void queue.then(() => {
                    if (!settled) finish(new Error("PTC_SANDBOX_UNAVAILABLE"));
                });
            });
            if (options.signal?.aborted) onAbort();
            else options.signal?.addEventListener("abort", onAbort, { once: true });
            try {
                send({
                    type: "start",
                    code: options.code,
                    fixedTime: options.fixedTime ?? 0,
                    seed: options.seed ?? 1,
                });
            } catch (error) {
                running.kill("SIGKILL");
                finish(error instanceof Error ? error : new Error("PTC_PROTOCOL_ERROR"));
            }
        });
        return result;
    } finally {
        if (child !== undefined && child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
        }
        if (childClosed !== undefined) {
            await Promise.race([
                childClosed,
                new Promise<void>((resolveWait) => setTimeout(resolveWait, 1000)),
            ]);
        }
        await cleanupPrivateTmpDir(privateTmpDir);
    }
}

/**
 * 收集 Node.js 启动所需的已解析动态库，以供同一 Seatbelt 策略及内核探针使用。
 *
 * @example
 * ```ts
 * const files = collectProgramRuntimeFiles(process.execPath);
 * ```
 */
export function collectProgramRuntimeFiles(executable: string): Set<string> {
    const files = new Set<string>();
    const visited = new Set<string>();
    const visit = (path: string): void => {
        const canonical = realpathSync(path);
        files.add(path);
        if (visited.has(canonical)) return;
        if (!statFile(canonical)) throw new Error("PTC_SANDBOX_UNAVAILABLE");
        visited.add(canonical);
        files.add(canonical);
        let output: string;
        try {
            output = execFileSync("/usr/bin/otool", ["-L", canonical], {
                encoding: "utf8", timeout: 3000, maxBuffer: 1024 * 1024,
            });
        } catch {
            throw new Error("PTC_SANDBOX_UNAVAILABLE");
        }
        for (const line of output.split("\n").slice(1)) {
            const name = line.trim().split(" (")[0];
            if (name === undefined || name === "" || name.startsWith("/usr/lib/")
                || name.startsWith("/System/Library/")) continue;
            let dependency: string;
            if (name.startsWith("@loader_path/")) {
                dependency = resolve(dirname(canonical), name.slice("@loader_path/".length));
            } else if (name.startsWith("@rpath/")) {
                const fileName = name.slice("@rpath/".length);
                const local = resolve(dirname(canonical), fileName);
                dependency = statFile(local)
                    ? local
                    : resolve(dirname(executable), "../lib", fileName);
            } else if (name.startsWith("/")) {
                dependency = name;
            } else {
                throw new Error("PTC_SANDBOX_UNAVAILABLE");
            }
            visit(dependency);
        }
    };
    visit(executable);
    return files;
}

function statFile(path: string): boolean {
    try { return statSync(path).isFile(); }
    catch { return false; }
}

/** 固定 worker 资产的摘要，用于恢复时验证执行规则未改变。 */
export function programWorkerHash(): string {
    return createHash("sha256").update(readFileSync(WORKER_PATH)).digest("hex");
}
