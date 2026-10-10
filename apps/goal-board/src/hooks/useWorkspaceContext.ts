import { useEffect, useState } from "react";
import type { BrowserWorkspaceContext } from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";

export function useWorkspaceContext({
  enabled,
  sessionKey,
}: {
  enabled: boolean;
  sessionKey?: unknown;
}) {
  const [workspaceContext, setWorkspaceContext] = useState<BrowserWorkspaceContext | null>(null);
  const [workspaceContextError, setWorkspaceContextError] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const refresh = () => {
      void browserApi
        .readWorkspace(controller.signal)
        .then((context) => {
          if (controller.signal.aborted) return;
          setWorkspaceContext(context);
          setWorkspaceContextError(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setWorkspaceContext(null);
          setWorkspaceContextError(true);
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [enabled, sessionKey]);

  return { workspaceContext, workspaceContextError };
}

