import React, { useCallback, useRef, useSyncExternalStore } from "react";
import { Box, Text, useInput } from "ink";

import { SessionController } from "./session-controller";
import { IntentScreen } from "./intent-screen";
import { PreparationScreen } from "./preparation-screen";
import { GoalSelectScreen } from "./goal-select-screen";
import { SessionScreen } from "./session-screen";
import type { UiCommand } from "./types";

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
    /** 第一次 Ctrl+C 时启动幂等关闭流程的回调。 */
    readonly onShutdown?: () => void | Promise<void>;
}

/**
 * 渲染当前 Controller 页面。
 *
 * @param props - SessionController 依赖。
 * @returns Ink 渲染树。
 */
export function TuiApp({ controller, onShutdown }: TuiAppProps): React.JSX.Element {
    const shutdownRequested = useRef(false);
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
        void controller.dispatch(command).catch(() => {
            // Controller 将业务错误投影到快照；拒绝只意味着 busy/shutdown。
        });
    }, [controller]);

    switch (snapshot.screen) {
        case "intent_input":
            return (
                <IntentScreen
                    busy={snapshot.busy}
                    {...(snapshot.error === undefined ? {} : { error: snapshot.error })}
                    onSubmit={(intent) => dispatch({ kind: "create", intent })}
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
                />
            ) : (
                <PreparationScreen
                    session={snapshot}
                    onSubmitMessage={(content) => dispatch({
                        kind: "submitMessage",
                        content,
                    })}
                    onApproveTask={() => dispatch({ kind: "approveTask" })}
                />
            );
        case "goal_select":
            return (
                <GoalSelectScreen
                    goals={snapshot.goals}
                    busy={snapshot.busy}
                    {...(snapshot.error === undefined ? {} : { error: snapshot.error })}
                    onSelect={(goalId) => dispatch({ kind: "selectGoal", goalId })}
                />
            );
        case "shutting_down":
            return (
                <Box>
                    <Text>Shutting down...</Text>
                </Box>
            );
    }
}
