import assert from "node:assert/strict";
import { test } from "node:test";

import Ajv from "ajv";

import {
    ContractProjectionError,
    createContractBinding,
    type ContractBinding,
    type ContractSchemaNode,
    type ContractValidator,
} from "../src/index";

interface Sample {
    readonly count: number;
    readonly kind: "alpha" | "beta";
    readonly nested: { readonly label: string; readonly optionalLabel?: string };
    readonly note?: string;
    readonly tags?: readonly string[];
}

const portableSchema: ContractSchemaNode = {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
        count: { type: "integer", minimum: 1, maximum: 10 },
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
                label: { type: "string" },
                optionalLabel: { type: "string" },
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
}).compile(portableSchema as unknown as object);

const binding: ContractBinding<Sample> = createContractBinding<Sample>({
    contractId: "sample.model",
    version: 1,
    schema: portableSchema,
    validate: validate as unknown as ContractValidator,
});

test("model projection derives a closed required-nullable draft-07 wire schema", () => {
    const projection = binding.modelProjection();
    assert.equal(projection, binding.modelProjection());
    assert.equal(projection.schema.$schema, "http://json-schema.org/draft-07/schema#");
    assert.equal(projection.schema.type, "object");
    assert.equal(projection.schema.additionalProperties, false);
    assert.deepEqual(projection.schema.required, ["count", "kind", "nested", "note", "tags"]);

    const properties = projection.schema.properties as Record<string, Record<string, unknown>>;
    assert.deepEqual(properties.note?.type, ["string", "null"]);
    assert.deepEqual(properties.tags?.type, ["array", "null"]);
    assert.equal(properties.count?.type, "integer");
    assert.equal(properties.count?.minimum, 1);
    assert.equal(properties.count?.maximum, 10);
    assert.equal(properties.nested?.type, "object");
    assert.equal(properties.nested?.additionalProperties, false);
    assert.deepEqual(properties.nested?.required, ["label", "optionalLabel"]);
    const nestedProperties = properties.nested?.properties as Record<string, Record<string, unknown>>;
    assert.deepEqual(nestedProperties.optionalLabel?.type, ["string", "null"]);
    assert.equal(JSON.stringify(projection.schema).includes("$ref"), false);
    assert.equal(JSON.stringify(projection.schema).includes("definitions"), false);
});

test("model projection decodes required-nullable wire values into canonical data", () => {
    const projection = binding.modelProjection();
    const wire = {
        count: 3,
        kind: "alpha",
        nested: { label: "ok", optionalLabel: null, debug: "nested-secret" },
        note: null,
        tags: null,
        debug: "wire-secret",
    };
    const original = structuredClone(wire);

    const result = projection.decode(wire);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.data, {
        count: 3,
        kind: "alpha",
        nested: { label: "ok" },
    });
    assert.ok(result.diagnostic);
    assert.deepEqual([...result.diagnostic.paths].sort(), ["/debug", "/nested/debug"]);
    assert.deepEqual(wire, original);
    assert.notEqual(result.data, wire);
    assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("model projection rejects missing wire-required properties and invalid canonical values", () => {
    const projection = binding.modelProjection();

    const missingOptional = projection.decode({
        count: 3,
        kind: "alpha",
        nested: { label: "ok" },
    });
    assert.equal(missingOptional.ok, false);
    if (!missingOptional.ok) {
        assert.ok(missingOptional.issues.some(issue => issue.path === "/note" && issue.code === "required"));
        assert.ok(missingOptional.issues.some(issue => issue.path === "/tags" && issue.code === "required"));
        assert.equal("data" in missingOptional, false);
    }

    const invalidCases: Array<{ value: unknown; path: string; code: string }> = [
        { value: { count: 0, kind: "alpha", nested: { label: "ok", optionalLabel: null }, note: null, tags: null }, path: "/count", code: "range" },
        { value: { count: 1.5, kind: "alpha", nested: { label: "ok", optionalLabel: null }, note: null, tags: null }, path: "/count", code: "type" },
        { value: { count: 3, kind: "gamma", nested: { label: "ok", optionalLabel: null }, note: null, tags: null }, path: "/kind", code: "enum" },
        { value: { count: 3, kind: "alpha", nested: { optionalLabel: null }, note: null, tags: null }, path: "/nested/label", code: "required" },
        { value: { count: "3", kind: "alpha", nested: { label: "ok", optionalLabel: null }, note: null, tags: null }, path: "/count", code: "type" },
        { value: { count: 3, kind: "alpha", nested: { label: "ok", optionalLabel: null }, note: null, tags: [1] }, path: "/tags/0", code: "type" },
    ];
    for (const current of invalidCases) {
        const result = projection.decode(current.value);
        assert.equal(result.ok, false, JSON.stringify(current.value));
        if (!result.ok) {
            assert.ok(
                result.issues.some(issue => issue.path === current.path && issue.code === current.code),
                `${JSON.stringify(result.issues)} missing ${current.path}:${current.code}`,
            );
            assert.equal("data" in result, false);
        }
    }
});

test("model projection preserves array lengths and integer item constraints", () => {
    const schema: ContractSchemaNode = {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
            stepIndexes: {
                type: "array",
                items: { type: "integer", minimum: 0 },
                minItems: 1,
                maxItems: 16,
            },
            optionalTags: {
                type: "array",
                items: { type: "string" },
                minItems: 2,
                maxItems: 3,
            },
        },
        required: ["stepIndexes"],
        additionalProperties: false,
    };
    const local = createContractBinding<unknown>({
        contractId: "sample.array-constraints",
        version: 1,
        schema,
        validate: compileValidator(schema),
    });
    const projection = local.modelProjection();
    const properties = projection.schema.properties as Record<string, Record<string, unknown>>;

    assert.equal(properties.stepIndexes?.minItems, 1);
    assert.equal(properties.stepIndexes?.maxItems, 16);
    assert.deepEqual(properties.stepIndexes?.items, { type: "integer", minimum: 0 });
    assert.deepEqual(properties.optionalTags?.type, ["array", "null"]);
    assert.equal(properties.optionalTags?.minItems, 2);
    assert.equal(properties.optionalTags?.maxItems, 3);

    const valid = projection.decode({ stepIndexes: [0, 2], optionalTags: null });
    assert.equal(valid.ok, true);
    if (valid.ok) assert.deepEqual(valid.data, { stepIndexes: [0, 2] });

    const invalidCases: Array<{ value: unknown; path: string; code: string }> = [
        { value: { stepIndexes: [], optionalTags: null }, path: "/stepIndexes", code: "length" },
        { value: { stepIndexes: [0, 1], optionalTags: ["a"] }, path: "/optionalTags", code: "length" },
        { value: { stepIndexes: [0, 1], optionalTags: ["a", "b", "c", "d"] }, path: "/optionalTags", code: "length" },
        { value: { stepIndexes: [1.5], optionalTags: null }, path: "/stepIndexes/0", code: "type" },
        { value: { stepIndexes: [-1], optionalTags: null }, path: "/stepIndexes/0", code: "range" },
    ];
    for (const current of invalidCases) {
        const result = projection.decode(current.value);
        assert.equal(result.ok, false, JSON.stringify(current.value));
        if (result.ok) continue;
        assert.ok(
            result.issues.some(issue => issue.path === current.path && issue.code === current.code),
            `${JSON.stringify(result.issues)} missing ${current.path}:${current.code}`,
        );
    }
});

test("model projection widens local string constraints and records decode enforcement", () => {
    const constrained = createContractBinding<{ label: string }>({
        contractId: "sample.constrained",
        version: 1,
        schema: schemaWith({
            type: "string",
            pattern: "^[a-z]+$",
            minLength: 2,
            maxLength: 4,
        }),
        validate: compileValidator(schemaWith({
            type: "string",
            pattern: "^[a-z]+$",
            minLength: 2,
            maxLength: 4,
        })),
    });
    const projection = constrained.modelProjection();

    const properties = projection.schema.properties as Record<string, Record<string, unknown>>;
    assert.deepEqual(properties.label, { type: "string" });
    assert.deepEqual(projection.localConstraints, [{
        path: "#/properties/label",
        keywords: ["pattern", "minLength", "maxLength"],
    }]);

    const valid = projection.decode({ label: "abc" });
    assert.equal(valid.ok, true);

    const invalidCases: Array<{ value: unknown; path: string; code: string }> = [
        { value: { label: "ABC" }, path: "/label", code: "pattern" },
        { value: { label: "a" }, path: "/label", code: "length" },
        { value: { label: "abcde" }, path: "/label", code: "length" },
    ];
    for (const current of invalidCases) {
        const result = projection.decode(current.value);
        assert.equal(result.ok, false, JSON.stringify(current.value));
        if (result.ok) continue;
        assert.ok(
            result.issues.some(issue => issue.path === current.path && issue.code === current.code),
            `${JSON.stringify(result.issues)} missing ${current.path}:${current.code}`,
        );
        assert.equal("data" in result, false);
    }
});

test("model projection maps optional, null and discriminated union fields", () => {
    const schema: ContractSchemaNode = {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
            requiredNullable: { type: ["string", "null"] },
            optional: { type: "string" },
            optionalLiteral: { type: "string", const: "fixed" },
            union: {
                anyOf: [
                    {
                        type: "object",
                        properties: {
                            kind: { type: "string", const: "alpha" },
                            alpha: { type: "string" },
                            note: { type: "string" },
                        },
                        required: ["kind", "alpha"],
                        additionalProperties: false,
                    },
                    {
                        type: "object",
                        properties: {
                            kind: { type: "string", const: "beta" },
                            beta: { type: "number", minimum: 1 },
                        },
                        required: ["kind", "beta"],
                        additionalProperties: false,
                    },
                ],
            },
        },
        required: ["requiredNullable", "union"],
        additionalProperties: false,
    };
    const unionBinding = createContractBinding<unknown>({
        contractId: "sample.union-projection",
        version: 1,
        schema,
        validate: compileValidator(schema),
    });
    const projection = unionBinding.modelProjection();
    const properties = projection.schema.properties as Record<string, Record<string, unknown>>;
    assert.deepEqual(properties.requiredNullable?.type, ["string", "null"]);
    assert.deepEqual(properties.optional?.type, ["string", "null"]);
    assert.deepEqual(properties.optionalLiteral, {
        type: ["string", "null"],
        enum: ["fixed", null],
    });
    assert.equal(properties.union?.anyOf !== undefined, true);

    const unionBranches = properties.union?.anyOf as Array<Record<string, unknown>>;
    assert.equal(unionBranches.length, 2);
    const alphaProperties = unionBranches[0]?.properties as Record<string, Record<string, unknown>>;
    assert.deepEqual(alphaProperties.note?.type, ["string", "null"]);
    assert.deepEqual(unionBranches[0]?.required, ["kind", "alpha", "note"]);

    const decoded = projection.decode({
        requiredNullable: null,
        optional: null,
        optionalLiteral: null,
        union: { kind: "alpha", alpha: "value", note: null, debug: "wire-secret" },
    });
    assert.equal(decoded.ok, true);
    if (!decoded.ok) return;
    assert.deepEqual(decoded.data, {
        requiredNullable: null,
        union: { kind: "alpha", alpha: "value" },
    });
    assert.ok(decoded.diagnostic);
    assert.deepEqual(decoded.diagnostic.paths, ["/union/debug"]);
    assert.equal(JSON.stringify(decoded).includes("wire-secret"), false);

    const missingOptional = projection.decode({
        requiredNullable: null,
        union: { kind: "beta", beta: 2 },
    });
    assert.equal(missingOptional.ok, false);
    if (missingOptional.ok) return;
    assert.ok(missingOptional.issues.some(issue => issue.path === "/optional" && issue.code === "required"));

    const invalidBranch = projection.decode({
        requiredNullable: null,
        optional: null,
        union: { kind: "beta", beta: 0 },
    });
    assert.equal(invalidBranch.ok, false);
    if (invalidBranch.ok) return;
    assert.ok(invalidBranch.issues.some(issue => issue.path === "/union/beta" && issue.code === "range"));
});

test("model projection rejects ambiguous optional nullable fields", () => {
    const schema: ContractSchemaNode = {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: { maybe: { type: ["string", "null"] } },
        required: [],
        additionalProperties: false,
    };
    const local = createContractBinding<unknown>({
        contractId: "sample.optional-nullable",
        version: 1,
        schema,
        validate: compileValidator(schema),
    });

    assert.throws(
        () => local.modelProjection(),
        /Optional nullable properties are ambiguous/,
    );
});

test("model projection rejects non-portable local schemas with a locatable error", () => {
    const cases: Array<{ schema: ContractSchemaNode; reason: RegExp }> = [
        {
            schema: {
                $schema: "http://json-schema.org/draft-07/schema#",
                type: "object",
                properties: { pair: { type: "array", items: [{ type: "string" }, { type: "number" }] } as unknown as ContractSchemaNode },
                required: ["pair"],
                additionalProperties: false,
            },
            reason: /Tuple or missing array items/,
        },
        {
            schema: {
                $schema: "http://json-schema.org/draft-07/schema#",
                type: "object",
                properties: { value: { type: "string" } },
                additionalProperties: true as unknown as false,
            },
            reason: /Open objects are not portable/,
        },
        {
            schema: {
                $schema: "http://json-schema.org/draft-07/schema#",
                $ref: "#/definitions/Node",
                definitions: {
                    Node: {
                        type: "object",
                        properties: { next: { $ref: "#/definitions/Node" } },
                        required: ["next"],
                        additionalProperties: false,
                    },
                },
            },
            reason: /Recursive \$ref/,
        },
    ];

    for (const current of cases) {
        const local = createContractBinding<unknown>({
            contractId: "sample.nonportable",
            version: 1,
            schema: current.schema,
            validate: () => true,
        });
        assert.throws(
            () => local.modelProjection(),
            (error: unknown) => error instanceof ContractProjectionError && current.reason.test(error.message),
        );
    }
});

function schemaWith(property: ContractSchemaNode): ContractSchemaNode {
    return {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: { label: property },
        required: ["label"],
        additionalProperties: false,
    };
}

function compileValidator(schema: ContractSchemaNode): ContractValidator {
    return new Ajv({
        strict: true,
        allowUnionTypes: true,
        allErrors: true,
        removeAdditional: false,
        coerceTypes: false,
        useDefaults: false,
    }).compile(schema as unknown as object) as unknown as ContractValidator;
}
