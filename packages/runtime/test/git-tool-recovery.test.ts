import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    createGoal,
    createToolRegistration,
    InMemoryToolRegistry,
    Runner,
    transition,
    type AgentProfile,
    type Goal,
    type StepExecutor,
} from "../src/index";
import {
    GitAddTool,
    GIT_ADD_TOOL_ID,
    GitCommitTool,
    GIT_COMMIT_TOOL_ID,
    GitBranchCreateTool,
    GIT_BRANCH_CREATE_TOOL_ID,
    GitBranchSwitchTool,
    GIT_BRANCH_SWITCH_TOOL_ID,
    GitWorktreeAddTool,
    GIT_WORKTREE_ADD_TOOL_ID,
    GitWorktreeRemoveTool,
    GIT_WORKTREE_REMOVE_TOOL_ID,
} from "../../tools/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols, trajectoryStoreFor, withDiscoveredProfileTools } from "./current-fixtures";

function runGit(cwd: string, args: string[]): string {
    return execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
}

const gitProfile: AgentProfile = {
    id: "git-write-profile",
    systemPrompt: "You are a coding agent performing git write operations.",
    instructions: ["Follow task"],
    toolIds: [
        GIT_ADD_TOOL_ID,
        GIT_COMMIT_TOOL_ID,
        GIT_BRANCH_CREATE_TOOL_ID,
        GIT_BRANCH_SWITCH_TOOL_ID,
    ],
};

test("Git 写操作工具统一声明 manual 重放策略，防止自动重试", () => {
    const addTool = new GitAddTool("/workspace");
    const commitTool = new GitCommitTool("/workspace");
    const bcTool = new GitBranchCreateTool("/workspace");
    const bsTool = new GitBranchSwitchTool("/workspace");
    const wtAddTool = new GitWorktreeAddTool("/workspace");
    const wtRmTool = new GitWorktreeRemoveTool("/workspace");

    assert.equal(addTool.replayPolicy, "manual");
    assert.equal(commitTool.replayPolicy, "manual");
    assert.equal(bcTool.replayPolicy, "manual");
    assert.equal(bsTool.replayPolicy, "manual");
    assert.equal(wtAddTool.replayPolicy, "manual");
    assert.equal(wtRmTool.replayPolicy, "manual");
});

test("Git 写操作工具在 Runner 中执行成功并正确记录", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lg-git-recovery-"));

    try {
        runGit(workspaceRoot, ["init", "-b", "main"]);
        runGit(workspaceRoot, ["config", "user.name", "Tester"]);
        runGit(workspaceRoot, ["config", "user.email", "test@example.com"]);

        await writeFile(join(workspaceRoot, "index.ts"), "export const a = 1;\n", "utf8");

        const store = new InMemoryGoalStore();
        const trajectoryStore = trajectoryStoreFor(store);
        const addTool = new GitAddTool(workspaceRoot, { enableSeatbelt: false });
        const commitTool = new GitCommitTool(workspaceRoot, { enableSeatbelt: false });

        const toolRegistry = new InMemoryToolRegistry([
            createToolRegistration(addTool),
            createToolRegistration(commitTool),
        ]);

        const goal = withDiscoveredProfileTools(createGoal({
            ...currentProtocols,
            id: "goal-git-rec-1",
            intent: "暂存并提交代码",
            promptBundleVersion: 1,
            profile: gitProfile,
            runId: "run-git-rec-1",
        }));

        await store.save(goal);

        let stepCount = 0;
        const executor: StepExecutor = {
        async reviewCompletion() { return { kind: "accept" as const }; },
            async execute() {
                stepCount += 1;
                if (stepCount === 1) {
                    return {
                        kind: "tool_call" as const,
                        action: {
                            actionId: "act-add-1",
                            toolId: GIT_ADD_TOOL_ID,
                            input: { paths: ["index.ts"] },
                        },
                    };
                }
                return {
                    kind: "tool_call" as const,
                    action: {
                        actionId: "act-commit-1",
                        toolId: GIT_COMMIT_TOOL_ID,
                        input: { message: "feat: add index" },
                    },
                };
            },
            async decide() {
                const dec = await this.execute!({} as any);
                return { kind: "decision", decision: dec };
            },
            async think() {
                throw new Error("Unexpected think");
            },
        };

        const runner = new Runner({
            store,
            trajectoryStore,
            executor,
            toolRegistry,
            toolPolicy: { evaluate: () => "allow" },
        });

        const runRef = { goalId: goal.id, runId: goal.state.run.id };
        const result = await runner.run(runRef);
        assert.equal(result.ok, true);

        const savedGoal = await store.restore(goal.id);
        assert.ok(savedGoal);
        assert.equal(savedGoal.state.run.lastStep?.kind, "action");
        if (savedGoal.state.run.lastStep?.kind === "action") {
            assert.equal(savedGoal.state.run.lastStep.action.toolId, GIT_COMMIT_TOOL_ID);
            assert.equal(savedGoal.state.run.lastStep.observation.kind, "success");
        }
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});
