import type {
    Goal,
    JsonObject,
    JsonValue,
    Observation,
    ToolCallAction,
} from "./domain";

/**
 * Tool 对外展示和输入校验所需的静态描述。
 *
 * @example
 * ```ts
 * const definition: ToolDefinition = {
 *   id: "read_file",
 *   description: "读取工作区内的文本文件",
 *   inputSchema: { type: "object" },
 * };
 * ```
 */
export interface ToolDefinition {
    /** 稳定的 Tool 标识，必须与 Profile 中的 `toolIds` 对应。 */
    readonly id: string;
    /** 面向 Agent 的用途说明。 */
    readonly description: string;
    /** 面向 Agent 的 JSON 输入协议描述。 */
    readonly inputSchema: JsonObject;
}

/** Tool 实际返回的成功或领域失败 Observation；拒绝由 Runtime 状态机生成。 */
export type ToolObservation = Exclude<Observation, { readonly kind: "rejected" }>;

/**
 * 一次 Tool 调用的执行请求。
 *
 * @example
 * ```ts
 * const request: ToolExecutionRequest = {
 *   actionId: "action-1",
 *   input: { path: "README.md" },
 * };
 * ```
 */
export interface ToolExecutionRequest {
    /** 当前 Action 生命周期的稳定标识。 */
    readonly actionId: string;
    /** 已通过 Tool `validate` 的结构化输入。 */
    readonly input: JsonValue;
}

/** Tool 输入校验结果。 */
export type ToolValidationResult =
    | { readonly ok: true }
    | {
        readonly ok: false;
        readonly error: {
            readonly code: "INVALID_TOOL_INPUT";
            readonly message: string;
        };
    };

/**
 * Runtime 可调用的 Tool 扩展点。
 *
 * @remarks
 * Tool 只负责描述输入、校验输入并执行一次调用，不读取或修改 GoalStore。
 * `replayPolicy` 是恢复时的声明：`safe` 允许 Runtime 在意图已持久化但结果未知
 * 时使用相同 `actionId` 重放，`manual` 必须等待用户决定。Tool 正常返回的
 * 文件不存在等领域问题应使用 `failure` Observation；协议或基础设施异常可以
 * 直接抛出，由 Runner 归类为执行错误。
 *
 * @example
 * ```ts
 * const tool: Tool = {
 *   definition: {
 *     id: "echo",
 *     description: "返回输入文本",
 *     inputSchema: { type: "object" },
 *   },
 *   replayPolicy: "safe",
 *   validate: () => ({ ok: true }),
 *   async execute({ input }) {
 *     return { kind: "success", output: input, summary: "已返回输入" };
 *   },
 * };
 * ```
 */
export interface Tool {
    /** Tool 的稳定描述与 JSON 输入协议。 */
    readonly definition: ToolDefinition;
    /** 进程中断后对未完成 Action 的重放策略。 */
    readonly replayPolicy: "safe" | "manual";
    /**
     * 校验模型提交的结构化输入，不执行外部作用。
     *
     * @param input - AgentDecision 中的 Action 输入。
     * @returns 成功或带稳定 `INVALID_TOOL_INPUT` 错误的失败结果。
     */
    validate(input: JsonValue): ToolValidationResult;
    /**
     * 执行一次已经通过输入校验的 Tool 调用。
     *
     * @param request - Action ID 与结构化输入。
     * @returns 由执行环境产生的成功或领域失败 Observation。
     * @throws Tool 协议、配置或基础设施异常；调用方不得将其伪装成 Observation。
     */
    execute(request: ToolExecutionRequest): Promise<ToolObservation>;
}

/**
 * Tool 授权策略评估所需的只读上下文。
 *
 * @example
 * ```ts
 * const context: ToolPolicyContext = { goal, action, tool: tool.definition };
 * ```
 */
export interface ToolPolicyContext {
    /** 当前被冻结 Profile 与执行状态的 Goal。 */
    readonly goal: Goal;
    /** Agent 当前请求的 Action。 */
    readonly action: ToolCallAction;
    /** Registry 解析出的 Tool 描述。 */
    readonly tool: ToolDefinition;
}

/**
 * 在 Tool 执行前决定自动放行还是等待用户批准的策略边界。
 *
 * @remarks
 * Policy 不执行 Tool、不推进 Run，也不持久化授权；瞬时授权由后续 Runner 与
 * Coordinator 协作层消费。
 *
 * @example
 * ```ts
 * const policy: ToolPolicy = {
 *   evaluate: ({ tool }) => tool.id === "read_file"
 *     ? "allow"
 *     : "require_approval",
 * };
 * ```
 */
export interface ToolPolicy {
    /**
     * @param context - Goal、Action 与 Tool 描述组成的只读授权上下文。
     * @returns `allow` 或 `require_approval`；不得执行 Tool 或修改 Goal。
     */
    evaluate(context: ToolPolicyContext): "allow" | "require_approval";
}

/**
 * Tool 的查找边界。
 *
 * @remarks
 * Registry 只按稳定 `toolId` 查找实现，不负责 Profile 授权、输入校验或执行。
 * Runner 应在调用 `execute` 前分别完成这些步骤。
 *
 * @example
 * ```ts
 * const registry: ToolRegistry = new InMemoryToolRegistry([tool]);
 * const resolved = registry.get("read_file");
 * ```
 */
export interface ToolRegistry {
    /**
     * @param toolId - Agent 请求的 Tool 标识。
     * @returns 已注册 Tool；不存在时返回 `undefined`。
     */
    get(toolId: string): Tool | undefined;
}

/**
 * 单进程内的不可变 Tool 注册表。
 *
 * @remarks
 * 构造时复制 Tool 引用并拒绝空 ID 与重复 ID；Registry 不复制或包装 Tool 实现，
 * 因而 Tool 本身的生命周期由调用方管理。
 *
 * @example
 * ```ts
 * const registry = new InMemoryToolRegistry([readFileTool]);
 * ```
 */
export class InMemoryToolRegistry implements ToolRegistry {
    private readonly tools: ReadonlyMap<string, Tool>;

    /**
     * @param tools - 要注册的 Tool 集合。
     * @throws Tool ID 为空或重复时抛出 Error。
     */
    constructor(tools: readonly Tool[] = []) {
        const registered = new Map<string, Tool>();

        for (const tool of tools) {
            const toolId = tool.definition.id;

            if (toolId.trim() === "") {
                throw new Error("Tool definition id must be non-empty");
            }

            if (registered.has(toolId)) {
                throw new Error(`Duplicate Tool definition id: ${toolId}`);
            }

            registered.set(toolId, tool);
        }

        this.tools = registered;
    }

    /**
     * @param toolId - Agent 请求的 Tool 标识。
     * @returns 构造时注册的 Tool；不存在时返回 `undefined`。
     */
    get(toolId: string): Tool | undefined {
        return this.tools.get(toolId);
    }
}
