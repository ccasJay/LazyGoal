import assert from "node:assert/strict";
import { test } from "node:test";

import {
    AgentDecisionContract,
    ContextLookupRequestContract,
    ExecutingWorkingMemoryPatchContract,
    FactProposalContract,
    GatheringPreparationResultContract,
    GoalTaskContract,
    PlanningPreparationResultContract,
    PreparationResultContract,
    ProbeActionContract,
    ProbeActionPreparationResultContract,
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
});

test("Preparation 允许创建 PlanItem，而 Executing Patch 契约拒绝创建", () => {
    const createPlanItemPatch = {
        protocolVersion: 1 as const,
        operations: [{
            type: "create_plan_item" as const,
            planItem: { description: "实现执行契约" },
        }],
    };

    assert.equal(safeParse(WorkingMemoryPatchContract, createPlanItemPatch).success, true);
    assert.equal(safeParse(ExecutingWorkingMemoryPatchContract, createPlanItemPatch).success, false);

    const validExecutingPatch = {
        protocolVersion: 1 as const,
        operations: [{
            type: "update_plan_item" as const,
            planItem: { id: "plan-1", status: "completed" as const },
        }],
    };
    assert.equal(safeParse(ExecutingWorkingMemoryPatchContract, validExecutingPatch).success, true);
});

test("PreparationResultContract 接受各合法 Preparation 分支并拒绝额外字段", () => {
    const questionResult = {
        kind: "question" as const,
        question: "需要支持哪种数据库？",
    };
    assert.equal(safeParse(PreparationResultContract, questionResult).success, true);
    assert.equal(safeParse(GatheringPreparationResultContract, questionResult).success, true);
    assert.equal(safeParse(PlanningPreparationResultContract, questionResult).success, false);

    const contextReadyResult = {
        kind: "context_ready" as const,
    };
    assert.equal(safeParse(PreparationResultContract, contextReadyResult).success, true);
    assert.equal(safeParse(GatheringPreparationResultContract, contextReadyResult).success, true);
    assert.equal(safeParse(PlanningPreparationResultContract, contextReadyResult).success, false);

    const taskProposalResult = {
        kind: "task_proposal" as const,
        task: {
            objective: "构建模块",
            completionCriteria: [{ text: "标准 1" }],
        },
        approvalRequest: "是否确认？",
    };
    assert.equal(safeParse(PreparationResultContract, taskProposalResult).success, true);
    assert.equal(safeParse(GatheringPreparationResultContract, taskProposalResult).success, false);
    assert.equal(safeParse(PlanningPreparationResultContract, taskProposalResult).success, true);

    const checkpointResult = {
        kind: "context_checkpoint" as const,
    };
    assert.equal(safeParse(PreparationResultContract, checkpointResult).success, true);
    assert.equal(safeParse(GatheringPreparationResultContract, checkpointResult).success, false);

    // 额外字段被严格拒绝
    const withExtra = {
        ...questionResult,
        extraField: "malicious",
    };
    const extraParsed = safeParse(PreparationResultContract, withExtra);
    assert.equal(extraParsed.success, false);
    if (extraParsed.success) return;
    assert.equal(extraParsed.issues.some((i) => i.code === "extra_field"), true);
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
    // 空白 question
    const blankQuestion = {
        kind: "question",
        question: "   \t\n  ",
    };
    const questionIssues = validateModelOutputSemantics(blankQuestion);
    assert.equal(questionIssues.length, 1);
    assert.equal(questionIssues[0]?.code, "blank_string");
    assert.deepEqual(questionIssues[0]?.path, ["question"]);
    // 输入本身保持原文未被修改或 trim
    assert.equal(blankQuestion.question, "   \t\n  ");

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

    // 无变更 update_plan_item
    const emptyUpdatePlan = {
        protocolVersion: 1,
        operations: [
            {
                type: "update_plan_item",
                planItem: { id: "plan-1" },
            },
        ],
    };
    const planIssues = validateModelOutputSemantics(emptyUpdatePlan);
    assert.equal(planIssues.length, 1);
    assert.equal(planIssues[0]?.code, "empty_update");
    assert.deepEqual(planIssues[0]?.path, ["operations", 0, "planItem"]);

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
                type: "update_plan_item",
                planItem: { id: "plan-1", description: "新描述" },
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

test("ProbeActionPreparationResultContract 校验并深复制只读探查决策", () => {
    const validProbe = {
        kind: "probe_action",
        action: {
            toolId: "read_file",
            input: { path: "package.json" },
        },
    };
    const parsed = safeParse(ProbeActionPreparationResultContract, validProbe);
    assert.equal(parsed.success, true);
    if (parsed.success) {
        assert.deepEqual(parsed.data, validProbe);
        assert.notStrictEqual(parsed.data, validProbe);
    }

    // 支持携带 memoryPatch
    const probeWithExtras = {
        kind: "probe_action",
        action: {
            toolId: "grep",
            input: { pattern: "TODO" },
        },
        memoryPatch: {
            protocolVersion: 1,
            operations: [
                {
                    type: "upsert_fact",
                    fact: {
                        subject: "workspace",
                        predicate: "has_todo",
                        value: true,
                        stability: "stable" as const,
                        evidenceSequences: [1],
                    },
                },
            ],
        },
    };
    const parsedWithExtras = safeParse(ProbeActionPreparationResultContract, probeWithExtras);
    assert.equal(parsedWithExtras.success, true);
    if (parsedWithExtras.success) {
        assert.deepEqual(parsedWithExtras.data, probeWithExtras);
    }
});

test("Gathering 与 Planning 准备阶段契约合法接受 probe_action 并严格隔离写操作决策", () => {
    const probe = {
        kind: "probe_action",
        action: { toolId: "read_file", input: { path: "README.md" } },
    };

    // 1. gathering 阶段接受 probe_action
    assert.equal(safeParse(GatheringPreparationResultContract, probe).success, true);

    // 2. planning 阶段接受 probe_action
    assert.equal(safeParse(PlanningPreparationResultContract, probe).success, true);

    // 3. 完整 PreparationResultContract 接受 probe_action
    assert.equal(safeParse(PreparationResultContract, probe).success, true);

    // 4. 准备阶段严格隔离执行阶段专用决策
    const toolCall = {
        kind: "tool_call",
        action: { actionId: "a1", toolId: "read_file", input: { path: "README.md" } },
    };
    assert.equal(safeParse(GatheringPreparationResultContract, toolCall).success, false);
    assert.equal(safeParse(PlanningPreparationResultContract, toolCall).success, false);
    assert.equal(safeParse(PreparationResultContract, toolCall).success, false);

    const completeDecision = {
        kind: "complete",
        summary: "已完成",
        completionEvidence: [],
    };
    assert.equal(safeParse(GatheringPreparationResultContract, completeDecision).success, false);
    assert.equal(safeParse(PlanningPreparationResultContract, completeDecision).success, false);
});

test("createModelOutputContractBundle 在准备阶段为只读工具动态派生 probe_action 并精确解码", () => {
    const readFileInputContract = contract.object({ path: contract.string() });
    const grepInputContract = contract.object({ pattern: contract.string() });
    const writeFileInputContract = contract.object({ path: contract.string(), content: contract.string() });

    const tools: readonly AuthorizedToolContract[] = [
        { id: "read_file", inputContract: readFileInputContract, isReadOnly: true },
        { id: "grep", inputContract: grepInputContract, isReadOnly: true },
        // 写工具应被准备阶段 Bundle 自动排除
        { id: "write_file", inputContract: writeFileInputContract, isReadOnly: false },
    ];

    // 1. Gathering 阶段 Bundle
    const gatheringBundle = createModelOutputContractBundle({
        kind: "gathering",
        authorizedTools: tools,
    });
    assert.equal(gatheringBundle.name, "gathering_preparation_result");

    // 模拟来自 wire 的 probe_action 输出
    const wireJson = {
        result: {
            kind: "probe_action",
            action: {
                toolId: "read_file",
                input: { path: "package.json" },
            },
            memoryPatch: null,
        },
    };
    const decoded = gatheringBundle.decode(wireJson) as ProbeActionPreparationResult;
    assert.equal(decoded.kind, "probe_action");
    assert.equal(decoded.action.toolId, "read_file");
    assert.deepEqual(decoded.action.input, { path: "package.json" });

    // 验证多工具根据 toolId 精确路由并验证输入 Schema
    const wireGrepJson = {
        result: {
            kind: "probe_action",
            action: {
                toolId: "grep",
                input: { pattern: "test" },
            },
            memoryPatch: null,
        },
    };
    const decodedGrep = gatheringBundle.decode(wireGrepJson) as ProbeActionPreparationResult;
    assert.equal(decodedGrep.action.toolId, "grep");

    // 验证写工具（write_file）由于被排除，无法作为合法的 probe_action 通过校验
    const illegalWriteWireJson = {
        result: {
            kind: "probe_action",
            action: {
                toolId: "write_file",
                input: { path: "test.txt", content: "data" },
            },
            memoryPatch: null,
        },
    };
    assert.throws(() => gatheringBundle.decode(illegalWriteWireJson));

    // 2. Planning 阶段 Bundle
    const planningBundle = createModelOutputContractBundle({
        kind: "planning",
        authorizedTools: tools,
    });
    assert.equal(planningBundle.name, "planning_preparation_result");
    const decodedPlanning = planningBundle.decode(wireJson) as ProbeActionPreparationResult;
    assert.equal(decodedPlanning.kind, "probe_action");
    assert.equal(decodedPlanning.action.toolId, "read_file");
});
