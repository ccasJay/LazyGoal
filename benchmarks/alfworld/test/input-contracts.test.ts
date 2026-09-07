import assert from "node:assert/strict";
import { test } from "node:test";

import {
    compileJsonSchema,
    safeParse,
    type InferContract,
} from "../../../packages/contracts/src/index.js";
import {
    ALFWORLD_RESET_INPUT_CONTRACT,
    ALFWORLD_STEP_INPUT_CONTRACT,
    AlfworldResetTool,
    AlfworldStepTool,
} from "../src/alfworld-tools.js";

type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends
        (<Value>() => Value extends Right ? 1 : 2)
        ? true
        : false;
type Assert<Value extends true> = Value;

type _ResetInputIsEmptyObject = Assert<Equal<
    InferContract<typeof ALFWORLD_RESET_INPUT_CONTRACT>,
    {}
>>;
type _StepInputIsInferred = Assert<Equal<
    InferContract<typeof ALFWORLD_STEP_INPUT_CONTRACT>,
    { readonly command: string }
>>;
type _ResetValidateUsesContractOutput = Assert<Equal<
    Parameters<AlfworldResetTool["validate"]>[0],
    InferContract<typeof ALFWORLD_RESET_INPUT_CONTRACT>
>>;
type _StepExecuteUsesContractOutput = Assert<Equal<
    Parameters<AlfworldStepTool["execute"]>[0]["input"],
    InferContract<typeof ALFWORLD_STEP_INPUT_CONTRACT>
>>;

const schemaUri = "https://json-schema.org/draft/2020-12/schema";

test("ALFWorld Reset 与 Step Contract 通过类型推导和结构 fixtures", () => {
    const cases = [
        {
            id: "alfworld_reset",
            inputContract: ALFWORLD_RESET_INPUT_CONTRACT,
            valid: {},
            invalid: [
                { value: null, code: "invalid_type", path: [] },
                { value: { extra: true }, code: "extra_field", path: ["extra"] },
            ],
            schema: {
                $schema: schemaUri,
                type: "object",
                properties: {},
                additionalProperties: false,
            },
        },
        {
            id: "alfworld_step",
            inputContract: ALFWORLD_STEP_INPUT_CONTRACT,
            valid: { command: "  look  " },
            invalid: [
                { value: {}, code: "missing_field", path: ["command"] },
                { value: { command: 42 }, code: "invalid_type", path: ["command"] },
                { value: { command: "look", extra: true }, code: "extra_field", path: ["extra"] },
            ],
            schema: {
                $schema: schemaUri,
                type: "object",
                properties: { command: { type: "string" } },
                required: ["command"],
                additionalProperties: false,
            },
        },
    ] as const;

    for (const contractCase of cases) {
        const parsed = safeParse(contractCase.inputContract, contractCase.valid);

        assert.equal(parsed.success, true, `${contractCase.id} valid input was rejected`);
        if (parsed.success) assert.deepEqual(parsed.data, contractCase.valid);

        for (const invalid of contractCase.invalid) {
            const result = safeParse(contractCase.inputContract, invalid.value);

            assert.equal(
                result.success,
                false,
                `${contractCase.id} accepted ${JSON.stringify(invalid.value)}`,
            );
            if (!result.success) {
                assert.equal(result.issues[0]?.code, invalid.code);
                assert.deepEqual(result.issues[0]?.path, invalid.path);
            }
        }

        const first = compileJsonSchema(contractCase.inputContract);
        const second = compileJsonSchema(contractCase.inputContract);
        assert.deepEqual(first, contractCase.schema);
        assert.equal(JSON.stringify(first), JSON.stringify(second));
        assert.notStrictEqual(first, second);
    }
});

test("ALFWorld Step 的空白语义规则不改变已解析命令", () => {
    const whitespaceInput = { command: "   " };
    const parsed = safeParse(ALFWORLD_STEP_INPUT_CONTRACT, whitespaceInput);
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

    assert.equal(parsed.success, true);
    assert.deepEqual(stepTool.validate(whitespaceInput), {
        ok: false,
        error: {
            code: "INVALID_TOOL_INPUT",
            message: "alfworld_step.command 不能为空",
        },
    });
});
