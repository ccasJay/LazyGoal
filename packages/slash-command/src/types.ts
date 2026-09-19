/**
 * Slash 命令调用参数契约。
 *
 * @remarks
 * 封装已识别的命令名称、参数文本及原始完整输入行。
 *
 * @example
 * ```ts
 * const invocation: SlashCommandInvocation = {
 *   command: "model",
 *   args: "",
 *   raw: "/model",
 * };
 * ```
 */
export interface SlashCommandInvocation {
    /** 规范化的小写命令名称（不含前导斜杠）。 */
    readonly command: string;
    /** 命令后面的原始参数字符串（已修剪前后空白）。 */
    readonly args: string;
    /** 用户提交的完整原始单行文本。 */
    readonly raw: string;
}

/**
 * Slash 命令摘要信息。
 *
 * @remarks
 * 用于补全候选呈现与命令列表查询，不暴露执行闭包。
 *
 * @example
 * ```ts
 * const summary: SlashCommandSummary = {
 *   name: "model",
 *   description: "Switch the active language model",
 *   usage: "/model",
 * };
 * ```
 */
export interface SlashCommandSummary {
    /** 命令唯一名称（小写字母开头，只含小写字母、数字或连字符）。 */
    readonly name: string;
    /** 命令的人类可读功能描述。 */
    readonly description: string;
    /** 命令的使用形式示例说明（如 "/model"）。 */
    readonly usage: string;
}

/**
 * Slash 命令执行契约。
 *
 * @remarks
 * 业务命令实现此接口并注册到注册表。execute 返回特定领域的副作用描述对象或 Promise。
 *
 * @example
 * ```ts
 * const myCommand: SlashCommandDefinition<{ kind: "ping" }> = {
 *   name: "ping",
 *   description: "Test command",
 *   usage: "/ping",
 *   execute: () => ({ kind: "ping" }),
 * };
 * ```
 */
export interface SlashCommandDefinition<TEffect> {
    /** 命令唯一名称。 */
    readonly name: string;
    /** 命令描述。 */
    readonly description: string;
    /** 命令用法说明。 */
    readonly usage: string;
    /**
     * 执行命令并生成领域副作用描述。
     *
     * @param invocation - 包含命令名、参数与原始输入的调用上下文。
     * @returns 领域副作用描述对象或其 Promise。
     * @throws 当参数非法或前置条件不满足时抛出 SlashCommandError。
     */
    execute(invocation: SlashCommandInvocation): TEffect | Promise<TEffect>;
}

/**
 * 输入检查结果的受限制联合类型。
 *
 * @remarks
 * 在用户键入过程中实时同步计算，用于区分普通文本、转义斜杠、补全候选、完整命令准备调用或非法前缀拒绝。
 *
 * @example
 * ```ts
 * const inspection: SlashInputInspection = registry.inspect("/m");
 * if (inspection.kind === "candidates") {
 *   console.log(inspection.candidates);
 * }
 * ```
 */
export type SlashInputInspection =
    | { readonly kind: "text" }
    | { readonly kind: "escaped_text"; readonly content: string }
    | { readonly kind: "candidates"; readonly candidates: readonly SlashCommandSummary[] }
    | { readonly kind: "invocation"; readonly invocation: SlashCommandInvocation }
    | { readonly kind: "rejected"; readonly code: string; readonly message: string };

/**
 * 命令提交派发结果联合类型。
 *
 * @remarks
 * 用户在输入框回车提交时异步调用 dispatch 产生的结果，表示普通文本放行、转义文本还原、命令执行产出的副作用或错误拒绝。
 *
 * @example
 * ```ts
 * const result = await registry.dispatch("/model");
 * if (result.kind === "executed") {
 *   handleEffect(result.effect);
 * }
 * ```
 */
export type SlashCommandDispatchResult<TEffect> =
    | { readonly kind: "text" }
    | { readonly kind: "escaped_text"; readonly content: string }
    | { readonly kind: "executed"; readonly effect: TEffect }
    | { readonly kind: "rejected"; readonly code: string; readonly message: string };

/**
 * Slash Command 注册表与解析派发中心。
 *
 * @remarks
 * 负责命令的生命周期注册、名称唯一性校验、实时纯逻辑输入检查以及异步派发执行。
 * 完全解耦 UI、终端渲染与具体业务逻辑。
 *
 * @example
 * ```ts
 * const registry = createSlashCommandRegistry<MyEffect>();
 * registry.register(myCommand);
 * const inspection = registry.inspect("/");
 * const result = await registry.dispatch("/my-cmd");
 * ```
 */
export interface SlashCommandRegistry<TEffect> {
    /**
     * 注册新的命令定义。
     *
     * @param definition - 待注册的命令定义。
     * @throws 当命令名称非法（非小写字母开头或包含非法字符）或与已注册命令重名时抛出 SlashCommandError。
     */
    register(definition: SlashCommandDefinition<TEffect>): void;

    /**
     * 按稳定名称查找已注册命令定义。
     *
     * @param name - 命令名。
     * @returns 匹配的命令定义；不存在时返回 undefined。
     */
    get(name: string): SlashCommandDefinition<TEffect> | undefined;

    /**
     * 获取全部已注册命令的摘要列表，按名称字典序升序排列。
     *
     * @returns 排序后的命令摘要列表。
     */
    list(): readonly SlashCommandSummary[];

    /**
     * 实时纯逻辑检查用户输入。
     *
     * @param input - 用户当前的输入字符串。
     * @returns 检查结果（普通文本、转义文本、候选列表、带参数的调用准备或错误拒绝）。
     */
    inspect(input: string): SlashInputInspection;

    /**
     * 提交并派发用户输入。
     *
     * @param input - 用户提交的单行文本。
     * @returns 派发结果。若命中命令则异步执行其 execute 并返回 executed 包装的领域副作用。
     */
    dispatch(input: string): Promise<SlashCommandDispatchResult<TEffect>>;
}

/**
 * `/model` 预置命令所产生的领域副作用描述。
 *
 * @remarks
 * UI 层在收到此 effect 后负责调起模型选择交互面板，命令契约本身不依赖具体 UI 或 LLM Provider。
 *
 * @example
 * ```ts
 * const effect: ModelCommandEffect = { kind: "open_model_selector" };
 * ```
 */
export type ModelCommandEffect =
    | { readonly kind: "open_model_selector" }
    | { readonly kind: "enter_plan_mode" };

/** Slash 命令产生的 UI/Runtime 控制副作用。 */
export type SlashCommandEffect = ModelCommandEffect;
