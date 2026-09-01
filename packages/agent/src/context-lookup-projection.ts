import {
    validateContextLookupResult,
    type ContextLookupResult,
} from "../../runtime/src/context-retrieval";
import type {
    ModelContextLookupFreshness,
    ModelContextLookupMatch,
    ModelContextLookupResult,
} from "./model-inference-view";

/** 模型输入中固定显示的历史结果时效警告。 */
export const CONTEXT_LOOKUP_FRESHNESS_WARNING =
    "该结果来自 committed Trajectory 的历史记录；涉及可能变化的 Workspace、Environment 或验证状态时，必须通过授权 Tool 重新观察。" as const;

/**
 * 将 Runtime Context Lookup Result 投影为模型可见的不可变 DTO。
 *
 * @remarks
 * 投影只复制结果和原始 source refs，不把 lookup 事件转换成 Evidence。found 结果
 * 增加 committed boundary 与固定历史时效警告；not_found 和 lookup_error 保持可区分，
 * 不生成替代摘要。投影不会修改 Runtime Result 或 Goal。
 *
 * @param result - Runtime 已返回的 Context Lookup Result。
 * @returns 可安全交给 Renderer 的独立模型 DTO。
 * @throws ContextLookupProtocolError 当输入 Result 不符合有界协议时。
 * @example
 * ```ts
 * const modelResult = projectContextLookupResult(invocation.result);
 * ```
 */
export function projectContextLookupResult(
    result: ContextLookupResult,
): ModelContextLookupResult {
    const boundary = result.committedThroughSequence ?? 0;
    const validated = validateContextLookupResult(
        result,
        result.lookupId,
        boundary,
    );
    if (validated.status !== "found") {
        return deepFreeze(structuredClone(validated)) as ModelContextLookupResult;
    }

    const freshness: ModelContextLookupFreshness = {
        kind: "historical",
        committedThroughSequence: validated.committedThroughSequence,
        warning: CONTEXT_LOOKUP_FRESHNESS_WARNING,
    };
    const matches: readonly ModelContextLookupMatch[] = validated.matches.map((match) => ({
        documentId: match.documentId,
        goalId: match.goalId,
        runId: match.runId,
        firstSequence: match.firstSequence,
        lastSequence: match.lastSequence,
        matchedFields: [...match.matchedFields],
        score: match.score,
        preview: match.preview,
        truncated: match.truncated,
        ...(match.adjacent === undefined ? {} : { adjacent: match.adjacent }),
        historical: true,
        sourceEventIds: [...match.sourceEventIds],
        ...(match.source === undefined ? {} : { source: structuredClone(match.source) }),
    }));
    return deepFreeze({
        status: "found",
        lookupId: validated.lookupId,
        committedThroughSequence: validated.committedThroughSequence,
        ...(validated.queryHash === undefined ? {} : { queryHash: validated.queryHash }),
        ...(validated.indexVersion === undefined ? {} : { indexVersion: validated.indexVersion }),
        matches,
        truncated: validated.truncated,
        freshness,
    });
}

/** `projectContextLookupResult` 的语义别名。 */
export const projectLookupResult = projectContextLookupResult;

function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === "object") {
        Object.freeze(value);
        for (const key of Object.keys(value)) {
            deepFreeze((value as Record<string, unknown>)[key]);
        }
    }
    return value;
}
