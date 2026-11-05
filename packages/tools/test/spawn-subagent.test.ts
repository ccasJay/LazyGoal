import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExecutionControl } from "../../execution-control/src/index";
import type { ToolExecutionContext } from "../../tool-core/src/index";
import {
    createChildProfileRegistry,
    RuntimeSubagentSpawner,
    SUBAGENT_INTENT_PREFIX,
} from "../../runtime/src/index";
import type {
    AgentProfile,
    AgentProfileRegistry,
    Goal,
    GoalModelSelection,
    GoalStore,
    RunStatus,
    SessionCreateRequest,
    SessionManagerDependencies,
} from "../../runtime/src/index";
import {
    SPAWN_SUBAGENT_TOOL_ID,
    SpawnSubagentTool,
    type SpawnSubagentInput,
    type SpawnSubagentOutput,
    type SubagentSpawner,
} from "../src/index";

test("SpawnSubagentTool: definition, validation and execution delegation", async () => {
    let capturedInput: SpawnSubagentInput | undefined;
    const fakeSpawner: SubagentSpawner = {
        async spawn(input) {
            capturedInput = input;
            return {
                childGoalId: "child-goal-1",
                status: "completed",
                answer: "Task completed successfully",
            };
        },
    };

    const tool = new SpawnSubagentTool(fakeSpawner);
    assert.equal(tool.definition.id, SPAWN_SUBAGENT_TOOL_ID);
    assert.equal(tool.replayPolicy, "manual");

    // validation
    assert.equal(tool.validate({}).ok, false);
    assert.equal(tool.validate({ intent: "" }).ok, false);
    assert.equal(tool.validate({ intent: "   " }).ok, false);
    assert.equal(tool.validate({ intent: "do subtask" }).ok, true);
    assert.equal(tool.validate({ intent: "do subtask", title: "subtask title" }).ok, true);

    // execute
    const context: ToolExecutionContext = { goalId: "parent-goal-1", runId: "parent-run-1" };
    const control: ExecutionControl = {};
    const result = await tool.execute(
        {
            actionId: "act-1",
            context,
            input: { intent: "do subtask", title: "subtask title" },
        },
        control,
    );

    assert.equal(result.kind, "success");
    if (result.kind === "success") {
        const output = result.output as unknown as SpawnSubagentOutput;
        assert.equal(output.childGoalId, "child-goal-1");
        assert.equal(output.status, "completed");
        assert.equal(output.answer, "Task completed successfully");
    }
    assert.deepEqual(capturedInput, { intent: "do subtask", title: "subtask title" });
});

test("createChildProfileRegistry: prevents recursive nested spawning in runtime code", () => {
    const parentProfile: AgentProfile = {
        id: "default-agent",
        name: "Default Agent",
        description: "Default profile",
        systemPrompt: "You are LazyGoal.",
        instructions: ["Follow instructions."],
        toolIds: ["read_file", "write_file", SPAWN_SUBAGENT_TOOL_ID, "bash"],
    };

    const parentProfiles: AgentProfileRegistry = {
        get(id: string) {
            if (id === parentProfile.id) return parentProfile;
            return undefined;
        },
    };

    const childProfiles = createChildProfileRegistry(parentProfiles);

    const retrievedParent = parentProfiles.get("default-agent");
    assert.ok(retrievedParent?.toolIds.includes(SPAWN_SUBAGENT_TOOL_ID));

    const retrievedChild = childProfiles.get("default-agent");
    assert.ok(retrievedChild !== undefined);
    assert.equal(retrievedChild.id, "default-agent");
    assert.ok(!retrievedChild.toolIds.includes(SPAWN_SUBAGENT_TOOL_ID));
    assert.deepEqual(retrievedChild.toolIds, ["read_file", "write_file", "bash"]);
});

// 测试运行时派发器的辅助模拟环境
function createSpawnerHarness(options: {
    childRunStatusSequence: RunStatus[];
    finalAnswer?: string;
    finalFailureReason?: string;
}) {
    const parentGoal: Goal = {
        id: "parent-goal-123",
        definition: {
            profile: {
                id: "profile-alpha",
                name: "Profile Alpha",
                description: "Test profile",
                toolIds: ["read_file", SPAWN_SUBAGENT_TOOL_ID],
            },
            workspace: {
                workspaceRoot: "/workspace/test",
            },
        },
        state: {
            mode: "normal",
            run: {
                runId: "parent-run-123",
                status: "running",
            },
            modelSelection: {
                provider: "test-provider",
                model: "test-model",
            },
        },
    } as unknown as Goal;

    const goalStore: GoalStore = {
        async restore(goalId: string) {
            if (goalId === parentGoal.id) {
                return parentGoal;
            }
            return null;
        },
        async save() {},
    } as unknown as GoalStore;

    let childCreatedRequest: SessionCreateRequest | undefined;
    let interrupted = false;
    let childStatusIndex = 0;

    // 模拟子 Session
    const mockSession = {
        read() {
            const currentStatus =
                options.childRunStatusSequence[
                    Math.min(childStatusIndex, options.childRunStatusSequence.length - 1)
                ];
            return {
                goalId: childCreatedRequest?.goalId ?? "child-goal-default",
                runId: "child-run-1",
                runStatus: currentStatus,
            };
        },
        async *events() {
            for (let i = 0; i < options.childRunStatusSequence.length; i++) {
                childStatusIndex = i;
                yield { kind: "run_status_changed", status: options.childRunStatusSequence[i] };
            }
        },
        async messages() {
            if (options.finalAnswer !== undefined) {
                return {
                    ok: true,
                    messages: [
                        { messageId: "msg-1", role: "assistant", purpose: "answer" },
                    ],
                };
            }
            return { ok: true, messages: [] };
        },
        async message(messageId: string) {
            if (messageId === "msg-1" && options.finalAnswer !== undefined) {
                return {
                    ok: true,
                    entry: {
                        content: options.finalAnswer,
                    },
                };
            }
            return { ok: false, error: "not found" };
        },
        async send(command: { kind: string }) {
            if (command.kind === "interrupt") {
                interrupted = true;
                return { ok: true, runId: "child-run-1", status: "interrupted" };
            }
            return { ok: true };
        },
        async detach() {},
    };

    const mockCoordinator = {
        launch: async () => {},
        advance: async () => {},
        continue: async () => {},
        steer: async () => {},
        interrupt: async () => {},
        resume: async () => {},
        reviewActionApproval: async () => {},
    };

    const sessionManagerDeps: SessionManagerDependencies = {
        store: goalStore,
        committer: {} as any,
        coordinator: mockCoordinator as any,
        profiles: {
            get(id: string) {
                return parentGoal.definition.profile;
            },
        },
        runIdGenerator: () => "child-run-1",
    };

    return {
        goalStore,
        sessionManagerDeps,
        mockSession,
        getInterrupted: () => interrupted,
        getChildCreatedRequest: () => childCreatedRequest,
        setChildCreatedRequest: (req: SessionCreateRequest) => {
            childCreatedRequest = req;
        },
    };
}

test("RuntimeSubagentSpawner: success path returns completed status and final answer", async () => {
    const harness = createSpawnerHarness({
        childRunStatusSequence: ["running", "completed"],
        finalAnswer: "Child successfully finished the calculation",
    });

    const spawner = new RuntimeSubagentSpawner(
        harness.goalStore,
        harness.sessionManagerDeps,
    );

    // Mock createChildSession to return mockSession
    (spawner as any).createChildSession = async (
        _deps: SessionManagerDependencies,
        request: SessionCreateRequest,
    ) => {
        harness.setChildCreatedRequest(request);
        return harness.mockSession;
    };

    const context: ToolExecutionContext = { goalId: "parent-goal-123", runId: "parent-run-123" };
    const control: ExecutionControl = {};

    const result = await spawner.spawn(
        { intent: "Perform calculation", title: "Calculation Subtask" },
        context,
        control,
    );

    assert.equal(result.status, "completed");
    assert.equal(result.answer, "Child successfully finished the calculation");
    assert.ok(result.childGoalId.length > 0);

    // 验证子任务的 intent 注入了 SUBAGENT_INTENT_PREFIX
    const createdReq = harness.getChildCreatedRequest();
    assert.ok(createdReq !== undefined);
    assert.ok(createdReq.content.includes(SUBAGENT_INTENT_PREFIX));
    assert.ok(createdReq.content.includes("Calculation Subtask"));
    assert.ok(createdReq.content.includes("Perform calculation"));
    assert.equal(createdReq.mode, "normal");
    assert.deepEqual(createdReq.modelSelection, {
        provider: "test-provider",
        model: "test-model",
    });
});

test("RuntimeSubagentSpawner: child failure returns failed status and reason", async () => {
    const harness = createSpawnerHarness({
        childRunStatusSequence: ["running", "failed"],
    });

    const spawner = new RuntimeSubagentSpawner(
        harness.goalStore,
        harness.sessionManagerDeps,
    );

    (spawner as any).createChildSession = async (
        _deps: SessionManagerDependencies,
        request: SessionCreateRequest,
    ) => {
        harness.setChildCreatedRequest(request);
        return harness.mockSession;
    };

    const context: ToolExecutionContext = { goalId: "parent-goal-123", runId: "parent-run-123" };
    const control: ExecutionControl = {};

    const result = await spawner.spawn(
        { intent: "Failing subtask" },
        context,
        control,
    );

    assert.equal(result.status, "failed");
    assert.ok(result.reason !== undefined);
    assert.ok(result.reason.includes("failed"));
});

test("RuntimeSubagentSpawner: parent cancellation stops wait and interrupts child without hanging", async () => {
    // 模拟子任务一直在 running 中，直到被取消
    let resolveHangingStream!: () => void;
    const hangingStreamPromise = new Promise<void>((resolve) => {
        resolveHangingStream = resolve;
    });

    const parentGoal: Goal = {
        id: "parent-goal-123",
        definition: {
            profile: {
                id: "profile-alpha",
                name: "Profile Alpha",
                description: "Test profile",
                toolIds: ["read_file", SPAWN_SUBAGENT_TOOL_ID],
            },
            workspace: { workspaceRoot: "/workspace/test" },
        },
        state: {
            mode: "normal",
            run: { runId: "parent-run-123", status: "running" },
            modelSelection: { provider: "test-provider", model: "test-model" },
        },
    } as unknown as Goal;

    const goalStore: GoalStore = {
        async restore() {
            return parentGoal;
        },
        async save() {},
    } as unknown as GoalStore;

    let interrupted = false;
    let childStatus: RunStatus = "running";

    const mockSession = {
        read() {
            return {
                goalId: "child-goal-hang",
                runId: "child-run-hang",
                runStatus: childStatus,
            };
        },
        async *events() {
            yield { kind: "run_status_changed", status: "running" };
            // 等待直到被中断
            await hangingStreamPromise;
            yield { kind: "run_status_changed", status: "cancelled" };
        },
        async messages() {
            return { ok: true, messages: [] };
        },
        async message() {
            return { ok: false };
        },
        async send(command: { kind: string }) {
            if (command.kind === "interrupt") {
                interrupted = true;
                childStatus = "cancelled";
                resolveHangingStream();
                return { ok: true, runId: "child-run-hang", status: "interrupted" };
            }
            return { ok: true };
        },
        async detach() {},
    };

    const sessionManagerDeps: SessionManagerDependencies = {
        store: goalStore,
        committer: {} as any,
        coordinator: {} as any,
        profiles: {
            get() {
                return parentGoal.definition.profile;
            },
        },
        runIdGenerator: () => "child-run-hang",
    };

    const spawner = new RuntimeSubagentSpawner(goalStore, sessionManagerDeps);
    (spawner as any).createChildSession = async () => mockSession;

    const context: ToolExecutionContext = { goalId: "parent-goal-123", runId: "parent-run-123" };
    const abortController = new AbortController();
    const control: ExecutionControl = { signal: abortController.signal };

    // 异步触发父级取消信号
    const spawnPromise = spawner.spawn({ intent: "Long running subtask" }, context, control);

    // 稍后触发 abort
    setTimeout(() => {
        abortController.abort("Parent task cancelled by operator");
    }, 20);

    const result = await spawnPromise;
    assert.equal(result.status, "cancelled");
    assert.ok(interrupted, "Child session should be interrupted when parent aborts");
    assert.ok(result.reason?.includes("cancelled"));
});
