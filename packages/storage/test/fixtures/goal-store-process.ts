import { JsonFileGoalStore } from "../../src/index";
import { Runner } from "../../../runtime/src/index";
import type {
    Goal,
    GoalStore,
    StepExecutor,
    Tool,
} from "../../../runtime/src/index";
import { READ_FILE_TOOL_ID, ReadFileTool } from "../../../tools/src/index";

const [
    mode,
    directory,
    goalId,
    serializedGoal,
    runId,
    workspaceRoot,
    authorizedActionId,
] = process.argv.slice(2);

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

    if (mode === "run-action-lifecycle") {
        if (
            directory === undefined
            || goalId === undefined
            || runId === undefined
            || workspaceRoot === undefined
        ) {
            throw new Error(
                "run-action-lifecycle requires directory, goalId, runId, and workspaceRoot",
            );
        }

        const events: string[] = [];
        const baseStore = new JsonFileGoalStore(directory);
        const store: GoalStore = {
            async restore(id) {
                events.push("restore");
                return baseStore.restore(id);
            },
            async save(goal) {
                const pending = goal.state.run.pendingAction;
                events.push(
                    `save:${goal.state.run.status}:${goal.state.run.stepCount}:${pending?.status ?? "none"}`,
                );
                await baseStore.save(goal);
            },
        };
        const tool = new ReadFileTool(workspaceRoot);
        const observedActionIds: string[] = [];
        const recordingTool: Tool = {
            definition: tool.definition,
            replayPolicy: tool.replayPolicy,
            validate: (input) => tool.validate(input),
            execute: async (request, control) => {
                observedActionIds.push(request.actionId);
                events.push(`tool:${request.actionId}`);
                return tool.execute(request, control);
            },
        };
        const executor: StepExecutor = {
            async execute(currentGoal) {
                events.push(`executor:${currentGoal.state.run.stepCount}`);

                if (currentGoal.state.run.stepCount === 0) {
                    return {
                        kind: "tool_call",
                        checkpoint: "读取文件",
                        action: {
                            actionId: "action-lifecycle",
                            toolId: READ_FILE_TOOL_ID,
                            input: { path: "README.md" },
                        },
                    };
                }

                return {
                    kind: "complete",
                    checkpoint: "已吸收读取结果",
                    summary: "生命周期完成",
                };
            },
        };
        const result = await new Runner({
            store,
            executor,
            toolRegistry: {
                get(id) {
                    return id === READ_FILE_TOOL_ID ? recordingTool : undefined;
                },
            },
        }).run({ goalId, runId });

        process.stdout.write(JSON.stringify({ result, events, observedActionIds }));
        return;
    }

    if (mode === "run-manual-replay") {
        if (directory === undefined || goalId === undefined || runId === undefined) {
            throw new Error("run-manual-replay requires directory, goalId, and runId");
        }

        let toolCalls = 0;
        let executorCalls = 0;
        const tool: Tool = {
            definition: {
                id: "manual_tool",
                description: "需要人工确认的 Tool",
                inputSchema: { type: "object" },
            },
            replayPolicy: "manual",
            validate: () => ({ ok: true }),
            async execute() {
                toolCalls += 1;
                return { kind: "success", output: "不应执行", summary: "不应执行" };
            },
        };
        const result = await new Runner({
            store: new JsonFileGoalStore(directory),
            executor: {
                async execute() {
                    executorCalls += 1;
                    return { kind: "complete", checkpoint: "不应执行", summary: "不应执行" };
                },
            },
            toolRegistry: {
                get(id) {
                    return id === "manual_tool" ? tool : undefined;
                },
            },
        }).run({ goalId, runId });

        process.stdout.write(JSON.stringify({ result, toolCalls, executorCalls }));
        return;
    }

    if (mode === "run-authorized-action") {
        if (
            directory === undefined
            || goalId === undefined
            || runId === undefined
            || workspaceRoot === undefined
            || authorizedActionId === undefined
        ) {
            throw new Error(
                "run-authorized-action requires directory, goalId, runId, workspaceRoot, and authorizedActionId",
            );
        }

        const store = new JsonFileGoalStore(directory);
        const buildRunner = (observe: (actionId: string) => void) => new Runner({
            store,
            executor: {
                async execute() {
                    return { kind: "complete", checkpoint: "已吸收读取结果", summary: "授权后完成" };
                },
            },
            toolRegistry: {
                get(id) {
                    if (id !== READ_FILE_TOOL_ID) {
                        return undefined;
                    }

                    const base = new ReadFileTool(workspaceRoot);

                    return {
                        definition: base.definition,
                        replayPolicy: base.replayPolicy,
                        validate: (input) => base.validate(input),
                        execute: async (request, control) => {
                            observe(request.actionId);
                            return base.execute(request, control);
                        },
                    };
                },
            },
        });

        const wrongObserved: string[] = [];
        const wrong = await buildRunner((actionId) => wrongObserved.push(actionId)).run(
            { goalId, runId },
            { authorizedActionId: "wrong-action-id" },
        );

        const correctObserved: string[] = [];
        const correct = await buildRunner((actionId) => correctObserved.push(actionId)).run(
            { goalId, runId },
            { authorizedActionId },
        );

        process.stdout.write(JSON.stringify({
            wrong,
            correct,
            wrongObserved,
            correctObserved,
        }));
        return;
    }

    throw new Error(`Unknown mode: ${mode ?? "undefined"}`);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
