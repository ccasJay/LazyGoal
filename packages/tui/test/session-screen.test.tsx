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
    ToolPermissionsScreen,
    type UiSessionViewModel,
    type UiToolPermissionsViewModel,
    type UiStepSummary,
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
            },
            run: { ...created.state.run, mode: "plan", approvedTask: {
                    objective: "Inspect the repository",
                    completionCriteria: [{ text: "Report the repository structure" }],
                } },
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

test("SessionScreen displays an Action and approves on Enter", async () => {
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
    assert.match(frame, /\[Enter\] Approve once  Type feedback to reject/);
    assert.match(frame, /\[Shift\+Tab\] Enable YOLO/);
    
    // 直接按回车批准放行
    instance.stdin.write("\r");
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
    assert.match(frame, /\[Enter\] Approve once  Type feedback to reject/);
    instance.stdin.write("\r");
    await nextFrame();
    assert.deepEqual(approved, []);
});

test("SessionScreen displays the complete Action input for review", () => {
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
    assert.doesNotMatch(frame, /chars truncated/);
    assert.equal(frame.replaceAll(/\s/g, "").includes("x".repeat(700)), true);
});

test("Action approval can select Goal scope and explains write path coverage", async () => {
    const goal = executingGoal("goal-action-scope");
    const pendingAction: PendingAction = {
        status: "awaiting_approval",
        action: {
            actionId: "action-scope",
            toolId: "write_file",
            input: { path: "src/app.ts", content: "body" },
        },
    };
    const waitingGoal: Goal = {
        ...goal,
        state: { ...goal.state, run: { ...goal.state.run, status: "waiting", pendingAction } },
    };
    const approvals: Array<{ actionId: string; scope: string }> = [];
    const instance = render(
        <SessionScreen
            session={session(waitingGoal, { waitingFor: "action_approval", pendingAction })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => assert.fail("The scoped approval callback should be used")}
            onApproveActionWithScope={(actionId, scope) => { approvals.push({ actionId, scope }); }}
            onRejectAction={() => undefined}
        />,
    );

    assert.match(instance.lastFrame() ?? "", /different content/);
    instance.stdin.write("\u001b[B\r");
    await nextFrame();
    instance.stdin.write("\r");
    await nextFrame();
    assert.deepEqual(approvals, [{ actionId: "action-scope", scope: "goal" }]);
});

test("ToolPermissionsScreen shows scope and revokes the selected grant", async () => {
    const goal = executingGoal("goal-permissions-screen");
    const view: UiToolPermissionsViewModel = {
        screen: "tool_permissions",
        busy: false,
        goal,
        grants: [{
            grantId: "grant-screen-1",
            scope: "workspace",
            toolId: "write_file",
            status: "active",
            targetPath: "src/app.ts",
        }],
        session: session(goal),
    };
    const revocations: Array<{ grantId: string; scope: string }> = [];
    const instance = render(
        <ToolPermissionsScreen
            view={view}
            onRevoke={(grantId, scope) => { revocations.push({ grantId, scope }); }}
            onBack={() => undefined}
        />,
    );

    assert.match(instance.lastFrame() ?? "", /This project/);
    assert.match(instance.lastFrame() ?? "", /src\/app\.ts/);
    instance.stdin.write("\r");
    await nextFrame();
    assert.deepEqual(revocations, [{ grantId: "grant-screen-1", scope: "workspace" }]);
});

test("SessionScreen submits non-empty text as rejection reason", async () => {
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
    instance.stdin.write("\r");
    await nextFrame();

    assert.deepEqual(approved, ["action-1"]);
});

test("SessionScreen displays executionMode tag in status bar", () => {
    const goal = executingGoal("goal-mode-tag");
    const confirmInstance = render(
        <SessionScreen
            session={session(goal, { executionMode: "confirm" })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
        />,
    );
    assert.match(confirmInstance.lastFrame() ?? "", /\[CONFIRM\]/);

    const yoloInstance = render(
        <SessionScreen
            session={session(goal, { executionMode: "yolo" })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
        />,
    );
    assert.match(yoloInstance.lastFrame() ?? "", /\[YOLO\]/);
});

test("SessionScreen listens for Shift+Tab and triggers onToggleExecutionMode", async () => {
    const goal = executingGoal("goal-shift-tab");
    let toggleCalled = 0;
    const instance = render(
        <SessionScreen
            session={session(goal, { executionMode: "confirm" })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
            onToggleExecutionMode={() => {
                toggleCalled += 1;
            }}
        />,
    );

    // Shift + Tab ANSI escape sequence
    instance.stdin.write("\u001B[Z");
    await nextFrame();
    assert.equal(toggleCalled, 1);
});

test("SessionScreen renders terminal summary and accepts input for the next Run", async () => {
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
    assert.match(frame, /Start the next Run/);
    instance.stdin.write("continue");
    await nextFrame();
    instance.stdin.write("\r");
    await nextFrame();

    assert.deepEqual(events, ["message"]);
});

test("SessionScreen projects an existing GoalPlan in both Run modes without binding a Todo to the Run", () => {
    const goal = executingGoal("goal-plan-panel");
    const planGoal: Goal = {
        ...goal,
        state: {
            ...goal.state,
            goalPlan: {
                revision: 2,
                items: [
                    { id: "todo-1", content: "Inspect sources", position: 0, status: "in_progress" },
                    { id: "todo-2", content: "Write report", position: 1, status: "pending" },
                ],
            },
            run: { ...goal.state.run, mode: "plan" },
        },
    };
    const planFrame = render(
        <SessionScreen
            session={session(planGoal)}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
        />,
    ).lastFrame() ?? "";
    assert.match(planFrame, /Plan/);
    assert.match(planFrame, /Inspect sources/);
    assert.doesNotMatch(planFrame, /current Run/);

    const normalGoal: Goal = {
        ...planGoal,
        state: { ...planGoal.state, run: { ...planGoal.state.run, mode: "normal" } },
    };
    const normalFrame = render(
        <SessionScreen
            session={session(normalGoal)}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
        />,
    ).lastFrame() ?? "";
    assert.match(normalFrame, /Inspect sources/);
});

const step1: UiStepSummary = {
    stepNumber: 1,
    toolId: "read_file",
    actionId: "act-1",
    status: "success",
    inputSummary: "path: README.md",
    outputSummary: "file content 20 lines",
};

const step2: UiStepSummary = {
    stepNumber: 2,
    toolId: "bash",
    actionId: "act-2",
    status: "success",
    inputSummary: "pytest tests/",
    outputSummary: "14 tests passed",
};

const step3: UiStepSummary = {
    stepNumber: 3,
    toolId: "patch_file",
    actionId: "act-3",
    status: "failure",
    inputSummary: "src/main.py",
    outputSummary: "patch rejected: hunk failed",
};

test("SessionScreen renders committed steps in waterfall Static and preserves history across rerenders", () => {
    const goal = executingGoal("goal-waterfall");
    const instance = render(
        <SessionScreen
            session={session(goal, {
                stepCount: 0,
                committedSteps: [],
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
        />,
    );

    // 初始状态：包含 messages，尚无 steps
    let frame = instance.lastFrame() ?? "";
    assert.match(frame, /Inspect the repository/);
    assert.doesNotMatch(frame, /Step 1:/);

    // 推进到 Step 1
    instance.rerender(
        <SessionScreen
            session={session(goal, {
                stepCount: 1,
                committedSteps: [step1],
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
        />,
    );
    frame = instance.lastFrame() ?? "";
    assert.match(frame, /✔\s+Step 1:\s*\[read_file\]\s*path: README\.md\s*\(file content 20 lines\)/);

    // 推进到 Step 2
    instance.rerender(
        <SessionScreen
            session={session(goal, {
                stepCount: 2,
                committedSteps: [step1, step2],
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
        />,
    );
    frame = instance.lastFrame() ?? "";
    // 断言 Step 1 和 Step 2 都在终端中，且 Step 1 在 Step 2 之前（不发生原地覆盖擦除）
    const idxStep1 = frame.indexOf("Step 1: [read_file]");
    const idxStep2 = frame.indexOf("Step 2: [bash]");
    assert.ok(idxStep1 !== -1, "Step 1 must be present in output");
    assert.ok(idxStep2 !== -1, "Step 2 must be present in output");
    assert.ok(idxStep1 < idxStep2, "Step 1 must appear before Step 2");

    // 推进到 Step 3 (失败)
    instance.rerender(
        <SessionScreen
            session={session(goal, {
                stepCount: 3,
                committedSteps: [step1, step2, step3],
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
        />,
    );
    frame = instance.lastFrame() ?? "";
    const idxStep3 = frame.indexOf("Step 3: [patch_file]");
    assert.ok(idxStep3 !== -1, "Step 3 must be present in output");
    assert.ok(idxStep2 < idxStep3, "Step 2 must appear before Step 3");
    assert.match(frame, /✖\s+Step 3:\s*\[patch_file\]/);
});

test("SessionScreen retains waterfall steps above Action approval drawer", () => {
    const goal = executingGoal("goal-waterfall-action");
    const instance = render(
        <SessionScreen
            session={session(goal, {
                stepCount: 1,
                committedSteps: [step1],
                waitingFor: "action_approval",
                pendingAction: action(),
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    assert.match(frame, /Step 1:\s*\[read_file\]/);
    assert.match(frame, /Action approval required/);
    assert.match(frame, /Action ID: action-1/);
});

test("SessionScreen retains full waterfall steps when reaching terminal state", () => {
    const goal = executingGoal("goal-waterfall-terminal");
    const instance = render(
        <SessionScreen
            session={session(goal, {
                stepCount: 2,
                committedSteps: [step1, step2],
                runStatus: "completed",
                terminal: {
                    status: "completed",
                    summary: "Inspection fully completed.",
                },
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    assert.match(frame, /Step 1:\s*\[read_file\]/);
    assert.match(frame, /Step 2:\s*\[bash\]/);
    assert.match(frame, /Run completed/);
    assert.match(frame, /Summary: Inspection fully completed\./);
});

test("SessionScreen renders streamingTail above ActiveDrawer and below Static history", () => {
    const goal = executingGoal("goal-streaming-screen");
    const instance = render(
        <SessionScreen
            session={session(goal, {
                waitingFor: "blocked",
                blockedReason: "What is your next instruction?",
                timeline: [
                    {
                        kind: "message",
                        id: "msg-1",
                        message: { role: "user", content: "Initial user query" },
                    },
                ],
                streamingTail: {
                    messageId: "msg-assistant-stream",
                    content: "```ts\nconst liveTailCode = 42;\n```",
                    showAuthor: true,
                },
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    const idxUser = frame.indexOf("Initial user query");
    const idxTail = frame.indexOf("liveTailCode");
    const idxDrawer = frame.indexOf("What is your next instruction?");

    assert.ok(idxUser !== -1, "Committed user query must be visible");
    assert.ok(idxTail !== -1, "Streaming tail must be visible");
    assert.ok(idxDrawer !== -1, "Active drawer question must be visible");

    // 结构顺序：Static 历史 -> streamingTail -> ActiveDrawer
    assert.ok(idxUser < idxTail, "User message in Static must appear before streaming tail");
    assert.ok(idxTail < idxDrawer, "Streaming tail must appear before ActiveDrawer composer");
});

test("SessionScreen smoothly moves committed blocks into timeline without duplicate content", () => {
    const goal = executingGoal("goal-streaming-transition");

    // 帧 1：Tail 包含全部未决内容
    const { rerender, lastFrame } = render(
        <SessionScreen
            session={session(goal, {
                timeline: [
                    {
                        kind: "message",
                        id: "msg-1",
                        message: { role: "user", content: "Start" },
                    },
                ],
                streamingTail: {
                    messageId: "msg-2",
                    content: "# Heading\n\nFirst paragraph\n\nSecond paragraph",
                    showAuthor: true,
                },
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
        />,
    );

    let frame = lastFrame() ?? "";
    assert.match(frame, /Heading/);
    assert.match(frame, /First paragraph/);
    assert.match(frame, /Second paragraph/);

    // 帧 2：第一块转入 committed timeline，tail 仅包含第二块
    rerender(
        <SessionScreen
            session={session(goal, {
                timeline: [
                    {
                        kind: "message",
                        id: "msg-1",
                        message: { role: "user", content: "Start" },
                    },
                    {
                        kind: "assistant_markdown",
                        id: "msg-2-blk-0",
                        block: "# Heading\n\nFirst paragraph\n\n",
                        showAuthor: true,
                    },
                ],
                streamingTail: {
                    messageId: "msg-2",
                    content: "Second paragraph",
                    showAuthor: false,
                },
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
        />,
    );

    frame = lastFrame() ?? "";
    assert.match(frame, /Heading/);
    assert.match(frame, /First paragraph/);
    assert.match(frame, /Second paragraph/);

    // 帧 3：全部提交进 committed timeline，streamingTail 清空
    rerender(
        <SessionScreen
            session={session(goal, {
                timeline: [
                    {
                        kind: "message",
                        id: "msg-1",
                        message: { role: "user", content: "Start" },
                    },
                    {
                        kind: "assistant_markdown",
                        id: "msg-2-blk-0",
                        block: "# Heading\n\nFirst paragraph\n\n",
                        showAuthor: true,
                    },
                    {
                        kind: "assistant_markdown",
                        id: "msg-2-blk-1",
                        block: "Second paragraph",
                        showAuthor: false,
                    },
                ],
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
        />,
    );

    frame = lastFrame() ?? "";
    assert.match(frame, /Heading/);
    assert.match(frame, /First paragraph/);
    assert.match(frame, /Second paragraph/);
});

test("SessionScreen renders AskUserPanel when waitingFor is ask_user and handles answer submission", async () => {
    let answeredRequestId: string | undefined;
    let submittedAnswers: readonly any[] | undefined;

    const goal = executingGoal();
    const instance = render(
        <SessionScreen
            session={session(goal, {
                waitingFor: "ask_user",
                askUser: {
                    requestId: "ask-test-1",
                    mode: "plan",
                    questions: [
                        {
                            id: "q-1",
                            header: "Select Framework",
                            question: "Which web framework?",
                            options: [
                                { id: "opt-1", label: "Fastify" },
                                { id: "opt-2", label: "Express" },
                            ],
                            multiSelect: false,
                        },
                    ],
                },
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
            onAnswerAskUser={(reqId, answers) => {
                answeredRequestId = reqId;
                submittedAnswers = answers;
            }}
        />,
    );

    const frame = instance.lastFrame() ?? "";
    assert.match(frame, /\[PLANNING\]/);
    assert.match(frame, /Select Framework/);
    assert.match(frame, /Fastify/);

    // 回车直接选中 Fastify 并提交
    instance.stdin.write("\r");
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(answeredRequestId, "ask-test-1");
    assert.ok(submittedAnswers !== undefined);
    assert.deepEqual(submittedAnswers, [
        {
            questionId: "q-1",
            optionIds: ["opt-1"],
        },
    ]);
});

test("SessionScreen renders TaskProposalPanel when waitingFor is task_approval and handles approval and feedback", async () => {
    let approvedRequestId: string | undefined;
    let feedbackResult: { requestId: string | undefined; feedback: string } | undefined;

    const goal = executingGoal();
    const proposalData = {
        objective: "Build authentication module",
        completionCriteria: [{ text: "JWT token validation passes" }],
    };

    // 1. 批准分支
    const instance = render(
        <SessionScreen
            session={session(goal, {
                waitingFor: "task_approval",
                proposal: proposalData,
                proposalRequestId: "prop-1",
                approvalRequest: "Please approve the task plan",
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
            onApproveTask={(reqId) => {
                approvedRequestId = reqId;
            }}
            onFeedbackTask={(reqId, feedback) => {
                feedbackResult = { requestId: reqId, feedback };
            }}
        />,
    );

    let frame = instance.lastFrame() ?? "";
    assert.match(frame, /Task proposal/);
    assert.match(frame, /Please approve the task plan/);
    assert.match(frame, /Build authentication module/);
    assert.match(frame, /JWT token validation passes/);

    // 敲击 Y 批准
    instance.stdin.write("y");
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(approvedRequestId, "prop-1");

    // 2. 反馈分支
    const instance2 = render(
        <SessionScreen
            session={session(goal, {
                waitingFor: "task_approval",
                proposal: proposalData,
                proposalRequestId: "prop-2",
            })}
            onSubmitMessage={() => undefined}
            onApproveAction={() => undefined}
            onRejectAction={() => undefined}
            onApproveTask={() => undefined}
            onFeedbackTask={(reqId, feedback) => {
                feedbackResult = { requestId: reqId, feedback };
            }}
        />,
    );

    // 敲击 N 进入反馈
    instance2.stdin.write("n");
    await new Promise((r) => setTimeout(r, 50));

    frame = instance2.lastFrame() ?? "";
    assert.match(frame, /Describe the changes you want:/);

    // 输入反馈内容并回车
    instance2.stdin.write("Please also add OAuth support");
    await new Promise((r) => setTimeout(r, 50));
    instance2.stdin.write("\r");
    await new Promise((r) => setTimeout(r, 50));

    assert.ok(feedbackResult !== undefined);
    assert.equal(feedbackResult.requestId, "prop-2");
    assert.equal(feedbackResult.feedback, "Please also add OAuth support");
});
