import React, { useCallback, useSyncExternalStore } from "react";
import { Box, Text } from "ink";

import { SessionController } from "./session-controller";
import { IntentScreen } from "./intent-screen";
import { PreparationScreen } from "./preparation-screen";
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
}

/**
 * 渲染当前 Controller 页面。
 *
 * @param props - SessionController 依赖。
 * @returns Ink 渲染树。
 */
export function TuiApp({ controller }: TuiAppProps): React.JSX.Element {
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
            return (
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
                <Box flexDirection="column" gap={1}>
                    <Text bold>Goal selection</Text>
                    <Text>Goal selection will be available in the next screen.</Text>
                    {snapshot.error !== undefined
                        ? <Text color="red">Error: {snapshot.error.message}</Text>
                        : null}
                </Box>
            );
        case "shutting_down":
            return (
                <Box>
                    <Text>Shutting down...</Text>
                </Box>
            );
        case "fatal":
            return (
                <Box flexDirection="column">
                    <Text color="red">Fatal error: {snapshot.error.message}</Text>
                </Box>
            );
    }
}
