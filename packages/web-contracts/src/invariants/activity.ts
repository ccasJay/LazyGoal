import type {
    BrowserActivityGap,
    BrowserActivityItem,
    BrowserActivityPage,
    BrowserActivityPosition,
} from "../activity";
import type {
    BrowserGoalActivityEvent,
    BrowserGoalLiveEvent,
} from "../events";
import { hasUtf16LengthAtMost } from "./utf16";

const LOOKUP_EVENT_TYPES: ReadonlySet<string> = new Set([
    "context_lookup_requested",
    "context_lookup_completed",
    "context_lookup_not_found",
    "context_lookup_failed",
]);

function comparePositions(left: BrowserActivityPosition, right: BrowserActivityPosition): boolean {
    if (left.runOrder < right.runOrder) return true;
    if (left.runOrder !== right.runOrder || left.runId !== right.runId) return false;
    if (left.sequence !== right.sequence) return left.sequence < right.sequence;
    if (left.itemKind !== right.itemKind) return left.itemKind === "fact";
    return left.order <= right.order;
}

function isOrderedGap(gap: BrowserActivityGap): boolean {
    return comparePositions(gap.first, gap.last);
}

function isMessageItem(item: Extract<BrowserActivityItem, { type: "message" }>): boolean {
    if (!hasUtf16LengthAtMost(item.content, 4_000)) return false;
    if (item.contentLength < item.content.length) return false;
    if (item.previewId !== undefined
        && (!hasUtf16LengthAtMost(item.previewId, 200) || item.purpose !== "answer")) return false;
    return item.role === "user"
        ? item.purpose === undefined && item.previewId === undefined
        : item.purpose !== undefined;
}

function isFactItem(item: Extract<BrowserActivityItem, { type: "fact" }>): boolean {
    if (item.detail !== undefined && !hasUtf16LengthAtMost(item.detail, 500)) return false;
    if (item.executionUnitId !== undefined && !hasUtf16LengthAtMost(item.executionUnitId, 200)) return false;

    const isLookup = LOOKUP_EVENT_TYPES.has(item.eventType);
    if (isLookup) {
        if (item.lookupId === undefined || !hasUtf16LengthAtMost(item.lookupId, 200)) return false;
    } else if (item.lookupId !== undefined) {
        return false;
    }
    if (item.eventType === "context_lookup_requested") {
        if (item.lookupRequest !== undefined && !hasUtf16LengthAtMost(item.lookupRequest, 200)) return false;
    } else if (item.lookupRequest !== undefined) {
        return false;
    }
    if (item.eventType !== "context_lookup_failed" && item.lookupErrorCode !== undefined) {
        return false;
    }
    if (item.eventType === "run_stage_declared") {
        if (item.stageTarget === undefined || !hasUtf16LengthAtMost(item.stageTarget, 1_000)) return false;
    } else if (item.stageTarget !== undefined) {
        return false;
    }
    for (const entry of item.tool?.lifecycle ?? []) {
        if (!hasUtf16LengthAtMost(entry.title, 200)) return false;
        if (entry.detail !== undefined && !hasUtf16LengthAtMost(entry.detail, 500)) return false;
    }
    return true;
}

function isThinkItem(item: Extract<BrowserActivityItem, { type: "think" }>): boolean {
    if (item.executionUnitId !== undefined && !hasUtf16LengthAtMost(item.executionUnitId, 200)) return false;
    if (!hasUtf16LengthAtMost(item.think.goal, 4_000)) return false;
    return item.think.output === undefined || hasUtf16LengthAtMost(item.think.output, 64_000);
}

function isActivityItem(item: BrowserActivityItem): boolean {
    if (item.position.runId !== item.runId) return false;
    switch (item.type) {
        case "message":
            return isMessageItem(item);
        case "fact":
            return isFactItem(item);
        case "think":
            return isThinkItem(item);
    }
}

/**
 * Activity 页的跨字段与 UTF-16 上限不变量。
 *
 * @remarks
 * 结构字段已由合同校验；该谓词保留 `items.length <= limit`、gap 方向与 range 一致、
 * gap 首尾顺序、item 与 position 的 Run 一致性、消息用途与预览规则、事实专属字段、
 * `contentLength` 关系以及既有 UTF-16 文本上限。
 *
 * @param page - 已通过结构解析的 Activity 页。
 * @returns 所有关系与上限均成立时为 `true`。
 *
 * @example
 * ```ts
 * if (isActivityPage(page)) console.log(page.items.length);
 * ```
 */
export function isActivityPage(page: BrowserActivityPage): boolean {
    if (page.items.length > page.limit) return false;
    if (!page.items.every(isActivityItem)) return false;

    if (new Set(page.gaps.map((gap) => gap.direction)).size !== page.gaps.length) return false;
    if (!page.gaps.every(isOrderedGap)) return false;
    if (page.gaps.some((gap) => gap.direction === "older") !== page.range.olderAvailable) return false;
    if (page.gaps.some((gap) => gap.direction === "newer") !== page.range.newerAvailable) return false;

    if (page.stages.some((stage) =>
        stage.lastSequence !== undefined && stage.lastSequence < stage.firstSequence)) return false;
    if (page.actionGroups.some((group) => group.lastSequence < group.firstSequence)) return false;

    for (const run of page.runs) {
        if (run.terminalDetail === undefined) continue;
        if (!hasUtf16LengthAtMost(run.terminalDetail.message, 500)) return false;
        if (run.terminalDetail.code !== undefined
            && !hasUtf16LengthAtMost(run.terminalDetail.code, 80)) return false;
    }
    for (const stage of page.stages) {
        if (stage.target !== undefined && !hasUtf16LengthAtMost(stage.target, 1_000)) return false;
    }
    return true;
}

/**
 * 实时活动事件的 UTF-16 上限、时间有效性与关联标识不变量。
 *
 * @param event - 已通过结构解析的实时活动事件。
 * @returns kind 专属上限与时间均有效时为 `true`。
 *
 * @example
 * ```ts
 * if (isActivityEvent(event)) console.log(event.kind);
 * ```
 */
export function isActivityEvent(event: BrowserGoalActivityEvent): boolean {
    switch (event.kind) {
        case "assistant_text_delta":
            return hasUtf16LengthAtMost(event.text, 2_000)
                && hasUtf16LengthAtMost(event.sourceEventId, 200);
        case "model_started":
            return (event.modelCallId === undefined || hasUtf16LengthAtMost(event.modelCallId, 200))
                && (event.executionUnitId === undefined || hasUtf16LengthAtMost(event.executionUnitId, 200))
                && (event.occurredAt === undefined
                    || (hasUtf16LengthAtMost(event.occurredAt, 40)
                        && Number.isFinite(Date.parse(event.occurredAt))));
        case "tool_started":
            return hasUtf16LengthAtMost(event.sourceEventId, 200)
                && hasUtf16LengthAtMost(event.actionId, 200)
                && hasUtf16LengthAtMost(event.executionUnitId, 200)
                && hasUtf16LengthAtMost(event.toolId, 128)
                && (event.inputSummary === undefined || hasUtf16LengthAtMost(event.inputSummary, 240));
        case "tool_finished":
            return hasUtf16LengthAtMost(event.sourceEventId, 200)
                && hasUtf16LengthAtMost(event.actionId, 200)
                && hasUtf16LengthAtMost(event.toolId, 128)
                && (event.summary === undefined || hasUtf16LengthAtMost(event.summary, 500));
        case "tool_attempt_started":
            return hasUtf16LengthAtMost(event.sourceEventId, 200)
                && hasUtf16LengthAtMost(event.actionId, 200);
        case "tool_attempt_failed":
            return hasUtf16LengthAtMost(event.sourceEventId, 200)
                && hasUtf16LengthAtMost(event.actionId, 200)
                && hasUtf16LengthAtMost(event.reason, 160);
        case "activity_boundary":
            return hasUtf16LengthAtMost(event.sourceEventId, 200);
        case "candidate_preview":
            return hasUtf16LengthAtMost(event.sourceEventId, 200)
                && hasUtf16LengthAtMost(event.candidateId, 200)
                && hasUtf16LengthAtMost(event.text, 64_000);
        case "candidate_invalidated":
            return hasUtf16LengthAtMost(event.sourceEventId, 200)
                && hasUtf16LengthAtMost(event.candidateId, 200);
        case "model_completed":
        case "step_started":
            return true;
    }
}

/**
 * SSE 事件中经 UTF-16 上限约束的摘要字段不变量。
 *
 * @param event - 已通过结构解析的实时推送事件。
 * @returns kind 专属摘要上限均成立时为 `true`。
 *
 * @example
 * ```ts
 * if (isLiveEventStructure(event)) console.log(event.type);
 * ```
 */
export function isLiveEventStructure(event: BrowserGoalLiveEvent): boolean {
    if (event.type === "activity") return isActivityEvent(event.activity);
    if (event.type === "message_committed") {
        return hasUtf16LengthAtMost(event.message.messageId, 200)
            && (event.message.previewId === undefined
                || hasUtf16LengthAtMost(event.message.previewId, 200));
    }
    if (event.type === "interaction_required") {
        return hasUtf16LengthAtMost(event.interaction.interactionId, 200);
    }
    return true;
}
