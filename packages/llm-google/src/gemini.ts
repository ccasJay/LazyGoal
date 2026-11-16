import type { ExecutionControl } from "../../execution-control/src/index";
import {
    type LLMAdapter,
    type LLMConfig,
    type LLMRequest,
    type LLMResponse,
    type LLMStreamEvent,
    type NativeConversationIdentity,
} from "../../llm-core/src/index";
import {
    generateGenerateContent,
    streamGenerateContent,
    type GenerateContentConnection,
} from "../../wire-google-generate-content/src/index";

/**
 * 原生 Gemini 的显式连接配置。
 * @remarks 请求的 maxOutputTokens 优先于配置默认值；不额外查询环境凭据。
 * @example
 * ```ts
 * const config: GeminiConfig = {
 *     apiKey: "secret", model: "model-id",
 *     maxOutputTokens: 4096,
 * };
 * ```
 */
export interface GeminiConfig {
    /** Google Gen AI 服务使用的 API Key。 */
    apiKey: string;
    /** 完整 API 前缀（包含所需版本路径）；省略时使用官方地址与默认版本。 */
    baseURL?: string;
    /** 每次生成请求使用的 Gemini 模型名称。 */
    model: string;
    /** 请求未指定上限时使用的最大输出 Token。 */
    maxOutputTokens?: number;
}

/**
 * 使用原生 GenerateContent 线格式调用 Gemini 的 Adapter。
 *
 * @remarks
 * system 消息合并为 `systemInstruction`，assistant 映射为 Gemini 的 model
 * 角色，其余消息保持顺序；请求构造、Schema 投影、空值哨兵逆向归一、SSE 分帧与
 * 终态校验由 `wire-google-generate-content` 提供，本适配器只声明端点与认证事实。
 * 请求的 maxOutputTokens 优先于配置默认值。
 *
 * @example
 * ```ts
 * const adapter = new Gemini({ apiKey: "secret", model: "gemini-2.5-flash" });
 * const response = await adapter.generate({ messages: [{ role: "user", content: "hello" }] });
 * ```
 */
export class Gemini implements LLMAdapter {
    /** 同一 Gemini 端点和模型的原生回放身份。 */
    readonly nativeConversationIdentity: NativeConversationIdentity;
    private readonly connection: GenerateContentConnection;

    /** @param config - 显式 API Key、模型与可选端点覆盖。 */
    constructor(config: GeminiConfig) {
        const endpoint = (config.baseURL ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
        this.nativeConversationIdentity = {
            provider: "google", endpoint,
            model: config.model, protocol: "gemini-content",
        };
        this.connection = {
            urlPrefix: endpoint,
            headers: { "x-goog-api-key": config.apiKey },
            model: config.model,
            ...(config.maxOutputTokens === undefined ? {} : { maxOutputTokens: config.maxOutputTokens }),
            identity: this.nativeConversationIdentity,
        };
    }

    /**
     * @param request - 供应商无关的消息请求。
     * @param control - 当前 Goal 推进调用共享的中止控制。
     * @returns Gemini 响应归一化后的有序完整内容块。
     * @throws GeminiIncompleteResponseError 截断、安全阻断或协议违规时抛出；
     *   中止时抛出 `ExecutionAbortedError`；暂时传输故障按既有分类抛出。
     */
    async generate(request: LLMRequest, control?: ExecutionControl): Promise<LLMResponse> {
        return generateGenerateContent(this.connection, request, control);
    }

    /**
     * 以 GenerateContent 流交付有序块事件，并在正常 EOF 后给出最终响应。
     *
     * @remarks
     * 请求配置与 `generate()` 共享，保持 ANY／AUTO／NONE、输出上限与 Schema 不变性。
     * 普通 Part 按真实增量交付；严格结构化文本收齐后整块交付，不先发布哨兵原文。
     *
     * @param request - 供应商无关的消息请求。
     * @param control - 当前执行调用的中止控制。
     * @returns 带真实 Part 边界的块事件与唯一成功完成。
     */
    async *stream(request: LLMRequest, control?: ExecutionControl): AsyncIterable<LLMStreamEvent> {
        yield* streamGenerateContent(this.connection, request, control);
    }

    /** 连接事实仅供目录与诊断读取；不含凭据以外的新状态。 */
    get wireConnection(): GenerateContentConnection {
        return this.connection;
    }
}
