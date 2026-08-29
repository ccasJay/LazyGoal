import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    createGoal,
    type AgentProfile,
    type Goal,
} from "../../runtime/src/index";
import { createCompositionRoot } from "../src/cli";
import { writeDefaultProfile } from "./profile-fixture";

type CapturedRequest = {
    readonly messages: ReadonlyArray<{
        readonly role: string;
        readonly content: string;
    }>;
};

const V1_GLOBAL_OVERVIEW = [
    "Global Overview:",
    "You are operating inside LazyGoal, a goal-driven and resumable agent runtime.",
    "LazyGoal turns user intent into an approved task through gathering_context and planning, then advances it through a controlled executing phase.",
    "Use the active Phase Protocol to determine the current responsibility and required response format.",
    "This Global Overview and the active Phase Protocol take precedence over the frozen Profile.",
    "Follow the frozen Profile for role-specific behavior, domain guidance, and working style when it does not conflict with those higher-level instructions.",
    "Treat the supplied conversation, Working Context, and Authorized Tool definitions as the inputs for the current turn.",
].join("\n");

const V1_GATHERING_PROTOCOL = [
    "Active Phase Protocol:",
    "只返回一个 JSON 对象，不要使用 Markdown 代码块或附加说明。",
    "允许的形状为 {\"kind\":\"question\",\"question\":\"非空文本\"} 或",
    "{\"kind\":\"context_ready\"}。",
    "不要返回任务提案或执行结果。",
].join("\n");

const V1_PLANNING_PROTOCOL = [
    "Active Phase Protocol:",
    "只返回一个 JSON 对象，不要使用 Markdown 代码块或附加说明。",
    "唯一允许的形状为 {\"kind\":\"task_proposal\",\"task\":",
    "{\"objective\":\"非空文本\",\"completionCriteria\":[\"非空文本\"]},",
    "\"approvalRequest\":\"非空文本\"}。",
    "不要返回问题、context_ready 或执行结果。",
].join("\n");

const V1_EXECUTING_PROTOCOL = [
    "Active Phase Protocol:",
    "只返回一个 JSON 对象，不要使用 Markdown 代码块或附加说明。",
    "输出必须符合 AgentDecision 协议，只能选择以下四个 kind 分支。",
    "Tool 调用形状为 {\"kind\":\"tool_call\",\"checkpoint\":\"累计状态\",",
    "\"action\":{\"actionId\":\"稳定 ID\",\"toolId\":\"授权 Tool ID\",\"input\":对象}}。",
    "结束形状为 {\"kind\":\"complete|wait|fail\",\"checkpoint\":\"累计状态\",",
    "\"summary|reason|error\":\"非空文本\"}，字段名必须与 kind 匹配。",
    "checkpoint、actionId、toolId 和对应文本字段必须是非空字符串。",
    "不要自行声明 Tool 的执行结果；必须等待 Runtime 提供 Observation。",
].join("\n");

const EMPTY_TOOLS = [
    "Authorized Tool definitions (only these Tool IDs may be requested):",
    "[]",
].join("\n");

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

    assert.equal(system?.role, "system");
    return system?.content ?? "";
}

function parseAuthorizedTools(content: string): unknown {
    const marker = [
        "Authorized Tool definitions (only these Tool IDs may be requested):",
        "",
    ].join("\n");
    const offset = content.lastIndexOf(marker);

    assert.notEqual(offset, -1);
    return JSON.parse(content.slice(offset + marker.length));
}

function createLegacyGoal(
    id: string,
    runId: string,
    profile: AgentProfile,
    phase: "gathering_context" | "planning" | "executing",
    promptBundleVersion = 1,
): Goal {
    const created = createGoal({
        promptBundleVersion,
        id,
        intent: `Resume legacy ${phase}`,
        profile,
        runId,
    });

    if (phase === "gathering_context") {
        return created;
    }

    if (phase === "planning") {
        return {
            ...created,
            state: {
                ...created.state,
                workflow: {
                    phase: "planning",
                    preparation: { status: "active" },
                },
            },
        };
    }

    return {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: {
                    objective: "Resume legacy execution",
                    completionCriteria: ["Legacy execution completes"],
                },
            },
        },
    };
}

test("Composition Root 激活 v4/structured@1 并保持旧 Bundle 三阶段逐字恢复", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-prompt-v2-"));
    await writeDefaultProfile(workspace);
    const responses = [
        JSON.stringify({ kind: "context_ready" }),
        JSON.stringify({
            kind: "task_proposal",
            task: {
                objective: "Verify the structured workflow",
                completionCriteria: [],
            },
            approvalRequest: "Approve the complete structured task contract?",
        }),
        JSON.stringify({
            kind: "complete",
            summary: "The structured workflow completed",
            completionEvidence: [],
        }),
        JSON.stringify({
            kind: "question",
            question: "Legacy gathering question",
        }),
        JSON.stringify({
            kind: "task_proposal",
            task: {
                objective: "Resume legacy planning",
                completionCriteria: ["Legacy planning remains compatible"],
            },
            approvalRequest: "Approve the legacy task?",
        }),
        JSON.stringify({
            kind: "complete",
            checkpoint: "Legacy execution evidence is complete",
            summary: "Legacy execution completed",
        }),
        JSON.stringify({
            kind: "question",
            question: "v2 gathering remains compatible",
        }),
        JSON.stringify({
            kind: "task_proposal",
            task: {
                objective: "Resume v2 planning",
                completionCriteria: ["v2 planning remains compatible"],
            },
            approvalRequest: "Approve the v2 legacy task?",
        }),
        JSON.stringify({
            kind: "complete",
            checkpoint: "v2 execution evidence is complete",
            summary: "v2 execution completed",
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
            goalIdGenerator: () => "goal-v2",
            runIdGenerator: () => "run-v2",
        });

        await root.controller.dispatch({
            kind: "create",
            intent: "Verify the v2 workflow",
        });
        const planningView = root.controller.getSnapshot();

        assert.equal(planningView.screen, "session");
        if (planningView.screen !== "session") {
            assert.fail("Expected a planning session");
        }
        assert.equal(planningView.phase, "planning");
        assert.equal(planningView.waitingFor, "approval");
        assert.equal(planningView.goal.definition.promptBundleVersion, 4);
        assert.deepEqual(planningView.goal.definition.memoryProtocol, {
            kind: "structured",
            version: 1,
        });

        const files = (await readdir(root.goalsDirectory))
            .filter((file) => file.endsWith(".json"));
        assert.equal(files.length, 1);
        const snapshot = JSON.parse(await readFile(
            join(root.goalsDirectory, files[0]!),
            "utf8",
        )) as {
            readonly metadata: { readonly schemaVersion: number };
            readonly definition: {
                readonly promptBundleVersion: number;
                readonly memoryProtocol?: unknown;
            };
        };
        assert.equal(snapshot.metadata.schemaVersion, 7);
        assert.equal(snapshot.definition.promptBundleVersion, 4);
        assert.deepEqual(snapshot.definition.memoryProtocol, {
            kind: "structured",
            version: 1,
        });

        await root.controller.dispatch({ kind: "approveTask" });
        const completedView = root.controller.getSnapshot();

        assert.equal(completedView.screen, "session");
        if (completedView.screen !== "session") {
            assert.fail("Expected a completed session");
        }
        assert.equal(completedView.phase, "executing");
        assert.equal(completedView.terminal?.status, "completed");
        assert.equal(requests.length, 3);

        const structuredSystems = requests.slice(0, 3).map(systemContent);
        assert.ok(structuredSystems[0]?.includes(
            "Active Phase Protocol: gathering_context (structured@1)",
        ));
        assert.ok(structuredSystems[1]?.includes("Active Phase Protocol: planning (structured@1)"));
        assert.ok(structuredSystems[2]?.includes("Active Phase Protocol: executing (structured@1)"));
        assert.ok(structuredSystems[0]?.includes("MemoryPatch"));
        assert.ok(structuredSystems[2]?.includes("completionEvidence"));
        assert.deepEqual(parseAuthorizedTools(structuredSystems[0] ?? ""), []);
        const planningTools = parseAuthorizedTools(structuredSystems[1] ?? "");
        const executingTools = parseAuthorizedTools(structuredSystems[2] ?? "");

        assert.deepEqual(planningTools, executingTools);
        assert.deepEqual(
            (planningTools as ReadonlyArray<{ readonly id: string }>)
                .map((tool) => tool.id),
            ["read_file"],
        );
        assert.ok(!structuredSystems[2]?.includes('"checkpoint"'));

        const legacyProfile: AgentProfile = {
            id: "legacy-profile",
            systemPrompt: "Legacy profile system prompt.",
            instructions: ["Preserve the v1 protocol exactly."],
            toolIds: [],
        };
        const legacyCases = [
            createLegacyGoal(
                "goal-v1-gathering",
                "run-v1-gathering",
                legacyProfile,
                "gathering_context",
            ),
            createLegacyGoal(
                "goal-v1-planning",
                "run-v1-planning",
                legacyProfile,
                "planning",
            ),
            createLegacyGoal(
                "goal-v1-executing",
                "run-v1-executing",
                legacyProfile,
                "executing",
            ),
        ];

        for (const legacyGoal of legacyCases) {
            await root.store.save(legacyGoal);
            const result = await root.coordinator.advance({
                goalId: legacyGoal.id,
                runId: legacyGoal.state.run.id,
            });

            assert.equal(result.ok, true);
            assert.equal(
                (await root.store.restore(legacyGoal.id))
                    ?.definition.promptBundleVersion,
                1,
            );
        }

        const legacyProfileFragment = [
            "Profile System Prompt:",
            legacyProfile.systemPrompt,
            "",
            "Profile Instructions:",
            "1. Preserve the v1 protocol exactly.",
        ].join("\n");
        assert.deepEqual(
            requests.slice(3, 6).map(systemContent),
            [
                V1_GATHERING_PROTOCOL,
                V1_PLANNING_PROTOCOL,
                V1_EXECUTING_PROTOCOL,
            ].map((protocol) => [
                V1_GLOBAL_OVERVIEW,
                legacyProfileFragment,
                protocol,
                EMPTY_TOOLS,
            ].join("\n\n")),
        );

        const legacyV2Cases = [
            createLegacyGoal(
                "goal-v2-gathering",
                "run-v2-gathering",
                legacyProfile,
                "gathering_context",
                2,
            ),
            createLegacyGoal(
                "goal-v2-planning",
                "run-v2-planning",
                legacyProfile,
                "planning",
                2,
            ),
            createLegacyGoal(
                "goal-v2-executing",
                "run-v2-executing",
                legacyProfile,
                "executing",
                2,
            ),
        ];

        for (const legacyGoal of legacyV2Cases) {
            await root.store.save(legacyGoal);
            const result = await root.coordinator.advance({
                goalId: legacyGoal.id,
                runId: legacyGoal.state.run.id,
            });

            assert.equal(result.ok, true);
            assert.equal(
                (await root.store.restore(legacyGoal.id))
                    ?.definition.promptBundleVersion,
                2,
            );
        }

        const legacyV2Systems = requests.slice(6, 9).map(systemContent);
        assert.equal(legacyV2Systems.length, 3);
        assert.ok(legacyV2Systems[0]?.includes(
            "Active Phase Protocol: gathering_context",
        ));
        assert.ok(legacyV2Systems[0]?.includes(
            "Only an Observation in Working Context establishes the result of a Tool Action",
        ));
        assert.ok(legacyV2Systems[1]?.includes("Active Phase Protocol: planning"));
        assert.ok(legacyV2Systems[2]?.includes("Active Phase Protocol: executing"));
        assert.ok(!legacyV2Systems[2]?.includes("Tool selection policy:"));
    } finally {
        await close(server);
        await rm(workspace, { recursive: true, force: true });
    }
});
