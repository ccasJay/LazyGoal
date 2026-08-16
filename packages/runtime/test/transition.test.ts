import assert from "node:assert/strict";
import { test } from "node:test";

import { createRun, transition } from "../src/index";
import type {
    RunInput,
    RunState,
    TransitionResult,
} from "../src/index";

function requireSuccessfulState(result: TransitionResult): RunState {
    if (!result.ok) {
        assert.fail(`expected a successful transition: ${result.error.message}`);
    }

    return result.state;
}

function requireFailedTransition(
    result: TransitionResult,
): Extract<TransitionResult, { readonly ok: false }> {
    if (result.ok) {
        assert.fail("expected an invalid transition");
    }

    return result;
}

function createRunningState(runId = "run-1"): RunState {
    return requireSuccessfulState(
        transition(createRun(runId), { kind: "start" }),
    );
}

function createWaitingState(runId = "run-1"): RunState {
    return requireSuccessfulState(
        transition(createRunningState(runId), {
            kind: "step",
            result: { kind: "wait", reason: "等待外部事件" },
        }),
    );
}

test("advances one transition at a time through the main lifecycle", () => {
    const created = createRun("run-1");

    const running = requireSuccessfulState(
        transition(created, { kind: "start" }),
    );
    assert.equal(running.status, "running");
    assert.equal(running.stepCount, 0);
    assert.equal(running.lastStep, undefined);

    const waitResult = {
        kind: "wait",
        reason: "等待外部事件",
    } as const;
    const waiting = requireSuccessfulState(
        transition(running, { kind: "step", result: waitResult }),
    );
    assert.equal(waiting.status, "waiting");
    assert.equal(waiting.stepCount, 1);
    assert.deepEqual(waiting.lastStep, { kind: "legacy", result: waitResult });

    const resumed = requireSuccessfulState(
        transition(waiting, { kind: "resume" }),
    );
    assert.equal(resumed.status, "running");
    assert.equal(resumed.stepCount, 1);
    assert.deepEqual(resumed.lastStep, { kind: "legacy", result: waitResult });

    const completeResult = {
        kind: "complete",
        summary: "目标已经完成",
    } as const;
    const completed = requireSuccessfulState(
        transition(resumed, { kind: "step", result: completeResult }),
    );
    assert.equal(completed.status, "completed");
    assert.equal(completed.stepCount, 2);
    assert.deepEqual(completed.lastStep, { kind: "legacy", result: completeResult });
});

test("step.continue keeps the run running and increments once", () => {
    const currentState = createRunningState();
    const input = {
        kind: "step",
        result: { kind: "continue", summary: "继续执行" },
    } as const;
    const stateBefore = JSON.parse(JSON.stringify(currentState));
    const inputBefore = JSON.parse(JSON.stringify(input));

    const nextState = requireSuccessfulState(transition(currentState, input));

    assert.notStrictEqual(nextState, currentState);
    assert.equal(nextState.status, "running");
    assert.equal(nextState.stepCount, currentState.stepCount + 1);
    assert.deepEqual(nextState.lastStep, {
        kind: "legacy",
        result: input.result,
    });
    assert.deepEqual(currentState, stateBefore);
    assert.deepEqual(input, inputBefore);
});

test("step.fail moves the run to failed and increments once", () => {
    const currentState = createRunningState();
    const result = { kind: "fail", error: "工具执行失败" } as const;

    const nextState = requireSuccessfulState(
        transition(currentState, { kind: "step", result }),
    );

    assert.notStrictEqual(nextState, currentState);
    assert.equal(nextState.status, "failed");
    assert.equal(nextState.stepCount, currentState.stepCount + 1);
    assert.deepEqual(nextState.lastStep, { kind: "legacy", result });
});

test("stage_action persists a pending Action without consuming a Step", () => {
    const currentState = createRunningState();
    const input = {
        kind: "stage_action",
        checkpoint: "已确定需要读取文件",
        action: {
            actionId: "action-1",
            toolId: "read_file",
            input: { path: "README.md" },
        },
    } as const satisfies RunInput;
    const stateBefore = JSON.parse(JSON.stringify(currentState));

    const nextState = requireSuccessfulState(transition(currentState, input));

    assert.notStrictEqual(nextState, currentState);
    assert.equal(nextState.status, "running");
    assert.equal(nextState.stepCount, 0);
    assert.equal(nextState.lastStep, undefined);
    assert.equal(nextState.checkpoint, input.checkpoint);
    assert.deepEqual(nextState.pendingAction, {
        action: input.action,
        status: "approved",
    });
    assert.deepEqual(currentState, stateBefore);
    assert.deepEqual(input.action, {
        actionId: "action-1",
        toolId: "read_file",
        input: { path: "README.md" },
    });
});

test("observe_action records one Action Step and clears its pendingAction", () => {
    const staged = requireSuccessfulState(
        transition(createRunningState(), {
            kind: "stage_action",
            checkpoint: "已确定需要读取文件",
            action: {
                actionId: "action-1",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        }),
    );

    const nextState = requireSuccessfulState(
        transition(staged, {
            kind: "observe_action",
            actionId: "action-1",
            observation: {
                kind: "failure",
                code: "FILE_NOT_FOUND",
                message: "README.md 不存在",
                retryable: true,
            },
        }),
    );

    assert.equal(nextState.status, "running");
    assert.equal(nextState.stepCount, 1);
    assert.equal(nextState.pendingAction, undefined);
    assert.deepEqual(nextState.lastStep, {
        kind: "action",
        action: {
            actionId: "action-1",
            toolId: "read_file",
            input: { path: "README.md" },
        },
        observation: {
            kind: "failure",
            code: "FILE_NOT_FOUND",
            message: "README.md 不存在",
            retryable: true,
        },
    });
    assert.equal(nextState.checkpoint, "已确定需要读取文件");

    const repeated = transition(nextState, {
        kind: "observe_action",
        actionId: "action-1",
        observation: {
            kind: "success",
            output: "内容",
            summary: "读取成功",
        },
    });
    assert.equal(repeated.ok, false);
    assert.strictEqual(repeated.state, nextState);
});

test("stage_action can enter approval waiting without consuming a Step", () => {
    const nextState = requireSuccessfulState(
        transition(createRunningState(), {
            kind: "stage_action",
            checkpoint: "等待确认后读取文件",
            status: "awaiting_approval",
            action: {
                actionId: "action-approval",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        }),
    );

    assert.equal(nextState.status, "waiting");
    assert.equal(nextState.stepCount, 0);
    assert.deepEqual(nextState.pendingAction, {
        action: {
            actionId: "action-approval",
            toolId: "read_file",
            input: { path: "README.md" },
        },
        status: "awaiting_approval",
    });
});

test("reject_action records a rejected Observation as one Step", () => {
    const waiting = requireSuccessfulState(
        transition(createRunningState(), {
            kind: "stage_action",
            checkpoint: "等待用户决定",
            status: "awaiting_approval",
            action: {
                actionId: "action-reject",
                toolId: "read_file",
                input: { path: "secret.txt" },
            },
        }),
    );

    const nextState = requireSuccessfulState(
        transition(waiting, {
            kind: "reject_action",
            actionId: "action-reject",
            reason: "用户拒绝读取该文件",
        }),
    );

    assert.equal(nextState.status, "running");
    assert.equal(nextState.stepCount, 1);
    assert.equal(nextState.pendingAction, undefined);
    assert.deepEqual(nextState.lastStep, {
        kind: "action",
        action: {
            actionId: "action-reject",
            toolId: "read_file",
            input: { path: "secret.txt" },
        },
        observation: {
            kind: "rejected",
            reason: "用户拒绝读取该文件",
        },
    });
});

test("decision completes, waits, or fails with exactly one Step", () => {
    const cases = [
        {
            decision: {
                kind: "complete",
                checkpoint: "任务已经完成",
                summary: "文件内容已核对",
            },
            status: "completed",
        },
        {
            decision: {
                kind: "wait",
                checkpoint: "等待用户补充路径",
                reason: "缺少文件路径",
            },
            status: "waiting",
        },
        {
            decision: {
                kind: "fail",
                checkpoint: "任务无法继续",
                error: "缺少必要权限",
            },
            status: "failed",
        },
    ] as const;

    for (const testCase of cases) {
        const nextState = requireSuccessfulState(
            transition(createRunningState(), {
                kind: "decision",
                decision: testCase.decision,
            }),
        );

        assert.equal(nextState.status, testCase.status);
        assert.equal(nextState.stepCount, 1);
        assert.equal(nextState.pendingAction, undefined);
        assert.equal(nextState.checkpoint, testCase.decision.checkpoint);
        assert.deepEqual(nextState.lastStep, {
            kind: "decision",
            result: testCase.decision,
        });
    }
});

test("resume returns a waiting decision to running without recounting it", () => {
    const waiting = requireSuccessfulState(
        transition(createRunningState(), {
            kind: "decision",
            decision: {
                kind: "wait",
                checkpoint: "等待用户补充路径",
                reason: "缺少文件路径",
            },
        }),
    );

    const resumed = requireSuccessfulState(
        transition(waiting, { kind: "resume" }),
    );

    assert.equal(resumed.status, "running");
    assert.equal(resumed.stepCount, 1);
    assert.deepEqual(resumed.lastStep, waiting.lastStep);
    assert.equal(resumed.pendingAction, undefined);
});

test("execution_error stops without counting a Step and preserves unknown outcome", () => {
    const staged = requireSuccessfulState(
        transition(createRunningState(), {
            kind: "stage_action",
            checkpoint: "已保存待执行 Action",
            action: {
                actionId: "action-error",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        }),
    );

    const nextState = requireSuccessfulState(
        transition(staged, {
            kind: "execution_error",
            code: "TOOL_EXECUTION_ERROR",
            message: "读取进程中断",
        }),
    );

    assert.equal(nextState.status, "failed");
    assert.equal(nextState.stepCount, 0);
    assert.equal(nextState.lastStep, undefined);
    assert.deepEqual(nextState.pendingAction, {
        action: {
            actionId: "action-error",
            toolId: "read_file",
            input: { path: "README.md" },
        },
        status: "outcome_unknown",
    });
    assert.deepEqual(nextState.stopReason, {
        kind: "execution_error",
        code: "TOOL_EXECUTION_ERROR",
        message: "读取进程中断",
    });
});

test("cancel clears a staged Action without consuming a Step", () => {
    const staged = requireSuccessfulState(
        transition(createRunningState(), {
            kind: "stage_action",
            checkpoint: "准备执行",
            action: {
                actionId: "action-cancel",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        }),
    );

    const nextState = requireSuccessfulState(
        transition(staged, { kind: "cancel" }),
    );

    assert.equal(nextState.status, "cancelled");
    assert.equal(nextState.stepCount, 0);
    assert.equal(nextState.pendingAction, undefined);
    assert.equal(nextState.checkpoint, "准备执行");
});

test("rejects illegal Action/Observation combinations without changing state", () => {
    const staged = requireSuccessfulState(
        transition(createRunningState(), {
            kind: "stage_action",
            checkpoint: "已暂存 Action",
            action: {
                actionId: "action-illegal",
                toolId: "read_file",
                input: { path: "README.md" },
            },
        }),
    );

    const cases: readonly RunInput[] = [
        {
            kind: "stage_action",
            checkpoint: "重复暂存",
            action: {
                actionId: "action-other",
                toolId: "read_file",
                input: { path: "other.md" },
            },
        },
        {
            kind: "observe_action",
            actionId: "wrong-action",
            observation: {
                kind: "success",
                output: "内容",
                summary: "读取成功",
            },
        },
        {
            kind: "decision",
            decision: {
                kind: "complete",
                checkpoint: "不应结束",
                summary: "仍有 Action 未完成",
            },
        },
        {
            kind: "step",
            result: { kind: "continue", summary: "不应混用旧协议" },
        },
    ];

    for (const input of cases) {
        const result = transition(staged, input);

        assert.equal(result.ok, false, input.kind);
        assert.strictEqual(result.state, staged, input.kind);
        assert.equal(result.error.code, "INVALID_TRANSITION");
    }

    const emptyCheckpoint = transition(createRunningState(), {
        kind: "stage_action",
        checkpoint: "   ",
        action: {
            actionId: "action-empty",
            toolId: "read_file",
            input: { path: "README.md" },
        },
    });
    assert.equal(emptyCheckpoint.ok, false);
});

const cancellationCases: ReadonlyArray<{
    readonly status: "created" | "running" | "waiting";
    readonly createState: () => RunState;
}> = [
    {
        status: "created",
        createState: () => createRun("run-created"),
    },
    {
        status: "running",
        createState: () => createRunningState("run-running"),
    },
    {
        status: "waiting",
        createState: () => createWaitingState("run-waiting"),
    },
];

for (const cancellationCase of cancellationCases) {
    test(`cancel moves ${cancellationCase.status} to cancelled without counting a step`, () => {
        const currentState = cancellationCase.createState();

        const nextState = requireSuccessfulState(
            transition(currentState, { kind: "cancel" }),
        );

        assert.notStrictEqual(nextState, currentState);
        assert.equal(nextState.status, "cancelled");
        assert.equal(nextState.stepCount, currentState.stepCount);
        assert.deepEqual(nextState.lastStep, currentState.lastStep);
    });
}

test("an invalid non-terminal transition returns the original state and error", () => {
    const currentState = createRunningState();
    const input = { kind: "resume" } as const satisfies RunInput;
    const stateBefore = JSON.parse(JSON.stringify(currentState));
    const inputBefore = JSON.parse(JSON.stringify(input));

    const result = requireFailedTransition(transition(currentState, input));

    assert.equal(result.error.code, "INVALID_TRANSITION");
    assert.ok(result.error.message.length > 0);
    assert.strictEqual(result.state, currentState);
    assert.deepEqual(currentState, stateBefore);
    assert.deepEqual(input, inputBefore);
});

const terminalStates: readonly RunState[] = [
    {
        ...createRun("run-completed"),
        status: "completed",
        stepCount: 1,
        lastStep: {
            kind: "legacy",
            result: { kind: "complete", summary: "已完成" },
        },
    },
    {
        ...createRun("run-failed"),
        status: "failed",
        stepCount: 1,
        lastStep: {
            kind: "legacy",
            result: { kind: "fail", error: "执行失败" },
        },
    },
    {
        ...createRun("run-cancelled"),
        status: "cancelled",
    },
];

for (const terminalState of terminalStates) {
    test(`${terminalState.status} rejects further input`, () => {
        const result = requireFailedTransition(
            transition(terminalState, { kind: "start" }),
        );

        assert.equal(result.error.code, "INVALID_TRANSITION");
        assert.strictEqual(result.state, terminalState);
    });
}
