import { CONTEXT_LOOKUP_SOURCE_SCOPE } from "../src/context-lookup-projection";
import assert from "node:assert/strict";
import { test } from "node:test";

import type { ContextLookupResult } from "../../runtime/src/index";
import {
    CONTEXT_LOOKUP_FRESHNESS_WARNING,
    projectContextLookupResult,
} from "../src/index";

const found: Extract<ContextLookupResult, { readonly status: "found" }> = {
    status: "found",
    lookupId: "lookup-model",
    committedThroughSequence: 4,
    queryHash: "a".repeat(64),
    indexVersion: "fielded-bm25-lite-v1",
    matches: [{
        documentId: "doc-1",
        goalId: "goal-1",
        runId: "run-1",
        firstSequence: 3,
        lastSequence: 4,
        matchedFields: ["path"],
        score: 2.25,
        preview: "读取 src/config.ts",
        truncated: false,
        historical: true,
        sourceEventIds: ["event-3", "event-4"],
    }],
    truncated: false,
};

test("模型投影保留 found 来源并增加历史时效提示", () => {
    const projected = projectContextLookupResult(found);

    assert.equal(projected.status, "found");
    if (projected.status !== "found") return;
    assert.equal(projected.queryHash, found.queryHash);
    assert.equal(projected.indexVersion, found.indexVersion);
    assert.deepEqual(projected.matches[0]?.sourceEventIds, ["event-3", "event-4"]);
    assert.equal(projected.freshness.kind, "historical");
    assert.equal(projected.freshness.committedThroughSequence, 4);
    assert.equal(projected.freshness.warning, CONTEXT_LOOKUP_FRESHNESS_WARNING);
    assert.ok(Object.isFrozen(projected));
    assert.ok(Object.isFrozen(projected.freshness));
    assert.ok(Object.isFrozen(projected.matches));
    assert.ok(Object.isFrozen(projected.matches[0]));
    assert.notStrictEqual(projected.matches, found.matches);
});

test("模型投影不把 not_found 或 lookup_error 替换成历史摘要", () => {
    const notFound = projectContextLookupResult({
        status: "not_found",
        lookupId: "lookup-nope",
        reason: "no_context_match",
    });
    const error = projectContextLookupResult({
        status: "lookup_error",
        lookupId: "lookup-fail",
        code: "INDEX_FAILED",
        message: "index unavailable",
    });

    assert.deepEqual(notFound, {
        ...CONTEXT_LOOKUP_SOURCE_SCOPE,
        status: "not_found",
        lookupId: "lookup-nope",
        reason: "no_context_match",
    });
    assert.deepEqual(error, {
        ...CONTEXT_LOOKUP_SOURCE_SCOPE,
        status: "lookup_error",
        lookupId: "lookup-fail",
        code: "INDEX_FAILED",
        message: "index unavailable",
    });
});

test("模型投影与 Runtime Result 解耦且不会改写输入", () => {
    const before = JSON.stringify(found);
    const projected = projectContextLookupResult(found);
    assert.equal(JSON.stringify(found), before);
    assert.notStrictEqual(projected, found);
});


test("all historical lookup statuses disclose corpus and negative-result limits", () => {
    for (const input of [found, { status: "not_found" as const, lookupId: "empty" }, { status: "lookup_error" as const, lookupId: "error", code: "INDEX_FAILED", message: "Unavailable" }]) {
        const projected = projectContextLookupResult(input);
        assert.equal(projected.sourceScope, "goal_history");
        assert.match(projected.limitations, /not searched/);
        assert.match(projected.limitations, /does not prove/);
        assert.match(projected.limitations, /not direct/);
        assert.equal(projected.status, input.status);
    }
});
