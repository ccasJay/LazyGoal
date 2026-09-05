import "dotenv/config";

import {
    createGoal,
    Runner,
} from "../../runtime/src/index";
import type { Goal, GoalStore } from "../../runtime/src/index";
import { currentProtocols, trajectoryStoreFor } from "../../runtime/test/current-fixtures";
import {
    createDefaultPromptBundleRenderer,
    DropOldestContextCompactor,
    LLMStepExecutor,
} from "../../agent/src/index";
import { OpenAICompatible } from "../src/openai-compatible";

/** 冒烟测试使用的最小内存 GoalStore，只保证保存最新快照。 */
class SmokeGoalStore implements GoalStore {
    private goal: Goal | undefined;

    async save(goal: Goal): Promise<void> {
        this.goal = structuredClone(goal);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        return this.goal?.id === goalId
            ? structuredClone(this.goal)
            : undefined;
    }
}

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
        structuredOutputMode: "strict",
    });
    const store = new SmokeGoalStore();
    const renderer = await createDefaultPromptBundleRenderer();
    const contextCompactor = new DropOldestContextCompactor();
    const executor = new LLMStepExecutor({
        adapter,
        renderer,
        contextCompactor,
    });
    const runner = new Runner({
        trajectoryStore: trajectoryStoreFor(store),
        store,
        executor,
    });
    const created = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "live-llm-goal",
        intent: "完成一次真实 LLM 连通性验证，并直接给出完成摘要。",
        profile: {
            id: "live-llm-profile",
            systemPrompt: "你是一个负责连通性验证的单步执行代理。",
            instructions: [
                "这是一次真实 LLM 请求验证。目标很简单，请直接完成，不要等待，也不要调用 Tool。",
            ],
            toolIds: [],
        },
        runId: "live-llm-run",
        maxSteps: 3,
    });
    const goal: Goal = {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: {
                    objective: "完成一次真实 LLM 连通性验证，并直接给出完成摘要。",
                    completionCriteria: [
                        "返回一个符合 AgentDecision 协议的 complete 结果，并为该完成标准提供 evidence",
                    ],
                },
            },
        },
    };

    await store.save(goal);
    const startedAt = performance.now();
    const result = await runner.run({
        goalId: goal.id,
        runId: goal.state.run.id,
    });
    const durationMs = Math.round(performance.now() - startedAt);

    if (!result.ok) {
        throw new Error(`${result.error.code}: ${result.error.message}`);
    }

    console.log(JSON.stringify({
        model: requiredEnv("LLM_MODEL"),
        durationMs,
        status: result.state.status,
        stepCount: result.state.stepCount,
        lastStep: result.state.lastStep,
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
