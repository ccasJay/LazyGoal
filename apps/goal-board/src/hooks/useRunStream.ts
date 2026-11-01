import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserActivityPage, BrowserGoalActivityEvent, BrowserGoalLiveEvent, BrowserGoalSessionState } from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";
import { createTextBatcher } from "../live-text-batch";
import { recordExecutionProgress, type ExecutionProgressEntry } from "../execution-progress";
import {
  EMPTY_SESSION_OUTPUT_DISPLAY,
  applySessionOutputEvent,
  reconcileCandidatePresentation,
} from "../session-output-consumer";
import {
  INITIAL_STREAM_RECOVERY_STATE,
  reduceStreamRecovery,
  releaseObservation,
  type StreamRecoveryState,
} from "../session-stream-recovery";
import {
  applyTextDelta,
  createLivePreviewState,
  latestSource,
  releaseSources,
  type LivePreviewState,
} from "../streaming-render";

export function useRunStream({
  selectedGoalId,
  session,
  activityPage,
  sessionLoading,
  onRefresh,
}: {
  selectedGoalId: string | null;
  session: BrowserGoalSessionState | null;
  activityPage: BrowserActivityPage | null;
  sessionLoading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [outputDisplay, setOutputDisplay] = useState(EMPTY_SESSION_OUTPUT_DISPLAY);
  const [liveEvents, setLiveEvents] = useState<BrowserGoalLiveEvent[]>([]);
  const [progressEntries, setProgressEntries] = useState<readonly ExecutionProgressEntry[]>([]);
  const [streamConnected, setStreamConnected] = useState(false);
  const [recovery, setRecovery] = useState<StreamRecoveryState>(INITIAL_STREAM_RECOVERY_STATE);
  const [livePreview, setLivePreview] = useState<LivePreviewState>(createLivePreviewState());
  const onRefreshRef = useRef(onRefresh);
  const liveText = latestSource(livePreview, session?.currentRunId ?? "")?.content ?? "";
  const liveActivity = outputDisplay.liveActivity || null;

  /** 当前累积中的来源身份；换源时开启新的来源，旧来源独立结算。 */
  const sourceRef = useRef<{ readonly sourceKey: string; readonly runId: string } | null>(null);
  const segmentRef = useRef(0);

  const openSource = useCallback((runId: string): string => {
    segmentRef.current += 1;
    const sourceKey = `${runId}:segment:${segmentRef.current}`;
    sourceRef.current = { sourceKey, runId };
    setLivePreview((current) => applyTextDelta(current, { sourceKey, runId, text: "", cursor: 0 }));
    return sourceKey;
  }, []);

  const setLiveText = useCallback((next: string | ((current: string) => string)) => {
    setLivePreview((current) => {
      const source = sourceRef.current;
      if (source === null) return current;
      const existing = latestSource(current, source.runId);
      const base = existing?.content ?? "";
      const resolved = typeof next === "function" ? next(base) : next;
      return applyTextDelta(current, {
        sourceKey: source.sourceKey,
        runId: source.runId,
        text: resolved.slice(base.length),
        cursor: existing?.cursor ?? 0,
      });
    });
  }, []);

  // 展示投影与按来源的临时正文保持一致：页面只读取派生正文。
  useEffect(() => {
    setOutputDisplay((current) => (current.liveText === liveText ? current : { ...current, liveText }));
  }, [liveText]);

  /**
   * 打字机增量的按帧合并缓冲；缓冲按来源身份累积，不丢弃已经到达的正文。
   */
  const textBatcherRef = useRef<ReturnType<typeof createTextBatcher<string>> | null>(null);
  if (textBatcherRef.current === null) {
    textBatcherRef.current = createTextBatcher((delta) => {
      setLivePreview((current) => {
        const source = sourceRef.current;
        if (source === null) return current;
        return applyTextDelta(current, {
          sourceKey: source.sourceKey,
          runId: source.runId,
          text: delta,
          cursor: 0,
        });
      });
    });
  }
  const textBatcher = textBatcherRef.current;

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (selectedGoalId === null) {
      setLiveText("");
      setOutputDisplay(EMPTY_SESSION_OUTPUT_DISPLAY);
      setLiveEvents([]);
      setProgressEntries([]);
      setStreamConnected(false);
      setRecovery(INITIAL_STREAM_RECOVERY_STATE);
    }
  }, [selectedGoalId]);

  useEffect(() => {
    if (activityPage === null || selectedGoalId !== activityPage.goalId) return;
    setOutputDisplay((current) => reconcileCandidatePresentation(current, activityPage));
  }, [activityPage, selectedGoalId]);

  // 后继 Run 开始时清除上一 Run 的未提交正文；正式消息与候选结算不受影响。
  useEffect(() => {
    setLiveText("");
  }, [session?.currentRunId]);

  useEffect(() => {
    if (
      selectedGoalId === null
      || session === null
      || session.goalId !== selectedGoalId
      || sessionLoading
    ) return;

    const controller = new AbortController();
    let active = true;
    setOutputDisplay(EMPTY_SESSION_OUTPUT_DISPLAY);
    setLiveEvents([]);
    setProgressEntries([]);
    setStreamConnected(false);
    setRecovery(INITIAL_STREAM_RECOVERY_STATE);

    const refreshLatest = async () => {
      await onRefreshRef.current();
    };

    const delay = () =>
      new Promise<void>((resolve) => {
        const timeout = window.setTimeout(resolve, 800);
        controller.signal.addEventListener(
          "abort",
          () => {
            window.clearTimeout(timeout);
            resolve();
          },
          { once: true }
        );
      });

    const listen = async () => {
      while (active && !controller.signal.aborted) {
        try {
          // 一次连接先消费权威同步，再把后续事件当作当前状态。
          let synced = false;
          for await (const event of browserApi.events(selectedGoalId, controller.signal)) {
            if (!active) return;
            setStreamConnected(true);
            setRecovery((current) => reduceStreamRecovery(current, { kind: "connected" }));
            if (event.type === "state_sync") {
              if (!synced) {
                synced = true;
                setProgressEntries([]);
                // 重建连接后的权威同步：丢弃断线期间保留的临时正文与来源索引。
                textBatcher.clear();
                sourceRef.current = null;
                setLivePreview(createLivePreviewState());
                setOutputDisplay((current) => ({
                  ...current,
                  liveText: "",
                }));
              }
              setRecovery((current) => reduceStreamRecovery(current, { kind: "state_sync" }));
              // 一致状态与受理结果只用于同步：最新快照由读取接口给出。
              await refreshLatest();
              continue;
            }
            if (!synced) {
              synced = true;
              await refreshLatest();
            }
            if (event.type === "input_result") {
              // 一致状态与受理结果只用于同步：最新快照由读取接口给出。
              await refreshLatest();
              continue;
            }
            if (event.type === "state_committed"
              || event.type === "run_status_changed"
              || event.type === "run_result"
              || event.type === "interaction_opened"
              || event.type === "interaction_settled"
              || event.type === "tool_activity"
              || event.type === "stream_fault"
              || event.type === "closed") {
              // 控制 reducer 接管前，旧 activity／snapshot 事件仍驱动当前页面。
              continue;
            }
            if (event.type === "snapshot_changed" || event.type === "refresh_required") {
              setLiveEvents([]);
              if (event.type === "refresh_required") {
                setOutputDisplay((current) => ({ ...current, liveActivity: "Waiting for the saved result" }));
              }
              await refreshLatest();
              continue;
            }
            if (event.type === "message_committed") {
              // 结算边界先提交待合并的尾部，正式消息接管后释放该来源。
              textBatcher.flush();
              if (event.message.previewId === undefined) {
                setLiveText("");
                setLivePreview((current) => releaseSources(current, event.runId));
                sourceRef.current = null;
              }
              setOutputDisplay((current) => applySessionOutputEvent(current, event) ?? current);
              await refreshLatest();
              continue;
            }
            if (event.type === "interaction_required") {
              setOutputDisplay((current) => applySessionOutputEvent(current, event) ?? current);
              await refreshLatest();
              continue;
            }
            if (event.type === "activity"
              && (event.activity.kind === "candidate_preview" || event.activity.kind === "candidate_invalidated")) {
              textBatcher.flush();
              setLiveText("");
              setOutputDisplay((current) => applySessionOutputEvent(current, event) ?? current);
              await refreshLatest();
              continue;
            }
            setProgressEntries((current) => recordExecutionProgress(current, event, Date.now()));
            const retainedActivity: BrowserGoalActivityEvent | undefined = event.activity.kind === "assistant_text_delta"
              ? {
                  kind: "activity_boundary",
                  sourceEventId: event.activity.sourceEventId,
                  sourceCursor: event.activity.sourceCursor,
                  reason: "assistant_reply",
                }
              : event.activity.kind === "tool_started"
                || event.activity.kind === "tool_finished"
                || event.activity.kind === "tool_attempt_started"
                || event.activity.kind === "tool_attempt_failed"
                || event.activity.kind === "activity_boundary"
                ? event.activity
                : undefined;
            if (retainedActivity !== undefined) {
              setLiveEvents((current) => [
                ...current,
                { ...event, activity: retainedActivity },
              ].slice(-256));
            }
            switch (event.activity.kind) {
              case "assistant_text_delta": {
                if (sourceRef.current === null) openSource(event.runId);
                textBatcher.push(event.activity.text);
                setOutputDisplay((current) => ({ ...current, liveActivity: "A response is being generated" }));
                break;
              }
              case "model_started":
                textBatcher.flush();
                openSource(event.runId);
                setLiveText("");
                setOutputDisplay((current) => ({ ...current, liveActivity: "Waiting for model response" }));
                break;
              case "model_completed":
                setOutputDisplay((current) => ({ ...current, liveActivity: "Waiting for the saved result" }));
                break;
              case "step_started":
                textBatcher.flush();
                openSource(event.runId);
                setLiveText("");
                setOutputDisplay((current) => ({ ...current, liveActivity: "A new execution step has started" }));
                break;
              case "tool_started":
                setOutputDisplay((current) => ({ ...current, liveActivity: "A workspace action has started" }));
                break;
              case "tool_finished":
                setOutputDisplay((current) => ({ ...current, liveActivity: "Workspace action finished; waiting for saved state" }));
                break;
            }
          }
          if (active && !controller.signal.aborted) {
            // 单纯断开不是执行失败或取消：保留最后确认的正式内容与当前草稿，只标记可能过期。
            setStreamConnected(false);
            setRecovery((current) => reduceStreamRecovery(current, { kind: "disconnected" }));
            await refreshLatest();
            await delay();
          }
        } catch {
          if (!active || controller.signal.aborted) return;
          setStreamConnected(false);
          setRecovery((current) => reduceStreamRecovery(current, { kind: "failed" }));
          try {
            await refreshLatest();
          } catch {
            // Snapshot read failures must not stop stream reconnection.
          }
          await delay();
        }
      }
    };

    void listen();
    return () => {
      // 释放观察只回收浏览器本地资源：不发送 Interrupt，不撤销已受理输入，也不关闭宿主 Runtime。
      const release = releaseObservation();
      active = false;
      if (release.abortLocalReads) controller.abort();
      if (release.cancelPendingFrames) textBatcher.dispose();
    };
    // 订阅按 Goal 建立：后继 Run 不重建执行订阅，跨 Run 只换权威读取的水位。
  }, [selectedGoalId, session?.goalId, sessionLoading]);

  return {
    liveText,
    setLiveText,
    liveActivity,
    candidatePresentation: outputDisplay,
    liveEvents,
    progressEntries,
    streamConnected,
    stateStale: recovery.stale,
    streamSynced: recovery.synced,
  };
}
