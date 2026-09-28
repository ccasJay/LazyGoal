import type {
    LLMRequest,
    LLMResponse,
    LLMStreamEvent,
    StructuredOutputMode,
} from "./types";
import type { ExecutionControl } from "../../../runtime/src/execution-control";

export type {
    LLMRequest,
    LLMResponse,
    LLMStreamEvent,
    StructuredOutputMode,
};

/**
 * Agent 与具体 LLM 供应商之间的最小适配边界。
 *
 * @remarks
 * 实例构造时显式固定实际输出模式（`strict` 或 `prompt_only`），在实例生命周期内保持不可变；`two_stage`
 * 由 Runtime 工厂解析为同一模型的阶段 Adapter 对，不是单个请求的实际输出模式。
 * 实现必须保持对话消息顺序和角色语义；pi-ai 仅接受前置 system 消息并合并为 systemPrompt。
 * 返回模型原始文本，不应在此解析 AgentDecision。仅将结构化识别的限流、临时服务、连接和超时故障
 * 映射为 Runtime 可识别的暂时请求故障；其他 SDK 异常原样拒绝 Promise。适配器不执行内部重试，
 * 由 Runtime 独立控制总调用次数和可中止退避。
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
     *   `TransientModelRequestFailure`（仅限已分类的暂时故障）；`ExecutionAbortedError`；
     *   请求参数与固定模式不一致时抛出 `LLMRequestModeMismatchError`。
     */
    generate(
        request: LLMRequest,
        control?: ExecutionControl,
    ): Promise<LLMResponse>;

    /**
     * 可选的模型生成流；实现时必须最终产生一个与 `generate()` 兼容的 completed 事件。
     *
     * @param request - 与 `generate()` 相同的供应商无关请求。
     * @param control - 当前 Goal 推进调用共享的中止控制。
     * @returns Provider 归一化的生成事件序列。
     * @throws Provider 或中止异常；部分增量不会被伪装成完整响应。
     */
    readonly stream?: (
        request: LLMRequest,
        control?: ExecutionControl,
    ) => AsyncIterable<LLMStreamEvent>;
}
