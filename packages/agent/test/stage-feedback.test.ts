import assert from "node:assert/strict";
import { test } from "node:test";
import { createGoal, ModelStageFeedbackError } from "../../runtime/src/index";
import { LLMResponseProtocolError } from "../src/errors";
import { toModelStageFeedback } from "../src/stage-feedback";
import { currentProtocols } from "./current-fixtures";

const goal = createGoal({ ...currentProtocols, id: "feedback", runId: "run-1", intent: "Inspect repository", promptBundleVersion: 1,
    profile: { id: "test", systemPrompt: "Inspect sources", instructions: [], toolIds: [] } });

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
