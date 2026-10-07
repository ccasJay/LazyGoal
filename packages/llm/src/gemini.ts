import {
    isModelAssistantMessage,
    sameNativeIdentity,
    type NativeConversationIdentity,
    type GeminiContinuationPart,
} from "../../model-contracts/src/index";
import { randomUUID } from "node:crypto";
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
    type LLMToolCall,
    type StructuredOutputMode,
} from "./core/types";
import { extractGeminiUsage } from "./core/usage";
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "../../runtime/src/execution-control";
import { classifyTransientModelFailure } from "./core/model-request-failure";

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

const GEMINI_NULL_SENTINEL = "__lazygoal_null__";
const GEMINI_ABSENT_SENTINEL = "__lazygoal_absent__";

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
 * 中；缺失或非标准值写为 `undefined`。
 *
 * @example
 * ```ts
 * const adapter = new Gemini({
 *     apiKey: "secret", model: "model-id", structuredOutputMode: "strict",
 * });
 * const response = await adapter.generate({
 *     messages: [{ role: "user", content: "hello" }],
 * });
 * ```
 */
export class Gemini implements LLMAdapter {
    readonly structuredOutputMode: StructuredOutputMode;
    /** 同一 Gemini 端点和模型的原生回放身份。 */
    readonly nativeConversationIdentity: NativeConversationIdentity;
    private readonly client: GoogleGenAI;
    private readonly model: string;
    private readonly maxOutputTokens: number | undefined;

    constructor(config: GeminiConfig) {
        this.structuredOutputMode = config.structuredOutputMode;
        this.nativeConversationIdentity = {
            provider: "google", endpoint: (config.baseURL ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, ""),
            model: config.model, protocol: "gemini-content",
        };
        this.client = new GoogleGenAI({
            apiKey: config.apiKey,
            httpOptions: { retryOptions: { attempts: 1 } },
            ...(config.baseURL !== undefined ? { httpOptions: { baseUrl: config.baseURL, apiVersion: "", retryOptions: { attempts: 1 } } } : {}),
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
        if (request.tools === undefined && this.structuredOutputMode === "strict") {
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

        const input = toGeminiInput(request.messages, this.nativeConversationIdentity, request.maxOutputTokens ?? this.maxOutputTokens);

        if ((this.structuredOutputMode === "strict" || this.structuredOutputMode === "two_stage") && request.structuredOutput !== undefined && !request.tools?.length) {
            input.config = {
                ...input.config,
                responseMimeType: "application/json",
                responseSchema: prepareGeminiSchema(request.structuredOutput.schema),
            };
        }

        if (request.tools !== undefined && request.tools.length > 0) {
            input.config = {
                ...input.config,
                tools: [{
                    functionDeclarations: request.tools.map(t => ({
                        name: t.id,
                        description: t.description,
                        parameters: prepareGeminiSchema(t.parametersSchema as unknown as JsonSchema202012),
                    })),
                }],
                toolConfig: {
                    functionCallingConfig: {
                        mode: (request.toolChoice === "required"
                            ? "ANY"
                            : request.toolChoice === "none"
                            ? "NONE"
                            : "AUTO") as any,
                    },
                },
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

            const candidate = response.candidates?.[0];
            const textParts: string[] = [];
            const reasoningParts: string[] = [];
            const toolCalls: LLMToolCall[] = [];

            if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (typeof part.text === "string" && part.text.length > 0) {
                        (part.thought === true ? reasoningParts : textParts).push(part.text);
                    }
                    if (part.functionCall) {
                        toolCalls.push({
                            callId: (part.functionCall as any).id ?? `call_${randomUUID()}`,
                            toolId: part.functionCall.name ?? "",
                            argumentsJson: JSON.stringify(part.functionCall.args ?? {}),
                        });
                    }
                }
            }

            const rawContent = textParts.length > 0
                ? textParts.join("\n").trim()
                : (toolCalls.length > 0 || candidate?.content?.parts !== undefined ? "" : (response.text ?? ""));
            const content = (this.structuredOutputMode === "strict" || this.structuredOutputMode === "two_stage") && request.structuredOutput !== undefined && !request.tools?.length
                ? restoreGeminiResponseProjection(rawContent, request.structuredOutput.schema)
                : rawContent;

            const continuation = {
                identity: this.nativeConversationIdentity,
                parts: structuredClone(candidate?.content?.parts ?? []) as readonly GeminiContinuationPart[],
            };
            const message = {
                role: "assistant" as const, content,
                ...(reasoningParts.length === 0 ? {} : { reasoning: reasoningParts.join("\n") }),
                ...(toolCalls.length > 0 ? { toolCalls } : {}), continuation,
            };
            if (toolCalls.length <= 1 && !isModelAssistantMessage(message)) {
                throw new LLMRequestModeMismatchError("Unsupported Gemini response parts for native text/tool history");
            }
            return {
                ...message,
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

            const transientFailure = classifyTransientModelFailure(error);
            if (transientFailure !== undefined) throw transientFailure;

            throw error;
        }
    }
}



/** 将统一消息转换为 Gemini contents 与可选 systemInstruction。 */
function toGeminiInput(
    messages: readonly LLMMessage[],
    identity: NativeConversationIdentity,
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
                if (msg.continuation !== undefined && !sameNativeIdentity(msg.continuation.identity, identity)) {
                    throw new LLMRequestModeMismatchError("Native history belongs to another provider, endpoint, model or protocol");
                }
                contents.push({
                    role: "model",
                    parts: msg.continuation?.parts !== undefined
                        ? structuredClone(msg.continuation.parts) as NonNullable<Content["parts"]>
                        : [{ text: msg.content }],
                });
                break;
            case "tool": {
                const previous = contents.at(-1)?.parts?.find(part => part.functionCall?.name === msg.toolId)?.functionCall;
                contents.push({ role: "user", parts: [{ functionResponse: {
                    name: msg.toolId, ...(previous?.id === undefined ? {} : { id: previous.id }),
                    response: JSON.parse(msg.content) as Record<string, unknown>,
                } }] });
                break;
            }
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
function prepareGeminiSchema(
    schema: JsonSchema202012,
    path: readonly string[] = [],
): JsonSchema202012 {
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
            [key, prepareGeminiSchema(value as JsonSchema202012, [...path, "properties", key])]));
    }
    if (schema.items !== undefined) {
        result.items = prepareGeminiSchema(schema.items as JsonSchema202012, [...path, "items"]);
    }
    if (Array.isArray(schema.anyOf)) {
        delete result.anyOf;
        Object.assign(result, mergeGeminiUnion(
            schema.anyOf.map(value => prepareGeminiSchema(value as JsonSchema202012, path)),
            path,
        ));
    }
    return result;
}

/** 将 Google provider projection 的省略字段和占位值逆向归一为 Wire 结构。 */
function restoreGeminiResponseProjection(content: string, schema: JsonSchema202012): string {
    let value: unknown;
    try {
        value = JSON.parse(content);
    } catch {
        return content;
    }

    if (isJsonObject(value) && isJsonObject(value.result)) {
        const result = value.result;

        // 1. 若具有有效的 action 对象，确认为 tool_call，清理非当前分支的字段
        if (result.action !== undefined && result.action !== null && typeof result.action === "object") {
            result.kind = "tool_call";
            delete result.type;
        } else if (result.action === null || result.action === undefined) {
            delete result.action;
            if (result.kind === "tool_call" && typeof result.summary === "string") {
                result.kind = "complete";
            }
        }

        // 2. 根据确定或纠正后的 kind 清理多余跨分支字段与哨兵值
        if (result.kind !== "complete") {
            if (result.completionEvidence === GEMINI_ABSENT_SENTINEL || result.completionEvidence === null) {
                delete result.completionEvidence;
            }
            delete result.evidenceSequences;
            delete result.summary;
        } else if (result.completionEvidence === GEMINI_ABSENT_SENTINEL) {
            delete result.completionEvidence;
        }
        if (result.kind !== "tool_call") {
            delete result.action;
        }
        if (result.kind !== "wait") {
            delete result.reason;
        }
        if (result.kind !== "fail") {
            delete result.error;
        }
        if (result.kind !== "context_lookup") {
            delete result.need;
            delete result.question;
            delete result.filters;
        }
        if (result.kind !== "ask_user") {
            delete result.questions;
        }
        if (result.kind !== "task_proposal") {
            delete result.task;
        }
        if (result.kind !== "request_think") {
            delete result.goal;
        }
    }

    restoreGeminiProjectedValue(value, schema);
    return JSON.stringify(value);
}

/** 只沿唯一匹配的 Wire 联合分支恢复 nullable 字段和紧凑 completion evidence。 */
function restoreGeminiProjectedValue(value: unknown, schema: JsonSchema202012): boolean {
    if (Array.isArray(schema.anyOf)) {
        const matches = schema.anyOf.filter(branch => matchesKnownSchemaShape(value, branch as JsonSchema202012));
        return matches.length === 1
            ? restoreGeminiProjectedValue(value, matches[0] as JsonSchema202012)
            : false;
    }
    if (schema.type === "array" && Array.isArray(value) && schema.items !== undefined) {
        return value.reduce((changed, item) =>
            restoreGeminiProjectedValue(item, schema.items as JsonSchema202012) || changed, false);
    }
    if (schema.type !== "object" || !isJsonObject(value) || schema.properties === undefined) return false;

    const properties = schema.properties as Record<string, JsonSchema202012>;
    const required = new Set(Array.isArray(schema.required) ? schema.required as readonly string[] : []);
    let changed = false;
    for (const key of Object.keys(value)) {
        if (!(key in properties) && key === "completionEvidence" && value[key] === GEMINI_ABSENT_SENTINEL) {
            delete value[key];
            changed = true;
        }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
        if (!(key in value)) {
            if (required.has(key) && schemaAllowsNull(propertySchema)) {
                value[key] = null;
                changed = true;
            }
            continue;
        }
        if (value[key] === GEMINI_NULL_SENTINEL && schemaAllowsNull(propertySchema)) {
            value[key] = null;
            changed = true;
            continue;
        }
        if (key === "completionEvidence" && propertySchema.type === "array" && typeof value[key] === "string") {
            const parsed = parseGeminiCompletionEvidence(value[key]);
            if (parsed !== undefined) {
                value[key] = parsed;
                changed = true;
                continue;
            }
        }
        changed = restoreGeminiProjectedValue(value[key], propertySchema) || changed;
    }
    return changed;
}

/** 用响应中已存在的字段选择联合分支，不把缺失必填字段视为匹配失败。 */
function matchesKnownSchemaShape(value: unknown, schema: JsonSchema202012): boolean {
    if (value === GEMINI_NULL_SENTINEL && schemaAllowsNull(schema)) return true;
    if (schema.nullable === true && value === null) return true;
    if (Array.isArray(schema.anyOf)) {
        return schema.anyOf.some(branch => matchesKnownSchemaShape(value, branch as JsonSchema202012));
    }
    if (Array.isArray(schema.enum) && !schema.enum.some(candidate => Object.is(candidate, value))) return false;
    switch (schema.type) {
        case "null": return value === null;
        case "string": return typeof value === "string";
        case "boolean": return typeof value === "boolean";
        case "integer": return typeof value === "number" && Number.isInteger(value);
        case "number": return typeof value === "number" && Number.isFinite(value);
        case "array":
            return Array.isArray(value) && (schema.items === undefined
                || value.every(item => matchesKnownSchemaShape(item, schema.items as JsonSchema202012)));
        case "object": {
            if (!isJsonObject(value) || schema.properties === undefined) return false;
            const properties = schema.properties as Record<string, JsonSchema202012>;
            if (schema.additionalProperties === false && Object.keys(value).some(key =>
                !(key in properties) && !(key === "completionEvidence" && value[key] === GEMINI_ABSENT_SENTINEL))) return false;
            return Object.entries(value).every(([key, propertyValue]) =>
                properties[key] === undefined
                    || (key === "completionEvidence"
                        && properties[key]!.type === "array"
                        && parseGeminiCompletionEvidence(propertyValue) !== undefined)
                    || matchesKnownSchemaShape(propertyValue, properties[key]!));
        }
        default:
            return true;
    }
}

function parseGeminiCompletionEvidence(
    value: unknown,
): readonly { criterionIndex: number; evidenceSequences: readonly number[] }[] | undefined {
    if (typeof value !== "string" || value.length === 0 || value === GEMINI_ABSENT_SENTINEL) return undefined;

    const seenCriteria = new Set<number>();
    const evidence: { criterionIndex: number; evidenceSequences: readonly number[] }[] = [];
    for (const segment of value.split(";")) {
        const fields = segment.split(":");
        if (fields.length !== 2) return undefined;
        const criterionIndex = parseGeminiSafeInteger(fields[0]!);
        if (criterionIndex === undefined || seenCriteria.has(criterionIndex)) return undefined;

        const sequenceValues = fields[1]!.split(",");
        if (sequenceValues.length === 0 || sequenceValues.some(sequence => sequence.length === 0)) return undefined;
        const evidenceSequences: number[] = [];
        for (const sequence of sequenceValues) {
            const parsed = parseGeminiSafeInteger(sequence);
            if (parsed === undefined) return undefined;
            evidenceSequences.push(parsed);
        }

        seenCriteria.add(criterionIndex);
        evidence.push({ criterionIndex, evidenceSequences });
    }
    return evidence.length === 0 ? undefined : evidence;
}

function parseGeminiSafeInteger(value: string): number | undefined {
    if (!/^(?:0|[1-9][0-9]*)$/.test(value)) return undefined;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function schemaAllowsNull(schema: JsonSchema202012): boolean {
    return schema.type === "null"
        || schema.nullable === true
        || (Array.isArray(schema.anyOf)
            && schema.anyOf.some(branch => schemaAllowsNull(branch as JsonSchema202012)));
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 合并决策判别联合，转换 nullable，并保持内部对象联合的独立分支。 */
function mergeGeminiUnion(
    branches: readonly JsonSchema202012[],
    path: readonly string[],
): JsonSchema202012 {
    const nullable = branches.some(branch => branch.type === "null" || branch.nullable === true);
    const values = [...new Map(branches.filter(branch => branch.type !== "null")
        .map(branch => [JSON.stringify(branch), branch])).values()];
    if (values.length === 0) return { type: "null" };
    const withNullability = (schema: JsonSchema202012): JsonSchema202012 =>
        nullable ? { ...schema, nullable: true } : schema;
    if (values.length === 1) return withNullability(values[0]!);

    if (values.every(branch => branch.type === "object")) {
        const properties = values.map(branch => branch.properties as Record<string, JsonSchema202012>);
        const requiredByBranch = values.map(branch => branch.required as readonly string[]);
        const required = requiredByBranch[0]!.filter(key =>
            requiredByBranch.every(branchRequired => branchRequired.includes(key)));
        const discriminator = required.find(key => properties.every(shape =>
            Array.isArray(shape[key]?.enum) && shape[key]!.enum!.length === 1));
        const mayFlatten = path.join(".") === "properties.result"
            || path.join(".") === "properties.result.properties.action";

        if (mayFlatten && discriminator !== undefined) {
            const keys = [...new Set(properties.flatMap(Object.keys))];
            const discriminatorValues = properties.map(shape =>
                (shape[discriminator]!.enum as readonly unknown[])[0]);
            const description = "Return one selected variant. Branch-specific properties are required only for the discriminator values listed below. "
                + values.map((branch, index) =>
                    `${discriminator}=${JSON.stringify(discriminatorValues[index])}: ${JSON.stringify(branch.required)}`,
                ).join("; ");
            return withNullability({
                type: "object",
                description,
                properties: Object.fromEntries(keys.map(key => {
                    let merged = mergeGeminiUnion(
                        properties.flatMap(shape => shape[key] === undefined ? [] : [shape[key]!]),
                        [...path, "properties", key],
                    );
                    const requiredWhen = [...new Set(values.flatMap((_, index) =>
                        requiredByBranch[index]!.includes(key) ? [discriminatorValues[index]] : []))];
                    if (
                        path.join(".") === "properties.result"
                        && ["summary", "reason", "question", "error"].includes(key)
                        && merged.type === "string"
                    ) {
                        merged = { ...merged, maxLength: "2000" };
                    }
                    if (path.join(".") === "properties.result" && key === "summary") {
                        merged = {
                            ...merged,
                            type: "string",
                            maxLength: "2000",
                            nullable: true,
                            description: 'Required. If kind="complete", provide the task completion summary. For any other kind, return null.',
                        };
                        delete (merged as any).enum;
                    }
                    if (path.join(".") === "properties.result" && key === "action") {
                        merged = {
                            ...merged,
                            nullable: true,
                            description: 'Required. If kind="tool_call", provide the tool action object. For any other kind, return null.',
                        };
                    }
                    if (path.join(".") === "properties.result" && ["reason", "error", "need", "question", "filters"].includes(key)) {
                        merged = {
                            ...merged,
                            nullable: true,
                        };
                    }
                    if (path.join(".") === "properties.result" && key === "kind" && discriminatorValues.includes("tool_call")) {
                        merged = {
                            ...merged,
                            description: "Select exactly one result shape: kind=\"tool_call\" requires action and completionEvidence=\"__lazygoal_absent__\" and forbids summary, reason, and error; kind=\"complete\" requires summary and compact completionEvidence and forbids action; kind=\"wait\" requires reason and completionEvidence=\"__lazygoal_absent__\" and forbids action, summary, and error; kind=\"fail\" requires error and completionEvidence=\"__lazygoal_absent__\" and forbids action, summary, and reason; kind=\"context_lookup\" requires need, question, filters, and completionEvidence=\"__lazygoal_absent__\".",
                        };
                    }
                    if (path.join(".") === "properties.result" && key === "memoryPatch") {
                        merged = {
                            type: "string",
                            enum: [GEMINI_NULL_SENTINEL],
                            nullable: true,
                            description: "Required. Return null. Google strict output does not emit Working Memory updates.",
                        };
                    }
                    if (path.join(".") === "properties.result" && key === "completionEvidence") {
                        merged = {
                            type: "string",
                            description: "For kind=\"complete\", use <criterionIndex>:<sequence>[,<sequence>][;<criterionIndex>:...] (for example, 0:96), with at least one committed observation sequence for every criterion. For every other kind, return __lazygoal_absent__.",
                        };
                    }
                    if (path.join(".") === "properties.result" && key === "completionEvidence") {
                        return [key, merged];
                    }
                    if (requiredWhen.length === 0 || required.includes(key)) return [key, merged];
                    return [key, {
                        ...merged,
                        description: `Required when ${discriminator} is ${requiredWhen.map(value => JSON.stringify(value)).join(" or ")}.`
                            + (schemaAllowsNull(merged) ? " Return null when no value is needed." : "")
                            + (key === "memoryPatch" ? " Google strict output does not emit Working Memory updates." : ""),
                    }];
                })),
                required: path.join(".") === "properties.result"
                    ? [...new Set([...required, "action", "summary", "completionEvidence", "memoryPatch"].filter(k => keys.includes(k)))]
                    : required,
            });
        }
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
