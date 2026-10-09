import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./change-scope.mjs", import.meta.url));

function git(root, ...args) {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function put(root, name, contents) {
    const target = join(root, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
}

function repository(t) {
    const root = mkdtempSync(join(tmpdir(), "lazygoal-change-scope-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    git(root, "init", "-q");
    git(root, "config", "user.name", "Test User");
    git(root, "config", "user.email", "test@example.com");
    put(root, "changed.txt", "base\n");
    put(root, "old name.txt", "move me\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "base");
    return root;
}

function run(root, ...args) {
    return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });
}

test("reports committed, staged, unstaged and untracked paths without changing the worktree", t => {
    const root = repository(t);
    const baseSha = git(root, "rev-parse", "HEAD");
    put(root, "changed.txt", "committed\n");
    renameSync(join(root, "old name.txt"), join(root, "new name.txt"));
    git(root, "add", "-A");
    git(root, "commit", "-qm", "change and rename");
    const headSha = git(root, "rev-parse", "HEAD");

    put(root, "staged file.txt", "staged\n");
    git(root, "add", "staged file.txt");
    put(root, "new name.txt", "unstaged\n");
    put(root, "line\nbreak.txt", "untracked\n");
    const before = git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all");

    const result = run(root, "--base", baseSha);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.formatVersion, 1);
    assert.equal(report.repositoryRoot, realpathSync(root));
    assert.deepEqual(report.input, { base: baseSha, head: "HEAD" });
    assert.deepEqual(report.resolved, { baseSha, headSha, mergeBaseSha: baseSha });
    assert.deepEqual(report.paths, {
        committed: ["changed.txt", "new name.txt", "old name.txt"],
        staged: ["staged file.txt"],
        unstaged: ["new name.txt"],
        untracked: ["line\nbreak.txt"],
    });
    assert.equal(git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all"), before);
});

test("resolves an explicit head while still reporting the current worktree", t => {
    const root = repository(t);
    const baseSha = git(root, "rev-parse", "HEAD");
    put(root, "changed.txt", "later\n");
    git(root, "add", "changed.txt");
    git(root, "commit", "-qm", "later");
    put(root, "untracked.txt", "new\n");
    const nested = join(root, "nested");
    mkdirSync(nested);

    const result = run(nested, "--base", baseSha, "--head", baseSha);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.repositoryRoot, realpathSync(root));
    assert.deepEqual(report.paths, {
        committed: [], staged: [], unstaged: [], untracked: ["untracked.txt"],
    });
});

test("rejects an omitted or unknown base without printing a report", t => {
    const root = repository(t);
    const missing = run(root);
    assert.equal(missing.status, 1);
    assert.equal(missing.stdout, "");
    assert.match(missing.stderr, /missing required --base/);

    const unknown = run(root, "--base", "missing-ref");
    assert.equal(unknown.status, 1);
    assert.equal(unknown.stdout, "");
    assert.match(unknown.stderr, /cannot resolve base ref/);
});
