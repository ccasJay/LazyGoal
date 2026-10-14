import { useEffect, useRef, useState } from "react";
import type { BrowserGoalSession } from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";

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
  const [streamConnected, setStreamConnected] = useState(false);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (selectedGoalId === null) {
      setLiveText("");
      setLiveActivity(null);
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
              await refreshLatest();
              continue;
            }
            switch (event.activity.kind) {
              case "assistant_text_delta": {
                const text = event.activity.text;
                setLiveActivity("A response is being generated");
                setLiveText((current) => (current + text).slice(-8_000));
                break;
              }
              case "model_started":
                setLiveText("");
                setLiveActivity("Runtime is working on this Goal");
                break;
              case "model_completed":
                setLiveActivity("Waiting for the saved result");
                break;
              case "step_started":
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
          await refreshLatest();
          await delay();
        }
      }
    };

    void listen();
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedGoalId, session?.currentRunId, session?.goalId, sessionLoading]);

  return {
    liveText,
    setLiveText,
    liveActivity,
    setLiveActivity,
    streamConnected,
  };
}
