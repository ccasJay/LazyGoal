import assert from "node:assert/strict";
import { test } from "node:test";

import { InlineScheduler } from "../src/index";
import type { Runner, RunnerResult, RunRef } from "../src/index";

class FakeRunner implements Pick<Runner, "runUntilBlocked"> {
    readonly receivedRefs: RunRef[] = [];

    constructor(
        private readonly result?: RunnerResult,
        private readonly failure?: Error,
    ) {}

    async runUntilBlocked(ref: RunRef): Promise<RunnerResult> {
        this.receivedRefs.push(ref);

        if (this.failure !== undefined) {
            throw this.failure;
        }

        if (this.result === undefined) {
            throw new Error("FakeRunner requires a result or failure");
        }

        return this.result;
    }
}

test("delegates one explicit RunRef and returns the Runner success result unchanged", async () => {
    const runnerResult: RunnerResult = {
        ok: true,
        state: {
            id: "run-1",
            status: "completed",
            stepCount: 1,
            lastResult: { kind: "complete", summary: "目标完成" },
        },
    };
    const runner = new FakeRunner(runnerResult);
    const scheduler = new InlineScheduler(runner);

    const ref = { goalId: "goal-1", runId: "run-1" };
    const result = await scheduler.schedule(ref);

    assert.strictEqual(result, runnerResult);
    assert.deepEqual(runner.receivedRefs, [ref]);
});

test("returns the Runner business failure unchanged", async () => {
    const runnerResult: RunnerResult = {
        ok: false,
        error: {
            code: "RUN_NOT_FOUND",
            message: "Run was not found",
        },
    };
    const runner = new FakeRunner(runnerResult);
    const scheduler = new InlineScheduler(runner);

    const ref = { goalId: "goal-1", runId: "missing-run" };
    const result = await scheduler.schedule(ref);

    assert.strictEqual(result, runnerResult);
    assert.deepEqual(runner.receivedRefs, [ref]);
});

test("propagates the exact Runner error", async () => {
    const runnerError = new Error("Runner failed");
    const runner = new FakeRunner(undefined, runnerError);
    const scheduler = new InlineScheduler(runner);

    await assert.rejects(
        () => scheduler.schedule({ goalId: "goal-1", runId: "run-2" }),
        (actualError: unknown) => {
            assert.strictEqual(actualError, runnerError);
            return true;
        },
    );
    assert.deepEqual(runner.receivedRefs, [
        { goalId: "goal-1", runId: "run-2" },
    ]);
});
