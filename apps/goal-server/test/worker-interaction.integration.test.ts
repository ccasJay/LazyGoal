import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGoal } from "../../../packages/runtime/src/domain";
import { projectInteractionView } from "../../../packages/runtime/src/interaction-view";
import { currentProtocols } from "../../../packages/runtime/test/current-fixtures";
import { externalTestActor, interactionAnswerTrigger, workTrigger } from "../../../packages/runtime/test/trigger-fixtures";
import type { GoalUserAction } from "../../../packages/runtime/src/trigger";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";
import { TriggerStore } from "../../../packages/storage/src/trigger-store";
import { admitTrigger } from "../src/runtime/trigger-admission";
import { WorkerScheduler } from "../src/runtime/worker-scheduler";

function chatChunk(delta: Record<string, unknown>, finishReason: string | null = null): Record<string, unknown> {
    return { id: "worker-interaction-test", object: "chat.completion.chunk", created: 0, model: "test-model",
        choices: [{ index: 0, delta, finish_reason: finishReason }] };
}

function toolFrames(toolId: string, args: Record<string, unknown>, callId: string): string {
    return [
        { tool_calls: [{ index: 0, id: callId, type: "function", function: { name: toolId, arguments: JSON.stringify(args) } }] },
        {},
    ].map((delta, index) => `data: ${JSON.stringify(chatChunk(delta, index === 1 ? "tool_calls" : null))}\n\n`).join("")
        + "data: [DONE]\n\n";
}

async function waitFor(predicate: () => boolean, timeoutMs = 15000): Promise<void> {
    const end = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() >= end) throw new Error("Timed out waiting for the Worker interaction exchange");
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

test("interaction.answered crosses the Worker process and resumes only its current Goal wait", { timeout: 30000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "lg-worker-interaction-"));
    const workspace = join(root, "workspace");
    const home = join(root, "home");
    const dataDirectory = join(root, "data");
    const profileDirectory = join(home, "agent-profiles");
    await Promise.all([
        mkdir(workspace, { recursive: true }), mkdir(profileDirectory, { recursive: true }), mkdir(dataDirectory, { recursive: true }),
    ]);
    await writeFile(join(profileDirectory, "default.json"), JSON.stringify({ schemaVersion: 1, id: "default", name: "Test",
        description: "Test", systemPrompt: "Ask the user one question, then wait for input.", instructions: ["Follow the requested interaction."], toolIds: [] }));

    let runCalls = 0;
    const server = createServer((request, response) => {
        void (async () => {
            let bodyText = "";
            request.setEncoding("utf8");
            for await (const chunk of request) bodyText += chunk;
            const body = JSON.parse(bodyText) as Record<string, unknown>;
            const tools = Array.isArray(body.tools) ? body.tools : [];
            const toolNames = tools.flatMap((tool) => typeof tool === "object" && tool !== null && "function" in tool
                && typeof tool.function === "object" && tool.function !== null && "name" in tool.function
                && typeof tool.function.name === "string" ? [tool.function.name] : []);
            if (toolNames.includes("system_review_completion")) {
                response.writeHead(200, { "content-type": "text/event-stream" });
                response.end(toolFrames("system_review_completion", { result: { kind: "accept" } }, "interaction-review"));
                return;
            }
            runCalls += 1;
            const scripted = runCalls === 1
                ? ["ask_user", { questions: [{ header: "Choice", question: "Which option should I use?",
                    options: [{ label: "Option A" }, { label: "Option B" }], multiSelect: false }] }]
                : runCalls === 2
                    ? ["system_wait_for_input", { reason: "Wait after applying the answer" }]
                    : undefined;
            if (scripted === undefined) {
                response.writeHead(500);
                response.end("The scripted interaction test has no further model response");
                return;
            }
            response.writeHead(200, { "content-type": "text/event-stream" });
            response.end(toolFrames(scripted[0] as string, scripted[1] as Record<string, unknown>, `interaction-call-${runCalls}`));
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
    const never = { structuredOutputMode: "prompt_only" as const, async generate() { throw new Error("No permission decision is expected"); } };
    const scheduler = new WorkerScheduler({ owner, triggers, goals, cwd: workspace, dataDirectory, env, permissionAdapter: never });
    const principal = { role: "user", externalId: "test-actor", mayCreateGoal: true, goalIds: [] } as const;
    const work = workTrigger("worker-interaction-work", "Ask a question and wait for an answer");
    let goalId: string | undefined;
    try {
        const admission = await admitTrigger(owner, triggers, goals, never, work, principal, async (intent, reservedGoalId) => ({
            goal: createGoal({ ...currentProtocols, id: reservedGoalId ?? "worker-interaction-goal", runId: "worker-interaction-run", intent,
                promptBundleVersion: 1,
                modelSelection: { provider: "openai-compatible", modelId: "test-model", contextWindowTokens: 16000,
                    maxOutputTokens: 4096, inputEstimator: { kind: "character-v1" } },
                profile: { id: "default", systemPrompt: "Test", instructions: ["Follow the requested interaction."], toolIds: [] } }),
            authorization: { workspace: { mode: "shared" as const, projectRoot: workspace, executionRoot: workspace },
                toolIds: [], sandbox: { extraFiles: [], network: "none" as const } },
        }));
        if (admission.kind !== "accepted") throw new Error("Expected Trigger admission to accept the Goal");
        goalId = admission.goalId;
        await scheduler.pump();
        await waitFor(() => triggers.queueRecord(goalId!)?.status === "waiting");
        const waitingGoal = await goals.restore(goalId);
        assert.ok(waitingGoal !== undefined);
        assert.equal(waitingGoal.state.run.status, "waiting");
        assert.equal(triggers.queueRecord(goalId)?.workerId !== undefined, true);
        const workerProcesses = await scheduler.processIds();
        assert.equal(workerProcesses.length, 1);
        assert.notEqual(workerProcesses[0]?.pid, process.pid);
        const pending = waitingGoal.state.run.pendingInteraction;
        if (pending?.kind !== "ask_user") assert.fail("Expected a persisted ask_user wait");
        const question = pending.questions[0]!;
        const option = question.options[0]!;
        const answer: GoalUserAction = {
            kind: "answer_ask_user",
            requestId: pending.requestId,
            answers: [{ questionId: question.id, optionIds: [option.id] }],
        };
        const interactionPrincipal = { ...principal, mayCreateGoal: false, goalIds: [goalId] } as const;
        const crossGoal = interactionAnswerTrigger("worker-interaction-cross-goal", "another-goal", work.id, answer, externalTestActor);
        await assert.rejects(scheduler.handleInteractionTrigger(crossGoal, interactionPrincipal), /authorized/);
        assert.equal(triggers.routeStatus(crossGoal.id), undefined);
        const staleAnswer: GoalUserAction = { ...answer, requestId: "retired-question" };
        const staleInteraction = interactionAnswerTrigger("worker-interaction-stale-question", goalId, work.id, staleAnswer, externalTestActor);
        await assert.rejects(scheduler.handleInteractionTrigger(staleInteraction, interactionPrincipal), /current Goal wait/);
        assert.equal(triggers.routeStatus(staleInteraction.id), "unrouted");
        assert.equal((await goals.restore(goalId))?.state.run.pendingInteraction?.kind, "ask_user");

        const interaction = interactionAnswerTrigger("worker-interaction-answer", goalId, work.id, answer, externalTestActor);
        if (interaction.type !== "interaction" || interaction.payload.action !== "answered" || !("replyTo" in interaction)) {
            assert.fail("Expected a Goal-bound interaction answer Trigger");
        }
        assert.deepEqual(interaction.payload, { action: "answered", answer });
        assert.equal(interaction.goalId, goalId);
        assert.equal(interaction.replyTo, work.id);

        const result = await scheduler.handleInteractionTrigger(interaction, interactionPrincipal);
        assert.deepEqual(result, { kind: "handled", progress: { kind: "waiting", waitingFor: "blocked" } });
        assert.equal(triggers.routeStatus(interaction.id), "routed");
        const updatedGoal = await goals.restore(goalId);
        assert.ok(updatedGoal !== undefined);
        assert.equal(updatedGoal.state.run.id, waitingGoal.state.run.id);
        assert.equal(updatedGoal.state.run.status, "waiting");
        assert.equal(updatedGoal.state.run.pendingInteraction, undefined);
        const currentInteraction = projectInteractionView(updatedGoal);
        assert.equal(currentInteraction, undefined);
        assert.equal(triggers.queueRecord(goalId)?.status, "waiting");
        const waitingReports = triggers.listGoalTriggers(goalId).filter((trigger) => trigger.type === "response"
            && trigger.payload.action === "progress" && trigger.payload.status === "waiting");
        const latestWaitingReport = waitingReports.at(-1);
        assert.ok(latestWaitingReport !== undefined && latestWaitingReport.type === "response"
            && latestWaitingReport.payload.action === "progress");
        assert.deepEqual(latestWaitingReport.payload, {
            action: "progress", runId: waitingGoal.state.run.id, status: "waiting", waitingFor: "blocked",
        });
        assert.equal(latestWaitingReport.replyTo, work.id);
        assert.equal(triggers.routeStatus(latestWaitingReport.id), "routed");
        assert.equal(runCalls, 2);
    } finally {
        if (goalId !== undefined && triggers.queueRecord(goalId)?.status !== "terminal") {
            const current = await goals.restore(goalId).catch(() => undefined);
            if (current !== undefined) {
                const cancel = {
                    id: "worker-interaction-cleanup-cancel",
                    name: "Cancel interaction test",
                    type: "instruction" as const,
                    source: externalTestActor,
                    target: "worker" as const,
                    goalId,
                    payload: { action: "cancel" as const, runId: current.state.run.id },
                    sentAt: "2026-11-09T00:00:00.000Z",
                };
                await scheduler.handleCancelTrigger(cancel, { ...principal, mayCreateGoal: false, goalIds: [goalId] }).catch(() => undefined);
            }
        }
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        for (const worker of await scheduler.processIds().catch(() => [])) process.kill(worker.pid, "SIGKILL");
        await scheduler.closeIdle().catch(() => undefined);
        triggers.close();
        await owner.close();
        await rm(root, { recursive: true, force: true });
    }
});
