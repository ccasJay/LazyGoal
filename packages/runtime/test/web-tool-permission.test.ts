import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    createGoal,
    Runner,
    transition,
    type AgentDecision,
    type AgentProfile,
    type Goal,
    type StepExecutionInput,
    type StepExecutor,
} from "../src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
} from "../../tool-core/src/index";
import {
    WebFetchTool,
    WEB_FETCH_TOOL_ID,
    WebSearchTool,
    WEB_SEARCH_TOOL_ID,
} from "../../tools/src/index";
import { InMemoryGoalStore, JsonFileSandboxGrantStore } from "../../storage/src/index";
import { resolveEffectiveSandboxScope } from "../../sandbox/src/index";
import type { PermissionMode, ProjectPermissionModeStore } from "../../permission/src/index";
import { BaseTestStepExecutor, currentProtocols, trajectoryStoreFor, withDiscoveredProfileTools } from "./current-fixtures";

class FakeStepExecutor extends BaseTestStepExecutor {
    private readonly decisions: readonly AgentDecision[];
    private index = 0;

    constructor(decisions: readonly AgentDecision[]) {
        super();
        this.decisions = decisions;
    }

    async execute(_input: StepExecutionInput): Promise<AgentDecision> {
        const decision = this.decisions[this.index++];
        if (decision === undefined) {
            throw new Error("Unexpected StepExecutor call");
        }
        return structuredClone(decision);
    }
}

function createMockModeStore(mode: PermissionMode): ProjectPermissionModeStore {
    return {
        async get(workspaceId: string) {
            return { workspaceId, mode, revision: 1 };
        },
        async set(workspaceId: string, nextMode: PermissionMode, expectedRevision: number) {
            return { workspaceId, mode: nextMode, revision: expectedRevision + 1 };
        },
    };
}

const profile: AgentProfile = {
    id: "web-test-profile",
    systemPrompt: "You are an agent with web tools.",
    instructions: ["Search and fetch"],
    toolIds: [WEB_SEARCH_TOOL_ID, WEB_FETCH_TOOL_ID],
};

function createTestGoal(goalId: string, runId: string): Goal {
    return withDiscoveredProfileTools(createGoal({
        ...currentProtocols,
        id: goalId,
        intent: "测试网页工具权限与沙箱控制",
        promptBundleVersion: 1,
        profile,
        runId,
        maxSteps: 5,
    }));
}

test("WebSearchTool 与 WebFetchTool 正确派生 all_outbound 网络能力", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-web-perm-"));
    try {
        const searchTool = new WebSearchTool(async () => []);
        const fetchTool = new WebFetchTool(async () => "content");

        const searchAccess = searchTool.resolveSandboxAccess({ query: "LazyGoal" });
        assert.ok(searchAccess.network !== undefined);
        assert.deepEqual(searchAccess.network.targets, ["all_outbound"]);

        const searchScope = await resolveEffectiveSandboxScope(tmpDir, searchAccess);
        assert.equal(searchScope.network, "all_outbound");
        assert.equal(searchScope.extraFiles.length, 0);

        const fetchAccess = fetchTool.resolveSandboxAccess({ url: "https://example.com/page" });
        assert.ok(fetchAccess.network !== undefined);
        assert.deepEqual(fetchAccess.network.targets, ["example.com"]);

        const fetchScope = await resolveEffectiveSandboxScope(tmpDir, fetchAccess);
        assert.equal(fetchScope.network, "all_outbound");
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("Default 模式下 web_search 触发沙箱审批挂起且后端不被提前调用", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-web-perm-"));
    try {
        const store = new InMemoryGoalStore();
        let backendCalled = false;

        const searchTool = new WebSearchTool(async () => {
            backendCalled = true;
            return [];
        });

        const registry = new InMemoryToolRegistry([
            createToolRegistration(searchTool),
        ]);

        const actionId = "act-search-perm-1";
        const decision: AgentDecision = {
            kind: "tool_call",
            action: {
                actionId,
                toolId: WEB_SEARCH_TOOL_ID,
                input: { query: "Rust async" },
            },
        };

        const runner = new Runner({
            store,
            trajectoryStore: trajectoryStoreFor(store),
            executor: new FakeStepExecutor([decision]),
            toolRegistry: registry,
            workspaceRoot: tmpDir,
            workspaceId: "ws-1",
            permissionModeStore: createMockModeStore("default"),
            sandboxPlanResolver: async ({ action, effectiveScope }) => {
                if (effectiveScope === undefined) return undefined;
                return {
                    actionId: action.actionId,
                    workspaceRoot: tmpDir,
                    scope: effectiveScope,
                };
            },
        });

        const goal = createTestGoal("goal-web-1", "run-web-1");
        await store.save(goal);
        await runner.run({ goalId: goal.id, runId: goal.state.run.id });

        const updated = await store.restore(goal.id);
        assert.ok(updated);
        // 关键安全判据：后端绝未提前调用
        assert.equal(backendCalled, false);
        // 挂起等待审批
        assert.equal(updated.state.run.status, "waiting");
        assert.equal(updated.state.run.pendingAction?.status, "awaiting_approval");
        assert.equal(updated.state.run.pendingAction?.approvalKind, "sandbox");
        assert.equal(updated.state.run.pendingAction?.effectiveSandboxScope?.network, "all_outbound");
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("单次审批后恢复执行：携带核准沙箱网络计划成功调用后端并记录事实", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-web-perm-"));
    try {
        const store = new InMemoryGoalStore();
        let backendCalled = false;

        const fetchTool = new WebFetchTool(async () => {
            backendCalled = true;
            return "<html><body>Hello LazyGoal</body></html>";
        });

        const registry = new InMemoryToolRegistry([
            createToolRegistration(fetchTool),
        ]);

        const actionId = "act-fetch-perm-1";
        const decision: AgentDecision = {
            kind: "tool_call",
            action: {
                actionId,
                toolId: WEB_FETCH_TOOL_ID,
                input: { url: "https://example.com/test" },
            },
        };

        const runner = new Runner({
            store,
            trajectoryStore: trajectoryStoreFor(store),
            executor: new FakeStepExecutor([decision]),
            toolRegistry: registry,
            workspaceRoot: tmpDir,
            workspaceId: "ws-1",
            permissionModeStore: createMockModeStore("default"),
            sandboxPlanResolver: async ({ action, effectiveScope }) => {
                if (effectiveScope === undefined) return undefined;
                return {
                    actionId: action.actionId,
                    workspaceRoot: tmpDir,
                    scope: effectiveScope,
                };
            },
        });

        const goal = createTestGoal("goal-web-2", "run-web-2");
        await store.save(goal);
        // 第一次运行：挂起
        await runner.run({ goalId: goal.id, runId: goal.state.run.id });

        const waiting = await store.restore(goal.id);
        assert.ok(waiting);
        assert.equal(backendCalled, false);
        assert.equal(waiting.state.run.status, "waiting");

        // 用户单次核准
        const approved = transition(waiting.state.run, {
            kind: "approve_action",
            actionId,
            approvalScope: "action",
        });
        assert.equal(approved.ok, true);
        if (!approved.ok) return;

        await store.save({
            ...waiting,
            state: {
                ...waiting.state,
                run: approved.state,
            },
        });

        // 恢复执行并注入获准网络执行计划
        const plan = {
            actionId,
            workspaceRoot: tmpDir,
            scope: { extraFiles: [], network: "all_outbound" as const },
        };
        const resumeResult = await runner.run(
            { goalId: goal.id, runId: goal.state.run.id },
            { authorizedActionId: actionId, sandboxExecutionPlan: plan },
        );
        assert.equal(resumeResult.ok, true);

        // 验证已成功调用
        assert.equal(backendCalled, true);
        const saved = await store.restore(goal.id);
        assert.ok(saved);
        assert.equal(saved.state.run.pendingAction, undefined);
        const lastStep = saved.state.run.lastStep;
        assert.equal(lastStep?.kind, "action");
        if (lastStep?.kind === "action") {
            assert.equal(lastStep.observation.kind, "success");
            const output = lastStep.observation.output as any;
            assert.match(output.text, /Hello LazyGoal/);
        }
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("YOLO 模式下无匹配 Sandbox Grant 时仍对网络请求强制审批", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-web-perm-"));
    try {
        const store = new InMemoryGoalStore();
        let backendCalled = false;

        const searchTool = new WebSearchTool(async () => {
            backendCalled = true;
            return [];
        });

        const registry = new InMemoryToolRegistry([
            createToolRegistration(searchTool),
        ]);

        const actionId = "act-search-yolo-1";
        const decision: AgentDecision = {
            kind: "tool_call",
            action: {
                actionId,
                toolId: WEB_SEARCH_TOOL_ID,
                input: { query: "query" },
            },
        };

        const runner = new Runner({
            store,
            trajectoryStore: trajectoryStoreFor(store),
            executor: new FakeStepExecutor([decision]),
            toolRegistry: registry,
            workspaceRoot: tmpDir,
            workspaceId: "ws-1",
            permissionModeStore: createMockModeStore("yolo"),
        });

        const goal = createTestGoal("goal-web-yolo", "run-web-yolo");
        await store.save(goal);
        await runner.run({ goalId: goal.id, runId: goal.state.run.id });

        const updated = await store.restore(goal.id);
        assert.ok(updated);
        // 关键安全判据：即使在 YOLO 模式下，沙箱网络能力未获准时绝不静默放行
        assert.equal(backendCalled, false);
        assert.equal(updated.state.run.status, "waiting");
        assert.equal(updated.state.run.pendingAction?.approvalKind, "sandbox");
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});
