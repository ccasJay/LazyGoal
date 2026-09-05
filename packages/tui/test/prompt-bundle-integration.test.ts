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

test("Composition Root carries Preparation Memory through approval into Executing", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-prompt-v1-"));
    await writeDefaultProfile(workspace);
    const responses = [
        JSON.stringify({
            result: {
                kind: "question",
                question: "Which workflow should be verified?",
                memoryPatch: null,
            },
        }),
        JSON.stringify({
            result: {
                kind: "context_ready",
                memoryPatch: {
                    protocolVersion: 1,
                    operations: [{
                        type: "upsert_fact",
                        fact: {
                            subject: "user",
                            predicate: "workflow_requested",
                            value: "Verify the current workflow",
                            stability: "stable",
                            evidenceSequences: [2],
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
                    objective: "Initial proposal",
                    completionCriteria: [],
                },
                approvalRequest: "Approve the initial task contract?",
                memoryPatch: null,
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
            const responseContent = responses[requests.length];

            if (responseContent === undefined) {
                response.statusCode = 500;
                response.end("Unexpected model request");
                return;
            }

            requests.push(JSON.parse(
                Buffer.concat(chunks).toString("utf8"),
            ) as CapturedRequest);
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
                LLM_API_KEY: "test-key",
                LLM_BASE_URL: `http://127.0.0.1:${port}/v1`,
                LLM_MODEL: "test-model",
            },
            goalIdGenerator: () => "goal-current",
            runIdGenerator: () => "run-current",
        });

        await root.controller.dispatch({
            kind: "create",
            intent: "Verify the current workflow",
        });
        const gatheringView = root.controller.getSnapshot();

        if (gatheringView.screen !== "session") {
            throw new Error("Expected a gathering session");
        }
        if (gatheringView.phase !== "gathering_context" || gatheringView.waitingFor !== "question") {
            throw new Error("Expected a gathering question");
        }

        await root.controller.dispatch({
            kind: "submitMessage",
            content: "Verify the current workflow with the default profile.",
        });
        const initialPlanningView = root.controller.getSnapshot();

        if (initialPlanningView.screen !== "session"
            || initialPlanningView.phase !== "planning"
            || initialPlanningView.waitingFor !== "approval") {
            throw new Error("Expected planning approval after gathering context");
        }
        if (initialPlanningView.proposal?.objective !== "Initial proposal") {
            throw new Error("Expected the first planning proposal");
        }

        await root.controller.dispatch({
            kind: "submitMessage",
            content: "Please use the approved wording.",
        });
        const revisedPlanningView = root.controller.getSnapshot();

        if (revisedPlanningView.screen !== "session"
            || revisedPlanningView.phase !== "planning"
            || revisedPlanningView.waitingFor !== "approval") {
            throw new Error("Expected planning approval after feedback");
        }
        if (revisedPlanningView.proposal?.objective !== "Approved proposal") {
            throw new Error("Expected the revised planning proposal");
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

        await root.controller.dispatch({ kind: "approveTask" });
        const completedView = root.controller.getSnapshot();

        if (completedView.screen !== "session") {
            throw new Error("Expected a completed session");
        }
        if (completedView.phase !== "executing" || completedView.terminal?.status !== "completed") {
            throw new Error("Expected the current workflow to complete");
        }
        if (requests.length !== 5) {
            throw new Error("Expected gathering, planning feedback and executing requests");
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

        const firstPreparationControl = controlPayload(requests[0]!);
        if (firstPreparationControl.preparationInputEvidence?.[0]?.messageIndex !== 0) {
            throw new Error("Expected initial intent provenance in the first Preparation request");
        }
        if (firstPreparationControl.visibleConversationMessageMap?.[0]?.sourceMessageIndex !== 0) {
            throw new Error("Expected the initial Conversation source index");
        }

        const planningControl = controlPayload(requests[2]!);
        if (planningControl.workingMemory?.facts?.[0]?.predicate !== "workflow_requested") {
            throw new Error("Expected the accepted Preparation Fact in planning");
        }
        if (planningControl.preparationInputEvidence?.length !== 2) {
            throw new Error("Expected committed Preparation provenance in planning");
        }

        const executingControl = controlPayload(requests[4]!);
        const executingSystem = systemContent(requests[4]!);
        if (!executingSystem.includes("Approved Goal Task Contract:\nObjective: Approved proposal")) {
            throw new Error("Expected only the approved proposal in Executing system prompt");
        }
        if ("task" in executingControl) {
            throw new Error("Executing must not receive redundant task in control message");
        }
        if ("preparationInputEvidence" in executingControl) {
            throw new Error("Executing must not receive Preparation provenance");
        }
        if ("visibleConversationMessageMap" in executingControl) {
            throw new Error("Executing must not receive Preparation Conversation mapping");
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
            "preparation_input_recorded",
            "preparation_result",
            "memory_patch_accepted",
            "context_epoch_advanced",
            "run_started",
            "decision_received",
            "run_completed",
        ];
        let previousIndex = -1;
        for (const eventType of requiredOrder) {
            const eventIndex = committedTypes.indexOf(eventType);
            if (eventIndex <= previousIndex) {
                throw new Error(`Expected ordered committed event ${eventType}`);
            }
            previousIndex = eventIndex;
        }
        const firstResumeIndex = committedTypes.indexOf("run_resumed");
        const contextReadyIndex = committedTypes.indexOf("preparation_result", firstResumeIndex + 1);
        const feedbackResumeIndex = committedTypes.indexOf("run_resumed", contextReadyIndex + 1);
        const epochIndex = committedTypes.indexOf("context_epoch_advanced");
        if (firstResumeIndex < 0
            || contextReadyIndex <= firstResumeIndex
            || feedbackResumeIndex <= contextReadyIndex
            || epochIndex <= feedbackResumeIndex) {
            throw new Error("Expected gathering input and planning feedback before execution");
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
        if (trajectory.committed.some(
            (event) => event.eventType === "preparation_input_recorded" && event.phase === "executing",
        )) {
            throw new Error("Preparation provenance must not be recorded in Executing");
        }
        if (persisted.state.messages.some(({ content }) =>
            content === "Initial proposal" || content === "Approved proposal"
        )) {
            throw new Error("Preparation model responses must not enter Goal messages");
        }
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
