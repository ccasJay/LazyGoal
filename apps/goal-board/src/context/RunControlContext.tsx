import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { QueuedInput } from "../types";
import type { UnverifiedSubmission } from "../hooks/useRunCommands";

/**
 * 当前 Goal 的输入与 Run 控制边界。
 *
 * @example
 * ```ts
 * const controls: RunControlContextValue = {
 *   commandBusy: false, commandError: null, setCommandError: () => {},
 *   stoppingRunId: null, canSendText: true, queuedInputs: [], queuePaused: false,
 *   onContinueQueue: async () => {}, onRemoveQueuedInput: async () => {},
 *   onSubmitMessage: async () => true, onSubmitDraftMessage: async () => true,
 *   onSubmitSteer: async () => true, onInterrupt: async () => {}, onSubmitResume: async () => {},
 *   unverifiedSubmissions: [], onVerifySubmission: async () => {},
 *   onRetrySubmission: async () => true, onDiscardSubmission: () => {},
 * };
 * ```
 */
export interface RunControlContextValue {
  readonly commandBusy: boolean;
  readonly commandError: string | null;
  readonly setCommandError: (error: string | null) => void;
  readonly stoppingRunId: string | null;
  readonly canSendText: boolean;
  readonly queuedInputs: readonly QueuedInput[];
  readonly queuePaused: boolean;
  readonly onContinueQueue: () => Promise<void>;
  /** 按当前队列修订删除单条尚未应用的消息。 */
  readonly onRemoveQueuedInput: (messageId: string) => Promise<void>;
  readonly onSubmitMessage: (content: string) => Promise<boolean>;
  readonly onSubmitDraftMessage: (content: string) => Promise<boolean>;
  /** 可绑定原排队消息，将其原子转为当前 Run 的 Steer。 */
  readonly onSubmitSteer: (
    content: string,
    queueBinding?: { readonly messageId: string; readonly queueRevision: number },
  ) => Promise<boolean>;
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

