import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text } from "ink";
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
}: PreparationScreenProps): React.JSX.Element {
    const [feedbackMode, setFeedbackMode] = useState(false);
    const resetKey = useMemo(
        () => [session.goal.id, session.waitingFor, session.proposal?.objective],
        [session.goal.id, session.proposal?.objective, session.waitingFor],
    );
    const submitGate = useSubmitGate(session.busy, resetKey);

    useEffect(() => {
        setFeedbackMode(false);
    }, [resetKey]);

    const handleMessageSubmit = useCallback((value: string) => {
        submitGate.attempt(() => {
            void onSubmitMessage(value);
        }, {
            value,
            emptyMessage: "Message must not be empty",
        });
    }, [onSubmitMessage, submitGate]);

    const handleApprove = useCallback(() => {
        submitGate.attempt(() => {
            void onApproveTask();
        });
    }, [onApproveTask, submitGate]);

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
                    onSubmitFeedback={handleMessageSubmit}
                />
                : null}
            {session.waitingFor !== "question" && session.waitingFor !== "approval"
                ? <Text color="yellow">Waiting for the next Runtime state.</Text>
                : null}
            {session.busy ? <StatusSpinner label={preparationSpinnerLabel(session.phase)} /> : null}
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
    readonly onSubmit: (value: string) => void;
}

function QuestionPanel({ busy, question, onSubmit }: QuestionPanelProps): React.JSX.Element {
    return (
        <Box flexDirection="column" gap={1}>
            <Text bold>Agent question</Text>
            <Text>{question ?? "The agent is waiting for your answer."}</Text>
            <TextInput
                isDisabled={busy}
                placeholder="Type your answer..."
                onSubmit={onSubmit}
            />
        </Box>
    );
}

interface ProposalPanelProps {
    readonly busy: boolean;
    readonly feedbackMode: boolean;
    readonly proposal: UiSessionViewModel["proposal"];
    readonly onApprove: () => void;
    readonly onFeedback: () => void;
    readonly onSubmitFeedback: (value: string) => void;
}

function ProposalPanel({
    busy,
    feedbackMode,
    proposal,
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
                        <Text key={criterion}>• {criterion}</Text>
                    ))}
                </Box>
            ) : null}
            {feedbackMode ? (
                <Box flexDirection="column" gap={1}>
                    <Text>Describe the changes you want:</Text>
                    <TextInput
                        isDisabled={busy}
                        placeholder="Provide non-empty feedback..."
                        onSubmit={onSubmitFeedback}
                    />
                </Box>
            ) : (
                <Box flexDirection="column" gap={1}>
                    <ConfirmInput
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
