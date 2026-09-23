import assert from "node:assert/strict";
import { test } from "node:test";
import { contract } from "../src/contract";
import { ContractValidationError } from "../src/errors";
import {
    createCheckpointToolDeclarations,
    createExecutingToolDeclarations,
    createUnifiedToolDeclarations,
    decodePhaseToolCall,
    SystemCompleteTaskDeclaration,
    SystemCompleteRunDeclaration,
    SystemWaitForInputDeclaration,
    SystemFailGoalDeclaration,
    SystemAskUserDeclaration,
    SystemContextLookupDeclaration,
    SystemProposeTaskPlanDeclaration,
    SystemUpdateGoalPlanDeclaration,
} from "../src/index";

test("系统函数具有严格的参数 JSON Schema 定义", () => {
    for (const decl of [
        SystemCompleteTaskDeclaration,
        SystemCompleteRunDeclaration,
        SystemWaitForInputDeclaration,
        SystemFailGoalDeclaration,
        SystemAskUserDeclaration,
        SystemContextLookupDeclaration,
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
    if (completeDecision.kind === "complete" && "completionEvidence" in completeDecision) {
        assert.equal(completeDecision.summary, "Task finished");
        assert.equal(completeDecision.completionEvidence.length, 1);
        assert.equal(completeDecision.memoryPatch, undefined);
    }
});

test("Plan 提案前保留全部授权业务工具，但系统决策仅允许提案和交互", () => {
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

    const decls = createUnifiedToolDeclarations(mixedTools, false, true);
    const ids = decls.map(d => d.id);

    assert.ok(ids.includes("read_file"));
    assert.ok(ids.includes("write_file"), "Run 模式本身不新增业务 Tool 门控");
    assert.ok(ids.includes("ask_user"));
    assert.ok(ids.includes("system_propose_task_plan"));
    assert.ok(ids.includes("system_context_lookup"));

    // Profile 已授权的业务工具仍作为普通 tool_call。
    const read = decodePhaseToolCall(decls, "read_file", { path: "README.md" });
    assert.equal(read.kind, "tool_call");
    if (read.kind === "tool_call") {
        assert.equal(read.action.toolId, "read_file");
        assert.deepEqual(read.action.input, { path: "README.md" });
    }

    // 验证结构化提问被解码为 ask_user
    const q = decodePhaseToolCall(decls, "ask_user", {
        questions: [{
            header: "范围",
            question: "请确认需求范围？",
            options: [{ label: "仓库" }, { label: "单包" }],
            multiSelect: false,
        }],
        memoryPatch: null,
    });
    assert.equal(q.kind, "ask_user");
    if (q.kind === "ask_user") {
        assert.equal(q.questions[0]?.question, "请确认需求范围？");
    }
});

test("Plan 提案前挂载获授权读取与任务提案工具", () => {
    const decls = createUnifiedToolDeclarations([
        {
            id: "grep",
            inputContract: contract.object({ pattern: contract.string() }),
            isReadOnly: true,
        },
    ], false, true);
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

test("system_update_goal_plan 按独立模式能力暴露并保留 Memory Patch", () => {
    const normal = createUnifiedToolDeclarations([], false, false);
    assert.equal(normal.some((decl) => decl.id === "system_update_goal_plan"), false);

    const plan = createUnifiedToolDeclarations([], false, true);
    assert.equal(plan.some((decl) => decl.id === "system_update_goal_plan"), true);

    const writableNormal = createUnifiedToolDeclarations([], false, false, true);
    assert.equal(writableNormal.some((decl) => decl.id === "system_update_goal_plan"), true);

    const decision = decodePhaseToolCall(writableNormal, "system_update_goal_plan", {
        baseRevision: 0,
        operations: [{ type: "add", content: "检查现有实现", position: null }],
        memoryPatch: {
            protocolVersion: 1,
            operations: [{
                type: "create_hypothesis",
                hypothesis: { statement: "入口可能在 src/index.ts" },
            }],
        },
    });
    assert.equal(decision.kind, "goal_plan_update");
    if (decision.kind === "goal_plan_update") {
        assert.deepEqual(decision.operations, [{ type: "add", content: "检查现有实现" }]);
        assert.equal(decision.memoryPatch?.operations.length, 1);
    }

    const completion = decodePhaseToolCall(writableNormal, "system_update_goal_plan", {
        baseRevision: 1,
        operations: [{ type: "update", id: "todo-1", status: "completed", evidenceSequences: [12] }],
        memoryPatch: null,
    });
    assert.equal(completion.kind, "goal_plan_update");
    if (completion.kind === "goal_plan_update") {
        assert.deepEqual(completion.operations, [{
            type: "update", id: "todo-1", status: "completed", evidenceSequences: [12],
        }]);
    }
});

test("普通 Run 完成声明使用当前 Run 证据序列", () => {
    const normal = createUnifiedToolDeclarations([], false, false);
    const decision = decodePhaseToolCall(normal, "system_complete_task", {
        summary: "Request completed",
        evidenceSequences: [4],
        memoryPatch: null,
    });
    assert.equal(decision.kind, "complete");
    if (decision.kind === "complete" && "evidenceSequences" in decision) {
        assert.deepEqual(decision.evidenceSequences, [4]);
        assert.equal("completionEvidence" in decision, false);
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
