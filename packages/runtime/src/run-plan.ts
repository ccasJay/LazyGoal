import type { RunPlanRouteCandidate } from "../../model-contracts/src/index";
import { reviseRunStage, type RunStageState } from "./run-stage";

export type { RunPlanRouteCandidate } from "../../model-contracts/src/index";

/**
 * Plan Run 路线中的单个阶段状态。
 *
 * @remarks
 * 阶段身份和状态由 Runtime 管理；阶段按路线顺序从 `pending` 转为 `executing`，再转为
 * `accepted`。接受序列只记录已提交的 Trajectory 边界。
 *
 * @example
 * ```ts
 * const stage: RunPlanStageState = {
 *     stageId: "stage-1", revision: 1, status: "pending",
 *     target: "调查入口", acceptanceCriteria: ["定位实现"],
 * };
 * ```
 */
export interface RunPlanStageState {
    readonly stageId: string;
    readonly revision: number;
    readonly status: "pending" | "executing" | "accepted";
    readonly target: string;
    readonly acceptanceCriteria: readonly string[];
    readonly acceptedSequence?: number;
}

/**
 * Plan Run 的 Runtime 权威路线状态。
 *
 * @remarks
 * `nextStageIndex` 指向唯一可激活阶段；小于该位置的阶段必须已接受，之后阶段必须待执行。
 * `nextStageOrdinal` 只增不减，供后续路线修订分配不复用的阶段身份。普通 Run 不持有此状态。
 *
 * @example
 * ```ts
 * const route: RunPlanRouteState = {
 *     revision: 1, nextStageIndex: 0, nextStageOrdinal: 2,
 *     stages: [{ stageId: "stage-1", revision: 1, status: "pending", target: "调查", acceptanceCriteria: ["定位入口"] }],
 * };
 * ```
 */
export interface RunPlanRouteState {
    readonly revision: number;
    /** 最近一次路线变更的 Agent 理由；初始路线没有变更理由。 */
    readonly revisionReason?: string;
    readonly nextStageIndex: number;
    readonly nextStageOrdinal: number;
    readonly stages: readonly RunPlanStageState[];
}

/**
 * Plan Run 路线状态转换错误。
 *
 * @example
 * ```ts
 * throw new RunPlanTransitionError("只能激活路线中的下一个阶段");
 * ```
 */
export class RunPlanTransitionError extends Error {
    /** @param message - 描述路线状态转换失败原因的中文信息。 */
    constructor(message: string) {
        super(message);
        this.name = "RunPlanTransitionError";
    }
}

function nonEmpty(value: string, label: string): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) throw new RunPlanTransitionError(`${label} 不能为空`);
    return trimmed;
}

/**
 * 校验完整路线状态的阶段顺序、游标、身份唯一性与状态前缀。
 *
 * @param route - 待校验的 Runtime 路线状态。
 * @returns 当路线满足当前状态不变量时正常返回。
 * @throws RunPlanTransitionError 当路线为空、游标越界、状态不符合顺序或身份重复时抛出。
 */
export function assertValidRunPlanRoute(route: RunPlanRouteState): void {
    if (!Number.isSafeInteger(route.revision) || route.revision < 1) {
        throw new RunPlanTransitionError("路线 revision 必须是正整数");
    }
    if (route.revisionReason !== undefined && nonEmpty(route.revisionReason, "revisionReason") !== route.revisionReason) {
        throw new RunPlanTransitionError("revisionReason 不能为空白");
    }
    if (route.stages.length === 0) throw new RunPlanTransitionError("路线至少包含一个阶段");
    if (!Number.isSafeInteger(route.nextStageIndex)
        || route.nextStageIndex < 0
        || route.nextStageIndex > route.stages.length) {
        throw new RunPlanTransitionError("路线阶段游标越界");
    }
    if (!Number.isSafeInteger(route.nextStageOrdinal) || route.nextStageOrdinal < 1) {
        throw new RunPlanTransitionError("nextStageOrdinal 必须是正整数");
    }

    const ids = new Set<string>();
    let maximumOrdinal = 0;
    route.stages.forEach((stage, index) => {
        if (nonEmpty(stage.stageId, `stages[${index}].stageId`) !== stage.stageId || ids.has(stage.stageId)) {
            throw new RunPlanTransitionError("阶段身份必须非空且唯一");
        }
        ids.add(stage.stageId);
        const ordinal = /^stage-(\d+)$/.exec(stage.stageId)?.[1];
        if (ordinal !== undefined) maximumOrdinal = Math.max(maximumOrdinal, Number(ordinal));
        if (!Number.isSafeInteger(stage.revision) || stage.revision < 1) {
            throw new RunPlanTransitionError(`阶段 ${stage.stageId} revision 必须是正整数`);
        }
        if (nonEmpty(stage.target, `stages[${index}].target`) !== stage.target
            || stage.acceptanceCriteria.length === 0
            || stage.acceptanceCriteria.some((criterion) => nonEmpty(criterion, "acceptanceCriteria") !== criterion)) {
            throw new RunPlanTransitionError(`阶段 ${stage.stageId} 的目标和验收条件必须非空`);
        }
        const expectedStatus = index < route.nextStageIndex
            ? "accepted"
            : index === route.nextStageIndex && stage.status === "executing"
                ? "executing"
                : "pending";
        if (stage.status !== expectedStatus) {
            throw new RunPlanTransitionError("阶段状态必须与路线顺序和游标一致");
        }
        if ((stage.status === "accepted") !== (stage.acceptedSequence !== undefined)) {
            throw new RunPlanTransitionError("仅已接受阶段可包含 acceptedSequence");
        }
        if (stage.acceptedSequence !== undefined
            && (!Number.isSafeInteger(stage.acceptedSequence) || stage.acceptedSequence < 0)) {
            throw new RunPlanTransitionError("acceptedSequence 必须是非负整数");
        }
    });
    if (route.nextStageOrdinal <= maximumOrdinal) {
        throw new RunPlanTransitionError("nextStageOrdinal 必须大于已分配的阶段序号");
    }
}

/**
 * 将模型的路线候选转换为由 Runtime 分配身份的初始路线。
 *
 * @param candidate - 已通过模型输出契约校验的有序路线候选。
 * @returns 所有阶段均待执行、路线修订为 1 的 Runtime 状态。
 * @throws RunPlanTransitionError 当目标或验收条件为空，或路线没有阶段时抛出。
 *
 * @example
 * ```ts
 * const route = createRunPlanRoute({ stages: [{ target: "调查", acceptanceCriteria: ["定位入口"] }] });
 * ```
 */
export function createRunPlanRoute(candidate: RunPlanRouteCandidate): RunPlanRouteState {
    if (candidate.stages.length === 0) {
        throw new RunPlanTransitionError("路线至少包含一个阶段");
    }
    const stages = candidate.stages.map((stage, index): RunPlanStageState => ({
        stageId: `stage-${index + 1}`,
        revision: 1,
        status: "pending",
        target: nonEmpty(stage.target, `stages[${index}].target`),
        acceptanceCriteria: stage.acceptanceCriteria.map((criterion, criterionIndex) =>
            nonEmpty(criterion, `stages[${index}].acceptanceCriteria[${criterionIndex}]`)),
    }));
    const route: RunPlanRouteState = {
        revision: 1,
        nextStageIndex: 0,
        nextStageOrdinal: stages.length + 1,
        stages,
    };
    assertValidRunPlanRoute(route);
    return route;
}

/**
 * 激活路线游标指向的阶段。
 *
 * @param route - 当前路线状态。
 * @param stageId - 调用方预期激活的稳定阶段身份。
 * @returns 更新后的路线状态。
 * @throws RunPlanTransitionError 当身份不是下一个阶段或该阶段不处于待执行状态时抛出。
 */
export function activateRunPlanStage(route: RunPlanRouteState, stageId: string): RunPlanRouteState {
    assertValidRunPlanRoute(route);
    const current = route.stages[route.nextStageIndex];
    if (current === undefined || current.stageId !== stageId || current.status !== "pending") {
        throw new RunPlanTransitionError("只能激活路线中的下一个待执行阶段");
    }
    const next: RunPlanRouteState = {
        ...route,
        stages: route.stages.map((stage, index) => index === route.nextStageIndex
            ? { ...stage, status: "executing" }
            : stage),
    };
    assertValidRunPlanRoute(next);
    return next;
}

/**
 * 接受当前执行阶段并推进路线游标。
 *
 * @param route - 当前路线状态。
 * @param stageId - 当前活动阶段身份。
 * @param acceptedSequence - 已提交阶段接受事实的 Trajectory sequence。
 * @returns 推进游标后的路线状态；最后阶段接受后游标等于阶段数。
 * @throws RunPlanTransitionError 当阶段未执行、身份不匹配或提交序列无效时抛出。
 */
export function acceptRunPlanStage(
    route: RunPlanRouteState,
    stageId: string,
    acceptedSequence: number,
): RunPlanRouteState {
    assertValidRunPlanRoute(route);
    const current = route.stages[route.nextStageIndex];
    if (current === undefined || current.stageId !== stageId || current.status !== "executing") {
        throw new RunPlanTransitionError("只能接受当前执行中的路线阶段");
    }
    if (!Number.isSafeInteger(acceptedSequence) || acceptedSequence < 0) {
        throw new RunPlanTransitionError("acceptedSequence 必须是非负整数");
    }
    const next: RunPlanRouteState = {
        ...route,
        nextStageIndex: route.nextStageIndex + 1,
        stages: route.stages.map((stage, index) => index === route.nextStageIndex
            ? { ...stage, status: "accepted", acceptedSequence }
            : stage),
    };
    assertValidRunPlanRoute(next);
    return next;
}

/**
 * 重新打开已接受的末阶段并回拨路线游标。
 *
 * @remarks
 * 最终交付审查拒绝时使用：路线内容、修订和已接受阶段保持不变，只把末阶段恢复为
 * `executing` 并清除其接受序列。调用方必须在同一检查点同步重开 `currentStage`，
 * 使两处接受指针一起失效；历史接受事实仍保留在 Trajectory 中。
 *
 * @param route - 当前全部阶段均已接受的路线状态。
 * @param stageId - 预期重开的末阶段稳定身份。
 * @returns 游标回拨到末阶段且该阶段为 `executing` 的路线。
 * @throws RunPlanTransitionError 当路线仍有未接受阶段、阶段身份不匹配或末阶段未接受时抛出。
 *
 * @example
 * ```ts
 * const reopened = reopenRunPlanStage(route, "stage-2");
 * ```
 */
export function reopenRunPlanStage(route: RunPlanRouteState, stageId: string): RunPlanRouteState {
    assertValidRunPlanRoute(route);
    const lastIndex = route.stages.length - 1;
    const last = route.stages[lastIndex];
    if (route.nextStageIndex !== route.stages.length
        || last === undefined
        || last.stageId !== stageId
        || last.status !== "accepted") {
        throw new RunPlanTransitionError("只能重开路线中已接受的末阶段");
    }
    const { acceptedSequence: _acceptedSequence, ...reopened } = last;
    const next: RunPlanRouteState = {
        ...route,
        nextStageIndex: lastIndex,
        stages: route.stages.map((stage, index) => index === lastIndex
            ? { ...reopened, status: "executing" }
            : stage),
    };
    assertValidRunPlanRoute(next);
    return next;
}

/**
 * 将一项经模型验证的阶段声明或当前阶段修订应用到获批路线。
 *
 * @remarks
 * 新阶段必须逐项匹配路线游标指向的候选；阶段目标/条件有变化时只可修订当前执行阶段，
 * 并同步递增路线与阶段 revision。未来阶段由完整路线保持为 pending。
 *
 * @param route - 当前 Runtime 权威路线。
 * @param input - 阶段声明或修订字段。
 * @returns 阶段声明/修订后路线；仅声明时把下一个阶段标记为 executing。
 * @throws RunPlanTransitionError 当没有下一阶段、跳过路线或修订身份/版本不匹配时抛出。
 *
 * @example
 * ```ts
 * const activated = updateRunPlanStage(route, {
 *   target: "调查", acceptanceCriteria: ["定位入口"],
 * });
 * ```
 */
export function updateRunPlanStage(
    route: RunPlanRouteState,
    input: {
        readonly target: string;
        readonly acceptanceCriteria: readonly string[];
        readonly stageId?: string;
        readonly baseRevision?: number;
        readonly reason?: string;
    },
): RunPlanRouteState {
    assertValidRunPlanRoute(route);
    const target = nonEmpty(input.target, "target");
    const acceptanceCriteria = input.acceptanceCriteria.map((criterion, index) =>
        nonEmpty(criterion, `acceptanceCriteria[${index}]`));
    if (acceptanceCriteria.length === 0) {
        throw new RunPlanTransitionError("acceptanceCriteria 不能为空数组");
    }

    if (input.stageId === undefined) {
        const current = route.stages[route.nextStageIndex];
        if (current === undefined || current.status !== "pending") {
            throw new RunPlanTransitionError("路线没有可声明的下一个阶段");
        }
        if (target !== current.target
            || acceptanceCriteria.length !== current.acceptanceCriteria.length
            || acceptanceCriteria.some((criterion, index) => criterion !== current.acceptanceCriteria[index])) {
            throw new RunPlanTransitionError("新阶段必须匹配获批路线中的目标和验收条件");
        }
        return activateRunPlanStage(route, current.stageId);
    }

    const current = route.stages[route.nextStageIndex];
    if (current === undefined || current.status !== "executing" || current.stageId !== input.stageId) {
        throw new RunPlanTransitionError("只能修订路线中的当前执行阶段");
    }
    if (input.baseRevision !== current.revision) {
        throw new RunPlanTransitionError("阶段修订版本与路线状态不匹配");
    }
    const reason = input.reason?.trim();
    if (!reason) throw new RunPlanTransitionError("Plan 路线阶段修订必须提供理由");
    const next: RunPlanRouteState = {
        ...route,
        revision: route.revision + 1,
        revisionReason: reason,
        stages: route.stages.map((stage, index) => index === route.nextStageIndex
            ? { ...stage, revision: stage.revision + 1, target, acceptanceCriteria }
            : stage),
    };
    assertValidRunPlanRoute(next);
    return next;
}

/**
 * 依据新证据修订获批 Plan 路线，同时保留已接受结果和可识别的待执行阶段身份。
 *
 * @remarks
 * 已接受阶段必须作为原样前缀保留；活动阶段必须留在原位置，可在同一身份下递增
 * revision；未执行阶段可重排，内容未变的阶段保留身份，新增阶段使用从未分配的序号。
 * 超出授权范围的用户决定由 Runtime 交互层处理，此函数只负责合法路线重建。
 *
 * @param route - 当前 Runtime 权威路线。
 * @param candidate - 新的完整有序路线候选。
 * @returns revision 加一且阶段身份由 Runtime 分配的路线。
 * @throws RunPlanTransitionError 当候选删除/改写已接受阶段、删除活动阶段或路线为空时抛出。
 *
 * @example
 * ```ts
 * const revised = reviseRunPlanRoute(route, {
 *   stages: [{ target: "调查", acceptanceCriteria: ["定位入口"] }],
 * });
 * ```
 */
export function reviseRunPlanRoute(
    route: RunPlanRouteState,
    candidate: RunPlanRouteCandidate,
    reason: string,
): RunPlanRouteState {
    assertValidRunPlanRoute(route);
    const normalizedReason = nonEmpty(reason, "reason");
    if (candidate.stages.length === 0) throw new RunPlanTransitionError("路线至少包含一个阶段");
    const normalized = candidate.stages.map((stage, index) => ({
        target: nonEmpty(stage.target, `stages[${index}].target`),
        acceptanceCriteria: stage.acceptanceCriteria.map((criterion, criterionIndex) =>
            nonEmpty(criterion, `stages[${index}].acceptanceCriteria[${criterionIndex}]`)),
    }));
    if (normalized.some((stage) => stage.acceptanceCriteria.length === 0)) {
        throw new RunPlanTransitionError("每个阶段至少包含一个验收条件");
    }

    const acceptedCount = route.nextStageIndex;
    for (let index = 0; index < acceptedCount; index += 1) {
        const previous = route.stages[index];
        const proposed = normalized[index];
        if (previous === undefined || proposed === undefined
            || proposed.target !== previous.target
            || proposed.acceptanceCriteria.length !== previous.acceptanceCriteria.length
            || proposed.acceptanceCriteria.some((criterion, criterionIndex) => criterion !== previous.acceptanceCriteria[criterionIndex])) {
            throw new RunPlanTransitionError("路线修订必须保留所有已接受阶段及其顺序和验收条件");
        }
    }

    const activeStage = route.stages[route.nextStageIndex]?.status === "executing"
        ? route.stages[route.nextStageIndex]
        : undefined;
    const activeIndex = activeStage === undefined ? -1 : route.nextStageIndex;
    if (activeStage !== undefined) {
        if (normalized[activeIndex] === undefined) {
            throw new RunPlanTransitionError("路线修订不得删除当前执行阶段");
        }
    }
    const hasChanges = normalized.length !== route.stages.length
        || normalized.some((stage, index) => {
            const previous = route.stages[index];
            return previous === undefined
                || stage.target !== previous.target
                || stage.acceptanceCriteria.length !== previous.acceptanceCriteria.length
                || stage.acceptanceCriteria.some((criterion, criterionIndex) => criterion !== previous.acceptanceCriteria[criterionIndex]);
        });
    if (!hasChanges) throw new RunPlanTransitionError("路线修订必须包含实际变更");

    const pendingStages = route.stages.slice(activeStage === undefined ? acceptedCount : acceptedCount + 1)
        .filter((stage) => stage.status === "pending");
    const matching = new Map<string, RunPlanStageState[]>();
    for (const stage of pendingStages) {
        const key = JSON.stringify([stage.target, stage.acceptanceCriteria]);
        const entries = matching.get(key) ?? [];
        entries.push(stage);
        matching.set(key, entries);
    }

    let nextStageOrdinal = route.nextStageOrdinal;
    const stages: RunPlanStageState[] = [];
    normalized.forEach((proposed, index) => {
        if (index < acceptedCount) {
            stages.push(route.stages[index]!);
            return;
        }
        if (index === activeIndex && activeStage !== undefined) {
            const unchanged = proposed.target === activeStage.target
                && proposed.acceptanceCriteria.length === activeStage.acceptanceCriteria.length
                && proposed.acceptanceCriteria.every((criterion, criterionIndex) => criterion === activeStage.acceptanceCriteria[criterionIndex]);
            stages.push(unchanged
                ? activeStage
                : {
                    ...activeStage,
                    revision: activeStage.revision + 1,
                    target: proposed.target,
                    acceptanceCriteria: proposed.acceptanceCriteria,
                });
            return;
        }

        const key = JSON.stringify([proposed.target, proposed.acceptanceCriteria]);
        const previous = matching.get(key)?.shift();
        if (previous !== undefined) {
            stages.push(previous);
            return;
        }
        stages.push({
            stageId: `stage-${nextStageOrdinal}`,
            revision: 1,
            status: "pending",
            target: proposed.target,
            acceptanceCriteria: proposed.acceptanceCriteria,
        });
        nextStageOrdinal += 1;
    });

    const next: RunPlanRouteState = {
        revision: route.revision + 1,
        revisionReason: normalizedReason,
        nextStageIndex: route.nextStageIndex,
        nextStageOrdinal,
        stages,
    };
    assertValidRunPlanRoute(next);
    return next;
}

/**
 * 原子计算完整路线修订及其当前 RunStage 镜像。
 *
 * @remarks
 * 当当前阶段仍在执行且路线修订改变该阶段时，两份 Runtime 状态一起递增 revision；
 * 其他已接受结果及 RunStage 生命周期保持不变。
 *
 * @param route - 当前已批准路线。
 * @param candidate - Agent 提交的完整候选路线。
 * @param reason - 必须持久化的证据理由。
 * @param currentStage - 当前 RunStage；无活动阶段时可省略。
 * @returns 修订路线及同步后的当前 RunStage。
 * @throws RunPlanTransitionError 当路线或活动阶段镜像不一致时抛出。
 *
 * @example
 * ```ts
 * const revised = reviseRunPlanExecution(route, candidate, "新证据改变了验证顺序");
 * ```
 */
export function reviseRunPlanExecution(
    route: RunPlanRouteState,
    candidate: RunPlanRouteCandidate,
    reason: string,
    currentStage?: RunStageState,
): { readonly route: RunPlanRouteState; readonly currentStage?: RunStageState } {
    const revisedRoute = reviseRunPlanRoute(route, candidate, reason);
    if (currentStage === undefined || currentStage.status !== "executing") {
        return { route: revisedRoute, ...(currentStage === undefined ? {} : { currentStage }) };
    }
    const activeStage = revisedRoute.stages[revisedRoute.nextStageIndex];
    if (activeStage?.status !== "executing" || activeStage.stageId !== currentStage.stageId) {
        throw new RunPlanTransitionError("当前 RunStage 必须匹配路线中的活动阶段");
    }
    if (activeStage.revision === currentStage.revision) {
        return { route: revisedRoute, currentStage };
    }
    const nextCurrentStage = reviseRunStage(currentStage, {
        stageId: currentStage.stageId,
        baseRevision: currentStage.revision,
        reason,
        target: activeStage.target,
        acceptanceCriteria: activeStage.acceptanceCriteria,
    });
    return { route: revisedRoute, currentStage: nextCurrentStage };
}
