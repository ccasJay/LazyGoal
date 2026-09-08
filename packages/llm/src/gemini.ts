import { 
    GoogleGenAI,
    type Content,
    type GenerateContentParameters
} from "@google/genai";

import type { JsonSchema202012 } from "../../contracts/src/index";
import type { LLMAdapter } from "./core/adapter";
import {
    LLMRequestModeMismatchError,
    type LLMMessage,
    type LLMRequest,
    type LLMResponse,
    type StructuredOutputMode,
} from "./core/types";
import { extractGeminiUsage } from "./core/usage";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../runtime/src/execution-control";

type GeminiInput = Pick<
    GenerateContentParameters,
    "contents" | "config" //选择两个属性
>;

/**
 * 原生 Gemini的显式连接配置。
 * @remarks 请求的 maxOutputTokens 优先于配置默认值；不额外查询环境凭据。
 * @example
 * ```ts
 * const config: GeminiConfig = {
 *     apiKey: "secret", model: "model-id",
 *     structuredOutputMode: "strict", maxOutputTokens: 4096,
 * };
 * ```
 */
export interface GeminiConfig {
    /** Google Gen AI 服务使用的 API Key。 */
    apiKey: string;
    /** 完整 API 前缀（包含所需版本路径）；省略时使用 SDK 官方地址与默认版本。 */
    baseURL?: string;
    /** 每次生成请求使用的 Gemini 模型名称。 */
    model: string;
    /** 固定的结构化输出模式。 */
    structuredOutputMode: StructuredOutputMode;
    /** 请求未指定上限时使用的最大输出 Token。 */
    maxOutputTokens?: number;
}

/**
 * 使用 Google Gen AI SDK 调用 Gemini 的 Adapter。
 *
 * @remarks
 * system 消息合并为 `systemInstruction`，assistant 映射为 Gemini 的 model
 * 角色，其余消息保持顺序。响应没有文本内容时返回空字符串，SDK 异常原样传播。
 * 在 strict 模式下将结构 Schema 转换后映射为 `responseMimeType: "application/json"` 与 `responseSchema`；
 * 枚举补齐类型，nullable 由 SDK 转换；对象联合投影为字段并集与必填交集。
 * 联合分支约束和 additionalProperties 仍由 Agent 本地契约严格校验。
 * 在 prompt_only 模式下不传递任何原生结构 Schema 参数。
 * 若请求的结构化配置与 Adapter 固定模式不匹配，在发起网络请求前抛出 `LLMRequestModeMismatchError`。
 * 响应携带 `usageMetadata` 时将其归一化写入 `providerMetadata.usage`
 * （`{ inputTokens, outputTokens, cachedInputTokens? }`），缺失时该字段缺省。
 */
export class Gemini implements LLMAdapter {
    readonly structuredOutputMode: StructuredOutputMode;
    private readonly client: GoogleGenAI;
    private readonly model: string;
    private readonly maxOutputTokens: number | undefined;

    /** @param config - Google API Key、Gemini 模型名称与固定的结构化输出模式。 */
    constructor(config: GeminiConfig) {
        this.structuredOutputMode = config.structuredOutputMode;
        this.client = new GoogleGenAI({
            apiKey: config.apiKey,
            ...(config.baseURL === undefined ? {} : {
                httpOptions: { baseUrl: config.baseURL, apiVersion: "" },
            }),
        });
        this.model = config.model;
        this.maxOutputTokens = config.maxOutputTokens;
    }

    /**
     * @param request - 供应商无关的消息请求。
     * @param control - 当前 Goal 推进调用共享的中止控制。
     * @returns Gemini 响应中的文本内容。
     * @throws Google Gen AI SDK 暴露的网络、鉴权、限流或协议异常；中止时抛出
     *   `ExecutionAbortedError`；请求参数模式不匹配时抛出 `LLMRequestModeMismatchError`。
     */
    async generate(
        request: LLMRequest,
        control?: ExecutionControl,
    ): Promise<LLMResponse> {
        throwIfAborted(control);

        if (this.structuredOutputMode === "strict") {
            if (request.structuredOutput === undefined) {
                throw new LLMRequestModeMismatchError(
                    "Gemini adapter is configured with 'strict' mode, but LLMRequest does not provide structuredOutput",
                );
            }
        } else if (this.structuredOutputMode === "prompt_only") {
            if (request.structuredOutput !== undefined) {
                throw new LLMRequestModeMismatchError(
                    "Gemini adapter is configured with 'prompt_only' mode, but LLMRequest provides structuredOutput",
                );
            }
        }

        const input = toGeminiInput(request.messages, request.maxOutputTokens ?? this.maxOutputTokens);

        if (this.structuredOutputMode === "strict" && request.structuredOutput !== undefined) {
            input.config = {
                ...input.config,
                responseMimeType: "application/json",
                responseSchema: prepareGeminiSchema(request.structuredOutput.schema),
            };
        }

        if (control?.signal !== undefined) {
            input.config = {
                ...input.config,
                abortSignal: control.signal,
            };
        }

        try {
            const response = await this.client.models.generateContent({
                model: this.model,
                ...input,
            });
            throwIfAborted(control);
            const usage = extractGeminiUsage(response.usageMetadata);

            return {
                content: response.text ?? "",
                providerMetadata: {
                    model: this.model,
                    ...(usage !== undefined ? { usage } : {}),
                },
            };
        } catch (error) {
            if (isExecutionAbortedError(error)) {
                throw error;
            }

            if (control?.signal?.aborted) {
                throw new ExecutionAbortedError();
            }

            throw error;
        }
    }
}



/** 将统一消息转换为 Gemini contents 与可选 systemInstruction。 */
function toGeminiInput(
    messages: readonly LLMMessage[],
    maxOutputTokens?: number,
): GeminiInput {
    const systemInstruction: string[] = [];
    const contents: Content[] = [];

    for (const msg of messages) {
        switch (msg.role) {
            case "system": 
                systemInstruction.push(msg.content);
                break;
            case "user":
                contents.push({
                    role: "user",
                    parts: [{text: msg.content}],
                });
                break;
            case "assistant":
                contents.push({
                    role: "model",
                    parts: [{text: msg.content}],
                });
                break;
        }
    }

    const input: GeminiInput = {
        contents,
    };

    if (systemInstruction.length > 0) {
        input.config = {
            systemInstruction: systemInstruction.join("\n"),
        };
    }
    if (maxOutputTokens !== undefined) {
        input.config = {
            ...input.config,
            maxOutputTokens,
        };
    }
    return input;
}

/** 投影为 Gemini 支持的结构约束；SDK 完成原生类型序列化，本地契约保持不变。 */
function prepareGeminiSchema(schema: JsonSchema202012): JsonSchema202012 {
    const result = { ...schema };
    if (Array.isArray(schema.enum)) {
        const values = schema.enum;
        if (values.every(value => typeof value === "string")) {
            result.type = "string";
        } else if (values.every(value => typeof value === "number")) {
            // 数值 literal 保持数值语义，不转成字符串枚举。
            const branches = values.map(value => ({
                type: Number.isInteger(value) ? "integer" : "number",
                minimum: value, maximum: value,
            }));
            delete result.enum;
            if (branches.length === 1) Object.assign(result, branches[0]);
            else result.anyOf = branches;
        } else {
            throw new Error("Gemini responseSchema only supports string or numeric enums");
        }
    }
    if (schema.properties !== undefined) {
        result.properties = Object.fromEntries(Object.entries(schema.properties as Record<string, JsonSchema202012>).map(([key, value]) =>
            [key, prepareGeminiSchema(value as JsonSchema202012)]));
    }
    if (schema.items !== undefined) result.items = prepareGeminiSchema(schema.items as JsonSchema202012);
    if (Array.isArray(schema.anyOf)) {
        delete result.anyOf;
        Object.assign(result, mergeGeminiUnion(schema.anyOf.map(value => prepareGeminiSchema(value as JsonSchema202012))));
    }
    return result;
}

/** 对象联合投影为字段并集与必填交集；分支互斥和专属约束仍由本地契约校验。 */
function mergeGeminiUnion(branches: readonly JsonSchema202012[]): JsonSchema202012 {
    const nullable = branches.some(branch => branch.type === "null" || branch.nullable === true);
    const values = [...new Map(branches.filter(branch => branch.type !== "null")
        .map(branch => [JSON.stringify(branch), branch])).values()];
    if (values.length === 0) return { type: "null" };
    const withNullability = (schema: JsonSchema202012): JsonSchema202012 =>
        nullable ? { ...schema, nullable: true } : schema;
    if (values.length === 1) return withNullability(values[0]!);
    if (values.every(branch => branch.type === "object")) {
        const properties = values.map(branch => branch.properties as Record<string, JsonSchema202012>);
        const keys = [...new Set(properties.flatMap(Object.keys))];
        const required = (values[0]!.required as readonly string[]).filter(key =>
            values.every(branch => (branch.required as readonly string[]).includes(key)));
        const discriminator = required.find(key => properties.every(shape =>
            Array.isArray(shape[key]?.enum) && shape[key]!.enum!.length === 1));
        const description = discriminator === undefined ? undefined
            : "Return exactly one variant, including every listed property and no properties from other variants. "
                + values.map((branch, index) =>
                    `${discriminator}=${JSON.stringify(properties[index]![discriminator]!.enum![0])}: ${JSON.stringify(branch.required)}`,
                    `${discriminator}=${JSON.stringify((properties[index]![discriminator]!.enum as readonly unknown[])[0])}: ${JSON.stringify(branch.required)}`,
                ).join("; ");
        return withNullability({
            type: "object",
            ...(description === undefined ? {} : { description }),
            properties: Object.fromEntries(keys.map(key => [key, mergeGeminiUnion(
                properties.flatMap(shape => shape[key] === undefined ? [] : [shape[key]!]),
            )])),
            required,
        });
    }
    if (values.every(branch => branch.type === "string")) {
        return withNullability({
            type: "string",
            ...(values.every(branch => Array.isArray(branch.enum))
                ? { enum: [...new Set(values.flatMap(branch => branch.enum as readonly string[]))] }
                : {}),
        });
    }
    return withNullability({ anyOf: values });
}
