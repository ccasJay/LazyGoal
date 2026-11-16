import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { JsonValue } from "../../../packages/contracts/src/index";
import { createTestBinding, objectInputSchema } from "../../../packages/tool-core/test/binding-fixtures";
import type { LLMAdapter, LLMRequest, LLMResponse } from "../../../packages/llm-core/src/index";
import { toolResponseFixture } from "../../../packages/agent/test/tool-response-fixture";
import type { AgentProfile, Goal, RunStopReason } from "../../../packages/runtime/src/index";
import { createToolRegistration, InMemoryToolRegistry, type Tool } from "../../../packages/tool-core/src/index";
import {
    readBrowserGoalActivity,
    readBrowserGoalSessionState,
} from "../../../packages/browser/src/index";
import { createRuntimeComposition, type RuntimeComposition } from "../src/runtime/index";
import { createTestToolRegistration } from "../../../packages/tool-core/test/helpers";

const fixtureInput = objectInputSchema({ value: { type: "string" } });
const profile: AgentProfile = {
    id: "profile-goal-board-streaming",
    systemPrompt: "You are a deterministic acceptance agent.",
    instructions: [],
    toolIds: ["streaming_fixture_write"],
};

/** 声明阶段、调用一次受控工具再给出完成答复的确定性适配器。 */
class StreamingFixtureAdapter implements LLMAdapter {
    readonly provider = "openai";
    modelId = "model-goal-board-streaming";
    readonly requests: LLMRequest[] = [];
    runtime: RuntimeComposition | undefined;
    goalId = "goal-board-streaming-integration";

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.requests.push(request);
        const goal = await this.runtime?.workspaceGoalStore.restore(this.goalId);
        const trajectory = goal === undefined || this.runtime === undefined
            ? undefined
            : await this.runtime.readWorkspaceTrajectory({ goalId: this.goalId, runId: goal.state.run.id });
        const observed = trajectory?.committed.some((event) => event.eventType === "observation_recorded") ?? false;
        const evidenceSequences = (trajectory?.committed ?? [])
            .filter((event) => event.eventType === "observation_recorded")
            .map((event) => event.sequence);
        const stageDeclared = (trajectory?.committed ?? []).some((event) => event.eventType === "run_stage_declared");

        let result: Record<string, unknown>;
        const toolExposed = (goal as Goal | undefined)?.state.run.exposedToolIds.includes("streaming_fixture_write") ?? false;
        if (!toolExposed) {
            result = { kind: "tool_discovery", query: "streaming_fixture_write" };
        } else if (!stageDeclared) {
            result = {
                kind: "run_stage_update",
                stageId: null,
                baseRevision: null,
                reason: null,
                contextNotes: null,
                target: "Run the controlled acceptance tool",
                acceptanceCriteria: ["The controlled tool ran once"],
                memoryPatch: null,
            };
        } else if (!observed) {
            result = {
                kind: "tool_call",
                action: { actionId: "action-board-streaming-1", toolId: "streaming_fixture_write", input: { value: "controlled" } },
                memoryPatch: null,
            };
        } else {
            // 受控工具已提交：停在等待点，便于核对已提交工具活动与消息位置。
            result = { kind: "wait", reason: "The controlled action finished; the acceptance check stops here." };
        }
        return toolResponseFixture(JSON.stringify({ result }));
    }
}

test("正式装配贯通工具活动与正式答复，并给出稳定位置与安全活动投影", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "lazygoal-goal-board-streaming-"));
    const workspace = join(temporaryRoot, "workspace");
    const dataDirectory = join(temporaryRoot, "data");
    const home = join(temporaryRoot, "home");
    await Promise.all([mkdir(workspace), mkdir(dataDirectory), mkdir(home)]);

    let toolCalls = 0;
    const controlledTool: Tool = {
        definition: {
            id: "streaming_fixture_write",
            description: "Write one deterministic value to the isolated acceptance workspace.",
            inputBinding: createTestBinding<JsonValue>("test.fixture", fixtureInput),
            isReadOnly: false,
        },
        replayPolicy: "manual",
        validate: () => ({ ok: true }),
        async execute({ input }) {
            toolCalls += 1;
            return { kind: "success", output: "PRIVATE_CONTROLLED_OUTPUT", summary: "Stored the controlled value." };
        },
    };
    const adapter = new StreamingFixtureAdapter();
    const runtime = await createRuntimeComposition({
        cwd: workspace,
        dataDirectory,
        env: { LAZYGOAL_HOME: home } as NodeJS.ProcessEnv,
        adapter,
        profile,
        toolRegistry: new InMemoryToolRegistry([createTestToolRegistration(controlledTool)]),
        toolPolicy: { evaluate: () => "allow" },
        goalIdGenerator: () => "goal-board-streaming-integration",
        runIdGenerator: () => "run-board-streaming-1",
    });

    const goalId = "goal-board-streaming-integration";
    adapter.runtime = runtime;
    try {
        const created = await runtime.sessions.create({
            goalId,
            inputId: "input-board-streaming-1",
            content: "Streaming flow: run one controlled tool and answer",
            profileId: profile.id,
        });
        assert.equal(created.ok, true, JSON.stringify(created));

        // 等待受控工具执行并让 Run 进入终态。
        const deadline = Date.now() + 30_000;
        let status = "running";
        let stopReason: RunStopReason | undefined;
        while (Date.now() < deadline && status !== "waiting" && status !== "completed" && status !== "failed") {
            await new Promise((resolve) => setTimeout(resolve, 50));
            const goal = await runtime.workspaceGoalStore.restore(goalId);
            if (goal === undefined) break;
            status = goal.state.run.status;
            stopReason = goal.state.run.stopReason;
        }
        const failedGoal = await runtime.workspaceGoalStore.restore(goalId);
        const failedTrajectory = failedGoal === undefined ? undefined : await runtime.readWorkspaceTrajectory({ goalId, runId: failedGoal.state.run.id });
        const repairFeedback = (failedTrajectory?.committed ?? [])
            .filter((event) => event.eventType === "model_repair_feedback_recorded" || event.eventType === "model_request_retry_recorded")
            .map((event) => JSON.stringify(event.payload));
        const eventKinds = (failedTrajectory?.committed ?? []).map((event) => `${event.sequence}:${event.eventType}`).join(",");
        assert.equal(status, "waiting", `stopReason=${JSON.stringify(stopReason ?? null)} feedback=${repairFeedback.join(" | ")} events=${eventKinds}`);        assert.equal(toolCalls, 1, "受控工具只执行一次");

        const page = await readBrowserGoalActivity(
            goalId,
            {},
            runtime.workspaceGoalStore,
            runtime.readWorkspaceTrajectory,
        );
        assert.equal(page.ok, true);
        if (!page.ok) return;

        // 窄状态不内嵌历史：消息、步骤与阶段都明确指向 Activity。
        const state = await readBrowserGoalSessionState(goalId, runtime.workspaceGoalStore);
        assert.ok(state);
        assert.deepEqual(state?.history, {
            messages: { included: false, source: "activity" },
            steps: { included: false, source: "activity" },
            stages: { included: false, source: "activity" },
        });

        // 已提交工具活动带有最小安全状态：工具身份、执行状态与白名单摘要。
        const toolFacts = page.page.items.filter((item) =>
            item.type === "fact" && item.tool !== undefined);
        assert.ok(toolFacts.length >= 2, JSON.stringify(page.page.items.map((item) => item.itemId)));
        const completedTool = toolFacts.find((item) => item.type === "fact" && item.tool?.status === "completed");
        assert.ok(completedTool);
        assert.equal(completedTool.type === "fact" ? completedTool.tool?.toolId : undefined, "streaming_fixture_write");
        assert.equal(completedTool.type === "fact" ? completedTool.tool?.summary : undefined, "Stored the controlled value.");
        assert.equal(JSON.stringify(page.page).includes("PRIVATE_CONTROLLED_OUTPUT"), false, "原始 Observation 不进入公开投影");

        // 正式消息与事实按真实来源交错：用户消息在工具事实之前，已保存正文在其后。
        const ordered = page.page.items.map((item) => ({
            itemId: item.itemId,
            kind: item.type,
            sequence: item.position.sequence,
        }));
        const messageIndexes = ordered
            .map((item, index) => (item.kind === "message" ? index : -1))
            .filter((index) => index >= 0);
        const intentIndex = messageIndexes[0] ?? -1;
        const answerIndex = messageIndexes.at(-1) ?? -1;
        const firstToolIndex = ordered.findIndex((item) => item.kind === "fact");
        assert.ok(intentIndex >= 0, JSON.stringify(ordered));
        assert.ok(messageIndexes.length >= 2, JSON.stringify(ordered));
        assert.ok(firstToolIndex > intentIndex, JSON.stringify(ordered));
        assert.ok(answerIndex > firstToolIndex, JSON.stringify(ordered));
        assert.ok(firstToolIndex >= 0, JSON.stringify(ordered));

        // 消息位置稳定且属于真实 Run；重建后身份与次序不变。
        const rebuilt = await readBrowserGoalActivity(
            goalId,
            {},
            runtime.workspaceGoalStore,
            runtime.readWorkspaceTrajectory,
        );
        assert.equal(rebuilt.ok, true);
        if (!rebuilt.ok) return;
        assert.deepEqual(
            rebuilt.page.items.map((item) => item.itemId),
            page.page.items.map((item) => item.itemId),
        );
    } finally {
        await runtime.abortController.abort();
        await runtime.lifecycle.close().catch(() => undefined);
        await runtime.resources.closeAll().catch(() => undefined);
        await rm(temporaryRoot, { recursive: true, force: true });
    }
});
