import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    createGoal as createUnexposedGoal,
    createRun,
    createStepExecutor,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    type AgentDecision,
    type AgentProfile,
    type Goal,
    type JsonValue,
    type StepExecutionInput,
    type StepExecutor,
    type GoalStore,
} from "../src/index";
import {
    createToolRegistration,
    InMemoryToolRegistry,
    type Tool,
    type ToolExecutionRequest,
    type ToolObservation,
    type ToolValidationResult,
} from "../../tool-core/src/index";
import { contract } from "../../contracts/src/index";
import {
    InMemoryGoalStore,
    JsonFileSandboxGrantStore,
} from "../../storage/src/index";
import { bindMessagesToRun, currentProtocols, trajectoryStoreFor, withDiscoveredProfileTools } from "./current-fixtures";
import {
    createApprovalCoordinator,
    createApprovalFixture,
    createAwaitingApprovalGoal,
} from "./action-approval-fixtures";
import { createTransitionalToolInputBinding } from "../../tool-core/test/transitional-binding";
import { createTestToolRegistration } from "../../tool-core/test/helpers";

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

function createGoal(input: Parameters<typeof createUnexposedGoal>[0]) {
    return withDiscoveredProfileTools(createUnexposedGoal(input));
}

function createMockBashTool(onExecute?: (request: ToolExecutionRequest) => void): Tool {
    return {
        definition: {
            id: "bash",
            description: "受限测试 bash",
            inputBinding: createTransitionalToolInputBinding({ contractId: "test.tool", version: 1, contract: TEST_INPUT_CONTRACT }),
            inputContract: TEST_INPUT_CONTRACT,
            isReadOnly: false,
        },
        replayPolicy: "manual",
        validate(_input): ToolValidationResult {
            return { ok: true };
        },
        async execute(request, _control): Promise<ToolObservation> {
            onExecute?.(request);
            return {
                kind: "success",
                output: { success: true },
                summary: "ok",
            };
        },
    };
}

const TEST_PROFILE: AgentProfile = {
    id: "test-profile",
    name: "Test Profile",
    toolIds: ["bash"],
    instructions: [],
    systemPrompt: "system prompt",
};

test("持续授权生命周期：沙箱审批选择 Goal 范围并在后续 Action 中自动复用放行", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-grant-recovery-"));
    try {
        const store = new InMemoryGoalStore();
        const sandboxGrantStore = new JsonFileSandboxGrantStore(tempDir);
        const executedCommands: string[] = [];

        const mockBash = createMockBashTool((req) => {
            executedCommands.push((req.input as any).command);
        });
        const registry = new InMemoryToolRegistry([createTestToolRegistration(mockBash)]);

        const decisions: AgentDecision[] = [
            {
                kind: "tool_call",
                action: {
                    actionId: "act-1",
                    toolId: "bash",
                    input: {
                        command: "curl https://example.com",
                        sandboxAccess: {
                            network: { targets: ["https://example.com"], purpose: "fetch api" },
                        },
                    } satisfies SandboxTestInput as unknown as JsonValue,
                },
            },
            {
                kind: "tool_call",
                action: {
                    actionId: "act-2",
                    toolId: "bash",
                    input: {
                        command: "curl https://example.com",
                        sandboxAccess: {
                            network: { targets: ["https://example.com"], purpose: "fetch api" },
                        },
                    } satisfies SandboxTestInput as unknown as JsonValue,
                },
            },
            {
                kind: "complete",
                summary: "done",
                completionEvidence: [],
            },
        ];

        let decisionIndex = 0;
        const executor: StepExecutor = createStepExecutor(async (_input: StepExecutionInput) => {
            return decisions[decisionIndex++] ?? { kind: "complete", summary: "done", completionEvidence: [] };
        }, async () => ({ kind: "accept" }));

        const trajectoryStore = trajectoryStoreFor(store);
        const runner = new Runner({
            store,
            trajectoryStore,
            executor,
            toolRegistry: registry,
            workspaceRoot: tempDir,
            workspaceId: "ws-1",
            sandboxGrantLookup: sandboxGrantStore,
            sandboxPlanResolver: async ({ effectiveScope }) => ({
                actionId: "any",
                workspaceRoot: tempDir,
                profile: "custom" as any,
                resolvedSeatbeltScope: effectiveScope as any,
                scope: effectiveScope!,
            }),
        });

        const coordinator = new GoalCoordinator({
            store,
            scheduler: new InlineScheduler(runner),
            toolRegistry: registry,
            workspaceId: "ws-1",
            workspaceRoot: tempDir,
            sandboxGrantStore,
            trajectoryStore,
        });

        // 1. 创建并推进 Goal
        const initialGoal = createGoal({
            id: "goal-1",
            runId: "run-1",
            intent: "test persistent sandbox grant",
            profile: TEST_PROFILE,
            promptBundleVersion: 1,
            ...currentProtocols,
        });
        const run = {
            ...createRun("run-1"),
            exposedToolIds: [...TEST_PROFILE.toolIds],
            ...(initialGoal.state.run.currentStage !== undefined ? { currentStage: initialGoal.state.run.currentStage } : {}),
        };
        const startedGoal: Goal = { ...initialGoal, state: { ...initialGoal.state, run } };
        await store.save(startedGoal);

        // 第一次执行：遇到越界网络能力，拦截挂起审批
        const progress1 = await coordinator.advance({ goalId: "goal-1", runId: "run-1" });
        assert.equal(progress1.ok, true);
        assert.equal(progress1.kind, "waiting");
        assert.equal(progress1.waitingFor, "action_approval");

        const waitingGoal = await store.restore("goal-1");
        assert.equal(waitingGoal?.state.run.pendingAction?.approvalKind, "sandbox");

        // 2. 审批并赋予 "goal" 持续授权范围
        const resumeResult = await coordinator.resume({
            ref: { goalId: "goal-1", runId: "run-1" },
            action: {
                kind: "approve_action",
                actionId: "act-1",
                scope: "goal",
            },
        });
        assert.equal(resumeResult.ok, true);

        // 3. 验证此时 sandboxGrantStore 中已有激活的持续授权
        const activeGrants = await sandboxGrantStore.list({ workspaceId: "ws-1", goalId: "goal-1" });
        assert.equal(activeGrants.length, 1);
        assert.equal(activeGrants[0]?.status, "active");
        assert.equal(activeGrants[0]?.scope, "goal");
        assert.equal(activeGrants[0]?.matcher.toolId, "bash");
        assert.ok(activeGrants[0]?.matcher.inputDigest);

        // 4. 验证在恢复后，act-1 执行成功，随后同一个 Goal 内后续的 act-2 自动通过持续授权放行执行！
        assert.equal(executedCommands.length, 2);
        assert.equal(executedCommands[0], "curl https://example.com");
        assert.equal(executedCommands[1], "curl https://example.com");
        assert.equal(resumeResult.kind, "terminal");
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("持续授权隔离与撤销：不同命令不复用，撤销后重新拦截", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-grant-revocation-"));
    try {
        const store = new InMemoryGoalStore();
        const sandboxGrantStore = new JsonFileSandboxGrantStore(tempDir);
        const trajectoryStore = trajectoryStoreFor(store);
        const executedCommands: string[] = [];

        const mockBash = createMockBashTool((req) => {
            executedCommands.push((req.input as any).command);
        });
        const registry = new InMemoryToolRegistry([createTestToolRegistration(mockBash)]);

        let currentDecision: AgentDecision = {
            kind: "tool_call",
            action: {
                actionId: "act-1",
                toolId: "bash",
                input: {
                    command: "curl https://example.com",
                    sandboxAccess: {
                        network: { targets: ["https://example.com"], purpose: "fetch api" },
                    },
                } satisfies SandboxTestInput as unknown as JsonValue,
            },
        };

        const executor: StepExecutor = createStepExecutor(async () => currentDecision, async () => ({ kind: "accept" }));

        const runner = new Runner({
            store,
            trajectoryStore,
            executor,
            toolRegistry: registry,
            workspaceRoot: tempDir,
            workspaceId: "ws-1",
            sandboxGrantLookup: sandboxGrantStore,
            sandboxPlanResolver: async ({ effectiveScope }) => ({
                actionId: "any",
                workspaceRoot: tempDir,
                profile: "custom" as any,
                resolvedSeatbeltScope: effectiveScope as any,
                scope: effectiveScope!,
            }),
        });

        const coordinator = new GoalCoordinator({
            store,
            scheduler: new InlineScheduler(runner),
            toolRegistry: registry,
            workspaceId: "ws-1",
            workspaceRoot: tempDir,
            sandboxGrantStore,
            trajectoryStore,
        });

        const initialGoal = createGoal({
            id: "goal-1",
            runId: "run-1",
            intent: "test persistent sandbox grant revocation",
            profile: TEST_PROFILE,
            promptBundleVersion: 1,
            ...currentProtocols,
        });
        const run = {
            ...createRun("run-1"),
            exposedToolIds: [...TEST_PROFILE.toolIds],
            ...(initialGoal.state.run.currentStage !== undefined ? { currentStage: initialGoal.state.run.currentStage } : {}),
        };
        await store.save({ ...initialGoal, state: { ...initialGoal.state, run } });

        // 步骤 1：第一次请求挂起审批并批准持续授权
        const progress1 = await coordinator.advance({ goalId: "goal-1", runId: "run-1" });
        assert.equal(progress1.ok, true);
        if (!progress1.ok || progress1.kind !== "waiting") assert.fail("Expected waiting progress");
        assert.equal(progress1.waitingFor, "action_approval");

        // 批准 act-1，并设置下一步 decision 为 complete
        currentDecision = { kind: "complete", summary: "done", completionEvidence: [] };
        const res1 = await coordinator.resume({
            ref: { goalId: "goal-1", runId: "run-1" },
            action: { kind: "approve_action", actionId: "act-1", scope: "goal" },
        });
        assert.equal(res1.ok, true);
        assert.equal(executedCommands.length, 1);

        // 步骤 2：测试不同 Bash 命令不复用该持续授权（必须重新挂起审批）
        currentDecision = {
            kind: "tool_call",
            action: {
                actionId: "act-2",
                toolId: "bash",
                input: {
                    command: "curl https://different-domain.com",
                    sandboxAccess: {
                        network: { targets: ["https://different-domain.com"], purpose: "fetch other" },
                    },
                } satisfies SandboxTestInput as unknown as JsonValue,
            },
        };

        // 开启新 Run 执行 act-2
        const goalWithRun2: Goal = {
            ...initialGoal,
            state: {
                ...initialGoal.state,
                run: {
                    ...createRun("run-2"),
                    exposedToolIds: [...TEST_PROFILE.toolIds],
                    ...(initialGoal.state.run.currentStage !== undefined ? { currentStage: initialGoal.state.run.currentStage } : {}),
                },
                // 新 Run 接管当前 Goal 的全部消息归属与 Run 内位置。
                messages: bindMessagesToRun(initialGoal.state.messages, "run-2"),
            },
        };
        await store.save(goalWithRun2);

        const diffCmdResult = await coordinator.advance({ goalId: "goal-1", runId: "run-2" });
        assert.equal(diffCmdResult.ok, true);
        assert.equal(diffCmdResult.kind, "waiting");
        assert.equal(diffCmdResult.waitingFor, "action_approval");
        // 命令未被执行
        assert.equal(executedCommands.length, 1);

        // 拒绝不同命令的 Action
        await coordinator.resume({
            ref: { goalId: "goal-1", runId: "run-2" },
            action: { kind: "reject_action", actionId: "act-2", reason: "disapproved" },
        });

        // 步骤 3：统一列表查询 listGrants
        const unifiedGrants = await coordinator.listGrants({ goalId: "goal-1", runId: "run-2" });
        assert.equal(unifiedGrants.length, 1);
        assert.equal(unifiedGrants[0]?.kind, "sandbox");
        assert.equal(unifiedGrants[0]?.toolId, "bash");
        assert.ok(unifiedGrants[0]?.inputDigest);
        const grantId = unifiedGrants[0]?.id!;

        // 步骤 4：统一撤销 revokeGrant
        await coordinator.revokeGrant({
            ref: { goalId: "goal-1", runId: "run-2" },
            kind: "sandbox",
            grantId,
        });

        // 检查 Trajectory 中记录了 sandbox_grant_revoked 事件
        const events = await trajectoryStore.read({ goalId: "goal-1", runId: "run-2" });
        const revokedEvent = events.find((e) => e.eventType === "sandbox_grant_revoked");
        assert.ok(revokedEvent);
        assert.equal(revokedEvent.payload.type, "sandbox_grant_revoked");
        assert.equal((revokedEvent.payload as any).grantId, grantId);

        // 步骤 5：授权被撤销后，即使再次执行最初获批的相同命令，也必须被拦截挂起审批！
        currentDecision = {
            kind: "tool_call",
            action: {
                actionId: "act-3",
                toolId: "bash",
                input: {
                    command: "curl https://example.com",
                    sandboxAccess: {
                        network: { targets: ["https://example.com"], purpose: "fetch api" },
                    },
                } satisfies SandboxTestInput as unknown as JsonValue,
            },
        };

        const goalWithRun3: Goal = {
            ...initialGoal,
            state: {
                ...initialGoal.state,
                run: {
                    ...createRun("run-3"),
                    exposedToolIds: [...TEST_PROFILE.toolIds],
                    ...(initialGoal.state.run.currentStage !== undefined ? { currentStage: initialGoal.state.run.currentStage } : {}),
                },
                // 新 Run 接管当前 Goal 的全部消息归属与 Run 内位置。
                messages: bindMessagesToRun(initialGoal.state.messages, "run-3"),
            },
        };
        await store.save(goalWithRun3);

        const afterRevokeResult = await coordinator.advance({ goalId: "goal-1", runId: "run-3" });
        assert.equal(afterRevokeResult.ok, true);
        assert.equal(afterRevokeResult.kind, "waiting");
        assert.equal(afterRevokeResult.waitingFor, "action_approval");
        assert.equal(executedCommands.length, 1); // 依然没有启动受限命令
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

/** 只在指定次数的保存上失败的 GoalStore，用于确定性验证批准事务边界。 */
class FailingSaveGoalStore implements GoalStore {
    private readonly delegate = new InMemoryGoalStore();
    private remainingFailures: number;

    constructor(failures: number) {
        this.remainingFailures = failures;
    }

    async seed(goal: Goal): Promise<void> {
        await this.delegate.save(goal);
    }

    async save(goal: Goal): Promise<void> {
        if (this.remainingFailures > 0) {
            this.remainingFailures -= 1;
            throw new Error("snapshot save failed");
        }
        await this.delegate.save(goal);
    }

    async restore(goalId: string): Promise<Goal | undefined> {
        return this.delegate.restore(goalId);
    }
}

test("修订参数后选择 Goal 授权：matcher 与最终版本一致，单次批准不产生 Grant", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal();
        await fixture.store.save(goal);
        const { coordinator } = createApprovalCoordinator(fixture);
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        const review = await coordinator.reviewActionApproval({
            ref,
            actionId: "action-approval",
            input: { path: "b.txt", content: "revised" },
            scope: "goal",
        });
        assert.equal(review.ok, true);
        if (!review.ok) return;

        const resumed = await coordinator.resume({
            ref,
            action: {
                kind: "approve_action_revision",
                actionId: "action-approval",
                input: { path: "b.txt", content: "revised" },
                reviewRef: review.review.reviewRef,
                scope: "goal",
            },
        });
        assert.equal(resumed.ok, true);

        const grants = await fixture.toolGrantStore.list({ workspaceId: "ws-1", goalId: goal.id });
        assert.equal(grants.length, 1);
        const grant = grants[0];
        assert.equal(grant?.status, "active");
        assert.equal(grant?.scope, "goal");
        assert.equal(grant?.matcher.kind, "target_path");
        // 匹配器来自最终获批参数，而不是原请求。
        assert.equal(
            grant?.matcher.kind === "target_path" ? grant.matcher.path : "",
            `${await realpath(fixture.workspaceRoot)}/b.txt`,
        );
        assert.equal(grant?.source.actionId, "action-approval");
        assert.ok((grant?.source.approvalInputId ?? "").length > 0);

        // 获批事实保存同一批准身份。
        const events = await trajectoryStoreFor(fixture.store).read({
            goalId: goal.id,
            runId: goal.state.run.id,
        });
        const revised = events.find((event) => event.eventType === "action_revised");
        assert.ok(revised !== undefined);
        if (revised?.eventType === "action_revised") {
            assert.equal(revised.payload.approvalInputId, grant?.source.approvalInputId);
        }
    } finally {
        await fixture.dispose();
    }
});

test("单次批准不产生持续授权", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal();
        await fixture.store.save(goal);
        const { coordinator } = createApprovalCoordinator(fixture);
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        const resumed = await coordinator.resume({
            ref,
            action: { kind: "approve_action", actionId: "action-approval" },
        });
        assert.equal(resumed.ok, true);
        assert.deepEqual(await fixture.toolGrantStore.list({ workspaceId: "ws-1", goalId: goal.id }), []);
    } finally {
        await fixture.dispose();
    }
});

test("授权暂存后批准保存失败：新决定可以继续，旧 pending 永不激活", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal();
        const store = new FailingSaveGoalStore(1);
        await store.seed(goal);
        const { coordinator } = createApprovalCoordinator(fixture, { store });
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        const review = await coordinator.reviewActionApproval({
            ref,
            actionId: "action-approval",
            input: { path: "b.txt", content: "revised" },
            scope: "goal",
        });
        assert.equal(review.ok, true);
        if (!review.ok) return;

        // 第一次决定：授权已暂存，但批准快照保存失败。
        await assert.rejects(
            coordinator.resume({
                ref,
                action: {
                    kind: "approve_action_revision",
                    actionId: "action-approval",
                    input: { path: "b.txt", content: "revised" },
                    reviewRef: review.review.reviewRef,
                    scope: "goal",
                    approvalInputId: "input-first",
                },
            }),
            /snapshot save failed/,
        );
        const afterFailure = await fixture.toolGrantStore.list({ workspaceId: "ws-1", goalId: goal.id });
        assert.equal(afterFailure.length, 1);
        assert.equal(afterFailure[0]?.status, "pending");

        // 第二次决定：更换参数与决定身份，不被旧 pending 阻塞。
        const secondReview = await coordinator.reviewActionApproval({
            ref,
            actionId: "action-approval",
            input: { path: "c.txt", content: "second" },
            scope: "workspace",
        });
        assert.equal(secondReview.ok, true);
        if (!secondReview.ok) return;
        const second = await coordinator.resume({
            ref,
            action: {
                kind: "approve_action_revision",
                actionId: "action-approval",
                input: { path: "c.txt", content: "second" },
                reviewRef: secondReview.review.reviewRef,
                scope: "workspace",
                approvalInputId: "input-second",
            },
        });
        assert.equal(second.ok, true);

        const goalGrants = await fixture.toolGrantStore.list({ workspaceId: "ws-1", goalId: goal.id });
        const workspaceGrants = await fixture.toolGrantStore.list({ workspaceId: "ws-1" });
        const grants = [...new Map(
            [...goalGrants, ...workspaceGrants].map((grant) => [grant.id, grant]),
        ).values()];
        assert.equal(grants.length, 2);
        const stale = grants.find((grant) => grant.source.approvalInputId === "input-first");
        const active = grants.find((grant) => grant.source.approvalInputId === "input-second");
        assert.equal(stale?.status, "pending");
        assert.equal(active?.status, "active");
        assert.equal(active?.scope, "workspace");
        assert.equal(
            active?.matcher.kind === "target_path" ? active.matcher.path : "",
            `${await realpath(fixture.workspaceRoot)}/c.txt`,
        );
    } finally {
        await fixture.dispose();
    }
});

test("同一决定身份重复暂存复用同一条授权记录", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal();
        await fixture.store.save(goal);
        const { coordinator } = createApprovalCoordinator(fixture);
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        const review = await coordinator.reviewActionApproval({
            ref,
            actionId: "action-approval",
            input: { path: "b.txt", content: "revised" },
            scope: "goal",
        });
        assert.equal(review.ok, true);
        if (!review.ok) return;

        const action = {
            kind: "approve_action_revision" as const,
            actionId: "action-approval",
            input: { path: "b.txt", content: "revised" },
            reviewRef: review.review.reviewRef,
            scope: "goal" as const,
            approvalInputId: "input-stable",
        };
        const first = await coordinator.resume({ ref, action });
        assert.equal(first.ok, true);
        const grants = await fixture.toolGrantStore.list({ workspaceId: "ws-1", goalId: goal.id });
        assert.equal(grants.length, 1);
        assert.equal(grants[0]?.status, "active");
    } finally {
        await fixture.dispose();
    }
});
