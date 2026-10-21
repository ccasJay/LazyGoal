import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";

(globalThis as any).React = React;

if (typeof globalThis.window === "undefined") {
    (globalThis as any).window = {
        location: { hash: "", host: "localhost", protocol: "http:" },
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
    };
}

const baseProps = {
    goals: [] as any[],
    metricsByGoal: {},
    goalsLoading: false,
    selectedGoalId: null,
    onSelectGoal: () => {},
    onOpenNewGoalDraft: () => {},
    onChangeArchive: async () => {},
    onDeleteGoal: async () => {},
    manageBusyId: null,
    manageError: null,
    onClearManageError: () => {},
    undoArchiveId: null,
    onRefreshGoals: async () => {},
    sessionError: null,
};

test("Goal 列表在存在不可读历史 Goal 时展示说明而不是页面错误", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { GoalBoard } = await import("../src/components/GoalBoard");

    const html = renderToStaticMarkup(
        React.createElement(GoalBoard, { ...baseProps, unreadableCount: 2 })
    );

    assert.match(html, /class="list-notice"/);
    assert.match(html, /2 saved Goals could not be read/);
    assert.match(html, /No readable saved Goals/);
    assert.equal(html.includes("page-error"), false);
});

test("Goal 列表在全部可读时不展示不可读说明", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { GoalBoard } = await import("../src/components/GoalBoard");

    const html = renderToStaticMarkup(
        React.createElement(GoalBoard, { ...baseProps, unreadableCount: 0 })
    );

    assert.equal(html.includes("list-notice"), false);
});
