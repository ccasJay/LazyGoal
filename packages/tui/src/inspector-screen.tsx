import React, { useCallback, useEffect, useMemo, useState } from "react";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import wrapAnsi from "wrap-ansi";

import type { UiInspectorViewModel } from "./types.js";
import { useTerminalSize } from "./use-terminal-size.js";

/**
 * 轨迹检查器的只读视图与导航回调。
 *
 * @remarks
 * 正文按终端列宽换行并限制在可见高度内。滚动位置归组件所有，切步或折叠
 * 思考内容时回到顶部。返回历史与退出进程是两个独立操作。
 *
 * @example
 * ```tsx
 * <InspectorScreen
 *   inspector={inspectorViewModel}
 *   onInspectStep={selectStep}
 *   onToggleReasoning={toggleReasoning}
 *   onBack={openHistory}
 *   onExit={shutdown}
 * />
 * ```
 */
export interface InspectorScreenProps {
    /** 检查器视图模型快照。 */
    readonly inspector: UiInspectorViewModel;
    /** 切换目标步骤索引；同一输入批次可连续调用。 */
    readonly onInspectStep: (stepIndex: number) => void;
    /** 切换模型思考内容的展开状态。 */
    readonly onToggleReasoning: () => void;
    /**
     * 切换工具观察结果（Observation）的完整展开/收起状态。
     *
     * @remarks
     * 触发后由上层 Controller 翻转 `inspector.expandObservation`。
     *
     * @example
     * ```tsx
     * <InspectorScreen onToggleObservation={toggleObservation} ... />
     * ```
     */
    readonly onToggleObservation?: () => void;
    /** Esc 返回历史列表；未提供时不显示返回入口。 */
    readonly onBack?: () => void;
    /** q 退出进程；未提供时直接卸载 Ink。 */
    readonly onExit?: () => void;
    /** 替换外部查看操作，接收当前步原始 JSON；异常显示在检查器中。 */
    readonly onExternalView?: (rawJson: string) => void;
}

/**
 * 按终端尺寸展示轨迹切片，并在外部查看结束后恢复 Ink 画面。
 *
 * @param props - 只读轨迹与导航回调。
 * @returns 固定标题、可滚动正文和快捷键栏。
 */
export function InspectorScreen({
    inspector,
    onInspectStep,
    onToggleReasoning,
    onToggleObservation,
    onBack,
    onExit,
    onExternalView,
}: InspectorScreenProps): React.JSX.Element {
    const { exit } = useApp();
    const { stdout, write } = useStdout();
    const { columns, rows } = useTerminalSize();
    const [scrollOffset, setScrollOffset] = useState(0);
    const [externalError, setExternalError] = useState<string>();
    const currentStep = inspector.steps[inspector.currentStepIndex];
    const contentWidth = Math.max(1, columns - 2);
    const compact = columns < 60;
    const viewportHeight = Math.max(1, rows - (compact ? 8 : 7));

    useEffect(() => {
        if (!stdout.isTTY) return;
        // 经 Ink 写入以同步其帧缓存与实际终端缓冲区。
        write("\x1b[?1049h\x1b[2J\x1b[H");
        return () => { write("\x1b[?1049l"); };
    }, [stdout, write]);

    useEffect(() => {
        setScrollOffset(0);
        setExternalError(undefined);
    }, [
        inspector.goalId,
        inspector.currentStepIndex,
        inspector.showReasoning,
        inspector.expandObservation,
    ]);

    const bodyLines = useMemo(() => {
        const lines: string[] = [];
        if (currentStep === undefined) {
            lines.push("No step data available.");
            return lines;
        }

        // 1. 未提交尾部警示
        if (currentStep.uncommittedWarning !== undefined) {
            lines.push("⚠️  [WARNING: UNCOMMITTED TAIL]");
            lines.push(currentStep.uncommittedWarning);
            lines.push("");
        }

        // 2. 步骤标题
        if (currentStep.title) {
            lines.push(`=== ${currentStep.title} ===`);
            lines.push("");
        }

        // 2.1 准备阶段详情（Step 1: Preparation & Planning）
        if (currentStep.preparationDetails !== undefined && currentStep.preparationDetails.length > 0) {
            lines.push("[Preparation & Context]");
            for (const detail of currentStep.preparationDetails) {
                lines.push(`• ${detail}`);
            }
            lines.push("");
        }

        // 3. 思维链 (Reasoning / CoT)
        if (currentStep.reasoning !== undefined) {
            lines.push(inspector.showReasoning
                ? "Reasoning / CoT"
                : "Reasoning folded - press r to expand");
            if (inspector.showReasoning) {
                lines.push(currentStep.reasoning);
            }
            lines.push("");
        }

        // 4. 决策区块 (Decision)
        if (currentStep.decision !== undefined) {
            lines.push(`[Decision: ${currentStep.decision.kind}]`);
            if (currentStep.decision.summary) {
                lines.push(`Summary: ${currentStep.decision.summary}`);
            }
            if (currentStep.decision.toolCall !== undefined) {
                lines.push(`Target Tool: ${currentStep.decision.toolCall.toolId} (Action: ${currentStep.decision.toolCall.actionId})`);
            }
            lines.push("");
        }

        // 5. 行动与审批区块 (Action & Approval)
        if (currentStep.action !== undefined) {
            const statusLabel = currentStep.action.approvalStatus === "auto_approved"
                ? "Auto-Approved"
                : currentStep.action.approvalStatus === "approved"
                    ? "Approved"
                    : currentStep.action.approvalStatus === "rejected"
                        ? "Rejected"
                        : "Awaiting Approval";
            lines.push(`[Action: ${currentStep.action.toolId}] (${statusLabel})`);
            if (currentStep.action.inputJson) {
                lines.push("Input:");
                lines.push(currentStep.action.inputJson);
            }
            if (currentStep.action.rejectionReason !== undefined) {
                lines.push(`Rejection Reason: ${currentStep.action.rejectionReason}`);
            }
            lines.push("");
        }

        // 6. 工具观察结果区块 (Tool & Observation)
        if (currentStep.observation !== undefined) {
            const durationLabel = currentStep.observation.durationMs !== undefined
                ? ` (${currentStep.observation.durationMs}ms)`
                : "";
            lines.push(`[Observation: ${currentStep.observation.toolId}] ${currentStep.observation.status.toUpperCase()}${durationLabel}`);
            const isExpanded = inspector.expandObservation ?? false;
            if (isExpanded) {
                const fullText = typeof currentStep.observation.rawObservation === "string"
                    ? currentStep.observation.rawObservation
                    : JSON.stringify(currentStep.observation.rawObservation, null, 2);
                lines.push(fullText);
                if (currentStep.observation.isTruncated) {
                    lines.push("(Full output displayed - press o to collapse)");
                }
            } else {
                lines.push(currentStep.observation.observationPreview);
                if (currentStep.observation.isTruncated) {
                    lines.push("... [Observation truncated - press o to expand]");
                }
            }
            lines.push("");
        }

        // 7. 步骤结果区块 (Result)
        if (currentStep.result !== undefined) {
            lines.push(`[Result: ${currentStep.result.outcome.toUpperCase()}]`);
            if (currentStep.result.summary) {
                lines.push(`Summary: ${currentStep.result.summary}`);
            }
            if (currentStep.result.errorMessage !== undefined) {
                const codeStr = currentStep.result.errorCode ? `[${currentStep.result.errorCode}] ` : "";
                lines.push(`Error: ${codeStr}${currentStep.result.errorMessage}`);
            }
            lines.push("");
        }

        // 8. 传统 Messages 兜底兼容
        const hasStructuredBlocks = currentStep.decision !== undefined
            || currentStep.action !== undefined
            || currentStep.observation !== undefined
            || currentStep.result !== undefined
            || (currentStep.preparationDetails !== undefined && currentStep.preparationDetails.length > 0);

        const messages = currentStep.messages ?? [];
        if (!hasStructuredBlocks && messages.length > 0) {
            for (const message of messages) {
                lines.push(message.role === "user"
                    ? "[User]"
                    : "[Assistant (" + message.assistant.profileId + ")]");
                lines.push(message.content, "");
            }
        } else if (
            !hasStructuredBlocks
            && messages.length === 0
            && currentStep.reasoning === undefined
            && currentStep.uncommittedWarning === undefined
        ) {
            lines.push("No messages recorded for this step.", "Press e to view the raw step data.");
        }

        return wrapAnsi(lines.join("\n").replace(/\t/g, "    "), contentWidth, {
            hard: true,
            trim: false,
        }).split("\n");
    }, [
        currentStep,
        inspector.showReasoning,
        inspector.expandObservation,
        contentWidth,
    ]);

    const maxScroll = Math.max(0, bodyLines.length - viewportHeight);
    const visibleOffset = Math.min(scrollOffset, maxScroll);
    useEffect(() => {
        setScrollOffset((offset) => Math.min(offset, maxScroll));
    }, [maxScroll]);

    const handleExternalView = useCallback(() => {
        if (currentStep === undefined) return;
        setExternalError(undefined);
        let tmpDirectory: string | undefined;
        try {
            if (onExternalView !== undefined) {
                onExternalView(currentStep.rawJson);
                return;
            }
            const editor = process.env["EDITOR"] || process.env["PAGER"] || "less";
            tmpDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "lazygoal-step-"));
            const tmpFile = path.join(tmpDirectory, "step.json");
            fs.writeFileSync(tmpFile, currentStep.rawJson, { encoding: "utf-8", mode: 0o600 });
            if (stdout.isTTY) stdout.write("\x1b[?1049l");
            const result = spawnSync(editor, [tmpFile], { stdio: "inherit" });
            if (result.error !== undefined) throw result.error;
            if (result.status !== 0) {
                throw new Error("Editor exited with " + (result.signal ?? result.status));
            }
        } catch (error) {
            setExternalError("Could not open raw step: "
                + (error instanceof Error ? error.message : String(error)));
        } finally {
            if (tmpDirectory !== undefined) {
                try {
                    fs.rmSync(tmpDirectory, { recursive: true, force: true });
                } catch (error) {
                    setExternalError("Could not remove temporary step: "
                        + (error instanceof Error ? error.message : String(error)));
                } finally {
                    if (stdout.isTTY) {
                        // write 会清除 Ink 的旧帧并恢复完整输出，无需不可见字符。
                        write("\x1b[?1049h\x1b[2J\x1b[H");
                    }
                }
            }
        }
    }, [currentStep, onExternalView, stdout, write]);

    useInput((input, key) => {
        if (key.escape) {
            onBack?.();
            return;
        }
        if (key.ctrl || key.meta) return;
        const maxStepIndex = Math.max(0, inspector.totalSteps - 1);
        let currentStepIndex = inspector.currentStepIndex;
        const moveToStep = (index: number) => {
            currentStepIndex = Math.max(0, Math.min(index, maxStepIndex));
            setScrollOffset(0);
            onInspectStep(currentStepIndex);
        };
        const scrollBy = (delta: number) => {
            setScrollOffset((offset) => Math.max(0, Math.min(offset + delta, maxScroll)));
        };
        if (key.rightArrow) {
            if (currentStepIndex < maxStepIndex) moveToStep(currentStepIndex + 1);
            return;
        }
        if (key.leftArrow) {
            if (currentStepIndex > 0) moveToStep(currentStepIndex - 1);
            return;
        }
        if (key.downArrow || key.upArrow) {
            scrollBy(key.downArrow ? 1 : -1);
            return;
        }
        if (key.pageDown || key.pageUp) {
            scrollBy((key.pageDown ? 1 : -1) * viewportHeight);
            return;
        }
        if (key.home || key.end) {
            setScrollOffset(key.home ? 0 : maxScroll);
            return;
        }
        for (const action of input) {
            switch (action) {
                case "q":
                    if (onExit !== undefined) onExit(); else exit();
                    return;
                case "l":
                    if (currentStepIndex < maxStepIndex) moveToStep(currentStepIndex + 1);
                    break;
                case "h":
                    if (currentStepIndex > 0) moveToStep(currentStepIndex - 1);
                    break;
                case "0": moveToStep(0); break;
                case "$": moveToStep(maxStepIndex); break;
                case "j": scrollBy(1); break;
                case "k": scrollBy(-1); break;
                case "g": setScrollOffset(0); break;
                case "G": setScrollOffset(maxScroll); break;
                case "r":
                    setScrollOffset(0);
                    onToggleReasoning();
                    break;
                case "o":
                    setScrollOffset(0);
                    onToggleObservation?.();
                    break;
                case "e":
                    handleExternalView();
                    return;
            }
        }
    });

    const displayStep = inspector.totalSteps > 0 ? inspector.currentStepIndex + 1 : 0;
    const visibleLines = bodyLines.slice(visibleOffset, visibleOffset + viewportHeight);
    const range = "Lines " + (visibleOffset + 1) + "-"
        + Math.min(visibleOffset + viewportHeight, bodyLines.length) + " / " + bodyLines.length;
    const position = maxScroll === 0 ? "All" : visibleOffset === 0 ? "Top"
        : visibleOffset === maxScroll ? "Bottom" : Math.round(visibleOffset / maxScroll * 100) + "%";

    return (
        <Box flexDirection="column" width={columns} height={Math.max(8, rows - 1)}
            paddingX={1} overflow="hidden">
            <Box flexShrink={0} justifyContent="space-between">
                <Text bold color="cyan">Goal Inspector</Text>
                <Text bold color="yellow">Step {displayStep} / {inspector.totalSteps}</Text>
            </Box>
            <Text dimColor wrap="truncate-end">{inspector.goalId}</Text>
            <Text dimColor>{"─".repeat(contentWidth)}</Text>
            <Box flexDirection="column" height={viewportHeight} flexShrink={0} overflow="hidden">
                {visibleLines.map((line, index) => (
                    <Text key={visibleOffset + index} wrap="truncate-end">{line || " "}</Text>
                ))}
            </Box>
            <Text color={externalError === undefined ? "gray" : "red"} wrap="truncate-end">
                {externalError ?? range + "  " + position}
            </Text>
            <Text dimColor wrap="truncate-end">
                {compact
                    ? "[h/l] Step  [j/k] Scroll  [r] CoT  [o] Obs"
                    : "[h/l] Prev/Next  [0/$] First/Last  [j/k] Scroll  [PgUp/PgDn] Page"}
            </Text>
            {compact ? <Text dimColor wrap="truncate-end">[PgUp/PgDn] Page  [g/G] Top/Bottom</Text> : null}
            <Text dimColor wrap="truncate-end">
                {compact ? "" : "[Home/End] Top/Bottom  [r] CoT  [o] Obs  "}
                [e] Raw  {onBack === undefined ? "" : "[Esc] History  "}[q] Exit
            </Text>
        </Box>
    );
}
