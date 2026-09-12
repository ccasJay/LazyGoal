import assert from "node:assert/strict";
import { test } from "node:test";

import type { LlmConfig, LlmModelCatalog, LlmModelDescriptor } from "../../llm/src/index";
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
} from "../src/index";

const profile = {
    id: "profile-1",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["Prepare before execution."],
    toolIds: [],
};

function createModel(
    id: string,
    displayName: string,
    selectable = true,
    unavailableReason?: string,
): LlmModelDescriptor {
    return {
        id,
        displayName,
        provider: "anthropic",
        selectable,
        unavailableReason,
        availabilitySource: "live",
        metadataSource: "catalog",
        contextWindowTokens: 200_000,
        maxOutputTokens: 8192,
    };
}

function createWaitingGoal(id = "goal-1", waitingFor: "question" | "approval" = "question"): Goal {
    const goal = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id,
        intent: "Test goal",
        profile,
        runId: `run-${id}`,
    });

    return {
        ...goal,
        state: {
            ...goal.state,
            workflow: {
                phase: "gathering_context",
                preparation: { status: "waiting_input" },
            },
            messages: [
                ...goal.state.messages,
                {
                    role: "assistant",
                    assistant: { profileId: profile.id },
                    content: "Question content",
                },
            ],
        },
    };
}

function createRunningGoal(id = "goal-running"): Goal {
    const goal = createGoal({
        ...currentProtocols,
        promptBundleVersion: 1,
        id,
        intent: "Test goal",
        profile,
        runId: `run-${id}`,
    });

    return {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                status: "running",
            },
            workflow: {
                phase: "executing",
                preparation: { status: "completed" },
                task: {
                    title: "Test task",
                    description: "Test task description",
                },
            },
        },
    };
}

function waitingResult(goal: Goal, waitingFor: "question" | "approval" = "question"): GoalProgressResult {
    return {
        ok: true,
        kind: "waiting",
        phase: "gathering_context",
        waitingFor,
        goal,
    };
}

function runningResult(goal: Goal): GoalProgressResult {
    return {
        ok: true,
        kind: "running",
        phase: "executing",
        goal,
    };
}

class FakeLauncher implements SessionLauncher {
    constructor(private readonly result: LaunchResult) {}
    async launch(_request: LaunchRequest): Promise<LaunchResult> {
        return this.result;
    }
}

class FakeCoordinator implements SessionCoordinator {
    constructor(private readonly result: GoalProgressResult) {}
    async advance(_ref: { readonly goalId: string; readonly runId: string }): Promise<GoalProgressResult> {
        return this.result;
    }
    async resume(_request: ResumeGoalRequest): Promise<GoalProgressResult> {
        return this.result;
    }
}

class FakeStore implements Pick<GoalStore, "restore"> {
    async restore(_goalId: string): Promise<Goal | undefined> {
        return undefined;
    }
}

class FakeCatalog implements GoalCatalog {
    async listResumable(): Promise<readonly GoalCatalogEntry[]> {
        return [];
    }
}

class FakeModelCatalog implements LlmModelCatalog {
    constructor(
        private readonly result: () => Promise<readonly LlmModelDescriptor[]>,
    ) {}

    async list(
        _config: LlmConfig,
        _options?: { readonly signal?: AbortSignal | undefined },
    ): Promise<readonly LlmModelDescriptor[]> {
        return this.result();
    }
}

function baseDeps(overrides: Partial<SessionControllerDependencies> = {}): SessionControllerDependencies {
    return {
        launcher: new FakeLauncher(waitingResult(createWaitingGoal())),
        coordinator: new FakeCoordinator(waitingResult(createWaitingGoal())),
        store: new FakeStore(),
        catalog: new FakeCatalog(),
        profileId: profile.id,
        goalIdGenerator: () => "goal-1",
        defaultModelId: "claude-3-5-sonnet",
        ...overrides,
    };
}

test("openModelSelector from intent_input screen transitions to model_select screen and fetches catalog", async () => {
    const models = [createModel("claude-3-5-sonnet", "Claude 3.5 Sonnet"), createModel("gpt-4o", "GPT-4o")];
    const modelCatalog = new FakeModelCatalog(async () => models);

    const controller = new SessionController(baseDeps({ modelCatalog }));
    assert.equal(controller.getSnapshot().screen, "intent_input");

    await controller.dispatch({ kind: "openModelSelector" });

    // 初始进入 model_select
    const view = controller.getSnapshot();
    assert.equal(view.screen, "model_select");
    if (view.screen === "model_select") {
        assert.equal(view.origin, "intent");
        assert.equal(view.currentModelId, "claude-3-5-sonnet");
    }

    // 等待异步 fetch 完成
    await new Promise((resolve) => setTimeout(resolve, 20));

    const updatedView = controller.getSnapshot();
    assert.equal(updatedView.screen, "model_select");
    if (updatedView.screen === "model_select") {
        assert.equal(updatedView.state.status, "list");
        if (updatedView.state.status === "list") {
            assert.equal(updatedView.state.models.length, 2);
        }
    }
});

test("openModelSelector from session screen at question safe point succeeds", async () => {
    const goal = createWaitingGoal("goal-1", "question");
    const models = [createModel("claude-3-5-sonnet", "Claude 3.5 Sonnet")];
    const controller = new SessionController(
        baseDeps({
            launcher: new FakeLauncher(waitingResult(goal, "question")),
            modelCatalog: new FakeModelCatalog(async () => models),
        }),
    );

    // 先启动到 session 界面
    await controller.dispatch({ kind: "create", intent: "Build feature" });
    assert.equal(controller.getSnapshot().screen, "session");

    // 打开模型选择器
    await controller.dispatch({ kind: "openModelSelector" });
    const view = controller.getSnapshot();
    assert.equal(view.screen, "model_select");
    if (view.screen === "model_select") {
        assert.equal(view.origin, "question");
    }
});

test("openModelSelector is rejected when session is not in safe waiting point", async () => {
    const goal = createRunningGoal("goal-running");
    const controller = new SessionController(
        baseDeps({
            initialGoal: goal,
        }),
    );

    assert.equal(controller.getSnapshot().screen, "session");

    // 在 running 状态下尝试打开模型选择器
    await controller.dispatch({ kind: "openModelSelector" });
    const view = controller.getSnapshot();

    // 保持在 session 界面，并设置错误提示
    assert.equal(view.screen, "session");
    assert.equal(view.error?.code, "MODEL_SWITCH_NOT_ALLOWED");
});

test("cancelModelSelect restores original screen, increments generation and sets notice", async () => {
    let fetchResolve: (result: readonly LlmModelDescriptor[]) => void = () => undefined;
    const modelCatalog = new FakeModelCatalog(
        () =>
            new Promise((resolve) => {
                fetchResolve = resolve;
            }),
    );

    const controller = new SessionController(baseDeps({ modelCatalog }));
    await controller.dispatch({ kind: "openModelSelector" });

    const view = controller.getSnapshot();
    assert.equal(view.screen, "model_select");
    if (view.screen === "model_select") {
        assert.equal(view.state.status, "loading");
    }

    // 用户按 ESC 取消
    await controller.dispatch({ kind: "cancelModelSelect" });

    const restoredView = controller.getSnapshot();
    assert.equal(restoredView.screen, "intent_input");
    assert.match(restoredView.notice?.message ?? "", /Model selection cancelled/);

    // 此时迟到的 fetch 返回
    fetchResolve([createModel("late-model", "Late Model")]);
    await new Promise((resolve) => setTimeout(resolve, 20));

    // 视图仍保持在 intent_input，未被迟到的 fetch 篡改
    const finalView = controller.getSnapshot();
    assert.equal(finalView.screen, "intent_input");
});

test("selectModel keeping current model returns to origin without calling switcher", async () => {
    let switcherCalled = false;
    const models = [createModel("claude-3-5-sonnet", "Claude 3.5 Sonnet")];
    const controller = new SessionController(
        baseDeps({
            defaultModelId: "claude-3-5-sonnet",
            modelCatalog: new FakeModelCatalog(async () => models),
            modelSwitcher: {
                switchModel: async () => {
                    switcherCalled = true;
                    return { ok: true };
                },
            },
        }),
    );

    await controller.dispatch({ kind: "openModelSelector" });
    await new Promise((resolve) => setTimeout(resolve, 20));

    await controller.dispatch({
        kind: "selectModel",
        model: models[0]!,
    });

    assert.equal(switcherCalled, false);
    const view = controller.getSnapshot();
    assert.equal(view.screen, "intent_input");
    assert.match(view.notice?.message ?? "", /Current model kept/);
});

test("selectModel keeps model_select screen and displays error for ineligible models", async () => {
    const ineligibleModel = createModel("model-ineligible", "Ineligible Model", false, "No structured outputs");
    const controller = new SessionController(baseDeps());

    await controller.dispatch({ kind: "openModelSelector" });

    await controller.dispatch({
        kind: "selectModel",
        model: ineligibleModel,
    });

    const view = controller.getSnapshot();
    assert.equal(view.screen, "model_select");
    assert.equal(view.error?.code, "MODEL_NOT_SELECTABLE");
    assert.match(view.error?.message ?? "", /No structured outputs/);
});

test("selectModel successfully switches model and calls modelSwitcher callback", async () => {
    const newModel = createModel("claude-3-opus", "Claude 3 Opus", true);
    const switchedGoals: string[] = [];
    const switchedModels: string[] = [];

    const controller = new SessionController(
        baseDeps({
            defaultModelId: "claude-3-5-sonnet",
            modelSwitcher: {
                switchModel: async ({ goal, targetModel }) => {
                    if (goal) switchedGoals.push(goal.id);
                    switchedModels.push(targetModel.id);
                    return { ok: true, goal };
                },
            },
        }),
    );

    await controller.dispatch({ kind: "openModelSelector" });
    await controller.dispatch({
        kind: "selectModel",
        model: newModel,
    });

    assert.deepEqual(switchedModels, ["claude-3-opus"]);
    const view = controller.getSnapshot();
    assert.equal(view.screen, "intent_input");
    assert.match(view.notice?.message ?? "", /Model switched to Claude 3 Opus/);
});

test("modelCatalog fetch error transitions state to error", async () => {
    const modelCatalog = new FakeModelCatalog(async () => {
        throw new Error("Catalog fetch timed out");
    });

    const controller = new SessionController(baseDeps({ modelCatalog }));
    await controller.dispatch({ kind: "openModelSelector" });
    await new Promise((resolve) => setTimeout(resolve, 30));

    const view = controller.getSnapshot();
    assert.equal(view.screen, "model_select");
    if (view.screen === "model_select") {
        assert.equal(view.state.status, "error");
        if (view.state.status === "error") {
            assert.equal(view.state.error.code, "INTERNAL_ERROR");
            assert.match(view.state.error.message, /Catalog fetch timed out/);
        }
    }
});
