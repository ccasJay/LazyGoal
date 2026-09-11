import React, { useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { Select } from "@inkjs/ui";

import type { UiError } from "./types";
import { useSubmitGate } from "./use-submit-gate";
import { ErrorLine } from "./error-line";
import { StatusSpinner } from "./status-spinner";
import { useTerminalSize } from "./use-terminal-size";

/** LazyGoal 品牌静态 ASCII Art 标头。 */
export const LAZYGOAL_ASCII_BANNER = `
  _                      ____             _ 
 | |    __ _ _____   _  / ___| ___   __ _| |
 | |   / _\` |_  / | | || |  _ / _ \\ / _\` | |
 | |__| (_| |/ /| |_| || |_| | (_) | (_| | |
 |_____\\__,_/___|\\__, | \\____|\\___/ \\__,_|_|
                 |___/                      
`.trimEnd();

/** 主导航菜单的项定义。 */
export type HomeMenuChoice = "new_goal" | "view_history" | "settings" | "exit";

/**
 * HomeScreen 的渲染与命令分发边界。
 *
 * @remarks
 * 主页面展示 ASCII Art 标头并直接复用 \`@inkjs/ui\` 的 \`Select\` 组件渲染单选菜单。
 * 用户可使用方向键浏览、Enter 确认，或在主页直接按 \`q\` 退出进程。
 *
 * @example
 * \`\`\`tsx
 * <HomeScreen
 *   busy={false}
 *   onSelectNewGoal={() => controller.dispatch({ kind: "openIntentInput" })}
 *   onSelectViewHistory={() => controller.dispatch({ kind: "resume" })}
 *   onSelectSettings={() => controller.dispatch({ kind: "openSettings" })}
 *   onExit={() => app.exit()}
 * />
 * \`\`\`
 */
export interface HomeScreenProps {
    /** Controller 当前是否正在处理异步命令。 */
    readonly busy: boolean;
    /** 稳定错误信息。 */
    readonly error?: UiError;
    /** 生效的运行环境摘要信息。 */
    readonly environmentSummary?: {
        readonly workspaceRoot: string;
        readonly profileId: string;
    };
    /** 选中 New Goal 时的回调。 */
    readonly onSelectNewGoal: () => void | Promise<void>;
    /** 选中 View History 时的回调。 */
    readonly onSelectViewHistory: () => void | Promise<void>;
    /** 选中 Settings 时的回调。 */
    readonly onSelectSettings: () => void | Promise<void>;
    /** 退出 TUI 进程的回调。 */
    readonly onExit: () => void;
}

const HOME_MENU_OPTIONS = [
    { label: "New Goal", value: "new_goal" },
    { label: "View History", value: "view_history" },
    { label: "Settings", value: "settings" },
    { label: "Exit", value: "exit" },
];

/**
 * 渲染 TUI 导航主页。
 *
 * @param props - 视图状态与菜单选择回调。
 * @returns Ink 渲染树。
 */
export function HomeScreen({
    busy,
    error,
    environmentSummary,
    onSelectNewGoal,
    onSelectViewHistory,
    onSelectSettings,
    onExit,
}: HomeScreenProps): React.JSX.Element {
    const { columns, rows } = useTerminalSize();

    const handleExit = useCallback(() => {
        onExit();
    }, [onExit]);

    useInput((input) => {
        if (!busy && (input === "q" || input === "Q")) {
            handleExit();
        }
    });

    const selectGate = useSubmitGate(busy, "home-menu");

    const handleSelect = useCallback((value: string) => {
        selectGate.attempt(() => {
            switch (value as HomeMenuChoice) {
                case "new_goal":
                    void onSelectNewGoal();
                    break;
                case "view_history":
                    void onSelectViewHistory();
                    break;
                case "settings":
                    void onSelectSettings();
                    break;
                case "exit":
                    handleExit();
                    break;
            }
        });
    }, [selectGate, onSelectNewGoal, onSelectViewHistory, onSelectSettings, handleExit]);

    return (
        <Box flexDirection="column" gap={1} width={columns}>
            <Text bold color="cyan">
                {columns < 52 || rows < 24 ? "LazyGoal" : LAZYGOAL_ASCII_BANNER}
            </Text>
            {environmentSummary === undefined ? null : (
                <Box flexDirection="column">
                    <Text dimColor wrap="truncate-middle">Workspace: {environmentSummary.workspaceRoot}</Text>
                    <Text dimColor>Profile: {environmentSummary.profileId}</Text>
                </Box>
            )}
            {error === undefined ? null : <ErrorLine error={error} />}
            <Box flexDirection="column" gap={1}>
                <Text bold>Main Menu:</Text>
                <Select
                    isDisabled={busy}
                    options={HOME_MENU_OPTIONS}
                    onChange={handleSelect}
                />
            </Box>
            <Text dimColor>Use ↑/↓ to navigate, Enter to select, 'q' to exit</Text>
            {busy ? <StatusSpinner label="Loading..." /> : null}
        </Box>
    );
}
