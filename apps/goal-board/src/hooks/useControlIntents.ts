import { useCallback, useState, useRef } from "react";
import type {
  BrowserControlIntentCommand,
  BrowserControlReceipt,
  BrowserControlScope,
  BrowserControlSnapshot,
  BrowserGoalEvent,
} from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";
import {
  acceptControlSnapshot,
  applyControlEvent,
  disconnectControlStream,
  selectControlGoal,
  beginControlIntent,
  createControlState,
  discardControlIntent,
  markControlScopesFresh,
  mergeControlResources,
  settleControlIntent,
  verifyControlIntent as verifyIntentState,
} from "../control/reducer";
import type { ControlResources, ControlState, GoalView } from "../control/types";
import { verifyControlIntent, type ControlVerification } from "../control/verify";

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
  const [state, setState] = useState(createControlState);
  const stateRef = useRef(state);
  const update = useCallback((reduce: (current: ControlState) => ControlState): boolean => {
    const next = reduce(stateRef.current);
    if (next === stateRef.current) return false;
    stateRef.current = next;
    setState(next);
    return true;
  }, []);

  const ownsView = useCallback((view: GoalView): boolean => stateRef.current.view === view, []);
  const currentState = useCallback((): ControlState => stateRef.current, []);
  const selectGoal = useCallback((goalId: string | null): void => {
    update((current) => selectControlGoal(current, goalId));
  }, [update]);
  const acceptSnapshot = useCallback((view: GoalView, snapshot: BrowserControlSnapshot): boolean =>
    update((current) => current.view === view ? acceptControlSnapshot(current, snapshot) : current), [update]);
  const disconnect = useCallback((view: GoalView): void => {
    update((current) => current.view === view ? disconnectControlStream(current) : current);
  }, [update]);

  const submit = useCallback(async (intent: BrowserControlIntentCommand): Promise<BrowserControlReceipt> => {
    update((current) => beginControlIntent(current, intent));
    const receipt = await browserApi.submitControl(intent);
    update((current) => settleControlIntent(current, receipt));
    return receipt;
  }, [update]);

  const verify = useCallback(async (intentId: string): Promise<ControlVerification> => {
    const entry = stateRef.current.intents.find((candidate) => candidate.intent.intentId === intentId);
    if (entry === undefined) return "unknown";
    const verification = await verifyControlIntent(entry.intent);
    update((current) => verifyIntentState(current, intentId, verification));
    return verification;
  }, [update]);

  /** 放弃一条结果不明的本地意图；不撤回已受理的输入。 */
  const discard = useCallback((intentId: string): void => {
    update((current) => discardControlIntent(current, intentId));
  }, [update]);

  const applyEvent = useCallback((view: GoalView, event: BrowserGoalEvent): boolean => {
    return update((current) => current.view === view ? applyControlEvent(current, event) : current);
  }, [update]);

  const markFresh = useCallback((view: GoalView, scopes: readonly BrowserControlScope[]): void => {
    update((current) => current.view === view ? markControlScopesFresh(current, scopes) : current);
  }, [update]);

  const mergeResources = useCallback((resources: Partial<ControlResources>): void => {
    update((current) => mergeControlResources(current, resources));
  }, [update]);

  return { state, currentState, ownsView, selectGoal, acceptSnapshot, disconnect, submit, verify, discard, applyEvent, markFresh, mergeResources };
}

/** 页面共享的控制状态与命令入口。 */
export type ControlIntents = ReturnType<typeof useControlIntents>;
