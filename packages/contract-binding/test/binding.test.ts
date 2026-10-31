import assert from "node:assert/strict";
import { test } from "node:test";

import Ajv from "ajv";

import {
    createContractBinding,
    type ContractBinding,
    type ContractSchemaNode,
    type ContractValidator,
} from "../src/index";

interface Sample {
    readonly count: number;
    readonly kind: "alpha" | "beta";
    readonly nested: { readonly label: string };
    readonly note?: string;
    readonly tags?: readonly string[];
}

const sampleSchema: ContractSchemaNode = {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
        count: { type: "integer", minimum: 1, maximum: 10 },
        kind: { type: "string", enum: ["alpha", "beta"] },
        nested: { $ref: "#/definitions/Nested" },
        note: { type: "string" },
        tags: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
    },
    required: ["count", "kind", "nested"],
    additionalProperties: false,
    definitions: {
        Nested: {
            type: "object",
            properties: {
                label: { type: "string", minLength: 1, maxLength: 5 },
            },
            required: ["label"],
            additionalProperties: false,
        },
    },
};

const validate = new Ajv({
    strict: true,
    allErrors: true,
    removeAdditional: false,
    coerceTypes: false,
    useDefaults: false,
}).compile(sampleSchema as unknown as object);

const binding: ContractBinding<Sample> = createContractBinding<Sample>({
    contractId: "sample.tool",
    version: 1,
    schema: sampleSchema,
    validate: validate as unknown as ContractValidator,
});

test("binding strips nested unknown fields and returns isolated data with bounded diagnostics", () => {
    const input = {
        count: 3,
        kind: "alpha",
        nested: { label: "ok", debug: "must-not-leak-nested" },
        note: "n",
        tags: ["a"],
        debug: "must-not-leak",
    };
    const original = structuredClone(input);

    const result = binding.read(input, "strip");

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.data, {
        count: 3,
        kind: "alpha",
        nested: { label: "ok" },
        note: "n",
        tags: ["a"],
    });
    assert.ok(result.diagnostic);
    assert.deepEqual([...result.diagnostic.paths].sort(), ["/*", "/nested/*"]);
    assert.equal(result.diagnostic.contractId, "sample.tool");
    assert.equal(result.diagnostic.version, 1);
    assert.equal(result.diagnostic.truncated, false);
    assert.deepEqual(input, original);
    assert.notEqual(result.data, input);
    assert.notEqual(result.data.nested, input.nested);
    assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
});

test("binding rejects unknown fields under the strict policy without partial data", () => {
    const input = {
        count: 3,
        kind: "alpha",
        nested: { label: "ok", debug: "must-not-leak-nested" },
        debug: "must-not-leak",
    };

    const result = binding.read(input, "reject");

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal("data" in result, false);
    assert.ok(result.issues.some(issue => issue.code === "unknown" && issue.path === "/*"));
    assert.ok(result.issues.some(issue => issue.code === "unknown" && issue.path === "/nested/*"));
    assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
});

test("binding rejects invalid known fields with locatable issues", () => {
    const cases: Array<{ readonly value: unknown; readonly path: string; readonly code: string }> = [
        {
            value: { kind: "alpha", nested: { label: "ok" } },
            path: "/count",
            code: "required",
        },
        {
            value: { count: 3, kind: "gamma", nested: { label: "ok" } },
            path: "/kind",
            code: "enum",
        },
        {
            value: { count: 0, kind: "alpha", nested: { label: "ok" } },
            path: "/count",
            code: "range",
        },
        {
            value: { count: 20, kind: "alpha", nested: { label: "ok" } },
            path: "/count",
            code: "range",
        },
        {
            value: { count: 1.5, kind: "alpha", nested: { label: "ok" } },
            path: "/count",
            code: "type",
        },
        {
            value: { count: 3, kind: "alpha", nested: { label: "" } },
            path: "/nested/label",
            code: "length",
        },
        {
            value: { count: 3, kind: "alpha", nested: { label: "toolong" } },
            path: "/nested/label",
            code: "length",
        },
        {
            value: { count: "3", kind: "alpha", nested: { label: "ok" } },
            path: "/count",
            code: "type",
        },
        {
            value: { count: 3, kind: "alpha" },
            path: "/nested",
            code: "required",
        },
        {
            value: { count: 3, kind: "alpha", nested: { label: "ok" }, tags: ["a", 1] },
            path: "/tags/1",
            code: "type",
        },
        {
            value: { count: 3, kind: "alpha", nested: { label: "ok" }, tags: [] },
            path: "/tags",
            code: "length",
        },
        {
            value: { count: 3, kind: "alpha", nested: { label: "ok" }, tags: ["a", "b", "c", "d"] },
            path: "/tags",
            code: "length",
        },
    ];

    for (const current of cases) {
        const result = binding.read(current.value, "strip");
        assert.equal(result.ok, false, JSON.stringify(current.value));
        if (result.ok) continue;
        assert.equal("data" in result, false);
        assert.ok(
            result.issues.some(issue => issue.path === current.path && issue.code === current.code),
            `${JSON.stringify(result.issues)} missing ${current.path}:${current.code}`,
        );
    }
});

test("binding rejects non-JSON shapes without executing accessors", () => {
    const cyclic: Record<string, unknown> = { count: 3, kind: "alpha", nested: { label: "ok" } };
    cyclic.self = cyclic;
    const accessor = Object.defineProperty(
        { count: 3, kind: "alpha", nested: { label: "ok" } },
        "debug",
        {
            enumerable: true,
            get() {
                throw new Error("getter must not execute");
            },
        },
    );
    const arrayWithExtraProperty = Object.assign([], { debug: true });
    const nonJsonValues: unknown[] = [
        undefined,
        () => undefined,
        Symbol("value"),
        1n,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        new Date(),
        new Map(),
        new Set(),
        new (class Example {})(),
        { [Symbol("key")]: "value" },
        cyclic,
        accessor,
        { count: 3, kind: "alpha", nested: { label: "ok" }, tags: arrayWithExtraProperty },
    ];

    for (const value of nonJsonValues) {
        const result = binding.read(value, "strip");
        assert.equal(result.ok, false);
        if (result.ok) continue;
        assert.deepEqual(result.issues, [{ path: "", code: "json" }]);
        assert.equal(result.truncated, false);
    }
});

test("binding bounds unknown-field diagnostics and still removes all unknown fields", () => {
    const input: Record<string, unknown> = {
        count: 3,
        kind: "alpha",
        nested: { label: "ok" },
    };
    for (let index = 0; index < 40; index += 1) input[`debug-${index}`] = index;

    const stripped = binding.read(input, "strip");
    assert.equal(stripped.ok, true);
    if (!stripped.ok) return;
    assert.equal(stripped.diagnostic?.paths.length, 32);
    assert.equal(stripped.diagnostic?.truncated, true);
    assert.ok(Object.keys(stripped.data as object).every(key => !key.startsWith("debug-")));

    const rejected = binding.read(input, "reject");
    assert.equal(rejected.ok, false);
    if (rejected.ok) return;
    assert.equal(rejected.issues.length, 32);
    assert.equal(rejected.truncated, true);

    const longKey = "x".repeat(300);
    const longResult = binding.read({
        count: 3,
        kind: "alpha",
        nested: { label: "ok" },
        [longKey]: true,
    }, "reject");
    assert.equal(longResult.ok, false);
    if (longResult.ok) return;
    assert.ok(longResult.issues.every(issue => issue.path.length <= 160));
    assert.ok(longResult.issues.every(issue => !issue.path.includes(longKey)));
    assert.deepEqual(longResult.issues, [{ path: "/*", code: "unknown" }]);
});

test("binding redacts external key names from unknown-field diagnostics", () => {
    const sensitiveKey = "secret-example-token";
    const input = {
        count: 3,
        kind: "alpha",
        nested: { label: "ok", [sensitiveKey]: "token-value" },
        [sensitiveKey]: "token-value",
    };

    const stripped = binding.read(input, "strip");
    assert.equal(stripped.ok, true);
    if (!stripped.ok) return;
    assert.deepEqual([...stripped.diagnostic!.paths].sort(), ["/*", "/nested/*"]);
    assert.equal(JSON.stringify(stripped).includes(sensitiveKey), false);
    assert.equal(JSON.stringify(stripped).includes("token-value"), false);

    const rejected = binding.read(input, "reject");
    assert.equal(rejected.ok, false);
    if (rejected.ok) return;
    assert.deepEqual(
        [...new Set(rejected.issues.map(issue => issue.path))].sort(),
        ["/*", "/nested/*"],
    );
    assert.equal(JSON.stringify(rejected).includes(sensitiveKey), false);
});

test("binding redacts open dictionary keys from validation paths", () => {
    const schema: ContractSchemaNode = {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
            records: {
                type: "object",
                additionalProperties: {
                    type: "object",
                    properties: { label: { type: "string" } },
                    required: ["label"],
                    additionalProperties: false,
                },
            },
        },
        required: ["records"],
        additionalProperties: false,
    };
    const validateRecords = new Ajv({
        strict: true,
        allErrors: true,
        removeAdditional: false,
        coerceTypes: false,
        useDefaults: false,
    }).compile(schema as unknown as object);
    const recordsBinding = createContractBinding<unknown>({
        contractId: "sample.records",
        version: 1,
        schema,
        validate: validateRecords as unknown as ContractValidator,
    });

    const result = recordsBinding.read({
        records: { "secret-example-token": { label: 42 } },
    }, "strip");

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(result.issues, [{ path: "/records/*/label", code: "type" }]);
    assert.equal(JSON.stringify(result).includes("secret-example-token"), false);
});

test("binding bounds diagnostic paths at declared locations", () => {
    const longDeclaredKey = "x".repeat(200);
    const longSchema: ContractSchemaNode = {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
            [longDeclaredKey]: {
                type: "object",
                properties: {},
                required: [],
                additionalProperties: false,
            },
        },
        required: [longDeclaredKey],
        additionalProperties: false,
    };
    const longBinding = compileBinding<unknown>(longSchema);

    const result = longBinding.read({ [longDeclaredKey]: { secret: true } }, "reject");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.issues.some(issue => issue.path.endsWith("…")));
    assert.ok(result.issues.every(issue => issue.path.length <= 160));
});

test("binding protects prototype keys and keeps output independent after mutation", () => {
    const prototypeKey = JSON.parse(
        '{"count":3,"kind":"alpha","nested":{"label":"ok"},"__proto__":{"polluted":true}}',
    ) as Record<string, unknown>;

    const result = binding.read(prototypeKey, "strip");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.diagnostic?.paths, ["/*"]);
    assert.equal(({} as { polluted?: boolean }).polluted, undefined);

    const mutable = result.data as unknown as {
        nested: { label: string };
        count: number;
    };
    mutable.nested.label = "changed";
    mutable.count = 99;
    assert.deepEqual(prototypeKey.nested, { label: "ok" });
    assert.equal(prototypeKey.count, 3);
});

const nullableSchema: ContractSchemaNode = {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
        value: { type: ["string", "null"] },
        optional: { type: "string" },
    },
    required: ["value"],
    additionalProperties: false,
};

test("binding reads nullable type arrays and rejects other type unions at the known path", () => {
    const nullableBinding = compileBinding<{ value: string | null }>(nullableSchema);

    const nullResult = nullableBinding.read({ value: null }, "strip");
    assert.equal(nullResult.ok, true);
    if (nullResult.ok) assert.deepEqual(nullResult.data, { value: null });

    const stringResult = nullableBinding.read({ value: "text" }, "strip");
    assert.equal(stringResult.ok, true);

    const invalid = nullableBinding.read({ value: 3 }, "strip");
    assert.equal(invalid.ok, false);
    if (invalid.ok) return;
    assert.deepEqual(invalid.issues, [{ path: "/value", code: "type" }]);
});

const entryUnion: ContractSchemaNode = {
    anyOf: [
        {
            type: "object",
            properties: {
                kind: { type: "string", const: "alpha" },
                alpha: { type: "string" },
                nested: {
                    type: "object",
                    properties: { label: { type: "string", minLength: 2 } },
                    required: ["label"],
                    additionalProperties: false,
                },
            },
            required: ["kind", "alpha", "nested"],
            additionalProperties: false,
        },
        {
            type: "object",
            properties: {
                kind: { type: "string", const: "beta" },
                beta: { type: "string" },
                count: { type: "number", minimum: 1 },
            },
            required: ["kind", "beta"],
            additionalProperties: false,
        },
    ],
};

const discriminatedSchema: ContractSchemaNode = {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: { entry: entryUnion },
    required: ["entry"],
    additionalProperties: false,
};

test("binding selects a union branch before stripping cross-branch fields", () => {
    const discriminatedBinding = compileBinding<{ entry: unknown }>(discriminatedSchema);
    const input = {
        entry: {
            kind: "alpha",
            alpha: "selected",
            beta: "other-branch",
            debug: "root-secret",
            nested: { label: "ok", debug: "nested-secret" },
        },
    };
    const original = structuredClone(input);

    const stripped = discriminatedBinding.read(input, "strip");
    assert.equal(stripped.ok, true);
    if (!stripped.ok) return;
    assert.deepEqual(stripped.data, {
        entry: {
            kind: "alpha",
            alpha: "selected",
            nested: { label: "ok" },
        },
    });
    assert.ok(stripped.diagnostic);
    assert.deepEqual(
        [...stripped.diagnostic.paths].sort(),
        ["/entry/*", "/entry/*", "/entry/nested/*"],
    );
    assert.deepEqual(input, original);
    assert.equal(JSON.stringify(stripped).includes("secret"), false);

    const rejected = discriminatedBinding.read(input, "reject");
    assert.equal(rejected.ok, false);
    if (rejected.ok) return;
    assert.ok(rejected.issues.some(issue => issue.code === "unknown" && issue.path === "/entry/nested/*"));
    assert.equal(
        rejected.issues.filter(issue => issue.code === "unknown" && issue.path === "/entry/*").length,
        2,
    );
    assert.equal("data" in rejected, false);
});

test("binding rejects union branches that cannot be uniquely determined", () => {
    const ambiguousSchema: ContractSchemaNode = {
        $schema: "http://json-schema.org/draft-07/schema#",
        anyOf: [
            {
                type: "object",
                properties: {
                    kind: { type: "string", const: "same" },
                    alpha: { type: "string" },
                },
                required: ["kind"],
                additionalProperties: false,
            },
            {
                type: "object",
                properties: {
                    kind: { type: "string", const: "same" },
                    beta: { type: "string" },
                },
                required: ["kind"],
                additionalProperties: false,
            },
        ],
    };
    const ambiguousBinding = compileBinding<unknown>(ambiguousSchema);

    for (const value of [
        { kind: "same" },
        { kind: "same", alpha: "a", beta: "b" },
    ]) {
        const result = ambiguousBinding.read(value, "strip");
        assert.equal(result.ok, false, JSON.stringify(value));
        if (result.ok) continue;
        assert.deepEqual(result.issues, [{ path: "", code: "union" }]);
    }
});

test("binding reports known-field failures from the best union branch", () => {
    const discriminatedBinding = compileBinding<{ entry: unknown }>(discriminatedSchema);
    const invalidNested = discriminatedBinding.read({
        entry: {
            kind: "alpha",
            alpha: "selected",
            nested: { label: "" },
        },
    }, "strip");
    assert.equal(invalidNested.ok, false);
    if (invalidNested.ok) return;
    assert.ok(
        invalidNested.issues.some(issue => issue.path === "/entry/nested/label" && issue.code === "length"),
        JSON.stringify(invalidNested.issues),
    );

    const invalidKind = discriminatedBinding.read({
        entry: { kind: "gamma", alpha: "selected", nested: { label: "ok" } },
    }, "strip");
    assert.equal(invalidKind.ok, false);
    if (invalidKind.ok) return;
    assert.ok(invalidKind.issues.some(issue => issue.path === "/entry/kind" && issue.code === "const"));
});

test("binding resolves nested union and recursive values per item", () => {
    const arraySchema: ContractSchemaNode = {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "array",
        items: entryUnion,
    };
    const arrayBinding = compileBinding<unknown[]>(arraySchema);
    const result = arrayBinding.read([
        {
            kind: "alpha",
            alpha: "first",
            beta: "cross-branch",
            nested: { label: "ok", debug: "nested-secret" },
        },
        { kind: "beta", beta: "second", count: 2, debug: "second-secret" },
    ], "strip");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.data, [
        {
            kind: "alpha",
            alpha: "first",
            nested: { label: "ok" },
        },
        { kind: "beta", beta: "second", count: 2 },
    ]);
    assert.deepEqual(
        [...(result.diagnostic?.paths ?? [])].sort(),
        ["/0/*", "/0/nested/*", "/1/*"],
    );
    assert.equal(JSON.stringify(result).includes("secret"), false);

    const treeSchema: ContractSchemaNode = {
        $schema: "http://json-schema.org/draft-07/schema#",
        $ref: "#/definitions/Node",
        definitions: {
            Node: {
                type: "object",
                properties: {
                    value: { type: "string" },
                    children: { type: "array", items: { $ref: "#/definitions/Node" } },
                },
                required: ["value", "children"],
                additionalProperties: false,
            },
        },
    };
    const treeBinding = compileBinding<unknown>(treeSchema);
    const treeResult = treeBinding.read({
        value: "root",
        debug: "root-secret",
        children: [{
            value: "child",
            debug: "child-secret",
            children: [],
        }],
    }, "strip");
    assert.equal(treeResult.ok, true);
    if (!treeResult.ok) return;
    assert.deepEqual(treeResult.data, {
        value: "root",
        children: [{ value: "child", children: [] }],
    });
    assert.deepEqual([...(treeResult.diagnostic?.paths ?? [])].sort(), ["/*", "/children/0/*"]);
});

test("binding reads open JSON without unknown diagnostics and still strips nested closed records", () => {
    const jsonValue: ContractSchemaNode = {
        anyOf: [
            { type: "string" },
            { type: "number" },
            { type: "boolean" },
            { type: "null" },
            { type: "array", items: { $ref: "#/definitions/JsonValue" } },
            { type: "object", additionalProperties: { $ref: "#/definitions/JsonValue" } },
        ],
    };
    const openSchema: ContractSchemaNode = {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
            metadata: { type: "object", additionalProperties: { $ref: "#/definitions/JsonValue" } },
            payload: {},
            records: {
                type: "object",
                additionalProperties: {
                    type: "object",
                    properties: { label: { type: "string" } },
                    required: ["label"],
                    additionalProperties: false,
                },
            },
        },
        required: ["metadata", "payload", "records"],
        additionalProperties: false,
        definitions: { JsonValue: jsonValue },
    };
    const openBinding = compileBinding<unknown>(openSchema);
    const input = {
        metadata: { nested: [1, { deep: "value" }] },
        payload: { arbitrary: { keys: [true, null] } },
        records: {
            first: { label: "ok", debug: "record-secret" },
        },
    };
    const original = structuredClone(input);

    const stripped = openBinding.read(input, "strip");
    assert.equal(stripped.ok, true);
    if (!stripped.ok) return;
    assert.deepEqual(stripped.data, {
        metadata: { nested: [1, { deep: "value" }] },
        payload: { arbitrary: { keys: [true, null] } },
        records: { first: { label: "ok" } },
    });
    assert.deepEqual(stripped.diagnostic?.paths, ["/records/*/*"]);
    assert.deepEqual(input, original);
    assert.equal(JSON.stringify(stripped).includes("secret"), false);

    const rejected = openBinding.read(input, "reject");
    assert.equal(rejected.ok, false);
    if (rejected.ok) return;
    assert.deepEqual(rejected.issues, [{ path: "/records/*/*", code: "unknown" }]);
});

function compileBinding<T>(schema: ContractSchemaNode): ContractBinding<T> {
    const validate = new Ajv({
        strict: true,
        allowUnionTypes: true,
        allErrors: true,
        removeAdditional: false,
        coerceTypes: false,
        useDefaults: false,
    }).compile(schema as unknown as object);

    return createContractBinding<T>({
        contractId: "sample.union",
        version: 1,
        schema,
        validate: validate as unknown as ContractValidator,
    });
}
