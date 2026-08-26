import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest, LLMResponse } from "../../llm/src/core/types";
import type {
    DiagnosticTraceSink,
    Goal,
} from "../../runtime/src/index";
import { createGoal } from "../../runtime/src/index";
import {
    createDefaultPromptBundleRenderer,
    DropOldestContextCompactor,
    LLMPreparationExecutor,
    LLMStepExecutor,
} from "../src/index";

const renderer = await createDefaultPromptBundleRenderer();
const contextCompactor = new DropOldestContextCompactor();

const profile = {
    id: "profile-1",
    systemPrompt: "You are a trace test agent.",
    instructions: [],
    toolIds: [],
} as const;

function createGoalForPhase(
    phase: "gathering_context" | "executing" = "executing",
): Goal {
    const created = createGoal({
        id: "goal-trace",
        intent: "验证诊断",
        promptBundleVersion: 1,
        profile,
        runId: "run-trace",
    });

    if (phase === "gathering_context") return created;

    return {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: {
                    objective: "验证诊断",
                    completionCriteria: ["Trace 可读"],
                },
            },
            run: {
                ...created.state.run,
                status: "running",
            },
        },
    };
}

class CaptureTraceSink implements DiagnosticTraceSink {
    readonly records: unknown[] = [];

    async append(record: Parameters<DiagnosticTraceSink["append"]>[0]): Promise<void> {
        this.records.push(record);
    }
}

class ResponseAdapter implements LLMAdapter {
    constructor(private readonly response: LLMResponse) {}

    async generate(_request: LLMRequest): Promise<LLMResponse> {
        return this.response;
    }
}

class FailingTraceSink implements DiagnosticTraceSink {
    async append(): Promise<void> {
        throw new Error("trace unavailable");
    }
}

test("LLMStepExecutor records bounded request/response diagnostics with redaction", async () => {
    const response = {
        content: JSON.stringify({
            kind: "complete",
            checkpoint: "证据已记录",
            summary: "完成",
        }),
        providerRequestId: "request-1",
        apiKey: "must-not-be-written",
    } as unknown as LLMResponse;
    const adapter = new ResponseAdapter(response);
    const traceSink = new CaptureTraceSink();
    const result = await new LLMStepExecutor({
        adapter,
        renderer,
        contextCompactor,
        traceSink,
    }).execute(createGoalForPhase(), []);

    assert.equal(result.kind, "complete");
    assert.deepEqual(
        traceSink.records.map((record) => (record as { kind: string }).kind),
        ["model_request", "model_response"],
    );
    const responseRecord = traceSink.records[1] as {
        readonly payload: {
            readonly providerMetadata?: {
                readonly providerRequestId?: string;
                readonly apiKey?: string;
            };
        };
    };
    assert.equal(responseRecord.payload.providerMetadata?.providerRequestId, "request-1");
    assert.equal(responseRecord.payload.providerMetadata?.apiKey, "[REDACTED]");
    assert.equal(
        (traceSink.records[0] as { readonly payload: unknown }).payload !== undefined,
        true,
    );
});

test("LLM diagnostics apply a total size bound and do not require a working TraceSink", async () => {
    const longResponse = {
        content: JSON.stringify({
            kind: "complete",
            checkpoint: "完成",
            summary: "x".repeat(40_000),
        }),
    };
    const traceSink = new CaptureTraceSink();
    const result = await new LLMStepExecutor({
        adapter: new ResponseAdapter(longResponse),
        renderer,
        contextCompactor,
        traceSink,
    }).execute(createGoalForPhase(), []);

    assert.equal(result.kind, "complete");
    const responseRecord = traceSink.records[1] as {
        readonly payload: unknown;
    };
    const serializedPayload = JSON.stringify(responseRecord.payload);
    assert.ok(serializedPayload.length <= 24_000);
    assert.match(serializedPayload, /\[TRUNCATED\]/);

    const isolatedResult = await new LLMStepExecutor({
        adapter: new ResponseAdapter({
            content: JSON.stringify({
                kind: "complete",
                checkpoint: "完成",
                summary: "Trace 失败不改变结果",
            }),
        }),
        renderer,
        contextCompactor,
        traceSink: new FailingTraceSink(),
    }).execute(createGoalForPhase(), []);
    assert.equal(isolatedResult.kind, "complete");
});

test("LLMPreparationExecutor records response parse failures without changing the protocol error", async () => {
    const traceSink = new CaptureTraceSink();
    await assert.rejects(
        new LLMPreparationExecutor({
            adapter: new ResponseAdapter({ content: "not-json" }),
            renderer,
            contextCompactor,
            traceSink,
        }).execute(createGoalForPhase("gathering_context"), []),
    );
    assert.deepEqual(
        traceSink.records.map((record) => (record as { kind: string }).kind),
        ["model_request", "model_response", "model_error"],
    );
});
