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
    ContextReadyPreparationResultSchema,
    FailAgentDecisionSchema,
    GatheringContextPreparationResultSchema,
    parsePreparationResult,
    parseAgentDecision,
    PlanningPreparationResultSchema,
    QuestionPreparationResultSchema,
    TaskProposalPreparationResultSchema,
    ToolCallActionSchema,
    ToolCallAgentDecisionSchema,
    StructuredAgentDecisionSchema,
    WaitAgentDecisionSchema,
} from "../src/response-schema";

const decisionCases: ReadonlyArray<{
    readonly content: string;
    readonly expected: AgentDecision;
}> = [
    {
        content: JSON.stringify({
            kind: "tool_call",
            checkpoint: "已定位配置文件",
            action: {
                actionId: "action-1",
                toolId: "read_file",
                input: { path: "config.json" },
            },
        }),
        expected: {
            kind: "tool_call",
            checkpoint: "已定位配置文件",
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
            checkpoint: "已完成目标",
            summary: "目标完成",
        }),
        expected: {
            kind: "complete",
            checkpoint: "已完成目标",
            summary: "目标完成",
        },
    },
    {
        content: JSON.stringify({
            kind: "wait",
            checkpoint: "已等待外部输入",
            reason: "需要用户确认",
        }),
        expected: {
            kind: "wait",
            checkpoint: "已等待外部输入",
            reason: "需要用户确认",
        },
    },
    {
        content: JSON.stringify({
            kind: "fail",
            checkpoint: "已确认无法继续",
            error: "缺少必要输入",
        }),
        expected: {
            kind: "fail",
            checkpoint: "已确认无法继续",
            error: "缺少必要输入",
        },
    },
];

test("四个合法 JSON 分支都能解析为 AgentDecision", () => {
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
    assert.equal(ToolCallAgentDecisionSchema.safeParse(decisionCases[0] === undefined
        ? {}
        : JSON.parse(decisionCases[0].content)).success, true);
    assert.equal(CompleteAgentDecisionSchema.safeParse(decisionCases[1] === undefined
        ? {}
        : JSON.parse(decisionCases[1].content)).success, true);
    assert.equal(WaitAgentDecisionSchema.safeParse(decisionCases[2] === undefined
        ? {}
        : JSON.parse(decisionCases[2].content)).success, true);
    assert.equal(FailAgentDecisionSchema.safeParse(decisionCases[3] === undefined
        ? {}
        : JSON.parse(decisionCases[3].content)).success, true);
});

test("AgentDecision 严格拒绝空字段、协议外字段和旧 continue 分支", () => {
    for (const invalid of [
        {
            kind: "tool_call",
            checkpoint: " ",
            action: {
                actionId: "action-1",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        },
        {
            kind: "tool_call",
            checkpoint: "已定位",
            action: {
                actionId: "action-1",
                toolId: "read_file",
                input: { path: "README.md" },
                result: "模型伪造结果",
            },
        },
        {
            kind: "complete",
            checkpoint: "已完成",
            summary: "完成",
            extra: true,
        },
        { kind: "continue", summary: "旧协议" },
    ]) {
        assert.equal(AgentDecisionSchema.safeParse(invalid).success, false);
    }

    assert.throws(
        () => parseAgentDecision("不是 JSON"),
        (error: unknown) => error instanceof LLMResponseProtocolError,
    );
});

function assertProtocolError(content: string): void {
    assert.throws(
        () => parseAgentDecision(content),
        (error: unknown) => {
            assert.ok(error instanceof LLMResponseProtocolError);
            assert.equal(error.code, LLM_RESPONSE_PROTOCOL_ERROR_CODE);
            assert.match(
                error.message,
                /^INVALID_LLM_RESPONSE: /,
            );
            return true;
        },
    );
}

test("非法 JSON 会转换为稳定的协议错误", () => {
    assertProtocolError("不是 JSON");
});

test("完整 JSON fenced code block 可解析为 AgentDecision", () => {
    const decision = {
        kind: "tool_call" as const,
        action: {
            actionId: "action-fenced",
            toolId: "alfworld_step",
            input: { command: "look" },
        },
    };
    const content = `\n\`\`\`JSON\n${JSON.stringify(decision, null, 2)}\n\`\`\`\n`;

    assert.deepEqual(parseAgentDecision(content, { kind: "structured", version: 1 }), decision);
});

test("JSON 解析只兼容完整 fenced 包裹，不提取任意文本中的 JSON", () => {
    const decision = JSON.stringify({
        kind: "complete",
        checkpoint: "已完成",
        summary: "完成",
    });

    assertProtocolError(`前缀\n\`\`\`json\n${decision}\n\`\`\``);
    assertProtocolError(`\`\`\`typescript\n${decision}\n\`\`\``);
});

test("未知 kind、缺失字段和错误字段类型都会被拒绝", () => {
    assertProtocolError(JSON.stringify({
        kind: "retry",
        checkpoint: "已定位",
        summary: "重试",
    }));
    assertProtocolError(JSON.stringify({ kind: "complete", checkpoint: "已完成" }));
    assertProtocolError(JSON.stringify({
        kind: "fail",
        checkpoint: "已确认失败",
        error: 42,
    }));
});

test("空白载荷和额外字段都会被拒绝", () => {
    assertProtocolError("   ");
    assertProtocolError(JSON.stringify({
        kind: "wait",
        checkpoint: "已等待",
        reason: "   ",
    }));
    assertProtocolError(JSON.stringify({
        kind: "complete",
        checkpoint: "已完成",
        summary: "继续",
        reason: "不允许的额外字段",
    }));
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
        content: JSON.stringify({ kind: "context_ready" }),
        expected: { kind: "context_ready" },
    },
    {
        phase: "planning",
        content: JSON.stringify({
            kind: "task_proposal",
            task: {
                objective: "实现持久化",
                completionCriteria: ["测试通过"],
            },
            approvalRequest: "是否批准执行？",
        }),
        expected: {
            kind: "task_proposal",
            task: {
                objective: "实现持久化",
                completionCriteria: ["测试通过"],
            },
            approvalRequest: "是否批准执行？",
        },
    },
];

test("PreparationResult 按阶段解析全部合法分支", () => {
    for (const validCase of preparationCases) {
        assert.deepEqual(
            parsePreparationResult(validCase.content, validCase.phase),
            validCase.expected,
        );
    }

    assert.equal(QuestionPreparationResultSchema.safeParse({
        kind: "question",
        question: "问题",
    }).success, true);
    assert.equal(ContextReadyPreparationResultSchema.safeParse({
        kind: "context_ready",
    }).success, true);
    assert.equal(TaskProposalPreparationResultSchema.safeParse({
        kind: "task_proposal",
        task: { objective: "任务", completionCriteria: [] },
        approvalRequest: "批准？",
    }).success, true);
});

test("Preparation Schema 严格拒绝额外字段和空白文本", () => {
    assert.equal(GatheringContextPreparationResultSchema.safeParse({
        kind: "question",
        question: "   ",
    }).success, false);
    assert.equal(PlanningPreparationResultSchema.safeParse({
        kind: "task_proposal",
        task: { objective: "任务", completionCriteria: ["   "] },
        approvalRequest: "批准？",
    }).success, false);
    assert.equal(PlanningPreparationResultSchema.safeParse({
        kind: "task_proposal",
        task: { objective: "任务", completionCriteria: [] },
        approvalRequest: "批准？",
        extra: true,
    }).success, false);
});

test("PreparationResult 与当前 phase 不匹配时返回稳定协议错误", () => {
    const mismatches = [
        {
            phase: "gathering_context" as const,
            content: JSON.stringify({
                kind: "task_proposal",
                task: { objective: "任务", completionCriteria: [] },
                approvalRequest: "批准？",
            }),
        },
        {
            phase: "planning" as const,
            content: JSON.stringify({ kind: "question", question: "问题" }),
        },
        {
            phase: "planning" as const,
            content: JSON.stringify({ kind: "context_ready" }),
        },
    ];

    for (const mismatch of mismatches) {
        assert.throws(
            () => parsePreparationResult(mismatch.content, mismatch.phase),
            (error: unknown) => {
                assert.ok(error instanceof LLMResponseProtocolError);
                assert.equal(error.code, LLM_RESPONSE_PROTOCOL_ERROR_CODE);
                assert.match(error.message, new RegExp(mismatch.phase));
                return true;
            },
        );
    }
});

test("structured@1 AgentDecision 支持 MemoryPatch 与 CompletionEvidence 且拒绝 checkpoint", () => {
    const protocol = { kind: "structured", version: 1 } as const;
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
    const content = JSON.stringify({
        kind: "complete",
        summary: "目标完成",
        completionEvidence: [{ criterionIndex: 0, evidenceSequences: [12] }],
        memoryPatch,
    });

    assert.deepEqual(parseAgentDecision(content, protocol), {
        kind: "complete",
        summary: "目标完成",
        completionEvidence: [{ criterionIndex: 0, evidenceSequences: [12] }],
        memoryPatch,
    });
    assert.equal(StructuredAgentDecisionSchema.safeParse(JSON.parse(content)).success, true);
    assertProtocolErrorForProtocol(JSON.stringify({
        kind: "wait",
        checkpoint: "不应出现",
        reason: "需要输入",
    }), protocol);
    assertProtocolErrorForProtocol(JSON.stringify({
        kind: "complete",
        summary: "完成",
        completionEvidence: [{ criterionIndex: 0, evidenceSequences: [12] }],
        extra: true,
    }), protocol);
});

function assertProtocolErrorForProtocol(
    content: string,
    protocol: { readonly kind: "structured"; readonly version: 1 },
): void {
    assert.throws(
        () => parseAgentDecision(content, protocol),
        (error: unknown) => error instanceof LLMResponseProtocolError,
    );
}

test("structured@1 PreparationResult 可在同一响应携带 MemoryPatch", () => {
    const protocol = { kind: "structured", version: 1 } as const;
    const content = JSON.stringify({
        kind: "context_ready",
        memoryPatch: {
            protocolVersion: 1,
            operations: [{
                type: "create_plan_item",
                planItem: {
                    description: "进入规划阶段",
                },
            }],
        },
    });

    assert.deepEqual(
        parsePreparationResult(content, "gathering_context", protocol),
        JSON.parse(content),
    );
    assert.throws(
        () => parsePreparationResult(
            JSON.stringify({ kind: "context_ready", checkpoint: "legacy" }),
            "gathering_context",
            protocol,
        ),
        LLMResponseProtocolError,
    );
});
