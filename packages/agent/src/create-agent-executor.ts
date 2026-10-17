import {
    LLMStepExecutor,
    type LLMStepExecutorDependencies,
} from "../../model-execution/src/index";
import { DropOldestContextCompactor, type ContextCompactor } from "../../context-budget/src/index";
import { createDefaultPromptBundleRenderer } from "../../prompt-bundle/src/index";
import type { PromptBundleRenderer } from "../../prompt-renderer/src/index";
import type { ModelConversationMessage } from "../../model-view/src/index";
import type { StepExecutor } from "../../runtime/src/step-executor";

/**
 * 创建默认模型执行器所需的注入依赖与可选覆盖。
 *
 * @remarks
 * 除 `renderer` 与 `contextCompactor` 外，其余字段沿用 {@link LLMStepExecutorDependencies}。
 * 工厂只解析这两个默认值并构造执行器，不解析环境变量、TOML/Profile，也不创建
 * Provider、Store、工具集、Runner 或关闭管理器。
 *
 * @example
 * ```ts
 * const executor = await createAgentExecutor({
 *     adapter,
 *     trajectoryContextAssembler,
 * });
 * ```
 */
export type AgentExecutorOptions = Omit<LLMStepExecutorDependencies, "renderer" | "contextCompactor"> & {
    /** 显式提供的 Prompt Bundle Renderer；省略时使用当前默认 Bundle。 */
    readonly renderer?: PromptBundleRenderer;
    /** 显式提供的 Conversation 裁剪策略；省略时使用 DropOldestContextCompactor。 */
    readonly contextCompactor?: ContextCompactor<ModelConversationMessage>;
};

/**
 * 创建 Runtime 可调用的默认模型执行器。
 *
 * @param options - 现有执行依赖与可选的 Renderer、裁剪策略覆盖。
 * @returns 满足现有 `StepExecutor` 契约的执行器；借用依赖不建立全局状态或关闭机制。
 * @throws 默认模板缺失、语法或配置错误时在构造期拒绝；显式注入的 Renderer 与
 * 裁剪策略被原样使用，不静默选择其它模板或模型。
 * @example
 * ```ts
 * const executor = await createAgentExecutor({ bindingProvider });
 * const result = await executor.decide({ goal, authorizedTools: [], workingMemory, thinkHistory: [] });
 * ```
 */
export async function createAgentExecutor(
    options: AgentExecutorOptions,
): Promise<StepExecutor> {
    const renderer = options.renderer ?? await createDefaultPromptBundleRenderer();
    const contextCompactor = options.contextCompactor ?? new DropOldestContextCompactor();

    return new LLMStepExecutor({
        ...options,
        renderer,
        contextCompactor,
    });
}
