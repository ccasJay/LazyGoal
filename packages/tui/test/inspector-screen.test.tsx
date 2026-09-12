import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";
import { afterEach, test } from "node:test";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    assert.equal(steps[0]?.messages?.length, 3);

    // Step 1: Second assistant turn
    assert.equal(steps[1]?.index, 1);
    assert.equal(steps[1]?.totalSteps, 2);
    assert.equal(steps[1]?.reasoning, "Task is finished");
    assert.equal(steps[1]?.messages?.length, 1);
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

    const frame = stripVTControlCharacters(instance.lastFrame() ?? "");
    assert.match(frame, /Goal Inspector/);
    assert.match(frame, /goal-test-1/);
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

test("InspectorScreen processes a burst of navigation keys independently", async () => {
    const steps: UiInspectorStep[] = [
        { index: 0, totalSteps: 3, messages: [], rawJson: "{}" },
        { index: 1, totalSteps: 3, messages: [], rawJson: "{}" },
        { index: 2, totalSteps: 3, messages: [], rawJson: "{}" },
    ];

    const inspected: number[] = [];
    const viewModel: UiInspectorViewModel = {
        screen: "inspector",
        busy: false,
        goalId: "goal-burst",
        currentStepIndex: 0,
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

    instance.stdin.write("ll");
    await nextFrame();
    assert.deepEqual(inspected, [1, 2]);
});

test("InspectorScreen supports j and k for vertical scrolling", async () => {
    const steps: UiInspectorStep[] = [
        {
            index: 0,
            totalSteps: 1,
            messages: [
                { role: "user", content: Array.from({ length: 60 }, (_, index) => "Line " + (index + 1)).join("\n") },
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
    assert.match(instance.lastFrame() ?? "", /Lines 1-17 \/ 61  Top/);

    // 按 j 键向下滚动一行
    instance.stdin.write("j");
    await nextFrame();
    assert.match(instance.lastFrame() ?? "", /Lines 2-18 \/ 61/);
    assert.doesNotMatch(instance.lastFrame() ?? "", /\[User\]/);

    // 再次按 j 键向下滚动两行
    instance.stdin.write("j");
    await nextFrame();
    assert.match(instance.lastFrame() ?? "", /Lines 3-19 \/ 61/);

    // 按 k 键向上回滚
    instance.stdin.write("k");
    await nextFrame();
    assert.match(instance.lastFrame() ?? "", /Lines 2-18 \/ 61/);
    instance.stdin.write("\u001b[6~");
    await nextFrame();
    assert.match(instance.lastFrame() ?? "", /Lines 19-35 \/ 61/);
    instance.stdin.write("\u001b[5~");
    await nextFrame();
    assert.match(instance.lastFrame() ?? "", /Lines 2-18 \/ 61/);
    instance.stdin.write("G" + "j".repeat(100));
    await nextFrame();
    assert.match(instance.lastFrame() ?? "", /Line 60/);
    assert.match(instance.lastFrame() ?? "", /Lines 45-61 \/ 61  Bottom/);
    assert.equal(instance.lastFrame()?.split("\n").length, 23);
    instance.stdin.write("g" + "k".repeat(100));
    await nextFrame();
    assert.match(instance.lastFrame() ?? "", /Lines 1-17 \/ 61  Top/);
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

    assert.match(foldedInstance.lastFrame() ?? "", /r Expand/);
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

    assert.match(expandedInstance.lastFrame() ?? "", /Reasoning/);
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

test("InspectorScreen clamps short content and keeps controls visible after resizing", async () => {
    const model: UiInspectorViewModel = {
        screen: "inspector", busy: false, goalId: "goal-viewport",
        currentStepIndex: 0, totalSteps: 1, showReasoning: false,
        steps: [{ index: 0, totalSteps: 1, rawJson: "{}",
            messages: [{ role: "user", content: "Short content" }] }],
    };
    const screen = (view: UiInspectorViewModel) => <InspectorScreen inspector={view}
        onInspectStep={() => undefined} onToggleReasoning={() => undefined}
        onBack={() => undefined} />;
    const instance = render(screen(model));
    instance.stdin.write("j".repeat(100));
    await nextFrame();
    assert.match(instance.lastFrame() ?? "", /Short content/);
    assert.match(instance.lastFrame() ?? "", /Lines 1-2 \/ 2  All/);

    Object.defineProperty(instance.stdout, "columns", { value: 48, configurable: true });
    Object.defineProperty(instance.stdout, "rows", { value: 18, configurable: true });
    instance.stdout.emit("resize");
    const longContent = "界面".repeat(90) + " LAST-CONTENT";
    instance.rerender(screen({ ...model, steps: [{ ...model.steps[0]!,
        messages: [{ role: "user", content: longContent }] }] }));
    await nextFrame();
    let frame = stripVTControlCharacters(instance.lastFrame() ?? "");
    assert.equal(frame.split("\n").length, 17);
    assert.match(frame, /Goal Inspector/);
    assert.match(frame, /Step 1 \/ 1/);
    assert.match(frame, /\[Esc\] History.*\[q\] Exit/);
    assert.match(frame, /\[PgUp\/PgDn\] Page/);
    instance.stdin.write("G");
    await nextFrame();
    assert.match(instance.lastFrame() ?? "", /LAST-CONTENT/);

    Object.defineProperty(instance.stdout, "rows", { value: 30, configurable: true });
    instance.stdout.emit("resize");
    await nextFrame();
    frame = stripVTControlCharacters(instance.lastFrame() ?? "");
    assert.match(frame, /Lines 1-.*All/);
    assert.match(frame, /LAST-CONTENT/);
    assert.equal(frame.split("\n").length, 29);
});

test("InspectorScreen separates back, exit and external-view errors", async () => {
    const model: UiInspectorViewModel = {
        screen: "inspector", busy: false, goalId: "goal-back",
        currentStepIndex: 0, totalSteps: 1, showReasoning: false,
        steps: [{ index: 0, totalSteps: 1, rawJson: "{}", messages: [] }],
    };
    const actions: string[] = [];
    const instance = render(<InspectorScreen inspector={model}
        onInspectStep={() => undefined} onToggleReasoning={() => undefined}
        onBack={() => actions.push("back")} onExit={() => actions.push("exit")}
        onExternalView={() => { throw new Error("Editor unavailable"); }} />);
    instance.stdin.write("e");
    await nextFrame();
    assert.match(instance.lastFrame() ?? "", /Could not open raw step: Editor unavailable/);
    instance.stdin.write("\u001b");
    await nextFrame();
    assert.deepEqual(actions, ["back"]);
    instance.stdin.write("q");
    await nextFrame();
    assert.deepEqual(actions, ["back", "exit"]);
});

test("InspectorScreen renders structured Decision, Action, Observation, Result blocks and handles 'o' key toggle", async () => {
    const steps: UiInspectorStep[] = [
        {
            index: 0,
            totalSteps: 1,
            title: "Step 2: Execution (unit-42)",
            executionUnitId: "unit-42",
            uncommittedWarning: "Trailing uncommitted events detected",
            decision: {
                kind: "tool_call",
                summary: "Decided to read file",
                toolCall: { toolId: "read_file", actionId: "act-1" },
            },
            action: {
                toolId: "read_file",
                actionId: "act-1",
                inputJson: JSON.stringify({ path: "README.md" }),
                approvalStatus: "approved",
            },
            observation: {
                toolId: "read_file",
                actionId: "act-1",
                status: "success",
                durationMs: 45,
                observationPreview: "Short preview...",
                rawObservation: "Very long full content of README.md that was truncated",
                isTruncated: true,
            },
            result: {
                outcome: "next_step",
                summary: "File content retrieved successfully",
            },
            rawJson: "{}",
        },
    ];

    let toggleObsCount = 0;

    const foldedModel: UiInspectorViewModel = {
        screen: "inspector",
        busy: false,
        goalId: "goal-struct-1",
        currentStepIndex: 0,
        totalSteps: 1,
        steps,
        showReasoning: false,
        expandObservation: false,
    };

    const instance = render(
        <InspectorScreen
            inspector={foldedModel}
            onInspectStep={() => undefined}
            onToggleReasoning={() => undefined}
            onToggleObservation={() => {
                toggleObsCount += 1;
            }}
        />,
    );

    let frame = stripVTControlCharacters(instance.lastFrame() ?? "");
    // 验证未提交警告
    assert.match(frame, /Uncommitted events/);
    assert.match(frame, /Trailing uncommitted events detected/);
    // 验证标题
    assert.match(frame, /Execution/);
    // 验证 Decision 区块
    assert.match(frame, /Decision: tool_call/);
    assert.match(frame, /Decided to read file/);
    assert.match(frame, /Action: read_file/);
    // 验证 Action 区块
    assert.match(frame, /Action: read_file\s+Approved/);
    assert.match(frame, /README\.md/);
    // 验证 Observation 区块（折叠/截断状态）
    assert.match(frame, /Observation: read_file\s+success \(45ms\)/);
    assert.match(frame, /Short preview\.\.\./);
    assert.match(frame, /Output truncated · o Expand/);
    // 验证快捷键提示包含 [o] Obs
    assert.match(frame, /\[o\] Output/);

    // 按 G 键滚动到底部验证 Result 区块
    instance.stdin.write("G");
    await nextFrame();
    frame = stripVTControlCharacters(instance.lastFrame() ?? "");
    assert.match(frame, /Result: next step/);
    assert.match(frame, /File content retrieved successfully/);

    // 触发 'o' 键
    instance.stdin.write("o");
    await nextFrame();
    assert.equal(toggleObsCount, 1);

    // 重新渲染展开状态
    const expandedModel: UiInspectorViewModel = {
        ...foldedModel,
        expandObservation: true,
    };
    instance.rerender(
        <InspectorScreen
            inspector={expandedModel}
            onInspectStep={() => undefined}
            onToggleReasoning={() => undefined}
            onToggleObservation={() => {
                toggleObsCount += 1;
            }}
        />,
    );
    await nextFrame();
    frame = stripVTControlCharacters(instance.lastFrame() ?? "");
    // 展开状态下展示完整内容与收起提示
    assert.match(frame, /Very long full content of README\.md that was truncated/);
    assert.match(frame, /Full output · o Collapse/);
});


test("InspectorScreen keeps available controls visible across narrow viewports and scrolls to the final line", async () => {
    const inspector: UiInspectorViewModel = {
        screen: "inspector", busy: false, goalId: "goal-narrow", currentStepIndex: 0,
        totalSteps: 1, showReasoning: false, expandObservation: false,
        steps: [{ index: 0, totalSteps: 1, rawJson: "{}", reasoning: "Stored reasoning",
            observation: { toolId: "read_file", actionId: "action-1", status: "success",
                observationPreview: Array.from({ length: 40 }, (_,i) => `line ${i} 界面测试`).join("\n") + "\nLAST-LINE",
                rawObservation: "Full output", isTruncated: true } }],
    };
    let exits = 0;
    const instance = render(<InspectorScreen inspector={inspector}
        onInspectStep={() => undefined} onToggleReasoning={() => undefined}
        onToggleObservation={() => undefined} onBack={() => undefined}
        onExit={() => { exits += 1; }} />);
    for (const [columns, rows] of [[24, 12], [29, 13], [48, 18], [60, 18], [100, 30]] as const) {
        Object.defineProperty(instance.stdout, "columns", { value: columns, configurable: true });
        Object.defineProperty(instance.stdout, "rows", { value: rows, configurable: true });
        instance.stdout.emit("resize");
        await nextFrame();
        const frame = stripVTControlCharacters(instance.lastFrame() ?? "");
        assert.equal(frame.split("\n").length, rows - 1, `${columns}x${rows}\n${frame}`);
        assert.ok(frame.split("\n").every((line) => stringWidth(line) <= columns), frame);
        for (const hint of ["[r] Reasoning", "[o] Output", "[e] Raw", "[Esc] History", "[q] Exit"]) {
            assert.ok(frame.includes(hint), `${columns}x${rows}: missing ${hint}\n${frame}`);
        }
        instance.stdin.write("G");
        await nextFrame();
        assert.match(instance.lastFrame() ?? "", /Bottom/);
        // 最窄视口正文只容一行；从折叠提示向上滚动仍可读到输出末行。
        for (let i = 0; i < 3 && !(instance.lastFrame() ?? "").includes("LAST-LINE"); i++) {
            instance.stdin.write("k");
            await nextFrame();
        }
        assert.match(instance.lastFrame() ?? "", /LAST-LINE/);
    }
    instance.stdin.write("q");
    await nextFrame();
    assert.equal(exits, 1);
});

test("InspectorScreen omits and ignores unavailable expansion actions", async () => {
    let toggles = 0;
    const inspector: UiInspectorViewModel = {
        screen: "inspector", busy: false, goalId: "goal-empty", currentStepIndex: 0,
        totalSteps: 1, showReasoning: false,
        steps: [{ index: 0, totalSteps: 1, rawJson: "{}", messages: [] }],
    };
    const instance = render(<InspectorScreen inspector={inspector}
        onInspectStep={() => undefined} onToggleReasoning={() => { toggles += 1; }}
        onToggleObservation={() => { toggles += 1; }} />);
    instance.stdin.write("ro");
    await nextFrame();
    assert.equal(toggles, 0);
    assert.doesNotMatch(instance.lastFrame() ?? "", /\[r\]|\[o\]/);
    assert.match(instance.lastFrame() ?? "", /\[e\] Raw/);
});

test("external viewer accepts arguments and restores input and display after success or failure", async t => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal viewer "));
    const viewer = join(directory, "view step.cjs");
    const resultPath = join(directory, "result.json");
    await writeFile(viewer, `
        const fs = require('node:fs');
        const [result, flag, file] = process.argv.slice(2);
        fs.writeFileSync(result, JSON.stringify({ flag, file, data: fs.readFileSync(file, 'utf8') }));
        process.exit(flag === '--fail' ? 17 : 0);
    `);
    const saved = { VISUAL: process.env.VISUAL, EDITOR: process.env.EDITOR };
    t.after(async () => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        await rm(directory, { recursive: true, force: true });
    });
    const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
    process.env.VISUAL = "";
    const model: UiInspectorViewModel = {
        screen: "inspector", busy: false, goalId: "goal-viewer", currentStepIndex: 0,
        totalSteps: 2, showReasoning: false,
        steps: [{ index: 0, totalSteps: 2, rawJson: '{"data":"complete output"}' }],
    };
    const steps: number[] = [];
    const instance = render(<InspectorScreen inspector={model}
        onInspectStep={index => steps.push(index)} onToggleReasoning={() => {}} />);
    let raw = true;
    const rawChanges: boolean[] = [];
    Object.defineProperty(instance.stdin, "isRaw", { get: () => raw });
    Object.defineProperty(instance.stdin, "setRawMode", { value: (value: boolean) => {
        raw = value;
        rawChanges.push(value);
    } });
    Object.defineProperty(instance.stdout, "isTTY", { value: true });

    for (const flag of ["--readonly", "--fail"]) {
        process.env.EDITOR = [quote(process.execPath), quote(viewer), quote(resultPath), flag].join(" ");
        const start = instance.frames.length;
        instance.stdin.write("e");
        await nextFrame();
        const result = JSON.parse(await readFile(resultPath, "utf8"));
        assert.equal(result.flag, flag);
        assert.equal(result.data, model.steps[0]?.rawJson);
        await assert.rejects(access(result.file), { code: "ENOENT" });
        assert.deepEqual(rawChanges.splice(0), [false, true]);
        assert.equal(raw, true);
        const frames = instance.frames.slice(start);
        const entered = frames.indexOf("\x1b[?1049h\x1b[?25l");
        assert.ok(entered >= 0);
        assert.ok(frames.slice(entered + 1).some(frame => frame.includes("\x1b[2J\x1b[H")),
            "Ink must clear its old frame only after entering the alternate buffer");
        if (flag === "--fail") {
            assert.match(instance.lastFrame() ?? "", /Could not open raw step: Editor exited with 17/);
        }
        instance.stdin.write("l");
        await nextFrame();
    }
    assert.deepEqual(steps, [1, 1]);
});
