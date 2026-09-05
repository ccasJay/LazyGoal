import { compileJsonSchema, type JsonSchema202012, type JsonSchemaValue } from "../json-schema";
import { isContractNode } from "../internal";
import type { Contract } from "../types";
import { ModelOutputContractDefinitionError } from "./errors";

/**
 * Shape Guide 的固定英文说明前缀。
 */
export const SHAPE_GUIDE_PREFIX = "Respond with a JSON object conforming to the following schema:";

/**
 * OpenAI 与 Gemini 原生结构化输出共同允许的顶层及嵌套关键字集合。
 */
const ALLOWED_SCHEMA_KEYWORDS = new Set([
    "type",
    "properties",
    "required",
    "additionalProperties",
    "items",
    "minItems",
    "maxItems",
    "minimum",
    "maximum",
    "enum",
    "anyOf",
]);

/**
 * 递归验证 JSON Schema 节点落在 OpenAI 与 Gemini 的共用可移植子集内。
 */
function assertPortableSchemaNode(
    node: unknown,
    path: readonly (string | number)[],
    isRoot: boolean,
): void {
    if (typeof node !== "object" || node === null || Array.isArray(node)) {
        throw new ModelOutputContractDefinitionError(
            `Schema node at ${path.join(".")} must be an object`,
            path,
        );
    }

    const obj = node as Record<string, unknown>;

    // 检查是否有未被支持的关键字（例如 pattern, minLength, maxLength, $defs, $ref, const, oneOf 等）
    for (const key of Object.keys(obj)) {
        if (!ALLOWED_SCHEMA_KEYWORDS.has(key)) {
            throw new ModelOutputContractDefinitionError(
                `Unsupported or non-portable JSON Schema keyword "${key}" for model output contracts`,
                [...path, key],
            );
        }
    }

    // 根节点必须是 object
    if (isRoot) {
        if (obj.type !== "object") {
            throw new ModelOutputContractDefinitionError(
                "Root schema must have type: 'object'",
                path,
            );
        }
    }

    // 处理 object 类型节点
    if (obj.type === "object") {
        if (obj.additionalProperties !== false) {
            throw new ModelOutputContractDefinitionError(
                "Object schemas must specify additionalProperties: false",
                [...path, "additionalProperties"],
            );
        }
        if (typeof obj.properties !== "object" || obj.properties === null || Array.isArray(obj.properties)) {
            throw new ModelOutputContractDefinitionError(
                "Object schema must declare properties object",
                [...path, "properties"],
            );
        }
        const props = obj.properties as Record<string, unknown>;
        const propKeys = Object.keys(props);

        if (!Array.isArray(obj.required)) {
            if (propKeys.length === 0) {
                obj.required = [];
            } else {
                throw new ModelOutputContractDefinitionError(
                    "Object schema must declare required array",
                    [...path, "required"],
                );
            }
        }
        const requiredSet = new Set(obj.required as readonly string[]);
        for (const propKey of propKeys) {
            if (!requiredSet.has(propKey)) {
                throw new ModelOutputContractDefinitionError(
                    `Every object property in wire schema must be listed in required; property "${propKey}" is missing from required`,
                    [...path, "required"],
                );
            }
        }

        // 递归检查每个 property
        for (const propKey of propKeys) {
            assertPortableSchemaNode(props[propKey], [...path, "properties", propKey], false);
        }
    }

    // 处理 array 类型节点
    if (obj.type === "array") {
        if (!obj.items || typeof obj.items !== "object" || Array.isArray(obj.items)) {
            throw new ModelOutputContractDefinitionError(
                "Array schema must specify a single items object schema",
                [...path, "items"],
            );
        }
        assertPortableSchemaNode(obj.items, [...path, "items"], false);
    }

    // 处理 anyOf 联合节点
    if ("anyOf" in obj) {
        if (!Array.isArray(obj.anyOf) || obj.anyOf.length === 0) {
            throw new ModelOutputContractDefinitionError(
                "anyOf must be a non-empty array",
                [...path, "anyOf"],
            );
        }
        for (let i = 0; i < obj.anyOf.length; i++) {
            assertPortableSchemaNode(obj.anyOf[i], [...path, "anyOf", i], false);
        }
    }

    // 处理 enum 节点
    if ("enum" in obj) {
        if (!Array.isArray(obj.enum) || obj.enum.length === 0) {
            throw new ModelOutputContractDefinitionError(
                "enum must be a non-empty array",
                [...path, "enum"],
            );
        }
    }
}

/**
 * 编译 Wire Contract 并严格校验其落在 OpenAI 与 Gemini 共同支持的可移植结构子集内。
 *
 * @remarks
 * 统一剥离根节点的 `$schema` 标识，并严格校验：
 * 1. 根必须是 object，且联合只位于 result 或更深层；
 * 2. 所有 object 必须声明 `additionalProperties: false` 且所有属性必须列入 `required`；
 * 3. 联合必须统一使用 `anyOf`，单值使用单元素 `enum`；
 * 4. 严禁出现开放 record、递归（`$defs`/`$ref`）、字符串正则与长度约束等 Provider 不兼容特性。
 *
 * @param wireContract - 顶层带 result envelope 的 Wire Contract。
 * @returns 确定性且只读的 JSON Schema 2020-12 独立数据对象。
 * @throws 存在不兼容或不可移植定义时抛出 `ModelOutputContractDefinitionError`。
 *
 * @example
 * ```ts
 * const schema = compileModelOutputSchema(wireContract);
 * ```
 */
export function compileModelOutputSchema<C extends Contract<unknown>>(
    wireContract: C,
): JsonSchema202012 {
    const rawSchema = compileJsonSchema(wireContract);
    const { $schema, ...cleanSchema } = rawSchema as Record<string, JsonSchemaValue>;

    const isolatedCopy = JSON.parse(JSON.stringify(cleanSchema)) as Record<string, JsonSchemaValue>;
    assertPortableSchemaNode(isolatedCopy, [], true);

    return Object.freeze(isolatedCopy);
}

/**
 * 根据共用 JSON Schema 构建用于 Prompt-only 模式的确定性紧凑结构指引。
 *
 * @remarks
 * 以一行固定的英文说明作为前缀，拼接无空白缩进的 minified JSON Schema；
 * 相同 Schema 输入保证生成逐字一致的输出，避免与本地校验器产生语义漂移。
 *
 * @param jsonSchema - 已通过共用可移植子集检查的 JSON Schema。
 * @returns 确定性的 Shape Guide 字符串。
 *
 * @example
 * ```ts
 * const guide = buildShapeGuide(bundle.jsonSchema);
 * ```
 */
export function buildShapeGuide(jsonSchema: JsonSchema202012): string {
    return `${SHAPE_GUIDE_PREFIX}\n${JSON.stringify(jsonSchema)}`;
}
