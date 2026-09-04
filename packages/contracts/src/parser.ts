import type {
    ArrayOptions,
    Contract,
    ContractKind,
    InferContract,
    JsonScalar,
    NumberOptions,
    StringOptions,
} from "./types";
import {
    ContractValidationError,
    type ContractIssue,
    type ContractIssueCode,
} from "./errors";

type Path = readonly (string | number)[];
type RuntimeContract = Omit<Contract<unknown>, "kind"> & Readonly<Record<string, unknown>> & {
    readonly kind: ContractKind;
};
type JsonObject = Record<string, unknown>;

const MAX_ISSUES = 50;
const knownContractKinds: readonly ContractKind[] = [
    "string",
    "number",
    "integer",
    "boolean",
    "null",
    "literal",
    "enum",
    "object",
    "optional",
    "nullable",
    "array",
    "record",
    "union",
    "discriminatedUnion",
    "recursive",
    "recursiveRef",
];

/** 收集单次解析中的确定性 issue，并在达到上限后停止继续遍历。 */
class IssueCollector {
    readonly issues: ContractIssue[] = [];
    truncated = false;

    get stopped(): boolean {
        return this.truncated;
    }

    add(code: ContractIssueCode, path: Path, message: string): void {
        if (this.truncated) return;
        this.issues.push(Object.freeze({
            code,
            path: Object.freeze([...path]),
            message,
        }));
        if (this.issues.length >= MAX_ISSUES) {
            this.truncated = true;
        }
    }
}

function isPlainObject(value: unknown): value is JsonObject {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function isJsonInputObject(value: unknown): value is JsonObject {
    return isPlainObject(value) && Reflect.ownKeys(value).every((key) => typeof key === "string");
}

function hasOwn(value: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function setOwn(output: JsonObject, key: string, value: unknown): void {
    Object.defineProperty(output, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
    });
}

function compareCodePointStrings(left: string, right: string): number {
    const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
    const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
    const length = Math.min(leftPoints.length, rightPoints.length);
    for (let index = 0; index < length; index += 1) {
        const leftPoint = leftPoints[index]!;
        const rightPoint = rightPoints[index]!;
        if (leftPoint !== rightPoint) return leftPoint - rightPoint;
    }
    return leftPoints.length - rightPoints.length;
}

function sortedKeys(value: JsonObject): string[] {
    return Object.keys(value).sort(compareCodePointStrings);
}

function readContract(value: unknown): RuntimeContract {
    if (!isPlainObject(value) || typeof value.kind !== "string") {
        throw new TypeError("parser received an invalid Contract node");
    }
    if (!knownContractKinds.includes(value.kind as ContractKind)) {
        throw new TypeError(`parser does not recognize Contract kind ${value.kind}`);
    }
    return value as RuntimeContract;
}

function addTypeIssue(
    collector: IssueCollector,
    path: Path,
    expected: string,
): undefined {
    collector.add("invalid_type", path, `Expected ${expected}`);
    return undefined;
}

function scalarMessage(value: JsonScalar): string {
    return JSON.stringify(value);
}

function parseString(
    node: RuntimeContract,
    input: unknown,
    path: Path,
    collector: IssueCollector,
): string | undefined {
    if (typeof input !== "string") {
        return addTypeIssue(collector, path, "a string");
    }
    const options = node.options as StringOptions | undefined;
    const length = Array.from(input).length;
    if (options?.minLength !== undefined && length < options.minLength) {
        collector.add(
            "string_min_length",
            path,
            `String length must be at least ${options.minLength}`,
        );
        return undefined;
    }
    if (options?.maxLength !== undefined && length > options.maxLength) {
        collector.add(
            "string_max_length",
            path,
            `String length must be at most ${options.maxLength}`,
        );
        return undefined;
    }
    if (options?.pattern !== undefined && !new RegExp(options.pattern, "u").test(input)) {
        collector.add("string_pattern", path, "String does not match pattern");
        return undefined;
    }
    return input;
}

function parseNumber(
    node: RuntimeContract,
    input: unknown,
    path: Path,
    collector: IssueCollector,
): number | undefined {
    if (typeof input !== "number" || !Number.isFinite(input)) {
        return addTypeIssue(collector, path, "a finite number");
    }
    if (node.kind === "integer") {
        if (!Number.isInteger(input)) {
            collector.add("not_integer", path, "Expected a safe integer");
            return undefined;
        }
        if (!Number.isSafeInteger(input)) {
            collector.add("not_safe_integer", path, "Expected a safe integer");
            return undefined;
        }
    }
    const options = node.options as NumberOptions | undefined;
    if (options?.minimum !== undefined && input < options.minimum) {
        collector.add("number_minimum", path, `Number must be at least ${options.minimum}`);
        return undefined;
    }
    if (options?.maximum !== undefined && input > options.maximum) {
        collector.add("number_maximum", path, `Number must be at most ${options.maximum}`);
        return undefined;
    }
    return input;
}

function parseLiteral(
    node: RuntimeContract,
    input: unknown,
    path: Path,
    collector: IssueCollector,
): JsonScalar | undefined {
    const expected = node.value as JsonScalar;
    if (input !== expected) {
        collector.add("invalid_literal", path, `Expected literal ${scalarMessage(expected)}`);
        return undefined;
    }
    return input as JsonScalar;
}

function parseEnum(
    node: RuntimeContract,
    input: unknown,
    path: Path,
    collector: IssueCollector,
): JsonScalar | undefined {
    const values = node.values;
    if (!Array.isArray(values) || !values.some((value) => value === input)) {
        collector.add("invalid_enum_value", path, "Value is not in enum");
        return undefined;
    }
    return input as JsonScalar;
}

function parseObject(
    node: RuntimeContract,
    input: unknown,
    path: Path,
    collector: IssueCollector,
): JsonObject | undefined {
    if (!isJsonInputObject(input)) {
        return addTypeIssue(collector, path, "a JSON object");
    }
    const shape = node.shape;
    if (!isPlainObject(shape)) {
        throw new TypeError("object Contract shape must be an object");
    }

    const output: JsonObject = {};
    const shapeKeys = Object.keys(shape);
    const shapeKeySet = new Set(shapeKeys);
    for (const key of shapeKeys) {
        if (collector.stopped) break;
        const property = shape[key];
        if (!isPlainObject(property)) {
            throw new TypeError(`object field ${key} is not a Contract property`);
        }
        const optional = property.kind === "optional";
        if (!hasOwn(input, key)) {
            if (!optional) {
                collector.add("missing_field", [...path, key], "Required field is missing");
            }
            continue;
        }

        const child = readContract(optional ? property.inner : property);
        const issueCount = collector.issues.length;
        const value = parseNode(child, input[key], [...path, key], collector);
        if (collector.issues.length === issueCount && value !== undefined) {
            setOwn(output, key, value);
        }
    }

    if (!collector.stopped) {
        for (const key of sortedKeys(input)) {
            if (shapeKeySet.has(key)) continue;
            collector.add("extra_field", [...path, key], "Unexpected field");
            if (collector.stopped) break;
        }
    }
    return output;
}

function parseArray(
    node: RuntimeContract,
    input: unknown,
    path: Path,
    collector: IssueCollector,
): readonly unknown[] | undefined {
    if (!Array.isArray(input)) {
        return addTypeIssue(collector, path, "an array");
    }
    const options = node.options as ArrayOptions | undefined;
    if (options?.minItems !== undefined && input.length < options.minItems) {
        collector.add("array_min_items", path, `Array must contain at least ${options.minItems} items`);
    }
    if (options?.maxItems !== undefined && input.length > options.maxItems) {
        collector.add("array_max_items", path, `Array must contain at most ${options.maxItems} items`);
    }

    const items = readContract(node.items);
    const output: unknown[] = [];
    for (let index = 0; index < input.length; index += 1) {
        if (collector.stopped) break;
        const issueCount = collector.issues.length;
        const value = parseNode(items, input[index], [...path, index], collector);
        if (collector.issues.length === issueCount && value !== undefined) {
            output.push(value);
        }
    }
    return output;
}

function parseRecord(
    node: RuntimeContract,
    input: unknown,
    path: Path,
    collector: IssueCollector,
): JsonObject | undefined {
    if (!isJsonInputObject(input)) {
        return addTypeIssue(collector, path, "a JSON object");
    }
    const valueContract = readContract(node.values);
    const output: JsonObject = {};
    for (const key of sortedKeys(input)) {
        if (collector.stopped) break;
        const issueCount = collector.issues.length;
        const value = parseNode(valueContract, input[key], [...path, key], collector);
        if (collector.issues.length === issueCount && value !== undefined) {
            setOwn(output, key, value);
        }
    }
    return output;
}

function parseNode(
    node: RuntimeContract,
    input: unknown,
    path: Path,
    collector: IssueCollector,
): unknown {
    if (collector.stopped) return undefined;
    switch (node.kind) {
        case "string":
            return parseString(node, input, path, collector);
        case "number":
        case "integer":
            return parseNumber(node, input, path, collector);
        case "boolean":
            return typeof input === "boolean"
                ? input
                : addTypeIssue(collector, path, "a boolean");
        case "null":
            return input === null
                ? null
                : addTypeIssue(collector, path, "null");
        case "literal":
            return parseLiteral(node, input, path, collector);
        case "enum":
            return parseEnum(node, input, path, collector);
        case "object":
            return parseObject(node, input, path, collector);
        case "nullable":
            return input === null
                ? null
                : parseNode(readContract(node.inner), input, path, collector);
        case "array":
            return parseArray(node, input, path, collector);
        case "record":
            return parseRecord(node, input, path, collector);
        case "optional":
            throw new TypeError("optional property can only be used in an object shape");
        case "union":
        case "discriminatedUnion":
        case "recursive":
        case "recursiveRef":
            throw new TypeError(`Contract kind ${node.kind} is not supported by the base parser`);
    }
}

/**
 * 解析未知输入并返回成功数据或确定性的校验 issues。
 *
 * @remarks
 * 成功结果中的 array/object 均为新建结构；解析不会修改输入，也不会 trim、coerce 或补默认值。
 * 普通数据错误不会抛出异常；无效 Contract 配置会抛出 `TypeError`。
 *
 * @param contract - 要解释的 Contract AST。
 * @param input - 可能来自 JSON 或外部边界的未知值。
 * @returns 成功时返回深复制数据，失败时返回按路径和遍历顺序排列的 issues。
 * @throws Contract 节点结构无效或当前基础 parser 尚不支持该节点种类时抛出 `TypeError`。
 *
 * @example
 * ```ts
 * const result = safeParse(contract.object({ name: contract.string() }), { name: "Ada" });
 * if (result.success) console.log(result.data.name);
 * ```
 */
export function safeParse<C extends Contract<unknown>>(
    contract: C,
    input: unknown,
): SafeParseResult<InferContract<C>> {
    const collector = new IssueCollector();
    const data = parseNode(readContract(contract), input, [], collector);
    if (collector.issues.length > 0) {
        return {
            success: false,
            issues: Object.freeze([...collector.issues]),
            truncated: collector.truncated,
        };
    }
    return {
        success: true,
        data: data as InferContract<C>,
    };
}

/**
 * 解析未知输入，成功时直接返回隔离数据，失败时抛出校验错误。
 *
 * @param contract - 要解释的 Contract AST。
 * @param input - 可能来自 JSON 或外部边界的未知值。
 * @returns 与 Contract 输出类型一致的深复制数据。
 * @throws `ContractValidationError` 表示普通输入错误；Contract 配置无效或基础 parser
 * 不支持该节点种类时抛出 `TypeError`。
 *
 * @example
 * ```ts
 * const user = parse(contract.object({ name: contract.string() }), { name: "Ada" });
 * ```
 */
export function parse<C extends Contract<unknown>>(
    contract: C,
    input: unknown,
): InferContract<C> {
    const result = safeParse(contract, input);
    if (!result.success) {
        throw new ContractValidationError(result.issues, result.truncated);
    }
    return result.data;
}

/** 解析 API 的成功或失败结果。 */
export type SafeParseResult<Output> =
    | {
        readonly success: true;
        readonly data: Output;
    }
    | {
        readonly success: false;
        readonly issues: readonly ContractIssue[];
        readonly truncated: boolean;
    };
