import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { cleanup, render } from "ink-testing-library";

import {
    createGoal,
    type Goal,
} from "../../runtime/src/index";
import {
    SessionScreen,
    type UiSessionViewModel,
} from "../src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";

afterEach(() => {
    cleanup();
});

const profile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: [],
    toolIds: ["read_file"],
};

function baseGoal(id = "goal-perm-test"): Goal {
    return createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id,
        intent: "Test permissions",
        profile,
        runId: `run-${id}`,
    });
}

function sessionWith(mode: "default" | "yolo"): UiSessionViewModel {
    const goal = baseGoal();
    return {
        screen: "session",
        busy: false,
        goal,
        phase: "executing",
        runStatus: "running",
        stepCount: 1,
        messages: [],
        timeline: [],
        permissionMode: mode,
        permissionRevision: 1,
        executionMode: mode === "yolo" ? "yolo" : "confirm",
    };
}

test("SessionScreen 明确展示 [DEFAULT] 并在提示中提供 Shift+Tab 启用 YOLO", () => {
    const session = sessionWith("default");
    const { lastFrame } = render(
        <SessionScreen
            session={session}
            onSubmitMessage={() => {}}
            onApproveAction={() => {}}
            onRejectAction={() => {}}
        />,
    );

    const frame = lastFrame() ?? "";
    assert.match(frame, /\[DEFAULT\]/);
    assert.match(frame, /\[Shift\+Tab\] Enable YOLO/);
});

test("SessionScreen 明确展示 [YOLO] 并在提示中提供 Shift+Tab 切回 Default", () => {
    const session = sessionWith("yolo");
    const { lastFrame } = render(
        <SessionScreen
            session={session}
            onSubmitMessage={() => {}}
            onApproveAction={() => {}}
            onRejectAction={() => {}}
        />,
    );

    const frame = lastFrame() ?? "";
    assert.match(frame, /\[YOLO\]/);
    assert.match(frame, /\[Shift\+Tab\] Switch to Default/);
});

test("SessionScreen 响应 Shift+Tab 触发 onToggleExecutionMode 回调", () => {
    const session = sessionWith("default");
    let toggled = false;

    const { stdin } = render(
        <SessionScreen
            session={session}
            onSubmitMessage={() => {}}
            onApproveAction={() => {}}
            onRejectAction={() => {}}
            onToggleExecutionMode={() => { toggled = true; }}
        />,
    );

    // 发送 Shift+Tab 控制序列: \u001B[Z
    stdin.write("\u001b[Z");
    assert.equal(toggled, true);
});
