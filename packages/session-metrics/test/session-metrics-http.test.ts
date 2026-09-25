import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { test } from "node:test";

import { createHttpService } from "../../http/src/index";
import { createGoal } from "../../runtime/src/domain";
import type {
    MetricsStore,
    ModelCallMetricsCoverage,
    ModelCallMetricsCoverageStore,
    ModelCallMetricRecord,
} from "../../runtime/src/model-call-metrics";
import { createSessionMetricsRoutes, SessionMetricsService } from "../src/index";

const profile = {
    id: "http-metrics-profile",
    systemPrompt: "测试指标 HTTP 路由。",
    instructions: ["返回完成"],
    toolIds: [],
};
const protocols = {
    memoryProtocol: { kind: "structured" as const, version: 1 as const },
    modelContextProtocol: { kind: "trajectory-layered" as const, version: 1 as const },
    contextRetrievalProtocol: { kind: "bm25-lite" as const, version: 1 as const },
};

function createHarness() {
    let goal = createGoal({
        id: "goal-http-metrics",
        intent: "测试 HTTP 指标",
        promptBundleVersion: 1,
        ...protocols,
        profile,
        runId: "run-http-metrics",
    });
    const records: ModelCallMetricRecord[] = [];
    let failReads = false;
    let coverage: ModelCallMetricsCoverage = {
        goalId: goal.id,
        historyCovered: true,
        gaps: [],
    };
    const goals = { async restore(goalId: string) { return goalId === goal.id ? goal : undefined; } };
    const metrics: MetricsStore = {
        async append(record) { records.push(record); },
        async read({ runId }) {
            if (failReads) throw new Error("private storage failure");
            return records.filter((record) => record.runId === runId);
        },
    };
    const coverageStore: ModelCallMetricsCoverageStore = {
        async initializeGoal(goalId, historyCovered) {
            coverage ??= { goalId, historyCovered, gaps: [] };
        },
        async recordGap(gap) { coverage = { ...coverage, gaps: [...coverage.gaps, gap] }; },
        async readCoverage() { return coverage; },
    };
    const service = new SessionMetricsService(goals, metrics, coverageStore);
    return {
        service,
        records,
        setFailReads(value: boolean) { failReads = value; },
        setStepCount(stepCount: number) {
            goal = { ...goal, state: { ...goal.state, run: { ...goal.state.run, stepCount } } };
        },
    };
}

async function startRoutes(service: SessionMetricsService) {
    const http = createHttpService();
    http.mount("/", createSessionMetricsRoutes(service));
    const address = await http.start(0);
    return { http, origin: address.origin };
}

function parseLastSseData(chunk: string): { event: string; data: string } {
    const event = chunk.match(/event: ([^\n]+)/)?.[1];
    const data = chunk.match(/data: ([^\n]+)/)?.[1];
    assert.ok(event);
    assert.ok(data);
    return { event, data };
}

function requestWithHost(origin: string, pathname: string, host: string): Promise<{ status: number; body: string }> {
    const url = new URL(origin);
    return new Promise((resolve, reject) => {
        const request = httpRequest({
            hostname: url.hostname,
            port: Number(url.port),
            path: pathname,
            headers: { host },
        }, (response) => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => { body += chunk; });
            response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
        });
        request.on("error", reject);
        request.end();
    });
}

test("Session metrics JSON route distinguishes missing Goals and read failures without CORS access", async () => {
    const harness = createHarness();
    const { http, origin } = await startRoutes(harness.service);

    try {
        const response = await fetch(`${origin}/goals/goal-http-metrics/metrics`);
        assert.equal(response.status, 200);
        const snapshot = await response.json() as { goalId: string; roundCount: number; coverage: string };
        assert.equal(snapshot.goalId, "goal-http-metrics");
        assert.equal(snapshot.roundCount, 0);
        assert.equal(snapshot.coverage, "complete");
        assert.equal(response.headers.get("access-control-allow-origin"), null);

        const missing = await fetch(`${origin}/goals/no-such-goal/metrics`);
        assert.equal(missing.status, 404);
        assert.deepEqual(await missing.json(), { error: "goal_not_found" });

        harness.setFailReads(true);
        const failed = await fetch(`${origin}/goals/goal-http-metrics/metrics`);
        assert.equal(failed.status, 503);
        const failedBody = await failed.text();
        assert.deepEqual(JSON.parse(failedBody), { error: "metrics_unavailable" });
        assert.equal(failedBody.includes("private storage failure"), false);
    } finally {
        await http.close();
    }
});

test("Session metrics routes reject invalid Host, cross-origin and non-GET requests", async () => {
    const harness = createHarness();
    const { http, origin } = await startRoutes(harness.service);

    try {
        const invalidHost = await requestWithHost(
            origin,
            "/goals/goal-http-metrics/metrics",
            "attacker.example",
        );
        assert.equal(invalidHost.status, 400);
        assert.deepEqual(JSON.parse(invalidHost.body), { error: "invalid_host" });

        const crossOrigin = await fetch(`${origin}/goals/goal-http-metrics/metrics`, {
            headers: { origin: "https://attacker.example" },
        });
        assert.equal(crossOrigin.status, 403);
        assert.deepEqual(await crossOrigin.json(), { error: "cross_origin_denied" });
        assert.equal(crossOrigin.headers.get("access-control-allow-origin"), null);

        const sameOrigin = await fetch(`${origin}/goals/goal-http-metrics/metrics`, {
            headers: { origin },
        });
        assert.equal(sameOrigin.status, 200);

        const mutation = await fetch(`${origin}/goals/goal-http-metrics/metrics`, { method: "POST" });
        assert.equal(mutation.status, 405);
        assert.deepEqual(await mutation.json(), { error: "method_not_allowed" });
        assert.equal(harness.records.length, 0);
    } finally {
        await http.close();
    }
});

test("Session metrics SSE sends initial and updated snapshots, then releases on disconnect", async () => {
    const harness = createHarness();
    const { http, origin } = await startRoutes(harness.service);
    const controller = new AbortController();

    try {
        const response = await fetch(`${origin}/goals/goal-http-metrics/metrics/stream`, {
            signal: controller.signal,
        });
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
        const reader = response.body!.getReader();

        const first = parseLastSseData(new TextDecoder().decode((await reader.read()).value));
        assert.equal(first.event, "snapshot");
        assert.equal(JSON.parse(first.data).goalId, "goal-http-metrics");

        const started: ModelCallMetricRecord = {
            recordType: "call_started",
            goalId: "goal-http-metrics",
            runId: "run-http-metrics",
            callId: "call-http",
            occurredAt: new Date().toISOString(),
        };
        await harness.service.record(started);
        const active = parseLastSseData(new TextDecoder().decode((await reader.read()).value));
        assert.equal(active.event, "snapshot");
        assert.equal(JSON.parse(active.data).missingCalls, 0);

        await harness.service.record({
            ...started,
            recordType: "call_finished",
            occurredAt: new Date().toISOString(),
            outcome: "completed",
            usage: { source: "provider_reported", inputTokens: 18, outputTokens: 6 },
        });
        const complete = parseLastSseData(new TextDecoder().decode((await reader.read()).value));
        assert.equal(JSON.parse(complete.data).inputTokens, 18);

        harness.setStepCount(1);
        harness.service.notifyGoalSaved("goal-http-metrics");
        const goalUpdate = parseLastSseData(new TextDecoder().decode((await reader.read()).value));
        assert.equal(JSON.parse(goalUpdate.data).stepCount, 1);

        await reader.cancel();
        controller.abort();
        await harness.service.record({ ...started, callId: "after-disconnect" });
    } finally {
        controller.abort();
        await http.close();
    }
});

test("Session metrics SSE reports a later read failure as a generic error event and closes", async () => {
    const harness = createHarness();
    const { http, origin } = await startRoutes(harness.service);

    try {
        const response = await fetch(`${origin}/goals/goal-http-metrics/metrics/stream`);
        const reader = response.body!.getReader();
        const first = parseLastSseData(new TextDecoder().decode((await reader.read()).value));
        assert.equal(first.event, "snapshot");
        harness.setFailReads(true);
        harness.service.notifyGoalSaved("goal-http-metrics");
        const failed = parseLastSseData(new TextDecoder().decode((await reader.read()).value));
        assert.equal(failed.event, "error");
        assert.deepEqual(JSON.parse(failed.data), { error: "metrics_unavailable" });
        await reader.cancel();
    } finally {
        await http.close();
    }
});

test("Session metric writes continue while an SSE client stops consuming updates", async () => {
    const harness = createHarness();
    const { http, origin } = await startRoutes(harness.service);

    try {
        const response = await fetch(`${origin}/goals/goal-http-metrics/metrics/stream`);
        const reader = response.body!.getReader();
        const initial = parseLastSseData(new TextDecoder().decode((await reader.read()).value));
        assert.equal(initial.event, "snapshot");

        for (let index = 0; index < 20; index += 1) {
            const callId = `slow-client-${index}`;
            await harness.service.record({
                recordType: "call_started",
                goalId: "goal-http-metrics",
                runId: "run-http-metrics",
                callId,
                occurredAt: new Date().toISOString(),
            });
            await harness.service.record({
                recordType: "call_finished",
                goalId: "goal-http-metrics",
                runId: "run-http-metrics",
                callId,
                occurredAt: new Date().toISOString(),
                outcome: "completed",
                usage: { source: "provider_reported", inputTokens: 2, outputTokens: 1 },
            });
        }

        await reader.cancel();
    } finally {
        await http.close();
    }
});
