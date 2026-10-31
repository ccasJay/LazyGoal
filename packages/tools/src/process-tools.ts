import { resolve } from "node:path";
import { realpath } from "node:fs/promises";

import type {
    BoundTool,
    Tool,
    BoundToolDefinition,
    ToolExecutionRequest,
    ToolObservation,
    ToolValidationResult,
} from "../../tool-core/src/index";
import { contract } from "../../contracts/src/index";
import {
    ExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../execution-control/src/index";
import { createTransitionalToolInputBinding } from "../../tool-core/src/index";
import { processStartInputBinding } from "./generated/process-start/binding";
export { processStartInputBinding };
import { processStopInputBinding } from "./generated/process-stop/binding";
export { processStopInputBinding };
import { invalidInput } from "./internal/invalid-input";
import {
    buildSeatbeltPolicy,
    cleanupPrivateTmpDir,
    createPrivateTmpDir,
    filterSandboxEnvironment,
    isSeatbeltSupported,
    resolveGitProtectionPaths,
    type DerivedSandboxAccess,
} from "../../sandbox/src/index";
import {
    SANDBOX_ACCESS_CONTRACT,
} from "./bash";
import type { ProcessManager } from "../../process-runtime/src/index";
import type { ProcessSessionStore } from "../../runtime/src/index";

/** `ProcessStartTool` 在 Profile 中使用的稳定标识。 */
export const PROCESS_START_TOOL_ID = "process_start";

/** `ProcessReadTool` 在 Profile 中使用的稳定标识。 */
export const PROCESS_READ_TOOL_ID = "process_read";

/** `ProcessStopTool` 在 Profile 中使用的稳定标识。 */
export const PROCESS_STOP_TOOL_ID = "process_stop";

/** process_read 单次等待上限（30 秒）。 */
export const PROCESS_READ_MAX_WAIT_MS = 30_000;

/** process_read 默认抓取字符数。 */
export const PROCESS_READ_DEFAULT_MAX_CHARS = 16_000;

/** process_read 单次抓取最大字符数上限。 */
export const PROCESS_READ_MAX_CHARS_LIMIT = 50_000;

// ======================== process_start ========================

export const PROCESS_START_INPUT_CONTRACT = contract.object({
    command: contract.string(),
    sandboxAccess: contract.optional(SANDBOX_ACCESS_CONTRACT),
});

/**
 * `process_start` 的结构化输入。
 *
 * @remarks
 * `sandboxAccess` 声明本次长进程需要额外申请的沙箱文件或网络能力。
 */
export interface ProcessStartInput {
    /** 要启动的 shell 命令。 */
    readonly command: string;
    /**
     * 可选的沙箱能力申请。
     */
    readonly sandboxAccess?: {
        /** 额外申请的文件访问列表。 */
        readonly files?: readonly {
            /** 申请路径。 */
            readonly path: string;
            /** 访问类型。 */
            readonly access: "read" | "write";
            /** 申请范围。 */
            readonly kind: "file" | "directory_tree";
            /** 申请用途说明。 */
            readonly purpose: string;
        }[];
        /** 可选的网络访问申请。 */
        readonly network?: {
            /** 允许访问的网络目标列表。 */
            readonly targets: readonly string[];
            /** 申请用途说明。 */
            readonly purpose: string;
        };
    };
}

/**
 * process_start Tool 输出结构。
 */
export interface ProcessStartOutput {
    readonly processId: string;
    readonly command: string;
    readonly status: "starting" | "running";
}

/**
 * 启动受管后台长进程的 Tool。
 *
 * @remarks
 * 声明为非只读，重放策略为 `manual`（崩溃恢复后由人工审阅，不自动重放）。
 * 验证当前 Goal 身份与并发额度，返回 processId 与初始状态。
 *
 * @example
 * ```ts
 * const tool = new ProcessStartTool("/workspace", manager);
 * const res = await tool.execute({
 *   actionId: "act-1",
 *   context: { goalId: "goal-1", runId: "run-1" },
 *   input: { command: "python -m http.server 8000" },
 * });
 * ```
 */
export class ProcessStartTool implements BoundTool<ProcessStartInput> {
    readonly definition: BoundToolDefinition<ProcessStartInput> = {
        id: PROCESS_START_TOOL_ID,
        description: "Start a background managed process within workspaceRoot without waiting for its completion.",
        inputBinding: processStartInputBinding,
        inputContract: PROCESS_START_INPUT_CONTRACT,
        isReadOnly: false,
    };

    readonly replayPolicy = "manual" as const;

    private readonly workspaceRoot: string;
    private readonly manager: ProcessManager;
    private readonly enableSeatbelt: boolean;

    constructor(
        workspaceRoot: string,
        manager: ProcessManager,
        options?: { readonly enableSeatbelt?: boolean },
    ) {
        if (workspaceRoot.trim() === "") throw new Error("workspaceRoot must be non-empty");
        this.workspaceRoot = resolve(workspaceRoot);
        this.manager = manager;
        this.enableSeatbelt = options?.enableSeatbelt ?? true;
    }

    resolveSandboxAccess(input: ProcessStartInput): DerivedSandboxAccess | undefined {
        if (input.sandboxAccess === undefined) return undefined;
        return {
            ...(input.sandboxAccess.files !== undefined ? { files: input.sandboxAccess.files } : {}),
            ...(input.sandboxAccess.network !== undefined ? { network: input.sandboxAccess.network } : {}),
        };
    }

    validate(input: ProcessStartInput): ToolValidationResult {
        if (input.command.trim() === "") {
            return invalidInput("command cannot be empty", ["command"]);
        }
        return { ok: true };
    }

    async execute(
        request: ToolExecutionRequest<ProcessStartInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);

        const goalId = request.context?.goalId;
        if (goalId === undefined || goalId.trim() === "") {
            return {
                kind: "failure",
                code: "CONTEXT_GOAL_REQUIRED",
                message: "process_start requires a trusted context.goalId to isolate process ownership.",
                retryable: false,
            };
        }

        let resolvedRoot = this.workspaceRoot;
        try {
            resolvedRoot = await realpath(this.workspaceRoot);
        } catch {}

        const hasFiles = request.input.sandboxAccess?.files !== undefined && request.input.sandboxAccess.files.length > 0;
        const hasNetwork = request.input.sandboxAccess?.network !== undefined && request.input.sandboxAccess.network.targets.length > 0;
        const requiresExtraAccess = hasFiles || hasNetwork;

        const isPlanValid = request.plan !== undefined
            && (request.plan.actionId === undefined || request.plan.actionId === request.actionId)
            && (request.plan.workspaceRoot === this.workspaceRoot || request.plan.workspaceRoot === resolvedRoot);

        if (requiresExtraAccess && !isPlanValid) {
            return {
                kind: "failure",
                code: "SANDBOX_APPROVAL_REQUIRED",
                message: "Process start requested extra sandbox file or network access, which requires approval.",
                retryable: false,
            };
        }

        let sandboxRunOptions: { policy: string; env: NodeJS.ProcessEnv } | undefined;
        let privateTmpDir: string | undefined;

        if (process.platform === "darwin" && this.enableSeatbelt) {
            if (!isSeatbeltSupported()) {
                return {
                    kind: "failure",
                    code: "SANDBOX_UNAVAILABLE",
                    message: "macOS Seatbelt sandbox is unavailable.",
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

        try {
            const started = await this.manager.startProcess({
                goalId,
                command: request.input.command,
                cwd: resolvedRoot,
                actionId: request.actionId,
                ...(sandboxRunOptions !== undefined ? { sandbox: sandboxRunOptions } : {}),
            });

            const output: ProcessStartOutput = {
                processId: started.processId,
                command: request.input.command,
                status: started.status,
            };

            return {
                kind: "success",
                output: output as any,
                summary: `Started background process ${started.processId} (${started.status})`,
            };
        } catch (error) {
            if (privateTmpDir !== undefined) {
                await cleanupPrivateTmpDir(privateTmpDir);
            }
            return {
                kind: "failure",
                code: "PROCESS_START_FAILED",
                message: `Failed to start process: ${error instanceof Error ? error.message : String(error)}`,
                retryable: false,
            };
        }
    }
}

// ======================== process_read ========================

export const PROCESS_READ_INPUT_CONTRACT = contract.object({
    processId: contract.string(),
    cursor: contract.optional(contract.integer({ minimum: 0 })),
    channel: contract.optional(contract.enum(["stdout", "stderr", "both"] as const)),
    waitMs: contract.optional(contract.integer({ minimum: 0, maximum: PROCESS_READ_MAX_WAIT_MS })),
    maxChars: contract.optional(contract.integer({ minimum: 1, maximum: PROCESS_READ_MAX_CHARS_LIMIT })),
});

/**
 * `process_read` 的结构化输入。
 *
 * @remarks
 * `cursor`、`channel` 与 `waitMs` 控制增量读取位置、通道和最长等待时间；`maxChars` 限制单通道返回字符数。
 */
export interface ProcessReadInput {
    /** 目标受管进程 ID。 */
    readonly processId: string;
    /**
     * 输出游标。
     * @asType integer
     * @minimum 0
     */
    readonly cursor?: number;
    /** 读取的输出通道。 */
    readonly channel?: "stdout" | "stderr" | "both";
    /**
     * 最长等待毫秒数。
     * @asType integer
     * @minimum 0
     * @maximum 30000
     */
    readonly waitMs?: number;
    /**
     * 单通道最多返回的字符数。
     * @asType integer
     * @minimum 1
     * @maximum 50000
     */
    readonly maxChars?: number;
}

/** `process_read` 的过渡期输入绑定；生成能力支持整数注解后替换为生成绑定。 */
export const processReadInputBinding = createTransitionalToolInputBinding<ProcessReadInput>({
    contractId: "tool.process_read.input",
    version: 1,
    contract: PROCESS_READ_INPUT_CONTRACT,
});

/**
 * process_read Tool 输出结构。
 */
export interface ProcessReadOutput {
    readonly processId: string;
    readonly status: string;
    readonly exitCode?: number | null;
    readonly signal?: string | null;
    readonly stdout: {
        readonly text: string;
        readonly nextCursor: number;
        readonly headCursor: number;
        readonly gap: boolean;
    };
    readonly stderr: {
        readonly text: string;
        readonly nextCursor: number;
        readonly headCursor: number;
        readonly gap: boolean;
    };
    readonly truncated: boolean;
}

/**
 * 读取受管长进程输出日志的 Tool。
 *
 * @remarks
 * 声明为只读 `safe`（不改变受管状态或共享消费位置，调用者自带独立游标）。
 * 严格校验 context.goalId 与进程归属，跨 Goal 访问直接报错拒绝，防止泄露。
 *
 * @example
 * ```ts
 * const tool = new ProcessReadTool(manager, store);
 * const res = await tool.execute({
 *   actionId: "act-read",
 *   context: { goalId: "goal-1", runId: "run-1" },
 *   input: { processId: "proc-1", waitMs: 1000 },
 * });
 * ```
 */
export class ProcessReadTool implements BoundTool<ProcessReadInput> {
    readonly definition: BoundToolDefinition<ProcessReadInput> = {
        id: PROCESS_READ_TOOL_ID,
        description: "Read stdout/stderr output from a managed background process with cursor pagination.",
        inputBinding: processReadInputBinding,
        inputContract: PROCESS_READ_INPUT_CONTRACT,
        isReadOnly: true,
    };

    readonly replayPolicy = "safe" as const;

    private readonly manager: ProcessManager;
    private readonly store: ProcessSessionStore;

    constructor(manager: ProcessManager, store: ProcessSessionStore) {
        this.manager = manager;
        this.store = store;
    }

    validate(input: ProcessReadInput): ToolValidationResult {
        if (input.processId.trim() === "") {
            return invalidInput("processId cannot be empty", ["processId"]);
        }
        return { ok: true };
    }

    async execute(
        request: ToolExecutionRequest<ProcessReadInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);

        const goalId = request.context?.goalId;
        if (goalId === undefined || goalId.trim() === "") {
            return {
                kind: "failure",
                code: "CONTEXT_GOAL_REQUIRED",
                message: "process_read requires a trusted context.goalId.",
                retryable: false,
            };
        }

        const processId = request.input.processId.trim();
        const session = await this.store.getSession(goalId, processId);

        if (session === undefined) {
            return {
                kind: "failure",
                code: "PROCESS_NOT_FOUND",
                message: `Process ${processId} does not exist in Goal ${goalId}.`,
                retryable: false,
            };
        }

        const waitMs = request.input.waitMs ?? 0;
        const maxChars = request.input.maxChars ?? PROCESS_READ_DEFAULT_MAX_CHARS;
        const cursor = request.input.cursor;
        const channel = request.input.channel ?? "both";

        // 若配置了 waitMs 且进程处于 running 状态，等待输出或超时
        if (waitMs > 0 && session.status === "running") {
            const timeoutSignal = AbortSignal.timeout(waitMs);
            const combinedSignal = control?.signal !== undefined
                ? AbortSignal.any([control.signal, timeoutSignal])
                : timeoutSignal;
            await this.manager.waitForOutput(goalId, processId, waitMs);
        }
        throwIfAborted(control);

        // 获取最新 session 状态（可能在 wait 期间退出）
        const latestSession = (await this.store.getSession(goalId, processId)) ?? session;

        // 按字节大小读取 stdout 与 stderr
        const maxBytes = maxChars * 4; // 留出 UTF-8 多字节裕量

        let stdoutChunk = { text: "", nextCursor: cursor ?? 0, headCursor: 0, gap: false };
        let stderrChunk = { text: "", nextCursor: cursor ?? 0, headCursor: 0, gap: false };

        if (channel === "stdout" || channel === "both") {
            stdoutChunk = await this.store.readOutput(goalId, processId, "stdout", cursor, maxBytes);
        }
        if (channel === "stderr" || channel === "both") {
            stderrChunk = await this.store.readOutput(goalId, processId, "stderr", cursor, maxBytes);
        }

        let truncated = false;
        let stdoutText = stdoutChunk.text;
        let stderrText = stderrChunk.text;

        if (stdoutText.length > maxChars) {
            stdoutText = stdoutText.slice(0, maxChars);
            truncated = true;
        }
        if (stderrText.length > maxChars) {
            stderrText = stderrText.slice(0, maxChars);
            truncated = true;
        }

        const output: ProcessReadOutput = {
            processId,
            status: latestSession.status,
            ...(latestSession.exitCode !== undefined ? { exitCode: latestSession.exitCode } : {}),
            ...(latestSession.signal !== undefined ? { signal: latestSession.signal } : {}),
            stdout: {
                ...stdoutChunk,
                text: stdoutText,
            },
            stderr: {
                ...stderrChunk,
                text: stderrText,
            },
            truncated,
        };

        return {
            kind: "success",
            output: output as any,
            summary: `Read output from ${processId} (${latestSession.status}): stdout ${stdoutText.length} chars, stderr ${stderrText.length} chars`,
        };
    }
}

// ======================== process_stop ========================

export const PROCESS_STOP_INPUT_CONTRACT = contract.object({
    processId: contract.string(),
});

/**
 * `process_stop` 的结构化输入。
 */
export interface ProcessStopInput {
    /** 要停止的受管进程 ID。 */
    readonly processId: string;
}

/**
 * 停止受管长进程的 Tool。
 *
 * @remarks
 * 声明为非只读，重放策略为 `manual`。
 * 仅允许停止所属 Goal 的受管进程；优雅宽限 2 秒后再升级 SIGKILL。
 *
 * @example
 * ```ts
 * const tool = new ProcessStopTool(manager, store);
 * const res = await tool.execute({
 *   actionId: "act-stop",
 *   context: { goalId: "goal-1", runId: "run-1" },
 *   input: { processId: "proc-1" },
 * });
 * ```
 */
export class ProcessStopTool implements BoundTool<ProcessStopInput> {
    readonly definition: BoundToolDefinition<ProcessStopInput> = {
        id: PROCESS_STOP_TOOL_ID,
        description: "Stop a managed background process belonging to current Goal.",
        inputBinding: processStopInputBinding,
        inputContract: PROCESS_STOP_INPUT_CONTRACT,
        isReadOnly: false,
    };

    readonly replayPolicy = "manual" as const;

    private readonly manager: ProcessManager;
    private readonly store: ProcessSessionStore;

    constructor(manager: ProcessManager, store: ProcessSessionStore) {
        this.manager = manager;
        this.store = store;
    }

    validate(input: ProcessStopInput): ToolValidationResult {
        if (input.processId.trim() === "") {
            return invalidInput("processId cannot be empty", ["processId"]);
        }
        return { ok: true };
    }

    async execute(
        request: ToolExecutionRequest<ProcessStopInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);

        const goalId = request.context?.goalId;
        if (goalId === undefined || goalId.trim() === "") {
            return {
                kind: "failure",
                code: "CONTEXT_GOAL_REQUIRED",
                message: "process_stop requires a trusted context.goalId.",
                retryable: false,
            };
        }

        const processId = request.input.processId.trim();
        const existing = await this.store.getSession(goalId, processId);

        if (existing === undefined) {
            return {
                kind: "failure",
                code: "PROCESS_NOT_FOUND",
                message: `Process ${processId} does not exist in Goal ${goalId}.`,
                retryable: false,
            };
        }

        try {
            const stopped = await this.manager.stopProcess(goalId, processId);
            return {
                kind: "success",
                output: stopped as any,
                summary: `Stopped process ${processId} (final status: ${stopped.status})`,
            };
        } catch (error) {
            return {
                kind: "failure",
                code: "PROCESS_STOP_FAILED",
                message: `Failed to stop process: ${error instanceof Error ? error.message : String(error)}`,
                retryable: false,
            };
        }
    }
}
