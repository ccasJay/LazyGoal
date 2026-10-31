import assert from "node:assert/strict";
import { test } from "node:test";

import { browserProviderModelQueryBinding } from "../src/index";
import {
    browserProviderModelQueryMetadata,
    browserProviderModelQuerySchema,
} from "../src/generated/provider-model-query-schema";

test("provider model query preserves omitted optional fields and strips unknown fields", () => {
    const input = {
        kind: "openai",
        apiKey: "sk-private",
        profileId: "profile-1",
        debug: "must not be reported",
    };
    const result = browserProviderModelQueryBinding.read(input, "strip");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.data, {
        kind: "openai",
        apiKey: "sk-private",
        profileId: "profile-1",
    });
    assert.deepEqual(result.diagnostic?.paths, ["/debug"]);
    assert.equal(JSON.stringify(result.diagnostic).includes("sk-private"), false);
    assert.equal(JSON.stringify(result.diagnostic).includes("must not be reported"), false);
    assert.equal(input.debug, "must not be reported");
    assert.notEqual(result.data, input);

    const minimal = browserProviderModelQueryBinding.read({ kind: "google" }, "strip");
    assert.deepEqual(minimal, { ok: true, data: { kind: "google" } });
});

test("provider model query rejects missing, null, blank and wrong known fields", () => {
    for (const value of [
        {},
        { kind: "" },
        { kind: "  \t" },
        { kind: "openai", apiKey: null },
        { kind: "openai", baseURL: null },
        { kind: "openai", profileId: null },
        { kind: 42 },
        { kind: "openai", apiKey: "   " },
        { kind: "openai", debug: () => undefined },
        { kind: "openai", debug: new Date() },
    ]) {
        assert.equal(browserProviderModelQueryBinding.read(value, "strip").ok, false, JSON.stringify(value));
    }
    assert.equal(browserProviderModelQueryBinding.read(undefined, "strip").ok, false);
    const cyclic: Record<string, unknown> = { kind: "openai" };
    cyclic.self = cyclic;
    assert.equal(browserProviderModelQueryBinding.read(cyclic, "strip").ok, false);
});

test("provider model query generated metadata records identity, version and dialect", () => {
    const schema = browserProviderModelQuerySchema as {
        readonly $schema?: string;
        readonly $id?: string;
    };
    assert.equal(browserProviderModelQueryMetadata.contractId, "web.providers.model_query");
    assert.equal(browserProviderModelQueryMetadata.version, 1);
    assert.equal(schema.$schema, "http://json-schema.org/draft-07/schema#");
    assert.equal(browserProviderModelQueryMetadata.schemaDialect, schema.$schema);
    assert.equal(schema.$id, "urn:lazygoal:contracts:web.providers.model_query:v1");
    assert.match(browserProviderModelQueryMetadata.source.sha256, /^[a-f0-9]{64}$/);
});
