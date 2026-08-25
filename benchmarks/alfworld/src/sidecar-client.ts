import { spawn, type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Buffer } from "node:buffer";
import type { Readable, Writable } from "node:stream";

export const DEFAULT_SIDECAR_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_STDERR_BYTES = 8 * 1024;

export type SidecarOperation = "health" | "reset" | "step" | "close";

/**
 * 一个固定 ALFWorld 任务的 sidecar 初始化参数。
 *
 * @example
 * ```ts
 * const task: SidecarTask = {
 *   taskId: "valid-seen-0001",
 *   gameFile: "valid_seen/0001/game.tw-pddl",
 *   split: "valid_seen",
 *   seed: 7,
 *   maxSteps: 100,
 * };
 * ```
 */
export interface SidecarTask {
    readonly taskId: string;
    readonly gameFile: string;
    readonly split: string;
    readonly seed: number;
    readonly maxSteps: number;
}

/**
 * sidecar 的健康检查结果。
 *
 * @remarks
 * 该结果来自 Python 进程，不代表某个任务已经启动；`textworldOnly` 必须为
 * `true`，以防评测误启用视觉环境。
 *
 * @example
 * ```ts
 * const health = await client.start();
 * if (!health.textworldOnly) throw new Error("THOR is not allowed");
 * ```
 */
export interface SidecarHealth {
    readonly pythonVersion: string;
    readonly alfworldVersion: string;
    readonly textworldVersion: string;
    readonly dataRoot: string;
    readonly textworldOnly: true;
}

/**
 * sidecar reset 的初始观察。
 *
 * @example
 * ```ts
 * const initial = await client.reset(task);
 * console.log(initial.observation);
 * ```
 */
export interface SidecarResetResult {
    readonly taskId: string;
    readonly gameFile: string;
    readonly observation: string;
    readonly admissibleCommands: readonly string[];
}

/**
 * sidecar 单步结果。
 *
 * @remarks
 * `accepted=false` 表示环境拒绝了命令，但仍是可供下一轮 Agent 决策使用的
 * 领域结果；进程或协议故障不会伪造此结果，而会抛出 `SidecarError`。
 *
 * @example
 * ```ts
 * const result = await client.step("look");
 * if (!result.accepted) console.log(result.error?.message);
 * ```
 */
export interface SidecarStepResult {
    readonly observation: string;
    readonly done: boolean;
    readonly won: boolean;
    readonly goalConditionSuccessRate: number;
    readonly admissibleCommands: readonly string[];
    readonly accepted: boolean;
    readonly error: SidecarDomainError | null;
}

/**
 * 环境接受协议但拒绝命令时的可继续决策错误。
 *
 * @example
 * ```ts
 * const error: SidecarDomainError = { code: "DOMAIN_COMMAND_REJECTED", message: "不能拿取该物品" };
 * ```
 */
export interface SidecarDomainError {
    readonly code: string;
    readonly message: string;
}

export type SidecarErrorCode =
    | "NOT_STARTED"
    | "CLOSED"
    | "CONCURRENT_REQUEST"
    | "TIMEOUT"
    | "ABORTED"
    | "PROCESS_EXITED"
    | "PROCESS_ERROR"
    | "PROTOCOL_ERROR"
    | "REMOTE_ERROR";

/**
 * sidecar 生命周期、协议或环境连接失败。
 *
 * @remarks
 * 这类错误意味着当前环境会话结果未知；调用方必须关闭会话，且不得重放未知
 * 的 `step` 请求。领域命令拒绝不会使用此错误，而会返回 `accepted=false`。
 *
 * @example
 * ```ts
 * try {
 *   await client.step("take apple");
 * } catch (error) {
 *   if (error instanceof SidecarError) console.error(error.code);
 * }
 * ```
 */
export class SidecarError extends Error {
    readonly name: string = "SidecarError";

    constructor(
        readonly code: SidecarErrorCode,
        message: string,
        readonly cause?: unknown,
    ) {
        super(message);
    }
}

/**
 * sidecar 请求因 AbortSignal 被中止。
 *
 * @example
 * ```ts
 * const controller = new AbortController();
 * await client.step("look", controller.signal);
 * ```
 */
export class SidecarAbortedError extends SidecarError {
    readonly name = "SidecarAbortedError";

    constructor(message = "ALFWorld sidecar request was aborted") {
        super("ABORTED", message);
    }
}

/**
 * SidecarClient 的进程和边界配置。
 *
 * @remarks
 * `spawnProcess` 仅用于测试替换；真实实现始终以 `shell:false` 启动
 * `pythonExecutable`，并把 `dataRoot` 注入子进程环境。
 *
 * @example
 * ```ts
 * const options: SidecarClientOptions = {
 *   pythonExecutable: "/opt/conda/bin/python",
 *   scriptPath: "/repo/benchmarks/alfworld/python/sidecar.py",
 *   dataRoot: "/data/alfworld",
 * };
 * ```
 */
export interface SidecarClientOptions {
    readonly pythonExecutable: string;
    readonly scriptPath: string;
    readonly dataRoot: string;
    readonly timeoutMs?: number;
    readonly maxResponseBytes?: number;
    readonly env?: NodeJS.ProcessEnv;
    readonly spawnProcess?: SpawnSidecar;
}

/**
 * 可注入的子进程最小边界，供协议测试替换真实 Node child process。
 *
 * @example
 * ```ts
 * const client = new SidecarClient({
 *   pythonExecutable: "/python",
 *   scriptPath: "/sidecar.py",
 *   dataRoot: "/data",
 *   spawnProcess: fakeSpawn,
 * });
 * ```
 */
export interface SidecarProcess extends EventEmitter {
    readonly stdin: Writable;
    readonly stdout: Readable;
    readonly stderr: Readable;
    readonly exitCode: number | null;
    readonly killed: boolean;
    kill(signal?: NodeJS.Signals): boolean;
}

export type SpawnSidecar = (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
) => SidecarProcess;

type PendingRequest = {
    readonly requestId: number;
    readonly operation: SidecarOperation;
    readonly resolve: (value: unknown) => void;
    readonly reject: (error: SidecarError) => void;
    readonly timer: NodeJS.Timeout;
    readonly signal: AbortSignal | undefined;
    readonly abortListener: (() => void) | undefined;
};

type SidecarResponse =
    | { readonly requestId: number; readonly ok: true; readonly result: unknown }
    | {
          readonly requestId: number;
          readonly ok: false;
          readonly error: { readonly code: string; readonly message: string };
      };

type ClientState = "idle" | "starting" | "active" | "closing" | "closed";

/**
 * 管理一个任务级 JSONL sidecar 的启动、请求串行化和清理。
 *
 * @remarks
 * 进程使用 `shell:false` 启动；同一时间只允许一个未完成请求。响应大小、超时、
 * 中止、错配 requestId、非法 JSON 和意外退出都会结束当前会话，不会重放未知
 * 的环境操作。`close` 可重复调用。
 *
 * @example
 * ```ts
 * const client = new SidecarClient({
 *   pythonExecutable: process.env.ALFWORLD_PYTHON!,
 *   scriptPath: "benchmarks/alfworld/python/sidecar.py",
 *   dataRoot: process.env.ALFWORLD_DATA!,
 * });
 * try {
 *   await client.start();
 *   await client.reset(task);
 * } finally {
 *   await client.close();
 * }
 * ```
 */
export class SidecarClient {
    private readonly timeoutMs: number;
    private readonly maxResponseBytes: number;
    private readonly spawnProcess: SpawnSidecar;
    private process: SidecarProcess | undefined;
    private state: ClientState = "idle";
    private nextRequestId = 1;
    private pending: PendingRequest | undefined;
    private responseBuffer = Buffer.alloc(0);
    private stderrBuffer = Buffer.alloc(0);
    private startPromise: Promise<SidecarHealth> | undefined;
    private closePromise: Promise<void> | undefined;
    private healthResult: SidecarHealth | undefined;

    constructor(private readonly options: SidecarClientOptions) {
        this.timeoutMs = options.timeoutMs ?? DEFAULT_SIDECAR_TIMEOUT_MS;
        this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
        if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1) {
            throw new RangeError("Sidecar timeoutMs must be a positive integer");
        }
        if (!Number.isInteger(this.maxResponseBytes) || this.maxResponseBytes < 256) {
            throw new RangeError("Sidecar maxResponseBytes must be at least 256 bytes");
        }
        this.spawnProcess = options.spawnProcess ?? defaultSpawn;
    }

    /**
     * 启动 sidecar 并完成 health 探针。
     *
     * @param signal - 可选中止信号。
     * @returns sidecar 健康事实。
     * @throws 启动失败、协议失败、超时或中止时抛出 `SidecarError`。
     */
    async start(signal?: AbortSignal): Promise<SidecarHealth> {
        if (this.healthResult !== undefined && this.process !== undefined && this.state === "active") {
            return this.healthResult;
        }
        if (this.state === "closed" || this.state === "closing") {
            throw new SidecarError("CLOSED", "ALFWorld sidecar is closed");
        }
        if (this.startPromise !== undefined) return this.startPromise;
        if (signal?.aborted) throw new SidecarAbortedError();

        this.state = "starting";
        try {
            this.process = this.spawnProcess(
                this.options.pythonExecutable,
                [this.options.scriptPath],
                {
                    env: {
                        ...process.env,
                        ...this.options.env,
                        ALFWORLD_DATA: this.options.dataRoot,
                    },
                    shell: false,
                    stdio: ["pipe", "pipe", "pipe"],
                },
            );
        } catch (error: unknown) {
            this.state = "closed";
            throw new SidecarError("PROCESS_ERROR", "Unable to spawn ALFWorld sidecar", error);
        }
        this.attachProcessListeners(this.process);

        this.startPromise = this.sendRequest("health", {}, signal)
            .then((value) => {
                const health = parseHealth(value);
                this.healthResult = health;
                this.state = "active";
                return health;
            })
            .catch((error: unknown) => {
                const sidecarError = asSidecarError(error);
                this.failSession(sidecarError);
                throw sidecarError;
            })
            .finally(() => {
                this.startPromise = undefined;
            });

        return this.startPromise;
    }

    /**
     * 启动或复用 sidecar，并绑定一个固定任务。
     *
     * @param task - Manifest 已校验的任务。
     * @param signal - 可选中止信号。
     * @returns 初始观察和可用命令。
     * @throws sidecar 不可用、请求冲突或协议失败时抛出 `SidecarError`。
     */
    async reset(task: SidecarTask, signal?: AbortSignal): Promise<SidecarResetResult> {
        await this.start(signal);
        return parseReset(await this.sendRequest("reset", { task }, signal));
    }

    /**
     * 向活动任务提交恰好一条文本命令。
     *
     * @param command - 非空环境命令；不会自动拆分、改写或重放。
     * @param signal - 可选中止信号。
     * @returns 环境观察、终态和领域命令结果。
     * @throws 请求冲突、超时、中止、进程退出或协议失败时抛出 `SidecarError`。
     */
    async step(command: string, signal?: AbortSignal): Promise<SidecarStepResult> {
        if (command.trim().length === 0) {
            throw new SidecarError("PROTOCOL_ERROR", "ALFWorld step command must be non-empty");
        }
        await this.start(signal);
        return parseStep(await this.sendRequest("step", { command }, signal));
    }

    /**
     * 请求 sidecar 释放任务并关闭进程；重复调用安全且不重放未完成请求。
     *
     * @returns 进程清理完成后的 Promise。
     * @throws 关闭请求本身失败时抛出 `SidecarError`，但仍会尝试终止进程。
     */
    async close(): Promise<void> {
        if (this.closePromise !== undefined) return this.closePromise;
        if (this.process === undefined || this.state === "closed") {
            this.state = "closed";
            return;
        }

        this.state = "closing";
        this.closePromise = this.closeProcess().finally(() => {
            this.state = "closed";
            this.process = undefined;
            this.closePromise = undefined;
        });
        return this.closePromise;
    }

    private async closeProcess(): Promise<void> {
        const process = this.process;
        if (process === undefined) return;

        if (this.pending !== undefined) {
            this.rejectPending(new SidecarError("CLOSED", "ALFWorld sidecar closed with a request pending"));
            process.kill("SIGTERM");
            await waitForExit(process, this.timeoutMs);
            return;
        }

        try {
            await this.sendRequest("close", {});
        } catch (error: unknown) {
            process.kill("SIGTERM");
            await waitForExit(process, this.timeoutMs);
            throw asSidecarError(error);
        }
        await waitForExit(process, this.timeoutMs);
    }

    private sendRequest(
        operation: SidecarOperation,
        payload: unknown,
        signal?: AbortSignal,
    ): Promise<unknown> {
        if (this.process === undefined) {
            return Promise.reject(new SidecarError("NOT_STARTED", "ALFWorld sidecar is not started"));
        }
        if (this.pending !== undefined) {
            const error = new SidecarError(
                "CONCURRENT_REQUEST",
                "ALFWorld sidecar only permits one pending request",
            );
            this.failSession(error);
            return Promise.reject(error);
        }
        if (this.state === "closed" || (this.state === "closing" && operation !== "close")) {
            return Promise.reject(new SidecarError("CLOSED", "ALFWorld sidecar is closed"));
        }
        if (signal?.aborted) {
            const error = new SidecarAbortedError();
            this.failSession(error);
            return Promise.reject(error);
        }

        const requestId = this.nextRequestId++;
        const packet = JSON.stringify({ requestId, op: operation, ...asRecord(payload) }) + "\n";
        return new Promise<unknown>((resolve, reject) => {
            const timer = setTimeout(() => {
                const error = new SidecarError(
                    "TIMEOUT",
                    `ALFWorld sidecar ${operation} request timed out after ${this.timeoutMs}ms`,
                );
                this.failSession(error);
            }, this.timeoutMs);
            const abortListener = signal === undefined ? undefined : () => {
                const error = new SidecarAbortedError();
                this.failSession(error);
            };
            if (signal !== undefined && abortListener !== undefined) {
                signal.addEventListener("abort", abortListener, { once: true });
            }
            this.pending = {
                requestId,
                operation,
                resolve,
                reject,
                timer,
                signal,
                abortListener,
            };
            try {
                this.process?.stdin.write(packet);
            } catch (error: unknown) {
                this.failSession(new SidecarError("PROCESS_ERROR", "Unable to write to ALFWorld sidecar", error));
            }
        });
    }

    private attachProcessListeners(process: SidecarProcess): void {
        process.stdout.on("data", (chunk: Buffer | string) => this.handleStdout(chunk));
        process.stderr.on("data", (chunk: Buffer | string) => this.handleStderr(chunk));
        process.once("error", (error: Error) => {
            this.failSession(new SidecarError("PROCESS_ERROR", "ALFWorld sidecar process failed", error));
        });
        process.once("exit", (code: number | null, signal: NodeJS.Signals | null) => {
            this.process = undefined;
            if (this.pending !== undefined) {
                this.rejectPending(
                    new SidecarError(
                        "PROCESS_EXITED",
                        `ALFWorld sidecar exited before completing ${this.pending.operation} (code=${String(code)}, signal=${String(signal)})`,
                    ),
                );
            }
            if (this.state !== "closing") this.state = "closed";
        });
    }

    private handleStdout(chunk: Buffer | string): void {
        this.responseBuffer = Buffer.concat([
            this.responseBuffer,
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
        ]);
        if (this.responseBuffer.byteLength > this.maxResponseBytes) {
            this.failSession(
                new SidecarError(
                    "PROTOCOL_ERROR",
                    `ALFWorld sidecar response exceeded ${this.maxResponseBytes} bytes`,
                ),
            );
            return;
        }

        let newlineIndex = this.responseBuffer.indexOf(0x0a);
        while (newlineIndex >= 0) {
            const line = this.responseBuffer.subarray(0, newlineIndex).toString("utf8").replace(/\r$/, "");
            this.responseBuffer = this.responseBuffer.subarray(newlineIndex + 1);
            if (line.trim().length === 0) {
                this.failSession(new SidecarError("PROTOCOL_ERROR", "ALFWorld sidecar emitted an empty line"));
                return;
            }
            this.handleLine(line);
            if (this.state === "closed") return;
            newlineIndex = this.responseBuffer.indexOf(0x0a);
        }
    }

    private handleStderr(chunk: Buffer | string): void {
        const next = Buffer.concat([
            this.stderrBuffer,
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
        ]);
        this.stderrBuffer = next.subarray(Math.max(0, next.byteLength - MAX_STDERR_BYTES));
    }

    private handleLine(line: string): void {
        let value: unknown;
        try {
            value = JSON.parse(line);
        } catch (error: unknown) {
            this.failSession(new SidecarError("PROTOCOL_ERROR", "ALFWorld sidecar emitted invalid JSON", error));
            return;
        }
        if (!isSidecarResponse(value)) {
            this.failSession(new SidecarError("PROTOCOL_ERROR", "ALFWorld sidecar response shape is invalid"));
            return;
        }
        if (this.pending === undefined || value.requestId !== this.pending.requestId) {
            this.failSession(new SidecarError("PROTOCOL_ERROR", "ALFWorld sidecar response requestId did not match"));
            return;
        }

        const pending = this.pending;
        this.pending = undefined;
        clearTimeout(pending.timer);
        if (pending.signal !== undefined && pending.abortListener !== undefined) {
            pending.signal.removeEventListener("abort", pending.abortListener);
        }
        if (value.ok) {
            pending.resolve(value.result);
        } else {
            pending.reject(
                new SidecarError("REMOTE_ERROR", `${value.error.code}: ${value.error.message}`),
            );
        }
    }

    private rejectPending(error: SidecarError): void {
        const pending = this.pending;
        if (pending === undefined) return;
        this.pending = undefined;
        clearTimeout(pending.timer);
        if (pending.signal !== undefined && pending.abortListener !== undefined) {
            pending.signal.removeEventListener("abort", pending.abortListener);
        }
        pending.reject(error);
    }

    private failSession(error: SidecarError): void {
        this.rejectPending(error);
        this.state = "closed";
        const process = this.process;
        this.process = undefined;
        if (process !== undefined && !process.killed) process.kill("SIGTERM");
    }
}

function defaultSpawn(
    command: string,
    args: readonly string[],
    options: SpawnOptions,
): SidecarProcess {
    return spawn(command, [...args], options) as unknown as SidecarProcess;
}

function asSidecarError(error: unknown): SidecarError {
    return error instanceof SidecarError
        ? error
        : new SidecarError("PROCESS_ERROR", "ALFWorld sidecar operation failed", error);
}

function asRecord(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSidecarResponse(value: unknown): value is SidecarResponse {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    if (!Number.isInteger(record.requestId)) return false;
    if (record.ok === true && "result" in record) return true;
    if (record.ok !== false || typeof record.error !== "object" || record.error === null) return false;
    const error = record.error as Record<string, unknown>;
    return typeof error.code === "string" && typeof error.message === "string";
}

function parseHealth(value: unknown): SidecarHealth {
    if (
        !isRecord(value) ||
        typeof value.pythonVersion !== "string" ||
        typeof value.alfworldVersion !== "string" ||
        typeof value.textworldVersion !== "string" ||
        typeof value.dataRoot !== "string" ||
        value.textworldOnly !== true
    ) {
        throw new SidecarError("PROTOCOL_ERROR", "ALFWorld sidecar health result is invalid");
    }
    return value as unknown as SidecarHealth;
}

function parseReset(value: unknown): SidecarResetResult {
    if (
        !isRecord(value) ||
        typeof value.taskId !== "string" ||
        typeof value.gameFile !== "string" ||
        typeof value.observation !== "string" ||
        !isStringArray(value.admissibleCommands)
    ) {
        throw new SidecarError("PROTOCOL_ERROR", "ALFWorld sidecar reset result is invalid");
    }
    return value as unknown as SidecarResetResult;
}

function parseStep(value: unknown): SidecarStepResult {
    if (
        !isRecord(value) ||
        typeof value.observation !== "string" ||
        typeof value.done !== "boolean" ||
        typeof value.won !== "boolean" ||
        typeof value.goalConditionSuccessRate !== "number" ||
        !isStringArray(value.admissibleCommands) ||
        typeof value.accepted !== "boolean" ||
        (value.error !== null && !isRecord(value.error))
    ) {
        throw new SidecarError("PROTOCOL_ERROR", "ALFWorld sidecar step result is invalid");
    }
    if (
        value.error !== null &&
        (typeof value.error.code !== "string" || typeof value.error.message !== "string")
    ) {
        throw new SidecarError("PROTOCOL_ERROR", "ALFWorld sidecar domain error is invalid");
    }
    return value as unknown as SidecarStepResult;
}

function isStringArray(value: unknown): value is readonly string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function waitForExit(process: SidecarProcess, timeoutMs: number): Promise<void> {
    if (process.exitCode !== null) return Promise.resolve();
    return new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve();
        };
        const timer = setTimeout(() => {
            process.kill("SIGKILL");
            finish();
        }, timeoutMs);
        process.once("exit", finish);
    });
}
