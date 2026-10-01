import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    createGoal,
    createRun,
    createToolRegistration,
    Runner,
    transition,
    type AgentDecision,
    type AgentProfile,
    type Goal,
    type GoalTask,
    type JsonValue,
    type StepExecutionInput,
    type StepExecutor,
    type Tool,
    type ToolExecutionRequest,
    type ToolObservation,
    type ToolValidationResult,
} from "../src/index";
import { contract } from "../../contracts/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import type { ProjectPermissionModeStore } from "../../permission/src/index";
import { BaseTestStepExecutor, currentProtocols, trajectoryStoreFor } from "./current-fixtures";

const TEST_INPUT_CONTRACT = contract.object({
    command: contract.string(),
    sandboxAccess: contract.optional(contract.object({
        files: contract.optional(contract.array(contract.object({
            path: contract.string(),
            access: contract.enum(["read", "write"]),
            kind: contract.enum(["file", "directory_tree"]),
            purpose: contract.string(),
        }))),
        network: contract.optional(contract.object({
            targets: contract.array(contract.string()),
            purpose: contract.string(),
        })),
    })),
});

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

function createSandboxTestTool(
    workspaceRoot: string,
    onExecute?: (request: ToolExecutionRequest<SandboxTestInput>) => void,
): Tool<typeof TEST_INPUT_CONTRACT> {
    return {
        definition: {
            id: "bash",
            description: "受限测试 bash",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: false,
        },
        replayPolicy: "manual",
        validate(_input): ToolValidationResult {
            return { ok: true };
        },
        async execute(request, _control): Promise<ToolObservation> {
            onExecute?.(request);
            const { sandboxAccess } = request.input;
            const requiresExtra = (sandboxAccess?.files !== undefined && sandboxAccess.files.length > 0)
                || (sandboxAccess?.network !== undefined && sandboxAccess.network.targets.length > 0);

            const isPlanValid = request.plan !== undefined
                && (request.plan.actionId === undefined || request.plan.actionId === request.actionId)
                && request.plan.workspaceRoot === workspaceRoot;

            if (requiresExtra && !isPlanValid) {
                return {
                    kind: "failure",
                    code: "SANDBOX_APPROVAL_REQUIRED",
                    message: "命令申请了额外的沙箱文件或网络能力，须经 Permission 核准后方可执行",
                    retryable: false,
                };
            }

            return {
                kind: "success",
                output: {
                    executedWithPlan: isPlanValid,
                    planScope: request.plan?.scope ? (JSON.parse(JSON.stringify(request.plan.scope)) as JsonValue) : null,
                },
                summary: "命令执行成功",
            };
        },
    };
}

const task: GoalTask = {
    objective: "测试沙箱越界权限与审批行为",
    completionCriteria: [],
};

const profile: AgentProfile = {
    id: "test-agent",
    systemPrompt: "test",
    instructions: [],
    toolIds: ["bash"],
};

function createTestGoal(_workspaceRoot: string, goalId = "goal-sandbox-action-1", runId = "run-sandbox-action-1"): Goal {
    return createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: goalId,
        intent: task.objective,
        profile,
        runId,
        maxSteps: 5,
    });
}

function createMockModeStore(mode: "default" | "yolo"): ProjectPermissionModeStore {
    return {
        async get(workspaceId: string) {
            return { workspaceId, mode, revision: 1 };
        },
        async set(workspaceId: string, newMode: "default" | "yolo", expectedRevision: number) {
            return { workspaceId, mode: newMode, revision: expectedRevision + 1 };
        },
    };
}

test("macOS 默认沙箱内的 Bash 在 YOLO 模式下自动放行执行", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-sandbox-perm-"));
    try {
        const store = new InMemoryGoalStore();
        let executed = false;
        const tool = createSandboxTestTool(tmpDir, () => {
            executed = true;
        });
        const registry = {
            get(id: string) {
                if (id === "bash") return createToolRegistration(tool);
                throw new Error(`Tool ${id} not found`);
            },
        };

        const decision: AgentDecision = {
            kind: "tool_call",
            action: {
                actionId: "act-default-1",
                toolId: "bash",
                input: { command: "echo hello" },
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

        const goal = createTestGoal(tmpDir);
        await store.save(goal);
        await runner.run({ goalId: goal.id, runId: goal.state.run.id });

        const updated = await store.restore(goal.id);
        assert.ok(updated);
        assert.equal(executed, true);
        assert.equal(updated.state.run.pendingAction, undefined);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("越界文件访问在 Default 模式下挂起审批并标明 approvalKind 为 sandbox", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-sandbox-perm-"));
    try {
        const store = new InMemoryGoalStore();
        let executed = false;
        const tool = createSandboxTestTool(tmpDir, () => {
            executed = true;
        });
        const registry = {
            get(id: string) {
                if (id === "bash") return createToolRegistration(tool);
                throw new Error(`Tool ${id} not found`);
            },
        };

        const decision: AgentDecision = {
            kind: "tool_call",
            action: {
                actionId: "act-file-1",
                toolId: "bash",
                input: {
                    command: "cat /etc/hosts",
                    sandboxAccess: {
                        files: [{ path: "/etc/hosts", access: "read", kind: "file", purpose: "读取主机映射" }],
                    },
                },
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
        });

        const goal = createTestGoal(tmpDir);
        await store.save(goal);
        await runner.run({ goalId: goal.id, runId: goal.state.run.id });

        const updated = await store.restore(goal.id);
        assert.ok(updated);
        // 命令绝未执行
        assert.equal(executed, false);
        // Action 被挂起等待审批
        assert.equal(updated.state.run.status, "waiting");
        assert.equal(updated.state.run.pendingAction?.status, "awaiting_approval");
        assert.equal(updated.state.run.pendingAction?.approvalKind, "sandbox");
        assert.ok(updated.state.run.pendingAction?.effectiveSandboxScope);
        assert.equal(updated.state.run.pendingAction.effectiveSandboxScope.extraFiles.length, 1);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("越界文件与网络访问即使在 YOLO 模式下也必须挂起审批，严禁绕过沙箱边界", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-sandbox-perm-"));
    try {
        const store = new InMemoryGoalStore();
        let executed = false;
        const tool = createSandboxTestTool(tmpDir, () => {
            executed = true;
        });
        const registry = {
            get(id: string) {
                if (id === "bash") return createToolRegistration(tool);
                throw new Error(`Tool ${id} not found`);
            },
        };

        const decision: AgentDecision = {
            kind: "tool_call",
            action: {
                actionId: "act-yolo-intercept-1",
                toolId: "bash",
                input: {
                    command: "curl https://api.github.com",
                    sandboxAccess: {
                        network: { targets: ["api.github.com"], purpose: "访问网络" },
                    },
                },
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

        const goal = createTestGoal(tmpDir);
        await store.save(goal);
        await runner.run({ goalId: goal.id, runId: goal.state.run.id });

        const updated = await store.restore(goal.id);
        assert.ok(updated);
        // 关键安全判据：命令绝未执行
        assert.equal(executed, false);
        // 处于等待审批状态
        assert.equal(updated.state.run.status, "waiting");
        assert.equal(updated.state.run.pendingAction?.status, "awaiting_approval");
        assert.equal(updated.state.run.pendingAction?.approvalKind, "sandbox");
        assert.equal(updated.state.run.pendingAction?.effectiveSandboxScope?.network, "all_outbound");
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("单次审批通过后，恢复执行能携带核准沙箱能力并成功执行命令", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-sandbox-perm-"));
    try {
        const store = new InMemoryGoalStore();
        let capturedPlanScope: unknown = undefined;
        const tool = createSandboxTestTool(tmpDir, (req) => {
            capturedPlanScope = req.plan?.scope;
        });
        const registry = {
            get(id: string) {
                if (id === "bash") return createToolRegistration(tool);
                throw new Error(`Tool ${id} not found`);
            },
        };

        const actionId = "act-approve-once-1";
        const decision: AgentDecision = {
            kind: "tool_call",
            action: {
                actionId,
                toolId: "bash",
                input: {
                    command: "curl https://example.com",
                    sandboxAccess: {
                        network: { targets: ["example.com"], purpose: "访问" },
                    },
                },
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

        const goal = createTestGoal(tmpDir);
        await store.save(goal);
        await runner.run({ goalId: goal.id, runId: goal.state.run.id });

        // 验证已挂起
        const waitingGoal = await store.restore(goal.id);
        assert.ok(waitingGoal);
        assert.equal(waitingGoal.state.run.status, "waiting");

        // 用户单次批准（通过 transition approve_action）
        const approvedRun = transition(waitingGoal.state.run, {
            kind: "approve_action",
            actionId,
            approvalScope: "action",
        });
        assert.equal(approvedRun.ok, true);
        if (!approvedRun.ok) return;

        const approvedGoal: Goal = {
            ...waitingGoal,
            state: {
                ...waitingGoal.state,
                run: approvedRun.state,
            },
        };
        await store.save(approvedGoal);

        // 恢复执行，Runner 消费 approved pendingAction
        await runner.run(
            { goalId: goal.id, runId: goal.state.run.id },
            { authorizedActionId: actionId },
        );

        assert.ok(capturedPlanScope);
        assert.deepEqual(capturedPlanScope, {
            extraFiles: [],
            network: "all_outbound",
        });
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test("审批拒绝（reject_action）后，终止该 Action 调度，受限命令绝不启动", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "lg-sandbox-perm-"));
    try {
        const store = new InMemoryGoalStore();
        let executed = false;
        const tool = createSandboxTestTool(tmpDir, () => {
            executed = true;
        });
        const registry = {
            get(id: string) {
                if (id === "bash") return createToolRegistration(tool);
                throw new Error(`Tool ${id} not found`);
            },
        };

        const actionId = "act-reject-1";
        const decision: AgentDecision = {
            kind: "tool_call",
            action: {
                actionId,
                toolId: "bash",
                input: {
                    command: "curl https://evil.com",
                    sandboxAccess: {
                        network: { targets: ["evil.com"], purpose: "外部请求" },
                    },
                },
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
        });

        const goal = createTestGoal(tmpDir);
        await store.save(goal);
        await runner.run({ goalId: goal.id, runId: goal.state.run.id });

        const waitingGoal = await store.restore(goal.id);
        assert.ok(waitingGoal);
        assert.equal(waitingGoal.state.run.status, "waiting");

        // 显式拒绝该 Action
        const rejectedRun = transition(waitingGoal.state.run, {
            kind: "reject_action",
            actionId,
            reason: "用户拒绝访问外部网络",
        });
        assert.equal(rejectedRun.ok, true);
        if (!rejectedRun.ok) return;

        const rejectedGoal: Goal = {
            ...waitingGoal,
            state: {
                ...waitingGoal.state,
                run: rejectedRun.state,
            },
        };
        await store.save(rejectedGoal);

        // 关键安全判据：受限命令绝未执行
        assert.equal(executed, false);
        assert.equal(rejectedGoal.state.run.pendingAction, undefined);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});
