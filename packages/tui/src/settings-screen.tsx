import React from "react";
import { Box, Text, useInput } from "ink";

import type { UiError, UiSettingsViewModel } from "./types";
import { ErrorLine } from "./error-line";
import { useTerminalSize } from "./use-terminal-size";

/**
 * SettingsScreen 的渲染与交互边界。
 *
 * @remarks
 * 只读展示当前运行环境参数（工作区根目录、生效 Profile、模型名称及持久化目录）。
 * 用户可通过按 Enter、Esc、'q' 或 'b' 键安全返回主页面。
 *
 * @example
 * ```tsx
 * <SettingsScreen
 *   settings={{ workspaceRoot: "/workspace", profileId: "default" }}
 *   busy={false}
 *   onBack={() => controller.dispatch({ kind: "openHome" })}
 * />
 * ```
 */
export interface SettingsScreenProps {
    /** 当前生效的运行参数不可变快照。 */
    readonly settings: UiSettingsViewModel["settings"];
    /** Controller 当前是否处于繁忙状态。 */
    readonly busy: boolean;
    /** 稳定错误信息。 */
    readonly error?: UiError;
    /** 用户触发返回主页时的回调。 */
    readonly onBack: () => void | Promise<void>;
}

/**
 * 渲染环境与配置信息只读视图。
 *
 * @param props - 配置数据与返回回调。
 * @returns Ink 渲染树。
 */
export function SettingsScreen({
    settings,
    busy,
    error,
    onBack,
}: SettingsScreenProps): React.JSX.Element {
    const { columns } = useTerminalSize();
    useInput((input, key) => {
        if (
            !busy
            && (key.escape || key.return || input === "q" || input === "Q" || input === "b" || input === "B")
        ) {
            void onBack();
        }
    });

    return (
        <Box flexDirection="column" gap={1} width={columns} paddingX={1}>
            <Text bold color="cyan">Settings & Environment</Text>
            {error === undefined ? null : <ErrorLine error={error} />}
            <Box flexDirection="column" gap={1}>
                {[
                    ["Workspace Root:", settings.workspaceRoot],
                    ["Active Profile:", settings.profileId],
                    ["Model Name:", settings.modelName ?? "(default / adapter)"],
                    ["Data Directory:", settings.dataDirectory ?? ".lazygoal"],
                ].map(([label, value]) => (
                    <Box key={label} flexDirection={columns < 60 ? "column" : "row"}>
                        <Box width={17} flexShrink={0}><Text dimColor>{label}</Text></Box>
                        <Box flexShrink={1} minWidth={0}><Text wrap="truncate-middle">{value}</Text></Box>
                    </Box>
                ))}
            </Box>
            <Text dimColor>Press Enter, Esc, or 'q' to return to Main Menu.</Text>
        </Box>
    );
}
