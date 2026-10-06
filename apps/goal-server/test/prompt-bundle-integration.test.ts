import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createGoal, type Goal } from "../../../packages/runtime/src/index";
import { currentProtocols } from "../../../packages/runtime/test/current-fixtures";
import { BrowserGoalCommandService } from "../../../packages/browser/src/index";
import { createCompositionRoot } from "../src/composition-root";
import { writeDefaultProfile } from "./profile-fixture";

type CapturedRequest = {
    readonly messages: ReadonlyArray<{
        readonly role: string;
        readonly content: string;
    }>;
};

function listen(server: ReturnType<typeof createServer>): Promise<number> {
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();

            if (address === null || typeof address === "string") {
                reject(new Error("Fake server did not expose a TCP port"));
                return;
            }

            resolve(address.port);
        });
    });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close((error) => error === undefined ? resolve() : reject(error));
    });
}

function systemContent(request: CapturedRequest): string {
    const system = request.messages[0];

    if (system?.role !== "system") {
        throw new Error("Expected the first LLM message to be system content");
    }

    return system.content;
}

function controlPayload(request: CapturedRequest): Record<string, any> {
    const control = request.messages.at(-1);

    if (control?.role !== "user") {
        throw new Error("Expected the final LLM message to be Working Context");
    }

    return JSON.parse(control.content) as Record<string, any>;
}

function nativeFixtureMessage(content: string, id: string) {
    const wire = JSON.parse(content) as { result?: Record<string, any> };
    if (wire.result === undefined) return { role: "assistant", content };
    const { kind, ...args } = wire.result;
    const name = kind === "tool_call" ? args.action.toolId
        : kind === "ask_user" ? "ask_user"
        : kind === "task_proposal" ? "system_propose_task_plan"
        : kind === "tool_discovery" ? "system_find_tools"
        : kind === "accept" ? "system_review_completion" : "system_complete_task";
    return { role: "assistant", content: "", tool_calls: [{ id, type: "function", function: {
        name,
        arguments: JSON.stringify(kind === "tool_call" ? args.action.input : kind === "tool_discovery" ? { query: args.query } : kind === "accept" ? { result: { kind } } : args),
    } }] };
}

async function waitForCommandIdle(commands: BrowserGoalCommandService): Promise<void> {
    for (let attempt = 0; attempt < 750 && commands.getActiveGoalId() !== undefined; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(commands.getActiveGoalId(), undefined, "Expected the previous Run reservation to be released");
}

test("Composition Root carries Memory through task approval into Executing", { timeout: 120_000 }, async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-prompt-v1-"));
    let root: Awaited<ReturnType<typeof createCompositionRoot>> | undefined;
    await writeDefaultProfile(workspace);
    const responses = [
        JSON.stringify({
            result: {
                kind: "ask_user",
                questions: [
                    {
                        header: "Workflow Selection",
                        question: "Which workflow should be verified?",
                        options: [
                            { label: "Default Profile", description: null },
                            { label: "Custom Profile", description: null },
                        ],
                        multiSelect: false,
                    },
                ],
                memoryPatch: null,
            },
        }),
        JSON.stringify({
            result: {
                kind: "tool_discovery",
                query: "read file",
            },
        }),
        JSON.stringify({
            result: {
                kind: "tool_call",
                action: {
                    actionId: "read-readme",
                    toolId: "read_file",
                    input: { path: "README.md" },
                },
                memoryPatch: null,
            },
        }),
        JSON.stringify({
            result: {
                kind: "task_proposal",
                task: {
                    objective: "Initial proposal",
                    completionCriteria: [],
                },
                approvalRequest: "Approve the initial task contract?",
                memoryPatch: {
                    protocolVersion: 1,
                    operations: [{
                        type: "upsert_fact",
                        fact: {
                            subject: "user",
                            predicate: "workflow_requested",
                            value: "Verify the current workflow",
                            stability: "stable",
                            evidenceSequences: [16],
                            scope: "goal",
                        },
                    }],
                },
            },
        }),
        JSON.stringify({
            result: {
                kind: "task_proposal",
                task: {
                    objective: "Approved proposal",
                    completionCriteria: [],
                },
                approvalRequest: "Approve the revised task contract?",
                memoryPatch: null,
            },
        }),
        JSON.stringify({
            result: {
                kind: "complete",
                summary: "The current workflow completed",
                completionEvidence: [],
                memoryPatch: null,
            },
        }),
        JSON.stringify({ result: { kind: "accept" } }),
    ];
    const requests: CapturedRequest[] = [];
    const server = createServer((request, response) => {
        if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
            response.statusCode = 404;
            response.end();
            return;
        }

        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
            let responseContent = responses[requests.length];

            if (responseContent === undefined) {
                response.statusCode = 500;
                response.end("Unexpected model request");
                return;
            }

            const capturedRequest = JSON.parse(
                Buffer.concat(chunks).toString("utf8"),
            ) as CapturedRequest;
            if (requests.length === 3) {
                const working = controlPayload(capturedRequest) as {
                    readonly trajectoryContext?: {
                        readonly hot?: readonly { readonly events: readonly {
                            readonly eventType: string;
                            readonly sequence: number;
                        }[] }[];
                    };
                };
                const evidence = working.trajectoryContext?.hot
                    ?.flatMap((unit) => unit.events)
                    .filter((event) => event.eventType === "tool_finished" || event.eventType === "observation_recorded")
                    .at(-1);
                const nativeEvidence = capturedRequest.messages.filter(message => message.role === "tool")
                    .map(message => JSON.parse(message.content) as any)
                    .find(result => result.observation !== undefined)?.sourceSequence;
                const evidenceSequence = evidence?.sequence ?? nativeEvidence;
                if (evidenceSequence === undefined) {
                    response.statusCode = 500;
                    response.end("Expected committed tool evidence in the current model context");
                    return;
                }
                const proposal = JSON.parse(responseContent);
                proposal.result.memoryPatch.operations[0].fact.evidenceSequences = [evidenceSequence];
                responseContent = JSON.stringify(proposal);
            }
            requests.push(capturedRequest);
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({
                id: `completion-${requests.length}`,
                object: "chat.completion",
                created: 0,
                model: "test-model",
                choices: [{
                    index: 0,
                    message: nativeFixtureMessage(responseContent, `call-${requests.length}`),
                    finish_reason: "stop",
                }],
            }));
        });
    });
    const port = await listen(server);

    try {
        root = await createCompositionRoot({
            cwd: workspace,
            env: {
                LLM_PROVIDER: "openai",
                LLM_API_KEY: "test-key",
                LLM_BASE_URL: `http://127.0.0.1:${port}/v1`,
                LLM_MODEL: "test-model",
                LLM_STRUCTURED_OUTPUT_MODE: "strict",
                LAZYGOAL_HOME: join(workspace, "lazygoal-home"),
            },
            goalIdGenerator: () => "goal-current",
            runIdGenerator: () => "run-current",
        });

        const commands = new BrowserGoalCommandService({
            store: root.workspaceGoalStore,
            saveNotifications: root.notifyingStore,
            profileId: "default",
            launcher: root.browserLauncher,
            coordinator: root.coordinator,
            defaultModelSelection: root.defaultModelSelection,
            restoreModelBinding: async (g) => {
                if (root === undefined || g.state.modelSelection.provider !== root.defaultModelSelection.provider) return false;
                try { root.alignModelBinding(g.state.modelSelection); return true; } catch { return false; }
            },
        });

        const createRes = await commands.create({
            goalId: "goal-current",
            intent: "Verify the current workflow",
            mode: "plan",
        });
        assert.equal(createRes.ok, true, `create should succeed, got ${JSON.stringify(createRes)}`);

        // 等待 advance 执行完成保存初始交互
        let initialGoal = await root.workspaceGoalStore.restore("goal-current");
        for (let i = 0; i < 750 && initialGoal?.state.run.status !== "waiting"; i++) {
            await new Promise((r) => setTimeout(r, 20));
            initialGoal = await root.workspaceGoalStore.restore("goal-current");
        }
        assert.ok(initialGoal);
        assert.equal(initialGoal.state.run.status, "waiting");
        const askUserInteraction = initialGoal.state.run.pendingInteraction;
        assert.ok(askUserInteraction && askUserInteraction.kind === "ask_user");

        await waitForCommandIdle(commands);
        const answer = await commands.interact("goal-current", {
            runId: initialGoal.state.run.id,
            kind: "answer_ask_user",
            requestId: askUserInteraction.requestId,
            answers: [{
                questionId: askUserInteraction.questions[0]!.id,
                optionIds: [askUserInteraction.questions[0]!.options[0]!.id],
            }],
        });
        assert.equal(answer.ok, true, JSON.stringify(answer));

        let taskGoal = await root.workspaceGoalStore.restore("goal-current");
        for (let i = 0; i < 750 && (!taskGoal || taskGoal.state.run.pendingInteraction?.kind !== "task_approval"); i++) {
            await new Promise((r) => setTimeout(r, 20));
            taskGoal = await root.workspaceGoalStore.restore("goal-current");
        }
        assert.ok(taskGoal);
        const taskInteraction = taskGoal.state.run.pendingInteraction;
        assert.ok(taskInteraction && taskInteraction.kind === "task_approval", `Expected task approval, got ${JSON.stringify(taskInteraction)}`);
        assert.equal(taskInteraction.proposal.objective, "Initial proposal");

        await waitForCommandIdle(commands);
        const feedback = await commands.interact("goal-current", {
            runId: taskGoal.state.run.id,
            kind: "feedback_task",
            requestId: taskInteraction.requestId,
            feedback: "Please use the approved wording.",
        });
        assert.equal(feedback.ok, true, JSON.stringify(feedback));

        let revisedGoal = await root.workspaceGoalStore.restore("goal-current");
        for (let i = 0; i < 750 && (!revisedGoal || revisedGoal.state.run.pendingInteraction?.kind !== "task_approval" || revisedGoal.state.run.pendingInteraction.proposal.objective !== "Approved proposal"); i++) {
            await new Promise((r) => setTimeout(r, 20));
            revisedGoal = await root.workspaceGoalStore.restore("goal-current");
        }
        assert.ok(revisedGoal);
        const revisedInteraction = revisedGoal.state.run.pendingInteraction;
        assert.ok(revisedInteraction && revisedInteraction.kind === "task_approval");
        assert.equal(revisedInteraction.proposal.objective, "Approved proposal");
        assertCurrentDefinition(revisedGoal.definition);

        const files = (await readdir(root.goalsDirectory))
            .filter((file) => file.endsWith(".json"));
        if (files.length !== 1) {
            throw new Error("Expected exactly one persisted Goal Snapshot");
        }
        const snapshot = JSON.parse(await readFile(
            join(root.goalsDirectory, files[0]!),
            "utf8",
        )) as {
            readonly metadata: { readonly schemaVersion: number };
            readonly definition: Goal["definition"];
        };
        if (snapshot.metadata.schemaVersion !== 1) {
            throw new Error("Expected the current Snapshot schema version");
        }
        assertCurrentDefinition(snapshot.definition);

        await waitForCommandIdle(commands);
        const approval = await commands.interact("goal-current", {
            runId: revisedGoal.state.run.id,
            kind: "approve_task",
            requestId: revisedInteraction.requestId,
        });
        assert.equal(approval.ok, true, JSON.stringify(approval));

        let completedGoal = await root.workspaceGoalStore.restore("goal-current");
        for (let i = 0; i < 750 && completedGoal?.state.run.status !== "completed"; i++) {
            await new Promise((r) => setTimeout(r, 20));
            completedGoal = await root.workspaceGoalStore.restore("goal-current");
        }
        assert.ok(completedGoal);
        assert.equal(completedGoal.state.run.status, "completed");
        if (requests.length !== 7) {
            throw new Error(`Expected 7 requests, got ${requests.length}`);
        }
        for (const request of requests.slice(0, -1)) {
            const content = systemContent(request);
            if (!content.includes("structured@1")
                || !content.includes("trajectory-layered@1")
                || !content.includes("bm25-lite@1")) {
                throw new Error("Expected every prompt to declare the current protocol combination");
            }
            if (content.includes('"checkpoint"')) {
                throw new Error("Current prompts must not expose checkpoint Decisions");
            }
        }

        const reviewControl = controlPayload(requests[6]!);
        assert.equal(reviewControl.source, "runtime_completion_candidate");
        assert.equal(reviewControl.candidate.summary, "The current workflow completed");

        const executingControl = controlPayload(requests[5]!);
        const executingSystem = systemContent(requests[5]!);
        const approvedTaskUpdate = requests[5]!.messages.find((message) =>
            message.role === "user"
            && message.content.includes("Approved Goal Task Contract:\nObjective: Approved proposal"),
        );
        if (executingSystem.includes("Approved Goal Task Contract:") || approvedTaskUpdate === undefined) {
            throw new Error("Expected the approved proposal in its dynamic user section, outside the fixed system prompt");
        }
        if ("task" in executingControl) {
            throw new Error("Executing must not receive redundant task in control message");
        }
        const workingMemoryUpdate = requests[5]!.messages.find((message) =>
            message.role === "user"
            && message.content.includes("workflow_requested"),
        );
        if (workingMemoryUpdate === undefined) {
            throw new Error("Expected the accepted Fact in its dynamic Working Memory section");
        }

        const trajectory = await root.readTrajectory({
            goalId: "goal-current",
            runId: "run-current",
        });
        const persisted = await root.store.restore("goal-current");
        if (persisted === undefined) {
            throw new Error("Expected the final Goal Snapshot");
        }
        const committedTypes = trajectory.committed.map((event) => event.eventType);
        const requiredOrder: readonly (typeof committedTypes[number])[] = [
            "goal_created",
            "decision_received",
            "run_waiting",
            "run_resumed",
            "memory_patch_accepted",
            "decision_received",
            "task_approved",
            "run_completed",
        ];
        let previousIndex = -1;
        for (const eventType of requiredOrder) {
            const eventIndex = committedTypes.findIndex(
                (candidate, index) => index > previousIndex && candidate === eventType,
            );
            if (eventIndex <= previousIndex) {
                throw new Error(`Expected ordered committed event ${eventType}`);
            }
            previousIndex = eventIndex;
        }
        const patchEvent = trajectory.committed.find(
            (event) => event.eventType === "memory_patch_accepted",
        );
        if (patchEvent === undefined
            || patchEvent.sequence > persisted.state.run.committedThroughSequence) {
            throw new Error("Expected the accepted Memory Patch inside the Snapshot boundary");
        }
        if (trajectory.uncommittedTail.some(
            (event) => event.sequence <= persisted.state.run.committedThroughSequence,
        )) {
            throw new Error("Expected the Trajectory tail after the Snapshot boundary");
        }

        const persistedRaw = JSON.parse(await readFile(
            join(root.goalsDirectory, files[0]!),
            "utf8",
        )) as Record<string, unknown>;

        // 1. Snapshot 顶层绝不能是 wire envelope
        assert.equal("result" in persistedRaw, false);

        // 2. Snapshot 中的 lastStep（若是 decision）内部绝不能嵌套 wire envelope
        if (persisted.state.run.lastStep?.kind === "decision") {
            const decision = persisted.state.run.lastStep.result as Record<string, unknown>;
            assert.equal("result" in decision, false, "lastStep decision must not retain wire result envelope");
            assert.notEqual(decision.memoryPatch, null, "lastStep decision must not retain placeholder null memoryPatch");
        }

        // 3. Trajectory 中所有 decision_received 事件的 decision 绝不能包含 wire result envelope 或占位 null
        for (const event of trajectory.committed) {
            if (event.eventType === "decision_received") {
                const decision = (event.payload as { decision: Record<string, unknown> }).decision;
                assert.equal("result" in decision, false, "Trajectory decision must not retain wire result envelope");
                assert.notEqual(decision.memoryPatch, null, "Trajectory decision must not retain placeholder null memoryPatch");
            }
        }

        // 4. 全局深度检查：持久化 Snapshot 和 Trajectory 中绝无任何 null 值的 memoryPatch
        function assertNoPlaceholderNullMemoryPatch(value: unknown, path = "root"): void {
            if (value === null || typeof value !== "object") return;
            if (Array.isArray(value)) {
                for (let i = 0; i < value.length; i++) {
                    assertNoPlaceholderNullMemoryPatch(value[i], `${path}[${i}]`);
                }
            } else {
                const record = value as Record<string, unknown>;
                assert.notEqual(record.memoryPatch, null, `Found placeholder null memoryPatch at ${path}`);
                for (const [key, child] of Object.entries(record)) {
                    assertNoPlaceholderNullMemoryPatch(child, `${path}.${key}`);
                }
            }
        }
        assertNoPlaceholderNullMemoryPatch(persistedRaw, "snapshot");
        for (const event of trajectory.committed) {
            assertNoPlaceholderNullMemoryPatch(event, `trajectory.committed[${event.sequence}]`);
        }
    } finally {
        if (root !== undefined) {
            await root.resources.closeAll();
        }
        await close(server);
        await rm(workspace, { recursive: true, force: true, maxRetries: 3 });
    }
});

test("端到端非法 wire 响应拒绝调用 Tool 且不产生执行副作用", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-prompt-bundle-invalid-wire-"));
    let root: Awaited<ReturnType<typeof createCompositionRoot>> | undefined;
    await writeDefaultProfile(workspace);
    const responses: string[] = [
        // 1. planning -> task_proposal
        JSON.stringify({
            result: {
                kind: "task_proposal",
                task: {
                    objective: "Invalid wire test",
                    completionCriteria: [],
                },
                approvalRequest: "Approve?",
                memoryPatch: null,
            },
        }),
        // 2. executing -> 旧格式裸 tool_call（缺失 result envelope）
        JSON.stringify({
            kind: "tool_call",
            action: {
                actionId: "action-1",
                toolId: "read_file",
                input: { path: "default.json" },
            },
        }),
    ];
    const requests: CapturedRequest[] = [];
    const server = createServer((request, response) => {
        if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
            response.statusCode = 404;
            response.end();
            return;
        }
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
            const responseContent = responses[Math.min(requests.length, responses.length - 1)];
            if (responseContent === undefined) {
                response.statusCode = 500;
                response.end("Unexpected model request");
                return;
            }
            requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")) as CapturedRequest);
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({
                id: `completion-${requests.length}`,
                object: "chat.completion",
                created: 0,
                model: "test-model",
                choices: [{
                    index: 0,
                    message: nativeFixtureMessage(responseContent, `call-${requests.length}`),
                    finish_reason: "stop",
                }],
            }));
        });
    });
    const port = await listen(server);

    try {
        root = await createCompositionRoot({
            cwd: workspace,
            env: {
                LLM_PROVIDER: "openai",
                LLM_API_KEY: "test-key",
                LLM_BASE_URL: `http://127.0.0.1:${port}/v1`,
                LLM_MODEL: "test-model",
                LLM_STRUCTURED_OUTPUT_MODE: "strict",
                LAZYGOAL_HOME: join(workspace, "lazygoal-home"),
            },
            goalIdGenerator: () => "goal-invalid-wire",
            runIdGenerator: () => "run-invalid-wire",
        });

        const commands = new BrowserGoalCommandService({
            store: root.workspaceGoalStore,
            saveNotifications: root.notifyingStore,
            profileId: "default",
            launcher: root.browserLauncher,
            coordinator: root.coordinator,
            defaultModelSelection: root.defaultModelSelection,
            restoreModelBinding: async (g) => {
                if (root === undefined || g.state.modelSelection.provider !== root.defaultModelSelection.provider) return false;
                try { root.alignModelBinding(g.state.modelSelection); return true; } catch { return false; }
            },
        });

        await commands.create({
            goalId: "goal-invalid-wire",
            intent: "Test invalid wire response handling",
            mode: "plan",
        });

        let initialGoal = await root.workspaceGoalStore.restore("goal-invalid-wire");
        for (let i = 0; i < 750 && initialGoal?.state.run.status !== "waiting"; i++) {
            await new Promise((r) => setTimeout(r, 20));
            initialGoal = await root.workspaceGoalStore.restore("goal-invalid-wire");
        }
        assert.ok(initialGoal);
        const proposalInteraction = initialGoal.state.run.pendingInteraction;
        assert.ok(proposalInteraction && proposalInteraction.kind === "task_approval");

        await waitForCommandIdle(commands);
        const approval = await commands.interact("goal-invalid-wire", {
            runId: initialGoal.state.run.id,
            kind: "approve_task",
            requestId: proposalInteraction.requestId,
        });
        assert.equal(approval.ok, true, JSON.stringify(approval));

        let failedGoal = await root.workspaceGoalStore.restore("goal-invalid-wire");
        for (let i = 0; i < 750 && failedGoal?.state.run.status !== "failed"; i++) {
            await new Promise((r) => setTimeout(r, 20));
            failedGoal = await root.workspaceGoalStore.restore("goal-invalid-wire");
        }
        assert.ok(failedGoal);
        assert.equal(failedGoal.state.run.status, "failed");
        assert.equal(failedGoal.state.run.stopReason?.kind, "execution_error");
        if (failedGoal.state.run.stopReason?.kind === "execution_error") {
            assert.equal(failedGoal.state.run.stopReason.code, "INVALID_AGENT_DECISION");
            assert.match(failedGoal.state.run.stopReason.message, /INVALID_LLM_RESPONSE/);
        }

        const trajectory = await root.readTrajectory({
            goalId: "goal-invalid-wire",
            runId: "run-invalid-wire",
        });
        const eventTypes = trajectory.committed.map((event) => event.eventType);
        assert.equal(eventTypes.includes("action_staged"), false);
        assert.equal(eventTypes.includes("observation_recorded"), false);
    } finally {
        if (root !== undefined) {
            await root.resources.closeAll();
        }
        await close(server);
        await rm(workspace, { recursive: true, force: true, maxRetries: 3 });
    }
});

function assertCurrentDefinition(definition: Goal["definition"]): void {
    if (definition.promptBundleVersion !== 1
        || definition.memoryProtocol.kind !== "structured"
        || definition.memoryProtocol.version !== 1
        || definition.modelContextProtocol.kind !== "trajectory-layered"
        || definition.modelContextProtocol.version !== 1
        || definition.contextRetrievalProtocol.kind !== "bm25-lite"
        || definition.contextRetrievalProtocol.version !== 1) {
        throw new Error("Expected the single current protocol combination");
    }
}
