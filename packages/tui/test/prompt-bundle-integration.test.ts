import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createGoal, type Goal } from "../../runtime/src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import { createCompositionRoot } from "../src/cli";
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

test("Composition Root carries Memory through task approval into Executing", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-prompt-v1-"));
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
            if (requests.length === 2) {
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
                if (evidence === undefined) {
                    response.statusCode = 500;
                    response.end("Expected committed tool evidence in the current model context");
                    return;
                }
                const proposal = JSON.parse(responseContent);
                proposal.result.memoryPatch.operations[0].fact.evidenceSequences = [evidence.sequence];
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
                    message: { role: "assistant", content: responseContent },
                    finish_reason: "stop",
                }],
            }));
        });
    });
    const port = await listen(server);

    try {
        const root = await createCompositionRoot({
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

        await root.controller.dispatch({ kind: "enterPlanMode" });
        await root.controller.dispatch({
            kind: "create",
            intent: "Verify the current workflow",
        });
        const askUserView = root.controller.getSnapshot();

        if (askUserView.screen !== "session") {
            throw new Error("Expected a session");
        }
        if (askUserView.phase !== "executing" || askUserView.waitingFor !== "ask_user") {
            throw new Error("Expected an ask_user interaction");
        }

        await root.controller.dispatch({
            kind: "answerAskUser",
            requestId: askUserView.askUser!.requestId,
            answers: [{
                questionId: askUserView.askUser!.questions[0]!.id,
                optionIds: [askUserView.askUser!.questions[0]!.options[0]!.id],
            }],
        });
        const initialPlanningView = root.controller.getSnapshot();

        if (initialPlanningView.screen !== "session"
            || initialPlanningView.phase !== "executing"
            || initialPlanningView.waitingFor !== "task_approval") {
            throw new Error("Expected task approval after ask_user answered");
        }
        if (initialPlanningView.proposal?.objective !== "Initial proposal") {
            throw new Error("Expected the first planning proposal");
        }
        if (initialPlanningView.proposalRequestId === undefined) {
            throw new Error("Expected the first proposal request ID");
        }

        await root.controller.dispatch({
            kind: "feedbackTask",
            requestId: initialPlanningView.proposalRequestId,
            feedback: "Please use the approved wording.",
        });
        const revisedPlanningView = root.controller.getSnapshot();

        if (revisedPlanningView.screen !== "session"
            || revisedPlanningView.phase !== "executing"
            || revisedPlanningView.waitingFor !== "task_approval") {
            throw new Error("Expected task approval after feedback");
        }
        if (revisedPlanningView.proposal?.objective !== "Approved proposal") {
            throw new Error("Expected the revised planning proposal");
        }
        if (revisedPlanningView.proposalRequestId === undefined) {
            throw new Error("Expected the revised proposal request ID");
        }
        assertCurrentDefinition(revisedPlanningView.goal.definition);

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

        await root.controller.dispatch({
            kind: "approveTask",
            requestId: revisedPlanningView.proposalRequestId,
        });
        const completedView = root.controller.getSnapshot();

        if (completedView.screen !== "session") {
            throw new Error("Expected a completed session");
        }
        if (completedView.phase !== "executing" || completedView.terminal?.status !== "completed") {
            throw new Error("Expected the current workflow to complete");
        }
        if (requests.length !== 5) {
            throw new Error(`Expected 5 requests, got ${requests.length}`);
        }
        for (const request of requests) {
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

        const executingControl = controlPayload(requests[4]!);
        const executingSystem = systemContent(requests[4]!);
        const approvedTaskUpdate = requests[4]!.messages.find((message) =>
            message.role === "user"
            && message.content.includes("Approved Goal Task Contract:\nObjective: Approved proposal"),
        );
        if (executingSystem.includes("Approved Goal Task Contract:") || approvedTaskUpdate === undefined) {
            throw new Error("Expected the approved proposal in its dynamic user section, outside the fixed system prompt");
        }
        if ("task" in executingControl) {
            throw new Error("Executing must not receive redundant task in control message");
        }
        const workingMemoryUpdate = requests[4]!.messages.find((message) =>
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
        await close(server);
        await rm(workspace, { recursive: true, force: true });
    }
});

test("端到端非法 wire 响应拒绝调用 Tool 且不产生执行副作用", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-prompt-bundle-invalid-wire-"));
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
                    message: { role: "assistant", content: responseContent },
                    finish_reason: "stop",
                }],
            }));
        });
    });
    const port = await listen(server);

    try {
        const root = await createCompositionRoot({
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

        await root.controller.dispatch({ kind: "enterPlanMode" });
        await root.controller.dispatch({
            kind: "create",
            intent: "Test invalid wire response handling",
        });
        const proposalView = root.controller.getSnapshot();
        if (proposalView.screen !== "session"
            || proposalView.waitingFor !== "task_approval"
            || proposalView.proposalRequestId === undefined) {
            throw new Error("Expected a task proposal with a stable request ID before approval");
        }
        await root.controller.dispatch({
            kind: "approveTask",
            requestId: proposalView.proposalRequestId,
        });
        const failedView = root.controller.getSnapshot();

        assert.equal(failedView.screen, "session");
        if (failedView.screen === "session") {
            assert.equal(failedView.phase, "executing");
            assert.equal(failedView.terminal?.status, "failed");
            assert.match(failedView.terminal?.reason ?? "", /INVALID_LLM_RESPONSE/);
            assert.equal(failedView.goal.state.run.stopReason?.kind, "execution_error");
            if (failedView.goal.state.run.stopReason?.kind === "execution_error") {
                assert.equal(failedView.goal.state.run.stopReason.code, "INVALID_AGENT_DECISION");
                assert.match(failedView.goal.state.run.stopReason.message, /INVALID_LLM_RESPONSE/);
            }
        }

        const trajectory = await root.readTrajectory({
            goalId: "goal-invalid-wire",
            runId: "run-invalid-wire",
        });
        const eventTypes = trajectory.committed.map((event) => event.eventType);
        assert.equal(eventTypes.includes("action_staged"), false);
        assert.equal(eventTypes.includes("observation_recorded"), false);
    } finally {
        await close(server);
        await rm(workspace, { recursive: true, force: true });
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
