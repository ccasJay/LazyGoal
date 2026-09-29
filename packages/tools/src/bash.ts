import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";

import type {
    Tool,
    ToolDefinition,
    ToolExecutionRequest,
    ToolObservation,
    ToolStreamEvent,
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
import {
    buildSeatbeltPolicy,
    cleanupPrivateTmpDir,
    createPrivateTmpDir,
    filterSandboxEnvironment,
    isSeatbeltSupported,
    resolveGitProtectionPaths,
    SANDBOX_EXEC_PATH,
} from "../../sandbox/src/index";

/** `BashTool` 在 Profile 中使用的稳定标识。 */
export const BASH_TOOL_ID = "bash";

/** 未指定 `timeoutMs` 时使用的默认命令超时（毫秒）。 */
const BASH_DEFAULT_TIMEOUT_MS = 30_000;

/** 单次命令允许的最大超时（毫秒）。 */
export const BASH_MAX_TIMEOUT_MS = 120_000;

/** stdout/stderr 各自保留在 Observation 中的最大字符数。 */
export const BASH_MAX_OUTPUT_CHARS = 10_000;

/** SIGTERM 发往进程组后等待其自行退出的固定宽限(毫秒),到期升级 SIGKILL。 */
const BASH_TERMINATION_GRACE_MS = 2_000;

/** 单项文件沙箱访问申请 Contract。 */
export const SANDBOX_FILE_ACCESS_CONTRACT = contract.object({
    path: contract.string(),
    access: contract.enum(["read", "write"] as const),
    kind: contract.enum(["file", "directory_tree"] as const),
    purpose: contract.string(),
});

/** 网络沙箱访问申请 Contract。 */
export const SANDBOX_NETWORK_ACCESS_CONTRACT = contract.object({
    targets: contract.array(contract.string()),
    purpose: contract.string(),
});

/** 沙箱额外能力申请 Contract。 */
export const SANDBOX_ACCESS_CONTRACT = contract.object({
    files: contract.optional(contract.array(SANDBOX_FILE_ACCESS_CONTRACT)),
    network: contract.optional(SANDBOX_NETWORK_ACCESS_CONTRACT),
});

/** Bash Tool 的唯一输入 Contract。 */
export const BASH_INPUT_CONTRACT = contract.object({
    command: contract.string(),
    timeoutMs: contract.optional(contract.integer({
        minimum: 1,
        maximum: BASH_MAX_TIMEOUT_MS,
    })),
    sandboxAccess: contract.optional(SANDBOX_ACCESS_CONTRACT),
});

type BashInput = InferContract<typeof BASH_INPUT_CONTRACT>;

/**
 * BashTool 的配置选项。
 *
 * @remarks
 * 控制命令执行环境与操作系统级安全沙箱策略。
 *
 * @example
 * ```ts
 * const tool = new BashTool("/workspace/project", { enableSeatbelt: false });
 * ```
 */
export interface BashToolOptions {
    /**
     * 是否在受支持的平台（如 macOS）上启用 Seatbelt 沙箱保护。
     *
     * @remarks
     * 默认为 `true`。沙箱容器环境（如 Benchmark 评测容器）或无沙箱测试可将其设为 `false`。
     */
    readonly enableSeatbelt?: boolean;
}

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
    /** 是否因本地超时计时器触发过终止。 */
    readonly timedOut: boolean;
    /** 命令退出码；被信号终止时为 `null`。 */
    readonly exitCode: number | null;
    /** 终止命令的信号名；正常退出时为 `null`。 */
    readonly signal: NodeJS.Signals | null;
}

/** 将子进程回调转为 AsyncIterable 所需的有界内存队列。 */
class AsyncPushQueue<T> implements AsyncIterable<T>, AsyncIterator<T> {
    private readonly values: T[] = [];
    private readonly waiters: Array<{
        readonly resolve: (result: IteratorResult<T>) => void;
        readonly reject: (error: unknown) => void;
    }> = [];
    private closed = false;
    private failure: unknown;

    push(value: T): void {
        if (this.closed) return;
        const waiter = this.waiters.shift();
        if (waiter !== undefined) {
            waiter.resolve({ value, done: false });
            return;
        }
        this.values.push(value);
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.flush();
    }

    fail(error: unknown): void {
        if (this.closed) return;
        this.failure = error;
        this.closed = true;
        this.flush();
    }

    next(): Promise<IteratorResult<T>> {
        const value = this.values.shift();
        if (value !== undefined) {
            return Promise.resolve({ value, done: false });
        }
        if (this.closed) {
            return this.failure === undefined
                ? Promise.resolve({ value: undefined, done: true })
                : Promise.reject(this.failure);
        }
        return new Promise<IteratorResult<T>>((resolvePromise, rejectPromise) => {
            this.waiters.push({ resolve: resolvePromise, reject: rejectPromise });
        });
    }

    [Symbol.asyncIterator](): AsyncIterator<T> {
        return this;
    }

    private flush(): void {
        while (this.waiters.length > 0) {
            const waiter = this.waiters.shift()!;
            if (this.failure !== undefined) {
                waiter.reject(this.failure);
            } else {
                waiter.resolve({ value: undefined, done: true });
            }
        }
    }
}

function runShellCommand(
    command: string,
    options: {
        readonly cwd: string;
        readonly timeoutMs: number;
        readonly signal?: AbortSignal;
        readonly stdout: TailCollector;
        readonly stderr: TailCollector;
        readonly onOutput?: (channel: "stdout" | "stderr", text: string) => void;
        readonly sandbox?: {
            readonly policy: string;
            readonly env: NodeJS.ProcessEnv;
        };
    },
): Promise<CommandOutcome> {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = options.sandbox !== undefined
            ? spawn(
                SANDBOX_EXEC_PATH,
                ["-p", options.sandbox.policy, "/bin/bash", "-c", command],
                {
                    cwd: options.cwd,
                    env: options.sandbox.env,
                    stdio: ["ignore", "pipe", "pipe"],
                    detached: true,
                },
            )
            : spawn(command, {
                cwd: options.cwd,
                shell: process.platform === "win32" ? true : "/bin/bash",
                stdio: ["ignore", "pipe", "pipe"],
                detached: process.platform !== "win32",
            });
        let settled = false;
        let timedOut = false;
        let terminationStarted = false;
        let graceTimer: NodeJS.Timeout | undefined;
        // POSIX 上信号发往整个受管进程组(组长 PID 即 PGID);Windows 不创建
        // 进程组,维持单进程信号路径。组已消失时的 ESRCH 静默忽略。
        const killManagedProcesses = (signal: NodeJS.Signals): void => {
            if (child.pid === undefined) {
                return;
            }

            if (process.platform === "win32") {
                child.kill(signal);
                return;
            }

            try {
                process.kill(-child.pid, signal);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
                    throw error;
                }
            }
        };
        // 超时与 abort 共用同一双阶段终止:SIGTERM(整组)→ 固定宽限 →
        // SIGKILL(整组)。terminationStarted 保证幂等;宽限内 close 先到则由
        // settle 清除宽限计时,不升级 SIGKILL。
        const startTermination = (): void => {
            if (terminationStarted) {
                return;
            }

            terminationStarted = true;
            killManagedProcesses("SIGTERM");
            graceTimer = setTimeout(() => {
                killManagedProcesses("SIGKILL");
            }, BASH_TERMINATION_GRACE_MS);
        };
        const timer = setTimeout(() => {
            timedOut = true;
            startTermination();
        }, options.timeoutMs);
        const onAbort = (): void => {
            startTermination();
        };
        const cleanup = (): void => {
            clearTimeout(timer);

            if (graceTimer !== undefined) {
                clearTimeout(graceTimer);
            }

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
            options.onOutput?.("stdout", chunk);
        });
        child.stderr.on("data", (chunk: string) => {
            options.stderr.push(chunk);
            options.onOutput?.("stderr", chunk);
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
 * 真实路径。命令带超时（默认 30 秒，输入可在 120 秒上限内覆盖），超时与
 * 中止共用同一双阶段终止：先向整个受管进程组发送 SIGTERM，固定宽限
 * （内部常量，约 2 秒）后升级 SIGKILL，因此命令连同后台派生进程最迟在
 * `timeoutMs` 加固定宽限内终止并返回；主动脱离进程组（如 `setsid`）的
 * 进程不受管。Windows 平台不创建进程组，维持对直接子进程的现有单进程
 * 终止。stdout 与 stderr 以流式方式持续消费，各自
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
        isReadOnly: false,
    };

    readonly replayPolicy = "manual" as const;

    private readonly workspaceRoot: string;
    private readonly enableSeatbelt: boolean;

    /**
     * @param workspaceRoot - 命令执行时的工作区根目录，可为相对或绝对路径。
     * @param options - 可选配置项，控制是否启用操作系统级沙箱等选项。
     * @throws workspaceRoot 为空字符串时抛出 Error。
     */
    constructor(workspaceRoot: string, options?: BashToolOptions) {
        if (workspaceRoot.trim() === "") {
            throw new Error("workspaceRoot must be non-empty");
        }

        this.workspaceRoot = resolve(workspaceRoot);
        this.enableSeatbelt = options?.enableSeatbelt ?? true;
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

        if (parsed.sandboxAccess !== undefined) {
            const { files, network } = parsed.sandboxAccess;

            if (files !== undefined) {
                for (const file of files) {
                    if (file.path.trim() === "") {
                        return invalidInput("sandboxAccess.files.path 不能为空");
                    }
                    if (file.path.includes("\0")) {
                        return invalidInput("sandboxAccess.files.path 不能包含 NUL 字符");
                    }
                    if (file.purpose.trim() === "") {
                        return invalidInput("sandboxAccess.files.purpose 不能为空");
                    }
                }
            }

            if (network !== undefined) {
                if (network.targets.length === 0) {
                    return invalidInput("sandboxAccess.network.targets 不能为空列表");
                }
                for (const target of network.targets) {
                    if (target.trim() === "") {
                        return invalidInput("sandboxAccess.network.targets 包含空目标");
                    }
                }
                if (network.purpose.trim() === "") {
                    return invalidInput("sandboxAccess.network.purpose 不能为空");
                }
            }
        }

        return { ok: true };
    }

    /**
     * 执行一次已通过校验的 bash 命令。
     *
     * @param request - Action ID 与 `{ command, timeoutMs? }` 输入。
     * @param control - 当前 Run 推进调用共享的中止控制；中止会触发与超时相同的双阶段进程组终止。
     * @returns 截断输出组成的成功或命令领域失败 Observation。
     * @throws workspaceRoot 无法解析或 shell 无法启动等基础设施异常；中止时抛出
     *   `ExecutionAbortedError`。
     */
    async execute(
        request: ToolExecutionRequest<BashInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        return this.executeInternal(request, control);
    }

    /**
     * 流式执行一次 bash 命令，并在最终 Observation 前产出 stdout/stderr 分片。
     *
     * @param request - Action ID 与已解析的命令输入。
     * @param control - 当前 Run 的中止控制；中止仍传播 `ExecutionAbortedError`。
     * @returns 输出分片以及恰好一个 completed Observation；分片不改变最终截断规则。
     * @throws 与 `execute` 相同的校验、基础设施和中止异常。
     */
    async *stream(
        request: ToolExecutionRequest<BashInput>,
        control?: ExecutionControl,
    ): AsyncIterable<ToolStreamEvent> {
        const queue = new AsyncPushQueue<ToolStreamEvent>();
        void this.executeInternal(
            request,
            control,
            (channel, text) => queue.push({ kind: "output", channel, text }),
        ).then(
            (observation) => queue.push({ kind: "completed", observation }),
            (error) => queue.fail(error),
        ).finally(() => queue.close());

        for await (const event of queue) {
            yield event;
        }
    }

    private async executeInternal(
        request: ToolExecutionRequest<BashInput>,
        control?: ExecutionControl,
        onOutput?: (channel: "stdout" | "stderr", text: string) => void,
    ): Promise<ToolObservation> {
        throwIfAborted(control);
        const input = request.input;
        const timeoutMs = input.timeoutMs ?? BASH_DEFAULT_TIMEOUT_MS;
        const resolvedRoot = await realpath(this.workspaceRoot);
        throwIfAborted(control);

        const stdout = createTailCollector(BASH_MAX_OUTPUT_CHARS);
        const stderr = createTailCollector(BASH_MAX_OUTPUT_CHARS);

        const hasFiles = input.sandboxAccess?.files !== undefined && input.sandboxAccess.files.length > 0;
        const hasNetwork = input.sandboxAccess?.network !== undefined && input.sandboxAccess.network.targets.length > 0;
        const requiresExtraAccess = hasFiles || hasNetwork;

        const isPlanValid = request.plan !== undefined
            && (request.plan.actionId === undefined || request.plan.actionId === request.actionId)
            && (request.plan.workspaceRoot === this.workspaceRoot || request.plan.workspaceRoot === resolvedRoot);

        if (requiresExtraAccess && !isPlanValid) {
            return {
                kind: "failure",
                code: "SANDBOX_APPROVAL_REQUIRED",
                message: "命令申请了额外的沙箱文件或网络能力，须经 Permission 核准后方可执行",
                retryable: false,
            };
        }

        let privateTmpDir: string | undefined;
        let sandboxRunOptions: { policy: string; env: NodeJS.ProcessEnv } | undefined;

        if (process.platform === "darwin" && this.enableSeatbelt) {
            if (!isSeatbeltSupported()) {
                return {
                    kind: "failure",
                    code: "SANDBOX_UNAVAILABLE",
                    message: "macOS Seatbelt 沙箱不可用，拒绝无沙箱执行",
                    retryable: false,
                };
            }

            privateTmpDir = await createPrivateTmpDir();
            const protectedPaths = await resolveGitProtectionPaths(resolvedRoot);

            const extraReadPaths = isPlanValid
                ? request.plan?.scope.extraFiles
                    .filter((f) => f.access === "read" || f.access === "write")
                    .map((f) => f.canonicalPath)
                : undefined;
            const extraWritePaths = isPlanValid
                ? request.plan?.scope.extraFiles
                    .filter((f) => f.access === "write")
                    .map((f) => f.canonicalPath)
                : undefined;
            const network = isPlanValid ? (request.plan?.scope.network ?? "none") : "none";

            const policy = buildSeatbeltPolicy({
                canonicalWorkspaceRoot: resolvedRoot,
                privateTmpDir,
                protectedPaths,
                ...(extraReadPaths !== undefined ? { extraReadPaths } : {}),
                ...(extraWritePaths !== undefined ? { extraWritePaths } : {}),
                network,
            });
            const env = filterSandboxEnvironment({
                workspaceRoot: resolvedRoot,
                privateTmpDir,
            });

            sandboxRunOptions = { policy, env };
        }

        let outcome: CommandOutcome;
        try {
            outcome = await runShellCommand(input.command, {
                cwd: resolvedRoot,
                timeoutMs,
                ...(control?.signal === undefined
                    ? {}
                    : { signal: control.signal }),
                stdout,
                stderr,
                ...(onOutput === undefined ? {} : { onOutput }),
                ...(sandboxRunOptions === undefined ? {} : { sandbox: sandboxRunOptions }),
            });
        } catch (error) {
            throwIfAborted(control);
            return {
                kind: "failure",
                code: "SANDBOX_FAILURE",
                message: `命令启动故障: ${(error as Error).message}`,
                retryable: false,
            };
        } finally {
            if (privateTmpDir !== undefined) {
                await cleanupPrivateTmpDir(privateTmpDir);
            }
        }

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
