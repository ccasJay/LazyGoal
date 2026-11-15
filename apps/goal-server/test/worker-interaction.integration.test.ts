import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectInteractionView } from "../../../packages/runtime/src/interaction-view";
import { PERMISSION_PRESETS } from "../../../packages/permission/src/index";
import { cancelTrigger, externalTestActor, interactionAnswerTrigger, workTrigger } from "../../../packages/runtime/test/trigger-fixtures";
import type { GoalUserAction } from "../../../packages/runtime/src/trigger";
import { DefaultGoalModelSelectionCoordinator } from "../../../packages/runtime/src/goal-model-selection-coordinator";
import { JsonFileGoalStore } from "../../../packages/storage/src/goal-store";
import { SupervisorOwnership } from "../../../packages/storage/src/supervisor-ownership";
import { TriggerStore } from "../../../packages/storage/src/trigger-store";
import { receiveAuthorizedTrigger } from "../../../packages/storage/src/trigger-ingress";
import { admitTrigger } from "../src/runtime/trigger-admission";
import { SupervisorWorkerProcess } from "../src/runtime/worker-process";
import type { WorkerOfflineProgress } from "../src/runtime/worker-process-registry";
import { WorkerScheduler } from "../src/runtime/worker-scheduler";

const unusedContinuation = async () => ({ ok: false as const, code: "RUN_NOT_FOUND", message: "continuation is not wired in this test" });
const readPermissionProfile = async () => ({
    workspaceId: "test-workspace",
    profile: PERMISSION_PRESETS.ask,
    revision: 0,
});

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

test("an unrouted interaction answer survives Supervisor reattachment and completes only its current Goal wait", { timeout: 30000 },
    (context) => runInteractionScenario(context, "reattached-completion"));

for (const route of ["direct", "replayed"] as const) {
    test(`Stop interrupts a model call resumed by a ${route} interaction answer`, { timeout: 30000 },
        (context) => runInteractionScenario(context, route));
}

async function runInteractionScenario(context: TestContext, route: "direct" | "replayed" | "reattached-completion"): Promise<void> {
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
    const requestedModels: unknown[] = [];
    let resumedRequestOpen = false;
    let resumedRequestClosed = false;
    const server = createServer((request, response) => {
        void (async () => {
            let bodyText = "";
            request.setEncoding("utf8");
            for await (const chunk of request) bodyText += chunk;
            const body = JSON.parse(bodyText) as Record<string, unknown>;
            requestedModels.push(body.model);
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
            if (runCalls === 2 && route !== "reattached-completion") {
                response.writeHead(200, { "content-type": "text/event-stream" });
                response.flushHeaders();
                response.once("close", () => { resumedRequestClosed = true; });
                resumedRequestOpen = true;
                return;
            }
            const messages = Array.isArray(body.messages) ? body.messages : [];
            const evidenceMatches = [...JSON.stringify(messages).matchAll(/Valid committed evidence sequences: ([0-9, ]+)/g)];
            const evidenceSequences = evidenceMatches.at(-1)?.[1]?.split(",").map((value) => Number(value.trim()))
                .filter(Number.isSafeInteger) ?? [];
            const scripted = runCalls === 1 || (route === "replayed" && runCalls === 3)
                ? ["ask_user", { questions: [{ header: "Choice", question: "Which option should I use?",
                    options: [{ label: "Option A" }, { label: "Option B" }], multiSelect: false }] }]
                : runCalls === 2
                    ? ["system_complete_task", { summary: "I will use Option A.", evidenceSequences }]
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

    const defaultModel = "test-default-model";
    const selectedModel = "test-selected-model";
    const switchedModel = "test-switched-model";
    const env = {
        LAZYGOAL_HOME: home,
        LLM_PROVIDER: "openai-compatible",
        LLM_MODEL: defaultModel,
        LLM_API_KEY: "test-key",
        LLM_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
        LLM_CONTEXT_WINDOW_TOKENS: "16000",
        LLM_MAX_OUTPUT_TOKENS: "4096",
        LLM_TOKENIZER_ENCODING: "cl100k_base",
    } as NodeJS.ProcessEnv;
    let owner = new SupervisorOwnership(join(dataDirectory, "owner.db"));
    let triggers = new TriggerStore(join(dataDirectory, "triggers.db"));
    const goals = new JsonFileGoalStore(join(dataDirectory, "goals"));
    const terminalSave = Promise.withResolvers<void>();
    let terminalSavePending = false;
    const saveGoal = goals.save.bind(goals);
    context.mock.method(goals, "save", async (goal: Parameters<typeof saveGoal>[0]) => {
        if (goal.state.run.status === "cancelled" && goal.state.run.interruption?.status === "finished") {
            terminalSavePending = true;
            await terminalSave.promise;
        }
        await saveGoal(goal);
    });
    const never = { structuredOutputMode: "prompt_only" as const, async generate() { throw new Error("No permission decision is expected"); } };
    let scheduler = new WorkerScheduler({ owner, triggers, goals, cwd: workspace, dataDirectory, env, readPermissionProfile, commitContinuation: unusedContinuation });
    let storesOpen = true;
    let workerPids: number[] = [];
    const operations: Promise<unknown>[] = [];
    const track = <T>(operation: Promise<T>): Promise<T> => {
        operations.push(operation);
        void operation.catch(() => undefined);
        return operation;
    };
    let receiveOfflineProgress: ((progress: WorkerOfflineProgress) => void) | undefined;
    if (route === "replayed") {
        const setHandler = SupervisorWorkerProcess.prototype.setOfflineProgressHandler;
        context.mock.method(SupervisorWorkerProcess.prototype, "setOfflineProgressHandler",
            function (this: SupervisorWorkerProcess, handler: (progress: WorkerOfflineProgress) => void) {
                receiveOfflineProgress = handler;
                setHandler.call(this, handler);
            });
    }
    const principal = { role: "user", externalId: "test-actor", mayCreateGoal: true, goalIds: [] } as const;
    const firstIntent = "Ask a question and wait for an answer";
    const work = workTrigger("worker-interaction-work", firstIntent);
    let goalId: string | undefined;
    try {
        assert.deepEqual(work.payload, {
            action: "submitted", material: { kind: "text", text: "Ask a question and wait for an answer" },
        });
        const createGoal: Parameters<typeof admitTrigger>[6] = async (intent, reservedGoalId, workspaceMode) => {
            const authorizedWorkspace = { mode: workspaceMode, projectRoot: workspace, executionRoot: workspace } as const;
            const goal = await scheduler.createGoal({
                goalId: reservedGoalId ?? randomUUID(),
                intent,
                mode: "normal",
                modelSelection: { provider: "openai-compatible", modelId: intent === firstIntent
                    ? selectedModel : defaultModel, contextWindowTokens: 16000,
                    maxOutputTokens: 4096, inputEstimator: { kind: "character-v1" } },
            }, authorizedWorkspace);
            return {
                goal,
                authorization: { workspace: authorizedWorkspace, toolIds: [] },
            };
        };
        const admission = await admitTrigger(owner, triggers, goals, never, work, principal, createGoal);
        if (admission.kind !== "accepted") throw new Error("Expected Trigger admission to accept the Goal");
        goalId = admission.goalId;
        const creationResponse = triggers.listGoalTriggers(goalId).find((trigger) => trigger.type === "response"
            && trigger.payload.action === "goal_created");
        assert.ok(creationResponse !== undefined && creationResponse.type === "response");
        assert.equal(creationResponse.replyTo, work.id);
        assert.equal(triggers.queueRecord(goalId)?.triggerId, work.id);
        await scheduler.pump();
        await waitFor(() => triggers.queueRecord(goalId!)?.status === "waiting");
        const waitingGoal = await goals.restore(goalId);
        assert.ok(waitingGoal !== undefined);
        assert.equal(waitingGoal.state.run.status, "waiting");
        assert.deepEqual(requestedModels, [selectedModel]);
        assert.equal(triggers.queueRecord(goalId)?.workerId !== undefined, true);
        assert.equal(waitingGoal.definition.profile.name, "Test");
        assert.equal(waitingGoal.definition.profile.systemPrompt, "Ask the user one question, then wait for input.");
        assert.equal(waitingGoal.definition.promptBundleVersion, 1);
        assert.deepEqual(waitingGoal.definition.memoryProtocol, { kind: "structured", version: 1 });
        assert.deepEqual(waitingGoal.definition.modelContextProtocol, { kind: "trajectory-layered", version: 1 });
        assert.deepEqual(waitingGoal.definition.contextRetrievalProtocol, { kind: "bm25-lite", version: 1 });
        assert.deepEqual(waitingGoal.definition.executionPolicy, { maxSteps: 0 });
        const workerProcesses = await scheduler.processIds();
        workerPids = workerProcesses.map((worker) => worker.pid);
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

        if (route === "reattached-completion") {
            const changed = await new DefaultGoalModelSelectionCoordinator({ store: goals }).updateModelSelection({
                ref: { goalId, runId: waitingGoal.state.run.id },
                selection: { ...waitingGoal.state.modelSelection, modelId: switchedModel },
            });
            assert.equal(changed.ok, true);
        }
        if (route !== "direct") {
            receiveAuthorizedTrigger(triggers, interaction, interactionPrincipal);
            assert.equal(triggers.routeStatus(interaction.id), "unrouted");

            await scheduler.detachAll();
            triggers.close();
            await owner.close();
            storesOpen = false;

            owner = new SupervisorOwnership(join(dataDirectory, "owner.db"));
            triggers = new TriggerStore(join(dataDirectory, "triggers.db"));
            storesOpen = true;
            scheduler = new WorkerScheduler({ owner, triggers, goals, cwd: workspace, dataDirectory, env, readPermissionProfile, commitContinuation: unusedContinuation });
        }
        const answering = track(route === "direct" ? scheduler.handleInteractionTrigger(interaction, interactionPrincipal) : scheduler.pump());
        if (route !== "reattached-completion") {
            await waitFor(() => resumedRequestOpen);
            assert.deepEqual(requestedModels, [selectedModel, selectedModel]);
            const stop = cancelTrigger("stop-resumed-interaction", goalId, waitingGoal.state.run.id);
            let stopSettled = false;
            const stopping = track(scheduler.handleCancelTrigger(stop, interactionPrincipal).finally(() => { stopSettled = true; }));
            await waitFor(() => resumedRequestClosed, 8000);
            await waitFor(() => terminalSavePending);
            assert.equal(stopSettled, false);
            assert.equal(triggers.routeStatus(stop.id), "unrouted");
            assert.equal(triggers.routeStatus(interaction.id), "unrouted");
            assert.equal(triggers.queueRecord(goalId)?.status, "waiting");
            assert.deepEqual(scheduler.assignments(), [{ workerId: workerProcesses[0]!.workerId, goalId }]);
            terminalSave.resolve();

            assert.deepEqual(await stopping, { kind: "terminal", status: "cancelled" });
            await answering;
            const stoppedGoal = await goals.restore(goalId);
            assert.equal(stoppedGoal?.state.run.id, waitingGoal.state.run.id);
            assert.equal(stoppedGoal?.state.run.status, "cancelled");
            assert.equal(stoppedGoal?.state.run.interruption?.status, "finished");
            assert.equal(triggers.queueRecord(goalId)?.status, "terminal");
            assert.deepEqual(scheduler.assignments(), [{ workerId: workerProcesses[0]!.workerId }]);
            const cancelled = triggers.listGoalTriggers(goalId).filter((trigger) => trigger.type === "response"
                && trigger.payload.action === "cancelled");
            assert.equal(cancelled.length, 1);
            assert.equal(cancelled[0]?.replyTo, work.id);
            assert.deepEqual(cancelled[0]?.payload, { action: "cancelled", runId: waitingGoal.state.run.id });
            assert.equal(triggers.routeStatus(cancelled[0]!.id), "routed");
            assert.equal(triggers.routeStatus(interaction.id), "routed");
            assert.equal(triggers.routeStatus(stop.id), "routed");

            if (route === "replayed") {
                const next = await admitTrigger(owner, triggers, goals, never, workTrigger("next-work"), principal, createGoal);
                if (next.kind !== "accepted") assert.fail("Expected the next Goal to be accepted");
                await scheduler.pump();
                await waitFor(() => triggers.queueRecord(next.goalId)?.status === "waiting");
                assert.deepEqual(await scheduler.processIds(), workerProcesses);
                assert.deepEqual(requestedModels, [selectedModel, selectedModel, defaultModel]);
                assert.ok(receiveOfflineProgress !== undefined);
                receiveOfflineProgress({ kind: "interaction-result", requestId: "old-interaction-result", goalId,
                    result: { kind: "waiting", waitingFor: "ask_user" } });
                await scheduler.closeIdle();
                assert.deepEqual(scheduler.assignments(), [{ workerId: workerProcesses[0]!.workerId, goalId: next.goalId }]);
                assert.equal(triggers.queueRecord(goalId)?.status, "terminal");
                assert.equal(triggers.queueRecord(next.goalId)?.status, "waiting");
                assert.deepEqual(triggers.listGoalTriggers(goalId).filter((trigger) => trigger.type === "response"
                    && trigger.payload.action === "cancelled"), cancelled);
            }
            return;
        }
        await answering;
        await waitFor(() => triggers.routeStatus(interaction.id) === "routed" && triggers.queueRecord(goalId!)?.status === "terminal");
        assert.deepEqual(requestedModels, [selectedModel, switchedModel, switchedModel]);

        const recoveredProcesses = await scheduler.processIds();
        assert.deepEqual(recoveredProcesses, workerProcesses);
        assert.equal(triggers.routeStatus(staleInteraction.id), "unrouted");
        const updatedGoal = await goals.restore(goalId);
        assert.ok(updatedGoal !== undefined);
        assert.equal(updatedGoal.state.run.id, waitingGoal.state.run.id);
        assert.equal(updatedGoal.state.run.status, "completed");
        assert.equal(updatedGoal.state.run.pendingInteraction, undefined);
        assert.equal(projectInteractionView(updatedGoal), undefined);
        assert.equal(triggers.queueRecord(goalId)?.status, "terminal");

        const waitingReports = triggers.listGoalTriggers(goalId).filter((trigger) => trigger.type === "response"
            && trigger.payload.action === "progress" && trigger.payload.status === "waiting");
        const latestWaitingReport = waitingReports.at(-1);
        assert.ok(latestWaitingReport !== undefined && latestWaitingReport.type === "response"
            && latestWaitingReport.payload.action === "progress");
        assert.deepEqual(latestWaitingReport.payload, {
            action: "progress", runId: waitingGoal.state.run.id, status: "waiting", waitingFor: "ask_user",
        });
        assert.equal(latestWaitingReport.replyTo, work.id);
        assert.equal(triggers.routeStatus(latestWaitingReport.id), "routed");

        const answerMessage = updatedGoal.state.messages.find((message) => message.role === "assistant"
            && message.runId === updatedGoal.state.run.id && message.purpose === "answer");
        assert.ok(answerMessage !== undefined);
        const completedReport = triggers.listGoalTriggers(goalId).find((trigger) => trigger.type === "response"
            && trigger.payload.action === "completed");
        assert.ok(completedReport !== undefined && completedReport.type === "response");
        assert.deepEqual(completedReport.payload, {
            action: "completed", runId: updatedGoal.state.run.id, answer: answerMessage.content,
        });
        assert.equal(completedReport.replyTo, work.id);
        assert.equal(triggers.routeStatus(completedReport.id), "routed");
        const stop = cancelTrigger("stop-after-completion", goalId, updatedGoal.state.run.id);
        assert.deepEqual(await scheduler.handleCancelTrigger(stop, interactionPrincipal), { kind: "terminal", status: "completed" });
        assert.equal(triggers.routeStatus(stop.id), "routed");
        assert.deepEqual(await goals.restore(goalId), updatedGoal);
        assert.deepEqual(triggers.listGoalTriggers(goalId).filter((trigger) => trigger.type === "response"
            && trigger.payload.action === "completed"), [completedReport]);
        assert.equal(runCalls, 2);
    } finally {
        terminalSave.resolve();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        const activeWorkers = await scheduler.processIds().catch(() => []);
        for (const pid of new Set([...workerPids, ...activeWorkers.map((worker) => worker.pid)])) {
            try { process.kill(pid, "SIGKILL"); } catch { /* Worker already exited. */ }
        }
        await Promise.allSettled(operations);
        await scheduler.closeIdle().catch(() => undefined);
        if (storesOpen) {
            triggers.close();
            await owner.close();
        }
        await rm(root, { recursive: true, force: true });
    }
}
