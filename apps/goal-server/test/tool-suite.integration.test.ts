import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
    FindFilesTool,
    ReadFileTool,
    ApplyPatchTool,
    GitStatusTool,
    GitDiffTool,
    GitAddTool,
    GitCommitTool,
    GitBranchCreateTool,
    GitBranchSwitchTool,
    GitWorktreeAddTool,
    GitWorktreeRemoveTool,
    type GitStatusOutput,
    type GitDiffOutput,
    type GitCommitOutput,
    type GitBranchSwitchOutput,
    type GitWorktreeAddOutput,
    type GitWorktreeRemoveOutput,
} from "../../../packages/tools/src/index";

function runGit(cwd: string, args: string[]): string {
    return execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
}

test("完整端到端自动化组合场景：文件发现 -> 补丁修改 -> 状态核验 -> 暂存 -> 提交 -> 新分支开发", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-tool-suite-integ-"));

    try {
        // 1. 初始化标准 Git 项目
        runGit(tmpDir, ["init", "-b", "main"]);
        runGit(tmpDir, ["config", "user.name", "SuiteIntegUser"]);
        runGit(tmpDir, ["config", "user.email", "suite@example.com"]);

        const findTool = new FindFilesTool(tmpDir);
        const readTool = new ReadFileTool(tmpDir);
        const patchTool = new ApplyPatchTool(tmpDir);
        const statusTool = new GitStatusTool(tmpDir, { enableSeatbelt: false });
        const diffTool = new GitDiffTool(tmpDir, { enableSeatbelt: false });
        const addTool = new GitAddTool(tmpDir, { enableSeatbelt: false });
        const commitTool = new GitCommitTool(tmpDir, { enableSeatbelt: false });
        const branchCreateTool = new GitBranchCreateTool(tmpDir, { enableSeatbelt: false });
        const branchSwitchTool = new GitBranchSwitchTool(tmpDir, { enableSeatbelt: false });
        const wtAddTool = new GitWorktreeAddTool(tmpDir, { enableSeatbelt: false });
        const wtRmTool = new GitWorktreeRemoveTool(tmpDir, { enableSeatbelt: false });

        const context = { goalId: "suite-integ-goal", runId: "suite-integ-run" };

        // 初始基础代码提交
        await writeFile(join(tmpDir, "calculator.ts"), "export function add(a: number, b: number) {\n    return a + b;\n}\n", "utf8");
        runGit(tmpDir, ["add", "calculator.ts"]);
        runGit(tmpDir, ["commit", "-m", "chore: initial calculator"]);

        // ====================================================================
        // 场景步骤 1：文件定位 (find_files)
        // ====================================================================
        const findRes = await findTool.execute({
            actionId: "step-1-find",
            context,
            input: { pattern: "calculator.ts" },
        });
        assert.equal(findRes.kind, "success");
        const foundFiles = (findRes.output as any).paths;
        assert.ok(foundFiles.includes("calculator.ts"));

        // ====================================================================
        // 场景步骤 2：读取原文件 (read_file)
        // ====================================================================
        const readRes = await readTool.execute({
            actionId: "step-2-read",
            context,
            input: { path: "calculator.ts" },
        });
        assert.equal(readRes.kind, "success");
        assert.match((readRes.output as any).text, /export function add/);

        // ====================================================================
        // 场景步骤 3：应用统一补丁 (apply_patch)
        // ====================================================================
        const patchContent = `
--- a/calculator.ts
+++ b/calculator.ts
@@ -1,3 +1,7 @@
 export function add(a: number, b: number) {
     return a + b;
 }
+
+export function subtract(a: number, b: number) {
+    return a - b;
+}
`.trim();

        const patchRes = await patchTool.execute({
            actionId: "step-3-patch",
            context,
            input: { patch: patchContent },
        });
        assert.equal(patchRes.kind, "success");

        // ====================================================================
        // 场景步骤 4：工作区状态与差异检查 (git_status + git_diff)
        // ====================================================================
        const statusRes = await statusTool.execute({
            actionId: "step-4-status",
            context,
            input: {},
        });
        assert.equal(statusRes.kind, "success");
        const statusOut = statusRes.output as unknown as GitStatusOutput;
        assert.equal(statusOut.clean, false);
        assert.ok(statusOut.entries.some((e) => e.path === "calculator.ts" && e.unstagedStatus === "M"));

        const diffRes = await diffTool.execute({
            actionId: "step-4-diff",
            context,
            input: {},
        });
        assert.equal(diffRes.kind, "success");
        const diffOut = diffRes.output as unknown as GitDiffOutput;
        assert.match(diffOut.diff, /\+export function subtract/);

        // ====================================================================
        // 场景步骤 5：暂存与提交变更 (git_add + git_commit)
        // ====================================================================
        const addRes = await addTool.execute({
            actionId: "step-5-add",
            context,
            input: { paths: ["calculator.ts"] },
        });
        assert.equal(addRes.kind, "success");

        const commitRes = await commitTool.execute({
            actionId: "step-5-commit",
            context,
            input: { message: "feat(calc): add subtract function" },
        });
        assert.equal(commitRes.kind, "success");
        const commitOut = commitRes.output as unknown as GitCommitOutput;
        assert.ok(commitOut.commitHash.length >= 40);
        assert.equal(commitOut.branch, "main");

        // 提交后工作区恢复干净
        const statusAfterCommit = await statusTool.execute({
            actionId: "step-5-status-check",
            context,
            input: {},
        });
        assert.equal(statusAfterCommit.kind, "success");
        assert.equal(((statusAfterCommit as any).output as unknown as GitStatusOutput).clean, true);

        // ====================================================================
        // 场景步骤 6：新分支开发与切换 (git_branch_create + git_branch_switch)
        // ====================================================================
        const branchCreateRes = await branchCreateTool.execute({
            actionId: "step-6-bc",
            context,
            input: { branch: "feature/multiply" },
        });
        assert.equal(branchCreateRes.kind, "success");

        const switchRes = await branchSwitchTool.execute({
            actionId: "step-6-sw",
            context,
            input: { branch: "feature/multiply" },
        });
        assert.equal(switchRes.kind, "success");
        const switchOut = switchRes.output as unknown as GitBranchSwitchOutput;
        assert.equal(switchOut.currentBranch, "feature/multiply");
        assert.equal(switchOut.previousBranch, "main");

        // 验证当前 HEAD 在新分支上包含最新提交
        const branchHead = runGit(tmpDir, ["rev-parse", "HEAD"]).trim();
        assert.equal(branchHead, commitOut.commitHash);

        // ====================================================================
        // 场景步骤 7：隔离开发工作树 (git_worktree_add + 安全移除 git_worktree_remove)
        // ====================================================================
        const wtAddRes = await wtAddTool.execute({
            actionId: "step-7-wt-add",
            context,
            input: { path: "wt-fix", branch: "main" },
        });
        assert.equal(wtAddRes.kind, "success");
        const wtAddOut = (wtAddRes as any).output as GitWorktreeAddOutput;
        assert.equal(wtAddOut.branch, "main");

        // 移除隔离工作树
        const wtRmRes = await wtRmTool.execute({
            actionId: "step-7-wt-rm",
            context,
            input: { path: "wt-fix" },
        });
        assert.equal(wtRmRes.kind, "success");
        const wtRmOut = (wtRmRes as any).output as GitWorktreeRemoveOutput;
        assert.equal(wtRmOut.removedPath, wtAddOut.path);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});
