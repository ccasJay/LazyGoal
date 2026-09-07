import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { cleanup, render } from "ink-testing-library";

import {
    createGoal,
    type Goal,
    type GoalMessage,
    type PendingAction,
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
    instructions: ["Use tools carefully."],
    toolIds: ["read_file"],
};

function executingGoal(id = "goal-executing"): Goal {
    const messages: readonly GoalMessage[] = [
        { role: "user", content: "Inspect the repository" },
        {
            role: "assistant",
            assistant: { profileId: profile.id },
            content: "I will inspect the project files.",
        },
    ];
    const created = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id,
        intent: "Inspect the repository",
        profile,
        runId: `run-${id}`,
        messages,
    });

    return {
        ...created,
        state: {
            ...created.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: {
                    objective: "Inspect the repository",
                    completionCriteria: ["Report the repository structure"],
                },
            },
        },
    };
}

function session(
    goal: Goal,
    overrides: Partial<UiSessionViewModel> = {},
): UiSessionViewModel {
    return {
        screen: "session",
        busy: false,
        goal,
        phase: "executing",
        runStatus: goal.state.run.status,
        stepCount: goal.state.run.stepCount,
        messages: goal.state.messages,
        ...overrides,
    } as UiSessionViewModel;
}

function action(status: PendingAction["status"] = "awaiting_approval"): PendingAction {
    return {
        status,
        action: {
            actionId: "action-1",
            toolId: "read_file",
            input: { path: "README.md", lineLimit: 20 },
        },
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

test("SessionScreen renders ordered messages and the executing status", () => {
    const goal = executingGoal();
    const currentGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status: "running",
                stepCount: 2,
            },
        },
    };
    const instance = render(
        <SessionScreen
            session={session(currentGoal, {
                busy: true,
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    assert.ok(frame.indexOf("Inspect the repository") < frame.indexOf("I will inspect"));
    assert.match(frame, /Phase: executing \| Run: running \| Steps: 2/);
    assert.match(frame, /Executing step/);
    assert.match(frame, /Goal goal-exe…/);
});

test("SessionScreen validates and submits blocked messages", async () => {
    const goal = executingGoal("goal-blocked");
    const currentGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status: "waiting",
                lastStep: {
                    kind: "decision",
                    result: {
                        kind: "wait",
                        reason: "Which repository should be inspected?",
                    },
                },
            },
        },
    };
    const submitted: string[] = [];
    const instance = render(
        <SessionScreen
            session={session(currentGoal, {
                waitingFor: "blocked",
                blockedReason: "Which repository should be inspected?",
            })}
            onSubmitMessage={(content) => {
                submitted.push(content);
            }}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
        />,
    );

    assert.match(instance.lastFrame() ?? "", /Agent is blocked/);
    assert.match(instance.lastFrame() ?? "", /Which repository should be inspected/);
    instance.stdin.write("\r");
    await waitForFrame(instance, /Message must not be empty/);
    assert.deepEqual(submitted, []);

    instance.stdin.write("Use the current repository");
    await waitForFrame(instance, /Use the current repository/);
    instance.stdin.write("\r");
    await nextFrame();
    instance.stdin.write("\r");
    await nextFrame();
    assert.deepEqual(submitted, ["Use the current repository"]);
    assert.match(instance.lastFrame() ?? "", /Type a message to continue/);
});

test("SessionScreen displays an Action and approves the exact actionId once", async () => {
    const goal = executingGoal("goal-action-approval");
    const currentGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status: "waiting",
                pendingAction: action(),
            },
        },
    };
    const approved: string[] = [];
    const instance = render(
        <SessionScreen
            session={session(currentGoal, {
                waitingFor: "action_approval",
                pendingAction: action(),
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={(actionId) => {
                approved.push(actionId);
            }}
            onRejectAction={() => undefined}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    assert.match(frame, /Action approval required/);
    assert.match(frame, /Action ID: action-1/);
    assert.match(frame, /Tool: read_file/);
    assert.match(frame, /README\.md/);
    instance.stdin.write("y");
    await nextFrame();
    instance.stdin.write("y");
    await nextFrame();

    assert.deepEqual(approved, ["action-1"]);
});

test("SessionScreen keeps Action approval mounted but disabled while busy", async () => {
    const goal = executingGoal("goal-action-busy");
    const currentGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status: "waiting",
                pendingAction: action(),
            },
        },
    };
    const approved: string[] = [];
    const instance = render(
        <SessionScreen
            session={session(currentGoal, {
                busy: true,
                waitingFor: "action_approval",
                pendingAction: action(),
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={(actionId) => {
                approved.push(actionId);
            }}
            onRejectAction={() => undefined}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    assert.match(frame, /Advancing/);
    assert.match(frame, /Press Y to approve or N to reject with a reason/);
    assert.doesNotMatch(frame, /Working/);
    instance.stdin.write("y");
    await nextFrame();
    assert.deepEqual(approved, []);
});

test("SessionScreen folds oversized Action input and preserves short input", () => {
    const goal = executingGoal("goal-action-input");
    const largeAction: PendingAction = {
        status: "awaiting_approval",
        action: {
            actionId: "action-large-input",
            toolId: "write_file",
            input: { content: "x".repeat(700) },
        },
    };
    const currentGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status: "waiting",
                pendingAction: largeAction,
            },
        },
    };

    const instance = render(
        <SessionScreen
            session={session(currentGoal, {
                waitingFor: "action_approval",
                pendingAction: largeAction,
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    assert.match(frame, /Action ID: action-large-input/);
    assert.match(frame, /…\s*\(\d+ chars truncated\)/);
    assert.doesNotMatch(frame, /x{700}/);
});

test("SessionScreen requires a reason when rejecting an Action", async () => {
    const goal = executingGoal("goal-action-reject");
    const currentGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status: "waiting",
                pendingAction: action(),
            },
        },
    };
    const rejected: Array<{ readonly actionId: string; readonly reason: string }> = [];
    const instance = render(
        <SessionScreen
            session={session(currentGoal, {
                waitingFor: "action_approval",
                pendingAction: action(),
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={(actionId, reason) => {
                rejected.push({ actionId, reason });
            }}
        />,
    );

    instance.stdin.write("n");
    await waitForFrame(instance, /Why should this Action be rejected/);
    instance.stdin.write("\r");
    await waitForFrame(instance, /Rejection reason must not be empty/);
    instance.stdin.write("The path is outside the approved scope");
    await waitForFrame(instance, /The path is outside the approved scope/);
    instance.stdin.write("\r");
    await nextFrame();

    assert.deepEqual(rejected, [{
        actionId: "action-1",
        reason: "The path is outside the approved scope",
    }]);
});

test("SessionScreen marks outcome_unknown as risky and preserves the Action identity", async () => {
    const goal = executingGoal("goal-action-recovery");
    const currentGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status: "waiting",
                pendingAction: action("outcome_unknown"),
            },
        },
    };
    const approved: string[] = [];
    const instance = render(
        <SessionScreen
            session={session(currentGoal, {
                waitingFor: "action_recovery",
                pendingAction: action("outcome_unknown"),
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={(actionId) => {
                approved.push(actionId);
            }}
            onRejectAction={() => undefined}
        />,
    );

    assert.match(instance.lastFrame() ?? "", /Action outcome unknown/);
    assert.match(instance.lastFrame() ?? "", /replay the same action/);
    assert.match(instance.lastFrame() ?? "", /Action ID: action-1/);
    instance.stdin.write("y");
    await nextFrame();

    assert.deepEqual(approved, ["action-1"]);
});

test("SessionScreen renders terminal summary and accepts no further input", async () => {
    const goal = executingGoal("goal-terminal");
    const currentGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status: "completed",
                lastStep: {
                    kind: "decision",
                    result: {
                        kind: "complete",
                        completionEvidence: [],
                        summary: "The repository structure was documented.",
                    },
                },
            },
        },
    };
    const events: string[] = [];
    const instance = render(
        <SessionScreen
            session={session(currentGoal, {
                runStatus: "completed",
                terminal: {
                    status: "completed",
                    summary: "The repository structure was documented.",
                },
            })}
            onSubmitMessage={() => {
                events.push("message");
            }}
            onApproveAction={() => {
                events.push("approve");
            }}
            onRejectAction={() => {
                events.push("reject");
            }}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    assert.match(frame, /Run completed/);
    assert.match(frame, /Summary: The repository structure was documented/);
    assert.match(frame, /No further input is accepted/);
    instance.stdin.write("y");
    instance.stdin.write("\r");
    instance.stdin.write("continue");
    await nextFrame();

    assert.deepEqual(events, []);
});
