import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createBoundModelOutputContractBundle,
    modelOutputBindings,
    validateModelOutputSemantics,
} from "../src/index";

test("validateModelOutputSemantics 拦截空白文本语义且不 trim 输入", () => {
    // 空白 ask_user 字段
    const blankQuestion = {
        kind: "ask_user",
        questions: [{
            header: "   ",
            question: "   \t\n  ",
            options: [{ label: "A" }, { label: "B" }],
            multiSelect: false,
        }],
    };
    const questionIssues = validateModelOutputSemantics(blankQuestion);
    assert.equal(questionIssues.length, 2);
    assert.equal(questionIssues[0]?.code, "blank_string");
    assert.deepEqual(questionIssues[0]?.path, ["questions", 0, "header"]);
    assert.deepEqual(questionIssues[1]?.path, ["questions", 0, "question"]);
    // 输入本身保持原文未被修改或 trim
    assert.equal(blankQuestion.questions[0]!.question, "   \t\n  ");

    // 空白 task proposal 字段
    const blankTask = {
        kind: "task_proposal",
        approvalRequest: "   ",
        task: {
            objective: "",
            completionCriteria: [{ text: "标准 1" }, { text: "  ", acceptance: { expectToolId: "  ", expectOutcome: "success" } }],
        },
        planRoute: { stages: [{ target: "调查", acceptanceCriteria: ["定位入口"] }] },
    };
    const taskIssues = validateModelOutputSemantics(blankTask);
    assert.equal(taskIssues.length, 4);
    assert.equal(taskIssues.some((i) => i.path.join(".") === "approvalRequest"), true);
    assert.equal(taskIssues.some((i) => i.path.join(".") === "task.objective"), true);
    assert.equal(taskIssues.some((i) => i.path.join(".") === "task.completionCriteria.1.text"), true);
    assert.equal(taskIssues.some((i) => i.path.join(".") === "task.completionCriteria.1.acceptance.expectToolId"), true);

    // 空白 Action 字段
    const blankAction = {
        kind: "tool_call",
        action: {
            actionId: "  ",
            toolId: "",
            input: {},
        },
    };
    const actionIssues = validateModelOutputSemantics(blankAction);
    assert.equal(actionIssues.length, 2);
    assert.equal(actionIssues.some((i) => i.path.join(".") === "action.actionId"), true);
    assert.equal(actionIssues.some((i) => i.path.join(".") === "action.toolId"), true);

    // 非法系统工具作为 expectToolId
    const systemToolTask = {
        kind: "task_proposal",
        approvalRequest: "请确认",
        task: {
            objective: "分析规范",
            completionCriteria: [
                { text: "总结分析", acceptance: { expectToolId: "system_complete_task", expectOutcome: "success" } },
            ],
        },
        planRoute: { stages: [{ target: "分析", acceptanceCriteria: ["列出发现"] }] },
    };
    const systemToolIssues = validateModelOutputSemantics(systemToolTask);
    assert.equal(systemToolIssues.length, 1);
    assert.equal(systemToolIssues[0]?.code, "invalid_tool_id");
    assert.match(systemToolIssues[0]?.message ?? "", /must not be a system function/);
});

test("validateModelOutputSemantics 拦截反转 sequenceRange 和无变更 update 操作", () => {
    // 反转 sequenceRange
    const invertedLookup = {
        kind: "context_lookup",
        need: "historical_execution",
        question: "查什么？",
        filters: {
            sequenceRange: { from: 10, to: 5 },
        },
    };
    const rangeIssues = validateModelOutputSemantics(invertedLookup);
    assert.equal(rangeIssues.length, 1);
    assert.equal(rangeIssues[0]?.code, "invalid_sequence_range");
    assert.deepEqual(rangeIssues[0]?.path, ["filters", "sequenceRange"]);

    // 无变更 update_hypothesis
    const emptyUpdateHypo = {
        protocolVersion: 1,
        operations: [
            {
                type: "update_hypothesis",
                hypothesis: { id: "hypo-1" },
            },
        ],
    };
    const hypoIssues = validateModelOutputSemantics(emptyUpdateHypo);
    assert.equal(hypoIssues.length, 1);
    assert.equal(hypoIssues[0]?.code, "empty_update");
    assert.deepEqual(hypoIssues[0]?.path, ["operations", 0, "hypothesis"]);

    // 无变更 update_blocker
    const emptyUpdateBlocker = {
        protocolVersion: 1,
        operations: [
            {
                type: "update_blocker",
                blocker: { id: "blocker-1" },
            },
        ],
    };
    const blockerIssues = validateModelOutputSemantics(emptyUpdateBlocker);
    assert.equal(blockerIssues.length, 1);
    assert.equal(blockerIssues[0]?.code, "empty_update");
    assert.deepEqual(blockerIssues[0]?.path, ["operations", 0, "blocker"]);

    // 提供了变更字段时无问题
    const validUpdate = {
        protocolVersion: 1,
        operations: [
            {
                type: "update_hypothesis",
                hypothesis: { id: "hypo-1", status: "resolved" },
            },
            {
                type: "update_blocker",
                blocker: { id: "blocker-1", status: "active" },
            },
        ],
    };
    assert.deepEqual(validateModelOutputSemantics(validUpdate), []);
});

test("GoalPlan 更新由独立写入能力授权，且保留独立 Working Memory Patch", () => {
    const decision = {
        kind: "goal_plan_update" as const,
        baseRevision: 0,
        operations: [{ type: "add" as const, content: "检查实现" }],
        memoryPatch: {
            protocolVersion: 1 as const,
            operations: [{
                type: "create_hypothesis" as const,
                hypothesis: { statement: "需要先确认入口" },
            }],
        },
    };

    const normalBundle = createBoundModelOutputContractBundle({
        kind: "executing",
        taskPresent: true,
        planMode: false,
    }, modelOutputBindings);
    assert.equal(JSON.stringify(normalBundle.jsonSchema).includes("goal_plan_update"), false);
    assert.throws(() => normalBundle.decode({ result: decision }));

    const planBundle = createBoundModelOutputContractBundle({
        kind: "executing",
        taskPresent: true,
        planMode: true,
    }, modelOutputBindings);
    assert.equal(JSON.stringify(planBundle.jsonSchema).includes("goal_plan_update"), true);
    const decoded = planBundle.decode({
        result: {
            ...decision,
            operations: [{ type: "add", content: "检查实现", position: null }],
            memoryPatch: null,
        },
    });
    assert.equal(decoded.kind, "goal_plan_update");
    if (decoded.kind === "goal_plan_update") {
        assert.equal(decoded.baseRevision, 0);
        assert.deepEqual(decoded.operations, [{ type: "add", content: "检查实现" }]);
    }

    const writableNormalBundle = createBoundModelOutputContractBundle({
        kind: "executing",
        taskPresent: true,
        planMode: false,
        goalPlanWritable: true,
    }, modelOutputBindings);
    assert.equal(JSON.stringify(writableNormalBundle.jsonSchema).includes("goal_plan_update"), true);
    assert.equal(writableNormalBundle.name, "normal_goal_plan_writable_executing_agent_decision");
    assert.equal(writableNormalBundle.decode({
        result: {
            ...decision,
            operations: [{ type: "add", content: "检查实现", position: null }],
            memoryPatch: null,
        },
    }).kind, "goal_plan_update");

    const readOnlyPlanBundle = createBoundModelOutputContractBundle({
        kind: "executing",
        taskPresent: true,
        planMode: true,
        goalPlanWritable: false,
    }, modelOutputBindings);
    assert.equal(JSON.stringify(readOnlyPlanBundle.jsonSchema).includes("goal_plan_update"), false);
    assert.equal(readOnlyPlanBundle.name, "plan_mode_approved_executing_agent_decision_goal_plan_read_only");
});

test("GoalPlan 完成操作必须带非空证据，其他状态不得携带证据", () => {
    const missingEvidence = {
        kind: "goal_plan_update",
        baseRevision: 1,
        operations: [{ type: "update", id: "todo-1", status: "completed" }],
    };
    const missingIssues = validateModelOutputSemantics(missingEvidence);
    assert.equal(missingIssues.length, 1);
    assert.equal(missingIssues[0]?.code, "invalid_evidence_reference");
    assert.deepEqual(missingIssues[0]?.path, ["operations", 0, "evidenceSequences"]);

    const evidenceWithoutCompletion = {
        kind: "goal_plan_update",
        baseRevision: 1,
        operations: [{ type: "update", id: "todo-1", content: "重写内容", evidenceSequences: [7] }],
    };
    assert.equal(validateModelOutputSemantics(evidenceWithoutCompletion)[0]?.code, "invalid_evidence_reference");
    assert.deepEqual(validateModelOutputSemantics({
        kind: "goal_plan_update",
        baseRevision: 1,
        operations: [{ type: "update", id: "todo-1", status: "completed", evidenceSequences: [7] }],
    }), []);
});
