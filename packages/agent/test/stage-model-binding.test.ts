import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest, LLMResponse } from "../../llm/src/core/types";
import { createGoal } from "../../runtime/src/domain";
import type { Goal } from "../../runtime/src/domain";
import {
    createEmptyWorkingMemory,
} from "../../runtime/src/index";
import {
    createDefaultPromptBundleRenderer,
    DropOldestContextCompactor,
    LLMResponseProtocolError,
    LLMStepExecutor,
    createModelExecutionBinding,
    MutableModelBinding,
} from "../src/index";
import { createInMemoryTrajectoryStore, currentProtocols } from "./current-fixtures";

const renderer = await createDefaultPromptBundleRenderer();
const profile = {
    id: "stage-binding-profile",
    systemPrompt: "stage binding",
    instructions: [],
    toolIds: [],
};

class ReplyAdapter implements LLMAdapter {
    readonly requests: LLMRequest[] = [];

    constructor(
        readonly structuredOutputMode: "strict" | "prompt_only",
        private readonly reply: string,
    ) {}

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.requests.push(request);
        return { content: this.reply };
    }
}

function createRunningGoal(runId: string): Goal {
    const created = createGoal({
        ...currentProtocols,
        id: "stage-binding-goal",
        runId,
        promptBundleVersion: 1,
        intent: "使用当前阶段 Adapter 作出决策",
        profile,
        maxSteps: 5,
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
                approvedTask: {
                    objective: "完成直接 Decide 阶段测试",
                    completionCriteria: [{ text: "返回合法完成决策" }],
                },
            },
        },
    };
}

function createExecutor(
    thinkAdapter: LLMAdapter,
    decideAdapter: LLMAdapter,
    provider: "openai" | "anthropic",
): LLMStepExecutor {
    const trajectoryStore = createInMemoryTrajectoryStore();
    const binding = createModelExecutionBinding({
        generation: 1,
        selection: {
            provider,
            modelId: provider === "openai" ? "gpt-4o" : "claude-sonnet-4-5",
            structuredOutputMode: "two_stage",
            inputEstimator: { kind: "character-v1" },
        },
        thinkAdapter,
        decideAdapter,
        trajectoryStore,
    });
    return new LLMStepExecutor({
        bindingProvider: new MutableModelBinding(binding),
        renderer,
        contextCompactor: new DropOldestContextCompactor(),
    });
}

test("直接 Decide 只调用 Decide Adapter，并保留原生 strict schema", async () => {
    const thinkAdapter = new ReplyAdapter("prompt_only", "不得调用");
    const decideAdapter = new ReplyAdapter("strict", JSON.stringify({
        result: {
            kind: "complete",
            summary: "直接完成",
            completionEvidence: [],
            memoryPatch: null,
        },
    }));
    const executor = createExecutor(thinkAdapter, decideAdapter, "openai");

    const result = await executor.execute({
        goal: createRunningGoal("stage-binding-direct"),
        authorizedTools: [],
        workingMemory: createEmptyWorkingMemory(),
    });

    assert.equal(result.kind, "complete");
    assert.equal(thinkAdapter.requests.length, 0);
    assert.equal(decideAdapter.requests.length, 1);
    assert.ok(decideAdapter.requests[0]?.structuredOutput !== undefined);
});

test("prompt_only Decide 仍经本地输出契约拒绝非法响应", async () => {
    const thinkAdapter = new ReplyAdapter("prompt_only", "不得调用");
    const decideAdapter = new ReplyAdapter("prompt_only", "not-json");
    const executor = createExecutor(thinkAdapter, decideAdapter, "anthropic");

    await assert.rejects(
        executor.execute({
            goal: createRunningGoal("stage-binding-prompt-only"),
            authorizedTools: [],
            workingMemory: createEmptyWorkingMemory(),
        }),
        (error: unknown) => error instanceof LLMResponseProtocolError,
    );

    assert.equal(thinkAdapter.requests.length, 0);
    assert.equal(decideAdapter.requests.length, 1);
    assert.equal(decideAdapter.requests[0]?.structuredOutput, undefined);
});
