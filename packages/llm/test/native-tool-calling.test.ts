import assert from "node:assert/strict";
import { test } from "node:test";
import { createOpenAICompatibleAdapter } from "../../llm-adapters/src/index";
import { Gemini } from "../../llm-google/src/index";
import { PiAiAdapter } from "../../llm-pi-ai/src/index";
import type { LLMRequest, LLMToolDefinition } from "../../llm-core/src/index";
import { readAssistantText, readReasoningText, readToolCalls } from "../../llm-core/src/index";

async function withFetch<T>(
    stub: (url: string, init: RequestInit | undefined) => Promise<Response>,
    run: () => Promise<T>,
): Promise<T> {
    const original = globalThis.fetch;
    globalThis.fetch = stub as typeof fetch;
    try {
        return await run();
    } finally {
        globalThis.fetch = original;
    }
}

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const mockToolDefinition: LLMToolDefinition = {
    id: "system_complete_task",
    description: "宣布任务完成",
    parametersSchema: {
        type: "object",
        properties: {
            summary: { type: "string" },
            completionEvidence: { type: "array", items: { type: "string" } },
        },
        required: ["summary", "completionEvidence"],
        additionalProperties: false,
    },
};

test("Chat Completions 适配器挂载 tools、strict: true 与 tool_choice: required", async () => {
    const adapter = createOpenAICompatibleAdapter({
        provider: "openai-compatible",
        apiKey: "test-key",
        baseURL: "https://api.openai.com/v1",
        model: "gpt-4o",
    });

    let capturedRequest: any = undefined;
    const request: LLMRequest = {
        messages: [{ role: "user", content: "请完成任务" }],
        tools: [mockToolDefinition],
        toolChoice: "required",
        toolArgumentConstraint: "strict",
    };

    const response = await withFetch(async (_url, init) => {
        capturedRequest = JSON.parse(String(init?.body));
        return jsonResponse({
            id: "chatcmpl-123",
            model: "gpt-4o",
            created: 1700000000,
            choices: [
                {
                    message: {
                        role: "assistant",
                        content: "我分析了任务，决定调用系统完成函数。",
                        tool_calls: [
                            {
                                id: "call_abc123",
                                type: "function",
                                function: {
                                    name: "system_complete_task",
                                    arguments: JSON.stringify({
                                        summary: "任务已成功实现",
                                        completionEvidence: ["evidence-1"],
                                    }),
                                },
                            },
                        ],
                    },
                    finish_reason: "tool_calls",
                },
            ],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        });
    }, () => adapter.generate(request));

    // 1. 验证请求入参
    assert.ok(capturedRequest);
    assert.equal(capturedRequest.tool_choice, "required");
    assert.equal(capturedRequest.tools.length, 1);
    assert.equal(capturedRequest.tools[0].type, "function");
    assert.equal(capturedRequest.tools[0].function.name, "system_complete_task");
    assert.equal(capturedRequest.tools[0].function.strict, true);

    // 2. 验证双通道响应
    assert.equal(readAssistantText(response), "我分析了任务，决定调用系统完成函数。");
    const toolCalls = readToolCalls(response);
    assert.equal(toolCalls.length, 1);
    assert.equal(toolCalls[0]!.callId, "call_abc123");
    assert.equal(toolCalls[0]!.toolId, "system_complete_task");
    const parsedArgs = JSON.parse(toolCalls[0]!.argumentsJson);
    assert.equal(parsedArgs.summary, "任务已成功实现");
});

test("Chat Completions 适配器无损捕获原生思考模型 reasoning_content 与工具调用", async () => {
    const adapter = createOpenAICompatibleAdapter({
        provider: "openai-compatible",
        apiKey: "test-key",
        baseURL: "https://api.deepseek.com/v1",
        model: "deepseek-r1",
    });

    const response = await withFetch(async () => jsonResponse({
        id: "chatcmpl-r1",
        model: "deepseek-r1",
        created: 1700000000,
        choices: [
            {
                message: {
                    role: "assistant",
                    content: "",
                    reasoning_content: "逐步逻辑推演：首先确认测试用例均已通过，然后调用完成工具。",
                    tool_calls: [
                        {
                            id: "call_r1_1",
                            type: "function",
                            function: {
                                name: "system_complete_task",
                                arguments: '{"summary":"验证完成","completionEvidence":[]}',
                            },
                        },
                    ],
                },
                finish_reason: "tool_calls",
            },
        ],
    }), () => adapter.generate({
        messages: [{ role: "user", content: "推进" }],
        tools: [mockToolDefinition],
    }));

    assert.equal(readAssistantText(response), "");
    assert.equal(readReasoningText(response), "逐步逻辑推演：首先确认测试用例均已通过，然后调用完成工具。");
    assert.equal(readToolCalls(response).length, 1);
    assert.equal(readToolCalls(response)[0]!.toolId, "system_complete_task");
});

test("Gemini 原生 Function Calling 挂载 functionDeclarations 与 ANY 模式并提取双通道数据", async () => {
    const adapter = new Gemini({
        apiKey: "test-key",
        model: "gemini-2.5-flash",
    });

    let capturedBody: any = undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
        capturedBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
            candidates: [
                {
                    content: {
                        role: "model",
                        parts: [
                            { thought: true, text: "这是 Gemini 原生生成的思考过程" },
                            {
                                functionCall: {
                                    name: "system_complete_task",
                                    args: {
                                        summary: "Gemini 执行完毕",
                                        completionEvidence: ["log-1"],
                                    },
                                },
                            },
                        ],
                    },
                    finishReason: "STOP",
                },
            ],
            usageMetadata: {
                promptTokenCount: 80,
                candidatesTokenCount: 40,
                totalTokenCount: 120,
            },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const request: LLMRequest = {
        messages: [{ role: "user", content: "请决策" }],
        tools: [mockToolDefinition],
        toolChoice: "required",
    };

    try {
        const response = await adapter.generate(request);

        // 1. 验证线格式请求形状
        assert.ok(capturedBody);
        assert.equal(capturedBody.tools.length, 1);
        const fnDecl = capturedBody.tools[0].functionDeclarations[0];
        assert.equal(fnDecl.name, "system_complete_task");
        assert.equal(capturedBody.toolConfig.functionCallingConfig.mode, "ANY");

        // 2. 验证双通道内容提取
        assert.equal(readAssistantText(response), "");
        assert.equal(readReasoningText(response), "这是 Gemini 原生生成的思考过程");
        const geminiCalls = readToolCalls(response);
        assert.equal(geminiCalls.length, 1);
        assert.equal(geminiCalls[0]!.toolId, "system_complete_task");
        const parsedArgs = JSON.parse(geminiCalls[0]!.argumentsJson);
        assert.equal(parsedArgs.summary, "Gemini 执行完毕");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("Gemini 纯 functionCall 响应提取工具调用，不读取正文派生字段", async () => {
    const adapter = new Gemini({
        apiKey: "test-key",
        model: "gemini-2.5-flash",
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
        candidates: [
            {
                content: {
                    role: "model",
                    parts: [
                        {
                            functionCall: {
                                name: "read_file",
                                args: { path: "package.json" },
                            },
                        },
                    ],
                },
                finishReason: "STOP",
            },
        ],
    }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;

    try {
        const response = await adapter.generate({
            messages: [{ role: "user", content: "读取文件" }],
            tools: [mockToolDefinition],
            toolChoice: "required",
        });

        assert.equal(readAssistantText(response), "");
        const calls = readToolCalls(response);
        assert.equal(calls.length, 1);
        assert.equal(calls[0]!.toolId, "read_file");
        assert.ok(calls[0]!.callId.startsWith("call_"));
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("PiAiAdapter 原生挂载 tools、隔离 thinking 并提取 toolCall blocks", async () => {
    const adapter = new PiAiAdapter({
        provider: "openai-compatible",
        model: "mock-model",
        apiKey: "test-key",
        baseURL: "https://api.mock.com",
        contextWindowTokens: 16000,
        maxOutputTokens: 4096,
    });

    let capturedContext: any = undefined;
    (adapter as any).models = {
        completeSimple: async (_model: any, context: any) => {
            capturedContext = context;
            return {
                role: "assistant",
                provider: "openai-compatible",
                api: "openai-completions",
                model: "mock-model",
                stopReason: "toolUse",
                content: [
                    { type: "thinking", thinking: "PiAi 思考推演流" },
                    {
                        type: "toolCall",
                        id: "pi_call_1",
                        name: "system_complete_task",
                        arguments: { summary: "PiAi 完成", completionEvidence: [] },
                    },
                ],
                usage: { input: 10, output: 20 },
            };
        },
    };

    const response = await adapter.generate({
        messages: [{ role: "user", content: "测试" }],
        tools: [mockToolDefinition],
    });

    assert.ok(capturedContext.tools);
    assert.equal(capturedContext.tools.length, 1);
    assert.equal(capturedContext.tools[0].name, "system_complete_task");

    assert.equal(readAssistantText(response), "");
    // thinking 保留为受限 reasoning 块，但绝不混入正文或工具参数。
    assert.equal(readReasoningText(response), "PiAi 思考推演流");
    assert.equal(JSON.stringify(readToolCalls(response)).includes("PiAi 思考推演流"), false);
    const piCalls = readToolCalls(response);
    assert.equal(piCalls.length, 1);
    assert.equal(piCalls[0]!.callId, "pi_call_1");
    assert.equal(piCalls[0]!.toolId, "system_complete_task");
});
