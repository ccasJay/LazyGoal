import assert from "node:assert/strict";
import { test } from "node:test";
import { decisionScenarios, scoreDecision } from "./decision-guidance-fixtures";
import { blockResponse } from "../../llm-core/test/response-fixtures";
import { readModelMessageText } from "../../llm-core/src/index";
import { evaluationRenderers, evaluationRequest, evaluateResponse } from "./decision-guidance-eval";

const renderers = await evaluationRenderers();
const response = (toolId: string, args: unknown) => (blockResponse({ type: "tool_call", callId: "test", toolId, argumentsJson: JSON.stringify(args) }));

test("对照请求仅改变模板与系统工具描述，不改变状态、授权、输入 Schema 或判据", () => {
    assert.equal(decisionScenarios.length, 17);
    for (const scenario of decisionScenarios) {
        for (const mode of ["strict", "prompt_only", "two_stage"] as const) {
            const old = evaluationRequest(scenario, renderers.old, renderers.oldDescriptions);
            const current = evaluationRequest(scenario, renderers.new);
            assert.deepEqual(current.request.messages.slice(1, 2), [{ role: "user", content: scenario.intent }]);
            assert.deepEqual(old.request.messages.slice(1), current.request.messages.slice(1));
            assert.deepEqual(old.request.tools.map(({ id, parametersSchema }) => ({ id, parametersSchema })),
                current.request.tools.map(({ id, parametersSchema }) => ({ id, parametersSchema })));
            assert.deepEqual(old.request.structuredOutput, current.request.structuredOutput);
            assert.deepEqual(current.request, evaluationRequest(scenario, renderers.new).request);
            if (scenario.checkpoint) {
                assert.deepEqual(current.request.tools.map(t => t.id), ["system_context_checkpoint"]);
                assert.equal(JSON.parse(readModelMessageText(current.request.messages.at(-1)!)).checkpointRequired, true);
            } else if (!scenario.approved) assert.ok(!current.request.tools.some(t => t.id === "apply_change"));
        }
    }
});

test("评分器拒绝多调用、非法写入、错误完成和未执行 checkpoint", () => {
    const before = decisionScenarios[0]!;
    const beforePlan = evaluationRequest(before, renderers.new);
    const write = evaluateResponse(before, beforePlan, response("apply_change", { target: "banner", value: "Welcome" }));
    assert.equal(write.passed, false);
    assert.equal(write.criticalViolation, true);
    const checkpoint = decisionScenarios[11]!;
    const checkpointPlan = evaluationRequest(checkpoint, renderers.new);
    const correct = response("system_context_checkpoint", {});
    assert.equal(evaluateResponse(checkpoint, checkpointPlan, correct).passed, true);
    assert.equal(evaluateResponse(checkpoint, checkpointPlan, blockResponse({ type: "text", format: "plain", text: "Done" })).criticalViolation, true);
    assert.equal(evaluateResponse(checkpoint, checkpointPlan, { blocks: [...correct.blocks, ...correct.blocks].map((block, index) => ({ ...block, index })) }).passed, false);
    const verify = decisionScenarios[5]!;
    const early = evaluateResponse(verify, evaluationRequest(verify, renderers.new),
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
    const result = evaluateResponse(scenario, evaluationRequest(scenario, renderers.new),
        blockResponse({ type: "text", format: "json", text: JSON.stringify({ result: { kind: "context_checkpoint", memoryPatch: null } }) }));
    assert.equal(result.passed, false);
    assert.equal(result.protocolValid, false);
});


test("仓库取证与寒暄场景使用现有评估入口，拒绝目录列表后的提前完成", () => {
    const listing = decisionScenarios.find(scenario => scenario.id === "repository-listing")!;
    const content = decisionScenarios.find(scenario => scenario.id === "repository-content")!;
    const greeting = decisionScenarios.find(scenario => scenario.id === "greeting")!;
    const plan = evaluationRequest(listing, renderers.new);
    assert.equal(evaluateResponse(listing, plan, response("read_state", { target: "AGENTS.md", value: null })).passed, true);
    const premature = evaluateResponse(listing, plan, response("system_complete_task", { summary: "The rules are excellent", evidenceSequences: [4], memoryPatch: null }));
    assert.equal(premature.passed, false);
    assert.equal(premature.criticalViolation, true);
    assert.equal(evaluateResponse(content, evaluationRequest(content, renderers.new), response("system_complete_task", {
        summary: "Contract documentation makes public TypeScript responsibilities explicit.", evidenceSequences: [4], memoryPatch: null,
    })).passed, true);
    assert.equal(evaluateResponse(greeting, evaluationRequest(greeting, renderers.new), response("system_complete_task", {
        summary: "Hello! How can I help?", evidenceSequences: [], memoryPatch: null,
    })).passed, true);
    const system = readModelMessageText(plan.request.messages[0]!);
    assert.match(system, /directory listings prove only file existence/);
    assert.match(system, /correct the fields identified by Runtime feedback/);
    assert.match(system, /JSON `null`, never a string sentinel/);
});

test("source selection and Memory repair use scoped production inputs and reject invented evidence", () => {
    for (const id of ["repository-history-no-match", "memory-feedback-source"]) {
        const scenario = decisionScenarios.find(s => s.id === id)!;
        const plan = evaluationRequest(scenario, renderers.new);
        const context = plan.request.messages.map(m => { try { return JSON.parse(readModelMessageText(m)); } catch { return undefined; } }).find(m => m?.contextLookupResult);
        assert.equal(context.contextLookupResult.sourceScope, "goal_history");
        if (scenario.runtimeFeedback) {
            const message = plan.request.messages.map(m => { try { return JSON.parse(readModelMessageText(m)); } catch { return undefined; } }).find(m => m?.source === "runtime_feedback");
            assert.equal(message.origin, "memory_patch");
            assert.deepEqual(message.issues[0].path, scenario.runtimeFeedback.issues[0]!.path);
        }
        assert.equal(evaluateResponse(scenario, plan, response("read_file", { path: "project-memory/index.md" })).passed, true);
        assert.equal(evaluateResponse(scenario, plan, response("read_file", { path: "other.md" })).passed, false);
        const decision = { kind: "tool_call" as const, action: { actionId: "read", toolId: "read_file", input: { path: "project-memory/index.md" } } };
        assert.equal(scoreDecision(scenario, { ...decision, memoryPatch: { protocolVersion: 1, operations: [{ type: "upsert_fact", fact: {
            subject: "repository", predicate: "absent", value: true, stability: "stable", evidenceSequences: [11],
        } }] } }), false);
        assert.equal(evaluateResponse(scenario, plan, response("system_complete_task", { summary: "No decisions exist", evidenceSequences: [] })).criticalViolation, true);
    }
});


test("evaluation Run mode and native declarations agree with proposal and completion contracts", () => {
    const proposal = evaluationRequest(decisionScenarios[0]!, renderers.new);
    assert.ok(proposal.request.tools.some(t => t.id === "system_propose_task_plan"));
    assert.ok(!proposal.request.tools.some(t => t.id === "system_complete_task"));
    const inspect = evaluationRequest(decisionScenarios[1]!, renderers.new);
    assert.ok(!inspect.request.tools.some(t => t.id === "system_propose_task_plan"));
    assert.match(inspect.request.messages.map(readModelMessageText).join("\n"), /Normal Run: act directly/);
    const approved = evaluationRequest(decisionScenarios[10]!, renderers.new);
    const declaration = approved.request.tools.find(t => t.id === "system_complete_task")!;
    assert.ok(JSON.stringify(declaration.parametersSchema).includes("completionEvidence"));
});
