/** GoalPlan Todo 的显式生命周期状态。 */
export type GoalPlanStatus =
    | "pending"
    | "in_progress"
    | "completed"
    | "cancelled";

/**
 * GoalPlan 中单个 Todo 的稳定持久化表示。
 *
 * @remarks
 * Todo 只记录计划顺序和进度，不持久化所属 Run 或执行授权。
 *
 * @example
 * ```ts
 * const item: GoalPlanItem = {
 *   id: "todo-1",
 *   content: "检查实现",
 *   position: 0,
 *   status: "pending",
 * };
 * ```
 */
export interface GoalPlanItem {
    /** Runtime 在 Goal 内分配且不会因重排改变的稳定 ID。 */
    readonly id: string;
    /** 用户可见的 Todo 内容；不承载执行授权或完成证据。 */
    readonly content: string;
    /** 当前显示顺序；Reducer 始终规范化为从 0 开始的连续整数。 */
    readonly position: number;
    /** Todo 的生命周期状态。 */
    readonly status: GoalPlanStatus;
}

/** Goal Snapshot 中唯一的结构化计划状态。 */
export interface GoalPlan {
    /** 每次成功 Patch 严格递增的计划 revision。 */
    readonly revision: number;
    /** 按 position 排序的 Todo 列表。 */
    readonly items: readonly GoalPlanItem[];
}

/** 模型可提出的 GoalPlan 增量操作。新增 Todo 的 ID 由 Runtime 分配。 */
export type GoalPlanPatchOperation =
    | {
        readonly type: "add";
        readonly content: string;
        /** 可选插入位置；省略时追加到末尾。 */
        readonly position?: number;
    }
    | {
        readonly type: "update";
        readonly id: string;
        readonly content?: string;
        /** 更新状态时仍由 Runtime 校验合法转换和 Evidence 边界。 */
        readonly status?: GoalPlanStatus;
    }
    | {
        readonly type: "reorder";
        readonly id: string;
        readonly position: number;
    }
    | {
        readonly type: "cancel";
        readonly id: string;
    };

/** 一批必须原子应用的 GoalPlan 增量变更。 */
export interface GoalPlanPatch {
    /** Patch 产生时模型看到的 revision；过期 Patch 必须整体拒绝。 */
    readonly baseRevision: number;
    readonly operations: readonly GoalPlanPatchOperation[];
}

/**
 * GoalPlan reducer 的容量限制与 ID 分配策略。
 *
 * @example
 * ```ts
 * const options: GoalPlanReducerOptions = { maxItems: 32 };
 * ```
 */
export interface GoalPlanReducerOptions {
    /** Goal 内允许的最大 Todo 数量。默认 32。 */
    readonly maxItems?: number;
    /** Runtime 分配新增 Todo ID；不得使用模型传入的 ID。 */
    readonly idFactory?: (ordinal: number, revision: number) => string;
}

/** GoalPlan reducer 的稳定错误码。 */
export const GOAL_PLAN_PATCH_ERROR_CODE = "INVALID_GOAL_PLAN_PATCH" as const;

/** GoalPlan 的容量上限；该限制避免计划无限增长到模型上下文。 */
export const DEFAULT_GOAL_PLAN_MAX_ITEMS = 32;

/** 同一 Goal 同时允许的 `in_progress` Todo 数量。 */
export const GOAL_PLAN_MAX_IN_PROGRESS = 1;

/** 表示 GoalPlan Patch 未通过原子校验。 */
export class GoalPlanPatchError extends Error {
    readonly code = GOAL_PLAN_PATCH_ERROR_CODE;

    /** @param message - 不包含模型原文的稳定诊断文本。 */
    constructor(message: string) {
        super(`${GOAL_PLAN_PATCH_ERROR_CODE}: ${message}`);
        this.name = "GoalPlanPatchError";
    }
}

/** Reducer 的成功或失败结果；失败时返回原始 plan，保证调用方不会部分提交。 */
export type GoalPlanReducerResult =
    | { readonly ok: true; readonly plan: GoalPlan; readonly createdIds: readonly string[] }
    | {
        readonly ok: false;
        readonly plan: GoalPlan;
        readonly error: { readonly code: typeof GOAL_PLAN_PATCH_ERROR_CODE; readonly message: string };
    };

/** 创建 revision 为 0 的空 GoalPlan。 */
export function createEmptyGoalPlan(): GoalPlan {
    return { revision: 0, items: [] };
}

function fail(plan: GoalPlan, message: string): GoalPlanReducerResult {
    return {
        ok: false,
        plan,
        error: { code: GOAL_PLAN_PATCH_ERROR_CODE, message },
    };
}

function defaultIdFactory(ordinal: number, revision: number): string {
    return `todo-${revision + 1}-${ordinal}`;
}

function isStatus(value: unknown): value is GoalPlanStatus {
    return value === "pending"
        || value === "in_progress"
        || value === "completed"
        || value === "cancelled";
}

function canTransition(from: GoalPlanStatus, to: GoalPlanStatus): boolean {
    if (from === to) return true;
    switch (from) {
        case "pending":
            return to === "in_progress" || to === "cancelled";
        case "in_progress":
            return to === "pending" || to === "completed" || to === "cancelled";
        case "cancelled":
            return to === "pending";
        case "completed":
            return false;
    }
}

function normalizePositions(items: readonly GoalPlanItem[]): GoalPlanItem[] {
    return [...items]
        .sort((left, right) => left.position - right.position)
        .map((item, position) => ({
            ...item,
            position,
        }));
}

/**
 * 校验一个已持久化 GoalPlan 的结构和跨字段不变量。
 *
 * @param plan - 待校验的计划状态。
 * @throws GoalPlanPatchError 当 revision、ID、position 或状态非法时。
 * @example
 * ```ts
 * assertValidGoalPlan({ revision: 0, items: [] });
 * ```
 */
export function assertValidGoalPlan(plan: GoalPlan): void {
    if (!Number.isInteger(plan.revision) || plan.revision < 0) {
        throw new GoalPlanPatchError("plan.revision must be a non-negative integer");
    }
    if (!Array.isArray(plan.items)) {
        throw new GoalPlanPatchError("plan.items must be an array");
    }
    const ids = new Set<string>();
    let inProgress = 0;
    plan.items.forEach((item, index) => {
        if (typeof item.id !== "string" || item.id.trim().length === 0) {
            throw new GoalPlanPatchError(`plan.items[${index}].id must be non-empty`);
        }
        if (ids.has(item.id)) {
            throw new GoalPlanPatchError(`duplicate Todo ID: ${item.id}`);
        }
        ids.add(item.id);
        if (typeof item.content !== "string" || item.content.trim().length === 0) {
            throw new GoalPlanPatchError(`plan.items[${index}].content must be non-empty`);
        }
        if (!Number.isInteger(item.position) || item.position !== index) {
            throw new GoalPlanPatchError("plan item positions must be contiguous and ordered");
        }
        if (!isStatus(item.status)) {
            throw new GoalPlanPatchError(`invalid Todo status at position ${index}`);
        }
        if (item.status === "in_progress") inProgress += 1;
    });
    if (inProgress > GOAL_PLAN_MAX_IN_PROGRESS) {
        throw new GoalPlanPatchError("GoalPlan allows at most one in_progress Todo");
    }
}

function cloneItem(item: GoalPlanItem): GoalPlanItem {
    return {
        id: item.id,
        content: item.content,
        position: item.position,
        status: item.status,
    };
}

/**
 * 原子应用一批 GoalPlan Patch。
 *
 * @remarks
 * 所有操作先在临时数组中校验，任何一个操作失败都返回原 plan 与稳定错误；成功时
 * revision 只增加一次。新增 Todo 的 ID 始终由 Runtime 的 `idFactory` 生成。
 * 状态变更不包含 Run 身份或执行授权；调用方必须在进入 reducer 前完成对应授权和
 * Observation 校验。
 *
 * @param plan - 当前已提交的 GoalPlan。
 * @param patch - 带 baseRevision 的结构化增量操作。
 * @param options - 容量和 Runtime ID 分配策略。
 * @returns 成功的新计划或失败时的原计划。
 * @example
 * ```ts
 * const result = reduceGoalPlan(createEmptyGoalPlan(), {
 *   baseRevision: 0,
 *   operations: [{ type: "add", content: "检查实现" }],
 * });
 * ```
 */
export function reduceGoalPlan(
    plan: GoalPlan,
    patch: GoalPlanPatch,
    options: GoalPlanReducerOptions = {},
): GoalPlanReducerResult {
    try {
        assertValidGoalPlan(plan);
    } catch (error) {
        return fail(plan, error instanceof Error ? error.message : "invalid current GoalPlan");
    }
    if (!Number.isInteger(patch.baseRevision) || patch.baseRevision < 0) {
        return fail(plan, "patch.baseRevision must be a non-negative integer");
    }
    if (patch.baseRevision !== plan.revision) return fail(plan, "GoalPlan revision conflict");
    if (!Array.isArray(patch.operations) || patch.operations.length === 0) {
        return fail(plan, "GoalPlan patch must contain at least one operation");
    }
    const maxItems = options.maxItems ?? DEFAULT_GOAL_PLAN_MAX_ITEMS;
    if (!Number.isInteger(maxItems) || maxItems < 1) return fail(plan, "maxItems must be a positive integer");

    let items = plan.items.map(cloneItem);
    const createdIds: string[] = [];
    const idFactory = options.idFactory ?? defaultIdFactory;
    try {
        patch.operations.forEach((operation, operationIndex) => {
            if (operation.type === "add") {
                if (items.length >= maxItems) throw new GoalPlanPatchError("GoalPlan capacity exceeded");
                if (typeof operation.content !== "string" || operation.content.trim().length === 0) {
                    throw new GoalPlanPatchError(`add operation ${operationIndex} content must be non-empty`);
                }
                const position = operation.position ?? items.length;
                if (!Number.isInteger(position) || position < 0 || position > items.length) {
                    throw new GoalPlanPatchError(`add operation ${operationIndex} position is invalid`);
                }
                const id = idFactory(createdIds.length + 1, plan.revision);
                if (typeof id !== "string" || id.trim().length === 0 || items.some((item) => item.id === id)) {
                    throw new GoalPlanPatchError("Runtime generated Todo ID is invalid or duplicated");
                }
                items = [
                    ...items.slice(0, position),
                    { id, content: operation.content, position, status: "pending" },
                    ...items.slice(position),
                ];
                items = normalizePositions(items);
                createdIds.push(id);
                return;
            }

            const index = items.findIndex((item) => item.id === operation.id);
            if (index < 0) throw new GoalPlanPatchError(`unknown Todo ID: ${operation.id}`);
            if (operation.type === "update") {
                if (operation.content === undefined && operation.status === undefined) {
                    throw new GoalPlanPatchError("update operation must change content or status");
                }
                const current = items[index]!;
                let next: GoalPlanItem = {
                    ...current,
                    ...(operation.content === undefined ? {} : { content: operation.content }),
                };
                if (operation.content !== undefined && operation.content.trim().length === 0) {
                    throw new GoalPlanPatchError("Todo content must be non-empty");
                }
                if (operation.status !== undefined) {
                    if (!isStatus(operation.status) || !canTransition(current.status, operation.status)) {
                        throw new GoalPlanPatchError(`invalid Todo status transition ${current.status} -> ${String(operation.status)}`);
                    }
                    if (operation.status === "in_progress" && items.some((item) => item.status === "in_progress" && item.id !== current.id)) {
                        throw new GoalPlanPatchError("GoalPlan allows at most one in_progress Todo");
                    }
                    next = { ...next, status: operation.status };
                }
                items[index] = next;
                return;
            }

            if (operation.type === "cancel") {
                const current = items[index]!;
                if (!canTransition(current.status, "cancelled")) {
                    throw new GoalPlanPatchError(`cannot cancel Todo in ${current.status} state`);
                }
                items[index] = { ...current, status: "cancelled" };
                return;
            }

            if (!Number.isInteger(operation.position) || operation.position < 0 || operation.position >= items.length) {
                throw new GoalPlanPatchError(`reorder operation ${operationIndex} position is invalid`);
            }
            const [moved] = items.splice(index, 1);
            items.splice(operation.position, 0, moved!);
            items = normalizePositions(items);
        });
        const nextPlan: GoalPlan = { revision: plan.revision + 1, items: normalizePositions(items) };
        assertValidGoalPlan(nextPlan);
        return { ok: true, plan: nextPlan, createdIds };
    } catch (error) {
        return fail(plan, error instanceof Error ? error.message : "invalid GoalPlan patch");
    }
}

/** `applyGoalPlanPatch` 是 reducer 的语义别名，供调用方按写入语义命名。 */
export const applyGoalPlanPatch = reduceGoalPlan;
