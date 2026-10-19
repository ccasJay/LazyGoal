import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    createRunPlanRoute,
    type Goal,
    type GoalCatalog,
    type GoalCatalogEntry,
    type GoalStore,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
    type TrajectoryReadResult,
} from "../../runtime/src/index";
import { allocateImmutableEvent } from "../../runtime/src/index";
import {
    createBrowserGoalRoutes,
    listBrowserGoals,
    readBrowserGoalSession,
    type BrowserGoalListItem,
} from "../src/index";
import type { BrowserCreateSessionCommand } from "../../web-contracts/src/index";

const protocols = {
    memoryProtocol: { kind: "structured", version: 1 } as const,
    modelContextProtocol: { kind: "trajectory-layered", version: 1 } as const,
    contextRetrievalProtocol: { kind: "bm25-lite", version: 1 } as const,
};

function createTestGoal(): Goal {
    return createGoal({
        ...protocols,
        id: "goal-real-1",
        intent: "验证浏览器真实会话",
        promptBundleVersion: 1,
        profile: {
            id: "private-profile-id",
            systemPrompt: "private system prompt",
            instructions: [],
            toolIds: [],
        },
        runId: "run-real-1",
    });
}

test("browser approval projection identifies the parent program and call number", async () => {
    const created = createTestGoal();
    const parent = { actionId: "parent-action", toolId: "execute_program", input: { code: "return 1" } };
    const goal: Goal = {
        ...created,
        state: {
            ...created.state,
            run: {
                ...created.state.run,
                status: "waiting",
                pendingAction: {
                    action: { actionId: "child-action", toolId: "write_file", input: { path: "a", content: "b" } },
                    status: "awaiting_approval",
                },
                pendingProgram: {
                    programId: "program-1", action: parent, executionUnitId: "parent-unit",
                    codeHash: "code-hash", workerHash: "worker-hash", nodeVersion: "v22",
                    fixedTime: 0, seed: 1, nextCallIndex: 2, resultBytes: 0,
                },
            },
        },
    };
    const session = await readBrowserGoalSession(goal.id, new TestGoalStore(goal), async () => ({
        committed: [], uncommittedTail: [],
    }));
    assert.deepEqual(session?.pendingAction?.parentProgram, {
        actionId: "parent-action", callNumber: 3,
    });
});

test("Plan task approval projection preserves the complete ordered route", async () => {
    const initial = createTestGoal();
    const goal: Goal = {
        ...initial,
        state: {
            ...initial.state,
            run: {
                ...initial.state.run,
                mode: "plan",
                status: "waiting",
                pendingInteraction: {
                    kind: "task_approval",
                    requestId: "proposal-1",
                    proposal: { objective: "Implement the feature", completionCriteria: [{ text: "All checks pass" }] },
                    planRouteCandidate: {
                        stages: [
                            { target: "Inspect existing behavior", acceptanceCriteria: ["Identify the current entry point"] },
                            { target: "Implement the change", acceptanceCriteria: ["The feature behaves as requested", "Regression coverage passes"] },
                        ],
                    },
                    approvalRequest: "Review the full plan",
                },
            },
        },
    };
    const session = await readBrowserGoalSession(goal.id, new TestGoalStore(goal), async () => ({
        committed: [], uncommittedTail: [],
    }));
    assert.equal(session?.interaction?.kind, "task_approval");
    assert.equal(session?.interaction?.interactionId, "task_approval:proposal-1");
    assert.equal(session?.interaction?.requestId, "proposal-1");
    assert.deepEqual(session?.interaction?.decisions, ["approve_task", "send_task_feedback"]);
    // 完整有序路线不再复制到会话摘要；它由显式详情读取按同一引用提供。
    assert.equal(session?.interaction?.truncated, false);
});

test("session projection exposes the typed interaction identity and truncation flag", async () => {
    const initial = createTestGoal();
    const goal: Goal = {
        ...initial,
        state: {
            ...initial.state,
            run: {
                ...initial.state.run,
                status: "waiting",
                pendingInteraction: {
                    kind: "ask_user",
                    requestId: "ask-1",
                    mode: "execution",
                    questions: [{
                        id: "q-1",
                        header: "Scope",
                        question: "q".repeat(2_500),
                        multiSelect: false,
                        options: [{ id: "o-1", label: "All" }],
                    }],
                },
            },
        },
    };
    const store = new TestGoalStore(goal);
    const session = await readBrowserGoalSession(goal.id, store, async () => ({
        committed: [], uncommittedTail: [],
    }));
    assert.deepEqual(session?.interaction, {
        goalId: goal.id,
        runId: goal.state.run.id,
        kind: "question",
        interactionId: "question:ask-1",
        requestId: "ask-1",
        decisions: ["answer_questions", "reply_to_question", "skip_question"],
        truncated: true,
    });
    const repeated = await readBrowserGoalSession(goal.id, store, async () => ({
        committed: [], uncommittedTail: [],
    }));
    assert.equal(repeated?.interaction?.interactionId, "question:ask-1");

    const untruncated: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...goal.state.run,
                pendingInteraction: {
                    kind: "ask_user",
                    requestId: "ask-1",
                    mode: "execution",
                    questions: [{
                        id: "q-1",
                        header: "Scope",
                        question: "Which scope?",
                        multiSelect: false,
                        options: [{ id: "o-1", label: "All" }],
                    }],
                },
            },
        },
    };
    const clean = await readBrowserGoalSession(goal.id, new TestGoalStore(untruncated), async () => ({
        committed: [], uncommittedTail: [],
    }));
    assert.equal(clean?.interaction?.truncated, false);
});

test("action approval projection flags the typed view without exposing another Action", async () => {
    const initial = createTestGoal();
    const goal: Goal = {
        ...initial,
        state: {
            ...initial.state,
            run: {
                ...initial.state.run,
                status: "waiting",
                pendingAction: {
                    action: { actionId: "act-1", toolId: "bash", input: { command: "npm test" } },
                    status: "outcome_unknown",
                },
            },
        },
    };
    const session = await readBrowserGoalSession(goal.id, new TestGoalStore(goal), async () => ({
        committed: [], uncommittedTail: [],
    }));
    assert.deepEqual(session?.interaction, {
        goalId: goal.id,
        runId: goal.state.run.id,
        kind: "action_recovery",
        interactionId: "action_recovery:act-1",
        actionId: "act-1",
        decisions: ["retry_action", "reject_action"],
        truncated: false,
    });
    assert.equal(session?.pendingAction?.inputPreview.includes("npm test"), true);
});

test("Plan Run session projection includes the authoritative complete route only when present", async () => {
    const initial = createTestGoal();
    const planRoute = createRunPlanRoute({
        stages: [
            { target: "Inspect existing behavior", acceptanceCriteria: ["Find the entry point"] },
            { target: "Implement the change", acceptanceCriteria: ["Feature works", "Regression checks pass"] },
        ],
    });
    const goal: Goal = {
        ...initial,
        state: {
            ...initial.state,
            run: {
                ...initial.state.run,
                mode: "plan",
                approvedTask: { objective: "Implement the feature", completionCriteria: [{ text: "All checks pass" }] },
                planRoute: { ...planRoute, revision: 2, revisionReason: "Evidence confirmed a separate verification gate" },
            },
        },
    };
    const planSession = await readBrowserGoalSession(goal.id, new TestGoalStore(goal), async () => ({
        committed: [], uncommittedTail: [],
    }));
    assert.deepEqual(planSession?.runs[0]?.planRoute, {
        revision: 2,
        revisionReason: "Evidence confirmed a separate verification gate",
        nextStageIndex: 0,
        stages: [
            { stageId: "stage-1", revision: 1, status: "pending", target: "Inspect existing behavior", acceptanceCriteria: ["Find the entry point"] },
            { stageId: "stage-2", revision: 1, status: "pending", target: "Implement the change", acceptanceCriteria: ["Feature works", "Regression checks pass"] },
        ],
    });

    const normalSession = await readBrowserGoalSession(initial.id, new TestGoalStore(initial), async () => ({
        committed: [], uncommittedTail: [],
    }));
    assert.equal(normalSession?.runs[0]?.planRoute, undefined);
});

test("Plan route revision approval projection includes reason and full candidate route", async () => {
    const initial = createTestGoal();
    const goal: Goal = {
        ...initial,
        state: {
            ...initial.state,
            run: {
                ...initial.state.run,
                mode: "plan",
                status: "waiting",
                approvedTask: { objective: "Repair feature", completionCriteria: [{ text: "Feature works" }] },
                planRoute: {
                    revision: 1,
                    nextStageIndex: 0,
                    nextStageOrdinal: 2,
                    stages: [{ stageId: "stage-1", revision: 1, status: "pending", target: "Repair", acceptanceCriteria: ["Behavior works"] }],
                },
                pendingInteraction: {
                    kind: "ask_user",
                    requestId: "route-approval-1",
                    mode: "execution",
                    questions: [{
                        id: "q-1",
                        header: "Plan route revision",
                        question: "Should this added outcome be approved?",
                        options: [{ id: "o-1", label: "Approve" }, { id: "o-2", label: "Keep current route" }],
                        multiSelect: false,
                    }],
                    routeRevision: {
                        baseRevision: 1,
                        candidate: { stages: [
                            { target: "Repair", acceptanceCriteria: ["Behavior works"] },
                            { target: "Write report", acceptanceCriteria: ["Report is reviewed"] },
                        ] },
                        reason: "New evidence adds a deliverable outside the approved scope",
                        approvalRequest: "Approve this additional outcome?",
                        approvalOptionId: "o-1",
                    },
                },
            },
        },
    };
    const session = await readBrowserGoalSession(goal.id, new TestGoalStore(goal), async () => ({
        committed: [], uncommittedTail: [],
    }));
    // 路线扩展的完整候选路线由详情读取提供；摘要只保留身份、种类与可决定操作。
    assert.equal(session?.interaction?.kind, "question");
    assert.equal(session?.interaction?.interactionId, "question:route-approval-1");
    assert.deepEqual(session?.interaction?.decisions, ["answer_questions", "reply_to_question", "skip_question"]);
    assert.equal(session?.interaction?.truncated, false);
});

function event(
    sequence: number,
    eventType: "decision_received" | "action_staged" | "tool_finished" | "observation_recorded",
): TrajectoryEvent {
    const executionUnitId = sequence === 5 ? "uncommitted-unit" : "unit-1";
    const stepIndex = sequence === 5 ? 2 : 1;
    if (eventType === "decision_received") {
        return allocateImmutableEvent({
            goalId: "goal-real-1",
            runId: "run-real-1",
            phase: "executing",
            executionUnitId,
            stepIndex,
            eventType,
            payload: {
                type: eventType,
                decision: {
                    kind: "tool_call",
                    action: {
                        actionId: "action-1",
                        toolId: "read_file",
                        input: { path: "README.md", content: "PRIVATE_TOOL_INPUT" },
                    },
                },
                thought: "PRIVATE_REASONING_SHOULD_NOT_ESCAPE",
            },
        }, sequence);
    }

    if (eventType === "action_staged") {
        return allocateImmutableEvent({
            goalId: "goal-real-1",
            runId: "run-real-1",
            phase: "executing",
            executionUnitId,
            stepIndex,
            eventType,
            payload: {
                type: eventType,
                action: {
                    actionId: "action-1",
                    toolId: "read_file",
                    input: { path: "README.md", content: "PRIVATE_TOOL_INPUT" },
                },
                approvalStatus: "approved",
            },
        }, sequence);
    }

    if (eventType === "tool_finished") {
        return allocateImmutableEvent({
            goalId: "goal-real-1",
            runId: "run-real-1",
            phase: "executing",
            executionUnitId,
            stepIndex,
            actionId: "action-1",
            eventType,
            payload: {
                type: eventType,
                actionId: "action-1",
                toolId: "read_file",
                observation: {
                    kind: "success",
                    output: "PRIVATE_RAW_TOOL_OUTPUT",
                    summary: "读取了一个文件",
                },
            },
        }, sequence);
    }

    return allocateImmutableEvent({
        goalId: "goal-real-1",
        runId: "run-real-1",
        phase: "executing",
        executionUnitId,
        stepIndex,
        actionId: "action-1",
        eventType,
        payload: {
            type: eventType,
            actionId: "action-1",
            observation: {
                kind: "success",
                output: "PRIVATE_RAW_TOOL_OUTPUT",
                summary: "读取了一个文件",
            },
        },
    }, sequence);
}

class TestGoalStore implements GoalStore {
    constructor(private readonly goal: Goal | undefined) {}

    async save(): Promise<void> {}

    async restore(goalId: string): Promise<Goal | undefined> {
        return goalId === this.goal?.id ? this.goal : undefined;
    }
}

function thinkFact(sequence: number, requestId: string, output?: string): TrajectoryEvent {
    const metadata = { goalId: "goal-real-1", runId: "run-real-1", phase: "executing" as const, executionUnitId: "unit-1", stepIndex: 1 };
    const common = { requestId, stepOrdinal: 1, goal: `Analyze ${requestId}` };
    return allocateImmutableEvent(output === undefined
        ? { ...metadata, eventType: "think_requested", payload: { type: "think_requested", ...common } }
        : { ...metadata, eventType: "think_completed", payload: { type: "think_completed", ...common, output } }, sequence);
}

test("session preserves multiple Think rounds before the action in the same Step", async () => {
    const goal = createTestGoal();
    const committed = [thinkFact(1, "think-1"), thinkFact(2, "think-1", "First analysis"),
        thinkFact(3, "think-2"), thinkFact(4, "think-2", "Second analysis"),
        ...[event(6, "decision_received"), event(7, "action_staged"), event(8, "observation_recorded")]];
    const session = await readBrowserGoalSession(goal.id, new TestGoalStore(goal), async () => ({ committed, uncommittedTail: [] }));
    const steps = session!.runs[0]!.steps;
    assert.equal(steps.length, 3);
    assert.deepEqual(steps.map(step => step.sequence), [1, 3, 6]);
    assert.deepEqual(steps.slice(0, 2).map(step => [step.stepIndex, step.status, step.think?.output, step.actionId]),
        [[1, "completed", "First analysis", undefined], [1, "completed", "Second analysis", undefined]]);
    assert.equal(steps[2]!.toolId, "read_file");
    assert.equal(session!.runs[0]!.stepCount, goal.state.run.stepCount);
});

test("pending Think has stable identity, ignores uncommitted output, and survives a completion decision", async () => {
    const goal = createTestGoal();
    const request = thinkFact(1, "think-1");
    const output = thinkFact(2, "think-1", "Observed analysis");
    const pending = await readBrowserGoalSession(goal.id, new TestGoalStore(goal), async () => ({ committed: [request], uncommittedTail: [output] }));
    assert.equal(pending!.runs[0]!.steps.length, 1);
    assert.equal(pending!.runs[0]!.steps[0]!.status, "recorded");
    assert.equal(pending!.runs[0]!.steps[0]!.think?.output, undefined);
    const complete = allocateImmutableEvent({ goalId: goal.id, runId: goal.state.run.id, phase: "executing", executionUnitId: "unit-1", stepIndex: 1,
        eventType: "decision_received", payload: { type: "decision_received", decision: { kind: "complete", summary: "Done", evidenceSequences: [] } } }, 3);
    const saved = await readBrowserGoalSession(goal.id, new TestGoalStore(goal), async () => ({ committed: [request, output, complete], uncommittedTail: [] }));
    assert.equal(saved!.runs[0]!.steps.length, 1);
    assert.equal(saved!.runs[0]!.steps[0]!.sourceEventId, pending!.runs[0]!.steps[0]!.sourceEventId);
    assert.equal(saved!.runs[0]!.steps[0]!.think?.output, "Observed analysis");
});

test("Think session output is bounded with an explicit truncation flag", async () => {
    const goal = createTestGoal();
    const session = await readBrowserGoalSession(goal.id, new TestGoalStore(goal), async () => ({
        committed: [thinkFact(1, "think-1"), thinkFact(2, "think-1", "x".repeat(64_001))], uncommittedTail: [],
    }));
    assert.equal(session!.runs[0]!.steps[0]!.think?.truncated, true);
    assert.ok(session!.runs[0]!.steps[0]!.think!.output!.length < 64_010);
});

test("a stopped Run does not leave its unfinished Think in progress", async () => {
    const goal = createTestGoal();
    const failed = allocateImmutableEvent({ goalId: goal.id, runId: goal.state.run.id, phase: "executing",
        eventType: "run_failed", payload: { type: "run_failed", code: "MODEL_ERROR", message: "Model failed" } }, 2);
    const session = await readBrowserGoalSession(goal.id, new TestGoalStore(goal), async () => ({
        committed: [thinkFact(1, "think-1"), failed], uncommittedTail: [],
    }));
    assert.equal(session!.runs[0]!.steps[0]!.status, "failed");
    assert.equal(session!.runs[0]!.steps[0]!.think?.output, undefined);
});

class TestGoalCatalog implements GoalCatalog {
    constructor(private readonly entries: readonly GoalCatalogEntry[]) {}

    async listResumable(): Promise<readonly GoalCatalogEntry[]> {
        return this.entries.filter((entry) => entry.runStatus !== "completed"
            && entry.runStatus !== "failed"
            && entry.runStatus !== "cancelled");
    }

    async listHistory(): Promise<readonly GoalCatalogEntry[]> {
        return this.entries;
    }
}

test("看板列表使用正式 Catalog 摘要并投影白名单字段", async () => {
    const catalog = new TestGoalCatalog([{
        goalId: "goal-real-1",
        runId: "run-real-1",
        intent: "真实 Goal",
        workflowPhase: "executing",
        runStatus: "completed",
        updatedAt: "2026-09-26T00:00:00.000Z",
        secret: "must-not-appear",
    } as GoalCatalogEntry]);

    const result = await listBrowserGoals(catalog);
    assert.deepEqual(result, [{
        archived: false,
        goalId: "goal-real-1",
        runId: "run-real-1",
        intent: "真实 Goal",
        workflowPhase: "executing",
        runStatus: "completed",
        execution: {
            state: "inactive",
            committedThroughSequence: 0,
        },
        updatedAt: "2026-09-26T00:00:00.000Z",
    }]);
    assert.equal(JSON.stringify(result).includes("must-not-appear"), false);
});

test("会话只返回已提交步骤、真实消息与实际存在的计划", async () => {
    const initial = createTestGoal();
    const goal: Goal = {
        ...initial,
        state: {
            ...initial.state,
            messages: [
                { role: "user", content: "检查项目" },
                { role: "assistant", assistant: { profileId: "private-profile-id" }, content: "会话已完成" },
            ],
            goalPlan: {
                revision: 1,
                items: [{ id: "todo-1", content: "运行检查", position: 0, status: "completed" }],
            },
        },
    };
    const committed = [
        event(1, "decision_received"),
        event(2, "action_staged"),
        event(3, "tool_finished"),
        event(4, "observation_recorded"),
    ];
    const tail = [event(5, "decision_received")];
    const result: Readonly<TrajectoryReadResult> = { committed, uncommittedTail: tail };

    const session = await readBrowserGoalSession(
        goal.id,
        new TestGoalStore(goal),
        async () => result,
    );

    assert.ok(session);
    assert.deepEqual(session.messages, [
        { role: "user", content: "检查项目", runId: "run-real-1" },
        { role: "assistant", content: "会话已完成", runId: "run-real-1" },
    ]);
    assert.equal(session.currentRunMode, "normal");
    assert.equal(session.nextRunMode, undefined);
    assert.equal(session.goalPlan?.items[0]?.content, "运行检查");
    assert.equal(session.runs[0]?.steps.length, 1);
    assert.deepEqual(session.runs[0]?.steps[0], {
        runId: "run-real-1",
        executionUnitId: "unit-1",
        sourceEventId: committed[0]!.eventId,
        actionId: "action-1",
        sequence: 1,
        stepIndex: 1,
        decisionKind: "tool_call",
        toolId: "read_file",
        actionStatus: "approved",
        status: "completed",
        summary: "读取了一个文件",
        inputSummary: "README.md",
    });

    const serialized = JSON.stringify(session);
    assert.equal(serialized.includes("PRIVATE_REASONING_SHOULD_NOT_ESCAPE"), false);
    assert.equal(serialized.includes("PRIVATE_TOOL_INPUT"), false);
    assert.equal(serialized.includes("PRIVATE_RAW_TOOL_OUTPUT"), false);
    assert.equal(serialized.includes("private-profile-id"), false);
    assert.equal(serialized.includes("systemPrompt"), false);
});

test("会话步骤只有来源顺序连续时才允许后续活动组拼接", async () => {
    const initial = createTestGoal();
    const createCall = (firstSequence: number, unit: string, actionId: string): TrajectoryEvent[] => {
        const decision: TrajectoryEventDraft = {
            goalId: initial.id, runId: initial.state.run.id, phase: "executing", executionUnitId: unit, stepIndex: firstSequence,
            eventType: "decision_received",
            payload: { type: "decision_received", decision: { kind: "tool_call", action: { actionId, toolId: "read_file", input: { path: `${actionId}.ts` } } } },
        };
        const started: TrajectoryEventDraft = {
            goalId: initial.id, runId: initial.state.run.id, phase: "executing", executionUnitId: unit, stepIndex: firstSequence,
            eventType: "tool_started", actionId,
            payload: { type: "tool_started", actionId, toolId: "read_file", input: { path: `${actionId}.ts` } },
        };
        const observed: TrajectoryEventDraft = {
            goalId: initial.id, runId: initial.state.run.id, phase: "executing", executionUnitId: unit, stepIndex: firstSequence,
            eventType: "observation_recorded", actionId,
            payload: { type: "observation_recorded", actionId, observation: { kind: "success", output: "content", summary: "Read file" } },
        };
        return [decision, started, observed].map((draft, offset) => allocateImmutableEvent(draft, firstSequence + offset));
    };

    const adjacent = [...createCall(1, "unit-1", "action-1"), ...createCall(4, "unit-2", "action-2")];
    const adjacentSession = await readBrowserGoalSession(initial.id, new TestGoalStore(initial), async () => ({ committed: adjacent, uncommittedTail: [] }));
    assert.equal(adjacentSession?.runs[0]?.steps[1]?.activityBoundaryBefore, undefined);
    assert.equal(adjacentSession?.runs[0]?.steps[0]?.sourceEventId, adjacent[0]?.eventId);

    const boundary: TrajectoryEventDraft = {
        goalId: initial.id, runId: initial.state.run.id, phase: "executing", executionUnitId: "assistant-unit",
        eventType: "decision_received", payload: { type: "decision_received", decision: { kind: "complete", summary: "A visible reply", completionEvidence: [] } },
    };
    const separated = [...createCall(1, "unit-1", "action-1"), allocateImmutableEvent(boundary, 4), ...createCall(5, "unit-2", "action-2")];
    const separatedSession = await readBrowserGoalSession(initial.id, new TestGoalStore(initial), async () => ({ committed: separated, uncommittedTail: [] }));
    assert.equal(separatedSession?.runs[0]?.steps[1]?.activityBoundaryBefore, true);
});

test("会话保留完整的常规长答复，并标记超出消息上限的正文", async () => {
    const initial = createTestGoal();
    const report = "完整报告。".repeat(901);
    const oversized = "x".repeat(64_001);
    const read = async (content: string) => readBrowserGoalSession(initial.id, new TestGoalStore({
        ...initial,
        state: {
            ...initial.state,
            messages: [{ role: "assistant", assistant: { profileId: "private-profile-id" }, content }],
        },
    }), async () => ({ committed: [], uncommittedTail: [] }));

    const complete = await read(report);
    assert.equal(complete?.messages[0]?.content, report);
    assert.equal(complete?.historyTruncated, false);

    const truncated = await read(oversized);
    assert.equal(truncated?.messages[0]?.content, `${oversized.slice(0, 64_000)}…`);
    assert.equal(truncated?.historyTruncated, true);
});

test("待审批 Action 只投影限长输入预览与内置工具摘要", async () => {
    const initial = createTestGoal();
    const privateContent = "secret-".repeat(100);
    const goal: Goal = {
        ...initial,
        state: {
            ...initial.state,
            run: {
                ...initial.state.run,
                status: "waiting",
                pendingAction: {
                    action: {
                        actionId: "action-preview",
                        toolId: "write_file",
                        input: { path: "src/example.ts", content: privateContent },
                    },
                    status: "awaiting_approval",
                },
            },
        },
    };

    const session = await readBrowserGoalSession(
        goal.id,
        new TestGoalStore(goal),
        async () => ({ committed: [], uncommittedTail: [] }),
    );

    assert.equal(session?.pendingAction?.actionId, "action-preview");
    assert.equal(session?.pendingAction?.targetPath, "src/example.ts");
    assert.equal(session?.pendingAction?.inputSummary, "src/example.ts");
    assert.equal(session?.pendingAction?.inputPreviewTruncated, true);
    assert.ok((session?.pendingAction?.inputPreview.length ?? Number.POSITIVE_INFINITY) <= 321);
    assert.equal(session?.pendingAction?.inputPreview.includes(privateContent), false);
    for (const [toolId, input, expected] of [
        ["bash", { command: "x".repeat(500), privateField: privateContent }, "x".repeat(320) + "…"],
        ["custom_tool", { command: "private command", path: "private path" }, undefined],
    ] as const) {
        const candidate: Goal = { ...goal, state: { ...goal.state, run: { ...goal.state.run, pendingAction: {
            action: { actionId: "summary", toolId, input }, status: "awaiting_approval",
        } } } };
        const projected = await readBrowserGoalSession(candidate.id, new TestGoalStore(candidate), async () => ({ committed: [], uncommittedTail: [] }));
        assert.equal(projected?.pendingAction?.inputSummary, expected);
    }

});

test("会话投影包含沙箱越界能力的审阅信息及真实全网出站明示", async () => {
    const initial = createTestGoal();
    const goal: Goal = {
        ...initial,
        state: {
            ...initial.state,
            run: {
                ...initial.state.run,
                status: "waiting",
                pendingAction: {
                    action: {
                        actionId: "act-sandbox-preview",
                        toolId: "bash",
                        input: { command: "curl https://api.github.com" },
                    },
                    status: "awaiting_approval",
                    approvalKind: "sandbox",
                    effectiveSandboxScope: {
                        extraFiles: [{ canonicalPath: "/etc/hosts", access: "read", kind: "file" }],
                        network: "all_outbound",
                    },
                },
            },
        },
    };

    const session = await readBrowserGoalSession(
        goal.id,
        new TestGoalStore(goal),
        async () => ({ committed: [], uncommittedTail: [] }),
    );

    assert.equal(session?.pendingAction?.approvalKind, "sandbox");
    assert.ok(session?.pendingAction?.sandboxReview);
    assert.equal(session?.pendingAction?.sandboxReview?.network, "all_outbound");
    assert.equal(session?.pendingAction?.sandboxReview?.extraFiles.length, 1);
    assert.equal(session?.pendingAction?.sandboxReview?.extraFiles[0]?.canonicalPath, "/etc/hosts");
    assert.ok(session?.pendingAction?.sandboxReview?.networkNotice?.includes("任意出站目标，含本机回环"));
});

test("会话投影展示已提交纠错尝试与稳定失败原因", async () => {
    const initial = createTestGoal();
    const goal: Goal = {
        ...initial,
        state: {
            ...initial.state,
            run: {
                ...initial.state.run,
                status: "failed",
                stopReason: { kind: "execution_error", code: "MODEL_REQUEST_FAILED", message: "模型阶段重试已耗尽" },
            },
        },
    };
    const committed: TrajectoryEvent[] = [
        allocateImmutableEvent({
            goalId: goal.id, runId: goal.state.run.id, phase: "executing",
            executionUnitId: "repair-unit", stepIndex: 1, eventType: "model_repair_attempt_started",
            payload: { type: "model_repair_attempt_started", stage: "decide", attempt: 1, inputBoundary: `sha256:${"a".repeat(64)}` },
        }, 1),
        allocateImmutableEvent({
            goalId: goal.id, runId: goal.state.run.id, phase: "executing",
            executionUnitId: "repair-unit", stepIndex: 1, eventType: "model_repair_attempt_started",
            payload: { type: "model_repair_attempt_started", stage: "decide", attempt: 2, inputBoundary: `sha256:${"a".repeat(64)}` },
        }, 2),
        allocateImmutableEvent({
            goalId: goal.id, runId: goal.state.run.id, phase: "executing",
            executionUnitId: "repair-unit", stepIndex: 1, eventType: "model_repair_feedback_recorded",
            payload: {
                type: "model_repair_feedback_recorded", stage: "decide", attempt: 2,
                feedback: {
                    goalId: goal.id, runId: goal.state.run.id, executionUnitId: "repair-unit", stepOrdinal: 1,
                    stage: "decide", origin: "response_parse", code: "INVALID_JSON", attempt: 2,
                    issues: [{ code: "syntax", path: [], message: "Return valid JSON" }],
                },
            },
        }, 3),
        allocateImmutableEvent({
            goalId: goal.id, runId: goal.state.run.id, phase: "executing",
            executionUnitId: "repair-unit", stepIndex: 1, eventType: "model_request_retry_recorded",
            payload: { type: "model_request_retry_recorded", stage: "decide", attempt: 1, reason: "rate_limited", status: 429 },
        }, 4),
        allocateImmutableEvent({
            goalId: goal.id, runId: goal.state.run.id, phase: "executing",
            eventType: "run_failed",
            payload: { type: "run_failed", code: "MODEL_REQUEST_FAILED", message: "模型阶段重试已耗尽" },
        }, 5),
    ];
    const session = await readBrowserGoalSession(goal.id, new TestGoalStore(goal), async () => ({
        committed,
        uncommittedTail: [],
    }));

    assert.deepEqual(session?.runs[0]?.terminalDetail, {
        code: "MODEL_REQUEST_FAILED",
        message: "模型阶段重试已耗尽",
    });
    assert.deepEqual(session?.runs[0]?.steps[0]?.recoveryAttempts, [
        "decide output retry 2",
        "decide repair feedback: INVALID_JSON",
        "decide model request attempt 1 failed: rate_limited HTTP 429",
    ]);
    assert.equal(JSON.stringify(session).includes("Return valid JSON"), false);
});

test("Bash 决定与跨 execution unit 的执行合并为一行，complete 决策不重复显示", async () => {
    const goal = createTestGoal();
    const actionId = "bash-action-1";
    const committed: TrajectoryEvent[] = [
        allocateImmutableEvent({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId: "decision-unit",
            eventType: "model_context_frame",
            payload: {
                type: "model_context_frame",
                stage: "decide",
                epochNumber: goal.state.run.contextEpoch.number,
                conversationPosition: 0,
                sections: [],
            },
        }, 1),
        allocateImmutableEvent({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId: "decision-unit",
            stepIndex: 1,
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: {
                    kind: "tool_call",
                    action: { actionId, toolId: "bash", input: { command: "printf ok" } },
                },
            },
        }, 2),
        allocateImmutableEvent({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId: "decision-unit",
            stepIndex: 1,
            actionId,
            eventType: "action_staged",
            payload: {
                type: "action_staged",
                action: { actionId, toolId: "bash", input: { command: "printf ok" } },
                approvalStatus: "approved",
            },
        }, 3),
        allocateImmutableEvent({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId: "tool-unit",
            stepIndex: 1,
            actionId,
            eventType: "tool_started",
            payload: {
                type: "tool_started",
                actionId,
                toolId: "bash",
                input: { command: "printf ok" },
            },
        }, 4),
        allocateImmutableEvent({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId: "tool-unit",
            stepIndex: 1,
            actionId,
            eventType: "observation_recorded",
            payload: {
                type: "observation_recorded",
                actionId,
                observation: {
                    kind: "success",
                    output: { exitCode: 0, stdout: "ok", stderr: "", privateField: "omit" },
                    summary: "命令执行成功",
                },
            },
        }, 5),
        allocateImmutableEvent({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId: "completion-unit",
            stepIndex: 2,
            eventType: "decision_received",
            payload: {
                type: "decision_received",
                decision: { kind: "complete", summary: "done", completionEvidence: [] },
            },
        }, 6),
        allocateImmutableEvent({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId: "completion-unit",
            stepIndex: 2,
            eventType: "run_completed",
            payload: { type: "run_completed", summary: "done" },
        }, 7),
    ];
    const session = await readBrowserGoalSession(
        goal.id,
        new TestGoalStore(goal),
        async () => ({ committed, uncommittedTail: [] }),
    );

    assert.equal(session?.runs[0]?.steps.length, 1);
    assert.deepEqual(session?.runs[0]?.steps[0]?.bashExecution, {
        command: "printf ok",
        exitCode: 0,
        stdout: "ok",
        stderr: "",
    });
    assert.equal(JSON.stringify(session).includes("privateField"), false);
});

test("操作标题只投影有界目标，不暴露正文、额外参数或未提交输入", async () => {
    const goal = createTestGoal();
    const actions = [
        { toolId: "write_file", input: { path: "notes.md", content: "private-content" }, expected: "notes.md" },
        { toolId: "edit_file", input: { path: "src/app.ts", oldString: "private-old", newString: "private-new" }, expected: "src/app.ts" },
        { toolId: "grep", input: { pattern: "TODO", path: "private-root" }, expected: "TODO" },
        { toolId: "web_search", input: { query: "a".repeat(300), apiKey: "private-key" }, expected: `${"a".repeat(240)}…` },
        { toolId: "web_fetch", input: { url: "https://example.com", headers: "private-headers" }, expected: "https://example.com" },
        { toolId: "custom_tool", input: { path: "private-custom" }, expected: undefined },
    ];
    const staged = actions.map(({ toolId, input }, index) => allocateImmutableEvent({
        goalId: goal.id, runId: goal.state.run.id, phase: "executing",
        executionUnitId: `unit-${index}`, stepIndex: index + 1, eventType: "action_staged",
        payload: {
            type: "action_staged",
            action: { actionId: `action-${index}`, toolId, input },
            approvalStatus: "approved",
        },
    }, index + 1));
    const session = await readBrowserGoalSession(goal.id, new TestGoalStore(goal), async () => ({
        committed: staged, uncommittedTail: [event(5, "action_staged")],
    }));
    assert.deepEqual(session?.runs[0]?.steps.map((step) => step.inputSummary), actions.map((action) => action.expected));
    assert.equal(JSON.stringify(session).includes("private-"), false);
});

test("未创建 GoalPlan 时省略计划；不存在 Goal 返回 undefined，损坏读取拒绝", async () => {
    const goal = createTestGoal();
    const store = new TestGoalStore(goal);
    const session = await readBrowserGoalSession(goal.id, store, async () => ({ committed: [], uncommittedTail: [] }));
    assert.ok(session);
    assert.equal(Object.hasOwn(session, "goalPlan"), false);
    assert.deepEqual(session.runs[0]?.steps, []);
    assert.equal(await readBrowserGoalSession("missing", store, async () => ({ committed: [], uncommittedTail: [] })), undefined);
    await assert.rejects(readBrowserGoalSession(goal.id, store, async () => {
        throw new Error("corrupt trajectory details");
    }), /corrupt trajectory details/);
});

test("会话投影保留已归档失败 Run 的状态", async () => {
    const initial = createTestGoal();
    const goal: Goal = {
        ...initial,
        state: {
            ...initial.state,
            completedRuns: [{
                runId: "run-failed",
                status: "failed",
                stepCount: 1,
                committedThroughSequence: 3,
                messageRange: { start: 0, end: 1 },
            }],
        },
    };
    const session = await readBrowserGoalSession(goal.id, new TestGoalStore(goal), async () => ({
        committed: [], uncommittedTail: [],
    }));
    assert.equal(session?.runs[0]?.runId, "run-failed");
    assert.equal(session?.runs[0]?.status, "failed");
});

test("读取 API 区分缺失与读取失败且不泄漏底层错误", async () => {
    const port = {
        async list(): Promise<readonly BrowserGoalListItem[]> {
            throw new Error("private filesystem path");
        },
        async read(goalId: string) {
            if (goalId === "broken") throw new Error("corrupt snapshot internals");
            return undefined;
        },
        async create() {
            return { ok: false as const, error: "goal_create_failed" as const };
        },
        async interact() {
            return { ok: false as const, error: "interaction_failed" as const };
        },
        async message() {
            return { ok: false as const, error: "message_failed" as const };
        },
        async enterPlanMode() {
            return { ok: false as const, error: "plan_mode_failed" as const };
        },
        async models() {
            return { ok: false as const, error: "model_catalog_unavailable" as const };
        },
        setModelPreference: async () => ({ ok: false as const, error: "model_catalog_unavailable" as const }),
        async selectModel() { return { ok: false as const, error: "model_selection_failed" as const }; },
        async openStream() {
            return { ok: false as const, error: "goal_not_found" as const };
        },
    };
    const routes = createBrowserGoalRoutes(port);

    const missing = await routes.request("http://localhost/api/goals/missing");
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "goal_not_found" });

    const broken = await routes.request("http://localhost/api/goals/broken");
    assert.equal(broken.status, 500);
    assert.deepEqual(await broken.json(), { error: "goal_read_failed" });

    const listFailure = await routes.request("http://localhost/api/goals");
    assert.equal(listFailure.status, 500);
    assert.deepEqual(await listFailure.json(), { error: "goal_list_unavailable" });
});

test("创建与 Plan Mode 路由拒绝非法 wire 输入并要求稳定身份", async () => {
    const calls: BrowserCreateSessionCommand[] = [];
    const planModes: Array<{ goalId: string; runId: string }> = [];
    const routes = createBrowserGoalRoutes({
        async list() { return []; },
        async read() { return undefined; },
        async enterPlanMode(goalId, command) {
            planModes.push({ goalId, runId: command.runId });
            return { ok: true as const, goalId, runId: command.runId, existing: false };
        },
        async models() {
            return { ok: false as const, error: "model_catalog_unavailable" as const };
        },
        setModelPreference: async () => ({ ok: false as const, error: "model_catalog_unavailable" as const }),
        async selectModel() { return { ok: false as const, error: "model_selection_failed" as const }; },
        session: {
            async create(command) {
                calls.push(command);
                return {
                    ok: true as const,
                    existing: false,
                    goalId: command.goalId,
                    runId: "run-created-1",
                    receipt: {
                        goalId: command.goalId, inputId: command.inputId, kind: "message" as const,
                        sequence: 1, status: "applied" as const, admittedAtRevision: 1,
                    },
                };
            },
            async submit() { return { ok: false as const, error: "session_unavailable" as const }; },
            async readInput() { return { ok: true as const, found: false as const }; },
            async readState() { return undefined; },
            async openEvents() { return { ok: false as const, error: "goal_not_found" as const }; },
        },
    });
    const send = (body: string) => routes.request("http://localhost/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
    });

    const extraField = await send(JSON.stringify({ goalId: "goal-create-1", inputId: "input-1", intent: "检查", profileId: "admin" }));
    assert.equal(extraField.status, 400);
    assert.deepEqual(await extraField.json(), { error: "invalid_goal_input" });
    const emptyIntent = await send(JSON.stringify({ goalId: "goal-create-1", inputId: "input-1", intent: "  " }));
    assert.equal(emptyIntent.status, 400);
    const missingInputId = await send(JSON.stringify({ goalId: "goal-create-1", intent: "检查" }));
    assert.equal(missingInputId.status, 400);
    const invalidId = await send(JSON.stringify({ goalId: "goal with spaces", inputId: "input-1", intent: "检查" }));
    assert.equal(invalidId.status, 400);
    const malformed = await send("{invalid json");
    assert.equal(malformed.status, 400);
    assert.equal(calls.length, 0);

    const accepted = await send(JSON.stringify({ goalId: "goal-create-1", inputId: "input-1", intent: "检查当前项目" }));
    assert.equal(accepted.status, 202);
    assert.deepEqual(await accepted.json(), {
        ok: true,
        existing: false,
        goalId: "goal-create-1",
        runId: "run-created-1",
        receipt: {
            goalId: "goal-create-1", inputId: "input-1", kind: "message",
            sequence: 1, status: "applied", admittedAtRevision: 1,
        },
    });
    assert.deepEqual(calls, [{ goalId: "goal-create-1", inputId: "input-1", intent: "检查当前项目" }]);

    const acceptedPlan = await send(JSON.stringify({ goalId: "goal-create-2", inputId: "input-2", intent: "显式计划", mode: "plan" }));
    assert.equal(acceptedPlan.status, 202);
    assert.deepEqual(calls[1], { goalId: "goal-create-2", inputId: "input-2", intent: "显式计划", mode: "plan" });
    const unsupportedMode = await send(JSON.stringify({ goalId: "goal-create-3", inputId: "input-3", intent: "普通模式", mode: "normal" }));
    assert.equal(unsupportedMode.status, 400);
    assert.equal(calls.length, 2);

    const selectedPlan = await routes.request("http://localhost/api/goals/goal-create-2/plan-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: "run-current" }),
    });
    assert.equal(selectedPlan.status, 202);
    assert.deepEqual(planModes, [{ goalId: "goal-create-2", runId: "run-current" }]);
    const invalidPlanCommand = await routes.request("http://localhost/api/goals/goal-create-2/plan-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: "run-current", intent: "unexpected" }),
    });
    assert.equal(invalidPlanCommand.status, 400);
    assert.equal(planModes.length, 1);

    const unsupportedMedia = await routes.request("http://localhost/api/goals", {
        method: "POST",
        body: JSON.stringify({ goalId: "goal-create-3", inputId: "input-3", intent: "检查" }),
    });
    assert.equal(unsupportedMedia.status, 415);
    const tooLarge = await send(JSON.stringify({ goalId: "goal-create-2", inputId: "input-2", intent: "x".repeat(20_000) }));
    assert.equal(tooLarge.status, 413);
    assert.equal(calls.length, 2);
});

test("readBrowserGoalSession 正确投影阶段分组与 Step 的 stageId 归属", async () => {
    const goal = createTestGoal();
    const runId = goal.state.run.id;
    const events: TrajectoryEvent[] = [];
    const add = (payload: any, unit = "unit-1") => {
        const event = allocateImmutableEvent({
            goalId: goal.id,
            runId,
            phase: "executing",
            executionUnitId: unit,
            eventType: payload.type,
            payload,
        } as any, events.length + 1);
        events.push(event);
        return event;
    };

    // 1. Run 级控制活动（无阶段）
    add({ type: "decision_received", decision: { kind: "tool_call", action: { actionId: "init-action", toolId: "read_file", input: {} } } }, "unit-0");
    add({ type: "action_staged", action: { actionId: "init-action", toolId: "read_file", input: {} }, approvalStatus: "approved" }, "unit-0");
    add({ type: "observation_recorded", actionId: "init-action", observation: { kind: "success", output: "init", summary: "Initial read" } }, "unit-0");

    // 2. 阶段 1 开始
    add({
        type: "run_stage_declared",
        stageId: "stage-alpha",
        revision: 1,
        target: "目标 Alpha",
        acceptanceCriteria: ["测试通过"],
    }, "unit-1");

    // 属于阶段 1 的 Step
    add({ type: "decision_received", decision: { kind: "tool_call", action: { actionId: "a1", toolId: "edit_file", input: {} } } }, "unit-1");
    add({ type: "action_staged", action: { actionId: "a1", toolId: "edit_file", input: {} }, approvalStatus: "approved" }, "unit-1");
    add({ type: "observation_recorded", actionId: "a1", observation: { kind: "success", output: "done", summary: "Edit file" } }, "unit-1");

    // 阶段 1 接受
    add({
        type: "run_stage_accepted",
        stageId: "stage-alpha",
        revision: 1,
        summary: "Alpha 产物已完成",
        evidenceSequences: [3],
    }, "unit-2");

    // 3. 阶段 2 开始并修订
    add({
        type: "run_stage_declared",
        stageId: "stage-beta",
        revision: 1,
        target: "目标 Beta 初始",
        acceptanceCriteria: ["验证"],
    }, "unit-3");

    add({
        type: "run_stage_declared",
        stageId: "stage-beta",
        revision: 2,
        target: "目标 Beta 修订",
        acceptanceCriteria: ["严格验证"],
        reason: "发现新增约束",
    }, "unit-3");

    // 阶段 2 拒绝
    add({
        type: "run_stage_rejected",
        stageId: "stage-beta",
        revision: 2,
        feedback: "未满足要求",
    }, "unit-4");

    const session = await readBrowserGoalSession(
        goal.id,
        { async restore() { return goal; } },
        async () => ({ committed: events, uncommittedTail: [] }),
    );

    assert.ok(session);
    assert.equal(session.runs.length, 1);
    const run = session.runs[0]!;
    assert.ok(run.stages);
    assert.equal(run.stages.length, 2);

    // Run 级 step
    assert.equal(run.steps[0]?.stageId, undefined);
    assert.equal(run.steps[0]?.summary, "Initial read");

    // Stage 1
    const s1 = run.stages[0]!;
    assert.equal(s1.stageId, "stage-alpha");
    assert.equal(s1.status, "accepted");
    assert.equal(s1.resultSummary, "Alpha 产物已完成");
    assert.equal(s1.steps.length, 1);
    assert.equal(s1.steps[0]?.stageId, "stage-alpha");

    // Stage 2
    const s2 = run.stages[1]!;
    assert.equal(s2.stageId, "stage-beta");
    assert.equal(s2.revision, 2);
    assert.equal(s2.target, "目标 Beta 修订");
    assert.equal(s2.status, "in_progress");
    assert.ok(s2.latestReviewRejection);
    assert.equal(s2.latestReviewRejection?.issues[0], "未满足要求");
    assert.equal(s2.revisions?.length, 2);
});
