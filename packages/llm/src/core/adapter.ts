import type { LLMRequest, LLMMessage, LLMResponse } from "./types";

/**
 * Agent 与具体 LLM 供应商之间的最小适配边界。
 *
 * @remarks
 * 实现必须保持消息顺序和角色语义，返回模型原始文本，不应在此解析
 * StepResult。网络、鉴权、限流和供应商协议错误应原样拒绝 Promise，由上层
 * 决定是否转换为 Run 失败。
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
     * @returns 模型生成的原始文本响应。
     * @throws 供应商调用、网络或鉴权失败时传播对应异常。
     */
    generate(request: LLMRequest) : Promise<LLMResponse>;
}
