/** JSON 协议允许的标量值。 */
export type JsonScalar = null | boolean | number | string;

/**
 * Contract 可以描述的 JSON 值。
 *
 * @remarks
 * 数组和对象均以只读形式表示；运行时校验仍会拒绝非有限数字。
 */
export type JsonValue =
    | JsonScalar
    | readonly JsonValue[]
    | { readonly [key: string]: JsonValue };

/** Contract AST 节点的稳定种类标识。 */
export type ContractKind =
    | "string"
    | "number"
    | "integer"
    | "boolean"
    | "null"
    | "literal"
    | "enum"
    | "object"
    | "optional"
    | "nullable"
    | "array"
    | "record"
    | "union"
    | "discriminatedUnion"
    | "recursive"
    | "recursiveRef";

type RegularContractKind = Exclude<ContractKind, "optional">;

declare const contractOutput: unique symbol;
declare const optionalOutput: unique symbol;
declare const recursiveMarker: unique symbol;

/**
 * 可被 Parser 和 Schema compiler 共同消费的只读 Contract 节点。
 *
 * @remarks
 * `Output` 只用于 TypeScript 静态推导；节点本身不保存可执行的转换、默认值或
 * 自定义校验回调。所有公开 builder 返回的节点都带有内部品牌，伪造的结构不会
 * 被其它 Contracts 内部组件视为合法节点。
 *
 * @example
 * ```ts
 * const user = contract.object({ name: contract.string() });
 * const output: Contract<Readonly<{ name: string }>> = user;
 * ```
 */
export interface Contract<Output> {
    /** 当前节点的 AST 种类。 */
    readonly kind: RegularContractKind;
    /** 仅供 `InferContract` 使用的输出类型品牌。 */
    readonly [contractOutput]: Output;
}

/**
 * 从 Contract 节点提取其只读输出类型。
 *
 * @example
 * ```ts
 * const User = contract.object({
 *     id: contract.string(),
 *     nickname: contract.optional(contract.string()),
 * });
 * type User = InferContract<typeof User>;
 * ```
 */
export type InferContract<C extends Contract<unknown>> = C[typeof contractOutput];

/**
 * 只允许直接放入 object shape 的可选属性节点。
 *
 * @remarks
 * 可选表示属性可以缺失，不表示属性值可以隐式变成 `undefined`。该节点不能
 * 作为根 Contract、数组元素、record value 或 union 分支。
 *
 * @example
 * ```ts
 * const shape = {
 *     required: contract.string(),
 *     optional: contract.optional(contract.boolean()),
 * };
 * ```
 */
export interface OptionalProperty<Output> {
    /** 节点种类固定为 `optional`。 */
    readonly kind: "optional";
    /** 被标记为可选的实际 Contract。 */
    readonly inner: Contract<Output>;
    /** 仅供 object 输出类型推导使用的品牌。 */
    readonly [optionalOutput]: Output;
}

/** 字符串节点可声明的结构约束。 */
export type StringOptions = Readonly<{
    /** 按 Unicode code point 计算的最小长度。 */
    readonly minLength?: number;
    /** 按 Unicode code point 计算的最大长度。 */
    readonly maxLength?: number;
    /** 使用 Unicode RegExp 语义解释的 ECMA-262 pattern。 */
    readonly pattern?: string;
}>;

/** 数值节点可声明的包含边界范围。 */
export type NumberOptions = Readonly<{
    /** 允许的最小数值，边界包含。 */
    readonly minimum?: number;
    /** 允许的最大数值，边界包含。 */
    readonly maximum?: number;
}>;

/** 数组节点可声明的元素数量约束。 */
export type ArrayOptions = Readonly<{
    /** 允许的最少元素数量。 */
    readonly minItems?: number;
    /** 允许的最多元素数量。 */
    readonly maxItems?: number;
}>;

/** object builder 接受的字段定义。 */
export type ObjectProperty = Contract<unknown> | OptionalProperty<unknown>;

/** strict object builder 的字段定义表。 */
export type ObjectShape = Readonly<Record<string, ObjectProperty>>;

/** 字符串 Contract 的 AST 节点类型。 */
export type StringContract = Contract<string> & {
    readonly kind: "string";
    readonly options?: StringOptions;
};

/** number Contract 的 AST 节点类型。 */
export type NumberContract = Contract<number> & {
    readonly kind: "number";
    readonly options?: NumberOptions;
};

/** 安全整数 Contract 的 AST 节点类型。 */
export type IntegerContract = Contract<number> & {
    readonly kind: "integer";
    readonly options?: NumberOptions;
};

/** boolean Contract 的 AST 节点类型。 */
export type BooleanContract = Contract<boolean> & { readonly kind: "boolean" };

/** null Contract 的 AST 节点类型。 */
export type NullContract = Contract<null> & { readonly kind: "null" };

/** literal Contract 的 AST 节点类型。 */
export type LiteralContract<Value extends JsonScalar> = Contract<Value> & {
    readonly kind: "literal";
    readonly value: Value;
};

/** enum Contract 的 AST 节点类型。 */
export type EnumContract<Values extends readonly [JsonScalar, ...JsonScalar[]]> =
    Contract<Values[number]> & {
        readonly kind: "enum";
        readonly values: Readonly<Values>;
    };

type Simplify<Value> = { [Key in keyof Value]: Value[Key] };

type OptionalObjectKeys<Shape extends ObjectShape> = {
    [Key in keyof Shape]-?: Shape[Key] extends OptionalProperty<unknown> ? Key : never;
}[keyof Shape];

type RequiredObjectKeys<Shape extends ObjectShape> = Exclude<
    keyof Shape,
    OptionalObjectKeys<Shape>
>;

type InferObjectProperty<Property extends ObjectProperty> =
    Property extends OptionalProperty<infer Output>
        ? Output
        : Property extends Contract<unknown>
            ? InferContract<Property>
            : never;

/** 根据 object shape 推导出的只读对象输出。 */
export type InferObjectShape<Shape extends ObjectShape> = Simplify<
    {
        readonly [Key in RequiredObjectKeys<Shape>]: InferObjectProperty<Shape[Key]>;
    } & {
        readonly [Key in OptionalObjectKeys<Shape>]?: InferObjectProperty<Shape[Key]>;
    }
>;

/** strict object Contract 的 AST 节点类型。 */
export type ObjectContract<Shape extends ObjectShape> = Contract<InferObjectShape<Shape>> & {
    readonly kind: "object";
    readonly shape: Readonly<Shape>;
};

/** nullable Contract 的 AST 节点类型。 */
export type NullableContract<Inner extends Contract<unknown>> =
    Contract<InferContract<Inner> | null> & {
        readonly kind: "nullable";
        readonly inner: Inner;
    };

/** array Contract 的 AST 节点类型。 */
export type ArrayContract<Items extends Contract<unknown>> =
    Contract<readonly InferContract<Items>[]> & {
        readonly kind: "array";
        readonly items: Items;
        readonly options?: ArrayOptions;
    };

/** record Contract 的 AST 节点类型。 */
export type RecordContract<Value extends Contract<unknown>> =
    Contract<{ readonly [key: string]: InferContract<Value> }> & {
        readonly kind: "record";
        readonly values: Value;
    };

/** union Contract 的 AST 节点类型。 */
export type UnionContract<Branches extends readonly [Contract<unknown>, ...Contract<unknown>[]]> =
    Contract<InferContract<Branches[number]>> & {
        readonly kind: "union";
        readonly branches: Readonly<Branches>;
    };

type DiscriminatedObjectShape<Discriminator extends string> = ObjectShape & {
    readonly [Key in Discriminator]: LiteralContract<JsonScalar>;
};

/** discriminated union 可接受的 strict object 分支。 */
export type DiscriminatedObjectContract<Discriminator extends string> =
    ObjectContract<DiscriminatedObjectShape<Discriminator>>;

/** discriminated union 的非空分支数组形式。 */
export type DiscriminatedBranchList<Discriminator extends string> = readonly [
    DiscriminatedObjectContract<Discriminator>,
    ...DiscriminatedObjectContract<Discriminator>[]
];

/** discriminated union 的 tag 到分支映射形式。 */
export type DiscriminatedBranchMap<Discriminator extends string> = Readonly<
    Record<string, DiscriminatedObjectContract<Discriminator>>
>;

/** discriminated union Contract 的 AST 节点类型。 */
export type DiscriminatedUnionContract<
    Discriminator extends string,
    Branches extends readonly ObjectContract<ObjectShape>[],
> = Contract<InferContract<Branches[number]>> & {
    readonly kind: "discriminatedUnion";
    readonly discriminator: Discriminator;
    readonly branches: Readonly<Branches>;
};

interface RecursiveMarker<Name extends string> {
    readonly [recursiveMarker]: Name;
}

/** recursive callback 接收的自引用 Contract 节点。 */
export type RecursiveSelfContract<Name extends string> = Contract<RecursiveMarker<Name>> & {
    readonly kind: "recursiveRef";
    readonly name: Name;
};

/** 将 recursive body 中的 self marker 替换为完整固定点输出类型。 */
type RecursiveOutput<Body extends Contract<unknown>, Name extends string> = ReplaceRecursive<
    InferContract<Body>,
    RecursiveMarker<Name>,
    Body
>;

/** recursive Contract 的 AST 节点类型。 */
export type RecursiveContract<Name extends string, Body extends Contract<unknown>> =
    Contract<RecursiveOutput<Body, Name>> & {
        readonly kind: "recursive";
        readonly name: Name;
        readonly body: Body;
    };

/**
 * Contract builder 的公共入口类型。
 *
 * @remarks
 * 入口只提供可以直接映射到受支持 JSON 结构的声明能力，不包含 transform、coerce、
 * default、refine 或其它依赖执行回调的规则。
 *
 * @example
 * ```ts
 * const User = contract.object({
 *     id: contract.string(),
 *     active: contract.optional(contract.boolean()),
 * });
 * ```
 */
export interface ContractBuilders {
    /**
     * 创建字符串 Contract。
     *
     * @param options - 可选的长度和 Unicode pattern 约束。
     * @returns 不可变字符串 AST 节点。
     * @throws 约束不是非负安全整数、pattern 无法编译或范围倒置时抛出异常。
     */
    readonly string: (options?: StringOptions) => StringContract;
    /**
     * 创建有限 number Contract。
     *
     * @param options - 可选的包含边界范围。
     * @returns 不可变 number AST 节点。
     * @throws 边界不是有限数值或范围倒置时抛出异常。
     */
    readonly number: (options?: NumberOptions) => NumberContract;
    /**
     * 创建安全整数 Contract。
     *
     * @param options - 可选的包含边界范围；运行时节点额外要求安全整数。
     * @returns 不可变 integer AST 节点。
     * @throws 边界不是有限数值或范围倒置时抛出异常。
     */
    readonly integer: (options?: NumberOptions) => IntegerContract;
    /**
     * 创建 boolean Contract。
     *
     * @returns 不可变 boolean AST 节点。
     */
    readonly boolean: () => BooleanContract;
    /**
     * 创建 null Contract。
     *
     * @returns 不可变 null AST 节点。
     */
    readonly null: () => NullContract;
    /**
     * 创建单值 literal Contract。
     *
     * @param value - 有限 JSON 标量值。
     * @returns 只接受该值的不可变 literal AST 节点。
     * @throws value 不是 JSON 标量或 number 非有限时抛出异常。
     */
    readonly literal: <const Value extends JsonScalar>(value: Value) => LiteralContract<Value>;
    /**
     * 创建非空且无重复值的 enum Contract。
     *
     * @param values - 有序的有限 JSON 标量值集合。
     * @returns 保存独立冻结值数组的 enum AST 节点。
     * @throws values 为空、含非标量值或含重复值时抛出异常。
     */
    readonly enum: <const Values extends readonly [JsonScalar, ...JsonScalar[]]>(
        values: Values,
    ) => EnumContract<Values>;
    /**
     * 创建始终拒绝额外字段的 strict object Contract。
     *
     * @param shape - 按声明顺序排列的 required/optional 字段表。
     * @returns 保存独立冻结 shape 的 object AST 节点。
     * @throws 字段不是 Contract 或合法 optional property 时抛出异常。
     */
    readonly object: <const Shape extends ObjectShape>(shape: Shape) => ObjectContract<Shape>;
    /**
     * 创建只能作为 object 字段值使用的 optional 标记。
     *
     * @param inner - 缺失时不参与 object 输出的实际 Contract。
     * @returns 冻结的 optional property 节点。
     * @throws inner 不是由本 builder 创建的普通 Contract 时抛出异常。
     */
    readonly optional: <Inner extends Contract<unknown>>(
        inner: Inner,
    ) => OptionalProperty<InferContract<Inner>>;
    /**
     * 创建允许 null 的 Contract。
     *
     * @param inner - null 之外的实际 Contract。
     * @returns 不可变 nullable AST 节点。
     * @throws inner 不是普通 Contract 时抛出异常。
     */
    readonly nullable: <Inner extends Contract<unknown>>(
        inner: Inner,
    ) => NullableContract<Inner>;
    /**
     * 创建单一元素 Contract 的数组。
     *
     * @param items - 每个数组元素共享的 Contract。
     * @param options - 可选的元素数量约束。
     * @returns 不可变 array AST 节点。
     * @throws items 不是普通 Contract、数量约束无效或范围倒置时抛出异常。
     */
    readonly array: <Items extends Contract<unknown>>(
        items: Items,
        options?: ArrayOptions,
    ) => ArrayContract<Items>;
    /**
     * 创建字符串动态键到单一 value Contract 的 record。
     *
     * @param value - 所有动态键共享的 value Contract。
     * @returns 不可变 record AST 节点。
     * @throws value 不是普通 Contract 时抛出异常。
     */
    readonly record: <Value extends Contract<unknown>>(value: Value) => RecordContract<Value>;
    /**
     * 创建按声明顺序尝试分支的普通 union。
     *
     * @param branches - 至少一个普通 Contract 分支；也支持传入多个分支参数。
     * @returns 保存独立冻结分支数组的 union AST 节点。
     * @throws 分支为空或包含 optional property 时抛出异常。
     */
    readonly union: {
        <const Branches extends readonly [Contract<unknown>, ...Contract<unknown>[]]>(
            branches: Branches,
        ): UnionContract<Branches>;
        <const First extends Contract<unknown>, const Rest extends readonly Contract<unknown>[]>(
            first: First,
            ...rest: Rest
        ): UnionContract<readonly [First, ...Rest]>;
    };
    /**
     * 创建按 literal discriminator 选择唯一 strict object 分支的 union。
     *
     * @param discriminator - 用于选择分支的 object 字段名。
     * @param branches - 带唯一 literal discriminator 字段的 strict object 分支数组或映射。
     * @returns 保存稳定声明顺序分支的 discriminated union AST 节点。
     * @throws 分支为空、不是 strict object、缺少 literal tag 或 tag 重复时抛出异常。
     */
    readonly discriminatedUnion: {
        <const Discriminator extends string, const Branches extends DiscriminatedBranchList<Discriminator>>(
            discriminator: Discriminator,
            branches: Branches,
        ): DiscriminatedUnionContract<Discriminator, Branches>;
        <const Discriminator extends string, const BranchMap extends DiscriminatedBranchMap<Discriminator>>(
            discriminator: Discriminator,
            branches: BranchMap,
        ): DiscriminatedUnionContract<
            Discriminator,
            readonly [BranchMap[keyof BranchMap], ...BranchMap[keyof BranchMap][]]
        >;
    };
    /**
     * 创建使用命名 self 引用的递归 Contract。
     *
     * @param name - 用作递归引用身份的非空 ASCII 标识符。
     * @param define - 接收轻量 self 节点并返回递归 body 的声明函数；函数本身不会进入 AST。
     * @returns 保存 name、body 和轻量递归引用的不可变 AST 节点。
     * @throws name、define 或 define 返回值无效时抛出异常。
     */
    readonly recursive: <const Name extends string, Body extends Contract<unknown>>(
        name: Name,
        define: (self: RecursiveSelfContract<Name>) => Body,
    ) => RecursiveContract<Name, Body>;
}

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

/** 运行时品牌；不通过公共入口导出。 */
const contractBrand = Symbol("lazygoal.contract");

/** optional 节点的运行时品牌；不通过公共入口导出。 */
const optionalBrand = Symbol("lazygoal.optionalProperty");

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isContract(value: unknown): value is Contract<unknown> {
    return isObjectRecord(value)
        && (value as Record<PropertyKey, unknown>)[contractBrand] === true;
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
        if (
            isObjectRecord(property)
            && (property as Record<PropertyKey, unknown>)[optionalBrand] === true
        ) {
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

    const self = freezeContractNode({
        kind: "recursiveRef",
        name,
    }) as RecursiveSelfContract<Name>;
    const body = define(self);
    assertContract(body, "recursive body");
    return freezeContractNode({ kind: "recursive", name, body }) as RecursiveContract<Name, Body>;
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

/** 递归替换只读 JSON 输出中的 self marker。 */
type ReplaceRecursive<Value, Marker, Body extends Contract<unknown>> =
    [Value] extends [Marker]
        ? ReplaceRecursive<InferContract<Body>, Marker, Body>
        : Value extends readonly (infer Item)[]
            ? readonly ReplaceRecursive<Item, Marker, Body>[]
            : Value extends object
                ? { readonly [Key in keyof Value]: ReplaceRecursive<Value[Key], Marker, Body> }
                : Value;

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
