import assert from "node:assert/strict";
import { test } from "node:test";
import { readModelMessageText } from "../../llm-core/src/index";

import type { NativeConversationIdentity } from "../../model-contracts/src/index";
import { createGoal } from "../../runtime/src/domain";
import type { Goal, GoalMessage } from "../../runtime/src/domain";
import {
    CharacterModelInputEstimator,
    DropOldestContextCompactor,
    ModelContextHardOverflowError,
    createModelCapabilities,
    createModelContextBudgetPolicy,
    createTokenModelInputEstimator,
} from "../../context-budget/src/index";
import { TrajectoryModelContextAssembler } from "../../model-context/src/index";
import {
    DynamicSectionRegistry,
    createPromptBundleRenderer,
} from "../../prompt-renderer/src/index";
import { createEmptyWorkingMemory } from "../../working-memory/src/index";
import { createTestToolDefinition, objectInputSchema } from "../../tool-core/test/binding-fixtures";
import { buildStepRequest, createStageMessages } from "../src/index";
import { currentProtocols, createInMemoryTrajectoryStore } from "../../agent/test/current-fixtures";

const profile = {
    id: "request-profile",
    systemPrompt: "request system",
    instructions: [],
    toolIds: ["read_file", "write_file"],
};

const READ_TOOL = createTestToolDefinition("read_file", objectInputSchema({
    path: { type: "string" },
}), { description: "Read a file", isReadOnly: true });
const WRITE_TOOL = createTestToolDefinition("write_file", objectInputSchema({
    path: { type: "string" },
    content: { type: "string" },
}), { description: "Write a file", isReadOnly: false });

const templates = [
    { id: "global-overview@1", source: "GLOBAL" },
    { id: "profile@1", source: "PROFILE {{ profile.systemPrompt }}" },
    { id: "agent-decision@1", source: "DECIDE" },
    { id: "agent-think@1", source: "THINK" },
    { id: "run-mode@1", source: "MODE {{ section.projection.mode }}" },
];

const manifest = {
    version: 1 as const,
    memoryProtocol: { kind: "structured" as const, version: 1 as const },
    modelContextProtocol: { kind: "trajectory-layered" as const, version: 1 as const },
    contextRetrievalProtocol: { kind: "bm25-lite" as const, version: 1 as const },
    sections: [
        { slot: "global_overview" as const, templateId: "global-overview@1" },
        { slot: "profile" as const, templateId: "profile@1" },
        {
            slot: "phase_protocol" as const,
            templates: { decide: "agent-decision@1", think: "agent-think@1" },
        },
    ],
};

function renderer() {
    return createPromptBundleRenderer({
        templates,
        bundles: [manifest],
        dynamicSectionRegistry: new DynamicSectionRegistry([{
            id: "run_mode",
            order: 10,
            source: "RunState.mode",
            role: "user",
            templateId: "run-mode@1",
            project: (view) => ({ mode: view.dynamicContext.runMode }),
        }]),
    });
}

function goal(messages: readonly GoalMessage[] = []): Goal {
    const created = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: "request-goal",
        runId: "request-run",
        intent: "完成请求",
        profile,
        messages,
    });
    return {
        ...created,
        state: {
            ...created.state,
            workflow: { phase: "executing" },
            run: {
                ...created.state.run,
                status: "running",
                exposedToolIds: ["read_file"],
                mode: "plan",
                approvedTask: { objective: "请求任务", completionCriteria: [] },
            },
        },
    };
}

function assembler() {
    return new TrajectoryModelContextAssembler({
        trajectoryStore: createInMemoryTrajectoryStore(),
        policy: createModelContextBudgetPolicy({ modelInputBudget: 100_000 }, new CharacterModelInputEstimator()),
    });
}

test("无 Adapter 与 Binding 即可获得 Decide 请求、绑定契约与 frame", async () => {
    const plan = await buildStepRequest(
        goal(),
        [READ_TOOL, WRITE_TOOL],
        renderer(),
        new DropOldestContextCompactor(),
        undefined,
        createEmptyWorkingMemory(),
        assembler(),
    );

    assert.equal(readModelMessageText(plan.request.messages[0]!), "GLOBAL\n\nPROFILE request system\n\nDECIDE");
    const runModeMessage = plan.request.messages.find(message => readModelMessageText(message).startsWith("[Dynamic section: run_mode"));
    assert.equal(runModeMessage === undefined ? undefined : readModelMessageText(runModeMessage),
        "[Dynamic section: run_mode; source: RunState.mode]\nMODE plan");
    assert.equal(plan.bundle.name, "plan_mode_approved_executing_agent_decision");
    assert.deepEqual(
        plan.toolDeclarations.map((declaration) => declaration.id).sort(),
        ["ask_user", "read_file", "system_complete_task", "system_context_lookup", "system_fail_goal", "system_find_tools", "system_start_run_stage", "system_update_goal_plan", "system_update_plan_route", "system_wait_for_input"],
    );
    assert.deepEqual(
        plan.request.tools?.map((tool) => tool.id).sort(),
        ["ask_user", "read_file", "system_complete_task", "system_context_lookup", "system_fail_goal", "system_find_tools", "system_start_run_stage", "system_update_goal_plan", "system_update_plan_route", "system_wait_for_input"],
    );
    assert.equal(plan.request.toolChoice, "required");
    assert.equal(plan.request.structuredOutput, undefined);
    assert.equal(plan.modelContextFrame.stage, "decide");
    assert.deepEqual(plan.modelContextFrame.sections.map((section) => section.sectionId), ["run_mode"]);
});

test("Think 阶段无工具与结构化输出，只携带 Think 目标", async () => {
    const plan = await buildStepRequest(
        goal(),
        [READ_TOOL],
        renderer(),
        new DropOldestContextCompactor(),
        undefined,
        createEmptyWorkingMemory(),
        assembler(),
        undefined,
        undefined,
        "think",
        { thinkGoal: "确认请求顺序" },
    );

    assert.equal(readModelMessageText(plan.request.messages[0]!), "GLOBAL\n\nPROFILE request system\n\nTHINK");
    assert.equal(plan.request.tools, undefined);
    assert.equal(plan.request.structuredOutput, undefined);
    assert.ok(plan.request.messages.some(message => readModelMessageText(message).includes("确认请求顺序")));
    assert.deepEqual(plan.toolDeclarations, []);
    assert.equal(plan.modelContextFrame.stage, "think");
});

test("prompt_only Decide 在请求内携带响应形状指导", async () => {
    const plan = await buildStepRequest(
        goal(),
        [READ_TOOL],
        renderer(),
        new DropOldestContextCompactor(),
        undefined,
        createEmptyWorkingMemory(),
        assembler(),
        undefined,
        undefined,
        "decide",
    );
    const last = JSON.parse(plan.request.messages.at(-1) === undefined ? "{}" : readModelMessageText(plan.request.messages.at(-1)!)) as {
        readonly responseShapeGuide?: string;
    };

    assert.equal(typeof last.responseShapeGuide, "string");
    assert.match(last.responseShapeGuide!, /Call exactly one declared tool/);
    assert.equal(plan.request.structuredOutput, undefined);
});

test("只有被 Runtime 暴露的工具进入请求", async () => {
    const nativeIdentity: NativeConversationIdentity = {
        provider: "google",
        endpoint: "https://generativelanguage.googleapis.com/v1beta",
        model: "test-model",
        protocol: "gemini-content",
    };
    const plan = await buildStepRequest(
        goal(),
        [READ_TOOL, WRITE_TOOL],
        renderer(),
        new DropOldestContextCompactor(),
        undefined,
        createEmptyWorkingMemory(),
        assembler(),
        undefined,
        undefined,
        "decide",
        undefined,
        nativeIdentity,
    );

    assert.equal(plan.request.tools?.some((tool) => tool.id === "write_file"), false);
    assert.equal(plan.request.tools?.some((tool) => tool.id === "read_file"), true);
});

test("必需动态输入超过模型硬预算时在调用模型前失败", async () => {
    const capabilities = createModelCapabilities({
        contextWindowTokens: 2_000,
        maxOutputTokens: 500,
        tokenEstimator: createTokenModelInputEstimator((input) => JSON.stringify(input).length),
    });

    await assert.rejects(
        buildStepRequest(
            goal(),
            [READ_TOOL],
            renderer(),
            new DropOldestContextCompactor(),
            undefined,
            createEmptyWorkingMemory(),
            assembler(),
            undefined,
            capabilities,
        ),
        ModelContextHardOverflowError,
    );
});

test("createStageMessages 生成带来源标记的临时阶段消息且不修改输入", () => {
    const messages = createStageMessages("decide", {
        allowThink: true,
        thinkHistory: [{ goal: "先分析", output: "已分析" }],
        runtimeFeedback: {
            goalId: "request-goal",
            runId: "request-run",
            executionUnitId: "unit-1",
            stepOrdinal: 1,
            stage: "decide",
            origin: "output_contract",
            code: "INVALID_LLM_RESPONSE",
            attempt: 1,
            issues: [{ code: "invalid_json", path: [], message: "Return JSON." }],
        },
    });

    assert.deepEqual(messages.map((message) => message.role), ["user", "assistant", "user"]);
    assert.match(readModelMessageText(messages[0]!), /"source":"runtime_think_request"/);
    assert.match(readModelMessageText(messages[2]!), /"source":"runtime_feedback"/);
});
