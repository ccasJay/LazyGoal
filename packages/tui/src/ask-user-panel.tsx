import React, { useCallback, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";

import type { AskUserAnswer, AskUserOption, AskUserQuestion } from "../../contracts/src/index";
import { useSubmitGate } from "./use-submit-gate";
import { CommandAwareTextInput } from "./command-aware-text-input";
import type { ModelCommandEffect } from "../../slash-command/src/index.js";

const OTHER_OPTION_ID = "__other__";

/**
 * 结构化问卷交互面板的入参契约。
 *
 * @remarks
 * 负责在统一 Session 的活动抽屉中渲染 Agent 发起的 1 至 3 个连续问题。
 * 支持计划期与执行期模式标记、单选、多选与 Other 自定义自由文本输入，
 * 并在全部问题回答完成后使用防重提交闸门一次性派发结构化答案。
 *
 * @example
 * ```tsx
 * <AskUserPanel
 *   requestId="ask-1"
 *   mode="plan"
 *   questions={questions}
 *   busy={false}
 *   onSubmit={(answers) => handleAnswers(answers)}
 * />
 * ```
 */
export interface AskUserPanelProps {
    /** 当前问卷的稳定关联请求标识。 */
    readonly requestId: string;
    /** 问卷所属生命周期模式：计划期 plan 或执行期 execution。 */
    readonly mode: "plan" | "execution";
    /** 待用户逐题回答的问题列表（1 至 3 题）。 */
    readonly questions: readonly AskUserQuestion[];
    /** 是否正在推进或等待异步操作。 */
    readonly busy: boolean;
    /** 结构化答案完整收集后的提交回调。 */
    readonly onSubmit: (answers: readonly AskUserAnswer[]) => void | Promise<void>;
    /** Slash 命令派发产生的副作用回调。 */
    readonly onCommandEffect?: ((effect: ModelCommandEffect) => void | Promise<void>) | undefined;
}

/**
 * 渲染单选/多选/Other 结构化问卷交互面板。
 *
 * @param props - 问卷面板属性。
 * @returns Ink 渲染树。
 */
export function AskUserPanel({
    requestId,
    mode,
    questions,
    busy,
    onSubmit,
    onCommandEffect,
}: AskUserPanelProps): React.JSX.Element {
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [focusedIndex, setFocusedIndex] = useState(0);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
    const [otherSelected, setOtherSelected] = useState(false);
    const [otherText, setOtherText] = useState("");
    const [enteringOtherInSingleSelect, setEnteringOtherInSingleSelect] = useState(false);
    const [localError, setLocalError] = useState<string | undefined>(undefined);

    const answersRef = useRef<AskUserAnswer[]>([]);

    const totalQuestions = questions.length;
    const currentQuestion = questions[currentQuestionIndex];

    const resetKey = useMemo(
        () => [requestId, currentQuestionIndex],
        [requestId, currentQuestionIndex],
    );

    const submitGate = useSubmitGate(busy, resetKey);

    const options = useMemo(() => {
        if (!currentQuestion) return [];
        return [
            ...currentQuestion.options,
            { id: OTHER_OPTION_ID, label: "Other", description: "Type a custom answer" },
        ];
    }, [currentQuestion]);

    const isMultiSelect = currentQuestion?.multiSelect ?? false;

    const finalizeAnswersAndSubmit = useCallback((completedAnswers: AskUserAnswer[]) => {
        submitGate.attempt(() => {
            void onSubmit(completedAnswers);
        });
    }, [onSubmit, submitGate]);

    const advanceOrSubmit = useCallback((answer: AskUserAnswer) => {
        const nextAnswers = [...answersRef.current];
        nextAnswers[currentQuestionIndex] = answer;
        answersRef.current = nextAnswers;

        if (currentQuestionIndex < totalQuestions - 1) {
            setCurrentQuestionIndex((prev) => prev + 1);
            setFocusedIndex(0);
            setSelectedIds(new Set());
            setOtherSelected(false);
            setOtherText("");
            setEnteringOtherInSingleSelect(false);
            setLocalError(undefined);
        } else {
            finalizeAnswersAndSubmit(nextAnswers);
        }
    }, [currentQuestionIndex, totalQuestions, finalizeAnswersAndSubmit]);

    const handleSingleSelectSubmit = useCallback(() => {
        if (!currentQuestion) return;
        const currentOption = options[focusedIndex];
        if (!currentOption) return;

        if (currentOption.id === OTHER_OPTION_ID) {
            setEnteringOtherInSingleSelect(true);
            setLocalError(undefined);
            return;
        }

        const answer: AskUserAnswer = {
            questionId: currentQuestion.id,
            optionIds: [currentOption.id],
        };
        advanceOrSubmit(answer);
    }, [advanceOrSubmit, currentQuestion, focusedIndex, options]);

    const handleSingleSelectOtherSubmit = useCallback((customText: string) => {
        if (!currentQuestion) return;
        const trimmed = customText.trim();
        if (trimmed.length === 0) {
            setLocalError("Answer must not be empty");
            return;
        }

        const answer: AskUserAnswer = {
            questionId: currentQuestion.id,
            optionIds: [],
            otherText: trimmed,
        };
        advanceOrSubmit(answer);
    }, [advanceOrSubmit, currentQuestion]);

    const handleMultiSelectSubmit = useCallback(() => {
        if (!currentQuestion) return;

        const effectiveOptionIds = Array.from(selectedIds);
        const hasOther = otherSelected;
        const trimmedOther = otherText.trim();

        if (effectiveOptionIds.length === 0 && !hasOther) {
            setLocalError("Please select at least one option");
            return;
        }

        if (hasOther && trimmedOther.length === 0) {
            setLocalError("Other answer must not be empty");
            return;
        }

        const answer: AskUserAnswer = {
            questionId: currentQuestion.id,
            optionIds: effectiveOptionIds,
            ...(hasOther ? { otherText: trimmedOther } : {}),
        };
        advanceOrSubmit(answer);
    }, [advanceOrSubmit, currentQuestion, otherSelected, otherText, selectedIds]);

    useInput((input, key) => {
        if (busy) return;

        // 如果在单选 Other 文本输入中，由 TextInput 处理键盘
        if (!isMultiSelect && enteringOtherInSingleSelect) {
            if (key.escape) {
                setEnteringOtherInSingleSelect(false);
                setLocalError(undefined);
            }
            return;
        }

        if (key.upArrow) {
            setLocalError(undefined);
            setFocusedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
            return;
        }

        if (key.downArrow) {
            setLocalError(undefined);
            setFocusedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
            return;
        }

        if (isMultiSelect) {
            if (input === " ") {
                setLocalError(undefined);
                const currentOpt = options[focusedIndex];
                if (!currentOpt) return;

                if (currentOpt.id === OTHER_OPTION_ID) {
                    setOtherSelected((prev) => !prev);
                } else {
                    setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(currentOpt.id)) {
                            next.delete(currentOpt.id);
                        } else {
                            next.add(currentOpt.id);
                        }
                        return next;
                    });
                }
                return;
            }

            if (key.return) {
                handleMultiSelectSubmit();
                return;
            }
        } else {
            if (key.return) {
                handleSingleSelectSubmit();
                return;
            }
        }
    });

    if (!currentQuestion) {
        return <Text color="yellow">No questions available.</Text>;
    }

    const modeLabel = mode === "plan" ? "PLANNING" : "EXECUTION";

    return (
        <Box flexDirection="column" gap={1}>
            <Box gap={1}>
                <Text bold color="cyan">
                    [{modeLabel}]
                </Text>
                <Text bold color="yellow">
                    Question {currentQuestionIndex + 1} of {totalQuestions}
                </Text>
                {isMultiSelect ? (
                    <Text dimColor>(Select multiple with Space, confirm with Enter)</Text>
                ) : (
                    <Text dimColor>(Select one with arrows, confirm with Enter)</Text>
                )}
            </Box>

            <Box flexDirection="column">
                <Text bold>{currentQuestion.header}</Text>
                <Text>{currentQuestion.question}</Text>
            </Box>

            <Box flexDirection="column">
                {options.map((option, idx) => {
                    const isFocused = idx === focusedIndex;
                    let isChecked = false;
                    if (isMultiSelect) {
                        isChecked = option.id === OTHER_OPTION_ID ? otherSelected : selectedIds.has(option.id);
                    }

                    const marker = isMultiSelect
                        ? `[${isChecked ? "x" : " "}]`
                        : isFocused
                        ? ">"
                        : " ";

                    return (
                        <Box key={option.id} gap={1}>
                    <Text {...(isFocused ? { color: "cyan" as const } : {})} bold={isFocused}>
                                {marker} {option.label}
                            </Text>
                            {option.description !== undefined ? (
                                <Text dimColor>- {option.description}</Text>
                            ) : null}
                        </Box>
                    );
                })}
            </Box>

            {!isMultiSelect && enteringOtherInSingleSelect ? (
                <Box flexDirection="column" gap={1}>
                    <Text bold>Type your custom answer (Enter to confirm, Esc to cancel):</Text>
                    <CommandAwareTextInput
                        isDisabled={busy}
                        defaultValue={otherText}
                        placeholder="Type answer..."
                        onChange={(val) => {
                            setOtherText(val);
                            setLocalError(undefined);
                        }}
                        onSubmit={handleSingleSelectOtherSubmit}
                        {...(onCommandEffect === undefined ? {} : { onCommandEffect })}
                    />
                </Box>
            ) : null}

            {isMultiSelect && otherSelected ? (
                <Box flexDirection="column" gap={1}>
                    <Text bold>Other custom answer:</Text>
                    <CommandAwareTextInput
                        isDisabled={busy}
                        defaultValue={otherText}
                        placeholder="Type details for Other..."
                        onChange={(val) => {
                            setOtherText(val);
                            setLocalError(undefined);
                        }}
                        onSubmit={() => handleMultiSelectSubmit()}
                        {...(onCommandEffect === undefined ? {} : { onCommandEffect })}
                    />
                </Box>
            ) : null}

            {localError !== undefined ? (
                <Text color="red">{localError}</Text>
            ) : null}
            {submitGate.validationError !== undefined ? (
                <Text color="red">{submitGate.validationError}</Text>
            ) : null}
        </Box>
    );
}
