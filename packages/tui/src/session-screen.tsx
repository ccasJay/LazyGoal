import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Static, Text } from "ink";
import { ConfirmInput, TextInput } from "@inkjs/ui";

import type { GoalMessage, JsonValue, PendingAction } from "../../runtime/src/index";
import type { UiSessionViewModel, UiTerminalSummary } from "./types";
import { useSubmitGate } from "./use-submit-gate";
import { StatusSpinner } from "./status-spinner";
import { truncateId } from "./format";

const MAX_ACTION_JSON_CHARS = 500;

/**
 * SessionScreen 的执行交互回调边界。
 *
 * @remarks
 * Screen 只消费 Controller 提供的不可变 Session 快照。它不会修改 Goal、推断
 * Action 状态或自行生成 actionId；批准和拒绝始终沿用快照中的同一个 Action。
 * `busy` 或终态时所有推进控件均停用，消息历史通过 Ink `Static` 保留终端
 * scrollback。
 *
 * @example
 * ```tsx
 * <SessionScreen
 *   session={session}
 *   onSubmitMessage={content => controller.dispatch({ kind: "submitMessage", content })}
 *   onApproveAction={actionId => controller.dispatch({ kind: "approveAction", actionId })}
 *   onRejectAction={(actionId, reason) => controller.dispatch({
 *     kind: "rejectAction",
 *     actionId,
 *     reason,
 *   })}
 * />
 * ```
 */
export interface SessionScreenProps {
    /** 当前单 Goal 会话的不可变 ViewModel。 */
    readonly session: UiSessionViewModel;
    /** blocked 等待点提交非空文本的恢复回调。 */
    readonly onSubmitMessage: (content: string) => void | Promise<void>;
    /** 批准当前 pending Action 的回调；参数必须来自快照中的 actionId。 */
    readonly onApproveAction: (actionId: string) => void | Promise<void>;
    /** 带理由拒绝当前 pending Action 的回调。 */
    readonly onRejectAction: (actionId: string, reason: string) => void | Promise<void>;
}

/**
 * 渲染 executing 阶段的消息、状态、Action 等待点和终态摘要。
 *
 * @param props - Session 快照与语义化恢复回调。
 * @returns Ink 渲染树。
 */
export function SessionScreen({
    session,
    onSubmitMessage,
    onApproveAction,
    onRejectAction,
}: SessionScreenProps): React.JSX.Element {
    const staticMessages = useMemo(
        () => session.messages.slice(),
        [session.messages],
    );
    const terminal = terminalFor(session);

    return (
        <Box flexDirection="column" gap={1}>
            <Static items={staticMessages}>
                {(message, index) => (
                    <MessageLine key={`${message.role}-${index}`} message={message} />
                )}
            </Static>
            <SessionStatus session={session} />
            {terminal !== undefined
                ? <TerminalPanel terminal={terminal} />
                : <SessionInteraction
                    session={session}
                    onSubmitMessage={onSubmitMessage}
                    onApproveAction={onApproveAction}
                    onRejectAction={onRejectAction}
                />}
        </Box>
    );
}

function terminalFor(session: UiSessionViewModel): UiTerminalSummary | undefined {
    if (session.terminal !== undefined) {
        return session.terminal;
    }

    return session.runStatus === "completed"
        || session.runStatus === "failed"
        || session.runStatus === "cancelled"
        ? { status: session.runStatus }
        : undefined;
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

interface SessionStatusProps {
    readonly session: UiSessionViewModel;
}

function SessionStatus({ session }: SessionStatusProps): React.JSX.Element {
    return (
        <Box flexDirection="column">
            <Text bold color="cyan">Goal {truncateId(session.goal.id)}</Text>
            <Text>
                Phase: {session.phase} | Run: {session.runStatus} | Steps: {session.stepCount}
            </Text>
            {session.checkpoint === undefined
                ? null
                : <Text>Checkpoint: {session.checkpoint}</Text>}
            {session.error === undefined
                ? null
                : <Text color="red">Error [{session.error.code}]: {session.error.message}</Text>}
            {isActiveRun(session)
                ? <StatusSpinner label={sessionSpinnerLabel(session)} />
                : null}
        </Box>
    );
}

function isActiveRun(session: UiSessionViewModel): boolean {
    return session.busy || session.runStatus === "running";
}

function sessionSpinnerLabel(session: UiSessionViewModel): string {
    if (session.runStatus === "running") {
        return "Executing step...";
    }

    switch (session.waitingFor) {
        case "action_approval":
        case "action_recovery":
            return "Advancing...";
        case "blocked":
            return "Resuming...";
        default:
            return "Processing...";
    }
}

interface SessionInteractionProps extends SessionScreenProps {
    readonly session: UiSessionViewModel;
}

function SessionInteraction({
    session,
    onSubmitMessage,
    onApproveAction,
    onRejectAction,
}: SessionInteractionProps): React.JSX.Element {
    if (session.waitingFor === "blocked") {
        return (
            <BlockedPanel
                busy={session.busy}
                {...(session.blockedReason === undefined
                    ? {}
                    : { reason: session.blockedReason })}
                onSubmit={onSubmitMessage}
            />
        );
    }

    if (
        session.waitingFor === "action_approval"
        || session.waitingFor === "action_recovery"
    ) {
        return (
            <ActionPanel
                busy={session.busy}
                recovery={session.waitingFor === "action_recovery"}
                {...(session.pendingAction === undefined
                    ? {}
                    : { pendingAction: session.pendingAction })}
                onApprove={onApproveAction}
                onReject={onRejectAction}
            />
        );
    }

    return (
        <Text color="yellow">
            {session.runStatus === "running"
                ? "The agent is working."
                : "Waiting for the next Runtime state."}
        </Text>
    );
}

interface BlockedPanelProps {
    readonly busy: boolean;
    readonly reason?: string;
    readonly onSubmit: (content: string) => void | Promise<void>;
}

function BlockedPanel({ busy, reason, onSubmit }: BlockedPanelProps): React.JSX.Element {
    const submitGate = useSubmitGate(busy, true);

    const handleSubmit = useCallback((value: string) => {
        submitGate.attempt(() => {
            void onSubmit(value);
        }, {
            value,
            emptyMessage: "Message must not be empty",
        });
    }, [onSubmit, submitGate]);

    return (
        <Box flexDirection="column" gap={1}>
            <Text bold>Agent is blocked</Text>
            <Text>{reason ?? "The agent is waiting for your input."}</Text>
            {submitGate.validationError === undefined ? null : <Text color="red">Error: {submitGate.validationError}</Text>}
            <TextInput
                isDisabled={busy}
                placeholder="Type a message to continue..."
                onSubmit={handleSubmit}
            />
        </Box>
    );
}

interface ActionPanelProps {
    readonly busy: boolean;
    readonly recovery: boolean;
    readonly pendingAction?: PendingAction;
    readonly onApprove: (actionId: string) => void | Promise<void>;
    readonly onReject: (actionId: string, reason: string) => void | Promise<void>;
}

function ActionPanel({
    busy,
    recovery,
    pendingAction,
    onApprove,
    onReject,
}: ActionPanelProps): React.JSX.Element {
    const [feedbackMode, setFeedbackMode] = useState(false);
    const actionId = pendingAction?.action.actionId;
    const resetKey = useMemo(
        () => [actionId, recovery],
        [actionId, recovery],
    );
    const submitGate = useSubmitGate(busy, resetKey);

    useEffect(() => {
        setFeedbackMode(false);
    }, [resetKey]);

    const handleApprove = useCallback(() => {
        if (actionId === undefined) {
            return;
        }

        submitGate.attempt(() => {
            void onApprove(actionId);
        });
    }, [actionId, onApprove, submitGate]);

    const handleReject = useCallback((reason: string) => {
        if (actionId === undefined) {
            return;
        }

        submitGate.attempt(() => {
            void onReject(actionId, reason);
        }, {
            value: reason,
            emptyMessage: "Rejection reason must not be empty",
        });
    }, [actionId, onReject, submitGate]);

    return (
        <Box flexDirection="column" gap={1}>
            <Text bold color={recovery ? "yellow" : "cyan"}>
                {recovery ? "Action outcome unknown" : "Action approval required"}
            </Text>
            {recovery
                ? <Text color="yellow">
                    The previous action may have run. Approving can replay the same action.
                </Text>
                : <Text>The agent wants to run the following Action:</Text>}
            {pendingAction === undefined
                ? <Text color="red">Action details are unavailable.</Text>
                : <ActionDetails action={pendingAction.action} />}
            {submitGate.validationError === undefined ? null : <Text color="red">Error: {submitGate.validationError}</Text>}
            {actionId === undefined ? null : feedbackMode ? (
                <Box flexDirection="column" gap={1}>
                    <Text>Why should this Action be rejected?</Text>
                    <TextInput
                        isDisabled={busy}
                        placeholder="Provide a non-empty reason..."
                        onSubmit={handleReject}
                    />
                </Box>
            ) : (
                <Box flexDirection="column" gap={1}>
                    <ConfirmInput
                        submitOnEnter={false}
                        isDisabled={busy}
                        onConfirm={handleApprove}
                        onCancel={() => {
                            submitGate.clearError();
                            setFeedbackMode(true);
                        }}
                    />
                    <Text dimColor>Press Y to approve or N to reject with a reason.</Text>
                </Box>
            )}
        </Box>
    );
}

interface ActionDetailsProps {
    readonly action: PendingAction["action"];
}

function ActionDetails({ action }: ActionDetailsProps): React.JSX.Element {
    return (
        <Box flexDirection="column">
            <Text>Action ID: {action.actionId}</Text>
            <Text>Tool: {action.toolId}</Text>
            <Text>Input:</Text>
            <Text>{formatJson(action.input)}</Text>
        </Box>
    );
}

function formatJson(value: JsonValue): string {
    const serialized = JSON.stringify(value, null, 2);
    if (serialized.length <= MAX_ACTION_JSON_CHARS) {
        return serialized;
    }

    return `${serialized.slice(0, MAX_ACTION_JSON_CHARS)}… (${serialized.length - MAX_ACTION_JSON_CHARS} chars truncated)`;
}

interface TerminalPanelProps {
    readonly terminal: NonNullable<UiSessionViewModel["terminal"]>;
}

function TerminalPanel({ terminal }: TerminalPanelProps): React.JSX.Element {
    return (
        <Box flexDirection="column" gap={1}>
            <Text bold color={terminal.status === "completed" ? "green" : "red"}>
                Run {terminal.status}
            </Text>
            {terminal.summary === undefined ? null : <Text>Summary: {terminal.summary}</Text>}
            {terminal.reason === undefined ? null : <Text>Reason: {terminal.reason}</Text>}
            <Text dimColor>No further input is accepted for this Goal.</Text>
        </Box>
    );
}
