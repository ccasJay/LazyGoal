import assert from "node:assert/strict";
import { test } from "node:test";

import {
    AgentDecisionContract,
    ContextLookupRequestContract,
    ExecutingWorkingMemoryPatchContract,
    FactProposalContract,
    GoalTaskContract,
    PlanModeExecutingDecisionContract,
    GoalPlanUpdateAgentDecisionContract,
    StructuredAgentDecisionContract,
    ToolCallActionContract,
    WorkingMemoryPatchContract,
    contract,
    createModelOutputContractBundle,
    isReadOnlyToolContract,
    safeParse,
    validateModelOutputSemantics,
    type AuthorizedToolContract,
} from "../src/index";

test("GoalTaskContract 校验并深复制合法任务结构", () => {
    const original = {
        objective: "设计系统架构",
        completionCriteria: [
            { text: "文档编写完成" },
            { text: "通过评审", acceptance: { expectToolId: "bash", expectOutcome: "success" as const } },
        ],
    };
    const parsed = safeParse(GoalTaskContract, original);
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.deepEqual(parsed.data, original);
    assert.notStrictEqual(parsed.data, original);
    assert.notStrictEqual(parsed.data.completionCriteria, original.completionCriteria);

    original.completionCriteria.push({ text: "恶意修改" });
    assert.equal(parsed.data.completionCriteria.length, 2);
});

test("tool_discovery 接受有界非空查询并拒绝空白查询", () => {
    const valid = { kind: "tool_discovery", query: "read file" };
    assert.equal(safeParse(AgentDecisionContract, valid).success, true);
    assert.equal(validateModelOutputSemantics(valid).length, 0);
    const blank = { kind: "tool_discovery", query: "   " };
    assert.equal(safeParse(AgentDecisionContract, blank).success, true);
    assert.equal(validateModelOutputSemantics(blank).length, 1);
    const oversized = {
        kind: "tool_discovery",
        query: "x".repeat(513),
    };
    assert.equal(safeParse(AgentDecisionContract, oversized).success, true);
    assert.equal(validateModelOutputSemantics(oversized).length, 1);
});

test("FactProposalContract 仅接受标量与一维标量数组（Req 2.5）", () => {
    const baseProposal = {
        subject: "config.json",
        predicate: "exists",
        stability: "stable" as const,
        evidenceSequences: [1],
    };

    // 合法标量
    assert.equal(safeParse(FactProposalContract, { ...baseProposal, value: "string_value" }).success, true);
    assert.equal(safeParse(FactProposalContract, { ...baseProposal, value: 42 }).success, true);
    assert.equal(safeParse(FactProposalContract, { ...baseProposal, value: true }).success, true);
    assert.equal(safeParse(FactProposalContract, { ...baseProposal, value: null }).success, true);

    // 合法一维标量数组
    assert.equal(safeParse(FactProposalContract, { ...baseProposal, value: ["a", 1, false, null] }).success, true);
    assert.equal(safeParse(FactProposalContract, { ...baseProposal, value: [] }).success, true);

    // 拒绝对象
    const objectValueResult = safeParse(FactProposalContract, { ...baseProposal, value: { nested: true } });
    assert.equal(objectValueResult.success, false);

    // 拒绝嵌套数组
    const nestedArrayResult = safeParse(FactProposalContract, { ...baseProposal, value: [["nested"]] });
    assert.equal(nestedArrayResult.success, false);

    const arrayWithObjectResult = safeParse(FactProposalContract, { ...baseProposal, value: [{ obj: 1 }] });
    assert.equal(arrayWithObjectResult.success, false);

    // 拒绝空 evidenceSequences
    const emptyEvidenceResult = safeParse(FactProposalContract, { ...baseProposal, value: 42, evidenceSequences: [] });
    assert.equal(emptyEvidenceResult.success, false);
});

test("统一执行 Patch 契约拒绝已废除的 PlanItem 操作", () => {
    const createPlanItemPatch = {
        protocolVersion: 1 as const,
        operations: [{
            type: "create_plan_item" as const,
            planItem: { description: "实现执行契约" },
        }],
    };

    assert.equal(safeParse(WorkingMemoryPatchContract, createPlanItemPatch).success, false);
    assert.equal(safeParse(ExecutingWorkingMemoryPatchContract, createPlanItemPatch).success, false);

    const updatePlanItemPatch = {
        protocolVersion: 1 as const,
        operations: [{
            type: "update_plan_item" as const,
            planItem: { id: "plan-1", status: "completed" as const },
        }],
    };
    assert.equal(safeParse(ExecutingWorkingMemoryPatchContract, updatePlanItemPatch).success, false);
});

test("统一 AgentDecision 接受 ask_user 与 task_proposal 并拒绝额外字段", () => {
    const askUser = {
        kind: "ask_user" as const,
        questions: [{
            header: "数据库",
            question: "需要支持哪种数据库？",
            options: [{ label: "PostgreSQL" }, { label: "MySQL" }],
            multiSelect: false,
        }],
    };
    assert.equal(safeParse(AgentDecisionContract, askUser).success, true);

    const taskProposal = {
        kind: "task_proposal" as const,
        task: {
            objective: "构建模块",
            completionCriteria: [{ text: "标准 1" }],
        },
        approvalRequest: "是否确认？",
    };
    assert.equal(safeParse(AgentDecisionContract, taskProposal).success, true);

    const withExtra = {
        ...askUser,
        extraField: "malicious",
    };
    const extraParsed = safeParse(AgentDecisionContract, withExtra);
    assert.equal(extraParsed.success, false);
    if (!extraParsed.success) assert.ok(extraParsed.issues.length > 0);
});

test("AgentDecisionContract 接受各合法 Agent 分支并做深复制隔离", () => {
    const toolCall = {
        kind: "tool_call" as const,
        action: {
            actionId: "act-1",
            toolId: "bash",
            input: { command: "npm test", env: { CI: "true" } },
        },
    };
    const parsedCall = safeParse(AgentDecisionContract, toolCall);
    assert.equal(parsedCall.success, true);
    if (!parsedCall.success) return;
    assert.deepEqual(parsedCall.data, toolCall);
    assert.notStrictEqual(parsedCall.data, toolCall);
    if (parsedCall.data.kind === "tool_call") {
        assert.notStrictEqual(parsedCall.data.action, toolCall.action);
        assert.notStrictEqual(parsedCall.data.action.input, toolCall.action.input);
    }

    const completeDecision = {
        kind: "complete" as const,
        summary: "全部测试通过",
        completionEvidence: [
            { criterionIndex: 0, evidenceSequences: [1, 2] },
        ],
    };
    assert.equal(safeParse(AgentDecisionContract, completeDecision).success, true);
    assert.equal(safeParse(StructuredAgentDecisionContract, completeDecision).success, true);

    const waitDecision = {
        kind: "wait" as const,
        reason: "等待用户输入",
    };
    assert.equal(safeParse(AgentDecisionContract, waitDecision).success, true);

    const failDecision = {
        kind: "fail" as const,
        error: "命令执行超时",
    };
    assert.equal(safeParse(AgentDecisionContract, failDecision).success, true);

    const lookupDecision = {
        kind: "context_lookup" as const,
        need: "historical_execution" as const,
        question: "历史记录是什么？",
    };
    assert.equal(safeParse(AgentDecisionContract, lookupDecision).success, true);

    const checkpointDecision = {
        kind: "context_checkpoint" as const,
    };
    assert.equal(safeParse(AgentDecisionContract, checkpointDecision).success, true);
    assert.equal(safeParse(StructuredAgentDecisionContract, checkpointDecision).success, false);
});

test("安全拦截循环输入并不发生堆栈溢出", () => {
    const cyclicDecision: Record<string, unknown> = {
        kind: "wait",
        reason: "等待",
    };
    cyclicDecision.self = cyclicDecision;

    // 含有自引用的额外字段被安全拒绝，不进入死循环
    const result = safeParse(AgentDecisionContract, cyclicDecision);
    assert.equal(result.success, false);

    // 含有内部自引用的 input 被安全拒绝，不发生堆栈溢出
    const cyclicActionInput: Record<string, unknown> = { command: "echo" };
    cyclicActionInput.cycle = cyclicActionInput;
    const cyclicToolCall = {
        actionId: "a1",
        toolId: "bash",
        input: cyclicActionInput,
    };
    const actionResult = safeParse(ToolCallActionContract, cyclicToolCall);
    assert.equal(actionResult.success, false);
});


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

test("AuthorizedToolContract 支持 isReadOnly 属性并通过 isReadOnlyToolContract 反射", () => {
    const readOnlyTool: AuthorizedToolContract = {
        id: "read_file",
        inputContract: contract.object({ path: contract.string() }),
        isReadOnly: true,
    };
    const modifyingTool: AuthorizedToolContract = {
        id: "write_file",
        inputContract: contract.object({ path: contract.string(), content: contract.string() }),
        isReadOnly: false,
    };
    const defaultTool: AuthorizedToolContract = {
        id: "bash",
        inputContract: contract.object({ command: contract.string() }),
    };

    assert.equal(isReadOnlyToolContract(readOnlyTool), true);
    assert.equal(isReadOnlyToolContract(modifyingTool), false);
    assert.equal(isReadOnlyToolContract(defaultTool), false);
});

test("普通 Run 使用直接执行决策，Plan Run 在提案前仍暴露全部授权 Tool", () => {
    const readFileInputContract = contract.object({ path: contract.string() });
    const grepInputContract = contract.object({ pattern: contract.string() });
    const writeFileInputContract = contract.object({ path: contract.string(), content: contract.string() });

    const tools: readonly AuthorizedToolContract[] = [
        { id: "read_file", inputContract: readFileInputContract, isReadOnly: true },
        { id: "grep", inputContract: grepInputContract, isReadOnly: true },
        // 工具授权由 Profile 控制，isReadOnly 仅为工具元数据。
        { id: "write_file", inputContract: writeFileInputContract, isReadOnly: false },
    ];

    const bundle = createModelOutputContractBundle({
        kind: "executing",
        taskPresent: false,
        authorizedTools: tools,
    });
    assert.equal(bundle.name, "normal_executing_agent_decision");

    // 统一 tool_call 输出承载批准前的只读读取。
    const wireJson = {
        result: {
            kind: "tool_call",
            action: {
                actionId: "read-1",
                toolId: "read_file",
                input: { path: "package.json" },
            },
            memoryPatch: null,
        },
    };
    const decoded = bundle.decode(wireJson);
    assert.equal(decoded.kind, "tool_call");
    assert.equal(decoded.action.toolId, "read_file");
    assert.deepEqual(decoded.action.input, { path: "package.json" });

    // 验证多工具根据 toolId 精确路由并验证输入 Schema
    const wireGrepJson = {
        result: {
            kind: "tool_call",
            action: {
                actionId: "read-2",
                toolId: "grep",
                input: { pattern: "test" },
            },
            memoryPatch: null,
        },
    };
    const decodedGrep = bundle.decode(wireGrepJson);
    if (decodedGrep.kind === "tool_call") {
        assert.equal(decodedGrep.action.toolId, "grep");
    } else {
        assert.fail(`Expected tool_call, received ${decodedGrep.kind}`);
    }

    // 普通 Run 的完成使用当前 Run evidenceSequences，不生成提案分支。
    const normalComplete = bundle.decode({
        result: { kind: "complete", summary: "完成", evidenceSequences: [3], memoryPatch: null },
    });
    assert.equal(normalComplete.kind, "complete");
    if (normalComplete.kind === "complete" && "evidenceSequences" in normalComplete) {
        assert.deepEqual(normalComplete.evidenceSequences, [3]);
    }
    assert.throws(() => bundle.decode({
        result: { kind: "task_proposal", task: { objective: "不应出现", completionCriteria: [] }, approvalRequest: "?", memoryPatch: null },
    }));

    const planBundle = createModelOutputContractBundle({
        kind: "executing",
        taskPresent: false,
        planMode: true,
        authorizedTools: tools,
    });
    assert.equal(planBundle.name, "plan_mode_unapproved_executing_agent_decision");

    // Plan Prompt 要求先提案，但响应契约不会按 isReadOnly 过滤已授权 Tool。
    const illegalWriteWireJson = {
        result: {
            kind: "tool_call",
            action: {
                actionId: "illegal-write-1",
                toolId: "write_file",
                input: { path: "test.txt", content: "data" },
            },
            memoryPatch: null,
        },
    };
    assert.equal(planBundle.decode(illegalWriteWireJson).kind, "tool_call");
    assert.throws(() => planBundle.decode({
        result: { kind: "complete", summary: "未批准完成", completionEvidence: [], memoryPatch: null },
    }));

    const executingBundle = createModelOutputContractBundle({
        kind: "executing",
        taskPresent: true,
        planMode: true,
        authorizedTools: tools,
    });
    assert.equal(executingBundle.name, "plan_mode_approved_executing_agent_decision");
    const decodedExecuting = executingBundle.decode({
        result: {
            kind: "complete",
            summary: "完成",
            completionEvidence: [],
            memoryPatch: null,
        },
    });
    assert.equal(decodedExecuting.kind, "complete");
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

    assert.equal(safeParse(GoalPlanUpdateAgentDecisionContract, {
        ...decision,
        operations: [{ type: "add", content: "检查实现" }],
    }).success, true);
    assert.equal(safeParse(PlanModeExecutingDecisionContract, decision).success, true);

    const normalBundle = createModelOutputContractBundle({
        kind: "executing",
        taskPresent: true,
        planMode: false,
    });
    assert.equal(JSON.stringify(normalBundle.jsonSchema).includes("goal_plan_update"), false);
    assert.throws(() => normalBundle.decode({ result: decision }));

    const planBundle = createModelOutputContractBundle({
        kind: "executing",
        taskPresent: true,
        planMode: true,
    });
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

    const writableNormalBundle = createModelOutputContractBundle({
        kind: "executing",
        taskPresent: true,
        planMode: false,
        goalPlanWritable: true,
    });
    assert.equal(JSON.stringify(writableNormalBundle.jsonSchema).includes("goal_plan_update"), true);
    assert.equal(writableNormalBundle.name, "normal_goal_plan_writable_executing_agent_decision");
    assert.equal(writableNormalBundle.decode({
        result: {
            ...decision,
            operations: [{ type: "add", content: "检查实现", position: null }],
            memoryPatch: null,
        },
    }).kind, "goal_plan_update");

    const readOnlyPlanBundle = createModelOutputContractBundle({
        kind: "executing",
        taskPresent: true,
        planMode: true,
        goalPlanWritable: false,
    });
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
