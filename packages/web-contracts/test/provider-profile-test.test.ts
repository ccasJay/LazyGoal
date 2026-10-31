import assert from "node:assert/strict";
import { test } from "node:test";

import { browserProviderProfileTestResultBinding } from "../src/index";
import {
    browserProviderProfileTestResultMetadata,
    browserProviderProfileTestResultSchema,
} from "../src/generated/provider-profile-test-result-schema";

test("provider profile test result selects the branch from the original ok value", () => {
    const successInput = {
        ok: true,
        modelCount: 29,
        error: "model_catalog_authentication",
        debug: "must not be reported",
    };
    const success = browserProviderProfileTestResultBinding.read(successInput, "strip");
    assert.equal(success.ok, true);
    if (!success.ok || !success.data.ok) return;
    assert.deepEqual(success.data, { ok: true, modelCount: 29 });
    assert.deepEqual(success.diagnostic?.paths, ["/error", "/debug"]);
    assert.equal(JSON.stringify(success.diagnostic).includes("must not be reported"), false);
    assert.equal(successInput.error, "model_catalog_authentication");

    const failureInput = {
        ok: false,
        error: "model_catalog_authentication",
        modelCount: 29,
        debug: "must not be reported",
    };
    const failure = browserProviderProfileTestResultBinding.read(failureInput, "strip");
    assert.equal(failure.ok, true);
    if (!failure.ok || failure.data.ok) return;
    assert.deepEqual(failure.data, { ok: false, error: "model_catalog_authentication" });
    assert.deepEqual(failure.diagnostic?.paths, ["/modelCount", "/debug"]);
});

test("provider profile test result accepts every approved error and integer bounds", () => {
    for (const error of [
        "provider_profile_not_found",
        "model_catalog_authentication",
        "model_catalog_permission",
        "model_catalog_protocol",
        "model_catalog_unavailable",
    ]) {
        assert.equal(browserProviderProfileTestResultBinding.read({ ok: false, error }, "strip").ok, true);
    }
    assert.equal(
        browserProviderProfileTestResultBinding.read({ ok: true, modelCount: 1 }, "strip").ok,
        true,
    );
    assert.equal(
        browserProviderProfileTestResultBinding.read(
            { ok: true, modelCount: Number.MAX_SAFE_INTEGER },
            "strip",
        ).ok,
        true,
    );
    for (const modelCount of [
        0,
        -1,
        1.5,
        Number.MAX_SAFE_INTEGER + 1,
        "29",
        Number.NaN,
        Number.POSITIVE_INFINITY,
        null,
    ]) {
        assert.equal(
            browserProviderProfileTestResultBinding.read({ ok: true, modelCount }, "strip").ok,
            false,
            String(modelCount),
        );
    }
});

test("provider profile test result rejects invalid discriminators and mixed invalid success fields", () => {
    for (const value of [
        {},
        { ok: true },
        { ok: false },
        { ok: "true", modelCount: 1 },
        { ok: true, modelCount: 0, error: "model_catalog_authentication" },
        { ok: false, error: "unknown_error" },
        { ok: false, modelCount: 1 },
        { ok: true, modelCount: 1, debug: () => undefined },
        undefined,
    ]) {
        assert.equal(browserProviderProfileTestResultBinding.read(value, "strip").ok, false, JSON.stringify(value));
    }
    const cyclic: Record<string, unknown> = { ok: true, modelCount: 1 };
    cyclic.self = cyclic;
    assert.equal(browserProviderProfileTestResultBinding.read(cyclic, "strip").ok, false);
});

test("provider profile test result generated metadata records identity, version and dialect", () => {
    const schema = browserProviderProfileTestResultSchema as {
        readonly $schema?: string;
        readonly $id?: string;
    };
    assert.equal(browserProviderProfileTestResultMetadata.contractId, "web.providers.profile_test_result");
    assert.equal(browserProviderProfileTestResultMetadata.version, 1);
    assert.equal(schema.$schema, "http://json-schema.org/draft-07/schema#");
    assert.equal(browserProviderProfileTestResultMetadata.schemaDialect, schema.$schema);
    assert.equal(schema.$id, "urn:lazygoal:contracts:web.providers.profile_test_result:v1");
    assert.match(browserProviderProfileTestResultMetadata.source.sha256, /^[a-f0-9]{64}$/);
});
