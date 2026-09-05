import assert from "node:assert/strict";
import { test } from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
    compileJsonSchema,
    contract,
    safeParse,
} from "../src/index";
import type { Contract } from "../src/index";

const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
});

interface Fixture {
    readonly label: string;
    readonly value: unknown;
}

function assertAgreement(
    definition: Contract<unknown>,
    fixtures: readonly Fixture[],
): void {
    const validate = ajv.compile(compileJsonSchema(definition));

    for (const fixture of fixtures) {
        const parserAccepted = safeParse(definition, fixture.value).success;
        const schemaAccepted = validate(fixture.value);
        assert.equal(
            schemaAccepted,
            parserAccepted,
            `${fixture.label}: Parser 与 Ajv 对输入的接受结果不一致`,
        );
    }
}

test("cross-validates primitive and scalar constraint semantics with Ajv 2020-12", () => {
    assertAgreement(
        contract.string({ minLength: 2, maxLength: 4, pattern: "^[a-z]+$" }),
        [
            { label: "valid string", value: "goal" },
            { label: "too short", value: "g" },
            { label: "too long", value: "goals" },
            { label: "pattern mismatch", value: "Goal" },
            { label: "wrong string type", value: 1 },
        ],
    );
    assertAgreement(
        contract.number({ minimum: -1, maximum: 3 }),
        [
            { label: "number lower bound", value: -1 },
            { label: "number decimal", value: 1.5 },
            { label: "number upper bound", value: 3 },
            { label: "number below minimum", value: -2 },
            { label: "number above maximum", value: 4 },
            { label: "wrong number type", value: "1" },
        ],
    );
    assertAgreement(
        contract.integer({ minimum: -1, maximum: 3 }),
        [
            { label: "integer lower bound", value: -1 },
            { label: "integer value", value: 2 },
            { label: "integer upper bound", value: 3 },
            { label: "fractional integer", value: 1.5 },
            { label: "integer above maximum", value: 4 },
            { label: "unsafe integer", value: Number.MAX_SAFE_INTEGER + 1 },
        ],
    );
    assertAgreement(contract.boolean(), [
        { label: "true", value: true },
        { label: "false", value: false },
        { label: "wrong boolean type", value: 0 },
    ]);
    assertAgreement(contract.null(), [
        { label: "null", value: null },
        { label: "wrong null type", value: false },
    ]);
    assertAgreement(contract.literal("ready"), [
        { label: "matching literal", value: "ready" },
        { label: "different literal", value: "done" },
    ]);
    assertAgreement(contract.enum(["ready", "done"] as const), [
        { label: "first enum value", value: "ready" },
        { label: "second enum value", value: "done" },
        { label: "unknown enum value", value: "blocked" },
    ]);
});

test("cross-validates array constraints with Ajv 2020-12", () => {
    assertAgreement(
        contract.array(contract.integer(), { minItems: 1, maxItems: 2 }),
        [
            { label: "one valid item", value: [1] },
            { label: "two valid items", value: [1, 2] },
            { label: "too few items", value: [] },
            { label: "too many items", value: [1, 2, 3] },
            { label: "invalid item type", value: [1.5] },
            { label: "wrong array type", value: { 0: 1 } },
        ],
    );
});

test("cross-validates strict object and optional property semantics with Ajv 2020-12", () => {
    const definition = contract.object({
        id: contract.string(),
        enabled: contract.boolean(),
        note: contract.optional(contract.string({ minLength: 1 })),
    });

    assertAgreement(definition, [
        { label: "required fields only", value: { id: "goal-1", enabled: true } },
        {
            label: "required and optional fields",
            value: { id: "goal-1", enabled: false, note: "ready" },
        },
        { label: "missing required field", value: { id: "goal-1" } },
        { label: "invalid optional value", value: { id: "goal-1", enabled: true, note: "" } },
        { label: "invalid required value", value: { id: 1, enabled: true } },
        {
            label: "extra field",
            value: { id: "goal-1", enabled: true, extra: "rejected" },
        },
        { label: "wrong object type", value: ["goal-1", true] },
    ]);
});

test("cross-validates record semantics with Ajv 2020-12", () => {
    const definition = contract.record(contract.number({ minimum: 0 }));

    assertAgreement(definition, [
        { label: "empty record", value: {} },
        { label: "valid record", value: { first: 0, second: 2.5 } },
        { label: "negative record value", value: { first: -1 } },
        { label: "invalid record value type", value: { first: "1" } },
        { label: "wrong record type", value: [] },
    ]);
});

test("cross-validates ordinary and discriminated union semantics with Ajv 2020-12", () => {
    assertAgreement(
        contract.union([
            contract.literal("ready"),
            contract.number({ minimum: 1 }),
        ] as const),
        [
            { label: "matching literal branch", value: "ready" },
            { label: "matching number branch", value: 1.5 },
            { label: "number below branch minimum", value: 0 },
            { label: "unmatched string", value: "done" },
            { label: "unmatched type", value: true },
        ],
    );

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

    assertAgreement(definition, [
        { label: "created branch", value: { kind: "created", id: "goal-1" } },
        { label: "deleted branch", value: { kind: "deleted", id: 1 } },
        { label: "invalid selected branch", value: { kind: "created", id: 1 } },
        { label: "unknown discriminator", value: { kind: "archived", id: 1 } },
        { label: "extra discriminated field", value: { kind: "created", id: "goal-1", extra: true } },
    ]);
});

test("cross-validates nullable semantics with Ajv 2020-12", () => {
    const definition = contract.nullable(contract.object({
        value: contract.string(),
    }));

    assertAgreement(definition, [
        { label: "null value", value: null },
        { label: "valid inner value", value: { value: "ready" } },
        { label: "invalid inner value", value: { value: 1 } },
        { label: "missing inner field", value: {} },
        { label: "wrong nullable type", value: "ready" },
    ]);
});

test("cross-validates finite recursive fixtures with Ajv 2020-12", () => {
    const definition = contract.recursive("Node", (self) => contract.object({
        value: contract.string(),
        children: contract.array(self, { maxItems: 2 }),
    }));

    assertAgreement(definition, [
        { label: "empty recursive children", value: { value: "root", children: [] } },
        {
            label: "nested recursive children",
            value: {
                value: "root",
                children: [{ value: "child", children: [] }],
            },
        },
        {
            label: "invalid nested recursive value",
            value: {
                value: "root",
                children: [{ value: 1, children: [] }],
            },
        },
        {
            label: "too many recursive children",
            value: {
                value: "root",
                children: [
                    { value: "one", children: [] },
                    { value: "two", children: [] },
                    { value: "three", children: [] },
                ],
            },
        },
        { label: "missing recursive value", value: { children: [] } },
    ]);
});
