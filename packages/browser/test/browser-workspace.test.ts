import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { createBrowserWorkspaceRoutes, createBrowserSessionAccess } from "../src/index";
import { createHttpService } from "../../http/src/index";

const git = promisify(execFile);

test("workspace route reads a linked worktree and distinguishes detached HEAD", async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), "lazygoal-workspace-")));
    const repository = join(directory, "repository");
    const worktree = join(directory, "task");
    try {
        await git("git", ["init", "--initial-branch=main", repository]);
        await git("git", ["-C", repository, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "initial"]);
        await git("git", ["-C", repository, "worktree", "add", "-b", "feature/task", worktree]);
        const routes = createBrowserWorkspaceRoutes(worktree);
        const named = await routes.request("/api/project/workspace");
        assert.equal(named.status, 200);
        assert.deepEqual(await named.json(), { workspaceRoot: worktree, worktreeRoot: worktree, branch: "feature/task" });

        await git("git", ["-C", worktree, "checkout", "--detach"]);
        const detached = await routes.request("/api/project/workspace");
        assert.deepEqual(await detached.json(), { workspaceRoot: worktree, worktreeRoot: worktree, branch: null });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("workspace route distinguishes a non-Git workspace from an unreadable location", async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), "lazygoal-non-git-")));
    try {
        const response = await createBrowserWorkspaceRoutes(directory).request("/api/project/workspace");
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { workspaceRoot: directory, worktreeRoot: null, branch: null });
        const missing = await createBrowserWorkspaceRoutes(join(directory, "missing")).request("/api/project/workspace");
        assert.equal(missing.status, 503);
        assert.deepEqual(await missing.json(), { error: "workspace_context_unavailable" });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("workspace absolute paths require the browser session token", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-workspace-access-"));
    const access = createBrowserSessionAccess();
    const service = createHttpService({ middleware: access.middleware });
    service.mount("/", createBrowserWorkspaceRoutes(directory));
    const address = await service.start(0);
    access.bindOrigin(address.origin);
    const token = new URL(access.createLaunchUrl(address.origin)).hash.slice(1);
    try {
        const denied = await fetch(`${address.origin}/api/project/workspace`);
        assert.equal(denied.status, 401);
        const allowed = await fetch(`${address.origin}/api/project/workspace`, { headers: { authorization: `Bearer ${token}` } });
        assert.equal(allowed.status, 200);
        assert.deepEqual(await allowed.json(), { workspaceRoot: directory, worktreeRoot: null, branch: null });
    } finally {
        await service.close();
        await rm(directory, { recursive: true, force: true });
    }
});
