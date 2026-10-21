import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { QueuedInput } from "../types";
import type { UnverifiedSubmission } from "../hooks/useRunCommands";

export interface RunControlContextValue {
  readonly commandBusy: boolean;
  readonly commandError: string | null;
  readonly setCommandError: (error: string | null) => void;
  readonly stoppingRunId: string | null;
  readonly canSendText: boolean;
  readonly queuedInputs: readonly QueuedInput[];
  readonly queuePaused: boolean;
  readonly onContinueQueue: () => Promise<void>;
  readonly onClearQueue: () => Promise<void>;
  readonly onSubmitMessage: (content: string) => Promise<boolean>;
  readonly onSubmitDraftMessage: (content: string) => Promise<boolean>;
  readonly onSubmitSteer: (content: string) => Promise<boolean>;
  readonly onInterrupt: () => Promise<void>;
  readonly onSubmitResume: () => Promise<void>;
  /** 受理结果不明、等待核验或原身份重试的输入。 */
  readonly unverifiedSubmissions: readonly UnverifiedSubmission[];
  /** 按原身份核验收据；不改写为新的提交。 */
  readonly onVerifySubmission: (inputId: string) => Promise<void>;
  /** 以原身份与冻结载荷重试；不生成新身份。 */
  readonly onRetrySubmission: (inputId: string) => Promise<boolean>;
  /** 放弃一条结果不明的输入。 */
  readonly onDiscardSubmission: (inputId: string) => void;
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

