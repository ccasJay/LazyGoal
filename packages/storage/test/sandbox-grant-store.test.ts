import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { JsonFileSandboxGrantStore } from "../src/index";
import type { SandboxGrantMatcher } from "../../permission/src/index";

const matcher: SandboxGrantMatcher = {
    toolId: "bash",
    inputDigest: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    scope: {
        extraFiles: [
            { canonicalPath: "/tmp/data.txt", access: "write", kind: "file" },
        ],
        network: "all_outbound",
    },
    version: 1,
};
const source = { goalId: "goal-1", runId: "run-1", actionId: "action-1", approvalInputId: "input-1" };

test("删除 Goal 沙箱授权保留项目授权", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-sandbox-grants-"));
    try {
        const store = new JsonFileSandboxGrantStore(directory);
        await store.stage({ scope: "goal", goalId: "goal-1", workspaceId: "workspace-1", source, matcher });
        await store.stage({ scope: "workspace", workspaceId: "workspace-1", source: { ...source, actionId: "action-2" }, matcher });
        await store.deleteGoalGrants("workspace-1", "goal-1");
        const restored = new JsonFileSandboxGrantStore(directory);
        assert.deepEqual((await restored.list({ workspaceId: "workspace-1", goalId: "goal-1" })).map((grant) => grant.scope), ["workspace"]);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test("pending SandboxGrant 在 Action 批准提交前不参与授权匹配，激活后跨 Run 可用", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-sandbox-grants-"));
    try {
        const store = new JsonFileSandboxGrantStore(directory);
        const staged = await store.stage({
            scope: "goal",
            goalId: source.goalId,
            workspaceId: "workspace-1",
            source,
            matcher,
        });
        assert.equal(staged.status, "pending");
        assert.equal(
            await store.findActiveMatching({ workspaceId: "workspace-1", goalId: source.goalId, matcher }),
            undefined,
        );

        const restartedStore = new JsonFileSandboxGrantStore(directory);
        await assert.rejects(restartedStore.activate(staged.id, { ...source, actionId: "stale-action" }));
        await restartedStore.activate(staged.id, source);

        const active = await restartedStore.findActiveMatching({
            workspaceId: "workspace-1",
            goalId: source.goalId,
            matcher,
        });
        assert.equal(active?.id, staged.id);
        assert.equal(
            await restartedStore.findActiveMatching({ workspaceId: "workspace-1", goalId: "other-goal", matcher }),
            undefined,
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("重复 stage 按来源幂等，冲突与撤销授权不能再次激活", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-sandbox-grants-"));
    try {
        const store = new JsonFileSandboxGrantStore(directory);
        const staged = await store.stage({
            scope: "workspace",
            workspaceId: "workspace-1",
            source,
            matcher,
        });
        assert.equal(
            (await store.stage({
                scope: "workspace",
                workspaceId: "workspace-1",
                source,
                matcher,
            })).id,
            staged.id,
        );

        // 冲突的内容不能覆盖
        await assert.rejects(
            store.stage({
                scope: "workspace",
                workspaceId: "workspace-1",
                source,
                matcher: { ...matcher, inputDigest: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210" },
            }),
        );

        await store.activate(staged.id, source);
        assert.equal(
            (await store.findActiveMatching({
                workspaceId: "workspace-1",
                goalId: "another-goal",
                matcher,
            }))?.id,
            staged.id,
        );

        assert.deepEqual(await store.list({ workspaceId: "other-workspace", goalId: "another-goal" }), []);
        await assert.rejects(store.revoke({ grantId: staged.id, workspaceId: "other-workspace" }));

        // 成功撤销
        await store.revoke({ grantId: staged.id, workspaceId: "workspace-1" });
        assert.equal(
            await store.findActiveMatching({ workspaceId: "workspace-1", goalId: "another-goal", matcher }),
            undefined,
        );

        // 撤销后不可激活
        await assert.rejects(store.activate(staged.id, source));
        // 重复撤销幂等
        assert.equal((await store.revoke({ grantId: staged.id, workspaceId: "workspace-1" })).status, "revoked");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("损坏账本失败关闭且不会自动覆盖", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-sandbox-grants-"));
    try {
        const filePath = join(directory, "sandbox-grants.json");
        await writeFile(filePath, "{bad json content", "utf8");
        const store = new JsonFileSandboxGrantStore(directory);
        await assert.rejects(store.findActiveMatching({ workspaceId: "workspace-1", goalId: "goal-1", matcher }));
        assert.equal(await readFile(filePath, "utf8"), "{bad json content");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("同一 Action 的不同决定身份各自暂存一条 pending 记录，同一身份复用原记录", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-sandbox-grants-decisions-"));
    try {
        const store = new JsonFileSandboxGrantStore(directory);
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
            matcher: { ...matcher, scope: { extraFiles: [], network: "all_outbound" } },
        });
        assert.notEqual(second.id, first.id);

        const all = await store.list({ workspaceId: "workspace-1", goalId: "goal-1" });
        assert.equal(all.length, 2);
        assert.deepEqual(all.map((grant) => grant.status), ["pending", "pending"]);

        const activated = await store.activate(second.id, second.source);
        assert.equal(activated.status, "active");
        const after = await store.list({ workspaceId: "workspace-1", goalId: "goal-1" });
        assert.equal(after.find((grant) => grant.id === first.id)?.status, "pending");
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test("sandbox-grants.json 以 0600 保存且新建目录为 0700", async () => {
    const parent = await mkdtemp(join(tmpdir(), "lazygoal-sandbox-grants-"));
    const directory = join(parent, "nested");
    try {
        const store = new JsonFileSandboxGrantStore(directory);
        await store.stage({ scope: "workspace", workspaceId: "workspace-1", source, matcher });
        assert.equal((await stat(directory)).mode & 0o777, 0o700);
        assert.equal((await stat(join(directory, "sandbox-grants.json"))).mode & 0o777, 0o600);
    } finally { await rm(parent, { recursive: true, force: true }); }
});
