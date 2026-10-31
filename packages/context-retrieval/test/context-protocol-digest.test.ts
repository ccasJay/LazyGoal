import assert from "node:assert/strict";
import { test } from "node:test";

import type { ContextLookupRequest } from "../../model-contracts/src/index";
import { createContextLookupQueryHash, normalizeContextLookupRequest, createContextRetrievalQueryKey, CONTEXT_RETRIEVAL_INDEX_VERSION } from "../src/index";
import { createContextLookupId } from "../../runtime/src/context-retrieval";

const request: ContextLookupRequest = {
    kind: "context_lookup",
    need: "historical_execution",
    question: "读取配置文件",
    filters: {
        eventTypes: ["observation_recorded", "decision_recorded"],
        toolIds: ["read_file"],
        stepIndexes: [3, 1],
        paths: ["src/config.ts"],
        sequenceRange: { from: 1, to: 42 },
    },
};

test("createContextLookupQueryHash 固定含 filters 请求的规范化摘要", () => {
    assert.equal(
        createContextLookupQueryHash(request),
        "2bec7cef8ca31a799fbf23bd20d8beed45c4729b2206fc37a2d237f7a5b93bc6",
    );
});

test("空过滤字段规范化后与省略具有相同查询身份", () => {
    const base: ContextLookupRequest = { kind: "context_lookup", need: "historical_execution", question: "find" };
    for (const field of ["eventTypes", "toolIds", "actionIds", "stepIndexes", "paths", "errorCodes", "objectIds"]) {
        const input = { ...base, filters: { [field]: [] } };
        assert.deepEqual(normalizeContextLookupRequest(input), base, field);
        assert.equal(createContextLookupQueryHash(input), createContextLookupQueryHash(base));
        assert.equal(createContextLookupId("goal", "run", input), createContextLookupId("goal", "run", base));
        const query = { question: "find", committedThroughSequence: 1, indexVersion: CONTEXT_RETRIEVAL_INDEX_VERSION };
        assert.equal(createContextRetrievalQueryKey({ ...query, filters: input.filters }), createContextRetrievalQueryKey(query));
        const valid = field === "stepIndexes" ? 1 : "value";
        assert.deepEqual(normalizeContextLookupRequest({ ...base, filters: { [field]: [valid] } }).filters, { [field]: [valid] });
        assert.throws(() => normalizeContextLookupRequest({ ...base, filters: { [field]: [field === "stepIndexes" ? -1 : " "] } }));
        assert.throws(() => normalizeContextLookupRequest({ ...base, filters: { [field]: Array(17).fill(valid) } }));
    }
    assert.deepEqual(normalizeContextLookupRequest({ ...base, filters: { actionIds: [], paths: [], toolIds: ["read_file"], sequenceRange: { from: 1, to: 5 } } }).filters,
        { toolIds: ["read_file"], sequenceRange: { from: 1, to: 5 } });
});

test("过滤器顺序不影响 query hash", () => {
    const reordered: ContextLookupRequest = {
        ...request,
        filters: {
            eventTypes: ["decision_recorded", "observation_recorded"],
            toolIds: ["read_file"],
            stepIndexes: [1, 3],
            paths: ["src/config.ts"],
            sequenceRange: { from: 1, to: 42 },
        },
    };

    assert.equal(
        createContextLookupQueryHash(reordered),
        createContextLookupQueryHash(request),
    );
});
