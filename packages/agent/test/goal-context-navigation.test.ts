import assert from "node:assert/strict";
import { test } from "node:test";

import { contract } from "../../contracts/src/index";
import { createGoal } from "../../runtime/src/domain";
import type { Goal, RunStageState } from "../../runtime/src/domain";
import type { ToolDefinition } from "../../tool-core/src/index";
import { createEmptyWorkingMemory } from "../../working-memory/src/index";
import {
    CharacterModelInputEstimator,
    createModelCapabilities,
    createModelContextBudgetPolicy,
    createTokenModelInputEstimator,
    DropOldestContextCompactor,
    ModelContextHardOverflowError,
    ModelInferenceProjector,
    TrajectoryModelContextAssembler,
} from "../src/index";
import { buildStepRequest } from "../src/prompt";
import { createDefaultPromptBundleRenderer } from "../src/prompting/default-bundles";
import {
    createDefaultDynamicSectionRegistry,
    type DynamicSectionMessage,
} from "../src/prompting/dynamic-section-registry";
import { currentProtocols, createInMemoryTrajectoryStore, createCurrentContextAssembler } from "./current-fixtures";
import {
    buildGoalContextNavigation,
    type GoalContextNavigationBuildOptions,
} from "../src/goal-context-navigation";

const renderer = await createDefaultPromptBundleRenderer();
const compactor = new DropOldestContextCompactor();
const sampleProfile = {
    id: "nav-test-profile",
    systemPrompt: "Navigation Test System",
    instructions: ["Follow user instructions"],
    toolIds: ["sample_tool"],
};
const sampleTool: ToolDefinition = {
    id: "sample_tool",
    description: "Sample tool for testing",
    inputContract: contract.object({ key: contract.string() }),
    isReadOnly: true,
};

function createRunningGoal(options: {
    currentStage?: RunStageState;
    messages?: readonly { readonly role: "user"; readonly content: string }[];
} = {}): Goal {
    const base = createGoal({
        ...currentProtocols,
        id: "goal-nav-1",
        runId: "run-nav-1",
        promptBundleVersion: 1,
        intent: "测试目标工作导航能力",
        profile: sampleProfile,
        maxSteps: 50,
        messages: options.messages ?? [
            { role: "user", content: "请实现用户配置存储并保留向后兼容" },
        ],
    });
    return {
        ...base,
        state: {
            ...base.state,
            workflow: { phase: "executing" },
            run: {
                ...base.state.run,
                status: "running",
                mode: "normal",
                committedThroughSequence: 10,
                ...(options.currentStage !== undefined ? { currentStage: options.currentStage } : {}),
            },
        },
    };
}

test("TODO 5.1: 默认注册表中包含稳定身份 goal_context_navigation 动态 Section", () => {
    const registry = createDefaultDynamicSectionRegistry();
    const identities = registry.identities();
    const navIdentity = identities.find((item) => item.sectionId === "goal_context_navigation");

    assert.ok(navIdentity, "必须包含 goal_context_navigation 动态 Section");
    assert.equal(navIdentity.role, "user");
    assert.equal(navIdentity.templateId, "goal-context-navigation@1");
    assert.equal(navIdentity.source, "GoalContextNavigation");
    assert.ok(navIdentity.order > 0);
});

test("TODO 5.1: 没有历史阶段和重要信息时不制造历史占位事实", () => {
    const goal = createRunningGoal();
    const view = new ModelInferenceProjector().project(
        goal,
        [sampleTool],
        createEmptyWorkingMemory(),
        undefined,
        undefined,
        "decide",
    );
    const sections = renderer.renderDynamicSections(view);
    const navSection = sections.find((s) => s.sectionId === "goal_context_navigation");

    // 没有当前阶段、没有历史阶段、也没有重要信息时，section 应被省略，不制造虚假事实
    assert.equal(navSection, undefined, "无阶段事实时不应生成 goal_context_navigation");
});

test("TODO 5.1: 阶段切换、新 Run 与恢复时提供最新导航（包含当前阶段、缺口与前序结果引用）", async () => {
    const currentStage: RunStageState = {
        stageId: "stage-1",
        revision: 2,
        status: "executing",
        target: "实现配置迁移工具",
        acceptanceCriteria: ["支持 v1 到 v2 迁移", "通过回归测试"],
        latestReviewRejection: {
            feedback: "缺少对非法 JSON 配置的处理缺口",
            rejectedAtSequence: 8,
        },
        previousStageResultRef: {
            stageId: "stage-0",
            sequence: 5,
        },
    };

    const goal = createRunningGoal({ currentStage });
    const view = new ModelInferenceProjector().project(
        goal,
        [sampleTool],
        createEmptyWorkingMemory(),
        undefined,
        undefined,
        "decide",
    );

    const sections = renderer.renderDynamicSections(view);
    const navSection = sections.find((s) => s.sectionId === "goal_context_navigation");

    assert.ok(navSection, "有当前阶段时应生成 goal_context_navigation");
    assert.match(navSection.content, /stage-1/);
    assert.match(navSection.content, /rev 2/);
    assert.match(navSection.content, /实现配置迁移工具/);
    assert.match(navSection.content, /缺少对非法 JSON 配置的处理缺口/);
    assert.match(navSection.content, /stage-0/);
});

test("TODO 5.2: 保留原始用户意图、有效 Profile、当前 Run 已应用用户输入与阶段缺口，不因导航失效", async () => {
    const currentStage: RunStageState = {
        stageId: "stage-2",
        revision: 1,
        status: "executing",
        target: "验证与提交",
        acceptanceCriteria: ["全量测试通过"],
        latestReviewRejection: {
            feedback: "测试覆盖率未达标",
        },
    };

    const goal = createRunningGoal({
        currentStage,
        messages: [
            { role: "user", content: "绝对必须保留 API 字段名称为 configPath" },
        ],
    });

    const plan = await buildStepRequest(
        goal,
        [sampleTool],
        renderer,
        compactor,
        undefined,
        createEmptyWorkingMemory(),
        createCurrentContextAssembler(),
    );

    const fullMessages = plan.request.messages;
    const hasOriginalUserIntent = fullMessages.some((msg) =>
        msg.content.includes("绝对必须保留 API 字段名称为 configPath"),
    );
    assert.ok(hasOriginalUserIntent, "必须直接保留用户原始消息");

    const hasStageGap = fullMessages.some((msg) =>
        msg.content.includes("测试覆盖率未达标"),
    );
    assert.ok(hasStageGap, "必须保留当前阶段审查缺口");
});

test("TODO 5.3: 长目录按相关性与稳定身份裁剪历史项，保留必要当前工作入口与继续查询指引", () => {
    const currentStage: RunStageState = {
        stageId: "stage-current",
        revision: 1,
        status: "executing",
        target: "重构网络层",
        acceptanceCriteria: ["重构完成"],
    };

    // 构造大量历史阶段和 notes
    const historicalStages = Array.from({ length: 15 }, (_, i) => ({
        stageId: `hist-stage-${i}`,
        runId: "run-0",
        revision: 1,
        target: `历史目标 ${i}: ${i % 2 === 0 ? "网络与重构" : "UI样式"}`,
        status: "accepted" as const,
        summary: `完成历史目标 ${i}`,
        sourceRef: `src-stage-${i}`,
    }));

    const notes = Array.from({ length: 15 }, (_, i) => ({
        noteId: `note-${i}`,
        category: "decision" as const,
        content: `历史决定 ${i}: 采用协议版本 ${i}`,
        sourceRef: `src-note-${i}`,
    }));

    const nav = buildGoalContextNavigation({
        currentStage,
        historicalStages,
        notes,
        currentRequestText: "网络层重构",
        budget: {
            maxHistoricalEntries: 4,
        },
    });

    assert.ok(nav, "导航对象应生成");
    assert.ok(nav.currentStage, "当前阶段必须保留");
    assert.equal(nav.currentStage.stageId, "stage-current");
    assert.ok(nav.hasMore, "历史项超出限制时应标记 hasMore");
    assert.ok((nav.omittedCount ?? 0) > 0, "应记录省略的历史项数量");
    assert.ok((nav.historicalStages?.length ?? 0) <= 4, "历史阶段数量受预算限制");
});

test("TODO 5.3: 必要固定内容超预算时在调用前抛出 ModelContextHardOverflowError", async () => {
    const currentStage: RunStageState = {
        stageId: "stage-overflow",
        revision: 1,
        status: "executing",
        target: "目标".repeat(500),
        acceptanceCriteria: ["标准".repeat(500)],
    };

    const goal = createRunningGoal({ currentStage });
    const tinyEstimator = createTokenModelInputEstimator((input) =>
        new CharacterModelInputEstimator().estimate(input),
    );
    const capabilities = createModelCapabilities({
        contextWindowTokens: 500,
        maxOutputTokens: 200,
        tokenEstimator: tinyEstimator,
    });

    await assert.rejects(
        buildStepRequest(
            goal,
            [sampleTool],
            renderer,
            compactor,
            undefined,
            createEmptyWorkingMemory(),
            createCurrentContextAssembler(),
            undefined,
            capabilities,
        ),
        ModelContextHardOverflowError,
    );
});

test("TODO 5.4: 去重保护 - 当重要信息引用已应用用户消息时，导航只暴露引用标识与简要片段而不重复全文", () => {
    const currentStage: RunStageState = {
        stageId: "stage-dedup",
        revision: 1,
        status: "executing",
        target: "去重验证",
        acceptanceCriteria: ["测试通过"],
    };

    const longMessageContent = "这是一段非常长且详细的用户配置需求说明，包含具体的各种字段定义与限制要求。".repeat(10);
    const messages = [
        { role: "user" as const, content: longMessageContent, sourceMessageIndex: 0 },
    ];

    const notes = [
        {
            noteId: "note-dedup-1",
            category: "user_emphasis" as const,
            content: "这是一段非常长且详细的用户配置需求说明",
            sourceRef: "msg_user_0",
            sourceMessageContent: longMessageContent,
        },
    ];

    const nav = buildGoalContextNavigation({
        currentStage,
        notes,
        currentMessages: messages,
    });

    assert.ok(nav);
    const noteEntry = nav.notes?.find((n) => n.noteId === "note-dedup-1");
    assert.ok(noteEntry);
    assert.equal(noteEntry.sourceRef, "msg_user_0");
    // 导航中的内容不应包含重复的巨大长正文
    assert.ok(noteEntry.content.length < longMessageContent.length);
});

test("TODO 5.4 & 6.4: runtime_feedback 仍在末尾，历史数据不升级为系统指令", async () => {
    const currentStage: RunStageState = {
        stageId: "stage-feedback",
        revision: 1,
        status: "executing",
        target: "反馈排序验证",
        acceptanceCriteria: ["测试通过"],
    };

    const goal = createRunningGoal({ currentStage });
    const plan = await buildStepRequest(
        goal,
        [sampleTool],
        renderer,
        compactor,
        undefined,
        createEmptyWorkingMemory(),
        createCurrentContextAssembler(),
        undefined,
        undefined,
        "strict",
        "decide",
        {
            runtimeFeedback: {
                goalId: goal.id,
                runId: goal.state.run.id,
                executionUnitId: "unit-1",
                stepOrdinal: 1,
                stage: "decide",
                origin: "tool_input",
                code: "INVALID_PARAM",
                attempt: 1,
                issues: [{ code: "INVALID_PARAM", path: ["value"], message: "参数非法" }],
            },
        },
    );

    const messages = plan.request.messages;
    const lastMessage = messages[messages.length - 1];
    assert.ok(lastMessage);
    assert.match(lastMessage.content, /"source":"runtime_feedback"/, "runtime_feedback 必须位于请求末尾");
});

test("跨 Run 同名阶段不被误判为当前阶段而隐藏", () => {
    const currentStage: RunStageState = {
        stageId: "stage-1",
        revision: 1,
        status: "executing",
        target: "当前 Run 的阶段 1",
        acceptanceCriteria: ["测试"],
    };

    const historicalStages = [
        {
            stageId: "stage-1",
            runId: "run-historical",
            revision: 1,
            status: "executing",
            target: "旧 Run 的阶段 1",
            summary: "已完成旧阶段",
        },
    ];

    const nav = buildGoalContextNavigation({
        currentStage,
        currentRunId: "run-current",
        historicalStages,
        currentRequestText: "继续任务",
    });

    assert.ok(nav !== undefined);
    assert.equal(nav.currentStage?.stageId, "stage-1");
    assert.ok(nav.historicalStages !== undefined && nav.historicalStages.length === 1, "旧 Run 的同名 stage-1 必须保留在历史中");
    assert.equal(nav.historicalStages[0]?.runId, "run-historical");
});
