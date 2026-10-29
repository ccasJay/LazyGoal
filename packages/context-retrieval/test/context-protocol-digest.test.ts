import assert from "node:assert/strict";
import { test } from "node:test";

import type { ContextLookupRequest } from "../../model-contracts/src/index";
import { createContextLookupQueryHash } from "../src/index";

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
