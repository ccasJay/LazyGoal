import { JsonFileGoalStore } from "../../src/index";
import { Runner } from "../../../runtime/src/index";
import type { Goal } from "../../../runtime/src/index";
import { READ_FILE_TOOL_ID, ReadFileTool } from "../../../tools/src/index";

const [mode, directory, goalId, serializedGoal, runId, workspaceRoot] = process.argv.slice(2);

async function main(): Promise<void> {
    if (mode === "save") {
        if (directory === undefined || serializedGoal === undefined) {
            throw new Error("save requires directory and serialized Goal");
        }

        await new JsonFileGoalStore(directory).save(JSON.parse(serializedGoal));
        return;
    }

    if (mode === "restore") {
        if (directory === undefined || goalId === undefined) {
            throw new Error("restore requires directory and goalId");
        }

        const goal = await new JsonFileGoalStore(directory).restore(goalId);
        process.stdout.write(JSON.stringify(goal ?? null));
        return;
    }

    if (mode === "run-safe-replay") {
        if (
            directory === undefined
            || goalId === undefined
            || runId === undefined
            || workspaceRoot === undefined
        ) {
            throw new Error(
                "run-safe-replay requires directory, goalId, runId, and workspaceRoot",
            );
        }

        const tool = new ReadFileTool(workspaceRoot);
        let observedActionId: string | undefined;
        const result = await new Runner({
            store: new JsonFileGoalStore(directory),
            executor: {
                async execute(goal: Goal) {
                    const lastStep = goal.state.run.lastStep;

                    observedActionId = lastStep?.kind === "action"
                        ? lastStep.action.actionId
                        : undefined;
                    return {
                        kind: "complete" as const,
                        checkpoint: "已吸收跨进程读取结果",
                        summary: "跨进程重放后完成",
                    };
                },
            },
            toolRegistry: {
                get(toolId) {
                    return toolId === READ_FILE_TOOL_ID ? tool : undefined;
                },
            },
        }).run({ goalId, runId });

        process.stdout.write(JSON.stringify({ result, observedActionId }));
        return;
    }

    throw new Error(`Unknown mode: ${mode ?? "undefined"}`);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
