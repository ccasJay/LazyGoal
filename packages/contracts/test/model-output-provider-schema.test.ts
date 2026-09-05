import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildShapeGuide,
    compileModelOutputSchema,
    contract,
    ContractValidationError,
    createModelOutputContractBundle,
    ModelOutputContractDefinitionError,
    safeParse,
    SHAPE_GUIDE_PREFIX,
} from "../src/index";

test("动态 Tool 按稳定 ID 码点序派生 tool_call 分支，空集合省略 tool_call（Req 3.5）", () => {
    const readFileTool = {
        id: "read_file",
        inputContract: contract.object({
            path: contract.string(),
        }),
    };
    const editFileTool = {
        id: "edit_file",
        inputContract: contract.object({
            path: contract.string(),
            oldString: contract.string(),
            newString: contract.string(),
        }),
    };
    const writeFileTool = {
        id: "write_file",
        inputContract: contract.object({
            path: contract.string(),
            content: contract.string(),
        }),
    };

    // 乱序传入 3 个 Tool
    const bundleWithTools = createModelOutputContractBundle({
        kind: "executing",
        authorizedTools: [writeFileTool, readFileTool, editFileTool],
    });

    const schema = bundleWithTools.jsonSchema;
    assert.equal(schema.type, "object");
    const resultProp = (schema.properties as Record<string, unknown>).result as Record<string, unknown>;
    assert.ok(Array.isArray(resultProp.anyOf));
    const anyOf = resultProp.anyOf as Array<Record<string, unknown>>;

    // 应该包含 3 个 tool 分支 + 4 个 non-tool 分支 = 7 个分支
    assert.equal(anyOf.length, 7);

    // 前 3 个分支必须严格按 Tool ID 码点序排序: edit_file < read_file < write_file
    const toolBranches = anyOf.filter((b) => {
        const props = b.properties as Record<string, unknown> | undefined;
        const kindProp = props?.kind as Record<string, unknown> | undefined;
        return Array.isArray(kindProp?.enum) && kindProp?.enum[0] === "tool_call";
    });
    assert.equal(toolBranches.length, 3);

    const toolIdsInOrder = toolBranches.map((b) => {
        const props = b.properties as Record<string, unknown>;
        const actionProps = (props.action as Record<string, unknown>).properties as Record<string, unknown>;
        const toolIdEnum = (actionProps.toolId as Record<string, unknown>).enum as string[];
        return toolIdEnum[0];
    });
    assert.deepEqual(toolIdsInOrder, ["edit_file", "read_file", "write_file"]);

    // 空工具集合时，不生成任何 tool_call 分支
    const emptyBundle = createModelOutputContractBundle({
        kind: "executing",
        authorizedTools: [],
    });
    const emptySchema = emptyBundle.jsonSchema;
    const emptyResultProp = (emptySchema.properties as Record<string, unknown>).result as Record<string, unknown>;
    const emptyAnyOf = emptyResultProp.anyOf as Array<Record<string, unknown>>;
    assert.equal(emptyAnyOf.length, 4); // complete, wait, fail, context_lookup
    const hasToolCall = emptyAnyOf.some((b) => {
        const props = b.properties as Record<string, unknown> | undefined;
        const kindProp = props?.kind as Record<string, unknown> | undefined;
        return Array.isArray(kindProp?.enum) && kindProp?.enum[0] === "tool_call";
    });
    assert.equal(hasToolCall, false);
});

test("拒绝空 Tool ID 与重复 Tool ID（Req 3.5）", () => {
    const dummyContract = contract.object({ p: contract.string() });

    // 空 Tool ID
    assert.throws(
        () => {
            createModelOutputContractBundle({
                kind: "executing",
                authorizedTools: [{ id: "   ", inputContract: dummyContract }],
            });
        },
        (err) => err instanceof ModelOutputContractDefinitionError,
    );

    // 重复 Tool ID
    assert.throws(
        () => {
            createModelOutputContractBundle({
                kind: "executing",
                authorizedTools: [
                    { id: "tool_a", inputContract: dummyContract },
                    { id: "tool_a", inputContract: dummyContract },
                ],
            });
        },
        (err) => err instanceof ModelOutputContractDefinitionError,
    );
});

test("输入错配与原 Input Contract 复验（Req 3.5, Req 7.4）", () => {
    const queryTool = {
        id: "query_items",
        inputContract: contract.object({
            keyword: contract.string(),
            limit: contract.optional(contract.integer({ minimum: 1, maximum: 50 })),
        }),
    };
    const deleteTool = {
        id: "delete_item",
        inputContract: contract.object({
            itemId: contract.string(),
        }),
    };

    const bundle = createModelOutputContractBundle({
        kind: "executing",
        authorizedTools: [queryTool, deleteTool],
    });

    // 1. 合法 tool_call，包含 optional 占位 null，原 Input Contract 校验通过
    const validRaw = {
        result: {
            kind: "tool_call",
            action: {
                actionId: "act-1",
                toolId: "query_items",
                input: {
                    keyword: "lazygoal",
                    limit: null, // optional 占位 null
                },
            },
            memoryPatch: null,
        },
    };
    const decoded = bundle.decode(validRaw) as {
        kind: string;
        action: { actionId: string; toolId: string; input: { keyword: string; limit?: number } };
    };
    assert.equal(decoded.kind, "tool_call");
    assert.equal(decoded.action.toolId, "query_items");
    assert.equal(decoded.action.input.keyword, "lazygoal");
    assert.equal("limit" in decoded.action.input, false); // optional 占位 null 被消除

    // 2. 合法 tool_call，指定合法 limit
    const validWithLimit = {
        result: {
            kind: "tool_call",
            action: {
                actionId: "act-2",
                toolId: "query_items",
                input: {
                    keyword: "lazygoal",
                    limit: 20,
                },
            },
            memoryPatch: null,
        },
    };
    const decodedWithLimit = bundle.decode(validWithLimit) as {
        action: { input: { limit?: number } };
    };
    assert.equal(decodedWithLimit.action.input.limit, 20);

    // 3. 原 Input Contract 标量约束复验：limit 超出最大值 50
    const outOfRangeLimit = {
        result: {
            kind: "tool_call",
            action: {
                actionId: "act-3",
                toolId: "query_items",
                input: {
                    keyword: "lazygoal",
                    limit: 999, // 超出 maximum: 50
                },
            },
            memoryPatch: null,
        },
    };
    assert.throws(
        () => bundle.decode(outOfRangeLimit),
        (err) => err instanceof ContractValidationError,
    );

    // 4. 输入错配：toolId 为 query_items，但 input 为 delete_item 的形状 { itemId: "123" }
    const mismatchedInput = {
        result: {
            kind: "tool_call",
            action: {
                actionId: "act-4",
                toolId: "query_items",
                input: {
                    itemId: "123", // 缺少 keyword
                },
            },
            memoryPatch: null,
        },
    };
    assert.throws(
        () => bundle.decode(mismatchedInput),
        (err) => err instanceof ContractValidationError,
    );

    // 5. 未授权的 toolId
    const unauthorizedTool = {
        result: {
            kind: "tool_call",
            action: {
                actionId: "act-5",
                toolId: "bash_exec",
                input: {
                    command: "rm -rf /",
                },
            },
            memoryPatch: null,
        },
    };
    assert.throws(
        () => bundle.decode(unauthorizedTool),
        (err) => err instanceof ContractValidationError,
    );

    // 6. 无授权工具的 bundle 收到 tool_call
    const nonToolBundle = createModelOutputContractBundle({
        kind: "executing",
        authorizedTools: [],
    });
    assert.throws(
        () => nonToolBundle.decode(validRaw),
        (err) => err instanceof ContractValidationError,
    );
});

test("不可移植定义检查（Req 4.3, Req 4.4）", () => {
    // 1. Tool Input 含有 record
    assert.throws(
        () => {
            createModelOutputContractBundle({
                kind: "executing",
                authorizedTools: [
                    {
                        id: "bad_tool_record",
                        inputContract: contract.object({
                            meta: contract.record(contract.string()),
                        }),
                    },
                ],
            });
        },
        (err) => err instanceof ModelOutputContractDefinitionError,
    );

    // 2. Tool Input 含有 recursive
    assert.throws(
        () => {
            createModelOutputContractBundle({
                kind: "executing",
                authorizedTools: [
                    {
                        id: "bad_tool_recursive",
                        inputContract: contract.recursive("Node", (self) =>
                            contract.object({
                                next: contract.nullable(self),
                            }),
                        ),
                    },
                ],
            });
        },
        (err) => err instanceof ModelOutputContractDefinitionError,
    );

    // 3. Tool Input 含有 pattern 约束
    assert.throws(
        () => {
            createModelOutputContractBundle({
                kind: "executing",
                authorizedTools: [
                    {
                        id: "bad_tool_pattern",
                        inputContract: contract.object({
                            regexText: contract.string({ pattern: "^[a-z]+$" }),
                        }),
                    },
                ],
            });
        },
        (err) => err instanceof ModelOutputContractDefinitionError,
    );

    // 4. Tool Input 含有 minLength 约束
    assert.throws(
        () => {
            createModelOutputContractBundle({
                kind: "executing",
                authorizedTools: [
                    {
                        id: "bad_tool_min_length",
                        inputContract: contract.object({
                            shortText: contract.string({ minLength: 5 }),
                        }),
                    },
                ],
            });
        },
        (err) => err instanceof ModelOutputContractDefinitionError,
    );

    // 5. Tool Input 含有 optional(nullable(...))
    assert.throws(
        () => {
            createModelOutputContractBundle({
                kind: "executing",
                authorizedTools: [
                    {
                        id: "bad_tool_optional_nullable",
                        inputContract: contract.object({
                            field: contract.optional(contract.nullable(contract.string())),
                        }),
                    },
                ],
            });
        },
        (err) => err instanceof ModelOutputContractDefinitionError,
    );
});

test("Schema 结构可移植子集严格约束（Req 4.3, Req 4.4）", () => {
    // 根不是 object
    const nonObjectRoot = contract.string();
    assert.throws(
        () => compileModelOutputSchema(nonObjectRoot),
        (err) => err instanceof ModelOutputContractDefinitionError,
    );

    // 根不是带有 result 的 wire contract
    const wrongRoot = contract.object({ other: contract.string() });
    // 编译此契约应成功生成合法的 object schema
    const schema = compileModelOutputSchema(wrongRoot);
    assert.equal(schema.type, "object");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ["other"]);
});

test("Schema 与 Shape Guide 字符稳定性（Req 5.1）", () => {
    const tool = {
        id: "inspect_file",
        inputContract: contract.object({
            path: contract.string(),
            lines: contract.optional(contract.array(contract.integer())),
        }),
    };

    const requests = [
        { kind: "gathering" as const },
        { kind: "planning" as const },
        { kind: "executing" as const, authorizedTools: [tool] },
        { kind: "checkpoint" as const },
    ];

    for (const req of requests) {
        const bundle1 = createModelOutputContractBundle(req);
        const bundle2 = createModelOutputContractBundle(req);

        // 1. JSON Schema 深比较完全一致
        assert.deepEqual(bundle1.jsonSchema, bundle2.jsonSchema);

        // 2. 序列化后的字符串逐字一致
        const str1 = JSON.stringify(bundle1.jsonSchema);
        const str2 = JSON.stringify(bundle2.jsonSchema);
        assert.equal(str1, str2);

        // 3. Shape Guide 格式规范与逐字一致
        assert.equal(bundle1.shapeGuide, bundle2.shapeGuide);
        assert.ok(bundle1.shapeGuide.startsWith(SHAPE_GUIDE_PREFIX));
        assert.equal(bundle1.shapeGuide, `${SHAPE_GUIDE_PREFIX}\n${str1}`);

        // 4. buildShapeGuide 独立函数输出一致
        assert.equal(buildShapeGuide(bundle1.jsonSchema), bundle1.shapeGuide);
    }
});
