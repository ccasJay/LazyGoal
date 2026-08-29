import { createHash } from "node:crypto";

import {
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "./execution-control";
import type { Goal } from "./domain";
import type {
    TrajectoryEventDraft,
    TrajectoryPhase,
} from "./trajectory";

/** Context Lookup 支持的历史信息需求类别。 */
export type ContextLookupNeed =
    | "historical_execution"
    | "decision_rationale";

/** Context Lookup 可用于缩小 committed Trajectory 候选集的字段过滤器。 */
export interface ContextLookupFilters {
    /** 事件类型过滤；最多 16 项。 */
    readonly eventTypes?: readonly string[];
    /** Tool ID 过滤；最多 16 项。 */
    readonly toolIds?: readonly string[];
    /** Action ID 过滤；最多 16 项。 */
    readonly actionIds?: readonly string[];
    /** executing Step index 过滤；最多 16 项。 */
    readonly stepIndexes?: readonly number[];
    /** 文件路径过滤；最多 16 项。 */
    readonly paths?: readonly string[];
    /** 错误码过滤；最多 16 项。 */
    readonly errorCodes?: readonly string[];
    /** 对象标识过滤；最多 16 项。 */
    readonly objectIds?: readonly string[];
    /** 可选的闭区间 sequence 范围。 */
    readonly sequenceRange?: {
        readonly from: number;
        readonly to: number;
    };
}

/** Agent 发起的独占历史 Context Lookup 请求。 */
export interface ContextLookupRequest {
    /** 判别字段；该请求不能与 Action、Memory Patch 或终态结果并存。 */
    readonly kind: "context_lookup";
    /** 请求的历史信息类别。 */
    readonly need: ContextLookupNeed;
    /** 面向 committed Trajectory 的具体问题。 */
    readonly question: string;
    /** 可选的结构化候选过滤器。 */
    readonly filters?: ContextLookupFilters;
}

/** 检索结果中的稳定字段名称。 */
export type ContextLookupMatchedField =
    | "eventType"
    | "toolId"
    | "actionId"
    | "stepIndex"
    | "path"
    | "errorCode"
    | "objectId"
    | "body";

/** 一条完整 Context Document 的有界历史命中。 */
export interface ContextLookupMatch {
    /** Context Document 的稳定 ID。 */
    readonly documentId: string;
    /** 命中来源 Goal/Run。 */
    readonly goalId: string;
    readonly runId: string;
    /** 命中文档覆盖的 committed sequence 闭区间。 */
    readonly firstSequence: number;
    readonly lastSequence: number;
    /** 参与评分的字段集合，按稳定顺序排列。 */
    readonly matchedFields: readonly ContextLookupMatchedField[];
    /** 版本化 BM25-lite 分数，已舍入到 6 位小数。 */
    readonly score: number;
    /** 有界的历史文档预览。 */
    readonly preview: string;
    /** 预览或文档是否被有界输出替代。 */
    readonly truncated: boolean;
    /** 是否为排名之外、用于保持因果关系的相邻文档。 */
    readonly adjacent?: boolean;
    /** 该命中永远是历史来源，不代表当前 Workspace 状态。 */
    readonly historical: true;
    /** 原始 committed 事件引用。 */
    readonly sourceEventIds: readonly string[];
}

/** Context Lookup 的结构化结果；未命中与故障必须保持可区分。 */
export type ContextLookupResult =
    | {
        readonly status: "found";
        readonly lookupId: string;
        readonly committedThroughSequence: number;
        /** 规范化 query/filters 的稳定摘要；缺失时由 Runtime 补齐。 */
        readonly queryHash?: string;
        /** 产生该结果的索引协议版本；缺失时由 Runtime 补齐。 */
        readonly indexVersion?: string;
        readonly matches: readonly ContextLookupMatch[];
        readonly truncated: boolean;
    }
    | {
        readonly status: "not_found";
        readonly lookupId: string;
        readonly committedThroughSequence?: number;
        readonly reason?: string;
    }
    | {
        readonly status: "lookup_error";
        readonly lookupId: string;
        readonly code: string;
        readonly message: string;
        readonly committedThroughSequence?: number;
    };

/** 交给检索实现的一次有界查询输入。 */
export interface ContextLookupExecutionInput {
    /** 当前完整 Goal；实现只能读取其身份、协议和 Snapshot 状态。 */
    readonly goal: Goal;
    /** 已通过 Runtime 协议校验的请求。 */
    readonly request: ContextLookupRequest;
    /** Runtime 为该请求计算的跨进程稳定 ID。 */
    readonly lookupId: string;
    /** 查询允许看到的 Snapshot committed boundary。 */
    readonly committedThroughSequence: number;
    /** 当前调用的瞬时中止控制，不得写入结果。 */
    readonly control?: ExecutionControl;
}

/** Runtime 使用的只读 Cold Trajectory 检索端口。 */
export interface ContextLookupPort {
    /**
     * 在当前 Goal/Run 的 committed Trajectory 内执行一次查询。
     *
     * @param input - Goal 身份、规范化请求、稳定 lookupId 和提交边界。
     * @returns found、not_found 或 lookup_error；实现不得执行 Tool 或修改 Goal。
     * @throws 底层不可恢复 I/O/协议错误；Runtime 会将其归一化为 lookup_error。
     * @example
     * ```ts
     * const port: ContextLookupPort = {
     *     async lookup({ request, lookupId }) {
     *         return { status: "not_found", lookupId, reason: request.question };
     *     },
     * };
     * ```
     */
    lookup(input: ContextLookupExecutionInput): Promise<ContextLookupResult>;
}

/**
 * Runtime 执行一次历史查询所需的端口与事实元数据。
 *
 * @example
 * ```ts
 * const input: ContextLookupInvocationInput = {
 *     goal,
 *     request,
 *     phase: "executing",
 *     port,
 * };
 * ```
 */
export interface ContextLookupInvocationInput {
    /** 当前完整 Goal 快照；只读传给检索端口。 */
    readonly goal: Goal;
    /** 已通过请求协议校验的查询。 */
    readonly request: ContextLookupRequest;
    /** 事实所属的 Runtime 阶段。 */
    readonly phase: TrajectoryPhase;
    /** 可选的查询实现；缺失时产生结构化 unavailable 结果。 */
    readonly port?: ContextLookupPort;
    /** 可选的执行单元关联键。 */
    readonly executionUnitId?: string;
    /** 当前调用级中止控制。 */
    readonly control?: ExecutionControl;
}

/**
 * 一次查询的稳定 ID、规范化结果与可提交事实。
 *
 * @example
 * ```ts
 * const invocation = await invokeContextLookup(input);
 * console.log(invocation.lookupId, invocation.result.status);
 * ```
 */
export interface ContextLookupInvocation {
    /** 去重同一 Goal/Run/请求的稳定 ID。 */
    readonly lookupId: string;
    /** 写入事实和下一轮模型输入的规范化请求。 */
    readonly request: ContextLookupRequest;
    /** found、not_found 或 lookup_error 之一。 */
    readonly result: ContextLookupResult;
    /** 按 requested → outcome 顺序排列的事实草稿。 */
    readonly facts: readonly TrajectoryEventDraft[];
}

/** Context Lookup 输入协议错误码。 */
export const CONTEXT_LOOKUP_PROTOCOL_ERROR_CODE = "INVALID_CONTEXT_LOOKUP" as const;

/** Context Lookup 查询链超过限制时的稳定错误码。 */
export const CONTEXT_LOOKUP_CHAIN_LIMIT_CODE = "CONTEXT_LOOKUP_CHAIN_LIMIT" as const;

/** Context Lookup 端口不可用时的稳定错误码。 */
export const CONTEXT_LOOKUP_UNAVAILABLE_CODE = "CONTEXT_LOOKUP_UNAVAILABLE" as const;

/** 检索端口抛出非中止异常时的稳定结果错误码。 */
export const CONTEXT_LOOKUP_FAILED_CODE = "CONTEXT_LOOKUP_FAILED" as const;

/** 检索端口返回不符合结果协议时的稳定结果错误码。 */
export const CONTEXT_LOOKUP_INVALID_RESULT_CODE =
    "INVALID_CONTEXT_LOOKUP_RESULT" as const;

/** Context Lookup 请求的固定资源上限。 */
export const CONTEXT_LOOKUP_MAX_QUESTION_LENGTH = 1024;
export const CONTEXT_LOOKUP_MAX_FILTER_ITEMS = 16;

/** Context Lookup 结果的固定协议版本。 */
export const CONTEXT_LOOKUP_RESULT_VERSION = "context-lookup-result-v1" as const;

/** BM25-lite 结果未显式携带版本时使用的索引版本。 */
export const CONTEXT_LOOKUP_DEFAULT_INDEX_VERSION = "fielded-bm25-lite-v1" as const;

/** 单次查询允许返回的完整文档命中上限（主命中与相邻扩展合计）。 */
export const CONTEXT_LOOKUP_MAX_MATCHES = 15;

/** 单个历史预览的 UTF-16 字符上限；原始文档仍保留在 Trajectory。 */
export const CONTEXT_LOOKUP_MAX_PREVIEW_LENGTH = 8_192;

/** lookup reason 的字符上限。 */
export const CONTEXT_LOOKUP_MAX_REASON_LENGTH = 512;

/** lookup error code 的字符上限。 */
export const CONTEXT_LOOKUP_MAX_ERROR_CODE_LENGTH = 128;

/** lookup error message 的字符上限。 */
export const CONTEXT_LOOKUP_MAX_ERROR_MESSAGE_LENGTH = 2_048;

/** Context Lookup 结果 DTO 的 UTF-8 JSON 字节上限。 */
export const CONTEXT_LOOKUP_MAX_RESULT_BYTES = 24 * 1024;

/** Context Lookup 请求违反结构或资源限制时抛出的错误。 */
export class ContextLookupProtocolError extends Error {
    readonly code = CONTEXT_LOOKUP_PROTOCOL_ERROR_CODE;

    /** @param message - 不包含模型原文的稳定诊断信息。 */
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
    if (value.need !== "historical_execution" && value.need !== "decision_rationale") {
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
                CONTEXT_LOOKUP_MAX_REASON_LENGTH,
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
            CONTEXT_LOOKUP_MAX_ERROR_CODE_LENGTH,
        );
        assertBoundedString(
            value.message,
            "error message",
            CONTEXT_LOOKUP_MAX_ERROR_MESSAGE_LENGTH,
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
    const matches = value.matches.map((match, index) => validateContextLookupMatch(match, boundary, index));
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
            matches: Object.freeze(result.matches.map((match) => Object.freeze({
                ...match,
                ...(match.adjacent === undefined ? {} : { adjacent: match.adjacent }),
                matchedFields: Object.freeze([...match.matchedFields]),
                sourceEventIds: Object.freeze([...match.sourceEventIds]),
            }))),
        });
    }
    if (result.committedThroughSequence === undefined) {
        return Object.freeze({ ...result, committedThroughSequence: boundary });
    }
    return result;
}

/**
 * 校验 found 结果的 Goal/Run 所有权。
 *
 * @remarks Context Lookup 只能引用当前 Goal/Run 的 committed 文档；该校验不把
 * 历史命中升级为当前事实，也不接受来自其它 Session 的 source ref。
 *
 * @param result - 已通过结构和预算校验的 found 结果。
 * @param goalId - 当前 Goal ID。
 * @param runId - 当前 Run ID。
 * @throws ContextLookupProtocolError 当命中身份不匹配时。
 * @example
 * ```ts
 * assertContextLookupResultOwnership(result, goal.id, goal.state.run.id);
 * ```
 */
export function assertContextLookupResultOwnership(
    result: Extract<ContextLookupResult, { readonly status: "found" }>,
    goalId: string,
    runId: string,
): void {
    assertNonEmptyString(goalId, "goalId");
    assertNonEmptyString(runId, "runId");
    for (const match of result.matches) {
        if (match.goalId !== goalId || match.runId !== runId) {
            throw new ContextLookupProtocolError(
                "found result references a different Goal/Run",
            );
        }
    }
}

/** 为同一 Goal/Run 与规范化请求计算跨进程稳定的 lookupId。 */
export function createContextLookupId(
    goalId: string,
    runId: string,
    request: ContextLookupRequest,
): string {
    assertNonEmptyString(goalId, "goalId");
    assertNonEmptyString(runId, "runId");
    const normalized = normalizeContextLookupRequest(request);
    const canonical = stableJson({ version: 1, goalId, runId, request: normalized });
    return `lookup-${createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 32)}`;
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

/**
 * 执行一次只读 Context Lookup，并生成其 requested/outcome 事实。
 *
 * @remarks
 * 端口缺失、端口异常和端口返回非法 DTO 都归一化为 `lookup_error`；中止异常
 * 原样传播且不生成事实。结果边界不能超过 Goal Snapshot 当前边界，缺失边界的
 * `not_found`/`lookup_error` 会补齐为当前边界。该函数不保存 Goal，也不执行 Tool。
 *
 * @param input - Goal、规范化请求、阶段与可选检索端口。
 * @returns 稳定 lookupId、规范化结果和按提交顺序排列的事实草稿。
 * @throws ExecutionAbortedError 当 control 在查询前后被中止时。
 * @example
 * ```ts
 * const invocation = await invokeContextLookup({
 *     goal,
 *     request,
 *     phase: "executing",
 *     port,
 * });
 * await committer.commit(goal, { facts: invocation.facts });
 * ```
 */
export async function invokeContextLookup(
    input: ContextLookupInvocationInput,
): Promise<ContextLookupInvocation> {
    throwIfAborted(input.control);
    const request = normalizeContextLookupRequest(input.request);
    const lookupId = createContextLookupId(
        input.goal.id,
        input.goal.state.run.id,
        request,
    );
    const committedThroughSequence = input.goal.state.run.committedThroughSequence ?? 0;
    const sequenceRange = request.filters?.sequenceRange;
    if (
        sequenceRange !== undefined
        && (
            sequenceRange.from < 1
            || sequenceRange.to > committedThroughSequence
        )
    ) {
        throw new ContextLookupProtocolError(
            "sequenceRange must be within the committed Trajectory boundary",
        );
    }

    let result: ContextLookupResult;
    if (input.port === undefined) {
        result = {
            status: "lookup_error",
            lookupId,
            code: CONTEXT_LOOKUP_UNAVAILABLE_CODE,
            message: "Context Lookup port is unavailable",
            committedThroughSequence,
        };
    } else {
        try {
            const rawResult = await input.port.lookup({
                goal: input.goal,
                request,
                lookupId,
                committedThroughSequence,
                ...(input.control === undefined ? {} : { control: input.control }),
            });
            throwIfAborted(input.control);
            result = normalizeContextLookupResult(
                rawResult,
                lookupId,
                committedThroughSequence,
                request,
            );
            if (result.status === "found") {
                assertContextLookupResultOwnership(
                    result,
                    input.goal.id,
                    input.goal.state.run.id,
                );
            }
            if (
                result.status !== "found"
                && result.committedThroughSequence === undefined
            ) {
                result = { ...result, committedThroughSequence };
            }
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            throwIfAborted(input.control);
            const isInvalidResult = error instanceof ContextLookupProtocolError;
            result = {
                status: "lookup_error",
                lookupId,
                code: isInvalidResult
                    ? CONTEXT_LOOKUP_INVALID_RESULT_CODE
                    : CONTEXT_LOOKUP_FAILED_CODE,
                message: error instanceof Error
                    ? error.message
                    : "Context Lookup failed",
                committedThroughSequence,
            };
        }
    }

    return {
        lookupId,
        request,
        result,
        facts: createContextLookupFacts({
            goal: input.goal,
            phase: input.phase,
            request,
            lookupId,
            result,
            ...(input.executionUnitId === undefined
                ? {}
                : { executionUnitId: input.executionUnitId }),
        }),
    };
}

/** 创建不包含 Snapshot 派生状态的 requested/outcome 事实草稿。 */
export function createContextLookupFacts(input: {
    readonly goal: Pick<Goal, "id" | "state">;
    readonly phase: TrajectoryPhase;
    readonly request: ContextLookupRequest;
    readonly lookupId: string;
    readonly result: ContextLookupResult;
    readonly executionUnitId?: string;
}): readonly TrajectoryEventDraft[] {
    const metadata = {
        goalId: input.goal.id,
        runId: input.goal.state.run.id,
        phase: input.phase,
        ...(input.executionUnitId === undefined
            ? {}
            : { executionUnitId: input.executionUnitId }),
    };
    const requested: TrajectoryEventDraft = {
        ...metadata,
        eventType: "context_lookup_requested",
        payload: {
            type: "context_lookup_requested",
            lookupId: input.lookupId,
            request: input.request,
        },
    };

    const outcome: TrajectoryEventDraft = input.result.status === "found"
        ? {
            ...metadata,
            eventType: "context_lookup_completed",
            payload: {
                type: "context_lookup_completed",
                lookupId: input.lookupId,
                result: input.result,
            },
        }
        : input.result.status === "not_found"
            ? {
                ...metadata,
                eventType: "context_lookup_not_found",
                payload: {
                    type: "context_lookup_not_found",
                    lookupId: input.lookupId,
                    result: input.result,
                },
            }
            : {
                ...metadata,
                eventType: "context_lookup_failed",
                payload: {
                    type: "context_lookup_failed",
                    lookupId: input.lookupId,
                    code: input.result.code,
                    message: input.result.message,
                },
            };

    return Object.freeze([requested, outcome]);
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
    ]);
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
        || (value.firstSequence as number) <= 0
        || (value.lastSequence as number) < (value.firstSequence as number)
        || (value.lastSequence as number) > boundary
    ) {
        throw new ContextLookupProtocolError(`matches[${index}] sequence range is invalid`);
    }
    if (!Array.isArray(value.matchedFields)) {
        throw new ContextLookupProtocolError(`matches[${index}] matchedFields is invalid`);
    }
    const fields = uniqueSorted(value.matchedFields.map((field) => {
        if (typeof field !== "string" || !MATCHED_FIELDS.has(field as ContextLookupMatchedField)) {
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
    if (!Array.isArray(value.sourceEventIds) || value.sourceEventIds.length === 0) {
        throw new ContextLookupProtocolError(`matches[${index}] sourceEventIds is empty`);
    }
    const sourceEventIds = uniqueSorted(value.sourceEventIds.map((eventId) => {
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
    };
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

const MATCHED_FIELDS = new Set<ContextLookupMatchedField>([
    "eventType",
    "toolId",
    "actionId",
    "stepIndex",
    "path",
    "errorCode",
    "objectId",
    "body",
]);
