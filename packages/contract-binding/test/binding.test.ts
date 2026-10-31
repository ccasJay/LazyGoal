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
        count: { type: "number", minimum: 1, maximum: 10 },
        kind: { type: "string", enum: ["alpha", "beta"] },
        nested: { $ref: "#/definitions/Nested" },
        note: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
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
    assert.deepEqual([...result.diagnostic.paths].sort(), ["/debug", "/nested/debug"]);
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
    assert.ok(result.issues.some(issue => issue.code === "unknown" && issue.path === "/debug"));
    assert.ok(result.issues.some(issue => issue.code === "unknown" && issue.path === "/nested/debug"));
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
    assert.ok(longResult.issues.some(issue => issue.path.endsWith("…")));
});

test("binding protects prototype keys and keeps output independent after mutation", () => {
    const prototypeKey = JSON.parse(
        '{"count":3,"kind":"alpha","nested":{"label":"ok"},"__proto__":{"polluted":true}}',
    ) as Record<string, unknown>;

    const result = binding.read(prototypeKey, "strip");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.diagnostic?.paths, ["/__proto__"]);
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
