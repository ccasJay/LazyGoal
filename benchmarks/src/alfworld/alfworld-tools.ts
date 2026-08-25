import type {
    JsonObject,
    JsonValue,
    Tool,
    ToolDefinition,
    ToolExecutionRequest,
    ToolObservation,
    ToolValidationResult,
} from "../../../packages/runtime/src/index.js";
import {
    ExecutionAbortedError,
    InMemoryToolRegistry,
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../../packages/runtime/src/index.js";
import { GrepTool, ReadFileTool } from "../../../packages/tools/src/index.js";
import {
    SidecarAbortedError,
    SidecarError,
    type SidecarClient,
    type SidecarResetResult,
    type SidecarStepResult,
    type SidecarTask,
} from "./sidecar-client.js";

export const ALFWORLD_RESET_TOOL_ID = "alfworld_reset";
export const ALFWORLD_STEP_TOOL_ID = "alfworld_step";

/**
 * 专用 ALFWorld Tool 使用的 sidecar 会话边界。
 *
 * @remarks
 * 会话对象集中维护 idle/active/done/closed 状态；Tool 不复制文件读取、搜索、
 * 路径沙箱或 JSONL 进程协议。
 *
 * @example
 * ```ts
 * const session: AlfworldSession = new SidecarAlfworldSession(client);
 * ```
 */
export interface AlfworldSession {
    readonly phase: "idle" | "active" | "done" | "closed";
    /**
     * @param task - Manifest 已校验的固定任务。
     * @param signal - 可选中止信号。
     * @returns 初始观察和可用命令。
     * @throws 会话状态冲突或 sidecar 基础设施错误。
     */
    reset(task: SidecarTask, signal?: AbortSignal): Promise<SidecarResetResult>;
    /**
     * @param command - 恰好一条非空环境命令。
     * @param signal - 可选中止信号。
     * @returns 环境推进结果；领域拒绝由 `accepted=false` 表示。
     * @throws 会话状态冲突或 sidecar 基础设施错误。
     */
    step(command: string, signal?: AbortSignal): Promise<SidecarStepResult>;
    /**
     * @returns 会话关闭完成的 Promise；重复调用必须幂等。
     * @throws sidecar 关闭基础设施错误。
     */
    close(): Promise<void>;
}

/**
 * ALFWorld 会话状态冲突错误。
 *
 * @example
 * ```ts
 * const error = new AlfworldSessionStateError("SESSION_IDLE", "请先 reset");
 * ```
 */
export class AlfworldSessionStateError extends Error {
    readonly name = "AlfworldSessionStateError";

    constructor(
        readonly code: "SESSION_IDLE" | "SESSION_ACTIVE" | "SESSION_DONE" | "SESSION_CLOSED",
        message: string,
    ) {
        super(message);
    }
}

/**
 * 由 SidecarClient 驱动的单任务 ALFWorld 会话状态机。
 *
 * @example
 * ```ts
 * const session = new SidecarAlfworldSession(client);
 * await session.reset(task);
 * await session.step("look");
 * await session.close();
 * ```
 */
export class SidecarAlfworldSession implements AlfworldSession {
    private currentPhase: AlfworldSession["phase"] = "idle";

    /**
     * @param client - 任务级 sidecar 客户端。
     */
    constructor(private readonly client: Pick<SidecarClient, "reset" | "step" | "close">) {}

    get phase(): AlfworldSession["phase"] {
        return this.currentPhase;
    }

    /**
     * @param task - Manifest 已校验的固定任务。
     * @param signal - 可选中止信号。
     * @returns 初始观察和可用命令。
     * @throws 会话状态冲突或 sidecar 基础设施错误。
     */
    async reset(task: SidecarTask, signal?: AbortSignal): Promise<SidecarResetResult> {
        if (this.currentPhase === "closed") throw new AlfworldSessionStateError("SESSION_CLOSED", "会话已关闭");
        if (this.currentPhase === "active") throw new AlfworldSessionStateError("SESSION_ACTIVE", "任务会话已初始化");
        if (this.currentPhase === "done") throw new AlfworldSessionStateError("SESSION_DONE", "任务已经结束");
        const result = await this.client.reset(task, signal);
        this.currentPhase = "active";
        return result;
    }

    /**
     * @param command - 恰好一条非空环境命令。
     * @param signal - 可选中止信号。
     * @returns 环境推进结果。
     * @throws 会话状态冲突或 sidecar 基础设施错误。
     */
    async step(command: string, signal?: AbortSignal): Promise<SidecarStepResult> {
        if (this.currentPhase === "idle") throw new AlfworldSessionStateError("SESSION_IDLE", "必须先调用 alfworld_reset");
        if (this.currentPhase === "closed") throw new AlfworldSessionStateError("SESSION_CLOSED", "会话已关闭");
        if (this.currentPhase === "done") throw new AlfworldSessionStateError("SESSION_DONE", "任务已经结束");
        const result = await this.client.step(command, signal);
        if (result.done) this.currentPhase = "done";
        return result;
    }

    /**
     * @returns 关闭完成的 Promise；重复调用幂等。
     * @throws sidecar 关闭基础设施错误。
     */
    async close(): Promise<void> {
        if (this.currentPhase === "closed") return;
        this.currentPhase = "closed";
        await this.client.close();
    }
}

/**
 * `alfworld_reset`：绑定固定任务并返回初始环境观察。
 *
 * @remarks
 * 只接受空对象输入，声明 `manual` replay；重复初始化是领域失败，sidecar
 * 基础设施错误直接抛出，不生成虚假 Observation。
 *
 * @example
 * ```ts
 * const tool = new AlfworldResetTool(session, task);
 * await tool.execute({ actionId: "reset-1", input: {} });
 * ```
 */
export class AlfworldResetTool implements Tool {
    readonly definition: ToolDefinition = {
        id: ALFWORLD_RESET_TOOL_ID,
        description: "初始化固定 ALFWorld TextWorld 任务会话",
        inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    };
    readonly replayPolicy = "manual" as const;

    constructor(
        private readonly session: AlfworldSession,
        private readonly task: SidecarTask,
    ) {}

    /**
     * @param input - Agent 提交的空对象。
     * @returns 输入合法性结果。
     */
    validate(input: JsonValue): ToolValidationResult {
        return isEmptyObject(input)
            ? { ok: true }
            : invalidInput("alfworld_reset 输入必须是空对象");
    }

    /**
     * @param request - Action ID 与空对象输入。
     * @param control - 当前 Run 的中止控制。
     * @returns 初始环境 Observation。
     * @throws 中止、sidecar 协议或基础设施错误。
     */
    async execute(
        request: ToolExecutionRequest,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);
        const validation = this.validate(request.input);
        if (!validation.ok) throw new Error(`${validation.error.code}: ${validation.error.message}`);
        try {
            const result = await this.session.reset(this.task, control?.signal);
            throwIfAborted(control);
            return {
                kind: "success",
                output: resetOutput(result),
                summary: `ALFWorld 任务 ${result.taskId} 已初始化`,
            };
        } catch (error: unknown) {
            if (error instanceof AlfworldSessionStateError) {
                return {
                    kind: "failure",
                    code: error.code,
                    message: error.message,
                    retryable: false,
                };
            }
            returnOrThrow(error);
        }
    }
}

/**
 * `alfworld_step`：把一条文本命令推进一次环境。
 *
 * @remarks
 * 未初始化、已终态或已关闭会话返回领域失败；环境拒绝命令也保留观察并返回
 * 可识别 failure。只有 sidecar 协议、进程、超时或中止错误离开 Observation。
 *
 * @example
 * ```ts
 * const tool = new AlfworldStepTool(session);
 * await tool.execute({ actionId: "step-1", input: { command: "look" } });
 * ```
 */
export class AlfworldStepTool implements Tool {
    readonly definition: ToolDefinition = {
        id: ALFWORLD_STEP_TOOL_ID,
        description: "向活动 ALFWorld TextWorld 会话提交一条命令",
        inputSchema: {
            type: "object",
            properties: { command: { type: "string" } },
            required: ["command"],
            additionalProperties: false,
        },
    };
    readonly replayPolicy = "manual" as const;

    constructor(private readonly session: AlfworldSession) {}

    /**
     * @param input - Agent 提交的 `{ command: string }`。
     * @returns 输入合法性结果。
     */
    validate(input: JsonValue): ToolValidationResult {
        if (!isRecord(input) || Object.keys(input).length !== 1 || typeof input.command !== "string") {
            return invalidInput("alfworld_step 输入必须是 { command: string }");
        }
        if (input.command.trim() === "") return invalidInput("alfworld_step.command 不能为空");
        return { ok: true };
    }

    /**
     * @param request - Action ID 与一条环境命令。
     * @param control - 当前 Run 的中止控制。
     * @returns 环境 Observation 或可继续决策的领域 failure。
     * @throws 中止、sidecar 协议或基础设施错误。
     */
    async execute(
        request: ToolExecutionRequest,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);
        const validation = this.validate(request.input);
        if (!validation.ok) throw new Error(`${validation.error.code}: ${validation.error.message}`);
        if (!isRecord(request.input) || typeof request.input.command !== "string") {
            throw new Error("INVALID_TOOL_INPUT: alfworld_step.command must be a string");
        }
        try {
            const result = await this.session.step(request.input.command, control?.signal);
            throwIfAborted(control);
            return stepObservation(result);
        } catch (error: unknown) {
            if (error instanceof AlfworldSessionStateError) {
                return {
                    kind: "failure",
                    code: error.code,
                    message: error.message,
                    retryable: false,
                };
            }
            returnOrThrow(error);
        }
    }
}

/**
 * ALFWorld 评测一组共享会话的 Tool 和 Registry。
 *
 * @example
 * ```ts
 * const toolSet = createAlfworldToolSet(workspaceRoot, task, client);
 * const tool = toolSet.registry.get("grep");
 * ```
 */
export interface AlfworldToolSet {
    readonly session: SidecarAlfworldSession;
    readonly resetTool: AlfworldResetTool;
    readonly stepTool: AlfworldStepTool;
    readonly readFileTool: ReadFileTool;
    readonly grepTool: GrepTool;
    readonly registry: InMemoryToolRegistry;
}

/**
 * 装配 ALFWorld Profile 所需的基础只读 Tool 与专用环境 Tool。
 *
 * @param workspaceRoot - `read_file` 和 `grep` 的共同 workspace 边界。
 * @param task - Manifest 已校验的固定任务。
 * @param client - 任务级 sidecar 客户端。
 * @returns 共享基础 Tool 实例、专用 Tool 和 Registry。
 * @example
 * ```ts
 * const set = createAlfworldToolSet("/workspace", task, client);
 * ```
 */
export function createAlfworldToolSet(
    workspaceRoot: string,
    task: SidecarTask,
    client: Pick<SidecarClient, "reset" | "step" | "close">,
): AlfworldToolSet {
    const session = new SidecarAlfworldSession(client);
    const resetTool = new AlfworldResetTool(session, task);
    const stepTool = new AlfworldStepTool(session);
    const readFileTool = new ReadFileTool(workspaceRoot);
    const grepTool = new GrepTool(workspaceRoot);
    const registry = new InMemoryToolRegistry([readFileTool, grepTool, resetTool, stepTool]);
    return { session, resetTool, stepTool, readFileTool, grepTool, registry };
}

function isRecord(value: JsonValue): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEmptyObject(value: JsonValue): value is JsonObject {
    return isRecord(value) && Object.keys(value).length === 0;
}

function invalidInput(message: string): ToolValidationResult {
    return { ok: false, error: { code: "INVALID_TOOL_INPUT", message } };
}

function resetOutput(result: SidecarResetResult): JsonObject {
    return {
        taskId: result.taskId,
        gameFile: result.gameFile,
        observation: result.observation,
        admissibleCommands: [...result.admissibleCommands],
    };
}

function stepObservation(result: SidecarStepResult): ToolObservation {
    const output: JsonObject = {
        observation: result.observation,
        done: result.done,
        won: result.won,
        goalConditionSuccessRate: result.goalConditionSuccessRate,
        admissibleCommands: [...result.admissibleCommands],
        accepted: result.accepted,
    };
    if (!result.accepted) {
        return {
            kind: "failure",
            code: result.error?.code ?? "ALFWORLD_DOMAIN_COMMAND_REJECTED",
            message: JSON.stringify(output),
            retryable: !result.done,
        };
    }
    return {
        kind: "success",
        output,
        summary: result.done
            ? `ALFWorld 任务结束（won=${String(result.won)}）`
            : "ALFWorld 环境已推进一步",
    };
}

function returnOrThrow(error: unknown): never {
    if (error instanceof AlfworldSessionStateError) {
        throw error;
    }
    if (error instanceof SidecarAbortedError || (error instanceof SidecarError && error.code === "ABORTED")) {
        throw new ExecutionAbortedError();
    }
    if (isExecutionAbortedError(error)) throw error;
    throw error;
}
