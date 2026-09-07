import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest, LLMResponse } from "../../llm/src/core/types";
import {
    createGoal,
    ExecutionAbortedError,
} from "../../runtime/src/index";
import type {
    AgentProfile,
    Goal,
} from "../../runtime/src/index";
import type { ContextCompactor } from "../src/context-compactor";
import type { ContextUnit } from "../src/context-unit";
import type { ModelConversationMessage } from "../src/model-inference-view";
import type { ModelInferenceView } from "../src/model-inference-view";
import type { TrajectoryModelContextAssembler } from "../src/trajectory-model-context-assembler";
import {
    createDefaultPromptBundleRenderer,
    DropOldestContextCompactor,
    LLMPreparationExecutor,
    LLMStepExecutor,
} from "../src/index";
import {
    createCurrentContextAssembler,
    currentProtocols,
    currentWorkingMemory,
} from "./current-fixtures";

const renderer = await createDefaultPromptBundleRenderer();
const contextCompactor = new DropOldestContextCompactor();

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "You are an abort-aware agent.",
    instructions: ["Return the requested structured response."],
    toolIds: [],
};

function createPreparationGoal(): Goal {
    return createGoal({
        promptBundleVersion: 1,
        id: "goal-1",
        intent: "Test preparation cancellation",
        ...currentProtocols,
        profile,
        runId: "run-1",
    });
}

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
                preparation: { status: "completed" },
                task: {
                    objective: goal.definition.intent,
                    completionCriteria: [{ text: "The adapter receives the signal" }],
                },
            },
            run: { ...goal.state.run, status: "running" },
        },
    };
}

class BlockingAdapter implements LLMAdapter {
    readonly structuredOutputMode = "strict" as const;
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
    const adapter = new BlockingAdapter({
        content: JSON.stringify({
            kind: "complete",
            summary: "not persisted",
            completionEvidence: [],
        }),
    });
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

test("LLMPreparationExecutor rejects a pre-aborted signal without calling the Adapter", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const adapter: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate(): Promise<LLMResponse> {
            calls += 1;
            return {
                content: JSON.stringify({ kind: "context_ready" }),
            };
        },
    };
    const executor = new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    });

    await assert.rejects(
        () => executor.execute({
            goal: createPreparationGoal(),
            authorizedTools: [],
            workingMemory: currentWorkingMemory,
            control: { signal: controller.signal },
        }),
        (error: unknown) => error instanceof ExecutionAbortedError,
    );
    assert.equal(calls, 0);
});

test("LLMPreparationExecutor awaits Context Assembler and passes the same signal", async () => {
    const controller = new AbortController();
    const assembler = new BlockingAssembler();
    let calls = 0;
    const adapter: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate(): Promise<LLMResponse> {
            calls += 1;
            return {
                content: JSON.stringify({
                    result: {
                        kind: "context_ready",
                        memoryPatch: null,
                    },
                }),
            };
        },
    };
    const executor = new LLMPreparationExecutor({
        adapter,
        renderer,
        contextCompactor,
        trajectoryContextAssembler: assembler as unknown as TrajectoryModelContextAssembler,
    });
    const operation = executor.execute(
        {
            goal: createPreparationGoal(),
            authorizedTools: [],
            workingMemory: currentWorkingMemory,
            control: { signal: controller.signal },
        },
    );

    await assembler.started;
    assert.equal(calls, 0);
    assert.strictEqual(assembler.signals[0], controller.signal);

    assembler.release();
    assert.deepEqual(await operation, { kind: "context_ready" });
    assert.equal(calls, 1);
});
