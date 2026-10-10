import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type {
  BrowserGoalInteractionCommand,
} from "../../../../packages/web-contracts/src/index";
import type { QueuedInput } from "../types";

export interface RunControlContextValue {
  readonly commandBusy: boolean;
  readonly commandError: string | null;
  readonly setCommandError: (error: string | null) => void;
  readonly stoppingRunId: string | null;
  readonly canSendText: boolean;
  readonly queuedInputs: readonly QueuedInput[];
  readonly queuePaused: boolean;
  readonly onQueueInput: (content: string) => boolean;
  readonly onContinueQueue: () => Promise<void>;
  readonly onSubmitMessage: (content: string) => Promise<boolean>;
  readonly onSubmitDraftMessage: (content: string) => Promise<boolean>;
  readonly onSubmitSteer: (content: string) => Promise<boolean>;
  readonly onInterrupt: () => Promise<void>;
  readonly onSubmitInteraction: (command: BrowserGoalInteractionCommand) => Promise<void>;
  readonly onSubmitResume: () => Promise<void>;
}

const RunControlContext = createContext<RunControlContextValue | null>(null);

export function RunControlProvider({
  value,
  children,
}: {
  value: RunControlContextValue;
  children: ReactNode;
}) {
  return <RunControlContext.Provider value={value}>{children}</RunControlContext.Provider>;
}

export function useRunControlContext(): RunControlContextValue {
  const context = useContext(RunControlContext);
  if (!context) {
    throw new Error("useRunControlContext must be used within a RunControlProvider");
  }
  return context;
}

