import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
    createToolGrantMatcher,
    evaluateToolAuthorization,
    toolGrantMatchersEqual,
    type ToolAuthorizationContext,
    type ToolGrant,
    type ToolGrantLookup,
    type ToolGrantMatcher,
} from "../src/index";

class InMemoryToolGrantLookup implements ToolGrantLookup {
    constructor(private readonly grants: ToolGrant[] = []) {}

    async findActiveMatching(query: {
        readonly workspaceId: string;
        readonly goalId: string;
        readonly matcher: ToolGrantMatcher;
    }): Promise<ToolGrant | undefined> {
        return this.grants.find((grant) => {
            if (grant.workspaceId !== query.workspaceId) return false;
            if (grant.scope === "goal" && grant.goalId !== query.goalId) return false;
            return toolGrantMatchersEqual(grant.matcher, query.matcher);
        });
    }

    add(grant: ToolGrant): void {
        this.grants.push(grant);
    }
}

test("Default 模式下只读 Tool 直接自动放行 (source: readonly)", async () => {
    const context: ToolAuthorizationContext = {
        mode: "default",
        toolId: "read_file",
        isReadOnly: true,
        input: { path: "README.md" },
        workspaceRoot: "/workspace",
        workspaceId: "ws-1",
        goalId: "goal-1",
    };

    const decision = await evaluateToolAuthorization(context);
    assert.deepEqual(decision, {
        kind: "allow",
        source: "readonly",
    });
});

test("YOLO 模式下只读 Tool 同样自动放行 (source: readonly)", async () => {
    const context: ToolAuthorizationContext = {
        mode: "yolo",
        toolId: "grep",
        isReadOnly: true,
        input: { pattern: "TODO" },
        workspaceRoot: "/workspace",
        workspaceId: "ws-1",
        goalId: "goal-1",
    };

    const decision = await evaluateToolAuthorization(context);
    assert.deepEqual(decision, {
        kind: "allow",
        source: "readonly",
    });
});

test("Default 模式下非只读 Tool 无匹配授权时必须要求审批 (approval_required)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "perm-test-"));
    try {
        const context: ToolAuthorizationContext = {
            mode: "default",
            toolId: "bash",
            isReadOnly: false,
            input: { command: "git status" },
            workspaceRoot: tempDir,
            workspaceId: "ws-1",
            goalId: "goal-1",
        };

        const decision = await evaluateToolAuthorization(context);
        assert.equal(decision.kind, "approval_required");
        if (decision.kind === "approval_required") {
            assert.equal(decision.matcher.kind, "exact_input");
            assert.equal(decision.matcher.toolId, "bash");
            assert.match(decision.reason, /用户授权/);
        }
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("匹配已有 active 持续授权时直接放行 (source: grant)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "perm-test-"));
    try {
        const lookup = new InMemoryToolGrantLookup();
        const matcher = await createToolGrantMatcher("bash", { command: "npm test" }, tempDir);
        const grant: ToolGrant = {
            id: "grant-bash-1",
            scope: "goal",
            workspaceId: "ws-1",
            goalId: "goal-1",
            source: { goalId: "goal-1", runId: "run-1", actionId: "act-1" },
            matcher,
            status: "active",
        };
        lookup.add(grant);

        const decision = await evaluateToolAuthorization({
            mode: "default",
            toolId: "bash",
            isReadOnly: false,
            input: { command: "npm test" },
            workspaceRoot: tempDir,
            workspaceId: "ws-1",
            goalId: "goal-1",
            toolGrantLookup: lookup,
        });

        assert.equal(decision.kind, "allow");
        if (decision.kind === "allow") {
            assert.equal(decision.source, "grant");
            assert.equal(decision.grant?.id, "grant-bash-1");
        }
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("pending 或 revoked 状态的 Grant 不能用于放行，仍须审批", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "perm-test-"));
    try {
        const lookup = new InMemoryToolGrantLookup();
        const matcher = await createToolGrantMatcher("bash", { command: "git diff" }, tempDir);

        // 1. 处于 pending 状态的 grant
        const pendingGrant: ToolGrant = {
            id: "grant-pending",
            scope: "workspace",
            workspaceId: "ws-1",
            source: { goalId: "goal-1", runId: "run-1", actionId: "act-1" },
            matcher,
            status: "pending",
        };
        lookup.add(pendingGrant);

        const pendingDecision = await evaluateToolAuthorization({
            mode: "default",
            toolId: "bash",
            isReadOnly: false,
            input: { command: "git diff" },
            workspaceRoot: tempDir,
            workspaceId: "ws-1",
            goalId: "goal-1",
            toolGrantLookup: lookup,
        });
        assert.equal(pendingDecision.kind, "approval_required");

        // 2. 处于 revoked 状态的 grant
        const revokedLookup = new InMemoryToolGrantLookup();
        const revokedGrant: ToolGrant = {
            id: "grant-revoked",
            scope: "workspace",
            workspaceId: "ws-1",
            source: { goalId: "goal-1", runId: "run-1", actionId: "act-1" },
            matcher,
            status: "revoked",
        };
        revokedLookup.add(revokedGrant);

        const revokedDecision = await evaluateToolAuthorization({
            mode: "default",
            toolId: "bash",
            isReadOnly: false,
            input: { command: "git diff" },
            workspaceRoot: tempDir,
            workspaceId: "ws-1",
            goalId: "goal-1",
            toolGrantLookup: revokedLookup,
        });
        assert.equal(revokedDecision.kind, "approval_required");
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("不同 bash 命令不得共用授权", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "perm-test-"));
    try {
        const lookup = new InMemoryToolGrantLookup();
        const matcherA = await createToolGrantMatcher("bash", { command: "git status" }, tempDir);
        lookup.add({
            id: "grant-git-status",
            scope: "workspace",
            workspaceId: "ws-1",
            source: { goalId: "goal-1", runId: "run-1", actionId: "act-1" },
            matcher: matcherA,
            status: "active",
        });

        // 尝试执行不同的 bash 命令
        const decision = await evaluateToolAuthorization({
            mode: "default",
            toolId: "bash",
            isReadOnly: false,
            input: { command: "git push origin main" },
            workspaceRoot: tempDir,
            workspaceId: "ws-1",
            goalId: "goal-1",
            toolGrantLookup: lookup,
        });

        assert.equal(decision.kind, "approval_required");
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("write_file 对同一目标路径的不同内容可以复用 target_path 授权", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "perm-test-"));
    try {
        const lookup = new InMemoryToolGrantLookup();
        const matcherFirst = await createToolGrantMatcher(
            "write_file",
            { path: "config.json", content: '{"a": 1}' },
            tempDir,
        );
        lookup.add({
            id: "grant-write-config",
            scope: "goal",
            workspaceId: "ws-1",
            goalId: "goal-1",
            source: { goalId: "goal-1", runId: "run-1", actionId: "act-1" },
            matcher: matcherFirst,
            status: "active",
        });

        // 第二次向同一路径写入完全不同的内容
        const decision = await evaluateToolAuthorization({
            mode: "default",
            toolId: "write_file",
            isReadOnly: false,
            input: { path: "config.json", content: '{"a": 2, "b": "updated"}' },
            workspaceRoot: tempDir,
            workspaceId: "ws-1",
            goalId: "goal-1",
            toolGrantLookup: lookup,
        });

        assert.equal(decision.kind, "allow");
        if (decision.kind === "allow") {
            assert.equal(decision.source, "grant");
            assert.equal(decision.grant?.id, "grant-write-config");
        }
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("YOLO 模式下非只读 Tool 自动放行 (source: yolo)，且不生成持续授权", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "perm-test-"));
    try {
        const lookup = new InMemoryToolGrantLookup();
        const decision = await evaluateToolAuthorization({
            mode: "yolo",
            toolId: "write_file",
            isReadOnly: false,
            input: { path: "src/new.ts", content: "console.log(1);" },
            workspaceRoot: tempDir,
            workspaceId: "ws-1",
            goalId: "goal-1",
            toolGrantLookup: lookup,
        });

        assert.equal(decision.kind, "allow");
        if (decision.kind === "allow") {
            assert.equal(decision.source, "yolo");
            assert.equal(decision.grant, undefined);
        }
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("授权账本损坏或 lookup 抛错时必须直接抛出异常，绝不回退放行", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "perm-test-"));
    try {
        const corruptLookup: ToolGrantLookup = {
            async findActiveMatching() {
                throw new Error("账本 JSON 损坏，解析失败");
            },
        };

        await assert.rejects(
            async () => {
                await evaluateToolAuthorization({
                    mode: "yolo", // 即使处于 YOLO 模式，只要底层账本损坏，也不得静默忽略
                    toolId: "bash",
                    isReadOnly: false,
                    input: { command: "ls -la" },
                    workspaceRoot: tempDir,
                    workspaceId: "ws-1",
                    goalId: "goal-1",
                    toolGrantLookup: corruptLookup,
                });
            },
            /账本 JSON 损坏，解析失败/,
        );
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("非法路径输入派生匹配器失败时返回 deny", async () => {
    const decision = await evaluateToolAuthorization({
        mode: "default",
        toolId: "write_file",
        isReadOnly: false,
        input: { path: 123 }, // 非法 path 类型
        workspaceRoot: "/workspace",
        workspaceId: "ws-1",
        goalId: "goal-1",
    });

    assert.equal(decision.kind, "deny");
    if (decision.kind === "deny") {
        assert.equal(decision.code, "INVALID_MATCHER_INPUT");
    }
});
