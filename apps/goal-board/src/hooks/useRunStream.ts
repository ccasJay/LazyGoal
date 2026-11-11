import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserActivityPage, BrowserControlScope, BrowserControlSnapshot, BrowserGoalActivityEvent, BrowserGoalEvent, BrowserGoalSessionState } from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";
import { createTextBatcher } from "../live-text-batch";
import type { LiveTextBlock, OrderedGoalEvent } from "../live-timeline";
import { recordExecutionProgress, type ExecutionProgressEntry } from "../execution-progress";
import {
  EMPTY_SESSION_OUTPUT_DISPLAY,
  applySessionOutputEvent,
  reconcileCandidatePresentation,
} from "../session-output-consumer";
import { readScopesForEvent } from "../control/event-routing";
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
  onControlSnapshot,
  onControlEvent,
  onReadScopes,
}: {
  selectedGoalId: string | null;
  session: BrowserGoalSessionState | null;
  activityPage: BrowserActivityPage | null;
  sessionLoading: boolean;
  onRefresh: () => Promise<void>;
  onControlSnapshot: (snapshot: BrowserControlSnapshot) => void;
  onControlEvent: (event: BrowserGoalEvent) => void;
  onReadScopes: (scopes: readonly BrowserControlScope[]) => Promise<void>;
}) {
  const [outputDisplay, setOutputDisplay] = useState(EMPTY_SESSION_OUTPUT_DISPLAY);
  const [liveEvents, setLiveEvents] = useState<OrderedGoalEvent[]>([]);
  const [progressEntries, setProgressEntries] = useState<readonly ExecutionProgressEntry[]>([]);
  const [streamConnected, setStreamConnected] = useState(false);
  const [recovery, setRecovery] = useState<StreamRecoveryState>(INITIAL_STREAM_RECOVERY_STATE);
  const [livePreview, setLivePreview] = useState<LivePreviewState>(createLivePreviewState());
  const onRefreshRef = useRef(onRefresh);
  const onControlSnapshotRef = useRef(onControlSnapshot);
  const onControlEventRef = useRef(onControlEvent);
  const onReadScopesRef = useRef(onReadScopes);
  const liveText = latestSource(livePreview, session?.currentRunId ?? "")?.content ?? "";
  const liveActivity = outputDisplay.liveActivity || null;

  /** 当前累积中的来源身份；换源时开启新的来源，旧来源独立结算。 */
  const sourceRef = useRef<{ readonly sourceKey: string; readonly runId: string } | null>(null);
  const segmentRef = useRef(0);
  const liveOrderRef = useRef(0);
  const sourceOrdersRef = useRef(new Map<string, number>());

  const nextLiveOrder = useCallback((): number => {
    liveOrderRef.current += 1;
    return liveOrderRef.current;
  }, []);

  const livePreviews: readonly LiveTextBlock[] = livePreview.sources.map((source) => ({
    ...source,
    order: sourceOrdersRef.current.get(source.sourceKey) ?? 0,
    active: sourceRef.current?.sourceKey === source.sourceKey,
  }));

  const openSource = useCallback((runId: string, order: number): string => {
    segmentRef.current += 1;
    const sourceKey = `${runId}:segment:${segmentRef.current}`;
    sourceRef.current = { sourceKey, runId };
    sourceOrdersRef.current.set(sourceKey, order);
    setLivePreview((current) => applyTextDelta(current, { sourceKey, runId, text: "", cursor: 0 }));
    return sourceKey;
  }, []);

  /** 结束当前正文块；后续增量必须开启新的块，不能回填到已显示节点。 */
  const closeSource = useCallback((): void => {
    sourceRef.current = null;
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
      // Capture before the queued updater can observe a later closeSource().
      const source = sourceRef.current;
      if (source === null) return;
      setLivePreview((current) => applyTextDelta(current, {
        sourceKey: source.sourceKey,
        runId: source.runId,
        text: delta,
        cursor: 0,
      }));
    });
  }
  const textBatcher = textBatcherRef.current;

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    onControlSnapshotRef.current = onControlSnapshot;
  }, [onControlSnapshot]);

  useEffect(() => {
    onControlEventRef.current = onControlEvent;
    onReadScopesRef.current = onReadScopes;
  }, [onControlEvent, onReadScopes]);

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

  // 新的 Run 重置实时顺序；不同 Run 的临时节点不共享排序。
  useEffect(() => {
    liveOrderRef.current = 0;
    sourceOrdersRef.current.clear();
    sourceRef.current = null;
  }, [selectedGoalId, session?.currentRunId]);

  // Run 到达终态后，临时正文、进度与实时工具节点由已提交历史接管。
  const runIsTerminal = session !== null
    && (session.runStatus === "completed" || session.runStatus === "failed" || session.runStatus === "cancelled");
  useEffect(() => {
    if (!runIsTerminal) return;
    sourceRef.current = null;
    setLivePreview(createLivePreviewState());
    setLiveEvents([]);
    setProgressEntries([]);
  }, [runIsTerminal, session?.currentRunId]);

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

    /** 按事件声明的范围定向读取；空范围只更新本地控制状态。 */
    const readScopes = async (scopes: readonly BrowserControlScope[]): Promise<void> => {
      if (scopes.length === 0) return;
      await onReadScopesRef.current(scopes);
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
            onControlEventRef.current(event);
            if (event.type === "state_sync") {
              if (!synced) {
                synced = true;
                setProgressEntries([]);
                // 重建连接后的权威同步：丢弃断线期间保留的临时正文与来源索引。
                textBatcher.clear();
                sourceRef.current = null;
                liveOrderRef.current = 0;
                sourceOrdersRef.current.clear();
                setLivePreview(createLivePreviewState());
                setOutputDisplay((current) => ({
                  ...current,
                  liveText: "",
                }));
              }
              setRecovery((current) => reduceStreamRecovery(current, { kind: "state_sync" }));
              // 权威快照直接替换控制状态；只有无法组装时才回倒完整读取。
              if (event.snapshot === undefined) {
                await refreshLatest();
              } else {
                onControlSnapshotRef.current(event.snapshot);
              }
              continue;
            }
            if (!synced) {
              synced = true;
              await refreshLatest();
            }
            if (event.type === "input_result") {
              await readScopes(readScopesForEvent(event));
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
              if (event.type === "interaction_opened") {
                setOutputDisplay((current) => ({ ...current, liveActivity: "Waiting for your answer" }));
              }
              await readScopes(readScopesForEvent(event));
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
              await readScopes(readScopesForEvent(event));
              continue;
            }
            if (event.type === "activity"
              && (event.activity.kind === "candidate_preview" || event.activity.kind === "candidate_invalidated")) {
              textBatcher.flush();
              setLiveText("");
              setOutputDisplay((current) => applySessionOutputEvent(current, event) ?? current);
              continue;
            }
            const order = nextLiveOrder();
            setProgressEntries((current) => recordExecutionProgress(current, event, Date.now(), order));
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
                { event: { ...event, activity: retainedActivity }, order },
              ].slice(-256));
            }
            switch (event.activity.kind) {
              case "assistant_text_delta": {
                if (sourceRef.current === null) openSource(event.runId, order);
                textBatcher.push(event.activity.text);
                setOutputDisplay((current) => ({ ...current, liveActivity: "A response is being generated" }));
                break;
              }
              case "model_started":
                textBatcher.flush();
                closeSource();
                setLiveText("");
                setOutputDisplay((current) => ({ ...current, liveActivity: "Waiting for model response" }));
                break;
              case "model_completed":
                textBatcher.flush();
                closeSource();
                setOutputDisplay((current) => ({ ...current, liveActivity: "Waiting for the saved result" }));
                break;
              case "step_started":
                textBatcher.flush();
                closeSource();
                setLiveText("");
                setOutputDisplay((current) => ({ ...current, liveActivity: "A new execution step has started" }));
                break;
              case "tool_started":
                textBatcher.flush();
                closeSource();
                setOutputDisplay((current) => ({ ...current, liveActivity: "A workspace action has started" }));
                break;
              case "tool_finished":
                textBatcher.flush();
                closeSource();
                setOutputDisplay((current) => ({ ...current, liveActivity: "Workspace action finished; waiting for saved state" }));
                break;
            }
          }
          if (active && !controller.signal.aborted) {
            // 单纯断开不是执行失败或取消：保留最后确认的正式内容与当前草稿，只标记可能过期。
            setStreamConnected(false);
            setRecovery((current) => reduceStreamRecovery(current, { kind: "disconnected" }));
            await delay();
          }
        } catch {
          if (!active || controller.signal.aborted) return;
          setStreamConnected(false);
          setRecovery((current) => reduceStreamRecovery(current, { kind: "failed" }));
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
    livePreviews,
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
