import type {
    Contract,
    InferContract,
    JsonValue,
} from "../../contracts/src/index";
import type { ExecutionControl } from "../../execution-control/src/index";
import type { DerivedSandboxAccess, SandboxExecutionPlan } from "../../sandbox/src/index";

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

/**
 * Tool 实际返回的成功或领域失败 Observation。
 *
 * @remarks
 * `success` 与 `failure` 是 Tool 本身执行产出的领域结果；
 * 策略或用户打断产生的 `rejected` 属于 Runtime 状态机，不在此联合中。
 *
 * @example
 * ```ts
 * const obs: ToolObservation = {
 *   kind: "success",
 *   output: "ok",
 *   summary: "执行成功",
 * };
 * ```
 */
export type ToolObservation =
    | {
        readonly kind: "success";
        readonly output: JsonValue;
        readonly summary: string;
    }
    | {
        readonly kind: "failure";
        readonly code: string;
        readonly message: string;
        readonly retryable: boolean;
        readonly details?: JsonValue;
    };

/**
 * Tool 流式执行过程中可观察的输出或最终结算。
 *
 * @example
 * ```ts
 * const event: ToolStreamEvent = {
 *   kind: "output",
 *   channel: "stdout",
 *   text: "chunk",
 * };
 * ```
 */
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

/**
 * 一项经过界限化且不包含原始输入的校验问题定位。
 *
 * @example
 * ```ts
 * const issue: ToolValidationIssue = {
 *   code: "invalid_type",
 *   path: ["path"],
 *   message: "Expected string, received number",
 * };
 * ```
 */
export interface ToolValidationIssue {
    readonly code: string;
    readonly path: readonly (string | number)[];
    readonly message: string;
}

/**
 * Tool 输入校验结果。
 *
 * @example
 * ```ts
 * const result: ToolValidationResult = { ok: true };
 * ```
 */
export type ToolValidationResult =
    | { readonly ok: true }
    | {
        readonly ok: false;
        readonly error: {
            readonly code: "INVALID_TOOL_INPUT";
            /** 可定位且不包含原始输入值的诊断，供同阶段模型纠错使用。 */
            readonly issues?: readonly ToolValidationIssue[];
            /** 稳定、非敏感的错误说明；不得拼入模型提供的原始字段值。 */
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

/**
 * Tool Contract 与语义校验完成后的单次可执行 Action。
 *
 * @example
 * ```ts
 * const prepared: PreparedToolAction = {
 *   ok: true,
 *   input: { path: "README.md" },
 *   async execute(actionId, context) {
 *     return { kind: "success", output: "done", summary: "完成" };
 *   },
 * };
 * ```
 */
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
 * const registration: ToolRegistration = {
 *   definition,
 *   replayPolicy: "safe",
 *   prepare: (input) => ({ ok: true, input, execute: async () => ({ kind: "success", output: "", summary: "" }) }),
 * };
 * ```
 */
export interface ToolRegistration {
    /** 程序注册项由 Runner 调度；普通业务工具为 "tool"。 */
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
