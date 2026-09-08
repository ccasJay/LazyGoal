import type { LLMRequest, LLMResponse, StructuredOutputMode } from "./types";
import type { ExecutionControl } from "../../../runtime/src/execution-control";

/**
 * Agent 与具体 LLM 供应商之间的最小适配边界。
 *
 * @remarks
 * 实例构造时显式固定结构化输出模式（`strict` 或 `prompt_only`），在实例生命周期内保持不可变。
 * 实现必须保持对话消息顺序和角色语义；pi-ai 仅接受前置 system 消息并合并为 systemPrompt。
 * 返回模型原始文本，不应在此解析
 * PreparationResult 或 AgentDecision。SDK 抛出的异常原样拒绝 Promise；pi-ai 返回的失败状态映射为 PiAiProviderError，
 * 取消映射为 ExecutionAbortedError，由上层决定工作流语义。
 *
 * @example
 * ```ts
 * const adapter: LLMAdapter = {
 *   structuredOutputMode: "strict",
 *   async generate(request) {
 *     return { content: await callProvider(request) };
 *   },
 * };
 * ```
 */
export interface LLMAdapter {
    /**
     * 该 Adapter 实例固定的结构化输出模式。
     */
    readonly structuredOutputMode: StructuredOutputMode;

    /**
     * @param request - 已按模型消费顺序组装的消息列表，且其 structuredOutput 必须与 structuredOutputMode 一致。
     * @param control - 当前 Goal 推进调用共享的中止控制；适配器应将信号传给
     *   供应商请求，并在响应返回后再次检查。
     * @returns 模型生成的原始文本及可选供应商诊断 metadata。
     * @throws 供应商调用、网络或鉴权失败时传播对应异常（包括 pi-ai 返回状态的适配异常）；中止时抛出
     *   `ExecutionAbortedError`；请求参数与固定模式不一致时抛出 `LLMRequestModeMismatchError`。
     */
    generate(
        request: LLMRequest,
        control?: ExecutionControl,
    ): Promise<LLMResponse>;
}
