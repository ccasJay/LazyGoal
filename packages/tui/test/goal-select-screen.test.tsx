import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { cleanup, render } from "ink-testing-library";

import type { GoalCatalogEntry } from "../../runtime/src/index";
import { GoalSelectScreen } from "../src/index";

afterEach(() => {
    cleanup();
});

function entry(
    goalId: string,
    intent: string,
    updatedAt: string,
): GoalCatalogEntry {
    return {
        goalId,
        runId: `run-${goalId}`,
        intent,
        workflowPhase: "planning",
        runStatus: "waiting",
        updatedAt,
    };
}

async function nextFrame(): Promise<void> {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 25);
    });
}

/** 轮询等待 frame 中出现 pattern;超时以最终 frame 断言失败并展示实际内容。 */
async function waitForFrame(
    instance: { lastFrame(): string | undefined },
    pattern: RegExp,
    timeoutMs = 2000,
): Promise<string> {
    const start = Date.now();
    for (;;) {
        const frame = instance.lastFrame() ?? "";
        if (pattern.test(frame)) {
            // frame 更新先于 React passive effect(ink 的 useInput handler 重注册);
            // yield 一个 setImmediate 保证后续 stdin 写入打到最新 handler。
            await new Promise<void>((resolve) => {
                setImmediate(resolve);
            });
            return instance.lastFrame() ?? "";
        }
        if (Date.now() - start >= timeoutMs) {
            assert.match(frame, pattern);
        }
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 10);
        });
    }
}

test("GoalSelectScreen preserves Catalog order and renders every summary field", () => {
    const goals = [
        entry("goal-newest", "Newest resumable workflow", "2026-08-17T02:00:00.000Z"),
        entry("goal-older", "Older resumable workflow", "2026-08-17T01:00:00.000Z"),
    ];
    const instance = render(
        <GoalSelectScreen
            goals={goals}
            busy={false}
            onSelect={() => undefined}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    assert.ok(frame.indexOf("goal-new") < frame.indexOf("goal-old"));
    assert.match(frame, /goal-new…/);
    assert.match(frame, /goal-old…/);
    assert.match(frame, /Newest resumable workflow/);
    assert.match(frame, /phase=planning/);
    assert.match(frame, /run=waiting/);
    assert.match(frame, /updated=2026-08-17T02:00:00\.000Z/);
});

test("GoalSelectScreen submits the focused keyboard selection once", async () => {
    const selected: string[] = [];
    const instance = render(
        <GoalSelectScreen
            goals={[
                entry("goal-first", "First workflow", "2026-08-17T02:00:00.000Z"),
                entry("goal-second", "Second workflow", "2026-08-17T01:00:00.000Z"),
            ]}
            busy={false}
            onSelect={(goalId) => {
                selected.push(goalId);
            }}
        />,
    );

    instance.stdin.write("\u001b[B");
    await waitForFrame(instance, /❯ goal-sec/);
    instance.stdin.write("\r");
    await nextFrame();
    instance.stdin.write("\r");
    await nextFrame();

    assert.deepEqual(selected, ["goal-second"]);
});

test("GoalSelectScreen displays stable empty-list feedback", () => {
    const instance = render(
        <GoalSelectScreen
            goals={[]}
            busy={false}
            onSelect={() => undefined}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    assert.match(frame, /No resumable Goals found/);
    assert.match(frame, /Press Ctrl\+C to exit/);
});

test("GoalSelectScreen displays Catalog errors and disables selection while busy", async () => {
    const selected: string[] = [];
    const instance = render(
        <GoalSelectScreen
            goals={[entry("goal-1", "A workflow", "2026-08-17T00:00:00.000Z")]}
            busy
            error={{ code: "INVALID_GOAL_SNAPSHOT", message: "Goal snapshot is invalid" }}
            onSelect={(goalId) => {
                selected.push(goalId);
            }}
        />,
    );

    instance.stdin.write("\r");
    await nextFrame();

    assert.deepEqual(selected, []);
    assert.match(instance.lastFrame() ?? "", /INVALID_GOAL_SNAPSHOT/);
    assert.match(instance.lastFrame() ?? "", /Goal snapshot is invalid/);
    assert.match(instance.lastFrame() ?? "", /Resuming goal/);
});
