import assert from "node:assert/strict";
import { test } from "node:test";

import { createRun, transition } from "../src/index";
import type {
    Goal,
    RunState,
    TransitionResult,
} from "../src/index";

function requireSuccessfulState(result: TransitionResult): RunState {
    if (!result.ok) {
        assert.fail(`expected a successful transition: ${result.error.message}`);
    }

    return result.state;
}

test("advances one transition at a time through the main lifecycle", () => {
    const goal: Goal = {
        id: "goal-1",
        objective: "完成最小 Runtime",
        completionCriteria: ["Run 进入 completed"],
    };
    const created = createRun(goal, "run-1");

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
