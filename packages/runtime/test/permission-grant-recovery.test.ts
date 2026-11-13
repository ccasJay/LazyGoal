import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import {
    createGoal as createUnexposedGoal,
    createRun,
    createStepExecutor,
    GoalCoordinator,
    InlineScheduler,
    Runner,
    transition,
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
import {
    InMemoryGoalStore,
    JsonFileGoalStore,
    JsonFileSandboxGrantStore,
    JsonFileTrajectoryStore,
} from "../../storage/src/index";
import { bindMessagesToRun, currentProtocols, trajectoryStoreFor, withDiscoveredProfileTools } from "./current-fixtures";
import {
    createApprovalCoordinator,
    createApprovalFixture,
    createAwaitingApprovalGoal,
} from "./action-approval-fixtures";
import { createTestBinding, objectInputSchema, openObjectSchema, sandboxCommandSchema } from "../../tool-core/test/binding-fixtures";
import { createTestToolRegistration } from "../../tool-core/test/helpers";
import { resolveEffectiveSandboxScope } from "../../sandbox/src/index";

const TEST_INPUT_SCHEMA = sandboxCommandSchema();

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
            inputBinding: createTestBinding("test.tool", TEST_INPUT_SCHEMA),
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

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

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

class PersistThenFailGoalStore implements GoalStore {
    private shouldFail = true;

    constructor(private readonly delegate: GoalStore) {}

    async restore(goalId: string): Promise<Goal | undefined> {
        return this.delegate.restore(goalId);
    }

    async save(goal: Goal): Promise<void> {
        await this.delegate.save(goal);
        if (this.shouldFail) {
            this.shouldFail = false;
            throw new Error("snapshot save acknowledgment lost");
        }
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

test("修订 Sandbox Action 时 pending Grant 使用最终批准的完整文件范围", async () => {
    const fixture = await createApprovalFixture();
    try {
        await Promise.all([
            writeFile(join(fixture.workspaceRoot, "a.txt"), "original"),
            writeFile(join(fixture.workspaceRoot, "b.txt"), "revised"),
        ]);
        const inputA: SandboxTestInput = {
            command: "inspect a.txt",
            sandboxAccess: {
                files: [{
                    path: "a.txt",
                    access: "write",
                    kind: "file",
                    purpose: "write the original target",
                }],
            },
        };
        const inputB: SandboxTestInput = {
            command: "inspect b.txt",
            sandboxAccess: {
                files: [{
                    path: "b.txt",
                    access: "write",
                    kind: "file",
                    purpose: "write the revised target",
                }],
            },
        };
        const created = createGoal({
            ...currentProtocols,
            promptBundleVersion: 1,
            id: "goal-sandbox-revision-scope",
            intent: "revise a sandboxed action",
            profile: TEST_PROFILE,
            runId: "run-sandbox-revision-scope",
        });
        const started = transition(created.state.run, { kind: "start" });
        assert.equal(started.ok, true);
        if (!started.ok) return;
        const originalScope = await resolveEffectiveSandboxScope(
            fixture.workspaceRoot,
            inputA.sandboxAccess!,
        );
        const staged = transition(started.state, {
            kind: "stage_action",
            status: "awaiting_approval",
            approvalKind: "sandbox",
            effectiveSandboxScope: originalScope,
            action: {
                actionId: "action-sandbox-revision-scope",
                toolId: "bash",
                input: inputA as unknown as JsonValue,
            },
        });
        assert.equal(staged.ok, true);
        if (!staged.ok) return;
        const goal: Goal = {
            ...created,
            state: { ...created.state, run: staged.state },
        };
        await fixture.store.save(goal);

        const trajectoryStore = trajectoryStoreFor(fixture.store);
        const registry = new InMemoryToolRegistry([
            createTestToolRegistration(createMockBashTool()),
        ]);
        const runner = new Runner({
            store: fixture.store,
            trajectoryStore,
            executor: createStepExecutor([{
                kind: "complete",
                summary: "done",
                completionEvidence: [],
            }], async () => ({ kind: "accept" })),
            toolRegistry: registry,
            workspaceRoot: fixture.workspaceRoot,
            workspaceId: "ws-1",
        });
        const coordinator = new GoalCoordinator({
            store: fixture.store,
            trajectoryStore,
            scheduler: new InlineScheduler(runner),
            toolRegistry: registry,
            toolGrantStore: fixture.toolGrantStore,
            sandboxGrantStore: fixture.sandboxGrantStore,
            workspaceId: "ws-1",
            workspaceRoot: fixture.workspaceRoot,
        });
        const ref = { goalId: goal.id, runId: goal.state.run.id };
        const review = await coordinator.reviewActionApproval({
            ref,
            actionId: "action-sandbox-revision-scope",
            input: inputB as unknown as JsonValue,
            scope: "goal",
        });
        assert.equal(review.ok, true);
        if (!review.ok) return;

        await coordinator.resume({
            ref,
            action: {
                kind: "approve_action_revision",
                actionId: "action-sandbox-revision-scope",
                input: inputB as unknown as JsonValue,
                reviewRef: review.review.reviewRef,
                scope: "goal",
            },
        });

        const grants = await fixture.sandboxGrantStore.list({ workspaceId: "ws-1", goalId: goal.id });
        assert.equal(grants.length, 1);
        assert.equal(grants[0]?.status, "active");
        assert.deepEqual(grants[0]?.matcher.scope, await resolveEffectiveSandboxScope(
            fixture.workspaceRoot,
            inputB.sandboxAccess!,
        ));
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

test("Snapshot 保存失败后的批准事实尾不会授权被 Interrupt 取消的 Action", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal({ goalId: "goal-interrupt-after-approval-save-failure" });
        const store = new FailingSaveGoalStore(1);
        await store.seed(goal);
        const { coordinator, runner, trajectoryStore } = createApprovalCoordinator(fixture, { store });
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        await assert.rejects(coordinator.resume({
            ref,
            action: {
                kind: "approve_action",
                actionId: "action-approval",
                scope: "goal",
            },
        }), /snapshot save failed/);
        assert.equal(
            (await fixture.toolGrantStore.list({ workspaceId: "ws-1", goalId: goal.id }))[0]?.status,
            "pending",
        );

        const interrupted = await runner.interrupt(ref, "interrupt-after-approval-save-failure");
        assert.equal(interrupted.ok, true);
        const saved = await store.restore(goal.id);
        assert.equal(saved?.state.run.status, "cancelled");
        assert.equal(saved?.state.run.pendingAction, undefined);
        assert.equal(fixture.calls.length, 0);
        assert.equal(
            (await fixture.toolGrantStore.list({ workspaceId: "ws-1", goalId: goal.id }))[0]?.status,
            "pending",
        );
        const events = await trajectoryStore.read(ref);
        assert.equal(events.some((event) => event.eventType === "tool_started"), false);
        const advanced = await coordinator.advance(ref);
        assert.equal(advanced.ok, true);
        assert.equal(advanced.ok && advanced.kind, "terminal");
        assert.equal(
            (await fixture.toolGrantStore.list({ workspaceId: "ws-1", goalId: goal.id }))[0]?.status,
            "pending",
        );
    } finally {
        await fixture.dispose();
    }
});

test("重开 JSON Snapshot 后仅激活与已保存批准绑定的 pending Grant", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal({ goalId: "goal-persisted-grant-approval" });
        const diskStore = new JsonFileGoalStore(join(fixture.workspaceRoot, "goals"));
        const persistentStore = new PersistThenFailGoalStore(diskStore);
        const trajectoryStore = new JsonFileTrajectoryStore(join(fixture.workspaceRoot, "trajectory"));
        await diskStore.save(goal);

        const coordinator = new GoalCoordinator({
            store: persistentStore,
            trajectoryStore,
            scheduler: {
                async schedule() { throw new Error("scheduler boundary reached"); },
            },
            toolRegistry: fixture.registry,
            toolGrantStore: fixture.toolGrantStore,
            sandboxGrantStore: fixture.sandboxGrantStore,
            workspaceId: "ws-1",
            workspaceRoot: fixture.workspaceRoot,
        });
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        await assert.rejects(coordinator.resume({
            ref,
            action: {
                kind: "approve_action",
                actionId: "action-approval",
                scope: "goal",
            },
        }), /snapshot save acknowledgment lost/);

        const committed = await diskStore.restore(goal.id);
        assert.equal(committed?.state.run.pendingAction?.status, "approved");
        const grantId = committed?.state.run.pendingAction?.grantId;
        assert.ok(grantId);
        const pending = await fixture.toolGrantStore.list({ workspaceId: "ws-1", goalId: goal.id });
        assert.equal(pending.find((grant) => grant.id === grantId)?.status, "pending");
        const events = await trajectoryStore.read(ref);
        assert.equal(events.some((event) => event.eventType === "action_approved"), true);
        assert.equal(events.some((event) => event.eventType === "tool_started"), false);

        const recovered = new GoalCoordinator({
            store: diskStore,
            trajectoryStore,
            scheduler: {
                async schedule() { throw new Error("scheduler boundary reached"); },
            },
            toolRegistry: fixture.registry,
            toolGrantStore: fixture.toolGrantStore,
            sandboxGrantStore: fixture.sandboxGrantStore,
            workspaceId: "ws-1",
            workspaceRoot: fixture.workspaceRoot,
        });
        await assert.rejects(recovered.advance(ref), /scheduler boundary reached/);
        const activated = await fixture.toolGrantStore.list({ workspaceId: "ws-1", goalId: goal.id });
        assert.equal(activated.find((grant) => grant.id === grantId)?.status, "active");
        assert.equal(fixture.calls.length, 0);
    } finally {
        await fixture.dispose();
    }
});

test("state_committed marker 故障不改变已保存批准的 Grant 绑定", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal({ goalId: "goal-marker-with-persisted-approval" });
        const store = new JsonFileGoalStore(join(fixture.workspaceRoot, "goals"));
        const diskTrajectory = new JsonFileTrajectoryStore(join(fixture.workspaceRoot, "trajectory"));
        const trajectoryStore = new Proxy(diskTrajectory, {
            get(target, property, receiver) {
                if (property === "append") {
                    return async (...args: Parameters<typeof target.append>) => {
                        if (args[0].eventType === "state_committed") {
                            throw new Error("marker write failed");
                        }
                        return target.append(...args);
                    };
                }
                const value = Reflect.get(target, property, receiver) as unknown;
                return typeof value === "function" ? value.bind(target) : value;
            },
        });
        await store.save(goal);
        const coordinator = new GoalCoordinator({
            store,
            trajectoryStore,
            scheduler: {
                async schedule() { throw new Error("scheduler boundary reached"); },
            },
            toolRegistry: fixture.registry,
            toolGrantStore: fixture.toolGrantStore,
            sandboxGrantStore: fixture.sandboxGrantStore,
            workspaceId: "ws-1",
            workspaceRoot: fixture.workspaceRoot,
        });
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        await assert.rejects(coordinator.resume({
            ref,
            action: {
                kind: "approve_action",
                actionId: "action-approval",
                scope: "goal",
            },
        }), /marker write failed/);

        const saved = await store.restore(goal.id);
        assert.equal(saved?.state.run.pendingAction?.status, "approved");
        const grantId = saved?.state.run.pendingAction?.grantId;
        assert.ok(grantId);
        const grants = await fixture.toolGrantStore.list({ workspaceId: "ws-1", goalId: goal.id });
        assert.equal(grants.find((grant) => grant.id === grantId)?.status, "pending");
        const events = await diskTrajectory.read(ref);
        assert.equal(events.some((event) => event.eventType === "action_approved"), true);
        assert.equal(events.some((event) => event.eventType === "state_committed"), false);
        assert.equal(events.some((event) => event.eventType === "tool_started"), false);

        const recovered = new GoalCoordinator({
            store,
            trajectoryStore: diskTrajectory,
            scheduler: {
                async schedule() { throw new Error("scheduler boundary reached"); },
            },
            toolRegistry: fixture.registry,
            toolGrantStore: fixture.toolGrantStore,
            sandboxGrantStore: fixture.sandboxGrantStore,
            workspaceId: "ws-1",
            workspaceRoot: fixture.workspaceRoot,
        });
        await assert.rejects(recovered.advance(ref), /scheduler boundary reached/);
        const active = await fixture.toolGrantStore.list({ workspaceId: "ws-1", goalId: goal.id });
        assert.equal(active.find((grant) => grant.id === grantId)?.status, "active");
    } finally {
        await fixture.dispose();
    }
});

test("advance 不会在已有 Interrupt 的旧 Snapshot 上激活 pending Grant", async () => {
    const fixture = await createApprovalFixture();
    try {
        const awaiting = createAwaitingApprovalGoal({ goalId: "goal-advance-skips-interrupted-grant" });
        const approvalInputId = "approval-input-before-interrupt";
        const grant = await fixture.toolGrantStore.stage({
            scope: "goal",
            workspaceId: "ws-1",
            goalId: awaiting.id,
            source: {
                goalId: awaiting.id,
                runId: awaiting.state.run.id,
                actionId: "action-approval",
                approvalInputId,
            },
            matcher: {
                kind: "target_path",
                toolId: "write_file",
                version: 1,
                path: `${await realpath(fixture.workspaceRoot)}/a.txt`,
            },
        });
        const approved = transition(awaiting.state.run, {
            kind: "approve_action",
            actionId: "action-approval",
            approvalScope: "goal",
            grantId: grant.id,
            approvalInputId,
        });
        assert.equal(approved.ok, true);
        if (!approved.ok) return;
        const goal: Goal = {
            ...awaiting,
            state: {
                ...awaiting.state,
                messageQueue: {
                    revision: 0,
                    items: [],
                    pause: { reason: "user_interrupt", runId: awaiting.state.run.id },
                },
                run: {
                    ...approved.state,
                    interruption: { requestId: "interrupt-before-advance", status: "requested" },
                },
            },
        };
        await fixture.store.save(goal);
        const coordinator = new GoalCoordinator({
            store: fixture.store,
            trajectoryStore: trajectoryStoreFor(fixture.store),
            scheduler: {
                async schedule() { throw new Error("scheduler boundary reached"); },
            },
            toolRegistry: fixture.registry,
            toolGrantStore: fixture.toolGrantStore,
            sandboxGrantStore: fixture.sandboxGrantStore,
            workspaceId: "ws-1",
            workspaceRoot: fixture.workspaceRoot,
        });

        await assert.rejects(coordinator.advance({ goalId: goal.id, runId: goal.state.run.id }), /scheduler boundary reached/);
        const grants = await fixture.toolGrantStore.list({ workspaceId: "ws-1", goalId: goal.id });
        assert.equal(grants.find((candidate) => candidate.id === grant.id)?.status, "pending");
        assert.equal(fixture.calls.length, 0);
    } finally {
        await fixture.dispose();
    }
});

test("Interrupt wins while persistent approval is being staged outside the Goal mutation gate", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal({ goalId: "goal-interrupt-during-grant-stage" });
        await fixture.store.save(goal);
        const staged = deferred();
        const releaseStage = deferred();
        const toolGrantStore = new Proxy(fixture.toolGrantStore, {
            get(target, property, receiver) {
                if (property === "stage") {
                    return async (...args: Parameters<typeof target.stage>) => {
                        staged.resolve();
                        await releaseStage.promise;
                        return target.stage(...args);
                    };
                }
                const value = Reflect.get(target, property, receiver) as unknown;
                return typeof value === "function" ? value.bind(target) : value;
            },
        });
        const base = createApprovalCoordinator(fixture);
        const coordinator = new GoalCoordinator({
            store: fixture.store,
            trajectoryStore: base.trajectoryStore,
            scheduler: new InlineScheduler(base.runner),
            toolRegistry: fixture.registry,
            toolGrantStore,
            sandboxGrantStore: fixture.sandboxGrantStore,
            workspaceId: "ws-1",
            workspaceRoot: fixture.workspaceRoot,
        });
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        const approval = coordinator.resume({
            ref,
            action: {
                kind: "approve_action",
                actionId: "action-approval",
                scope: "goal",
            },
        });
        await staged.promise;

        const interrupt = await base.runner.interrupt(ref, "interrupt-before-approval-commit");
        assert.equal(interrupt.ok, true);
        releaseStage.resolve();

        const result = await approval;
        assert.equal(result.ok, false);
        assert.equal(result.ok === false && result.error.code, "GOAL_NOT_WAITING");
        const saved = await fixture.store.restore(goal.id);
        assert.equal(saved?.state.run.status, "cancelled");
        assert.equal(saved?.state.run.pendingAction, undefined);
        assert.equal(fixture.calls.length, 0);

        const grants = await fixture.toolGrantStore.list({ workspaceId: "ws-1", goalId: goal.id });
        assert.equal(grants.length, 1);
        assert.equal(grants[0]?.status, "pending");
        assert.equal(
            base.trajectoryStore.events.some((event) => event.eventType === "action_approved"),
            false,
        );
    } finally {
        await fixture.dispose();
    }
});

test("Grant revocation does not restore a stale waiting snapshot over an accepted Interrupt", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal({ goalId: "goal-revoke-during-interrupt" });
        await fixture.store.save(goal);
        const grant = await fixture.toolGrantStore.stage({
            scope: "goal",
            workspaceId: "ws-1",
            goalId: goal.id,
            source: {
                goalId: goal.id,
                runId: goal.state.run.id,
                actionId: "previous-action",
                approvalInputId: "previous-approval",
            },
            matcher: {
                kind: "target_path",
                toolId: "write_file",
                version: 1,
                path: join(fixture.workspaceRoot, "a.txt"),
            },
        });
        await fixture.toolGrantStore.activate(grant.id, grant.source);

        const revoking = deferred();
        const releaseRevoke = deferred();
        const toolGrantStore = new Proxy(fixture.toolGrantStore, {
            get(target, property, receiver) {
                if (property === "revoke") {
                    return async (...args: Parameters<typeof target.revoke>) => {
                        revoking.resolve();
                        await releaseRevoke.promise;
                        return target.revoke(...args);
                    };
                }
                const value = Reflect.get(target, property, receiver) as unknown;
                return typeof value === "function" ? value.bind(target) : value;
            },
        });
        const base = createApprovalCoordinator(fixture);
        const coordinator = new GoalCoordinator({
            store: fixture.store,
            trajectoryStore: base.trajectoryStore,
            scheduler: new InlineScheduler(base.runner),
            toolRegistry: fixture.registry,
            toolGrantStore,
            sandboxGrantStore: fixture.sandboxGrantStore,
            workspaceId: "ws-1",
            workspaceRoot: fixture.workspaceRoot,
        });
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        const revoke = coordinator.revokeGrant({ ref, kind: "tool", grantId: grant.id });
        await revoking.promise;
        const interrupt = base.runner.interrupt(ref, "interrupt-during-grant-revoke");
        await setImmediate();
        assert.equal((await fixture.store.restore(goal.id))?.state.run.status, "waiting");

        releaseRevoke.resolve();
        await revoke;
        const accepted = await interrupt;
        assert.equal(accepted.ok, true);
        const saved = await fixture.store.restore(goal.id);
        assert.equal(saved?.state.run.status, "cancelled");
        assert.equal(saved?.state.run.interruption?.requestId, "interrupt-during-grant-revoke");
        assert.equal(
            base.trajectoryStore.events.filter((event) => event.eventType === "run_cancelled").length,
            1,
        );
        const grants = await fixture.toolGrantStore.list({ workspaceId: "ws-1", goalId: goal.id });
        assert.equal(grants.find((item) => item.id === grant.id)?.status, "revoked");
    } finally {
        await fixture.dispose();
    }
});

test("Tool Grant 撤销的审计提交失败时仍保留已撤销授权与原 Snapshot", async () => {
    const fixture = await createApprovalFixture();
    try {
        const goal = createAwaitingApprovalGoal({ goalId: "goal-tool-grant-revoke-save-failure" });
        const source = {
            goalId: goal.id,
            runId: goal.state.run.id,
            actionId: "previous-action",
            approvalInputId: "previous-approval",
        };
        const grant = await fixture.toolGrantStore.stage({
            scope: "goal",
            workspaceId: "ws-1",
            goalId: goal.id,
            source,
            matcher: {
                kind: "target_path",
                toolId: "write_file",
                version: 1,
                path: join(fixture.workspaceRoot, "a.txt"),
            },
        });
        await fixture.toolGrantStore.activate(grant.id, source);

        const store = new FailingSaveGoalStore(1);
        await store.seed(goal);
        const { coordinator } = createApprovalCoordinator(fixture, { store });

        await assert.rejects(coordinator.revokeToolGrant({
            ref: { goalId: goal.id, runId: goal.state.run.id },
            grantId: grant.id,
            scope: "goal",
        }), /snapshot save failed/);

        assert.equal((await store.restore(goal.id))?.state.run.status, "waiting");
        const grants = await fixture.toolGrantStore.list({ workspaceId: "ws-1", goalId: goal.id });
        assert.equal(grants.find((candidate) => candidate.id === grant.id)?.status, "revoked");
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
