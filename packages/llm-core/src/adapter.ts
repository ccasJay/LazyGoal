import type { NativeConversationIdentity } from "../../model-contracts/src/index";
import type {
    LLMRequest,
    LLMResponse,
    LLMStreamEvent,
} from "./types";
import type { ExecutionControl } from "../../execution-control/src/index";

/**
 * Agent 与具体 LLM 供应商之间的最小适配边界。
 *
 * @remarks
 * 可选的 `nativeConversationIdentity` 表示 Adapter 支持同身份原生历史回放；缺省时只使用现有语义历史。
 * 实现必须保持对话消息顺序和角色语义；pi-ai 仅接受前置 system 消息并合并为 systemPrompt。
 * 正文、公开 reasoning 摘要与工具调用分别返回，不把思考块拼进正文，也不在此解析 AgentDecision。
 * required 工具调用策略须映射到对应供应商参数；调用数量和参数有效性由 Agent 校验，与原生历史回放能力无关。
 * 仅将结构化识别的限流、临时服务、连接和超时故障
 * 映射为 Runtime 可识别的暂时请求故障；其他 SDK 异常原样拒绝 Promise。适配器不执行内部重试，
 * 由 Runtime 独立控制总调用次数和可中止退避。
 *
 * @example
 * ```ts
 * const adapter: LLMAdapter = {
 *   async generate(request) {
 *     return { blocks: [{ index: 0, type: "text", format: "json", text: await callProvider(request) }] };
 *   },
 * };
 * ```
 */
export interface LLMAdapter {
    /** 存在时支持同身份原生历史回放；省略时只使用现有语义历史。 */
    readonly nativeConversationIdentity?: NativeConversationIdentity;

    /**
     * @param request - 已按模型消费顺序组装的消息列表；具体生成约束由请求和 Adapter 协议共同决定。
     * @param control - 当前 Goal 推进调用共享的中止控制；适配器应将信号传给
     *   供应商请求，并在响应返回后再次检查。
     * @returns 模型生成的有序完整内容块及可选供应商诊断 metadata。
     * @throws 供应商调用、网络或鉴权失败时传播对应异常（包括 pi-ai 返回状态的适配异常）；中止时抛出
     *   `TransientModelRequestFailure`（仅限已分类的暂时故障）或 `ExecutionAbortedError`。
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
