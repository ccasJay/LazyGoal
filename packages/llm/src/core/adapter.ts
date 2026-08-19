import type { LLMRequest, LLMMessage, LLMResponse } from "./types";
import type { ExecutionControl } from "../../../runtime/src/execution-control";

/**
 * Agent 与具体 LLM 供应商之间的最小适配边界。
 *
 * @remarks
 * 实现必须保持消息顺序和角色语义，返回模型原始文本，不应在此解析
 * PreparationResult 或 AgentDecision。网络、鉴权、限流和供应商协议错误应原样
 * 拒绝 Promise，由上层决定工作流语义。
 *
 * @example
 * ```ts
 * const adapter: LLMAdapter = {
 *   async generate(request) {
 *     return { content: await callProvider(request.messages) };
 *   },
 * };
 * ```
 */
export interface  LLMAdapter {
    /**
     * @param request - 已按模型消费顺序组装的消息列表。
     * @param control - 当前 Goal 推进调用共享的中止控制；适配器应将信号传给
     *   供应商请求，并在响应返回后再次检查。
     * @returns 模型生成的原始文本响应。
     * @throws 供应商调用、网络或鉴权失败时传播对应异常；中止时抛出
     *   `ExecutionAbortedError`。
     */
    generate(
        request: LLMRequest,
        control?: ExecutionControl,
    ): Promise<LLMResponse>;
}
