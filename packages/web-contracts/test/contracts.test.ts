import assert from "node:assert/strict";
import { test } from "node:test";

import * as webContracts from "../src/index";
import {
    browserActivityPageBinding,
    browserControlReceiptBinding,
    browserGoalListItemBinding,
    browserGoalEventBinding,
    browserProviderModelQueryBinding,
    browserProviderProfileTestResultBinding,
    browserSessionInputCommandBinding,
    browserSessionInputReceiptBinding,
    sessionMetricsValuesBinding,
} from "../src/index";
import {
    hasUtf16LengthAtMost,
    isJsonValue,
} from "../src/invariants/index";
import {
    isRecord,
} from "../src/index";

test("all exported generated bindings expose identity, schema and read", () => {
    const bindings = Object.entries(webContracts)
        .filter(([name]) => name.endsWith("Binding"))
        .map(([, value]) => value as {
            readonly contractId: string;
            readonly version: number;
            readonly schema: unknown;
            readonly read: unknown;
        });
    assert.ok(bindings.length >= 55);
    assert.equal(new Set(bindings.map(binding => `${binding.contractId}:${binding.version}`)).size, bindings.length);
    for (const binding of bindings) {
        assert.equal(typeof binding.contractId, "string");
        assert.equal(binding.version, 1);
        assert.equal(typeof binding.schema, "object");
        assert.equal(typeof binding.read, "function");
    }
});

test("generated bindings strip unknown fields and keep input isolated", () => {
    const input = {
        goalId: "goal-1",
        inputId: "input-1",
        kind: "message",
        sequence: 1,
        status: "pending",
        admittedAtRevision: 2,
        debug: "private",
    };
    const result = browserSessionInputReceiptBinding.read(input, "strip");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal("debug" in result.data, false);
    assert.equal(result.diagnostic?.contractId, "web.sessions.input.receipt");
    assert.deepEqual(result.diagnostic?.paths, ["/*"]);
    assert.equal(result.data.goalId, "goal-1");
    assert.equal(input.debug, "private");
    assert.notEqual(result.data, input);
});

test("generated bindings reject invalid known fields and non-JSON values", () => {
    const receipt = {
        goalId: "goal-1",
        inputId: "input-1",
        kind: "message",
        sequence: 1,
        status: "pending",
        admittedAtRevision: 2,
    };
    assert.equal(browserSessionInputReceiptBinding.read({ ...receipt, sequence: 0 }, "strip").ok, false);
    assert.equal(browserSessionInputReceiptBinding.read({ ...receipt, status: "unknown" }, "strip").ok, false);
    assert.equal(browserSessionInputReceiptBinding.read({ ...receipt, inputId: "" }, "strip").ok, false);
    assert.equal(browserSessionInputReceiptBinding.read({ ...receipt, inputId: undefined }, "strip").ok, false);
    assert.equal(browserSessionInputReceiptBinding.read({ ...receipt, extra: () => undefined }, "strip").ok, false);
    assert.equal(browserSessionInputReceiptBinding.read({ ...receipt, extra: new Date() }, "strip").ok, false);
});

test("generated integer annotations reject fractional known values", () => {
    const metrics = {
        stepCount: 1.5,
        reportedCalls: 1,
        missingCalls: 0,
        inputTokens: 1,
        outputTokens: 1,
        coverage: "complete",
        cacheMeasuredCalls: 0,
        cacheExcludedCalls: 0,
        cacheHitRate: 0.5,
        throughputMeasuredCalls: 0,
        throughputExcludedCalls: 0,
        tokensPerSecond: 1,
    };
    assert.equal(sessionMetricsValuesBinding.read(metrics, "strip").ok, false);
    assert.equal(sessionMetricsValuesBinding.read({ ...metrics, stepCount: 2 }, "strip").ok, true);
});

test("Provider query and test result bindings preserve credentials and integer bounds", () => {
    const query = browserProviderModelQueryBinding.read({
        kind: "openai",
        apiKey: "sk-private",
        debug: "private",
    }, "strip");
    assert.equal(query.ok, true);
    if (!query.ok) return;
    assert.equal(query.data.apiKey, "sk-private");
    assert.equal("debug" in query.data, false);
    assert.deepEqual(query.diagnostic?.paths, ["/*"]);
    assert.equal(browserProviderModelQueryBinding.read({ kind: "" }, "strip").ok, false);
    assert.equal(browserProviderModelQueryBinding.read({ kind: "openai", apiKey: null }, "strip").ok, false);

    const success = browserProviderProfileTestResultBinding.read({
        ok: true,
        modelCount: 29,
        debug: "private",
    }, "strip");
    assert.equal(success.ok, true);
    if (!success.ok) return;
    assert.equal("debug" in success.data, false);
    assert.equal(browserProviderProfileTestResultBinding.read({ ok: true, modelCount: 0 }, "strip").ok, false);
    assert.equal(browserProviderProfileTestResultBinding.read({ ok: true, modelCount: 1.5 }, "strip").ok, false);
    assert.equal(
        browserProviderProfileTestResultBinding.read({ ok: true, modelCount: Number.MAX_SAFE_INTEGER + 1 }, "strip").ok,
        false,
    );
    assert.equal(
        browserProviderProfileTestResultBinding.read({ ok: false, error: "model_catalog_authentication" }, "strip").ok,
        true,
    );
});

test("session input union strips branch extras and keeps discriminator", () => {
    const message = browserSessionInputCommandBinding.read({
        kind: "message",
        inputId: "input-1",
        content: "hello",
        debug: "private",
    }, "strip");
    assert.equal(message.ok, true);
    if (message.ok) assert.equal("debug" in message.data, false);

    const steer = browserSessionInputCommandBinding.read({
        kind: "steer",
        inputId: "input-1",
        runId: "run-1",
        content: "go",
        queueBinding: { messageId: "msg-1", queueRevision: 0, debug: true },
    }, "strip");
    assert.equal(steer.ok, true);
    if (steer.ok && steer.data.kind === "steer") {
        assert.equal("debug" in (steer.data.queueBinding ?? {}), false);
    }

    const crossBranch = browserSessionInputCommandBinding.read({
        kind: "message",
        inputId: "input-1",
        content: "hello",
        runId: "run-1",
    }, "strip");
    assert.equal(crossBranch.ok, true);
    if (crossBranch.ok) {
        assert.equal("runId" in crossBranch.data, false);
        assert.deepEqual(crossBranch.diagnostic?.paths, ["/*"]);
    }
});

test("control receipt keeps the result payload that belongs to its command kind", () => {
    const inputReceipt = {
        goalId: "goal-1",
        inputId: "input-1",
        kind: "message",
        sequence: 1,
        status: "applied",
        admittedAtRevision: 1,
    };
    const created = browserControlReceiptBinding.read({
        intentId: "intent-1",
        status: "accepted",
        result: {
            kind: "create_session",
            result: { ok: true, existing: false, goalId: "goal-1", runId: "run-1", receipt: inputReceipt },
        },
    }, "strip");
    assert.equal(created.ok, true);
    if (created.ok && created.data.status === "accepted") {
        assert.equal(created.data.result.kind, "create_session");
        assert.deepEqual(created.data.result.result, {
            ok: true,
            existing: false,
            goalId: "goal-1",
            runId: "run-1",
            receipt: inputReceipt,
        });
    }

    const planned = browserControlReceiptBinding.read({
        intentId: "intent-2",
        status: "existing",
        result: { kind: "plan_mode", result: { ok: true, goalId: "goal-1", runId: "run-1", existing: true } },
    }, "strip");
    assert.equal(planned.ok, true);
    if (planned.ok && planned.data.status === "existing") {
        assert.equal(planned.data.result.kind, "plan_mode");
        assert.deepEqual(planned.data.result.result, { ok: true, goalId: "goal-1", runId: "run-1", existing: true });
    }
});

test("live event binding strips unknown activity metadata", () => {
    const event = browserGoalEventBinding.read({
        type: "activity",
        goalId: "goal-1",
        runId: "run-1",
        activity: {
            kind: "tool_started",
            sourceEventId: "event-1",
            sourceCursor: 1,
            actionId: "action-1",
            executionUnitId: "unit-1",
            toolId: "read_file",
            privatePayload: "hidden",
        },
    }, "strip");
    assert.equal(event.ok, true);
    if (!event.ok || event.data.type !== "activity") return;
    assert.equal("privatePayload" in event.data.activity, false);
    assert.deepEqual(event.diagnostic?.paths, ["/activity/*"]);
});

test("Activity page binding strips item extras and reports bounded paths", () => {
    const page = {
        goalId: "goal-1",
        limit: 50,
        items: [{
            type: "think",
            itemId: "think:1",
            runId: "run-1",
            position: { runId: "run-1", runOrder: 0, sequence: 1, itemKind: "fact", order: 0 },
            think: { goal: "compare", privateReasoning: "hidden" },
            reviewNotes: "private",
        }],
        runs: [],
        window: [],
        gaps: [],
        range: { olderAvailable: false, newerAvailable: false },
        stages: [],
        actionGroups: [],
    };
    const result = browserActivityPageBinding.read(page, "strip");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal("reviewNotes" in result.data.items[0]!, false);
    assert.equal("privateReasoning" in (result.data.items[0] as { think: object }).think, false);
    assert.deepEqual(result.diagnostic?.paths, ["/items/0/*", "/items/0/think/*"]);
});

test("Goal list item binding keeps declared fields and rejects bad enums", () => {
    const item = {
        goalId: "goal-1",
        runId: "run-1",
        intent: "Test intent",
        workflowPhase: "executing",
        runStatus: "running",
        updatedAt: "2026-10-18T00:00:00.000Z",
        archived: false,
    };
    assert.equal(browserGoalListItemBinding.read(item, "strip").ok, true);
    assert.equal(browserGoalListItemBinding.read({ ...item, runStatus: "invalid" }, "strip").ok, false);
});

test("isJsonValue accepts JSON values and rejects non-plain values", () => {
    assert.equal(isJsonValue({ nested: [1, true, null, "text"] }), true);
    assert.equal(isJsonValue(null), true);
    assert.equal(isJsonValue(1.5), true);
    for (const value of [
        undefined,
        () => undefined,
        Symbol("x"),
        1n,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        new Date(),
        new Map(),
        new Set(),
        new (class Example {})(),
        { [Symbol("key")]: 1 },
    ]) {
        assert.equal(isJsonValue(value), false);
    }
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    assert.equal(isJsonValue(cyclic), false);
});

test("isJsonValue accepts deeply nested payloads without host stack recursion", () => {
    let value: unknown = "leaf";
    for (let index = 0; index < 200; index += 1) {
        value = index % 2 === 0 ? [value] : { nested: value };
    }
    assert.equal(isJsonValue(value), true);
});

test("hasUtf16LengthAtMost preserves the UTF-16 unit boundary", () => {
    assert.equal(hasUtf16LengthAtMost("a".repeat(4_000), 4_000), true);
    assert.equal(hasUtf16LengthAtMost("😀".repeat(4_000), 4_000), false);
    assert.equal(hasUtf16LengthAtMost("a".repeat(4_001), 4_000), false);
    assert.equal(hasUtf16LengthAtMost("a".repeat(2_000), 4_000), true);
    assert.equal(hasUtf16LengthAtMost(undefined, 4_000), false);
});

test("isRecord keeps its public predicate name", () => {
    assert.equal(isRecord({}), true);
    assert.equal(isRecord([]), false);
    assert.equal(isRecord(null), false);
});
