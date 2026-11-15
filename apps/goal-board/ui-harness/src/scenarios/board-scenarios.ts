import type {
  BrowserGoalList,
  BrowserWorkspaceContext,
} from "../../../../../packages/web-contracts/src/index";
import {
  createDefaultModelCatalog,
  createDefaultSessionMetricsSnapshot,
  createDefaultWorkspaceContext,
} from "../default-fixtures";
import type { FixtureScenario } from "../fixture-types";

/** 具有丰富状态的 Board 成功列表场景。 */
export const boardPopulatedScenario: FixtureScenario = {
  id: "board-populated",
  description: "Board with multiple active, waiting, and completed goals",
  workspace: {
    data: {
      workspaceRoot: "/Users/dev/project/lazygoal",
      worktreeRoot: null,
      branch: "main",
    },
  },
  goals: {
    data: {
      unreadableCount: 0,
      goals: [
        {
          goalId: "goal-auth-jwt",
          runId: "run-auth-1",
          intent: "Implement user authentication with JWT token refresh",
          workflowPhase: "executing",
          runStatus: "running",
          updatedAt: "2026-01-01T12:00:00.000Z",
          archived: false,
        },
        {
          goalId: "goal-db-perf",
          runId: "run-db-2",
          intent: "Optimize PostgreSQL connection pooling and query indices",
          workflowPhase: "paused",
          runStatus: "waiting",
          updatedAt: "2026-01-01T11:30:00.000Z",
          archived: false,
        },
        {
          goalId: "goal-dark-mode",
          runId: "run-dark-3",
          intent: "Add dark theme support with custom Radix color palettes",
          workflowPhase: "delivered",
          runStatus: "completed",
          updatedAt: "2026-01-01T10:00:00.000Z",
          archived: false,
        },
      ],
    },
  },
  metrics: {
    "goal-auth-jwt": {
      data: {
        goalId: "goal-auth-jwt",
        stepCount: 8,
        reportedCalls: 6,
        missingCalls: 0,
        inputTokens: 14200,
        outputTokens: 3800,
        coverage: "complete",
        cacheMeasuredCalls: 6,
        cacheExcludedCalls: 0,
        cacheHitRate: 0.65,
        throughputMeasuredCalls: 6,
        throughputExcludedCalls: 0,
        tokensPerSecond: 42.1,
        roundCount: 4,
        contextCapacity: null,
        runs: [],
      },
    },
    "goal-db-perf": {
      data: {
        goalId: "goal-db-perf",
        stepCount: 4,
        reportedCalls: 3,
        missingCalls: 0,
        inputTokens: 8500,
        outputTokens: 1900,
        coverage: "complete",
        cacheMeasuredCalls: 3,
        cacheExcludedCalls: 0,
        cacheHitRate: 0.4,
        throughputMeasuredCalls: 3,
        throughputExcludedCalls: 0,
        tokensPerSecond: 28.4,
        roundCount: 2,
        contextCapacity: null,
        runs: [],
      },
    },
    "goal-dark-mode": {
      data: {
        goalId: "goal-dark-mode",
        stepCount: 12,
        reportedCalls: 10,
        missingCalls: 0,
        inputTokens: 24000,
        outputTokens: 7200,
        coverage: "complete",
        cacheMeasuredCalls: 10,
        cacheExcludedCalls: 0,
        cacheHitRate: 0.82,
        throughputMeasuredCalls: 10,
        throughputExcludedCalls: 0,
        tokensPerSecond: 55.0,
        roundCount: 6,
        contextCapacity: null,
        runs: [],
      },
    },
  },
  models: {
    data: createDefaultModelCatalog(),
  },
};

/** 空目标列表的 Board 场景。 */
export const boardEmptyScenario: FixtureScenario = {
  id: "board-empty",
  description: "Board with no created goals",
  workspace: {
    data: createDefaultWorkspaceContext(),
  },
  goals: {
    data: {
      goals: [],
      unreadableCount: 0,
    },
  },
  models: {
    data: createDefaultModelCatalog(),
  },
};

/** 加载中状态的 Board 场景。 */
export const boardLoadingScenario: FixtureScenario = {
  id: "board-loading",
  description: "Board while goals are still loading from backend",
  workspace: {
    data: createDefaultWorkspaceContext(),
  },
  goals: {
    mode: "loading",
    delayMs: 60_000,
  },
};

/** 加载失败状态的 Board 场景。 */
export const boardErrorScenario: FixtureScenario = {
  id: "board-error",
  description: "Board when goal list fetch fails with 500 error",
  workspace: {
    data: createDefaultWorkspaceContext(),
  },
  goals: {
    mode: "error",
    errorStatus: 500,
    errorCode: "failed_to_load_goals",
  },
};

/** 所有 Board 场景的聚合字典。 */
export const boardScenarios: Record<string, FixtureScenario> = {
  "board-populated": boardPopulatedScenario,
  "board-empty": boardEmptyScenario,
  "board-loading": boardLoadingScenario,
  "board-error": boardErrorScenario,
};
