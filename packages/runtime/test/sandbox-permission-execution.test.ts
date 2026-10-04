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
    type StepExecutionInput,
    type StepExecutor,
    type Tool,
    type ToolExecutionRequest,
    type ToolObservation,
    type ToolValidationResult,
} from "../src/index";
import { contract } from "../../contracts/src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import type { SandboxExecutionPlan } from "../../sandbox/src/index";
import { BaseTestStepExecutor, currentProtocols, trajectoryStoreFor, withDiscoveredProfileTools } from "./current-fixtures";

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
            const requiresExtra = sandboxAccess?.files !== undefined || sandboxAccess?.network !== undefined;

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
                },
                summary: "命令执行成功",
            };
        },
    };
}

const task: GoalTask = {
    objective: "测试沙箱执行计划与权限核准",
    completionCriteria: [],
};

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "test",
    instructions: [],
    toolIds: ["bash"],
};

function createTestGoal(goalId = "goal-1", runId = "run-1"): Goal {
    return withDiscoveredProfileTools(createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id: goalId,
        intent: task.objective,
        profile,
        runId,
        maxSteps: 5,
    }));
}

test("Action 经核准并提供有效 SandboxExecutionPlan 后执行成功并传入 plan", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lg-perm-exec-"));
    try {
        const store = new InMemoryGoalStore();
        let capturedRequest: ToolExecutionRequest<SandboxTestInput> | undefined;

        const tool = createSandboxTestTool(workspaceRoot, (req) => {
            capturedRequest = req;
        });
        const registry = {
            get(id: string) {
                if (id === "bash") return createToolRegistration(tool);
                throw new Error(`Tool ${id} not found`);
            },
        };

        const actionId = "action-sandbox-1";
        const decision: AgentDecision = {
            kind: "tool_call",
            action: {
                actionId,
                toolId: "bash",
                input: {
                    command: "curl https://api.github.com",
                    sandboxAccess: {
                        network: { targets: ["api.github.com"], purpose: "拉取数据" },
                    },
                },
            },
        };

        const executor = new FakeStepExecutor([decision]);
        const runner = new Runner({
            store,
            trajectoryStore: trajectoryStoreFor(store),
            executor,
            toolRegistry: registry,
            toolPolicy: {
                evaluate: () => "require_approval",
            },
            workspaceRoot,
        });

        const initialGoal = createTestGoal();
        await store.save(initialGoal);
        const goalId = initialGoal.id;
        const runId = initialGoal.state.run.id;

        // 第一步：Decide 产生 tool_call，因 require_approval 进入 awaiting_approval
        const step1 = await runner.run({ goalId, runId });
        assert.equal(step1.ok, true);
        if (!step1.ok) return;
        assert.equal(step1.state.status, "waiting");
        assert.equal(step1.state.pendingAction?.status, "awaiting_approval");

        // 用户核准并提供合法的 SandboxExecutionPlan
        const plan: SandboxExecutionPlan = {
            actionId,
            workspaceRoot,
            scope: {
                extraFiles: [],
                network: "all_outbound",
            },
        };

        // 通过状态机将 pendingAction 标记为 approved
        const approveResult = transition(step1.state, { kind: "approve_action", actionId });
        assert.equal(approveResult.ok, true);
        if (!approveResult.ok) return;
        await store.save({
            ...initialGoal,
            state: {
                ...initialGoal.state,
                run: approveResult.state,
            },
        });

        // 第二步：通过 options.sandboxExecutionPlan 传入核准计划并执行
        const step2 = await runner.run(
            { goalId, runId },
            { authorizedActionId: actionId, sandboxExecutionPlan: plan },
        );
        assert.equal(step2.ok, true);
        assert.ok(capturedRequest);
        assert.equal(capturedRequest.actionId, actionId);
        assert.deepEqual(capturedRequest.plan, plan);
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("申请额外能力的 Action 未提供 plan 时被沙箱拒绝（SANDBOX_APPROVAL_REQUIRED）", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lg-perm-exec-"));
    try {
        const store = new InMemoryGoalStore();
        let capturedRequest: ToolExecutionRequest<SandboxTestInput> | undefined;

        const tool = createSandboxTestTool(workspaceRoot, (req) => {
            capturedRequest = req;
        });
        const registry = {
            get(id: string) {
                if (id === "bash") return createToolRegistration(tool);
                throw new Error(`Tool ${id} not found`);
            },
        };

        const actionId = "action-sandbox-no-plan";
        const decision: AgentDecision = {
            kind: "tool_call",
            action: {
                actionId,
                toolId: "bash",
                input: {
                    command: "cat /etc/hosts",
                    sandboxAccess: {
                        files: [{ path: "/etc/hosts", access: "read", kind: "file", purpose: "读取" }],
                    },
                },
            },
        };

        const executor = new FakeStepExecutor([decision]);
        const runner = new Runner({
            store,
            trajectoryStore: trajectoryStoreFor(store),
            executor,
            toolRegistry: registry,
            toolPolicy: {
                evaluate: () => "require_approval",
            },
            workspaceRoot,
        });

        const initialGoal = createTestGoal();
        await store.save(initialGoal);
        const goalId = initialGoal.id;
        const runId = initialGoal.state.run.id;

        await runner.run({ goalId, runId });

        // 审批通过但未提供任何 plan
        const latestGoal = (await store.restore(goalId))!;
        const approveResult = transition(latestGoal.state.run, { kind: "approve_action", actionId });
        assert.equal(approveResult.ok, true);
        if (!approveResult.ok) return;
        await store.save({
            ...latestGoal,
            state: {
                ...latestGoal.state,
                run: approveResult.state,
            },
        });

        // 执行时不提供 sandboxExecutionPlan
        await runner.run(
            { goalId, runId },
            { authorizedActionId: actionId },
        );

        assert.ok(capturedRequest);
        assert.equal(capturedRequest.plan, undefined);
        const completedGoal = (await store.restore(goalId))!;
        assert.equal(completedGoal.state.run.lastStep?.kind, "action");
        const obs = (completedGoal.state.run.lastStep as any)?.observation;
        assert.equal(obs.kind, "failure");
        assert.equal(obs.code, "SANDBOX_APPROVAL_REQUIRED");
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("传入的 plan 与当前 ActionId 或 WorkspaceRoot 失配时不能越权执行", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lg-perm-exec-"));
    try {
        const store = new InMemoryGoalStore();
        let capturedRequest: ToolExecutionRequest<SandboxTestInput> | undefined;

        const tool = createSandboxTestTool(workspaceRoot, (req) => {
            capturedRequest = req;
        });
        const registry = {
            get(id: string) {
                if (id === "bash") return createToolRegistration(tool);
                throw new Error(`Tool ${id} not found`);
            },
        };

        const actionId = "action-sandbox-current";
        const decision: AgentDecision = {
            kind: "tool_call",
            action: {
                actionId,
                toolId: "bash",
                input: {
                    command: "ls /external",
                    sandboxAccess: {
                        files: [{ path: "/external", access: "read", kind: "directory_tree", purpose: "读取" }],
                    },
                },
            },
        };

        const executor = new FakeStepExecutor([decision]);
        const runner = new Runner({
            store,
            trajectoryStore: trajectoryStoreFor(store),
            executor,
            toolRegistry: registry,
            toolPolicy: {
                evaluate: () => "require_approval",
            },
            workspaceRoot,
        });

        const initialGoal = createTestGoal();
        await store.save(initialGoal);
        const goalId = initialGoal.id;
        const runId = initialGoal.state.run.id;

        await runner.run({ goalId, runId });

        const latestGoal = (await store.restore(goalId))!;
        const approveResult = transition(latestGoal.state.run, { kind: "approve_action", actionId });
        assert.equal(approveResult.ok, true);
        if (!approveResult.ok) return;
        await store.save({
            ...latestGoal,
            state: {
                ...latestGoal.state,
                run: approveResult.state,
            },
        });

        // 传入错误 actionId 的旧 plan
        const mismatchedPlan: SandboxExecutionPlan = {
            actionId: "other-old-action-999",
            workspaceRoot,
            scope: {
                extraFiles: [{ canonicalPath: "/external", access: "read", kind: "directory_tree" }],
                network: "none",
            },
        };

        await runner.run(
            { goalId, runId },
            { authorizedActionId: actionId, sandboxExecutionPlan: mismatchedPlan },
        );

        // Runner 识别到 actionId 不匹配，忽略该 plan
        assert.ok(capturedRequest);
        assert.equal(capturedRequest.plan, undefined);
        const finalGoal = (await store.restore(goalId))!;
        assert.equal(finalGoal.state.run.lastStep?.kind, "action");
        const obs = (finalGoal.state.run.lastStep as any)?.observation;
        assert.equal(obs.kind, "failure");
        assert.equal(obs.code, "SANDBOX_APPROVAL_REQUIRED");
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("通过 sandboxPlanResolver 动态解析核准 plan", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lg-perm-exec-"));
    try {
        const store = new InMemoryGoalStore();
        let capturedRequest: ToolExecutionRequest<SandboxTestInput> | undefined;

        const tool = createSandboxTestTool(workspaceRoot, (req) => {
            capturedRequest = req;
        });
        const registry = {
            get(id: string) {
                if (id === "bash") return createToolRegistration(tool);
                throw new Error(`Tool ${id} not found`);
            },
        };

        const actionId = "action-resolver-1";
        const decision: AgentDecision = {
            kind: "tool_call",
            action: {
                actionId,
                toolId: "bash",
                input: {
                    command: "npm install",
                    sandboxAccess: {
                        network: { targets: ["registry.npmjs.org"], purpose: "安装" },
                    },
                },
            },
        };

        const executor = new FakeStepExecutor([decision]);
        const runner = new Runner({
            store,
            trajectoryStore: trajectoryStoreFor(store),
            executor,
            toolRegistry: registry,
            toolPolicy: {
                evaluate: () => "require_approval",
            },
            workspaceRoot,
            sandboxPlanResolver: async ({ action }) => {
                return {
                    actionId: action.actionId,
                    workspaceRoot,
                    scope: {
                        extraFiles: [],
                        network: "all_outbound",
                    },
                };
            },
        });

        const initialGoal = createTestGoal();
        await store.save(initialGoal);
        const goalId = initialGoal.id;
        const runId = initialGoal.state.run.id;

        await runner.run({ goalId, runId });

        const latestGoal = (await store.restore(goalId))!;
        const approveResult = transition(latestGoal.state.run, { kind: "approve_action", actionId });
        assert.equal(approveResult.ok, true);
        if (!approveResult.ok) return;
        await store.save({
            ...latestGoal,
            state: {
                ...latestGoal.state,
                run: approveResult.state,
            },
        });

        // 不需要显式传入 sandboxExecutionPlan，由 sandboxPlanResolver 自动解析
        await runner.run(
            { goalId, runId },
            { authorizedActionId: actionId },
        );

        assert.ok(capturedRequest);
        assert.equal(capturedRequest.actionId, actionId);
        assert.equal(capturedRequest.plan?.scope.network, "all_outbound");
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("ToolPolicy 允许但无核准 plan 时，受限能力依然被拦截拒绝（Req 5.2）", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lg-perm-exec-"));
    try {
        const store = new InMemoryGoalStore();
        let capturedRequest: ToolExecutionRequest<SandboxTestInput> | undefined;

        const tool = createSandboxTestTool(workspaceRoot, (req) => {
            capturedRequest = req;
        });
        const registry = {
            get(id: string) {
                if (id === "bash") return createToolRegistration(tool);
                throw new Error(`Tool ${id} not found`);
            },
        };

        const actionId = "action-auto-allow-denied";
        const decision: AgentDecision = {
            kind: "tool_call",
            action: {
                actionId,
                toolId: "bash",
                input: {
                    command: "curl https://evil.com",
                    sandboxAccess: {
                        network: { targets: ["evil.com"], purpose: "访问" },
                    },
                },
            },
        };

        const executor = new FakeStepExecutor([decision]);
        const runner = new Runner({
            store,
            trajectoryStore: trajectoryStoreFor(store),
            executor,
            toolRegistry: registry,
            // 即使 ToolPolicy 是 allow（例如 YOLO 或 Tool Grant 自动放行）
            toolPolicy: {
                evaluate: () => "allow",
            },
            workspaceRoot,
            // 无 sandboxPlanResolver 或未核准
        });

        const initialGoal = createTestGoal();
        await store.save(initialGoal);
        const goalId = initialGoal.id;
        const runId = initialGoal.state.run.id;

        // 在统一 Permission 架构下，即使 ToolPolicy 为 allow，越界能力也必须先挂起审批
        await runner.run({ goalId, runId });
        const waitingGoal = (await store.restore(goalId))!;
        assert.equal(waitingGoal.state.run.status, "waiting");
        assert.equal(waitingGoal.state.run.pendingAction?.status, "awaiting_approval");

        // 审批通过但未提供任何核准 plan
        const approveResult = transition(waitingGoal.state.run, { kind: "approve_action", actionId });
        assert.equal(approveResult.ok, true);
        await store.save({
            ...waitingGoal,
            state: {
                ...waitingGoal.state,
                run: approveResult.state,
            },
        });

        // 恢复执行：因无核准 plan，受限能力依然被沙箱拒绝
        await runner.run({ goalId, runId }, { authorizedActionId: actionId });

        assert.ok(capturedRequest);
        assert.equal(capturedRequest.plan, undefined);
        const finalGoal = (await store.restore(goalId))!;
        assert.equal(finalGoal.state.run.lastStep?.kind, "action");
        const obs = (finalGoal.state.run.lastStep as any)?.observation;
        assert.equal(obs.kind, "failure");
        assert.equal(obs.code, "SANDBOX_APPROVAL_REQUIRED");
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});
