import assert from "node:assert/strict";
import { test } from "node:test";

import type { ContractIssueCode } from "../../contract-binding/src/index";
import {
    browserProviderModelsMetadata,
    browserProviderModelsSchema,
} from "../src/generated/provider-models-schema";
import { browserProviderModelsBinding } from "../src/index";

function readProviderModels(value: unknown) {
    return browserProviderModelsBinding.read(value, "strip");
}

test("provider models binding extracts declared fields and reports bounded paths", () => {
    const input = {
        ok: true,
        models: [{ id: " model-1 ", name: "", debug: "must not be reported" }],
        trace: { value: "must not be reported" },
    };

    const result = readProviderModels(input);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.data, { ok: true, models: [{ id: " model-1 ", name: "" }] });
    assert.deepEqual(result.diagnostic, {
        contractId: "web.providers.models.success",
        version: 1,
        paths: ["/*", "/models/0/*"],
        truncated: false,
    });
    assert.deepEqual(input.models[0], {
        id: " model-1 ",
        name: "",
        debug: "must not be reported",
    });
    assert.notEqual(result.data, input);
    assert.notEqual(result.data.models, input.models);
    assert.notEqual(result.data.models[0], input.models[0]);
    assert.equal(JSON.stringify(result.diagnostic).includes("must not be reported"), false);
});

test("provider models binding bounds unknown-field diagnostics", () => {
    const input: Record<string, unknown> = {
        ok: true,
        models: [],
    };
    for (let index = 0; index < 40; index += 1) input[`debug-${index}`] = index;

    const result = readProviderModels(input);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.diagnostic?.paths.length, 32);
    assert.equal(result.diagnostic?.truncated, true);
    assert.ok(result.diagnostic?.paths.every(path => path === "/*"));
});

test("provider models binding accepts empty results and names but preserves string values", () => {
    const empty = readProviderModels({ ok: true, models: [] });
    assert.deepEqual(empty, { ok: true, data: { ok: true, models: [] } });

    const named = readProviderModels({ ok: true, models: [{ id: "m-1", name: "" }] });
    assert.deepEqual(named, { ok: true, data: { ok: true, models: [{ id: "m-1", name: "" }] } });

    const spaced = readProviderModels({ ok: true, models: [{ id: "  m-1  ", name: " Name " }] });
    assert.deepEqual(spaced, {
        ok: true,
        data: { ok: true, models: [{ id: "  m-1  ", name: " Name " }] },
    });
});

test("provider models binding rejects invalid known fields without returning partial data", () => {
    const invalidValues: Array<{ readonly value: unknown; readonly code: ContractIssueCode }> = [
        { value: { models: [] }, code: "missing_field" },
        { value: { ok: false, models: [] }, code: "invalid_literal" },
        { value: { ok: true }, code: "missing_field" },
        { value: { ok: true, models: {} }, code: "invalid_type" },
        { value: { ok: true, models: [null] }, code: "invalid_type" },
        { value: { ok: true, models: [{ name: "missing id" }] }, code: "missing_field" },
        { value: { ok: true, models: [{ id: 42, name: "wrong id type" }] }, code: "invalid_type" },
        { value: { ok: true, models: [{ id: " \t\n", name: "blank id" }] }, code: "string_pattern" },
        { value: { ok: true, models: [{ id: "m-1", name: 42 }] }, code: "invalid_type" },
        { value: { ok: true, models: [{ id: "m-1" }, { id: "m-2", name: "ok" }] }, code: "missing_field" },
    ];

    for (const { value, code } of invalidValues) {
        const result = readProviderModels(value);
        assert.equal(result.ok, false, JSON.stringify(value));
        if (result.ok) continue;
        assert.equal(result.contractId, "web.providers.models.success");
        assert.equal(result.version, 1);
        assert.ok(result.issues.length > 0, JSON.stringify(value));
        assert.ok(result.issues.some(issue => issue.code === code), JSON.stringify({ value, issues: result.issues }));
        assert.equal("data" in result, false);
    }
});

test("provider models binding accepts only JSON-shaped input and handles prototype keys safely", () => {
    const cyclic: Record<string, unknown> = { ok: true, models: [] };
    cyclic.self = cyclic;
    const accessor = Object.defineProperty({ ok: true, models: [] }, "debug", {
        enumerable: true,
        get() {
            throw new Error("getter must not execute");
        },
    });
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
        { ok: true, models: arrayWithExtraProperty },
    ];

    for (const value of nonJsonValues) {
        const result = readProviderModels(value);
        assert.equal(result.ok, false);
        if (result.ok) continue;
        assert.deepEqual(result.issues, [{ path: "", code: "not_json" }]);
        assert.equal(result.truncated, false);
    }

    const prototypeKey = JSON.parse('{"ok":true,"models":[],"__proto__":{"polluted":true}}') as object;
    const result = readProviderModels(prototypeKey);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.data, { ok: true, models: [] });
    assert.deepEqual(result.diagnostic?.paths, ["/*"]);
    assert.equal(Object.getPrototypeOf(result.data), Object.prototype);
    assert.equal(Object.hasOwn(prototypeKey, "__proto__"), true);
    assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});

test("provider models generated metadata records its actual JSON Schema dialect", () => {
    const schema = browserProviderModelsSchema as {
        readonly $schema?: string;
        readonly $id?: string;
    };

    assert.equal(browserProviderModelsMetadata.contractId, "web.providers.models.success");
    assert.equal(browserProviderModelsMetadata.version, 1);
    assert.equal(schema.$schema, "http://json-schema.org/draft-07/schema#");
    assert.equal(browserProviderModelsMetadata.schemaDialect, schema.$schema);
    assert.equal(schema.$id, "urn:lazygoal:contracts:web.providers.models.success:v1");
    assert.match(browserProviderModelsMetadata.source.sha256, /^[a-f0-9]{64}$/);
});
