import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { JsonFileToolGrantStore } from "../src/index";
import type { ToolGrantMatcher } from "../../runtime/src/index";

const matcher: ToolGrantMatcher = {
    kind: "exact_input", toolId: "bash", version: 1, digest: `sha256:${"a".repeat(64)}`,
};
const source = { goalId: "goal-1", runId: "run-1", actionId: "action-1" };

test("pending Grant 在 Action 批准提交前不参与授权匹配，激活后跨 Run 可用", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-tool-grants-"));
    try {
        const store = new JsonFileToolGrantStore(directory);
        const staged = await store.stage({
            scope: "goal", goalId: source.goalId, workspaceId: "workspace-1", source, matcher,
        });
        assert.equal(staged.status, "pending");
        assert.equal(await store.findActiveMatching({ workspaceId: "workspace-1", goalId: source.goalId, matcher }), undefined);

        const restartedStore = new JsonFileToolGrantStore(directory);
        await assert.rejects(restartedStore.activate(staged.id, { ...source, actionId: "stale-action" }));
        await restartedStore.activate(staged.id, source);
        assert.equal((await restartedStore.findActiveMatching({ workspaceId: "workspace-1", goalId: source.goalId, matcher }))?.id, staged.id);
        assert.equal(await restartedStore.findActiveMatching({ workspaceId: "workspace-1", goalId: "other-goal", matcher }), undefined);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test("重复 stage 按来源幂等，冲突与撤销授权不能再次激活", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-tool-grants-"));
    try {
        const store = new JsonFileToolGrantStore(directory);
        const staged = await store.stage({
            scope: "workspace", workspaceId: "workspace-1", source, matcher,
        });
        assert.equal((await store.stage({
            scope: "workspace", workspaceId: "workspace-1", source, matcher,
        })).id, staged.id);
        await assert.rejects(store.stage({
            scope: "workspace", workspaceId: "workspace-1", source,
            matcher: { ...matcher, digest: `sha256:${"b".repeat(64)}` },
        }));
        await store.activate(staged.id, source);
        assert.equal((await store.findActiveMatching({
            workspaceId: "workspace-1",
            goalId: "another-goal",
            matcher,
        }))?.id, staged.id);
        assert.deepEqual(await store.list({ workspaceId: "other-workspace", goalId: "another-goal" }), []);
        await assert.rejects(store.revoke({ grantId: staged.id, workspaceId: "other-workspace" }));
        await store.revoke({ grantId: staged.id, workspaceId: "workspace-1" });
        assert.equal(await store.findActiveMatching({ workspaceId: "workspace-1", goalId: "another-goal", matcher }), undefined);
        await assert.rejects(store.activate(staged.id, source));
        assert.equal((await store.revoke({ grantId: staged.id, workspaceId: "workspace-1" })).status, "revoked");
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test("损坏账本失败关闭且不会自动覆盖", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-tool-grants-"));
    try {
        const filePath = join(directory, "tool-grants.json");
        await writeFile(filePath, "{not json", "utf8");
        const store = new JsonFileToolGrantStore(directory);
        await assert.rejects(store.findActiveMatching({ workspaceId: "workspace-1", goalId: "goal-1", matcher }));
        assert.equal(await readFile(filePath, "utf8"), "{not json");
    } finally { await rm(directory, { recursive: true, force: true }); }
});
