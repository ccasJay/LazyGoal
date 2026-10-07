import assert from "node:assert/strict";
import test from "node:test";

import {
    EXECUTION_ABORTED_ERROR_CODE,
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    TransientModelRequestFailure,
    type ExecutionControl,
} from "../src/index.js";

test("ExecutionAbortedError initializes with stable code and name", () => {
    const error = new ExecutionAbortedError();
    assert.equal(error.name, "ExecutionAbortedError");
    assert.equal(error.code, EXECUTION_ABORTED_ERROR_CODE);
    assert.equal(error.message, "Execution aborted");
});

test("isExecutionAbortedError recognizes instances and compatible objects", () => {
    assert.equal(isExecutionAbortedError(new ExecutionAbortedError()), true);

    const duckTyped = new Error("custom");
    duckTyped.name = "ExecutionAbortedError";
    (duckTyped as unknown as { code: string }).code = EXECUTION_ABORTED_ERROR_CODE;
    assert.equal(isExecutionAbortedError(duckTyped), true);

    assert.equal(isExecutionAbortedError(new Error("other")), false);
    assert.equal(isExecutionAbortedError(null), false);
    assert.equal(isExecutionAbortedError(undefined), false);
});

test("throwIfAborted does nothing when not aborted", () => {
    const controller = new AbortController();
    assert.doesNotThrow(() => throwIfAborted());
    assert.doesNotThrow(() => throwIfAborted({}));
    assert.doesNotThrow(() => throwIfAborted({ signal: controller.signal }));
    assert.doesNotThrow(() => throwIfAborted(controller.signal));
});

test("throwIfAborted throws ExecutionAbortedError when signal is aborted", () => {
    const controller = new AbortController();
    controller.abort();

    assert.throws(
        () => throwIfAborted({ signal: controller.signal }),
        (err) => isExecutionAbortedError(err) && err instanceof ExecutionAbortedError,
    );

    assert.throws(
        () => throwIfAborted(controller.signal),
        (err) => isExecutionAbortedError(err) && err instanceof ExecutionAbortedError,
    );
});

test("TransientModelRequestFailure initializes with kind, reason, status, and retryAfterMs", () => {
    const failure = new TransientModelRequestFailure("rate_limited", {
        status: 429,
        retryAfterMs: 5000,
    });
    assert.equal(failure.name, "TransientModelRequestFailure");
    assert.equal(failure.kind, "transient_model_request");
    assert.equal(failure.reason, "rate_limited");
    assert.equal(failure.status, 429);
    assert.equal(failure.retryAfterMs, 5000);
});

