import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

type ProfileFileFixture = {
    readonly schemaVersion: 1;
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly systemPrompt: string;
    readonly instructions: readonly string[];
    readonly toolIds: readonly string[];
};

export const DEFAULT_PROFILE_FILE: ProfileFileFixture = {
    schemaVersion: 1,
    id: "default",
    name: "Default",
    description: "通用 LazyGoal Agent",
    systemPrompt:
        "You are LazyGoal, an English-speaking goal-driven coding agent. "
        + "Follow the frozen task and report progress clearly.",
    instructions: [
        "Use only the tools authorized by the frozen profile.",
        "Reason from the current Goal, messages, and context epoch before acting.",
        "Keep context epoch results concise and follow the required JSON response protocol.",
    ],
    toolIds: ["read_file"],
};

export async function writeDefaultProfile(
    workspaceRoot: string,
    profile: ProfileFileFixture = DEFAULT_PROFILE_FILE,
): Promise<void> {
    const directory = join(workspaceRoot, ".lazygoal", "profiles");
    await mkdir(directory, { recursive: true });
    await writeFile(
        join(directory, "default.json"),
        `${JSON.stringify(profile, null, 2)}\n`,
        "utf8",
    );
}
