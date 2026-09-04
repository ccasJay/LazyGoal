import assert from "node:assert/strict";
import { test } from "node:test";

import {
    compileJsonSchema,
    ContractDefinitionError,
    contract,
} from "../src/index";
import type {
    Contract,
    JsonSchema202012,
} from "../src/index";

const schemaUri = "https://json-schema.org/draft/2020-12/schema";

test("maps primitive and scalar Contract nodes to JSON Schema keywords", () => {
    assert.deepEqual(compileJsonSchema(contract.string({
        minLength: 1,
        maxLength: 4,
        pattern: "^[a-z]+$",
    })), {
        $schema: schemaUri,
        type: "string",
        minLength: 1,
        maxLength: 4,
        pattern: "^[a-z]+$",
    });
    assert.deepEqual(compileJsonSchema(contract.number({ minimum: 1, maximum: 3 })), {
        $schema: schemaUri,
        type: "number",
        minimum: 1,
        maximum: 3,
    });
    assert.deepEqual(compileJsonSchema(contract.integer()), {
        $schema: schemaUri,
        type: "integer",
        minimum: Number.MIN_SAFE_INTEGER,
        maximum: Number.MAX_SAFE_INTEGER,
    });
    assert.deepEqual(compileJsonSchema(contract.boolean()), {
        $schema: schemaUri,
        type: "boolean",
    });
    assert.deepEqual(compileJsonSchema(contract.null()), {
        $schema: schemaUri,
        type: "null",
    });
    assert.deepEqual(compileJsonSchema(contract.literal("ready")), {
        $schema: schemaUri,
        const: "ready",
    });
    assert.deepEqual(compileJsonSchema(contract.enum(["ready", "done"] as const)), {
        $schema: schemaUri,
        enum: ["ready", "done"],
    });
});

test("preserves strict object, optional, nullable, collection and union semantics", () => {
    const definition = contract.object({
        id: contract.string(),
        nickname: contract.optional(contract.string()),
        active: contract.nullable(contract.boolean()),
        scores: contract.array(contract.integer(), { minItems: 1, maxItems: 2 }),
        labels: contract.record(contract.number()),
        state: contract.union([
            contract.literal("ready"),
            contract.literal("done"),
        ] as const),
    });

    const schema = compileJsonSchema(definition);

    assert.deepEqual(schema, {
        $schema: schemaUri,
        type: "object",
        properties: {
            id: { type: "string" },
            nickname: { type: "string" },
            active: {
                anyOf: [
                    { type: "boolean" },
                    { type: "null" },
                ],
            },
            scores: {
                type: "array",
                items: {
                    type: "integer",
                    minimum: Number.MIN_SAFE_INTEGER,
                    maximum: Number.MAX_SAFE_INTEGER,
                },
                minItems: 1,
                maxItems: 2,
            },
            labels: {
                type: "object",
                additionalProperties: { type: "number" },
            },
            state: {
                anyOf: [
                    { const: "ready" },
                    { const: "done" },
                ],
            },
        },
        required: ["id", "active", "scores", "labels", "state"],
        additionalProperties: false,
    });

    const properties = schema.properties as { readonly [key: string]: unknown };
    assert.deepEqual(Object.keys(properties), [
        "id",
        "nickname",
        "active",
        "scores",
        "labels",
        "state",
    ]);
});

test("uses oneOf for discriminated unions and preserves branch order", () => {
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

    assert.deepEqual(compileJsonSchema(definition), {
        $schema: schemaUri,
        oneOf: [
            {
                type: "object",
                properties: {
                    kind: { const: "created" },
                    id: { type: "string" },
                },
                required: ["kind", "id"],
                additionalProperties: false,
            },
            {
                type: "object",
                properties: {
                    kind: { const: "deleted" },
                    id: { type: "number" },
                },
                required: ["kind", "id"],
                additionalProperties: false,
            },
        ],
    });
});

test("compiles recursive definitions into ordered $defs and local $ref values", () => {
    const node = contract.recursive("Node", (self) => contract.object({
        value: contract.string(),
        children: contract.array(self),
    }));

    const schema = compileJsonSchema(node);

    assert.deepEqual(schema, {
        $schema: schemaUri,
        $ref: "#/$defs/Node",
        $defs: {
            Node: {
                type: "object",
                properties: {
                    value: { type: "string" },
                    children: {
                        type: "array",
                        items: { $ref: "#/$defs/Node" },
                    },
                },
                required: ["value", "children"],
                additionalProperties: false,
            },
        },
    });
});

test("returns deterministic and isolated Schema objects", () => {
    const definition = contract.object({
        name: contract.string(),
        nested: contract.object({ value: contract.number() }),
    });
    const first: JsonSchema202012 = compileJsonSchema(definition);
    const second = compileJsonSchema(definition);

    assert.notStrictEqual(first, second);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.notStrictEqual(first.properties, second.properties);

    const firstProperties = first.properties as Record<string, unknown>;
    firstProperties.name = { type: "number" };
    const firstNested = firstProperties.nested as Record<string, unknown>;
    firstNested.type = "array";

    const third = compileJsonSchema(definition);
    assert.deepEqual(third, second);
    assert.deepEqual((third.properties as Record<string, unknown>).name, { type: "string" });
    assert.deepEqual((third.properties as Record<string, unknown>).nested, {
        type: "object",
        properties: { value: { type: "number" } },
        required: ["value"],
        additionalProperties: false,
    });
});

test("preflights invalid recursive definitions before compiling", () => {
    const invalid = contract.recursive("Invalid", (self) => self) as unknown as Contract<unknown>;

    assert.throws(() => compileJsonSchema(invalid), (error: unknown) => {
        assert.equal(error instanceof ContractDefinitionError, true);
        if (!(error instanceof ContractDefinitionError)) return false;
        assert.equal(error.code, "INVALID_CONTRACT_DEFINITION");
        assert.equal(error.reasonCode, "UNGUARDED_RECURSION");
        return true;
    });
});
