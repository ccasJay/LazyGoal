import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { ToolExecutionRequest } from "../../../packages/runtime/src/index.js";
import {
    ALFWORLD_PROFILE_ID,
    ALFWORLD_PROFILE_TOOL_IDS,
    AlfworldProfileError,
    loadAlfworldProfile,
    validateAlfworldProfile,
} from "../src/profile.js";
import {
    AlfworldResetTool,
    AlfworldSessionStateError,
    AlfworldStepTool,
    createAlfworldToolSet,
    type AlfworldSession,
} from "../src/alfworld-tools.js";
import type {
    SidecarResetResult,
    SidecarStepResult,
    SidecarTask,
} from "../src/sidecar-client.js";

const profile = {
    schemaVersion: 1,
    id: ALFWORLD_PROFILE_ID,
    name: "ALFWorld TextWorld",
    description: "Local ALFWorld TextWorld evaluation profile",
    systemPrompt: "ALFWorld TextWorld evaluator",
    instructions: [
        "Call alfworld_reset first.",
        "Use alfworld_step once per decision.",
        "Do not use Bash.",
        "Only complete when won=true.",
    ],
    toolIds: [...ALFWORLD_PROFILE_TOOL_IDS],
};

const task: SidecarTask = {
    taskId: "task-1",
    gameFile: "valid_seen/task-1/game.tw-pddl",
    split: "valid_seen",
    seed: 1,
    maxSteps: 20,
};

class FakeSession implements AlfworldSession {
    phase: AlfworldSession["phase"] = "idle";
    resetCount = 0;
    stepCount = 0;
    closeCount = 0;
    nextStep: SidecarStepResult = {
        observation: "You see a key.",
        done: false,
        won: false,
        goalConditionSuccessRate: 0,
        admissibleCommands: ["look"],
        accepted: true,
        error: null,
    };

    async reset(): Promise<SidecarResetResult> {
        if (this.phase !== "idle") throw new AlfworldSessionStateError("SESSION_ACTIVE", "active");
        this.phase = "active";
        this.resetCount += 1;
        return {
            taskId: task.taskId,
            gameFile: task.gameFile,
            observation: "You are in a room.",
            admissibleCommands: ["look"],
        };
    }

    async step(): Promise<SidecarStepResult> {
        if (this.phase !== "active") throw new AlfworldSessionStateError("SESSION_IDLE", "idle");
        this.stepCount += 1;
        if (this.nextStep.done) this.phase = "done";
        return this.nextStep;
    }

    async close(): Promise<void> {
        if (this.phase === "closed") return;
        this.closeCount += 1;
        this.phase = "closed";
    }
}

function request(toolId: string, input: unknown): ToolExecutionRequest {
    return { actionId: `${toolId}-1`, input: input as never };
}

test("Profile loader freezes the fixed ID and allowlist from .lazygoal/profiles", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-alfworld-profile-"));
    try {
        const profileDirectory = join(workspace, ".lazygoal/profiles");
        await mkdir(profileDirectory, { recursive: true });
        const content = JSON.stringify(profile, null, 2);
        await writeFile(join(profileDirectory, "alfworld-profile.json"), content, "utf8");
        const loaded = await loadAlfworldProfile(workspace);

        assert.equal(loaded.profile.id, ALFWORLD_PROFILE_ID);
        assert.equal(loaded.profile.name, profile.name);
        assert.deepEqual(loaded.profile.toolIds, ALFWORLD_PROFILE_TOOL_IDS);
        assert.equal(loaded.contentHash.length, 64);
        assert.equal(loaded.profilePath, join(workspace, ".lazygoal/profiles/alfworld-profile.json"));
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
});

test("Profile validation rejects Bash, write tools, unknown IDs and missing protocol instructions", () => {
    assert.throws(
        () => validateAlfworldProfile({ ...profile, id: "wrong" }),
        (error: unknown) => error instanceof AlfworldProfileError && error.code === "PROFILE_ID_MISMATCH",
    );
    assert.throws(
        () => validateAlfworldProfile({ ...profile, toolIds: ["bash"] }),
        (error: unknown) => error instanceof AlfworldProfileError && error.code === "PROFILE_TOOL_ALLOWLIST",
    );
    assert.throws(
        () => validateAlfworldProfile({ ...profile, instructions: ["Use tools"] }),
        (error: unknown) => error instanceof AlfworldProfileError && error.code === "PROFILE_INVALID_SCHEMA",
    );
});

test("ALFWorld tools enforce reset/step state and expose existing basic tool instances", async () => {
    const session = new FakeSession();
    const reset = new AlfworldResetTool(session, task);
    const step = new AlfworldStepTool(session);

    assert.equal(reset.replayPolicy, "manual");
    assert.equal(step.replayPolicy, "manual");
    assert.equal(step.validate({ command: "look" }).ok, true);
    assert.equal(step.validate({ command: "" }).ok, false);
    const beforeReset = await step.execute(request("alfworld_step", { command: "look" }));
    assert.equal(beforeReset.kind, "failure");

    const initial = await reset.execute(request("alfworld_reset", {}));
    assert.equal(initial.kind, "success");
    const observation = await step.execute(request("alfworld_step", { command: "look" }));
    assert.equal(observation.kind, "success");
    assert.equal(session.resetCount, 1);
    assert.equal(session.stepCount, 1);

    session.nextStep = { ...session.nextStep, accepted: false, error: { code: "DOMAIN_COMMAND_REJECTED", message: "invalid" } };
    const domainFailure = await step.execute(request("alfworld_step", { command: "bad" }));
    assert.equal(domainFailure.kind, "failure");
    if (domainFailure.kind === "failure") assert.equal(domainFailure.code, "DOMAIN_COMMAND_REJECTED");
    assert.equal(session.stepCount, 2);

    await session.close();
    await session.close();
    assert.equal(session.closeCount, 1);
});

test("createAlfworldToolSet reuses ReadFileTool/GrepTool and excludes Bash/write tools", () => {
    const session = new FakeSession();
    const set = createAlfworldToolSet("/workspace", task, session as never);
    for (const toolId of ["read_file", "grep", "alfworld_reset", "alfworld_step"]) {
        assert.ok(set.registry.get(toolId));
    }
    assert.equal(set.registry.get("bash"), undefined);
    assert.equal(set.registry.get("write_file"), undefined);
});
