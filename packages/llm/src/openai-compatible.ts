import "dotenv/config";
import OpenAI from "openai";
import type { LLMAdapter } from "./core/adapter";
import type { LLMMessage, LLMRequest, LLMResponse } from "./core/types";

export class OpenAICompatible implements LLMAdapter {
    private readonly client: OpenAI;
    private readonly model: string;

    constructor (){
        this.client = new OpenAI({
            apiKey: process.env.LLM_API_KEY,
            baseURL: process.env.LLM_BASE_URL,
        });
        this.model = process.env.LLM_MODEL!;
    }

    async generate(_request: LLMRequest): Promise<LLMResponse> {
        const messages = toOpenAIMessages(_request.messages);

        const response = await this.client.chat.completions.create({
            model: this.model,
            messages,
        });

        return {
            content: response.choices[0]?.message.content ?? "",
        }
    }
}
/**
 * @abstract 将message统一转换为Openai消息格式
 * @param messages (LLMMessage[])
 * @returns 
 */
function toOpenAIMessages(
    messages: LLMMessage[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((msg) => {
        switch (msg.role) {
            case "system":
                return {
                    role: "system",
                    content: msg.content,
                };
            case "user":
                return {
                    role: "user",
                    content: msg.content,
                };
            case "assistant":
                return {
                    role: "assistant",
                    content: msg.content,
                };
            // case for tool todo
        }
    });
    
}






