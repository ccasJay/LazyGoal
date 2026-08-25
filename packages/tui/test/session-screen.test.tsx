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
                checkpoint: "Located the repository entry points",
            },
        },
    };
    const instance = render(
        <SessionScreen
            session={session(currentGoal, {
                busy: true,
                checkpoint: "Located the repository entry points",
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    assert.ok(frame.indexOf("Inspect the repository") < frame.indexOf("I will inspect"));
    assert.match(frame, /Phase: executing \| Run: running \| Steps: 2/);
    assert.match(frame, /Checkpoint: Located the repository entry points/);
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
                checkpoint: "Need a repository choice",
                lastStep: {
                    kind: "decision",
                    result: {
                        kind: "wait",
                        checkpoint: "Need a repository choice",
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
    await nextFrame();
    assert.deepEqual(submitted, []);
    assert.match(instance.lastFrame() ?? "", /Message must not be empty/);

    instance.stdin.write("Use the current repository");
    await nextFrame();
    instance.stdin.write("\r");
    await nextFrame();
    instance.stdin.write("\r");
    await nextFrame();
    assert.deepEqual(submitted, ["Use the current repository"]);
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
    await nextFrame();
    assert.match(instance.lastFrame() ?? "", /Why should this Action be rejected/);
    instance.stdin.write("\r");
    await nextFrame();
    assert.match(instance.lastFrame() ?? "", /Rejection reason must not be empty/);
    instance.stdin.write("The path is outside the approved scope");
    await nextFrame();
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
                        checkpoint: "Repository inspected",
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
