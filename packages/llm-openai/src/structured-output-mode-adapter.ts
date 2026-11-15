import {
    LLMRequestModeMismatchError,
    type LLMRequest,
    type LLMResponse,
    type LLMStreamEvent,
    type StructuredOutputMode,
} from "../../llm-core/src/index";
import type { ExecutionControl } from "../../execution-control/src/index";
import { OpenAICompatible } from "./openai-compatible";

/**
 * 为尚未迁移的 Chat Completions 调用保留配置固定的输出模式。
 *
 * @remarks
 * Goal 的 OpenAI-compatible 路径直接使用无模式的 {@link OpenAICompatible}。此类只把
 * 未迁移入口的旧配置转换为每次请求的生成约束，再复用同一个请求和流式实现。
 *
 * @example
 * ```ts
 * const adapter = new StructuredOutputModeOpenAICompatible({
 *   apiKey: "secret", baseURL: "https://api.openai.com/v1", model: "model",
 * }, "strict");
 * ```
 */
export class StructuredOutputModeOpenAICompatible extends OpenAICompatible {
    /** 该独立入口使用的结构化输出配置。 */
    readonly structuredOutputMode: StructuredOutputMode;

    /**
     * @param config - Chat Completions 连接。
     * @param structuredOutputMode - 此入口使用的输出配置。
     */
    constructor(
        config: ConstructorParameters<typeof OpenAICompatible>[0],
        structuredOutputMode: StructuredOutputMode,
    ) {
        super(config);
        this.structuredOutputMode = structuredOutputMode;
    }

    override async generate(request: LLMRequest, control?: ExecutionControl): Promise<LLMResponse> {
        return super.generate(this.prepareRequest(request), control);
    }

    override async *stream(request: LLMRequest, control?: ExecutionControl): AsyncIterable<LLMStreamEvent> {
        for await (const event of super.stream(this.prepareRequest(request), control)) yield event;
    }

    private prepareRequest(request: LLMRequest): LLMRequest {
        const hasTools = (request.tools?.length ?? 0) > 0;
        if (!hasTools && this.structuredOutputMode === "strict" && request.structuredOutput === undefined) {
            throw new LLMRequestModeMismatchError(
                "OpenAICompatible adapter is configured with 'strict' mode, but LLMRequest does not provide structuredOutput",
            );
        }
        if (this.structuredOutputMode === "prompt_only" && request.structuredOutput !== undefined) {
            throw new LLMRequestModeMismatchError(
                "OpenAICompatible adapter is configured with 'prompt_only' mode, but LLMRequest provides structuredOutput",
            );
        }
        return {
            ...request,
            ...(hasTools ? {
                toolChoice: request.toolChoice ?? "required",
                toolArgumentConstraint: "strict" as const,
                parallelToolCalls: false,
            } : {}),
            includeUsage: true,
        };
    }
}
