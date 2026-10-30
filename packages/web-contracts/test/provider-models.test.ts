import assert from "node:assert/strict";
import { test } from "node:test";

import {
    browserProviderModelsMetadata,
    browserProviderModelsSchema,
} from "../src/generated/provider-models-schema";
import { readBrowserProviderModels } from "../src/provider-models-reader";

test("provider models reader extracts declared fields and reports bounded paths", () => {
    const input = {
        ok: true,
        models: [{ id: " model-1 ", name: "", debug: "must not be reported" }],
        trace: { value: "must not be reported" },
    };

    const result = readBrowserProviderModels(input);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.data, { ok: true, models: [{ id: " model-1 ", name: "" }] });
    assert.deepEqual(result.diagnostic, {
        contractId: "web.providers.models.success",
        version: 1,
        paths: ["/trace", "/models/0/debug"],
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

test("provider models reader bounds unknown-field diagnostics", () => {
    const input: Record<string, unknown> = {
        ok: true,
        models: [],
    };
    for (let index = 0; index < 40; index += 1) input[`debug-${index}`] = index;

    const result = readBrowserProviderModels(input);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.diagnostic?.paths.length, 32);
    assert.equal(result.diagnostic?.truncated, true);
    assert.ok(result.diagnostic?.paths.every(path => path.startsWith("/debug-")));
});

test("provider models reader accepts empty results and names but preserves string values", () => {
    const empty = readBrowserProviderModels({ ok: true, models: [] });
    assert.deepEqual(empty, { ok: true, data: { ok: true, models: [] } });

    const named = readBrowserProviderModels({ ok: true, models: [{ id: "m-1", name: "" }] });
    assert.deepEqual(named, { ok: true, data: { ok: true, models: [{ id: "m-1", name: "" }] } });

    const spaced = readBrowserProviderModels({ ok: true, models: [{ id: "  m-1  ", name: " Name " }] });
    assert.deepEqual(spaced, {
        ok: true,
        data: { ok: true, models: [{ id: "  m-1  ", name: " Name " }] },
    });
});

test("provider models reader rejects invalid known fields without returning partial data", () => {
    const invalidValues: unknown[] = [
        { models: [] },
        { ok: false, models: [] },
        { ok: true },
        { ok: true, models: {} },
        { ok: true, models: [null] },
        { ok: true, models: [{ name: "missing id" }] },
        { ok: true, models: [{ id: 42, name: "wrong id type" }] },
        { ok: true, models: [{ id: " \t\n", name: "blank id" }] },
        { ok: true, models: [{ id: "m-1", name: 42 }] },
        { ok: true, models: [{ id: "m-1" }, { id: "m-2", name: "ok" }] },
    ];

    for (const value of invalidValues) {
        assert.deepEqual(readBrowserProviderModels(value), { ok: false }, JSON.stringify(value));
    }
});

test("provider models reader accepts only JSON-shaped input and handles prototype keys safely", () => {
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
        assert.deepEqual(readBrowserProviderModels(value), { ok: false });
    }

    const prototypeKey = JSON.parse('{"ok":true,"models":[],"__proto__":{"polluted":true}}') as object;
    const result = readBrowserProviderModels(prototypeKey);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.data, { ok: true, models: [] });
    assert.deepEqual(result.diagnostic?.paths, ["/__proto__"]);
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
