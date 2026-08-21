import { exec } from "node:child_process";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import type {
    JsonValue,
    Tool,
    ToolDefinition,
    ToolExecutionRequest,
    ToolObservation,
    ToolValidationResult,
} from "../../runtime/src/index";
import {
    ExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../runtime/src/execution-control";
import { isJsonObject, invalidInput } from "./internal/json-input";

/** `BashTool` 在 Profile 中使用的稳定标识。 */
export const BASH_TOOL_ID = "bash";

/** 未指定 `timeoutMs` 时使用的默认命令超时（毫秒）。 */
export const BASH_DEFAULT_TIMEOUT_MS = 30_000;

/** 单次命令允许的最大超时（毫秒）。 */
export const BASH_MAX_TIMEOUT_MS = 120_000;

/** stdout/stderr 各自保留在 Observation 中的最大字符数。 */
export const BASH_MAX_OUTPUT_CHARS = 10_000;

/** 子进程输出缓冲区上限（字节），超过即杀死进程。 */
export const BASH_MAX_BUFFER_BYTES = 1024 * 1024;

const execAsync = promisify(exec);

interface BashInput {
    readonly command: string;
    readonly timeoutMs?: number;
}

function parseInput(input: JsonValue): BashInput | undefined {
    if (!isJsonObject(input)) {
        return undefined;
    }

    const keys = Object.keys(input);

    if (!keys.every((key) => key === "command" || key === "timeoutMs")) {
        return undefined;
    }

    if (!Object.prototype.hasOwnProperty.call(input, "command")) {
        return undefined;
    }

    const command = input.command;

    if (typeof command !== "string") {
        return undefined;
    }

    if (
        Object.prototype.hasOwnProperty.call(input, "timeoutMs")
        && typeof input.timeoutMs !== "number"
    ) {
        return undefined;
    }

    return typeof input.timeoutMs === "number"
        ? { command, timeoutMs: input.timeoutMs }
        : { command };
}

/**
 * 截断超长输出，保留尾部并标注省略的字符数。
 *
 * @param text - 命令产生的原始 stdout 或 stderr。
 * @returns 不超过 `BASH_MAX_OUTPUT_CHARS`（含标记）的截断文本。
 */
function truncateOutput(text: string): string {
    if (text.length <= BASH_MAX_OUTPUT_CHARS) {
        return text;
    }

    const omitted = text.length - BASH_MAX_OUTPUT_CHARS;

    return `[...已省略前 ${omitted} 字符...]\n${text.slice(-BASH_MAX_OUTPUT_CHARS)}`;
}

function combineOutput(stdout: string, stderr: string): string {
    const parts: string[] = [];

    if (stdout !== "") {
        parts.push(stdout);
    }

    if (stderr !== "") {
        parts.push(stderr);
    }

    return parts.join("\n");
}

/**
 * 在指定 workspaceRoot 内执行 bash 命令的 Tool。
 *
 * @remarks
 * 非 Windows 平台通过 `/bin/bash -c` 执行，`cwd` 固定为 workspaceRoot 的
 * 真实路径。命令带超时（默认 30 秒，输入可在 120 秒上限内覆盖），stdout
 * 与 stderr 各截断保留尾部 10000 字符以保护快照体积。退出码 0 返回包含
 * 截断输出的 `success`；非零退出码与超时分别返回 `COMMAND_FAILED` 和
 * `COMMAND_TIMEOUT` 领域 failure，输出进入 message。命令副作用不可幂等
 * 重放，因此声明为 `manual`：进程中断后未完成的 Action 转为
 * `outcome_unknown` 等待用户决定。该 Tool 不限制命令内容本身、不控制
 * 并发数，也不对外部系统承诺 exactly-once。
 *
 * @example
 * ```ts
 * const tool = new BashTool("/workspace/project");
 * const result = await tool.execute({
 *   actionId: "action-1",
 *   input: { command: "ls -1", timeoutMs: 5000 },
 * });
 * ```
 */
export class BashTool implements Tool {
    readonly definition: ToolDefinition = {
        id: BASH_TOOL_ID,
        description: "在 workspaceRoot 内以 bash 执行命令并返回截断后的 stdout/stderr",
        inputSchema: {
            type: "object",
            properties: {
                command: { type: "string" },
                timeoutMs: { type: "integer", minimum: 1 },
            },
            required: ["command"],
            additionalProperties: false,
        },
    };

    readonly replayPolicy = "manual" as const;

    private readonly workspaceRoot: string;

    /**
     * @param workspaceRoot - 命令执行时的工作区根目录，可为相对或绝对路径。
     * @throws workspaceRoot 为空字符串时抛出 Error。
     */
    constructor(workspaceRoot: string) {
        if (workspaceRoot.trim() === "") {
            throw new Error("workspaceRoot must be non-empty");
        }

        this.workspaceRoot = resolve(workspaceRoot);
    }

    /**
     * 校验严格的 `{ command, timeoutMs? }` 输入，不启动子进程。
     *
     * @param input - Agent 提交的 JSON 输入。
     * @returns 输入合法性；`command` 不能为空白，`timeoutMs` 为可选正整数。
     */
    validate(input: JsonValue): ToolValidationResult {
        const parsed = parseInput(input);

        if (parsed === undefined) {
            return invalidInput(
                "bash 输入必须是只含 command（必填字符串）与 timeoutMs（可选数值）的对象",
            );
        }

        return this.checkSemantics(parsed);
    }

    private checkSemantics(parsed: BashInput): ToolValidationResult {
        if (parsed.command.trim() === "") {
            return invalidInput("bash.command 不能为空");
        }

        if (parsed.command.includes("\0")) {
            return invalidInput("bash.command 不能包含 NUL 字符");
        }

        if (parsed.timeoutMs !== undefined) {
            if (
                !Number.isInteger(parsed.timeoutMs)
                || parsed.timeoutMs <= 0
            ) {
                return invalidInput("bash.timeoutMs 必须是正整数（毫秒）");
            }

            if (parsed.timeoutMs > BASH_MAX_TIMEOUT_MS) {
                return invalidInput(
                    `bash.timeoutMs 不能超过 ${BASH_MAX_TIMEOUT_MS} 毫秒`,
                );
            }
        }

        return { ok: true };
    }

    /**
     * 执行一次已通过校验的 bash 命令。
     *
     * @param request - Action ID 与 `{ command, timeoutMs? }` 输入。
     * @param control - 当前 Run 推进调用共享的中止控制；中止会终止子进程。
     * @returns 截断输出组成的成功或命令领域失败 Observation。
     * @throws 输入未通过校验、workspaceRoot 无法解析或 shell 无法启动等
     *   基础设施异常；中止时抛出 `ExecutionAbortedError`。
     */
    async execute(
        request: ToolExecutionRequest,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);

        const parsed = parseInput(request.input);

        if (parsed === undefined) {
            throw new Error(
                "INVALID_TOOL_INPUT: bash requires { command: string, timeoutMs?: number }",
            );
        }

        const semantic = this.checkSemantics(parsed);

        if (!semantic.ok) {
            throw new Error(`${semantic.error.code}: ${semantic.error.message}`);
        }

        const timeoutMs = parsed.timeoutMs ?? BASH_DEFAULT_TIMEOUT_MS;
        const resolvedRoot = await realpath(this.workspaceRoot);
        throwIfAborted(control);

        try {
            const { stdout, stderr } = await execAsync(parsed.command, {
                cwd: resolvedRoot,
                timeout: timeoutMs,
                killSignal: "SIGTERM",
                maxBuffer: BASH_MAX_BUFFER_BYTES,
                signal: control?.signal,
                shell: process.platform === "win32" ? undefined : "/bin/bash",
            });

            throwIfAborted(control);

            return {
                kind: "success",
                output: {
                    exitCode: 0,
                    stdout: truncateOutput(stdout),
                    stderr: truncateOutput(stderr),
                },
                summary: "命令执行成功",
            };
        } catch (error) {
            if (control?.signal?.aborted) {
                throw new ExecutionAbortedError();
            }

            if (error !== null && typeof error === "object" && "killed" in error) {
                const execError = error as {
                    code?: unknown;
                    killed?: boolean;
                    stdout?: string;
                    stderr?: string;
                };
                const stdout = truncateOutput(execError.stdout ?? "");
                const stderr = truncateOutput(execError.stderr ?? "");
                const output = combineOutput(stdout, stderr);
                const suffix = output === "" ? "" : `: ${output}`;

                if (execError.killed === true) {
                    return {
                        kind: "failure",
                        code: "COMMAND_TIMEOUT",
                        message: `命令超过 ${timeoutMs}ms 被终止${suffix}`,
                        retryable: true,
                    };
                }

                if (typeof execError.code === "number") {
                    return {
                        kind: "failure",
                        code: "COMMAND_FAILED",
                        message: `命令退出码 ${execError.code}${suffix}`,
                        retryable: true,
                    };
                }
            }

            throw error;
        }
    }
}
