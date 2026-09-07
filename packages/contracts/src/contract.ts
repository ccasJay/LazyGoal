import type {
    ArrayContract,
    ArrayOptions,
    BooleanContract,
    Contract,
    ContractBuilders,
    DiscriminatedBranchList,
    DiscriminatedBranchMap,
    DiscriminatedUnionContract,
    EnumContract,
    InferContract,
    IntegerContract,
    JsonScalar,
    LiteralContract,
    NullContract,
    NullableContract,
    NumberContract,
    NumberOptions,
    ObjectContract,
    ObjectProperty,
    ObjectShape,
    OptionalProperty,
    RecursiveContract,
    RecursiveSelfContract,
    RecordContract,
    StringContract,
    StringOptions,
    UnionContract,
} from "./types";
import {
    contractBrand,
    isContractNode,
    isOptionalPropertyNode,
    optionalBrand,
    recursiveOwner,
} from "./internal";

export type {
    ArrayContract,
    ArrayOptions,
    BooleanContract,
    Contract,
    ContractBuilders,
    ContractKind,
    DiscriminatedBranchList,
    DiscriminatedBranchMap,
    DiscriminatedObjectContract,
    DiscriminatedUnionContract,
    EnumContract,
    InferContract,
    InferObjectShape,
    IntegerContract,
    JsonScalar,
    JsonValue,
    LiteralContract,
    NullContract,
    NullableContract,
    NumberContract,
    NumberOptions,
    ObjectContract,
    ObjectProperty,
    ObjectShape,
    OptionalProperty,
    RecursiveContract,
    RecursiveSelfContract,
    RecordContract,
    StringContract,
    StringOptions,
    UnionContract,
} from "./types";

/** 供内部 AST helper 使用的非空 Contract 分支数组。 */
type ContractBranchList = readonly [Contract<unknown>, ...Contract<unknown>[]];

/** 供内部 discriminated union helper 使用的非空 object 分支数组。 */
type ObjectContractBranchList = readonly [ObjectContract<ObjectShape>, ...ObjectContract<ObjectShape>[]];

/** 创建带内部品牌并冻结的 AST 节点。 */
function freezeContractNode<Node extends object>(node: Node): Readonly<Node> {
    Object.defineProperty(node, contractBrand, {
        configurable: false,
        enumerable: false,
        value: true,
        writable: false,
    });
    return Object.freeze(node);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isContract(value: unknown): value is Contract<unknown> {
    return isContractNode(value);
}

function assertContract(value: unknown, label: string): asserts value is Contract<unknown> {
    if (!isContract(value)) {
        throw new TypeError(`${label} must be a Contract node`);
    }
}

function assertOptionsObject(value: unknown, label: string, keys: readonly string[]): asserts value is Record<string, unknown> {
    if (!isObjectRecord(value)) {
        throw new TypeError(`${label} must be an object`);
    }

    for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== "string" || !keys.includes(key)) {
            throw new TypeError(`${label} contains unsupported option ${String(key)}`);
        }
    }
}

function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`${label} must be a non-negative safe integer`);
    }
}

function assertFiniteNumber(value: unknown, label: string): asserts value is number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${label} must be a finite number`);
    }
}

function copyStringOptions(options: StringOptions | undefined): StringOptions | undefined {
    if (options === undefined) return undefined;
    assertOptionsObject(options, "string options", ["minLength", "maxLength", "pattern"]);

    const copy: { minLength?: number; maxLength?: number; pattern?: string } = {};
    if (options.minLength !== undefined) {
        assertNonNegativeInteger(options.minLength, "string minLength");
        copy.minLength = options.minLength;
    }
    if (options.maxLength !== undefined) {
        assertNonNegativeInteger(options.maxLength, "string maxLength");
        copy.maxLength = options.maxLength;
    }
    if (options.pattern !== undefined) {
        if (typeof options.pattern !== "string") {
            throw new TypeError("string pattern must be a string");
        }
        try {
            new RegExp(options.pattern, "u");
        } catch (error) {
            throw new TypeError("string pattern must be a valid Unicode regular expression", { cause: error });
        }
        copy.pattern = options.pattern;
    }
    if (copy.minLength !== undefined && copy.maxLength !== undefined && copy.minLength > copy.maxLength) {
        throw new TypeError("string minLength must not exceed maxLength");
    }
    return Object.keys(copy).length === 0 ? undefined : Object.freeze(copy);
}

function copyNumberOptions(options: NumberOptions | undefined): NumberOptions | undefined {
    if (options === undefined) return undefined;
    assertOptionsObject(options, "number options", ["minimum", "maximum"]);

    const copy: { minimum?: number; maximum?: number } = {};
    if (options.minimum !== undefined) {
        assertFiniteNumber(options.minimum, "number minimum");
        copy.minimum = options.minimum;
    }
    if (options.maximum !== undefined) {
        assertFiniteNumber(options.maximum, "number maximum");
        copy.maximum = options.maximum;
    }
    if (copy.minimum !== undefined && copy.maximum !== undefined && copy.minimum > copy.maximum) {
        throw new TypeError("number minimum must not exceed maximum");
    }
    return Object.keys(copy).length === 0 ? undefined : Object.freeze(copy);
}

function copyArrayOptions(options: ArrayOptions | undefined): ArrayOptions | undefined {
    if (options === undefined) return undefined;
    assertOptionsObject(options, "array options", ["minItems", "maxItems"]);

    const copy: { minItems?: number; maxItems?: number } = {};
    if (options.minItems !== undefined) {
        assertNonNegativeInteger(options.minItems, "array minItems");
        copy.minItems = options.minItems;
    }
    if (options.maxItems !== undefined) {
        assertNonNegativeInteger(options.maxItems, "array maxItems");
        copy.maxItems = options.maxItems;
    }
    if (copy.minItems !== undefined && copy.maxItems !== undefined && copy.minItems > copy.maxItems) {
        throw new TypeError("array minItems must not exceed maxItems");
    }
    return Object.keys(copy).length === 0 ? undefined : Object.freeze(copy);
}

function copyShape<Shape extends ObjectShape>(shape: Shape): Readonly<Shape> {
    if (!isObjectRecord(shape)) {
        throw new TypeError("object shape must be an object");
    }
    for (const key of Reflect.ownKeys(shape)) {
        if (typeof key !== "string") {
            throw new TypeError("object shape keys must be strings");
        }
        const descriptor = Object.getOwnPropertyDescriptor(shape, key);
        if (descriptor?.enumerable !== true) {
            throw new TypeError(`object shape field ${key} must be enumerable`);
        }
    }

    const copy: Record<string, ObjectProperty> = {};
    for (const key of Object.keys(shape)) {
        const property = shape[key];
        if (isContract(property)) {
            Object.defineProperty(copy, key, {
                configurable: true,
                enumerable: true,
                value: property,
                writable: true,
            });
            continue;
        }
        if (isOptionalPropertyNode(property)) {
            Object.defineProperty(copy, key, {
                configurable: true,
                enumerable: true,
                value: property,
                writable: true,
            });
            continue;
        }
        throw new TypeError(`object field ${key} must be a Contract or optional property`);
    }
    return Object.freeze(copy) as Readonly<Shape>;
}

function copyBranches<Branches extends ContractBranchList>(branches: Branches): Readonly<Branches> {
    if (!Array.isArray(branches) || branches.length === 0) {
        throw new TypeError("union branches must be a non-empty array");
    }
    for (const [index, branch] of branches.entries()) {
        assertContract(branch, `union branch ${index}`);
    }
    return Object.freeze([...branches]) as Readonly<Branches>;
}

function assertContractName(name: unknown): asserts name is string {
    if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new TypeError("recursive name must be a non-empty ASCII identifier");
    }
}

function scalarIdentity(value: JsonScalar): string {
    if (value === null) return "null";
    if (typeof value === "string") return `string:${value}`;
    if (typeof value === "boolean") return `boolean:${value ? "true" : "false"}`;
    if (value === 0) return "number:0";
    return `number:${value}`;
}

function assertJsonScalar(value: unknown, label: string): asserts value is JsonScalar {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number" && Number.isFinite(value)) return;
    throw new TypeError(`${label} must be a finite JSON scalar`);
}

function buildString(options?: StringOptions): StringContract {
    const copy: { kind: "string"; options?: StringOptions } = { kind: "string" };
    const copiedOptions = copyStringOptions(options);
    if (copiedOptions !== undefined) copy.options = copiedOptions;
    return freezeContractNode(copy) as StringContract;
}

function buildNumber(options?: NumberOptions): NumberContract {
    const copy: { kind: "number"; options?: NumberOptions } = { kind: "number" };
    const copiedOptions = copyNumberOptions(options);
    if (copiedOptions !== undefined) copy.options = copiedOptions;
    return freezeContractNode(copy) as NumberContract;
}

function buildInteger(options?: NumberOptions): IntegerContract {
    const copy: { kind: "integer"; options?: NumberOptions } = { kind: "integer" };
    const copiedOptions = copyNumberOptions(options);
    if (copiedOptions !== undefined) copy.options = copiedOptions;
    return freezeContractNode(copy) as IntegerContract;
}

function buildBoolean(): BooleanContract {
    return freezeContractNode({ kind: "boolean" }) as BooleanContract;
}

function buildNull(): NullContract {
    return freezeContractNode({ kind: "null" }) as NullContract;
}

function buildLiteral<const Value extends JsonScalar>(value: Value): LiteralContract<Value> {
    assertJsonScalar(value, "literal value");
    return freezeContractNode({ kind: "literal", value }) as LiteralContract<Value>;
}

function buildEnum<const Values extends readonly [JsonScalar, ...JsonScalar[]]>(values: Values): EnumContract<Values> {
    if (!Array.isArray(values) || values.length === 0) {
        throw new TypeError("enum values must be a non-empty array");
    }
    const seen = new Set<string>();
    for (const [index, value] of values.entries()) {
        assertJsonScalar(value, `enum value ${index}`);
        const identity = scalarIdentity(value);
        if (seen.has(identity)) {
            throw new TypeError(`enum values must not contain duplicates: ${String(value)}`);
        }
        seen.add(identity);
    }
    return freezeContractNode({
        kind: "enum",
        values: Object.freeze([...values]),
    }) as EnumContract<Values>;
}

function buildObject<const Shape extends ObjectShape>(shape: Shape): ObjectContract<Shape> {
    return freezeContractNode({ kind: "object", shape: copyShape(shape) }) as ObjectContract<Shape>;
}

function buildOptional<Inner extends Contract<unknown>>(inner: Inner): OptionalProperty<InferContract<Inner>> {
    assertContract(inner, "optional inner");
    const node = {
        kind: "optional" as const,
        inner,
    };
    Object.defineProperty(node, optionalBrand, {
        configurable: false,
        enumerable: false,
        value: true,
        writable: false,
    });
    return Object.freeze(node) as unknown as OptionalProperty<InferContract<Inner>>;
}

function buildNullable<Inner extends Contract<unknown>>(inner: Inner): NullableContract<Inner> {
    assertContract(inner, "nullable inner");
    return freezeContractNode({ kind: "nullable", inner }) as NullableContract<Inner>;
}

function buildArray<Items extends Contract<unknown>>(
    items: Items,
    options?: ArrayOptions,
): ArrayContract<Items> {
    assertContract(items, "array items");
    const copy: { kind: "array"; items: Items; options?: ArrayOptions } = { kind: "array", items };
    const copiedOptions = copyArrayOptions(options);
    if (copiedOptions !== undefined) copy.options = copiedOptions;
    return freezeContractNode(copy) as ArrayContract<Items>;
}

function buildRecord<Value extends Contract<unknown>>(value: Value): RecordContract<Value> {
    assertContract(value, "record value");
    return freezeContractNode({ kind: "record", values: value }) as RecordContract<Value>;
}

function buildUnion<const Branches extends readonly [Contract<unknown>, ...Contract<unknown>[]]>(
    branches: Branches,
): UnionContract<Branches>;
function buildUnion<const First extends Contract<unknown>, const Rest extends readonly Contract<unknown>[]>(
    first: First,
    ...rest: Rest
): UnionContract<readonly [First, ...Rest]>;
function buildUnion(...argumentsList: unknown[]): UnionContract<ContractBranchList> {
    const branches = argumentsList.length === 1 && Array.isArray(argumentsList[0])
        ? argumentsList[0]
        : argumentsList;
    return freezeContractNode({
        kind: "union",
        branches: copyBranches(branches as unknown as ContractBranchList),
    }) as unknown as UnionContract<ContractBranchList>;
}

function getDiscriminatorLiteral(
    discriminator: string,
    branch: unknown,
    index: number,
): JsonScalar {
    if (!isContract(branch) || branch.kind !== "object") {
        throw new TypeError(`discriminated union branch ${index} must be a strict object Contract`);
    }
    const objectBranch = branch as ObjectContract<ObjectShape>;
    const property = objectBranch.shape[discriminator];
    if (!isContract(property) || property.kind !== "literal") {
        throw new TypeError(`discriminated union branch ${index} must define a literal ${discriminator}`);
    }
    return (property as LiteralContract<JsonScalar>).value;
}

function copyDiscriminatedBranches(
    discriminator: string,
    branches: unknown,
): readonly ObjectContract<ObjectShape>[] {
    const list = Array.isArray(branches)
        ? branches
        : isObjectRecord(branches)
            ? Object.keys(branches).map((key) => branches[key])
            : undefined;
    if (list === undefined || list.length === 0) {
        throw new TypeError("discriminated union branches must be non-empty");
    }

    const seen = new Set<string>();
    const copied: ObjectContract<ObjectShape>[] = [];
    for (const [index, branch] of list.entries()) {
        const tag = getDiscriminatorLiteral(discriminator, branch, index);
        const identity = scalarIdentity(tag);
        if (seen.has(identity)) {
            throw new TypeError(`discriminated union contains duplicate ${discriminator} literal`);
        }
        seen.add(identity);
        copied.push(branch as ObjectContract<ObjectShape>);
    }
    return Object.freeze(copied);
}

function buildDiscriminatedUnion<
    const Discriminator extends string,
    const Branches extends DiscriminatedBranchList<Discriminator>,
>(discriminator: Discriminator, branches: Branches): DiscriminatedUnionContract<Discriminator, Branches>;
function buildDiscriminatedUnion<
    const Discriminator extends string,
    const BranchMap extends DiscriminatedBranchMap<Discriminator>,
>(
    discriminator: Discriminator,
    branches: BranchMap,
): DiscriminatedUnionContract<
    Discriminator,
    readonly [BranchMap[keyof BranchMap], ...BranchMap[keyof BranchMap][]]
>;
function buildDiscriminatedUnion(
    discriminator: string,
    branches: unknown,
): DiscriminatedUnionContract<string, ObjectContractBranchList> {
    if (discriminator.length === 0) {
        throw new TypeError("discriminator must not be empty");
    }
    const copied = copyDiscriminatedBranches(discriminator, branches);
    return freezeContractNode({
        kind: "discriminatedUnion",
        discriminator,
        branches: copied,
    }) as unknown as DiscriminatedUnionContract<string, ObjectContractBranchList>;
}

function buildRecursive<const Name extends string, Body extends Contract<unknown>>(
    name: Name,
    define: (self: RecursiveSelfContract<Name>) => Body,
): RecursiveContract<Name, Body> {
    assertContractName(name);
    if (typeof define !== "function") {
        throw new TypeError("recursive definition must be a function");
    }

    const recursiveIdentity = Symbol("lazygoal.recursiveDefinition");
    const selfNode = {
        kind: "recursiveRef",
        name,
    };
    Object.defineProperty(selfNode, recursiveOwner, {
        configurable: false,
        enumerable: false,
        value: recursiveIdentity,
        writable: false,
    });
    const self = freezeContractNode(selfNode) as RecursiveSelfContract<Name>;
    const body = define(self);
    assertContract(body, "recursive body");
    const recursiveNode = { kind: "recursive", name, body };
    Object.defineProperty(recursiveNode, recursiveOwner, {
        configurable: false,
        enumerable: false,
        value: recursiveIdentity,
        writable: false,
    });
    return freezeContractNode(recursiveNode) as RecursiveContract<Name, Body>;
}

const builderSet: ContractBuilders = {
    string: buildString,
    number: buildNumber,
    integer: buildInteger,
    boolean: buildBoolean,
    null: buildNull,
    literal: buildLiteral,
    enum: buildEnum,
    object: buildObject,
    optional: buildOptional,
    nullable: buildNullable,
    array: buildArray,
    record: buildRecord,
    union: buildUnion,
    discriminatedUnion: buildDiscriminatedUnion,
    recursive: buildRecursive,
};

/**
 * 创建 Contract AST 的唯一公共 builder 集合。
 *
 * @remarks
 * builder 集合及其返回的 AST 节点均为只读；节点内部的 shape、分支和约束选项会
 * 在构造时复制并冻结。公共入口不暴露任何运行时规则回调。
 *
 * @example
 * ```ts
 * const Goal = contract.object({
 *     objective: contract.string(),
 *     labels: contract.array(contract.string()),
 * });
 * ```
 */
export const contract: ContractBuilders = Object.freeze(builderSet);
