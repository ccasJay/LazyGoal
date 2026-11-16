import type { JsonSchema202012 } from "../../contracts/src/index";

/** Google strict 输出中表达 null 的哨兵值。 */
export const GEMINI_NULL_SENTINEL = "__lazygoal_null__";

/** Google strict 输出中表达省略字段的哨兵值。 */
export const GEMINI_ABSENT_SENTINEL = "__lazygoal_absent__";

/** Gemini Schema 声明的受支持类型字面量。 */
const GEMINI_TYPES = new Set(["STRING", "NUMBER", "INTEGER", "BOOLEAN", "ARRAY", "OBJECT", "NULL", "TYPE_UNSPECIFIED"]);

/**
 * 投影为 Gemini 支持的结构约束；请求体序列化前的唯一变换点。
 *
 * @remarks
 * 枚举补齐类型，nullable 补齐部署侧省略的 null 分支，对象联合投影为字段并集与必填交集。
 * 联合分支约束和 `additionalProperties` 仍由 Agent 本地契约严格校验。
 *
 * @param schema - 本地契约的 JSON Schema。
 * @param path - 递归定位；只用于 `properties.result` 等特化投影。
 * @returns Gemini `responseSchema`/`parameters` 可用的投影 Schema。
 * @throws Error 不支持的枚举值域时抛出。
 *
 * @example
 * ```ts
 * const projected = prepareGeminiSchema(bundle.jsonSchema, ["properties", "result"]);
 * ```
 */
export function prepareGeminiSchema(
    schema: JsonSchema202012,
    path: readonly string[] = [],
): JsonSchema202012 {
    const result = { ...schema };
    if (Array.isArray(schema.enum)) {
        const values = schema.enum;
        if (values.every(value => typeof value === "string")) {
            result.type = "string";
        } else if (values.every(value => typeof value === "number")) {
            // 数值 literal 保持数值语义，不转成字符串枚举。
            const branches = values.map(value => ({
                type: Number.isInteger(value) ? "integer" : "number",
                minimum: value, maximum: value,
            }));
            delete result.enum;
            if (branches.length === 1) Object.assign(result, branches[0]);
            else result.anyOf = branches;
        } else {
            throw new Error("Gemini responseSchema only supports string or numeric enums");
        }
    }
    if (schema.properties !== undefined) {
        result.properties = Object.fromEntries(Object.entries(schema.properties as Record<string, JsonSchema202012>).map(([key, value]) =>
            [key, prepareGeminiSchema(value as JsonSchema202012, [...path, "properties", key])]));
    }
    if (schema.items !== undefined) {
        result.items = prepareGeminiSchema(schema.items as JsonSchema202012, [...path, "items"]);
    }
    if (Array.isArray(schema.anyOf)) {
        delete result.anyOf;
        Object.assign(result, mergeGeminiUnion(
            schema.anyOf.map(value => prepareGeminiSchema(value as JsonSchema202012, path)),
            path,
        ));
    }
    return result;
}

/**
 * 把本地契约的 JSON Schema 序列化为 Gemini 线格式的 Schema 对象。
 *
 * @remarks
 * 语义与被移除的 SDK 内部变换一致：`type` 大写为 Google 词表，`type: null` 单独出现
 * 直接拒绝，双分支 `anyOf` 中的 null 分支折叠为 `nullable: true`，类型数组折叠为
 * `anyOf`，`additionalProperties` 不上线。其余字段原样保留。
 *
 * @param schema - 已投影的 JSON Schema。
 * @returns 请求体内嵌的 Gemini Schema。
 * @throws Error Schema 的唯一类型为 null 时抛出。
 *
 * @example
 * ```ts
 * const wire = toGeminiWireSchema(prepareGeminiSchema(bundle.jsonSchema));
 * ```
 */
export function toGeminiWireSchema(schema: unknown): Record<string, unknown> {
    return processWireSchema(schema as Record<string, unknown>);
}

function processWireSchema(jsonSchema: Record<string, unknown>): Record<string, unknown> {
    const wireSchema: Record<string, unknown> = {};
    let current = jsonSchema;
    const incomingAnyOf = current.anyOf;
    if (Array.isArray(incomingAnyOf) && incomingAnyOf.length === 2) {
        if ((incomingAnyOf[0] as Record<string, unknown> | undefined)?.type === "null") {
            wireSchema.nullable = true;
            current = incomingAnyOf[1] as Record<string, unknown>;
        } else if ((incomingAnyOf[1] as Record<string, unknown> | undefined)?.type === "null") {
            wireSchema.nullable = true;
            current = incomingAnyOf[0] as Record<string, unknown>;
        }
    }
    for (const [fieldName, fieldValue] of Object.entries(current)) {
        if (fieldValue === undefined || fieldValue === null) continue;
        if (fieldName === "type") {
            if (typeof fieldValue !== "string") continue;
            if (fieldValue === "null") {
                throw new Error("type: null can not be the only possible type for the field.");
            }
            const upper = fieldValue.toUpperCase();
            wireSchema.type = GEMINI_TYPES.has(upper) && upper !== "NULL" ? upper : "TYPE_UNSPECIFIED";
        } else if (fieldName === "items") {
            wireSchema.items = processWireSchema(fieldValue as Record<string, unknown>);
        } else if (fieldName === "anyOf") {
            const branches: Record<string, unknown>[] = [];
            for (const item of fieldValue as readonly Record<string, unknown>[]) {
                if (item.type === "null") {
                    wireSchema.nullable = true;
                    continue;
                }
                branches.push(processWireSchema(item));
            }
            wireSchema.anyOf = branches;
        } else if (fieldName === "properties") {
            const projected: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(fieldValue as Record<string, unknown>)) {
                projected[key] = processWireSchema(value as Record<string, unknown>);
            }
            wireSchema.properties = projected;
        } else {
            if (fieldName === "additionalProperties") continue;
            wireSchema[fieldName] = fieldValue;
        }
    }
    return wireSchema;
}

/**
 * 将 Google provider projection 的省略字段和占位值逆向归一为 Wire 结构。
 *
 * @remarks
 * 原样迁入：联合分支还原、哨兵还原与紧凑 completion evidence 恢复保持既有行为，
 * 不新增或删除任何规则。
 *
 * @param content - 模型返回的正文文本。
 * @param schema - 请求使用的原始（未投影）显示 Schema。
 * @returns 逆向归一后的 JSON 文本；不可解析时原样返回。
 *
 * @example
 * ```ts
 * const text = restoreGeminiResponseProjection(rawText, request.structuredOutput.schema);
 * ```
 */
export function restoreGeminiResponseProjection(content: string, schema: JsonSchema202012): string {
    let value: unknown;
    try {
        value = JSON.parse(content);
    } catch {
        return content;
    }

    if (isRecord(value) && isRecord(value.result)) {
        const result = value.result;

        // 1. 若具有有效的 action 对象，确认为 tool_call；否则按摘要恢复 complete。
        // 2. 依据同源生成分支 Schema 删除跨分支字段，不再维护 kind 字段表。
        if (isRecord(result.action)) {
            result.kind = "tool_call";
            delete result.type;
        } else if (result.action === null || result.action === undefined) {
            delete result.action;
            if (result.kind === "tool_call" && typeof result.summary === "string") {
                result.kind = "complete";
            }
        }
        const branch = selectResponseBranch(schema, result);
        if (branch !== undefined) stripCrossBranchFields(result, branch);
    }

    restoreGeminiProjectedValue(value, schema);
    return JSON.stringify(value);
}

/** 从显示 Schema 中按判别值和工具身份选择当前响应分支。 */
function selectResponseBranch(
    schema: JsonSchema202012,
    result: Record<string, unknown>,
): JsonSchema202012 | undefined {
    const resultSchema = isRecord(schema.properties)
        ? schema.properties.result as JsonSchema202012 | undefined
        : undefined;
    if (resultSchema === undefined) return undefined;
    if (!Array.isArray(resultSchema.anyOf)) return resultSchema;

    const kind = typeof result.kind === "string" ? result.kind : undefined;
    const action = isRecord(result.action) ? result.action : undefined;
    const toolId = typeof action?.toolId === "string" ? action.toolId : undefined;
    const branches = resultSchema.anyOf as readonly JsonSchema202012[];
    const sameKind = branches.filter(branch => branchKind(branch) === kind);
    if (sameKind.length <= 1) return sameKind[0];
    if (toolId !== undefined) {
        const matchedTool = sameKind.find(branch => branchToolId(branch) === toolId);
        if (matchedTool !== undefined) return matchedTool;
    }
    return sameKind[0];
}

function branchKind(branch: JsonSchema202012): string | undefined {
    const kind = isRecord(branch.properties)
        ? branch.properties.kind as JsonSchema202012 | undefined
        : undefined;
    return Array.isArray(kind?.enum) && typeof kind.enum[0] === "string" ? kind.enum[0] : undefined;
}

function branchToolId(branch: JsonSchema202012): string | undefined {
    if (!isRecord(branch.properties) || !isRecord(branch.properties.action)) return undefined;
    const properties = branch.properties.action.properties;
    if (!isRecord(properties) || !isRecord(properties.toolId)) return undefined;
    const toolId = properties.toolId as JsonSchema202012;
    return Array.isArray(toolId.enum) && typeof toolId.enum[0] === "string" ? toolId.enum[0] : undefined;
}

function stripCrossBranchFields(
    result: Record<string, unknown>,
    branch: JsonSchema202012,
): void {
    if (!isRecord(branch.properties)) return;
    const allowed = new Set(Object.keys(branch.properties));
    for (const key of Object.keys(result)) {
        if (allowed.has(key)) continue;
        if (key === "completionEvidence"
            && result[key] !== GEMINI_ABSENT_SENTINEL
            && result[key] !== null) continue;
        delete result[key];
    }
}

/** 只沿唯一匹配的 Wire 联合分支恢复 nullable 字段和紧凑 completion evidence。 */
function restoreGeminiProjectedValue(value: unknown, schema: JsonSchema202012): boolean {
    if (Array.isArray(schema.anyOf)) {
        const matches = schema.anyOf.filter(branch => matchesKnownSchemaShape(value, branch as JsonSchema202012));
        return matches.length === 1
            ? restoreGeminiProjectedValue(value, matches[0] as JsonSchema202012)
            : false;
    }
    if (schema.type === "array" && Array.isArray(value) && schema.items !== undefined) {
        return value.reduce((changed, item) =>
            restoreGeminiProjectedValue(item, schema.items as JsonSchema202012) || changed, false);
    }
    if (schema.type !== "object" || !isRecord(value) || schema.properties === undefined) return false;

    const properties = schema.properties as Record<string, JsonSchema202012>;
    const required = new Set(Array.isArray(schema.required) ? schema.required as readonly string[] : []);
    let changed = false;
    for (const key of Object.keys(value)) {
        if (!(key in properties) && key === "completionEvidence" && value[key] === GEMINI_ABSENT_SENTINEL) {
            delete value[key];
            changed = true;
        }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
        if (!(key in value)) {
            if (required.has(key) && schemaAllowsNull(propertySchema)) {
                value[key] = null;
                changed = true;
            }
            continue;
        }
        if (value[key] === GEMINI_NULL_SENTINEL && schemaAllowsNull(propertySchema)) {
            value[key] = null;
            changed = true;
            continue;
        }
        if (key === "completionEvidence" && value[key] === GEMINI_ABSENT_SENTINEL) {
            delete value[key];
            changed = true;
            continue;
        }
        if (key === "completionEvidence" && propertySchema.type === "array" && typeof value[key] === "string") {
            const parsed = parseGeminiCompletionEvidence(value[key]);
            if (parsed !== undefined) {
                value[key] = parsed;
                changed = true;
                continue;
            }
        }
        changed = restoreGeminiProjectedValue(value[key], propertySchema) || changed;
    }
    return changed;
}

/** 用响应中已存在的字段选择联合分支，不把缺失必填字段视为匹配失败。 */
function matchesKnownSchemaShape(value: unknown, schema: JsonSchema202012): boolean {
    if (value === GEMINI_NULL_SENTINEL && schemaAllowsNull(schema)) return true;
    if (schema.nullable === true && value === null) return true;
    if (Array.isArray(schema.anyOf)) {
        return schema.anyOf.some(branch => matchesKnownSchemaShape(value, branch as JsonSchema202012));
    }
    if (Array.isArray(schema.enum) && !schema.enum.some(candidate => Object.is(candidate, value))) return false;
    switch (schema.type) {
        case "null": return value === null;
        case "string": return typeof value === "string";
        case "boolean": return typeof value === "boolean";
        case "integer": return typeof value === "number" && Number.isInteger(value);
        case "number": return typeof value === "number" && Number.isFinite(value);
        case "array":
            return Array.isArray(value) && (schema.items === undefined
                || value.every(item => matchesKnownSchemaShape(item, schema.items as JsonSchema202012)));
        case "object": {
            if (!isRecord(value) || schema.properties === undefined) return false;
            const properties = schema.properties as Record<string, JsonSchema202012>;
            if (schema.additionalProperties === false && Object.keys(value).some(key =>
                !(key in properties) && !(key === "completionEvidence" && value[key] === GEMINI_ABSENT_SENTINEL))) return false;
            return Object.entries(value).every(([key, propertyValue]) =>
                properties[key] === undefined
                    || (key === "completionEvidence"
                        && properties[key]!.type === "array"
                        && (propertyValue === GEMINI_ABSENT_SENTINEL
                            || parseGeminiCompletionEvidence(propertyValue) !== undefined))
                    || matchesKnownSchemaShape(propertyValue, properties[key]!));
        }
        default:
            return true;
    }
}

function parseGeminiCompletionEvidence(
    value: unknown,
): readonly { criterionIndex: number; evidenceSequences: readonly number[] }[] | undefined {
    if (typeof value !== "string" || value.length === 0 || value === GEMINI_ABSENT_SENTINEL) return undefined;

    const seenCriteria = new Set<number>();
    const evidence: { criterionIndex: number; evidenceSequences: readonly number[] }[] = [];
    for (const segment of value.split(";")) {
        const fields = segment.split(":");
        if (fields.length !== 2) return undefined;
        const criterionIndex = parseGeminiSafeInteger(fields[0]!);
        if (criterionIndex === undefined || seenCriteria.has(criterionIndex)) return undefined;

        const sequenceValues = fields[1]!.split(",");
        if (sequenceValues.length === 0 || sequenceValues.some(sequence => sequence.length === 0)) return undefined;
        const evidenceSequences: number[] = [];
        for (const sequence of sequenceValues) {
            const parsed = parseGeminiSafeInteger(sequence);
            if (parsed === undefined) return undefined;
            evidenceSequences.push(parsed);
        }

        seenCriteria.add(criterionIndex);
        evidence.push({ criterionIndex, evidenceSequences });
    }
    return evidence.length === 0 ? undefined : evidence;
}

function parseGeminiSafeInteger(value: string): number | undefined {
    if (!/^(?:0|[1-9][0-9]*)$/.test(value)) return undefined;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function schemaAllowsNull(schema: JsonSchema202012): boolean {
    return schema.type === "null"
        || schema.nullable === true
        || (Array.isArray(schema.anyOf)
            && schema.anyOf.some(branch => schemaAllowsNull(branch as JsonSchema202012)));
}

/** 合并决策判别联合，转换 nullable，并保持内部对象联合的独立分支。 */
function mergeGeminiUnion(
    branches: readonly JsonSchema202012[],
    path: readonly string[],
): JsonSchema202012 {
    const nullable = branches.some(branch => branch.type === "null" || branch.nullable === true);
    const values = [...new Map(branches.filter(branch => branch.type !== "null")
        .map(branch => [JSON.stringify(branch), branch])).values()];
    if (values.length === 0) return { type: "null" };
    const withNullability = (schema: JsonSchema202012): JsonSchema202012 =>
        nullable ? { ...schema, nullable: true } : schema;
    if (values.length === 1) return withNullability(values[0]!);

    if (values.every(branch => branch.type === "object")) {
        const properties = values.map(branch => branch.properties as Record<string, JsonSchema202012>);
        const requiredByBranch = values.map(branch => branch.required as readonly string[]);
        const required = requiredByBranch[0]!.filter(key =>
            requiredByBranch.every(branchRequired => branchRequired.includes(key)));
        const discriminator = required.find(key => properties.every(shape =>
            Array.isArray(shape[key]?.enum) && shape[key]!.enum!.length === 1));
        const mayFlatten = path.join(".") === "properties.result"
            || path.join(".") === "properties.result.properties.action";

        if (mayFlatten && discriminator !== undefined) {
            const keys = [...new Set(properties.flatMap(Object.keys))];
            const discriminatorValues = properties.map(shape =>
                (shape[discriminator]!.enum as readonly unknown[])[0]);
            const description = "Return one selected variant. Branch-specific properties are required only for the discriminator values listed below. "
                + values.map((branch, index) =>
                    `${discriminator}=${JSON.stringify(discriminatorValues[index])}: ${JSON.stringify(branch.required)}`,
                ).join("; ");
            return withNullability({
                type: "object",
                description,
                properties: Object.fromEntries(keys.map(key => {
                    let merged = mergeGeminiUnion(
                        properties.flatMap(shape => shape[key] === undefined ? [] : [shape[key]!]),
                        [...path, "properties", key],
                    );
                    const requiredWhen = [...new Set(values.flatMap((_, index) =>
                        requiredByBranch[index]!.includes(key) ? [discriminatorValues[index]] : []))];
                    if (
                        path.join(".") === "properties.result"
                        && ["summary", "reason", "question", "error"].includes(key)
                        && merged.type === "string"
                    ) {
                        merged = { ...merged, maxLength: "2000" };
                    }
                    if (path.join(".") === "properties.result" && key === "summary") {
                        merged = {
                            ...merged,
                            type: "string",
                            maxLength: "2000",
                            nullable: true,
                            description: 'Required. If kind="complete", provide the task completion summary. For any other kind, return null.',
                        };
                        delete (merged as any).enum;
                    }
                    if (path.join(".") === "properties.result" && key === "action") {
                        merged = {
                            ...merged,
                            nullable: true,
                            description: 'Required. If kind="tool_call", provide the tool action object. For any other kind, return null.',
                        };
                    }
                    if (path.join(".") === "properties.result" && ["reason", "error", "need", "question", "filters"].includes(key)) {
                        merged = {
                            ...merged,
                            nullable: true,
                        };
                    }
                    if (path.join(".") === "properties.result" && key === "kind" && discriminatorValues.includes("tool_call")) {
                        merged = {
                            ...merged,
                            description: "Select exactly one result shape: kind=\"tool_call\" requires action and completionEvidence=\"__lazygoal_absent__\" and forbids summary, reason, and error; kind=\"complete\" requires summary and compact completionEvidence and forbids action; kind=\"wait\" requires reason and completionEvidence=\"__lazygoal_absent__\" and forbids action, summary, and error; kind=\"fail\" requires error and completionEvidence=\"__lazygoal_absent__\" and forbids action, summary, and reason; kind=\"context_lookup\" requires need, question, filters, and completionEvidence=\"__lazygoal_absent__\".",
                        };
                    }
                    if (path.join(".") === "properties.result" && key === "memoryPatch") {
                        merged = {
                            type: "string",
                            enum: [GEMINI_NULL_SENTINEL],
                            nullable: true,
                            description: "Required. Return null. Google strict output does not emit Working Memory updates.",
                        };
                    }
                    if (path.join(".") === "properties.result" && key === "completionEvidence") {
                        merged = {
                            type: "string",
                            description: "For kind=\"complete\", use <criterionIndex>:<sequence>[,<sequence>][;<criterionIndex>:...] (for example, 0:96), with at least one committed observation sequence for every criterion. For every other kind, return __lazygoal_absent__.",
                        };
                    }
                    if (path.join(".") === "properties.result" && key === "completionEvidence") {
                        return [key, merged];
                    }
                    if (requiredWhen.length === 0 || required.includes(key)) return [key, merged];
                    return [key, {
                        ...merged,
                        description: `Required when ${discriminator} is ${requiredWhen.map(value => JSON.stringify(value)).join(" or ")}.`
                            + (schemaAllowsNull(merged) ? " Return null when no value is needed." : "")
                            + (key === "memoryPatch" ? " Google strict output does not emit Working Memory updates." : ""),
                    }];
                })),
                required: path.join(".") === "properties.result"
                    ? [...new Set([...required, "action", "summary", "completionEvidence", "memoryPatch"].filter(k => keys.includes(k)))]
                    : required,
            });
        }

        // 通用对象联合扁平化：Gemini 严格不支持 anyOf，将所有分支 properties 归并为单一 object
        const keys = [...new Set(properties.flatMap(Object.keys))];
        return withNullability({
            type: "object",
            properties: Object.fromEntries(keys.map(key => {
                const merged = mergeGeminiUnion(
                    properties.flatMap(shape => shape[key] === undefined ? [] : [shape[key]!]),
                    [...path, "properties", key],
                );
                return [key, merged];
            })),
            required,
        });
    }

    if (values.every(branch => branch.type === "string")) {
        return withNullability({
            type: "string",
            ...(values.every(branch => Array.isArray(branch.enum))
                ? { enum: [...new Set(values.flatMap(branch => branch.enum as readonly string[]))] }
                : {}),
        });
    }

    if (values.every(branch => branch.type === "number" || branch.type === "integer")) {
        return withNullability({ type: "number" });
    }

    // Gemini 严格不支持 anyOf；多基础类型联合收敛为单一主类型，避免 HTTP 400
    const primaryType = values.find(b => b.type && b.type !== "null")?.type ?? "string";
    return withNullability({ type: primaryType });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
