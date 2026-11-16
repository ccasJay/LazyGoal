import {
    LLMRequestModeMismatchError,
    sameNativeIdentity,
    type GeminiContinuationPart,
    type LLMMessage,
    type LLMRequest,
    type LLMToolDefinition,
    type NativeConversationIdentity,
} from "../../llm-core/src/index";
import { prepareGeminiSchema, toGeminiWireSchema } from "./schema";
import type { JsonSchema202012 } from "../../contracts/src/index";

/** GenerateContent 请求中的单个 Part；只承载文本、thought、函数调用与函数响应。 */
export type GenerateContentPart =
    | { readonly text: string; readonly thought?: undefined }
    | { readonly text: string; readonly thought: true; readonly thoughtSignature?: string }
    | { readonly functionCall: { readonly id?: string; readonly name: string; readonly args?: Record<string, unknown> }; readonly thoughtSignature?: string }
    | { readonly functionResponse: { readonly name: string; readonly id?: string; readonly response: Record<string, unknown> } };

/** 按 Gemini 角色编码的请求内容。 */
export interface GenerateContentContent {
    readonly role: "user" | "model";
    readonly parts: readonly GenerateContentPart[];
}

/** GenerateContent 请求体；只包含本次请求实际声明的字段。 */
export interface GenerateContentRequestBody {
    readonly contents: readonly GenerateContentContent[];
    readonly systemInstruction?: { readonly role: "user"; readonly parts: readonly [{ readonly text: string }] };
    readonly tools?: readonly [{ readonly functionDeclarations: readonly { readonly name: string; readonly description: string; readonly parameters: Record<string, unknown> }[] }];
    readonly toolConfig?: { readonly functionCallingConfig: { readonly mode: "AUTO" | "ANY" | "NONE" } };
    readonly generationConfig?: {
        readonly maxOutputTokens?: number;
        readonly responseMimeType?: string;
        readonly responseSchema?: Record<string, unknown>;
    };
}

/** 构造 GenerateContent 请求所需的供应商无关事实。 */
export interface GenerateContentRequestOptions {
    /** 请求使用的模型标识。 */
    readonly model: string;
    /** 请求未声明输出上限时使用的默认值。 */
    readonly maxOutputTokens?: number;
    /** 历史回放的原生对话身份。 */
    readonly identity: NativeConversationIdentity;
}

/**
 * 构造非流式与流式共用的 GenerateContent 请求体。
 *
 * @remarks
 * system 消息合并为 `systemInstruction` 且必须位于最前；assistant 历史只在身份一致时
 * 按原生续接 Parts 回放，没有续接载荷时回放纯文本。携带工具时省略结构化 Schema。
 * ctx 结构化输出的 Schema 先经本地投影再大写化为线格式。
 *
 * @param request - 供应商无关的生成请求。
 * @param options - 模型、历史身份与输出上限事实。
 * @returns 可直接序列化的请求体。
 * @throws LLMRequestModeMismatchError 续接身份不一致、system 顺序不合法或未知消息形状时抛出。
 *
 * @example
 * ```ts
 * const body = buildGenerateContentRequest(request, { model: "gemini-2.5-flash", identity });
 * ```
 */
export function buildGenerateContentRequest(
    request: LLMRequest,
    options: GenerateContentRequestOptions,
): GenerateContentRequestBody {
    const systemInstruction: string[] = [];
    const contents = toGenerateContents(request.messages, options.identity, systemInstruction);
    const maxOutputTokens = request.maxOutputTokens ?? options.maxOutputTokens;
    const hasTools = request.tools !== undefined && request.tools.length > 0;
    const structuredProjection = request.structuredOutput !== undefined && !hasTools;

    const body: GenerateContentRequestBody = {
        contents,
        ...(systemInstruction.length === 0 ? {} : {
            systemInstruction: {
                role: "user" as const,
                parts: [{ text: systemInstruction.join("\n") }] as [{ text: string }],
            },
        }),
        ...(() => {
            const generationConfig: { -readonly [K in keyof NonNullable<GenerateContentRequestBody["generationConfig"]>]: NonNullable<GenerateContentRequestBody["generationConfig"]>[K] } = {
                ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
            };
            if (structuredProjection) {
                generationConfig.responseMimeType = "application/json";
                generationConfig.responseSchema = toGeminiWireSchema(
                    prepareGeminiSchema(request.structuredOutput!.schema),
                );
            }
            return Object.keys(generationConfig).length === 0 ? {} : { generationConfig };
    })(),
    ...(hasTools ? toToolFields(request) : {}),
    };
    return body;
}

function toToolFields(request: LLMRequest): Pick<GenerateContentRequestBody, "tools" | "toolConfig"> {
    const declared = request.toolChoice ?? "auto";
    return {
        tools: [{
            functionDeclarations: (request.tools ?? []).map((tool: LLMToolDefinition) => ({
                name: tool.id,
                description: tool.description,
                parameters: toGeminiWireSchema(prepareGeminiSchema(tool.parametersSchema as unknown as JsonSchema202012)),
            })),
        }],
        toolConfig: {
            functionCallingConfig: {
                mode: declared === "required" ? "ANY" : declared === "none" ? "NONE" : "AUTO",
            },
        },
    };
}

/**
 * 将统一消息按原顺序转换为 GenerateContent contents。
 *
 * @remarks
 * tool 结果映射为同一条 user 内容里的 `functionResponse`，并向前配对同名 functionCall
 * 的调用身份；assistant 消息在续接身份不一致时失败。
 *
 * @param messages - 按消费顺序排列的模型消息。
 * @param identity - 本次连接的原生对话身份。
 * @param systemInstruction - 输出参数；收集按序出现的 system 文本。
 * @returns Gemini 角色内容序列。
 * @throws LLMRequestModeMismatchError 续接身份不一致或 system 顺序不合法时抛出。
 *
 * @example
 * ```ts
 * const system: string[] = [];
 * const contents = toGenerateContents(request.messages, identity, system);
 * ```
 */
export function toGenerateContents(
    messages: readonly LLMMessage[],
    identity: NativeConversationIdentity,
    systemInstruction: string[] = [],
): GenerateContentContent[] {
    const contents: GenerateContentContent[] = [];
    for (const message of messages) {
        switch (message.role) {
            case "system":
                if (contents.length > 0) {
                    throw new LLMRequestModeMismatchError("System messages must precede conversation messages");
                }
                systemInstruction.push(message.content);
                break;
            case "user":
                contents.push({ role: "user", parts: [{ text: message.content }] });
                break;
            case "assistant": {
                if (message.continuation !== undefined && !sameNativeIdentity(message.continuation.identity, identity)) {
                    throw new LLMRequestModeMismatchError("Native history belongs to another provider, endpoint, model or protocol");
                }
                contents.push({
                    role: "model",
                    parts: message.continuation?.parts !== undefined
                        ? message.continuation.parts.map(part => structuredClone(part)) as GenerateContentPart[]
                        : [{ text: readAssistantText(message) }],
                });
                break;
            }
            case "tool": {
                const previous = contents.at(-1)?.parts.find(part => "functionCall" in part && part.functionCall?.name === message.toolId);
                contents.push({
                    role: "user",
                    parts: [{ functionResponse: toFunctionResponse(message, previous) }],
                });
                break;
            }
        }
    }
    return contents;
}

function toFunctionResponse(
    message: Extract<LLMMessage, { readonly role: "tool" }>,
    previousCall: GenerateContentPart | undefined,
): { readonly name: string; readonly id?: string; readonly response: Record<string, unknown> } {
    return {
        name: message.toolId,
        ...(previousCall !== undefined && "functionCall" in previousCall && previousCall.functionCall.id !== undefined
            ? { id: previousCall.functionCall.id }
            : {}),
        response: JSON.parse(message.content) as Record<string, unknown>,
    };
}

function readAssistantText(message: Extract<LLMMessage, { readonly role: "assistant" }>): string {
    if ("blocks" in message) {
        return message.blocks.flatMap(block => block.type === "text" ? [block.text] : []).join("");
    }
    return message.content;
}
