import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createBrowserSessionAccess } from "../../../packages/browser/src/index";
import type { JsonValue } from "../../../packages/contracts/src/index";
import { createTestBinding, objectInputSchema } from "../../../packages/tool-core/test/binding-fixtures";
import type { LLMAdapter, LLMRequest, LLMResponse } from "../../../packages/llm-core/src/index";
import { toolCallResponse } from "../../../packages/llm-core/test/response-fixtures";
import type { AgentProfile, SessionInput, SessionInputAdmissionResult } from "../../../packages/runtime/src/index";
import { isSeatbeltSupported } from "../../../packages/sandbox/src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    TransientToolExecutionFailure,
    type Tool,
} from "../../../packages/tool-core/src/index";
import { createExecuteProgramRegistration } from "../../../packages/tools/src/index";
import { runServerSession } from "../src/cli";
import { createCompositionRoot } from "../src/composition-root";
import { createTestToolRegistration } from "../../../packages/tool-core/test/helpers";

/**
 * 跨 Spec 中间集成场景（S＋H＋A＋P）在正式装配上的实测。
 *
 * @remarks
 * 本文件只覆盖集成线上新增的组合事实：P 的类型化会话输出与 A 的修订／恢复
 * 领域身份在同一条真实链路上的表现。单个 Spec 的既有验收仍由各自计划覆盖。
 */

/** 一次真实装配会话：HTTP 入口、SSE 观察与已回收的请求记录。 */
interface Harness {
    readonly origin: string;
    readonly token: string;
    readonly events: Record<string, any>[];
    readonly stop: () => Promise<void>;
    /** 经 Runtime 会话管理器创建 Goal 并受理首条输入。 */
    readonly createGoal: (goalId: string, inputId: string, content: string) => Promise<void>;
    /** 直接向此集成夹具中的 Runtime 会话提交结构化决定。 */
    readonly respond: (goalId: string, input: Extract<SessionInput, { readonly kind: "respond" }>) => Promise<SessionInputAdmissionResult>;
    /** 经无界面宿主端口读取当前规范交互视图。 */
    readonly readInteraction: (goalId: string) => Promise<Record<string, any> | undefined>;
    /** 经 Trajectory 读取该 Run 的已提交事实。 */
    readonly readTrajectory: (goalId: string, runId: string) => Promise<Record<string, any>[]>;
    readonly request: (path: string, method: string, body?: unknown) => Promise<{
        readonly status: number;
        readonly body: Record<string, any>;
    }>;
}

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
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), 15_000); }),
        ]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

/**
 * 启动正式装配并准备真实 HTTP 与 SSE 观察入口。
 *
 * @param options - 装配选项与该场景的确定性模型。
 * @returns 可发起真实 HTTP 请求并读取 SSE 事件的会话句柄。
 */
async function startHarness(options: {
    readonly adapter: LLMAdapter;
    readonly profile: AgentProfile;
    readonly toolRegistry: InMemoryToolRegistry;
    readonly toolPolicy: { readonly evaluate: (input: { readonly tool: { readonly id: string; readonly isReadOnly?: boolean } }) => "allow" | "require_approval" };
}): Promise<Harness> {
    const root = await mkdtemp(join(tmpdir(), "lg-integration-"));
    const workspace = join(root, "workspace");
    const home = join(root, "home");
    const dataDirectory = join(root, "data");
    await Promise.all([
        mkdir(workspace, { recursive: true }),
        mkdir(home, { recursive: true }),
        mkdir(dataDirectory, { recursive: true }),
    ]);
    const access = createBrowserSessionAccess();
    const composition = await createCompositionRoot({
        cwd: workspace,
        dataDirectory,
        env: { LAZYGOAL_HOME: home } as NodeJS.ProcessEnv,
        profile: options.profile,
        adapter: options.adapter,
        toolRegistry: options.toolRegistry,
        toolPolicy: options.toolPolicy,
        httpMiddleware: access.middleware,
        exitPort: { exit() {} },
    });
    const launchReady = deferred<string>();
    void runServerSession(composition, access, (url) => launchReady.resolve(url));
    const launchUrl = new URL(await withTimeout(launchReady.promise, "Web server did not start"));
    const origin = launchUrl.origin;
    const token = launchUrl.hash.slice(1);
    const events: Record<string, any>[] = [];

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

    const stop = async () => {
        await composition.shutdownCoordinator.shutdown();
        await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    };

    const createGoal = async (goalId: string, inputId: string, content: string) => {
        const created = await composition.sessions.create({
            goalId,
            inputId,
            content,
            profileId: options.profile.id,
        });
        assert.equal(created.ok, true, JSON.stringify(created));
    };

    return {
        origin,
        token,
        events,
        stop,
        request,
        createGoal,
        respond: (goalId, input) => composition.sessions.sendSessionInput(goalId, input),
        readInteraction: async (goalId: string) => {
            const view = await composition.interactions.read(goalId);
            return view as Record<string, any> | undefined;
        },
        readTrajectory: async (goalId: string, runId: string) => {
            const result = await composition.readTrajectory({ goalId, runId });
            return result.committed as unknown as Record<string, any>[];
        },
    };
}

/**
 * 订阅 Goal 的真实 SSE 并把每条事件收集到数组。
 *
 * @remarks 订阅在 Goal 建立之后打开：当前等待会在一致同步中按稳定身份重发。
 */
async function subscribe(harness: Harness, goalId: string): Promise<() => Promise<void>> {
    const controller = new AbortController();
    const response = await fetch(`${harness.origin}/api/goals/${goalId}/events`, {
        headers: { authorization: `Bearer ${harness.token}`, origin: harness.origin },
        signal: controller.signal,
    });
    assert.equal(response.status, 200);
    const reader = response.body?.getReader();
    assert.ok(reader);
    const decoder = new TextDecoder();
    let buffer = "";
    const collect = (async () => {
        while (true) {
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
                if (data.length > 0) harness.events.push(JSON.parse(data) as Record<string, any>);
                boundary = buffer.indexOf("\n\n");
            }
        }
    })();
    return async () => {
        controller.abort();
        await reader.cancel().catch(() => undefined);
        await collect.catch(() => undefined);
    };
}

/** 等待 SSE 收集到满足条件的首条事件。 */
async function waitForEvent(
    harness: Harness,
    predicate: (event: Record<string, any>) => boolean,
    description: string,
): Promise<Record<string, any>> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 15_000) {
        const found = harness.events.find(predicate);
        if (found !== undefined) return found;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(harness.events)}`);
}

/** 等待装配状态满足条件。 */
async function waitFor(
    callback: () => Promise<unknown> | unknown,
    description: string,
    timeoutMs = 15_000,
): Promise<void> {
    const startedAt = Date.now();
    let lastError: unknown;
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const result = await callback();
            if (result !== undefined && result !== false) return;
        } catch (error) {
            lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for ${description}${lastError === undefined ? "" : `: ${String(lastError)}`}`);
}

/** 判断本次请求是否为完成审查。 */
function isCompletionReview(request: LLMRequest): boolean {
    return (request.messages.at(-1)?.content ?? "").includes("runtime_completion_candidate");
}

/**
 * 从 Runtime 反馈中读取本次可引用的已提交证据序号。
 *
 * @remarks 完成候选必须引用真实已提交证据；反馈按真实序号列出可引用范围。
 */
function readEvidenceSequences(request: LLMRequest): number[] {
    const feedback = request.messages.at(-1)?.content ?? "";
    const match = /Valid committed evidence sequences: ([0-9, ]+)/.exec(feedback);
    const captured = match?.[1];
    if (captured === undefined) return [];
    return captured
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isSafeInteger(value));
}

/** 记录真实执行入参的受控写入 Tool。 */
function controlledWriteTool(executed: { value: string }[]): Tool {
    return {
        definition: {
            id: "controlled_write",
            description: "Controlled write",
            inputBinding: createTestBinding<JsonValue>("test.fixture", objectInputSchema({ value: { type: "string" } })),
            isReadOnly: false,
        },
        replayPolicy: "safe",
        validate: () => ({ ok: true }),
        resolveSandboxAccess: () => ({
            files: [{ path: ".git/index", access: "write", kind: "file", purpose: "审批覆盖一次越界写入" }],
        }),
        async execute({ input }) {
            executed.push({ value: (input as { readonly value: string }).value });
            return { kind: "success", output: "stored", summary: "Stored" };
        },
    };
}

/** 手动重放策略的失败 Tool：外部效果未知，等待显式恢复决定。 */
function unknownEffectTool(executed: { value: string }[]): Tool {
    return {
        definition: {
            id: "controlled_write",
            description: "Controlled write with an unknown effect",
            inputBinding: createTestBinding<JsonValue>("test.fixture", objectInputSchema({ value: { type: "string" } })),
            isReadOnly: false,
        },
        replayPolicy: "manual",
        validate: () => ({ ok: true }),
        resolveSandboxAccess: () => ({
            files: [{ path: ".git/index", access: "write", kind: "file", purpose: "审批覆盖一次越界写入" }],
        }),
        async execute({ input }) {
            executed.push({ value: (input as { readonly value: string }).value });
            throw new TransientToolExecutionFailure("network_unavailable", 0);
        },
    };
}

const REQUIRE_APPROVAL = { evaluate: () => "require_approval" as const };

const PROFILE: AgentProfile = {
    id: "profile-integration",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Follow the scripted wire responses."],
    toolIds: ["controlled_write"],
};

test("集成：审批等待按 action_approval 领域身份发布，修订后按最终参数执行并结算正式答复", async () => {
    const executed: { value: string }[] = [];
    let decideCalls = 0;
    const adapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        async generate(request: LLMRequest): Promise<LLMResponse> {
            if (isCompletionReview(request)) {
                return toolCallResponse({
                    callId: "call-review",
                    toolId: "system_review_completion",
                    argumentsJson: JSON.stringify({ result: { kind: "accept" } }),
                });
            }
            decideCalls += 1;
            if (decideCalls === 1) {
                // 执行前必须先声明当前阶段。
                return toolCallResponse({
                    callId: "call-stage",
                    toolId: "system_start_run_stage",
                    argumentsJson: JSON.stringify({ target: "写入受控文件", acceptanceCriteria: ["事实已提交"] }),
                });
            }
            if (decideCalls === 2) {
                // 工具必须先被显式发现才可被本 Run 使用。
                return toolCallResponse({
                    callId: "call-find-tools",
                    toolId: "system_find_tools",
                    argumentsJson: JSON.stringify({ query: "controlled_write" }),
                });
            }
            if (decideCalls === 3) {
                return toolCallResponse({
                    callId: "call-write",
                    toolId: "controlled_write",
                    argumentsJson: JSON.stringify({ value: "original" }),
                });
            }
            return toolCallResponse({
                callId: "call-complete",
                toolId: "system_complete_task",
                argumentsJson: JSON.stringify({
                    summary: "最终答复正文",
                    evidenceSequences: readEvidenceSequences(request),
                }),
            });
        },
    };
    const harness = await startHarness({
        adapter,
        profile: PROFILE,
        toolRegistry: new InMemoryToolRegistry([createTestToolRegistration(controlledWriteTool(executed))]),
        toolPolicy: REQUIRE_APPROVAL,
    });
    try {
        const goalId = "goal-integration-revision";
        await harness.createGoal(goalId, "input-integration-revision", "写入受控文件并给出答复");
        const unsubscribe = await subscribe(harness, goalId);
        try {
            // 复核一：审批等待按 action_approval 领域身份发布，引用指向真实 Action。
            const required = await waitForEvent(
                harness,
                (event) => event.type === "state_sync" && event.state?.waitingFor === "action_approval",
                "the action approval wait",
            );
            const interaction = required.state.interaction;
            assert.equal(interaction.kind, "action_approval");
            assert.match(interaction.interactionId, /^action_approval:.+/);
            const actionId = interaction.interactionId.slice("action_approval:".length);
            const runId = required.state.runId;

            // 复核二：只读预检给出原请求与最终参数的关联，且不产生执行授权。
            const review = await harness.request(`/api/goals/${goalId}/action-reviews`, "POST", {
                runId,
                actionId,
                input: { value: "revised" },
            });
            assert.equal(review.status, 200);
            assert.equal(review.body.ok, true);
            assert.deepEqual(review.body.review.originalInput, { value: "original" });
            assert.deepEqual(review.body.review.finalInput, { value: "revised" });
            assert.equal(typeof review.body.review.reviewRef, "string");
            assert.deepEqual(executed, []);

            // 提交修订决定：绑定审阅引用，最终参数与授权由 A 拥有。
            const responded = await harness.respond(goalId, {
                kind: "respond",
                inputId: "input-integration-revision-approve",
                runId,
                requestId: actionId,
                response: {
                    kind: "approve_action_revision",
                    actionId,
                    input: { value: "revised" },
                    reviewRef: review.body.review.reviewRef,
                },
            });
            assert.equal(responded.ok, true, JSON.stringify(responded));

            // 实际执行使用最终参数；原请求参数未被执行。
            await waitFor(() => executed.length > 0, "the controlled tool to run");
            assert.deepEqual(executed, [{ value: "revised" }]);

            // 复核三：执行事实进入轨迹；SSE 通知客户端刷新 Activity。
            await waitFor(async () => (await harness.readTrajectory(goalId, runId))
                .some((event) => event.eventType === "tool_started" && event.actionId === actionId),
            "the committed tool activity");
            assert.equal(harness.events.some((event) => event.type === "state_committed"
                && event.changed?.includes("activity") === true), true);

            // 正式消息按稳定身份可查，来源指向被接受的完成候选。
            // 受理只保证决定已提交，后续模型与工具在后台推进，因此等待正式答复提交。
            let entries: Array<Record<string, any>> = [];
            await waitFor(async () => {
                const messages = await harness.request(`/api/goals/${goalId}/messages?limit=50`, "GET");
                if (messages.status !== 200) return false;
                entries = messages.body.messages as Array<Record<string, any>>;
                return entries.some((entry) => entry.content === "最终答复正文");
            }, "the committed final answer message");
            const answer = entries.find((entry) => entry.content === "最终答复正文");
            assert.ok(answer !== undefined, JSON.stringify(entries));
            assert.equal(answer.purpose, "answer");
            assert.equal(answer.sourceKind, "completion_candidate");
        } finally {
            await unsubscribe();
        }
    } finally {
        await harness.stop();
    }
});

test("集成：结果未知按 action_recovery 领域身份发布，恢复引用只允许独立重执行决定", async () => {
    const executed: { value: string }[] = [];
    let decideCalls = 0;
    const adapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        async generate(request: LLMRequest): Promise<LLMResponse> {
            if (isCompletionReview(request)) {
                return toolCallResponse({
                    callId: "call-review",
                    toolId: "system_review_completion",
                    argumentsJson: JSON.stringify({ result: { kind: "accept" } }),
                });
            }
            decideCalls += 1;
            if (decideCalls === 1) {
                // 执行前必须先声明当前阶段。
                return toolCallResponse({
                    callId: "call-stage",
                    toolId: "system_start_run_stage",
                    argumentsJson: JSON.stringify({ target: "写入受控文件", acceptanceCriteria: ["事实已提交"] }),
                });
            }
            if (decideCalls === 2) {
                // 工具必须先被显式发现才可被本 Run 使用。
                return toolCallResponse({
                    callId: "call-find-tools",
                    toolId: "system_find_tools",
                    argumentsJson: JSON.stringify({ query: "controlled_write" }),
                });
            }
            if (decideCalls === 3) {
                return toolCallResponse({
                    callId: "call-write",
                    toolId: "controlled_write",
                    argumentsJson: JSON.stringify({ value: "original" }),
                });
            }
            return toolCallResponse({
                callId: "call-complete",
                toolId: "system_complete_task",
                argumentsJson: JSON.stringify({
                    summary: "恢复后的答复",
                    evidenceSequences: readEvidenceSequences(request),
                }),
            });
        },
    };
    const harness = await startHarness({
        adapter,
        profile: PROFILE,
        toolRegistry: new InMemoryToolRegistry([createTestToolRegistration(unknownEffectTool(executed))]),
        toolPolicy: REQUIRE_APPROVAL,
    });
    try {
        const goalId = "goal-integration-recovery";
        await harness.createGoal(goalId, "input-integration-recovery", "写入受控文件并给出答复");
        const unsubscribe = await subscribe(harness, goalId);
        try {
            const required = await waitForEvent(
                harness,
                (event) => event.type === "state_sync" && event.state?.waitingFor === "action_approval",
                "the action approval wait",
            );
            const interaction = required.state.interaction;
            assert.equal(interaction.kind, "action_approval");
            const actionId = interaction.interactionId.slice("action_approval:".length);
            const runId = required.state.runId;

            const responded = await harness.respond(goalId, {
                kind: "respond",
                inputId: "input-integration-recovery-approve",
                runId,
                requestId: actionId,
                response: { kind: "approve_action", actionId },
            });
            assert.equal(responded.ok, true, JSON.stringify(responded));

            // 复核：结果未知的等待按 action_recovery 领域身份发布，引用稳定。
            const recovery = await waitForEvent(
                harness,
                (event) => event.type === "state_sync" && event.state?.waitingFor === "action_recovery",
                "the unknown outcome wait",
            );
            assert.equal(recovery.state.interaction.interactionId, `action_recovery:${actionId}`);
            assert.equal(recovery.state.runId, runId);

            // 恢复引用只能来自当前等待视图。
            const details = await harness.request(
                `/api/goals/${goalId}/interaction-details?runId=${runId}&interactionId=${encodeURIComponent(recovery.state.interaction.interactionId)}`,
                "GET",
            );
            assert.equal(details.status, 200);
            assert.equal(details.body.ok, true);
            const recoveryRef = details.body.detail.recoveryRef;
            assert.equal(typeof recoveryRef, "string");

            // 过期恢复引用不被接受。
            const staleRef = await harness.respond(goalId, {
                kind: "respond",
                inputId: "input-integration-recovery-stale",
                runId,
                requestId: actionId,
                response: { kind: "retry_unknown_action", actionId, recoveryRef: "recovery-not-current" },
            });
            assert.equal(staleRef.ok, false);
            assert.equal(staleRef.code, "INTERACTION_MISMATCH");

            // 复核：独立重执行决定使用当前恢复引用，并真正重跑该 Action。
            const retried = await harness.respond(goalId, {
                kind: "respond",
                inputId: "input-integration-recovery-retry",
                runId,
                requestId: actionId,
                response: { kind: "retry_unknown_action", actionId, recoveryRef },
            });
            assert.equal(retried.ok, true, JSON.stringify(retried));
            await waitFor(() => executed.length > 1, "the independent re-execution");
            assert.deepEqual(executed, [{ value: "original" }, { value: "original" }]);
        } finally {
            await unsubscribe();
        }
    } finally {
        await harness.stop();
    }
});

test("集成：PTC 子操作工具活动保留子操作身份，父程序身份可由交互视图与轨迹追溯", {
    skip: !isSeatbeltSupported(),
}, async () => {
    const executed: { path: string; content: string }[] = [];
    let decideCalls = 0;
    const code = [
        "const first = await tools.write_file({path:'a.txt', content:'original'});",
        "return {first:first.observation.kind};",
    ].join("");
    const adapter: LLMAdapter = {
        structuredOutputMode: "prompt_only",
        async generate(request: LLMRequest): Promise<LLMResponse> {
            if (isCompletionReview(request)) {
                return toolCallResponse({
                    callId: "call-review",
                    toolId: "system_review_completion",
                    argumentsJson: JSON.stringify({ result: { kind: "accept" } }),
                });
            }
            decideCalls += 1;
            if (decideCalls === 1) {
                return toolCallResponse({
                    callId: "call-stage",
                    toolId: "system_start_run_stage",
                    argumentsJson: JSON.stringify({ target: "执行 PTC 程序", acceptanceCriteria: ["程序已执行"] }),
                });
            }
            if (decideCalls === 2) {
                return toolCallResponse({
                    callId: "call-find-tools",
                    toolId: "system_find_tools",
                    argumentsJson: JSON.stringify({ query: "execute_program write_file" }),
                });
            }
            if (decideCalls === 3) {
                return toolCallResponse({
                    callId: "call-program",
                    toolId: "execute_program",
                    argumentsJson: JSON.stringify({ code }),
                });
            }
            return toolCallResponse({
                callId: "call-complete",
                toolId: "system_complete_task",
                argumentsJson: JSON.stringify({
                    summary: "PTC 完成",
                    evidenceSequences: readEvidenceSequences(request),
                }),
            });
        },
    };
    const harness = await startHarness({
        adapter,
        profile: {
            id: "profile-integration-ptc",
            systemPrompt: "You are a focused coding agent.",
            instructions: ["Follow the scripted wire responses."],
            toolIds: ["execute_program", "write_file"],
        },
        toolRegistry: new InMemoryToolRegistry([
            createExecuteProgramRegistration(),
            createTestToolRegistration({
                definition: {
                    id: "write_file",
                    description: "受控写入 Tool",
                    inputBinding: createTestBinding<JsonValue>("test.fixture", objectInputSchema({ path: { type: "string" }, content: { type: "string" } })),
                    isReadOnly: false,
                },
                replayPolicy: "safe",
                validate: () => ({ ok: true }),
                resolveSandboxAccess: () => ({
                    files: [{ path: ".git/index", access: "write", kind: "file", purpose: "审批覆盖一次越界写入" }],
                }),
                async execute({ input }) {
                    const value = input as { readonly path: string; readonly content: string };
                    executed.push({ path: value.path, content: value.content });
                    return { kind: "success", output: "saved", summary: "Wrote" };
                },
            }),
        ]),
        toolPolicy: {
            evaluate: ({ tool }) => (tool.id === "execute_program" ? "allow" as const : "require_approval" as const),
        },
    });
    try {
        const goalId = "goal-integration-ptc";
        await harness.createGoal(goalId, "input-integration-ptc", "执行 PTC 程序");
        const unsubscribe = await subscribe(harness, goalId);
        try {
            // 复核：PTC 子操作的审批等待按子操作自身身份发布。
            const required = await waitForEvent(
                harness,
                (event) => event.type === "state_sync" && event.state?.waitingFor === "action_approval",
                "the PTC child approval wait",
            );
            const interaction = required.state.interaction;
            assert.equal(interaction.kind, "action_approval");
            const childActionId = interaction.interactionId.slice("action_approval:".length);
            const runId = required.state.runId;
            assert.notEqual(childActionId, "");
            // 子操作身份由父程序身份与调用序号派生，不与父程序 Action 混同。
            assert.equal(childActionId.includes(":"), true);

            // 复核：父程序身份来自无界面宿主的规范交互视图：PTC 子等待标记为来自程序。
            const view = await harness.readInteraction(goalId);
            assert.ok(view !== undefined);
            assert.equal(view.kind, "action_approval");
            assert.equal(view.fromProgram, true);
            assert.equal(view.toolId, "write_file");
            assert.equal(view.actionId, childActionId);

            // 复核：浏览器 wire 能按 PTC 子操作身份寻址交互详情，并给出父程序身份。
            const details = await harness.request(
                `/api/goals/${goalId}/interaction-details?runId=${runId}&interactionId=${encodeURIComponent(interaction.interactionId)}`,
                "GET",
            );
            assert.equal(details.status, 200);
            assert.equal(details.body.ok, true);
            assert.equal(details.body.detail.actionId, childActionId);
            assert.equal(typeof details.body.detail.parentProgram.actionId, "string");
            assert.equal(details.body.detail.parentProgram.callNumber, 1);

            // 复核：浏览器 wire 能按 PTC 子操作身份读取 Action 详情。
            const actionDetails = await harness.request(
                `/api/goals/${goalId}/actions/${encodeURIComponent(childActionId)}?runId=${runId}`,
                "GET",
            );
            assert.equal(actionDetails.status, 200);
            assert.equal(actionDetails.body.ok, true);
            assert.equal(actionDetails.body.actionId, childActionId);
            assert.equal(actionDetails.body.toolId, "write_file");

            // 复核：父程序身份与子调用序号保存在已提交 Trajectory 中。
            const committed = await harness.readTrajectory(goalId, runId);
            const staged = committed.find((event) => event.eventType === "action_staged"
                && event.actionId === childActionId);
            assert.ok(staged !== undefined, JSON.stringify(committed.map((event) => event.eventType)));
            assert.equal(typeof staged.programId, "string");
            assert.equal(typeof staged.callIndex, "number");
            const parentStaged = committed.find((event) => event.eventType === "action_staged"
                && event.actionId === staged.actionId);
            assert.ok(parentStaged !== undefined);

            // 复核：子操作工具活动携带子操作自身的 Action 身份。
            const responded = await harness.respond(goalId, {
                kind: "respond",
                inputId: "input-integration-ptc-approve",
                runId,
                requestId: childActionId,
                response: { kind: "approve_action", actionId: childActionId },
            });
            assert.equal(responded.ok, true, JSON.stringify(responded));
            await waitFor(() => executed.length > 0, "the PTC child write");
            assert.deepEqual(executed, [{ path: "a.txt", content: "original" }]);

            // Activity 失效通知后，已提交轨迹保留子 Action 的 Tool 身份。
            await waitFor(async () => (await harness.readTrajectory(goalId, runId))
                .some((event) => event.eventType === "tool_started" && event.actionId === childActionId),
            "the committed PTC child tool activity");
        } finally {
            await unsubscribe();
        }
    } finally {
        await harness.stop();
    }
});
