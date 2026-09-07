import assert from "node:assert/strict";
import { test } from "node:test";

import {
    ContractValidationError,
    contract,
    parse,
    safeParse,
} from "../src/index";

test("parses primitive values and applies scalar constraints", () => {
    const text = contract.string({ minLength: 2, maxLength: 3, pattern: "^[a-z]+$" });
    const number = contract.number({ minimum: 1, maximum: 3 });
    const integer = contract.integer({ minimum: 1, maximum: 3 });

    assert.equal(safeParse(contract.boolean(), true).success, true);
    assert.equal(safeParse(contract.null(), null).success, true);
    assert.equal(safeParse(contract.literal("ready"), "ready").success, true);
    assert.equal(safeParse(contract.enum(["ready", "done"] as const), "blocked").success, false);

    const textResult = safeParse(text, "ab");
    assert.equal(textResult.success, true);
    if (textResult.success) assert.equal(textResult.data, "ab");

    const shortText = safeParse(text, "a");
    assert.equal(shortText.success, false);
    if (!shortText.success) assert.equal(shortText.issues[0]?.code, "string_min_length");

    const invalidPatternText = safeParse(text, "ABC");
    assert.equal(invalidPatternText.success, false);
    if (!invalidPatternText.success) assert.equal(invalidPatternText.issues[0]?.code, "string_pattern");

    const validNumber = safeParse(number, 2);
    assert.equal(validNumber.success, true);
    assert.equal(safeParse(number, 4).success, false);
    assert.equal(safeParse(integer, 1.5).success, false);
    assert.equal(safeParse(integer, Number.MAX_SAFE_INTEGER + 1).success, false);
    assert.equal(safeParse(number, "2").success, false);
    assert.equal(safeParse(number, Number.NaN).success, false);
});

test("parses arrays and nested strict objects into isolated copies", () => {
    const contractDefinition = contract.object({
        name: contract.string(),
        tags: contract.array(contract.object({
            label: contract.string(),
        })),
        metadata: contract.record(contract.array(contract.number())),
        nickname: contract.optional(contract.string()),
    });
    const input = {
        name: "Ada",
        tags: [{ label: "math" }],
        metadata: { scores: [1, 2] },
    };
    const result = safeParse(contractDefinition, input);

    assert.equal(result.success, true);
    if (!result.success) return;

    assert.deepEqual(result.data, input);
    assert.notStrictEqual(result.data, input);
    assert.notStrictEqual(result.data.tags, input.tags);
    assert.notStrictEqual(result.data.tags[0], input.tags[0]);
    assert.notStrictEqual(result.data.metadata, input.metadata);
    assert.notStrictEqual(result.data.metadata.scores, input.metadata.scores);

    input.tags[0]!.label = "changed-input";
    input.metadata.scores.push(3);
    assert.equal(result.data.tags[0]!.label, "math");
    assert.deepEqual(result.data.metadata.scores, [1, 2]);

    const mutableOutput = result.data as {
        tags: Array<{ label: string }>;
        metadata: Record<string, number[]>;
    };
    mutableOutput.tags[0]!.label = "changed-output";
    mutableOutput.metadata.scores!.push(4);
    assert.equal(input.tags[0]!.label, "changed-input");
    assert.deepEqual(input.metadata.scores, [1, 2, 3]);
});

test("enforces required and optional fields and rejects strict extras", () => {
    const definition = contract.object({
        id: contract.string(),
        count: contract.integer(),
        note: contract.optional(contract.string()),
    });

    const withoutOptional = safeParse(definition, { id: "one", count: 1 });
    assert.equal(withoutOptional.success, true);
    if (withoutOptional.success) assert.deepEqual(withoutOptional.data, { id: "one", count: 1 });

    const invalid = safeParse(definition, { id: "one", extra: true });
    assert.equal(invalid.success, false);
    if (!invalid.success) {
        assert.deepEqual(invalid.issues.map((issue) => ({ code: issue.code, path: issue.path })), [
            { code: "missing_field", path: ["count"] },
            { code: "extra_field", path: ["extra"] },
        ]);
    }
});

test("record accepts dynamic keys and keeps deterministic key order", () => {
    const definition = contract.record(contract.object({
        value: contract.string(),
    }));
    const input = {
        z: { value: "last" },
        a: { value: "first" },
    };
    const result = safeParse(definition, input);

    assert.equal(result.success, true);
    if (!result.success) return;
    assert.deepEqual(Object.keys(result.data), ["a", "z"]);
    assert.deepEqual(result.data, { a: { value: "first" }, z: { value: "last" } });
});

test("safeParse reports paths without throwing and parse exposes the same issues", () => {
    const definition = contract.object({
        profile: contract.object({
            displayName: contract.string({ minLength: 2 }),
        }),
        values: contract.array(contract.integer()),
    });
    const input = {
        profile: { displayName: "" },
        values: [1, 1.5],
    };
    const safeResult = safeParse(definition, input);

    assert.equal(safeResult.success, false);
    if (safeResult.success) return;
    assert.deepEqual(safeResult.issues.map((issue) => issue.path), [
        ["profile", "displayName"],
        ["values", 1],
    ]);

    assert.throws(() => parse(definition, input), (error: unknown) => {
        assert.equal(error instanceof ContractValidationError, true);
        if (!(error instanceof ContractValidationError)) return false;
        assert.equal(error.code, "CONTRACT_VALIDATION_FAILED");
        assert.deepEqual(error.issues, safeResult.issues);
        assert.equal(error.truncated, safeResult.truncated);
        return true;
    });
});

test("does not normalize values or mutate invalid input", () => {
    const definition = contract.object({
        text: contract.string({ pattern: "^value$" }),
        count: contract.number(),
    });
    const input = { text: " value ", count: "1" };
    const before = structuredClone(input);
    const result = safeParse(definition, input);

    assert.equal(result.success, false);
    assert.deepEqual(input, before);
});

test("tries ordinary union branches in order and isolates branch issues", () => {
    const definition = contract.union([
        contract.object({
            kind: contract.literal("text"),
            value: contract.string(),
        }),
        contract.object({
            kind: contract.literal("count"),
            value: contract.number(),
        }),
    ] as const);

    const matched = safeParse(definition, { kind: "count", value: 2 });
    assert.equal(matched.success, true);
    if (matched.success) assert.deepEqual(matched.data, { kind: "count", value: 2 });

    const unmatched = safeParse(definition, { kind: "unknown", value: true });
    assert.equal(unmatched.success, false);
    if (!unmatched.success) {
        assert.deepEqual(unmatched.issues, [{
            code: "union_no_match",
            path: [],
            message: "No union branch matched",
        }]);
    }
});

test("selects only the matching discriminated union branch", () => {
    const definition = contract.discriminatedUnion("kind", [
        contract.object({
            kind: contract.literal("created"),
            id: contract.string(),
        }),
        contract.object({
            kind: contract.literal("deleted"),
            id: contract.number(),
        }),
    ] as const);

    const deleted = safeParse(definition, { kind: "deleted", id: 3 });
    assert.equal(deleted.success, true);
    if (deleted.success) assert.deepEqual(deleted.data, { kind: "deleted", id: 3 });

    const unknown = safeParse(definition, { kind: "restored", id: 3 });
    assert.equal(unknown.success, false);
    if (!unknown.success) {
        assert.deepEqual(unknown.issues.map((issue) => ({ code: issue.code, path: issue.path })), [
            { code: "unknown_discriminator", path: ["kind"] },
        ]);
    }

    const invalidSelectedBranch = safeParse(definition, { kind: "created", id: 3 });
    assert.equal(invalidSelectedBranch.success, false);
    if (!invalidSelectedBranch.success) {
        assert.deepEqual(invalidSelectedBranch.issues.map((issue) => ({ code: issue.code, path: issue.path })), [
            { code: "invalid_type", path: ["id"] },
        ]);
    }
});

test("preserves nested union paths and parse/safeParse issue consistency", () => {
    const event = contract.discriminatedUnion("kind", [
        contract.object({ kind: contract.literal("created"), id: contract.string() }),
        contract.object({ kind: contract.literal("deleted"), id: contract.number() }),
    ] as const);
    const definition = contract.object({ events: contract.array(event) });
    const input = { events: [{ kind: "unknown" }] };
    const safeResult = safeParse(definition, input);

    assert.equal(safeResult.success, false);
    if (safeResult.success) return;
    assert.deepEqual(safeResult.issues.map((issue) => issue.path), [["events", 0, "kind"]]);

    assert.throws(() => parse(definition, input), (error: unknown) => {
        assert.equal(error instanceof ContractValidationError, true);
        if (!(error instanceof ContractValidationError)) return false;
        assert.deepEqual(error.issues, safeResult.issues);
        assert.equal(error.truncated, safeResult.truncated);
        return true;
    });
});
