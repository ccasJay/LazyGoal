import { OpenAICompatible } from "./openai-compatible";

async function main(): Promise<void> {
    const adapter = new OpenAICompatible();

    const response = await adapter.generate({
        messages: [
            {
                role: "user",
                content: "用一句话介绍 TypeScript。",
            },
        ],
    });

    console.log("模型响应:", response.content);
}

main().catch((error: unknown) => {
    console.error("Smoke test failed:", error);
    process.exitCode = 1;
});
