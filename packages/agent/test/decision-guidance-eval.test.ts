import assert from "node:assert/strict";
import { test } from "node:test";
import { decisionScenarios, scoreDecision } from "./decision-guidance-fixtures";
import { evaluationRenderers, evaluationRequest, evaluateResponse } from "./decision-guidance-eval";

const renderers = await evaluationRenderers();
const response = (toolId: string, args: unknown) => ({ content: "", toolCalls: [{ callId: "test", toolId, argumentsJson: JSON.stringify(args) }] });

test("对照请求仅改变模板与系统工具描述，不改变状态、授权、输入 Schema 或判据", () => {
    assert.equal(decisionScenarios.length, 12);
    for (const scenario of decisionScenarios) {
        for (const mode of ["strict", "prompt_only", "two_stage"] as const) {
            const old = evaluationRequest(scenario, renderers.old, mode, renderers.oldDescriptions);
            const current = evaluationRequest(scenario, renderers.new, mode);
            assert.deepEqual(current.request.messages.slice(1, -1), [{ role: "user", content: scenario.intent }]);
            assert.deepEqual(old.request.messages.slice(1), current.request.messages.slice(1));
            assert.deepEqual(old.request.tools.map(({ id, parametersSchema }) => ({ id, parametersSchema })),
                current.request.tools.map(({ id, parametersSchema }) => ({ id, parametersSchema })));
            assert.deepEqual(old.request.structuredOutput, current.request.structuredOutput);
            assert.deepEqual(current.request, evaluationRequest(scenario, renderers.new, mode).request);
            if (scenario.checkpoint) {
                assert.deepEqual(current.request.tools.map(t => t.id), ["system_context_checkpoint"]);
                assert.equal(JSON.parse(current.request.messages.at(-1)!.content).checkpointRequired, true);
            } else if (!scenario.approved) assert.ok(!current.request.tools.some(t => t.id === "apply_change"));
        }
    }
});

test("评分器拒绝多调用、非法写入、错误完成和未执行 checkpoint", () => {
    const before = decisionScenarios[0]!;
    const beforePlan = evaluationRequest(before, renderers.new, "prompt_only");
    const write = evaluateResponse(before, beforePlan, response("apply_change", { target: "banner", value: "Welcome" }));
    assert.equal(write.passed, false);
    assert.equal(write.criticalViolation, true);
    const checkpoint = decisionScenarios[11]!;
    const checkpointPlan = evaluationRequest(checkpoint, renderers.new, "strict");
    const correct = response("system_context_checkpoint", {});
    assert.equal(evaluateResponse(checkpoint, checkpointPlan, correct).passed, true);
    assert.equal(evaluateResponse(checkpoint, checkpointPlan, { content: "Done" }).criticalViolation, true);
    assert.equal(evaluateResponse(checkpoint, checkpointPlan, { ...correct, toolCalls: [...correct.toolCalls, ...correct.toolCalls] }).passed, false);
    const verify = decisionScenarios[5]!;
    const early = evaluateResponse(verify, evaluationRequest(verify, renderers.new, "strict"),
        response("system_complete_task", { summary: "Done", completionEvidence: [{ criterionIndex: 0, evidenceSequences: [2] }] }));
    assert.equal(early.criticalViolation, true);
});

test("关键参数评分拒绝无效修复、错误对象和伪造完成证据", () => {
    const adjust = decisionScenarios[6]!;
    const action = (value: string, target = "config") => ({ kind: "tool_call" as const, action: { actionId: "a", toolId: "apply_change", input: { target, value } } });
    assert.equal(scoreDecision(adjust, action("timeout_ms=30000")), true);
    assert.equal(scoreDecision(adjust, action("timeout=30")), false);
    assert.equal(scoreDecision(adjust, action("timeout_ms=30000", "other")), false);
    const complete = decisionScenarios[10]!;
    const decision = (sequences: number[]) => ({ kind: "complete" as const, summary: "Verified", completionEvidence: [{ criterionIndex: 0, evidenceSequences: sequences }] });
    assert.equal(scoreDecision(complete, decision([4])), true);
    assert.equal(scoreDecision(complete, decision([])), false);
    assert.equal(scoreDecision(complete, decision([1])), false);
    assert.equal(scoreDecision(complete, decision([4, 999])), false);
});

test("非原生文本决策虽可解析，也不算通过原生调用协议", () => {
    const scenario = decisionScenarios[11]!;
    const result = evaluateResponse(scenario, evaluationRequest(scenario, renderers.new, "strict"),
        { content: JSON.stringify({ result: { kind: "context_checkpoint", memoryPatch: null } }) });
    assert.equal(result.passed, false);
    assert.equal(result.protocolValid, false);
});
