import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    projectInteractionView,
    readInteractionDetail,
    type AgentProfile,
    type Goal,
    type PendingAction,
    type PendingInteraction,
} from "../src/index";
import { currentProtocols } from "./current-fixtures";

const profile: AgentProfile = {
    id: "interaction-view-profile",
    systemPrompt: "Test",
    instructions: ["Test"],
    toolIds: [],
};

function baseGoal(): Goal {
    return createGoal({
        id: "goal-interaction-view",
        intent: "完成用户需求",
        promptBundleVersion: 1,
        profile,
        runId: "run-interaction-view",
        ...currentProtocols,
    });
}

function waitingGoal(
    pendingInteraction?: PendingInteraction,
    pendingAction?: PendingAction,
    pendingProgram?: Goal["state"]["run"]["pendingProgram"],
): Goal {
    const goal = baseGoal();
    return {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status: "waiting",
                ...(pendingInteraction === undefined ? {} : { pendingInteraction }),
                ...(pendingAction === undefined ? {} : { pendingAction }),
                ...(pendingProgram === undefined ? {} : { pendingProgram }),
            },
        },
    };
}

const askUserInteraction: PendingInteraction = {
    kind: "ask_user",
    requestId: "ask-1",
    mode: "plan",
    questions: [
        {
            id: "q-1",
            header: "Scope",
            question: "Which scope should be delivered?",
            multiSelect: false,
            options: [
                { id: "o-1", label: "Approve expanded route" },
                { id: "o-2", label: "Keep current route" },
            ],
        },
    ],
};

test("问答等待派生 question 视图并保留路线审批标记", () => {
    const goal = waitingGoal({
        ...askUserInteraction,
        routeRevision: {
            baseRevision: 1,
            candidate: {
                stages: [{ target: "完成修复", acceptanceCriteria: ["行为正确"] }],
            },
            reason: "调查发现要求扩大",
            approvalRequest: "是否批准扩展后的路线？",
            approvalOptionId: "o-1",
        },
    });

    const view = projectInteractionView(goal);
    assert.equal(view?.kind, "question");
    assert.ok(view !== undefined && view.kind === "question");
    assert.equal(view.goalId, goal.id);
    assert.equal(view.runId, goal.state.run.id);
    assert.equal(view.requestId, "ask-1");
    assert.equal(view.interactionId, "question:ask-1");
    assert.equal(view.routeApproval, true);
    assert.deepEqual([...view.decisions], ["answer_questions", "reply_to_question", "skip_question"]);
});

test("普通问答视图不标记路线审批，问题正文只从详情读取", () => {
    const goal = waitingGoal(askUserInteraction);
    const view = projectInteractionView(goal);
    assert.equal(view?.kind, "question");
    assert.ok(view !== undefined && view.kind === "question");
    assert.equal(view.routeApproval, false);
    assert.equal(Object.hasOwn(view, "questions"), false);

    const detail = readInteractionDetail(goal, { runId: goal.state.run.id, interactionId: view.interactionId });
    assert.equal(detail.ok, true);
    assert.ok(detail.ok && detail.detail.kind === "question");
    assert.deepEqual(detail.detail.questions, askUserInteraction.questions);
    assert.equal(detail.detail.routeRevision, undefined);
});

test("任务审批视图报告阶段数量，详情给出完整目标与有序路线", () => {
    const goal = waitingGoal({
        kind: "task_approval",
        requestId: "proposal-1",
        proposal: {
            objective: "实现导入功能",
            completionCriteria: [{ text: "导入成功" }, { text: "错误可读" }],
        },
        planRouteCandidate: {
            stages: [
                { target: "实现解析", acceptanceCriteria: ["解析覆盖主要格式"] },
                { target: "接入界面", acceptanceCriteria: ["界面可提交"] },
            ],
        },
        approvalRequest: "请确认任务目标",
    });

    const view = projectInteractionView(goal);
    assert.equal(view?.kind, "task_approval");
    assert.ok(view !== undefined && view.kind === "task_approval");
    assert.equal(view.interactionId, "task_approval:proposal-1");
    assert.equal(view.stageCount, 2);
    assert.deepEqual([...view.decisions], ["approve_task", "send_task_feedback"]);

    const detail = readInteractionDetail(goal, { runId: goal.state.run.id, interactionId: view.interactionId });
    assert.ok(detail.ok && detail.detail.kind === "task_approval");
    assert.equal(detail.detail.objective, "实现导入功能");
    assert.deepEqual([...detail.detail.completionCriteria], ["导入成功", "错误可读"]);
    assert.deepEqual(
        detail.detail.stages.map((stage) => stage.target),
        ["实现解析", "接入界面"],
    );
    assert.deepEqual([...detail.detail.stages[0]!.acceptanceCriteria], ["解析覆盖主要格式"]);
});

test("工具审批视图区分审批类别与可用期限，详情返回完整 canonical 输入", () => {
    const goal = waitingGoal(undefined, {
        action: { actionId: "act-1", toolId: "bash", input: { command: "npm test" } },
        status: "awaiting_approval",
        approvalKind: "sandbox",
        effectiveSandboxScope: {
            extraFiles: [{ canonicalPath: "/tmp/data", access: "read", kind: "file" }],
            network: "none",
        },
    });

    const view = projectInteractionView(goal);
    assert.equal(view?.kind, "action_approval");
    assert.ok(view !== undefined && view.kind === "action_approval");
    assert.equal(view.interactionId, "action_approval:act-1");
    assert.equal(view.actionId, "act-1");
    assert.equal(view.toolId, "bash");
    assert.equal(view.approvalKind, "sandbox");
    assert.equal(view.fromProgram, false);
    assert.deepEqual([...view.scopeOptions], ["action", "goal", "workspace"]);
    assert.deepEqual([...view.decisions], ["approve_action", "reject_action"]);

    const detail = readInteractionDetail(goal, { runId: goal.state.run.id, interactionId: view.interactionId });
    assert.ok(detail.ok && detail.detail.kind === "action_approval");
    assert.deepEqual(detail.detail.input, { command: "npm test" });
    assert.equal(detail.detail.approvalKind, "sandbox");
    assert.equal(detail.detail.effectiveSandboxScope?.extraFiles.length, 1);
});

test("未知结果恢复视图只允许单次重试或拒绝，并保留程序来源", () => {
    const goal = waitingGoal(
        undefined,
        {
            action: { actionId: "act-2", toolId: "write_file", input: { path: "a.txt", content: "x" } },
            status: "outcome_unknown",
            approvalKind: "tool",
            attemptsStarted: 1,
        },
        {
            programId: "program-1",
            action: { actionId: "act-2", toolId: "write_file", input: { path: "a.txt", content: "x" } },
            executionUnitId: "unit-1",
            codeHash: "code",
            workerHash: "worker",
            nodeVersion: "v22",
            fixedTime: 0,
            seed: 1,
            nextCallIndex: 0,
            resultBytes: 0,
        },
    );

    const view = projectInteractionView(goal);
    assert.equal(view?.kind, "action_recovery");
    assert.ok(view !== undefined && view.kind === "action_recovery");
    assert.equal(view.interactionId, "action_recovery:act-2");
    assert.deepEqual([...view.scopeOptions], ["action"]);
    assert.equal(view.fromProgram, true);
    assert.deepEqual([...view.decisions], ["retry_action", "reject_action"]);

    const detail = readInteractionDetail(goal, { runId: goal.state.run.id, interactionId: view.interactionId });
    assert.ok(detail.ok && detail.detail.kind === "action_recovery");
    assert.deepEqual(detail.detail.parentProgram, { actionId: "act-2", callNumber: 1 });
});

test("等待之外、已批准 Action 与未提交等待都不产生交互视图", () => {
    const base = baseGoal();
    assert.equal(projectInteractionView(base), undefined);

    const approved = waitingGoal(undefined, {
        action: { actionId: "act-3", toolId: "bash", input: { command: "ls" } },
        status: "approved",
    });
    assert.equal(projectInteractionView(approved), undefined);

    const completed: Goal = {
        ...base,
        state: { ...base.state, run: { ...base.state.run, status: "completed", pendingInteraction: askUserInteraction } },
    };
    assert.equal(projectInteractionView(completed), undefined);
});

test("重复同步与重建快照得到同一引用，读取不改变 Goal", () => {
    const goal = waitingGoal(askUserInteraction);
    const first = projectInteractionView(goal);
    const rebuilt: Goal = JSON.parse(JSON.stringify(goal)) as Goal;
    const second = projectInteractionView(rebuilt);
    assert.equal(first?.interactionId, second?.interactionId);
    assert.equal(first?.runId, second?.runId);
    assert.deepEqual(rebuilt, goal);
});

test("过期 Run／请求引用与已失效等待的详情读取明确拒绝且不返回其他 Action", () => {
    const goal = waitingGoal(undefined, {
        action: { actionId: "act-current", toolId: "bash", input: { command: "npm test" } },
        status: "awaiting_approval",
    });
    const view = projectInteractionView(goal);
    assert.ok(view !== undefined);

    const staleRun = readInteractionDetail(goal, { runId: "run-other", interactionId: view.interactionId });
    assert.equal(staleRun.ok, false);
    assert.ok(!staleRun.ok && staleRun.code === "INTERACTION_MISMATCH");

    const staleInteraction = readInteractionDetail(goal, {
        runId: goal.state.run.id,
        interactionId: "action_approval:act-other",
    });
    assert.equal(staleInteraction.ok, false);
    assert.ok(!staleInteraction.ok && staleInteraction.code === "INTERACTION_MISMATCH");

    const decided = waitingGoal(askUserInteraction);
    const decidedView = projectInteractionView(decided);
    assert.ok(decidedView !== undefined);
    const { pendingInteraction: _decidedInteraction, ...decidedRun } = decided.state.run;
    const afterDecision: Goal = {
        ...decided,
        state: { ...decided.state, run: { ...decidedRun, status: "running" } },
    };
    const expired = readInteractionDetail(afterDecision, {
        runId: afterDecision.state.run.id,
        interactionId: decidedView.interactionId,
    });
    assert.equal(expired.ok, false);
    assert.ok(!expired.ok && expired.code === "INTERACTION_NOT_WAITING");
});

test("详情读取的 Action 输入与程序来源为快照副本，修改结果不影响快照", () => {
    const goal = waitingGoal(undefined, {
        action: { actionId: "act-4", toolId: "write_file", input: { path: "a.txt", content: "x" } },
        status: "awaiting_approval",
    });
    const detail = readInteractionDetail(goal, {
        runId: goal.state.run.id,
        interactionId: "action_approval:act-4",
    });
    assert.ok(detail.ok && detail.detail.kind === "action_approval");
    (detail.detail.input as { content: string }).content = "changed";
    assert.deepEqual(goal.state.run.pendingAction?.action.input, { path: "a.txt", content: "x" });
});
