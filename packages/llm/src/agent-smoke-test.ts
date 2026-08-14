import "dotenv/config";

import {
    createRun,
    Runner,
} from "../../runtime/src/index";
import { InMemoryRunStore } from "../../runtime/src/run-store";
import { LLMStepExecutor } from "../../agent/src/index";
import { OpenAICompatible } from "./openai-compatible";

function requiredEnv(name: string): string {
    const value = process.env[name];

    if (value === undefined || value.trim() === "") {
        throw new Error(`${name} 未配置`);
    }

    return value;
}

async function main(): Promise<void> {
    const adapter = new OpenAICompatible({
        apiKey: requiredEnv("LLM_API_KEY"),
        baseURL: requiredEnv("LLM_BASE_URL"),
        model: requiredEnv("LLM_MODEL"),
    });
    const store = new InMemoryRunStore();
    const executor = new LLMStepExecutor({ adapter });
    const runner = new Runner({
        store,
        executor,
        maxSteps: 3,
    });
    const run = createRun(
        {
            id: "live-llm-goal",
            objective: "完成一次真实 LLM 连通性验证，并直接给出完成摘要。",
            completionCriteria: [
                "返回一个符合 StepResult 协议的 complete 结果",
            ],
        },
        "live-llm-run",
        {
            id: "live-llm-profile",
            systemPrompt: "你是一个负责连通性验证的单步执行代理。",
            instructions: [
                "这是一次真实 LLM 请求验证。目标很简单，请直接完成，不要等待，也不要调用 Tool。",
            ],
            toolIds: [],
        },
    );

    await store.save(run);
    const startedAt = performance.now();
    const result = await runner.run(run.id);
    const durationMs = Math.round(performance.now() - startedAt);

    if (!result.ok) {
        throw new Error(`${result.error.code}: ${result.error.message}`);
    }

    console.log(JSON.stringify({
        model: requiredEnv("LLM_MODEL"),
        durationMs,
        status: result.state.status,
        stepCount: result.state.stepCount,
        lastResult: result.state.lastResult,
    }, null, 2));

    if (result.state.status === "failed") {
        process.exitCode = 1;
    }
}

main().catch((error: unknown) => {
    console.error(
        "Live LLM Agent smoke test failed:",
        error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
});
