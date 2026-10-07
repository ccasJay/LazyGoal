import assert from "node:assert/strict";
import { test } from "node:test";

import { contract } from "../../contracts/src/index";
import type { LLMAdapter } from "../../llm/src/core/adapter";
import type { LLMRequest, LLMResponse } from "../../llm/src/core/types";
import {
    createDefaultPromptBundleRenderer,
    createModelExecutionBinding,
    DropOldestContextCompactor,
    LLMStepExecutor,
    MutableModelBinding,
} from "../../agent/src/index";
import {
    createEmptyGoalPlan,
    createGoal,
    GoalCoordinator,
    reduceGoalPlan,
    Runner,
    type GoalStore,
} from "../src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    type Tool,
} from "../../tool-core/src/index";
import type {
    AgentProfile,
    Goal,
    GoalModelSelection,
    GoalTask,
    ModelContextFramePayload,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, InMemoryTrajectoryStore } from "./current-fixtures";

const renderer = await createDefaultPromptBundleRenderer();
const contextCompactor = new DropOldestContextCompactor();
const fileInput = contract.object({ path: contract.string() });
const fileTool: Tool<typeof fileInput> = {
    definition: {
        id: "inspect_file",
        description: "读取文件并返回当前工作区 Observation",
        inputContract: fileInput,
        isReadOnly: true,
    },
    replayPolicy: "safe",
    validate: () => ({ ok: true }),
    async execute({ input }) {
        return {
            kind: "success",
            output: { path: input.path, content: "verified" },
            summary: "文件内容已读取并验证",
        };
    },
};

type ScriptedReply = string | ((request: LLMRequest, callIndex: number) => string);

class ScriptedAdapter implements LLMAdapter {
    readonly requests: LLMRequest[] = [];

    constructor(
        readonly structuredOutputMode: "strict" | "prompt_only",
        private readonly replies: readonly ScriptedReply[],
    ) {}

    async generate(request: LLMRequest): Promise<LLMResponse> {
        this.requests.push(request);
        if (request.tools?.[0]?.id === "system_review_completion") return { content: JSON.stringify({ result: { kind: "accept" } }) };
        const index = this.requests.length - 1;
        const reply = this.replies[index];
        if (reply === undefined) throw new Error("scripted adapter responses exhausted");
        return { content: typeof reply === "function" ? reply(request, index) : reply };
    }
}

function response(result: unknown): string {
    const wireResult = typeof result === "object"
        && result !== null
        && "kind" in result
        && result.kind !== "request_think"
        && !("memoryPatch" in result)
        ? { ...result, memoryPatch: null }
        : result;
    return JSON.stringify({ result: wireResult });
}

function selection(
    provider: "openai" | "anthropic",
): GoalModelSelection {
    return {
        provider,
        modelId: `${provider}-integration-test`,
        structuredOutputMode: provider === "openai" ? "strict" : "prompt_only",
        inputEstimator: { kind: "character-v1" },
    };
}

function createTask(): GoalTask {
    return {
        objective: "验证分层上下文执行",
        completionCriteria: [{
            text: "inspect_file 的成功 Observation 支持完成声明",
            acceptance: { expectToolId: "inspect_file", expectOutcome: "success" },
        }],
    };
}

function createPlan(): NonNullable<Goal["state"]["goalPlan"]> {
    const result = reduceGoalPlan(createEmptyGoalPlan(), {
        baseRevision: 0,
        operations: [{ type: "add", content: "依据当前 Observation 验证文件" }],
    }, { idFactory: () => "plan-item-1" });
    if (!result.ok) throw new Error(result.error.message);
    return result.plan;
}

function createRunningGoal(input: {
    readonly id: string;
    readonly selection: GoalModelSelection;
    readonly mode?: "normal" | "plan";
    readonly approvedTask?: GoalTask;
    readonly toolIds?: readonly string[];
    readonly goalPlan?: Goal["state"]["goalPlan"];
}): Goal {
    const profile: AgentProfile = {
        id: "prompt-context-integration-profile",
        systemPrompt: "Follow the frozen execution contract.",
        instructions: ["Use current committed evidence."],
        toolIds: [...(input.toolIds ?? [])],
    };
    const created = createGoal({
        ...currentProtocols,
        id: input.id,
        intent: "验证 Prompt 分层不改变 Runtime 边界",
        promptBundleVersion: 1,
        profile,
        runId: `${input.id}-run`,
        mode: input.mode ?? "normal",
        maxSteps: 8,
        modelSelection: input.selection,
    });
    return {
        ...created,
        state: {
            ...created.state,
            ...(input.goalPlan === undefined ? {} : { goalPlan: input.goalPlan }),
            run: {
                ...created.state.run,
                status: "running",
                mode: input.mode ?? "normal",
                exposedToolIds: [...profile.toolIds],
                ...(input.approvedTask === undefined ? {} : { approvedTask: input.approvedTask }),
            },
        },
    };
}

function createExecutor(
    trajectory: InMemoryTrajectoryStore,
    selectionValue: GoalModelSelection,
    decideAdapter: LLMAdapter,
    thinkAdapter: LLMAdapter = new ScriptedAdapter("prompt_only", []),
): LLMStepExecutor {
    const binding = createModelExecutionBinding({
        generation: 1,
        selection: selectionValue,
        thinkAdapter,
        decideAdapter,
        trajectoryStore: trajectory,
    });
    return new LLMStepExecutor({
        bindingProvider: new MutableModelBinding(binding),
        renderer,
        contextCompactor,
    });
}

function requestText(request: LLMRequest): string {
    return request.messages.map((message) => message.content).join("\n");
}

function currentObservationSequence(trajectory: InMemoryTrajectoryStore): number {
    const observation = [...trajectory.events].reverse().find((event) =>
        event.eventType === "observation_recorded",
    );
    if (observation === undefined) throw new Error("committed Tool Observation is missing");
    return observation.sequence;
}

test("strict 多轮 Think 与 prompt-only 直接 Decide 都携带当前分层状态", async () => {
    for (const scenario of [
        { provider: "openai" as const, expectsThink: true },
        { provider: "anthropic" as const, expectsThink: false },
    ]) {
        const selected = selection(scenario.provider);
        const goal = createRunningGoal({
            id: `prompt-stage-${scenario.provider}`,
            selection: selected,
            mode: "plan",
            approvedTask: createTask(),
            goalPlan: createPlan(),
        });
        const store = new InMemoryGoalStore();
        const trajectory = new InMemoryTrajectoryStore();
        await store.save(goal);

        const decideAdapter = new ScriptedAdapter(
            scenario.expectsThink ? "strict" : "prompt_only",
            scenario.expectsThink
                ? [
                    response({ kind: "request_think", goal: "核对完成条件与当前证据边界" }),
                    response({ kind: "wait", reason: "阶段上下文检查完成" }),
                ]
                : [response({ kind: "wait", reason: "直接 Decide 路径验证完成" })],
        );
        const thought = "当前没有新的 Tool Observation；下一步必须继续执行或等待。";
        const thinkAdapter = new ScriptedAdapter("prompt_only", [thought]);
        const runner = new Runner({
            store,
            trajectoryStore: trajectory,
            executor: createExecutor(trajectory, selected, decideAdapter, thinkAdapter),
        });

        const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
        assert.equal(result.ok, true);
        if (!result.ok) continue;
        assert.equal(result.state.status, "waiting");
        assert.equal(result.state.stepCount, 1);
        assert.equal(decideAdapter.requests.length, scenario.expectsThink ? 2 : 1);
        assert.equal(thinkAdapter.requests.length, scenario.expectsThink ? 1 : 0);

        for (const request of [
            ...decideAdapter.requests,
            ...thinkAdapter.requests,
        ]) {
            const text = requestText(request);
            for (const sectionId of [
                "run_mode",
                "approved_task",
                "goal_plan",
                "authorized_tools",
                "working_memory",
            ]) {
                assert.ok(text.includes(`Dynamic section: ${sectionId}`), `${sectionId} missing for ${scenario.provider}`);
            }
        }

        const firstDecide = decideAdapter.requests[0]!;
        const workingContext = JSON.parse(firstDecide.messages.at(-1)!.content) as Record<string, unknown>;
        if (scenario.provider === "openai") {
            assert.ok(firstDecide.structuredOutput !== undefined);
            assert.equal("responseShapeGuide" in workingContext, false);
            assert.equal(decideAdapter.requests[1]?.messages.some((message) =>
                message.role === "assistant" && message.content === thought,
            ), true);
        } else {
            assert.equal(firstDecide.structuredOutput, undefined);
            assert.match(String(workingContext.responseShapeGuide), /Respond with a JSON object/);
        }

        if (scenario.expectsThink) {
            const thinkRequest = thinkAdapter.requests[0]!;
            assert.equal(thinkRequest.structuredOutput, undefined);
            assert.equal(thinkRequest.tools, undefined);
            assert.ok(thinkRequest.messages.some((message) =>
                message.role === "user" && message.content.includes("核对完成条件与当前证据边界"),
            ));
        }
    }
});

test("未批准 Plan 保留先提案 Prompt，已有工具审批规则仍允许授权业务 Tool", async () => {
    const selected = selection("openai");
    const goal = createRunningGoal({
        id: "prompt-plan-unapproved",
        selection: selected,
        mode: "plan",
        toolIds: [fileTool.definition.id],
    });
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    await store.save(goal);
    let toolCalls = 0;
    const tool: Tool<typeof fileInput> = {
        ...fileTool,
        async execute(input) {
            toolCalls += 1;
            return fileTool.execute(input);
        },
    };
    const registry = new InMemoryToolRegistry([createToolRegistration(tool)]);
    const decideAdapter = new ScriptedAdapter("strict", [
        response({
            kind: "tool_call",
            action: {
                actionId: "plan-preproposal-read",
                toolId: fileTool.definition.id,
                input: { path: "README.md" },
            },
        }),
        response({
            kind: "task_proposal",
            task: {
                objective: "使用已读取的文件继续验证",
                completionCriteria: [{ text: "提案等待用户批准", acceptance: null }],
            },
            approvalRequest: "请批准继续执行当前 Goal。",
        }),
    ]);
    const runner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor: createExecutor(trajectory, selected, decideAdapter),
        toolRegistry: registry,
        toolPolicy: { evaluate: () => "require_approval" },
    });

    const actionWaiting = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(actionWaiting.ok, true);
    if (!actionWaiting.ok) return;
    assert.equal(actionWaiting.state.status, "waiting");
    assert.equal(actionWaiting.state.pendingAction?.status, "awaiting_approval");
    assert.equal(toolCalls, 0);

    const initialRequest = decideAdapter.requests[0]!;
    const prompt = requestText(initialRequest);
    assert.match(prompt, /Plan Run without an approved task: first submit a task proposal/);
    assert.match(prompt, /Do not call a business Tool before proposing/);
    assert.match(prompt, /inspect_file/);
    assert.ok(initialRequest.tools?.length);

    const coordinator = new GoalCoordinator({
        store,
        trajectoryStore: trajectory,
        toolRegistry: registry,
        scheduler: {
            schedule: (ref, options, control) => runner.run(ref, options, control),
        },
    });
    const resumed = await coordinator.resume({
        ref: { goalId: goal.id, runId: goal.state.run.id },
        action: { kind: "approve_action", actionId: "plan-preproposal-read" },
    });
    assert.equal(resumed.ok, true);
    if (!resumed.ok) return;
    assert.equal(resumed.kind, "waiting", JSON.stringify(resumed));
    if (resumed.kind !== "waiting") return;
    assert.equal(resumed.waitingFor, "task_approval");
    assert.equal(resumed.goal.state.run.approvedTask, undefined);
    assert.equal(resumed.goal.state.run.pendingInteraction?.kind, "task_approval");
    assert.equal(toolCalls, 1);
    assert.equal(decideAdapter.requests.length, 2);
    assert.match(requestText(decideAdapter.requests[1]!), /Plan Run without an approved task/);
    assert.ok(trajectory.events.some((event) => event.eventType === "observation_recorded"));
});

test("授权 Tool Observation 支持 GoalPlan 完成和符合条件的 Run 完成证据", async () => {
    const selected = selection("openai");
    const goalPlan = createPlan();
    const goal = createRunningGoal({
        id: "prompt-plan-evidence",
        selection: selected,
        mode: "plan",
        approvedTask: createTask(),
        goalPlan,
        toolIds: [fileTool.definition.id],
    });
    const store = new InMemoryGoalStore();
    const trajectory = new InMemoryTrajectoryStore();
    await store.save(goal);
    const decideAdapter = new ScriptedAdapter("strict", [
        response({
            kind: "tool_call",
            action: {
                actionId: "evidence-read",
                toolId: fileTool.definition.id,
                input: { path: "README.md" },
            },
        }),
        (_request, callIndex) => {
            assert.equal(callIndex, 1);
            const evidenceSequence = currentObservationSequence(trajectory);
            return response({
                kind: "goal_plan_update",
                baseRevision: goalPlan.revision,
                operations: [
                    {
                        type: "update",
                        id: "plan-item-1",
                        content: null,
                        status: "in_progress",
                        evidenceSequences: null,
                    },
                    {
                        type: "update",
                        id: "plan-item-1",
                        content: null,
                        status: "completed",
                        evidenceSequences: [evidenceSequence],
                    },
                ],
            });
        },
        () => response({
            kind: "complete",
            summary: "文件已验证并完成计划项。",
            completionEvidence: [{
                criterionIndex: 0,
                evidenceSequences: [currentObservationSequence(trajectory)],
            }],
            memoryPatch: null,
        }),
    ]);
    const runner = new Runner({
        store,
        trajectoryStore: trajectory,
        executor: createExecutor(trajectory, selected, decideAdapter),
        toolRegistry: new InMemoryToolRegistry([createToolRegistration(fileTool)]),
    });

    const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.state.status, "completed", JSON.stringify(result.state.stopReason));
    assert.equal(result.state.stepCount, 3);
    assert.equal(result.state.lastStep?.kind, "decision");
    assert.equal(decideAdapter.requests.length, 4);
    assert.equal(decideAdapter.requests[3]!.tools?.[0]?.id, "system_review_completion");
    assert.ok(trajectory.events.some((event) => event.eventType === "tool_finished"));
    assert.ok(trajectory.events.some((event) => event.eventType === "observation_recorded"));
    assert.ok(trajectory.events.some((event) => event.eventType === "goal_plan_updated"));

    const updatedPlanRequest = requestText(decideAdapter.requests[2]!);
    assert.match(updatedPlanRequest, /Dynamic section: goal_plan/);
    assert.match(updatedPlanRequest, /operation: replace/);
    assert.match(updatedPlanRequest, /completed/);
});

test("越权 Tool 输出被拒绝，已提交未知 section 也在 Adapter 调用前 fail-closed", async (t) => {
    await t.test("Profile 未授权的 Tool 不会执行", async () => {
        const selected = selection("anthropic");
        const goal = createRunningGoal({
            id: "prompt-unauthorized-tool",
            selection: selected,
            mode: "plan",
            approvedTask: createTask(),
        });
        const store = new InMemoryGoalStore();
        const trajectory = new InMemoryTrajectoryStore();
        await store.save(goal);
        let toolCalls = 0;
        const invalidResponse = response({
            kind: "tool_call",
            action: {
                actionId: "unauthorized-read",
                toolId: "delete_everything",
                input: { path: "README.md" },
            },
        });
        const decideAdapter = new ScriptedAdapter("prompt_only", [invalidResponse, invalidResponse, invalidResponse]);
        const runner = new Runner({
            store,
            trajectoryStore: trajectory,
            executor: createExecutor(trajectory, selected, decideAdapter),
            toolRegistry: new InMemoryToolRegistry([createToolRegistration({
                ...fileTool,
                async execute(input) {
                    toolCalls += 1;
                    return fileTool.execute(input);
                },
            })]),
        });

        const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.state.status, "failed");
        assert.equal(result.state.stopReason?.kind, "execution_error");
        if (result.state.stopReason?.kind === "execution_error") {
            assert.equal(result.state.stopReason.code, "INVALID_AGENT_DECISION");
        }
        assert.equal(toolCalls, 0);
        assert.equal(decideAdapter.requests.length, 3);
        assert.match(requestText(decideAdapter.requests[0]!), /inspect_file/);
        assert.doesNotMatch(requestText(decideAdapter.requests[0]!), /delete_everything/);
    });

    await t.test("committed 未知 section 在模型请求前拒绝恢复", async () => {
        const selected = selection("openai");
        const goal = createRunningGoal({
            id: "prompt-unknown-section",
            selection: selected,
        });
        const store: GoalStore = new InMemoryGoalStore();
        const trajectory = new InMemoryTrajectoryStore();
        const payload: ModelContextFramePayload = {
            type: "model_context_frame",
            stage: "decide",
            epochNumber: goal.state.run.contextEpoch.number,
            conversationPosition: goal.state.messages.length,
            sections: [{
                sectionId: "missing_section",
                order: 900,
                source: "UnknownState.value",
                role: "user",
                templateId: "missing-section@1",
                status: "active",
                projection: { value: "stale" },
                content: "未知的历史上下文",
            }],
        };
        const frame = await trajectory.append({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            eventType: "model_context_frame",
            payload,
        });
        const committedGoal: Goal = {
            ...goal,
            state: {
                ...goal.state,
                run: {
                    ...goal.state.run,
                    committedThroughSequence: frame.sequence,
                },
            },
        };
        await store.save(committedGoal);
        const decideAdapter = new ScriptedAdapter("strict", [response({
            kind: "wait",
            reason: "不应调用 Adapter",
        })]);
        const runner = new Runner({
            store,
            trajectoryStore: trajectory,
            executor: createExecutor(trajectory, selected, decideAdapter),
        });

        const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(result.state.status, "failed");
        assert.equal(decideAdapter.requests.length, 0);
    });
});
