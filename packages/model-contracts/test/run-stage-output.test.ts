import assert from "node:assert/strict";
import { test } from "node:test";
import { safeParse } from "../../contracts/src/index";
import {
    compileModelOutputSchema,
    AgentDecisionContract,
    RunStageUpdateAgentDecisionContract,
    RunStageCompleteAgentDecisionContract,
    SystemUpdateRunStageDeclaration,
    SystemCompleteRunStageDeclaration,
} from "../src/index";

test("1.1: RunStageUpdateAgentDecision contract decodes valid stage declaration and revision", () => {
    // 声明新阶段
    const validDeclare = {
        kind: "run_stage_update",
        target: "梳理模块职责",
        acceptanceCriteria: ["列出所有导出符号"],
    };
    const parsedDeclare = safeParse(RunStageUpdateAgentDecisionContract, validDeclare);
    assert.equal(parsedDeclare.success, true);
    if (parsedDeclare.success) {
        assert.equal(parsedDeclare.data.kind, "run_stage_update");
        assert.equal(parsedDeclare.data.target, "梳理模块职责");
        assert.deepEqual(parsedDeclare.data.acceptanceCriteria, ["列出所有导出符号"]);
        assert.equal(parsedDeclare.data.stageId, undefined);
    }

    // 修订当前阶段
    const validRevise = {
        kind: "run_stage_update",
        stageId: "stage-1",
        baseRevision: 1,
        reason: "细化检查项",
        target: "梳理模块职责并增加用例",
        acceptanceCriteria: ["列出所有导出符号", "添加单元测试"],
    };
    const parsedRevise = safeParse(RunStageUpdateAgentDecisionContract, validRevise);
    assert.equal(parsedRevise.success, true);
    if (parsedRevise.success) {
        assert.equal(parsedRevise.data.stageId, "stage-1");
        assert.equal(parsedRevise.data.baseRevision, 1);
        assert.equal(parsedRevise.data.reason, "细化检查项");
    }

    // 统合在 AgentDecisionContract 中能正确解析
    const parsedDecision = safeParse(AgentDecisionContract, validDeclare);
    assert.equal(parsedDecision.success, true);
});

test("1.1 & 2.2: RunStageUpdateAgentDecision rejects invalid fields", () => {
    // 缺失 target
    const missingTarget = {
        kind: "run_stage_update",
        acceptanceCriteria: ["条件 1"],
    };
    assert.equal(safeParse(RunStageUpdateAgentDecisionContract, missingTarget).success, false);

    // acceptanceCriteria 类型非法（非数组）
    const invalidCriteria = {
        kind: "run_stage_update",
        target: "目标",
        acceptanceCriteria: "非数组",
    };
    assert.equal(safeParse(RunStageUpdateAgentDecisionContract, invalidCriteria).success, false);

    // baseRevision 为负数或 0
    const invalidRevision = {
        kind: "run_stage_update",
        stageId: "stage-1",
        baseRevision: 0,
        reason: "理由",
        target: "目标",
        acceptanceCriteria: ["条件 1"],
    };
    assert.equal(safeParse(RunStageUpdateAgentDecisionContract, invalidRevision).success, false);
});

test("3.1: RunStageCompleteAgentDecision contract decodes valid stage completion candidate", () => {
    const validCandidate = {
        kind: "run_stage_complete",
        stageId: "stage-1",
        summary: "第一阶段工作已完成，已输出初步分析",
        evidenceSequences: [5, 6],
    };
    const parsed = safeParse(RunStageCompleteAgentDecisionContract, validCandidate);
    assert.equal(parsed.success, true);
    if (parsed.success) {
        assert.equal(parsed.data.kind, "run_stage_complete");
        assert.equal(parsed.data.stageId, "stage-1");
        assert.equal(parsed.data.summary, "第一阶段工作已完成，已输出初步分析");
        assert.deepEqual(parsed.data.evidenceSequences, [5, 6]);
    }

    // AgentDecisionContract 也包含该分支
    assert.equal(safeParse(AgentDecisionContract, validCandidate).success, true);

    // 缺少 summary 拒绝
    assert.equal(
        safeParse(RunStageCompleteAgentDecisionContract, { kind: "run_stage_complete", stageId: "stage-1" }).success,
        false,
    );
    // 缺少 stageId 拒绝
    assert.equal(
        safeParse(RunStageCompleteAgentDecisionContract, { kind: "run_stage_complete", summary: "已完成" }).success,
        false,
    );
});

test("Native system tools declarations decode correctly", () => {
    const decodedUpdate = SystemUpdateRunStageDeclaration.decode({
        target: "新阶段目标",
        acceptanceCriteria: ["条件 A"],
    });
    assert.equal(decodedUpdate.kind, "run_stage_update");
    if (decodedUpdate.kind === "run_stage_update") {
        assert.equal(decodedUpdate.target, "新阶段目标");
        assert.deepEqual(decodedUpdate.acceptanceCriteria, ["条件 A"]);
    }

    const decodedComplete = SystemCompleteRunStageDeclaration.decode({
        stageId: "stage-1",
        summary: "阶段完成摘要",
        evidenceSequences: [1, 2],
    });
    assert.equal(decodedComplete.kind, "run_stage_complete");
    if (decodedComplete.kind === "run_stage_complete") {
        assert.equal(decodedComplete.stageId, "stage-1");
        assert.equal(decodedComplete.summary, "阶段完成摘要");
        assert.deepEqual(decodedComplete.evidenceSequences, [1, 2]);
    }
});

test("Provider schema has strict JSON schema definition", () => {
    assert.equal(SystemUpdateRunStageDeclaration.parametersSchema.type, "object");
    assert.equal(SystemUpdateRunStageDeclaration.parametersSchema.additionalProperties, false);
    assert.ok(Array.isArray(SystemUpdateRunStageDeclaration.parametersSchema.required));

    assert.equal(SystemCompleteRunStageDeclaration.parametersSchema.type, "object");
    assert.equal(SystemCompleteRunStageDeclaration.parametersSchema.additionalProperties, false);
    assert.ok(Array.isArray(SystemCompleteRunStageDeclaration.parametersSchema.required));
});
