import assert from "node:assert/strict";
import { test } from "node:test";

import { createRun, transition } from "../src/index";
import type {
    RunInput,
    RunState,
    TransitionResult,
} from "../src/index";

function requireSuccessfulState(result: TransitionResult): RunState {
    if (!result.ok) {
        assert.fail(`expected a successful transition: ${result.error.message}`);
    }

    return result.state;
}

function requireFailedTransition(
    result: TransitionResult,
): Extract<TransitionResult, { readonly ok: false }> {
    if (result.ok) {
        assert.fail("expected an invalid transition");
    }

    return result;
}

function createRunningState(runId = "run-1"): RunState {
    return requireSuccessfulState(
        transition(createRun(runId), { kind: "start" }),
    );
}

function createWaitingState(runId = "run-1"): RunState {
    return requireSuccessfulState(
        transition(createRunningState(runId), {
            kind: "step",
            result: { kind: "wait", reason: "等待外部事件" },
        }),
    );
}

test("advances one transition at a time through the main lifecycle", () => {
    const created = createRun("run-1");

    const running = requireSuccessfulState(
        transition(created, { kind: "start" }),
    );
    assert.equal(running.status, "running");
    assert.equal(running.stepCount, 0);
    assert.equal(running.lastResult, undefined);

    const waitResult = {
        kind: "wait",
        reason: "等待外部事件",
    } as const;
    const waiting = requireSuccessfulState(
        transition(running, { kind: "step", result: waitResult }),
    );
    assert.equal(waiting.status, "waiting");
    assert.equal(waiting.stepCount, 1);
    assert.deepEqual(waiting.lastResult, waitResult);

    const resumed = requireSuccessfulState(
        transition(waiting, { kind: "resume" }),
    );
    assert.equal(resumed.status, "running");
    assert.equal(resumed.stepCount, 1);
    assert.deepEqual(resumed.lastResult, waitResult);

    const completeResult = {
        kind: "complete",
        summary: "目标已经完成",
    } as const;
    const completed = requireSuccessfulState(
        transition(resumed, { kind: "step", result: completeResult }),
    );
    assert.equal(completed.status, "completed");
    assert.equal(completed.stepCount, 2);
    assert.deepEqual(completed.lastResult, completeResult);
});

test("step.continue keeps the run running and increments once", () => {
    const currentState = createRunningState();
    const input = {
        kind: "step",
        result: { kind: "continue", summary: "继续执行" },
    } as const;
    const stateBefore = JSON.parse(JSON.stringify(currentState));
    const inputBefore = JSON.parse(JSON.stringify(input));

    const nextState = requireSuccessfulState(transition(currentState, input));

    assert.notStrictEqual(nextState, currentState);
    assert.equal(nextState.status, "running");
    assert.equal(nextState.stepCount, currentState.stepCount + 1);
    assert.deepEqual(nextState.lastResult, input.result);
    assert.deepEqual(currentState, stateBefore);
    assert.deepEqual(input, inputBefore);
});

test("step.fail moves the run to failed and increments once", () => {
    const currentState = createRunningState();
    const result = { kind: "fail", error: "工具执行失败" } as const;

    const nextState = requireSuccessfulState(
        transition(currentState, { kind: "step", result }),
    );

    assert.notStrictEqual(nextState, currentState);
    assert.equal(nextState.status, "failed");
    assert.equal(nextState.stepCount, currentState.stepCount + 1);
    assert.deepEqual(nextState.lastResult, result);
});

const cancellationCases: ReadonlyArray<{
    readonly status: "created" | "running" | "waiting";
    readonly createState: () => RunState;
}> = [
    {
        status: "created",
        createState: () => createRun("run-created"),
    },
    {
        status: "running",
        createState: () => createRunningState("run-running"),
    },
    {
        status: "waiting",
        createState: () => createWaitingState("run-waiting"),
    },
];

for (const cancellationCase of cancellationCases) {
    test(`cancel moves ${cancellationCase.status} to cancelled without counting a step`, () => {
        const currentState = cancellationCase.createState();

        const nextState = requireSuccessfulState(
            transition(currentState, { kind: "cancel" }),
        );

        assert.notStrictEqual(nextState, currentState);
        assert.equal(nextState.status, "cancelled");
        assert.equal(nextState.stepCount, currentState.stepCount);
        assert.deepEqual(nextState.lastResult, currentState.lastResult);
    });
}

test("an invalid non-terminal transition returns the original state and error", () => {
    const currentState = createRunningState();
    const input = { kind: "resume" } as const satisfies RunInput;
    const stateBefore = JSON.parse(JSON.stringify(currentState));
    const inputBefore = JSON.parse(JSON.stringify(input));

    const result = requireFailedTransition(transition(currentState, input));

    assert.equal(result.error.code, "INVALID_TRANSITION");
    assert.ok(result.error.message.length > 0);
    assert.strictEqual(result.state, currentState);
    assert.deepEqual(currentState, stateBefore);
    assert.deepEqual(input, inputBefore);
});

const terminalStates: readonly RunState[] = [
    {
        ...createRun("run-completed"),
        status: "completed",
        stepCount: 1,
        lastResult: { kind: "complete", summary: "已完成" },
    },
    {
        ...createRun("run-failed"),
        status: "failed",
        stepCount: 1,
        lastResult: { kind: "fail", error: "执行失败" },
    },
    {
        ...createRun("run-cancelled"),
        status: "cancelled",
    },
];

for (const terminalState of terminalStates) {
    test(`${terminalState.status} rejects further input`, () => {
        const result = requireFailedTransition(
            transition(terminalState, { kind: "start" }),
        );

        assert.equal(result.error.code, "INVALID_TRANSITION");
        assert.strictEqual(result.state, terminalState);
    });
}
