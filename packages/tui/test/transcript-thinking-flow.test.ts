import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    createGoal,
    type Goal,
    type GoalCatalog,
    type GoalProgressResult,
    type GoalStore,
    type LaunchRequest,
    type LaunchResult,
    type ResumeGoalRequest,
} from "../../runtime/src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import { InMemoryExecutionStreamPublisher } from "../../execution-stream/src/index";
import {
    SessionController,
    type SessionControllerDependencies,
    type SessionCoordinator,
    type SessionLauncher,
    type TranscriptScheduler,
    type UiSessionViewModel,
} from "../src/index";

class FakeScheduler implements TranscriptScheduler {
    currentTime = 0;
    private nextId = 1;
    readonly tasks = new Map<number, { callback: () => void; dueTime: number }>();

    setTimeout(callback: () => void, ms: number): unknown {
        const id = this.nextId++;
        this.tasks.set(id, { callback, dueTime: this.currentTime + ms });
        return id;
    }

    clearTimeout(handle: unknown): void {
        this.tasks.delete(handle as number);
    }

    advance(ms: number): void {
        this.currentTime += ms;
        const dueIds: number[] = [];
        for (const [id, task] of this.tasks.entries()) {
            if (task.dueTime <= this.currentTime) {
                dueIds.push(id);
            }
        }
        dueIds.sort((a, b) => this.tasks.get(a)!.dueTime - this.tasks.get(b)!.dueTime);
        for (const id of dueIds) {
            const task = this.tasks.get(id);
            if (task) {
                this.tasks.delete(id);
                task.callback();
            }
        }
    }

    advanceAll(): void {
        let iterations = 0;
        while (this.tasks.size > 0 && iterations < 1000) {
            let earliestId: number | null = null;
            let earliestTime = Infinity;
            for (const [id, task] of this.tasks.entries()) {
                if (task.dueTime < earliestTime) {
                    earliestTime = task.dueTime;
                    earliestId = id;
                }
            }
            if (earliestId === null) break;
            this.currentTime = earliestTime;
            const task = this.tasks.get(earliestId)!;
            this.tasks.delete(earliestId);
            task.callback();
            iterations++;
        }
    }
}

const profile = {
    id: "profile-test",
    systemPrompt: "You are a test assistant.",
    instructions: [],
    toolIds: ["shell_execute"],
};

function createExecutingGoal(id = "goal-thinking-1"): Goal {
    const goal = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id,
        intent: "Test thinking flow",
        profile,
        runId: `run-${id}`,
    });

    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "executing",
                task: {
                    objective: "Execute task with thinking flow",
                    completionCriteria: [],
                },
            },
            run: {
                ...goal.state.run,
                status: "running",
            },
            messages: [
                {
                    role: "user",
                    content: "Please investigate the issue",
                },
            ],
        },
    };
}

function createDependencies(options: {
    readonly initialGoal?: Goal;
    readonly scheduler: FakeScheduler;
    readonly stepResult?: (goal: Goal) => GoalProgressResult;
    readonly executionStream?: InMemoryExecutionStreamPublisher;
}): {
    readonly dependencies: SessionControllerDependencies;
    readonly goals: Map<string, Goal>;
} {
    const goals = new Map<string, Goal>();
    if (options.initialGoal) {
        goals.set(options.initialGoal.id, options.initialGoal);
    }

    const store: Pick<GoalStore, "restore"> = {
        restore: async (goalId: string) => goals.get(goalId),
    };

    const catalog: GoalCatalog = {
        listResumable: async () => [],
    };

    const launcher: SessionLauncher = {
        launch: async (req: LaunchRequest): Promise<LaunchResult> => {
            const goal = createExecutingGoal(req.goalId);
            goals.set(goal.id, goal);
            return { ok: true, kind: "terminal", phase: "executing", goal };
        },
    };

    const coordinator: SessionCoordinator = {
        advance: async (req): Promise<GoalProgressResult> => {
            const goal = goals.get(req.goalId) ?? createExecutingGoal(req.goalId);
            if (options.stepResult) {
                return options.stepResult(goal);
            }
            return {
                ok: true,
                kind: "terminal",
                phase: "executing",
                goal,
            };
        },
        resume: async (req: ResumeGoalRequest): Promise<GoalProgressResult> => {
            const goal = goals.get(req.ref.goalId) ?? createExecutingGoal(req.ref.goalId);
            if (options.stepResult) {
                return options.stepResult(goal);
            }
            return {
                ok: true,
                kind: "terminal",
                phase: "executing",
                goal,
            };
        },
    };

    const dependencies: SessionControllerDependencies = {
        launcher,
        coordinator,
        store,
        catalog,
        profileId: profile.id,
        goalIdGenerator: () => "goal-thinking-generated",
        transcriptScheduler: options.scheduler,
        ...(options.initialGoal !== undefined ? { initialGoal: options.initialGoal } : {}),
        ...(options.executionStream === undefined ? {} : { executionStream: options.executionStream }),
    };

    return { dependencies, goals };
}

describe("思考推演流实时接入 TUI 与审批抽屉联动", () => {
    it("通用 ExecutionStream 事件即时更新模型尾部、Tool 活动和提交清理", () => {
        const scheduler = new FakeScheduler();
        const goal = createExecutingGoal("goal-execution-stream");
        const publisher = new InMemoryExecutionStreamPublisher();
        const { dependencies } = createDependencies({
            initialGoal: goal,
            scheduler,
            executionStream: publisher,
        });
        const controller = new SessionController(dependencies);
        const ref = { goalId: goal.id, runId: goal.state.run.id };

        publisher.publish({
            ...ref,
            executionUnitId: "step-1",
            kind: "step_started",
            visibility: "public",
            durability: "live",
            delivery: "control",
            payload: { stepCount: 1 },
        });
        let vm = controller.getSnapshot() as UiSessionViewModel;
        assert.equal(vm.liveActivity?.label, "Starting step 1");

        publisher.publish({
            ...ref,
            executionUnitId: "step-1",
            kind: "assistant_text_delta",
            visibility: "public",
            durability: "live",
            delivery: "delta",
            coalescingKey: "assistant:step-1",
            payload: { text: "Inspecting files..." },
        });
        vm = controller.getSnapshot() as UiSessionViewModel;
        assert.equal(vm.streamingTail?.content, "Inspecting files...");
        assert.equal(vm.liveActivity?.kind, "model");

        publisher.publish({
            ...ref,
            executionUnitId: "step-1",
            actionId: "action-1",
            kind: "tool_started",
            visibility: "public",
            durability: "trajectory",
            delivery: "control",
            payload: { toolId: "bash", actionId: "action-1" },
        });
        publisher.publish({
            ...ref,
            executionUnitId: "step-1",
            actionId: "action-1",
            kind: "tool_output_delta",
            visibility: "diagnostic",
            durability: "live",
            delivery: "delta",
            coalescingKey: "tool:action-1:stdout",
            payload: { channel: "stdout", text: "hello\n" },
        });
        vm = controller.getSnapshot() as UiSessionViewModel;
        assert.equal(vm.liveActivity?.toolId, "bash");
        assert.equal(vm.liveActivity?.output, "hello\n");

        publisher.publish({
            ...ref,
            executionUnitId: "step-1",
            kind: "step_committed",
            visibility: "public",
            durability: "checkpoint",
            delivery: "control",
            payload: { committedThroughSequence: 1 },
        });
        vm = controller.getSnapshot() as UiSessionViewModel;
        assert.equal(vm.liveActivity, undefined);
        controller.dispose();
    });

    it("需求 4.1: 模型思考增量实时同步至 Transcript 并驱动动态 streamingTail 渲染", () => {
        const scheduler = new FakeScheduler();
        const initialGoal = createExecutingGoal("goal-stream-thinking");
        const { dependencies } = createDependencies({ initialGoal, scheduler });
        const controller = new SessionController(dependencies);

        let vm = controller.getSnapshot() as UiSessionViewModel;
        assert.equal(vm.timeline?.length, 1);
        assert.equal(vm.streamingTail, undefined);

        // 1. 发送思考推演的第一段增量
        controller.feedThinkingDelta("stream-think-1", "Thinking:\n- Examining the directory\n\n");
        vm = controller.getSnapshot() as UiSessionViewModel;

        assert.ok(vm.streamingTail !== undefined);
        assert.equal(vm.streamingTail.content, "Thinking:\n- Examining the directory\n\n");
        assert.equal(vm.streamingTail.showAuthor, true);

        // 2. 发送思考推演的第二段增量
        controller.feedThinkingDelta("stream-think-1", "Next, we will check package.json.\n\n");
        vm = controller.getSnapshot() as UiSessionViewModel;
        assert.ok(vm.streamingTail !== undefined);
        assert.equal(
            vm.streamingTail.content,
            "Thinking:\n- Examining the directory\n\nNext, we will check package.json.\n\n",
        );

        // 3. 推进 40ms Tick，第一个确定结构稳定的 Markdown Block 提交入 timeline
        scheduler.advance(40);
        vm = controller.getSnapshot() as UiSessionViewModel;
        assert.ok(vm.timeline !== undefined && vm.timeline.length > 1);
        const assistantBlocks = vm.timeline.filter(t => t.kind === "assistant_markdown");
        assert.ok(assistantBlocks.length >= 1);

        // 4. 结束该思考流并推进剩余计时器
        controller.completeThinking("stream-think-1");
        scheduler.advanceAll();

        vm = controller.getSnapshot() as UiSessionViewModel;
        assert.equal(vm.streamingTail, undefined);
        assert.equal(
            controller.getTranscriptText(),
            "Thinking:\n- Examining the directory\n\nNext, we will check package.json.\n\n",
        );
    });

    it("需求 4.1 & 4.2: 单步推进中流畅显示思维推演过程，随后弹出动作审批抽屉", async () => {
        const scheduler = new FakeScheduler();
        const initialGoal = createExecutingGoal("goal-step-thinking");
        let currentGoal = initialGoal;

        const thinkingText = "Let me read the configuration file before executing any modifications.";
        const toolAction = {
            toolId: "shell_execute",
            actionId: "action-shell-1",
            input: { command: "cat config.json" },
        };

        const { dependencies } = createDependencies({
            initialGoal,
            scheduler,
            stepResult: (goal) => {
                currentGoal = {
                    ...goal,
                    state: {
                        ...goal.state,
                        run: {
                            ...goal.state.run,
                            pendingAction: {
                                action: toolAction,
                                status: "awaiting_approval",
                            },
                        },
                    },
                };
                return {
                    ok: true,
                    kind: "waiting",
                    phase: "executing",
                    waitingFor: "action_approval",
                    goal: currentGoal,
                };
            },
        });

        const controller = new SessionController(dependencies);

        // 模拟执行前/执行中接收到模型的思考流
        controller.feedThinkingDelta("stream-step-1", thinkingText);
        let vm = controller.getSnapshot() as UiSessionViewModel;
        assert.ok(vm.streamingTail !== undefined);
        assert.equal(vm.streamingTail.content, thinkingText);

        // 完成思考流
        controller.completeThinking("stream-step-1");
        scheduler.advanceAll();

        // 推进单步执行，返回等待动作审批（waitingFor: "action_approval"）
        await controller.dispatch({ kind: "submitMessage", content: "proceed" });

        vm = controller.getSnapshot() as UiSessionViewModel;
        // 验证审批抽屉状态
        assert.equal(vm.waitingFor, "action_approval");
        assert.ok(vm.pendingAction !== undefined);
        assert.equal(vm.pendingAction.action.toolId, "shell_execute");

        // 验证思维推演已完整呈现在已提交历史中（位于抽屉上方）
        const assistantBlocks = vm.timeline?.filter(t => t.kind === "assistant_markdown") ?? [];
        assert.ok(assistantBlocks.length > 0);
        const reconstructedThought = assistantBlocks.map(b => (b as any).block).join("");
        assert.equal(reconstructedThought, thinkingText);
    });

    it("需求 4.3: 当模型未输出思考时（thought 缺省），具备完全向下兼容性且不产生空 block", async () => {
        const scheduler = new FakeScheduler();
        const initialGoal = createExecutingGoal("goal-no-thinking");
        let currentGoal = initialGoal;

        const { dependencies } = createDependencies({
            initialGoal,
            scheduler,
            stepResult: (goal) => {
                currentGoal = {
                    ...goal,
                    state: {
                        ...goal.state,
                        run: {
                            ...goal.state.run,
                            pendingAction: {
                                action: {
                                    toolId: "shell_execute",
                                    actionId: "act-no-thought",
                                    input: { command: "ls" },
                                },
                                status: "awaiting_approval",
                            },
                        },
                    },
                };
                return {
                    ok: true,
                    kind: "waiting",
                    phase: "executing",
                    waitingFor: "action_approval",
                    goal: currentGoal,
                };
            },
        });

        const controller = new SessionController(dependencies);

        // 直接推进，未调用任何 feedThinkingDelta
        await controller.dispatch({ kind: "submitMessage", content: "run" });

        const vm = controller.getSnapshot() as UiSessionViewModel;
        assert.equal(vm.waitingFor, "action_approval");
        assert.equal(vm.streamingTail, undefined);
        // timeline 中不产生任何空 assistant block
        const assistantBlocks = vm.timeline?.filter(t => t.kind === "assistant_markdown") ?? [];
        assert.equal(assistantBlocks.length, 0);
    });
});
