export type LLMRole = "system" | "user" | "assistant";

export type LLMMessage = 
    | {role: "system"; content: string}
    | {role: "user"; content: string}
    | {role: "assistant"; content:string};

export interface LLMRequest {
    messages: LLMMessage[];
}

export interface LLMResponse {
    content: string;
}