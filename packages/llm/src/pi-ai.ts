import { createModels, createProvider, type Model, type Api, type Context, type AssistantMessage, type AssistantMessageEvent } from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { LLMAdapter } from "./core/adapter";
import { LLMRequestModeMismatchError, type LLMRequest, type LLMResponse, type LLMStreamEvent, type LLMToolCall } from "./core/types";
import { LlmConfigurationError, type LlmConfig } from "./config";
import { ExecutionAbortedError, throwIfAborted, type ExecutionControl } from "../../execution-control/src/index";
import { classifyTransientModelFailure } from "./core/model-request-failure";

/** pi-ai 返回的失败状态；不包含部分输出、凭据或 SDK 响应对象。 */
export class PiAiProviderError extends Error {
    readonly code = "PI_AI_PROVIDER_ERROR";
    constructor(readonly provider: string, readonly stopReason: string, message: string) {
        super(message);
        this.name = "PiAiProviderError";
    }
}

const factories = {
    openai: openaiProvider,
    google: googleProvider,
    anthropic: anthropicProvider,
    openrouter: openrouterProvider,
    deepseek: deepseekProvider,
};

/**
 * pi-ai 的单次文本生成边界，固定使用 prompt_only。
 *
 * @remarks
 * 构造时离线解析模型目录；不执行登录、目录刷新或凭据持久化。
 * 内部聚合流式输出，只有正常结束的文本交给 Agent。pi-ai usage 无法证明
 * 原始计数是否存在，因此只返回诊断 piUsage，不参与正式用量累计。
 */
export class PiAiAdapter implements LLMAdapter {
    readonly structuredOutputMode = "prompt_only" as const;
    private readonly models = createModels({
        authContext: { env: async () => undefined, fileExists: async () => false },
    });
    private readonly model: Model<Api>;

    /**
     * @param config - 显式 API Key、供应商、模型及可选容量配置。
     * @throws LlmConfigurationError 模式不匹配、模型不在目录或输出上限超过模型容量。
     */
    constructor(private readonly config: LlmConfig) {
        if (config.structuredOutputMode !== "prompt_only") {
            throw new LlmConfigurationError([], "PiAiAdapter only supports prompt_only output");
        }
        if (config.provider === "openai-compatible") {
            this.model = {
                id: config.model, name: config.model, provider: config.provider,
                api: "openai-completions", baseUrl: config.baseURL,
                reasoning: false, input: ["text"],
                contextWindow: config.contextWindowTokens, maxTokens: config.maxOutputTokens,
                // pi-ai requires pricing metadata; these placeholders are never reported as cost.
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            };
            this.models.setProvider(createProvider({
                id: config.provider,
                models: [this.model],
                api: openAICompletionsApi(),
                auth: { apiKey: {
                    name: "Explicit API key",
                    resolve: async () => ({ auth: { apiKey: config.apiKey }, source: "explicit" }),
                } },
            }));
        } else {
            this.models.setProvider(factories[config.provider]());
            const model = this.models.getModel(config.provider, config.model);
            if (model === undefined) {
                throw new LlmConfigurationError([], `Unknown model "${config.model}" for provider "${config.provider}" in the pinned pi-ai catalog`);
            }
            this.model = (config.provider === "openai" || config.provider === "google") && config.baseURL !== undefined
                ? { ...model, baseUrl: config.baseURL }
                : model;
        }
        this.checkOutputLimit(config.maxOutputTokens);
    }

    /**
     * @param request - 前置 system 消息及有序 user/assistant 文本；不得携带结构 Schema。
     * @param control - 本次 Goal 推进共享的取消信号。
     * @returns 正常完成的原始文本及非权威 pi-ai 用量诊断。
     * @throws ExecutionAbortedError 取消；PiAiProviderError 失败、截断或意外工具调用；SDK 抛出的异常原样传播。
     */
    async generate(request: LLMRequest, control?: ExecutionControl): Promise<LLMResponse> {
        throwIfAborted(control);
        if (request.structuredOutput !== undefined) {
            throw new LLMRequestModeMismatchError("PiAiAdapter uses prompt_only, but LLMRequest provides structuredOutput");
        }
        const maxTokens = request.maxOutputTokens ?? this.config.maxOutputTokens;
        this.checkOutputLimit(maxTokens);
        const context = this.toContext(request);
        let response: AssistantMessage;
        try {
            response = await this.models.completeSimple(this.model, context, {
                apiKey: this.config.apiKey,
                ...(maxTokens === undefined ? {} : { maxTokens }),
                ...(control?.signal === undefined ? {} : { signal: control.signal }),
            });
            throwIfAborted(control);
        } catch (error) {
            throwIfAborted(control);
            const transientFailure = classifyTransientModelFailure(error);
            if (transientFailure !== undefined) throw transientFailure;
            throw error;
        }
        if (response.stopReason === "aborted") throw new ExecutionAbortedError();
        return this.toResponse(request, response);
    }

    /**
     * 将 pi-ai 的 AssistantMessage 流转换为供应商无关的事件。
     *
     * @param request - 当前模型请求，用于保持与 `generate()` 相同的校验和工具语义。
     * @param control - 当前执行调用的中止控制。
     * @returns 归一化的增量和最终响应。
     */
    async *stream(
        request: LLMRequest,
        control?: ExecutionControl,
    ): AsyncIterable<LLMStreamEvent> {
        throwIfAborted(control);
        if (request.structuredOutput !== undefined) {
            throw new LLMRequestModeMismatchError("PiAiAdapter uses prompt_only, but LLMRequest provides structuredOutput");
        }
        const maxTokens = request.maxOutputTokens ?? this.config.maxOutputTokens;
        this.checkOutputLimit(maxTokens);
        const context = this.toContext(request);
        yield { kind: "started" };

        let completed = false;
        try {
            const stream = this.models.streamSimple(this.model, context, {
                apiKey: this.config.apiKey,
                ...(maxTokens === undefined ? {} : { maxTokens }),
                ...(control?.signal === undefined ? {} : { signal: control.signal }),
            });
            for await (const event of stream as AsyncIterable<AssistantMessageEvent>) {
                throwIfAborted(control);
                if (event.type === "text_delta" && event.delta.length > 0) {
                    yield { kind: "assistant_text_delta", text: event.delta };
                } else if (event.type === "thinking_delta" && event.delta.length > 0) {
                    yield { kind: "reasoning_delta", text: event.delta };
                } else if (event.type === "toolcall_delta" && event.delta.length > 0) {
                    yield {
                        kind: "model_tool_call_delta",
                        delta: event.delta,
                        contentIndex: event.contentIndex,
                    };
                } else if (event.type === "done") {
                    completed = true;
                    yield { kind: "completed", response: this.toResponse(request, event.message) };
                } else if (event.type === "error") {
                    if (event.reason === "aborted") throw new ExecutionAbortedError();
                    const transientFailure = classifyTransientModelFailure(event.error);
                    if (transientFailure !== undefined) throw transientFailure;
                    throw new PiAiProviderError(
                        this.config.provider,
                        event.reason,
                        `Provider "${this.config.provider}" did not complete a text response (${event.reason})`,
                    );
                }
            }
            throwIfAborted(control);
            if (!completed) {
                throw new PiAiProviderError(
                    this.config.provider,
                    "error",
                    `Provider "${this.config.provider}" ended a stream without a completed response`,
                );
            }
        } catch (error) {
            throwIfAborted(control);
            throw error;
        }
    }

    private toResponse(request: LLMRequest, response: AssistantMessage): LLMResponse {
        const hasTools = request.tools !== undefined && request.tools.length > 0;
        if (response.stopReason === "error") {
            const transientFailure = classifyTransientModelFailure(response);
            if (transientFailure !== undefined) throw transientFailure;
        }
        if (!hasTools) {
            if (response.stopReason !== "stop" || response.content.some(block => block.type === "toolCall")) {
                // Provider messages may echo request credentials; do not copy arbitrary SDK text into Runtime errors.
                throw new PiAiProviderError(this.config.provider, response.stopReason,
                    `Provider "${this.config.provider}" did not complete a text response (${response.stopReason})`);
            }
        } else {
            const validStop = response.stopReason === "stop" || response.stopReason === "toolUse";
            if (!validStop && !response.content.some(block => block.type === "toolCall")) {
                throw new PiAiProviderError(this.config.provider, response.stopReason,
                    `Provider "${this.config.provider}" did not complete a text response (${response.stopReason})`);
            }
        }
        const { input, output, cacheRead, cacheWrite, reasoning } = response.usage;
        const piUsage = Object.fromEntries(Object.entries({ input, output, cacheRead, cacheWrite, reasoning })
            .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0));

        const textBlocks = response.content.flatMap(block => block.type === "text" ? [block.text] : []);
        const thinkingBlocks = response.content.flatMap(block => block.type === "thinking" ? [block.thinking] : []);
        const content = hasTools && thinkingBlocks.length > 0
            ? `${thinkingBlocks.join("\n")}\n${textBlocks.join("\n")}`.trim()
            : textBlocks.join("");

        const toolCalls: LLMToolCall[] = response.content.flatMap(block => {
            if (block.type === "toolCall") {
                return [{
                    callId: block.id,
                    toolId: block.name,
                    argumentsJson: typeof block.arguments === "string" ? block.arguments : JSON.stringify(block.arguments ?? {}),
                }];
            }
            return [];
        });

        return {
            content,
            ...(toolCalls.length > 0 ? { toolCalls } : {}),
            providerMetadata: {
                provider: response.provider, api: response.api, model: response.model,
                ...(response.responseId === undefined ? {} : { responseId: response.responseId }),
                stopReason: response.stopReason,
                piUsage,
            },
        };
    }

    private checkOutputLimit(limit: number | undefined): void {
        if (limit !== undefined && limit > this.model.maxTokens) {
            throw new LlmConfigurationError([], `Maximum output tokens exceed model "${this.model.id}" limit (${this.model.maxTokens})`);
        }
    }

    private toContext(request: LLMRequest): Context {
        const system: string[] = [];
        const messages: Context["messages"] = [];
        for (const message of request.messages) {
            if (message.role === "system") {
                if (messages.length) throw new PiAiProviderError(this.config.provider, "invalid_request", "System messages must precede conversation messages");
                system.push(message.content);
            } else if (message.role === "user") {
                messages.push({ role: "user", content: message.content, timestamp: 0 });
            } else {
                messages.push({
                    role: "assistant", content: [{ type: "text", text: message.content }],
                    api: this.model.api, provider: this.model.provider, model: this.model.id,
                    timestamp: 0, stopReason: "stop",
                    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
                        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
                });
            }
        }
        const tools = request.tools?.map(t => ({
            name: t.id,
            description: t.description,
            parameters: t.parametersSchema,
        }));
        return {
            messages,
            ...(system.length ? { systemPrompt: system.join("\n") } : {}),
            ...(tools && tools.length > 0 ? { tools: tools as any } : {}),
        };
    }
}
