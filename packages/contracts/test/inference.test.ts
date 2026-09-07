import assert from "node:assert/strict";
import { test } from "node:test";

import { contract } from "../src/index";
import type { InferContract } from "../src/index";

type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends
        (<Value>() => Value extends Right ? 1 : 2)
        ? true
        : false;
type Assert<Value extends true> = Value;

const UserContract = contract.object({
    id: contract.string(),
    active: contract.boolean(),
    nickname: contract.optional(contract.string()),
    tags: contract.array(contract.string()),
    labels: contract.record(contract.number()),
    state: contract.nullable(contract.literal("ready")),
    result: contract.union([contract.literal("ok"), contract.literal("error")] as const),
});
const InferredEnumContract = contract.enum(["active", "done"]);
const InferredUnionContract = contract.union([contract.literal("left"), contract.literal("right")]);
const InferredDiscriminatedContract = contract.discriminatedUnion("kind", [
    contract.object({ kind: contract.literal("created"), id: contract.string() }),
    contract.object({ kind: contract.literal("deleted"), id: contract.number() }),
]);

type User = InferContract<typeof UserContract>;
type _UserIsReadonlyAndPrecise = Assert<Equal<
    User,
    {
        readonly id: string;
        readonly active: boolean;
        readonly nickname?: string;
        readonly tags: readonly string[];
        readonly labels: { readonly [key: string]: number };
        readonly state: "ready" | null;
        readonly result: "ok" | "error";
    }
>>;
type _EnumPreservesLiteralValues = Assert<Equal<
    InferContract<typeof InferredEnumContract>,
    "active" | "done"
>>;
type _UnionPreservesLiteralValues = Assert<Equal<
    InferContract<typeof InferredUnionContract>,
    "left" | "right"
>>;
type _DiscriminatedUnionPreservesBranchValues = Assert<Equal<
    InferContract<typeof InferredDiscriminatedContract>,
    | { readonly kind: "created"; readonly id: string }
    | { readonly kind: "deleted"; readonly id: number }
>>;

const NodeContract = contract.recursive("Node", (self) => contract.object({
    value: contract.string(),
    children: contract.array(self),
}));

type Node = InferContract<typeof NodeContract>;
type _NodeShapeIsRecursive = Assert<Equal<
    Node,
    {
        readonly value: string;
        readonly children: readonly Node[];
    }
>>;

test("inference examples compile to readonly output types", () => {
    const user: User = {
        id: "user-1",
        active: true,
        tags: ["one"],
        labels: { score: 1 },
        state: "ready",
        result: "ok",
    };
    const node: Node = { value: "root", children: [] };

    assert.equal(user.active, true);
    assert.equal(node.children.length, 0);
});

// @ts-expect-error Contract output must keep required fields.
const missingRequired: User = { active: true, tags: [], labels: {}, state: null, result: "ok" };
void missingRequired;

if (false) {
    // @ts-expect-error OptionalProperty is not a general nested Contract.
    contract.array(contract.optional(contract.string()));

    // @ts-expect-error OptionalProperty is not a union branch.
    contract.union([contract.optional(contract.string()), contract.boolean()] as const);
}
