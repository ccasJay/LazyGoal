import assert from "node:assert/strict";
import { test } from "node:test";

import { createToolRegistration, type BoundTool } from "../../tool-core/src/index";
import {
    BashTool,
    createExecuteProgramRegistration,
    EXECUTE_PROGRAM_DEFINITION,
    GitCommitTool,
    ReadFileTool,
    WriteFileTool,
} from "../src/index";

test("真实工具注册项与模型声明共享同一输入绑定", () => {
    const cases: readonly { readonly tool: BoundTool<any>; readonly input: any }[] = [
        { tool: new ReadFileTool("/workspace"), input: { path: "README.md" } },
        { tool: new WriteFileTool("/workspace"), input: { path: "a.txt", content: "x" } },
        { tool: new GitCommitTool("/workspace"), input: { message: "m" } },
        { tool: new BashTool("/workspace"), input: { command: "ls" } },
    ];

    for (const { tool, input } of cases) {
        const registration = createToolRegistration(tool);

        assert.strictEqual(registration.definition.inputBinding, tool.definition.inputBinding);
        assert.equal(registration.definition.inputBinding.contractId, tool.definition.inputBinding.contractId);
        assert.equal(registration.definition.inputBinding.version, 1);
        assert.equal(typeof registration.definition.inputBinding.schema, "object");
        assert.equal(typeof registration.definition.inputBinding.modelProjection().schema, "object");

        const prepared = registration.prepare(input);
        assert.equal(prepared.ok, true, tool.definition.id);
        if (prepared.ok) {
            assert.deepEqual(prepared.input, input);
            assert.notStrictEqual(prepared.input, input);
            assert.equal(prepared.inputDiagnostic, undefined);
        }
    }
});

test("注册与 prepare 先拒绝已知字段错误，再剥离未知字段并进入原语义校验", () => {
    const readFile = createToolRegistration(new ReadFileTool("/workspace"));

    const missing = readFile.prepare({ extra: true });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
        assert.equal(missing.error.code, "INVALID_TOOL_INPUT");
        assert.equal(missing.error.issues?.[0]?.code, "missing_field");
        assert.deepEqual(missing.error.issues?.[0]?.path, ["path"]);
    }

    const unknown = readFile.prepare({ path: "README.md", extra: { nested: true } });
    assert.equal(unknown.ok, true);
    if (unknown.ok) {
        assert.deepEqual(unknown.input, { path: "README.md" });
        assert.deepEqual(unknown.inputDiagnostic?.paths, ["/*"]);
        assert.equal(unknown.inputDiagnostic?.contractId, readFile.definition.inputBinding.contractId);
        assert.equal(unknown.inputDiagnostic?.truncated, false);
    }

    const semanticFailure = readFile.prepare({ path: "../secret.txt", extra: true });
    assert.equal(semanticFailure.ok, false);
    if (!semanticFailure.ok) {
        assert.equal(semanticFailure.error.code, "INVALID_TOOL_INPUT");
    }
});

test("Program 注册项使用同一绑定读取并剥离未知字段", () => {
    const registration = createExecuteProgramRegistration();

    assert.strictEqual(registration.definition.inputBinding, EXECUTE_PROGRAM_DEFINITION.inputBinding);
    assert.equal(registration.prepare({ code: "return 1", extra: true }).ok, true);
    const prepared = registration.prepare({ code: "return 1", extra: true });
    assert.equal(prepared.ok, true);
    if (prepared.ok) {
        assert.deepEqual(prepared.input, { code: "return 1" });
        assert.deepEqual(prepared.inputDiagnostic?.paths, ["/*"]);
    }
    assert.equal(registration.prepare({ code: 1 }).ok, false);
});
