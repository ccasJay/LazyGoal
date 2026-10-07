import { createHash } from "node:crypto";
import type {
    ContextLookupFilters,
    ContextLookupNeed,
    ContextLookupRequest,
} from "../../model-contracts/src/index";
import type {
    ContextLookupMatch,
    ContextLookupMatchedField,
    ContextLookupResult,
    ContextLookupRunBoundary,
} from "./types";
import {
    CONTEXT_LOOKUP_DEFAULT_INDEX_VERSION,
    CONTEXT_LOOKUP_MAX_MATCHES,
    CONTEXT_LOOKUP_MAX_PREVIEW_LENGTH,
    CONTEXT_LOOKUP_MAX_RESULT_BYTES,
    CONTEXT_LOOKUP_RESULT_VERSION,
    CONTEXT_LOOKUP_MATCHED_FIELDS,
} from "./types";

/** Context Lookup 输入协议错误码。 */
export const CONTEXT_LOOKUP_PROTOCOL_ERROR_CODE = "INVALID_CONTEXT_LOOKUP" as const;

/** Context Lookup 请求的固定资源上限。 */
export const CONTEXT_LOOKUP_MAX_QUESTION_LENGTH = 1024;
export const CONTEXT_LOOKUP_MAX_FILTER_ITEMS = 16;

/** Context Lookup 请求违反结构或资源限制时抛出的错误。 */
export class ContextLookupProtocolError extends Error {
    readonly code = CONTEXT_LOOKUP_PROTOCOL_ERROR_CODE;

    constructor(message: string) {
        super(`${CONTEXT_LOOKUP_PROTOCOL_ERROR_CODE}: ${message}`);
        this.name = "ContextLookupProtocolError";
    }
}

/** 判断未知值是否为最小 Context Lookup 请求对象。 */
export function isContextLookupRequest(
    value: unknown,
): value is ContextLookupRequest {
    try {
        normalizeContextLookupRequest(value);
        return true;
    } catch {
        return false;
    }
}

/**
 * 校验并规范化 Context Lookup 请求。
 *
 * @param value - Agent 或外部边界返回的未知值。
 * @returns 去重、排序且不与输入共享引用的请求。
 * @throws ContextLookupProtocolError 当字段、需求类别、问题长度或过滤器非法时。
 * @example
 * ```ts
 * const request = normalizeContextLookupRequest({
 *     kind: "context_lookup",
 *     need: "historical_execution",
 *     question: "之前哪个 Action 修改了配置？",
 * });
 * ```
 */
export function normalizeContextLookupRequest(
    value: unknown,
): ContextLookupRequest {
    if (!isRecord(value) || value.kind !== "context_lookup") {
        throw new ContextLookupProtocolError("kind must be context_lookup");
    }
    assertExactKeys(value, ["kind", "need", "question", "filters"]);
    if (
        value.need !== "conversation_history"
        && value.need !== "historical_execution"
        && value.need !== "decision_rationale"
    ) {
        throw new ContextLookupProtocolError("need is invalid");
    }
    if (
        typeof value.question !== "string"
        || value.question.trim().length === 0
        || value.question.length > CONTEXT_LOOKUP_MAX_QUESTION_LENGTH
    ) {
        throw new ContextLookupProtocolError(
            `question must be non-empty and at most ${CONTEXT_LOOKUP_MAX_QUESTION_LENGTH} characters`,
        );
    }

    return {
        kind: "context_lookup",
        need: value.need,
        question: value.question.trim(),
        ...(value.filters === undefined
            ? {}
            : { filters: normalizeContextLookupFilters(value.filters) }),
    };
}

/** 校验结果是否可以安全地写入 Trajectory 并提供给下一轮模型。 */
export function validateContextLookupResult(
    value: unknown,
    lookupId: string,
    boundary: number,
): ContextLookupResult {
    assertNonEmptyString(lookupId, "lookupId");
    assertNonNegativeSafeInteger(boundary, "committedThroughSequence");
    if (!isRecord(value) || !["found", "not_found", "lookup_error"].includes(String(value.status))) {
        throw new ContextLookupProtocolError("lookup result status is invalid");
    }
    if (value.lookupId !== lookupId) {
        throw new ContextLookupProtocolError("lookup result lookupId does not match request");
    }

    if (value.status === "not_found") {
        assertExactKeys(value, [
            "status",
            "lookupId",
            "committedThroughSequence",
            "reason",
        ]);
        if (value.committedThroughSequence !== undefined) {
            assertNonNegativeSafeInteger(value.committedThroughSequence, "result boundary");
            if (value.committedThroughSequence > boundary) {
                throw new ContextLookupProtocolError("result boundary exceeds request boundary");
            }
        }
        if (value.reason !== undefined) {
            assertBoundedString(
                value.reason,
                "reason",
                512,
            );
        }
        return {
            status: "not_found",
            lookupId,
            ...(value.committedThroughSequence === undefined
                ? {}
                : { committedThroughSequence: value.committedThroughSequence }),
            ...(value.reason === undefined ? {} : { reason: value.reason }),
        };
    }

    if (value.status === "lookup_error") {
        assertExactKeys(value, [
            "status",
            "lookupId",
            "code",
            "message",
            "committedThroughSequence",
        ]);
        assertBoundedString(
            value.code,
            "error code",
            128,
        );
        assertBoundedString(
            value.message,
            "error message",
            2048,
        );
        if (value.committedThroughSequence !== undefined) {
            assertNonNegativeSafeInteger(value.committedThroughSequence, "result boundary");
            if (value.committedThroughSequence > boundary) {
                throw new ContextLookupProtocolError("result boundary exceeds request boundary");
            }
        }
        return {
            status: "lookup_error",
            lookupId,
            code: value.code,
            message: value.message,
            ...(value.committedThroughSequence === undefined
                ? {}
                : { committedThroughSequence: value.committedThroughSequence }),
        };
    }

    assertExactKeys(value, [
        "status",
        "lookupId",
        "committedThroughSequence",
        "queryHash",
        "indexVersion",
        "matches",
        "truncated",
        "sourceRunBoundaries",
    ]);
    assertNonNegativeSafeInteger(value.committedThroughSequence, "result boundary");
    if (value.committedThroughSequence > boundary) {
        throw new ContextLookupProtocolError("result boundary exceeds request boundary");
    }
    if (!Array.isArray(value.matches) || value.matches.length === 0) {
        throw new ContextLookupProtocolError("found result requires at least one match");
    }
    if (value.matches.length > CONTEXT_LOOKUP_MAX_MATCHES) {
        throw new ContextLookupProtocolError(
            `found result contains more than ${CONTEXT_LOOKUP_MAX_MATCHES} matches`,
        );
    }
    if (typeof value.truncated !== "boolean") {
        throw new ContextLookupProtocolError("found result truncated must be boolean");
    }
    if (value.queryHash !== undefined) {
        assertBoundedString(value.queryHash, "queryHash", 256);
    }
    if (value.indexVersion !== undefined) {
        assertBoundedString(value.indexVersion, "indexVersion", 128);
    }
    const sourceRunBoundaries = value.sourceRunBoundaries === undefined
        ? undefined
        : normalizeSourceRunBoundaries(value.sourceRunBoundaries, boundary);
    const boundaryByRun = new Map(
        (sourceRunBoundaries ?? []).map((source) => [source.runId, source.committedThroughSequence]),
    );
    const matches = value.matches.map((match, index) => validateContextLookupMatch(
        match,
        boundaryByRun.get(isRecord(match) && typeof match.runId === "string" ? match.runId : "") ?? boundary,
        index,
    ));
    const documentIds = new Set<string>();
    const sourceEventIds = new Set<string>();
    for (const match of matches) {
        if (documentIds.has(match.documentId)) {
            throw new ContextLookupProtocolError(
                `found result contains duplicate document ${match.documentId}`,
            );
        }
        documentIds.add(match.documentId);
        for (const eventId of match.sourceEventIds) {
            if (sourceEventIds.has(eventId)) {
                throw new ContextLookupProtocolError(
                    `found result contains duplicate source event ${eventId}`,
                );
            }
            sourceEventIds.add(eventId);
        }
    }
    if (matches.some((match) => match.truncated) && !value.truncated) {
        throw new ContextLookupProtocolError(
            "found result must mark truncation when a match preview is truncated",
        );
    }
    const result = {
        status: "found",
        lookupId,
        committedThroughSequence: value.committedThroughSequence,
        ...(value.queryHash === undefined ? {} : { queryHash: value.queryHash }),
        ...(value.indexVersion === undefined ? {} : { indexVersion: value.indexVersion }),
        matches,
        truncated: value.truncated,
        ...(sourceRunBoundaries === undefined ? {} : { sourceRunBoundaries }),
    } as const;
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > CONTEXT_LOOKUP_MAX_RESULT_BYTES) {
        throw new ContextLookupProtocolError(
            `found result exceeds ${CONTEXT_LOOKUP_MAX_RESULT_BYTES} UTF-8 bytes`,
        );
    }
    return result;
}

/**
 * 规范化检索结果并补齐当前请求的 query hash、索引版本和缺省边界。
 *
 * @param value - 检索端口返回的未知 DTO。
 * @param lookupId - Runtime 为当前查询计算的稳定 ID。
 * @param boundary - 当前 Snapshot 的 committed boundary。
 * @param request - 可选规范化请求；提供时会补齐 found 的 query hash。
 * @returns 可提交 Trajectory 且不共享输入引用的结果。
 * @throws ContextLookupProtocolError 当结果不符合有界协议时。
 * @example
 * ```ts
 * const result = normalizeContextLookupResult(raw, lookupId, boundary, request);
 * ```
 */
export function normalizeContextLookupResult(
    value: unknown,
    lookupId: string,
    boundary: number,
    request?: ContextLookupRequest,
): ContextLookupResult {
    const result = validateContextLookupResult(value, lookupId, boundary);
    if (result.status === "found") {
        return Object.freeze({
            ...result,
            ...(result.queryHash === undefined && request === undefined
                ? {}
                : {
                    queryHash: result.queryHash
                        ?? createContextLookupQueryHash(request!),
                }),
            indexVersion: result.indexVersion
                ?? CONTEXT_LOOKUP_DEFAULT_INDEX_VERSION,
            ...(result.sourceRunBoundaries === undefined
                ? {}
                : { sourceRunBoundaries: Object.freeze(result.sourceRunBoundaries.map((source) => Object.freeze({ ...source }))) }),
            matches: Object.freeze(result.matches.map((match) => Object.freeze({
                ...match,
                ...(match.adjacent === undefined ? {} : { adjacent: match.adjacent }),
                matchedFields: Object.freeze([...match.matchedFields]),
                sourceEventIds: Object.freeze([...match.sourceEventIds]),
                ...(match.source === undefined
                    ? {}
                    : { source: structuredClone(match.source) }),
            }))),
        });
    }
    if (result.committedThroughSequence === undefined) {
        return Object.freeze({ ...result, committedThroughSequence: boundary });
    }
    return result;
}

/** 为规范化请求计算不含 Goal/Run 的稳定 query hash。 */
export function createContextLookupQueryHash(
    request: ContextLookupRequest,
): string {
    const normalized = normalizeContextLookupRequest(request);
    const canonical = stableJson({
        version: CONTEXT_LOOKUP_RESULT_VERSION,
        request: normalized,
    });
    return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function normalizeContextLookupFilters(value: unknown): ContextLookupFilters {
    if (!isRecord(value)) {
        throw new ContextLookupProtocolError("filters must be an object");
    }
    const allowed = new Set([
        "eventTypes",
        "toolIds",
        "actionIds",
        "stepIndexes",
        "paths",
        "errorCodes",
        "objectIds",
        "sequenceRange",
    ]);
    if (Object.keys(value).some((key) => !allowed.has(key))) {
        throw new ContextLookupProtocolError("filters contains unknown fields");
    }
    const result: ContextLookupFilters = {
        ...(value.eventTypes === undefined ? {} : { eventTypes: normalizeStringList(value.eventTypes, "eventTypes") }),
        ...(value.toolIds === undefined ? {} : { toolIds: normalizeStringList(value.toolIds, "toolIds") }),
        ...(value.actionIds === undefined ? {} : { actionIds: normalizeStringList(value.actionIds, "actionIds") }),
        ...(value.stepIndexes === undefined ? {} : { stepIndexes: normalizeIntegerList(value.stepIndexes, "stepIndexes") }),
        ...(value.paths === undefined ? {} : { paths: normalizeStringList(value.paths, "paths") }),
        ...(value.errorCodes === undefined ? {} : { errorCodes: normalizeStringList(value.errorCodes, "errorCodes") }),
        ...(value.objectIds === undefined ? {} : { objectIds: normalizeStringList(value.objectIds, "objectIds") }),
        ...(value.sequenceRange === undefined ? {} : { sequenceRange: normalizeSequenceRange(value.sequenceRange) }),
    };
    return Object.keys(result).length === 0 ? {} : result;
}

function normalizeStringList(value: unknown, field: string): readonly string[] {
    if (!Array.isArray(value) || value.length > CONTEXT_LOOKUP_MAX_FILTER_ITEMS) {
        throw new ContextLookupProtocolError(
            `${field} must contain at most ${CONTEXT_LOOKUP_MAX_FILTER_ITEMS} items`,
        );
    }
    const normalized = value.map((item) => {
        if (typeof item !== "string" || item.trim().length === 0) {
            throw new ContextLookupProtocolError(`${field} must contain non-empty strings`);
        }
        return item.trim();
    });
    return uniqueSorted(normalized);
}

function normalizeIntegerList(value: unknown, field: string): readonly number[] {
    if (!Array.isArray(value) || value.length > CONTEXT_LOOKUP_MAX_FILTER_ITEMS) {
        throw new ContextLookupProtocolError(
            `${field} must contain at most ${CONTEXT_LOOKUP_MAX_FILTER_ITEMS} items`,
        );
    }
    const normalized = value.map((item) => {
        if (!Number.isSafeInteger(item) || (item as number) < 0) {
            throw new ContextLookupProtocolError(`${field} must contain non-negative integers`);
        }
        return item as number;
    });
    return [...new Set(normalized)].sort((left, right) => left - right);
}

function normalizeSequenceRange(value: unknown): { readonly from: number; readonly to: number } {
    if (!isRecord(value)
        || Object.keys(value).some((key) => key !== "from" && key !== "to")
        || !Number.isSafeInteger(value.from)
        || !Number.isSafeInteger(value.to)
        || (value.from as number) < 0
        || (value.to as number) < (value.from as number)
    ) {
        throw new ContextLookupProtocolError("sequenceRange must be a valid non-inverted range");
    }
    return { from: value.from as number, to: value.to as number };
}

function validateContextLookupMatch(
    value: unknown,
    boundary: number,
    index: number,
): ContextLookupMatch {
    if (!isRecord(value)) {
        throw new ContextLookupProtocolError(`matches[${index}] must be an object`);
    }
    assertExactKeys(value, [
        "documentId",
        "goalId",
        "runId",
        "firstSequence",
        "lastSequence",
        "matchedFields",
        "score",
        "preview",
        "truncated",
        "adjacent",
        "historical",
        "sourceEventIds",
        "source",
    ]);
    const sourceCandidate = isRecord(value.source) ? value.source : undefined;
    for (const [field, valueToCheck] of [["documentId", value.documentId], ["goalId", value.goalId], ["runId", value.runId]] as const) {
        assertNonEmptyString(valueToCheck, field);
    }
    assertBoundedString(
        value.preview,
        "preview",
        CONTEXT_LOOKUP_MAX_PREVIEW_LENGTH,
    );
    if (
        !Number.isSafeInteger(value.firstSequence)
        || !Number.isSafeInteger(value.lastSequence)
        || (sourceCandidate?.kind === "conversation" ? (value.firstSequence as number) < 0 : (value.firstSequence as number) <= 0)
        || (value.lastSequence as number) < (value.firstSequence as number)
        || (sourceCandidate?.kind !== "conversation" && (value.lastSequence as number) > boundary)
    ) {
        throw new ContextLookupProtocolError(`matches[${index}] sequence range is invalid`);
    }
    if (!Array.isArray(value.matchedFields)) {
        throw new ContextLookupProtocolError(`matches[${index}] matchedFields is invalid`);
    }
    const fields = uniqueSorted(value.matchedFields.map((field) => {
        if (typeof field !== "string" || !CONTEXT_LOOKUP_MATCHED_FIELDS.has(field as ContextLookupMatchedField)) {
            throw new ContextLookupProtocolError(`matches[${index}] matchedFields contains an unknown field`);
        }
        return field as ContextLookupMatchedField;
    })) as readonly ContextLookupMatchedField[];
    if (typeof value.score !== "number" || !Number.isFinite(value.score) || value.score < 0) {
        throw new ContextLookupProtocolError(`matches[${index}] score is invalid`);
    }
    if (typeof value.truncated !== "boolean" || value.historical !== true) {
        throw new ContextLookupProtocolError(`matches[${index}] truncation/history flags are invalid`);
    }
    if (value.adjacent !== undefined && typeof value.adjacent !== "boolean") {
        throw new ContextLookupProtocolError(`matches[${index}] adjacent flag is invalid`);
    }
    if (fields.length === 0 && value.adjacent !== true) {
        throw new ContextLookupProtocolError(`matches[${index}] matchedFields is empty`);
    }
    if (value.adjacent === true && value.score !== 0) {
        throw new ContextLookupProtocolError(
            `matches[${index}] adjacent score must be zero`,
        );
    }
    const source = value.source;
    if (source !== undefined) {
        if (!isRecord(source)) {
            throw new ContextLookupProtocolError(`matches[${index}].source is invalid`);
        }
        if (source.kind === "conversation") {
            if (!Number.isSafeInteger(source.messageIndex) || (source.messageIndex as number) < 0
                || (source.role !== "user" && source.role !== "assistant")
                || typeof source.contentHash !== "string" || source.contentHash.length === 0) {
                throw new ContextLookupProtocolError(`matches[${index}].source is invalid`);
            }
        } else if (source.kind === "trajectory") {
            if (!Number.isSafeInteger(source.firstSequence)
                || !Number.isSafeInteger(source.lastSequence)
                || (source.firstSequence as number) <= 0
                || (source.lastSequence as number) < (source.firstSequence as number)
                || (source.lastSequence as number) > boundary
                || !Array.isArray(source.sourceEventIds)
                || source.sourceEventIds.length === 0
                || source.sourceEventIds.some((eventId) => typeof eventId !== "string" || eventId.trim().length === 0)) {
                throw new ContextLookupProtocolError(`matches[${index}].source is invalid`);
            }
        } else {
            throw new ContextLookupProtocolError(`matches[${index}].source is invalid`);
        }
    }
    if (!Array.isArray(value.sourceEventIds) || (value.sourceEventIds.length === 0 && source === undefined)) {
        throw new ContextLookupProtocolError(`matches[${index}] sourceEventIds is empty`);
    }
    const sourceEventIds = uniqueSorted((value.sourceEventIds as unknown[] ?? []).map((eventId) => {
        assertNonEmptyString(eventId, `matches[${index}].sourceEventIds`);
        return eventId;
    }));
    const documentId = value.documentId as string;
    const goalId = value.goalId as string;
    const runId = value.runId as string;
    const firstSequence = value.firstSequence as number;
    const lastSequence = value.lastSequence as number;
    const preview = value.preview as string;
    const truncated = value.truncated as boolean;
    const validatedSource = source === undefined ? undefined : structuredClone(source) as ContextLookupMatch["source"];
    return {
        documentId,
        goalId,
        runId,
        firstSequence,
        lastSequence,
        matchedFields: fields,
        score: roundScore(value.score),
        preview,
        truncated,
        ...(value.adjacent === undefined ? {} : { adjacent: value.adjacent }),
        historical: true,
        sourceEventIds,
        ...(validatedSource === undefined ? {} : { source: validatedSource }),
    };
}

function normalizeSourceRunBoundaries(
    value: unknown,
    maximumBoundary: number,
): readonly ContextLookupRunBoundary[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new ContextLookupProtocolError("sourceRunBoundaries must be a non-empty array");
    }
    const seen = new Set<string>();
    const boundaries = value.map((entry, index) => {
        if (
            !isRecord(entry)
            || Object.keys(entry).some((key) => key !== "runId" && key !== "committedThroughSequence")
            || typeof entry.runId !== "string"
            || entry.runId.trim().length === 0
            || !Number.isSafeInteger(entry.committedThroughSequence)
            || (entry.committedThroughSequence as number) < 0
            || (entry.committedThroughSequence as number) > maximumBoundary
            || seen.has(entry.runId)
        ) {
            throw new ContextLookupProtocolError(`sourceRunBoundaries[${index}] is invalid`);
        }
        seen.add(entry.runId);
        return {
            runId: entry.runId,
            committedThroughSequence: entry.committedThroughSequence as number,
        };
    });
    return Object.freeze(boundaries);
}

function roundScore(value: number): number {
    return Math.round(value * 1_000_000) / 1_000_000;
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
    const expected = new Set(keys);
    const actual = Object.keys(value);
    if (actual.some((key) => !expected.has(key))) {
        throw new ContextLookupProtocolError("object contains unknown fields");
    }
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new ContextLookupProtocolError(`${field} must be a non-empty string`);
    }
}

function assertBoundedString(
    value: unknown,
    field: string,
    maximumLength: number,
): asserts value is string {
    assertNonEmptyString(value, field);
    if (value.length > maximumLength) {
        throw new ContextLookupProtocolError(
            `${field} exceeds ${maximumLength} characters`,
        );
    }
}

function assertNonNegativeSafeInteger(value: unknown, field: string): asserts value is number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new ContextLookupProtocolError(`${field} must be a non-negative safe integer`);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueSorted(values: readonly string[]): readonly string[] {
    return [...new Set(values)].sort(compareCodeUnits);
}

function compareCodeUnits(left: string, right: string): number {
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        const difference = left.charCodeAt(index) - right.charCodeAt(index);
        if (difference !== 0) return difference;
    }
    return left.length - right.length;
}

function stableJson(value: unknown): string {
    return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value !== null && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return Object.fromEntries(
            Object.keys(record)
                .sort(compareCodeUnits)
                .map((key) => [key, sortKeys(record[key])]),
        );
    }
    return value;
}
