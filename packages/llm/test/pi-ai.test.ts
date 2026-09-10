import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import type { AssistantMessage, Context, SimpleStreamOptions } from "@earendil-works/pi-ai";
import { PiAiAdapter, PiAiProviderError } from "../src/pi-ai";
import { createLlmAdapter } from "../src/factory";
import { readLlmConfig, LlmConfigurationError } from "../src/config";
import { LLMRequestModeMismatchError, type LLMRequest } from "../src/core/types";
import { readNormalizedUsage } from "../src/core/usage";
import { ExecutionAbortedError } from "../../runtime/src/execution-control";

const json = '{"answer":"ok"}';
const request: LLMRequest = { messages: [
    { role: "system", content: "First instruction" },
    { role: "system", content: "Second instruction" },
    { role: "user", content: "Earlier question" },
    { role: "assistant", content: "Earlier answer" },
    { role: "user", content: "Return JSON" },
], maxOutputTokens: 100 };

function adapter(provider = "openai", model = "gpt-4.1-mini", baseURL?: string) {
    return new PiAiAdapter(readLlmConfig({
        LLM_PROVIDER: provider, LLM_MODEL: model, LLM_API_KEY: "test-explicit-key",
        LLM_STRUCTURED_OUTPUT_MODE: "prompt_only",
        ...(baseURL === undefined ? {} : { LLM_BASE_URL: baseURL }),
        ...(provider === "openai-compatible" ? { LLM_CONTEXT_WINDOW_TOKENS: "8192", LLM_MAX_OUTPUT_TOKENS: "1024" } : {}),
    }));
}

function result(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
    return {
        role: "assistant", provider: "openai", api: "openai-responses", model: "gpt-4.1-mini",
        content: [{ type: "text", text: json }], stopReason: "stop", timestamp: 0,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        ...overrides,
    };
}

function stub(instance: PiAiAdapter, complete: (context: Context, options: SimpleStreamOptions) => Promise<AssistantMessage>) {
    const internals = instance as unknown as {
        models: { completeSimple(model: unknown, context: Context, options: SimpleStreamOptions): Promise<AssistantMessage> };
    };
    internals.models.completeSimple = (_model, context, options) => complete(context, options);
}

test("PiAiAdapter maps ordered text history and isolates thinking and unverified usage", async () => {
    const instance = adapter();
    const controller = new AbortController();
    stub(instance, async (context, options) => {
        assert.equal(context.systemPrompt, "First instruction\nSecond instruction");
        assert.deepEqual(context.messages.map(m => m.role), ["user", "assistant", "user"]);
        assert.deepEqual(context.messages[1]?.content, [{ type: "text", text: "Earlier answer" }]);
        assert.equal(context.tools, undefined);
        assert.equal(options.signal, controller.signal);
        assert.equal(options.apiKey, "test-explicit-key");
        assert.equal(options.maxTokens, 100);
        return result({ content: [{ type: "thinking", thinking: "private reasoning" }, { type: "text", text: '{"answer":' }, { type: "text", text: '"ok"}' }], responseId: "response-1" });
    });
    const response = await instance.generate(request, { signal: controller.signal });
    assert.equal(response.content, json);
    assert.equal(readNormalizedUsage(response.providerMetadata), undefined);
    assert.deepEqual(response.providerMetadata, {
        provider: "openai", api: "openai-responses", model: "gpt-4.1-mini", responseId: "response-1", stopReason: "stop",
        piUsage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    });
    assert.ok(!JSON.stringify(response).includes("private reasoning"));
});

test("invalid request mode, system placement and output cap fail before dispatch", async () => {
    const instance = adapter();
    stub(instance, async () => { assert.fail("must not dispatch"); });
    await assert.rejects(instance.generate({ ...request, structuredOutput: { name: "test", schema: {} } }), LLMRequestModeMismatchError);
    await assert.rejects(instance.generate({ messages: [{ role: "user", content: "hi" }, { role: "system", content: "late" }] }), /System messages must precede/);
    await assert.rejects(instance.generate({ ...request, maxOutputTokens: 999999999 }), LlmConfigurationError);
});

test("incomplete, erroneous and tool responses never return partial JSON", async () => {
    for (const stopReason of ["pending", "length", "toolUse", "error", "deferred"] as const) {
        const instance = adapter();
        stub(instance, async () => result({ stopReason, errorMessage: "contains secret test-explicit-key" }));
        await assert.rejects(instance.generate(request), (error: unknown) => {
            assert.ok(error instanceof PiAiProviderError);
            assert.equal(error.stopReason, stopReason);
            assert.ok(!error.message.includes("test-explicit-key"));
            return true;
        });
    }
    const instance = adapter();
    stub(instance, async () => result({ content: [{ type: "toolCall", id: "call-1", name: "unexpected", arguments: {} }] }));
    await assert.rejects(instance.generate(request), PiAiProviderError);
});

test("empty text stays empty and thrown SDK exceptions preserve identity", async () => {
    const instance = adapter();
    stub(instance, async () => result({ content: [] }));
    assert.equal((await instance.generate(request)).content, "");
    const failure = new Error("SDK failure");
    stub(instance, async () => { throw failure; });
    await assert.rejects(instance.generate(request), error => error === failure);
});

test("cancellation before dispatch, provider abort and completion race use Runtime abort", async () => {
    const instance = adapter();
    const controller = new AbortController();
    controller.abort();
    stub(instance, async () => { assert.fail("must not dispatch"); });
    await assert.rejects(instance.generate(request, { signal: controller.signal }), ExecutionAbortedError);
    stub(instance, async () => result({ stopReason: "aborted" }));
    await assert.rejects(instance.generate(request), ExecutionAbortedError);
    const race = new AbortController();
    stub(instance, async () => { race.abort(); return result(); });
    await assert.rejects(instance.generate(request, { signal: race.signal }), ExecutionAbortedError);
});

function sse(events: readonly unknown[], named = false): string {
    return events.map(event => `${named ? `event: ${(event as { type: string }).type}\n` : ""}data: ${JSON.stringify(event)}\n\n`).join("");
}

const responsesItem = { type: "message", id: "msg-1", role: "assistant", status: "completed", content: [{ type: "output_text", text: json, annotations: [] }] };
const responseBase = { id: "resp-1", object: "response", model: "gpt-4.1-mini", created_at: 1, status: "in_progress", output: [] };
const responsesBody = sse([
    { type: "response.created", response: responseBase },
    { type: "response.output_item.added", output_index: 0, item: { ...responsesItem, status: "in_progress", content: [] } },
    { type: "response.content_part.added", item_id: "msg-1", output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } },
    { type: "response.output_text.delta", item_id: "msg-1", output_index: 0, content_index: 0, delta: json },
    { type: "response.output_text.done", item_id: "msg-1", output_index: 0, content_index: 0, text: json },
    { type: "response.output_item.done", output_index: 0, item: responsesItem },
    { type: "response.completed", response: { ...responseBase, status: "completed", output: [responsesItem], usage: { input_tokens: 12, output_tokens: 4, input_tokens_details: { cached_tokens: 2 } } } },
]);
const anthropicBody = sse([
    { type: "message_start", message: { id: "msg-1", type: "message", role: "assistant", model: "claude-sonnet-4-5", content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: json } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 4 } },
    { type: "message_stop" },
], true);
const googleBody = sse([{ candidates: [{ content: { role: "model", parts: [{ text: json }] }, finishReason: "STOP", index: 0 }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4, totalTokenCount: 16 } }]);
function completionsBody(finish = "stop"): string {
    return sse([
        { id: "chat-1", object: "chat.completion.chunk", model: "local-model", created: 1, choices: [{ index: 0, delta: { role: "assistant", content: json }, finish_reason: null }] },
        { id: "chat-1", object: "chat.completion.chunk", model: "local-model", created: 1, choices: [{ index: 0, delta: {}, finish_reason: finish }], usage: { prompt_tokens: 12, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 2 } } },
    ]) + "data: [DONE]\n\n";
}

async function withServer(handler: (req: IncomingMessage, res: ServerResponse) => void, run: (url: string) => Promise<void>) {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    try { await run(`http://127.0.0.1:${address.port}`); }
    finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test("Google factory uses the configured API prefix with the real SDK in both output modes", async () => {
    const schema = { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] };
    for (const mode of ["strict", "prompt_only"] as const) {
        for (const prefix of ["/v1", "/gateway/v1beta/"]) {
            const captured: { path: string; key: string | string[] | undefined; body: Record<string, any> }[] = [];
            await withServer((req, res) => {
                let data = "";
                req.on("data", chunk => { data += chunk; });
                req.on("end", () => {
                    captured.push({ path: req.url!, key: req.headers["x-goog-api-key"], body: JSON.parse(data) });
                    res.writeHead(200, { "Content-Type": mode === "strict" ? "application/json" : "text/event-stream" });
                    res.end(mode === "strict"
                        ? JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: json }] }, finishReason: "STOP" }] })
                        : googleBody);
                });
            }, async url => {
                const instance = createLlmAdapter(readLlmConfig({
                    LLM_PROVIDER: "google", LLM_MODEL: "gemini-2.5-flash", LLM_API_KEY: "test-explicit-key",
                    LLM_STRUCTURED_OUTPUT_MODE: mode, LLM_BASE_URL: url + prefix,
                }));
                const response = await instance.generate({
                    ...request,
                    ...(mode === "strict" ? { structuredOutput: { name: "answer", schema } } : {}),
                });
                assert.equal(response.content, json);
            });
            assert.equal(captured.length, 1);
            const sent = captured[0]!;
            const method = mode === "strict" ? "generateContent" : "streamGenerateContent?alt=sse";
            assert.equal(sent.path, `${prefix.replace(/\/$/, "")}/models/gemini-2.5-flash:${method}`);
            assert.equal(sent.key, "test-explicit-key");
            assert.equal(sent.body.generationConfig.responseMimeType, mode === "strict" ? "application/json" : undefined);
            assert.equal(sent.body.generationConfig.responseJsonSchema, undefined);
            assert.deepEqual(sent.body.generationConfig.responseSchema, mode === "strict" ? {
                type: "OBJECT", properties: { answer: { type: "STRING" } }, required: ["answer"],
            } : undefined);
        }
    }
});

test("real pi-ai SDK maps four wire protocols against local SSE servers", async () => {
    for (const [provider, model, body] of [
        ["openai", "gpt-4.1-mini", responsesBody],
        ["anthropic", "claude-sonnet-4-5", anthropicBody],
        ["google", "gemini-2.5-flash", googleBody],
        ["openai-compatible", "local-model", completionsBody()],
    ] as const) {
        const captured: { path: string; headers: IncomingMessage["headers"]; body: Record<string, any> }[] = [];
        await withServer((req, res) => {
            let data = "";
            req.on("data", chunk => { data += chunk; });
            req.on("end", () => {
                captured.push({ path: req.url!, headers: req.headers, body: JSON.parse(data) });
                res.writeHead(200, { "Content-Type": "text/event-stream" });
                res.end(body);
            });
        }, async url => {
            const fetch = globalThis.fetch;
            // Only the transport URL is redirected; the provider SDK still serializes and parses the real protocol.
            globalThis.fetch = async (input, init) => {
                const req = new Request(input, init);
                const original = new URL(req.url);
                return fetch(url + original.pathname + original.search, { method: req.method, headers: req.headers, body: await req.text(), signal: req.signal });
            };
            try {
                const instance = adapter(provider, model, provider === "openai" || provider === "openai-compatible" ? `${url}/v1` : undefined);
                const response = await instance.generate(request);
                assert.equal(response.content, json, provider);
                assert.equal(readNormalizedUsage(response.providerMetadata), undefined);
                const metadata = response.providerMetadata as Record<string, any>;
                assert.ok(metadata.piUsage.output > 0, provider);
                assert.equal(metadata.provider, provider);
            } finally { globalThis.fetch = fetch; }
        });
        assert.equal(captured.length, 1, provider);
        const sent = captured[0]!;
        assert.ok(!JSON.stringify(sent.body).includes("response_format"));
        assert.ok(!JSON.stringify(sent.body).includes("responseJsonSchema"));
        assert.ok(sent.body.tools === undefined || sent.body.tools.length === 0);
        assert.ok(JSON.stringify(sent.body).includes("First instruction\\nSecond instruction"));
        assert.ok(JSON.stringify(sent.body).includes("Earlier answer"));
        if (provider === "openai") {
            assert.equal(sent.path, "/v1/responses");
            assert.equal(sent.body.max_output_tokens, 100);
            assert.equal(sent.headers.authorization, "Bearer test-explicit-key");
        } else if (provider === "anthropic") {
            assert.equal(sent.body.max_tokens, 100);
            assert.equal(sent.headers["x-api-key"], "test-explicit-key");
        } else if (provider === "google") {
            assert.equal(sent.body.generationConfig.maxOutputTokens, 100);
            assert.equal(sent.headers["x-goog-api-key"], "test-explicit-key");
        } else {
            assert.equal(sent.path, "/v1/chat/completions");
            assert.equal(sent.body.max_tokens ?? sent.body.max_completion_tokens, 100);
        }
    }
});

test("real pi-ai stream cancellation rejects partial text and closes transport", async () => {
    const controller = new AbortController();
    let closeTransport!: () => void;
    const closed = new Promise<void>(resolve => { closeTransport = resolve; });
    await withServer((req, res) => {
        req.resume();
        res.on("close", closeTransport);
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(sse([{ id: "chat-1", model: "local-model", choices: [{ index: 0, delta: { role: "assistant", content: "partial" }, finish_reason: null }] }]));
        setImmediate(() => controller.abort());
    }, async url => {
        await assert.rejects(adapter("openai-compatible", "local-model", `${url}/v1`).generate(request, { signal: controller.signal }), ExecutionAbortedError);
        await closed;
    });
});

test("real SDK rejects length termination and stream errors", async () => {
    for (const body of [completionsBody("length"), sse([{ error: { message: "Stream failure", type: "server_error", code: "server_error" } }])]) {
        await withServer((req, res) => {
            req.resume();
            res.writeHead(200, { "Content-Type": "text/event-stream" });
            res.end(body);
        }, async url => {
            await assert.rejects(adapter("openai-compatible", "local-model", `${url}/v1`).generate(request), PiAiProviderError);
        });
    }
});

test("agent smoke exercises preparation, approval, one tool and completion in both modes", async () => {
    const { runAgentSmoke } = await import("./agent-smoke-test");
    for (const mode of ["strict", "prompt_only"] as const) {
        const phases: string[] = [];
        await withServer((req, res) => {
            let data = "";
            req.on("data", chunk => { data += chunk; });
            req.on("end", () => {
                const body = JSON.parse(data);
                const working = JSON.parse(body.messages.at(-1).content);
                phases.push(working.phase);
                assert.equal(body.response_format !== undefined, mode === "strict");
                assert.equal(working.responseShapeGuide !== undefined, mode === "prompt_only");
                let decision: unknown;
                if (working.phase === "gathering_context") decision = { kind: "context_ready", memoryPatch: null };
                else if (working.phase === "planning") decision = {
                    kind: "task_proposal", task: { objective: "Verify smoke evidence", completionCriteria: [{ text: "Obtain the smoke observation", acceptance: null }] },
                    approvalRequest: "Approve the smoke test?", memoryPatch: null,
                };
                else {
                    const observation = working.trajectoryContext.hot.flatMap((unit: any) => unit.events).find((event: any) => event.eventType === "observation_recorded");
                    decision = observation === undefined
                        ? { kind: "tool_call", action: { actionId: "smoke-action-1", toolId: "smoke_evidence", input: {} }, memoryPatch: null }
                        : { kind: "complete", summary: "Smoke passed", completionEvidence: [{ criterionIndex: 0, evidenceSequences: [observation.sequence] }], memoryPatch: null };
                }
                const content = JSON.stringify({ result: decision });
                if (mode === "strict") {
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({ id: "smoke-1", model: "local-model", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] }));
                } else {
                    res.setHeader("Content-Type", "text/event-stream");
                    res.end(sse([{ id: "smoke-1", model: "local-model", choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: "stop" }] }]) + "data: [DONE]\n\n");
                }
            });
        }, async url => {
            const report = await runAgentSmoke({
                LLM_PROVIDER: "openai-compatible", LLM_API_KEY: "test-explicit-key", LLM_MODEL: "local-model",
                LLM_BASE_URL: `${url}/v1`, LLM_STRUCTURED_OUTPUT_MODE: mode,
                LLM_CONTEXT_WINDOW_TOKENS: "65536", LLM_MAX_OUTPUT_TOKENS: "4096",
            });
            assert.equal(report.preparation, "passed");
            assert.equal(report.execution, "passed");
            assert.equal(report.toolCalls, 1);
        });
        assert.deepEqual(phases, ["gathering_context", "planning", "executing", "executing"]);
    }
});

test("pi-ai preparation keeps local JSON and phase validation", async () => {
    const { runAgentSmoke } = await import("./agent-smoke-test");
    for (const content of ["", "not JSON", JSON.stringify({ result: { kind: "complete", summary: "wrong phase", completionEvidence: [], memoryPatch: null } })]) {
        let calls = 0;
        await withServer((req, res) => {
            req.resume();
            calls += 1;
            res.setHeader("Content-Type", "text/event-stream");
            res.end(sse([{ id: "smoke-1", model: "local-model", choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: "stop" }] }]) + "data: [DONE]\n\n");
        }, async url => {
            await assert.rejects(runAgentSmoke({
                LLM_PROVIDER: "openai-compatible", LLM_API_KEY: "key", LLM_MODEL: "local-model",
                LLM_BASE_URL: `${url}/v1`, LLM_STRUCTURED_OUTPUT_MODE: "prompt_only",
                LLM_CONTEXT_WINDOW_TOKENS: "65536", LLM_MAX_OUTPUT_TOKENS: "4096",
            }));
        });
        assert.equal(calls, 1);
    }
});
