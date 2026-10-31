import type { JsonSchema202012 } from "../../../contracts/src/index";
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
 * 校验已生成的 Wire Schema 是否落在 OpenAI 与 Gemini 共用的可移植子集内。
 *
 * @remarks
 * 输入必须是已经完成 wire 归一化的独立 JSON Schema 对象；本函数会深复制并冻结结果，
 * 不修改调用方对象。开放对象、递归引用、字符串长度/正则约束与 `const` 等不可移植
 * 关键字都会在此失败，调用方应在模型请求构造前处理。
 *
 * @param schema - 待校验的 JSON Schema 根对象。
 * @returns 深复制并冻结的可移植 Schema。
 * @throws 根不是对象或包含不可移植结构时抛出 `ModelOutputContractDefinitionError`。
 *
 * @example
 * ```ts
 * const portable = assertPortableModelSchema(binding.modelProjection().schema);
 * ```
 */
export function assertPortableModelSchema(schema: Readonly<Record<string, unknown>>): JsonSchema202012 {
    const isolatedCopy = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
    assertPortableSchemaNode(isolatedCopy, [], true);
    return Object.freeze(isolatedCopy) as JsonSchema202012;
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
