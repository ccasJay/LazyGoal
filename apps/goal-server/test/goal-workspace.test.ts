import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { join } from "node:path";
import { allocateGoalWorkspace, inspectGoalWorktree, mergeGoalWorktree } from "../src/runtime/goal-workspace";

const execFile = promisify(execFileCallback);

async function git(cwd: string, ...args: string[]): Promise<string> {
    return (await execFile("git", ["-C", cwd, ...args], { encoding: "utf8" })).stdout;
}

test("worktree 分支绑定 Goal，审核摘要变化会拒绝合并，确认后合并并清理", async () => {
    const root = await mkdtemp(join(tmpdir(), "lg-goal-workspace-"));
    const projectRoot = join(root, "project");
    const dataDirectory = join(root, "data");
    await mkdir(projectRoot, { recursive: true });
    await mkdir(dataDirectory, { recursive: true });
    await git(projectRoot, "init", "--initial-branch=main");
    await git(projectRoot, "config", "user.name", "LazyGoal Test");
    await git(projectRoot, "config", "user.email", "test@example.invalid");
    await writeFile(join(projectRoot, "README.md"), "base\n");
    await git(projectRoot, "add", "README.md");
    await git(projectRoot, "commit", "-m", "base");
    const baseCommit = (await git(projectRoot, "rev-parse", "HEAD")).trim();

    try {
        const shared = await allocateGoalWorkspace(projectRoot, dataDirectory, "goal-shared", "shared");
        assert.equal(shared.mode, "shared");
        if (shared.mode !== "worktree") assert.equal(shared.executionRoot, shared.projectRoot);

        const workspace = await allocateGoalWorkspace(projectRoot, dataDirectory, "goal-isolated", "worktree");
        assert.equal(workspace.mode, "worktree");
        if (workspace.mode !== "worktree") return;
        assert.equal(workspace.projectRoot, await realpath(projectRoot));
        assert.notEqual(workspace.executionRoot, workspace.projectRoot);
        assert.equal(workspace.baseCommit, baseCommit);
        assert.deepEqual(await allocateGoalWorkspace(projectRoot, dataDirectory, "goal-isolated", "worktree"), workspace);

        await writeFile(join(workspace.executionRoot, "result.txt"), "isolated result\n");
        await git(workspace.executionRoot, "add", "result.txt");
        await git(workspace.executionRoot, "commit", "-m", "goal result");
        const review = await inspectGoalWorktree("goal-isolated", workspace);
        assert.deepEqual(review.changedFiles, ["result.txt"]);
        assert.deepEqual(review.dirty, []);
        const authorization = {
            goalId: review.goalId,
            projectRoot: workspace.projectRoot,
            branch: workspace.branch,
            baseBranch: workspace.baseBranch,
            baseCommit: workspace.baseCommit,
            headCommit: review.headCommit,
            diffDigest: review.diffDigest,
        };
        await assert.rejects(mergeGoalWorktree(workspace, { ...authorization, diffDigest: "0".repeat(64) }), /changed after merge authorization/);
        const mergedHead = await mergeGoalWorktree(workspace, authorization);
        assert.equal((await readFile(join(projectRoot, "result.txt"), "utf8")), "isolated result\n");
        assert.equal((await git(projectRoot, "rev-parse", "HEAD")).trim(), mergedHead);
        assert.equal((await git(projectRoot, "worktree", "list", "--porcelain")).includes(workspace.executionRoot), false);
        assert.equal((await git(projectRoot, "branch", "--list", "--format=%(refname:short)", workspace.branch)).trim(), "");

        await writeFile(join(projectRoot, "uncommitted.txt"), "preserve\n");
        await assert.rejects(allocateGoalWorkspace(projectRoot, dataDirectory, "goal-dirty", "worktree"), /clean project workspace/);
        assert.equal((await readFile(join(projectRoot, "uncommitted.txt"), "utf8")), "preserve\n");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
