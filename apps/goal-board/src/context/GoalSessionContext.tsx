import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type {
  BrowserGoalSession,
  BrowserModelCatalog,
  BrowserToolGrantSummary,
  BrowserWorkspaceContext,
} from "../../../../packages/web-contracts/src/index";
import type { MetricsState, ModelPickerTarget, SessionTab } from "../types";

export interface GoalSessionContextValue {
  readonly selectedGoalId: string | null;
  readonly session: BrowserGoalSession | null;
  readonly sessionLoading: boolean;
  readonly sessionError: string | null;
  readonly workspaceContext: BrowserWorkspaceContext | null;
  readonly workspaceContextError: boolean;
  readonly sessionTab: SessionTab;
  readonly setSessionTab: (tab: SessionTab) => void;
  readonly trajectoryTarget: { runId: string; executionUnitId: string; nonce: number } | null;
  readonly setTrajectoryTarget: (target: { runId: string; executionUnitId: string; nonce: number } | null) => void;
  readonly follow: boolean;
  readonly setFollow: (follow: boolean | ((current: boolean) => boolean)) => void;
  readonly showTools: boolean;
  readonly setShowTools: (show: boolean | ((current: boolean) => boolean)) => void;
  readonly goalInfoOpen: boolean;
  readonly setGoalInfoOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  readonly toolGrants: readonly BrowserToolGrantSummary[];
  readonly toolGrantsLoading: boolean;
  readonly toolGrantsError: string | null;
  readonly revokingGrantId: string | null;
  readonly liveText: string;
  readonly liveActivity: string | null;
  readonly streamConnected: boolean;
  readonly metricsByGoal: Record<string, MetricsState>;
  readonly currentModelCatalog: BrowserModelCatalog | null;
  readonly currentModelName: string;
  readonly canSwitchCurrentModel: boolean;
  readonly modelPickerTarget: ModelPickerTarget | null;
  readonly setModelPickerTarget: (target: ModelPickerTarget | null) => void;
  readonly modelPreferenceRetry: string | null;
  readonly setModelPreferenceRetry: (retry: string | null) => void;
  readonly retryModelPreference: () => Promise<void>;
  readonly onModelCatalogRefresh: () => void;
  readonly refreshSelectedSession: () => Promise<void>;
  readonly selectGoal: (goalId: string) => void;
  readonly closeSession: () => void;
  readonly openNewGoalDraft: () => void;
  readonly draftSessionOpen: boolean;
  readonly draftPlanMode: boolean;
  readonly setDraftPlanMode: (mode: boolean) => void;
  readonly draftModelId: string | null;
  readonly setDraftModelId: (id: string | null) => void;
  readonly draftModelCatalog: BrowserModelCatalog | null;
  readonly draftModelError: string | null;
  readonly draftModelName: string;
  readonly loadDraftDefault: (generation: number) => Promise<void>;
}

const GoalSessionContext = createContext<GoalSessionContextValue | null>(null);

export function GoalSessionProvider({
  value,
  children,
}: {
  value: GoalSessionContextValue;
  children: ReactNode;
}) {
  return <GoalSessionContext.Provider value={value}>{children}</GoalSessionContext.Provider>;
}

export function useGoalSessionContext(): GoalSessionContextValue {
  const context = useContext(GoalSessionContext);
  if (!context) {
    throw new Error("useGoalSessionContext must be used within a GoalSessionProvider");
  }
  return context;
}
