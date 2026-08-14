import assert from "node:assert/strict";
import { test } from "node:test";

import { InlineScheduler } from "../src/index";
import type { Runner, RunnerResult } from "../src/index";

class FakeRunner implements Pick<Runner, "runUntilBlocked"> {
    readonly receivedRunIds: string[] = [];

    constructor(
        private readonly result?: RunnerResult,
        private readonly failure?: Error,
    ) {}

    async runUntilBlocked(runId: string): Promise<RunnerResult> {
        this.receivedRunIds.push(runId);

        if (this.failure !== undefined) {
            throw this.failure;
        }

        if (this.result === undefined) {
            throw new Error("FakeRunner requires a result or failure");
        }

        return this.result;
    }
}

test("delegates one explicit run ID and returns the Runner success result unchanged", async () => {
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

    const result = await scheduler.schedule("run-1");

    assert.strictEqual(result, runnerResult);
    assert.deepEqual(runner.receivedRunIds, ["run-1"]);
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

    const result = await scheduler.schedule("missing-run");

    assert.strictEqual(result, runnerResult);
    assert.deepEqual(runner.receivedRunIds, ["missing-run"]);
});

test("propagates the exact Runner error", async () => {
    const runnerError = new Error("Runner failed");
    const runner = new FakeRunner(undefined, runnerError);
    const scheduler = new InlineScheduler(runner);

    await assert.rejects(
        () => scheduler.schedule("run-2"),
        (actualError: unknown) => {
            assert.strictEqual(actualError, runnerError);
            return true;
        },
    );
    assert.deepEqual(runner.receivedRunIds, ["run-2"]);
});
