import { createLlmAdapter } from "./factory";
import { readLlmConfig } from "./config";
import "dotenv/config";

async function main(): Promise<void> {
    const adapter = createLlmAdapter(readLlmConfig(process.env));

    const response = await adapter.generate({
        ...(adapter.structuredOutputMode === "strict" ? { structuredOutput: {
            name: "smoke_answer", schema: { type: "object" as const, properties: { answer: { type: "string" as const } }, required: ["answer"], additionalProperties: false },
        } } : {}),
        messages: [
            {
                role: "user",
                content: "Return JSON with one string property named answer introducing TypeScript.",
            },
        ],
    });

    console.log("Model response:", response.content);
}

main().catch((error: unknown) => {
    console.error("Smoke test failed:", error);
    process.exitCode = 1;
});
