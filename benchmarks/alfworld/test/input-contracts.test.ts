import assert from "node:assert/strict";
import { test } from "node:test";

import {
    ALFWORLD_RESET_TOOL_ID,
    ALFWORLD_STEP_TOOL_ID,
    AlfworldResetTool,
    AlfworldStepTool,
    alfworldResetInputBinding,
    alfworldStepInputBinding,
} from "../src/alfworld-tools.js";

test("ALFWorld Reset 与 Step 使用生成输入绑定校验结构 fixtures", () => {
    const cases = [
        {
            id: ALFWORLD_RESET_TOOL_ID,
            binding: alfworldResetInputBinding,
            valid: {},
            invalid: [
                { value: null, code: "invalid_type", path: "" },
                { value: { extra: true }, code: "extra_field", path: "/*" },
            ],
        },
        {
            id: ALFWORLD_STEP_TOOL_ID,
            binding: alfworldStepInputBinding,
            valid: { command: "  look  " },
            invalid: [
                { value: {}, code: "missing_field", path: "/command" },
                { value: { command: 42 }, code: "invalid_type", path: "/command" },
                { value: { command: "look", extra: true }, code: "extra_field", path: "/*" },
            ],
        },
    ] as const;

    for (const contractCase of cases) {
        const valid = contractCase.binding.read(contractCase.valid, "reject");
        assert.equal(valid.ok, true, `${contractCase.id} valid input was rejected`);
        if (valid.ok) assert.deepEqual(valid.data, contractCase.valid);

        for (const invalid of contractCase.invalid) {
            const result = contractCase.binding.read(invalid.value, "reject");
            assert.equal(result.ok, false, `${contractCase.id} accepted ${JSON.stringify(invalid.value)}`);
            if (!result.ok) {
                assert.equal(result.issues[0]?.code, invalid.code);
                assert.equal(result.issues[0]?.path, invalid.path);
            }
        }

        const first = contractCase.binding.modelProjection().schema;
        const second = contractCase.binding.modelProjection().schema;
        assert.equal(JSON.stringify(first), JSON.stringify(second));
        assert.strictEqual(first, second);
    }
});

test("ALFWorld Step 的空白语义规则不改变已解析命令", () => {
    const whitespaceInput = { command: "   " };
    const parsed = alfworldStepInputBinding.read(whitespaceInput, "reject");
    const stepTool = new AlfworldStepTool({
        phase: "active",
        reset: async () => {
            throw new Error("reset is not used by this test");
        },
        step: async () => {
            throw new Error("step is not used by this test");
        },
        close: async () => {},
    });

    assert.equal(parsed.ok, true);
    assert.deepEqual(stepTool.validate(whitespaceInput), {
        ok: false,
        error: {
            code: "INVALID_TOOL_INPUT",
            message: "alfworld_step.command 不能为空",
        },
    });
});
