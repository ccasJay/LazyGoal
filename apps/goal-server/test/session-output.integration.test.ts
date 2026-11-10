import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { LLMAdapter, LLMRequest, LLMResponse } from "../../../packages/llm-core/src/index";
import { toolCallResponse } from "../../../packages/llm-core/test/response-fixtures";
import { createBrowserSessionAccess } from "../../../packages/browser/src/index";
import { runServerSession } from "../src/cli";
import { createCompositionRoot } from "../src/composition-root";

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), 10_000); }),
        ]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

test("正式装配：SSE 发布提交失效通知，Activity 与消息查询读取已保存结果", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-session-output-"));
    await writeFile(join(workspace, "notes.txt"), "配置说明\n", "utf8");
    const access = createBrowserSessionAccess();
    const finished = deferred<void>();
    const releaseModel = deferred<void>();
    const requests: LLMRequest[] = [];
    let callIndex = 0;

    const adapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        async generate(request: LLMRequest): Promise<LLMResponse> {
            requests.push(request);
            callIndex += 1;
            if (callIndex === 1) {
                // 先阻塞：订阅建立后再放行模型调用，确保实时事件被观察到。
                await releaseModel.promise;
            }
            const isReview = (request.messages.at(-1)?.content ?? "").includes("runtime_completion_candidate");
            if (isReview) {
                // 完成审查：接受候选，使其成为正式答复。
                return toolCallResponse({
                    callId: "call-review",
                    toolId: "system_review_completion",
                    argumentsJson: JSON.stringify({ result: { kind: "accept" } }),
                });
            }
            finished.resolve(undefined);
            // 完成候选：只声明顶层 summary 作为公开预览。
            return toolCallResponse({
                callId: "call-complete",
                toolId: "system_complete_task",
                argumentsJson: JSON.stringify({ summary: "正式答复正文", evidenceSequences: [] }),
            });
        },
    };

    let root: Awaited<ReturnType<typeof createCompositionRoot>> | undefined;
    try {
        root = await createCompositionRoot({
            cwd: workspace,
            dataDirectory: join(workspace, "data"),
            env: { LAZYGOAL_HOME: join(workspace, "home") },
            profile: { id: "integration", systemPrompt: "Use the supplied deterministic response.", instructions: [], toolIds: [] },
            adapter,
            httpMiddleware: access.middleware,
            exitPort: { exit() {} },
        });

        const launchReady = deferred<string>();
        void runServerSession(root, access, (url) => launchReady.resolve(url));
        const launchUrl = new URL(await withTimeout(launchReady.promise, "Web server did not start"));
        const origin = launchUrl.origin;
        const token = launchUrl.hash.slice(1);
        const request = async (path: string, method: string, body?: unknown) => {
            const response = await fetch(`${origin}${path}`, {
                method,
                headers: {
                    authorization: `Bearer ${token}`,
                    origin,
                    ...(body === undefined ? {} : { "content-type": "application/json" }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
            const text = await response.text();
            return {
                status: response.status,
                body: text.length === 0 || !text.startsWith("{") ? {} : JSON.parse(text) as Record<string, any>,
            };
        };

        // 正式装配受理首条输入：执行在第一个模型调用处等待订阅建立。
        const created = await root.sessions.create({
            goalId: "goal-session-output",
            inputId: "input-session-output",
            content: "读取配置并给出答复",
            profileId: root.profile.id,
        });
        assert.equal(created.ok, true);

        // SSE 观察同一协议：候选预览与正式消息通知都来自真实装配。
        const streamController = new AbortController();
        const stream = await fetch(`${origin}/api/goals/goal-session-output/events`, {
            headers: { authorization: `Bearer ${token}`, origin },
            signal: streamController.signal,
        });
        assert.equal(stream.status, 200);
        const reader = stream.body?.getReader();
        assert.ok(reader);
        const decoder = new TextDecoder();
        let buffer = "";
        const observed: string[] = [];
        const collect = (async () => {
            while (observed.length < 40) {
                const chunk = await reader.read();
                if (chunk.done === true) break;
                buffer += decoder.decode(chunk.value, { stream: true });
                let boundary = buffer.indexOf("\n\n");
                while (boundary >= 0) {
                    const block = buffer.slice(0, boundary);
                    buffer = buffer.slice(boundary + 2);
                    const data = block.split("\n")
                        .filter((line) => line.startsWith("data:"))
                        .map((line) => line.slice(5).trimStart())
                        .join("\n");
                    if (data.length > 0) observed.push(data);
                    boundary = buffer.indexOf("\n\n");
                }
            }
        })();

        releaseModel.resolve(undefined);
        await withTimeout(finished.promise, "Run did not reach the completion candidate");
        // 提交核对按不超过一秒的间隔进行：等待正式消息通知到达。
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        streamController.abort();
        await reader.cancel().catch(() => undefined);
        await collect.catch(() => undefined);

        const payload = observed.join("\n");
        const events = observed.map((event) => JSON.parse(event) as Record<string, any>);
        // 事件流只发送状态同步和提交失效范围；结果正文由有界查询端点返回。
        assert.equal(events.some((event) => event.type === "state_sync"), true);
        assert.equal(events.some((event) => event.type === "state_committed"
            && event.changed?.includes("activity") === true), true);
        assert.equal(payload.includes("正式答复正文"), false);
        assert.equal(payload.includes("completionEvidence"), false);

        const activity = await request("/api/goals/goal-session-output/activity?limit=100", "GET");
        assert.equal(activity.status, 200);
        assert.equal(activity.body.goalId, "goal-session-output");
        assert.equal(Array.isArray(activity.body.items), true);

        // 正式答复已保存，并带有稳定身份、用途与来源。
        const messages = await request("/api/goals/goal-session-output/messages?limit=50", "GET");
        assert.equal(messages.status, 200);
        assert.equal(messages.body.ok, true);
        const entries = messages.body.messages as Array<Record<string, any>>;
        const answer = entries.find((entry) => entry.content === "正式答复正文");
        assert.ok(answer !== undefined, JSON.stringify(entries));
        assert.equal(answer.purpose, "answer");
        assert.equal(answer.sourceKind, "completion_candidate");
        assert.equal(typeof answer.messageId, "string");

        // 正文按稳定身份读取原文。
        const detail = await request(`/api/goals/goal-session-output/messages/${answer.messageId}`, "GET");
        assert.equal(detail.status, 200);
        assert.equal(detail.body.ok, true);
        assert.equal(detail.body.message.content, "正式答复正文");
        assert.equal(detail.body.message.truncated, false);

        // 未知身份明确不存在。
        const missing = await request("/api/goals/goal-session-output/messages/msg-unknown", "GET");
        assert.equal(missing.status, 404);

        // 会话提交通知只声明状态变化，正文按稳定身份单独读取。
        assert.equal(events.some((event) => event.type === "state_committed"
            && event.changed?.includes("session") === true), true);
    } finally {
        await root?.shutdownCoordinator.shutdown();
        await rm(workspace, { recursive: true, force: true });
    }
});
