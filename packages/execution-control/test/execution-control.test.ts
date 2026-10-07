import assert from "node:assert/strict";
import test from "node:test";

import {
    EXECUTION_ABORTED_ERROR_CODE,
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
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
