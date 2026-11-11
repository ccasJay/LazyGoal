import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BrowserActivityPage, BrowserControlScope, BrowserGoalActivityEvent } from "../../../../packages/web-contracts/src/index";
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
import { releaseObservation } from "../session-stream-recovery";
import type { GoalView } from "../control/types";
import type { ControlIntents } from "./useControlIntents";
import {
  applyTextDelta,
  createLivePreviewState,
  latestSource,
  releaseSources,
  type LivePreviewState,
} from "../streaming-render";

export function useRunStream({
  control,
  activityPage,
  onSessionConfirmed,
  onReadScopes,
}: {
  control: ControlIntents;
  activityPage: BrowserActivityPage | null;
  onSessionConfirmed: () => void;
  onReadScopes: (view: GoalView, scopes: readonly BrowserControlScope[], signal: AbortSignal) => Promise<void>;
}) {
  const { currentState, ownsView, applyEvent, disconnect } = control;
  const { view, snapshot, connection } = control.state;
  const selectedGoalId = view?.goalId ?? null;
  const session = snapshot?.goal ?? null;
  const hasSession = session !== null;
  const [outputDisplay, setOutputDisplay] = useState(EMPTY_SESSION_OUTPUT_DISPLAY);
  const [liveEvents, setLiveEvents] = useState<OrderedGoalEvent[]>([]);
  const [progressEntries, setProgressEntries] = useState<readonly ExecutionProgressEntry[]>([]);
  const [livePreview, setLivePreview] = useState<LivePreviewState>(createLivePreviewState());
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

  useLayoutEffect(() => {
    onReadScopesRef.current = onReadScopes;
  }, [onReadScopes]);

  useLayoutEffect(() => {
    textBatcher.clear();
    sourceRef.current = null;
    setLivePreview(createLivePreviewState());
    setOutputDisplay(EMPTY_SESSION_OUTPUT_DISPLAY);
    setLiveEvents([]);
    setProgressEntries([]);
  }, [textBatcher, view]);

  // 新的 Run 重置实时顺序；不同 Run 的临时节点不共享排序。
  useEffect(() => {
    liveOrderRef.current = 0;
    sourceOrdersRef.current.clear();
    sourceRef.current = null;
  }, [view, session?.currentRunId]);

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
    if (view === null || !hasSession) return;
    const controller = new AbortController();
    const active = () => ownsView(view) && !controller.signal.aborted;
    let connectionReads: AbortController | undefined;

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
      while (active()) {
        const reads = new AbortController();
        connectionReads = reads;
        let resetLiveContent = false;
        const resetAfterSync = () => {
          if (!active() || reads.signal.aborted || resetLiveContent || !currentState().connection.synced) return;
          resetLiveContent = true;
          setProgressEntries([]);
          textBatcher.clear();
          sourceRef.current = null;
          liveOrderRef.current = 0;
          sourceOrdersRef.current.clear();
          setLivePreview(createLivePreviewState());
          setOutputDisplay((current) => ({ ...current, liveText: "" }));
        };
        const readScopes = (scopes: readonly BrowserControlScope[]) => {
          if (scopes.length === 0 || reads.signal.aborted) return;
          void onReadScopesRef.current(view, scopes, reads.signal).then(resetAfterSync).catch(() => {
            if (active() && !reads.signal.aborted) disconnect(view);
          });
        };
        try {
          for await (const event of browserApi.events(view.goalId, controller.signal)) {
            if (!active()) return;
            if (event.goalId !== view.goalId) continue;
            const before = currentState();
            const matchesRun = !("runId" in event) || event.runId === before.snapshot?.session.runId;
            const changed = applyEvent(view, event);
            if (event.type === "state_sync") {
              const after = currentState();
              if (after.snapshot !== before.snapshot) onSessionConfirmed();
              if (changed && !after.connection.synced) readScopes(["session"]);
              resetAfterSync();
              continue;
            }
            if (event.type === "input_result" || event.type === "state_committed" || event.type === "stream_fault") {
              readScopes(readScopesForEvent(event));
              continue;
            }
            if (event.type === "closed") break;
            if (!matchesRun) continue;
            if (event.type === "run_status_changed" || event.type === "run_result"
              || event.type === "interaction_opened" || event.type === "interaction_settled" || event.type === "tool_activity") {
              if (event.type === "interaction_opened"
                && before.snapshot?.goal.interaction?.interactionId === event.interactionId) {
                setOutputDisplay((current) => ({ ...current, liveActivity: "Waiting for your answer" }));
              }
              if (changed || currentState().connection.staleScopes.includes("session")) readScopes(readScopesForEvent(event));
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
              readScopes(readScopesForEvent(event));
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
        } catch {
          // 读取异常与正常断开都交由同一重连路径处理。
        } finally {
          reads.abort();
        }
        if (!active()) return;
        disconnect(view);
        await delay();
      }
    };

    void listen();
    return () => {
      const release = releaseObservation();
      if (release.abortLocalReads) {
        controller.abort();
        connectionReads?.abort();
      }
      if (release.cancelPendingFrames) textBatcher.dispose();
    };
  }, [applyEvent, closeSource, currentState, disconnect, hasSession, nextLiveOrder,
    onSessionConfirmed, openSource, ownsView, setLiveText, textBatcher, view]);

  return {
    liveText,
    livePreviews,
    setLiveText,
    liveActivity,
    candidatePresentation: outputDisplay,
    liveEvents,
    progressEntries,
    streamConnected: connection.connected,
    stateStale: connection.stale || connection.staleScopes.includes("session"),
    streamSynced: connection.synced,
  };
}
