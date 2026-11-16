import { ExecutionAbortedError } from "../../execution-control/src/index";
import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm-core/src/index";
import type { LLMRequest, LLMResponse, LLMStreamEvent } from "../../llm-core/src/index";
import { textResponse } from "../../llm-core/test/response-fixtures";
import {
    createGoal,
    } from "../../runtime/src/index";
import type {
    AgentProfile,
    Goal,
} from "../../runtime/src/index";
import type { ContextCompactor, ContextUnit } from "../../context-budget/src/index";
import type { ModelConversationMessage } from "../../model-view/src/index";
import type { ModelInferenceView } from "../../model-view/src/index";
import type { TrajectoryModelContextAssembler } from "../../model-context/src/index";
import {
    LLMStepExecutor,
} from "../src/index";
import { createDefaultPromptBundleRenderer } from "../../prompt-bundle/src/index";
import { DropOldestContextCompactor } from "../../context-budget/src/index";
import {
    createCurrentContextAssembler,
    currentProtocols,
    currentWorkingMemory,
} from "../../agent/test/current-fixtures";

const renderer = await createDefaultPromptBundleRenderer();
const contextCompactor = new DropOldestContextCompactor();

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are an abort-aware agent.",
    instructions: ["Return the requested structured response."],
    toolIds: [],
};

function createStepGoal(): Goal {
    const goal = createGoal({
        promptBundleVersion: 1,
        id: "goal-1",
        intent: "Test step cancellation",
        ...currentProtocols,
        profile,
        runId: "run-1",
    });

    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "executing",
            },
            run: { ...goal.state.run, status: "running" , mode: "plan", approvedTask: {
                    objective: goal.definition.intent,
                    completionCriteria: [{ text: "The adapter receives the signal" }],
                } },
        },
    };
}

class BlockingAdapter implements LLMAdapter {
    readonly requests: LLMRequest[] = [];
    readonly controls: unknown[] = [];
    private startedResolver: (() => void) | undefined;
    readonly started = new Promise<void>((resolve) => {
        this.startedResolver = resolve;
    });

    constructor(private readonly response: LLMResponse) {}

    async generate(
        request: LLMRequest,
        control?: { readonly signal?: AbortSignal },
    ): Promise<LLMResponse> {
        this.requests.push(request);
        this.controls.push(control);
        this.startedResolver?.();
        await new Promise<void>((resolve) => {
            control?.signal?.addEventListener("abort", () => resolve(), {
                once: true,
            });
        });
        return this.response;
    }
}

class BlockingAssembler {
    readonly signals: Array<AbortSignal | undefined> = [];
    private startedResolver: (() => void) | undefined;
    readonly started = new Promise<void>((resolve) => {
        this.startedResolver = resolve;
    });
    private releaseResolver: (() => void) | undefined;
    private readonly blocked = new Promise<void>((resolve) => {
        this.releaseResolver = resolve;
    });

    async assemble(input: {
        readonly view: ModelInferenceView;
        readonly control?: { readonly signal?: AbortSignal };
    }): Promise<ModelInferenceView> {
        this.signals.push(input.control?.signal);
        this.startedResolver?.();
        await this.blocked;
        return input.view;
    }

    release(): void {
        this.releaseResolver?.();
    }
}

test("LLMStepExecutor passes the signal and rejects before parsing after abort", async () => {
    const controller = new AbortController();
    const adapter = new BlockingAdapter(textResponse(JSON.stringify({
        kind: "complete",
        summary: "not persisted",
        completionEvidence: [],
    }), "json"));
    const executor = new LLMStepExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });
    const operation = executor.execute(
        {
            goal: createStepGoal(),
            authorizedTools: [],
            workingMemory: currentWorkingMemory,
            control: { signal: controller.signal },
        },
    );

    await adapter.started;
    controller.abort();

    await assert.rejects(
        operation,
        (error: unknown) => error instanceof ExecutionAbortedError,
    );
    assert.equal(adapter.requests.length, 1);
    assert.strictEqual(
        (adapter.controls[0] as { readonly signal?: AbortSignal }).signal,
        controller.signal,
    );
});


test("流式阶段在 chunk 间取消时传播取消错误、关闭本次迭代器且不返回部分响应", async () => {
    const controller = new AbortController();
    let released = 0;
    const adapter: LLMAdapter = {
        async generate(): Promise<LLMResponse> {
            throw new Error("stream adapter must not call generate");
        },
        async *stream(): AsyncIterable<LLMStreamEvent> {
            try {
                yield { kind: "started" };
                yield { kind: "content_block_started", index: 0, blockType: "text", delivery: "incremental", format: "json" };
                yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "partial" };
                controller.abort();
                yield { kind: "content_block_delta", index: 0, deltaKind: "text", delta: "late" };
            } finally {
                released += 1;
            }
        },
    };
    const executor = new LLMStepExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });

    await assert.rejects(
        executor.execute({
            goal: createStepGoal(),
            authorizedTools: [],
            workingMemory: currentWorkingMemory,
            control: { signal: controller.signal },
        }),
        (error: unknown) => error instanceof ExecutionAbortedError,
    );
    assert.equal(released, 1, "取消后必须释放本次流迭代器");
});
