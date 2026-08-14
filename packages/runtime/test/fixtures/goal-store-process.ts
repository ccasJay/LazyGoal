import { JsonFileGoalStore } from "../../src/index";

const [mode, directory, goalId, serializedGoal] = process.argv.slice(2);

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

    throw new Error(`Unknown mode: ${mode ?? "undefined"}`);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
