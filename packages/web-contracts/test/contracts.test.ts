import assert from "node:assert/strict";
import { test } from "node:test";

import {
    compileJsonSchema,
    ContractDefinitionError,
    contract,
    safeParse,
    type InferContract,
} from "../../contracts/src/index";
import {
    browserInteractionViewContract,
    browserMessagePositionContract,
    browserSandboxReviewContract,
    browserSessionInputReceiptContract,
} from "../src/contracts/common";
import { assertWebContractsValid } from "../src/contracts/index";
import {
    hasUtf16LengthAtMost,
    isJsonValue,
} from "../src/invariants/index";
import {
    isRecord,
    type BrowserInteractionView,
    type BrowserMessagePosition,
    type BrowserSessionInputReceipt,
} from "../src/index";

type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends
        (<Value>() => Value extends Right ? 1 : 2)
        ? true
        : false;
type Assert<Value extends true> = Value;

type _ReceiptInference = Assert<Equal<
    BrowserSessionInputReceipt,
    InferContract<typeof browserSessionInputReceiptContract>
>>;
type _MessagePositionInference = Assert<Equal<
    BrowserMessagePosition,
    InferContract<typeof browserMessagePositionContract>
>>;
type _InteractionViewExposesDeclaredFieldsOnly = Assert<Equal<
    keyof BrowserInteractionView,
    "goalId" | "runId" | "kind" | "interactionId" | "requestId" | "actionId"
        | "recoveryRef" | "decisions" | "truncated"
>>;

test("registered web contracts pass the definition check", () => {
    assert.doesNotThrow(() => assertWebContractsValid());
    assert.throws(
        () => compileJsonSchema({
            kind: "openObject",
            shape: "invalid",
        } as unknown as typeof browserSandboxReviewContract),
        (error: unknown) => error instanceof ContractDefinitionError,
    );
});

test("shared nested contracts compile to deterministic schemas", () => {
    const receiptSchema = compileJsonSchema(browserSessionInputReceiptContract);
    assert.equal(receiptSchema.additionalProperties, true);
    assert.deepEqual(receiptSchema.required, [
        "goalId", "inputId", "kind", "sequence", "status", "admittedAtRevision",
    ]);

    const messagePositionSchema = compileJsonSchema(browserMessagePositionContract);
    assert.equal(messagePositionSchema.additionalProperties, true);

    const interactionSchema = compileJsonSchema(browserInteractionViewContract);
    assert.equal(
        (interactionSchema.properties as Record<string, { minItems?: number }>).decisions?.minItems,
        1,
    );
});

test("isJsonValue accepts JSON values and rejects non-plain values", () => {
    assert.equal(isJsonValue({ nested: [1, true, null, "text"] }), true);
    assert.equal(isJsonValue(null), true);
    assert.equal(isJsonValue(1.5), true);
    for (const value of [
        undefined,
        () => undefined,
        Symbol("x"),
        1n,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        new Date(),
        new Map(),
        new Set(),
        new (class Example {})(),
        { [Symbol("key")]: 1 },
    ]) {
        assert.equal(isJsonValue(value), false);
    }
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    assert.equal(isJsonValue(cyclic), false);
});

test("isJsonValue accepts deeply nested payloads without host stack recursion", () => {
    let value: unknown = "leaf";
    for (let index = 0; index < 200; index += 1) {
        value = index % 2 === 0 ? [value] : { nested: value };
    }
    assert.equal(isJsonValue(value), true);
});

test("hasUtf16LengthAtMost preserves the UTF-16 unit boundary", () => {
    assert.equal(hasUtf16LengthAtMost("a".repeat(4_000), 4_000), true);
    assert.equal(hasUtf16LengthAtMost("😀".repeat(4_000), 4_000), false);
    assert.equal(hasUtf16LengthAtMost("a".repeat(4_001), 4_000), false);
    assert.equal(hasUtf16LengthAtMost("a".repeat(2_000), 4_000), true);
    assert.equal(hasUtf16LengthAtMost(undefined, 4_000), false);
});

test("isRecord keeps its public predicate name", () => {
    assert.equal(isRecord({}), true);
    assert.equal(isRecord([]), false);
    assert.equal(isRecord(null), false);
});

test("shared contracts reject explicit undefined for optional fields", () => {
    const receipt = {
        goalId: "goal-1",
        inputId: "input-1",
        kind: "message",
        sequence: 1,
        status: "pending",
        admittedAtRevision: 2,
    };
    assert.equal(safeParse(browserSessionInputReceiptContract, receipt).success, true);
    assert.equal(
        safeParse(browserSessionInputReceiptContract, { ...receipt, targetRunId: undefined }).success,
        false,
    );
    assert.equal(contract.openObject({}).kind, "openObject");
    assert.equal(browserSessionInputReceiptContract.kind, "openObject");
});
