import assert from "node:assert/strict";
import { test } from "node:test";

import {
    ContractDefinitionError,
    contract,
    safeParse,
} from "../src/index";
import type {
    Contract,
    ContractDefinitionReasonCode,
} from "../src/index";

function assertDefinitionError(
    action: () => unknown,
    reasonCode: ContractDefinitionReasonCode,
): void {
    assert.throws(action, (error: unknown) => {
        assert.equal(error instanceof ContractDefinitionError, true);
        if (!(error instanceof ContractDefinitionError)) return false;
        assert.equal(error.code, "INVALID_CONTRACT_DEFINITION");
        assert.equal(error.reasonCode, reasonCode);
        return true;
    });
}

test("parses finite recursive JSON and isolates shared output references", () => {
    const node = contract.recursive("Node", (self) => contract.object({
        value: contract.number(),
        children: contract.array(self),
    }));
    const shared = { value: 2, children: [] as unknown[] };
    const input = {
        value: 1,
        children: [shared, shared],
    };

    const result = safeParse(node, input);

    assert.equal(result.success, true);
    if (!result.success) return;
    assert.deepEqual(result.data, {
        value: 1,
        children: [
            { value: 2, children: [] },
            { value: 2, children: [] },
        ],
    });
    assert.notStrictEqual(result.data, input);
    assert.notStrictEqual(result.data.children, input.children);
    assert.notStrictEqual(result.data.children[0], shared);
    assert.notStrictEqual(result.data.children[0], result.data.children[1]);

    shared.value = 3;
    assert.equal(result.data.children[0]?.value, 2);
});

test("rejects cyclic input while allowing the same reference in separate branches", () => {
    const node = contract.recursive("Node", (self) => contract.object({
        value: contract.number(),
        children: contract.array(self),
    }));
    const cyclic: { value: number; children: unknown[] } = { value: 1, children: [] };
    cyclic.children.push(cyclic);

    const result = safeParse(node, cyclic);

    assert.equal(result.success, false);
    if (!result.success) {
        assert.deepEqual(result.issues.map(({ code, path }) => ({ code, path })), [
            { code: "cyclic_value", path: ["children", 0] },
        ]);
        assert.equal(result.truncated, false);
    }
});

test("enforces recursive definition scope and guarded back edges", () => {
    const direct = contract.recursive("Direct", (self) => self) as unknown as Contract<unknown>;
    const throughUnion = contract.recursive("Union", (self) => contract.union([
        self,
        contract.null(),
    ] as const)) as unknown as Contract<unknown>;
    const throughNullable = contract.recursive("Nullable", (self) => contract.nullable(self)) as unknown as Contract<unknown>;

    assertDefinitionError(() => safeParse(direct, null), "UNGUARDED_RECURSION");
    assertDefinitionError(() => safeParse(throughUnion, null), "UNGUARDED_RECURSION");
    assertDefinitionError(() => safeParse(throughNullable, null), "UNGUARDED_RECURSION");
});

test("rejects duplicate recursive names, dangling self and illegal optional positions", () => {
    const first = contract.recursive("Node", (self) => contract.object({
        children: contract.array(self),
    }));
    const second = contract.recursive("Node", (self) => contract.object({
        children: contract.array(self),
    }));
    const duplicate = contract.union([first, second] as const);
    const leaked = first.body.shape.children.items;
    const optional = contract.optional(contract.string());

    assertDefinitionError(() => safeParse(duplicate, null), "DUPLICATE_RECURSIVE_NAME");
    assertDefinitionError(
        () => safeParse(leaked as unknown as Contract<unknown>, []),
        "DANGLING_RECURSIVE_REFERENCE",
    );
    assertDefinitionError(
        () => safeParse(optional as unknown as Contract<unknown>, "value"),
        "INVALID_OPTIONAL_POSITION",
    );
});

function makeChain(length: number): unknown {
    let current: unknown = null;
    for (let index = 0; index < length; index += 1) {
        current = { child: current };
    }
    return current;
}

test("accepts input through depth 64 and reports the 65th level", () => {
    const node = contract.recursive("Node", (self) => contract.object({
        child: contract.nullable(self),
    }));

    assert.equal(safeParse(node, makeChain(63)).success, true);
    const tooDeep = safeParse(node, makeChain(64));

    assert.equal(tooDeep.success, false);
    if (!tooDeep.success) {
        assert.deepEqual(tooDeep.issues.map(({ code, path }) => ({ code, path })), [
            { code: "max_depth_exceeded", path: Array.from({ length: 64 }, () => "child") },
        ]);
        assert.equal(tooDeep.truncated, false);
    }
});

test("keeps issue traversal deterministic across declaration, array and extra-key order", () => {
    const definition = contract.object({
        z: contract.string(),
        a: contract.string(),
        items: contract.array(contract.object({ value: contract.string() })),
    });
    const input = {
        z: 1,
        a: 2,
        items: [{ value: 3 }, { value: 4 }],
        zExtra: true,
        aExtra: true,
    };

    const first = safeParse(definition, input);
    const second = safeParse(definition, input);

    assert.equal(first.success, false);
    assert.equal(second.success, false);
    if (!first.success && !second.success) {
        assert.deepEqual(first.issues.map(({ code, path }) => ({ code, path })), [
            { code: "invalid_type", path: ["z"] },
            { code: "invalid_type", path: ["a"] },
            { code: "invalid_type", path: ["items", 0, "value"] },
            { code: "invalid_type", path: ["items", 1, "value"] },
            { code: "extra_field", path: ["aExtra"] },
            { code: "extra_field", path: ["zExtra"] },
        ]);
        assert.deepEqual(first.issues, second.issues);
        assert.equal(JSON.stringify(first.issues), JSON.stringify(second.issues));
    }
});

test("stops after 50 issues and marks the result as truncated", () => {
    const input = Array.from({ length: 60 }, () => 1);
    const result = safeParse(contract.array(contract.string()), input);

    assert.equal(result.success, false);
    if (!result.success) {
        assert.equal(result.issues.length, 50);
        assert.equal(result.truncated, true);
        assert.deepEqual(result.issues[0]?.path, [0]);
        assert.deepEqual(result.issues[49]?.path, [49]);
    }
});
