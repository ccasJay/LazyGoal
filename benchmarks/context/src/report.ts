import type { GroupResult } from "./runner.js";
/** 完成、未完成与评分分母均保留所有计划组，缺失 token 不填零。 */
export function summarizeGroups(groups: readonly GroupResult[], pairable: boolean) {
    return { planned: 2, attempted: groups.length,
        completed: groups.filter(group => group.category === "completed").length,
        incomplete: 2 - groups.filter(group => group.category === "completed").length,
        scored: groups.filter(group => group.score?.combined !== "incomplete" && group.score !== null).length,
        scoringIncomplete: 2 - groups.filter(group => group.score?.combined !== "incomplete" && group.score !== null).length,
        passed: groups.filter(group => group.score?.combined === "passed").length,
        passRate: groups.filter(group => group.score?.combined === "passed").length / 2,
        pairable: pairable ? 1 : 0,
        costs: groups.map(group => ({ group: group.group, model: group.model, calls: group.calls.length,
            inputTokens: group.calls.length === 0 || group.calls.some(call => call === null) ? null : group.calls.reduce((n, call) => n + call!.inputTokens, 0),
            outputTokens: group.calls.length === 0 || group.calls.some(call => call === null) ? null : group.calls.reduce((n, call) => n + call!.outputTokens, 0),
            missingCalls: group.calls.filter(call => call === null).length, durationMs: group.durationMs })),
    };
}
