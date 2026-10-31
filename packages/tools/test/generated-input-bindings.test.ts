import assert from "node:assert/strict";
import { test } from "node:test";

import { writeFileInputBinding } from "../src/generated/write-file/binding";
import { editFileInputBinding } from "../src/generated/edit-file/binding";
import { applyPatchInputBinding } from "../src/generated/apply-patch/binding";
import { executeProgramInputBinding } from "../src/generated/execute-program/binding";
import { gitAddInputBinding } from "../src/generated/git-add/binding";
import { gitCommitInputBinding } from "../src/generated/git-commit/binding";
import { gitBranchCreateInputBinding } from "../src/generated/git-branch-create/binding";
import { gitBranchSwitchInputBinding } from "../src/generated/git-branch-switch/binding";
import { gitWorktreeAddInputBinding } from "../src/generated/git-worktree-add/binding";
import { gitWorktreeRemoveInputBinding } from "../src/generated/git-worktree-remove/binding";
import { gitBranchListInputBinding } from "../src/generated/git-branch-list/binding";
import { gitWorktreeListInputBinding } from "../src/generated/git-worktree-list/binding";
import { processStartInputBinding } from "../src/generated/process-start/binding";
import { processStopInputBinding } from "../src/generated/process-stop/binding";
import { readFileInputBinding } from "../src/generated/read-file/binding";
import { listDirectoryInputBinding } from "../src/generated/list-directory/binding";
import { findFilesInputBinding } from "../src/generated/find-files/binding";
import { webSearchInputBinding } from "../src/generated/web-search/binding";
import { webFetchInputBinding } from "../src/generated/web-fetch/binding";
import { bashInputBinding } from "../src/generated/bash/binding";
import { gitStatusInputBinding } from "../src/generated/git-status/binding";
import { gitDiffInputBinding } from "../src/generated/git-diff/binding";
import { gitLogInputBinding } from "../src/generated/git-log/binding";
import { gitShowInputBinding } from "../src/generated/git-show/binding";
import { processReadInputBinding } from "../src/generated/process-read/binding";

const cases = [
    {
        id: "write_file",
        binding: writeFileInputBinding,
        valid: { path: "notes.txt", content: "hello" },
        invalid: { path: "notes.txt" },
        unknown: { path: "notes.txt", content: "hello", debug: true },
    },
    {
        id: "edit_file",
        binding: editFileInputBinding,
        valid: { path: "notes.txt", oldString: "a", newString: "b" },
        invalid: { path: "notes.txt", oldString: 1, newString: "b" },
        unknown: { path: "notes.txt", oldString: "a", newString: "b", extra: 1 },
    },
    {
        id: "apply_patch",
        binding: applyPatchInputBinding,
        valid: { patch: "--- a/a\n+++ b/a\n" },
        invalid: {},
        unknown: { patch: "--- a/a\n+++ b/a\n", extra: 1 },
    },
    {
        id: "execute_program",
        binding: executeProgramInputBinding,
        valid: { code: "return 1" },
        invalid: { code: 1 },
        unknown: { code: "return 1", extra: 1 },
    },
    {
        id: "git_add",
        binding: gitAddInputBinding,
        valid: { paths: ["a.ts"] },
        invalid: { paths: [1] },
        unknown: { paths: ["a.ts"], extra: 1 },
    },
    {
        id: "git_commit",
        binding: gitCommitInputBinding,
        valid: { message: "m", author: { name: "n", email: "e" } },
        invalid: { message: "m", author: { name: "n" } },
        unknown: { message: "m", extra: 1 },
    },
    {
        id: "git_branch_create",
        binding: gitBranchCreateInputBinding,
        valid: { branch: "feature" },
        invalid: {},
        unknown: { branch: "feature", extra: 1 },
    },
    {
        id: "git_branch_switch",
        binding: gitBranchSwitchInputBinding,
        valid: { branch: "feature", createIfNotExists: true },
        invalid: { branch: "feature", createIfNotExists: "yes" },
        unknown: { branch: "feature", extra: 1 },
    },
    {
        id: "git_worktree_add",
        binding: gitWorktreeAddInputBinding,
        valid: { path: "../wt" },
        invalid: { path: 1 },
        unknown: { path: "../wt", extra: 1 },
    },
    {
        id: "git_worktree_remove",
        binding: gitWorktreeRemoveInputBinding,
        valid: { path: "../wt" },
        invalid: {},
        unknown: { path: "../wt", extra: 1 },
    },
    {
        id: "git_branch_list",
        binding: gitBranchListInputBinding,
        valid: { remote: true },
        invalid: { remote: "yes" },
        unknown: { remote: true, extra: 1 },
    },
    {
        id: "git_worktree_list",
        binding: gitWorktreeListInputBinding,
        valid: {},
        invalid: { cursor: 1 },
        unknown: { extra: 1 },
    },
    {
        id: "process_start",
        binding: processStartInputBinding,
        valid: { command: "ls" },
        invalid: { command: "ls", sandboxAccess: { files: [{ path: "p", access: "read", kind: "file" }] } },
        unknown: { command: "ls", extra: 1 },
    },
    {
        id: "process_stop",
        binding: processStopInputBinding,
        valid: { processId: "p-1" },
        invalid: {},
        unknown: { processId: "p-1", extra: 1 },
    },
    {
        id: "read_file",
        binding: readFileInputBinding,
        valid: { path: "README.md", startLine: 1, maxChars: 100 },
        invalid: { path: "README.md", startLine: 0 },
        unknown: { path: "README.md", extra: 1 },
    },
    {
        id: "list_directory",
        binding: listDirectoryInputBinding,
        valid: { path: "src", maxEntries: 10 },
        invalid: { maxEntries: 0 },
        unknown: { path: "src", extra: 1 },
    },
    {
        id: "find_files",
        binding: findFilesInputBinding,
        valid: { pattern: "**/*.ts", maxResults: 10 },
        invalid: { pattern: "*.ts", maxResults: 0 },
        unknown: { pattern: "*.ts", extra: 1 },
    },
    {
        id: "web_search",
        binding: webSearchInputBinding,
        valid: { query: "LazyGoal", maxResults: 5 },
        invalid: { query: "LazyGoal", maxResults: 0 },
        unknown: { query: "LazyGoal", extra: 1 },
    },
    {
        id: "web_fetch",
        binding: webFetchInputBinding,
        valid: { url: "https://example.com", maxChars: 100, offset: 0 },
        invalid: { url: "https://example.com", offset: -1 },
        unknown: { url: "https://example.com", extra: 1 },
    },
    {
        id: "bash",
        binding: bashInputBinding,
        valid: { command: "ls", timeoutMs: 1000 },
        invalid: { command: "ls", timeoutMs: 1.5 },
        unknown: { command: "ls", extra: 1 },
    },
    {
        id: "git_status",
        binding: gitStatusInputBinding,
        valid: { maxEntries: 10 },
        invalid: { maxEntries: 0 },
        unknown: { extra: 1 },
    },
    {
        id: "git_diff",
        binding: gitDiffInputBinding,
        valid: { maxLines: 10 },
        invalid: { maxLines: 0 },
        unknown: { extra: 1 },
    },
    {
        id: "git_log",
        binding: gitLogInputBinding,
        valid: { maxCount: 10 },
        invalid: { maxCount: 0 },
        unknown: { extra: 1 },
    },
    {
        id: "git_show",
        binding: gitShowInputBinding,
        valid: { object: "HEAD", maxLines: 10 },
        invalid: { object: "HEAD", maxLines: 0 },
        unknown: { object: "HEAD", extra: 1 },
    },
    {
        id: "process_read",
        binding: processReadInputBinding,
        valid: { processId: "p-1", waitMs: 1000, maxChars: 100 },
        invalid: { processId: "p-1", maxChars: 0 },
        unknown: { processId: "p-1", extra: 1 },
    },
] as const;

test("生成的工具输入绑定拒绝已知字段错误、剥离未知字段并返回有界诊断", () => {
    for (const item of cases) {
        assert.match(item.binding.contractId, /^tool\.[a-z0-9_]+\.input$/u, item.id);
        assert.equal(item.binding.version, 1, item.id);
        assert.equal(typeof item.binding.schema, "object", item.id);

        const valid = item.binding.read(item.valid, "strip");
        assert.equal(valid.ok, true, `${item.id} valid input was rejected`);
        if (valid.ok) {
            assert.deepEqual(valid.data, item.valid, item.id);
            assert.notStrictEqual(valid.data, item.valid, `${item.id} did not isolate input`);
            assert.equal(valid.diagnostic, undefined, item.id);
        }

        const invalid = item.binding.read(item.invalid, "strip");
        assert.equal(invalid.ok, false, `${item.id} accepted invalid known field`);
        if (!invalid.ok) {
            assert.ok(invalid.issues.length > 0, item.id);
            assert.ok(invalid.issues.length <= 32, item.id);
        }

        const unknown = item.binding.read(item.unknown, "strip");
        assert.equal(unknown.ok, true, `${item.id} rejected unknown-only field`);
        if (unknown.ok) {
            assert.notDeepEqual(unknown.data, item.unknown, `${item.id} kept unknown field`);
            assert.equal(unknown.diagnostic?.contractId, item.binding.contractId, item.id);
            assert.equal(unknown.diagnostic?.version, 1, item.id);
            assert.ok((unknown.diagnostic?.paths.length ?? 0) > 0, item.id);
            assert.equal(unknown.diagnostic?.truncated, false, item.id);
        }
    }
});

test("生成的工具输入绑定在 reject 策略下拒绝未知字段", () => {
    const result = writeFileInputBinding.read({ path: "notes.txt", content: "x", debug: true }, "reject");

    assert.equal(result.ok, false);
    if (!result.ok) {
        assert.ok(result.issues.some(issue => issue.code === "unknown" && issue.path === "/*"));
    }
});
