import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { cleanup, render } from "ink-testing-library";

import {
    InspectorScreen,
    sliceTrajectorySteps,
    type UiInspectorStep,
    type UiInspectorViewModel,
} from "../src/index";
import type { GoalMessage } from "../../runtime/src/index";

afterEach(() => {
    cleanup();
});

async function nextFrame(): Promise<void> {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
    });
}

test("sliceTrajectorySteps handles empty messages gracefully", () => {
    const steps = sliceTrajectorySteps({
        goalId: "goal-empty",
        messages: [],
    });

    assert.equal(steps.length, 1);
    assert.equal(steps[0]?.index, 0);
    assert.equal(steps[0]?.totalSteps, 1);
    assert.deepEqual(steps[0]?.messages, []);
    assert.match(steps[0]?.rawJson ?? "", /goal-empty/);
});

test("sliceTrajectorySteps slices messages by assistant turn and extracts thought tags", () => {
    const messages: GoalMessage[] = [
        { role: "user", content: "Please check workspace status" },
        {
            role: "assistant",
            assistant: { profileId: "worker" },
            content: "<thought>Inspecting directory</thought>I am reading the files.",
        },
        { role: "user", content: "Tool output: file.txt exists" },
        {
            role: "assistant",
            assistant: { profileId: "worker" },
            content: "<reasoning>Task is finished</reasoning>Done!",
        },
    ];

    const steps = sliceTrajectorySteps({
        goalId: "goal-normal",
        messages,
    });

    assert.equal(steps.length, 2);

    // Step 0: User input + First assistant turn + tool observation
    assert.equal(steps[0]?.index, 0);
    assert.equal(steps[0]?.totalSteps, 2);
    assert.equal(steps[0]?.reasoning, "Inspecting directory");
    assert.equal(steps[0]?.messages.length, 3);

    // Step 1: Second assistant turn
    assert.equal(steps[1]?.index, 1);
    assert.equal(steps[1]?.totalSteps, 2);
    assert.equal(steps[1]?.reasoning, "Task is finished");
    assert.equal(steps[1]?.messages.length, 1);
});

test("InspectorScreen renders step header, navigation controls, and message content", () => {
    const steps: UiInspectorStep[] = [
        {
            index: 0,
            totalSteps: 2,
            messages: [
                { role: "user", content: "Find bugs" },
                {
                    role: "assistant",
                    assistant: { profileId: "reviewer" },
                    content: "I found zero bugs.",
                },
            ],
            rawJson: '{"step": 0}',
        },
        {
            index: 1,
            totalSteps: 2,
            messages: [
                {
                    role: "assistant",
                    assistant: { profileId: "reviewer" },
                    content: "Completed audit.",
                },
            ],
            rawJson: '{"step": 1}',
        },
    ];

    const viewModel: UiInspectorViewModel = {
        screen: "inspector",
        busy: false,
        goalId: "goal-test-1",
        currentStepIndex: 0,
        totalSteps: 2,
        steps,
        showReasoning: false,
    };

    const instance = render(
        <InspectorScreen
            inspector={viewModel}
            onInspectStep={() => undefined}
            onToggleReasoning={() => undefined}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    assert.match(frame, /Goal Inspector: goal-test-1/);
    assert.match(frame, /Step 1 \/ 2/);
    assert.match(frame, /\[h\/l\] Prev\/Next/);
    assert.match(frame, /\[User\]/);
    assert.match(frame, /Find bugs/);
    assert.match(frame, /\[Assistant \(reviewer\)\]/);
    assert.match(frame, /I found zero bugs\./);
});

test("InspectorScreen supports navigation keys: l, h, 0, $", async () => {
    const steps: UiInspectorStep[] = [
        { index: 0, totalSteps: 3, messages: [], rawJson: "{}" },
        { index: 1, totalSteps: 3, messages: [], rawJson: "{}" },
        { index: 2, totalSteps: 3, messages: [], rawJson: "{}" },
    ];

    const inspected: number[] = [];

    const viewModel: UiInspectorViewModel = {
        screen: "inspector",
        busy: false,
        goalId: "goal-nav",
        currentStepIndex: 1,
        totalSteps: 3,
        steps,
        showReasoning: false,
    };

    const instance = render(
        <InspectorScreen
            inspector={viewModel}
            onInspectStep={(step) => inspected.push(step)}
            onToggleReasoning={() => undefined}
        />,
    );

    // 按 l 键切换到下一步（2）
    instance.stdin.write("l");
    await nextFrame();
    assert.equal(inspected[inspected.length - 1], 2);

    // 按 h 键切换到上一步（0）
    instance.stdin.write("h");
    await nextFrame();
    assert.equal(inspected[inspected.length - 1], 0);

    // 按 0 键切换到第 0 步
    instance.stdin.write("0");
    await nextFrame();
    assert.equal(inspected[inspected.length - 1], 0);

    // 按 $ 键切换到最后一步（2）
    instance.stdin.write("$");
    await nextFrame();
    assert.equal(inspected[inspected.length - 1], 2);
});

test("InspectorScreen supports j and k for vertical scrolling", async () => {
    const steps: UiInspectorStep[] = [
        {
            index: 0,
            totalSteps: 1,
            messages: [
                { role: "user", content: "Line 1\nLine 2\nLine 3\nLine 4\nLine 5" },
            ],
            rawJson: "{}",
        },
    ];

    const viewModel: UiInspectorViewModel = {
        screen: "inspector",
        busy: false,
        goalId: "goal-scroll",
        currentStepIndex: 0,
        totalSteps: 1,
        steps,
        showReasoning: false,
    };

    const instance = render(
        <InspectorScreen
            inspector={viewModel}
            onInspectStep={() => undefined}
            onToggleReasoning={() => undefined}
        />,
    );

    // 默认未滚动
    assert.doesNotMatch(instance.lastFrame() ?? "", /Scrolled down/);

    // 按 j 键向下滚动一行
    instance.stdin.write("j");
    await nextFrame();
    assert.match(instance.lastFrame() ?? "", /Scrolled down 1 lines/);

    // 再次按 j 键向下滚动两行
    instance.stdin.write("j");
    await nextFrame();
    assert.match(instance.lastFrame() ?? "", /Scrolled down 2 lines/);

    // 按 k 键向上回滚
    instance.stdin.write("k");
    await nextFrame();
    assert.match(instance.lastFrame() ?? "", /Scrolled down 1 lines/);
});

test("InspectorScreen displays folded and expanded reasoning with 'r' key", async () => {
    const steps: UiInspectorStep[] = [
        {
            index: 0,
            totalSteps: 1,
            reasoning: "Detailed internal thoughts",
            messages: [],
            rawJson: "{}",
        },
    ];

    let toggleCalled = 0;

    // 折叠状态
    const foldedModel: UiInspectorViewModel = {
        screen: "inspector",
        busy: false,
        goalId: "goal-cot",
        currentStepIndex: 0,
        totalSteps: 1,
        steps,
        showReasoning: false,
    };

    const foldedInstance = render(
        <InspectorScreen
            inspector={foldedModel}
            onInspectStep={() => undefined}
            onToggleReasoning={() => {
                toggleCalled += 1;
            }}
        />,
    );

    assert.match(foldedInstance.lastFrame() ?? "", /Reasoning folded/);
    assert.doesNotMatch(foldedInstance.lastFrame() ?? "", /Detailed internal thoughts/);

    foldedInstance.stdin.write("r");
    await nextFrame();
    assert.equal(toggleCalled, 1);

    // 展开状态
    const expandedModel: UiInspectorViewModel = {
        ...foldedModel,
        showReasoning: true,
    };

    const expandedInstance = render(
        <InspectorScreen
            inspector={expandedModel}
            onInspectStep={() => undefined}
            onToggleReasoning={() => undefined}
        />,
    );

    assert.match(expandedInstance.lastFrame() ?? "", /Reasoning \/ CoT/);
    assert.match(expandedInstance.lastFrame() ?? "", /Detailed internal thoughts/);
});

test("InspectorScreen triggers onExternalView with rawJson on 'e' key", async () => {
    const steps: UiInspectorStep[] = [
        {
            index: 0,
            totalSteps: 1,
            messages: [],
            rawJson: '{"custom": "json_data"}',
        },
    ];

    let viewedJson = "";

    const viewModel: UiInspectorViewModel = {
        screen: "inspector",
        busy: false,
        goalId: "goal-ext",
        currentStepIndex: 0,
        totalSteps: 1,
        steps,
        showReasoning: false,
    };

    const instance = render(
        <InspectorScreen
            inspector={viewModel}
            onInspectStep={() => undefined}
            onToggleReasoning={() => undefined}
            onExternalView={(json) => {
                viewedJson = json;
            }}
        />,
    );

    instance.stdin.write("e");
    await nextFrame();
    assert.equal(viewedJson, '{"custom": "json_data"}');
});

test("InspectorScreen triggers onExit on 'q' key", async () => {
    const steps: UiInspectorStep[] = [
        { index: 0, totalSteps: 1, messages: [], rawJson: "{}" },
    ];

    let exited = false;

    const viewModel: UiInspectorViewModel = {
        screen: "inspector",
        busy: false,
        goalId: "goal-exit",
        currentStepIndex: 0,
        totalSteps: 1,
        steps,
        showReasoning: false,
    };

    const instance = render(
        <InspectorScreen
            inspector={viewModel}
            onInspectStep={() => undefined}
            onToggleReasoning={() => undefined}
            onExit={() => {
                exited = true;
            }}
        />,
    );

    instance.stdin.write("q");
    await nextFrame();
    assert.equal(exited, true);
});
