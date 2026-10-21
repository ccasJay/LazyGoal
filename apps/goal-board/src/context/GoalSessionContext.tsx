import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type {
  BrowserActivityPage,
  BrowserGoalSession,
  BrowserGoalSessionState,
  BrowserGoalLiveEvent,
  BrowserModelCatalog,
  BrowserToolGrantSummary,
  BrowserWorkspaceContext,
} from "../../../../packages/web-contracts/src/index";
import type { MetricsState, ModelPickerTarget, SessionTab } from "../types";
import type { SessionOutputDisplay } from "../session-output-consumer";
import type { ActivityWindowState } from "../activity-page-window";

/**
 * Goal Board 单个会话视图消费的局部状态与只读加载入口。
 *
 * @remarks
 * `session` 是不含历史的窄状态，`activityPage` 是独立固定水位正文／事实窗口；完整会话只在
 * Plan、Trajectory 或 Goal details 需要时通过 `loadFullSession` 读取。
 *
 * @example
 * ```tsx
 * const { session, activityPage, loadFullSession } = useGoalSessionContext();
 * ```
 */
export interface GoalSessionContextValue {
  readonly selectedGoalId: string | null;
  /** 当前 Goal 的窄状态，不包含消息、步骤或阶段历史。 */
  readonly session: BrowserGoalSessionState | null;
  /** 当前 Goal 的固定 Activity 页；游标描述窗口外历史，当前视图只提示更早来源仍存在。 */
  readonly activityPage: BrowserActivityPage | null;
  /** 有界 Activity 窗口的本地状态：缓存页、缺口、跟随与阅读锚点。 */
  readonly activityWindow: ActivityWindowState;
  /** 读取更早一页并并入当前窗口；只读，不恢复执行。 */
  readonly loadEarlierActivity: () => Promise<void>;
  /** 读取更新一页并并入当前窗口；只读，不恢复执行。 */
  readonly loadNewerActivity: () => Promise<void>;
  /** 重新读取最新固定窗口并回到跟随状态；只读，不提交输入。 */
  readonly jumpToLatestActivity: () => Promise<void>;
  /** 按需加载的完整会话，用于需要步骤或完整消息的专用视图。 */
  readonly fullSession: BrowserGoalSession | null;
  /** 完整会话读取是否正在进行。 */
  readonly fullSessionLoading: boolean;
  /** 最近一次完整会话读取错误；失败不清除窄状态与 Activity 页。 */
  readonly fullSessionError: string | null;
  /** 初始窄状态与 Activity 页是否正在读取。 */
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
  /** 按候选 ID 关联的公开预览、保存核验与有界作废旧稿。 */
  readonly candidatePresentation: SessionOutputDisplay;
  /** 展开一个旧稿或收起当前唯一展开项。 */
  readonly expandCandidateDraft: (presentationKey: string | undefined) => void;
  /** 释放一份折叠旧稿正文并标记不可恢复。 */
  readonly releaseCandidateDraft: (presentationKey: string) => void;
  readonly liveEvents: readonly BrowserGoalLiveEvent[];
  readonly streamConnected: boolean;
  /** 最后确认的正式内容是否可能过期；过期期间限制依赖最新状态的新决定。 */
  readonly stateStale: boolean;
  /** 本次连接是否已收到权威同步。 */
  readonly streamSynced: boolean;
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
  /**
   * 重读窄状态与首个 Activity 窗口；已请求过完整会话时再同步完整投影。
   *
   * @returns 读取结束时兑现；失败状态保留在 context 的错误字段中。
   * @example
   * ```ts
   * await refreshSelectedSession();
   * ```
   */
  readonly refreshSelectedSession: () => Promise<void>;
  /**
   * 按当前选择读取完整会话历史；只读，不触发 Goal 执行或持久化写入。
   *
   * @returns 读取成功的完整会话；未选择 Goal、读取失败或结果已过期时返回 `null`。
   * @example
   * ```ts
   * const session = await loadFullSession();
   * ```
   */
  readonly loadFullSession: () => Promise<BrowserGoalSession | null>;
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
