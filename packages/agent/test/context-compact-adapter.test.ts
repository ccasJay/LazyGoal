import assert from "node:assert/strict";
import { test } from "node:test";

import {
    ContextCompactAdapter,
    createTokenModelInputEstimator,
} from "../src/index";
import type {
    ContextCompactInput,
    WarmCompactEntry,
} from "../src/index";
import type { LLMRequest, LLMResponse } from "../../llm/src/core/types";
import type { DiagnosticTraceSink, TraceRecord } from "../../runtime/src/index";

test("无 overflow 候选时 Compact 不调用模型并返回确定性回退", async () => {
    let calls = 0;
    const adapter = new ContextCompactAdapter({
        adapter: {
            async generate(): Promise<LLMResponse> {
                calls += 1;
                return { content: "{}" };
            },
        },
    });

    const result = await adapter.compact({
        ...input(),
        overflowCandidates: [],
    });

    assert.equal(calls, 0);
    assert.equal(result.accepted, false);
    assert.equal(result.failureReason, "no_candidates");
    assert.deepEqual(result.entries, []);
});

test("Compact 对严格 JSON 响应执行单次调用、来源校验和预算报告", async () => {
    const traces = new RecordingTraceSink();
    let calls = 0;
    const candidate = entry({ id: "candidate", evidenceSequences: [12], firstSequence: 12, lastSequence: 12 });
    const responseEntry = entry({
        id: "compact-finding",
        summary: "combined finding",
        evidenceSequences: [12],
        firstSequence: 12,
        lastSequence: 12,
        lastAccessedSequence: 12,
        sourceHash: "sha256:combined",
    });
    let capturedRequest: LLMRequest | undefined;
    const adapter = new ContextCompactAdapter({
        traceSink: traces,
        adapter: {
            async generate(request): Promise<LLMResponse> {
                calls += 1;
                capturedRequest = request;
                return {
                    content: JSON.stringify({ schemaVersion: 1, entries: [responseEntry] }),
                    providerMetadata: { requestId: "compact-1" },
                };
            },
        },
    });

    const result = await adapter.compact({
        ...input(),
        overflowCandidates: [candidate],
    });

    assert.equal(calls, 1);
    assert.equal(result.accepted, true);
    assert.equal(result.failureReason, undefined);
    assert.deepEqual(result.entries.map((item) => item.id), ["compact-finding"]);
    assert.equal(result.requestMeasurement > 0, true);
    assert.equal(result.responseMeasurement > 0, true);
    assert.equal(capturedRequest?.messages[0]?.role, "system");
    assert.equal(capturedRequest?.messages[1]?.role, "user");
    assert.match(capturedRequest?.messages[1]?.content ?? "", /overflowCandidates/);
    assert.deepEqual(traces.records.map((record) => record.kind), [
        "context_compact_request",
        "context_compact_response",
    ]);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.entries), true);
});

test("Compact 严格拒绝非法 JSON、额外字段、无来源和 superseded 输出", async () => {
    const responses = [
        "not json",
        JSON.stringify({ schemaVersion: 1, entries: [{ ...entry({}), task: "forbidden" }] }),
        JSON.stringify({
            schemaVersion: 1,
            entries: [entry({ evidenceSequences: [999], firstSequence: 999, lastSequence: 999 })],
        }),
        JSON.stringify({ schemaVersion: 1, entries: [entry({ status: "superseded" })] }),
    ];
    for (const content of responses) {
        let calls = 0;
        const adapter = new ContextCompactAdapter({
            adapter: {
                async generate(): Promise<LLMResponse> {
                    calls += 1;
                    return { content };
                },
            },
        });
        const result = await adapter.compact(input());

        assert.equal(calls, 1);
        assert.equal(result.accepted, false);
        assert.equal(result.failureReason, "invalid_response");
        assert.deepEqual(result.entries, []);
    }
});

test("Compact 响应超出剩余预算时回退，不污染输入条目", async () => {
    const source = input();
    const before = structuredClone(source);
    const large = entry({ summary: "x".repeat(200) });
    const adapter = new ContextCompactAdapter({
        adapter: {
            async generate(): Promise<LLMResponse> {
                return { content: JSON.stringify({ schemaVersion: 1, entries: [large] }) };
            },
        },
    });
    const result = await adapter.compact({ ...source, remainingBudget: 10 });

    assert.equal(result.accepted, false);
    assert.equal(result.failureReason, "over_budget");
    assert.deepEqual(source, before);
});

test("Provider 失败只产生诊断并回退，Adapter 不重试；中止仍传播", async () => {
    let calls = 0;
    const traces = new RecordingTraceSink();
    const adapter = new ContextCompactAdapter({
        traceSink: traces,
        adapter: {
            async generate(): Promise<LLMResponse> {
                calls += 1;
                throw new Error("provider down");
            },
        },
    });
    const result = await adapter.compact(input());

    assert.equal(calls, 1);
    assert.equal(result.accepted, false);
    assert.equal(result.failureReason, "adapter");
    assert.deepEqual(traces.records.map((record) => record.kind), [
        "context_compact_request",
        "context_compact_error",
    ]);

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
        adapter.compact(input(), { signal: controller.signal }),
        (error: unknown) => error instanceof Error && error.name === "ExecutionAbortedError",
    );
    assert.equal(calls, 1);
});

test("Compact 可使用 Token estimator，输入单位必须匹配且配置在调用前校验", async () => {
    let calls = 0;
    const tokenEstimator = createTokenModelInputEstimator((value) =>
        typeof value === "string" ? value.length : JSON.stringify(value).length,
    );
    const adapter = new ContextCompactAdapter({
        estimator: tokenEstimator,
        adapter: {
            async generate(): Promise<LLMResponse> {
                calls += 1;
                return { content: JSON.stringify({ schemaVersion: 1, entries: [entry()] }) };
            },
        },
    });

    const result = await adapter.compact({ ...input(), measuredAs: "token" });
    assert.equal(result.accepted, true);
    assert.equal(result.measuredAs, "token");
    assert.equal(calls, 1);
    await assert.rejects(
        adapter.compact({ ...input(), measuredAs: "character" }),
        /measurement unit must match estimator/,
    );
    assert.equal(calls, 1);
});

test("非法 Compact 输入在模型调用前失败", async () => {
    let calls = 0;
    const adapter = new ContextCompactAdapter({
        adapter: {
            async generate(): Promise<LLMResponse> {
                calls += 1;
                return { content: "{}" };
            },
        },
    });

    await assert.rejects(
        adapter.compact({ ...input(), remainingBudget: -1 }),
        /remainingBudget/,
    );
    await assert.rejects(
        adapter.compact({ ...input(), allowedKinds: ["finding", "finding"] }),
        /allowedKinds/,
    );
    assert.equal(calls, 0);
});

function input(): ContextCompactInput {
    return {
        goalId: "goal-1",
        runId: "run-1",
        measuredAs: "character",
        remainingBudget: 10_000,
        existingEntries: [],
        overflowCandidates: [entry()],
        allowedKinds: ["finding", "failure"],
    };
}

function entry(overrides: Partial<WarmCompactEntry> = {}): WarmCompactEntry {
    const firstSequence = overrides.firstSequence ?? 1;
    const lastSequence = overrides.lastSequence ?? firstSequence;
    return {
        id: "finding-1",
        kind: "finding",
        summary: "finding",
        status: "active",
        lossy: true,
        evidenceSequences: [firstSequence],
        firstSequence,
        lastSequence,
        lastAccessedSequence: overrides.lastAccessedSequence ?? lastSequence,
        reinforcementCount: 1,
        sourceHash: "sha256:finding-1",
        ...overrides,
    };
}

class RecordingTraceSink implements DiagnosticTraceSink {
    readonly records: TraceRecord[] = [];

    async append(record: TraceRecord): Promise<void> {
        this.records.push(record);
    }
}
