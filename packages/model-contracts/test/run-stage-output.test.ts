import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createBoundRunStageToolDeclarations,
    createBoundUnifiedToolDeclarations,
    decodeBoundAgentDecision,
    modelOutputBindings,
} from "../src/index";

test("1.1: RunStageUpdate 绑定解码阶段声明与修订", () => {
    // 声明新阶段
    const validDeclare = {
        kind: "run_stage_update",
        target: "梳理模块职责",
        acceptanceCriteria: ["列出所有导出符号"],
    };
    const parsedDeclare = modelOutputBindings.executing.runStageUpdate.read(validDeclare, "reject");
    assert.equal(parsedDeclare.ok, true);
    if (parsedDeclare.ok) {
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
    const parsedRevise = modelOutputBindings.executing.runStageUpdate.read(validRevise, "reject");
    assert.equal(parsedRevise.ok, true);
    if (parsedRevise.ok) {
        assert.equal(parsedRevise.data.stageId, "stage-1");
        assert.equal(parsedRevise.data.baseRevision, 1);
        assert.equal(parsedRevise.data.reason, "细化检查项");
    }

    // 统合在完整 AgentDecision 校验中能正确解析
    const parsedDecision = decodeBoundAgentDecision(validDeclare, modelOutputBindings);
    assert.equal(parsedDecision.kind, "run_stage_update");
});

test("1.1 & 2.2: RunStageUpdate 绑定拒绝非法字段", () => {
    // 缺失 target
    assert.equal(modelOutputBindings.executing.runStageUpdate.read({
        kind: "run_stage_update",
        acceptanceCriteria: ["条件 1"],
    }, "reject").ok, false);

    // acceptanceCriteria 类型非法（非数组）
    assert.equal(modelOutputBindings.executing.runStageUpdate.read({
        kind: "run_stage_update",
        target: "目标",
        acceptanceCriteria: "非数组",
    }, "reject").ok, false);

    // baseRevision 为负数或 0
    assert.equal(modelOutputBindings.executing.runStageUpdate.read({
        kind: "run_stage_update",
        stageId: "stage-1",
        baseRevision: 0,
        reason: "理由",
        target: "目标",
        acceptanceCriteria: ["条件 1"],
    }, "reject").ok, false);
});

test("3.1: RunStageComplete 绑定解码阶段完成候选", () => {
    const validCandidate = {
        kind: "run_stage_complete",
        stageId: "stage-1",
        summary: "第一阶段工作已完成，已输出初步分析",
        evidenceSequences: [5, 6],
    };
    const parsed = modelOutputBindings.executing.runStageComplete.read(validCandidate, "reject");
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
        assert.equal(parsed.data.kind, "run_stage_complete");
        assert.equal(parsed.data.stageId, "stage-1");
        assert.equal(parsed.data.summary, "第一阶段工作已完成，已输出初步分析");
        assert.deepEqual(parsed.data.evidenceSequences, [5, 6]);
    }

    // decodeBoundAgentDecision 也包含该分支
    assert.equal(decodeBoundAgentDecision(validCandidate, modelOutputBindings).kind, "run_stage_complete");

    // 缺少 summary 拒绝
    assert.equal(modelOutputBindings.executing.runStageComplete.read({
        kind: "run_stage_complete",
        stageId: "stage-1",
    }, "reject").ok, false);
    // 缺少 stageId 拒绝
    assert.equal(modelOutputBindings.executing.runStageComplete.read({
        kind: "run_stage_complete",
        summary: "已完成",
    }, "reject").ok, false);
});

test("生成阶段工具声明正确解码", () => {
    const decodedUpdate = createBoundRunStageToolDeclarations({}, modelOutputBindings.systemTools)[0]!.decode({
        target: "新阶段目标",
        acceptanceCriteria: ["条件 A"],
    });
    assert.equal(decodedUpdate.kind, "run_stage_update");
    if (decodedUpdate.kind === "run_stage_update") {
        assert.equal(decodedUpdate.target, "新阶段目标");
        assert.deepEqual(decodedUpdate.acceptanceCriteria, ["条件 A"]);
    }

    const decodedComplete = createBoundRunStageToolDeclarations(
        { currentStage: { stageId: "stage-1", revision: 1, status: "executing" } },
        modelOutputBindings.systemTools,
    )[1]!.decode({
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

test("生成阶段工具参数 Schema 保持严格定义", () => {
    for (const declaration of [
        ...createBoundRunStageToolDeclarations({}, modelOutputBindings.systemTools),
        ...createBoundRunStageToolDeclarations({
            currentStage: { stageId: "stage-1", revision: 1, status: "executing" },
        }, modelOutputBindings.systemTools),
    ]) {
        assert.equal(declaration.parametersSchema.type, "object");
        assert.equal(declaration.parametersSchema.additionalProperties, false);
        assert.ok(Array.isArray(declaration.parametersSchema.required));
    }
});

test("阶段工具只暴露工作参数并绑定请求中的活动阶段", () => {
    const currentStage = { stageId: "stage-7", revision: 3, status: "executing" as const };
    const declarations = createBoundRunStageToolDeclarations({ currentStage }, modelOutputBindings.systemTools);
    assert.deepEqual(declarations.map(tool => tool.id), ["system_revise_run_stage", "system_complete_run_stage"]);
    currentStage.revision = 4;
    currentStage.stageId = "stage-8";
    const revised = declarations[0]!.decode({ target: "Inspect", acceptanceCriteria: ["Evidence"], reason: "New evidence" });
    assert.deepEqual(revised, { kind: "run_stage_update", stageId: "stage-7", baseRevision: 3,
        target: "Inspect", acceptanceCriteria: ["Evidence"], reason: "New evidence" });
    assert.deepEqual(declarations[1]!.decode({ summary: "Inspected", evidenceSequences: [7] }), {
        kind: "run_stage_complete", stageId: "stage-7", summary: "Inspected", evidenceSequences: [7],
    });
    for (const tool of createBoundRunStageToolDeclarations({}, modelOutputBindings.systemTools)) {
        const properties = tool.parametersSchema.properties as Record<string, unknown>;
        for (const key of ["stageId", "baseRevision", "memoryPatch"]) assert.equal(key in properties, false);
    }
    assert.throws(() => declarations[1]!.decode({ summary: "Done" }));
});

test("Plan 阶段启动使用空对象并在构造时捕获下一获批阶段", () => {
    const stage = { target: "Approved investigation", acceptanceCriteria: ["Read source"], status: "pending" as const };
    const route = { revision: 2, nextStageIndex: 0, stages: [stage] };
    const tools = createBoundRunStageToolDeclarations({ planRoute: route }, modelOutputBindings.systemTools);
    assert.deepEqual(tools.map(tool => tool.id), ["system_start_run_stage"]);
    stage.target = "Changed later";
    stage.acceptanceCriteria.push("Changed later");
    assert.deepEqual(tools[0]!.decode({}), { kind: "run_stage_update", target: "Approved investigation", acceptanceCriteria: ["Read source"] });
    const startDiagnostics: string[] = [];
    const started = tools[0]!.decode({ target: "Skip approval" }, {
        onDiagnostic: diagnostic => startDiagnostics.push(...diagnostic.paths),
    });
    assert.deepEqual(started, { kind: "run_stage_update", target: "Approved investigation", acceptanceCriteria: ["Read source"] });
    assert.deepEqual(startDiagnostics, ["/target"]);
    assert.deepEqual(createBoundRunStageToolDeclarations({ planRoute: { ...route, nextStageIndex: 1 } }, modelOutputBindings.systemTools), []);
    assert.deepEqual(createBoundRunStageToolDeclarations({
        currentStage: { stageId: "stage-1", revision: 1, status: "accepted" },
    }, modelOutputBindings.systemTools).map(tool => tool.id), ["system_start_run_stage"]);
});

test("阶段启动剥离伪造身份与无关记忆并拒绝空白工作描述", () => {
    const declaration = createBoundUnifiedToolDeclarations([], modelOutputBindings, true)
        .find(tool => tool.id === "system_start_run_stage")!;
    const input = { target: "Investigate", acceptanceCriteria: ["Read sources"] };
    for (const extra of [{ stageId: "arch-audit" }, { baseRevision: 1 }, { memoryPatch: { protocolVersion: "1", operations: [] } }]) {
        const diagnostics: string[] = [];
        const decoded = declaration.decode({ ...input, ...extra }, {
            onDiagnostic: diagnostic => diagnostics.push(...diagnostic.paths),
        });
        assert.equal(decoded.kind, "run_stage_update");
        for (const key of Object.keys(extra)) assert.equal(key in decoded, false);
        assert.equal(diagnostics.length > 0, true);
    }
    for (const invalid of [{ ...input, target: "  " }, { ...input, acceptanceCriteria: [] }, { ...input, acceptanceCriteria: [" "] }]) {
        assert.throws(() => declaration.decode(invalid));
    }
    const revise = createBoundRunStageToolDeclarations(
        { currentStage: { stageId: "stage-1", revision: 1, status: "executing" } },
        modelOutputBindings.systemTools,
    )[0]!;
    assert.throws(() => revise.decode({ ...input, reason: " " }));
});
