import assert from "node:assert/strict";
import { test } from "node:test";

import { ContextWindowRejectedError, TransientModelRequestFailure } from "../../execution-control/src/index";
import { classifyContextWindowRejection, classifyTransientModelFailure } from "../src/index";

test("classifies retryable status and parses Retry-After", () => {
    const failure = classifyTransientModelFailure({
        status: 429,
        headers: { "retry-after": "2" },
    });
    assert.ok(failure instanceof TransientModelRequestFailure);
    assert.equal(failure.reason, "rate_limited");
    assert.equal(failure.status, 429);
    assert.equal(failure.retryAfterMs, 2000);
    assert.equal(classifyTransientModelFailure({ status: 503 })?.reason, "service_unavailable");
    assert.equal(classifyTransientModelFailure({ cause: Object.assign(new Error("fetch failed"), { code: "ECONNRESET" }) })?.reason, "connection");
    assert.equal(classifyTransientModelFailure({ errorMessage: "HTTP 429: rate limited" })?.reason, "rate_limited");
});

test("does not classify auth, quota, protocol, or unknown failures for retry", () => {
    assert.equal(classifyTransientModelFailure({ status: 401 }), undefined);
    assert.equal(classifyTransientModelFailure({ status: 429, code: "insufficient_quota" }), undefined);
    assert.equal(classifyTransientModelFailure({ status: 400 }), undefined);
    assert.equal(classifyTransientModelFailure(new Error("unknown provider failure")), undefined);
});

test("classifies explicit context window rejection from provider codes", () => {
    const fromCode = classifyContextWindowRejection({ status: 400, code: "context_length_exceeded" });
    assert.ok(fromCode instanceof ContextWindowRejectedError);
    assert.equal(fromCode.status, 400);
    assert.equal(fromCode.providerCode, "context_length_exceeded");

    const fromErrorBody = classifyContextWindowRejection({
        status: 400,
        error: { type: "invalid_request_error", message: "prompt is too long: 250000 tokens" },
    });
    assert.ok(fromErrorBody instanceof ContextWindowRejectedError);

    const fromGeminiMessage = classifyContextWindowRejection({
        status: 400,
        error: { message: "The input token count (200000) exceeds the maximum number of tokens allowed (100000)" },
    });
    assert.ok(fromGeminiMessage instanceof ContextWindowRejectedError);
});

test("classifies explicit context window rejection from rejection phrases", () => {
    assert.ok(classifyContextWindowRejection({
        status: 400,
        message: "This model's maximum context length is 128000 tokens",
    }) instanceof ContextWindowRejectedError);
    assert.ok(classifyContextWindowRejection({
        status: 422,
        message: "Too many tokens in the input",
    }) instanceof ContextWindowRejectedError);
    assert.equal(classifyContextWindowRejection({
        status: 413,
        message: "Request too large for this model",
    }), undefined);
});

test("does not classify non-window failures as context window rejection", () => {
    assert.equal(classifyContextWindowRejection({ status: 401, message: "maximum context length" }), undefined);
    assert.equal(classifyContextWindowRejection({ status: 400, message: "invalid tool schema" }), undefined);
    assert.equal(classifyContextWindowRejection({ status: 429, code: "context_length_exceeded" }), undefined);
    assert.equal(classifyContextWindowRejection({ message: "maximum context length" }), undefined);
    assert.equal(classifyContextWindowRejection(new Error("maximum context length")), undefined);
    assert.equal(classifyContextWindowRejection(undefined), undefined);
});
