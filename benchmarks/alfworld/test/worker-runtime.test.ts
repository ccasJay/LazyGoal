import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAlfworldAcpTaskMetadata } from "../src/worker-runtime.js";
import { ALFWORLD_PROFILE_TOOL_IDS } from "../src/profile.js";
import { ALFWORLD_WORKER_PROFILE } from "../src/worker-runtime.js";

test("ALFWorld Worker metadata keeps the dedicated tool profile and task boundary", () => {
    const metadata = parseAlfworldAcpTaskMetadata({
        order: 0,
        taskId: "task-1",
        split: "valid_seen",
        gameFile: "valid_seen/task-1/game.tw-pddl",
        seed: 1,
        maxSteps: 20,
        problemStatement: "Solve the fixed task",
        goalId: "goal-1",
        runId: "run-1",
        structuredOutputMode: "strict",
        dataRoot: "/opt/alfworld/data",
        sidecarPath: "/opt/lazygoal/alfworld-sidecar.py",
    });
    assert.equal(metadata.taskId, "task-1");
    assert.deepEqual(ALFWORLD_WORKER_PROFILE.toolIds, ALFWORLD_PROFILE_TOOL_IDS);
    assert.equal((ALFWORLD_WORKER_PROFILE.toolIds as readonly string[]).includes("bash"), false);
    assert.throws(() => parseAlfworldAcpTaskMetadata({ ...metadata, gameFile: "../escape" }), /Invalid ALFWorld/);
});

test("ALFWorld Worker metadata revalidates Prompt Evaluation frozen fields", () => {
    const baseProfile = {
        id: "alfworld-profile",
        name: "ALFWorld",
        description: "Fixture",
        systemPrompt: "Base",
        instructions: [
            "Call alfworld_reset first.",
            "Use alfworld_step once.",
            "Do not use Bash and complete only when won=true.",
        ],
        toolIds: [...ALFWORLD_PROFILE_TOOL_IDS],
    };
    const profile = {
        ...baseProfile,
        systemPrompt: "Candidate",
        instructions: [
            "Call alfworld_reset before acting.",
            "Use alfworld_step once per decision.",
            "Never use Bash; finish only when won=true.",
        ],
    };
    const raw = {
        order: 0,
        taskId: "task-1",
        split: "valid_seen",
        gameFile: "valid_seen/task-1/game.tw-pddl",
        seed: 1,
        maxSteps: 20,
        problemStatement: "Solve the fixed task",
        goalId: "goal-1",
        runId: "run-1",
        structuredOutputMode: "strict",
        baseProfile,
        profile,
    };

    const metadata = parseAlfworldAcpTaskMetadata(raw);
    assert.equal(metadata.profile?.systemPrompt, "Candidate");
    assert.equal(Object.isFrozen(metadata.profile), true);
    assert.throws(
        () => parseAlfworldAcpTaskMetadata({
            ...raw,
            profile: { ...profile, toolIds: ["bash"] },
        }),
        /toolIds/u,
    );
});
