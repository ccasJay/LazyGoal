import type {
  BrowserActivityPage,
  BrowserGoalList,
  BrowserGoalSession,
  BrowserGoalSessionEnvelope,
  BrowserGoalSessionState,
  BrowserGoalSessionStateEnvelope,
  BrowserModelCatalog,
  BrowserPermissionModeResult,
  BrowserProviderSettings,
  BrowserSessionState,
  BrowserTrajectoryDetail,
  BrowserTrajectoryPage,
  BrowserTrajectoryRuns,
  BrowserTrajectoryTimeline,
  BrowserWorkspaceContext,
} from "../../../../packages/web-contracts/src/index";

/** 创建符合契约的默认工作区上下文。 */
export function createDefaultWorkspaceContext(): BrowserWorkspaceContext {
  return {
    workspaceRoot: "/workspace",
    worktreeRoot: null,
    branch: "main",
  };
}

/** 创建符合契约的空目标列表。 */
export function createDefaultGoalList(): BrowserGoalList {
  return {
    goals: [],
    unreadableCount: 0,
  };
}

/** 创建符合契约的窄会话状态。 */
export function createDefaultSessionState(goalId: string): BrowserSessionState {
  return {
    goalId,
    runId: "run-1",
    runStatus: "waiting",
    mode: "normal",
    commitRevision: 1,
    queueRevision: 1,
    queuePaused: false,
    pendingMessageCount: 0,
    pendingSteerCount: 0,
    messages: { count: 0, recent: [] },
    needsRecovery: false,
    executionOwner: true,
  };
}

/** 创建符合契约的默认 Goal 状态。 */
export function createDefaultGoalSessionState(goalId: string): BrowserGoalSessionState {
  return {
    goalId,
    intent: "Empty goal",
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
}

/** 创建符合契约的完整 Goal 详情。 */
export function createDefaultGoalSession(goalId: string): BrowserGoalSession {
  return {
    goalId,
    intent: "Empty goal",
    currentRunId: "run-1",
    runStatus: "waiting",
    currentRunMode: "normal",
    messages: [],
    runs: [],
    historyTruncated: false,
  };
}

/** 创建默认的 GoalSession 信封。 */
export function createDefaultGoalSessionEnvelope(goalId: string): BrowserGoalSessionEnvelope {
  return {
    goal: createDefaultGoalSession(goalId),
    session: createDefaultSessionState(goalId),
  };
}

/** 创建默认的 GoalSessionState 窄信封。 */
export function createDefaultGoalSessionStateEnvelope(goalId: string): BrowserGoalSessionStateEnvelope {
  return {
    goal: createDefaultGoalSessionState(goalId),
    session: createDefaultSessionState(goalId),
  };
}

/** 创建符合契约的空活动页。 */
export function createDefaultActivityPage(goalId: string): BrowserActivityPage {
  return {
    goalId,
    limit: 50,
    items: [],
    runs: [],
    window: [],
    gaps: [],
    range: {
      olderAvailable: false,
      newerAvailable: false,
    },
    stages: [],
    actionGroups: [],
  };
}

/** 创建符合契约的空轨迹 Run 列表。 */
export function createDefaultTrajectoryRuns(): BrowserTrajectoryRuns {
  return {
    runs: [],
    nextOffset: null,
  };
}

/** 创建符合契约的空轨迹事件分页。 */
export function createDefaultTrajectoryPage(goalId: string): BrowserTrajectoryPage {
  return {
    goalId,
    run: {
      runId: "run-1",
      status: "completed",
      current: true,
      committedThroughSequence: 0,
    },
    entries: [],
    total: 0,
    committedCount: 0,
    committedThroughSequence: 0,
    previousCursor: null,
    nextCursor: null,
    locatedSequence: null,
  };
}

/** 创建符合契约的空轨迹时间线。 */
export function createDefaultTrajectoryTimeline(goalId: string): BrowserTrajectoryTimeline {
  return {
    goalId,
    runId: "run-1",
    committedThroughSequence: 0,
    eventCount: 0,
    timeRange: null,
    buckets: [],
  };
}

/** 创建符合契约的单条轨迹详情。 */
export function createDefaultTrajectoryDetail(goalId: string, sequence: number): BrowserTrajectoryDetail {
  return {
    event: {
      goalId,
      runId: "run-1",
      eventId: `evt-${sequence}`,
      sequence,
      occurredAt: "2026-01-01T00:00:00.000Z",
      phase: "execution",
      eventType: "run_started",
      payload: { type: "run_started" },
    },
    toolDurationMs: null,
    observationConfirmed: false,
    committedThroughSequence: sequence,
    correlation: {},
    related: {},
    payloadBytes: 2,
  };
}

/** 创建符合契约的默认模型目录。 */
export function createDefaultModelCatalog(): BrowserModelCatalog {
  return {
    provider: "default",
    currentModelId: "model-1",
    models: [
      {
        id: "model-1",
        displayName: "Test Model",
        availabilitySource: "configured",
        metadataSource: "configured",
        selectable: true,
      },
    ],
  };
}

/** 创建符合契约的默认供应商设置。 */
export function createDefaultProviderSettings(): BrowserProviderSettings {
  return {
    profiles: [],
  };
}

/** 创建符合契约的默认权限模式结果。 */
export function createDefaultPermissionModeResult(): BrowserPermissionModeResult {
  return {
    ok: true,
    mode: "default",
    revision: 1,
    workspaceId: "ws-fixture",
  };
}
