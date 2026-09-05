import type {
    ArrayOptions,
    Contract,
    ContractKind,
    JsonScalar,
    NumberOptions,
    StringOptions,
} from "./types";
import { assertValidContract } from "./definition";
import { isOptionalPropertyNode } from "./internal";

/** JSON Schema 输出中允许的 JSON-compatible 值。 */
export type JsonSchemaValue =
    | JsonScalar
    | readonly JsonSchemaValue[]
    | { readonly [key: string]: JsonSchemaValue };

/**
 * `compileJsonSchema` 生成的 JSON Schema 2020-12 根对象。
 *
 * @remarks
 * 该类型只描述 JSON-compatible 的只读视图；每次编译都会创建独立的对象和数组，不会
 * 与 Contract AST 或其它编译结果共享可变引用。
 *
 * @example
 * ```ts
 * const schema: JsonSchema202012 = compileJsonSchema(contract.string());
 * ```
 */
export type JsonSchema202012 = Readonly<Record<string, JsonSchemaValue>>;

type SchemaObject = Record<string, JsonSchemaValue>;
type RuntimeContract = Omit<Contract<unknown>, "kind"> & Readonly<Record<PropertyKey, unknown>> & {
    readonly kind: ContractKind;
};

const JSON_SCHEMA_2020_12 = "https://json-schema.org/draft/2020-12/schema";

function setOwn(output: SchemaObject, key: string, value: JsonSchemaValue): void {
    Object.defineProperty(output, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
    });
}

function asRuntimeContract(value: unknown): RuntimeContract {
    return value as RuntimeContract;
}

function readShape(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new TypeError("object Contract shape must be an object");
    }
    return value as Record<string, unknown>;
}

function readBranches(value: unknown, label: string): readonly RuntimeContract[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new TypeError(`${label} must be a non-empty array`);
    }
    return value.map(asRuntimeContract);
}

function createReference(name: string): SchemaObject {
    const schema: SchemaObject = {};
    setOwn(schema, "$ref", `#/$defs/${name}`);
    return schema;
}

class SchemaCompiler {
    private readonly definitions = new Map<string, JsonSchemaValue | undefined>();

    compileNode(node: RuntimeContract): SchemaObject {
        switch (node.kind) {
            case "string":
                return this.compileString(node);
            case "number":
            case "integer":
                return this.compileNumber(node);
            case "boolean":
                return this.typeSchema("boolean");
            case "null":
                return this.typeSchema("null");
            case "literal": {
                const schema: SchemaObject = {};
                setOwn(schema, "const", node.value as JsonScalar);
                return schema;
            }
            case "enum": {
                const schema: SchemaObject = {};
                const values = node.values;
                if (!Array.isArray(values)) {
                    throw new TypeError("enum Contract values must be an array");
                }
                setOwn(schema, "enum", [...values] as JsonScalar[]);
                return schema;
            }
            case "object":
                return this.compileObject(node);
            case "nullable": {
                const schema: SchemaObject = {};
                setOwn(schema, "anyOf", [
                    this.compileNode(asRuntimeContract(node.inner)),
                    this.typeSchema("null"),
                ]);
                return schema;
            }
            case "array":
                return this.compileArray(node);
            case "record": {
                const schema: SchemaObject = {};
                setOwn(schema, "type", "object");
                setOwn(schema, "additionalProperties", this.compileNode(asRuntimeContract(node.values)));
                return schema;
            }
            case "union": {
                const schema: SchemaObject = {};
                const branches = readBranches(node.branches, "union branches");
                setOwn(schema, "anyOf", branches.map((branch) => this.compileNode(branch)));
                return schema;
            }
            case "discriminatedUnion": {
                const schema: SchemaObject = {};
                const branches = readBranches(
                    node.branches,
                    "discriminated union branches",
                );
                setOwn(schema, "oneOf", branches.map((branch) => this.compileNode(branch)));
                return schema;
            }
            case "recursive": {
                const name = node.name as string;
                if (this.definitions.has(name)) return createReference(name);
                this.definitions.set(name, undefined);
                const body = this.compileNode(asRuntimeContract(node.body));
                this.definitions.set(name, body);
                return createReference(name);
            }
            case "recursiveRef":
                return createReference(node.name as string);
            case "optional":
                throw new TypeError("optional property can only be used in an object shape");
        }
    }

    compileDefinitions(): SchemaObject | undefined {
        if (this.definitions.size === 0) return undefined;
        const definitions: SchemaObject = {};
        for (const [name, schema] of this.definitions) {
            if (schema === undefined) {
                throw new TypeError(`recursive definition ${name} was not compiled`);
            }
            setOwn(definitions, name, schema);
        }
        return definitions;
    }

    private typeSchema(type: string): SchemaObject {
        const schema: SchemaObject = {};
        setOwn(schema, "type", type);
        return schema;
    }

    private compileString(node: RuntimeContract): SchemaObject {
        const schema: SchemaObject = {};
        setOwn(schema, "type", "string");
        const options = node.options as StringOptions | undefined;
        if (options?.minLength !== undefined) setOwn(schema, "minLength", options.minLength);
        if (options?.maxLength !== undefined) setOwn(schema, "maxLength", options.maxLength);
        if (options?.pattern !== undefined) setOwn(schema, "pattern", options.pattern);
        return schema;
    }

    private compileNumber(node: RuntimeContract): SchemaObject {
        const schema: SchemaObject = {};
        setOwn(schema, "type", node.kind === "integer" ? "integer" : "number");
        const options = node.options as NumberOptions | undefined;
        if (node.kind === "integer") {
            setOwn(
                schema,
                "minimum",
                Math.max(Number.MIN_SAFE_INTEGER, options?.minimum ?? Number.MIN_SAFE_INTEGER),
            );
            setOwn(
                schema,
                "maximum",
                Math.min(Number.MAX_SAFE_INTEGER, options?.maximum ?? Number.MAX_SAFE_INTEGER),
            );
            return schema;
        }
        if (options?.minimum !== undefined) setOwn(schema, "minimum", options.minimum);
        if (options?.maximum !== undefined) setOwn(schema, "maximum", options.maximum);
        return schema;
    }

    private compileObject(node: RuntimeContract): SchemaObject {
        const shape = readShape(node.shape);
        const properties: SchemaObject = {};
        const required: string[] = [];
        for (const key of Object.keys(shape)) {
            const property = shape[key];
            const propertyNode = isOptionalPropertyNode(property)
                ? property.inner
                : property;
            setOwn(properties, key, this.compileNode(asRuntimeContract(propertyNode)));
            if (!isOptionalPropertyNode(property)) required.push(key);
        }

        const schema: SchemaObject = {};
        setOwn(schema, "type", "object");
        setOwn(schema, "properties", properties);
        if (required.length > 0) setOwn(schema, "required", required);
        setOwn(schema, "additionalProperties", false);
        return schema;
    }

    private compileArray(node: RuntimeContract): SchemaObject {
        const schema: SchemaObject = {};
        setOwn(schema, "type", "array");
        setOwn(schema, "items", this.compileNode(asRuntimeContract(node.items)));
        const options = node.options as ArrayOptions | undefined;
        if (options?.minItems !== undefined) setOwn(schema, "minItems", options.minItems);
        if (options?.maxItems !== undefined) setOwn(schema, "maxItems", options.maxItems);
        return schema;
    }
}

/**
 * 将 Contract AST 编译为确定性的 JSON Schema 2020-12 数据。
 *
 * @remarks
 * 编译前会检查完整 Contract 图。根对象首先写入 `$schema`，递归定义统一收集到末尾的
 * `$defs`；字段、required、分支和定义均按 AST 的稳定遍历顺序生成。返回值只读类型视图
 * 对应一个每次独立创建的 JSON 数据对象，修改一次返回值不会影响后续编译。
 *
 * @param contract - 通过公开 builder 创建的 Contract AST。
 * @returns 可传递给 JSON Schema 2020-12 工具链的独立 Schema 数据。
 * @throws `ContractDefinitionError` 表示 Contract AST 无效或递归声明非法。
 *
 * @example
 * ```ts
 * const schema = compileJsonSchema(contract.object({ name: contract.string() }));
 * ```
 */
export function compileJsonSchema<C extends Contract<unknown>>(
    contract: C,
): JsonSchema202012 {
    assertValidContract(contract);
    const compiler = new SchemaCompiler();
    const root = compiler.compileNode(asRuntimeContract(contract));
    const schema: SchemaObject = {};
    setOwn(schema, "$schema", JSON_SCHEMA_2020_12);
    for (const key of Object.keys(root)) {
        setOwn(schema, key, root[key]!);
    }
    const definitions = compiler.compileDefinitions();
    if (definitions !== undefined) setOwn(schema, "$defs", definitions);
    return schema;
}
