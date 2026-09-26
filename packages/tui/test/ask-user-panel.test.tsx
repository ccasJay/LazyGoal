import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { cleanup, render } from "ink-testing-library";

import type { AskUserAnswer, AskUserQuestion } from "../../contracts/src/index";
import { AskUserPanel } from "../src/ask-user-panel";

afterEach(() => {
    cleanup();
});

const sampleQuestions: readonly AskUserQuestion[] = [
    {
        id: "q-1",
        header: "Architecture Choice",
        question: "Which pattern should we use for runtime?",
        options: [
            { id: "opt-1", label: "State Machine", description: "Deterministic state transitions" },
            { id: "opt-2", label: "Actor Model", description: "Message-based concurrency" },
        ],
        multiSelect: false,
    },
    {
        id: "q-2",
        header: "Additional Features",
        question: "Select optional modules to enable:",
        options: [
            { id: "opt-a", label: "Telemetry", description: "Trace metrics" },
            { id: "opt-b", label: "Audit Log", description: "Audit trail recording" },
        ],
        multiSelect: true,
    },
];

test("AskUserPanel displays mode tag, progress, and question contents", () => {
    const { lastFrame } = render(
        <AskUserPanel
            requestId="ask-1"
            mode="plan"
            questions={sampleQuestions}
            busy={false}
            onSubmit={() => {}}
        />,
    );

    const frame = lastFrame() ?? "";
    assert.match(frame, /\[PLANNING\]/);
    assert.match(frame, /Question 1 of 2/);
    assert.match(frame, /Architecture Choice/);
    assert.match(frame, /Which pattern should we use for runtime\?/);
    assert.match(frame, /State Machine/);
    assert.match(frame, /Actor Model/);
    assert.match(frame, /Other/);
});

test("AskUserPanel handles single-select and multi-select in sequence then submits once", async () => {
    let submittedAnswers: readonly AskUserAnswer[] | undefined;

    const { lastFrame, stdin } = render(
        <AskUserPanel
            requestId="ask-seq"
            mode="execution"
            questions={sampleQuestions}
            busy={false}
            onSubmit={(answers) => {
                submittedAnswers = answers;
            }}
        />,
    );

    // 初始展示第 1 题（单选）
    assert.match(lastFrame() ?? "", /\[EXECUTION\]/);
    assert.match(lastFrame() ?? "", /Question 1 of 2/);

    // 下移选择第二个选项 (Actor Model)
    await new Promise((r) => setTimeout(r, 50));
    stdin.write("\u001B[B"); // Down arrow
    await new Promise((r) => setTimeout(r, 50));
    assert.match(lastFrame() ?? "", /> Actor Model/);

    // 回车确认第 1 题，前进到第 2 题
    stdin.write("\r");
    await new Promise((r) => setTimeout(r, 50));

    // 应该展示第 2 题（多选）
    assert.match(lastFrame() ?? "", /Question 2 of 2/);
    assert.match(lastFrame() ?? "", /Additional Features/);

    // 空格勾选第一个选项 (Telemetry)
    stdin.write(" ");
    await new Promise((r) => setTimeout(r, 50));

    // 下移到第二个选项 (Audit Log) 并空格勾选
    stdin.write("\u001B[B"); // Down arrow
    await new Promise((r) => setTimeout(r, 50));
    stdin.write(" ");
    await new Promise((r) => setTimeout(r, 50));

    // 回车提交最后一题
    stdin.write("\r");
    await new Promise((r) => setTimeout(r, 50));

    assert.ok(submittedAnswers !== undefined);
    assert.equal(submittedAnswers.length, 2);
    assert.deepEqual(submittedAnswers[0], {
        questionId: "q-1",
        optionIds: ["opt-2"],
    });
    assert.deepEqual(submittedAnswers[1], {
        questionId: "q-2",
        optionIds: ["opt-a", "opt-b"],
    });
});

test("AskUserPanel handles Other text input in single select mode", async () => {
    let submittedAnswers: readonly AskUserAnswer[] | undefined;

    const singleQuestion: readonly AskUserQuestion[] = [
        {
            id: "q-single",
            header: "Framework",
            question: "Choose a framework",
            options: [
                { id: "f-1", label: "React" },
            ],
            multiSelect: false,
        },
    ];

    const { lastFrame, stdin } = render(
        <AskUserPanel
            requestId="ask-other"
            mode="plan"
            questions={singleQuestion}
            busy={false}
            onSubmit={(answers) => {
                submittedAnswers = answers;
            }}
        />,
    );

    // 移动到 Other 选项 (索引 1)
    stdin.write("\u001B[B");
    await new Promise((r) => setTimeout(r, 20));
    // 回车进入 Other 自由输入模式
    stdin.write("\r");
    await new Promise((r) => setTimeout(r, 20));

    assert.match(lastFrame() ?? "", /Type your custom answer/);

    // 输入自定义文本并提交
    stdin.write("Vue 3");
    await new Promise((r) => setTimeout(r, 20));
    stdin.write("\r");
    await new Promise((r) => setTimeout(r, 20));

    assert.ok(submittedAnswers !== undefined);
    assert.equal(submittedAnswers.length, 1);
    assert.deepEqual(submittedAnswers[0], {
        questionId: "q-single",
        optionIds: [],
        otherText: "Vue 3",
    });
});

test("AskUserPanel rejects empty other input and preserves state", async () => {
    let submittedAnswers: readonly AskUserAnswer[] | undefined;

    const singleQuestion: readonly AskUserQuestion[] = [
        {
            id: "q-single",
            header: "Framework",
            question: "Choose a framework",
            options: [
                { id: "f-1", label: "React" },
            ],
            multiSelect: false,
        },
    ];

    const { lastFrame, stdin } = render(
        <AskUserPanel
            requestId="ask-empty"
            mode="plan"
            questions={singleQuestion}
            busy={false}
            onSubmit={(answers) => {
                submittedAnswers = answers;
            }}
        />,
    );

    // 移动到 Other 选项
    stdin.write("\u001B[B");
    await new Promise((r) => setTimeout(r, 20));
    stdin.write("\r");
    await new Promise((r) => setTimeout(r, 20));

    // 输入仅空格并回车
    stdin.write("   ");
    await new Promise((r) => setTimeout(r, 60));
    stdin.write("\r");
    await new Promise((r) => setTimeout(r, 60));

    // 校验错误提示出现且没有提交
    assert.match(lastFrame() ?? "", /Answer must not be empty/);
    assert.equal(submittedAnswers, undefined);
});
