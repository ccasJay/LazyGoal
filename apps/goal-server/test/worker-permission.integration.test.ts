import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LLMAdapter, LLMRequest } from "../../../packages/llm-core/src/index";
import { createGoal } from "../../../packages/runtime/src/domain";
import { currentProtocols } from "../../../packages/runtime/test/current-fixtures";
import { externalTestActor, permissionDecisionTrigger, workTrigger } from "../../../packages/runtime/test/trigger-fixtures";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";
import { TriggerDeliveryStore } from "../../../packages/storage/src/trigger-delivery-store";
import { admitTrigger } from "../src/runtime/trigger-admission";
import { WorkerScheduler } from "../src/runtime/worker-scheduler";

function chatChunk(delta: Record<string, unknown>, finishReason: string | null = null): Record<string, unknown> {
    return { id: "worker-permission-test", object: "chat.completion.chunk", created: 0, model: "test-model",
        choices: [{ index: 0, delta, finish_reason: finishReason }] };
}

function toolFrames(toolId: string, args: Record<string, unknown>, callId: string): string {
    return [
        { tool_calls: [{ index: 0, id: callId, type: "function", function: { name: toolId, arguments: JSON.stringify(args) } }] },
        {},
    ].map((delta, index) => `data: ${JSON.stringify(chatChunk(delta, index === 1 ? "tool_calls" : null))}\n\n`).join("")
        + "data: [DONE]\n\n";
}

async function waitFor(predicate: () => boolean, timeoutMs = 15000, onTimeout = () => "Timed out waiting for the Worker permission exchange"): Promise<void> {
    const end = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() >= end) throw new Error(onTimeout());
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

test("Worker 的一次性 Action 权限经 Trigger 由 Supervisor 决定并在执行前结算", { timeout: 30000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "lg-worker-permission-"));
    const workspace = join(root, "workspace");
    const home = join(root, "home");
    const dataDirectory = join(root, "data");
    const profileDirectory = join(home, "agent-profiles");
    await Promise.all([
        mkdir(workspace, { recursive: true }), mkdir(profileDirectory, { recursive: true }), mkdir(dataDirectory, { recursive: true }),
    ]);
    await writeFile(join(profileDirectory, "default.json"), JSON.stringify({ schemaVersion: 1, id: "default", name: "Test",
        description: "Test", systemPrompt: "Test", instructions: ["Test"], toolIds: ["write_file"] }));

    const requests: Record<string, unknown>[] = [];
    const requestsByScenario = new Map<string, number>();
    const server = createServer((request, response) => {
        void (async () => {
            let bodyText = "";
            request.setEncoding("utf8");
            for await (const chunk of request) bodyText += chunk;
            const body = JSON.parse(bodyText) as Record<string, unknown>;
            requests.push(body);
            const scenario = bodyText.includes("人工授权动作") ? "manual" : "automatic";
            const toolNames = Array.isArray(body.tools)
                ? body.tools.flatMap((tool) => typeof tool === "object" && tool !== null && "function" in tool
                    && typeof tool.function === "object" && tool.function !== null && "name" in tool.function
                    && typeof tool.function.name === "string" ? [tool.function.name] : [])
                : [];
            if (toolNames.includes("system_review_completion")) {
                response.writeHead(200, { "content-type": "text/event-stream" });
                response.end(toolFrames("system_review_completion", { result: { kind: "accept" } }, `review-${requests.length}`));
                return;
            }
            const position = (requestsByScenario.get(scenario) ?? 0) + 1;
            requestsByScenario.set(scenario, position);
            const scripted = position === 1
                ? ["system_start_run_stage", { target: "写入受控文件", acceptanceCriteria: ["动作经权限往返后执行"] }]
                : position === 2
                    ? ["system_find_tools", { query: "write_file" }]
                    : position === 3
                        ? ["write_file", { path: `${scenario}-permission-result.txt`, content: `${scenario} authorized once` }]
                        : undefined;
            if (scripted === undefined) {
                response.writeHead(500);
                response.end("The test ends after the authorized Action executes");
                return;
            }
            response.writeHead(200, { "content-type": "text/event-stream" });
            response.end(toolFrames(scripted[0] as string, scripted[1] as Record<string, unknown>, `${scenario}-worker-call-${position}`));
        })().catch((error: unknown) => {
            response.writeHead(500);
            response.end(String(error));
        });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address !== null && typeof address !== "string");

    const env = {
        LAZYGOAL_HOME: home,
        LLM_PROVIDER: "openai-compatible",
        LLM_MODEL: "test-model",
        LLM_API_KEY: "test-key",
        LLM_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
        LLM_CONTEXT_WINDOW_TOKENS: "16000",
        LLM_MAX_OUTPUT_TOKENS: "4096",
        LLM_TOKENIZER_ENCODING: "cl100k_base",
    } as NodeJS.ProcessEnv;
    const owner = new SupervisorOwnership(join(dataDirectory, "owner.db"));
    const deliveries = new TriggerDeliveryStore(join(dataDirectory, "deliveries.db"));
    const goals = new JsonFileGoalStore(join(dataDirectory, "goals"));
    let reviewerCalls = 0;
    const permissionAdapter: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate(request: LLMRequest) {
            reviewerCalls += 1;
            const content = request.messages.at(-1)?.content;
            const permissionRequest = typeof content === "string" ? JSON.parse(content) as { goalIntent?: string } : {};
            if (permissionRequest.goalIntent?.includes("人工授权动作")) throw new Error("Supervisor permission model is unavailable");
            return { blocks: [{ index: 0, type: "text", format: "json", text: JSON.stringify({ kind: "approve", reason: null }) }] };
        },
    };
    const scheduler = new WorkerScheduler({ owner, deliveries, goals, cwd: workspace, dataDirectory, env, permissionAdapter });
    const principal = { role: "user", externalId: "test-actor", mayCreateGoal: true, goalIds: [] } as const;
    try {
        const admitGoal = async (suffix: string, intent: string): Promise<string> => {
            const event = { deliveryId: `worker-permission-work-${suffix}`, trigger: workTrigger(`worker-permission-event-${suffix}`, intent) };
            const admitted = await admitTrigger(owner, deliveries, goals, permissionAdapter, event, principal, async (goalIntent, reservedGoalId) => ({
                goal: createGoal({ ...currentProtocols, id: reservedGoalId ?? `permission-goal-${suffix}`, runId: `permission-run-${suffix}`, intent: goalIntent,
                    promptBundleVersion: 1,
                    modelSelection: { provider: "openai-compatible", modelId: "test-model", contextWindowTokens: 16000,
                        maxOutputTokens: 4096, inputEstimator: { kind: "character-v1" } },
                    profile: { id: "default", systemPrompt: "Test", instructions: ["Write the requested file."], toolIds: ["write_file"] } }),
                authorization: { workspace: { mode: "shared" as const, projectRoot: workspace, executionRoot: workspace },
                    toolIds: ["write_file"], sandbox: { extraFiles: [], network: "none" } },
            }));
            if (admitted.kind !== "settled" || admitted.receipt.status !== "settled" || admitted.receipt.result.kind !== "accepted") {
                throw new Error("Expected Trigger admission to accept the Goal");
            }
            return admitted.receipt.result.goalId;
        };

        const goalId = await admitGoal("automatic", "自动授权动作");
        await scheduler.pump();
        await waitFor(() => scheduler.actionPermissionStatuses(goalId).length > 0);
        await waitFor(() => scheduler.actionPermissionStatuses(goalId).some((status) => !status.pending), 15000, () =>
            `Permission exchange remains pending: statuses=${JSON.stringify(scheduler.actionPermissionStatuses(goalId))}, queue=${JSON.stringify(deliveries.queueRecord(goalId))}, requests=${requests.length}, reviewerCalls=${reviewerCalls}`);
        await waitFor(() => deliveries.queueRecord(goalId)?.status === "terminal");

        const statuses = scheduler.actionPermissionStatuses(goalId);
        assert.equal(statuses.length, 1);
        assert.equal(statuses[0]?.request.type, "action_approval_request");
        assert.equal(statuses[0]?.pending, false);
        assert.equal(reviewerCalls, 1);
        assert.equal(await readFile(join(workspace, "automatic-permission-result.txt"), "utf8"), "automatic authorized once");
        const replies = deliveries.listGoalDeliveries(goalId).filter((item) => item.delivery.trigger.type === "permission"
            && item.delivery.trigger.payload.action === "decided" && item.delivery.trigger.source.role === "supervisor");
        assert.equal(replies.length, 1);
        assert.ok(replies[0]?.status === "settled" && replies[0].result.kind === "handled");
        const replyTrigger = replies[0]!.delivery.trigger;
        assert.ok(replyTrigger.type === "permission" && replyTrigger.payload.action === "decided");
        if (replyTrigger.type !== "permission" || replyTrigger.payload.action !== "decided") throw new Error("Expected a permission decision Trigger");
        assert.deepEqual({ decision: replyTrigger.payload.decision, scope: replyTrigger.payload.scope }, { decision: "approve", scope: "action" });
        assert.equal(requests.length >= 3, true);

        const manualGoalId = await admitGoal("manual", "人工授权动作");
        await scheduler.pump();
        await waitFor(() => scheduler.actionPermissionStatuses(manualGoalId).some((status) => status.failure === "model-failed"));
        const manualRequest = scheduler.actionPermissionStatuses(manualGoalId)[0]!;
        assert.equal(manualRequest.pending, true);
        assert.equal(manualRequest.failure, "model-failed");
        assert.equal(deliveries.queueRecord(manualGoalId)?.status, "waiting");
        assert.equal(reviewerCalls, 2);

        const queue = deliveries.queueRecord(manualGoalId)!;
        const manualPrincipal = { role: "user", externalId: "test-actor", mayCreateGoal: false, goalIds: [manualGoalId] } as const;
        const staleReply = {
            deliveryId: "old-worker-permission-reply",
            trigger: permissionDecisionTrigger("old-worker-permission-event", manualGoalId, "retired-request", "approve", undefined, externalTestActor),
        };
        await assert.rejects(scheduler.handleActionPermissionReply(staleReply, manualPrincipal), /stored request Trigger/);
        assert.equal(await readFile(join(workspace, "manual-permission-result.txt")).then(() => true, () => false), false);

        const validReply = {
            deliveryId: "manual-worker-permission-reply",
            trigger: permissionDecisionTrigger("manual-worker-permission-event", manualGoalId, manualRequest.request.requestId, "approve", undefined, externalTestActor),
        };
        await scheduler.handleActionPermissionReply(validReply, manualPrincipal);
        await waitFor(() => scheduler.actionPermissionStatuses(manualGoalId).some((status) => !status.pending));
        await waitFor(() => deliveries.queueRecord(manualGoalId)?.status === "terminal");
        assert.equal(await readFile(join(workspace, "manual-permission-result.txt"), "utf8"), "manual authorized once");
        assert.equal(scheduler.actionPermissionStatuses(manualGoalId)[0]?.failure, undefined);
        assert.equal(deliveries.listGoalDeliveries(manualGoalId).some((item) => item.delivery.deliveryId === "manual-worker-permission-reply"
            && item.status === "settled" && item.result.kind === "handled"), true);
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        for (const worker of await scheduler.processIds().catch(() => [])) process.kill(worker.pid, "SIGKILL");
        await scheduler.closeIdle().catch(() => undefined);
        deliveries.close();
        await owner.close();
        await rm(root, { recursive: true, force: true });
    }
});
