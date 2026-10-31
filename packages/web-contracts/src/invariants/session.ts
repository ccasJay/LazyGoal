import type {
    BrowserGoalSessionState,
    BrowserPlanRoute,
} from "../session";

/**
 * Plan Route 的状态、游标、修订理由与阶段身份不变量。
 *
 * @remarks
 * 结构字段已由合同校验；该谓词只检查无法由 JSON Schema 表达的跨字段关系：
 * 非初始修订必须提供理由、游标必须落在阶段范围内、阶段身份不得重复、阶段状态
 * 必须由游标推导，并且 `acceptedSequence` 只出现在已接受阶段。
 *
 * @param route - 已通过结构解析的 Plan Route。
 * @returns 所有关系均成立时为 `true`。
 *
 * @example
 * ```ts
 * if (isPlanRoute(route)) console.log(route.nextStageIndex);
 * ```
 */
export function isPlanRoute(route: BrowserPlanRoute): boolean {
    if (route.revision > 1 && route.revisionReason === undefined) return false;
    if (route.nextStageIndex > route.stages.length) return false;

    const ids = new Set<string>();
    return route.stages.every((stage, index) => {
        if (ids.has(stage.stageId)) return false;
        ids.add(stage.stageId);
        const expectedStatus = index < route.nextStageIndex
            ? "accepted"
            : index === route.nextStageIndex && stage.status === "executing"
                ? "executing"
                : "pending";
        return stage.status === expectedStatus
            && (stage.status === "accepted") === (stage.acceptedSequence !== undefined);
    });
}

/**
 * 窄 Goal 状态的失败 Run 终态摘要不变量。
 *
 * @remarks
 * `currentRunTerminalDetail` 只能出现在失败 Run 上；其他状态必须省略该字段。
 *
 * @param state - 已通过结构解析的窄 Goal 状态。
 * @returns 终态摘要与 Run 状态一致时为 `true`。
 *
 * @example
 * ```ts
 * if (hasConsistentTerminalDetail(state)) console.log(state.runStatus);
 * ```
 */
export function hasConsistentTerminalDetail(state: BrowserGoalSessionState): boolean {
    return state.currentRunTerminalDetail === undefined || state.runStatus === "failed";
}
