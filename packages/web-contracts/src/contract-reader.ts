import { isJsonValue } from "./invariants/json-value";
import type { BrowserJsonValue } from "./session-input";

const MAX_UNKNOWN_PATHS = 32;
const MAX_PATH_LENGTH = 160;

/**
 * 共享 JSON 边界读取器支持的 Schema 节点。
 *
 * @remarks
 * 只描述未知字段遍历所需的结构；生成器在构建期拒绝该子集之外的结构。
 *
 * @example
 * ```ts
 * const node: ContractSchemaNode = { type: "object", properties: {} };
 * ```
 */
export interface ContractSchemaNode {
    readonly $ref?: string;
    readonly definitions?: Readonly<Record<string, ContractSchemaNode>>;
    readonly properties?: Readonly<Record<string, ContractSchemaNode>>;
    readonly items?: ContractSchemaNode;
}

/**
 * 契约边界读取结果中的未知字段诊断。
 *
 * @remarks
 * 仅包含契约身份、版本及有界 JSON Pointer 路径，不包含字段值或原始响应。
 *
 * @example
 * ```ts
 * const diagnostic: ContractUnknownFieldDiagnostic = {
 *     contractId: "web.providers.models.success", version: 1, paths: ["/models/0/debug"], truncated: false,
 * };
 * ```
 */
export interface ContractUnknownFieldDiagnostic {
    readonly contractId: string;
    readonly version: number;
    readonly paths: readonly string[];
    readonly truncated: boolean;
}

/**
 * 契约边界读取结果。
 *
 * @remarks
 * 成功时 `data` 是与输入隔离并已去除额外字段的对象；结构或已知字段错误时只返回失败标记。
 *
 * @example
 * ```ts
 * const result: ContractReadResult<{ ok: true }> = readContractValue(value, binding);
 * ```
 */
export type ContractReadResult<T> =
    | {
        readonly ok: true;
        readonly data: T;
        readonly diagnostic?: ContractUnknownFieldDiagnostic;
    }
    | { readonly ok: false };

/**
 * 单份已生成契约的运行时绑定。
 *
 * @remarks
 * 生成器为每个启用契约提供 Schema、校验器及身份；共享读取器不推断契约字段。
 *
 * @example
 * ```ts
 * const binding: ContractReadBinding<{ ok: true }> = {
 *     contractId: "web.providers.models.success", version: 1,
 *     schema: { type: "object", properties: {} }, validate: () => true,
 * };
 * ```
 */
export interface ContractReadBinding<T> {
    readonly contractId: string;
    readonly version: number;
    readonly schema: ContractSchemaNode;
    readonly validate: (value: unknown) => boolean;
}

/**
 * 在 JSON wire 边界复制、校验并剥离契约未声明字段。
 *
 * @remarks
 * 输入必须是 JSON 数据。未知字段会从独立副本移除并以有界路径报告；已知字段类型错误时
 * 整个响应失败，不转换值、不补默认值，且不会修改调用方输入。
 *
 * @param value - 尚未信任的 API JSON 响应。
 * @param binding - 生成器提供的契约身份、Schema 与校验器。
 * @returns 提取后的成功数据和可选诊断，或不含部分数据的失败结果。
 *
 * @example
 * ```ts
 * const result = readContractValue(value, binding);
 * if (result.ok) render(result.data);
 * ```
 */
export function readContractValue<T>(value: unknown, binding: ContractReadBinding<T>): ContractReadResult<T> {
    let copied: BrowserJsonValue;
    try {
        if (!hasJsonPropertyShape(value) || !isJsonValue(value)) return { ok: false };
        copied = JSON.parse(JSON.stringify(value)) as BrowserJsonValue;
    } catch {
        return { ok: false };
    }

    const unknown = findUnknownPaths(copied, binding.schema);
    if (!binding.validate(copied)) return { ok: false };

    return {
        ok: true,
        data: copied as unknown as T,
        ...(unknown.paths.length === 0 ? {} : {
            diagnostic: {
                contractId: binding.contractId,
                version: binding.version,
                paths: unknown.paths,
                truncated: unknown.truncated,
            },
        }),
    };
}

function hasJsonPropertyShape(value: unknown): boolean {
    const pending: unknown[] = [value];
    const visited = new WeakSet<object>();

    while (pending.length > 0) {
        const current = pending.pop();
        if (current === null || typeof current !== "object" || visited.has(current)) continue;
        visited.add(current);
        const prototype = Object.getPrototypeOf(current);
        if (Array.isArray(current) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
            return false;
        }

        for (const key of Reflect.ownKeys(current)) {
            if (Array.isArray(current) && key === "length") continue;
            if (typeof key !== "string") return false;
            if (Array.isArray(current) && !isArrayIndex(key)) return false;
            const descriptor = Object.getOwnPropertyDescriptor(current, key);
            if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return false;
            pending.push(descriptor.value);
        }
    }

    return true;
}

function isArrayIndex(key: string): boolean {
    const index = Number(key);
    return Number.isInteger(index) && index >= 0 && index < 0xffff_ffff && String(index) === key;
}

function findUnknownPaths(value: BrowserJsonValue, rootSchema: ContractSchemaNode): {
    readonly paths: string[];
    readonly truncated: boolean;
} {
    const pending: Array<{ readonly value: BrowserJsonValue; readonly schema: ContractSchemaNode; readonly path: string }> = [
        { value, schema: rootSchema, path: "" },
    ];
    const paths: string[] = [];
    let truncated = false;

    while (pending.length > 0 && !truncated) {
        const current = pending.pop()!;
        const schema = resolveSchema(current.schema, rootSchema);
        if (Array.isArray(current.value) && schema.items !== undefined) {
            for (let index = current.value.length - 1; index >= 0; index -= 1) {
                pending.push({
                    value: current.value[index]!,
                    schema: schema.items,
                    path: `${current.path}/${index}`,
                });
            }
            continue;
        }
        if (current.value === null || Array.isArray(current.value) || typeof current.value !== "object") continue;

        const record = current.value as Readonly<Record<string, BrowserJsonValue>>;
        const properties = schema.properties ?? {};
        for (const key of Object.keys(record)) {
            const path = `${current.path}/${escapePointerSegment(key)}`;
            if (!Object.prototype.hasOwnProperty.call(properties, key)) {
                if (paths.length >= MAX_UNKNOWN_PATHS) {
                    truncated = true;
                    break;
                }
                if (path.length > MAX_PATH_LENGTH) {
                    paths.push(`${path.slice(0, MAX_PATH_LENGTH - 1)}…`);
                    truncated = true;
                    break;
                }
                paths.push(path);
                continue;
            }
            pending.push({ value: record[key]!, schema: properties[key]!, path });
        }
    }

    return { paths, truncated };
}

function resolveSchema(schema: ContractSchemaNode, root: ContractSchemaNode): ContractSchemaNode {
    if (schema.$ref === undefined) return schema;
    let resolved: unknown = root;
    for (const segment of schema.$ref.replace(/^#\//, "").split("/")) {
        if (resolved === null || typeof resolved !== "object") return {};
        resolved = (resolved as Record<string, unknown>)[segment.replaceAll("~1", "/").replaceAll("~0", "~")];
    }
    return resolved !== null && typeof resolved === "object" ? resolved as ContractSchemaNode : {};
}

function escapePointerSegment(value: string): string {
    return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
