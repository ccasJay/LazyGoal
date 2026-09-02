import assert from "node:assert/strict";
import { test } from "node:test";

import type { AgentDecision } from "../../runtime/src/domain";
import type { PreparationResult } from "../../runtime/src/preparation-executor";
import {
    LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    LLMResponseProtocolError,
} from "../src/errors";
import {
    AgentDecisionSchema,
    CompleteAgentDecisionSchema,
    ContextLookupRequestSchema,
    ContextReadyPreparationResultSchema,
    FailAgentDecisionSchema,
    GatheringContextPreparationResultSchema,
    MemoryPatchSchema,
    PlanningPreparationResultSchema,
    QuestionPreparationResultSchema,
    TaskProposalPreparationResultSchema,
    ToolCallActionSchema,
    ToolCallAgentDecisionSchema,
    WaitAgentDecisionSchema,
    parseAgentDecision,
    parsePreparationResult,
} from "../src/response-schema";

const memoryPatch = {
    protocolVersion: 1 as const,
    operations: [{
        type: "upsert_fact" as const,
        fact: {
            subject: "workspace/config.json",
            predicate: "exists",
            value: true,
            stability: "stable" as const,
            evidenceSequences: [12],
        },
    }],
};

const decisionCases: ReadonlyArray<{
    readonly content: string;
    readonly expected: AgentDecision;
}> = [
    {
        content: JSON.stringify({
            kind: "tool_call",
            action: {
                actionId: "action-1",
                toolId: "read_file",
                input: { path: "config.json" },
            },
        }),
        expected: {
            kind: "tool_call",
            action: {
                actionId: "action-1",
                toolId: "read_file",
                input: { path: "config.json" },
            },
        },
    },
    {
        content: JSON.stringify({
            kind: "complete",
            summary: "目标完成",
            completionEvidence: [],
        }),
        expected: {
            kind: "complete",
            summary: "目标完成",
            completionEvidence: [],
        },
    },
    {
        content: JSON.stringify({ kind: "wait", reason: "需要用户确认" }),
        expected: { kind: "wait", reason: "需要用户确认" },
    },
    {
        content: JSON.stringify({ kind: "fail", error: "缺少必要输入" }),
        expected: { kind: "fail", error: "缺少必要输入" },
    },
];

test("当前四个终止/Action分支都能解析为 AgentDecision", () => {
    for (const validCase of decisionCases) {
        const result = parseAgentDecision(validCase.content);

        assert.deepEqual(result, validCase.expected);
        assert.equal(AgentDecisionSchema.safeParse(result).success, true);
    }

    assert.equal(ToolCallActionSchema.safeParse({
        actionId: "action-1",
        toolId: "read_file",
        input: ["a", 1, true],
    }).success, true);
    assert.equal(ToolCallAgentDecisionSchema.safeParse(JSON.parse(decisionCases[0]!.content)).success, true);
    assert.equal(CompleteAgentDecisionSchema.safeParse(JSON.parse(decisionCases[1]!.content)).success, true);
    assert.equal(WaitAgentDecisionSchema.safeParse(JSON.parse(decisionCases[2]!.content)).success, true);
    assert.equal(FailAgentDecisionSchema.safeParse(JSON.parse(decisionCases[3]!.content)).success, true);
});

test("AgentDecision 严格拒绝 checkpoint、协议外字段和未知分支", () => {
    for (const invalid of [
        {
            kind: "tool_call",
            checkpoint: "旧字段",
            action: { actionId: "action-1", toolId: "read_file", input: {} },
        },
        {
            kind: "complete",
            summary: "完成",
            completionEvidence: [],
            extra: true,
        },
        { kind: "continue", summary: "旧协议" },
    ]) {
        assert.equal(AgentDecisionSchema.safeParse(invalid).success, false);
    }

    assert.equal(AgentDecisionSchema.safeParse({
        kind: "context_checkpoint",
        memoryPatch,
    }).success, true);
    assert.equal(AgentDecisionSchema.safeParse({
        kind: "context_lookup",
        need: "historical_execution",
        question: "之前执行了什么？",
    }).success, true);
});

function assertProtocolError(content: string): void {
    assert.throws(
        () => parseAgentDecision(content),
        (error: unknown) => {
            assert.ok(error instanceof LLMResponseProtocolError);
            assert.equal(error.code, LLM_RESPONSE_PROTOCOL_ERROR_CODE);
            return true;
        },
    );
}

test("非法 JSON、空字段和不完整完成证据都会转换为稳定协议错误", () => {
    for (const content of [
        "不是 JSON",
        "   ",
        JSON.stringify({ kind: "wait", reason: " " }),
        JSON.stringify({ kind: "complete", summary: "完成" }),
        JSON.stringify({ kind: "complete", summary: "完成", completionEvidence: [], checkpoint: "旧字段" }),
    ]) {
        assertProtocolError(content);
    }
});

test("完整 JSON fenced code block 可解析，任意文本包裹会被拒绝", () => {
    const decision = {
        kind: "tool_call" as const,
        action: {
            actionId: "action-fenced",
            toolId: "alfworld_step",
            input: { command: "look" },
        },
    };
    const content = `\n\`\`\`JSON\n${JSON.stringify(decision, null, 2)}\n\`\`\`\n`;

    assert.deepEqual(parseAgentDecision(content), decision);
    assertProtocolError(`前缀\n\`\`\`json\n${JSON.stringify(decision)}\n\`\`\``);
});

const preparationCases: ReadonlyArray<{
    readonly phase: "gathering_context" | "planning";
    readonly content: string;
    readonly expected: PreparationResult;
}> = [
    {
        phase: "gathering_context",
        content: JSON.stringify({ kind: "question", question: "使用哪个数据库？" }),
        expected: { kind: "question", question: "使用哪个数据库？" },
    },
    {
        phase: "gathering_context",
        content: JSON.stringify({ kind: "context_ready", memoryPatch }),
        expected: { kind: "context_ready", memoryPatch },
    },
    {
        phase: "planning",
        content: JSON.stringify({
            kind: "task_proposal",
            task: { objective: "实现持久化", completionCriteria: ["测试通过"] },
            approvalRequest: "是否批准执行？",
        }),
        expected: {
            kind: "task_proposal",
            task: { objective: "实现持久化", completionCriteria: ["测试通过"] },
            approvalRequest: "是否批准执行？",
        },
    },
];

test("PreparationResult 按阶段解析当前合法分支", () => {
    for (const validCase of preparationCases) {
        assert.deepEqual(parsePreparationResult(validCase.content, validCase.phase), validCase.expected);
    }

    assert.equal(QuestionPreparationResultSchema.safeParse({
        kind: "question", question: "问题",
    }).success, true);
    assert.equal(ContextReadyPreparationResultSchema.safeParse({ kind: "context_ready" }).success, true);
    assert.equal(TaskProposalPreparationResultSchema.safeParse({
        kind: "task_proposal",
        task: { objective: "任务", completionCriteria: [] },
        approvalRequest: "批准？",
    }).success, true);
    assert.equal(ContextLookupRequestSchema.safeParse({
        kind: "context_lookup",
        need: "conversation_history",
        question: "之前用户说了什么？",
    }).success, true);
});

test("Preparation Schema 严格拒绝错误阶段、额外字段和空白文本", () => {
    assert.equal(GatheringContextPreparationResultSchema.safeParse({
        kind: "question", question: "   ",
    }).success, false);
    assert.equal(PlanningPreparationResultSchema.safeParse({
        kind: "task_proposal",
        task: { objective: "任务", completionCriteria: ["   "] },
        approvalRequest: "批准？",
    }).success, false);
    assert.equal(PlanningPreparationResultSchema.safeParse({
        kind: "context_ready",
    }).success, false);
    assert.equal(PlanningPreparationResultSchema.safeParse({
        kind: "task_proposal",
        task: { objective: "任务", completionCriteria: [] },
        approvalRequest: "批准？",
        extra: true,
    }).success, false);
});

test("structured MemoryPatch 与 CompletionEvidence 使用当前 v1 Schema", () => {
    const content = JSON.stringify({
        kind: "complete",
        summary: "目标完成",
        completionEvidence: [{ criterionIndex: 0, evidenceSequences: [12] }],
        memoryPatch,
    });

    assert.deepEqual(parseAgentDecision(content), JSON.parse(content));
    assert.equal(MemoryPatchSchema.safeParse(memoryPatch).success, true);
    assert.equal(AgentDecisionSchema.safeParse(JSON.parse(content)).success, true);
});
