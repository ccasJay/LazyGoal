import type {
  BrowserGoalList,
  BrowserGoalSessionEnvelope,
  BrowserGoalSessionStateEnvelope,
  BrowserTrajectoryDetail,
  BrowserTrajectoryPage,
  BrowserTrajectoryRuns,
  BrowserTrajectoryTimeline,
} from "../../../../../packages/web-contracts/src/index";
import {
  createDefaultModelCatalog,
  createDefaultSessionState,
  createDefaultWorkspaceContext,
} from "../default-fixtures";
import type { FixtureScenario } from "../fixture-types";

const TRAJ_GOAL_ID = "goal-trajectory-audit";
const TRAJ_RUN_ID = "run-audit-1";

const trajRuns: BrowserTrajectoryRuns = {
  runs: [
    {
      runId: TRAJ_RUN_ID,
      status: "completed",
      current: true,
      committedThroughSequence: 4,
    },
  ],
  nextOffset: null,
};

const trajPage: BrowserTrajectoryPage = {
  goalId: TRAJ_GOAL_ID,
  run: {
    runId: TRAJ_RUN_ID,
    status: "completed",
    current: true,
    committedThroughSequence: 4,
  },
  entries: [
    {
      eventId: "evt-1",
      sequence: 1,
      occurredAt: "2026-01-01T10:00:00.000Z",
      eventType: "run_started",
      category: "lifecycle",
      title: "Run started",
      preview: "Starting run-audit-1",
      previewTruncated: false,
    },
    {
      eventId: "evt-2",
      sequence: 2,
      occurredAt: "2026-01-01T10:00:01.000Z",
      eventType: "model_request",
      category: "decision",
      title: "Model request",
      preview: "Requesting vulnerability audit plan from model",
      previewTruncated: false,
    },
    {
      eventId: "evt-3",
      sequence: 3,
      occurredAt: "2026-01-01T10:00:02.000Z",
      eventType: "model_response",
      category: "decision",
      title: "Model response",
      preview: "Model proposed 3 scan tasks",
      previewTruncated: false,
    },
    {
      eventId: "evt-4",
      sequence: 4,
      occurredAt: "2026-01-01T10:00:03.000Z",
      eventType: "run_completed",
      category: "lifecycle",
      title: "Run completed",
      preview: "Completed all scheduled audit checks",
      previewTruncated: false,
    },
  ],
  total: 4,
  committedCount: 4,
  committedThroughSequence: 4,
  previousCursor: null,
  nextCursor: null,
  locatedSequence: null,
};

const trajTimeline: BrowserTrajectoryTimeline = {
  goalId: TRAJ_GOAL_ID,
  runId: TRAJ_RUN_ID,
  committedThroughSequence: 4,
  eventCount: 4,
  timeRange: {
    start: "2026-01-01T10:00:00.000Z",
    end: "2026-01-01T10:00:03.000Z",
  },
  buckets: [
    {
      startSequence: 1,
      endSequence: 4,
      eventCount: 4,
      eventTypes: [
        { eventType: "run_started", count: 1 },
        { eventType: "model_request", count: 1 },
        { eventType: "model_response", count: 1 },
        { eventType: "run_completed", count: 1 },
      ],
    },
  ],
};

const trajDetail2: BrowserTrajectoryDetail = {
  event: {
    goalId: TRAJ_GOAL_ID,
    runId: TRAJ_RUN_ID,
    eventId: "evt-2",
    sequence: 2,
    occurredAt: "2026-01-01T10:00:01.000Z",
    phase: "execution",
    eventType: "model_request",
    payload: {
      type: "model_request",
      prompt: "Analyze repository dependencies for known vulnerabilities",
    },
  },
  toolDurationMs: null,
  observationConfirmed: false,
  committedThroughSequence: 4,
  correlation: {},
  related: {},
  payloadBytes: 128,
};

const trajSessionEnvelope: BrowserGoalSessionEnvelope = {
  goal: {
    goalId: TRAJ_GOAL_ID,
    intent: "Security audit of npm dependencies",
    currentRunId: TRAJ_RUN_ID,
    runStatus: "completed",
    currentRunMode: "normal",
    messages: [
      {
        messageId: "msg-1",
        role: "user",
        runId: TRAJ_RUN_ID,
        position: { afterSequence: 0, order: 0 },
        content: "Run security audit on all packages",
      },
    ],
    runs: [
      {
        runId: TRAJ_RUN_ID,
        status: "completed",
        stepCount: 1,
        steps: [],
        current: true,
      },
    ],
    historyTruncated: false,
  },
  session: createDefaultSessionState(TRAJ_GOAL_ID),
};

const trajStateEnvelope: BrowserGoalSessionStateEnvelope = {
  goal: {
    goalId: TRAJ_GOAL_ID,
    intent: "Security audit of npm dependencies",
    currentRunId: TRAJ_RUN_ID,
    runStatus: "completed",
    currentRunMode: "normal",
    currentRunStepCount: 1,
    history: {
      messages: { included: false, source: "activity" },
      steps: { included: false, source: "activity" },
      stages: { included: false, source: "activity" },
    },
  },
  session: createDefaultSessionState(TRAJ_GOAL_ID),
};

/** 包含完整轨迹与时间线事件的 Trajectory 场景。 */
export const trajectoryScenario: FixtureScenario = {
  id: "trajectory-default",
  description: "Goal with committed trajectory runs, events, timeline, and detail",
  workspace: {
    data: createDefaultWorkspaceContext(),
  },
  goals: {
    data: {
      goals: [
        {
          goalId: TRAJ_GOAL_ID,
          runId: TRAJ_RUN_ID,
          intent: "Security audit of npm dependencies",
          workflowPhase: "delivered",
          runStatus: "completed",
          updatedAt: "2026-01-01T10:00:03.000Z",
          archived: false,
        },
      ],
      unreadableCount: 0,
    },
  },
  goalSessionEnvelopes: {
    [TRAJ_GOAL_ID]: { data: trajSessionEnvelope },
  },
  goalSessionStateEnvelopes: {
    [TRAJ_GOAL_ID]: { data: trajStateEnvelope },
  },
  trajectoryRuns: {
    [TRAJ_GOAL_ID]: { data: trajRuns },
  },
  trajectories: {
    [TRAJ_GOAL_ID]: { data: trajPage },
  },
  trajectoryTimelines: {
    [TRAJ_GOAL_ID]: { data: trajTimeline },
  },
  trajectoryDetails: {
    [`${TRAJ_GOAL_ID}:2`]: { data: trajDetail2 },
  },
  models: {
    data: createDefaultModelCatalog(),
  },
};
