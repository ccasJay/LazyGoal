import assert from "node:assert/strict";
import { test } from "node:test";

import {
    compileJsonSchema,
    ContractDefinitionError,
    contract,
    ContractValidationError,
    parse,
    safeParse,
    type InferContract,
} from "../src/index";

type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends
        (<Value>() => Value extends Right ? 1 : 2)
        ? true
        : false;
type Assert<Value extends true> = Value;

type _UnknownIsUnknown = Assert<Equal<
    InferContract<ReturnType<typeof contract.unknown>>,
    unknown
>>;

const envelope = contract.openObject({
    id: contract.string(),
    nested: contract.optional(contract.object({ ok: contract.boolean() })),
});

type Envelope = InferContract<typeof envelope>;

type _OpenObjectExposesDeclaredFieldsOnly = Assert<Equal<
    Envelope,
    {
        readonly id: string;
        readonly nested?: { readonly ok: boolean };
    }
>>;

test("unknown accepts any JSON value and returns an isolated deep copy", () => {
    const definition = contract.unknown();
    const input = {
        nested: [1, true, null, "text"],
        object: { deeper: { value: 2 } },
    };

    const result = safeParse(definition, input);
    assert.equal(result.success, true);
    if (!result.success) return;

    assert.deepEqual(result.data, input);
    assert.notEqual(result.data, input);
    const copied = result.data as typeof input;
    assert.notEqual(copied.object, input.object);
    assert.notEqual(copied.nested, input.nested);

    for (const scalar of [null, true, 1.5, "text"]) {
        assert.equal(safeParse(definition, scalar).success, true);
    }
});

test("unknown rejects non-JSON values and cyclic references", () => {
    const definition = contract.unknown();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const symbolKeyed = { [Symbol("key")]: 1 };

    for (const value of [
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
        symbolKeyed,
        cyclic,
    ]) {
        assert.equal(safeParse(definition, value).success, false);
    }

    const cyclicResult = safeParse(definition, cyclic);
    assert.equal(cyclicResult.success, false);
    if (!cyclicResult.success) {
        assert.equal(cyclicResult.issues[0]?.code, "cyclic_value");
        assert.deepEqual(cyclicResult.issues[0]?.path, ["self"]);
    }

    const nested = safeParse(definition, { ok: [1, { bad: undefined }] });
    assert.equal(nested.success, false);
    if (!nested.success) {
        assert.deepEqual(nested.issues[0]?.path, ["ok", 1, "bad"]);
    }
});

test("unknown payload depth is independent from the structure budget", () => {
    let payload: unknown = "leaf";
    for (let index = 0; index < 200; index += 1) {
        payload = index % 2 === 0 ? [payload] : { nested: payload };
    }

    assert.equal(safeParse(contract.unknown(), payload).success, true);

    const wrapper = contract.object({
        level: contract.object({
            payload: contract.unknown(),
        }),
    });
    assert.equal(safeParse(wrapper, { level: { payload } }).success, true);

    const recursive = contract.recursive("Node", (self) => contract.object({
        child: contract.optional(self),
    }));
    let deepInput: Record<string, unknown> = {};
    const root = deepInput;
    for (let index = 0; index < 64; index += 1) {
        const next: Record<string, unknown> = {};
        deepInput.child = next;
        deepInput = next;
    }
    const tooDeep = safeParse(recursive, root);
    assert.equal(tooDeep.success, false);
    if (!tooDeep.success) {
        assert.equal(tooDeep.issues[0]?.code, "max_depth_exceeded");
    }
});

test("openObject validates declared fields and preserves extra JSON fields", () => {
    const input = {
        id: "session-1",
        extra: { ok: true, values: [1, 2, 3] },
        another: null,
    };

    const result = safeParse(envelope, input);
    assert.equal(result.success, true);
    if (!result.success) return;

    assert.deepEqual(result.data, input);
    assert.notEqual(result.data, input);
    assert.notEqual((result.data as Record<string, unknown>).extra, input.extra);

    assert.equal(safeParse(envelope, { id: "session-1", nested: { ok: true } }).success, true);
    assert.equal(safeParse(envelope, {}).success, false);
    assert.equal(safeParse(envelope, { id: 1 }).success, false);
    assert.equal(safeParse(envelope, { id: "session-1", nested: { ok: "yes" } }).success, false);
});

test("openObject rejects non-JSON extra values", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    for (const extra of [undefined, () => undefined, Symbol("x"), 1n, new Date(), cyclic]) {
        const result = safeParse(envelope, { id: "session-1", extra });
        assert.equal(result.success, false);
    }

    const nested = safeParse(envelope, { id: "session-1", extra: { bad: [undefined] } });
    assert.equal(nested.success, false);
    if (!nested.success) {
        assert.deepEqual(nested.issues[0]?.path, ["extra", "bad", 0]);
    }
});

test("openObject preserves __proto__ keys without polluting the prototype", () => {
    const input: Record<string, unknown> = { id: "session-1" };
    Object.defineProperty(input, "__proto__", {
        configurable: true,
        enumerable: true,
        value: { polluted: true },
        writable: true,
    });

    const result = safeParse(envelope, input);
    assert.equal(result.success, true);
    if (!result.success) return;

    const output = result.data as Record<string, unknown>;
    assert.equal(Object.getPrototypeOf(output), Object.prototype);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    assert.deepEqual(output["__proto__"], { polluted: true });
});

test("openObject extra payload depth is independent from the structure budget", () => {
    let extra: unknown = "leaf";
    for (let index = 0; index < 200; index += 1) {
        extra = [extra];
    }

    assert.equal(safeParse(envelope, { id: "session-1", extra }).success, true);
});

test("unknown maps to an empty JSON Schema while openObject allows additional properties", () => {
    assert.deepEqual(compileJsonSchema(contract.unknown()), {
        $schema: "https://json-schema.org/draft/2020-12/schema",
    });
    assert.deepEqual(compileJsonSchema(contract.openObject({
        id: contract.string(),
        note: contract.optional(contract.string()),
    })), {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
            id: { type: "string" },
            note: { type: "string" },
        },
        required: ["id"],
        additionalProperties: true,
    });
    assert.deepEqual(compileJsonSchema(contract.object({ id: contract.string() })), {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
    });
});

test("openObject rejects invalid shapes through the builder and definition check", () => {
    assert.throws(
        () => contract.openObject({ id: {} } as never),
        TypeError,
    );

    const forged = {
        kind: "openObject",
        shape: "not-a-shape",
    } as unknown as ReturnType<typeof contract.openObject>;
    assert.throws(
        () => safeParse(forged, {}),
        (error: unknown) => error instanceof ContractDefinitionError
            && error.reasonCode === "INVALID_NODE",
    );
});

test("parse returns the isolated openObject copy", () => {
    const input = { id: "session-1", extra: { ok: true } };
    const parsed = parse(envelope, input);
    assert.deepEqual(parsed, input);
    assert.notEqual(parsed, input);
});

test("unknown failures raise ContractValidationError from parse", () => {
    assert.throws(
        () => parse(contract.unknown(), undefined),
        ContractValidationError,
    );
});
