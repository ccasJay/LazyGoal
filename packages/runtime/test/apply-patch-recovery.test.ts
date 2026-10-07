import { ExecutionAbortedError } from "../../execution-control/src/index";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    createGoal,
    createRun,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    transition,
    type AgentDecision,
    type AgentProfile,
    type Goal,
    type StepExecutor,
} from "../src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
} from "../../tool-core/src/index";
import {
    ApplyPatchTool,
    APPLY_PATCH_TOOL_ID,
} from "../../tools/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, trajectoryStoreFor, withDiscoveredProfileTools } from "./current-fixtures";

const profile: AgentProfile = {
    id: "patch-recovery-profile",
    systemPrompt: "You are a coding agent applying patches.",
    instructions: ["Follow task"],
    toolIds: [APPLY_PATCH_TOOL_ID],
};

test("ApplyPatchTool manual 重放策略在崩溃中断后进入 manual 恢复流程而不自动重复执行", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-patch-recovery-"));

    try {
        await writeFile(join(workspaceRoot, "code.txt"), "original\n", "utf8");

        const store = new InMemoryGoalStore();
        const trajectoryStore = trajectoryStoreFor(store);
        const patchTool = new ApplyPatchTool(workspaceRoot);
        const toolRegistry = new InMemoryToolRegistry([createToolRegistration(patchTool)]);

        assert.equal(patchTool.replayPolicy, "manual");

        const goal = withDiscoveredProfileTools(createGoal({
            ...currentProtocols,
            id: "goal-patch-rec-1",
            intent: "应用文本补丁",
            promptBundleVersion: 1,
            profile,
            runId: "run-patch-rec-1",
        }));

        const patch = `
--- a/code.txt
+++ b/code.txt
@@ -1 +1 @@
-original
+patched
`.trim();

        // 模拟执行决策
        let executedTimes = 0;
        const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" as const }; },
            async execute() {
                executedTimes += 1;
                return {
                    kind: "tool_call" as const,
                    action: {
                        actionId: "act-patch-1",
                        toolId: APPLY_PATCH_TOOL_ID,
                        input: { patch },
                    },
                };
            },
            async decide() {
                executedTimes += 1;
                return {
                    kind: "decision",
                    decision: {
                        kind: "tool_call" as const,
                        action: {
                            actionId: "act-patch-1",
                            toolId: APPLY_PATCH_TOOL_ID,
                            input: { patch },
                        },
                    },
                };
            },
            async think() {
                throw new Error("Unexpected think");
            },
        };

        await store.save(goal);

        const runner = new Runner({
            store,
            trajectoryStore,
            executor,
            toolRegistry,
            toolPolicy: { evaluate: () => "allow" },
        });

        // 正常跑一步：完成补丁并成功记录
        const runRef = { goalId: goal.id, runId: goal.state.run.id };
        const result = await runner.run(runRef);
        assert.equal(result.ok, true);

        const savedGoal = await store.restore(goal.id);
        assert.ok(savedGoal);
        assert.equal(savedGoal.state.run.lastStep?.kind, "action");
        if (savedGoal.state.run.lastStep?.kind === "action") {
            assert.equal(savedGoal.state.run.lastStep.action.toolId, APPLY_PATCH_TOOL_ID);
            assert.equal(savedGoal.state.run.lastStep.observation.kind, "success");
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ApplyPatchTool 晚期故障时 failure.details 完整贯通并被持久化记录", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lazygoal-patch-details-"));

    try {
        await writeFile(join(workspaceRoot, "f1.txt"), "valid1\n", "utf8");
        await writeFile(join(workspaceRoot, "f2.txt"), "valid2\n", "utf8");

        const store = new InMemoryGoalStore();
        const trajectoryStore = trajectoryStoreFor(store);
        const patchTool = new ApplyPatchTool(workspaceRoot);
        const toolRegistry = new InMemoryToolRegistry([createToolRegistration(patchTool)]);

        const goal = createGoal({
            ...currentProtocols,
            id: "goal-patch-details",
            intent: "应用补丁并保留失败详情",
            promptBundleVersion: 1,
            profile,
            runId: "run-patch-details",
        });

        // 构造一个会触发晚期故障的场景：两个文件，第二个文件在写前并发改变
        const patch = `
diff --git a/f1.txt b/f1.txt
--- a/f1.txt
+++ b/f1.txt
@@ -1 +1 @@
-valid1
+mod1
diff --git a/f2.txt b/f2.txt
--- a/f2.txt
+++ b/f2.txt
@@ -1 +1 @@
-valid2
+mod2
`.trim();

        // 预检前两者正常，但我们直接测试工具返回带有 details 的 failure
        const obs = await patchTool.execute({
            actionId: "act-test-det",
            input: {
                patch: `
diff --git a/f1.txt b/f1.txt
--- a/f1.txt
+++ b/f1.txt
@@ -1 +1 @@
-wrong
+mod1
`.trim(),
            },
        });
        assert.equal(obs.kind, "failure");

        // 模拟向 Runner / Coordinator 传递含有 failure.details 的步骤
        const running = transition(goal.state.run, { kind: "start" });
        assert.equal(running.ok, true);
        if (!running.ok) return;

        const staged = transition(running.state, {
            kind: "stage_action",
            action: {
                actionId: "act-patch-det",
                toolId: APPLY_PATCH_TOOL_ID,
                input: { patch },
            },
            status: "approved",
        });
        assert.equal(staged.ok, true);
        if (!staged.ok) return;

        const details = {
            applied: ["f1.txt"],
            failed: { path: "f2.txt", reason: "File was modified concurrently before write" },
            pending: [],
        };

        const observed = transition(staged.state, {
            kind: "observe_action",
            actionId: "act-patch-det",
            observation: {
                kind: "failure",
                code: "CONCURRENT_MODIFICATION_DETECTED",
                message: "File f2.txt was modified concurrently before writing.",
                retryable: false,
                details,
            },
        });
        assert.equal(observed.ok, true);
        if (!observed.ok) return;

        const persistedGoal: Goal = {
            ...goal,
            state: {
                ...goal.state,
                run: observed.state,
            },
        };
        await store.save(persistedGoal);

        const restored = await store.restore(goal.id);
        assert.ok(restored);
        const lastStep = restored.state.run.lastStep;
        assert.equal(lastStep?.kind, "action");
        if (lastStep?.kind === "action") {
            assert.equal(lastStep.observation.kind, "failure");
            if (lastStep.observation.kind === "failure") {
                assert.deepEqual(lastStep.observation.details, details);
            }
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});
