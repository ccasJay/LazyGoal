import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createSwebenchAcpToolSet, runSwebenchAcpTask, SWE_ACP_PROFILE, SWE_ACP_TOOL_IDS } from "../src/worker-runtime.js";

test("Worker Profile exposes exactly five tools rooted at the supplied workspace", async (t) => {
    const workspace = await mkdtemp(join(tmpdir(), "lazygoal-worker-runtime-"));
    t.after(() => rm(workspace, { recursive: true, force: true }));
    const toolSet = createSwebenchAcpToolSet(workspace);
    assert.equal(toolSet.profile.id, "swebench-acp-profile");
    assert.deepEqual(toolSet.profile.toolIds, SWE_ACP_TOOL_IDS);
    assert.equal(Object.isFrozen(SWE_ACP_PROFILE), true);
    assert.equal(Object.isFrozen(SWE_ACP_PROFILE.instructions), true);
    assert.equal(Object.isFrozen(SWE_ACP_TOOL_IDS), true);
    assert.deepEqual([...SWE_ACP_TOOL_IDS].map((id) => toolSet.registry.get(id)?.definition.id), [...SWE_ACP_TOOL_IDS]);

    const write = toolSet.registry.get("write_file")!.prepare({ path: "fixed.txt", content: "container fact\n" });
    assert.equal(write.ok, true);
    if (write.ok) await write.execute("write-1");
    const read = toolSet.registry.get("read_file")!.prepare({ path: "fixed.txt" });
    assert.equal(read.ok, true);
    if (read.ok) {
        const observation = await read.execute("read-1");
        assert.equal(observation.kind, "success");
        if (observation.kind === "success") assert.equal(observation.output, "container fact\n");
    }
    assert.equal(await readFile(join(workspace, "fixed.txt"), "utf8"), "container fact\n");
});

test("Worker runtime uses deterministic Headless Root state and isolated instance namespace", async (t) => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-worker-headless-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const metadata = {
        instanceId: "astropy__astropy-12907",
        repo: "astropy/astropy",
        baseCommit: "a".repeat(40),
        problemStatement: "Fix the reported issue.",
        goalId: "goal-worker-1",
        runId: "run-worker-1",
        maxSteps: 3,
        structuredOutputMode: "strict" as const,
    };
    let modelCalls = 0;
    const result = await runSwebenchAcpTask({
        metadata,
        workspaceRoot: root,
        stateRoot: join(root, "state"),
        llmAdapter: {
            structuredOutputMode: "strict",
            generate: async (request) => {
                modelCalls += 1;
                if (modelCalls === 1) {
                    return {
                        content: JSON.stringify({
                            result: {
                                kind: "tool_call",
                                action: {
                                    actionId: "write-1",
                                    toolId: "write_file",
                                    input: { path: "fixed.txt", content: "container fact\n" },
                                },
                                memoryPatch: null,
                            },
                        }),
                    };
                }
                const contextMessage = request.messages.at(-1)?.content;
                if (typeof contextMessage !== "string") throw new TypeError("expected serialized execution context");
                const context = JSON.parse(contextMessage) as {
                    trajectoryContext?: {
                        hot?: readonly {
                            events?: readonly { eventType?: string; sequence?: number }[];
                        }[];
                    };
                };
                const observationSequence = context.trajectoryContext?.hot
                    ?.flatMap((unit) => unit.events ?? [])
                    .filter((event) => event.eventType === "tool_finished")
                    .at(-1)?.sequence;
                assert.equal(typeof observationSequence, "number");
                return {
                    content: JSON.stringify({
                        result: {
                            kind: "complete",
                            summary: "already verified",
                            evidenceSequences: [observationSequence],
                            memoryPatch: null,
                        },
                    }),
                };
            },
        },
        renderer: { render: () => "system" },
        contextCompactor: { compact: async (units) => units },
    });
    assert.equal(result.goal.id, metadata.goalId);
    assert.equal(result.goal.state.run.id, metadata.runId);
    assert.equal(result.goal.definition.profile.id, SWE_ACP_PROFILE.id);
    assert.equal(result.model.completed, true);
    assert.equal(result.goal.state.run.status, "completed");
    assert.match(result.persistence.goalSnapshot, /state/);
    assert.match(result.persistence.goalSnapshot, new RegExp(Buffer.from("swebench-acp", "utf8").toString("base64url")));
    assert.equal(modelCalls, 2);
});

test("Worker runtime rejects metadata that could cross task or workspace boundaries", async () => {
    await assert.rejects(runSwebenchAcpTask({
        metadata: {
            instanceId: "../escape",
            repo: "astropy/astropy",
            baseCommit: "a".repeat(40),
            problemStatement: "Issue",
            goalId: "goal",
            runId: "run",
            maxSteps: 1,
            structuredOutputMode: "strict",
        },
        llmAdapter: { structuredOutputMode: "strict", generate: async () => ({ content: "" }) },
        renderer: { render: () => "system" },
        contextCompactor: { compact: async (units) => units },
    }), /instanceId is invalid/);
});
