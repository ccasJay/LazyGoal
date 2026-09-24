import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    parseTuaBenchAcpTaskMetadata,
    TUA_BENCH_WORKER_PROFILE,
} from "../src/worker-entry.js";

describe("TUA-Bench Worker Prompt candidate metadata", () => {
    it("accepts both candidate Prompt fields while retaining the trusted Worker Profile fields", () => {
        const metadata = parseTuaBenchAcpTaskMetadata({
            ...taskMetadata(),
            baseProfile: TUA_BENCH_WORKER_PROFILE,
            profile: {
                ...TUA_BENCH_WORKER_PROFILE,
                systemPrompt: "Candidate system prompt with general task guidance.",
                instructions: [
                    "Inspect the workspace before taking actions.",
                    "Verify the requested end state before completion.",
                ],
            },
        });

        assert.equal(metadata.profile?.systemPrompt, "Candidate system prompt with general task guidance.");
        assert.deepEqual(metadata.profile?.instructions, [
            "Inspect the workspace before taking actions.",
            "Verify the requested end state before completion.",
        ]);
        assert.equal(metadata.profile?.id, TUA_BENCH_WORKER_PROFILE.id);
        assert.equal(metadata.profile?.name, TUA_BENCH_WORKER_PROFILE.name);
        assert.equal(metadata.profile?.description, TUA_BENCH_WORKER_PROFILE.description);
        assert.deepEqual(metadata.profile?.toolIds, TUA_BENCH_WORKER_PROFILE.toolIds);
        assert.equal(Object.isFrozen(metadata.profile?.instructions), true);
    });

    it("uses the built-in Profile by default and rejects partial or capability-changing candidates", () => {
        const withoutCandidate = parseTuaBenchAcpTaskMetadata(taskMetadata());
        assert.equal(withoutCandidate.profile, undefined);

        assert.throws(() => parseTuaBenchAcpTaskMetadata({
            ...taskMetadata(),
            profile: { ...TUA_BENCH_WORKER_PROFILE },
        }), /requires baseProfile and profile together/iu);

        assert.throws(() => parseTuaBenchAcpTaskMetadata({
            ...taskMetadata(),
            baseProfile: TUA_BENCH_WORKER_PROFILE,
            profile: { ...TUA_BENCH_WORKER_PROFILE, toolIds: ["unauthorized-tool"] },
        }), /toolIds must match the benchmark base Profile/iu);

        assert.throws(() => parseTuaBenchAcpTaskMetadata({
            ...taskMetadata(),
            baseProfile: { ...TUA_BENCH_WORKER_PROFILE, systemPrompt: "drifted base" },
            profile: { ...TUA_BENCH_WORKER_PROFILE },
        }), /baseProfile must match the Worker base Profile/iu);
    });
});

function taskMetadata() {
    return {
        taskId: "task-doc-1",
        name: "Document task",
        instruction: "Update the requested document.",
        taskFamily: "document",
        imageRef: "tua-bench/task-doc-1:latest",
        networkMode: "none",
        agentTimeoutSec: 600,
        verifierTimeoutSec: 600,
        verifierUser: "root",
        taskDir: "/workspace/tasks/task-doc-1",
        goalId: "goal-task-doc-1",
        runId: "run-task-doc-1",
        structuredOutputMode: "strict" as const,
    };
}
