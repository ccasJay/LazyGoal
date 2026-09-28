import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Static, Text, useInput } from "ink";
import { Select } from "@inkjs/ui";

import type { GoalMessage, JsonValue, PendingAction } from "../../runtime/src/index";
import type { UiSessionViewModel, UiStepSummary, UiTerminalSummary, UiTimelineItem } from "./types";
import { useSubmitGate } from "./use-submit-gate";
import { StatusSpinner } from "./status-spinner";
import { truncateId } from "./format";
import { StepWaterfallItem } from "./step-waterfall-item";
import { ErrorLine } from "./error-line";
import type { ModelCommandEffect } from "../../slash-command/src/index.js";
import { CommandAwareTextInput } from "./command-aware-text-input";
import { MarkdownRenderer } from "./markdown-renderer";
import type { AskUserAnswer } from "../../contracts/src/index";
import { AskUserPanel } from "./ask-user-panel";
import { TaskProposalPanel } from "./task-proposal-panel";
import { PlanPanel } from "./plan-panel";

const MAX_ACTION_JSON_CHARS = 500;

function resolveTimelineItems(session: UiSessionViewModel): readonly UiTimelineItem[] {
    if (session.timeline !== undefined) {
        return session.timeline;
    }
    const fallback: UiTimelineItem[] = [];
    for (let i = 0; i < session.messages.length; i++) {
        const message = session.messages[i]!;
        fallback.push({
            kind: "message",
            id: `msg-${session.goal.id}-${i}`,
            message,
        });
    }
    if (session.committedSteps !== undefined) {
        for (const step of session.committedSteps) {
            fallback.push({
                kind: "step",
                id: `step-${session.goal.id}-${step.stepNumber}`,
                step,
            });
        }
    }
    return fallback;
}

/**
 * SessionScreen 的执行交互回调边界。
 *
 * @remarks
 * Screen 只消费 Controller 提供的不可变 Session 快照。它不会修改 Goal、推断
 * Action 状态或自行生成 actionId；批准和拒绝始终沿用快照中的同一个 Action。
 * `busy` 或终态时所有推进控件均停用，消息历史与已完成步骤通过 Ink `Static`
 * 保留终端 scrollback。
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
 *   onToggleExecutionMode={() => controller.dispatch({ kind: "toggleExecutionMode" })}
 * />
 * ```
 */
export interface SessionScreenProps {
    /** 当前单 Goal 会话的不可变 ViewModel。 */
    readonly session: UiSessionViewModel;
    /** blocked 等待点恢复当前 Run，或 completed Run 创建下一 Run 的非空输入回调。 */
    readonly onSubmitMessage: (content: string) => void | Promise<void>;
    /** 批准当前 pending Action 的回调；参数必须来自快照中的 actionId。 */
    readonly onApproveAction: (actionId: string) => void | Promise<void>;
    /** 按审批期限批准当前 Action。 */
    readonly onApproveActionWithScope?: (actionId: string, scope: "action" | "goal" | "workspace") => void | Promise<void>;
    /** 打开授权管理页。 */
    readonly onOpenToolPermissions?: () => void | Promise<void>;
    /** 带理由拒绝当前 pending Action 的回调。 */
    readonly onRejectAction: (actionId: string, reason: string) => void | Promise<void>;
    /** 切换 YOLO / Confirm 协同模式的回调。 */
    readonly onToggleExecutionMode?: () => void | Promise<void>;
    /** Slash 命令派发产生的领域副作用回调。 */
    readonly onCommandEffect?: ((effect: ModelCommandEffect) => void | Promise<void>) | undefined;
    /** 回答 Agent 发起的 ask_user 结构化问卷。 */
    readonly onAnswerAskUser?: (requestId: string, answers: readonly AskUserAnswer[]) => void | Promise<void>;
    /** 使用当前提案 request ID 批准任务并推进执行。 */
    readonly onApproveTask?: (requestId: string) => void | Promise<void>;
    /** 使用当前提案 request ID 提交反馈并重新规划。 */
    readonly onFeedbackTask?: (requestId: string, feedback: string) => void | Promise<void>;
}

/**
 * 渲染 executing 阶段的瀑布流历史（消息与步骤）以及底部的动态活动抽屉。
 *
 * @param props - Session 快照与语义化恢复回调。
 * @returns Ink 渲染树。
 */
export function SessionScreen({
    session,
    onSubmitMessage,
    onApproveAction,
    onApproveActionWithScope,
    onRejectAction,
    onToggleExecutionMode,
    onOpenToolPermissions,
    onCommandEffect,
    onAnswerAskUser,
    onApproveTask,
    onFeedbackTask,
}: SessionScreenProps): React.JSX.Element {
    const timelineItems = [...resolveTimelineItems(session)];
    useInput((_input, key) => {
        if (key.shift && key.tab) {
            void onToggleExecutionMode?.();
        }
        if (key.ctrl && _input.toLowerCase() === "g") void onOpenToolPermissions?.();
    }, { isActive: session.terminal === undefined && (onToggleExecutionMode !== undefined || onOpenToolPermissions !== undefined) });

    return (
        <Box flexDirection="column" gap={1}>
            <Static items={timelineItems}>
                {(item) => {
                    if (item.kind === "message") {
                        return <MessageLine key={item.id} message={item.message} />;
                    }
                    if (item.kind === "assistant_markdown") {
                        return (
                            <Box key={item.id} flexDirection="column">
                                {item.showAuthor ? (
                                    <Text bold color="cyan">
                                        Agent
                                    </Text>
                                ) : null}
                                <MarkdownRenderer content={item.block} />
                            </Box>
                        );
                    }
                    return <StepWaterfallItem key={item.id} step={item.step} />;
                }}
            </Static>
            {session.streamingTail !== undefined && session.streamingTail.content.length > 0 ? (
                <Box flexDirection="column">
                    {session.streamingTail.showAuthor ? (
                        <Text bold color="cyan">
                            Agent
                        </Text>
                    ) : null}
                    <MarkdownRenderer content={session.streamingTail.content} />
                </Box>
            ) : null}
            {session.goal.state.goalPlan !== undefined ? (
                <PlanPanel plan={session.goal.state.goalPlan} />
            ) : null}
            <ActiveDrawer
                session={session}
                onSubmitMessage={onSubmitMessage}
                onApproveAction={onApproveAction}
                {...(onApproveActionWithScope === undefined ? {} : { onApproveActionWithScope })}
                onRejectAction={onRejectAction}
                {...(onOpenToolPermissions === undefined ? {} : { onOpenToolPermissions })}
                {...(onToggleExecutionMode === undefined ? {} : { onToggleExecutionMode })}
                {...(onCommandEffect === undefined ? {} : { onCommandEffect })}
                {...(onAnswerAskUser === undefined ? {} : { onAnswerAskUser })}
                {...(onApproveTask === undefined ? {} : { onApproveTask })}
                {...(onFeedbackTask === undefined ? {} : { onFeedbackTask })}
            />
        </Box>
    );
}

/**
 * 底部动态活动抽屉的展示与交互契约。
 *
 * @remarks
 * ActiveDrawer 负责渲染执行状态头部、正在运行的 Spinner、以及当前交互或终态面板。
 * 它不包含历史消息与已提交步骤（由上层 Static 瀑布流管理），避免了终端原地擦除。
 *
 * @example
 * ```tsx
 * <ActiveDrawer
 *   session={session}
 *   onSubmitMessage={handleSubmit}
 *   onApproveAction={handleApprove}
 *   onRejectAction={handleReject}
 * />
 * ```
 */
export interface ActiveDrawerProps {
    /** 当前单 Goal 会话的不可变 ViewModel。 */
    readonly session: UiSessionViewModel;
    /** blocked 等待点恢复当前 Run，或 completed Run 创建下一 Run 的非空输入回调。 */
    readonly onSubmitMessage: (content: string) => void | Promise<void>;
    /** 批准当前 pending Action 的回调；参数必须来自快照中的 actionId。 */
    readonly onApproveAction: (actionId: string) => void | Promise<void>;
    /** 按审批期限批准当前 Action。 */
    readonly onApproveActionWithScope?: (actionId: string, scope: "action" | "goal" | "workspace") => void | Promise<void>;
    /** 带理由拒绝当前 pending Action 的回调。 */
    readonly onRejectAction: (actionId: string, reason: string) => void | Promise<void>;
    /** 打开授权管理页。 */
    readonly onOpenToolPermissions?: () => void | Promise<void>;
    /** 切换 YOLO / Confirm 协同模式的回调。 */
    readonly onToggleExecutionMode?: () => void | Promise<void>;
    readonly onCommandEffect?: ((effect: ModelCommandEffect) => void | Promise<void>) | undefined;
    /** 回答 Agent 发起的 ask_user 结构化问卷。 */
    readonly onAnswerAskUser?: (requestId: string, answers: readonly AskUserAnswer[]) => void | Promise<void>;
    /** 使用当前提案 request ID 批准任务并推进执行。 */
    readonly onApproveTask?: (requestId: string) => void | Promise<void>;
    /** 使用当前提案 request ID 提交反馈并重新规划。 */
    readonly onFeedbackTask?: (requestId: string, feedback: string) => void | Promise<void>;
}

/**
 * 渲染底部的动态活动抽屉。
 *
 * @param props - Session 快照与语义化恢复回调。
 * @returns Ink 渲染树。
 */
export function ActiveDrawer({
    session,
    onSubmitMessage,
    onApproveAction,
    onApproveActionWithScope,
    onRejectAction,
    onOpenToolPermissions,
    onToggleExecutionMode,
    onCommandEffect,
    onAnswerAskUser,
    onApproveTask,
    onFeedbackTask,
}: ActiveDrawerProps): React.JSX.Element {
    const terminal = terminalFor(session);

    return (
        <Box flexDirection="column" gap={1}>
            <SessionStatus
                session={session}
                {...(onToggleExecutionMode === undefined ? {} : { onToggleExecutionMode })}
                {...(onOpenToolPermissions === undefined ? {} : { onOpenToolPermissions })}
            />
            {terminal !== undefined ? (
                <TerminalPanel
                    terminal={terminal}
                    busy={session.busy}
                    onSubmitMessage={onSubmitMessage}
                />
            ) : (
                <SessionInteraction
                    session={session}
                    onSubmitMessage={onSubmitMessage}
                    onApproveAction={onApproveAction}
                    {...(onApproveActionWithScope === undefined ? {} : { onApproveActionWithScope })}
                    onRejectAction={onRejectAction}
                    {...(onCommandEffect === undefined ? {} : { onCommandEffect })}
                    {...(onAnswerAskUser === undefined ? {} : { onAnswerAskUser })}
                    {...(onApproveTask === undefined ? {} : { onApproveTask })}
                    {...(onFeedbackTask === undefined ? {} : { onFeedbackTask })}
                />
            )}
        </Box>
    );
}

function terminalFor(session: UiSessionViewModel): UiTerminalSummary | undefined {
    return session.terminal;
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
            {message.role === "assistant" ? (
                <MarkdownRenderer content={message.content} />
            ) : (
                <Text>{message.content}</Text>
            )}
        </Box>
    );
}

interface SessionStatusProps {
    readonly session: UiSessionViewModel;
    readonly onToggleExecutionMode?: () => void | Promise<void>;
    readonly onOpenToolPermissions?: () => void | Promise<void>;
}

function SessionStatus({ session, onToggleExecutionMode, onOpenToolPermissions }: SessionStatusProps): React.JSX.Element {
    const executionMode = session.executionMode ?? "confirm";
    return (
        <Box flexDirection="column">
            <Text bold color="cyan">
                Goal {truncateId(session.goal.id)}
                {` [${executionMode.toUpperCase()}]`}
                {session.mode !== undefined ? ` [${session.mode.toUpperCase()}]` : ""}
                {session.taskTitle !== undefined ? ` - ${session.taskTitle}` : ""}
            </Text>
            <Text>
                Phase: {session.phase} | Run: {session.runStatus} | Steps: {session.stepCount}
            </Text>
            {onOpenToolPermissions === undefined ? null : <Text dimColor>[Ctrl+G] Tool permissions</Text>}
            {session.cleaning ? (
                <Text color="magenta">Cleaning up sandbox resources...</Text>
            ) : null}
            {session.error === undefined
                ? null
                : <ErrorLine error={session.error} />}
            {session.lastCommittedAction !== undefined ? (
                <Text color="gray">
                    Last Action: [{session.lastCommittedAction.toolId}] ({session.lastCommittedAction.actionId})
                </Text>
            ) : null}
            {session.lastCommittedObservation !== undefined ? (
                <Text color="gray">
                    Last Observation: [{session.lastCommittedObservation.toolId}] {session.lastCommittedObservation.status}
                </Text>
            ) : null}
            {session.liveActivity !== undefined ? (
                <Box flexDirection="column">
                    <Text color="yellow">
                        {session.liveActivity.label}
                        {session.liveActivity.toolId === undefined ? "" : ` [${session.liveActivity.toolId}]`}
                    </Text>
                    {session.liveActivity.output === undefined || session.liveActivity.output.length === 0
                        ? null
                        : <Text color="gray">{session.liveActivity.output}</Text>}
                </Box>
            ) : null}
            {isActiveRun(session)
                ? <StatusSpinner label={sessionSpinnerLabel(session)} />
                : null}
            {session.terminal === undefined ? <Text dimColor>
                {executionMode === "yolo"
                    ? "[Shift+Tab] Confirm at next approval  [Ctrl+C] Stop"
                    : "[Shift+Tab] Enable YOLO  [Ctrl+C] Stop"}
            </Text> : null}
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
        case "ask_user":
            return "Waiting for user input...";
        case "task_approval":
            return "Waiting for task approval...";
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
    onApproveActionWithScope,
    onRejectAction,
    onCommandEffect,
    onAnswerAskUser,
    onApproveTask,
    onFeedbackTask,
}: SessionInteractionProps): React.JSX.Element {
    if (session.waitingFor === "ask_user" && session.askUser !== undefined) {
        return (
            <AskUserPanel
                requestId={session.askUser.requestId}
                mode={session.askUser.mode}
                questions={session.askUser.questions}
                busy={session.busy}
                onSubmit={(answers) => onAnswerAskUser?.(session.askUser!.requestId, answers)}
                {...(onCommandEffect === undefined ? {} : { onCommandEffect })}
            />
        );
    }

    if (session.waitingFor === "task_approval"
        && session.proposal !== undefined
        && session.proposalRequestId !== undefined) {
        return (
            <TaskProposalPanel
                proposal={session.proposal}
                requestId={session.proposalRequestId}
                {...(session.approvalRequest !== undefined ? { approvalRequest: session.approvalRequest } : {})}
                busy={session.busy}
                onApprove={(reqId) => onApproveTask?.(reqId)}
                onFeedback={(reqId, feedback) => onFeedbackTask?.(reqId, feedback)}
                {...(onCommandEffect === undefined ? {} : { onCommandEffect })}
            />
        );
    }

    if (session.waitingFor === "blocked") {
        return (
            <BlockedPanel
                busy={session.busy}
                {...(session.blockedReason === undefined
                    ? {}
                    : { reason: session.blockedReason })}
                onSubmit={onSubmitMessage}
                {...(onCommandEffect === undefined ? {} : { onCommandEffect })}
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
                    {...(onApproveActionWithScope === undefined ? {} : { onApproveWithScope: onApproveActionWithScope })}
                onReject={onRejectAction}
                {...(onCommandEffect === undefined ? {} : { onCommandEffect })}
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
    readonly onCommandEffect?: ((effect: ModelCommandEffect) => void | Promise<void>) | undefined;
}

function BlockedPanel({ busy, reason, onSubmit, onCommandEffect }: BlockedPanelProps): React.JSX.Element {
    const [value, setValue] = useState("");
    const [inputKey, setInputKey] = useState(0);
    const submitGate = useSubmitGate(busy, true);

    const clearInput = useCallback(() => {
        setValue("");
        setInputKey((key) => key + 1);
    }, []);

    const handleSubmit = useCallback((value: string) => {
        submitGate.attempt(() => {
            void onSubmit(value);
            clearInput();
        }, {
            value,
            emptyMessage: "Message must not be empty",
        });
    }, [clearInput, onSubmit, submitGate]);

    return (
        <Box flexDirection="column" gap={1}>
            <Text bold>Agent is blocked</Text>
            <Text>{reason ?? "The agent is waiting for your input."}</Text>
            {submitGate.validationError === undefined ? null : <Text color="red">Error: {submitGate.validationError}</Text>}
            <CommandAwareTextInput
                key={inputKey}
                isDisabled={busy}
                defaultValue={value}
                placeholder="Type a message to continue..."
                onChange={setValue}
                onSubmit={handleSubmit}
                {...(onCommandEffect === undefined ? {} : { onCommandEffect })}
            />
        </Box>
    );
}

const ACTION_INPUT_HINT = "[Enter] Approve once  Type feedback to reject";

interface ActionPanelProps {
    readonly busy: boolean;
    readonly recovery: boolean;
    readonly pendingAction?: PendingAction;
    readonly onApprove: (actionId: string) => void | Promise<void>;
    readonly onApproveWithScope?: (actionId: string, scope: "action" | "goal" | "workspace") => void | Promise<void>;
    readonly onReject: (actionId: string, reason: string) => void | Promise<void>;
    readonly onCommandEffect?: ((effect: ModelCommandEffect) => void | Promise<void>) | undefined;
}

function ActionPanel({
    busy,
    recovery,
    pendingAction,
    onApprove,
    onApproveWithScope,
    onReject,
    onCommandEffect,
}: ActionPanelProps): React.JSX.Element {
    const [inputValue, setInputValue] = useState("");
    const [inputKey, setInputKey] = useState(0);
    const actionId = pendingAction?.action.actionId;
    const resetKey = useMemo(() => [actionId, recovery], [actionId, recovery]);
    const submitGate = useSubmitGate(busy, resetKey);
    const targetPath = pendingAction === undefined ? undefined : actionTargetPath(pendingAction);

    const clearInput = useCallback(() => {
        setInputValue("");
        setInputKey((key) => key + 1);
    }, []);

    useEffect(() => {
        clearInput();
    }, [clearInput, resetKey]);

    const handleSubmit = useCallback((value: string) => {
        if (actionId === undefined) {
            return;
        }

        const trimmed = value.trim();
        submitGate.attempt(() => {
            if (trimmed.length === 0) {
                if (recovery) {
                    void (onApproveWithScope === undefined
                        ? onApprove(actionId)
                        : onApproveWithScope(actionId, "action"));
                } else if (onApproveWithScope === undefined) {
                    void onApprove(actionId);
                }
            } else {
                void onReject(actionId, trimmed);
            }
            clearInput();
        });
    }, [actionId, clearInput, onApprove, onApproveWithScope, onReject, recovery, submitGate]);

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
            {!recovery && pendingAction !== undefined && onApproveWithScope !== undefined ? (
                <Box flexDirection="column">
                    <Text>Approval scope:</Text>
                    <Select
                        isDisabled={busy}
                        options={[
                            { label: "Once — this Action only", value: "action" },
                            { label: "This Goal — matching actions in this session", value: "goal" },
                            { label: "This project — matching actions in future Goals", value: "workspace" },
                        ]}
                        onChange={(value) => {
                            if (actionId !== undefined && (value === "action" || value === "goal" || value === "workspace")) {
                                void (onApproveWithScope === undefined
                                    ? onApprove(actionId)
                                    : onApproveWithScope(actionId, value));
                            }
                        }}
                    />
                </Box>
            ) : null}
            {!recovery && targetPath !== undefined ? (
                <Text color="yellow">
                    Persistent permission for {targetPath} also allows later writes to this path with different content.
                </Text>
            ) : null}
            {submitGate.validationError === undefined ? null : <Text color="red">Error: {submitGate.validationError}</Text>}
            {actionId === undefined ? null : (
                <Box flexDirection="column">
                    <CommandAwareTextInput
                        key={inputKey}
                        isDisabled={busy}
                        defaultValue={inputValue}
                        placeholder={onApproveWithScope === undefined
                            ? "Feedback, or Enter to approve…"
                            : "Type feedback to reject this Action…"}
                        onChange={setInputValue}
                        onSubmit={handleSubmit}
                        {...(onCommandEffect === undefined ? {} : { onCommandEffect })}
                    />
                    <Text dimColor>{onApproveWithScope === undefined
                        ? ACTION_INPUT_HINT
                        : "[Enter] Submit rejection feedback"}</Text>
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
    return JSON.stringify(value, null, 2);
}

function actionTargetPath(action: PendingAction): string | undefined {
    if (action.action.toolId !== "write_file" && action.action.toolId !== "edit_file") return undefined;
    const input = action.action.input;
    if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
    const path = (input as Readonly<Record<string, JsonValue>>).path;
    return typeof path === "string" ? path : undefined;
}

interface TerminalPanelProps {
    readonly terminal: NonNullable<UiSessionViewModel["terminal"]>;
    readonly busy: boolean;
    readonly onSubmitMessage: (content: string) => void | Promise<void>;
}

function TerminalPanel({ terminal, busy, onSubmitMessage }: TerminalPanelProps): React.JSX.Element {
    return (
        <Box flexDirection="column" gap={1}>
            <Text bold color={terminal.status === "completed" ? "green" : "red"}>
                Run {terminal.status}
            </Text>
            {terminal.summary === undefined ? null : <Text>Summary: {terminal.summary}</Text>}
            {terminal.reason === undefined ? null : <Text>Reason: {terminal.reason}</Text>}
            {terminal.status === "completed" ? (
                <CompletedRunInput busy={busy} onSubmit={onSubmitMessage} />
            ) : (
                <Text dimColor>No further input is accepted for this Run.</Text>
            )}
        </Box>
    );
}

interface CompletedRunInputProps {
    readonly busy: boolean;
    readonly onSubmit: (content: string) => void | Promise<void>;
}

function CompletedRunInput({ busy, onSubmit }: CompletedRunInputProps): React.JSX.Element {
    const [value, setValue] = useState("");
    const [inputKey, setInputKey] = useState(0);
    const submitGate = useSubmitGate(busy, true);

    const handleSubmit = useCallback((content: string) => {
        submitGate.attempt(() => {
            void onSubmit(content);
            setValue("");
            setInputKey((key) => key + 1);
        }, {
            value: content,
            emptyMessage: "Message must not be empty",
        });
    }, [onSubmit, submitGate]);

    return (
        <Box flexDirection="column" gap={1}>
            <Text bold color="green">Run completed. Start the next Run:</Text>
            {submitGate.validationError === undefined ? null : (
                <Text color="red">Error: {submitGate.validationError}</Text>
            )}
            <CommandAwareTextInput
                key={inputKey}
                isDisabled={busy}
                defaultValue={value}
                placeholder="Type a message to continue the Goal..."
                onChange={setValue}
                onSubmit={handleSubmit}
            />
        </Box>
    );
}
