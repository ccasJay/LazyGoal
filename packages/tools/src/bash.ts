import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";

import type {
    Tool,
    ToolDefinition,
    ToolExecutionRequest,
    ToolObservation,
    ToolValidationResult,
} from "../../runtime/src/index";
import {
    contract,
    type InferContract,
} from "../../contracts/src/index";
import {
    ExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../runtime/src/execution-control";
import { invalidInput } from "./internal/invalid-input";

/** `BashTool` 在 Profile 中使用的稳定标识。 */
export const BASH_TOOL_ID = "bash";

/** 未指定 `timeoutMs` 时使用的默认命令超时（毫秒）。 */
const BASH_DEFAULT_TIMEOUT_MS = 30_000;

/** 单次命令允许的最大超时（毫秒）。 */
export const BASH_MAX_TIMEOUT_MS = 120_000;

/** stdout/stderr 各自保留在 Observation 中的最大字符数。 */
export const BASH_MAX_OUTPUT_CHARS = 10_000;

/** Bash Tool 的唯一输入 Contract。 */
export const BASH_INPUT_CONTRACT = contract.object({
    command: contract.string(),
    timeoutMs: contract.optional(contract.integer({
        minimum: 1,
        maximum: BASH_MAX_TIMEOUT_MS,
    })),
});

type BashInput = InferContract<typeof BASH_INPUT_CONTRACT>;

/**
 * 单个子进程输出流的有界尾部收集器。
 *
 * @remarks
 * 收集器只保留流尾部的有限字符并在丢弃前缀时累计省略字符数，因此内存占用
 * 不随命令总输出量增长。它不负责终止命令；输出超量时进程继续运行直到
 * 退出、超时或被中止。
 */
interface TailCollector {
    /**
     * 按到达顺序消费一段 UTF-8 文本。
     *
     * @param chunk - 子进程流解码后的文本块；多字节字符不会跨块拆坏。
     */
    push(chunk: string): void;
    /**
     * 把累计内容投影为 Observation 使用的字符串。
     *
     * @returns 未超限时返回原文；超限后返回
     *   `[...已省略前 N 字符...]\n<尾部>`，N 为累计丢弃的字符数。
     */
    result(): string;
}

function createTailCollector(limit: number): TailCollector {
    let tail = "";
    let omitted = 0;

    return {
        push(chunk) {
            tail += chunk;

            if (tail.length <= limit) {
                return;
            }

            let drop = tail.length - limit;
            const boundary = tail.charCodeAt(drop);

            if (boundary >= 0xdc00 && boundary <= 0xdfff) {
                drop += 1;
            }

            omitted += drop;
            tail = tail.slice(drop);
        },
        result() {
            return omitted === 0
                ? tail
                : `[...已省略前 ${omitted} 字符...]\n${tail}`;
        },
    };
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

/** 子进程 `close` 事件给出的命令结算事实。 */
interface CommandOutcome {
    /** 是否因本地超时计时器触发而发送过 SIGTERM。 */
    readonly timedOut: boolean;
    /** 命令退出码；被信号终止时为 `null`。 */
    readonly exitCode: number | null;
    /** 终止命令的信号名；正常退出时为 `null`。 */
    readonly signal: NodeJS.Signals | null;
}

function runShellCommand(
    command: string,
    options: {
        readonly cwd: string;
        readonly timeoutMs: number;
        readonly signal?: AbortSignal;
        readonly stdout: TailCollector;
        readonly stderr: TailCollector;
    },
): Promise<CommandOutcome> {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn(command, {
            cwd: options.cwd,
            shell: process.platform === "win32" ? true : "/bin/bash",
            stdio: ["ignore", "pipe", "pipe"],
        });
        let settled = false;
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
        }, options.timeoutMs);
        const onAbort = (): void => {
            child.kill("SIGTERM");
        };
        const cleanup = (): void => {
            clearTimeout(timer);
            options.signal?.removeEventListener("abort", onAbort);
        };
        const settle = (callback: () => void): void => {
            if (settled) {
                return;
            }

            settled = true;
            cleanup();
            callback();
        };

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
            options.stdout.push(chunk);
        });
        child.stderr.on("data", (chunk: string) => {
            options.stderr.push(chunk);
        });
        child.on("error", (error: Error) => {
            settle(() => {
                rejectPromise(error);
            });
        });
        child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
            settle(() => {
                resolvePromise({ timedOut, exitCode: code, signal });
            });
        });
        options.signal?.addEventListener("abort", onAbort, { once: true });
    });
}

/**
 * 在指定 workspaceRoot 内执行 bash 命令的 Tool。
 *
 * @remarks
 * 非 Windows 平台通过 `/bin/bash -c` 执行，`cwd` 固定为 workspaceRoot 的
 * 真实路径。命令带超时（默认 30 秒，输入可在 120 秒上限内覆盖），超时或
 * 中止时以 SIGTERM 终止子进程。stdout 与 stderr 以流式方式持续消费，各自
 * 只保留尾部 10000 字符并以省略标记标注被丢弃的前缀；输出超量不会终止
 * 命令，收集内存不随输出总量增长。退出码 0 返回包含截断输出的
 * `success`；非零退出码与超时分别返回 `COMMAND_FAILED` 和
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
export class BashTool implements Tool<typeof BASH_INPUT_CONTRACT> {
    readonly definition: ToolDefinition<typeof BASH_INPUT_CONTRACT> = {
        id: BASH_TOOL_ID,
        description: "在 workspaceRoot 内以 bash 执行命令并返回截断后的 stdout/stderr",
        inputContract: BASH_INPUT_CONTRACT,
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
     * @param input - 已由 Input Contract 解析的结构化输入。
     * @returns 领域语义合法性；`command` 不能为空白，`timeoutMs` 为可选正整数。
     */
    validate(input: BashInput): ToolValidationResult {
        return this.checkSemantics(input);
    }

    private checkSemantics(parsed: BashInput): ToolValidationResult {
        if (parsed.command.trim() === "") {
            return invalidInput("bash.command 不能为空");
        }

        if (parsed.command.includes("\0")) {
            return invalidInput("bash.command 不能包含 NUL 字符");
        }

        return { ok: true };
    }

    /**
     * 执行一次已通过校验的 bash 命令。
     *
     * @param request - Action ID 与 `{ command, timeoutMs? }` 输入。
     * @param control - 当前 Run 推进调用共享的中止控制；中止会终止子进程。
     * @returns 截断输出组成的成功或命令领域失败 Observation。
     * @throws workspaceRoot 无法解析或 shell 无法启动等基础设施异常；中止时抛出
     *   `ExecutionAbortedError`。
     */
    async execute(
        request: ToolExecutionRequest<BashInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);
        const input = request.input;
        const timeoutMs = input.timeoutMs ?? BASH_DEFAULT_TIMEOUT_MS;
        const resolvedRoot = await realpath(this.workspaceRoot);
        throwIfAborted(control);

        const stdout = createTailCollector(BASH_MAX_OUTPUT_CHARS);
        const stderr = createTailCollector(BASH_MAX_OUTPUT_CHARS);
        const outcome = await runShellCommand(input.command, {
            cwd: resolvedRoot,
            timeoutMs,
            ...(control?.signal === undefined
                ? {}
                : { signal: control.signal }),
            stdout,
            stderr,
        });

        throwIfAborted(control);

        const truncatedStdout = stdout.result();
        const truncatedStderr = stderr.result();
        const output = combineOutput(truncatedStdout, truncatedStderr);
        const suffix = output === "" ? "" : `: ${output}`;

        if (outcome.timedOut) {
            return {
                kind: "failure",
                code: "COMMAND_TIMEOUT",
                message: `命令超过 ${timeoutMs}ms 被终止${suffix}`,
                retryable: true,
            };
        }

        if (outcome.exitCode === 0) {
            return {
                kind: "success",
                output: {
                    exitCode: 0,
                    stdout: truncatedStdout,
                    stderr: truncatedStderr,
                },
                summary: "命令执行成功",
            };
        }

        if (typeof outcome.exitCode === "number") {
            return {
                kind: "failure",
                code: "COMMAND_FAILED",
                message: `命令退出码 ${outcome.exitCode}${suffix}`,
                retryable: true,
            };
        }

        return {
            kind: "failure",
            code: "COMMAND_FAILED",
            message: `命令被信号 ${outcome.signal ?? "unknown"} 终止${suffix}`,
            retryable: true,
        };
    }
}
