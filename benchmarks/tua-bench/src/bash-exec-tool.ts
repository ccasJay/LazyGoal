import { spawn } from "node:child_process";
import { resolve } from "node:path";
import {
    contract,
    type InferContract,
} from "../../../packages/contracts/src/index.js";
import type {
    Tool,
    ToolDefinition,
    ToolExecutionRequest,
    ToolObservation,
    ToolValidationResult,
} from "../../../packages/runtime/src/index.js";
import {
    throwIfAborted,
    type ExecutionControl,
} from "../../../packages/execution-control/src/index.js";
import { invalidInput } from "../../../packages/tools/src/internal/invalid-input.js";

/** `BashExecTool` 在 Profile 中使用的稳定标识。 */
export const BASH_EXEC_TOOL_ID = "bash_exec";

/** 默认单条 shell 命令执行超时（毫秒）：120 秒。 */
export const BASH_EXEC_DEFAULT_TIMEOUT_MS = 120_000;

/** 单条命令最大允许超时（毫秒）：600 秒。 */
export const BASH_EXEC_MAX_TIMEOUT_MS = 600_000;

/** stdout 与 stderr 各自允许保留的最大字节数（100KB）。 */
export const BASH_EXEC_MAX_OUTPUT_BYTES = 100 * 1024;

/** SIGTERM 后等待进程组退出的优雅宽限期（毫秒）。 */
const TERMINATION_GRACE_MS = 2_000;

/** `bash_exec` 工具的输入 Contract。 */
export const BASH_EXEC_INPUT_CONTRACT = contract.object({
    command: contract.string(),
    timeoutMs: contract.optional(contract.integer({
        minimum: 1,
        maximum: BASH_EXEC_MAX_TIMEOUT_MS,
    })),
    workdir: contract.optional(contract.string()),
});

export type BashExecInput = InferContract<typeof BASH_EXEC_INPUT_CONTRACT>;

/**
 * `bash_exec` 工具的执行结果数据契约。
 */
export interface BashExecOutputData {
    /** 命令标准输出（超过 100KB 时截断）。 */
    readonly stdout: string;
    /** 命令标准错误（超过 100KB 时截断）。 */
    readonly stderr: string;
    /** 进程退出码（超时时通常为 124 或 -1）。 */
    readonly exitCode: number;
    /** 超时或异常错误提示。 */
    readonly error?: string;
}

/** `BashExecTool` 初始化选项。 */
export interface BashExecToolOptions {
    /** 默认工作目录，未提供时为当前进程工作目录。 */
    readonly defaultWorkdir?: string;
    /** 全局超时上限（毫秒），默认为 120_000。 */
    readonly defaultTimeoutMs?: number;
}

/**
 * 对输出内容进行有界截断（最多保留 maxBytes 字节）。
 *
 * @param content - 原始文本内容。
 * @param maxBytes - 最大保留字节数。
 * @returns 截断后内容，超出时附加提示。
 */
export function truncateOutput(content: string, maxBytes: number = BASH_EXEC_MAX_OUTPUT_BYTES): string {
    const totalBytes = Buffer.byteLength(content, "utf8");
    if (totalBytes <= maxBytes) {
        return content;
    }
    const buf = Buffer.from(content, "utf8").subarray(0, maxBytes);
    return buf.toString("utf8") + `\n[...已截断：输出超出 ${maxBytes} 字节限制...]`;
}

/**
 * TUA-Bench 容器内 Bash 执行工具。
 *
 * @remarks
 * 在容器环境中通过 `/bin/bash -c` 执行 shell 命令。支持超时控制、100KB 有界输出截断与进程组信号清理。
 *
 * @example
 * ```ts
 * const tool = new BashExecTool({ defaultWorkdir: "/home/agent" });
 * const result = await tool.execute({
 *   actionId: "act-1",
 *   input: { command: "ls -la" },
 * });
 * ```
 */
export class BashExecTool implements Tool<typeof BASH_EXEC_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof BASH_EXEC_INPUT_CONTRACT> = {
        id: BASH_EXEC_TOOL_ID,
        description: "在容器终端内执行 bash 命令，返回 stdout、stderr 与 exitCode。支持可选的超时时间与工作目录。",
        inputContract: BASH_EXEC_INPUT_CONTRACT,
        isReadOnly: false,
    };

    readonly replayPolicy = "manual" as const;

    private readonly defaultWorkdir: string;
    private readonly defaultTimeoutMs: number;

    constructor(options: BashExecToolOptions = {}) {
        this.defaultWorkdir = options.defaultWorkdir ?? process.cwd();
        this.defaultTimeoutMs = options.defaultTimeoutMs ?? BASH_EXEC_DEFAULT_TIMEOUT_MS;
    }

    /**
     * 校验已通过 Input Contract 的结构化输入语义。
     */
    validate(input: BashExecInput): ToolValidationResult {
        if (input.command.trim().length === 0) {
            return invalidInput("command 必须为非空字符串");
        }
        if (input.timeoutMs !== undefined) {
            if (typeof input.timeoutMs !== "number" || !Number.isInteger(input.timeoutMs) || input.timeoutMs <= 0 || input.timeoutMs > BASH_EXEC_MAX_TIMEOUT_MS) {
                return invalidInput("timeoutMs 必须为正整数且不超过上限");
            }
        }
        if (input.workdir !== undefined && typeof input.workdir !== "string") {
            return invalidInput("workdir 必须为有效字符串路径");
        }
        return { ok: true };
    }

    /**
     * 兼容测试的未定型输入校验辅助方法。
     */
    validateInput(input: unknown): ToolValidationResult & { value?: BashExecInput } {
        if (input === null || typeof input !== "object") {
            return invalidInput("输入必须为非空对象");
        }
        const record = input as Record<string, unknown>;
        if (typeof record.command !== "string" || record.command.trim().length === 0) {
            return invalidInput("command 必须为非空字符串");
        }
        const validated = this.validate({
            command: record.command,
            ...(typeof record.timeoutMs === "number" ? { timeoutMs: record.timeoutMs } : {}),
            ...(typeof record.workdir === "string" ? { workdir: record.workdir } : {}),
        });
        if (!validated.ok) return validated;
        return {
            ok: true,
            value: {
                command: record.command,
                ...(typeof record.timeoutMs === "number" ? { timeoutMs: record.timeoutMs } : {}),
                ...(typeof record.workdir === "string" ? { workdir: record.workdir } : {}),
            },
        };
    }

    async execute(
        request: ToolExecutionRequest<BashExecInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);

        const command = request.input.command;
        const timeoutMs = request.input.timeoutMs ?? this.defaultTimeoutMs;
        const cwd = request.input.workdir
            ? resolve(this.defaultWorkdir, request.input.workdir)
            : this.defaultWorkdir;

        return await new Promise<ToolObservation>((promiseResolve) => {
            let stdoutAccum = "";
            let stderrAccum = "";
            let isSettled = false;
            let timedOut = false;

            const child = spawn("/bin/bash", ["-c", command], {
                cwd,
                detached: true,
                stdio: ["ignore", "pipe", "pipe"],
            });

            const terminate = (force: boolean) => {
                if (child.pid === undefined) return;
                try {
                    process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM");
                } catch {
                    try {
                        child.kill(force ? "SIGKILL" : "SIGTERM");
                    } catch {
                        // 忽略已终止进程
                    }
                }
            };

            let timer: ReturnType<typeof setTimeout> | undefined;
            let forceTimer: ReturnType<typeof setTimeout> | undefined;

            const cleanup = () => {
                if (timer !== undefined) clearTimeout(timer);
                if (forceTimer !== undefined) clearTimeout(forceTimer);
                if (control?.signal) {
                    control.signal.removeEventListener("abort", onAbort);
                }
            };

            const finish = (exitCode: number, errorMsg?: string) => {
                if (isSettled) return;
                isSettled = true;
                cleanup();

                const truncatedStdout = truncateOutput(stdoutAccum);
                const truncatedStderr = truncateOutput(stderrAccum);

                if (timedOut) {
                    promiseResolve({
                        kind: "failure",
                        code: "COMMAND_TIMEOUT",
                        message: errorMsg ?? `Command timed out after ${timeoutMs}ms`,
                        retryable: true,
                    });
                    return;
                }

                if (exitCode === 0) {
                    promiseResolve({
                        kind: "success",
                        output: {
                            stdout: truncatedStdout,
                            stderr: truncatedStderr,
                            exitCode: 0,
                        },
                        summary: "命令执行成功",
                    });
                    return;
                }

                promiseResolve({
                    kind: "failure",
                    code: "COMMAND_FAILED",
                    message: errorMsg ?? (truncatedStderr.trim().length > 0 ? truncatedStderr : `Command exited with code ${exitCode}`),
                    retryable: true,
                });
            };

            const onAbort = () => {
                terminate(false);
                forceTimer = setTimeout(() => terminate(true), TERMINATION_GRACE_MS);
                finish(130, "Command aborted by user or timeout signal");
            };

            if (control?.signal) {
                if (control.signal.aborted) {
                    onAbort();
                    return;
                }
                control.signal.addEventListener("abort", onAbort, { once: true });
            }

            timer = setTimeout(() => {
                timedOut = true;
                terminate(false);
                forceTimer = setTimeout(() => terminate(true), TERMINATION_GRACE_MS);
                finish(124, `Command timed out after ${timeoutMs}ms`);
            }, timeoutMs);

            child.stdout?.on("data", (chunk: Buffer | string) => {
                stdoutAccum += chunk.toString();
            });

            child.stderr?.on("data", (chunk: Buffer | string) => {
                stderrAccum += chunk.toString();
            });

            child.on("error", (err) => {
                finish(-1, `Process spawn error: ${err.message}`);
            });

            child.on("close", (code) => {
                if (timedOut) {
                    // 已由超时回调处理
                    return;
                }
                finish(code ?? 0);
            });
        });
    }
}
