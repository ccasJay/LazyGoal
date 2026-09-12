import React, { useCallback, useRef, useSyncExternalStore } from "react";
import { Box, Text, useApp, useInput } from "ink";

import { SessionController } from "./session-controller";
import { HomeScreen } from "./home-screen";
import { SettingsScreen } from "./settings-screen";
import { IntentScreen } from "./intent-screen";
import { PreparationScreen } from "./preparation-screen";
import { GoalSelectScreen } from "./goal-select-screen";
import { SessionScreen } from "./session-screen";
import { InspectorScreen } from "./inspector-screen";
import { TerminalScreen } from "./terminal-screen";
import { ModelSelector } from "./model-selector";
import type { ModelCommandEffect } from "../../slash-command/src/index.js";
import { UiDispatchRejectedError, type UiCommand } from "./types";

/**
 * TUI 根组件的依赖边界。
 *
 * @remarks
 * App 只通过 `useSyncExternalStore` 读取 Controller 快照，并把用户操作转换
 * 为 `UiCommand`；它不直接读取 GoalStore，也不复制 Runtime 状态机。
 *
 * @example
 * ```tsx
 * <TuiApp controller={controller} />
 * ```
 */
export interface TuiAppProps {
    /** 当前进程唯一的 SessionController。 */
    readonly controller: SessionController;
    /** 第一次 Ctrl+C 时启动幂等关闭流程；菜单退出使用 Ink 正常卸载。 */
    readonly onShutdown?: () => void | Promise<void>;
}

/**
 * 渲染当前 Controller 页面。
 *
 * @param props - SessionController 依赖。
 * @returns Ink 渲染树。
 */
export function TuiApp({ controller, onShutdown }: TuiAppProps): React.JSX.Element | null {
    const { exit } = useApp();
    const shutdownRequested = useRef(false);
    const lastInspectedGoalId = useRef<string | undefined>(undefined);
    const requestShutdown = useCallback(() => {
        if (shutdownRequested.current) {
            return;
        }

        shutdownRequested.current = true;
        void onShutdown?.();
    }, [onShutdown]);
    useInput((input, key) => {
        if (key.ctrl && input === "c") {
            requestShutdown();
        }
    });

    const subscribe = useCallback(
        (listener: () => void) => controller.subscribe(listener),
        [controller],
    );
    const getSnapshot = useCallback(
        () => controller.getSnapshot(),
        [controller],
    );
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const dispatch = useCallback((command: UiCommand) => {
        void controller.dispatch(command).catch((error: unknown) => {
            if (error instanceof UiDispatchRejectedError) {
                return;
            }

            console.warn("Unexpected UI dispatch failure", error);
        });
    }, [controller]);

    const handleCommandEffect = useCallback((effect: ModelCommandEffect) => {
        if (effect.kind === "open_model_selector") {
            dispatch({ kind: "openModelSelector" });
        }
    }, [dispatch]);

    return <TerminalScreen alternate={snapshot.screen === "inspector"}>{renderScreen()}</TerminalScreen>;

    function renderScreen(): React.JSX.Element | null {
    switch (snapshot.screen) {
        case "home":
            return (
                <HomeScreen
                    busy={snapshot.busy}
                    {...(snapshot.error === undefined ? {} : { error: snapshot.error })}
                    {...(snapshot.environmentSummary !== undefined
                        ? { environmentSummary: snapshot.environmentSummary }
                        : {})}
                    onSelectNewGoal={() => dispatch({ kind: "openIntentInput" })}
                    onSelectViewHistory={() => dispatch({ kind: "openHistory" })}
                    onSelectSettings={() => dispatch({ kind: "openSettings" })}
                    onExit={() => exit()}
                />
            );
        case "settings":
            return (
                <SettingsScreen
                    settings={snapshot.settings}
                    busy={snapshot.busy}
                    {...(snapshot.error === undefined ? {} : { error: snapshot.error })}
                    onBack={() => dispatch({ kind: "openHome" })}
                />
            );
        case "intent_input":
            return (
                <IntentScreen
                    busy={snapshot.busy}
                    {...(snapshot.error === undefined ? {} : { error: snapshot.error })}
                    {...("notice" in snapshot && snapshot.notice !== undefined ? { notice: snapshot.notice } : {})}
                    onSubmit={(intent) => dispatch({ kind: "create", intent })}
                    onBack={() => dispatch({ kind: "openHome" })}
                    onCommandEffect={handleCommandEffect}
                />
            );
        case "session":
            return snapshot.phase === "executing" ? (
                <SessionScreen
                    session={snapshot}
                    onSubmitMessage={(content) => dispatch({
                        kind: "submitMessage",
                        content,
                    })}
                    onApproveAction={(actionId) => dispatch({
                        kind: "approveAction",
                        actionId,
                    })}
                    onRejectAction={(actionId, reason) => dispatch({
                        kind: "rejectAction",
                        actionId,
                        reason,
                    })}
                    onToggleExecutionMode={() => dispatch({ kind: "toggleExecutionMode" })}
                    onCommandEffect={handleCommandEffect}
                />
            ) : (
                <PreparationScreen
                    session={snapshot}
                    onSubmitMessage={(content) => dispatch({
                        kind: "submitMessage",
                        content,
                    })}
                    onApproveTask={() => dispatch({ kind: "approveTask" })}
                    onRetry={() => dispatch({ kind: "retryPreparation" })}
                    onCommandEffect={handleCommandEffect}
                />
            );
        case "model_select":
            return (
                <ModelSelector
                    currentModelId={snapshot.currentModelId}
                    state={snapshot.state}
                    busy={snapshot.busy}
                    {...(snapshot.error === undefined ? {} : { error: snapshot.error })}
                    onSelect={(model) => dispatch({ kind: "selectModel", model })}
                    onCancel={() => dispatch({ kind: "cancelModelSelect" })}
                />
            );
        case "goal_select":
            return (
                <GoalSelectScreen
                    goals={snapshot.goals}
                    busy={snapshot.busy}
                    {...(snapshot.mode !== undefined ? { mode: snapshot.mode } : {})}
                    {...(snapshot.error === undefined ? {} : { error: snapshot.error })}
                    onSelect={(goalId) => {
                        if (snapshot.mode === "inspect") lastInspectedGoalId.current = goalId;
                        dispatch({ kind: "selectGoal", goalId });
                    }}
                    {...(snapshot.mode === "inspect" && lastInspectedGoalId.current !== undefined
                        ? { initialGoalId: lastInspectedGoalId.current } : {})}
                    onBack={() => dispatch({ kind: "openHome" })}
                    onExit={() => exit()}
                />
            );
        case "inspector":
            return (
                <InspectorScreen
                    inspector={snapshot}
                    onInspectStep={(stepIndex) => dispatch({ kind: "inspectStep", stepIndex })}
                    onToggleReasoning={() => dispatch({ kind: "toggleReasoning" })}
                    onToggleObservation={() => dispatch({ kind: "toggleObservation" })}
                    onBack={() => dispatch({ kind: "openHistory" })}
                    onExit={() => exit()}
                />
            );
        case "shutting_down":
            return (
                <Box>
                    <Text>Shutting down...</Text>
                </Box>
            );
        default:
            return null;
    }
    }
}
