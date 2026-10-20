import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserActivityPage, BrowserGoalActivityEvent, BrowserGoalLiveEvent, BrowserGoalSessionState } from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";
import { createTextBatcher } from "../live-text-batch";
import {
  EMPTY_SESSION_OUTPUT_DISPLAY,
  applySessionOutputEvent,
  reconcileCandidatePresentation,
  releaseDiscardedCandidate,
  setExpandedCandidate,
} from "../session-output-consumer";

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
  const [streamConnected, setStreamConnected] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  const liveText = outputDisplay.liveText;
  const liveActivity = outputDisplay.liveActivity || null;
  const setLiveText = useCallback((next: string | ((current: string) => string)) => {
    setOutputDisplay((current) => ({
      ...current,
      liveText: typeof next === "function" ? next(current.liveText) : next,
    }));
  }, []);

  /**
   * 打字机增量的按帧合并缓冲；`setLiveText` 引用稳定，缓冲可在首次渲染时一次性创建。
   */
  const textBatcherRef = useRef<ReturnType<typeof createTextBatcher> | null>(null);
  if (textBatcherRef.current === null) {
    textBatcherRef.current = createTextBatcher((delta) => {
      setLiveText((current) => (current + delta).slice(-8_000));
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
      setStreamConnected(false);
    }
  }, [selectedGoalId]);

  useEffect(() => {
    if (activityPage === null || selectedGoalId !== activityPage.goalId) return;
    setOutputDisplay((current) => reconcileCandidatePresentation(current, activityPage));
  }, [activityPage, selectedGoalId]);

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
    setStreamConnected(false);

    const refreshLatest = async () => {
      await onRefreshRef.current();
    };

    const clearStreamTransients = () => {
      textBatcher.clear();
      setOutputDisplay(EMPTY_SESSION_OUTPUT_DISPLAY);
      setLiveEvents([]);
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
          for await (const event of browserApi.events(selectedGoalId, controller.signal)) {
            if (!active) return;
            setStreamConnected(true);
            if (event.type === "state_sync" || event.type === "input_result") {
              // 一致状态与受理结果只用于同步：最新快照由读取接口给出。
              await refreshLatest();
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
              if (event.message.previewId === undefined) {
                textBatcher.clear();
                setLiveText("");
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
              textBatcher.clear();
              setLiveText("");
              setOutputDisplay((current) => applySessionOutputEvent(current, event) ?? current);
              await refreshLatest();
              continue;
            }
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
                textBatcher.push(event.activity.text);
                setOutputDisplay((current) => ({ ...current, liveActivity: "A response is being generated" }));
                break;
              }
              case "model_started":
                textBatcher.clear();
                setLiveText("");
                setOutputDisplay((current) => ({ ...current, liveActivity: "Runtime is working on this Goal" }));
                break;
              case "model_completed":
                setOutputDisplay((current) => ({ ...current, liveActivity: "Waiting for the saved result" }));
                break;
              case "step_started":
                textBatcher.clear();
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
            setStreamConnected(false);
            clearStreamTransients();
            await refreshLatest();
            await delay();
          }
        } catch {
          if (!active || controller.signal.aborted) return;
          setStreamConnected(false);
          clearStreamTransients();
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
      active = false;
      controller.abort();
      textBatcher.dispose();
    };
  }, [selectedGoalId, session?.currentRunId, session?.goalId, sessionLoading]);

  const expandCandidateDraft = useCallback((presentationKey: string | undefined) => {
    setOutputDisplay((current) => setExpandedCandidate(current, presentationKey));
  }, []);
  const releaseCandidateDraft = useCallback((presentationKey: string) => {
    setOutputDisplay((current) => releaseDiscardedCandidate(current, presentationKey));
  }, []);

  return {
    liveText,
    setLiveText,
    liveActivity,
    candidatePresentation: outputDisplay,
    expandCandidateDraft,
    releaseCandidateDraft,
    liveEvents,
    streamConnected,
  };
}
