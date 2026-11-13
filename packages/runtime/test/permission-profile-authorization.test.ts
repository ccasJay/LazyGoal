import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
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
    type GoalTask,
    type JsonValue,
    type StepExecutionInput,
} from "../src/index";
import {
    createToolRegistration,
    type Tool,
    type ToolExecutionRequest,
    type ToolObservation,
    type ToolValidationResult,
} from "../../tool-core/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import {
    PERMISSION_PRESETS,
    type PermissionProfile,
    type ProjectPermissionProfileStore,
} from "../../permission/src/index";
import { GIT_STATUS_TOOL_ID, GitStatusTool } from "../../tools/src/index";
import {
    BaseTestStepExecutor,
    currentProtocols,
    InMemoryTrajectoryStore,
    trajectoryStoreFor,
    withDiscoveredProfileTools,
} from "./current-fixtures";
import { createTestBinding, sandboxCommandSchema } from "../../tool-core/test/binding-fixtures";
import { createTestToolRegistration } from "../../tool-core/test/helpers";

const TEST_INPUT_SCHEMA = sandboxCommandSchema();

const READ_ONLY_PROFILE: PermissionProfile = {
    sandbox: "read-only",
    approvals: "on-request",
    reviewer: "user",
    writableRoots: [],
};

const NEVER_PROFILE: PermissionProfile = {
    sandbox: "workspace-write",
    approvals: "never",
    reviewer: "user",
    writableRoots: [],
};

type SandboxTestInput = {
    readonly command: string;
    readonly sandboxAccess?: {
        readonly files?: readonly {
            readonly path: string;
            readonly access: "read" | "write";
            readonly kind: "file" | "directory_tree";
            readonly purpose: string;
        }[];
        readonly network?: {
            readonly targets: readonly string[];
            readonly purpose: string;
        };
    };
};

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

function createRecordingTool(
    toolId: string,
    executed: string[],
): Tool<SandboxTestInput> {
    return {
        definition: {
            id: toolId,
            description: `${toolId} 测试工具`,
            inputBinding: createTestBinding("test.tool", TEST_INPUT_SCHEMA),
            isReadOnly: false,
        },
        replayPolicy: "manual",
        validate(_input): ToolValidationResult {
            return { ok: true };
        },
        resolveSandboxAccess(input) {
            return input.sandboxAccess;
        },
        async execute(request: ToolExecutionRequest<SandboxTestInput>): Promise<ToolObservation> {
            executed.push(request.actionId);
            return {
                kind: "success",
                output: { command: request.input.command } as JsonValue,
                summary: "命令执行成功",
            };
        },
    };
}

function createProfileStore(initial: PermissionProfile): {
    readonly store: ProjectPermissionProfileStore;
    readonly setProfile: (profile: PermissionProfile) => void;
    readonly reads: () => number;
} {
    let current = initial;
    let reads = 0;
    return {
        store: {
            async get(workspaceId: string) {
                reads += 1;
                return { workspaceId, profile: current, revision: 1 };
            },
            async update(workspaceId: string, profile: PermissionProfile, expectedRevision: number) {
                current = profile;
                return { workspaceId, profile, revision: expectedRevision + 1 };
            },
        },
        setProfile: (profile) => {
            current = profile;
        },
        reads: () => reads,
    };
}

const profile: AgentProfile = {
    id: "permission-boundary-profile",
    systemPrompt: "test",
    instructions: [],
    toolIds: ["bash", "write_file", GIT_STATUS_TOOL_ID],
};

function createTestGoal(goalId: string, runId: string, toolIds: readonly string[] = profile.toolIds): Goal {
    const created = withDiscoveredProfileTools(createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: goalId,
        intent: "验证权限边界判定",
        profile: { ...profile, toolIds: [...toolIds] },
        runId,
        maxSteps: 4,
    }));
    const approvedTask: GoalTask = { objective: "验证权限边界判定", completionCriteria: [] };
    return {
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                mode: "plan",
                approvedTask,
            },
        },
    };
}

function toolCall(actionId: string, toolId: string, input: JsonValue): AgentDecision {
    return { kind: "tool_call", action: { actionId, toolId, input } };
}

function completeDecision(): AgentDecision {
    return { kind: "complete", completionEvidence: [], summary: "完成" };
}

function observationFor(
    trajectory: InMemoryTrajectoryStore,
    actionId: string,
): { readonly kind: string; readonly code?: string; readonly message?: string; readonly summary?: string } | undefined {
    const event = trajectory.events.find((candidate) =>
        candidate.eventType === "observation_recorded" && candidate.actionId === actionId);
    if (event?.eventType !== "observation_recorded") return undefined;
    return event.payload.observation as { readonly kind: string; readonly code?: string; readonly message?: string };
}

function eventTypesFor(trajectory: InMemoryTrajectoryStore, actionId: string): readonly string[] {
    return trajectory.events
        .filter((event) => event.actionId === actionId)
        .map((event) => event.eventType);
}

async function createWorkspace(prefix: string): Promise<{
    readonly tempRoot: string;
    readonly root: string;
    readonly outside: string;
}> {
    const tempRoot = await realpath(await mkdtemp(join(tmpdir(), prefix)));
    const root = join(tempRoot, "workspace");
    const outside = join(tempRoot, "outside");
    await mkdir(root, { recursive: true });
    await mkdir(outside, { recursive: true });
    return { tempRoot, root, outside };
}

test("工作区内 git_status 在 ask、read-only 与 full 三档下都直接执行", async () => {
    const workspace = await createWorkspace("lg-perm-git-status-");
    try {
        execFileSync("git", ["init", "-b", "main", workspace.root], { stdio: "ignore" });
        const cases: readonly { readonly name: string; readonly profile: PermissionProfile }[] = [
            { name: "ask", profile: PERMISSION_PRESETS.ask },
            { name: "read-only", profile: READ_ONLY_PROFILE },
            { name: "full", profile: PERMISSION_PRESETS.full },
        ];

        for (const item of cases) {
            const executed: string[] = [];
            const store = new InMemoryGoalStore();
            const trajectory = trajectoryStoreFor(store);
            const gitTool = new GitStatusTool(workspace.root, { enableSeatbelt: false });
            const runner = new Runner({
                store,
                trajectoryStore: trajectory,
                executor: new FakeStepExecutor([
                    toolCall("act-git-status", GIT_STATUS_TOOL_ID, {}),
                    completeDecision(),
                ]),
                toolRegistry: {
                    get(id: string) {
                        if (id === GIT_STATUS_TOOL_ID) return createToolRegistration(gitTool);
                        return createTestToolRegistration(createRecordingTool(id, executed));
                    },
                },
                workspaceRoot: workspace.root,
                workspaceId: "ws-git-status",
                permissionProfileStore: createProfileStore(item.profile).store,
            });

            const goal = createTestGoal(`goal-git-status-${item.name}`, `run-git-status-${item.name}`);
            await store.save(goal);
            const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
            assert.equal(result.ok, true, `${item.name}: ${result.ok ? "" : result.error.message}`);
            if (!result.ok) continue;

            assert.equal(result.state.status, "completed", item.name);
            assert.equal(result.state.pendingAction, undefined, item.name);
            assert.deepEqual(executed, [], item.name);
            const events = eventTypesFor(trajectory, "act-git-status");
            assert.ok(events.includes("tool_started"), item.name);
            assert.ok(events.includes("observation_recorded"), item.name);
            assert.equal(observationFor(trajectory, "act-git-status")?.kind, "success", item.name);
            assert.equal(
                trajectory.events.filter((event) => event.eventType === "action_staged"
                    && event.payload.approvalStatus === "awaiting_approval").length,
                0,
                item.name,
            );
        }
    } finally {
        await rm(workspace.tempRoot, { recursive: true, force: true });
    }
});

test("workspace-write 档位下工作区内的 bash 与 write_file 直接执行且不产生审批", async () => {
    const workspace = await createWorkspace("lg-perm-inbound-");
    try {
        const executed: string[] = [];
        const store = new InMemoryGoalStore();
        const trajectory = trajectoryStoreFor(store);
        const target = join(workspace.root, "out.txt");
        const runner = new Runner({
            store,
            trajectoryStore: trajectory,
            executor: new FakeStepExecutor([
                toolCall("act-bash-inbound", "bash", { command: "echo hello" }),
                toolCall("act-write-inbound", "write_file", {
                    command: "write",
                    sandboxAccess: {
                        files: [{ path: target, access: "write", kind: "file", purpose: "写入结果" }],
                    },
                }),
                completeDecision(),
            ]),
            toolRegistry: {
                get(id: string) {
                    return createTestToolRegistration(createRecordingTool(id, executed));
                },
            },
            workspaceRoot: workspace.root,
            workspaceId: "ws-inbound",
            permissionProfileStore: createProfileStore(PERMISSION_PRESETS.ask).store,
        });

        const goal = createTestGoal("goal-inbound", "run-inbound");
        await store.save(goal);
        const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
        assert.equal(result.ok, true);
        if (!result.ok) return;

        assert.equal(result.state.status, "completed");
        assert.deepEqual(executed, ["act-bash-inbound", "act-write-inbound"]);
        assert.equal(
            trajectory.events.filter((event) => event.eventType === "action_staged"
                && event.payload.approvalStatus === "awaiting_approval").length,
            0,
        );
    } finally {
        await rm(workspace.tempRoot, { recursive: true, force: true });
    }
});

test("read-only 档位下工作区写入被拒绝为 TOOL_NOT_AUTHORIZED 且 Run 不失败", async () => {
    const workspace = await createWorkspace("lg-perm-readonly-");
    try {
        const executed: string[] = [];
        const store = new InMemoryGoalStore();
        const trajectory = trajectoryStoreFor(store);
        const runner = new Runner({
            store,
            trajectoryStore: trajectory,
            executor: new FakeStepExecutor([
                toolCall("act-readonly-write", "bash", {
                    command: "echo hello > out.txt",
                    sandboxAccess: {
                        files: [{
                            path: join(workspace.root, "out.txt"),
                            access: "write",
                            kind: "file",
                            purpose: "写入结果",
                        }],
                    },
                }),
                completeDecision(),
            ]),
            toolRegistry: {
                get(id: string) {
                    return createTestToolRegistration(createRecordingTool(id, executed));
                },
            },
            workspaceRoot: workspace.root,
            workspaceId: "ws-readonly",
            permissionProfileStore: createProfileStore(READ_ONLY_PROFILE).store,
        });

        const goal = createTestGoal("goal-readonly", "run-readonly");
        await store.save(goal);
        const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
        assert.equal(result.ok, true);
        if (!result.ok) return;

        assert.equal(result.state.status, "completed");
        assert.equal(result.state.stepCount, 2);
        assert.deepEqual(executed, []);
        const observation = observationFor(trajectory, "act-readonly-write");
        assert.equal(observation?.kind, "failure");
        assert.equal(observation?.code, "TOOL_NOT_AUTHORIZED");
        assert.match(observation?.message ?? "", /read-only/);
        const events = eventTypesFor(trajectory, "act-readonly-write");
        assert.ok(!events.includes("tool_started"));
        assert.ok(!events.includes("execution_error"));
    } finally {
        await rm(workspace.tempRoot, { recursive: true, force: true });
    }
});

test("workspace-write + user：工作区外写入、出站网络与 .git 写入都暂存 sandbox 审批", async () => {
    const workspace = await createWorkspace("lg-perm-approval-");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(workspace.root, ".git"), { recursive: true });
    try {
        const cases: readonly {
            readonly name: string;
            readonly toolId: string;
            readonly input: JsonValue;
        }[] = [
            {
                name: "outside-write",
                toolId: "bash",
                input: {
                    command: "echo hi > outside.txt",
                    sandboxAccess: {
                        files: [{
                            path: join(workspace.outside, "outside.txt"),
                            access: "write",
                            kind: "file",
                            purpose: "写入工作区外文件",
                        }],
                    },
                },
            },
            {
                name: "network",
                toolId: "bash",
                input: {
                    command: "curl http://127.0.0.1:8080",
                    sandboxAccess: {
                        network: { targets: ["127.0.0.1"], purpose: "本地请求" },
                    },
                },
            },
            {
                name: "git-write",
                toolId: "bash",
                input: {
                    command: "echo x > .git/index",
                    sandboxAccess: {
                        files: [{
                            path: join(workspace.root, ".git", "index"),
                            access: "write",
                            kind: "file",
                            purpose: "写入 Git 元数据",
                        }],
                    },
                },
            },
        ];

        for (const item of cases) {
            const executed: string[] = [];
            const store = new InMemoryGoalStore();
            const trajectory = trajectoryStoreFor(store);
            const runner = new Runner({
                store,
                trajectoryStore: trajectory,
                executor: new FakeStepExecutor([
                    toolCall(`act-${item.name}`, item.toolId, item.input),
                    completeDecision(),
                ]),
                toolRegistry: {
                    get(id: string) {
                        return createTestToolRegistration(createRecordingTool(id, executed));
                    },
                },
                workspaceRoot: workspace.root,
                workspaceId: `ws-approval-${item.name}`,
                permissionProfileStore: createProfileStore(PERMISSION_PRESETS.ask).store,
            });

            const goal = createTestGoal(`goal-approval-${item.name}`, `run-approval-${item.name}`);
            await store.save(goal);
            const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
            assert.equal(result.ok, true, item.name);
            if (!result.ok) continue;

            assert.equal(result.state.status, "waiting", item.name);
            assert.equal(result.state.pendingAction?.status, "awaiting_approval", item.name);
            assert.equal(result.state.pendingAction?.approvalKind, "sandbox", item.name);
            assert.deepEqual(executed, [], item.name);
            const staged = trajectory.events.find((event) => event.eventType === "action_staged");
            assert.ok(staged?.eventType === "action_staged", item.name);
            if (staged?.eventType === "action_staged") {
                assert.equal(staged.payload.approvalStatus, "awaiting_approval", item.name);
                assert.equal(staged.payload.approvalKind, "sandbox", item.name);
            }
        }
    } finally {
        await rm(workspace.tempRoot, { recursive: true, force: true });
    }
});

test("auto_review：命中规则表的越界等待人工，无风险越界自动放行", async () => {
    const workspace = await createWorkspace("lg-perm-auto-");
    try {
        const cases: readonly {
            readonly name: string;
            readonly input: JsonValue;
            readonly expectedStatus: "waiting" | "completed";
        }[] = [
            {
                name: "outside-write",
                input: {
                    command: "echo hi > outside.txt",
                    sandboxAccess: {
                        files: [{
                            path: join(workspace.outside, "outside.txt"),
                            access: "write",
                            kind: "file",
                            purpose: "写入工作区外文件",
                        }],
                    },
                },
                expectedStatus: "waiting",
            },
            {
                name: "outside-read",
                input: {
                    command: "cat outside.txt",
                    sandboxAccess: {
                        files: [{
                            path: join(workspace.outside, "outside.txt"),
                            access: "read",
                            kind: "file",
                            purpose: "读取工作区外文件",
                        }],
                    },
                },
                expectedStatus: "completed",
            },
        ];

        for (const item of cases) {
            const executed: string[] = [];
            const store = new InMemoryGoalStore();
            const runner = new Runner({
                store,
                trajectoryStore: trajectoryStoreFor(store),
                executor: new FakeStepExecutor([
                    toolCall("act-auto", "bash", item.input),
                    completeDecision(),
                ]),
                toolRegistry: {
                    get(id: string) {
                        return createTestToolRegistration(createRecordingTool(id, executed));
                    },
                },
                workspaceRoot: workspace.root,
                workspaceId: `ws-auto-${item.name}`,
                permissionProfileStore: createProfileStore(PERMISSION_PRESETS.auto).store,
            });

            const goal = createTestGoal(`goal-auto-${item.name}`, `run-auto-${item.name}`);
            await store.save(goal);
            const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
            assert.equal(result.ok, true, item.name);
            if (!result.ok) continue;

            assert.equal(result.state.status, item.expectedStatus, item.name);
            assert.equal(executed.length, item.expectedStatus === "completed" ? 1 : 0, item.name);
        }
    } finally {
        await rm(workspace.tempRoot, { recursive: true, force: true });
    }
});

test("never：越界 Action 直接拒绝且不产生等待", async () => {
    const workspace = await createWorkspace("lg-perm-never-");
    try {
        const executed: string[] = [];
        const store = new InMemoryGoalStore();
        const trajectory = trajectoryStoreFor(store);
        const runner = new Runner({
            store,
            trajectoryStore: trajectory,
            executor: new FakeStepExecutor([
                toolCall("act-never", "bash", {
                    command: "curl http://127.0.0.1:8080",
                    sandboxAccess: { network: { targets: ["127.0.0.1"], purpose: "本地请求" } },
                }),
                completeDecision(),
            ]),
            toolRegistry: {
                get(id: string) {
                    return createTestToolRegistration(createRecordingTool(id, executed));
                },
            },
            workspaceRoot: workspace.root,
            workspaceId: "ws-never",
            permissionProfileStore: createProfileStore(NEVER_PROFILE).store,
        });

        const goal = createTestGoal("goal-never", "run-never");
        await store.save(goal);
        const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
        assert.equal(result.ok, true);
        if (!result.ok) return;

        assert.equal(result.state.status, "completed");
        assert.equal(result.state.pendingAction, undefined);
        assert.deepEqual(executed, []);
        const observation = observationFor(trajectory, "act-never");
        assert.equal(observation?.kind, "failure");
        assert.equal(observation?.code, "TOOL_NOT_AUTHORIZED");
        assert.match(observation?.message ?? "", /never/);
        assert.equal(
            trajectory.events.filter((event) => event.eventType === "action_staged"
                && event.payload.approvalStatus === "awaiting_approval").length,
            0,
        );
    } finally {
        await rm(workspace.tempRoot, { recursive: true, force: true });
    }
});

test("danger-full-access：工作区外写入与网络放行，.lazygoal 写入仍被拒绝", async () => {
    const workspace = await createWorkspace("lg-perm-full-");
    try {
        const cases: readonly {
            readonly name: string;
            readonly input: JsonValue;
            readonly expected: "success" | "denied";
        }[] = [
            {
                name: "outside-write",
                input: {
                    command: "echo hi > outside.txt",
                    sandboxAccess: {
                        files: [{
                            path: join(workspace.outside, "outside.txt"),
                            access: "write",
                            kind: "file",
                            purpose: "写入工作区外文件",
                        }],
                    },
                },
                expected: "success",
            },
            {
                name: "network",
                input: {
                    command: "curl http://127.0.0.1:8080",
                    sandboxAccess: { network: { targets: ["127.0.0.1"], purpose: "本地请求" } },
                },
                expected: "success",
            },
            {
                name: "lazygoal-write",
                input: {
                    command: "echo x > .lazygoal/state.json",
                    sandboxAccess: {
                        files: [{
                            path: join(workspace.root, ".lazygoal", "state.json"),
                            access: "write",
                            kind: "file",
                            purpose: "写入内部状态",
                        }],
                    },
                },
                expected: "denied",
            },
        ];

        for (const item of cases) {
            const executed: string[] = [];
            const store = new InMemoryGoalStore();
            const trajectory = trajectoryStoreFor(store);
            const runner = new Runner({
                store,
                trajectoryStore: trajectory,
                executor: new FakeStepExecutor([
                    toolCall("act-full", "bash", item.input),
                    completeDecision(),
                ]),
                toolRegistry: {
                    get(id: string) {
                        return createTestToolRegistration(createRecordingTool(id, executed));
                    },
                },
                workspaceRoot: workspace.root,
                workspaceId: `ws-full-${item.name}`,
                permissionProfileStore: createProfileStore(PERMISSION_PRESETS.full).store,
            });

            const goal = createTestGoal(`goal-full-${item.name}`, `run-full-${item.name}`);
            await store.save(goal);
            const result = await runner.run({ goalId: goal.id, runId: goal.state.run.id });
            assert.equal(result.ok, true, item.name);
            if (!result.ok) continue;

            if (item.expected === "success") {
                assert.equal(result.state.status, "completed", item.name);
                assert.equal(executed.length, 1, item.name);
                assert.equal(observationFor(trajectory, "act-full")?.kind, "success", item.name);
            } else {
                assert.equal(executed.length, 0, item.name);
                const observation = observationFor(trajectory, "act-full");
                assert.equal(observation?.kind, "failure", item.name);
                assert.equal(observation?.code, "TOOL_NOT_AUTHORIZED", item.name);
                assert.equal(result.state.status, "completed", item.name);
            }
        }
    } finally {
        await rm(workspace.tempRoot, { recursive: true, force: true });
    }
});

test("已暂存审批后切换档位，恢复执行沿用暂存决定且不重新读取档位", async () => {
    const workspace = await createWorkspace("lg-perm-switch-");
    try {
        const executed: string[] = [];
        const store = new InMemoryGoalStore();
        const trajectory = trajectoryStoreFor(store);
        const profiles = createProfileStore(PERMISSION_PRESETS.ask);
        const action = toolCall("act-switch", "bash", {
            command: "curl http://127.0.0.1:8080",
            sandboxAccess: { network: { targets: ["127.0.0.1"], purpose: "本地请求" } },
        });
        const goal = createTestGoal("goal-switch", "run-switch");
        await store.save(goal);

        const first = new Runner({
            store,
            trajectoryStore: trajectory,
            executor: new FakeStepExecutor([action, completeDecision()]),
            toolRegistry: {
                get(id: string) {
                    return createTestToolRegistration(createRecordingTool(id, executed));
                },
            },
            workspaceRoot: workspace.root,
            workspaceId: "ws-switch",
            permissionProfileStore: profiles.store,
        });
        const waiting = await first.run({ goalId: goal.id, runId: goal.state.run.id });
        assert.equal(waiting.ok, true);
        if (!waiting.ok) return;
        assert.equal(waiting.state.status, "waiting");
        assert.equal(waiting.state.pendingAction?.approvalKind, "sandbox");
        assert.equal(profiles.reads(), 1);

        profiles.setProfile(PERMISSION_PRESETS.full);

        const waitingGoal = await store.restore(goal.id);
        assert.ok(waitingGoal);
        const staged = waitingGoal.state.run.pendingAction;
        assert.equal(staged?.status, "awaiting_approval");
        assert.equal(staged?.approvalKind, "sandbox");
        assert.equal(staged?.effectiveSandboxScope?.network, "all_outbound");
        const approvedRun = transition(waitingGoal.state.run, {
            kind: "approve_action",
            actionId: "act-switch",
        });
        assert.equal(approvedRun.ok, true);
        if (!approvedRun.ok) return;
        await store.save({
            ...waitingGoal,
            state: { ...waitingGoal.state, run: approvedRun.state },
        });

        const approved = new Runner({
            store,
            trajectoryStore: trajectory,
            executor: new FakeStepExecutor([completeDecision()]),
            toolRegistry: {
                get(id: string) {
                    return createTestToolRegistration(createRecordingTool(id, executed));
                },
            },
            workspaceRoot: workspace.root,
            workspaceId: "ws-switch",
            permissionProfileStore: profiles.store,
        });
        const resumed = await approved.run(
            { goalId: goal.id, runId: goal.state.run.id },
            { authorizedActionId: "act-switch" },
        );
        assert.equal(resumed.ok, true);
        if (!resumed.ok) return;

        assert.deepEqual(executed, ["act-switch"]);
        assert.equal(profiles.reads(), 1);
        assert.equal(observationFor(trajectory, "act-switch")?.kind, "success");
    } finally {
        await rm(workspace.tempRoot, { recursive: true, force: true });
    }
});

test("权限档位读取失败时抛出错误且不执行 Action", async () => {
    const workspace = await createWorkspace("lg-perm-readfail-");
    try {
        const executed: string[] = [];
        const store = new InMemoryGoalStore();
        const trajectory = trajectoryStoreFor(store);
        const runner = new Runner({
            store,
            trajectoryStore: trajectory,
            executor: new FakeStepExecutor([
                toolCall("act-readfail", "bash", { command: "echo hello" }),
                completeDecision(),
            ]),
            toolRegistry: {
                get(id: string) {
                    return createTestToolRegistration(createRecordingTool(id, executed));
                },
            },
            workspaceRoot: workspace.root,
            workspaceId: "ws-readfail",
            permissionProfileStore: {
                async get() {
                    throw new Error("permission profile is corrupt");
                },
                async update() {
                    throw new Error("permission profile is corrupt");
                },
            },
        });

        const goal = createTestGoal("goal-readfail", "run-readfail");
        await store.save(goal);
        await assert.rejects(
            runner.run({ goalId: goal.id, runId: goal.state.run.id }),
            /permission profile is corrupt/,
        );
        assert.deepEqual(executed, []);
        const saved = await store.restore(goal.id);
        assert.equal(saved?.state.run.pendingAction, undefined);
        assert.equal(
            trajectory.events.filter((event) => event.eventType === "tool_started").length,
            0,
        );
    } finally {
        await rm(workspace.tempRoot, { recursive: true, force: true });
    }
});
