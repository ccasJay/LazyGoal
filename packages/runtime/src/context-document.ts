import { createHash } from "node:crypto";

import type { TrajectoryEvent, TrajectoryPhase, TrajectoryStore } from "./trajectory";
import { freezeTrajectoryEvent } from "./trajectory";

/** committed Context Document 构建失败时使用的稳定错误代码。 */
export const CONTEXT_DOCUMENT_SOURCE_ERROR_CODE = "CONTEXT_DOCUMENT_SOURCE_ERROR" as const;

/**
 * committed Trajectory 无法形成可检索文档时抛出的错误。
 *
 * @remarks
 * Builder 只接受当前 Goal/Run 的 Snapshot committed 前缀；该错误表示来源身份、
 * 顺序或已闭合单元结构违反契约。调用方不得使用部分文档继续查询，也不得修改
 * 原始 Trajectory。
 *
 * @example
 * ```ts
 * try {
 *     new ContextDocumentBuilder().build(input);
 * } catch (error) {
 *     if (error instanceof ContextDocumentSourceError) {
 *         console.error(error.code);
 *     }
 * }
 * ```
 */
export class ContextDocumentSourceError extends Error {
    /** 稳定的来源错误代码。 */
    readonly code = CONTEXT_DOCUMENT_SOURCE_ERROR_CODE;

    /** @param message - 不包含完整事件正文的稳定诊断信息。 */
    constructor(message: string, options?: { readonly cause?: unknown }) {
        super(`${CONTEXT_DOCUMENT_SOURCE_ERROR_CODE}: ${message}`, options);
        this.name = "ContextDocumentSourceError";
    }
}

/** Context Document 的来源类别。 */
export type ContextDocumentKind = "execution" | "preparation";

/** v2 联合索引的权威来源引用。 */
export type ContextDocumentSource =
    | {
        readonly kind: "trajectory";
        readonly firstSequence: number;
        readonly lastSequence: number;
        readonly sourceEventIds: readonly string[];
    }
    | {
        readonly kind: "conversation";
        readonly messageIndex: number;
        readonly role: "user" | "assistant";
        readonly contentHash: string;
    };

/** 文档在 committed Trajectory 中的闭区间来源范围。 */
export interface ContextDocumentSourceRange {
    /** 最早来源事件 sequence。 */
    readonly firstSequence: number;
    /** 最晚来源事件 sequence。 */
    readonly lastSequence: number;
}

/** Context Document 可建立倒排索引的字段名称。 */
export type ContextDocumentFieldName =
    | "eventType"
    | "toolId"
    | "actionId"
    | "stepIndex"
    | "path"
    | "errorCode"
    | "objectId"
    | "body";

/**
 * Context Document 的可检索字段。
 *
 * @remarks
 * 标识字段保留去重后的原始值；Tokenizer 可以在后续阶段对这些值执行版本化
 * 规范化和拆分。`body` 是确定性的事件事实投影，不代表当前 Workspace 状态。
 *
 * @example
 * ```ts
 * const fields: ContextDocumentFields = {
 *     eventType: ["decision_received"],
 *     toolId: ["read_file"],
 *     actionId: ["action-1"],
 *     stepIndex: [3],
 *     path: ["src/index.ts"],
 *     errorCode: [],
 *     objectId: [],
 *     body: "...",
 * };
 * ```
 */
export interface ContextDocumentFields {
    /** 组成文档的事件类型。 */
    readonly eventType: readonly string[];
    /** 文档中出现的 Tool 标识。 */
    readonly toolId: readonly string[];
    /** 文档中出现的 Action 标识。 */
    readonly actionId: readonly string[];
    /** 文档中出现的 Step 序号。 */
    readonly stepIndex: readonly number[];
    /** 文档中出现的文件路径或路径字段。 */
    readonly path: readonly string[];
    /** 文档中出现的错误代码。 */
    readonly errorCode: readonly string[];
    /** 文档中出现的对象标识。 */
    readonly objectId: readonly string[];
    /** 由事件事实组成的确定性正文。 */
    readonly body: string;
}

/**
 * 一个可交给后续 Tokenizer/排名器的 committed 历史文档。
 *
 * @remarks
 * 文档不保存完整原始事件，只保存有界查询所需的字段、正文和来源引用；原始
 * 事件始终留在 Trajectory。`documentId` 由 Goal/Run、文档类别和稳定单元身份
 * 派生，相同 committed 输入重复构建时保持不变。
 *
 * @example
 * ```ts
 * const document: ContextSearchDocument = {
 *     schemaVersion: 1,
 *     documentId: "context-doc-...",
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     kind: "execution",
 *     phase: "executing",
 *     firstSequence: 10,
 *     lastSequence: 14,
 *     sourceRange: { firstSequence: 10, lastSequence: 14 },
 *     sourceEventIds: ["event-10", "event-14"],
 *     fields,
 *     body: fields.body,
 * };
 * ```
 */
export interface ContextSearchDocument {
    /** 文档 DTO 版本。 */
    readonly schemaVersion: 1;
    /** 稳定文档标识。 */
    readonly documentId: string;
    /** 文档所属 Goal。 */
    readonly goalId: string;
    /** 文档所属 Run。 */
    readonly runId: string;
    /** 文档由执行单元还是准备阶段事实构成。 */
    readonly kind: ContextDocumentKind;
    /** 文档事件所属业务阶段。 */
    readonly phase: TrajectoryPhase;
    /** execution 文档的稳定执行单元标识。 */
    readonly executionUnitId?: string;
    /** 文档的最早来源 sequence。 */
    readonly firstSequence: number;
    /** 文档的最晚来源 sequence。 */
    readonly lastSequence: number;
    /** 文档的来源范围别名，便于结果 DTO 直接引用。 */
    readonly sourceRange: ContextDocumentSourceRange;
    /** 文档包含的原始来源事件 ID，按 sequence 顺序排列。 */
    readonly sourceEventIds: readonly string[];
    /** 稳定字段集合。 */
    readonly fields: ContextDocumentFields;
    /** `fields.body` 的顶层别名，便于排名器读取。 */
    readonly body: string;
    /** 字段顶层别名，保持索引代码简洁并避免复制字段提取逻辑。 */
    readonly eventTypes: readonly string[];
    readonly toolIds: readonly string[];
    readonly actionIds: readonly string[];
    readonly stepIndexes: readonly number[];
    readonly paths: readonly string[];
    readonly errorCodes: readonly string[];
    readonly objectIds: readonly string[];
    /** v2 来源联合引用；v1 Trajectory 文档省略。 */
    readonly source?: ContextDocumentSource;
}

/**
 * 从事件数组构建文档的输入。
 *
 * @example
 * ```ts
 * const input: ContextDocumentBuildInput = {
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     committedThroughSequence: 42,
 *     events,
 * };
 * ```
 */
export interface ContextDocumentBuildInput {
    /** 预期的 Goal 稳定标识。 */
    readonly goalId: string;
    /** 预期的 Run 稳定标识。 */
    readonly runId: string;
    /** 最新有效 Snapshot 的 committed boundary。 */
    readonly committedThroughSequence: number;
    /** Trajectory 事件；可包含 boundary 之后的 tail。 */
    readonly events: readonly TrajectoryEvent[];
}

/** Builder 读取 TrajectoryStore 时使用的 Goal/Run 与边界输入。 */
export interface ContextDocumentStoreInput {
    /** 只读 Trajectory Store。 */
    readonly trajectoryStore: TrajectoryStore;
    /** Goal 稳定标识。 */
    readonly goalId: string;
    /** Run 稳定标识。 */
    readonly runId: string;
    /** 最新有效 Snapshot 的 committed boundary。 */
    readonly committedThroughSequence: number;
}

/**
 * 一次 Builder 输出及其权威边界。
 *
 * @example
 * ```ts
 * const result = builder.buildResult(input);
 * console.log(result.committedThroughSequence, result.documents.length);
 * ```
 */
export interface ContextDocumentBuildResult {
    /** 构建所属 Goal。 */
    readonly goalId: string;
    /** 构建所属 Run。 */
    readonly runId: string;
    /** 构建使用的 Snapshot boundary。 */
    readonly committedThroughSequence: number;
    /** 按来源 sequence 从旧到新排列的完整文档。 */
    readonly documents: readonly ContextSearchDocument[];
}

const LOOKUP_EVENT_TYPES = new Set([
    "context_lookup_requested",
    "context_lookup_completed",
    "context_lookup_not_found",
    "context_lookup_failed",
]);

const EXECUTION_EVENT_TYPES = new Set([
    "decision_received",
    "action_staged",
    "tool_started",
    "tool_finished",
    "observation_recorded",
    "run_waiting",
    "run_completed",
    "run_failed",
    "run_cancelled",
    "execution_error",
]);

const PREPARATION_EVENT_TYPES = new Set([
    "preparation_result",
    "run_waiting",
    "run_resumed",
    "memory_patch_accepted",
    "action_approved",
    "action_rejected",
    "action_recovered",
]);

const TERMINAL_EVENT_TYPES = new Set([
    "run_completed",
    "run_waiting",
    "run_failed",
    "run_cancelled",
    "execution_error",
]);

type EventWithExecutionUnit = TrajectoryEvent & { readonly executionUnitId: string };

interface PreparationSegment {
    readonly events: readonly TrajectoryEvent[];
}

/**
 * 从 Snapshot committed Trajectory 构建稳定 Context Documents。
 *
 * @remarks
 * Builder 是无状态、无副作用组件。它再次按 boundary 过滤输入，严格校验
 * Goal/Run 身份与 sequence 顺序；`state_committed`、未提交 tail 和所有 lookup
 * 事件永远不会生成文档。带 `executionUnitId` 的执行事件跨 marker 聚合为一个
 * 完整文档；准备阶段事实按连续提交片段聚合，未闭合片段被忽略而不拆成孤立
 * 命中。结构矛盾会抛出 `CONTEXT_DOCUMENT_SOURCE_ERROR`。
 *
 * @example
 * ```ts
 * const builder = new ContextDocumentBuilder();
 * const documents = builder.build({
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     committedThroughSequence: 42,
 *     events,
 * });
 * ```
 */
export class ContextDocumentBuilder {
    /**
     * 从事件数组构建 committed 文档。
     *
     * @param input - Goal/Run、Snapshot boundary 与 Trajectory 事件。
     * @returns 按来源 sequence 排序且深度冻结的文档列表。
     * @throws ContextDocumentSourceError 当 committed 来源身份、顺序或结构非法。
     */
    build(input: ContextDocumentBuildInput): readonly ContextSearchDocument[];

    /**
     * 从事件数组构建 committed 文档（位置参数兼容形式）。
     *
     * @param events - Trajectory 事件，可包含 boundary 之后的 tail。
     * @param options - Goal/Run 与 committed boundary。
     * @returns 按来源 sequence 排序且深度冻结的文档列表。
     * @throws ContextDocumentSourceError 当 committed 来源身份、顺序或结构非法。
     */
    build(
        events: readonly TrajectoryEvent[],
        options: Omit<ContextDocumentBuildInput, "events">,
    ): readonly ContextSearchDocument[];

    build(
        inputOrEvents: ContextDocumentBuildInput | readonly TrajectoryEvent[],
        options?: Omit<ContextDocumentBuildInput, "events">,
    ): readonly ContextSearchDocument[] {
        const input: ContextDocumentBuildInput = Array.isArray(inputOrEvents)
            ? {
                ...(options ?? failMissingBuildOptions()),
                events: inputOrEvents as readonly TrajectoryEvent[],
            } as ContextDocumentBuildInput
            : inputOrEvents as ContextDocumentBuildInput;
        return this.buildResult(input).documents;
    }

    /**
     * 构建带边界元数据的结果 DTO。
     *
     * @param input - Goal/Run、Snapshot boundary 与 Trajectory 事件。
     * @returns 不共享输入引用的冻结构建结果。
     * @throws ContextDocumentSourceError 当 committed 来源身份、顺序或结构非法。
     */
    buildResult(input: ContextDocumentBuildInput): Readonly<ContextDocumentBuildResult> {
        const normalized = normalizeBuildInput(input);
        const committed = normalizeCommittedEvents(normalized);
        const executionGroups = collectExecutionGroups(committed);
        const preparationSegments = collectPreparationSegments(committed);
        const documents = [
            ...executionGroups
                .map((group) => buildExecutionDocument(group, normalized.goalId, normalized.runId))
                .filter((document): document is ContextSearchDocument => document !== undefined),
            ...preparationSegments
                .map((segment) => buildPreparationDocument(segment, normalized.goalId, normalized.runId))
                .filter((document): document is ContextSearchDocument => document !== undefined),
        ].sort(compareDocuments);

        return Object.freeze({
            goalId: normalized.goalId,
            runId: normalized.runId,
            committedThroughSequence: normalized.committedThroughSequence,
            documents: Object.freeze(documents),
        });
    }

    /**
     * 从 TrajectoryStore 的 committed 读取结果构建文档。
     *
     * @param input - TrajectoryStore、Goal/Run 与 Snapshot boundary。
     * @returns 只使用 Store 返回 committed 前缀的冻结构建结果。
     * @throws ContextDocumentSourceError 当输入或 committed 来源结构非法；Store
     *   读取错误原样传播。
     */
    async buildFromStore(
        input: ContextDocumentStoreInput,
    ): Promise<Readonly<ContextDocumentBuildResult>> {
        const options = normalizeStoreInput(input);
        const read = await options.trajectoryStore.readWithBoundary(
            { goalId: options.goalId, runId: options.runId },
            options.committedThroughSequence,
        );
        if (!isRecord(read) || !Array.isArray(read.committed)) {
            throw new ContextDocumentSourceError(
                "trajectoryStore.readWithBoundary returned an invalid result",
            );
        }
        return this.buildResult({
            goalId: options.goalId,
            runId: options.runId,
            committedThroughSequence: options.committedThroughSequence,
            events: read.committed,
        });
    }
}

/**
 * 构建 committed Context Documents 的函数式入口。
 *
 * @param input - Goal/Run、Snapshot boundary 与 Trajectory 事件。
 * @returns 深度冻结的文档列表。
 * @throws ContextDocumentSourceError 当 committed 来源身份、顺序或结构非法。
 * @example
 * ```ts
 * const documents = buildCommittedContextDocuments({
 *     goalId,
 *     runId,
 *     committedThroughSequence,
 *     events,
 * });
 * ```
 */
export function buildCommittedContextDocuments(
    input: ContextDocumentBuildInput,
): readonly ContextSearchDocument[] {
    return new ContextDocumentBuilder().build(input);
}

/**
 * 从 TrajectoryStore 构建 committed Context Documents。
 *
 * @param input - TrajectoryStore、Goal/Run 与 Snapshot boundary。
 * @returns 带边界的冻结构建结果。
 * @throws Store 读取错误或 ContextDocumentSourceError。
 * @example
 * ```ts
 * const result = await buildCommittedContextDocumentsFromStore({
 *     trajectoryStore,
 *     goalId,
 *     runId,
 *     committedThroughSequence,
 * });
 * ```
 */
export async function buildCommittedContextDocumentsFromStore(
    input: ContextDocumentStoreInput,
): Promise<Readonly<ContextDocumentBuildResult>> {
    return new ContextDocumentBuilder().buildFromStore(input);
}

function normalizeBuildInput(input: ContextDocumentBuildInput): ContextDocumentBuildInput {
    if (!isRecord(input)) {
        throw new ContextDocumentSourceError("build input must be an object");
    }
    assertNonEmptyString(input.goalId, "goalId");
    assertNonEmptyString(input.runId, "runId");
    assertBoundary(input.committedThroughSequence);
    if (!Array.isArray(input.events)) {
        throw new ContextDocumentSourceError("events must be an array");
    }
    return {
        goalId: input.goalId,
        runId: input.runId,
        committedThroughSequence: input.committedThroughSequence,
        events: input.events,
    };
}

function normalizeStoreInput(input: ContextDocumentStoreInput): ContextDocumentStoreInput {
    if (!isRecord(input) || !isRecord(input.trajectoryStore)) {
        throw new ContextDocumentSourceError("store input must include trajectoryStore");
    }
    assertNonEmptyString(input.goalId, "goalId");
    assertNonEmptyString(input.runId, "runId");
    assertBoundary(input.committedThroughSequence);
    if (typeof input.trajectoryStore.readWithBoundary !== "function") {
        throw new ContextDocumentSourceError("trajectoryStore.readWithBoundary is required");
    }
    return input;
}

function normalizeCommittedEvents(input: ContextDocumentBuildInput): readonly TrajectoryEvent[] {
    const committed: TrajectoryEvent[] = [];
    let previousSequence = 0;
    for (const sourceEvent of input.events) {
        if (!isRecord(sourceEvent)) {
            throw new ContextDocumentSourceError("Trajectory event must be an object");
        }
        const rawSequence = sourceEvent.sequence;
        if (
            typeof rawSequence !== "number"
            || !Number.isSafeInteger(rawSequence)
            || rawSequence <= 0
        ) {
            throw new ContextDocumentSourceError("Trajectory event sequence must be a positive safe integer");
        }
        if (rawSequence > input.committedThroughSequence) continue;

        let event: Readonly<TrajectoryEvent>;
        try {
            event = freezeTrajectoryEvent(sourceEvent as TrajectoryEvent) as Readonly<TrajectoryEvent>;
        } catch (error) {
            throw new ContextDocumentSourceError(
                `Trajectory event ${rawSequence} is invalid`,
                { cause: error },
            );
        }
        if (event.sequence <= previousSequence) {
            throw new ContextDocumentSourceError(
                "Committed Trajectory events must be strictly ordered by sequence",
            );
        }
        if (event.goalId !== input.goalId || event.runId !== input.runId) {
            throw new ContextDocumentSourceError(
                "Committed Trajectory contains cross-Goal or cross-Run events",
            );
        }
        previousSequence = event.sequence;
        committed.push(event);
    }
    return Object.freeze(committed);
}

function collectExecutionGroups(
    events: readonly TrajectoryEvent[],
): readonly (readonly EventWithExecutionUnit[])[] {
    const groups = new Map<string, EventWithExecutionUnit[]>();
    const order: string[] = [];
    const closed = new Set<string>();
    let activeUnitId: string | undefined;

    for (const event of events) {
        if (isLookupEvent(event) || event.eventType === "state_committed") continue;
        if (!isExecutionEvent(event)) continue;

        if (event.executionUnitId === undefined) {
            // 当前 Runtime 的旧错误事件可能没有 executionUnitId；它不能成为可检索
            // 单元，但也不应污染其它合法单元。
            continue;
        }

        const executionEvent = event as EventWithExecutionUnit;
        if (activeUnitId !== executionEvent.executionUnitId) {
            if (activeUnitId !== undefined) closed.add(activeUnitId);
            if (closed.has(executionEvent.executionUnitId)) {
                throw new ContextDocumentSourceError(
                    `Execution Unit ${executionEvent.executionUnitId} is not contiguous`,
                );
            }
            activeUnitId = executionEvent.executionUnitId;
            groups.set(activeUnitId, []);
            order.push(activeUnitId);
        }
        groups.get(executionEvent.executionUnitId)!.push(executionEvent);
    }

    return Object.freeze(order.map((unitId) => Object.freeze(groups.get(unitId)!)));
}

function collectPreparationSegments(
    events: readonly TrajectoryEvent[],
): readonly PreparationSegment[] {
    const segments: PreparationSegment[] = [];
    let current: TrajectoryEvent[] = [];
    let currentPhase: TrajectoryPhase | undefined;

    const flush = (): void => {
        if (current.length > 0) {
            segments.push({ events: Object.freeze([...current]) });
        }
        current = [];
        currentPhase = undefined;
    };

    for (const event of events) {
        if (
            event.eventType === "state_committed"
            || isLookupEvent(event)
            || isExecutionEvent(event)
        ) {
            flush();
            continue;
        }
        if (!PREPARATION_EVENT_TYPES.has(event.eventType) || event.phase === "executing") {
            flush();
            continue;
        }

        if (
            event.eventType === "preparation_result"
            && current.some((item) => item.eventType === "preparation_result")
        ) {
            flush();
        } else if (
            event.eventType === "run_resumed"
            && current.length > 0
        ) {
            // marker 可能因写入失败而缺失；run_resumed 仍然是新的准备周期边界。
            flush();
        }

        if (currentPhase !== undefined && currentPhase !== event.phase) flush();
        currentPhase = event.phase;
        current.push(event);
    }
    flush();
    return Object.freeze(segments.map((segment) => Object.freeze(segment)));
}

function buildExecutionDocument(
    events: readonly EventWithExecutionUnit[],
    goalId: string,
    runId: string,
): ContextSearchDocument | undefined {
    const decisions = events.filter((event) => event.eventType === "decision_received");
    if (decisions.length === 0) return undefined;
    if (decisions.length > 1) {
        throw new ContextDocumentSourceError(
            `Execution Unit ${events[0]!.executionUnitId} contains multiple decisions`,
        );
    }

    const decision = decisions[0]!.payload.decision;
    if (decision.kind === "context_lookup") return undefined;

    const terminals = events.filter((event) => TERMINAL_EVENT_TYPES.has(event.eventType));
    if (decision.kind === "tool_call") {
        if (terminals.length > 0) {
            throw new ContextDocumentSourceError(
                `Tool Execution Unit ${events[0]!.executionUnitId} contains a terminal event`,
            );
        }
        const staged = events.filter((event) => event.eventType === "action_staged");
        const started = events.filter((event) => event.eventType === "tool_started");
        const finished = events.filter((event) => event.eventType === "tool_finished");
        const observations = events.filter((event) => event.eventType === "observation_recorded");
        if (
            staged.length > 1
            || started.length > 1
            || finished.length > 1
            || observations.length > 1
        ) {
            throw new ContextDocumentSourceError(
                `Execution Unit ${events[0]!.executionUnitId} contains duplicate action lifecycle events`,
            );
        }
        if (
            staged.length !== 1
            || staged[0]!.payload.approvalStatus !== "approved"
            || started.length !== 1
            || finished.length !== 1
            || observations.length !== 1
        ) {
            return undefined;
        }
        const actionId = decision.action.actionId;
        if (
            staged[0]!.payload.action.actionId !== actionId
            || started[0]!.payload.actionId !== actionId
            || finished[0]!.payload.actionId !== actionId
            || observations[0]!.payload.actionId !== actionId
        ) {
            throw new ContextDocumentSourceError(
                `Execution Unit ${events[0]!.executionUnitId} contains mismatched action identities`,
            );
        }
    } else {
        if (terminals.length === 0) return undefined;
        if (terminals.length > 1) {
            throw new ContextDocumentSourceError(
                `Execution Unit ${events[0]!.executionUnitId} contains multiple terminal events`,
            );
        }
        const expected = decision.kind === "complete"
            ? "run_completed"
            : decision.kind === "wait"
                ? "run_waiting"
                : "run_failed";
        if (terminals[0]!.eventType !== expected) {
            throw new ContextDocumentSourceError(
                `Execution Unit ${events[0]!.executionUnitId} terminal does not match its decision`,
            );
        }
        if (events.some((event) => [
            "action_staged",
            "tool_started",
            "tool_finished",
            "observation_recorded",
        ].includes(event.eventType))) {
            throw new ContextDocumentSourceError(
                `Non-tool Execution Unit ${events[0]!.executionUnitId} contains Tool events`,
            );
        }
    }

    return createDocument(
        events,
        goalId,
        runId,
        "execution",
        "executing",
        events[0]!.executionUnitId,
    );
}

function buildPreparationDocument(
    segment: PreparationSegment,
    goalId: string,
    runId: string,
): ContextSearchDocument | undefined {
    const events = segment.events;
    const preparationResults = events.filter((event) => event.eventType === "preparation_result");
    if (preparationResults.length > 1) {
        throw new ContextDocumentSourceError("Preparation segment contains multiple results");
    }
    const hasPatch = events.some((event) => event.eventType === "memory_patch_accepted");
    const hasResume = events.some((event) => event.eventType === "run_resumed");

    if (preparationResults.length === 0) {
        // run_resumed + accepted Patch 是一个可追溯的准备阶段生命周期；其它孤立
        // 生命周期事实不提供可检索语义。
        if (!hasResume || !hasPatch) return undefined;
    } else {
        const result = preparationResults[0]!.payload.result;
        if (result === "context_lookup" || result === "context_checkpoint") return undefined;
        if (result === "question" || result === "task_proposal") {
            if (!events.some((event) => event.eventType === "run_waiting")) return undefined;
        }
    }

    return createDocument(
        events,
        goalId,
        runId,
        "preparation",
        events[0]!.phase,
    );
}

function createDocument(
    sourceEvents: readonly TrajectoryEvent[],
    goalId: string,
    runId: string,
    kind: ContextDocumentKind,
    phase: TrajectoryPhase,
    executionUnitId?: string,
): ContextSearchDocument {
    const eventIds = Object.freeze(sourceEvents.map((event) => event.eventId));
    const firstSequence = sourceEvents[0]!.sequence;
    const lastSequence = sourceEvents.at(-1)!.sequence;
    const fields = createFields(sourceEvents);
    const identity = {
        schemaVersion: 1,
        goalId,
        runId,
        kind,
        ...(executionUnitId === undefined ? {} : { executionUnitId }),
        sourceEventIds: eventIds,
    };
    const documentId = `context-doc-${createHash("sha256")
        .update(canonicalJson(identity), "utf8")
        .digest("hex")
        .slice(0, 32)}`;
    const sourceRange = Object.freeze({ firstSequence, lastSequence });
    const document: ContextSearchDocument = {
        schemaVersion: 1,
        documentId,
        goalId,
        runId,
        kind,
        phase,
        ...(executionUnitId === undefined ? {} : { executionUnitId }),
        firstSequence,
        lastSequence,
        sourceRange,
        sourceEventIds: eventIds,
        source: {
            kind: "trajectory" as const,
            firstSequence,
            lastSequence,
            sourceEventIds: eventIds,
        },
        fields,
        body: fields.body,
        eventTypes: fields.eventType,
        toolIds: fields.toolId,
        actionIds: fields.actionId,
        stepIndexes: fields.stepIndex,
        paths: fields.path,
        errorCodes: fields.errorCode,
        objectIds: fields.objectId,
    };
    return deepFreeze(document);
}

function createFields(events: readonly TrajectoryEvent[]): ContextDocumentFields {
    const eventType = uniqueSorted(events.map((event) => event.eventType));
    const toolId = uniqueSorted(events.flatMap((event) => collectStrings(event, "toolId")));
    const actionId = uniqueSorted([
        ...events.flatMap((event) => collectStrings(event, "actionId")),
        ...events.flatMap((event) => event.actionId === undefined ? [] : [event.actionId]),
    ]);
    const stepIndex = [...new Set([
        ...events.flatMap((event) => collectNumbers(event, "stepIndex")),
        ...events.flatMap((event) => event.stepIndex === undefined ? [] : [event.stepIndex]),
    ])].sort((left, right) => left - right);
    const path = uniqueSorted(events.flatMap((event) => collectStrings(event, "path")));
    const errorCode = uniqueSorted(events.flatMap((event) => collectStrings(event, "errorCode")));
    const objectId = uniqueSorted(events.flatMap((event) => collectStrings(event, "objectId")));
    const body = events
        .map((event) => canonicalJson({
            sequence: event.sequence,
            eventType: event.eventType,
            phase: event.phase,
            ...(event.executionUnitId === undefined ? {} : { executionUnitId: event.executionUnitId }),
            ...(event.stepIndex === undefined ? {} : { stepIndex: event.stepIndex }),
            ...(event.actionId === undefined ? {} : { actionId: event.actionId }),
            payload: event.payload,
        }))
        .join("\n");
    return deepFreeze({
        eventType: Object.freeze(eventType),
        toolId: Object.freeze(toolId),
        actionId: Object.freeze(actionId),
        stepIndex: Object.freeze(stepIndex),
        path: Object.freeze(path),
        errorCode: Object.freeze(errorCode),
        objectId: Object.freeze(objectId),
        body,
    });
}

function collectStrings(event: TrajectoryEvent, field: string): readonly string[] {
    const values: string[] = [];
    const payload = event.payload as unknown;
    collectByKey(payload, field, values, false);
    return values;
}

function collectNumbers(event: TrajectoryEvent, field: string): readonly number[] {
    const values: number[] = [];
    collectByKey(event.payload as unknown, field, values, true);
    return values;
}

function collectByKey(
    value: unknown,
    field: string,
    output: (string | number)[],
    numbers: boolean,
): void {
    if (Array.isArray(value)) {
        for (const child of value) collectByKey(child, field, output, numbers);
        return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
        const normalizedKey = key.replace(/[-_]/g, "").toLowerCase();
        const normalizedField = field.replace(/[-_]/g, "").toLowerCase();
        const matches = normalizedField === "path"
            ? normalizedKey.includes("path") || normalizedKey === "file"
            : normalizedField === "errorcode"
                ? normalizedKey === "code" || normalizedKey === "errorcode"
                : normalizedKey === normalizedField;
        if (matches) {
            if (numbers && typeof child === "number" && Number.isSafeInteger(child)) {
                output.push(child);
            } else if (!numbers && typeof child === "string" && child.trim().length > 0) {
                output.push(child);
            }
        }
        collectByKey(child, field, output, numbers);
    }
}

function isLookupEvent(event: TrajectoryEvent): boolean {
    if (LOOKUP_EVENT_TYPES.has(event.eventType)) return true;
    return event.eventType === "decision_received"
        && event.payload.decision.kind === "context_lookup";
}

function isExecutionEvent(event: TrajectoryEvent): boolean {
    if (event.phase !== "executing" || isLookupEvent(event)) return false;
    return EXECUTION_EVENT_TYPES.has(event.eventType)
        || (event.eventType === "memory_patch_accepted"
            && event.executionUnitId !== undefined);
}

function compareDocuments(left: ContextSearchDocument, right: ContextSearchDocument): number {
    return left.firstSequence - right.firstSequence
        || left.lastSequence - right.lastSequence
        || compareLexical(left.documentId, right.documentId);
}

function uniqueSorted(values: readonly string[]): string[] {
    return [...new Set(values)].sort(compareLexical);
}

function canonicalJson(value: unknown): string {
    const normalized = canonicalize(value);
    const serialized = JSON.stringify(normalized);
    return serialized === undefined ? "null" : serialized;
}

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((child) => canonicalize(child));
    if (!isRecord(value)) return value;
    return Object.fromEntries(
        Object.entries(value)
            .sort(([left], [right]) => compareLexical(left, right))
            .map(([key, child]) => [key, canonicalize(child)]),
    );
}

function compareLexical(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
    if (typeof value !== "object" || value === null || seen.has(value as object)) return value;
    seen.add(value as object);
    for (const child of Object.values(value as Record<string, unknown>)) {
        deepFreeze(child, seen);
    }
    return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new ContextDocumentSourceError(`${field} must be a non-empty string`);
    }
}

function assertBoundary(value: unknown): asserts value is number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new ContextDocumentSourceError(
            "committedThroughSequence must be a non-negative safe integer",
        );
    }
}

function failMissingBuildOptions(): never {
    throw new ContextDocumentSourceError("build options are required");
}
