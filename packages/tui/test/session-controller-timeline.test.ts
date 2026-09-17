import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    createGoal,
    type Goal,
    type GoalCatalog,
    type GoalCatalogEntry,
    type GoalProgressResult,
    type GoalStore,
    type LaunchRequest,
    type LaunchResult,
    type ResumeGoalRequest,
} from "../../runtime/src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";
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
    id: "profile-1",
    systemPrompt: "You are an assistant.",
    instructions: [],
    toolIds: [],
};

function createExecutingGoal(id = "goal-1"): Goal {
    const goal = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id,
        intent: "Test streaming transcript timeline",
        profile,
        runId: `run-${id}`,
    });

    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: {
                    objective: "Execute task",
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
                    content: "Start execution",
                },
            ],
        },
    };
}

function createDependencies(options: {
    readonly initialGoal?: Goal;
    readonly scheduler: FakeScheduler;
    readonly advanceResult?: (goal: Goal) => GoalProgressResult;
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
        advance: async (ref) => {
            const goal = goals.get(ref.goalId);
            if (!goal) throw new Error("Goal not found");
            if (options.advanceResult) {
                const res = options.advanceResult(goal);
                if (res.ok) {
                    goals.set(res.goal.id, res.goal);
                }
                return res;
            }
            return { ok: true, kind: "terminal", phase: "executing", goal };
        },
        resume: async (req: ResumeGoalRequest) => {
            const goal = goals.get(req.ref.goalId);
            if (!goal) throw new Error("Goal not found");
            if (options.advanceResult) {
                const res = options.advanceResult(goal);
                if (res.ok) {
                    goals.set(res.goal.id, res.goal);
                }
                return res;
            }
            return { ok: true, kind: "terminal", phase: "executing", goal };
        },
    };

    const dependencies: SessionControllerDependencies = {
        launcher,
        coordinator,
        store,
        catalog,
        profileId: "profile-1",
        goalIdGenerator: () => "gen-goal-1",
        transcriptScheduler: options.scheduler,
        ...(options.initialGoal ? { initialGoal: options.initialGoal } : {}),
    };

    return { dependencies, goals };
}

describe("SessionController Timeline & Streaming Transcript Integration", () => {
    it("需求 4.1 & 5.3: 新增 Assistant 消息走合成流，按 40ms Tick 渐进追加 block，最终文本逐字符一致", async () => {
        const scheduler = new FakeScheduler();
        const initialGoal = createExecutingGoal("goal-streaming");
        let currentGoal = initialGoal;

        const assistantContent =
            "# Section 1\n\n" +
            "Paragraph one with details.\n\n" +
            "```javascript\nconst x = 42;\n```\n\n" +
            "Final conclusion text.";

        const { dependencies } = createDependencies({
            initialGoal,
            scheduler,
            advanceResult: () => {
                currentGoal = {
                    ...currentGoal,
                    state: {
                        ...currentGoal.state,
                        messages: [
                            ...currentGoal.state.messages,
                            {
                                role: "assistant",
                                assistant: { profileId: profile.id },
                                content: assistantContent,
                            },
                        ],
                    },
                };
                return {
                    ok: true,
                    kind: "waiting",
                    phase: "gathering_context",
                    waitingFor: "question",
                    goal: currentGoal,
                };
            },
        });

        const controller = new SessionController(dependencies);

        // 初始只有一条 user 消息进入 committed timeline
        let vm = controller.getSnapshot() as UiSessionViewModel;
        assert.equal(vm.timeline?.length, 1);
        assert.equal(vm.timeline[0]?.kind, "message");
        assert.equal(vm.streamingTail, undefined);

        // 推进一轮产生 Assistant 响应
        await controller.dispatch({ kind: "submitMessage", content: "continue" });

        vm = controller.getSnapshot() as UiSessionViewModel;
        // 此时合成流刚刚 started/delta/completed，但尚未触发 40ms Tick
        // timeline 中尚未提交该 Assistant 的 blocks
        assert.equal(vm.timeline?.length, 1);
        // streamingTail 呈现完整的未决内容
        assert.ok(vm.streamingTail !== undefined);
        assert.equal(vm.streamingTail.content, assistantContent);
        assert.equal(vm.streamingTail.showAuthor, true);

        // 推进 40ms，触发第一个 Commit Tick
        scheduler.advance(40);
        vm = controller.getSnapshot() as UiSessionViewModel;
        assert.ok(vm.timeline !== undefined && vm.timeline.length > 1);

        const firstBlockItem = vm.timeline[1];
        assert.equal(firstBlockItem?.kind, "assistant_markdown");
        if (firstBlockItem?.kind === "assistant_markdown") {
            assert.equal(firstBlockItem.showAuthor, true);
        }

        // 推进剩余所有 Tick
        scheduler.advanceAll();
        vm = controller.getSnapshot() as UiSessionViewModel;

        // 所有 block 均已提交进 timeline
        assert.equal(vm.streamingTail, undefined);
        const assistantBlocks = vm.timeline!.filter(t => t.kind === "assistant_markdown");
        assert.ok(assistantBlocks.length >= 3);

        // 需求 5.3: 导出的 transcript 文本与 canonical content 逐字符完全一致
        assert.equal(controller.getTranscriptText(), assistantContent);
        const reconstructed = assistantBlocks.map(b => (b as any).block).join("");
        assert.equal(reconstructed, assistantContent);
    });

    it("需求 4.2: 恢复已有 Goal 或带初始快照时，完整消息直接 hydrate 为 committed history，不回放动画", () => {
        const scheduler = new FakeScheduler();
        const baseGoal = createExecutingGoal("goal-restored");
        const existingGoal: Goal = {
            ...baseGoal,
            state: {
                ...baseGoal.state,
                messages: [
                    ...baseGoal.state.messages,
                    {
                        role: "assistant",
                        assistant: { profileId: profile.id },
                        content: "Restored assistant message from previous session",
                    },
                ],
            },
        };

        const { dependencies } = createDependencies({
            initialGoal: existingGoal,
            scheduler,
        });

        const controller = new SessionController(dependencies);
        const vm = controller.getSnapshot() as UiSessionViewModel;

        // 直接 hydrate 到 timeline 中（kind: "message"）
        assert.equal(vm.timeline?.length, 2);
        assert.equal(vm.timeline[0]?.kind, "message");
        assert.equal(vm.timeline[1]?.kind, "message");
        if (vm.timeline[1]?.kind === "message") {
            assert.equal(vm.timeline[1].message.content, "Restored assistant message from previous session");
        }
        // 不存在 streamingTail，不回放动画
        assert.equal(vm.streamingTail, undefined);
        assert.equal(scheduler.tasks.size, 0);
    });

    it("需求 4.3: 当新步骤到达时，若已有 Assistant 流尚未提交完毕，同步执行 flush 屏障保持时间线顺序", async () => {
        const scheduler = new FakeScheduler();
        const initialGoal = createExecutingGoal("goal-barrier");
        let currentGoal = initialGoal;

        const assistantText = "Step 1 analysis in progress.\n\nExecuting bash tool now.\n\n";

        const { dependencies } = createDependencies({
            initialGoal,
            scheduler,
            advanceResult: () => {
                currentGoal = {
                    ...currentGoal,
                    state: {
                        ...currentGoal.state,
                        messages: [
                            ...currentGoal.state.messages,
                            {
                                role: "assistant",
                                assistant: { profileId: profile.id },
                                content: assistantText,
                            },
                        ],
                    },
                };
                return {
                    ok: true,
                    kind: "waiting",
                    phase: "gathering_context",
                    waitingFor: "question",
                    goal: currentGoal,
                };
            },
        });

        const controller = new SessionController(dependencies);

        // 触发 Assistant 生成
        await controller.dispatch({ kind: "submitMessage", content: "run" });

        let vm = controller.getSnapshot() as UiSessionViewModel;
        assert.ok(vm.streamingTail !== undefined);
        // 尚未经过 40ms，此时发生了一个外部 Step 持久化通知（onGoalCommitted）
        const updatedWithStep: Goal = {
            ...currentGoal,
            state: {
                ...currentGoal.state,
                run: {
                    ...currentGoal.state.run,
                    stepCount: 1,
                    lastStep: {
                        kind: "action",
                        action: {
                            actionId: "act-1",
                            toolId: "bash",
                            input: { command: "ls" },
                        },
                        observation: {
                            kind: "success",
                            output: { exitCode: 0 },
                            summary: "Directory listed",
                        },
                    },
                },
            },
        };

        // 触发持久化通知：由于有新步骤，必须先 flush Assistant 流，再追加步骤
        controller.onGoalCommitted(updatedWithStep);

        vm = controller.getSnapshot() as UiSessionViewModel;
        assert.ok(vm.timeline !== undefined);
        // Assistant blocks 已被同步 flush 进 timeline，随后紧随 step
        const lastItem = vm.timeline[vm.timeline.length - 1];
        assert.equal(lastItem?.kind, "step");
        if (lastItem?.kind === "step") {
            assert.equal(lastItem.step.toolId, "bash");
        }

        // 前面的 item 必然是 assistant_markdown
        const priorItems = vm.timeline.slice(1, -1);
        assert.ok(priorItems.length > 0);
        assert.ok(priorItems.every(item => item.kind === "assistant_markdown"));

        // streamingTail 已被安全收束
        assert.equal(vm.streamingTail, undefined);
    });

    it("需求 1.3: 关闭与释放 Controller 取消定时器并使流失效，不再发布更新", async () => {
        const scheduler = new FakeScheduler();
        const initialGoal = createExecutingGoal("goal-shutdown");
        let currentGoal = initialGoal;

        const { dependencies } = createDependencies({
            initialGoal,
            scheduler,
            advanceResult: () => {
                currentGoal = {
                    ...currentGoal,
                    state: {
                        ...currentGoal.state,
                        messages: [
                            ...currentGoal.state.messages,
                            {
                                role: "assistant",
                                assistant: { profileId: profile.id },
                                content: "Some ongoing text\n\nMore ongoing text\n\n",
                            },
                        ],
                    },
                };
                return {
                    ok: true,
                    kind: "waiting",
                    phase: "gathering_context",
                    waitingFor: "question",
                    goal: currentGoal,
                };
            },
        });

        const controller = new SessionController(dependencies);
        await controller.dispatch({ kind: "submitMessage", content: "start" });

        // 有活动的 timer 在等待
        assert.ok(scheduler.tasks.size > 0);

        // 调用 beginShutdown
        controller.beginShutdown();

        // 定时器已清空
        assert.equal(scheduler.tasks.size, 0);

        // 推进时间不会复活 session 页面
        scheduler.advance(100);
        assert.equal(controller.getSnapshot().screen, "shutting_down");
    });
});
