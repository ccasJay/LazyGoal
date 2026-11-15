import assert from "node:assert/strict";
import test from "node:test";

import {
    computeInputDigest,
    createSandboxGrantMatcher,
    matchesSandboxGrant,
    matchesSandboxGrantMatcher,
    type SandboxGrant,
    type SandboxGrantMatcher,
    type SandboxGrantStore,
} from "../src/index";

test("matchesSandboxGrantMatcher: 命令一致且能力在已核准范围内时放行，超出维度拒绝", () => {
    const approved: SandboxGrantMatcher = createSandboxGrantMatcher("bash", { command: "curl https://example.com" }, {
        extraFiles: [
            { canonicalPath: "/etc/hosts", access: "write", kind: "file" },
            { canonicalPath: "/tmp/data", access: "read", kind: "directory_tree" },
        ],
        network: "all_outbound",
    });

    // 1. 完全相同
    assert.equal(matchesSandboxGrantMatcher(approved, approved), true);

    // 2. 不同命令不得复用
    const diffCmd: SandboxGrantMatcher = createSandboxGrantMatcher("bash", { command: "curl https://evil.com" }, {
        extraFiles: [],
        network: "none",
    });
    assert.equal(matchesSandboxGrantMatcher(diffCmd, approved), false);

    // 3. 安全子集能力：只要请求在已核准范围内，允许放行
    const subset: SandboxGrantMatcher = createSandboxGrantMatcher("bash", { command: "curl https://example.com" }, {
        extraFiles: [{ canonicalPath: "/etc/hosts", access: "read", kind: "file" }],
        network: "none",
    });
    assert.equal(matchesSandboxGrantMatcher(subset, approved), true);

    // 4. 超出文件范围（请求了未核准路径）
    const extraFile: SandboxGrantMatcher = createSandboxGrantMatcher("bash", { command: "curl https://example.com" }, {
        extraFiles: [
            { canonicalPath: "/etc/hosts", access: "read", kind: "file" },
            { canonicalPath: "/etc/passwd", access: "read", kind: "file" },
        ],
        network: "all_outbound",
    });
    assert.equal(matchesSandboxGrantMatcher(extraFile, approved), false);

    // 5. 超出文件权限（请求了 write 但仅获批 read）
    const approvedReadOnly: SandboxGrantMatcher = createSandboxGrantMatcher("bash", { command: "curl https://example.com" }, {
        extraFiles: [{ canonicalPath: "/etc/hosts", access: "read", kind: "file" }],
        network: "none",
    });
    const writeReq: SandboxGrantMatcher = createSandboxGrantMatcher("bash", { command: "curl https://example.com" }, {
        extraFiles: [{ canonicalPath: "/etc/hosts", access: "write", kind: "file" }],
        network: "none",
    });
    assert.equal(matchesSandboxGrantMatcher(writeReq, approvedReadOnly), false);

    // 6. 超出网络权限（未核准网络却请求网络）
    const netReq: SandboxGrantMatcher = createSandboxGrantMatcher("bash", { command: "curl https://example.com" }, {
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
        source: { goalId: "goal-1", runId: "run-1", actionId: "act-1", approvalInputId: "input-1" },
        matcher: createSandboxGrantMatcher("bash", { command: "python run.py" }, { extraFiles: [], network: "all_outbound" }),
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

test("computeInputDigest 固定 Tool 输入的字面量摘要", () => {
    assert.equal(
        computeInputDigest({ command: "git status", cwd: "/workspace" }),
        "4053d3628a804bc4c55cebd1cd0306b170b9e5770c126fe6c695cb565d6ba180",
    );
    assert.equal(
        computeInputDigest({ b: [2, 1], a: { d: 1, c: 2 }, "中文": "值" }),
        "f3365afb97d5847ecd2c90e3ef50149649f9f9970b77e7db7a36c6155555ccdf",
    );
});
