import assert from "node:assert/strict";
import { test } from "node:test";

import {
    compileJsonSchema,
    safeParse,
    type InferContract,
} from "../../contracts/src/index";
import {
    BASH_INPUT_CONTRACT,
    BASH_MAX_TIMEOUT_MS,
    BashTool,
    EDIT_FILE_INPUT_CONTRACT,
    EditFileTool,
    GREP_INPUT_CONTRACT,
    GrepTool,
    READ_FILE_INPUT_CONTRACT,
    ReadFileTool,
    WRITE_FILE_INPUT_CONTRACT,
    WriteFileTool,
} from "../src/index";
import { createToolRegistration } from "../../../packages/runtime/src/index";

type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends
        (<Value>() => Value extends Right ? 1 : 2)
        ? true
        : false;
type Assert<Value extends true> = Value;

type _BashInputIsInferred = Assert<Equal<
    InferContract<typeof BASH_INPUT_CONTRACT>,
    { readonly command: string; readonly timeoutMs?: number }
>>;
type _ReadFileInputIsInferred = Assert<Equal<
    InferContract<typeof READ_FILE_INPUT_CONTRACT>,
    { readonly path: string }
>>;
type _WriteFileInputIsInferred = Assert<Equal<
    InferContract<typeof WRITE_FILE_INPUT_CONTRACT>,
    { readonly path: string; readonly content: string }
>>;
type _EditFileInputIsInferred = Assert<Equal<
    InferContract<typeof EDIT_FILE_INPUT_CONTRACT>,
    { readonly path: string; readonly oldString: string; readonly newString: string }
>>;
type _GrepInputIsInferred = Assert<Equal<
    InferContract<typeof GREP_INPUT_CONTRACT>,
    { readonly pattern: string; readonly path?: string; readonly ignoreCase?: boolean }
>>;

type _BashValidateUsesContractOutput = Assert<Equal<
    Parameters<BashTool["validate"]>[0],
    InferContract<typeof BASH_INPUT_CONTRACT>
>>;
type _ReadFileExecuteUsesContractOutput = Assert<Equal<
    Parameters<ReadFileTool["execute"]>[0]["input"],
    InferContract<typeof READ_FILE_INPUT_CONTRACT>
>>;
type _WriteFileExecuteUsesContractOutput = Assert<Equal<
    Parameters<WriteFileTool["execute"]>[0]["input"],
    InferContract<typeof WRITE_FILE_INPUT_CONTRACT>
>>;
type _EditFileValidateUsesContractOutput = Assert<Equal<
    Parameters<EditFileTool["validate"]>[0],
    InferContract<typeof EDIT_FILE_INPUT_CONTRACT>
>>;
type _GrepExecuteUsesContractOutput = Assert<Equal<
    Parameters<GrepTool["execute"]>[0]["input"],
    InferContract<typeof GREP_INPUT_CONTRACT>
>>;

const schemaUri = "https://json-schema.org/draft/2020-12/schema";

const contractCases = [
    {
        id: "bash",
        inputContract: BASH_INPUT_CONTRACT,
        valid: { command: "  echo hello  ", timeoutMs: 1 },
        invalid: [
            { value: {}, code: "missing_field", path: ["command"] },
            { value: { command: 42 }, code: "invalid_type", path: ["command"] },
            {
                value: { command: "ls", timeoutMs: 1.5 },
                code: "not_integer",
                path: ["timeoutMs"],
            },
            {
                value: { command: "ls", timeoutMs: BASH_MAX_TIMEOUT_MS + 1 },
                code: "number_maximum",
                path: ["timeoutMs"],
            },
            { value: { command: "ls", extra: true }, code: "extra_field", path: ["extra"] },
        ],
        schema: {
            $schema: schemaUri,
            type: "object",
            properties: {
                command: { type: "string" },
                timeoutMs: {
                    type: "integer",
                    minimum: 1,
                    maximum: BASH_MAX_TIMEOUT_MS,
                },
            },
            required: ["command"],
            additionalProperties: false,
        },
    },
    {
        id: "read_file",
        inputContract: READ_FILE_INPUT_CONTRACT,
        valid: { path: "src/file.txt" },
        invalid: [
            { value: {}, code: "missing_field", path: ["path"] },
            { value: { path: 42 }, code: "invalid_type", path: ["path"] },
            { value: { path: "src/file.txt", extra: true }, code: "extra_field", path: ["extra"] },
        ],
        schema: {
            $schema: schemaUri,
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
            additionalProperties: false,
        },
    },
    {
        id: "write_file",
        inputContract: WRITE_FILE_INPUT_CONTRACT,
        valid: { path: "src/file.txt", content: "" },
        invalid: [
            { value: { path: "src/file.txt" }, code: "missing_field", path: ["content"] },
            {
                value: { path: "src/file.txt", content: 42 },
                code: "invalid_type",
                path: ["content"],
            },
            {
                value: { path: "src/file.txt", content: "x", extra: true },
                code: "extra_field",
                path: ["extra"],
            },
        ],
        schema: {
            $schema: schemaUri,
            type: "object",
            properties: {
                path: { type: "string" },
                content: { type: "string" },
            },
            required: ["path", "content"],
            additionalProperties: false,
        },
    },
    {
        id: "edit_file",
        inputContract: EDIT_FILE_INPUT_CONTRACT,
        valid: { path: "src/file.txt", oldString: " old ", newString: " new " },
        invalid: [
            {
                value: { path: "src/file.txt", oldString: "old" },
                code: "missing_field",
                path: ["newString"],
            },
            {
                value: { path: "src/file.txt", oldString: 42, newString: "new" },
                code: "invalid_type",
                path: ["oldString"],
            },
            {
                value: { path: "src/file.txt", oldString: "old", newString: "new", extra: true },
                code: "extra_field",
                path: ["extra"],
            },
        ],
        schema: {
            $schema: schemaUri,
            type: "object",
            properties: {
                path: { type: "string" },
                oldString: { type: "string" },
                newString: { type: "string" },
            },
            required: ["path", "oldString", "newString"],
            additionalProperties: false,
        },
    },
    {
        id: "grep",
        inputContract: GREP_INPUT_CONTRACT,
        valid: { pattern: "  TODO  ", path: "src", ignoreCase: false },
        invalid: [
            { value: {}, code: "missing_field", path: ["pattern"] },
            { value: { pattern: 42 }, code: "invalid_type", path: ["pattern"] },
            { value: { pattern: "a", path: 42 }, code: "invalid_type", path: ["path"] },
            {
                value: { pattern: "a", ignoreCase: "yes" },
                code: "invalid_type",
                path: ["ignoreCase"],
            },
            { value: { pattern: "a", extra: true }, code: "extra_field", path: ["extra"] },
        ],
        schema: {
            $schema: schemaUri,
            type: "object",
            properties: {
                pattern: { type: "string" },
                path: { type: "string" },
                ignoreCase: { type: "boolean" },
            },
            required: ["pattern"],
            additionalProperties: false,
        },
    },
] as const;

test("五个通用 Tool Contract 推导稳定类型并拒绝非法结构", () => {
    for (const contractCase of contractCases) {
        const result = safeParse(contractCase.inputContract, contractCase.valid);

        assert.equal(result.success, true, `${contractCase.id} valid input was rejected`);
        if (result.success) {
            assert.deepEqual(result.data, contractCase.valid);
        }

        for (const invalid of contractCase.invalid) {
            const invalidResult = safeParse(contractCase.inputContract, invalid.value);

            assert.equal(
                invalidResult.success,
                false,
                `${contractCase.id} accepted ${JSON.stringify(invalid.value)}`,
            );
            if (!invalidResult.success) {
                assert.equal(invalidResult.issues[0]?.code, invalid.code);
                assert.deepEqual(invalidResult.issues[0]?.path, invalid.path);
            }
        }
    }
});

test("五个通用 Tool Contract 编译出精确且确定性的 JSON Schema", () => {
    for (const contractCase of contractCases) {
        const first = compileJsonSchema(contractCase.inputContract);
        const second = compileJsonSchema(contractCase.inputContract);

        assert.deepEqual(first, contractCase.schema, `${contractCase.id} schema changed`);
        assert.equal(
            JSON.stringify(first),
            JSON.stringify(second),
            `${contractCase.id} schema compilation is not deterministic`,
        );
        assert.notStrictEqual(first, second);
    }
});

test("结构 Contract 成功后仍由 Tool 继续执行领域语义校验", () => {
    const semanticCases = [
        {
            id: "bash",
            inputContract: BASH_INPUT_CONTRACT,
            input: { command: "   " },
            validate: () => new BashTool("/workspace").validate({ command: "   " }),
        },
        {
            id: "read_file",
            inputContract: READ_FILE_INPUT_CONTRACT,
            input: { path: "../secret.txt" },
            validate: () => new ReadFileTool("/workspace").validate({ path: "../secret.txt" }),
        },
        {
            id: "write_file",
            inputContract: WRITE_FILE_INPUT_CONTRACT,
            input: { path: ".lazygoal/goals/goal.json", content: "x" },
            validate: () => new WriteFileTool("/workspace").validate({
                path: ".lazygoal/goals/goal.json",
                content: "x",
            }),
        },
        {
            id: "edit_file",
            inputContract: EDIT_FILE_INPUT_CONTRACT,
            input: { path: "notes.txt", oldString: "", newString: "new" },
            validate: () => new EditFileTool("/workspace").validate({
                path: "notes.txt",
                oldString: "",
                newString: "new",
            }),
        },
        {
            id: "grep",
            inputContract: GREP_INPUT_CONTRACT,
            input: { pattern: "a(" },
            validate: () => new GrepTool("/workspace").validate({ pattern: "a(" }),
        },
    ] as const;

    for (const semanticCase of semanticCases) {
        assert.equal(
            safeParse(semanticCase.inputContract, semanticCase.input).success,
            true,
            `${semanticCase.id} semantic fixture must pass structural validation`,
        );
        assert.equal(semanticCase.validate().ok, false, `${semanticCase.id} semantic rule was skipped`);
    }
});

test("准备结果保留原始文本、类型和可选字段缺省状态", () => {
    const cases = [
        {
            id: "bash",
            registration: createToolRegistration(new BashTool("/workspace")),
            input: { command: "  echo hello  ", timeoutMs: 10 },
        },
        {
            id: "read_file",
            registration: createToolRegistration(new ReadFileTool("/workspace")),
            input: { path: "notes.txt" },
        },
        {
            id: "write_file",
            registration: createToolRegistration(new WriteFileTool("/workspace")),
            input: { path: "notes.txt", content: "  " },
        },
        {
            id: "edit_file",
            registration: createToolRegistration(new EditFileTool("/workspace")),
            input: { path: "notes.txt", oldString: " old ", newString: " new " },
        },
        {
            id: "grep",
            registration: createToolRegistration(new GrepTool("/workspace")),
            input: { pattern: "  TODO  ", path: "src" },
        },
    ] as const;

    for (const toolCase of cases) {
        const result = toolCase.registration.prepare(toolCase.input);

        assert.equal(result.ok, true, `${toolCase.id} canonical input was rejected`);
        if (result.ok) {
            assert.deepEqual(result.input, toolCase.input);
            assert.notStrictEqual(result.input, toolCase.input);
        }
    }
});
