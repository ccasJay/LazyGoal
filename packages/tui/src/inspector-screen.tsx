import React, { useCallback, useEffect, useState } from "react";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Box, Text, useApp, useInput } from "ink";
import type { UiInspectorViewModel } from "./types.js";

/**
 * 轨迹检查器复盘全屏组件的只读属性。
 *
 * @example
 * ```tsx
 * <InspectorScreen
 *     inspector={inspectorViewModel}
 *     onInspectStep={(stepIndex) => controller.dispatch({ kind: "inspectStep", stepIndex })}
 *     onToggleReasoning={() => controller.dispatch({ kind: "toggleReasoning" })}
 *     onExit={() => controller.dispatch({ kind: "openHome" })}
 * />
 * ```
 */
export interface InspectorScreenProps {
    /** 检查器视图模型快照。 */
    readonly inspector: UiInspectorViewModel;
    /** 切换目标步骤索引的回调函数。 */
    readonly onInspectStep: (stepIndex: number) => void;
    /** 切换模型思考过程展开/折叠状态的回调函数。 */
    readonly onToggleReasoning: () => void;
    /** 退出检查器并返回上级或退出的回调函数。 */
    readonly onExit?: () => void;
    /** 自定义外部编辑器查看回调函数（用于测试或扩展）。 */
    readonly onExternalView?: (rawJson: string) => void;
}

/**
 * 轨迹事后全屏复盘检查器页面组件。
 *
 * @remarks
 * 在全屏模式（备用屏幕缓冲区）下展示会话步骤切片与消息流：
 * - 顶部 Header 展示当前步序号与总步数；
 * - 快捷键 `h`/`l`/`0`/`$` 控制上一步、下一步、第一步与最后一步；
 * - 快捷键 `j`/`k` 控制主体内容垂直滚动查看；
 * - 快捷键 `r` 切换思维链展开/折叠状态；
 * - 快捷键 `e` 临时挂起终端并调用外部编辑器（如 `$EDITOR` 或 `$PAGER`）查看当前步原始 JSON；
 * - 快捷键 `q` 干净退出并恢复终端原本屏幕缓冲区。
 *
 * @param props - 组件属性。
 * @returns 检查器全屏 React 元素。
 *
 * @example
 * ```tsx
 * <InspectorScreen
 *     inspector={inspectorModel}
 *     onInspectStep={handleInspectStep}
 *     onToggleReasoning={handleToggleReasoning}
 * />
 * ```
 */
export function InspectorScreen({
    inspector,
    onInspectStep,
    onToggleReasoning,
    onExit,
    onExternalView,
}: InspectorScreenProps): React.JSX.Element {
    const { exit } = useApp();
    const [scrollOffset, setScrollOffset] = useState<number>(0);

    const currentStep = inspector.steps[inspector.currentStepIndex];

    // 全屏备用缓冲区生命周期挂载与清理
    useEffect(() => {
        const isTty = Boolean(process.stdout.isTTY);
        if (isTty) {
            process.stdout.write("\x1b[?1049h\x1b[H");
        }
        return () => {
            if (isTty) {
                process.stdout.write("\x1b[?1049l");
            }
        };
    }, []);

    const handleExternalView = useCallback(() => {
        if (currentStep === undefined) {
            return;
        }

        if (onExternalView !== undefined) {
            onExternalView(currentStep.rawJson);
            return;
        }

        const editor = process.env["EDITOR"] || process.env["PAGER"] || "less";
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(
            tmpDir,
            `lazygoal-step-${currentStep.index + 1}-${Date.now()}.json`,
        );

        try {
            fs.writeFileSync(tmpFile, currentStep.rawJson, "utf-8");
            if (process.stdout.isTTY) {
                process.stdout.write("\x1b[?1049l");
            }
            spawnSync(editor, [tmpFile], { stdio: "inherit" });
        } catch {
            // 忽略外部进程启动异常
        } finally {
            if (process.stdout.isTTY) {
                process.stdout.write("\x1b[?1049h\x1b[H");
            }
            try {
                if (fs.existsSync(tmpFile)) {
                    fs.unlinkSync(tmpFile);
                }
            } catch {
                // 忽略临时文件清理异常
            }
        }
    }, [currentStep, onExternalView]);

    useInput((input, key) => {
        if (input === "q") {
            if (onExit !== undefined) {
                onExit();
            } else {
                exit();
            }
            return;
        }

        if (input === "l" || key.rightArrow) {
            if (inspector.currentStepIndex < inspector.totalSteps - 1) {
                setScrollOffset(0);
                onInspectStep(inspector.currentStepIndex + 1);
            }
            return;
        }

        if (input === "h" || key.leftArrow) {
            if (inspector.currentStepIndex > 0) {
                setScrollOffset(0);
                onInspectStep(inspector.currentStepIndex - 1);
            }
            return;
        }

        if (input === "0") {
            setScrollOffset(0);
            onInspectStep(0);
            return;
        }

        if (input === "$") {
            setScrollOffset(0);
            onInspectStep(Math.max(0, inspector.totalSteps - 1));
            return;
        }

        if (input === "j" || key.downArrow) {
            setScrollOffset((prev) => prev + 1);
            return;
        }

        if (input === "k" || key.upArrow) {
            setScrollOffset((prev) => Math.max(0, prev - 1));
            return;
        }

        if (input === "r") {
            onToggleReasoning();
            return;
        }

        if (input === "e") {
            handleExternalView();
            return;
        }
    });

    const displayStepNum = inspector.totalSteps > 0
        ? inspector.currentStepIndex + 1
        : 0;

    // 格式化当前步骤的内容行
    const bodyLines: string[] = [];

    if (currentStep === undefined) {
        bodyLines.push("No step data recorded for this Goal.");
    } else {
        if (currentStep.reasoning !== undefined) {
            if (inspector.showReasoning) {
                bodyLines.push("┌── 💭 Reasoning / CoT ────────────────────────────");
                for (const line of currentStep.reasoning.split("\n")) {
                    bodyLines.push(`│ ${line}`);
                }
                bodyLines.push("└──────────────────────────────────────────────────");
            } else {
                bodyLines.push("💭 [Reasoning folded - press 'r' to expand]");
            }
            bodyLines.push("");
        }

        for (const msg of currentStep.messages) {
            if (msg.role === "user") {
                bodyLines.push(`[User]`);
                for (const line of msg.content.split("\n")) {
                    bodyLines.push(`  ${line}`);
                }
            } else {
                bodyLines.push(`[Assistant (${msg.assistant.profileId})]`);
                for (const line of msg.content.split("\n")) {
                    bodyLines.push(`  ${line}`);
                }
            }
            bodyLines.push("");
        }
    }

    const visibleLines = bodyLines.slice(scrollOffset);

    return (
        <Box flexDirection="column" paddingX={1} paddingY={1}>
            <Box flexDirection="row" justifyContent="space-between">
                <Text bold color="cyan">
                    Goal Inspector: <Text color="white">{inspector.goalId}</Text>
                </Text>
                <Text bold color="yellow">
                    Step {displayStepNum} / {inspector.totalSteps}
                </Text>
            </Box>

            <Text dimColor>
                [h/l] Prev/Next | [0/$] First/Last | [j/k] Scroll | [r] CoT | [e] Raw/Editor | [q] Exit
            </Text>
            <Text dimColor>{"─".repeat(68)}</Text>

            {scrollOffset > 0 && (
                <Text color="yellow">▲ Scrolled down {scrollOffset} lines (press 'k' to scroll up)</Text>
            )}

            <Box flexDirection="column" marginTop={1}>
                {visibleLines.length === 0 && bodyLines.length > 0 ? (
                    <Text dimColor>(Reached bottom of step content)</Text>
                ) : (
                    visibleLines.map((line, idx) => (
                        <Text key={`${scrollOffset + idx}-${line.slice(0, 10)}`}>{line}</Text>
                    ))
                )}
            </Box>
        </Box>
    );
}
