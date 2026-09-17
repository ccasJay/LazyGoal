import assert from "node:assert/strict";
import { test } from "node:test";
import { OpenAICompatible } from "../src/openai-compatible";
import { Gemini } from "../src/gemini";
import { PiAiAdapter } from "../src/pi-ai";
import type { LLMRequest, LLMToolDefinition } from "../src/core/types";

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

test("OpenAICompatible 原生 Function Calling 挂载 tools、strict: true 与 tool_choice: required", async () => {
    const adapter = new OpenAICompatible({
        apiKey: "test-key",
        baseURL: "https://api.openai.com/v1",
        model: "gpt-4o",
        structuredOutputMode: "strict",
    });

    let capturedRequest: any = undefined;
    (adapter as any).client = {
        chat: {
            completions: {
                create: async (req: any) => {
                    capturedRequest = req;
                    return {
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
                        usage: {
                            prompt_tokens: 100,
                            completion_tokens: 50,
                            total_tokens: 150,
                        },
                    };
                },
            },
        },
    };

    const request: LLMRequest = {
        messages: [{ role: "user", content: "请完成任务" }],
        tools: [mockToolDefinition],
        toolChoice: "required",
    };

    const response = await adapter.generate(request);

    // 1. 验证请求入参
    assert.ok(capturedRequest);
    assert.equal(capturedRequest.tool_choice, "required");
    assert.equal(capturedRequest.tools.length, 1);
    assert.equal(capturedRequest.tools[0].type, "function");
    assert.equal(capturedRequest.tools[0].function.name, "system_complete_task");
    assert.equal(capturedRequest.tools[0].function.strict, true);

    // 2. 验证双通道响应
    assert.equal(response.content, "我分析了任务，决定调用系统完成函数。");
    assert.ok(response.toolCalls);
    assert.equal(response.toolCalls.length, 1);
    assert.equal(response.toolCalls[0].callId, "call_abc123");
    assert.equal(response.toolCalls[0].toolId, "system_complete_task");
    const parsedArgs = JSON.parse(response.toolCalls[0].argumentsJson);
    assert.equal(parsedArgs.summary, "任务已成功实现");
});

test("OpenAICompatible 无损捕获原生思考模型 reasoning_content 与工具调用", async () => {
    const adapter = new OpenAICompatible({
        apiKey: "test-key",
        baseURL: "https://api.deepseek.com/v1",
        model: "deepseek-r1",
        structuredOutputMode: "strict",
    });

    (adapter as any).client = {
        chat: {
            completions: {
                create: async () => ({
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
                }),
            },
        },
    };

    const response = await adapter.generate({
        messages: [{ role: "user", content: "推进" }],
        tools: [mockToolDefinition],
    });

    assert.equal(response.content, "逐步逻辑推演：首先确认测试用例均已通过，然后调用完成工具。");
    assert.equal(response.toolCalls?.length, 1);
    assert.equal(response.toolCalls?.[0].toolId, "system_complete_task");
});

test("Gemini 原生 Function Calling 挂载 functionDeclarations 与 ANY 模式并提取双通道数据", async () => {
    const adapter = new Gemini({
        apiKey: "test-key",
        model: "gemini-2.5-flash",
        structuredOutputMode: "strict",
    });

    let capturedParams: any = undefined;
    (adapter as any).client = {
        models: {
            generateContent: async (params: any) => {
                capturedParams = params;
                return {
                    candidates: [
                        {
                            content: {
                                role: "model",
                                parts: [
                                    {
                                        thought: "这是 Gemini 原生生成的思考过程",
                                    },
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
                };
            },
        },
    };

    const request: LLMRequest = {
        messages: [{ role: "user", content: "请决策" }],
        tools: [mockToolDefinition],
        toolChoice: "required",
    };

    const response = await adapter.generate(request);

    // 1. 验证 Gemini 配置
    assert.ok(capturedParams);
    assert.equal(capturedParams.config.tools.length, 1);
    const fnDecl = capturedParams.config.tools[0].functionDeclarations[0];
    assert.equal(fnDecl.name, "system_complete_task");
    assert.equal(capturedParams.config.toolConfig.functionCallingConfig.mode, "ANY");

    // 2. 验证双通道内容提取
    assert.equal(response.content, "这是 Gemini 原生生成的思考过程");
    assert.ok(response.toolCalls);
    assert.equal(response.toolCalls.length, 1);
    assert.equal(response.toolCalls[0].toolId, "system_complete_task");
    const parsedArgs = JSON.parse(response.toolCalls[0].argumentsJson);
    assert.equal(parsedArgs.summary, "Gemini 执行完毕");
});

test("PiAiAdapter 原生挂载 tools 并提取 thinking 与 toolCall blocks", async () => {
    const adapter = new PiAiAdapter({
        provider: "openai-compatible",
        model: "mock-model",
        apiKey: "test-key",
        baseURL: "https://api.mock.com",
        structuredOutputMode: "prompt_only",
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

    assert.equal(response.content, "PiAi 思考推演流");
    assert.ok(response.toolCalls);
    assert.equal(response.toolCalls.length, 1);
    assert.equal(response.toolCalls[0].callId, "pi_call_1");
    assert.equal(response.toolCalls[0].toolId, "system_complete_task");
});
