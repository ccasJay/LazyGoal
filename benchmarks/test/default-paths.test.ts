import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { resolveBenchmarkHomePaths } from "../src/default-paths.js";

test("benchmark 默认路径按 workspace 隔离并将 cache 放入全局 Home", async () => {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-benchmark-paths-"));
    const home = join(root, "home");
    const workspace = join(root, "checkout");
    const otherWorkspace = join(root, "other-checkout");
    await Promise.all([
        mkdir(workspace),
        mkdir(otherWorkspace),
    ]);
    try {
        const env = { LAZYGOAL_HOME: home };
        const first = await resolveBenchmarkHomePaths(workspace, "gaia", env);
        const second = await resolveBenchmarkHomePaths(otherWorkspace, "gaia", env);

        assert.notEqual(first.runsDirectory, second.runsDirectory);
        assert.equal(first.cacheDirectory, second.cacheDirectory);
        assert.equal(first.runsDirectory.endsWith("/benchmarks/gaia/runs"), true);
        assert.equal(first.cacheDirectory, join(home, "cache", "benchmarks", "gaia"));
        await assert.rejects(access(first.runsDirectory));
        await assert.rejects(access(first.cacheDirectory));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
