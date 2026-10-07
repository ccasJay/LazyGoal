import type {
    Goal,
    JsonValue,
    Observation,
    ToolCallAction,
} from "./domain";
import {
    compileJsonSchema,
    safeParse,
    type Contract,
    type InferContract,
} from "../../contracts/src/index";
import {
    throwIfAborted,
    type ExecutionControl,
} from "../../execution-control/src/index";
import type { DerivedSandboxAccess, SandboxExecutionPlan } from "../../sandbox/src/index";
import type { RuntimeFeedbackIssue } from "./runtime-feedback";

/** Tool 输入 Contract 的 JSON AST 类型边界。 */
export type ToolInputContract = Contract<JsonValue>;

/**
 * Tool 执行期接收到的可信上下文身份。
 *
 * @remarks
 * 包含当前推进的 Goal 与 Run 稳定标识，由 Runner 在受信任的调度边界构造并传递。
 * 进程管理与资源工具使用此上下文校验操作所属，严禁由模型输入指定。
 *
 * @example
 * ```ts
 * const context: ToolExecutionContext = {
 *   goalId: "goal-1",
 *   runId: "run-1",
 * };
 * ```
 */
export interface ToolExecutionContext {
    /** 当前执行所属的 Goal 唯一标识。 */
    readonly goalId: string;
    /** 当前执行所属的 Run 唯一标识。 */
    readonly runId: string;
}

/**
 * Tool 对外展示和输入校验所需的静态描述。
 *
 * @example
 * ```ts
 * const definition: ToolDefinition<typeof InputContract> = {
 *   id: "read_file",
 *   description: "读取工作区内的文本文件",
 *   inputContract: InputContract,
 *   isReadOnly: true,
 * };
 * ```
 */
export interface ToolDefinition<C extends ToolInputContract = ToolInputContract> {
    /** 稳定的 Tool 标识，必须与 Profile 中的 `toolIds` 对应。 */
    readonly id: string;
    /** 面向 Agent 的用途说明。 */
    readonly description: string;
    /** Tool 输入结构唯一事实源；模型 Schema 由该 AST 编译得到。 */
    readonly inputContract: C;
    /**
     * 是否为只读工具。
     *
     * @remarks
     * `true` 表示实现者声明该工具不会修改工作区、配置或外部可变状态。此分类不授予
     * Profile 权限，也不会按任务审批状态门控工具调用；Profile、Tool Policy 与 Action
     * 审批仍决定调用能否执行。
     */
    readonly isReadOnly: boolean;
}

/** Tool 实际返回的成功或领域失败 Observation；拒绝由 Runtime 状态机生成。 */
export type ToolObservation = Exclude<Observation, { readonly kind: "rejected" }>;

/** Tool 流式执行过程中可观察的输出或最终结算。 */
export type ToolStreamEvent =
    | {
        readonly kind: "output";
        readonly channel: "stdout" | "stderr";
        readonly text: string;
    }
    | {
        readonly kind: "completed";
        readonly observation: ToolObservation;
    };

/**
 * 一次 Tool 调用的执行请求。
 *
 * @example
 * ```ts
 * const request: ToolExecutionRequest = {
 *   actionId: "action-1",
 *   context: { goalId: "goal-1", runId: "run-1" },
 *   input: { path: "README.md" },
 * };
 * ```
 */
export interface ToolExecutionRequest<Input extends JsonValue = JsonValue> {
    /** 当前 Action 生命周期的稳定标识。 */
    readonly actionId: string;
    /**
     * 可信的 Tool 执行上下文身份。
     *
     * @remarks
     * 仅由 Runner/Coordinator 从当前 Goal 与 Run 实例注入，在纯单元测试独立调用 Tool 实例时可选。
     */
    readonly context?: ToolExecutionContext;
    /** 已通过 Input Contract 与 Tool 语义校验的结构化输入。 */
    readonly input: Input;
    /** Runner 在执行期提供的受限沙箱执行计划（非持久化）。 */
    readonly plan?: SandboxExecutionPlan;
}

/** Tool 输入校验结果。 */
export type ToolValidationResult =
    | { readonly ok: true }
    | {
        readonly ok: false;
        readonly error: {
            readonly code: "INVALID_TOOL_INPUT";
            /** 可定位且不包含原始输入值的诊断，供同阶段模型纠错使用。 */
            readonly issues?: readonly RuntimeFeedbackIssue[];
            /** 稳定、非敏感的错误说明；不得拼入模型提供的原始字段值。 */
            readonly message: string;
        };
    };

/**
 * Tool 明确确认本次调用遇到可安全重放的暂时性基础设施故障。
 *
 * @remarks
 * Runner 仍只会在注册声明 `replayPolicy: "safe"` 且 Action 保持获准时重试；任意
 * 异常和 `failure.retryable` Observation 都不会隐式触发重放。进程内等待期间可用
 * `retryAfterMs` 提示退避，恢复计数保存在 pending Action 中。
 *
 * @example
 * ```ts
 * throw new TransientToolExecutionFailure("network_unavailable", 500);
 * ```
 */
export class TransientToolExecutionFailure extends Error {
    readonly retryAfterMs: number | undefined;
    readonly reason: string;

    /**
     * @param reason - 可记录的稳定、非敏感失败原因。
     * @param retryAfterMs - 可选的建议等待毫秒数。
     */
    constructor(reason: string, retryAfterMs?: number) {
        const boundedReason = reason.trim().length > 0 ? reason.slice(0, 120) : "transient_tool_failure";
        super(boundedReason);
        this.name = "TransientToolExecutionFailure";
        this.reason = boundedReason;
        this.retryAfterMs = retryAfterMs === undefined || !Number.isFinite(retryAfterMs)
            ? undefined
            : Math.min(30_000, Math.max(0, Math.trunc(retryAfterMs)));
    }
}

/**
 * Runtime 可调用的 Tool 扩展点。
 *
 * @remarks
 * Tool 只负责描述输入、校验输入并执行一次调用，不读取或修改 GoalStore。
 * `replayPolicy` 是恢复时的声明：`safe` 允许 Runtime 在意图已持久化但结果未知
 * 时使用相同 `actionId` 重放，`manual` 必须等待用户决定。Tool 正常返回的
 * 文件不存在等领域问题应使用 `failure` Observation；仅当适配器确认基础设施错误
 * 可安全重试时才抛出 `TransientToolExecutionFailure`，未知异常不得标为可重试。
 *
 * @example
 * ```ts
 * const InputContract = contract.object({ message: contract.string() });
 * const tool: Tool<typeof InputContract> = {
 *   definition: {
 *     id: "echo",
 *     description: "返回输入文本",
 *     inputContract: InputContract,
 *     isReadOnly: true,
 *   },
 *   replayPolicy: "safe",
 *   validate: (input) => input.message.trim() === ""
 *     ? { ok: false, error: { code: "INVALID_TOOL_INPUT", message: "message 不能为空" } }
 *     : { ok: true },
 *   async execute({ input }) {
 *     return { kind: "success", output: input.message, summary: "已返回输入" };
 *   },
 * };
 * ```
 */
export interface Tool<C extends ToolInputContract = ToolInputContract> {
    /** Tool 的稳定描述与 JSON 输入协议。 */
    readonly definition: ToolDefinition<C>;
    /** 进程中断后对未完成 Action 的重放策略。 */
    readonly replayPolicy: "safe" | "manual";
    /**
     * 校验已通过 Input Contract 的结构化输入，不执行外部作用。
     *
     * @param input - Input Contract 返回的隔离输入。
     * @returns 成功或带稳定 `INVALID_TOOL_INPUT` 错误的失败结果。
     */
    validate(input: InferContract<C>): ToolValidationResult;
    /**
     * 可选的沙箱能力派生接口。
     *
     * @remarks
     * Runner 在输入准备完成、权限授权之前调用该方法。用于从具体输入中发现或推导
     * 需向系统申请的越界文件或网络资源（例如 Bash 显式申请、网页网络能力、Git 元数据路径）。
     * 该方法只发现资源，不执行业务写入、不持有 Goal。
     *
     * @param input - Input Contract 与语义校验通过的规范化输入。
     * @param control - 当前调用共享的中止控制。
     * @returns 派生的沙箱访问申请；若不需要额外能力则返回 `undefined`。
     *
     * @example
     * ```ts
     * const access = tool.resolveSandboxAccess?.(input);
     * ```
     */
    resolveSandboxAccess?(
        input: InferContract<C>,
        control?: ExecutionControl,
    ): Promise<DerivedSandboxAccess | undefined> | DerivedSandboxAccess | undefined;
    /**
     * 执行一次已经通过输入校验的 Tool 调用。
     *
     * @param request - Action ID 与已解析的结构化输入。
     * @param control - 当前 Run 推进调用共享的中止控制。
     * @returns 由执行环境产生的成功或领域失败 Observation。
     * @throws 确认可安全重试的暂时故障可抛出 `TransientToolExecutionFailure`；未知
     *   Tool 协议、配置或基础设施异常由 Runner 作为稳定错误处理；中止时抛出
     *   `ExecutionAbortedError`，调用方不得将其伪装成 Observation。
     */
    execute(
        request: ToolExecutionRequest<InferContract<C>>,
        control?: ExecutionControl,
    ): Promise<ToolObservation>;
    /**
     * 可选的单次执行流；实现该方法时它承担与 `execute` 相同的一次外部调用。
     *
     * @param request - Action ID 与已解析的结构化输入。
     * @param control - 当前 Run 推进调用共享的中止控制。
     * @returns 输出分片以及恰好一个 `completed` 结算事件。
     * @throws 可安全重试的暂时故障可抛出 `TransientToolExecutionFailure`；其他基础设施异常
     *   或中止错误由调用方按 replay policy 处理，不得伪装成 Observation。
     */
    readonly stream?: (
        request: ToolExecutionRequest<InferContract<C>>,
        control?: ExecutionControl,
    ) => AsyncIterable<ToolStreamEvent>;
}

/** Tool Contract 与语义校验完成后的单次可执行 Action。 */
export type PreparedToolAction =
    | {
        readonly ok: true;
        /** Contract Parser 创建的、与原始输入隔离的 canonical 输入。 */
        readonly input: JsonValue;
        /**
         * 可选的同源沙箱能力派生闭包。
         *
         * @remarks
         * Runner 在准备完成、授权之前调用，获取本次 Action 申请的额外沙箱资源。
         *
         * @param control - 中止控制信号。
         * @returns 派生的沙箱访问申请；若不需要额外能力则返回 `undefined`。
         *
         * @example
         * ```ts
         * const access = await prepared.resolveSandboxAccess?.();
         * ```
         */
        resolveSandboxAccess?(
            control?: ExecutionControl,
        ): Promise<DerivedSandboxAccess | undefined> | DerivedSandboxAccess | undefined;
        /** 使用已准备输入执行一次 Tool；不再接收原始 input。 */
        execute(
            actionId: string,
            context: ToolExecutionContext,
            control?: ExecutionControl,
            plan?: SandboxExecutionPlan,
        ): Promise<ToolObservation>;
        /** 使用相同 canonical 输入执行一次可选流式 Tool。 */
        stream?(
            actionId: string,
            context: ToolExecutionContext,
            control?: ExecutionControl,
            plan?: SandboxExecutionPlan,
        ): AsyncIterable<ToolStreamEvent>;
    }
    | Extract<ToolValidationResult, { readonly ok: false }>;

/**
 * Registry 保存的类型擦除 Tool 绑定。
 *
 * @remarks
 * `prepare` 在当前调用栈中完成 Contract 结构解析、Tool 语义校验与执行闭包创建。
 * 成功结果不持有可重新解析的原始输入；等待审批或进程恢复时不得持久化该闭包，
 * 应从持久化的 canonical Action 重新准备。
 *
 * @example
 * ```ts
 * const registration = createToolRegistration(tool);
 * const prepared = registration.prepare({ message: "hello" });
 * if (prepared.ok) await prepared.execute("action-1");
 * ```
 */
export interface ToolRegistration {
    /** 程序注册项由 Runner 调度；省略时表示普通业务工具。 */
    readonly kind?: "tool" | "program";
    /** 对外展示的稳定 Tool 描述。 */
    readonly definition: ToolDefinition;
    /** 进程中断后对未完成 Action 的重放策略。 */
    readonly replayPolicy: "safe" | "manual";
    /**
     * 准备一次 Tool Action，不执行 Tool 外部副作用。
     *
     * @param input - 来自 Agent 或持久化 Action 的未知 JSON 输入。
     * @param control - 当前调用共享的中止控制。
     * @returns 隔离的已解析输入和执行闭包，或稳定的输入失败。
     * @throws Contract 定义、语义校验或中止检查异常；中止时传播
     *   `ExecutionAbortedError`。
     */
    prepare(input: JsonValue, control?: ExecutionControl): PreparedToolAction;
}

/**
 * 将带具体 Contract 泛型的 Tool 封装为 Registry 可保存的绑定。
 *
 * @remarks
 * 创建时编译一次完整 Contract 图，尽早拒绝非法定义；每次 `prepare` 只调用一次
 * `safeParse`，并把 Parser 返回的隔离输入交给语义校验和后续执行。该函数不执行
 * Tool，也不保存输入、Action 或执行闭包。
 *
 * @param tool - 由具体 Input Contract 绑定的 Tool 实现。
 * @returns 可放入 `ToolRegistry` 的类型擦除注册项。
 * @throws Input Contract 定义非法时抛出 `ContractDefinitionError`。
 *
 * @example
 * ```ts
 * const registration = createToolRegistration(readFileTool);
 * const registry = new InMemoryToolRegistry([registration]);
 * ```
 */
export function createToolRegistration<C extends ToolInputContract>(
    tool: Tool<C>,
): ToolRegistration {
    compileJsonSchema(tool.definition.inputContract);

    const definition: ToolDefinition = Object.freeze({
        id: tool.definition.id,
        description: tool.definition.description,
        inputContract: tool.definition.inputContract,
        isReadOnly: tool.definition.isReadOnly,
    });

    return {
        kind: "tool",
        definition,
        replayPolicy: tool.replayPolicy,
        prepare(input, control) {
            throwIfAborted(control);
            const parsed = safeParse(tool.definition.inputContract, input);
            throwIfAborted(control);

            if (!parsed.success) {
                const issue = parsed.issues[0];
                const path = issue === undefined
                    ? "$"
                    : issue.path.length === 0
                        ? "$"
                        : "$" + issue.path.map((segment) =>
                            typeof segment === "number"
                                ? `[${segment}]`
                                : `.${segment}`,
                        ).join("");
                const truncated = parsed.truncated ? "；诊断已截断" : "";
                return {
                    ok: false,
                    error: {
                        code: "INVALID_TOOL_INPUT",
                        message: `${definition.id} 输入 Contract 校验失败：${issue?.code ?? "unknown"} at ${path}${truncated}`,
                        issues: parsed.issues.map(({ code, path: issuePath, message }) => ({
                            code,
                            path: issuePath,
                            message,
                        })),
                    },
                };
            }

            const validation = tool.validate(parsed.data);
            throwIfAborted(control);

            if (!isToolValidationResult(validation)) {
                throw new Error("Tool validate returned an invalid result");
            }

            if (!validation.ok) {
                if (!isNonEmptyToolValidationError(validation.error)) {
                    throw new Error("Tool validate returned an invalid error");
                }
                return validation;
            }

            return {
                ok: true,
                input: parsed.data,
                ...(tool.resolveSandboxAccess === undefined
                    ? {}
                    : {
                        resolveSandboxAccess(resolveControl?: ExecutionControl) {
                            return tool.resolveSandboxAccess!(parsed.data, resolveControl);
                        },
                    }),
                execute(actionId, context, executeControl, plan) {
                    return tool.execute({
                        actionId,
                        context,
                        input: parsed.data,
                        ...(plan !== undefined ? { plan } : {}),
                    }, executeControl);
                },
                ...(tool.stream === undefined
                    ? {}
                    : {
                        stream(actionId: string, context: ToolExecutionContext, executeControl?: ExecutionControl, plan?: SandboxExecutionPlan) {
                            return tool.stream!({
                                actionId,
                                context,
                                input: parsed.data,
                                ...(plan !== undefined ? { plan } : {}),
                            }, executeControl);
                        },
                    }),
            };
        },
    };
}

/**
 * 注册由 Runner 调度的程序入口；该入口自身不执行任何业务工具。
 *
 * @example
 * ```ts
 * const registration = createProgramToolRegistration(definition);
 * ```
 */
export function createProgramToolRegistration<C extends ToolInputContract>(
    definition: ToolDefinition<C>,
): ToolRegistration {
    compileJsonSchema(definition.inputContract);
    return {
        kind: "program",
        definition,
        replayPolicy: "manual",
        prepare(input, control) {
            throwIfAborted(control);
            const parsed = safeParse(definition.inputContract, input);
            if (!parsed.success || typeof (parsed.data as { code?: unknown }).code !== "string"
                || Buffer.byteLength((parsed.data as { code: string }).code) > 64 * 1024) {
                return {
                    ok: false,
                    error: {
                        code: "INVALID_TOOL_INPUT",
                        message: "execute_program requires code within 64 KiB",
                    },
                };
            }
            return {
                ok: true,
                input: parsed.data,
                async execute() {
                    throw new Error("PTC_PROGRAM_REQUIRES_RUNNER");
                },
            };
        },
    };
}

function isToolValidationResult(value: unknown): value is ToolValidationResult {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const candidate = value as { readonly ok?: unknown; readonly error?: unknown };
    if (candidate.ok === true) return true;
    if (candidate.ok !== false || typeof candidate.error !== "object" || candidate.error === null) {
        return false;
    }
    const error = candidate.error as { readonly code?: unknown; readonly message?: unknown };
    return error.code === "INVALID_TOOL_INPUT" && isNonEmptyText(error.message);
}

function isNonEmptyToolValidationError(
    value: unknown,
): value is { readonly code: "INVALID_TOOL_INPUT"; readonly message: string } {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const error = value as { readonly code?: unknown; readonly message?: unknown };
    return error.code === "INVALID_TOOL_INPUT" && isNonEmptyText(error.message);
}

function isNonEmptyText(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
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
 * Registry 只按稳定 `toolId` 查找类型擦除的 Tool 注册项，不负责 Profile 授权、
 * Policy 或持久化；输入准备由 Runner 在执行边界调用 `prepare` 完成。
 *
 * @example
 * ```ts
 * const registry: ToolRegistry = new InMemoryToolRegistry([registration]);
 * const resolved = registry.get("read_file");
 * ```
 */
export interface ToolRegistry {
    /**
     * @param toolId - Agent 请求的 Tool 标识。
     * @returns 已注册 ToolRegistration；不存在时返回 `undefined`。
     */
    get(toolId: string): ToolRegistration | undefined;
}

/**
 * 解析当前 Goal 实际可见的 Tool 描述。
 *
 * @remarks
 * 结果只包含冻结 Profile 白名单与 Registry 已注册 Tool 的交集。每个
 * `id` 和 `description` 都会被复制；带内部品牌且不可变的 Input Contract 与注册项
 * 共享引用。本函数不判断 Prompt 版本、准备或执行 Tool，也不修改 Goal。
 *
 * @param goal - 提供冻结 Profile Tool 白名单的完整 Goal。
 * @param registry - 当前 Runtime 已注册的 Tool 查找边界。
 * @returns 按 Profile `toolIds` 顺序排列的独立 ToolDefinition 副本。
 * @throws Registry 查找或 ToolDefinition 复制失败时原样传播异常。
 *
 * @example
 * ```ts
 * const definitions = resolveAuthorizedToolDefinitions(goal, registry);
 * ```
 */
export function resolveAuthorizedToolDefinitions(
    goal: Goal,
    registry: ToolRegistry,
): readonly ToolDefinition[] {
    const definitions: ToolDefinition[] = [];

    for (const toolId of goal.definition.profile.toolIds) {
        const registration = registry.get(toolId);

        if (registration !== undefined) {
            definitions.push(Object.freeze({
                id: registration.definition.id,
                description: registration.definition.description,
                inputContract: registration.definition.inputContract,
                isReadOnly: registration.definition.isReadOnly,
            }));
        }
    }

    return definitions;
}

/**
 * 单进程内的不可变 Tool 注册表。
 *
 * @remarks
 * 构造时复制注册项引用并拒绝空 ID 与重复 ID；Registry 不复制或包装 Tool 实现，
 * 因而具体 Tool 的生命周期由调用方管理。
 *
 * @example
 * ```ts
 * const registry = new InMemoryToolRegistry([registration]);
 * ```
 */
export class InMemoryToolRegistry implements ToolRegistry {
    private readonly tools: ReadonlyMap<string, ToolRegistration>;

    /**
     * @param tools - 要注册的 ToolRegistration 集合。
     * @throws Tool ID 为空或重复时抛出 Error。
     */
    constructor(tools: readonly ToolRegistration[] = []) {
        const registered = new Map<string, ToolRegistration>();

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
     * @returns 构造时注册的 ToolRegistration；不存在时返回 `undefined`。
     */
    get(toolId: string): ToolRegistration | undefined {
        return this.tools.get(toolId);
    }
}
