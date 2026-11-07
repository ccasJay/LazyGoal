import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { ControlIntents } from "../hooks/useControlIntents";

/**
 * 当前 Goal 的输入与 Run 控制边界。
 *
 * @example
 * ```ts
 * const controls: RunControlContextValue = {
 *   commandBusy: false, commandError: null, draftGoalBusy: false, setCommandError: () => {},
 *   stoppingRunId: null, onSubmitDraftMessage: async () => true,
 *   onInterrupt: async () => {}, onSubmitResume: async () => {},
 *   onVerifyIntent: async () => {}, onRetryIntent: async () => true, onDiscardIntent: () => {}, control,
 * };
 * ```
 */
export interface RunControlContextValue {
  /** 统一控制状态与命令入口；所有变更命令都经由这一个 reducer。 */
  readonly control: ControlIntents;
  readonly commandBusy: boolean;
  readonly commandError: string | null;
  /** 新 Goal 的创建被正在执行的其他 Goal 阻塞。 */
  readonly draftGoalBusy: boolean;
  readonly setCommandError: (error: string | null) => void;
  readonly stoppingRunId: string | null;
  readonly onSubmitDraftMessage: (content: string) => Promise<boolean>;
  readonly onInterrupt: () => Promise<void>;
  /** 恢复快照可能重复外部副作用时，要求调用者明确传入确认。 */
  readonly onSubmitResume: (acknowledgeUnknownEffects?: boolean) => Promise<void>;
  /** 按原身份核验收据；不改写为新的提交。 */
  readonly onVerifyIntent: (intentId: string) => Promise<void>;
  /** 以原身份重试；不生成新身份。 */
  readonly onRetryIntent: (intentId: string) => Promise<boolean>;
  /** 放弃一条结果不明的动作。 */
  readonly onDiscardIntent: (intentId: string) => void;
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

