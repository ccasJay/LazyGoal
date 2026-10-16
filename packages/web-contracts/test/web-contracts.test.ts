import assert from "node:assert/strict";
import test from "node:test";
import {
    isAcceptedCommand,
    isBrowserGoalSteerResult,
    isBrowserGoalInterruptResult,
    isActionDetailsResult,
    isBrowserGoalSession,
    isBrowserRun,
    isGoalList,
    isGoalListItem,
    isGoalPlan,
    isGoalSessionEnvelope,
    isJsonValue,
    isLiveEvent,
    isResumeGoalCommand,
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
    isPendingInteraction,
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
    type SessionMetricsSnapshot,
} from "../src/index";

test("Run input control results validate stable accepted identities and known errors", () => {
    assert.equal(isBrowserGoalSteerResult({ ok: true, goalId: "goal-1", runId: "run-1", messageId: "msg-1", existing: false }), true);
    assert.equal(isBrowserGoalSteerResult({ ok: false, error: "goal_not_running" }), true);
    assert.equal(isBrowserGoalSteerResult({ ok: false, error: "unexpected" }), false);
    assert.equal(isBrowserGoalInterruptResult({ ok: true, goalId: "goal-1", runId: "run-1", requestId: "interrupt-1", existing: true }), true);
    assert.equal(isBrowserGoalInterruptResult({ ok: false, error: "goal_not_running" }), true);
    assert.equal(isBrowserGoalInterruptResult({ ok: false, error: "unexpected" }), false);
});

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
    assert.equal(isGoalList({ goals: [validItem] }), true);

    assert.equal(isGoalListItem({ ...validItem, execution: { state: "recoverable", committedThroughSequence: 10 } }), true);
    assert.equal(isGoalListItem({ ...validItem, execution: { state: "unknown", committedThroughSequence: 10 } }), false);
    assert.equal(isGoalListItem({ ...validItem, goalId: "" }), false);
    assert.equal(isGoalListItem({ ...validItem, runStatus: "invalid" }), false);
    assert.equal(isGoalListItem({ ...validItem, archived: "no" }), false);
    assert.equal(isGoalList({ goals: [{ ...validItem, goalId: "" }] }), false);
    assert.equal(isGoalList({}), false);
});

test("isBrowserGoalSession validates complete and malformed sessions", () => {
    const validSession: BrowserGoalSession = {
        goalId: "goal-1",
        intent: "Test goal",
        currentRunId: "run-1",
        runStatus: "waiting",
        currentRunMode: "normal",
        messages: [{ role: "user", content: "hello", runId: "run-1" }],
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

    assert.equal(isBrowserGoalSession({ ...validSession, currentRunMode: "other" }), false);
    assert.equal(isBrowserGoalSession({ ...validSession, runs: "not-array" }), false);
    assert.equal(isGoalSessionEnvelope({ goal: null }), false);
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

test("isPendingInteraction validates ask_user and task_approval", () => {
    assert.equal(
        isPendingInteraction({
            kind: "task_approval",
            planRoute: [{ target: "Complete the proposed task", acceptanceCriteria: ["The task outcome is verified"] }],
            requestId: "req-1",
            objective: "Do task",
            approvalRequest: "Approve?",
            completionCriteria: ["Criterion 1"],
        }),
        true,
    );
    assert.equal(isPendingInteraction({
        kind: "task_approval",
        requestId: "req-1",
        objective: "Do task",
        approvalRequest: "Approve?",
        completionCriteria: [],
        planRoute: [],
    }), false);
    assert.equal(isPendingInteraction({
        kind: "task_approval",
        requestId: "req-1",
        objective: "Do task",
        approvalRequest: "Approve?",
        completionCriteria: [],
        planRoute: [{ target: " ", acceptanceCriteria: ["criterion"] }],
    }), false);
    assert.equal(
        isPendingInteraction({
            kind: "ask_user",
            requestId: "req-2",
            mode: "plan",
            routeRevision: {
                approvalRequest: "Approve the added outcome?",
                reason: "New evidence adds a deliverable outside the approved scope",
                route: [{ target: "Write a report", acceptanceCriteria: ["The report is reviewed"] }],
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
        }),
        true,
    );
    assert.equal(isPendingInteraction({
        kind: "ask_user",
        requestId: "req-3",
        mode: "execution",
        routeRevision: { approvalRequest: "Approve?", reason: "New evidence", route: [] },
        questions: [],
    }), false);
    assert.equal(isPendingInteraction({ kind: "unknown", requestId: "r" }), false);
    assert.equal(isPendingInteraction({ kind: "task_approval", requestId: "" }), false);
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

test("isResumeGoalCommand validates valid and invalid resume commands", () => {
    assert.equal(isResumeGoalCommand({ runId: "run-1", expectedCommittedThroughSequence: 0 }), true);
    assert.equal(isResumeGoalCommand({ runId: "run-1", expectedCommittedThroughSequence: 10 }), true);
    assert.equal(isResumeGoalCommand({ runId: "", expectedCommittedThroughSequence: 10 }), false);
    assert.equal(isResumeGoalCommand({ runId: "run-1", expectedCommittedThroughSequence: -1 }), false);
    assert.equal(isResumeGoalCommand({ runId: "run-1", expectedCommittedThroughSequence: 1.5 }), false);
    assert.equal(isResumeGoalCommand({ runId: "run-1" }), false);
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
