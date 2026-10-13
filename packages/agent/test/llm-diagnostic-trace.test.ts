import assert from "node:assert/strict";
import { test } from "node:test";

import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest, LLMResponse } from "../../llm/src/core/types";
import type {
    DiagnosticTraceSink,
    Goal,
    AgentProfile,
} from "../../runtime/src/index";
import { createGoal, ModelStageFeedbackError } from "../../runtime/src/index";
import {
    createDefaultPromptBundleRenderer,
    DropOldestContextCompactor,
    LLMStepExecutor,
} from "../src/index";
import {
    createCurrentContextAssembler,
    currentProtocols,
    currentWorkingMemory,
} from "./current-fixtures";

const renderer = await createDefaultPromptBundleRenderer();
const contextCompactor = new DropOldestContextCompactor();

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "系统助手",
    instructions: ["按规范执行"],
    toolIds: [],
};

function createGoalForPhase(): Goal {
    const created = createGoal({
        id: "goal-trace",
        intent: "验证诊断 Trace",
        promptBundleVersion: 1,
        ...currentProtocols,
        profile,
        runId: "run-trace",
    });

    return {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "executing",
            },
            run: {
                ...created.state.run,
                status: "running",

                mode: "plan", approvedTask: {
                    objective: "验证诊断",
                    completionCriteria: [{ text: "Trace 可读" }],
                },
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
    readonly structuredOutputMode = "strict" as const;
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
            result: {
                kind: "complete",
                summary: "完成",
                completionEvidence: [],
                memoryPatch: null,
                contextNotes: null,
            },
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
        trajectoryContextAssembler: createCurrentContextAssembler(),
    }).execute({
        goal: createGoalForPhase(),
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    });

    assert.equal(result.kind, "complete");
    assert.deepEqual(
        traceSink.records.map((record) => (record as { kind: string }).kind).filter(kind => kind !== "model_tool_schema"),
        ["model_request", "model_response"],
    );
    const responseRecord = traceSink.records.find(record => (record as { kind: string }).kind === "model_response") as {
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

test("LLMStepExecutor records providerMetadata.usage in model_response trace without redaction", async () => {
    const response = {
        content: JSON.stringify({
            result: {
                kind: "complete",
                summary: "完成",
                completionEvidence: [],
                memoryPatch: null,
                contextNotes: null,
            },
        }),
        providerMetadata: {
            requestId: "request-usage-1",
            usage: { inputTokens: 120, outputTokens: 34, cachedInputTokens: 50 },
        },
    } as unknown as LLMResponse;
    const traceSink = new CaptureTraceSink();
    const result = await new LLMStepExecutor({
        adapter: new ResponseAdapter(response),
        renderer,
        contextCompactor,
        traceSink,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    }).execute({
        goal: createGoalForPhase(),
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    });

    assert.equal(result.kind, "complete");
    const responseRecord = traceSink.records.find(record => (record as { kind: string }).kind === "model_response") as {
        readonly payload: {
            readonly providerMetadata?: {
                readonly requestId?: string;
                readonly usage?: unknown;
            };
        };
    };
    assert.equal(
        responseRecord.payload.providerMetadata?.requestId,
        "request-usage-1",
    );
    assert.deepEqual(responseRecord.payload.providerMetadata?.usage, {
        inputTokens: 120,
        outputTokens: 34,
        cachedInputTokens: 50,
    });
});

test("LLMStepExecutor omits usage field in model_response trace when providerMetadata has none", async () => {
    const response = {
        content: JSON.stringify({
            result: {
                kind: "complete",
                summary: "完成",
                completionEvidence: [],
                memoryPatch: null,
                contextNotes: null,
            },
        }),
        providerMetadata: {
            requestId: "request-usage-2",
        },
    } as unknown as LLMResponse;
    const traceSink = new CaptureTraceSink();
    await new LLMStepExecutor({
        adapter: new ResponseAdapter(response),
        renderer,
        contextCompactor,
        traceSink,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    }).execute({
        goal: createGoalForPhase(),
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    });

    const responseRecord = traceSink.records.find(record => (record as { kind: string }).kind === "model_response") as {
        readonly payload: {
            readonly providerMetadata?: Record<string, unknown>;
        };
    };
    assert.equal(responseRecord.payload.providerMetadata?.usage, undefined);
});

test("LLM diagnostics apply a total size bound and do not require a working TraceSink", async () => {
    const longResponse = {
        content: JSON.stringify({
            result: {
                kind: "complete",
                summary: "x".repeat(40_000),
                completionEvidence: [],
                memoryPatch: null,
                contextNotes: null,
            },
        }),
    };
    const traceSink = new CaptureTraceSink();
    const result = await new LLMStepExecutor({
        adapter: new ResponseAdapter(longResponse),
        renderer,
        contextCompactor,
        traceSink,
        trajectoryContextAssembler: createCurrentContextAssembler(),
    }).execute({
        goal: createGoalForPhase(),
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    });

    assert.equal(result.kind, "complete");
    const responseRecord = traceSink.records.find(record => (record as { kind: string }).kind === "model_response") as {
        readonly payload: unknown;
    };
    const serializedPayload = JSON.stringify(responseRecord.payload);
    assert.ok(serializedPayload.length <= 24_000);
    assert.match(serializedPayload, /\[TRUNCATED\]/);

    const isolatedResult = await new LLMStepExecutor({
        adapter: new ResponseAdapter({
            content: JSON.stringify({
                result: {
                    kind: "complete",
                    summary: "Trace 失败不改变结果",
                    completionEvidence: [],
                    memoryPatch: null,
                    contextNotes: null,
                },
            }),
        }),
        renderer,
        contextCompactor,
        traceSink: new FailingTraceSink(),
        trajectoryContextAssembler: createCurrentContextAssembler(),
    }).execute({
        goal: createGoalForPhase(),
        authorizedTools: [],
        workingMemory: currentWorkingMemory,
    });
    assert.equal(isolatedResult.kind, "complete");
});

test("LLMStepExecutor records response parse failures without changing the protocol error", async () => {
    const traceSink = new CaptureTraceSink();
    await assert.rejects(
        new LLMStepExecutor({
            adapter: new ResponseAdapter({ content: "not-json" }),
            renderer,
            contextCompactor,
            traceSink,
            trajectoryContextAssembler: createCurrentContextAssembler(),
        }).execute({
            goal: createGoalForPhase(),
            authorizedTools: [],
            workingMemory: currentWorkingMemory,
        }),
    );
    assert.deepEqual(
        traceSink.records.map((record) => (record as { kind: string }).kind).filter(kind => kind !== "model_tool_schema"),
        ["model_request", "model_response", "model_error"],
    );
});

test("invalid native arguments retain correlated response, sent schema and validation issues", async () => {
    const traceSink = new CaptureTraceSink();
    let sentRequest: LLMRequest | undefined;
    const identity = { provider: "google" as const, endpoint: "https://example.test", model: "fixture", protocol: "gemini-content" as const };
    const args = { summary: "Done", completionEvidence: [], memoryPatch: null, protocolVersion: 1 };
    const adapter: LLMAdapter = {
        structuredOutputMode: "strict", nativeConversationIdentity: identity,
        async generate(request) {
            sentRequest = request;
            return { content: "", toolCalls: [{ callId: "invalid-call", toolId: "system_complete_task", argumentsJson: JSON.stringify(args) }],
                continuation: { identity, parts: [{ functionCall: { name: "system_complete_task", args, id: "invalid-call" } }] } };
        },
    };
    await assert.rejects(new LLMStepExecutor({ adapter, renderer, contextCompactor, traceSink,
        modelInputStore: { append: async () => {}, read: async () => [] },
        trajectoryContextAssembler: createCurrentContextAssembler() }).execute({ goal: createGoalForPhase(), authorizedTools: [], workingMemory: currentWorkingMemory }), error => {
        assert.ok(error instanceof ModelStageFeedbackError);
        const feedback = JSON.stringify(error.feedback);
        assert.ok(feedback.includes("Provided fields: summary, completionEvidence, memoryPatch, protocolVersion"));
        assert.ok(feedback.includes("Required fields: summary, completionEvidence, memoryPatch"));
        assert.ok(!feedback.includes("Done"));
        return true;
    });
    const records = traceSink.records as { kind: string; payload: any }[];
    const request = records.find(r => r.kind === "model_request")!.payload;
    const response = records.find(r => r.kind === "model_response")!.payload;
    const error = records.find(r => r.kind === "model_error")!.payload;
    assert.equal(typeof request.callId, "string");
    assert.equal(response.callId, request.callId);
    assert.equal(error.callId, request.callId);
    const schema = records.find(r => r.kind === "model_tool_schema" && r.payload.toolId === "system_complete_task")!.payload;
    assert.equal(schema.callId, request.callId);
    assert.deepEqual(schema.parametersSchema, sentRequest!.tools!.find(t => t.id === "system_complete_task")!.parametersSchema);
    assert.equal(response.toolCalls[0].argumentsJson, JSON.stringify(args));
    assert.ok(error.error.issues.some((issue: any) => issue.code === "extra_field" && issue.path.join(".") === "protocolVersion"));
});


test("malformed JSON and undeclared tools do not produce a declared shape", async () => {
    for (const call of [{ toolId: "system_complete_task", argumentsJson: "not-json" }, { toolId: "unknown_tool", argumentsJson: '{"summary":"PRIVATE_VALUE"}' }]) {
        const adapter: LLMAdapter = { structuredOutputMode: "strict", generate: async () => ({ content: "", toolCalls: [{ callId: "bad", ...call }] }) };
        await assert.rejects(new LLMStepExecutor({ adapter, renderer, contextCompactor,
            trajectoryContextAssembler: createCurrentContextAssembler() }).execute({ goal: createGoalForPhase(), authorizedTools: [], workingMemory: currentWorkingMemory }), error => {
            assert.ok(error instanceof ModelStageFeedbackError);
            assert.ok(!JSON.stringify(error.feedback).includes("Provided fields"));
            assert.ok(!JSON.stringify(error.feedback).includes("PRIVATE_VALUE"));
            return true;
        });
    }
});
