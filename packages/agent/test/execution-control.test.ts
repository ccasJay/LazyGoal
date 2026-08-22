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
import {
    LLMPreparationExecutor,
    LLMStepExecutor,
} from "../src/index";

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
        profile,
        runId: "run-1",
    });
}

function createStepGoal(): Goal {
    const goal = createGoal({
        promptBundleVersion: 1,
        id: "goal-1",
        intent: "Test step cancellation",
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
                    completionCriteria: ["The adapter receives the signal"],
                },
            },
            run: { ...goal.state.run, status: "running" },
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

test("LLMStepExecutor passes the signal and rejects before parsing after abort", async () => {
    const controller = new AbortController();
    const adapter = new BlockingAdapter({
        content: JSON.stringify({
            kind: "complete",
            checkpoint: "not persisted",
            summary: "not persisted",
        }),
    });
    const executor = new LLMStepExecutor({ adapter });
    const operation = executor.execute(
        createStepGoal(),
        [],
        { signal: controller.signal },
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
        async generate(): Promise<LLMResponse> {
            calls += 1;
            return {
                content: JSON.stringify({ kind: "context_ready" }),
            };
        },
    };
    const executor = new LLMPreparationExecutor({ adapter });

    await assert.rejects(
        () => executor.execute(
            createPreparationGoal(),
            { signal: controller.signal },
        ),
        (error: unknown) => error instanceof ExecutionAbortedError,
    );
    assert.equal(calls, 0);
});
