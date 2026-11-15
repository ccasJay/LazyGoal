import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LLMAdapter } from "../../../packages/llm-core/src/index";
import { PERMISSION_PRESETS } from "../../../packages/permission/src/index";
import { createGoal } from "../../../packages/runtime/src/domain";
import { currentProtocols } from "../../../packages/runtime/test/current-fixtures";
import { externalTestActor, permissionDecisionTrigger, workTrigger } from "../../../packages/runtime/test/trigger-fixtures";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";
import { TriggerStore } from "../../../packages/storage/src/trigger-store";
import { receiveAuthorizedTrigger } from "../../../packages/storage/src/trigger-ingress";
import { admitTrigger } from "../src/runtime/trigger-admission";
import { WorkerScheduler } from "../src/runtime/worker-scheduler";

const unusedContinuation = async () => ({ ok: false as const, code: "RUN_NOT_FOUND", message: "continuation is not wired in this test" });

/** 无人宿主读取到的档位：`user` 审阅在 Worker 侧退化为确定性规则表裁决。 */
const readPermissionProfile = async () => ({
    workspaceId: "test-workspace",
    profile: PERMISSION_PRESETS.ask,
    revision: 0,
});

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

test("Worker 的越界 Action 按权限档位自动裁决，命中规则表时保留人工等待", { timeout: 30000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "lg-worker-permission-"));
    const workspace = join(root, "workspace");
    const home = join(root, "home");
    const dataDirectory = join(root, "data");
    const profileDirectory = join(home, "agent-profiles");
    const outsideReference = join(root, "outside-reference.txt");
    await Promise.all([
        mkdir(workspace, { recursive: true }), mkdir(profileDirectory, { recursive: true }), mkdir(dataDirectory, { recursive: true }),
        writeFile(outsideReference, "reference\n"),
    ]);
    await writeFile(join(profileDirectory, "default.json"), JSON.stringify({ schemaVersion: 1, id: "default", name: "Test",
        description: "Test", systemPrompt: "Test", instructions: ["Test"], toolIds: ["bash"] }));

    const requests: Record<string, unknown>[] = [];
    const requestsByScenario = new Map<string, number>();
    const server = createServer((request, response) => {
        void (async () => {
            let bodyText = "";
            request.setEncoding("utf8");
            for await (const chunk of request) bodyText += chunk;
            const body = JSON.parse(bodyText) as Record<string, unknown>;
            requests.push(body);
            const scenario = bodyText.includes("人工规则命中动作") ? "manual" : "automatic";
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
                ? ["system_start_run_stage", { target: "写入受控文件", acceptanceCriteria: ["动作经边界裁决后执行"] }]
                : position === 2
                    ? ["system_find_tools", { query: "bash" }]
                    : position === 3
                        ? ["bash", {
                            command: `printf '${scenario} authorized once' > ${scenario}-permission-result.txt`,
                            sandboxAccess: scenario === "automatic"
                                ? { files: [{ path: outsideReference, access: "read", kind: "file", purpose: "读取工作区外参考文件" }] }
                                : { network: { targets: ["127.0.0.1:9"], purpose: "访问工作区外服务" } },
                        }]
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
    const triggers = new TriggerStore(join(dataDirectory, "triggers.db"));
    const goals = new JsonFileGoalStore(join(dataDirectory, "goals"));
    const admissionAdapter: LLMAdapter = {
        structuredOutputMode: "strict",
        async generate() {
            return { blocks: [{ index: 0, type: "text", format: "json", text: JSON.stringify({ kind: "accept", reason: null }) }] };
        },
    };
    const scheduler = new WorkerScheduler({ owner, triggers, goals, cwd: workspace, dataDirectory, env, readPermissionProfile, commitContinuation: unusedContinuation });
    const principal = { role: "user", externalId: "test-actor", mayCreateGoal: true, goalIds: [] } as const;
    try {
        const admitGoal = async (suffix: string, intent: string): Promise<string> => {
            const trigger = workTrigger(`worker-permission-event-${suffix}`, intent);
            const admitted = await admitTrigger(owner, triggers, goals, admissionAdapter, trigger, principal, async (goalIntent, reservedGoalId) => ({
                goal: createGoal({ ...currentProtocols, id: reservedGoalId ?? `permission-goal-${suffix}`, runId: `permission-run-${suffix}`, intent: goalIntent,
                    promptBundleVersion: 1,
                    modelSelection: { provider: "openai-compatible", modelId: "test-model", contextWindowTokens: 16000,
                        maxOutputTokens: 4096, inputEstimator: { kind: "character-v1" } },
                    profile: { id: "default", systemPrompt: "Test", instructions: ["Run the requested command."], toolIds: ["bash"] } }),
                authorization: { workspace: { mode: "shared" as const, projectRoot: workspace, executionRoot: workspace },
                    toolIds: ["bash"] },
            }));
            if (admitted.kind !== "accepted") throw new Error("Expected Trigger admission to accept the Goal");
            return admitted.goalId;
        };

        // 无规则命中的越界（工作区外读取）在无人宿主自动放行。
        const goalId = await admitGoal("automatic", "自动边界裁决动作");
        await scheduler.pump();
        await waitFor(() => scheduler.actionPermissionStatuses(goalId).length > 0);
        await waitFor(() => scheduler.actionPermissionStatuses(goalId).some((status) => !status.pending), 15000, () =>
            `Permission exchange remains pending: statuses=${JSON.stringify(scheduler.actionPermissionStatuses(goalId))}, queue=${JSON.stringify(triggers.queueRecord(goalId))}, requests=${requests.length}`);
        await waitFor(() => triggers.queueRecord(goalId)?.status === "terminal");

        const automaticStatuses = scheduler.actionPermissionStatuses(goalId);
        assert.equal(automaticStatuses.length, 1);
        assert.equal(automaticStatuses[0]?.request.type, "action_approval_request");
        assert.equal(automaticStatuses[0]?.pending, false);
        assert.equal(automaticStatuses[0]?.failure, undefined);
        const storedRequest = triggers.read(automaticStatuses[0]!.requestId);
        assert.ok(storedRequest !== undefined && storedRequest.type === "permission" && storedRequest.payload.action === "requested");
        assert.equal(storedRequest.goalId, goalId);
        assert.equal(storedRequest.target, "supervisor");
        assert.equal(await readFile(join(workspace, "automatic-permission-result.txt"), "utf8"), "automatic authorized once");
        const automaticReplies = triggers.listGoalTriggers(goalId).filter((trigger) => trigger.type === "permission"
            && trigger.payload.action === "decided" && trigger.source.role === "supervisor");
        assert.equal(automaticReplies.length, 1);
        const automaticReply = automaticReplies[0];
        if (automaticReply?.type !== "permission" || automaticReply.payload.action !== "decided" || !("replyTo" in automaticReply)) {
            throw new Error("Expected a permission decision Trigger");
        }
        assert.equal(automaticReply.replyTo, automaticStatuses[0]!.requestId);
        assert.equal(triggers.routeStatus(automaticReply.id), "routed");
        assert.equal(triggers.routeStatus(automaticStatuses[0]!.requestId), "routed");
        assert.deepEqual(automaticReply.payload, { action: "decided", decision: "approve", scope: "action" });

        // 命中规则表（出站网络）的越界保持人工等待，由外部批准后仅执行该次 Action。
        const manualGoalId = await admitGoal("manual", "人工规则命中动作");
        await scheduler.pump();
        await waitFor(() => scheduler.actionPermissionStatuses(manualGoalId).length > 0);
        const manualRequest = scheduler.actionPermissionStatuses(manualGoalId)[0]!;
        assert.equal(manualRequest.pending, true);
        assert.equal(manualRequest.failure, undefined);
        assert.equal(triggers.queueRecord(manualGoalId)?.status, "waiting");
        assert.equal(await readFile(join(workspace, "manual-permission-result.txt")).then(() => true, () => false), false);

        const manualPrincipal = { role: "user", externalId: "test-actor", mayCreateGoal: false, goalIds: [manualGoalId] } as const;
        const staleReply = permissionDecisionTrigger("old-worker-permission-event", manualGoalId, "retired-request", "approve", undefined, externalTestActor);
        await assert.rejects(scheduler.handleActionPermissionReply(staleReply, manualPrincipal), /stored request Trigger/);
        assert.equal(triggers.routeStatus(staleReply.id), undefined);
        const crossGoalReply = permissionDecisionTrigger("cross-goal-worker-permission-event", "another-goal",
            manualRequest.requestId, "approve", undefined, externalTestActor);
        await assert.rejects(scheduler.handleActionPermissionReply(crossGoalReply, manualPrincipal), /stored request Trigger/);
        assert.equal(triggers.routeStatus(crossGoalReply.id), undefined);

        const validReply = permissionDecisionTrigger("manual-worker-permission-event", manualGoalId, manualRequest.requestId, "approve", undefined, externalTestActor);
        if (validReply.type !== "permission" || validReply.payload.action !== "decided" || !("replyTo" in validReply)) {
            throw new Error("Expected a permission decision Trigger");
        }
        assert.equal(validReply.replyTo, manualRequest.requestId);
        assert.equal(validReply.goalId, manualGoalId);
        assert.deepEqual(validReply.payload, { action: "decided", decision: "approve", scope: "action" });
        receiveAuthorizedTrigger(triggers, validReply, manualPrincipal);
        await scheduler.pump();
        await waitFor(() => scheduler.actionPermissionStatuses(manualGoalId).some((status) => !status.pending));
        await waitFor(() => triggers.queueRecord(manualGoalId)?.status === "terminal");
        assert.equal(await readFile(join(workspace, "manual-permission-result.txt"), "utf8"), "manual authorized once");
        assert.equal(triggers.routeStatus(manualRequest.requestId), "routed");
        assert.equal(triggers.routeStatus(validReply.id), "routed");
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        for (const worker of await scheduler.processIds().catch(() => [])) process.kill(worker.pid, "SIGKILL");
        await scheduler.closeIdle().catch(() => undefined);
        triggers.close();
        await owner.close();
        await rm(root, { recursive: true, force: true });
    }
});
