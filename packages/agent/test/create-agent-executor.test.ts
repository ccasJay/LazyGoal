import assert from "node:assert/strict";
import { test } from "node:test";

import { createGoal } from "../../runtime/src/domain";
import type { Goal } from "../../runtime/src/domain";
import type { LLMAdapter } from "../../llm-core/src/index";
import type { LLMResponse } from "../../llm-core/src/index";
import { toolCallResponse } from "../../llm-core/test/response-fixtures";
import type { LLMRequest } from "../../llm-core/src/index";
import type { ModelInputRecord } from "../../runtime/src/model-input";
import {
    DropOldestContextCompactor,
    createDefaultModelContextBudgetPolicy,
    type ContextCompactor,
    type ContextUnit,
} from "../../context-budget/src/index";
import { TrajectoryModelContextAssembler } from "../../model-context/src/index";
import { createDefaultPromptBundleRenderer } from "../../prompt-bundle/src/index";
import type { ModelConversationMessage } from "../../model-view/src/index";
import { LLMStepExecutor } from "../../model-execution/src/index";
import { createAgentExecutor } from "../src/index";
import { createEmptyTrajectoryStore, currentProtocols, currentWorkingMemory } from "./current-fixtures";

const profile = {
    id: "agent-factory-profile",
    systemPrompt: "factory",
    instructions: [],
    toolIds: [],
};

function executingGoal(id = "agent-factory-goal"): Goal {
    const created = createGoal({
        ...currentProtocols,
        id,
        runId: "agent-factory-run",
        promptBundleVersion: 1,
        intent: "验证默认装配",
        profile,
    });
    return {
        ...created,
        state: {
            ...created.state,
            workflow: { phase: "executing" },
            run: {
                ...created.state.run,
                status: "running",
                mode: "plan",
                approvedTask: { objective: "验证", completionCriteria: [] },
            },
        },
    };
}

function failDecisionResponse(): LLMResponse {
    return toolCallResponse({
        callId: "call-1",
        toolId: "system_fail_goal",
        argumentsJson: JSON.stringify({ error: "stop", memoryPatch: null }),
    });
}

class CountingAdapter implements LLMAdapter {
    readonly structuredOutputMode = "strict" as const;
    calls = 0;
    readonly requests: string[] = [];

    constructor(private readonly respond: () => ReturnType<typeof failDecisionResponse> = failDecisionResponse) {}

    async generate(request: LLMRequest) {
        this.calls += 1;
        this.requests.push(JSON.stringify(request));
        return this.respond();
    }
}

test("默认装配在构造期不调用模型、不注册进程信号", async () => {
    const adapter = new CountingAdapter();
    const sigintBefore = process.listenerCount("SIGINT");
    const sigtermBefore = process.listenerCount("SIGTERM");

    const executor = await createAgentExecutor({ adapter });

    assert.equal(adapter.calls, 0);
    assert.equal(process.listenerCount("SIGINT"), sigintBefore);
    assert.equal(process.listenerCount("SIGTERM"), sigtermBefore);
    assert.equal(typeof executor.decide, "function");
    assert.equal(typeof executor.think, "function");
    assert.equal(typeof executor.reviewCompletion, "function");
});

test("显式注入的 Renderer 与裁剪策略被原样使用", async () => {
    const adapter = new CountingAdapter();
    let compacted = 0;
    const contextCompactor: ContextCompactor<ModelConversationMessage> = {
        async compact(units: readonly ContextUnit<ModelConversationMessage>[]) {
            compacted += 1;
            return units;
        },
    };
    const executor = await createAgentExecutor({
        adapter,
        renderer: {
            render: () => "CUSTOM-SYSTEM",
            renderDynamicSections: () => [],
            dynamicSectionIdentities: () => [],
        },
        contextCompactor,
        trajectoryContextAssembler: new TrajectoryModelContextAssembler({
            trajectoryStore: createEmptyTrajectoryStore(),
            policy: createDefaultModelContextBudgetPolicy(),
        }),
    });

    const decision = await executor.decide({
        goal: executingGoal(),
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
        thinkHistory: [],
    });

    assert.equal(decision.kind, "decision");
    if (decision.kind !== "decision") return;
    assert.equal(decision.decision.kind, "fail");
    assert.equal(compacted, 1);
    assert.equal(JSON.parse(adapter.requests[0]!).messages[0].content, "CUSTOM-SYSTEM");
});

test("等同依赖下默认装配与直接执行器产生相同阶段后果", async () => {
    const createHarness = async () => {
        const renderer = await createDefaultPromptBundleRenderer();
        const contextCompactor = new DropOldestContextCompactor();
        const trajectoryContextAssembler = new TrajectoryModelContextAssembler({
            trajectoryStore: createEmptyTrajectoryStore(),
            policy: createDefaultModelContextBudgetPolicy(),
        });
        return { renderer, contextCompactor, trajectoryContextAssembler };
    };
    const adapterFromFactory = new CountingAdapter();
    const adapterFromDirect = new CountingAdapter();
    const factoryHarness = await createHarness();
    const directHarness = await createHarness();
    const factoryInputs: ModelInputRecord[] = [];
    const directInputs: ModelInputRecord[] = [];
    const factoryMetrics: string[] = [];
    const directMetrics: string[] = [];

    const factoryExecutor = await createAgentExecutor({
        adapter: adapterFromFactory,
        ...factoryHarness,
        modelInputStore: { append: async (record) => { factoryInputs.push(record); }, read: async () => factoryInputs },
        metricsRecorder: { record: async (record) => { factoryMetrics.push(record.recordType); } },
    });
    const directExecutor = new LLMStepExecutor({
        adapter: adapterFromDirect,
        ...directHarness,
        modelInputStore: { append: async (record) => { directInputs.push(record); }, read: async () => directInputs },
        metricsRecorder: { record: async (record) => { directMetrics.push(record.recordType); } },
    });

    const input = {
        goal: executingGoal(),
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    };
    const factoryResult = await factoryExecutor.decide({ ...input, thinkHistory: [] });
    const directResult = await directExecutor.decide({ ...input, goal: executingGoal(), thinkHistory: [] });

    const normalize = (result: Awaited<ReturnType<typeof factoryExecutor.decide>>) => ({
        ...result,
        modelContextFrame: {
            ...result.modelContextFrame,
            modelCallId: "<call>",
        },
    });
    assert.deepEqual(normalize(factoryResult), normalize(directResult));
    assert.equal(adapterFromFactory.requests.length, 1);
    assert.equal(adapterFromDirect.requests.length, 1);
    assert.equal(adapterFromFactory.requests[0], adapterFromDirect.requests[0]);
    assert.deepEqual(
        factoryInputs.map((record) => record.messages.map((message) => message.source)),
        directInputs.map((record) => record.messages.map((message) => message.source)),
    );
    assert.deepEqual(factoryMetrics, ["call_started", "call_finished"]);
    assert.deepEqual(directMetrics, ["call_started", "call_finished"]);
});
