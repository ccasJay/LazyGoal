import React from "react";
import { Box, Text, useInput } from "ink";

import type { UiError, UiSettingsViewModel } from "./types";
import { ErrorLine } from "./error-line";

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
    useInput((input, key) => {
        if (
            !busy
            && (key.escape || key.return || input === "q" || input === "Q" || input === "b" || input === "B")
        ) {
            void onBack();
        }
    });

    return (
        <Box flexDirection="column" gap={1}>
            <Text bold color="cyan">Settings & Environment</Text>
            {error === undefined ? null : <ErrorLine error={error} />}
            <Box flexDirection="column" paddingLeft={1} borderStyle="round" borderColor="gray">
                <Text><Text bold>Workspace Root:</Text> {settings.workspaceRoot}</Text>
                <Text><Text bold>Active Profile:</Text> {settings.profileId}</Text>
                <Text><Text bold>Model Name:    </Text> {settings.modelName ?? "(default / adapter)"}</Text>
                <Text><Text bold>Data Directory:</Text> {settings.dataDirectory ?? ".lazygoal"}</Text>
            </Box>
            <Text dimColor>Press Enter, Esc, or 'q' to return to Main Menu.</Text>
        </Box>
    );
}
