import assert from "node:assert/strict";
import { test } from "node:test";

import type { StepResult } from "../../runtime/src/domain";
import {
    CompleteStepResultSchema,
    ContinueStepResultSchema,
    FailStepResultSchema,
    parseStepResult,
    StepResultSchema,
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
