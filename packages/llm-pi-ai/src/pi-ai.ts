import { createModels, createProvider, hasApi, type Api, type AssistantMessage, type AssistantMessageEvent, type Context, type JsonObject, type Model, type StreamOptions } from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { opencodeGoProvider } from "@earendil-works/pi-ai/providers/opencode-go";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import {
    LLMConfigurationError,
    LLMRequestModeMismatchError,
    classifyTransientModelFailure,
    type LLMAdapter,
    type LLMConfig,
    type LLMContentBlock,
    type LLMContentDelivery,
    type LLMRequest,
    type LLMResponse,
    type LLMStreamEvent,
} from "../../llm-core/src/index";
import { ExecutionAbortedError, ModelRequestFailure, throwIfAborted, type ExecutionControl } from "../../execution-control/src/index";

/** pi-ai 返回的失败状态；不包含部分输出、凭据或 SDK 响应对象。 */
export class PiAiProviderError extends ModelRequestFailure {
    readonly code = "PI_AI_PROVIDER_ERROR";
    constructor(readonly provider: string, readonly stopReason: string, message: string) {
        super(message);
        this.name = "PiAiProviderError";
    }
}

function providerFailureMessage(provider: string, stopReason: string, errorMessage?: string): string {
    if (provider === "opencode-go" && stopReason === "error"
        && errorMessage?.toLowerCase().includes("active opencode go subscription is required")) {
        return "OpenCode Go requires an active subscription for this request. Check your subscription or choose another provider in Settings.";
    }
    const status = errorMessage?.match(/(?:^\s*|\bHTTP\s+|\bstatus(?:\s+code)?[\s:=]+)([45]\d{2})\b/i)?.[1];
    if (status !== undefined) {
        return `Provider "${provider}" rejected the model request (HTTP ${status}). Check provider access and service status.`;
    }
    return `Provider "${provider}" did not complete a text response (${stopReason})`;
}

const factories = {
    openai: openaiProvider,
    google: googleProvider,
    anthropic: anthropicProvider,
    openrouter: openrouterProvider,
    deepseek: deepseekProvider,
    "opencode-go": opencodeGoProvider,
};

/** LazyGoal 自有 User-Agent；缺失版本号时使用纯标识。 */
const LAZYGOAL_USER_AGENT = "lazygoal";

/** OpenCode Go 的 OpenAI-compatible Chat Completions API 前缀。 */
const OPENCODE_GO_OPENAI_COMPLETIONS_BASE_URL = "https://opencode.ai/inference/go/v1";

/**
 * 构造 pi-ai 请求 options 中的供应商专属附加项。
 *
 * @remarks
 * 仅 `opencode-go` 需要：始终注入 LazyGoal 自有 User-Agent 以替代 pi-ai 默认 UA；
 * 提供会话身份时把它作为 pi-ai `sessionId` 传入，由 pi-ai 的 OpenCode 会话头包装据此发送 `x-opencode-session`。
 * 其它供应商返回空对象，请求头与行为保持不变。
 *
 * @param input - 当前供应商与可选稳定会话身份（如 `goal.id`）。
 * @returns 可直接合并进 pi-ai options 的附加字段；无附加项时为空对象。
 * @example
 * ```ts
 * const extras = buildPiAiRequestOptions({ provider: "opencode-go", sessionId: goalId });
 * ```
 */
export function buildPiAiRequestOptions(input: {
    readonly provider: LLMConfig["provider"];
    readonly sessionId?: string | undefined;
}): { readonly sessionId?: string; readonly headers?: Record<string, string> } {
    if (input.provider !== "opencode-go") return {};
    return {
        ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
        headers: { "User-Agent": LAZYGOAL_USER_AGENT },
    };
}

/**
 * 把 pi-ai 的内容块转换为供应商无关的完整响应。
 *
 * @remarks
 * 有原始参数分片时保留其文本；仅在 SDK 只提供解析对象时才使用协议的稳定序列化。
 */
function argumentsJsonOf(args: JsonObject | string | undefined): string {
    return typeof args === "string" ? args : JSON.stringify(args ?? {});
}

/** 用 SDK 解析后的参数核对原始分片语义；空白与键顺序差异不改写已结束块。 */
function verifyToolCallArguments(raw: string | undefined, toolCall: { readonly arguments: JsonObject }): void {
    if (raw === undefined || raw.length === 0) return;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        // 非法 JSON 保留原始文本，由阶段解码拒绝，不在适配器内修复。
        return;
    }
    if (JSON.stringify(parsed) !== JSON.stringify(toolCall.arguments ?? {})) {
        throw new PiAiProviderError(
            "pi-ai",
            "error",
            "Provider tool call arguments changed after the streamed fragments ended",
        );
    }
}

/**
 * pi-ai 的单次文本生成边界，固定使用 prompt_only。
 *
 * @remarks
 * 静态模型在构造时从 pi-ai 目录解析；OpenCode Go 动态模型使用服务端传入的执行 API 与容量，端点固定在本适配器。
 * 不执行登录、目录刷新或凭据持久化。
 * 内部聚合流式输出，只有正常结束的文本交给 Agent。pi-ai usage 无法证明
 * 原始计数是否存在，因此只返回诊断 piUsage，不参与正式用量累计。
 * 工具选择按模型 API 映射：auto/none 使用 simple 入口；required 使用完整 API，
 * OpenAI 发送 required，Anthropic/Google 发送 any，不改变 Runtime 的工具授权。
 */
export class PiAiAdapter implements LLMAdapter {
    readonly structuredOutputMode = "prompt_only" as const;
    private readonly models = createModels({
        authContext: { env: async () => undefined, fileExists: async () => false },
    });
    private readonly model: Model<Api>;

    /**
     * @param config - 显式 API Key、供应商、模型及可信执行元数据；动态 OpenCode Go 不接受调用方端点。
     * @throws LLMConfigurationError 模式不匹配、静态模型不在目录、动态协议不受支持或动态容量无效时抛出。
     */
    constructor(private readonly config: LLMConfig) {
        if (config.structuredOutputMode !== "prompt_only") {
            throw new LLMConfigurationError([], "PiAiAdapter only supports prompt_only output");
        }
        const executionApi = (config as LLMConfig & { readonly executionApi?: unknown }).executionApi;
        if (executionApi !== undefined && (config.provider !== "opencode-go" || executionApi !== "openai-completions")) {
            throw new LLMConfigurationError([], `Unsupported execution API "${String(executionApi)}" for provider "${config.provider}"`);
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
        } else if (config.provider === "opencode-go" && (config.executionApi === "openai-completions" || config.model === "beam-free")) {
            const contextWindow = config.contextWindowTokens ?? 128000;
            const maxTokens = config.maxOutputTokens ?? 8192;
            if (!Number.isSafeInteger(contextWindow) || contextWindow <= 0
                || !Number.isSafeInteger(maxTokens) || maxTokens <= 0
                || maxTokens >= contextWindow) {
                throw new LLMConfigurationError([], `Invalid dynamic model capacity for "${config.model}"`);
            }
            const provider = opencodeGoProvider();
            const completionsTemplate = provider.getModels().find(
                (candidate): candidate is Model<"openai-completions"> => candidate.api === "openai-completions",
            );
            if (completionsTemplate === undefined) {
                throw new LLMConfigurationError([], "OpenCode Go adapter does not expose the openai-completions API");
            }
            const model: Model<"openai-completions"> = {
                id: config.model,
                name: config.model,
                provider: "opencode-go",
                api: "openai-completions",
                baseUrl: OPENCODE_GO_OPENAI_COMPLETIONS_BASE_URL,
                reasoning: config.reasoning,
                input: ["text"],
                contextWindow,
                maxTokens,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                ...(completionsTemplate.compat === undefined ? {} : { compat: completionsTemplate.compat }),
            };
            this.models.setProvider({
                ...provider,
                getModels: () => [...provider.getModels(), model],
            });
            this.model = model;
        } else {
            this.models.setProvider(factories[config.provider]());
            const model = this.models.getModel(config.provider, config.model);
            if (model === undefined) {
                throw new LLMConfigurationError([], `Unknown model "${config.model}" for provider "${config.provider}" in the pinned pi-ai catalog`);
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
            const options = {
                apiKey: this.config.apiKey,
                ...(maxTokens === undefined ? {} : { maxTokens }),
                ...(control?.signal === undefined ? {} : { signal: control.signal }),
                ...buildPiAiRequestOptions({
                    provider: this.config.provider,
                    ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
                }),
            };
            response = request.toolChoice === "required"
                ? await this.requiredToolStream(context, options).result()
                : await this.models.completeSimple(this.model, context, {
                    ...options,
                    ...(request.toolChoice === undefined ? {} : { toolChoice: request.toolChoice }),
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
     * 将 pi-ai 的 AssistantMessage 流转换为供应商无关的有序块事件。
     *
     * @param request - 当前模型请求，用于保持与 `generate()` 相同的校验和工具语义。
     * @param control - 当前执行调用的中止控制。
     * @returns 带真实内容索引的块开始、增量、完整结束与唯一成功完成。
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

        // 工具参数只保留原始分片文本；SDK 解析后的对象只用于语义核对，绝不改写已结束块。
        const toolArguments = new Map<number, string>();
        const thinkingDelivery = new Map<number, LLMContentDelivery>();
        let completed = false;
        try {
            const options = {
                apiKey: this.config.apiKey,
                ...(maxTokens === undefined ? {} : { maxTokens }),
                ...(control?.signal === undefined ? {} : { signal: control.signal }),
                ...buildPiAiRequestOptions({
                    provider: this.config.provider,
                    ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
                }),
            };
            const stream = request.toolChoice === "required"
                ? this.requiredToolStream(context, options)
                : this.models.streamSimple(this.model, context, {
                    ...options,
                    ...(request.toolChoice === undefined ? {} : { toolChoice: request.toolChoice }),
                });
            let primaryError: unknown;
            let sdkIterator: AsyncIterator<AssistantMessageEvent> | undefined;
            try {
                sdkIterator = (stream as AsyncIterable<AssistantMessageEvent>)[Symbol.asyncIterator]();
                while (true) {
                    const next = await sdkIterator.next();
                    if (next.done === true) break;
                    const event = next.value;
                    throwIfAborted(control);
                    switch (event.type) {
                    case "text_start":
                        yield {
                            kind: "content_block_started", index: event.contentIndex,
                            blockType: "text", delivery: "incremental", format: "plain",
                        };
                        break;
                    case "text_delta":
                        if (event.delta.length > 0) {
                            yield {
                                kind: "content_block_delta", index: event.contentIndex,
                                deltaKind: "text", delta: event.delta,
                            };
                        }
                        break;
                    case "text_end":
                        yield {
                            kind: "content_block_completed", delivery: "incremental",
                            block: { index: event.contentIndex, type: "text", format: "plain", text: event.content },
                        };
                        break;
                    case "thinking_start": {
                        // SDK 的 partial 会原地累积增量；只有明确被安全过滤的 thinking 按整块交付。
                        const existing = event.partial.content[event.contentIndex];
                        const delivery = existing?.type === "thinking" && existing.redacted === true ? "whole" : "incremental";
                        thinkingDelivery.set(event.contentIndex, delivery);
                        yield { kind: "content_block_started", index: event.contentIndex, blockType: "reasoning", delivery };
                        break;
                    }
                    case "thinking_delta":
                        if (event.delta.length > 0) {
                            yield {
                                kind: "content_block_delta", index: event.contentIndex,
                                deltaKind: "reasoning", delta: event.delta,
                            };
                        }
                        break;
                    case "thinking_end":
                        yield {
                            kind: "content_block_completed",
                            delivery: thinkingDelivery.get(event.contentIndex) ?? "incremental",
                            block: { index: event.contentIndex, type: "reasoning", text: event.content },
                        };
                        break;
                    case "toolcall_start":
                        yield {
                            kind: "content_block_started", index: event.contentIndex,
                            blockType: "tool_call", delivery: "incremental",
                        };
                        break;
                    case "toolcall_delta": {
                        if (event.delta.length === 0) break;
                        toolArguments.set(event.contentIndex, (toolArguments.get(event.contentIndex) ?? "") + event.delta);
                        yield {
                            kind: "content_block_delta", index: event.contentIndex,
                            deltaKind: "tool_arguments", delta: event.delta,
                        };
                        break;
                    }
                    case "toolcall_end": {
                        const raw = toolArguments.get(event.contentIndex);
                        verifyToolCallArguments(raw, event.toolCall);
                        yield {
                            kind: "content_block_completed", delivery: "incremental",
                            block: {
                                index: event.contentIndex, type: "tool_call",
                                callId: event.toolCall.id, toolId: event.toolCall.name,
                                argumentsJson: raw ?? argumentsJsonOf(event.toolCall.arguments),
                            },
                        };
                        break;
                    }
                    case "done":
                        completed = true;
                        yield { kind: "completed", response: this.toResponse(request, event.message, toolArguments) };
                        break;
                    case "error":
                        if (event.reason === "aborted") throw new ExecutionAbortedError();
                        {
                            const transientFailure = classifyTransientModelFailure(event.error);
                            if (transientFailure !== undefined) throw transientFailure;
                            throw new PiAiProviderError(
                                this.config.provider,
                                event.reason,
                                providerFailureMessage(this.config.provider, event.reason, event.error.errorMessage),
                            );
                        }
                    }
                }
            } catch (error) {
                primaryError = error;
            } finally {
                // 释放本次拥有的迭代器；清理异常不覆盖主失败原因，消费方提前退出同样释放。
                if (sdkIterator?.return !== undefined) {
                    try {
                        await sdkIterator.return();
                    } catch {
                        // 迭代清理失败不改变调用方的主错误。
                    }
                }
            }
            if (primaryError !== undefined) throw primaryError;

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

    private requiredToolStream(context: Context, options: StreamOptions) {
        // pi-ai 1.3.0 的 simple 选项只接受 auto/none；强制调用按模型 API 使用完整选项。
        const model = this.model;
        if (hasApi(model, "openai-completions") || hasApi(model, "openai-responses")) {
            return this.models.stream(model, context, { ...options, toolChoice: "required" });
        }
        if (hasApi(model, "anthropic-messages")) {
            return this.models.stream(model, context, { ...options, toolChoice: "any", thinkingEnabled: false });
        }
        if (hasApi(model, "google-generative-ai")) {
            return this.models.stream(model, context, { ...options, toolChoice: "any", thinking: { enabled: false } });
        }
        throw new LLMRequestModeMismatchError(`PiAiAdapter cannot require tool calls for API "${model.api}"`);
    }

    private toResponse(
        request: LLMRequest,
        response: AssistantMessage,
        rawToolArguments?: ReadonlyMap<number, string>,
    ): LLMResponse {
        const hasTools = request.tools !== undefined && request.tools.length > 0;
        if (response.stopReason === "error") {
            const transientFailure = classifyTransientModelFailure(response);
            if (transientFailure !== undefined) throw transientFailure;
        }
        if (!hasTools) {
            if (response.stopReason !== "stop" || response.content.some(block => block.type === "toolCall")) {
                // Provider messages may echo request credentials; do not copy arbitrary SDK text into Runtime errors.
                throw new PiAiProviderError(this.config.provider, response.stopReason,
                    providerFailureMessage(this.config.provider, response.stopReason, response.errorMessage));
            }
        } else {
            const validStop = response.stopReason === "stop" || response.stopReason === "toolUse";
            if (!validStop && !response.content.some(block => block.type === "toolCall")) {
                throw new PiAiProviderError(this.config.provider, response.stopReason,
                    providerFailureMessage(this.config.provider, response.stopReason, response.errorMessage));
            }
        }
        const { input, output, cacheRead, cacheWrite, reasoning } = response.usage;
        const piUsage = Object.fromEntries(Object.entries({ input, output, cacheRead, cacheWrite, reasoning })
            .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0));

        // pi-ai 内容数组顺序即真实块归属；本适配器不请求图片，未知块类型在协议边界拒绝。
        const blocks: LLMContentBlock[] = [];
        for (const block of response.content) {
            switch (block.type) {
                case "text":
                    blocks.push({ index: blocks.length, type: "text", format: "plain", text: block.text });
                    break;
                case "thinking":
                    blocks.push({ index: blocks.length, type: "reasoning", text: block.thinking });
                    break;
                case "toolCall":
                    blocks.push({
                        index: blocks.length, type: "tool_call", callId: block.id, toolId: block.name,
                        argumentsJson: rawToolArguments?.get(blocks.length)
                            ?? (typeof block.arguments === "string" ? block.arguments : argumentsJsonOf(block.arguments)),
                    });
                    break;
                default:
                    throw new PiAiProviderError(this.config.provider, response.stopReason,
                        `Provider "${this.config.provider}" returned an unsupported content block`);
            }
        }

        return {
            blocks,
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
            throw new LLMConfigurationError([], `Maximum output tokens exceed model "${this.model.id}" limit (${this.model.maxTokens})`);
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
