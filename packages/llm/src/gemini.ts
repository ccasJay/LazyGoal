import { 
    GoogleGenAI,
    type Content,
    type GenerateContentParameters
} from "@google/genai";
import "dotenv/config";

import type { LLMAdapter } from "./core/adapter";
import type { LLMMessage, LLMRequest ,LLMResponse } from "./core/types";

type GeminiInput = Pick<
    GenerateContentParameters,
    "contents" | "config" //选择两个属性
>;


export class Gemini implements LLMAdapter {
    private readonly client: GoogleGenAI;
    private readonly model: string;

    constructor() {
        this.client = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY!,
        });

        this.model = process.env.GEMINI_MODEL!;
    }

    async generate(request: LLMRequest): Promise<LLMResponse> {
        const input = toGeminiInput(request.messages);

        const response = await this.client.models.generateContent({
            model: this.model,
            ...input,
       });

       return {
        content: response.text ?? "",
       };
    }
}



/**
 * @abstract 转换为 Gemini API的输入结构
 * @param messages 
 * @returns 
 */
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
