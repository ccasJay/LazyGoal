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

test("Composition Root uses the single current v1 protocol combination", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-prompt-v1-"));
    await writeDefaultProfile(workspace);
    const responses = [
        JSON.stringify({ kind: "context_ready" }),
        JSON.stringify({
            kind: "task_proposal",
            task: {
                objective: "Verify the current workflow",
                completionCriteria: [],
            },
            approvalRequest: "Approve the current task contract?",
        }),
        JSON.stringify({
            kind: "complete",
            summary: "The current workflow completed",
            completionEvidence: [],
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
        const planningView = root.controller.getSnapshot();

        if (planningView.screen !== "session") {
            throw new Error("Expected a planning session");
        }
        if (planningView.phase !== "planning" || planningView.waitingFor !== "approval") {
            throw new Error("Expected planning approval after gathering context");
        }
        assertCurrentDefinition(planningView.goal.definition);

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
        if (requests.length !== 3) {
            throw new Error("Expected one request per current workflow phase");
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
