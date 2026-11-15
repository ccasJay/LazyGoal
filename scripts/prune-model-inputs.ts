import { parseArgs } from "node:util";
import { join, resolve } from "node:path";

import { trajectoryWatermark } from "../packages/runtime/src/index";
import {
    JsonFileGoalStore,
    JsonFileModelInputStore,
    JsonFileTrajectoryStore,
} from "../packages/storage/src/index";

/**
 * 显式清理没有已提交模型事件的 Model Input 清单。
 *
 * @remarks
 * 默认只输出审计结果；只有传入 `--apply` 才删除完全孤立的 Run 清单。混合了
 * 已提交与孤立调用的 Run 不会被部分改写。清单只含 `model-inputs.jsonl`，同目录的
 * 轨迹、指标与 Trace 以及同 Goal 共享的 `blobs/` 正文不被删除。
 *
 * @example
 * ```sh
 * npx tsx scripts/prune-model-inputs.ts --workspace ~/.lazygoal/workspaces/<id>
 * npx tsx scripts/prune-model-inputs.ts --workspace <dir> --goal <goalId> --apply
 * ```
 */
async function main(): Promise<void> {
    const { values } = parseArgs({
        options: {
            workspace: { type: "string" },
            goal: { type: "string" },
            run: { type: "string" },
            apply: { type: "boolean", default: false },
        },
    });

    if (values.workspace === undefined || values.run !== undefined && values.goal === undefined) {
        console.error("Usage: prune-model-inputs --workspace <workspace-directory> [--goal <goalId>] [--run <runId>] [--apply]");
        process.exitCode = 1;
        return;
    }

    const workspace = resolve(values.workspace);
    const goalsDirectory = join(workspace, "goals");
    const goalStore = new JsonFileGoalStore(goalsDirectory);
    const trajectoryStore = new JsonFileTrajectoryStore(goalsDirectory);
    const modelInputStore = new JsonFileModelInputStore(goalsDirectory);
    const goalIds = values.goal === undefined
        ? (await goalStore.listHistory()).entries.map((entry) => entry.goalId)
        : [values.goal];

    for (const goalId of goalIds) {
        const goal = await goalStore.restore(goalId);
        if (goal === undefined) {
            console.error(`[skip] ${goalId}: snapshot unavailable`);
            continue;
        }

        const runIds = values.run === undefined
            ? [goal.state.run.id, ...(goal.state.completedRuns ?? []).map((run) => run.runId)]
            : [values.run];

        for (const runId of [...new Set(runIds)]) {
            const calls = await modelInputStore.read(goalId, runId);
            if (calls.length === 0) continue;

            const committed = new Set(await trajectoryStore.listModelCallIds({
                goalId,
                runId,
                committedThroughSequence: trajectoryWatermark(goal, runId),
            }));
            const orphaned = calls.filter((call) => !committed.has(call.callId));
            const deletable = orphaned.length === calls.length;
            console.log(`${goalId}/${runId}: ${calls.length} recorded, ${orphaned.length} orphaned, ${deletable ? "deletable" : "kept (mixed)"}`);

            if (deletable && values.apply) {
                await modelInputStore.deleteRun(goalId, runId);
                console.log(`[deleted] ${goalId}/${runId}`);
            }
        }
    }

    if (!values.apply) {
        console.log("Dry run only; pass --apply to delete fully orphaned Run manifests.");
    }
}

await main();
