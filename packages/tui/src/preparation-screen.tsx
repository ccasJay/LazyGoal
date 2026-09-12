import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Static, Text, useInput } from "ink";
import { ConfirmInput, Spinner, TextInput } from "@inkjs/ui";

import type { GoalMessage } from "../../runtime/src/index";
import type { UiSessionViewModel, UiStepSummary } from "./types";
import { useSubmitGate } from "./use-submit-gate";
import { ErrorLine } from "./error-line";
import { StatusSpinner } from "./status-spinner";
import { StepWaterfallItem } from "./step-waterfall-item";
import { CommandAwareTextInput } from "./command-aware-text-input";
import type { ModelCommandEffect } from "../../slash-command/src/index.js";

/** PreparationScreen timeline 中展示的项目类型联合。 */
export type PreparationTimelineItem =
    | { readonly kind: "message"; readonly id: string; readonly message: GoalMessage }
    | { readonly kind: "step"; readonly id: string; readonly step: UiStepSummary };

/**
 * 累积并返回准备阶段的时间线项目（消息与只读探查步骤）。
 *
 * @param session - 当前单 Goal 会话的不可变 ViewModel。
 * @returns 供 `<Static>` 固化渲染的时间线项目数组。
 */
export function usePreparationTimelineItems(session: UiSessionViewModel): PreparationTimelineItem[] {
    const goalIdRef = useRef(session.goal.id);
    const seenMessageCountRef = useRef(0);
    const seenStepIdsRef = useRef<Set<string>>(new Set());
    const itemsRef = useRef<PreparationTimelineItem[]>([]);

    if (goalIdRef.current !== session.goal.id) {
        goalIdRef.current = session.goal.id;
        seenMessageCountRef.current = 0;
        seenStepIdsRef.current = new Set();
        itemsRef.current = [];
    }

    let hasNewItems = false;
    const currentItems = itemsRef.current;

    if (session.messages.length > seenMessageCountRef.current) {
        for (let i = seenMessageCountRef.current; i < session.messages.length; i++) {
            const message = session.messages[i]!;
            currentItems.push({
                kind: "message",
                id: `msg-${session.goal.id}-${i}`,
                message,
            });
        }
        seenMessageCountRef.current = session.messages.length;
        hasNewItems = true;
    }

    const steps = session.preparationSteps ?? session.committedSteps;
    if (steps !== undefined) {
        for (const step of steps) {
            const stepKey = step.actionId || String(step.stepNumber);
            if (!seenStepIdsRef.current.has(stepKey)) {
                seenStepIdsRef.current.add(stepKey);
                currentItems.push({
                    kind: "step",
                    id: `step-${session.goal.id}-${stepKey}`,
                    step,
                });
                hasNewItems = true;
            }
        }
    }

    const snapshotRef = useRef<PreparationTimelineItem[]>(currentItems.slice());
    if (hasNewItems) {
        snapshotRef.current = currentItems.slice();
    }

    return snapshotRef.current;
}

/**
 * PreparationScreen 的渲染与用户操作回调边界。
 *
 * @remarks
 * Screen 引入 Ink `<Static>` 输出准备阶段的历史消息与只读探查步骤，
 * 下方活动抽屉整洁切换展示 Spinner、Question 或 Proposal 交互面板。
 *
 * @example
 * ```tsx
 * <PreparationScreen
 *   session={session}
 *   onSubmitMessage={content => controller.dispatch({ kind: "submitMessage", content })}
 *   onApproveTask={() => controller.dispatch({ kind: "approveTask" })}
 *   onRetry={() => controller.dispatch({ kind: "retryPreparation" })}
 * />
 * ```
 */
export interface PreparationScreenProps {
    /** 当前单 Goal 会话的不可变 ViewModel。 */
    readonly session: UiSessionViewModel;
    /** 非空文本恢复 question 或提交 proposal 反馈。 */
    readonly onSubmitMessage: (content: string) => void | Promise<void>;
    /** 批准当前 planning proposal。 */
    readonly onApproveTask: () => void | Promise<void>;
    /**
     * 重新推进一个停滞的 Preparation 阶段。
     *
     * @remarks
     * 只有 `session.preparationStalled` 为 `true` 时屏幕上才会出现重试入口，
     * 因此该回调仅在停滞态被调用；实现应把命令交给 Controller 串行处理，
     * 不应直接调用 Runtime。
     */
    readonly onRetry: () => void | Promise<void>;
    /** Slash 命令派发产生的领域副作用回调。 */
    readonly onCommandEffect?: ((effect: ModelCommandEffect) => void | Promise<void>) | undefined;
}

/**
 * 渲染 gathering_context 问题和 planning 任务批准界面，上方包含只读探查瀑布流。
 *
 * @param props - Session ViewModel 与语义化命令回调。
 * @returns Ink 渲染树。
 */
export function PreparationScreen({
    session,
    onSubmitMessage,
    onApproveTask,
    onRetry,
    onCommandEffect,
}: PreparationScreenProps): React.JSX.Element {
    const timelineItems = usePreparationTimelineItems(session);
    const [feedbackMode, setFeedbackMode] = useState(false);
    const [messageValue, setMessageValue] = useState("");
    const [messageInputKey, setMessageInputKey] = useState(0);
    const resetInitialized = useRef(false);
    const resetKey = useMemo(
        () => [
            session.goal.id,
            session.waitingFor,
            session.preparationStalled,
            session.proposal?.objective,
        ],
        [
            session.goal.id,
            session.preparationStalled,
            session.proposal?.objective,
            session.waitingFor,
        ],
    );
    const submitGate = useSubmitGate(session.busy, resetKey);

    const clearMessageInput = useCallback(() => {
        setMessageValue("");
        setMessageInputKey((key) => key + 1);
    }, []);

    useEffect(() => {
        if (!resetInitialized.current) {
            resetInitialized.current = true;
            return;
        }

        setFeedbackMode(false);
        clearMessageInput();
    }, [clearMessageInput, resetKey]);

    const handleMessageSubmit = useCallback((value: string) => {
        submitGate.attempt(() => {
            void onSubmitMessage(value);
            clearMessageInput();
        }, {
            value,
            emptyMessage: "Message must not be empty",
        });
    }, [clearMessageInput, onSubmitMessage, submitGate]);

    const handleApprove = useCallback(() => {
        submitGate.attempt(() => {
            void onApproveTask();
        });
    }, [onApproveTask, submitGate]);

    const handleRetry = useCallback(() => {
        submitGate.attempt(() => {
            void onRetry();
        });
    }, [onRetry, submitGate]);

    // `preparationStalled` 只描述快照事实；是否已有异步推进由活字段 `busy`
    // 表达，因此重试入口必须在此处结合 `busy` 实时判断，避免推进进行中闪现。
    const showStalledPanel = session.preparationStalled === true && !session.busy;

    const errorView = submitGate.validationError !== undefined
        ? { message: submitGate.validationError }
        : session.error;

    return (
        <Box flexDirection="column" gap={1}>
            <Static items={timelineItems}>
                {(item) =>
                    item.kind === "message" ? (
                        <MessageLine key={item.id} message={item.message} />
                    ) : (
                        <StepWaterfallItem key={item.id} step={item.step} />
                    )
                }
            </Static>
            <PreparationActiveDrawer
                session={session}
                errorView={errorView}
                messageValue={messageValue}
                messageInputKey={messageInputKey}
                feedbackMode={feedbackMode}
                showStalledPanel={showStalledPanel}
                onMessageChange={setMessageValue}
                onMessageSubmit={handleMessageSubmit}
                onApprove={handleApprove}
                onFeedback={() => {
                    submitGate.clearError();
                    setFeedbackMode(true);
                }}
                onRetry={handleRetry}
                {...(onCommandEffect === undefined ? {} : { onCommandEffect })}
            />
        </Box>
    );
}

interface PreparationActiveDrawerProps {
    readonly session: UiSessionViewModel;
    readonly errorView?: { readonly code?: string; readonly message: string } | undefined;
    readonly messageValue: string;
    readonly messageInputKey: number;
    readonly feedbackMode: boolean;
    readonly showStalledPanel: boolean;
    readonly onMessageChange: (value: string) => void;
    readonly onMessageSubmit: (value: string) => void;
    readonly onApprove: () => void;
    readonly onFeedback: () => void;
    readonly onRetry: () => void;
    readonly onCommandEffect?: ((effect: ModelCommandEffect) => void | Promise<void>) | undefined;
}

function PreparationActiveDrawer({
    session,
    errorView,
    messageValue,
    messageInputKey,
    feedbackMode,
    showStalledPanel,
    onMessageChange,
    onMessageSubmit,
    onApprove,
    onFeedback,
    onRetry,
    onCommandEffect,
}: PreparationActiveDrawerProps): React.JSX.Element {
    return (
        <Box flexDirection="column" gap={1}>
            <Text bold color="cyan">Goal {session.goal.id}</Text>
            {errorView === undefined ? null : <ErrorLine error={errorView} />}
            {session.waitingFor === "question"
                ? <QuestionPanel
                    busy={session.busy}
                    {...(session.question === undefined
                        ? {}
                        : { question: session.question })}
                    value={messageValue}
                    inputKey={messageInputKey}
                    onChange={onMessageChange}
                    onSubmit={onMessageSubmit}
                    {...(onCommandEffect === undefined ? {} : { onCommandEffect })}
                />
                : null}
            {session.waitingFor === "approval"
                ? <ProposalPanel
                    busy={session.busy}
                    feedbackMode={feedbackMode}
                    proposal={session.proposal}
                    onApprove={onApprove}
                    onFeedback={onFeedback}
                    value={messageValue}
                    inputKey={messageInputKey}
                    onChange={onMessageChange}
                    onSubmitFeedback={onMessageSubmit}
                    {...(onCommandEffect === undefined ? {} : { onCommandEffect })}
                />
                : null}
            {showStalledPanel
                ? <StalledPanel onRetry={onRetry} />
                : null}
            {!showStalledPanel
                && session.waitingFor !== "question"
                && session.waitingFor !== "approval"
                ? <Text color="yellow">Waiting for the next Runtime state.</Text>
                : null}
            {session.busy ? (
                <StatusSpinner
                    label={preparationSpinnerLabel(session.phase, session.activeProbeDescription)}
                />
            ) : null}
        </Box>
    );
}

interface MessageLineProps {
    readonly message: GoalMessage;
}

function MessageLine({ message }: MessageLineProps): React.JSX.Element {
    return (
        <Box flexDirection="column">
            <Text bold color={message.role === "user" ? "green" : "cyan"}>
                {message.role === "user" ? "User" : "Agent"}
            </Text>
            <Text>{message.content}</Text>
        </Box>
    );
}

/**
 * Preparation 中断面板的渲染属性。
 *
 * @example
 * ```tsx
 * <StalledPanel busy={false} onRetry={() => dispatch({ kind: "retryPreparation" })} />
 * ```
 */
interface StalledPanelProps {
    /** 用户确认重试时的回调。 */
    readonly onRetry: () => void;
}

/**
 * 渲染 Preparation 被中断后的说明与重试入口。
 *
 * @remarks
 * 该面板只在 Goal 停滞于「推进已开始但未产出等待点」的中间态时出现；此时
 * Goal 不在等待用户输入，Runtime 会拒绝 `resume`，重试是唯一的自助恢复方式。
 * 面板只发出重试意图，不直接推进 Runtime。
 *
 * 重试是此状态下唯一有意义的操作，因此这里监听 `Y` 键而不使用确认/取消
 * 二选一控件，避免向用户暗示一个并不存在的取消语义。按键不是 `Y`/`y` 时
 * 忽略输入；是否可重试由父组件根据 `busy` 决定是否渲染本面板。
 *
 * @param props - 重试回调。
 * @returns Ink 渲染树。
 */
function StalledPanel({ onRetry }: StalledPanelProps): React.JSX.Element {
    useInput((input) => {
        if (input !== "y" && input !== "Y") {
            return;
        }

        onRetry();
    });

    return (
        <Box flexDirection="column" gap={1}>
            <Text color="yellow">Preparation was interrupted before it produced a response.</Text>
            <Text dimColor>
                This Goal is not waiting for your input, so answering will be rejected.
            </Text>
            <Text dimColor>Press Y to retry the interrupted preparation.</Text>
        </Box>
    );
}

/**
 * 依据当前阶段与可选探查说明生成 Preparation 状态 Spinner 文案。
 *
 * @param phase - 当前生命周期阶段。
 * @param activeProbeDescription - 可选的正在执行探查操作说明。
 * @returns 面向终端用户的进行中文案。
 */
export function preparationSpinnerLabel(
    phase: UiSessionViewModel["phase"],
    activeProbeDescription?: string,
): string {
    if (activeProbeDescription !== undefined) {
        return activeProbeDescription;
    }
    switch (phase) {
        case "gathering_context":
            return "Gathering context...";
        case "planning":
            return "Planning...";
        default:
            return "Processing...";
    }
}

interface QuestionPanelProps {
    readonly busy: boolean;
    readonly question?: string;
    readonly value: string;
    readonly inputKey: number;
    readonly onChange: (value: string) => void;
    readonly onSubmit: (value: string) => void;
    readonly onCommandEffect?: ((effect: ModelCommandEffect) => void | Promise<void>) | undefined;
}

function QuestionPanel({
    busy,
    question,
    value,
    inputKey,
    onChange,
    onSubmit,
    onCommandEffect,
}: QuestionPanelProps): React.JSX.Element {
    return (
        <Box flexDirection="column" gap={1}>
            <Text bold>Agent question</Text>
            <Text>{question ?? "The agent is waiting for your answer."}</Text>
            <CommandAwareTextInput
                key={inputKey}
                isDisabled={busy}
                defaultValue={value}
                placeholder="Type your answer..."
                onChange={onChange}
                onSubmit={onSubmit}
                {...(onCommandEffect === undefined ? {} : { onCommandEffect })}
            />
        </Box>
    );
}

interface ProposalPanelProps {
    readonly busy: boolean;
    readonly feedbackMode: boolean;
    readonly proposal: UiSessionViewModel["proposal"];
    readonly value: string;
    readonly inputKey: number;
    readonly onChange: (value: string) => void;
    readonly onApprove: () => void;
    readonly onFeedback: () => void;
    readonly onSubmitFeedback: (value: string) => void;
    readonly onCommandEffect?: ((effect: ModelCommandEffect) => void | Promise<void>) | undefined;
}

function ProposalPanel({
    busy,
    feedbackMode,
    proposal,
    value,
    inputKey,
    onChange,
    onApprove,
    onFeedback,
    onSubmitFeedback,
    onCommandEffect,
}: ProposalPanelProps): React.JSX.Element {
    return (
        <Box flexDirection="column" gap={1}>
            <Text bold>Task proposal</Text>
            <Text>{proposal?.objective ?? "The agent has not provided a task proposal."}</Text>
            {proposal !== undefined ? (
                <Box flexDirection="column">
                    <Text>Completion criteria:</Text>
                    {proposal.completionCriteria.map((criterion) => (
                        <Text key={criterion.text}>• {criterion.text}</Text>
                    ))}
                </Box>
            ) : null}
            {feedbackMode ? (
                <Box flexDirection="column" gap={1}>
                    <Text>Describe the changes you want:</Text>
                    <CommandAwareTextInput
                        key={inputKey}
                        isDisabled={busy}
                        defaultValue={value}
                        placeholder="Provide non-empty feedback..."
                        onChange={onChange}
                        onSubmit={onSubmitFeedback}
                        {...(onCommandEffect === undefined ? {} : { onCommandEffect })}
                    />
                </Box>
            ) : (
                <Box flexDirection="column" gap={1}>
                    <ConfirmInput
                        submitOnEnter={false}
                        isDisabled={busy}
                        onConfirm={onApprove}
                        onCancel={onFeedback}
                    />
                    <Text dimColor>Press Y to approve or N to provide feedback.</Text>
                </Box>
            )}
        </Box>
    );
}
