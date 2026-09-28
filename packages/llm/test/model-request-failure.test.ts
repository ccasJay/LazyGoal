import assert from "node:assert/strict";
import { test } from "node:test";

import { TransientModelRequestFailure } from "../../runtime/src/model-request-failure";
import { classifyTransientModelFailure } from "../src/core/model-request-failure";

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
