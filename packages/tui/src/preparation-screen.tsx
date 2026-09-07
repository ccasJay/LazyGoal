import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { ConfirmInput, Spinner, TextInput } from "@inkjs/ui";

import type { UiSessionViewModel } from "./types";
import { useSubmitGate } from "./use-submit-gate";
import { ErrorLine } from "./error-line";
import { StatusSpinner } from "./status-spinner";

/**
 * PreparationScreen 的渲染与用户操作回调边界。
 *
 * @remarks
 * Screen 只渲染 Controller 提供的 question/proposal 等等待状态。文本提交
 * 会先做空白校验，再把原文交给 `submitMessage`；批准不会伪造消息，直接
 * 调用 `approveTask`。业务状态转换仍由 SessionController 完成。
 *
 * @example
 * ```tsx
 * <PreparationScreen
 *   session={session}
 *   onSubmitMessage={content => controller.dispatch({ kind: "submitMessage", content })}
 *   onApproveTask={() => controller.dispatch({ kind: "approveTask" })}
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
}

/**
 * 渲染 gathering_context 问题和 planning 任务批准界面。
 *
 * @param props - Session ViewModel 与语义化命令回调。
 * @returns Ink 渲染树。
 */
export function PreparationScreen({
    session,
    onSubmitMessage,
    onApproveTask,
    onRetry,
}: PreparationScreenProps): React.JSX.Element {
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
                    onChange={setMessageValue}
                    onSubmit={handleMessageSubmit}
                />
                : null}
            {session.waitingFor === "approval"
                ? <ProposalPanel
                    busy={session.busy}
                    feedbackMode={feedbackMode}
                    proposal={session.proposal}
                    onApprove={handleApprove}
                    onFeedback={() => {
                        submitGate.clearError();
                        setFeedbackMode(true);
                    }}
                    value={messageValue}
                    inputKey={messageInputKey}
                    onChange={setMessageValue}
                    onSubmitFeedback={handleMessageSubmit}
                />
                : null}
            {showStalledPanel
                ? <StalledPanel onRetry={handleRetry} />
                : null}
            {!showStalledPanel
                && session.waitingFor !== "question"
                && session.waitingFor !== "approval"
                ? <Text color="yellow">Waiting for the next Runtime state.</Text>
                : null}
            {session.busy ? <StatusSpinner label={preparationSpinnerLabel(session.phase)} /> : null}
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

function preparationSpinnerLabel(phase: UiSessionViewModel["phase"]): string {
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
}

function QuestionPanel({
    busy,
    question,
    value,
    inputKey,
    onChange,
    onSubmit,
}: QuestionPanelProps): React.JSX.Element {
    return (
        <Box flexDirection="column" gap={1}>
            <Text bold>Agent question</Text>
            <Text>{question ?? "The agent is waiting for your answer."}</Text>
            <TextInput
                key={inputKey}
                isDisabled={busy}
                defaultValue={value}
                placeholder="Type your answer..."
                onChange={onChange}
                onSubmit={onSubmit}
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
                    <TextInput
                        key={inputKey}
                        isDisabled={busy}
                        defaultValue={value}
                        placeholder="Provide non-empty feedback..."
                        onChange={onChange}
                        onSubmit={onSubmitFeedback}
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
