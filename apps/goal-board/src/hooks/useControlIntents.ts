import { useCallback, useReducer, useRef } from "react";
import type {
  BrowserControlIntentCommand,
  BrowserControlReceipt,
  BrowserControlScope,
  BrowserGoalEvent,
} from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";
import {
  applyControlEvent,
  beginControlIntent,
  createControlState,
  discardControlIntent,
  markControlScopesFresh,
  mergeControlResources,
  settleControlIntent,
  verifyControlIntent as verifyIntentState,
} from "../control/reducer";
import type { ControlResources, ControlState } from "../control/types";
import { verifyControlIntent, type ControlVerification } from "../control/verify";

interface ControlAction {
  readonly kind: "begin" | "receipt" | "event" | "verification" | "discard" | "fresh" | "resources";
  readonly intent?: BrowserControlIntentCommand;
  readonly receipt?: BrowserControlReceipt;
  readonly event?: BrowserGoalEvent;
  readonly intentId?: string;
  readonly verification?: ControlVerification;
  readonly scopes?: readonly BrowserControlScope[];
  readonly resources?: Partial<ControlResources>;
}

function reduce(state: ControlState, action: ControlAction): ControlState {
  switch (action.kind) {
    case "begin":
      return action.intent === undefined ? state : beginControlIntent(state, action.intent);
    case "receipt":
      return action.receipt === undefined ? state : settleControlIntent(state, action.receipt);
    case "event":
      return action.event === undefined ? state : applyControlEvent(state, action.event);
    case "verification":
      return action.intentId === undefined || action.verification === undefined
        ? state
        : verifyIntentState(state, action.intentId, action.verification);
    case "discard":
      return action.intentId === undefined ? state : discardControlIntent(state, action.intentId);
    case "fresh":
      return action.scopes === undefined ? state : markControlScopesFresh(state, action.scopes);
    case "resources":
      return action.resources === undefined ? state : mergeControlResources(state, action.resources);
  }
}

/**
 * 页面侧唯一控制状态与命令入口。
 *
 * @remarks
 * 所有 Goal／Workspace 命令都经由同一 `submit` 登记意图并提交 `/api/control`；
 * 受理收据、Runtime 事件与统一核验都归约到同一 `ControlState`。钩子不保存第二份
 * busy 或 unknown 状态，展示只读取 `state.intents`。
 *
 * @example
 * ```ts
 * const control = useControlIntents();
 * const receipt = await control.submit(intent);
 * ```
 */
export function useControlIntents() {
  const [state, dispatch] = useReducer(reduce, undefined, createControlState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const submit = useCallback(async (intent: BrowserControlIntentCommand): Promise<BrowserControlReceipt> => {
    dispatch({ kind: "begin", intent });
    const receipt = await browserApi.submitControl(intent);
    dispatch({ kind: "receipt", receipt });
    return receipt;
  }, []);

  const verify = useCallback(async (intentId: string): Promise<ControlVerification> => {
    const entry = stateRef.current.intents.find((candidate) => candidate.intent.intentId === intentId);
    if (entry === undefined) return "unknown";
    const verification = await verifyControlIntent(entry.intent);
    dispatch({ kind: "verification", intentId, verification });
    return verification;
  }, []);

  /** 放弃一条结果不明的本地意图；不撤回已受理的输入。 */
  const discard = useCallback((intentId: string): void => {
    dispatch({ kind: "discard", intentId });
  }, []);

  const applyEvent = useCallback((event: BrowserGoalEvent): void => {
    dispatch({ kind: "event", event });
  }, []);

  const markFresh = useCallback((scopes: readonly BrowserControlScope[]): void => {
    dispatch({ kind: "fresh", scopes });
  }, []);

  const mergeResources = useCallback((resources: Partial<ControlResources>): void => {
    dispatch({ kind: "resources", resources });
  }, []);

  return { state, submit, verify, discard, applyEvent, markFresh, mergeResources };
}

/** 页面共享的控制状态与命令入口。 */
export type ControlIntents = ReturnType<typeof useControlIntents>;
