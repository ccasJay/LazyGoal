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
