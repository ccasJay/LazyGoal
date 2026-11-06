import { Activity, LayoutDashboard, ListTree } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { useGoalSessionContext } from "../context/GoalSessionContext";
import { selectConnectionPresentation } from "../connection-presentation";
import { sessionStatus, sessionStatusTone, type SessionTab } from "../types";

function SessionTabIcon({ tab }: { tab: SessionTab }) {
  if (tab === "Board") return <LayoutDashboard size={16} aria-hidden="true" />;
  if (tab === "Trajectory") return <ListTree size={16} aria-hidden="true" />;
  return <Activity size={16} aria-hidden="true" />;
}

/**
 * Goal 详情页顶栏中的视图切换控件。
 *
 * @remarks
 * 只在草稿会话或已读取的会话存在时渲染，避免在会话加载期间显示会立即消失的切换项。
 * 切换视图会同时清除 Trajectory 跳转目标，使新视图从浏览位置开始。
 *
 * @example
 * ```tsx
 * <SessionViewTabs />
 * ```
 */
export function SessionViewTabs() {
  const { session, sessionTab, setSessionTab, setTrajectoryTarget, draftSessionOpen } = useGoalSessionContext();
  if (!draftSessionOpen && session === null) return null;
  const tabs = session?.goalPlan === undefined
    ? (["Board", "Activity", "Trajectory"] as const)
    : (["Board", "Activity", "Plan", "Trajectory"] as const);
  const select = (value: string) => {
    setTrajectoryTarget(null);
    setSessionTab(value as SessionTab);
  };
  return (
    <div className="session-view-tabs">
      <Tabs value={sessionTab} onValueChange={select}>
        <TabsList className="session-tab-buttons">
          {draftSessionOpen
            ? <TabsTrigger value="Activity" aria-label="Activity" title="Activity"><SessionTabIcon tab="Activity" /></TabsTrigger>
            : tabs.map((tab) => (
              <TabsTrigger value={tab} onClick={() => select(tab)}
                key={tab}
                aria-label={tab}
                title={tab}
                aria-pressed={sessionTab === tab}
              >
                <SessionTabIcon tab={tab} />
              </TabsTrigger>
            ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

/**
 * Goal 详情页顶栏中的 Run 状态与连接状态。
 *
 * @remarks
 * 草稿会话尚未产生 Run，只展示本地 Runtime 标识；会话未加载时不渲染，避免占位。
 * 连接文案来自 {@link selectConnectionPresentation}，与内容保留策略保持一致。
 *
 * @example
 * ```tsx
 * <SessionStatus />
 * ```
 */
export function SessionStatus() {
  const { session, draftSessionOpen, streamConnected, streamSynced, stateStale } = useGoalSessionContext();
  if (draftSessionOpen) {
    return (
      <div className="session-state">
        <span className="stream-state"><span className="dot" />Local Runtime</span>
      </div>
    );
  }
  if (session === null) return null;
  const connection = selectConnectionPresentation({ connected: streamConnected, synced: streamSynced, stale: stateStale });
  return (
    <div className="session-state">
      <span className={`task-state ${sessionStatusTone(session)}`}>
        <span className="status-dot" />
        {sessionStatus(session)}
      </span>
      <span className={`stream-state ${connection.state === "linked" ? "connected" : ""}`}>
        <span className="dot" />
        {connection.label}
      </span>
    </div>
  );
}
