import { ScriptBudgetExceeded } from "./script-driver.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GroupResult } from "./runner.js";
/** 两组均尝试执行；异常归档为独立失败，不中断另一组。 */
export async function executePairedGroups(directory: string, model: string, execute: (group: "restore" | "full", output: string) => Promise<GroupResult>): Promise<readonly GroupResult[]> {
    const groups: GroupResult[] = [];
    for (const group of ["restore", "full"] as const) {
        const output = join(directory, group);
        await mkdir(output, { recursive: true });
        try { groups.push(await execute(group, output)); }
        catch (error) {
            const budget = error instanceof ScriptBudgetExceeded;
            const result: GroupResult = { group, category: budget ? "budget_exceeded" : "infrastructure_error", stages: [], model, calls: [], durationMs: 0, imageId: null, artifacts: null, score: budget ? { deterministic: false, judge: null, violations: [], combined: "failed" } : null, errors: [String(error)] };
            await writeFile(join(output, "group.json"), JSON.stringify(result, null, 2));
            groups.push(result);
        }
    }
    return groups;
}
