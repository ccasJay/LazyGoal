import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { JsonFileToolGrantStore } from "../src/index";
import type { ToolGrantMatcher } from "../../runtime/src/index";

const matcher: ToolGrantMatcher = {
    kind: "exact_input", toolId: "bash", version: 1, digest: `sha256:${"a".repeat(64)}`,
};
const source = { goalId: "goal-1", runId: "run-1", actionId: "action-1", approvalInputId: "input-1" };

test("删除 Goal 授权保留项目授权", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-tool-grants-"));
    try {
        const store = new JsonFileToolGrantStore(directory);
        await store.stage({ scope: "goal", goalId: "goal-1", workspaceId: "workspace-1", source, matcher });
        await store.stage({ scope: "workspace", workspaceId: "workspace-1", source: { ...source, actionId: "action-2" }, matcher });
        await store.deleteGoalGrants("workspace-1", "goal-1");
        const restored = new JsonFileToolGrantStore(directory);
        assert.deepEqual((await restored.list({ workspaceId: "workspace-1", goalId: "goal-1" })).map((grant) => grant.scope), ["workspace"]);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

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

test("同一 Action 的不同决定身份各自暂存一条 pending 记录，同一身份复用原记录", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-tool-grants-decisions-"));
    try {
        const store = new JsonFileToolGrantStore(directory);
        const first = await store.stage({
            scope: "goal",
            goalId: "goal-1",
            workspaceId: "workspace-1",
            source: { ...source, approvalInputId: "input-first" },
            matcher,
        });
        const sameDecision = await store.stage({
            scope: "goal",
            goalId: "goal-1",
            workspaceId: "workspace-1",
            source: { ...source, approvalInputId: "input-first" },
            matcher,
        });
        assert.equal(sameDecision.id, first.id);

        const second = await store.stage({
            scope: "goal",
            goalId: "goal-1",
            workspaceId: "workspace-1",
            source: { ...source, approvalInputId: "input-second" },
            matcher: { kind: "target_path", toolId: "write_file", version: 1, path: "/workspace/b.txt" },
        });
        assert.notEqual(second.id, first.id);

        const all = await store.list({ workspaceId: "workspace-1", goalId: "goal-1" });
        assert.equal(all.length, 2);
        assert.deepEqual(all.map((grant) => grant.status), ["pending", "pending"]);

        // 只有被已提交批准引用的一条可以激活；另一条保持 pending。
        const activated = await store.activate(second.id, second.source);
        assert.equal(activated.status, "active");
        const after = await store.list({ workspaceId: "workspace-1", goalId: "goal-1" });
        assert.equal(after.find((grant) => grant.id === first.id)?.status, "pending");
        assert.equal(after.find((grant) => grant.id === second.id)?.status, "active");
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test("tool-grants.json 以 0600 保存且新建目录为 0700", async () => {
    const parent = await mkdtemp(join(tmpdir(), "lazygoal-tool-grants-"));
    const directory = join(parent, "nested");
    try {
        const store = new JsonFileToolGrantStore(directory);
        await store.stage({ scope: "workspace", workspaceId: "workspace-1", source, matcher });
        assert.equal((await stat(directory)).mode & 0o777, 0o700);
        assert.equal((await stat(join(directory, "tool-grants.json"))).mode & 0o777, 0o600);
    } finally { await rm(parent, { recursive: true, force: true }); }
});
