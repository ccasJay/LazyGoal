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
    assert.match(frame, /2026-08-17T02:00:00\.000Z/);
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
    await waitForFrame(instance, /❯ Second workflow/);
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

test("GoalSelectScreen renders benchmark and goal labels in inspect mode", () => {
    const goals: GoalCatalogEntry[] = [
        {
            goalId: "gaia-1",
            runId: "run-gaia-1",
            intent: "[GAIA] gaia-smoke-001",
            workflowPhase: "executing",
            runStatus: "completed",
            updatedAt: "2026-09-11T17:53:00.000Z",
        },
        {
            goalId: "user-1",
            runId: "run-user-1",
            intent: "User defined intent",
            workflowPhase: "executing",
            runStatus: "waiting",
            updatedAt: "2026-09-11T14:05:00.000Z",
        },
    ];

    const instance = render(
        <GoalSelectScreen
            goals={goals}
            busy={false}
            mode="inspect"
            onSelect={() => undefined}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    assert.match(frame, /\[GAIA\] gaia-smoke-001\n\s+completed/);
    assert.match(frame, /\[Goal\] User defined intent\n\s+waiting/);
    assert.match(frame, /Inspect Goal Trajectory/);
});

test("GoalSelectScreen searches summaries without submitting text and supports clearing and back", async () => {
    const selected: string[] = [];
    let backs = 0;
    const instance = render(<GoalSelectScreen
        goals={[
            entry("goal-first", "Review the logs", "2026-09-11T02:00:00.000Z"),
            entry("goal-query", "Inspect query performance", "2026-09-11T01:00:00.000Z"),
        ]} busy={false} mode="inspect" onSelect={(id) => { selected.push(id); }}
        onBack={() => { backs += 1; }} />);
    instance.stdin.write("/");
    await waitForFrame(instance, /Type to filter/);
    instance.stdin.write("query");
    await waitForFrame(instance, /1 \/ 2 Goals|Inspect query performance/);
    await nextFrame();
    assert.doesNotMatch(instance.lastFrame() ?? "", /Review the logs/);
    instance.stdin.write("\r");
    await waitForFrame(instance, /1 \/ 2 Goals matching: query/);
    assert.deepEqual(selected, []);
    instance.stdin.write("\r");
    await nextFrame();
    assert.deepEqual(selected, ["goal-query"]);
    instance.stdin.write("\u001b");
    await waitForFrame(instance, /2 \/ 2 Goals/);
    assert.equal(backs, 0);
    instance.stdin.write("\u001b");
    await nextFrame();
    assert.equal(backs, 1);
});

test("GoalSelectScreen displays no matches and preserves the last inspected selection", async () => {
    const selected: string[] = [];
    const instance = render(<GoalSelectScreen
        goals={[
            entry("goal-first", "First workflow", "2026-09-11T02:00:00.000Z"),
            entry("goal-second", "Second workflow", "2026-09-11T01:00:00.000Z"),
        ]} busy={false} initialGoalId="goal-second" onSelect={(id) => { selected.push(id); }} />);
    instance.stdin.write("\r");
    await nextFrame();
    assert.deepEqual(selected, ["goal-second"]);
    instance.stdin.write("/");
    await waitForFrame(instance, /Type to filter/);
    instance.stdin.write("missing-title");
    await waitForFrame(instance, /No matching Goals/);
    instance.stdin.write("\u001b");
    await waitForFrame(instance, /2 \/ 2 Goals/);
    assert.match(instance.lastFrame() ?? "", /❯ Second workflow/);
});

test("GoalSelectScreen shows loading without an empty-history flash", () => {
    const instance = render(<GoalSelectScreen goals={[]} busy mode="inspect"
        onSelect={() => undefined} />);
    assert.match(instance.lastFrame() ?? "", /Loading trajectory/);
    assert.doesNotMatch(instance.lastFrame() ?? "", /No Goal history found/);
});

test("GoalSelectScreen keeps long titles, focused selection and exit controls within a short terminal", async () => {
    const goals = Array.from({length: 20}, (_, i) => entry(
        `goal-${i}`, `Task ${i} ${"检查日志文件".repeat(30)}`, "2026-09-12T01:02:03.000Z",
    ));
    const selected: string[] = [];
    const instance = render(<GoalSelectScreen goals={goals} busy={false} mode="inspect"
        onSelect={(id) => { selected.push(id); }} onBack={() => undefined} onExit={() => undefined} />);
    for (const [columns, rows] of [[30, 13], [48, 18], [80, 24]] as const) {
        Object.defineProperty(instance.stdout, "columns", { value: columns, configurable: true });
        Object.defineProperty(instance.stdout, "rows", { value: rows, configurable: true });
        instance.stdout.emit("resize");
        await nextFrame();
        const frame = instance.lastFrame() ?? "";
        assert.ok(frame.split("\n").length < rows, `${columns}x${rows}\n${frame}`);
        assert.match(frame, /Esc Main Menu.*q Exit/);
        assert.match(frame, /❯ \[Goal\] Task 0/);
    }
    instance.stdin.write("j".repeat(19));
    await nextFrame();
    assert.match(instance.lastFrame() ?? "", /❯ \[Goal\] Task 19/);
    instance.stdin.write("\r");
    await nextFrame();
    assert.deepEqual(selected, ["goal-19"]);
});
