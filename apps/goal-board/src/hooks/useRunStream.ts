import { useEffect, useRef, useState } from "react";
import type { BrowserGoalActivityEvent, BrowserGoalLiveEvent, BrowserGoalSession } from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";
import { createTextBatcher } from "../live-text-batch";

export function useRunStream({
  selectedGoalId,
  session,
  sessionLoading,
  onRefresh,
}: {
  selectedGoalId: string | null;
  session: BrowserGoalSession | null;
  sessionLoading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [liveText, setLiveText] = useState("");
  const [liveActivity, setLiveActivity] = useState<string | null>(null);
  const [liveEvents, setLiveEvents] = useState<BrowserGoalLiveEvent[]>([]);
  const [streamConnected, setStreamConnected] = useState(false);
  const onRefreshRef = useRef(onRefresh);

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
      setLiveActivity(null);
      setLiveEvents([]);
      setStreamConnected(false);
    }
  }, [selectedGoalId]);

  useEffect(() => {
    if (
      selectedGoalId === null
      || session === null
      || session.goalId !== selectedGoalId
      || sessionLoading
    ) return;

    const controller = new AbortController();
    let active = true;
    setLiveEvents([]);
    setStreamConnected(false);

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
          for await (const event of browserApi.events(
            selectedGoalId,
            session.currentRunId,
            controller.signal
          )) {
            if (!active) return;
            setStreamConnected(true);
            if (event.type === "snapshot_changed" || event.type === "refresh_required") {
              setLiveEvents([]);
              if (event.type === "refresh_required") {
                setLiveActivity("Waiting for the saved result");
              }
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
                setLiveActivity("A response is being generated");
                break;
              }
              case "model_started":
                textBatcher.clear();
                setLiveText("");
                setLiveActivity("Runtime is working on this Goal");
                break;
              case "model_completed":
                setLiveActivity("Waiting for the saved result");
                break;
              case "step_started":
                textBatcher.clear();
                setLiveText("");
                setLiveActivity("A new execution step has started");
                break;
              case "tool_started":
                setLiveActivity("A workspace action has started");
                break;
              case "tool_finished":
                setLiveActivity("Workspace action finished; waiting for saved state");
                break;
            }
          }
          if (active && !controller.signal.aborted) {
            setStreamConnected(false);
            await refreshLatest();
            await delay();
          }
        } catch {
          if (!active || controller.signal.aborted) return;
          setStreamConnected(false);
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

  return {
    liveText,
    setLiveText,
    liveActivity,
    setLiveActivity,
    liveEvents,
    streamConnected,
  };
}
