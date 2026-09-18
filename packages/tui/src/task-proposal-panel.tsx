import React, { useCallback, useMemo, useState } from "react";
import { Box, Text } from "ink";
import { ConfirmInput } from "@inkjs/ui";

import type { GoalTask } from "../../runtime/src/index";
import { useSubmitGate } from "./use-submit-gate";
import { CommandAwareTextInput } from "./command-aware-text-input";
import type { ModelCommandEffect } from "../../slash-command/src/index.js";

/**
 * 任务提案审查面板的入参契约。
 *
 * @remarks
 * 负责展示 Agent 提出的任务目标、验收标准与审批提示，
 * 支持用户一键批准或转入反馈模式输入修改意见。
 *
 * @example
 * ```tsx
 * <TaskProposalPanel
 *   proposal={task}
 *   busy={false}
 *   onApprove={(requestId) => handleApprove(requestId)}
 *   onFeedback={(requestId, feedback) => handleFeedback(requestId, feedback)}
 * />
 * ```
 */
export interface TaskProposalPanelProps {
    /** 待批准的任务提案。 */
    readonly proposal?: GoalTask;
    /** 当前任务提案的稳定关联请求标识。 */
    readonly requestId?: string;
    /** Agent 发起的定制化审批提示文案。 */
    readonly approvalRequest?: string;
    /** 是否正在推进或等待异步操作。 */
    readonly busy: boolean;
    /** 批准当前任务提案并推进执行的回调。 */
    readonly onApprove: (requestId?: string) => void | Promise<void>;
    /** 提供反馈要求重新规划的回调。 */
    readonly onFeedback: (requestId: string | undefined, feedback: string) => void | Promise<void>;
    /** Slash 命令派发产生的副作用回调。 */
    readonly onCommandEffect?: ((effect: ModelCommandEffect) => void | Promise<void>) | undefined;
}
/**
 * 渲染任务提案审批与反馈交互面板。
 *
 * @param props - 提案面板属性。
 * @returns Ink 渲染树。
 */
export function TaskProposalPanel({
    proposal,
    requestId,
    approvalRequest,
    busy,
    onApprove,
    onFeedback,
    onCommandEffect,
}: TaskProposalPanelProps): React.JSX.Element {
    const [feedbackMode, setFeedbackMode] = useState(false);
    const [feedbackValue, setFeedbackValue] = useState("");
    const [feedbackKey, setFeedbackKey] = useState(0);

    const resetKey = useMemo(
        () => [requestId, proposal?.objective],
        [requestId, proposal?.objective],
    );

    const submitGate = useSubmitGate(busy, resetKey);

    const handleApprove = useCallback(() => {
        submitGate.attempt(() => {
            void onApprove(requestId);
        });
    }, [busy, onApprove, requestId, submitGate]);

    const handleFeedbackSubmit = useCallback((value: string) => {
        submitGate.attempt(() => {
            void onFeedback(requestId, value);
            setFeedbackValue("");
            setFeedbackKey((k) => k + 1);
        }, {
            value,
            emptyMessage: "Feedback must not be empty",
        });
    }, [busy, onFeedback, requestId, submitGate]);

    return (
        <Box flexDirection="column" gap={1}>
            <Text bold color="yellow">Task proposal</Text>
            {approvalRequest !== undefined ? (
                <Text color="cyan">{approvalRequest}</Text>
            ) : null}
            <Text>{proposal?.objective ?? "The agent has not provided a task proposal."}</Text>
            {proposal !== undefined && proposal.completionCriteria.length > 0 ? (
                <Box flexDirection="column">
                    <Text bold>Completion criteria:</Text>
                    {proposal.completionCriteria.map((criterion, idx) => (
                        <Text key={idx}>• {criterion.text}</Text>
                    ))}
                </Box>
            ) : null}
            {submitGate.validationError !== undefined ? (
                <Text color="red">{submitGate.validationError}</Text>
            ) : null}
            {feedbackMode ? (
                <Box flexDirection="column" gap={1}>
                    <Text>Describe the changes you want:</Text>
                    <CommandAwareTextInput
                        key={feedbackKey}
                        isDisabled={busy}
                        defaultValue={feedbackValue}
                        placeholder="Provide non-empty feedback..."
                        onChange={setFeedbackValue}
                        onSubmit={handleFeedbackSubmit}
                        {...(onCommandEffect === undefined ? {} : { onCommandEffect })}
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
                    <Text dimColor>Press Y to approve or N to provide feedback.</Text>
                </Box>
            )}
        </Box>
    );
}
