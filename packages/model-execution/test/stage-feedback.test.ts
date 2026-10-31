import assert from "node:assert/strict";
import { test } from "node:test";
import { createGoal, ModelStageFeedbackError } from "../../runtime/src/index";
import { LLMResponseProtocolError, decodeToolCallOutcome } from "../../model-response/src/index";
import {
    createBoundRunStageToolDeclarations,
    createBoundUnifiedToolDeclarations,
    modelOutputBindings,
} from "../../model-contracts/src/index";
import { toModelStageFeedback } from "../src/stage-feedback";
import { currentProtocols } from "../../agent/test/current-fixtures";

const goal = createGoal({ ...currentProtocols, id: "feedback", runId: "run-1", intent: "Inspect repository", promptBundleVersion: 1,
    profile: { id: "test", systemPrompt: "Inspect sources", instructions: [], toolIds: [] } });
const systemDeclarations = createBoundUnifiedToolDeclarations([], modelOutputBindings, true, false, false);
const completeRunDeclaration = systemDeclarations.find(declaration => declaration.id === "system_complete_task")!;
const startStageDeclaration = createBoundRunStageToolDeclarations({}, modelOutputBindings.systemTools)[0]!;

test("Schema literal feedback preserves the expected number and excludes the rejected private value", () => {
    let failure: unknown;
    try {
        decodeToolCallOutcome({ callId: "literal", toolId: "system_complete_task", argumentsJson: JSON.stringify({
            summary: "PRIVATE_SUMMARY", evidenceSequences: [], memoryPatch: { protocolVersion: "PRIVATE_VALUE", operations: [] },
        }) }, [completeRunDeclaration], []);
    } catch (error) { failure = error; }
    const mapped = toModelStageFeedback(failure, { goal }, "decide");
    assert.ok(mapped instanceof ModelStageFeedbackError);
    assert.match(mapped.feedback.issues[0]!.message, /type required/);
    assert.equal(JSON.stringify(mapped.feedback).includes("PRIVATE"), false);
});

test("未知阶段字段被剥离并产生有界诊断", () => {
    const input = { target: "Inspect architecture", acceptanceCriteria: ["Read source"] };
    const diagnostics: string[] = [];
    const decoded = startStageDeclaration.decode({
        ...input, extraParam: "PRIVATE_ID", customMeta: { protocolVersion: "1", operations: [] },
    }, { onDiagnostic: diagnostic => diagnostics.push(...diagnostic.paths) });
    assert.deepEqual(decoded, { kind: "run_stage_update", ...input });
    assert.deepEqual(diagnostics.sort(), ["/customMeta", "/extraParam"]);
    assert.equal(JSON.stringify(decoded).includes("PRIVATE"), false);
});

test("字段反馈按 code 生成纠正提示，保留混合问题并过滤原始异常文本", () => {
    const codes = ["missing_field", "extra_field", "invalid_type", "union_no_match"];
    const error = new LLMResponseProtocolError("PRIVATE_RESPONSE", { issues: codes.map((code, index) => ({
        code, path: index === 3 ? ["result", "memoryPatch"] : ["result", "action", "input", "field"], message: "PRIVATE_INPUT",
    })) });
    const mapped = toModelStageFeedback(error, { goal }, "decide");
    assert.ok(mapped instanceof ModelStageFeedbackError);
    assert.equal(mapped.feedback.origin, "tool_input");
    assert.deepEqual(mapped.feedback.issues.map(issue => issue.code), codes);
    for (const [index, pattern] of [/Supply/, /Remove/, /type required/, /allowed shape/].entries()) {
        assert.match(mapped.feedback.issues[index]!.message, pattern);
    }
    assert.equal(JSON.stringify(mapped.feedback).includes("PRIVATE_"), false);
    assert.ok(mapped.feedback.constraints?.some(text => /does not complete the task/.test(text)));
});

test("Agent 字段反馈保持 Runtime 的条数与路径界限，Think 不添加调用修复指令", () => {
    const error = new LLMResponseProtocolError("PRIVATE_RESPONSE", { issues: Array.from({ length: 12 }, () => ({
        code: "missing_field", path: ["action", "input", ...Array(10).fill("x".repeat(100))], message: "PRIVATE_INPUT",
    })) });
    const mapped = toModelStageFeedback(error, { goal }, "think");
    assert.ok(mapped instanceof ModelStageFeedbackError);
    assert.equal(mapped.feedback.origin, "output_contract");
    assert.equal(mapped.feedback.issues.length, 8);
    assert.equal(mapped.feedback.issues[0]!.path.length, 8);
    assert.equal(String(mapped.feedback.issues[0]!.path[2]).length, 80);
    assert.ok(mapped.feedback.issues.every(issue => issue.message.length <= 240));
    assert.equal(mapped.feedback.constraints?.some(text => /invalid call/.test(text)), false);
});

test("Memory-only native parsing errors use the canonical Patch path", () => {
    const mapped = toModelStageFeedback(new LLMResponseProtocolError("PRIVATE", { issues: [{ code: "invalid_type", path: ["arguments", "memoryPatch", "operations", 0, "fact", "value"], message: "PRIVATE" }] }), { goal }, "decide");
    assert.ok(mapped instanceof ModelStageFeedbackError);
    assert.equal(mapped.feedback.origin, "memory_patch");
    assert.deepEqual(mapped.feedback.issues[0]!.path, ["result", "memoryPatch", "operations", 0, "fact", "value"]);
    assert.ok(!JSON.stringify(mapped.feedback).includes("PRIVATE"));
});

test("Memory 字段类型反馈保留期望的 JSON 类型且不回传任意诊断正文", () => {
    for (const [message, expected] of [
        ["Expected an array", /JSON array/],
        ["Expected a finite number", /JSON number/],
        ["Expected an array; PRIVATE_INPUT", /type required/],
    ] as const) {
        const mapped = toModelStageFeedback(new LLMResponseProtocolError("PRIVATE", {
            issues: [{ code: "invalid_type", path: ["arguments", "memoryPatch", "operations", 0, "fact", "evidenceSequences"], message }],
        }), { goal }, "decide");
        assert.ok(mapped instanceof ModelStageFeedbackError);
        assert.equal(mapped.feedback.origin, "memory_patch");
        assert.match(mapped.feedback.issues[0]!.message, expected);
        assert.equal(JSON.stringify(mapped.feedback).includes("PRIVATE"), false);
    }
});


test("工具形状反馈只包含字段名与当前声明，不回传参数值", () => {
    const error = new LLMResponseProtocolError("PRIVATE_RESPONSE", {
        issues: [{ code: "extra_field", path: ["protocolVersion"], message: "PRIVATE_VALUE" }],
        toolCallShape: { toolId: "system_complete_task", providedFields: ["summary", "protocolVersion"],
            allowedFields: ["summary", "evidenceSequences", "memoryPatch"], requiredFields: ["summary", "evidenceSequences", "memoryPatch"] },
    });
    const mapped = toModelStageFeedback(error, { goal }, "decide");
    assert.ok(mapped instanceof ModelStageFeedbackError);
    const text = JSON.stringify(mapped.feedback);
    for (const field of ["system_complete_task", "Provided fields", "Allowed fields", "Required fields", "protocolVersion"]) assert.ok(text.includes(field));
    assert.ok(!text.includes("PRIVATE_"));
    assert.ok(mapped.feedback.constraints!.every(line => line.length <= 240));
});

test("未授权或未知系统工具调用生成清晰提示切换合法工具", () => {
    let failure: unknown;
    try {
        decodeToolCallOutcome({
            callId: "call_unauth",
            toolId: "system_start_run_stage",
            argumentsJson: JSON.stringify({ target: "test", acceptanceCriteria: ["done"] }),
        }, [completeRunDeclaration], []);
    } catch (error) {
        failure = error;
    }
    const mapped = toModelStageFeedback(failure, { goal }, "decide");
    assert.ok(mapped instanceof ModelStageFeedbackError);
    assert.equal(mapped.feedback.origin, "output_contract");
    assert.deepEqual(mapped.feedback.issues[0]?.path, ["system_start_run_stage"]);
    assert.match(
        mapped.feedback.issues[0]!.message,
        /Tool call "system_start_run_stage" is not declared or not authorized in the current state/,
    );
});
