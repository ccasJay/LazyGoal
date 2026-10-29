import assert from "node:assert/strict";
import test from "node:test";
import {
    isAcceptedCommand,
    isActionDetailsResult,
    isBrowserActionReviewResult,
    isBrowserCreateSessionResult,
    isBrowserSessionInputQueryResult,
    isBrowserSessionInputReceipt,
    isBrowserSessionInputResult,
    isBrowserSessionState,
    isBrowserGoalSession,
    isBrowserGoalSessionState,
    isBrowserActivityPage,
    isBrowserInteractionDetailResult,
    isBrowserInteractionView,
    isBrowserRun,
    isGoalList,
    isGoalListItem,
    isGoalPlan,
    isGoalSessionEnvelope,
    isJsonValue,
    isLiveEvent,
    isMetricValues,
    isMetricsSnapshot,
    isModelCatalog,
    isModelInputDetail,
    isModelInputs,
    isModelPreferenceAccepted,
    isModelSelectionAccepted,
    isProviderProfile,
    isProviderSettings,
    isProviderProfileWriteResult,
    isProviderProfileDeleteResult,
    isProviderProfileActivationResult,
    isProviderProfileTestResult,
    isOkResponse,
    isPendingAction,
    isPermissionModeResult,
    isRunStatus,
    isToolGrantResult,
    isTrajectoryDetail,
    isTrajectoryEntry,
    isTrajectoryPage,
    isTrajectoryRun,
    isTrajectoryRuns,
    isWorkspaceContext,
    type BrowserGoalListItem,
    type BrowserGoalSession,
    type BrowserGoalSessionState,
    type BrowserActivityPage,
    type SessionMetricsSnapshot,
} from "../src/index";
import { safeParse } from "../../contracts/src/index";
import { browserGoalSessionContract } from "../src/contracts/session";

test("isRunStatus classifies valid and invalid run statuses", () => {
    assert.equal(isRunStatus("created"), true);
    assert.equal(isRunStatus("running"), true);
    assert.equal(isRunStatus("waiting"), true);
    assert.equal(isRunStatus("completed"), true);
    assert.equal(isRunStatus("failed"), true);
    assert.equal(isRunStatus("cancelled"), true);
    assert.equal(isRunStatus("unknown"), false);
    assert.equal(isRunStatus(123), false);
    assert.equal(isRunStatus(null), false);
});

test("isGoalListItem and isGoalList validate list items", () => {
    const validItem: BrowserGoalListItem = {
        goalId: "goal-1",
        runId: "run-1",
        intent: "Test intent",
        workflowPhase: "executing",
        runStatus: "running",
        updatedAt: "2026-10-18T00:00:00.000Z",
        archived: false,
    };
    assert.equal(isGoalListItem(validItem), true);
    assert.equal(isGoalList({ goals: [validItem], unreadableCount: 0 }), true);
    assert.equal(isGoalList({ goals: [validItem], unreadableCount: 3 }), true);

    assert.equal(isGoalListItem({ ...validItem, execution: { state: "recoverable", committedThroughSequence: 10 } }), true);
    assert.equal(isGoalListItem({ ...validItem, execution: { state: "unknown", committedThroughSequence: 10 } }), false);
    assert.equal(isGoalListItem({ ...validItem, goalId: "" }), false);
    assert.equal(isGoalListItem({ ...validItem, runStatus: "invalid" }), false);
    assert.equal(isGoalListItem({ ...validItem, archived: "no" }), false);
    assert.equal(isGoalList({ goals: [{ ...validItem, goalId: "" }], unreadableCount: 0 }), false);
    assert.equal(isGoalList({ goals: [validItem] }), false);
    assert.equal(isGoalList({ goals: [validItem], unreadableCount: -1 }), false);
    assert.equal(isGoalList({ goals: [validItem], unreadableCount: 1.5 }), false);
    assert.equal(isGoalList({}), false);
});

test("isBrowserGoalSession validates complete and malformed sessions", () => {
    const validSession: BrowserGoalSession = {
        goalId: "goal-1",
        intent: "Test goal",
        currentRunId: "run-1",
        runStatus: "waiting",
        currentRunMode: "normal",
        messages: [{
            messageId: "msg-1", role: "user", content: "hello", runId: "run-1",
            position: { afterSequence: 0, order: 0 },
        }],
        runs: [
            {
                runId: "run-1",
                status: "waiting",
                stepCount: 1,
                steps: [
                    {
                        runId: "run-1",
                        executionUnitId: "u-1",
                        sequence: 1,
                        stepIndex: 1,
                        status: "completed",
                        summary: "done",
                    },
                ],
                current: true,
            },
        ],
        historyTruncated: false,
    };
    assert.equal(isBrowserGoalSession(validSession), true);
    assert.equal(isBrowserGoalSession({ ...validSession, execution: { state: "active", committedThroughSequence: 5 } }), true);
    assert.equal(isBrowserGoalSession({ ...validSession, execution: { state: "bad", committedThroughSequence: 5 } }), false);
    assert.equal(isGoalSessionEnvelope({ goal: validSession }), true);
    const withThink = (think: unknown) => ({ ...validSession, runs: [{ ...validSession.runs[0],
        steps: [{ ...validSession.runs[0]!.steps[0], think }],
    }] });
    assert.equal(isBrowserGoalSession(withThink({ goal: "Compare paths" })), true);
    assert.equal(isBrowserGoalSession(withThink({ goal: "Compare paths", output: "Use the saved checkpoint", truncated: true })), true);
    for (const think of [null, { goal: 1 }, { goal: "Compare", output: {} }, { goal: "Compare", truncated: "yes" }]) {
        assert.equal(isBrowserGoalSession(withThink(think)), false);
    }

    assert.equal(isBrowserGoalSession({ ...validSession, currentRunMode: "other" }), false);
    assert.equal(isBrowserGoalSession({
        ...validSession,
        messages: [{ ...validSession.messages[0]!, position: { afterSequence: -1, order: 0 } }],
    }), false);
    assert.equal(isBrowserGoalSession({ ...validSession, runs: "not-array" }), false);
    assert.equal(isGoalSessionEnvelope({ goal: null }), false);
});

test("Activity 与窄状态 wire guards 接受有界安全 DTO 并拒绝原始载荷或内嵌历史", () => {
    const position = { runId: "run-1", runOrder: 0, sequence: 2, itemKind: "message" as const, order: 0 };
    const page: BrowserActivityPage = {
        goalId: "goal-1",
        limit: 1,
        items: [{
            type: "message", itemId: "message:msg-1", messageId: "msg-1", role: "assistant", purpose: "answer", runId: "run-1",
            position, content: "saved", contentLength: 5, truncated: false,
        }],
        runs: [{ runId: "run-1", status: "running", current: true, runOrder: 0, committedThroughSequence: 2 }],
        window: [{ runId: "run-1", messageCount: 1, throughMessageId: "msg-1", committedThroughSequence: 2 }],
        gaps: [{ direction: "older", itemCount: 3, first: position, last: position }],
        range: { first: position, last: position, olderAvailable: true, newerAvailable: false },
        stages: [],
        actionGroups: [],
    };
    assert.equal(isBrowserActivityPage(page), true);
    const stageContext = { runId: "run-1", stageId: "stage-1", revision: 1, status: "accepted",
        firstSequence: 1, lastSequence: 2, completeWithinPage: false };
    assert.equal(isBrowserActivityPage({ ...page, stages: [{ ...stageContext, target: "x".repeat(1_000) }] }), true);
    for (const target of [42, "x".repeat(1_001)]) {
        assert.equal(isBrowserActivityPage({ ...page, stages: [{ ...stageContext, target }] }), false);
    }

    assert.equal(isBrowserActivityPage({
        ...page,
        items: [{ ...page.items[0]!, previewId: "candidate-1" }],
    }), true);
    assert.equal(isBrowserActivityPage({
        ...page,
        items: [{ ...page.items[0]!, purpose: "process", previewId: "candidate-1" }],
    }), false);
    assert.equal(isBrowserActivityPage({
        ...page,
        items: [{ ...page.items[0]!, role: "user", purpose: undefined, previewId: "candidate-1" }],
    }), false);
    assert.equal(isBrowserActivityPage({
        ...page,
        items: [{ ...page.items[0]!, previewId: "x".repeat(201) }],
    }), false);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...page.items[0], payload: { secret: "raw" } }] }), false);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...page.items[0], content: "x".repeat(4_001), contentLength: 4_001 }] }), false);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...page.items[0], purpose: undefined }] }), false);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...page.items[0], role: "user", purpose: "answer" }] }), false);
    assert.equal(isBrowserActivityPage({ ...page, limit: 101 }), false);
    assert.equal(isBrowserActivityPage({ ...page, gaps: [{ direction: "older", itemCount: 0, first: position, last: position }] }), false);
    assert.equal(isBrowserActivityPage({ ...page, gaps: [{ direction: "sideways", itemCount: 1, first: position, last: position }] }), false);
    const { gaps: _gaps, ...missingGaps } = page;
    assert.equal(isBrowserActivityPage(missingGaps), false);

    const stageFact = {
        type: "fact" as const,
        itemId: "event:stage-declared",
        eventId: "stage-declared",
        runId: "run-1",
        position: { ...position, itemKind: "fact" as const },
        eventType: "run_stage_declared" as const,
        title: "Stage declared",
        stageId: "stage-1",
        stageRevision: 1,
        stageTarget: "Summarize verified findings",
    };
    assert.equal(isBrowserActivityPage({ ...page, items: [stageFact] }), true);
    const { stageTarget: _stageTarget, ...missingStageTarget } = stageFact;
    assert.equal(isBrowserActivityPage({ ...page, items: [missingStageTarget] }), false);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...stageFact, eventType: "tool_started" }] }), false);

    const lookupFact = {
        type: "fact" as const, itemId: "event:lookup-1", eventId: "lookup-1", runId: "run-1",
        position: { ...position, itemKind: "fact" as const }, eventType: "context_lookup_requested" as const,
        title: "Looking up history", lookupId: "lookup-1", lookupRequest: "History search, Historical execution",
    };
    assert.equal(isBrowserActivityPage({ ...page, items: [lookupFact] }), true);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...lookupFact, lookupId: "" }] }), false);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...lookupFact, lookupRequest: "x".repeat(201) }] }), false);
    const { lookupRequest: _lookupRequest, ...lookupWithoutRequest } = lookupFact;
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...lookupWithoutRequest, eventType: "context_lookup_failed" }] }), true);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...lookupWithoutRequest, eventType: "context_lookup_failed",
        lookupErrorCode: "PRIVATE_CODE" }] }), false);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...lookupFact, eventType: "tool_started" }] }), false);

    const lifecycleFact = {
        type: "fact" as const,
        itemId: "event:tool-lifecycle",
        eventId: "tool-lifecycle",
        runId: "run-1",
        position: { ...position, itemKind: "fact" as const },
        eventType: "action_staged" as const,
        title: "Waiting for permission",
        actionId: "action-1",
        tool: {
            toolId: "bash",
            status: "recorded" as const,
            actionStatus: "awaiting_approval" as const,
            lifecycle: [{ kind: "approval" as const, title: "Permission requested", detail: "Execution is paused until permission is granted." }],
        },
    };
    assert.equal(isBrowserActivityPage({ ...page, items: [lifecycleFact] }), true);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...lifecycleFact,
        tool: { ...lifecycleFact.tool, lifecycle: [{ kind: "approval", title: "Permission requested", raw: "PRIVATE" }] },
    }] }), false);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...lifecycleFact,
        tool: { ...lifecycleFact.tool, lifecycle: [{ kind: "other", title: "Permission requested" }] },
    }] }), false);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...lifecycleFact,
        tool: { ...lifecycleFact.tool, lifecycle: "PRIVATE" },
    }] }), false);

    const thinkItem = {
        type: "think" as const,
        itemId: "think:event-1",
        runId: "run-1",
        position: { ...position, itemKind: "fact" as const },
        executionUnitId: "unit-think",
        think: { goal: "Compare evidence", output: "Committed analysis" },
    };
    assert.equal(isBrowserActivityPage({ ...page, items: [thinkItem] }), true);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...thinkItem, executionUnitId: "" }] }), false);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...thinkItem, executionUnitId: "x".repeat(201) }] }), false);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...thinkItem, payload: { secret: "raw" } }] }), false);
    // 未知字段必须被拒绝：白名单守卫在 Think 项上曾经反向取值，导致合法项被误拒。
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...thinkItem, reviewNotes: "private" }] }), false);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...thinkItem, think: { ...thinkItem.think, privateReasoning: "x" } }] }), false);

    const state: BrowserGoalSessionState = {
        goalId: "goal-1", intent: "inspect", currentRunId: "run-1", runStatus: "running",
        currentRunMode: "normal", currentRunStepCount: 1,
        history: {
            messages: { included: false, source: "activity" },
            steps: { included: false, source: "activity" },
            stages: { included: false, source: "activity" },
        },
    };
    assert.equal(isBrowserGoalSessionState(state), true);
    const failure = { ...state, runStatus: "failed", currentRunTerminalDetail: { code: "MODEL_REQUEST_FAILED", message: "Provider rejected the request" } };
    assert.equal(isBrowserGoalSessionState(failure), true);
    assert.equal(isBrowserGoalSessionState({ ...failure, runStatus: "running" }), false);
    assert.equal(isBrowserGoalSessionState({ ...failure, currentRunTerminalDetail: { message: 403 } }), false);
    assert.equal(isBrowserGoalSessionState({ ...failure, currentRunTerminalDetail: { ...failure.currentRunTerminalDetail, rawResponse: "private" } }), false);
    assert.equal(isBrowserGoalSessionState({ ...state, messages: [] }), false);
    assert.equal(isBrowserGoalSessionState({ ...state, history: { ...state.history, messages: { included: true, source: "activity" } } }), false);
});


test("isBrowserInteractionView validates identity, decisions and truncation flags", () => {
    const question = {
        goalId: "goal-1",
        runId: "run-1",
        kind: "question",
        interactionId: "question:ask-1",
        requestId: "ask-1",
        decisions: ["answer_questions", "reply_to_question", "skip_question"],
        truncated: false,
    };
    assert.equal(isBrowserInteractionView(question), true);
    assert.equal(isBrowserInteractionView({ ...question, truncated: "no" }), false);
    assert.equal(isBrowserInteractionView({ ...question, interactionId: "" }), false);
    assert.equal(isBrowserInteractionView({ ...question, decisions: [] }), false);
    assert.equal(isBrowserInteractionView({ ...question, decisions: ["approve_task"] }), false);
    assert.equal(isBrowserInteractionView({ ...question, actionId: "act-1" }), false);

    const recovery = {
        goalId: "goal-1",
        runId: "run-1",
        kind: "action_recovery",
        interactionId: "action_recovery:act-1",
        actionId: "act-1",
        recoveryRef: "recovery:0123456789abcdef",
        decisions: ["retry_unknown_action", "decline_unknown_action_retry"],
        truncated: true,
    };
    assert.equal(isBrowserInteractionView(recovery), true);
    assert.equal(isBrowserInteractionView({ ...recovery, kind: "action_approval", decisions: ["approve_action", "approve_action_revision", "reject_action"] }), true);
    assert.equal(isBrowserInteractionView({ ...recovery, decisions: ["approve_action"] }), false);
    assert.equal(isBrowserInteractionView({ ...recovery, kind: "other" }), false);

    const session = {
        goalId: "goal-1", intent: "Test goal", currentRunId: "run-1", runStatus: "waiting" as const,
        currentRunMode: "normal" as const, messages: [], runs: [], historyTruncated: false,
    };
    assert.equal(isBrowserGoalSession({ ...session, interaction: question }), true);
    assert.equal(isBrowserGoalSession({ ...session, interaction: recovery }), true);
    assert.equal(isBrowserGoalSession({ ...session, interaction: { ...question, decisions: ["unknown"] } }), false);
});

test("isBrowserInteractionDetailResult validates full review content results", () => {
    assert.equal(isBrowserInteractionDetailResult({
        ok: true,
        goalId: "goal-1",
        runId: "run-1",
        interactionId: "question:ask-1",
        detail: {
            kind: "question",
            mode: "plan",
            questions: [{
                id: "q-1", header: "Scope", question: "Which scope?", multiSelect: false,
                options: [{ id: "o-1", label: "All" }],
            }],
            routeRevision: {
                baseRevision: 1, reason: "Scope grew", approvalRequest: "Approve expansion?",
                approvalOptionId: "o-1", stages: [{ target: "Extend", acceptanceCriteria: ["Report complete"] }],
            },
        },
    }), true);
    assert.equal(isBrowserInteractionDetailResult({
        ok: true,
        goalId: "goal-1",
        runId: "run-1",
        interactionId: "action_approval:act-1",
        detail: { kind: "action_approval", actionId: "act-1", toolId: "bash", input: { command: "ls" }, approvalKind: "tool" },
    }), true);
    assert.equal(isBrowserInteractionDetailResult({
        ok: true,
        goalId: "goal-1",
        runId: "run-1",
        interactionId: "task_approval:proposal-1",
        detail: { kind: "task_approval", objective: "Ship it", approvalRequest: "Confirm", completionCriteria: ["Checks pass"], stages: [] },
    }), true);
    assert.equal(isBrowserInteractionDetailResult({ ok: false, error: "stale_run" }), true);
    assert.equal(isBrowserInteractionDetailResult({ ok: false, error: "action_not_waiting" }), false);
    assert.equal(isBrowserInteractionDetailResult({
        ok: true, goalId: "goal-1", runId: "run-1", interactionId: "question:ask-1",
        detail: { kind: "question", mode: "other", questions: [] },
    }), false);
    assert.equal(isBrowserInteractionDetailResult({
        ok: true, goalId: "goal-1", runId: "run-1", interactionId: "action_approval:act-1",
        detail: { kind: "action_approval", actionId: "act-1", toolId: "bash", input: undefined },
    }), false);
});

test("isBrowserRun validates complete Plan Run route states", () => {
    const route = {
        revision: 2,
        revisionReason: "Evidence confirmed another verification gate",
        nextStageIndex: 1,
        stages: [
            { stageId: "stage-1", revision: 1, status: "accepted", target: "Inspect", acceptanceCriteria: ["Entry found"], acceptedSequence: 12 },
            { stageId: "stage-2", revision: 2, status: "executing", target: "Implement", acceptanceCriteria: ["Checks pass"] },
        ],
    };
    assert.equal(isBrowserRun({ runId: "run-1", status: "running", stepCount: 2, steps: [], current: true, planRoute: route }), true);
    assert.equal(isBrowserRun({ runId: "run-1", status: "running", stepCount: 2, steps: [], current: true, planRoute: { ...route, nextStageIndex: 8 } }), false);
    assert.equal(isBrowserRun({ runId: "run-1", status: "running", stepCount: 2, steps: [], current: true, planRoute: { ...route, stages: [{ ...route.stages[0], status: "pending" }, route.stages[1]] } }), false);
});

test("model progress only accepts known public stages and real timestamps", () => {
    const event = { type: "activity", goalId: "goal-1", runId: "run-1", activity: {
        kind: "model_started", stage: "completion_review", modelCallId: "call-1", executionUnitId: "unit-1", occurredAt: "2026-10-22T00:00:00.000Z",
    } };
    assert.equal(isLiveEvent(event), true);
    assert.equal(isLiveEvent({ ...event, activity: { ...event.activity, stage: "hidden_reasoning" } }), false);
    assert.equal(isLiveEvent({ ...event, activity: { ...event.activity, occurredAt: "not-a-date" } }), false);
    assert.equal(isLiveEvent({ ...event, activity: { ...event.activity, modelCallId: "x".repeat(201) } }), false);
});

test("isLiveEvent validates activity identities without conflating trajectory IDs", () => {
    const activity = {
        type: "activity",
        goalId: "goal-1",
        runId: "run-1",
        activity: {
            kind: "tool_started",
            sourceEventId: "event-1",
            sourceCursor: 1,
            actionId: "action-1",
            executionUnitId: "unit-1",
            toolId: "read_file",
            inputSummary: "src/index.ts",
        },
    };
    assert.equal(isLiveEvent(activity), true);
    assert.equal(isLiveEvent({ ...activity, activity: { ...activity.activity, sourceCursor: 0 } }), false);
    assert.equal(isLiveEvent({ ...activity, activity: { ...activity.activity, actionId: "" } }), false);
    assert.equal(isLiveEvent({ ...activity, activity: { ...activity.activity, inputSummary: "x".repeat(241) } }), false);
    assert.equal(isLiveEvent({
        type: "activity", goalId: "goal-1", runId: "run-1",
        activity: { kind: "activity_boundary", sourceEventId: "event-2", sourceCursor: 2, reason: "private_reasoning" },
    }), false);
});

test("message committed live events require a valid persisted Run position", () => {
    const event = {
        type: "message_committed",
        goalId: "goal-1",
        runId: "run-1",
        message: {
            messageId: "msg-1",
            role: "assistant",
            runId: "run-1",
            position: { afterSequence: 8, order: 0 },
            purpose: "answer",
            commitRevision: 3,
        },
    };
    assert.equal(isLiveEvent(event), true);
    assert.equal(isLiveEvent({
        ...event,
        message: { ...event.message, position: { afterSequence: 8, order: -1 } },
    }), false);
});

test("isBrowserInteractionDetailResult validates complete review content", () => {
    assert.equal(isBrowserInteractionDetailResult({
        ok: true,
        goalId: "goal-1",
        runId: "run-1",
        interactionId: "task_approval:proposal-1",
        detail: {
            kind: "task_approval",
            objective: "Do task",
            approvalRequest: "Approve?",
            completionCriteria: ["Criterion 1"],
            stages: [{ target: "Complete the proposed task", acceptanceCriteria: ["The task outcome is verified"] }],
        },
    }), true);
    assert.equal(isBrowserInteractionDetailResult({
        ok: true,
        goalId: "goal-1",
        runId: "run-1",
        interactionId: "question:ask-1",
        detail: {
            kind: "question",
            mode: "execution",
            routeRevision: {
                baseRevision: 2,
                approvalRequest: "Approve the added outcome?",
                reason: "New evidence adds a deliverable outside the approved scope",
                approvalOptionId: "opt-approve",
                stages: [{ target: "Write a report", acceptanceCriteria: ["The report is reviewed"] }],
            },
            questions: [
                {
                    id: "q-1",
                    header: "Header",
                    question: "Question?",
                    multiSelect: false,
                    options: [{ id: "opt-1", label: "Option 1" }],
                },
            ],
        },
    }), true);
    assert.equal(isBrowserInteractionDetailResult({
        ok: true,
        goalId: "goal-1",
        runId: "run-1",
        interactionId: "action_approval:act-1",
        detail: {
            kind: "action_approval",
            actionId: "act-1",
            toolId: "write_file",
            approvalKind: "sandbox",
            input: { path: "src/file.ts" },
            parentProgram: { actionId: "act-0", callNumber: 2 },
        },
    }), true);
    assert.equal(isBrowserInteractionDetailResult({ ok: false, error: "stale_run" }), true);
    assert.equal(isBrowserInteractionDetailResult({ ok: false, error: "unknown_error" }), false);
    // 结构守卫只检查形状：空问卷仍按结构接受，业务最小数量由模型契约负责。
    assert.equal(isBrowserInteractionDetailResult({
        ok: true,
        goalId: "goal-1",
        runId: "run-1",
        interactionId: "question:ask-1",
        detail: { kind: "question", mode: "execution", questions: [] },
    }), true);
    assert.equal(isBrowserInteractionDetailResult({
        ok: true,
        goalId: "goal-1",
        runId: "run-1",
        interactionId: "question:ask-1",
        detail: { kind: "question", mode: "other", questions: [] },
    }), false);
    assert.equal(isBrowserInteractionDetailResult({
        ok: true,
        goalId: "goal-1",
        runId: "run-1",
        interactionId: "action_recovery:act-1",
        detail: { kind: "action_recovery", actionId: "act-1", toolId: "bash", input: {} },
    }), true);
});

test("isMetricsSnapshot validates metrics", () => {
    const validMetrics: SessionMetricsSnapshot = {
        goalId: "goal-1",
        roundCount: 1,
        stepCount: 2,
        reportedCalls: 1,
        missingCalls: 0,
        inputTokens: 100,
        outputTokens: 50,
        coverage: "complete",
        cacheMeasuredCalls: 1,
        cacheExcludedCalls: 0,
        cacheHitRate: 0.5,
        throughputMeasuredCalls: 1,
        throughputExcludedCalls: 0,
        tokensPerSecond: 25,
        runs: [],
    };
    assert.equal(isMetricsSnapshot(validMetrics), true);
    assert.equal(isMetricValues(validMetrics as unknown as Record<string, unknown>), true);
    assert.equal(isMetricsSnapshot({ ...validMetrics, cacheHitRate: 1.5 }), false);
});

test("isModelCatalog validates catalog schema", () => {
    assert.equal(
        isModelCatalog({
            provider: "openai",
            currentModelId: "gpt-4o",
            models: [
                {
                    id: "gpt-4o",
                    displayName: "GPT-4o",
                    availabilitySource: "live",
                    metadataSource: "catalog",
                    selectable: true,
                },
            ],
        }),
        true,
    );
    assert.equal(isModelCatalog({ provider: "" }), false);
});

test("isTrajectoryPage and isTrajectoryDetail validate trajectory wire DTOs", () => {
    const validRun = {
        runId: "run-1",
        status: "completed" as const,
        current: true,
        committedThroughSequence: 1,
    };
    assert.equal(isTrajectoryRun(validRun), true);
    assert.equal(isTrajectoryRuns({ runs: [validRun], nextOffset: null }), true);

    const validEntry = {
        eventId: "e-1",
        sequence: 1,
        occurredAt: "2026-10-18T00:00:00Z",
        eventType: "run_started",
        category: "lifecycle" as const,
        title: "Started",
        preview: "",
        previewTruncated: false,
    };
    assert.equal(isTrajectoryEntry(validEntry), true);

    assert.equal(
        isTrajectoryPage({
            goalId: "goal-1",
            run: validRun,
            entries: [validEntry],
            total: 1,
            committedCount: 1,
            previousCursor: null,
            nextCursor: null,
            locatedSequence: null,
        }),
        true,
    );

    assert.equal(
        isTrajectoryDetail({
            event: {
                eventId: "e-1",
                goalId: "goal-1",
                runId: "run-1",
                sequence: 1,
                occurredAt: "2026-10-18T00:00:00Z",
                phase: "executing",
                eventType: "run_started",
                payload: { type: "run_started" },
                eventSchemaVersion: 1,
            },
            observationConfirmed: true,
            toolDurationMs: null,
        }),
        true,
    );
});

test("Browser session input validators accept receipts, queries and state projections", () => {
    const receipt = {
        goalId: "goal-1", inputId: "input-1", kind: "message", sequence: 1,
        status: "pending", admittedAtRevision: 2,
    };
    assert.equal(isBrowserSessionInputReceipt(receipt), true);
    assert.equal(isBrowserSessionInputReceipt({ ...receipt, status: "unknown" }), false);
    assert.equal(isBrowserSessionInputReceipt({ ...receipt, sequence: 0 }), false);
    assert.equal(isBrowserSessionInputResult({ ok: true, existing: false, receipt }), true);
    assert.equal(isBrowserSessionInputResult({ ok: false, error: "QUEUE_PAUSED" }), true);
    assert.equal(isBrowserSessionInputResult({ ok: false, error: "QUEUED_MESSAGE_NOT_FOUND" }), true);
    assert.equal(isBrowserSessionInputResult({ ok: false, error: "goal_not_running" }), false);
    assert.equal(isBrowserSessionInputQueryResult({ ok: true, found: false }), true);
    assert.equal(isBrowserSessionInputQueryResult({ ok: true, found: true, receipt }), true);
    assert.equal(isBrowserSessionInputQueryResult({ ok: false, error: "input_read_failed" }), true);
    assert.equal(isBrowserSessionInputQueryResult({ ok: false, error: "GOAL_NOT_FOUND" }), true);
    assert.equal(isBrowserSessionInputQueryResult({ ok: false, error: "unexpected" }), false);
    const state = {
        goalId: "goal-1", runId: "run-1", runStatus: "running", mode: "normal",
        commitRevision: 4, queueRevision: 1, queuePaused: false,
        pendingMessageCount: 1, pendingSteerCount: 0, needsRecovery: false, executionOwner: true,
        messages: {
            count: 1,
            throughMessageId: "msg-1",
            recent: [{
                messageId: "msg-1", role: "user", runId: "run-1",
                position: { afterSequence: 0, order: 0 },
                sourceKind: "goal_intent", sourceId: "goal-1",
            }],
        },
    };
    assert.equal(isBrowserSessionState(state), true);
    assert.equal(isBrowserSessionState({ ...state, waitingFor: "ask_user", queuePaused: true, queuePauseReason: "user_interrupt" }), true);
    assert.equal(isBrowserSessionState({ ...state, pendingMessageCount: -1 }), false);
    assert.equal(isBrowserSessionState({ ...state, queuePauseReason: "unknown" }), false);
    assert.equal(isBrowserSessionState({
        ...state,
        interaction: { interactionId: "question:ask-1", kind: "question", runId: "run-1" },
    }), true);
    assert.equal(isBrowserSessionState({ ...state, messages: { count: 1, recent: [] } }), true);
    assert.equal(isBrowserSessionState({
        ...state,
        messages: { count: 1, recent: [{ messageId: "msg-1", role: "user", runId: "run-1", sourceKind: "goal_intent" }] },
    }), false);
    assert.equal(isBrowserCreateSessionResult({
        ok: true, existing: true, goalId: "goal-1", runId: "run-1", receipt,
    }), true);
    assert.equal(isBrowserCreateSessionResult({ ok: false, error: "goal_id_conflict" }), true);
    assert.equal(isBrowserCreateSessionResult({ ok: false, error: "unexpected" }), false);
});

const maskedProfile = {
    id: "profile-1",
    label: "OpenAI 主账号",
    kind: "openai",
    defaultModel: "gpt-4o",
    hasApiKey: true,
    apiKeyMask: "****c123",
};

test("Provider 档案守卫接受掩码投影并拒绝明文凭据字段", () => {
    assert.equal(isProviderProfile(maskedProfile), true);
    assert.equal(isProviderProfile({ ...maskedProfile, apiKey: "sk-raw" }), false);
    assert.equal(isProviderProfile({ ...maskedProfile, id: "" }), false);
    assert.equal(isProviderProfile({ ...maskedProfile, hasApiKey: "yes" }), false);
    assert.equal(isProviderProfile({ ...maskedProfile, structuredOutputMode: "nope" }), false);
    assert.equal(isProviderProfile({ ...maskedProfile, structuredOutputMode: "prompt_only" }), true);
});

test("Provider 设置守卫只接受裸投影并校验来源维度与回退", () => {
    assert.equal(isProviderSettings({
        activeProfileId: "profile-1",
        profiles: [maskedProfile],
        fallback: { source: "config", provider: "google", model: "gemini-2.5-pro" },
    }), true);
    assert.equal(isProviderSettings({ profiles: [] }), true);
    assert.equal(isProviderSettings({
        profiles: [],
        fallback: { source: "config", provider: "google", model: "gemini-3.5-flash-lite" },
    }), true);
    assert.equal(isProviderSettings({ profiles: [{ ...maskedProfile, apiKey: "sk-raw" }] }), false);
    assert.equal(isProviderSettings({ profiles: [], fallback: { source: "env", provider: "openai", model: "gpt-4o" } }), false);
    assert.equal(isProviderSettings({ error: "provider_profile_unavailable" }), false);
    assert.equal(isProviderSettings({ ok: true, settings: { profiles: [] } }), false);
});

test("Provider 写入、删除、激活与测试守卫区分成功与失败形态", () => {
    assert.equal(isProviderProfileWriteResult({ ok: true, profile: maskedProfile }), true);
    assert.equal(isProviderProfileWriteResult({ ok: false, error: "provider_profile_invalid", fields: ["base_url"] }), true);
    assert.equal(isProviderProfileWriteResult({ ok: false, error: "provider_profile_invalid", fields: [1] }), false);
    assert.equal(isProviderProfileWriteResult({ ok: true, profile: { ...maskedProfile, apiKey: "sk-raw" } }), false);

    assert.equal(isProviderProfileDeleteResult({ ok: true, profile: maskedProfile, mayBeReferencedByGoals: true }), true);
    assert.equal(isProviderProfileDeleteResult({ ok: true, profile: maskedProfile }), false);
    assert.equal(isProviderProfileDeleteResult({ ok: false, error: "provider_profile_active" }), true);

    assert.equal(isProviderProfileActivationResult({ ok: true, activeProfileId: "profile-1" }), true);
    assert.equal(isProviderProfileActivationResult({ ok: true }), false);

    assert.equal(isProviderProfileTestResult({ ok: true, modelCount: 29 }), true);
    assert.equal(isProviderProfileTestResult({ ok: true, modelCount: -1 }), false);
    assert.equal(isProviderProfileTestResult({ ok: false, error: "model_catalog_authentication" }), true);
});

test("session contracts preserve open layers and reject unlisted strict fields", () => {
    const session = {
        goalId: "goal-1",
        intent: "Test goal",
        currentRunId: "run-1",
        runStatus: "waiting",
        currentRunMode: "normal",
        messages: [],
        runs: [],
        historyTruncated: false,
    };
    const parsed = safeParse(browserGoalSessionContract, {
        ...session,
        futureServerField: { nested: [1, 2] },
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
        assert.deepEqual(
            (parsed.data as Record<string, unknown>).futureServerField,
            { nested: [1, 2] },
        );
    }

    const state = {
        goalId: "goal-1",
        intent: "Test goal",
        currentRunId: "run-1",
        runStatus: "waiting",
        currentRunMode: "normal",
        currentRunStepCount: 0,
        history: {
            messages: { included: false, source: "activity" },
            steps: { included: false, source: "activity" },
            stages: { included: false, source: "activity" },
        },
    };
    assert.equal(isBrowserGoalSessionState(state), true);
    assert.equal(isBrowserGoalSessionState({ ...state, futureServerField: true }), false);
    assert.equal(isBrowserGoalSessionState({
        ...state,
        runStatus: "failed",
        currentRunTerminalDetail: { message: "failed", futureField: true },
    }), false);
    assert.equal(isBrowserGoalSessionState({
        ...state,
        runStatus: "running",
        currentRunTerminalDetail: { message: "failed" },
    }), false);
});

test("session guards enforce plan route, terminal and declared field invariants", () => {
    const validSession = {
        goalId: "goal-1",
        intent: "Test goal",
        currentRunId: "run-1",
        runStatus: "running",
        currentRunMode: "normal",
        messages: [],
        runs: [{
            runId: "run-1",
            status: "running",
            stepCount: 1,
            steps: [{
                runId: "run-1",
                executionUnitId: "u-1",
                sequence: 1,
                stepIndex: 1,
                status: "completed",
            }],
            current: true,
            planRoute: {
                revision: 2,
                revisionReason: "Evidence confirmed another verification gate",
                nextStageIndex: 1,
                stages: [
                    { stageId: "stage-1", revision: 1, status: "accepted", target: "Inspect", acceptanceCriteria: ["Entry found"], acceptedSequence: 3 },
                    { stageId: "stage-2", revision: 2, status: "executing", target: "Implement", acceptanceCriteria: ["Checks pass"] },
                ],
            },
        }],
        historyTruncated: false,
    };
    assert.equal(isBrowserGoalSession(validSession), true);
    const withRoute = (route: Record<string, unknown>) => ({
        ...validSession,
        runs: [{ ...validSession.runs[0], planRoute: route }],
    });
    const route = validSession.runs[0]!.planRoute;
    assert.equal(isBrowserGoalSession(validSession), true);
    const { revisionReason: _revisionReason, ...routeWithoutReason } = route;
    assert.equal(isBrowserGoalSession(withRoute(routeWithoutReason)), false);
    assert.equal(isBrowserGoalSession(withRoute({
        ...route,
        stages: [route.stages[0], { ...route.stages[1], stageId: "stage-1" }],
    })), false);
    assert.equal(isBrowserGoalSession(withRoute({
        ...route,
        stages: [{ ...route.stages[0], acceptedSequence: undefined }, route.stages[1]],
    })), false);
    assert.equal(isBrowserGoalSession(withRoute({
        ...route,
        stages: [{ ...route.stages[0], status: "pending" }, route.stages[1]],
    })), false);

    const runWithoutRoute = {
        runId: "run-1",
        status: "running",
        stepCount: 1,
        steps: validSession.runs[0]!.steps,
        current: true,
    };
    const withStep = (step: Record<string, unknown>) => ({
        ...validSession,
        runs: [{ ...runWithoutRoute, steps: [step] }],
    });
    assert.equal(isBrowserGoalSession(withStep({
        ...validSession.runs[0]!.steps[0],
        runId: 1,
    })), false);
    assert.equal(isBrowserGoalSession(withStep({
        ...validSession.runs[0]!.steps[0],
        sourceEventId: 1,
    })), false);
    assert.equal(isBrowserGoalSession(withStep({
        ...validSession.runs[0]!.steps[0],
        bashExecution: { command: "npm test", exitCode: "0" },
    })), false);

    assert.equal(isGoalListItem({
        goalId: "goal-1",
        runId: "run-1",
        intent: "Test",
        workflowPhase: "executing",
        runStatus: "running",
        execution: { state: "active", committedThroughSequence: Number.NaN },
        updatedAt: "2026-10-28T00:00:00.000Z",
        archived: false,
    }), false);
    assert.equal(isBrowserRun({
        runId: "run-1",
        status: "running",
        stepCount: Number.MAX_SAFE_INTEGER + 1,
        steps: [],
        current: true,
    }), false);
    assert.equal(isRunStatus(new String("running")), false);
});

test("Action Review 与输入状态 guard 校验声明字段和不变量", () => {
    const review = {
        actionId: "act-1",
        toolId: "write_file",
        originalInput: { path: "a.txt" },
        finalInput: { path: "b.txt", nested: [1, true] },
        changed: true,
        scope: "action",
        availableScopes: ["action"],
        capability: { network: "none", extraFiles: [], targetPaths: [] },
        requiresSandboxApproval: false,
        reviewRef: "review:0123456789abcdef",
    };
    const result = { ok: true, goalId: "goal-1", runId: "run-1", review };
    assert.equal(isBrowserActionReviewResult(result), true);
    assert.equal(isBrowserActionReviewResult({ ...result, review: { ...review, capability: undefined } }), false);
    assert.equal(isBrowserActionReviewResult({ ...result, review: { ...review, availableScopes: ["action", "unknown"] } }), false);
    assert.equal(isBrowserActionReviewResult({
        ...result,
        review: { ...review, capability: { ...review.capability, extraFiles: [{ canonicalPath: "", access: "read", kind: "file" }] } },
    }), false);
    assert.equal(isBrowserActionReviewResult({ ...result, review: { ...review, originalInput: undefined } }), false);
    assert.equal(isBrowserActionReviewResult({ ok: false, error: "scope_unavailable" }), true);
    assert.equal(isBrowserActionReviewResult({ ok: false, error: "unexpected" }), false);

    const receipt = {
        goalId: "goal-1", inputId: "input-1", kind: "message", sequence: 1,
        status: "applied", admittedAtRevision: 0, targetRunId: "run-1", appliedRunId: "run-1", messageIndex: 0,
    };
    assert.equal(isBrowserSessionInputReceipt(receipt), true);
    assert.equal(isBrowserSessionInputReceipt({ ...receipt, targetRunId: "" }), false);
    assert.equal(isBrowserSessionInputReceipt({ ...receipt, messageIndex: -1 }), false);
    assert.equal(isBrowserSessionInputReceipt({ ...receipt, admittedAtRevision: -1 }), false);

    const state = {
        goalId: "goal-1", runId: "run-1", runStatus: "running", mode: "plan",
        commitRevision: 0, queueRevision: 0, queuePaused: false,
        pendingMessageCount: 0, pendingSteerCount: 0, needsRecovery: false, executionOwner: true,
        messages: { count: 0, recent: [] },
    };
    assert.equal(isBrowserSessionState({ ...state, interruption: { requestId: "req-1", status: "requested", outcomeUnknown: false } }), true);
    assert.equal(isBrowserSessionState({ ...state, interruption: { requestId: "req-1", status: "requested" } }), false);
    assert.equal(isBrowserSessionState({ ...state, waitingFor: "other" }), false);
    assert.equal(isBrowserSessionState({ ...state, messages: { count: 1, recent: [{ messageId: "m", role: "user", runId: "run-1", sourceKind: "s", sourceId: "s" }] } }), false);

    assert.equal(isBrowserInteractionDetailResult({
        ok: true,
        goalId: "goal-1",
        runId: "run-1",
        interactionId: "action_approval:act-1",
        detail: { kind: "action_approval", actionId: "act-1", toolId: "bash" },
    }), false);
    assert.equal(isBrowserInteractionDetailResult({
        ok: true,
        goalId: "goal-1",
        runId: "run-1",
        interactionId: "action_approval:act-1",
        detail: { kind: "action_approval", actionId: "act-1", toolId: "bash", input: { command: "ls" }, parentProgram: { actionId: "act-0", callNumber: 0 } },
    }), false);
});

test("Activity contracts keep strict layers, open layers and UTF-16 limits", () => {
    const position = { runId: "run-1", runOrder: 0, sequence: 1, itemKind: "message" as const, order: 0 };
    const message = {
        type: "message" as const,
        itemId: "message:msg-1",
        messageId: "msg-1",
        role: "assistant" as const,
        purpose: "answer" as const,
        runId: "run-1",
        position,
        content: "a".repeat(4_000),
        contentLength: 4_000,
        truncated: false,
    };
    const page = {
        goalId: "goal-1",
        limit: 1,
        items: [message],
        runs: [{
            runId: "run-1", status: "running", current: true, runOrder: 0,
            committedThroughSequence: 1, futureServerField: { ok: true },
        }],
        window: [],
        gaps: [],
        range: { olderAvailable: false, newerAvailable: false },
        stages: [],
        actionGroups: [],
    };
    assert.equal(isBrowserActivityPage(page), true);
    assert.equal(isBrowserActivityPage({ ...page, futureField: true }), false);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...message, futureField: true }] }), false);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...message, content: "a".repeat(4_001), contentLength: 4_001 }] }), false);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...message, content: "😀".repeat(2_000), contentLength: 4_000 }] }), true);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...message, content: "😀".repeat(2_001), contentLength: 4_002 }] }), false);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...message, contentLength: 1 }] }), false);
    assert.equal(isBrowserActivityPage({
        ...page,
        items: [{ ...message, role: "user", purpose: "answer" }],
    }), false);
    assert.equal(isBrowserActivityPage({
        ...page,
        items: [{ ...message, role: "user", purpose: undefined }],
    }), false);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...message, purpose: "process", previewId: "call-1" }] }), false);
    assert.equal(isBrowserActivityPage({ ...page, items: [{ ...message, previewId: "p".repeat(201) }] }), false);
    assert.equal(isBrowserActivityPage({ ...page, limit: 0 }), false);
    assert.equal(isBrowserActivityPage({ ...page, items: [message, message], limit: 1 }), false);

    const gapPosition = { ...position, itemKind: "fact" as const };
    const gap = { direction: "older" as const, itemCount: 1, first: gapPosition, last: gapPosition };
    assert.equal(isBrowserActivityPage({
        ...page,
        gaps: [gap],
        range: { olderAvailable: true, newerAvailable: false },
    }), true);
    assert.equal(isBrowserActivityPage({
        ...page,
        gaps: [gap],
        range: { olderAvailable: false, newerAvailable: false },
    }), false);
    assert.equal(isBrowserActivityPage({
        ...page,
        gaps: [gap, { ...gap, direction: "older" }],
        range: { olderAvailable: true, newerAvailable: false },
    }), false);

    const stage = {
        runId: "run-1", stageId: "stage-1", revision: 1, status: "executing" as const,
        target: "t".repeat(1_000), firstSequence: 1, completeWithinPage: true,
    };
    assert.equal(isBrowserActivityPage({ ...page, stages: [stage] }), true);
    assert.equal(isBrowserActivityPage({ ...page, stages: [{ ...stage, target: "t".repeat(1_001) }] }), false);
    assert.equal(isBrowserActivityPage({ ...page, stages: [{ ...stage, lastSequence: 0 }] }), false);
    assert.equal(isBrowserActivityPage({
        ...page,
        runs: [{ ...page.runs[0], terminalDetail: { message: "failed", extra: true } }],
    }), false);

    const live = { type: "activity", goalId: "goal-1", runId: "run-1", activity: {
        kind: "assistant_text_delta", text: "😀".repeat(1_000), truncated: false,
        sourceEventId: "e".repeat(200), sourceCursor: 1,
    } };
    assert.equal(isLiveEvent(live), true);
    assert.equal(isLiveEvent({ ...live, activity: { ...live.activity, text: "😀".repeat(1_001) } }), false);
    assert.equal(isLiveEvent({ ...live, activity: { ...live.activity, sourceEventId: "e".repeat(201) } }), false);
    assert.equal(isLiveEvent({
        type: "activity", goalId: "goal-1", runId: "run-1",
        activity: { kind: "tool_attempt_failed", sourceEventId: "e", sourceCursor: 1, actionId: "a", attempt: 0, reason: "r" },
    }), false);
});
