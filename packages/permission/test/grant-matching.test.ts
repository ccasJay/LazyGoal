import assert from "node:assert/strict";
import test from "node:test";

import {
    createSandboxGrantMatcher,
    DefaultPermissionGrantService,
    matchesSandboxGrant,
    matchesSandboxGrantMatcher,
    matchesToolGrant,
    matchesToolGrantMatcher,
    type SandboxGrant,
    type SandboxGrantMatcher,
    type SandboxGrantStore,
    type ToolGrant,
    type ToolGrantMatcher,
    type ToolGrantStore,
} from "../src/index";

test("matchesToolGrantMatcher: 严格比对 exact_input 与 target_path", () => {
    const input1: ToolGrantMatcher = {
        kind: "exact_input",
        toolId: "bash",
        version: 1,
        digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };
    const input2: ToolGrantMatcher = {
        kind: "exact_input",
        toolId: "bash",
        version: 1,
        digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };
    assert.equal(matchesToolGrantMatcher(input1, input1), true);
    assert.equal(matchesToolGrantMatcher(input1, input2), false);

    const path1: ToolGrantMatcher = {
        kind: "target_path",
        toolId: "write_file",
        version: 1,
        path: "/workspace/project/src/index.ts",
    };
    const path2: ToolGrantMatcher = {
        kind: "target_path",
        toolId: "write_file",
        version: 1,
        path: "/workspace/project/src/other.ts",
    };
    assert.equal(matchesToolGrantMatcher(path1, path1), true);
    assert.equal(matchesToolGrantMatcher(path1, path2), false);
    assert.equal(matchesToolGrantMatcher(path1, input1 as any), false);
});

test("matchesSandboxGrantMatcher: 命令一致且能力在已核准范围内时放行，超出维度拒绝", () => {
    const approved: SandboxGrantMatcher = createSandboxGrantMatcher("curl https://example.com", {
        extraFiles: [
            { canonicalPath: "/etc/hosts", access: "write", kind: "file" },
            { canonicalPath: "/tmp/data", access: "read", kind: "directory_tree" },
        ],
        network: "all_outbound",
    });

    // 1. 完全相同
    assert.equal(matchesSandboxGrantMatcher(approved, approved), true);

    // 2. 不同命令不得复用
    const diffCmd: SandboxGrantMatcher = createSandboxGrantMatcher("curl https://evil.com", {
        extraFiles: [],
        network: "none",
    });
    assert.equal(matchesSandboxGrantMatcher(diffCmd, approved), false);

    // 3. 安全子集能力：只要请求在已核准范围内，允许放行
    const subset: SandboxGrantMatcher = createSandboxGrantMatcher("curl https://example.com", {
        extraFiles: [{ canonicalPath: "/etc/hosts", access: "read", kind: "file" }],
        network: "none",
    });
    assert.equal(matchesSandboxGrantMatcher(subset, approved), true);

    // 4. 超出文件范围（请求了未核准路径）
    const extraFile: SandboxGrantMatcher = createSandboxGrantMatcher("curl https://example.com", {
        extraFiles: [
            { canonicalPath: "/etc/hosts", access: "read", kind: "file" },
            { canonicalPath: "/etc/passwd", access: "read", kind: "file" },
        ],
        network: "all_outbound",
    });
    assert.equal(matchesSandboxGrantMatcher(extraFile, approved), false);

    // 5. 超出文件权限（请求了 write 但仅获批 read）
    const approvedReadOnly: SandboxGrantMatcher = createSandboxGrantMatcher("curl https://example.com", {
        extraFiles: [{ canonicalPath: "/etc/hosts", access: "read", kind: "file" }],
        network: "none",
    });
    const writeReq: SandboxGrantMatcher = createSandboxGrantMatcher("curl https://example.com", {
        extraFiles: [{ canonicalPath: "/etc/hosts", access: "write", kind: "file" }],
        network: "none",
    });
    assert.equal(matchesSandboxGrantMatcher(writeReq, approvedReadOnly), false);

    // 6. 超出网络权限（未核准网络却请求网络）
    const netReq: SandboxGrantMatcher = createSandboxGrantMatcher("curl https://example.com", {
        extraFiles: [],
        network: "all_outbound",
    });
    assert.equal(matchesSandboxGrantMatcher(netReq, approvedReadOnly), false);
});

test("matchesSandboxGrant: 作用域与撤销状态边界", () => {
    const grant: SandboxGrant = {
        id: "grant-1",
        scope: "goal",
        workspaceId: "ws-1",
        goalId: "goal-1",
        source: { goalId: "goal-1", runId: "run-1", actionId: "act-1" },
        matcher: createSandboxGrantMatcher("python run.py", { extraFiles: [], network: "all_outbound" }),
        status: "active",
    };

    const matcher = grant.matcher;

    // 同 Goal 匹配
    assert.equal(matchesSandboxGrant({ workspaceId: "ws-1", goalId: "goal-1", matcher }, grant), true);

    // 不同 Goal 拒绝
    assert.equal(matchesSandboxGrant({ workspaceId: "ws-1", goalId: "goal-2", matcher }, grant), false);

    // 不同 workspace 拒绝
    assert.equal(matchesSandboxGrant({ workspaceId: "ws-2", goalId: "goal-1", matcher }, grant), false);

    // 状态非 active 拒绝
    assert.equal(matchesSandboxGrant({ workspaceId: "ws-1", goalId: "goal-1", matcher }, { ...grant, status: "revoked" }), false);
    assert.equal(matchesSandboxGrant({ workspaceId: "ws-1", goalId: "goal-1", matcher }, { ...grant, status: "pending" }), false);

    // workspace 作用域跨 Goal 有效
    const { goalId: _ignored, ...rest } = grant;
    const wsGrant: SandboxGrant = {
        ...rest,
        scope: "workspace",
    };
    assert.equal(matchesSandboxGrant({ workspaceId: "ws-1", goalId: "goal-2", matcher }, wsGrant), true);
});

test("DefaultPermissionGrantService: 聚合列表与分别撤销", async () => {
    const fakeToolStore: ToolGrantStore = {
        findActiveMatching: async () => undefined,
        stage: async (g) => ({ ...g, id: "tool-1", status: "pending" }),
        activate: async (id, source) => ({
            id,
            scope: "goal",
            workspaceId: "ws-1",
            goalId: "goal-1",
            source,
            matcher: { kind: "exact_input", toolId: "bash", version: 1, digest: "sha256:abc" as any },
            status: "active",
        }),
        list: async () => [
            {
                id: "tool-1",
                scope: "goal",
                workspaceId: "ws-1",
                goalId: "goal-1",
                source: { goalId: "goal-1", runId: "run-1", actionId: "act-1" },
                matcher: { kind: "exact_input", toolId: "bash", version: 1, digest: "sha256:abc" as any },
                status: "active",
            },
        ],
        revoke: async ({ grantId }) => ({
            id: grantId,
            scope: "goal",
            workspaceId: "ws-1",
            goalId: "goal-1",
            source: { goalId: "goal-1", runId: "run-1", actionId: "act-1" },
            matcher: { kind: "exact_input", toolId: "bash", version: 1, digest: "sha256:abc" as any },
            status: "revoked",
        }),
    };

    let sandboxRevoked = false;
    const fakeSandboxStore: SandboxGrantStore = {
        findActiveMatching: async () => undefined,
        stage: async (g) => ({ ...g, id: "sb-1", status: "pending" }),
        activate: async (id, source) => ({
            id,
            scope: "workspace",
            workspaceId: "ws-1",
            source,
            matcher: createSandboxGrantMatcher("python test.py", { extraFiles: [], network: "none" }),
            status: "active",
        }),
        list: async () => [
            {
                id: "sb-1",
                scope: "workspace",
                workspaceId: "ws-1",
                source: { goalId: "goal-1", runId: "run-1", actionId: "act-2" },
                matcher: createSandboxGrantMatcher("python test.py", { extraFiles: [], network: "none" }),
                status: "active",
            },
        ],
        revoke: async ({ grantId }) => {
            if (grantId === "sb-1") sandboxRevoked = true;
            return {
                id: grantId,
                scope: "workspace",
                workspaceId: "ws-1",
                source: { goalId: "goal-1", runId: "run-1", actionId: "act-2" },
                matcher: createSandboxGrantMatcher("python test.py", { extraFiles: [], network: "none" }),
                status: "revoked",
            };
        },
    };

    const service = new DefaultPermissionGrantService(fakeToolStore, fakeSandboxStore);

    const list = await service.list({ workspaceId: "ws-1", goalId: "goal-1" });
    assert.equal(list.length, 2);
    assert.ok(list[0]);
    assert.ok(list[1]);
    assert.equal(list[0].id, "sb-1");
    assert.equal(list[0].kind, "sandbox");
    assert.equal(list[1].id, "tool-1");
    assert.equal(list[1].kind, "tool");

    await service.revoke({ kind: "sandbox", grantId: "sb-1", workspaceId: "ws-1" });
    assert.equal(sandboxRevoked, true);
});
