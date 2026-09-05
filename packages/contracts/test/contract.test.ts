import assert from "node:assert/strict";
import { test } from "node:test";

import { contract } from "../src/index";

test("creates every core AST node without rule callbacks", () => {
    const stringNode = contract.string({ minLength: 1, maxLength: 4, pattern: "^[a-z]+$" });
    const numberNode = contract.number({ minimum: 0, maximum: 10 });
    const integerNode = contract.integer({ minimum: 1, maximum: 3 });
    const objectNode = contract.object({
        name: stringNode,
        count: contract.optional(integerNode),
    });
    const unionNode = contract.union([contract.literal("one"), contract.literal("two")] as const);
    const discriminatedNode = contract.discriminatedUnion("kind", [
        contract.object({ kind: contract.literal("a"), value: stringNode }),
        contract.object({ kind: contract.literal("b"), value: numberNode }),
    ] as const);
    const recursiveNode = contract.recursive("Node", (self) => contract.object({
        value: stringNode,
        children: contract.array(self),
    }));

    assert.deepEqual(stringNode, {
        kind: "string",
        options: { minLength: 1, maxLength: 4, pattern: "^[a-z]+$" },
    });
    assert.deepEqual(numberNode, { kind: "number", options: { minimum: 0, maximum: 10 } });
    assert.deepEqual(integerNode, { kind: "integer", options: { minimum: 1, maximum: 3 } });
    assert.equal(contract.boolean().kind, "boolean");
    assert.equal(contract.null().kind, "null");
    assert.deepEqual(contract.literal("value"), { kind: "literal", value: "value" });
    assert.deepEqual(contract.enum(["a", "b"] as const), { kind: "enum", values: ["a", "b"] });
    assert.equal(objectNode.kind, "object");
    assert.equal(unionNode.kind, "union");
    assert.equal(discriminatedNode.kind, "discriminatedUnion");
    assert.equal(recursiveNode.kind, "recursive");
    assert.equal(recursiveNode.body.kind, "object");
    assert.equal(recursiveNode.body.shape.children.kind, "array");
    assert.equal(recursiveNode.body.shape.children.items.kind, "recursiveRef");

    assert.equal("transform" in contract, false);
    assert.equal("coerce" in contract, false);
    assert.equal("default" in contract, false);
    assert.equal("refine" in contract, false);
});

test("copies and freezes builder inputs and returned AST nodes", () => {
    const options: { minLength?: number } = { minLength: 1 };
    const shape: Record<string, ReturnType<typeof contract.string>> = {
        value: contract.string(options),
    };
    const branches = [contract.literal("a"), contract.literal("b")] as const;
    const stringNode = contract.string(options);
    const initialValue = shape.value;
    const objectNode = contract.object(shape);
    const unionNode = contract.union(branches);

    options.minLength = 9;
    shape.value = contract.string({ maxLength: 2 });
    (branches as unknown as Array<unknown>).push(contract.literal("c"));

    assert.deepEqual(stringNode.options, { minLength: 1 });
    assert.notStrictEqual(objectNode.shape, shape);
    assert.strictEqual(objectNode.shape.value, initialValue);
    assert.deepEqual(objectNode.shape.value, { kind: "string", options: { minLength: 1 } });
    assert.deepEqual(unionNode.branches, [
        { kind: "literal", value: "a" },
        { kind: "literal", value: "b" },
    ]);

    assert.equal(Object.isFrozen(stringNode), true);
    assert.equal(Object.isFrozen(stringNode.options), true);
    assert.equal(Object.isFrozen(objectNode), true);
    assert.equal(Object.isFrozen(objectNode.shape), true);
    assert.equal(Object.isFrozen(unionNode), true);
    assert.equal(Object.isFrozen(unionNode.branches), true);
    assert.throws(() => {
        (objectNode.shape as Record<string, unknown>).value = contract.boolean();
    }, TypeError);
});

test("rejects invalid local builder configuration", () => {
    assert.throws(() => contract.string({ minLength: -1 }), TypeError);
    assert.throws(() => contract.string({ minLength: 2, maxLength: 1 }), TypeError);
    assert.throws(() => contract.string({ pattern: "[" }), TypeError);
    assert.throws(() => contract.number({ minimum: 2, maximum: 1 }), TypeError);
    assert.throws(() => contract.integer({ minimum: Number.POSITIVE_INFINITY }), TypeError);
    assert.throws(() => contract.array(contract.string(), { minItems: 2, maxItems: 1 }), TypeError);
    assert.throws(() => contract.enum([] as never), TypeError);
    assert.throws(() => contract.enum(["same", "same"] as const), TypeError);
    assert.throws(() => contract.union([] as never), TypeError);
    assert.throws(() => contract.recursive("not a name", () => contract.string()), TypeError);
    assert.throws(() => contract.discriminatedUnion("kind", [
        contract.object({ kind: contract.literal("a") }),
        contract.object({ kind: contract.literal("a") }),
    ] as const), TypeError);
});

test("supports discriminated branch maps while preserving declaration order", () => {
    const node = contract.discriminatedUnion("kind", {
        first: contract.object({ kind: contract.literal("first") }),
        second: contract.object({ kind: contract.literal("second") }),
    });

    assert.deepEqual(node.branches, [
        { kind: "object", shape: { kind: { kind: "literal", value: "first" } } },
        { kind: "object", shape: { kind: { kind: "literal", value: "second" } } },
    ]);
});
