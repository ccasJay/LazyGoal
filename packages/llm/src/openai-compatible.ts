import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.LLM_APT_KEY,
    baseURL: process.env.LLM_BASE_URL,
});

const response = await client.chat.completions.create({
    model: process.env.LLM_MODEL!,
    messages: [{role: "user",content: "hi"}],
});

console.log(response.choices[0]?.message?.content);
