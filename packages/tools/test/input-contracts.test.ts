import assert from "node:assert/strict";
import { test } from "node:test";

import {
    compileJsonSchema,
    safeParse,
    type InferContract,
} from "../../contracts/src/index";
import {
    APPLY_PATCH_INPUT_CONTRACT,
    ApplyPatchTool,
    BASH_INPUT_CONTRACT,
    BASH_MAX_TIMEOUT_MS,
    BashTool,
    EDIT_FILE_INPUT_CONTRACT,
    EditFileTool,
    FIND_FILES_INPUT_CONTRACT,
    FIND_FILES_MAX_RESULTS_LIMIT,
    FindFilesTool,
    GitBranchListTool,
    GitDiffTool,
    GitLogTool,
    GitShowTool,
    GitStatusTool,
    GitWorktreeListTool,
    GitAddTool,
    GitCommitTool,
    GitBranchCreateTool,
    GitBranchSwitchTool,
    GitWorktreeAddTool,
    GitWorktreeRemoveTool,
    GREP_INPUT_CONTRACT,
    GREP_MAX_CONTEXT_LINES,
    GREP_MAX_MATCHES_LIMIT,
    GrepTool,
    LIST_DIRECTORY_INPUT_CONTRACT,
    LIST_DIRECTORY_MAX_ENTRIES_LIMIT,
    ListDirectoryTool,
    PROCESS_READ_INPUT_CONTRACT,
    PROCESS_READ_MAX_CHARS_LIMIT,
    PROCESS_READ_MAX_WAIT_MS,
    ProcessReadTool,
    PROCESS_START_INPUT_CONTRACT,
    ProcessStartTool,
    PROCESS_STOP_INPUT_CONTRACT,
    ProcessStopTool,
    READ_FILE_INPUT_CONTRACT,
    READ_FILE_MAX_CHARS_LIMIT,
    ReadFileTool,
    WEB_FETCH_INPUT_CONTRACT,
    WEB_FETCH_MAX_CHARS_LIMIT,
    WebFetchTool,
    WEB_SEARCH_INPUT_CONTRACT,
    WEB_SEARCH_MAX_RESULTS_LIMIT,
    WebSearchTool,
    WRITE_FILE_INPUT_CONTRACT,
    WriteFileTool,
} from "../src/index";
import {
    createToolRegistration,
} from "../../../packages/runtime/src/index";

type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends
        (<Value>() => Value extends Right ? 1 : 2)
        ? true
        : false;
type Assert<Value extends true> = Value;

type _BashInputIsInferred = Assert<Equal<
    InferContract<typeof BASH_INPUT_CONTRACT>,
    {
        readonly command: string;
        readonly timeoutMs?: number;
        readonly sandboxAccess?: {
            readonly files?: readonly {
                readonly path: string;
                readonly access: "read" | "write";
                readonly kind: "file" | "directory_tree";
                readonly purpose: string;
            }[];
            readonly network?: {
                readonly targets: readonly string[];
                readonly purpose: string;
            };
        };
    }
>>;
type _ReadFileInputIsInferred = Assert<Equal<
    InferContract<typeof READ_FILE_INPUT_CONTRACT>,
    {
        readonly path: string;
        readonly cursor?: string;
        readonly endLine?: number;
        readonly maxChars?: number;
        readonly startLine?: number;
    }
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
    {
        readonly pattern: string;
        readonly contextLines?: number;
        readonly cursor?: string;
        readonly exclude?: string;
        readonly ignoreCase?: boolean;
        readonly include?: string;
        readonly maxMatches?: number;
        readonly path?: string;
    }
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
                sandboxAccess: {
                    type: "object",
                    properties: {
                        files: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    path: { type: "string" },
                                    access: { enum: ["read", "write"] },
                                    kind: { enum: ["file", "directory_tree"] },
                                    purpose: { type: "string" },
                                },
                                required: ["path", "access", "kind", "purpose"],
                                additionalProperties: false,
                            },
                        },
                        network: {
                            type: "object",
                            properties: {
                                targets: {
                                    type: "array",
                                    items: { type: "string" },
                                },
                                purpose: { type: "string" },
                            },
                            required: ["targets", "purpose"],
                            additionalProperties: false,
                        },
                    },
                    additionalProperties: false,
                },
            },
            required: ["command"],
            additionalProperties: false,
        },
    },
    {
        id: "read_file",
        inputContract: READ_FILE_INPUT_CONTRACT,
        valid: {
            path: "src/file.txt",
            startLine: 1,
            endLine: 10,
            maxChars: 1000,
            cursor: "cur123",
        },
        invalid: [
            { value: {}, code: "missing_field", path: ["path"] },
            { value: { path: 42 }, code: "invalid_type", path: ["path"] },
            { value: { path: "src/file.txt", startLine: 0 }, code: "number_minimum", path: ["startLine"] },
            { value: { path: "src/file.txt", endLine: 0 }, code: "number_minimum", path: ["endLine"] },
            { value: { path: "src/file.txt", maxChars: 0 }, code: "number_minimum", path: ["maxChars"] },
            { value: { path: "src/file.txt", maxChars: READ_FILE_MAX_CHARS_LIMIT + 1 }, code: "number_maximum", path: ["maxChars"] },
            { value: { path: "src/file.txt", cursor: 123 }, code: "invalid_type", path: ["cursor"] },
            { value: { path: "src/file.txt", extra: true }, code: "extra_field", path: ["extra"] },
        ],
        schema: {
            $schema: schemaUri,
            type: "object",
            properties: {
                path: { type: "string" },
                startLine: { type: "integer", minimum: 1, maximum: 9007199254740991 },
                endLine: { type: "integer", minimum: 1, maximum: 9007199254740991 },
                maxChars: { type: "integer", minimum: 1, maximum: READ_FILE_MAX_CHARS_LIMIT },
                cursor: { type: "string" },
            },
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
        id: "apply_patch",
        inputContract: APPLY_PATCH_INPUT_CONTRACT,
        valid: { patch: "--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-1\n+2\n" },
        invalid: [
            { value: {}, code: "missing_field", path: ["patch"] },
            { value: { patch: 42 }, code: "invalid_type", path: ["patch"] },
            { value: { patch: "diff", extra: true }, code: "extra_field", path: ["extra"] },
        ],
        schema: {
            $schema: schemaUri,
            type: "object",
            properties: {
                patch: { type: "string" },
            },
            required: ["patch"],
            additionalProperties: false,
        },
    },
    {
        id: "web_search",
        inputContract: WEB_SEARCH_INPUT_CONTRACT,
        valid: { query: "LazyGoal", maxResults: 10 },
        invalid: [
            { value: {}, code: "missing_field", path: ["query"] },
            { value: { query: 42 }, code: "invalid_type", path: ["query"] },
            { value: { query: "LazyGoal", maxResults: 0 }, code: "number_minimum", path: ["maxResults"] },
            { value: { query: "LazyGoal", maxResults: WEB_SEARCH_MAX_RESULTS_LIMIT + 1 }, code: "number_maximum", path: ["maxResults"] },
            { value: { query: "LazyGoal", extra: true }, code: "extra_field", path: ["extra"] },
        ],
        schema: {
            $schema: schemaUri,
            type: "object",
            properties: {
                query: { type: "string" },
                maxResults: { type: "integer", minimum: 1, maximum: WEB_SEARCH_MAX_RESULTS_LIMIT },
            },
            required: ["query"],
            additionalProperties: false,
        },
    },
    {
        id: "web_fetch",
        inputContract: WEB_FETCH_INPUT_CONTRACT,
        valid: { url: "https://example.com", maxChars: 16000, offset: 0 },
        invalid: [
            { value: {}, code: "missing_field", path: ["url"] },
            { value: { url: 42 }, code: "invalid_type", path: ["url"] },
            { value: { url: "https://example.com", maxChars: 0 }, code: "number_minimum", path: ["maxChars"] },
            { value: { url: "https://example.com", maxChars: WEB_FETCH_MAX_CHARS_LIMIT + 1 }, code: "number_maximum", path: ["maxChars"] },
            { value: { url: "https://example.com", offset: -1 }, code: "number_minimum", path: ["offset"] },
            { value: { url: "https://example.com", extra: true }, code: "extra_field", path: ["extra"] },
        ],
        schema: {
            $schema: schemaUri,
            type: "object",
            properties: {
                url: { type: "string" },
                maxChars: { type: "integer", minimum: 1, maximum: WEB_FETCH_MAX_CHARS_LIMIT },
                offset: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
            },
            required: ["url"],
            additionalProperties: false,
        },
    },
    {
        id: "list_directory",
        inputContract: LIST_DIRECTORY_INPUT_CONTRACT,
        valid: { path: "src", maxEntries: 100, cursor: "abc" },
        invalid: [
            { value: { path: 42 }, code: "invalid_type", path: ["path"] },
            { value: { maxEntries: 0 }, code: "number_minimum", path: ["maxEntries"] },
            { value: { maxEntries: LIST_DIRECTORY_MAX_ENTRIES_LIMIT + 1 }, code: "number_maximum", path: ["maxEntries"] },
            { value: { maxEntries: 1.5 }, code: "not_integer", path: ["maxEntries"] },
            { value: { cursor: 123 }, code: "invalid_type", path: ["cursor"] },
            { value: { extra: true }, code: "extra_field", path: ["extra"] },
        ],
        schema: {
            $schema: schemaUri,
            type: "object",
            properties: {
                path: { type: "string" },
                maxEntries: {
                    type: "integer",
                    minimum: 1,
                    maximum: LIST_DIRECTORY_MAX_ENTRIES_LIMIT,
                },
                cursor: { type: "string" },
            },
            additionalProperties: false,
        },
    },
    {
        id: "find_files",
        inputContract: FIND_FILES_INPUT_CONTRACT,
        valid: { pattern: "**/*.ts", path: "src", maxResults: 100, cursor: "abc" },
        invalid: [
            { value: {}, code: "missing_field", path: ["pattern"] },
            { value: { pattern: 42 }, code: "invalid_type", path: ["pattern"] },
            { value: { pattern: "*.ts", maxResults: 0 }, code: "number_minimum", path: ["maxResults"] },
            { value: { pattern: "*.ts", maxResults: FIND_FILES_MAX_RESULTS_LIMIT + 1 }, code: "number_maximum", path: ["maxResults"] },
            { value: { pattern: "*.ts", maxResults: 1.5 }, code: "not_integer", path: ["maxResults"] },
            { value: { pattern: "*.ts", cursor: 123 }, code: "invalid_type", path: ["cursor"] },
            { value: { pattern: "*.ts", extra: true }, code: "extra_field", path: ["extra"] },
        ],
        schema: {
            $schema: schemaUri,
            type: "object",
            properties: {
                pattern: { type: "string" },
                path: { type: "string" },
                maxResults: {
                    type: "integer",
                    minimum: 1,
                    maximum: FIND_FILES_MAX_RESULTS_LIMIT,
                },
                cursor: { type: "string" },
            },
            required: ["pattern"],
            additionalProperties: false,
        },
    },
    {
        id: "grep",
        inputContract: GREP_INPUT_CONTRACT,
        valid: {
            pattern: "  TODO  ",
            path: "src",
            ignoreCase: false,
            include: "*.ts",
            exclude: "*.test.ts",
            contextLines: 2,
            maxMatches: 50,
            cursor: "cur123",
        },
        invalid: [
            { value: {}, code: "missing_field", path: ["pattern"] },
            { value: { pattern: 42 }, code: "invalid_type", path: ["pattern"] },
            { value: { pattern: "a", path: 42 }, code: "invalid_type", path: ["path"] },
            { value: { pattern: "a", ignoreCase: "yes" }, code: "invalid_type", path: ["ignoreCase"] },
            { value: { pattern: "a", include: 42 }, code: "invalid_type", path: ["include"] },
            { value: { pattern: "a", exclude: 42 }, code: "invalid_type", path: ["exclude"] },
            { value: { pattern: "a", contextLines: -1 }, code: "number_minimum", path: ["contextLines"] },
            { value: { pattern: "a", contextLines: GREP_MAX_CONTEXT_LINES + 1 }, code: "number_maximum", path: ["contextLines"] },
            { value: { pattern: "a", maxMatches: 0 }, code: "number_minimum", path: ["maxMatches"] },
            { value: { pattern: "a", maxMatches: GREP_MAX_MATCHES_LIMIT + 1 }, code: "number_maximum", path: ["maxMatches"] },
            { value: { pattern: "a", cursor: 123 }, code: "invalid_type", path: ["cursor"] },
            { value: { pattern: "a", extra: true }, code: "extra_field", path: ["extra"] },
        ],
        schema: {
            $schema: schemaUri,
            type: "object",
            properties: {
                pattern: { type: "string" },
                path: { type: "string" },
                ignoreCase: { type: "boolean" },
                include: { type: "string" },
                exclude: { type: "string" },
                contextLines: { type: "integer", minimum: 0, maximum: GREP_MAX_CONTEXT_LINES },
                maxMatches: { type: "integer", minimum: 1, maximum: GREP_MAX_MATCHES_LIMIT },
                cursor: { type: "string" },
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
            id: "apply_patch",
            inputContract: APPLY_PATCH_INPUT_CONTRACT,
            input: { patch: "" },
            validate: () => new ApplyPatchTool("/workspace").validate({ patch: "" }),
        },
        {
            id: "list_directory",
            inputContract: LIST_DIRECTORY_INPUT_CONTRACT,
            input: { path: "../outside" },
            validate: () => new ListDirectoryTool("/workspace").validate({ path: "../outside" }),
        },
        {
            id: "find_files",
            inputContract: FIND_FILES_INPUT_CONTRACT,
            input: { pattern: "" },
            validate: () => new FindFilesTool("/workspace").validate({ pattern: "" }),
        },
        {
            id: "grep",
            inputContract: GREP_INPUT_CONTRACT,
            input: { pattern: "a(" },
            validate: () => new GrepTool("/workspace").validate({ pattern: "a(" }),
        },
        {
            id: "web_search",
            inputContract: WEB_SEARCH_INPUT_CONTRACT,
            input: { query: "   " },
            validate: () => new WebSearchTool().validate({ query: "   " }),
        },
        {
            id: "web_fetch",
            inputContract: WEB_FETCH_INPUT_CONTRACT,
            input: { url: "ftp://example.com" },
            validate: () => new WebFetchTool().validate({ url: "ftp://example.com" }),
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
            id: "apply_patch",
            registration: createToolRegistration(new ApplyPatchTool("/workspace")),
            input: { patch: "  diff --git a/a b/a  " },
        },
        {
            id: "grep",
            registration: createToolRegistration(new GrepTool("/workspace")),
            input: { pattern: "  TODO  ", path: "src" },
        },
        {
            id: "web_search",
            registration: createToolRegistration(new WebSearchTool()),
            input: { query: "  LazyGoal  " },
        },
        {
            id: "web_fetch",
            registration: createToolRegistration(new WebFetchTool()),
            input: { url: "https://example.com/info" },
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

test("工具声明式 isReadOnly 元数据准确区分只读读取与写操作工具", () => {
    const readOnlyTools = [
        new ListDirectoryTool("/workspace"),
        new FindFilesTool("/workspace"),
        new ReadFileTool("/workspace"),
        new GrepTool("/workspace"),
        new WebSearchTool(),
        new WebFetchTool(),
        new ProcessReadTool({} as any, {} as any),
        new GitStatusTool("/workspace"),
        new GitDiffTool("/workspace"),
        new GitLogTool("/workspace"),
        new GitShowTool("/workspace"),
        new GitBranchListTool("/workspace"),
        new GitWorktreeListTool("/workspace"),
    ];

    for (const tool of readOnlyTools) {
        assert.equal(tool.definition.isReadOnly, true, `${tool.definition.id}.definition 应当声明 isReadOnly: true`);
    }

    const modifyingTools = [
        new WriteFileTool("/workspace"),
        new EditFileTool("/workspace"),
        new ApplyPatchTool("/workspace"),
        new BashTool("/workspace"),
        new GitAddTool("/workspace"),
        new GitCommitTool("/workspace"),
        new GitBranchCreateTool("/workspace"),
        new GitBranchSwitchTool("/workspace"),
        new GitWorktreeAddTool("/workspace"),
        new GitWorktreeRemoveTool("/workspace"),
    ];

    for (const tool of modifyingTools) {
        assert.equal(tool.definition.isReadOnly, false, `${tool.definition.id}.definition 应当显式声明 isReadOnly: false`);
    }

});
