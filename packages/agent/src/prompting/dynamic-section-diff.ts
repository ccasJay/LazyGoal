import type {
    ModelContextFramePayload,
    ModelContextSectionIdentity,
    ModelContextSectionUpdate,
} from "../../../runtime/src/index";
import type {
    DynamicSectionIdentity,
    DynamicSectionMessage,
} from "./dynamic-section-registry";

/** 动态 Section 投影或历史基线无法可靠比较时的稳定错误码。 */
export const DYNAMIC_SECTION_DIFF_ERROR_CODE = "DYNAMIC_SECTION_DIFF_INVALID" as const;

/**
 * 动态 Section 的投影或已提交基线违反当前注册契约。
 *
 * @remarks
 * 该错误必须在调用模型前抛出，调用方不得使用不完整或过期状态继续构造请求。
 * 错误消息不包含投影正文、Section 内容或 Conversation。
 *
 * @example
 * ```ts
 * try {
 *     planDynamicSectionUpdates(registry.identities(), sections, frames);
 * } catch (error) {
 *     if (error instanceof DynamicSectionDiffError) throw error;
 * }
 * ```
 */
export class DynamicSectionDiffError extends Error {
    readonly code = DYNAMIC_SECTION_DIFF_ERROR_CODE;

    /** @param message - 不包含动态投影正文的稳定诊断原因。 */
    constructor(message: string) {
        super(`${DYNAMIC_SECTION_DIFF_ERROR_CODE}: ${message}`);
        this.name = "DynamicSectionDiffError";
    }
}

/**
 * 交给模型的动态 Section 更新消息，不暴露内部比较投影。
 *
 * @example
 * ```ts
 * const message: DynamicSectionUpdateMessage = {
 *     sectionId: "goal_plan", order: 30, source: "GoalState.goalPlan",
 *     role: "user", templateId: "goal-plan@1", content: "已替换当前计划",
 * };
 * ```
 */
export interface DynamicSectionUpdateMessage extends DynamicSectionIdentity {
    /** 作为独立消息发送的当前状态、替换说明或失效 tombstone。 */
    readonly content: string;
}

/**
 * Section diff 同时产出的模型消息和可持久化 frame 更新。
 *
 * @example
 * ```ts
 * const result: DynamicSectionUpdatePlan = {
 *     messages: [], retainedMessages: [], requestMessages: [], frameSections: [],
 * };
 * ```
 */
export interface DynamicSectionUpdatePlan {
    /** 按注册顺序发送的动态状态更新。 */
    readonly messages: readonly DynamicSectionUpdateMessage[];
    /** 已提交 frame 中最新且未变化的 Section 消息；用于重建本次无状态请求。 */
    readonly retainedMessages: readonly DynamicSectionUpdateMessage[];
    /** 重建完整请求时应发送的唯一最新状态，每个已知 Section 至多一条。 */
    readonly requestMessages: readonly DynamicSectionUpdateMessage[];
    /** 与实际消息一一对应、写入后续模型上下文 frame 的结构化记录。 */
    readonly frameSections: readonly ModelContextSectionUpdate[];
}

function fail(sectionId: string, reason: string): never {
    throw new DynamicSectionDiffError(`section ${sectionId}: ${reason}`);
}

function freezeDeep<T>(value: T): T {
    if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    return Object.freeze(value);
}

function normalizeJsonProjection(value: unknown, sectionId: string): ModelContextSectionUpdate["projection"] {
    const ancestors = new WeakSet<object>();

    const normalize = (input: unknown, depth = 0): ModelContextSectionUpdate["projection"] => {
        if (depth > 64) fail(sectionId, "projection exceeds maximum depth");
        if (input === null || typeof input === "string" || typeof input === "boolean") return input;
        if (typeof input === "number") {
            if (!Number.isFinite(input)) fail(sectionId, "projection contains a non-finite number");
            return Object.is(input, -0) ? 0 : input;
        }
        if (typeof input !== "object") fail(sectionId, "projection is not JSON data");
        if (ancestors.has(input)) fail(sectionId, "projection contains a cycle");
        ancestors.add(input);
        try {
            if (Array.isArray(input)) {
                if (Object.getOwnPropertySymbols(input).length > 0) {
                    fail(sectionId, "projection arrays must not contain symbol keys");
                }
                const items: (ModelContextSectionUpdate["projection"])[] = [];
                for (let index = 0; index < input.length; index += 1) {
                    if (!Object.hasOwn(input, index)) fail(sectionId, "projection contains a sparse array");
                    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
                    if (descriptor === undefined || !("value" in descriptor)) {
                        fail(sectionId, "projection arrays must not contain accessor properties");
                    }
                    items.push(normalize(descriptor.value, depth + 1));
                }
                if (Object.keys(input).some((key) =>
                    !/^\d+$/.test(key) || String(Number(key)) !== key || Number(key) >= input.length,
                )) {
                    fail(sectionId, "projection arrays must not contain named properties");
                }
                return items;
            }
            const prototype = Object.getPrototypeOf(input);
            if (prototype !== Object.prototype && prototype !== null) {
                fail(sectionId, "projection must contain only plain objects");
            }
            if (Object.getOwnPropertySymbols(input).length > 0) {
                fail(sectionId, "projection must not contain symbol keys");
            }
            const output: Record<string, ModelContextSectionUpdate["projection"]> = {};
            for (const key of Object.keys(input).sort()) {
                const descriptor = Object.getOwnPropertyDescriptor(input, key);
                if (descriptor === undefined || !("value" in descriptor)) {
                    fail(sectionId, "projection must not contain accessor properties");
                }
                Object.defineProperty(output, key, {
                    value: normalize(descriptor.value, depth + 1),
                    enumerable: true,
                    configurable: true,
                    writable: true,
                });
            }
            return output;
        } catch (error) {
            if (error instanceof DynamicSectionDiffError) throw error;
            fail(sectionId, "projection could not be normalized");
        } finally {
            ancestors.delete(input);
        }
    };

    return freezeDeep(normalize(value));
}

function sameIdentity(
    actual: ModelContextSectionIdentity,
    expected: ModelContextSectionIdentity,
): boolean {
    return actual.sectionId === expected.sectionId
        && actual.order === expected.order
        && actual.source === expected.source
        && actual.role === expected.role
        && actual.templateId === expected.templateId;
}

function identityOf(section: DynamicSectionMessage): ModelContextSectionIdentity {
    return {
        sectionId: section.sectionId,
        order: section.order,
        source: section.source,
        role: section.role,
        templateId: section.templateId,
    };
}

function assertRegisteredIdentity(
    identity: ModelContextSectionIdentity,
    registered: ReadonlyMap<string, DynamicSectionIdentity>,
): void {
    const expected = registered.get(identity.sectionId);
    if (expected === undefined) fail(identity.sectionId, "section is not registered");
    if (!sameIdentity(identity, expected)) fail(identity.sectionId, "section identity does not match registry");
}

function replacementMessage(section: DynamicSectionMessage): string {
    return `[Dynamic section update: ${section.sectionId}; source: ${section.source}; operation: replace]\n`
        + "The complete current state below replaces all earlier content for this section.\n\n"
        + section.content;
}

function invalidationMessage(section: ModelContextSectionUpdate): string {
    return `[Dynamic section update: ${section.sectionId}; source: ${section.source}; operation: invalidate]\n`
        + "This section is no longer active. Ignore and do not use any earlier content for this section.";
}

function createActiveRecord(
    section: DynamicSectionMessage,
    projection: ModelContextSectionUpdate["projection"],
    content: string,
): ModelContextSectionUpdate {
    return {
        ...identityOf(section),
        status: "active",
        projection,
        content,
    };
}

/**
 * 依据同阶段保留的已提交 frame，为动态 section 生成完整注入、整段替换或失效 tombstone。
 *
 * @remarks
 * 函数只比较各 Section 的规范化 JSON 投影，不比较 Runtime 全量状态或整条 Prompt 文本。
 * `baselineFrames` 必须已由 Runtime 按 Goal/Run、阶段、Epoch、Conversation 起点及 Snapshot
 * 提交边界筛选；`sectionIdentities` 来自当前 Registry。每个更新消息都同步产生可恢复的结构化记录；比较
 * 状态不会被直接发送给模型。
 *
 * @param sectionIdentities - 显式 Section 注册表提供的稳定身份与顺序。
 * @param currentSections - 当前 View 渲染出的全部有效 Section。
 * @param baselineFrames - 当前请求实际保留历史中的已提交模型上下文 frame。
 * @returns 只含发生变化的模型消息及一一对应的持久化记录。
 * @throws `DynamicSectionDiffError` 当投影不是 JSON 数据、历史/当前身份不匹配、存在重复
 *   section 或内容不能安全比较时抛出；请求不得继续发送。
 * @example
 * ```ts
 * const plan = planDynamicSectionUpdates(registry.identities(), renderer.renderDynamicSections(view), frames);
 * const messages = plan.messages.map(({ role, content }) => ({ role, content }));
 * ```
 */
export function planDynamicSectionUpdates(
    sectionIdentities: readonly DynamicSectionIdentity[],
    currentSections: readonly DynamicSectionMessage[],
    baselineFrames: readonly ModelContextFramePayload[],
): Readonly<DynamicSectionUpdatePlan> {
    const registered = new Map<string, DynamicSectionIdentity>();
    for (const identity of sectionIdentities) {
        if (registered.has(identity.sectionId)) fail(identity.sectionId, "registry contains duplicate identity");
        registered.set(identity.sectionId, identity);
    }

    const baseline = new Map<string, ModelContextSectionUpdate>();
    for (const frame of baselineFrames) {
        if (frame.type !== "model_context_frame") {
            throw new DynamicSectionDiffError("baseline contains an unknown frame type");
        }
        const frameIds = new Set<string>();
        for (const section of frame.sections) {
            if (frameIds.has(section.sectionId)) fail(section.sectionId, "baseline frame contains duplicate section");
            frameIds.add(section.sectionId);
            assertRegisteredIdentity(section, registered);
            if (section.status === "active") {
                baseline.set(section.sectionId, {
                    ...section,
                    projection: normalizeJsonProjection(section.projection, section.sectionId),
                });
            } else {
                if (section.projection !== null) fail(section.sectionId, "invalidated baseline must have a null projection");
                baseline.set(section.sectionId, section);
            }
        }
    }

    const currentById = new Map<string, DynamicSectionMessage>();
    const normalizedCurrent = new Map<string, ModelContextSectionUpdate["projection"]>();
    for (const section of currentSections) {
        const identity = identityOf(section);
        assertRegisteredIdentity(identity, registered);
        if (currentById.has(section.sectionId)) fail(section.sectionId, "current projection contains duplicate section");
        if (section.content.trim().length === 0) fail(section.sectionId, "rendered content is empty");
        currentById.set(section.sectionId, section);
        normalizedCurrent.set(
            section.sectionId,
            normalizeJsonProjection(section.projection, section.sectionId),
        );
    }

    const messages: DynamicSectionUpdateMessage[] = [];
    const retainedMessages: DynamicSectionUpdateMessage[] = [];
    const frameSections: ModelContextSectionUpdate[] = [];

    for (const [sectionId, section] of currentById) {
        const projection = normalizedCurrent.get(sectionId)!;
        const previous = baseline.get(sectionId);
        if (previous?.status === "active"
            && JSON.stringify(previous.projection) === JSON.stringify(projection)) {
            retainedMessages.push({
                sectionId: previous.sectionId,
                order: previous.order,
                source: previous.source,
                role: previous.role,
                templateId: previous.templateId,
                content: previous.content,
            });
            continue;
        }
        const content = previous === undefined
            ? section.content
            : replacementMessage(section);
        messages.push({ ...identityOf(section), content });
        frameSections.push(createActiveRecord(section, projection, content));
    }

    for (const [sectionId, previous] of baseline) {
        if (currentById.has(sectionId)) continue;
        if (previous.status !== "active") {
            retainedMessages.push({
                sectionId: previous.sectionId,
                order: previous.order,
                source: previous.source,
                role: previous.role,
                templateId: previous.templateId,
                content: previous.content,
            });
            continue;
        }
        const content = invalidationMessage(previous);
        messages.push({
            sectionId: previous.sectionId,
            order: previous.order,
            source: previous.source,
            role: previous.role,
            templateId: previous.templateId,
            content,
        });
        frameSections.push({ ...previous, status: "invalidated", projection: null, content });
    }

    const identityOrder = (left: DynamicSectionIdentity, right: DynamicSectionIdentity) => left.order - right.order;
    messages.sort(identityOrder);
    retainedMessages.sort(identityOrder);
    frameSections.sort(identityOrder);
    const requestMessages = [...retainedMessages, ...messages].sort(identityOrder);
    return Object.freeze({
        messages: Object.freeze(messages.map((message) => Object.freeze(message))),
        retainedMessages: Object.freeze(retainedMessages.map((message) => Object.freeze(message))),
        requestMessages: Object.freeze(requestMessages.map((message) => Object.freeze(message))),
        frameSections: Object.freeze(frameSections.map((section) => freezeDeep(section))),
    });
}
