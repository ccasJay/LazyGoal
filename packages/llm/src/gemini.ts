import { 
    GoogleGenAI,
    type Content,
    type GenerateContentParameters
} from "@google/genai";

import type { LLMAdapter } from "./core/adapter";
import type { LLMMessage, LLMRequest ,LLMResponse } from "./core/types";
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

/** Gemini Adapter 的连接配置。 */
export interface GeminiConfig {
    /** Google Gen AI 服务使用的 API Key。 */
    apiKey: string;
    /** 每次生成请求使用的 Gemini 模型名称。 */
    model: string;
}

/**
 * 使用 Google Gen AI SDK 调用 Gemini 的 Adapter。
 *
 * @remarks
 * system 消息合并为 `systemInstruction`，assistant 映射为 Gemini 的 model
 * 角色，其余消息保持顺序。响应没有文本内容时返回空字符串，SDK 异常原样传播。
 */
export class Gemini implements LLMAdapter {
    private readonly client: GoogleGenAI;
    private readonly model: string;

    /** @param config - Google API Key 与 Gemini 模型名称。 */
    constructor(config: GeminiConfig) {
        this.client = new GoogleGenAI({
            apiKey: config.apiKey,
        });
        this.model = config.model;
    }

    /**
     * @param request - 供应商无关的消息请求。
     * @param control - 当前 Goal 推进调用共享的中止控制。
     * @returns Gemini 响应中的文本内容。
     * @throws Google Gen AI SDK 暴露的网络、鉴权、限流或协议异常；中止时抛出
     *   `ExecutionAbortedError`。
     */
    async generate(
        request: LLMRequest,
        control?: ExecutionControl,
    ): Promise<LLMResponse> {
        throwIfAborted(control);
        const input = toGeminiInput(request.messages);

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

            return {
                content: response.text ?? "",
                providerMetadata: { model: this.model },
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
function toGeminiInput(messages: LLMMessage[]): GeminiInput {
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
    return input;
}
