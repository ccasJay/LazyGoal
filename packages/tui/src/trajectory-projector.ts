import type { Goal, TrajectoryEvent } from "../../runtime/src/index.js";
import type {
    UiInspectorStep,
    UiStepActionBlock,
    UiStepDecisionBlock,
    UiStepObservationBlock,
    UiStepResultBlock,
} from "./types.js";

/**
 * 轨迹事件投影输入参数。
 *
 * @remarks
 * 提供已按提交边界分类的领域事件流与可选的目标快照。
 *
 * @example
 * ```ts
 * const options: ProjectTrajectoryOptions = {
 *     goalId: "goal-1",
 *     committedEvents: [],
 * };
 * ```
 */
export interface ProjectTrajectoryOptions {
    /** 目标标识。 */
    readonly goalId: string;
    /** 可选的目标完整快照。 */
    readonly goal?: Goal;
    /** 已持久化提交的有序 Trajectory 事件。 */
    readonly committedEvents: readonly TrajectoryEvent[];
    /** 发生崩溃或中断前尚未持久化的尾部事件。 */
    readonly uncommittedTail?: readonly TrajectoryEvent[];
}

/**
 * 将底层 Trajectory 事件流投影为供 TUI Inspector 复盘浏览的结构化单步视图模型。
 *
 * @remarks
 * - 将前置生命周期与上下文探索事件独立归入 Step 1: Preparation & Planning；
 * - 针对执行期事件，严格以 `executionUnitId` 划分单步，提取 Decision、Action、Tool、Observation 与 Result；
 * - 终态事件归入尾部步骤的 Result 区块；
 * - 若存在 `uncommittedTail`，在最终步骤附加醒目的未提交警告；
 * - 长内容默认截断并在区块中标记 `isTruncated: true`。
 *
 * @param options - 投影参数。
 * @returns 规范排序的只读 UiInspectorStep 列表。
 *
 * @example
 * ```ts
 * const steps = projectTrajectoryEvents({
 *     goalId: "goal-1",
 *     committedEvents: events,
 * });
 * ```
 */
export function projectTrajectoryEvents(
    options: ProjectTrajectoryOptions,
): readonly UiInspectorStep[] {
    const { goalId, committedEvents, uncommittedTail } = options;

    if (committedEvents.length === 0) {
        return [
            {
                index: 0,
                totalSteps: 1,
                title: "Step 1: Preparation & Planning",
                phase: "gathering_context",
                preparationDetails: ["No trajectory events recorded."],
                rawJson: JSON.stringify(
                    {
                        goalId,
                        committedEvents: [],
                        uncommittedTail: uncommittedTail ?? [],
                    },
                    null,
                    2,
                ),
            },
        ];
    }

    const preparationEvents: TrajectoryEvent[] = [];
    const executionUnitMap = new Map<string, TrajectoryEvent[]>();
    const executionUnitOrder: string[] = [];
    const terminalEvents: TrajectoryEvent[] = [];

    for (const event of committedEvents) {
        if (event.executionUnitId !== undefined) {
            let list = executionUnitMap.get(event.executionUnitId);
            if (list === undefined) {
                list = [];
                executionUnitMap.set(event.executionUnitId, list);
                executionUnitOrder.push(event.executionUnitId);
            }
            list.push(event);
        } else if (
            event.eventType === "run_completed" ||
            event.eventType === "run_failed" ||
            event.eventType === "run_cancelled" ||
            event.eventType === "run_waiting"
        ) {
            terminalEvents.push(event);
        } else {
            preparationEvents.push(event);
        }
    }

    const steps: UiInspectorStep[] = [];

    // 1. 构建 Step 1: Preparation & Planning
    const prepDetails: string[] = [];
    let initialIntent = options.goal?.definition.intent;
    let preparationReasoning: string | undefined;

    for (const event of preparationEvents) {
        if (event.payload.type === "goal_created") {
            initialIntent = initialIntent ?? event.payload.intent;
            prepDetails.push("Goal created: " + event.payload.intent);
        } else if (event.payload.type === "run_started") {
            prepDetails.push("Run started");
        } else if (event.payload.type === "run_resumed") {
            prepDetails.push("Run resumed");
        } else if (event.payload.type === "preparation_result") {
            prepDetails.push("Preparation result: " + event.payload.result);
            if (event.payload.thought !== undefined) {
                preparationReasoning = event.payload.thought;
            }
        } else if (event.payload.type === "decision_received") {
            prepDetails.push("Decision: " + event.payload.decision.kind);
            if (event.payload.thought !== undefined) {
                preparationReasoning = event.payload.thought;
            }
        } else if (event.payload.type === "context_lookup_requested") {
            prepDetails.push("Context lookup requested: " + event.payload.lookupId);
        } else if (event.payload.type === "context_lookup_completed") {
            prepDetails.push("Context lookup completed (" + event.payload.lookupId + ")");
        } else if (event.payload.type === "context_epoch_advanced") {
            prepDetails.push("Context epoch advanced (reason: " + event.payload.reason + ")");
        }
    }

    if (initialIntent !== undefined && prepDetails.length === 0) {
        prepDetails.push("Intent: " + initialIntent);
    }

    const preparationStep: UiInspectorStep = {
        index: 0,
        totalSteps: 1, // 后续统一回填
        title: "Step 1: Preparation & Planning",
        phase: "planning",
        preparationDetails: prepDetails.length > 0 ? prepDetails : ["Initialized"],
        ...(preparationReasoning !== undefined ? { reasoning: preparationReasoning } : {}),
        rawJson: JSON.stringify(
            {
                step: "Preparation",
                goalId,
                events: preparationEvents,
            },
            null,
            2,
        ),
    };
    steps.push(preparationStep);

    // 2. 构建 Execution Steps
    for (let i = 0; i < executionUnitOrder.length; i++) {
        const unitId = executionUnitOrder[i]!;
        const unitEvents = executionUnitMap.get(unitId) ?? [];

        let decisionBlock: UiStepDecisionBlock | undefined;
        let actionBlock: UiStepActionBlock | undefined;
        let observationBlock: UiStepObservationBlock | undefined;
        let resultBlock: UiStepResultBlock | undefined;
        let toolStartTime: number | undefined;
        let reasoning: string | undefined;

        for (const event of unitEvents) {
            const payload = event.payload;

            if (payload.type === "decision_received") {
                if (payload.thought !== undefined) {
                    reasoning = payload.thought;
                }
                const decision = payload.decision;
                if (decision.kind === "tool_call") {
                    decisionBlock = {
                        kind: "tool_call",
                        toolCall: {
                            toolId: decision.action.toolId,
                            actionId: decision.action.actionId,
                        },
                    };
                } else if (decision.kind === "complete") {
                    decisionBlock = {
                        kind: "complete",
                        summary: decision.summary,
                    };
                } else if (decision.kind === "wait") {
                    decisionBlock = {
                        kind: "wait",
                        summary: decision.reason,
                    };
                } else if (decision.kind === "fail") {
                    decisionBlock = {
                        kind: "fail",
                        summary: decision.error,
                    };
                } else if (decision.kind === "context_lookup") {
                    decisionBlock = {
                        kind: "context_lookup",
                        summary: decision.question,
                    };
                }
            } else if (payload.type === "action_staged") {
                actionBlock = {
                    toolId: payload.action.toolId,
                    actionId: payload.action.actionId,
                    inputJson: JSON.stringify(payload.action.input, null, 2),
                    approvalStatus: payload.approvalStatus === "approved"
                        ? "auto_approved"
                        : "awaiting_approval",
                };
            } else if (payload.type === "action_approved") {
                if (actionBlock !== undefined && actionBlock.actionId === payload.actionId) {
                    actionBlock = {
                        ...actionBlock,
                        approvalStatus: "approved",
                    };
                }
            } else if (payload.type === "action_rejected") {
                if (actionBlock !== undefined && actionBlock.actionId === payload.actionId) {
                    actionBlock = {
                        ...actionBlock,
                        approvalStatus: "rejected",
                        rejectionReason: payload.reason,
                    };
                }
            } else if (payload.type === "tool_started") {
                toolStartTime = new Date(event.occurredAt).getTime();
            } else if (payload.type === "tool_finished") {
                const durationMs = toolStartTime !== undefined
                    ? Math.max(0, new Date(event.occurredAt).getTime() - toolStartTime)
                    : undefined;
                const { preview, isTruncated } = formatObservationPreview(payload.observation);
                observationBlock = {
                    toolId: payload.toolId,
                    actionId: payload.actionId,
                    status: payload.observation.kind === "success" ? "success" : "error",
                    ...(durationMs !== undefined ? { durationMs } : {}),
                    observationPreview: preview,
                    rawObservation: payload.observation,
                    isTruncated,
                };
            } else if (payload.type === "observation_recorded") {
                if (observationBlock === undefined) {
                    const { preview, isTruncated } = formatObservationPreview(payload.observation);
                    observationBlock = {
                        toolId: actionBlock?.toolId ?? "unknown",
                        actionId: payload.actionId,
                        status: payload.observation.kind === "success" ? "success" : "error",
                        observationPreview: preview,
                        rawObservation: payload.observation,
                        isTruncated,
                    };
                }
            }
        }

        const stepNum = steps.length + 1;
        const execStep: UiInspectorStep = {
            index: steps.length,
            totalSteps: 1,
            title: "Step " + stepNum + ": Execution (" + unitId + ")",
            executionUnitId: unitId,
            phase: "executing",
            ...(decisionBlock !== undefined ? { decision: decisionBlock } : {}),
            ...(reasoning !== undefined ? { reasoning } : {}),
            ...(actionBlock !== undefined ? { action: actionBlock } : {}),
            ...(observationBlock !== undefined ? { observation: observationBlock } : {}),
            ...(resultBlock !== undefined ? { result: resultBlock } : {}),
            rawJson: JSON.stringify(
                {
                    executionUnitId: unitId,
                    events: unitEvents,
                },
                null,
                2,
            ),
        };
        steps.push(execStep);
    }

    // 3. 处理终态事件（归入最后一个步骤）
    if (terminalEvents.length > 0) {
        const lastStep = steps[steps.length - 1]!;
        let terminalResult: UiStepResultBlock | undefined;

        for (const event of terminalEvents) {
            const payload = event.payload;
            if (payload.type === "run_completed") {
                terminalResult = {
                    outcome: "completed",
                    summary: payload.summary,
                };
            } else if (payload.type === "run_failed") {
                terminalResult = {
                    outcome: "failed",
                    errorCode: String(payload.code),
                    errorMessage: payload.message,
                };
            } else if (payload.type === "run_cancelled") {
                terminalResult = {
                    outcome: "cancelled",
                    summary: payload.reason,
                };
            } else if (payload.type === "run_waiting") {
                terminalResult = {
                    outcome: "waiting",
                    summary: payload.reason,
                };
            }
        }

        if (terminalResult !== undefined) {
            steps[steps.length - 1] = {
                ...lastStep,
                result: terminalResult,
            };
        }
    }

    // 4. 处理 uncommittedTail 警告
    if (uncommittedTail !== undefined && uncommittedTail.length > 0) {
        const lastStep = steps[steps.length - 1]!;
        steps[steps.length - 1] = {
            ...lastStep,
            uncommittedWarning:
                "[Uncommitted Tail: " + uncommittedTail.length + " events occurred after snapshot boundary]",
        };
    }

    // 5. 统一步数索引总数
    const totalSteps = steps.length;
    return steps.map((step, idx) => ({
        ...step,
        index: idx,
        totalSteps,
    }));
}

function formatObservationPreview(observation: unknown): {
    readonly preview: string;
    readonly isTruncated: boolean;
} {
    if (observation === null || observation === undefined) {
        return { preview: "<empty>", isTruncated: false };
    }

    let text: string;
    if (typeof observation === "string") {
        text = observation;
    } else if (typeof observation === "object") {
        if ("output" in observation && typeof (observation as { output: unknown }).output === "string") {
            text = (observation as { output: string }).output;
        } else if ("error" in observation && typeof (observation as { error: unknown }).error === "string") {
            text = (observation as { error: string }).error;
        } else {
            text = JSON.stringify(observation, null, 2);
        }
    } else {
        text = String(observation);
    }

    const lines = text.trim().split(/\r?\n/);
    if (lines.length > 10) {
        const preview = lines.slice(0, 10).join("\n") + "\n... (" + (lines.length - 10) + " more lines)";
        return { preview, isTruncated: true };
    }

    return { preview: lines.join("\n"), isTruncated: false };
}
