import assert from "node:assert/strict";
import {
    mkdir,
    mkdtemp,
    readFile,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    AgentProfileConfigurationError,
    JsonFileAgentProfileStore,
} from "../src/index";
import {
    createGoal,
    JsonFileGoalStore,
} from "../../runtime/src/index";

const defaultProfile = {
    schemaVersion: 1,
    id: "default",
    name: "Default",
    description: "通用 LazyGoal Agent",
    systemPrompt: "You are LazyGoal.",
    instructions: ["Use only authorized tools."],
    toolIds: ["read_file"],
};

async function writeProfileFile(
    directory: string,
    fileName: string,
    value: unknown,
): Promise<void> {
    await mkdir(directory, { recursive: true });
    await writeFile(
        join(directory, fileName),
        typeof value === "string"
            ? value
            : `${JSON.stringify(value)}\n`,
        "utf8",
    );
}

test("loads only the requested Profile file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-profiles-"));
    await writeProfileFile(directory, "default.json", defaultProfile);
    await writeProfileFile(directory, "me.json", "not json");

    const store = new JsonFileAgentProfileStore(directory);
    const profile = await store.load("default");

    assert.deepEqual(profile, {
        id: defaultProfile.id,
        name: defaultProfile.name,
        description: defaultProfile.description,
        systemPrompt: defaultProfile.systemPrompt,
        instructions: defaultProfile.instructions,
        toolIds: defaultProfile.toolIds,
    });
});

test("returns undefined for a missing Profile and rejects unsafe IDs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-profiles-missing-"));
    const store = new JsonFileAgentProfileStore(directory);

    assert.equal(await store.load("default"), undefined);
    await assert.rejects(
        store.load("../me"),
        (error: unknown) => error instanceof AgentProfileConfigurationError
            && error.code === "INVALID_AGENT_PROFILE",
    );
});

test("uses Zod strict validation for JSON, schema, and Profile ID", async () => {
    const cases: readonly [string, unknown, RegExp][] = [
        ["invalid-json", "not json", /不是合法 JSON/],
        [
            "extra-field",
            { ...defaultProfile, extra: true },
            /不符合 Schema/,
        ],
        [
            "wrong-version",
            { ...defaultProfile, schemaVersion: 2 },
            /不符合 Schema/,
        ],
        [
            "mismatched-id",
            { ...defaultProfile, id: "other" },
            /文件内 id 必须为 "default"/,
        ],
    ];

    for (const [name, value, message] of cases) {
        const directory = await mkdtemp(join(tmpdir(), `lazygoal-profile-${name}-`));
        await writeProfileFile(directory, "default.json", value);
        const store = new JsonFileAgentProfileStore(directory);

        await assert.rejects(
            store.load("default"),
            (error: unknown) => error instanceof AgentProfileConfigurationError
                && message.test(error.message),
        );
    }
});

test("loaded Profile metadata survives Goal snapshot persistence", async () => {
    const profileDirectory = await mkdtemp(join(tmpdir(), "lazygoal-profile-snapshot-"));
    const goalsDirectory = await mkdtemp(join(tmpdir(), "lazygoal-profile-goal-"));
    await writeProfileFile(profileDirectory, "default.json", defaultProfile);

    const profile = await new JsonFileAgentProfileStore(profileDirectory).load("default");
    assert.ok(profile);

    const goal = createGoal({
        id: "goal-profile-metadata",
        intent: "验证 Profile 快照",
        profile,
        runId: "run-profile-metadata",
    });
    const store = new JsonFileGoalStore(goalsDirectory);
    await store.save(goal);

    await writeProfileFile(profileDirectory, "default.json", {
        ...defaultProfile,
        name: "Changed",
        description: "修改后的 Profile",
    });
    const changedProfile = await new JsonFileAgentProfileStore(profileDirectory)
        .load("default");
    assert.equal(changedProfile?.name, "Changed");

    const restored = await store.restore(goal.id);
    assert.equal(restored?.definition.profile.name, defaultProfile.name);
    assert.equal(restored?.definition.profile.description, defaultProfile.description);

    const files = await readFile(
        join(goalsDirectory, `${Buffer.from(goal.id).toString("base64url")}.json`),
        "utf8",
    );
    assert.match(files, /"name": "Default"/);
});
