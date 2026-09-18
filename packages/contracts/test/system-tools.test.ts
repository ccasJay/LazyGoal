import assert from "node:assert/strict";
import { test } from "node:test";
import { contract } from "../src/contract";
import { ContractValidationError } from "../src/errors";
import {
    createCheckpointToolDeclarations,
    createExecutingToolDeclarations,
    createGatheringToolDeclarations,
    createPlanningToolDeclarations,
    decodePhaseToolCall,
    SystemCompleteTaskDeclaration,
    SystemWaitForInputDeclaration,
    SystemFailGoalDeclaration,
    SystemAskClarificationDeclaration,
    SystemContextReadyDeclaration,
    SystemProposeTaskPlanDeclaration,
} from "../src/index";

test("系统函数具有严格的参数 JSON Schema 定义", () => {
    for (const decl of [
        SystemCompleteTaskDeclaration,
        SystemWaitForInputDeclaration,
        SystemFailGoalDeclaration,
        SystemAskClarificationDeclaration,
        SystemContextReadyDeclaration,
        SystemProposeTaskPlanDeclaration,
    ]) {
        assert.equal(decl.parametersSchema.type, "object");
        assert.equal(decl.parametersSchema.additionalProperties, false);
        assert.ok(Array.isArray(decl.parametersSchema.required));
        assert.ok(decl.description.length > 0);
    }
});

test("Executing 阶段工具集合包含业务工具与系统终态工具", () => {
    const businessTools = [
        {
            id: "read_file",
            inputContract: contract.object({
                path: contract.string(),
            }),
            isReadOnly: true,
        },
        {
            id: "write_file",
            inputContract: contract.object({
                path: contract.string(),
                content: contract.string(),
            }),
        },
    ];

    const decls = createExecutingToolDeclarations(businessTools);
    const ids = decls.map(d => d.id);

    assert.ok(ids.includes("read_file"));
    assert.ok(ids.includes("write_file"));
    assert.ok(ids.includes("system_complete_task"));
    assert.ok(ids.includes("system_wait_for_input"));
    assert.ok(ids.includes("system_fail_goal"));
    assert.ok(ids.includes("system_context_lookup"));

    // 验证调用业务工具正确解码为 tool_call 并携带合规唯一的 actionId
    const decision = decodePhaseToolCall(decls, "read_file", { path: "src/index.ts" });
    assert.equal(decision.kind, "tool_call");
    if (decision.kind === "tool_call") {
        assert.equal(decision.action.toolId, "read_file");
        assert.deepEqual(decision.action.input, { path: "src/index.ts" });
        assert.ok(typeof decision.action.actionId === "string" && decision.action.actionId.trim().length > 0);
        assert.match(decision.action.actionId, /^action-read_file-/);
    }

    // 验证调用 system_complete_task 正确解码为 complete 决策
    const completeDecision = decodePhaseToolCall(decls, "system_complete_task", {
        summary: "Task finished",
        completionEvidence: [{ criterionIndex: 0, evidenceSequences: [1, 2] }],
        memoryPatch: null,
    });
    assert.equal(completeDecision.kind, "complete");
    if (completeDecision.kind === "complete") {
        assert.equal(completeDecision.summary, "Task finished");
        assert.equal(completeDecision.completionEvidence.length, 1);
        assert.equal(completeDecision.memoryPatch, undefined);
    }
});

test("Gathering 阶段仅挂载只读探测工具与需求澄清系统工具", () => {
    const mixedTools = [
        {
            id: "read_file",
            inputContract: contract.object({ path: contract.string() }),
            isReadOnly: true,
        },
        {
            id: "write_file",
            inputContract: contract.object({ path: contract.string(), content: contract.string() }),
            isReadOnly: false,
        },
    ];

    const decls = createGatheringToolDeclarations(mixedTools);
    const ids = decls.map(d => d.id);

    assert.ok(ids.includes("read_file"));
    assert.ok(!ids.includes("write_file"), "写工具绝不可出现在 Gathering 阶段");
    assert.ok(ids.includes("system_ask_clarification"));
    assert.ok(ids.includes("system_context_ready"));
    assert.ok(ids.includes("system_context_lookup"));

    // 验证只读工具在准备阶段被解码为 probe_action
    const probe = decodePhaseToolCall(decls, "read_file", { path: "README.md" });
    assert.equal(probe.kind, "probe_action");
    if (probe.kind === "probe_action") {
        assert.equal(probe.action.toolId, "read_file");
        assert.deepEqual(probe.action.input, { path: "README.md" });
    }

    // 验证提问被解码为 question
    const q = decodePhaseToolCall(decls, "system_ask_clarification", {
        question: "请确认需求范围？",
        memoryPatch: null,
    });
    assert.equal(q.kind, "question");
    if (q.kind === "question") {
        assert.equal(q.question, "请确认需求范围？");
    }
});

test("Planning 阶段挂载只读探测工具与任务提案工具", () => {
    const decls = createPlanningToolDeclarations([
        {
            id: "grep",
            inputContract: contract.object({ pattern: contract.string() }),
            isReadOnly: true,
        },
    ]);
    const ids = decls.map(d => d.id);

    assert.ok(ids.includes("grep"));
    assert.ok(ids.includes("system_propose_task_plan"));
    assert.ok(ids.includes("system_context_lookup"));

    const proposal = decodePhaseToolCall(decls, "system_propose_task_plan", {
        task: {
            objective: "构建新特性",
            completionCriteria: [{ text: "单测通过" }],
        },
        approvalRequest: "是否批准计划？",
        memoryPatch: null,
    });
    assert.equal(proposal.kind, "task_proposal");
    if (proposal.kind === "task_proposal") {
        assert.equal(proposal.task.objective, "构建新特性");
        assert.equal(proposal.approvalRequest, "是否批准计划？");
    }
});

test("Checkpoint 阶段挂载检查点保存工具", () => {
    const decls = createCheckpointToolDeclarations();
    assert.equal(decls.length, 1);
    assert.equal(decls[0]!.id, "system_context_checkpoint");

    const checkpoint = decodePhaseToolCall(decls, "system_context_checkpoint", {
        checkpointSummary: "上下文过长归档",
        memoryPatch: null,
    });
    assert.equal(checkpoint.kind, "context_checkpoint");
});

test("decodePhaseToolCall 对非法入参和未知工具抛出 ContractValidationError", () => {
    const decls = createExecutingToolDeclarations([]);

    // 1. 未知工具
    assert.throws(
        () => decodePhaseToolCall(decls, "unknown_tool", {}),
        (err: unknown) => {
            assert.ok(err instanceof ContractValidationError);
            assert.ok(err.issues.some(i => i.message.includes("Unauthorized or unknown tool")));
            return true;
        },
    );

    // 2. 缺失必填字段
    assert.throws(
        () => decodePhaseToolCall(decls, "system_complete_task", { summary: "done" }), // 缺失 completionEvidence
        (err: unknown) => {
            assert.ok(err instanceof ContractValidationError);
            assert.ok(err.issues.some(i => i.path.includes("completionEvidence")));
            return true;
        },
    );
});
