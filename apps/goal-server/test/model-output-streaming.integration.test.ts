import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { OpenAICompatible } from "../../../packages/llm-openai/src/index";
import { readToolCalls } from "../../../packages/llm-core/src/index";
import { toolCallResponse } from "../../../packages/llm-core/test/response-fixtures";
import { createToolRegistration, InMemoryToolRegistry, type Tool } from "../../../packages/tool-core/src/index";
import { contract } from "../../../packages/contracts/src/index";
import type { AgentProfile } from "../../../packages/runtime/src/index";
import { createRuntimeComposition } from "../src/runtime/index";
import { createTestToolRegistration } from "../../../packages/tool-core/test/helpers";

const profile: AgentProfile = {
    id: "profile-streaming-composition",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Take evidence, then complete."],
    toolIds: ["bash"],
};

function bashTool(onExecute: (command: string) => void): Tool {
    return {
        definition: {
            id: "bash",
            description: "Run one read-only command",
            inputContract: contract.object({ command: contract.string() }),
            isReadOnly: true,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        async execute({ input }) {
            onExecute((input as { readonly command: string }).command);
            return { kind: "success", output: { text: "AGENTS.md" }, summary: "Observed" };
        },
    };
}

async function setupFixture(): Promise<{
    readonly workspace: string;
    readonly home: string;
    readonly dataDirectory: string;
    readonly cleanup: () => Promise<void>;
}> {
    const root = await mkdtemp(join(tmpdir(), "lg-streaming-composition-"));
    const workspace = join(root, "workspace");
    const home = join(root, "home");
    const dataDirectory = join(root, "data");
    await Promise.all([
        mkdir(workspace, { recursive: true }),
        mkdir(home, { recursive: true }),
        mkdir(dataDirectory, { recursive: true }),
    ]);
    return { workspace, home, dataDirectory, cleanup: async () => { await rm(root, { recursive: true, force: true }); } };
}

function chatChunk(delta: Record<string, unknown>, finishReason: string | null = null): Record<string, unknown> {
    return {
        id: "chatcmpl-stream", object: "chat.completion.chunk", created: 0, model: "stream-model",
        choices: [{ index: 0, delta, finish_reason: finishReason }],
    };
}

function frames(chunks: readonly unknown[]): string {
    return chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("");
}

const DONE = "data: [DONE]\n\n";

test("经正式无界面装配的真实 Chat Completions 流：屏障前无工具、完成后按原规则执行，重建只读恢复提交历史", { timeout: 120_000 }, async () => {
    const fixture = await setupFixture();
    const executed: string[] = [];
    const requests: { readonly path: string; readonly body: Record<string, any> }[] = [];
    let releaseFirstResponse!: () => void;
    const firstResponseReleased = new Promise<void>(resolve => { releaseFirstResponse = resolve; });
    let firstToolBlockWritten!: () => void;
    const firstToolBlockSeen = new Promise<void>(resolve => { firstToolBlockWritten = resolve; });

    const server = createServer((request: IncomingMessage, response: ServerResponse) => {
        void (async () => {
            let data = "";
            request.setEncoding("utf8");
            for await (const piece of request) data += piece;
            const body = JSON.parse(data) as Record<string, any>;
            requests.push({ path: request.url ?? "", body });
            response.writeHead(200, { "Content-Type": "text/event-stream" });

            const tools = body.tools as readonly { readonly function?: { readonly name?: string } }[] | undefined;
            const isReview = tools?.some(tool => tool.function?.name === "system_review_completion") === true;
            if (isReview) {
                response.end(frames([
                    chatChunk({ tool_calls: [{ index: 0, id: "review-1", type: "function", function: { name: "system_review_completion", arguments: JSON.stringify({ result: { kind: "accept" } }) } }] }),
                    chatChunk({}, "tool_calls"),
                ]) + DONE);
                return;
            }

            // 1. 先发现业务工具；2. 完整工具块（分片参数）后进入屏障；3+. 用已提交的观察序列完成。
            if (requests.length === 1) {
                response.end(frames([
                    chatChunk({ tool_calls: [{ index: 0, id: "call-discover-1", type: "function", function: { name: "system_find_tools", arguments: JSON.stringify({ query: "bash" }) } }] }),
                    chatChunk({}, "tool_calls"),
                ]) + DONE);
                return;
            }

            if (requests.length === 2) {
                response.end(frames([
                    chatChunk({ tool_calls: [{ index: 0, id: "call-stage-1", type: "function", function: { name: "system_start_run_stage", arguments: JSON.stringify({ target: "取证并完成", acceptanceCriteria: ["事实已提交"] }) } }] }),
                    chatChunk({}, "tool_calls"),
                ]) + DONE);
                return;
            }

            if (requests.length === 3) {
                response.write(frames([
                    chatChunk({ role: "assistant", content: "先取证。" }),
                    chatChunk({ tool_calls: [{ index: 0, id: "call-bash-1", type: "function", function: { name: "bash", arguments: '{"command"' } }] }),
                    chatChunk({ tool_calls: [{ index: 0, function: { arguments: ':"ls -la"}' } }] }),
                ]));
                firstToolBlockWritten();
                await firstResponseReleased;
                response.write(frames([chatChunk({}, "tool_calls")]) + DONE);
                response.end();
                return;
            }

            const evidence = (body.messages as readonly { readonly content: string }[] | undefined)
                ?.flatMap(message => {
                    try {
                        const parsed = JSON.parse(message.content) as {
                            readonly sourceSequence?: number;
                            readonly observation?: { readonly output?: { readonly sourceSequence?: number } };
                        };
                        const sequence = parsed.sourceSequence ?? parsed.observation?.output?.sourceSequence;
                        return sequence === undefined ? [] : [sequence];
                    } catch {
                        return [];
                    }
                }).at(-1);
            assert.ok(typeof evidence === "number", "提交历史必须包含可核验的观察序列");
            response.end(frames([
                chatChunk({ tool_calls: [{
                    index: 0, id: "call-complete-1", type: "function",
                    function: {
                        name: "system_complete_task",
                        arguments: JSON.stringify({
                            summary: "The streaming composition reached a verified completion.",
                            evidenceSequences: [evidence],
                            memoryPatch: null,
                        }),
                    },
                }] }),
                chatChunk({}, "tool_calls"),
            ]) + DONE);
        })().catch(() => { response.destroy(); });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address !== null && typeof address !== "string");
    const baseURL = `http://127.0.0.1:${address.port}/v1`;

    const adapter = new OpenAICompatible({
        apiKey: "fixture-key", baseURL, model: "stream-model", structuredOutputMode: "strict",
    });
    const runtime = await createRuntimeComposition({
        cwd: fixture.workspace,
        env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
        dataDirectory: fixture.dataDirectory,
        adapter,
        profile,
        toolRegistry: new InMemoryToolRegistry([createTestToolRegistration(bashTool(command => { executed.push(command); }))]),
    });

    const goalId = "goal-streaming-composition";
    try {
        const launching = runtime.commands.launch({ goalId, intent: "用真实流完成一次取证任务", profileId: profile.id, mode: "normal" });
        await Promise.race([
            firstToolBlockSeen,
            new Promise((_resolve, reject) => setTimeout(() => reject(new Error("Fixture never received the tool block")), 20_000)),
        ]);
        // 完整工具块已到达但响应未结束：没有任何工具效果、没有待审批操作。
        assert.equal(executed.length, 0);
        const inFlight = await runtime.workspaceGoalStore.restore(goalId);
        assert.equal(inFlight?.state.run.pendingAction, undefined);

        releaseFirstResponse();
        const launched = await launching;
        if (!launched.ok) assert.fail(`${launched.error.code}: ${launched.error.message}`);
        assert.equal(launched.kind, "terminal");
        assert.equal(launched.goal.state.run.status, "completed", JSON.stringify(launched.goal.state.run.stopReason));
        assert.deepEqual([...executed], ["ls -la"]);
    } finally {
        await runtime.resources.closeAll();
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }

    // 流式请求仍是 Chat Completions：一次真实流式调用，工具与非流式模式一致。
    assert.equal(requests[0]?.body.stream, true);
    assert.deepEqual(requests[0]?.body.stream_options, { include_usage: true });
    assert.equal(requests[0]?.body.tool_choice, "required");
    assert.equal(requests[0]?.body.parallel_tool_calls, false);
    assert.equal(requests[0]?.path, "/v1/chat/completions");
    // 后续请求的来源可核验：提交历史包含助手工具调用与工具结果配对。
    const followUp = requests.find(entry => JSON.stringify(entry.body.messages).includes("call-bash-1"));
    assert.ok(followUp, "后续请求必须携带已提交的原生工具调用身份");
    const followUpMessages = followUp.body.messages as readonly { readonly role: string; readonly tool_call_id?: string }[];
    assert.ok(followUpMessages.some(message => message.role === "assistant"));
    assert.ok(followUpMessages.some(message => message.role === "tool" && message.tool_call_id === "call-bash-1"));

    // 关闭后从文件存储重建：只读恢复提交历史，不推进、不恢复分片。
    const reopened = await createRuntimeComposition({
        cwd: fixture.workspace,
        env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
        dataDirectory: fixture.dataDirectory,
        adapter: new OpenAICompatible({ apiKey: "fixture-key", baseURL, model: "stream-model", structuredOutputMode: "strict" }),
        profile,
        toolRegistry: new InMemoryToolRegistry([createTestToolRegistration(bashTool(command => { executed.push(`unexpected:${String(command)}`); }))]),
    });
    try {
        const restored = await reopened.workspaceGoalStore.restore(goalId);
        assert.ok(restored);
        assert.equal(restored.state.run.status, "completed");
        const messages = JSON.stringify(restored.state.messages);
        // Goal 对话只保留用户输入与已提交的完成摘要，不包含分片、预览或私有内容。
        assert.ok(messages.includes("The streaming composition reached a verified completion."));
        assert.equal(messages.includes("PRIVATE"), false);
        assert.equal(messages.includes("deltaKind"), false);
        const trajectory = await reopened.readWorkspaceTrajectory({ goalId, runId: restored.state.run.id });
        const committed = trajectory.committed.map(event => event.eventType);
        assert.equal(committed.filter(type => type === "observation_recorded").length, 1);
        assert.equal(committed.includes("action_staged"), true);
        // 只读恢复不产生新的工具效果，也不重新发布分片。
        await reopened.workspaceGoalStore.restore(goalId);
        assert.deepEqual([...executed], ["ls -la"]);
    } finally {
        await reopened.resources.closeAll();
        await fixture.cleanup();
    }
});

test("宿主生成的确定性流式 Adapter 可注入同一装配并保持单一执行链", async () => {
    const fixture = await setupFixture();
    const executed: string[] = [];
    let calls = 0;
    const adapter = {
        provider: "openai" as const,
        structuredOutputMode: "strict" as const,
        modelId: "host-stream-model",
        async generate() { throw new Error("host adapter streams only"); },
        async *stream() {
            calls += 1;
            const wait = toolCallResponse({
                callId: `host-wait-${calls}`, toolId: "system_wait_for_input",
                argumentsJson: JSON.stringify({ reason: "等待用户确认" }),
            });
            const call = readToolCalls(wait)[0]!;
            yield { kind: "started" as const };
            yield { kind: "content_block_started" as const, index: 0, blockType: "tool_call" as const, delivery: "whole" as const };
            yield { kind: "content_block_completed" as const, delivery: "whole" as const, block: { index: 0, type: "tool_call" as const, ...call } };
            yield { kind: "completed" as const, response: wait };
        },
    };

    const runtime = await createRuntimeComposition({
        cwd: fixture.workspace,
        env: { LAZYGOAL_HOME: fixture.home } as NodeJS.ProcessEnv,
        dataDirectory: fixture.dataDirectory,
        adapter: adapter as never,
        profile: { ...profile, toolIds: [] },
        toolRegistry: new InMemoryToolRegistry([createTestToolRegistration(bashTool(command => { executed.push(command); }))]),
    });
    try {
        const launched = await runtime.commands.launch({ goalId: "goal-host-stream", intent: "等待确认", profileId: profile.id, mode: "normal" });
        if (!launched.ok) assert.fail(`${launched.error.code}: ${launched.error.message}`);
        assert.equal(launched.kind, "waiting");
        assert.ok(calls >= 1);
        assert.deepEqual(executed, []);
        const trajectory = await runtime.readWorkspaceTrajectory({ goalId: "goal-host-stream", runId: launched.goal.state.run.id });
        assert.equal(trajectory.committed.some(event => event.eventType === "observation_recorded"), false);
    } finally {
        await runtime.resources.closeAll();
        await fixture.cleanup();
    }
});
