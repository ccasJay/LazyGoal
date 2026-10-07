import { isExecutionAbortedError, type ExecutionControl } from "../../execution-control/src/index";
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { contract } from "../../contracts/src/index";
import {
    GoalCoordinator, InlineScheduler, Runner, TrajectoryCheckpointCommitter,
    InMemoryToolRegistry, createToolRegistration, launch,
    type AgentProfile, type Tool,
    } from "../../runtime/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { InMemoryTrajectoryStore } from "../../runtime/test/current-fixtures";
import {
    createDefaultPromptBundleRenderer, createDefaultModelContextBudgetPolicy,
    DropOldestContextCompactor, LLMStepExecutor,
    TrajectoryModelContextAssembler,
} from "../../agent/src/index";
import { readLlmConfig } from "../src/config";
import { createLlmAdapter } from "../src/factory";

/**
 * 用显式模型配置验证统一执行、任务审批及工具执行链；仅使用内存存储。
 * @param env - 模型环境配置；不写回环境或工作区。
 * @param control - 可选取消控制，用于真实请求取消验收。
 * @returns 成功完成时的模型、模式、阶段和调用统计；失败或取消时抛出异常。
 * @example
 * ```ts
 * const report = await runAgentSmoke(process.env);
 * ```
 */
export async function runAgentSmoke(
    env: Readonly<Record<string, string | undefined>>,
    control?: ExecutionControl,
) {
    const config = readLlmConfig(env);
    const adapter = createLlmAdapter(config);
    const store = new InMemoryGoalStore();
    const trajectoryStore = new InMemoryTrajectoryStore();
    const renderer = await createDefaultPromptBundleRenderer();
    const contextCompactor = new DropOldestContextCompactor();
    const trajectoryContextAssembler = new TrajectoryModelContextAssembler({
        trajectoryStore, policy: createDefaultModelContextBudgetPolicy(),
    });
    const checkpointCommitter = new TrajectoryCheckpointCommitter({ store, trajectoryStore });
    let toolCalls = 0;
    const inputContract = contract.object({});
    const tool: Tool<typeof inputContract> = {
        definition: {
            id: "smoke_evidence", description: "Return a fixed observation to verify the model/tool loop. Call once with empty input.", inputContract, isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        execute: async () => {
            toolCalls += 1;
            return { kind: "success", output: { evidence: "smoke-observation" }, summary: "Smoke observation recorded" };
        },
    };
    const toolRegistry = new InMemoryToolRegistry([createToolRegistration(tool)]);
    const dependencies = { adapter, renderer, contextCompactor, trajectoryContextAssembler };
    const runner = new Runner({
        store, trajectoryStore, checkpointCommitter, toolRegistry,
        executor: new LLMStepExecutor(dependencies), toolPolicy: { evaluate: () => "allow" },
    });
    const coordinator = new GoalCoordinator({
        store, trajectoryStore, checkpointCommitter, toolRegistry,
        scheduler: new InlineScheduler(runner),
    });
    const profile: AgentProfile = {
        id: "live-llm-profile",
        systemPrompt: "You verify the LazyGoal unified execution protocol.",
        instructions: [
            "Propose one completion criterion: obtain the smoke_evidence observation.",
            "During execution call smoke_evidence exactly once, then complete with the recorded observation as evidence.",
            "Do not request context lookups or user input. Leave memoryPatch null.",
        ],
        toolIds: [tool.definition.id],
    };
    const ref = { goalId: "live-llm-goal", runId: "live-llm-run" };
    const startedAt = performance.now();
    const started = await launch({
        goalId: ref.goalId, profileId: profile.id,
        intent: "Verify connectivity by calling smoke_evidence once and completing with its observation. No other work is needed.",
        mode: "plan",
        maxSteps: 3,
    }, {
        profiles: { get: id => id === profile.id ? profile : undefined },
        runIdGenerator: () => ref.runId, store, coordinator, trajectoryStore,
    }, control);
    if (!started.ok) throw new Error(`${started.error.code}: ${started.error.message}`);
    if (started.kind !== "waiting" || started.phase !== "executing" || started.waitingFor !== "task_approval") {
        throw new Error("Smoke execution did not produce a task proposal awaiting approval");
    }
    const pending = started.goal.state.run.pendingInteraction;
    if (pending?.kind !== "task_approval") throw new Error("Smoke task proposal did not persist its requestId");
    const execution = await coordinator.resume({
        ref,
        action: { kind: "approve_task", requestId: pending.requestId },
    }, control);
    if (!execution.ok) throw new Error(`${execution.error.code}: ${execution.error.message}`);
    const goal = await store.restore(ref.goalId);
    if (goal?.state.run.status !== "completed" || toolCalls !== 1) {
        throw new Error(`Smoke execution did not complete with exactly one tool observation (status=${goal?.state.run.status}, toolCalls=${toolCalls})`);
    }
    return {
        provider: config.provider, model: config.model, mode: adapter.structuredOutputMode,
        unifiedExecution: "passed", toolCalls,
        durationMs: Math.round(performance.now() - startedAt),
    };
}

const runningUnderNodeTest = process.env.NODE_TEST_CONTEXT !== undefined
    || process.argv.includes("--test");

if (!runningUnderNodeTest && process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    process.once("SIGINT", cancel);
    runAgentSmoke(process.env, { signal: controller.signal })
        .then(report => console.log(JSON.stringify(report, null, 2)))
        .catch((error: unknown) => {
            console.error(JSON.stringify({
                provider: process.env.LLM_PROVIDER, model: process.env.LLM_MODEL,
                mode: process.env.LLM_STRUCTURED_OUTPUT_MODE,
                status: isExecutionAbortedError(error) ? "cancelled" : "failed",
                error: error instanceof Error ? error.message : String(error),
            }));
            process.exitCode = isExecutionAbortedError(error) ? 130 : 1;
        })
        .finally(() => process.removeListener("SIGINT", cancel));
}
