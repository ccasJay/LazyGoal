import assert from "node:assert/strict";
import { test } from "node:test";

import type { StepResult } from "../../runtime/src/domain";
import type { PreparationResult } from "../../runtime/src/preparation-executor";
import {
    LLM_RESPONSE_PROTOCOL_ERROR_CODE,
    LLMResponseProtocolError,
} from "../src/errors";
import {
    CompleteStepResultSchema,
    ContextReadyPreparationResultSchema,
    ContinueStepResultSchema,
    FailStepResultSchema,
    GatheringContextPreparationResultSchema,
    parsePreparationResult,
    parseStepResult,
    PlanningPreparationResultSchema,
    QuestionPreparationResultSchema,
    StepResultSchema,
    TaskProposalPreparationResultSchema,
    WaitStepResultSchema,
} from "../src/response-schema";

const validCases: ReadonlyArray<{
    readonly content: string;
    readonly expected: StepResult;
}> = [
    {
        content: JSON.stringify({ kind: "continue", summary: "继续执行" }),
        expected: { kind: "continue", summary: "继续执行" },
    },
    {
        content: JSON.stringify({ kind: "wait", reason: "等待外部事件" }),
        expected: { kind: "wait", reason: "等待外部事件" },
    },
    {
        content: JSON.stringify({ kind: "complete", summary: "目标已完成" }),
        expected: { kind: "complete", summary: "目标已完成" },
    },
    {
        content: JSON.stringify({ kind: "fail", error: "执行失败" }),
        expected: { kind: "fail", error: "执行失败" },
    },
];

test("四个合法 JSON 分支都能解析为 Runtime StepResult", () => {
    for (const validCase of validCases) {
        const result = parseStepResult(validCase.content);

        assert.deepEqual(result, validCase.expected);
        assert.equal(StepResultSchema.safeParse(result).success, true);
    }
});

test("四个分支均为严格对象并只接受对应字段", () => {
    assert.equal(
        ContinueStepResultSchema.safeParse({
            kind: "continue",
            summary: "继续",
        }).success,
        true,
    );
    assert.equal(
        WaitStepResultSchema.safeParse({
            kind: "wait",
            reason: "等待",
        }).success,
        true,
    );
    assert.equal(
        CompleteStepResultSchema.safeParse({
            kind: "complete",
            summary: "完成",
        }).success,
        true,
    );
    assert.equal(
        FailStepResultSchema.safeParse({
            kind: "fail",
            error: "失败",
        }).success,
        true,
    );

    assert.equal(
        StepResultSchema.safeParse({
            kind: "continue",
            summary: "继续",
            reason: "不属于 continue",
        }).success,
        false,
    );
});

function assertProtocolError(content: string): void {
    assert.throws(
        () => parseStepResult(content),
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

test("未知 kind、缺失字段和错误字段类型都会被拒绝", () => {
    assertProtocolError(JSON.stringify({ kind: "retry", summary: "重试" }));
    assertProtocolError(JSON.stringify({ kind: "continue" }));
    assertProtocolError(JSON.stringify({ kind: "continue", summary: 42 }));
});

test("空白载荷和额外字段都会被拒绝", () => {
    assertProtocolError("   ");
    assertProtocolError(JSON.stringify({ kind: "continue", summary: "   " }));
    assertProtocolError(JSON.stringify({
        kind: "continue",
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
