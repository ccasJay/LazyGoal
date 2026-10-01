import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    createGoal,
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

function createManualSandboxTool(
    workspaceRoot: string,
    executeHandler?: (request: ToolExecutionRequest<SandboxTestInput>) => Promise<ToolObservation> | ToolObservation,
): Tool<typeof TEST_INPUT_CONTRACT> {
    return {
        definition: {
            id: "bash",
            description: "manual replay bash",
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: false,
        },
        replayPolicy: "manual",
        validate(_input): ToolValidationResult {
            return { ok: true };
        },
        async execute(request, _control): Promise<ToolObservation> {
            if (executeHandler) {
                return executeHandler(request);
            }
            return {
                kind: "success",
                output: { executed: true },
                summary: "成功",
            };
        },
    };
}

const task: GoalTask = {
    objective: "测试沙箱执行计划恢复与故障重放边界",
    completionCriteria: [],
};

const profile: AgentProfile = {
    id: "profile-1",
    systemPrompt: "test",
    instructions: [],
    toolIds: ["bash"],
};

function createTestGoal(goalId = "goal-1", runId = "run-1"): Goal {
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

test("进程恢复后旧计划不复用，重新核准时基于当前状态重新构建（Req 6.3）", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lg-perm-recovery-"));
    try {
        const store = new InMemoryGoalStore();
        const executedRequests: ToolExecutionRequest<SandboxTestInput>[] = [];

        const tool = createManualSandboxTool(workspaceRoot, (req) => {
            executedRequests.push(req);
            if (req.plan === undefined) {
                return {
                    kind: "failure",
                    code: "SANDBOX_APPROVAL_REQUIRED",
                    message: "未获核准计划",
                    retryable: false,
                };
            }
            return {
                kind: "success",
                output: { hasPlan: req.plan !== undefined },
                summary: "成功",
            };
        });

        const registry = {
            get(id: string) {
                if (id === "bash") return createToolRegistration(tool);
                throw new Error(`Tool ${id} not found`);
            },
        };

        const actionId = "action-recover-1";
        const decision: AgentDecision = {
            kind: "tool_call",
            action: {
                actionId,
                toolId: "bash",
                input: {
                    command: "cat /tmp/test",
                    sandboxAccess: {
                        files: [{ path: "/tmp/test", access: "read", kind: "file", purpose: "查看" }],
                    },
                },
            },
        };

        // 实例 1：首次执行产生 awaiting_approval
        const runner1 = new Runner({
            store,
            trajectoryStore: trajectoryStoreFor(store),
            executor: new FakeStepExecutor([decision]),
            toolRegistry: registry,
            toolPolicy: { evaluate: () => "require_approval" },
            workspaceRoot,
        });

        const initialGoal = createTestGoal();
        await store.save(initialGoal);
        const goalId = initialGoal.id;
        const runId = initialGoal.state.run.id;

        await runner1.run({ goalId, runId });

        // 验证快照中持久化的 pendingAction 绝不包含任何执行计划 plan
        const savedGoal = (await store.restore(goalId))!;
        assert.equal(savedGoal.state.run.status, "waiting");
        assert.equal(savedGoal.state.run.pendingAction?.status, "awaiting_approval");
        assert.equal((savedGoal.state.run.pendingAction?.action as any).plan, undefined);

        // 模拟进程重启：创建全新的 Runner 实例（无任何旧内存闭包或缓存）
        let planResolvedCount = 0;
        const runner2 = new Runner({
            store,
            trajectoryStore: trajectoryStoreFor(store),
            executor: new FakeStepExecutor([]),
            toolRegistry: registry,
            toolPolicy: { evaluate: () => "require_approval" },
            workspaceRoot,
            sandboxPlanResolver: async ({ action }) => {
                planResolvedCount++;
                return {
                    actionId: action.actionId,
                    workspaceRoot,
                    scope: {
                        extraFiles: [{ canonicalPath: "/tmp/test", access: "read", kind: "file" }],
                        network: "none",
                    },
                };
            },
        });

        // 用户核准该 Action
        const approveResult = transition(savedGoal.state.run, { kind: "approve_action", actionId });
        assert.equal(approveResult.ok, true);
        if (!approveResult.ok) return;
        await store.save({
            ...savedGoal,
            state: { ...savedGoal.state, run: approveResult.state },
        });

        // 恢复执行：必须通过新的 resolver 重新构建 plan 并传入
        await runner2.run(
            { goalId, runId },
            { authorizedActionId: actionId },
        );

        assert.equal(planResolvedCount, 1);
        assert.equal(executedRequests.length, 1);
        assert.equal(executedRequests[0]?.actionId, actionId);
        assert.deepEqual(executedRequests[0]?.plan?.scope.extraFiles, [
            { canonicalPath: "/tmp/test", access: "read", kind: "file" },
        ]);
    } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});

test("受限命令执行结果不确定（outcome_unknown）时维持人工等待，绝不自动重放（Req 6.4）", async () => {
    const store = new InMemoryGoalStore();
    const workspaceRoot = "/workspace/project";
    let executions = 0;

    const tool = createManualSandboxTool(workspaceRoot, (_req) => {
        executions++;
        // 模拟执行过程中发生未捕获的基础设施崩溃或未知异常
        throw new Error("进程被意外 KILL，执行结果未知");
    });

    const registry = {
        get(id: string) {
            if (id === "bash") return createToolRegistration(tool);
            throw new Error(`Tool ${id} not found`);
        },
    };

    const actionId = "action-manual-unknown";
    const decision: AgentDecision = {
        kind: "tool_call",
        action: {
            actionId,
            toolId: "bash",
            input: {
                command: "rm -rf build/",
            },
        },
    };

    const runner = new Runner({
        store,
        trajectoryStore: trajectoryStoreFor(store),
        executor: new FakeStepExecutor([decision]),
        toolRegistry: registry,
        toolPolicy: { evaluate: () => "allow" },
        workspaceRoot,
    });

    const initialGoal = createTestGoal();
    await store.save(initialGoal);
    const goalId = initialGoal.id;
    const runId = initialGoal.state.run.id;

    // 执行并触发未知异常
    const result = await runner.run({ goalId, runId });
    assert.equal(result.ok, true);
    assert.equal(executions, 1);

    // 结果必须转为 outcome_unknown 等待人工处理，而不是自动重试
    const latestGoal = (await store.restore(goalId))!;
    assert.equal(latestGoal.state.run.status, "waiting");
    assert.equal(latestGoal.state.run.pendingAction?.status, "outcome_unknown");
    assert.equal(latestGoal.state.run.pendingAction?.action.actionId, actionId);

    // 再次调用 run（模拟恢复轮询或获得新权限）：对于 outcome_unknown 绝不自动重试调用 tool.execute
    await runner.run({ goalId, runId });
    assert.equal(executions, 1, "outcome_unknown 未经人工核准确认前绝对不得自动重放");
});
