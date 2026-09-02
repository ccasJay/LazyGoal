import type {
    AgentDecision,
    Observation,
    PendingAction,
    RunInput,
    RunState,
    TransitionResult,
} from "./domain";
import { isContextLookupRequest } from "./context-retrieval";
import type { ContextLookupRequest } from "./context-retrieval";

type TerminalDecision = Exclude<
    AgentDecision,
    { readonly kind: "tool_call" }
        | { readonly kind: "context_lookup" }
        | { readonly kind: "context_checkpoint" }
>;

type ActionObservation = Exclude<
    Observation,
    { readonly kind: "rejected" }
>;

function hasText(value: string): boolean {
    return value.trim().length > 0;
}

function clearPendingAction(
    state: RunState,
): Omit<RunState, "pendingAction"> {
    const { pendingAction: _pendingAction, ...stateWithoutPendingAction } = state;
    return stateWithoutPendingAction;
}

function invalidTransition(
    currentState: RunState,
    input: RunInput,
    reason?: string,
): TransitionResult {
    return {
        ok: false,
        state: currentState,
        error: {
            code: "INVALID_TRANSITION",
            message: reason
                ?? `Cannot apply "${input.kind}" while run is "${currentState.status}"`,
        },
    };
}

function isTerminalDecision(
    decision: AgentDecision,
): decision is TerminalDecision {
    return (
        decision.kind === "complete"
        || decision.kind === "wait"
        || decision.kind === "fail"
    );
}

function isActionObservation(
    observation: Observation,
): observation is ActionObservation {
    return observation.kind === "success" || observation.kind === "failure";
}

function completeAction(
    currentState: RunState,
    action: PendingAction["action"],
    observation: Observation,
): RunState {
    return {
        ...clearPendingAction(currentState),
        status: "running",
        stepCount: currentState.stepCount + 1,
        lastStep: {
            kind: "action",
            action,
            observation,
        },
    };
}

/**
 * 纯函数式推进一个 Run 状态。
 *
 * @remarks
 * 函数不会修改传入状态。Action 的 `stage_action` 只保存 pendingAction，不增加
 * Step；`recover_action` 只将 approved Action 转为
 * `outcome_unknown` waiting；`observe_action`、`reject_action`、Context Lookup
 * 和非 Tool `decision` 完成一个 Step。`execution_error` 进入 failed 且不增加 Step，
 * 如果已有 pendingAction，会将其标记为 `outcome_unknown`。
 *
 * 合法转换返回新状态；非法转换返回原对象和 `INVALID_TRANSITION`，由上层
 * 决定是否把它视为业务失败或不变量错误。函数不执行 I/O、Tool 或自发循环。
 *
 * @param currentState - 当前已知 Run 状态。
 * @param input - 本次需要应用的状态转换输入。
 * @returns 成功后的新状态，或包含原状态的非法转换结果。
 */
export function transition(
    currentState: RunState,
    input: RunInput,
): TransitionResult {
    switch (currentState.status) {
        // created 状态只接受启动或取消，不处理 step 与恢复输入。
        case "created":
            // 启动 Run：进入 running，但尚未执行 step，因此计数不变。
            if (input.kind === "start") {
                return {
                    ok: true,
                    state: {
                        ...currentState,
                        status: "running",
                    },
                };
            }

            // 创建后直接取消：进入 cancelled，且不消费 Step。
            if (input.kind === "cancel") {
                return {
                    ok: true,
                    state: {
                        ...clearPendingAction(currentState),
                        status: "cancelled",
                    },
                };
            }
            break;

        // running 状态接受 Action、恢复、决策或外部取消。
        case "running":
            if (input.kind === "recover_action") {
                const pendingAction = currentState.pendingAction;

                if (
                    pendingAction === undefined
                    || pendingAction.status !== "approved"
                ) {
                    return invalidTransition(
                        currentState,
                        input,
                        "recover_action requires an approved pendingAction",
                    );
                }

                if (!hasText(input.actionId)) {
                    return invalidTransition(
                        currentState,
                        input,
                        "Recovery requires a non-empty actionId",
                    );
                }

                if (pendingAction.action.actionId !== input.actionId) {
                    return invalidTransition(
                        currentState,
                        input,
                        "Recovered actionId does not match pendingAction",
                    );
                }

                return {
                    ok: true,
                    state: {
                        ...currentState,
                        status: "waiting",
                        pendingAction: {
                            action: pendingAction.action,
                            status: "outcome_unknown",
                        },
                    },
                };
            }

            if (input.kind === "stage_action") {
                if (currentState.pendingAction !== undefined) {
                    return invalidTransition(
                        currentState,
                        input,
                        "Cannot stage an Action while another Action is pending",
                    );
                }

                if (
                    !hasText(input.action.actionId)
                    || !hasText(input.action.toolId)
                ) {
                    return invalidTransition(
                        currentState,
                        input,
                        "Action staging requires non-empty actionId and toolId",
                    );
                }

                const status = input.status ?? "approved";

                if (
                    status !== "approved"
                    && status !== "awaiting_approval"
                ) {
                    return invalidTransition(
                        currentState,
                        input,
                        `Unsupported staged Action status "${String(status)}"`,
                    );
                }

                return {
                    ok: true,
                    state: {
                        ...currentState,
                        status: status === "awaiting_approval"
                            ? "waiting"
                            : "running",
                        pendingAction: {
                            action: input.action,
                            status,
                        },
                    },
                };
            }

            if (input.kind === "observe_action") {
                const pendingAction = currentState.pendingAction;

                if (pendingAction === undefined) {
                    return invalidTransition(
                        currentState,
                        input,
                        "Cannot observe an Action without a pendingAction",
                    );
                }

                if (pendingAction.action.actionId !== input.actionId) {
                    return invalidTransition(
                        currentState,
                        input,
                        "Observation actionId does not match pendingAction",
                    );
                }

                if (pendingAction.status !== "approved") {
                    return invalidTransition(
                        currentState,
                        input,
                        "Only an approved pendingAction can receive an Observation",
                    );
                }

                if (!isActionObservation(input.observation)) {
                    return invalidTransition(
                        currentState,
                        input,
                        "observe_action cannot carry a rejected Observation",
                    );
                }

                return {
                    ok: true,
                    state: completeAction(
                        currentState,
                        pendingAction.action,
                        input.observation,
                    ),
                };
            }

            if (input.kind === "reject_action") {
                return invalidTransition(
                    currentState,
                    input,
                    "reject_action requires a waiting Action approval",
                );
            }

            if (input.kind === "decision") {
                if (currentState.pendingAction !== undefined) {
                    return invalidTransition(
                        currentState,
                        input,
                        "Cannot apply a terminal decision while an Action is pending",
                    );
                }

                if (!isTerminalDecision(input.decision)) {
                    return invalidTransition(
                        currentState,
                        input,
                        "Decision requires a terminal kind",
                    );
                }

                const status = input.decision.kind === "wait"
                    ? "waiting"
                    : input.decision.kind === "complete"
                        ? "completed"
                        : "failed";

                return {
                    ok: true,
                    state: {
                        ...currentState,
                        status,
                        stepCount: currentState.stepCount + 1,
                        lastStep: {
                            kind: "decision",
                            result: input.decision,
                        },
                    },
                };
            }

            if (input.kind === "context_lookup") {
                if (currentState.pendingAction !== undefined) {
                    return invalidTransition(
                        currentState,
                        input,
                        "Cannot apply a Context Lookup while an Action is pending",
                    );
                }

                if (!isContextLookupRequest(input.request)) {
                    return invalidTransition(
                        currentState,
                        input,
                        "Context Lookup request is invalid",
                    );
                }

                return {
                    ok: true,
                    state: {
                        ...currentState,
                        status: "running",
                        stepCount: currentState.stepCount + 1,
                        lastStep: {
                            kind: "decision",
                            result: input.request,
                        },
                    },
                };
            }

            if (input.kind === "execution_error") {
                if (!hasText(input.message)) {
                    return invalidTransition(
                        currentState,
                        input,
                        "Execution failure requires a non-empty message",
                    );
                }

                const pendingAction = currentState.pendingAction;

                if (
                    pendingAction !== undefined
                    && pendingAction.status !== "approved"
                ) {
                    return invalidTransition(
                        currentState,
                        input,
                        "Only an approved pendingAction can become outcome_unknown",
                    );
                }

                return {
                    ok: true,
                    state: {
                        ...currentState,
                        status: "failed",
                        ...(pendingAction === undefined
                            ? {}
                            : {
                                pendingAction: {
                                    action: pendingAction.action,
                                    status: "outcome_unknown" as const,
                                },
                            }),
                        stopReason: {
                            kind: "execution_error",
                            code: input.code,
                            message: input.message,
                        },
                    },
                };
            }

            // 运行期间取消：进入 cancelled，但不额外消费一次 step。
            if (input.kind === "cancel") {
                return {
                    ok: true,
                    state: {
                        ...clearPendingAction(currentState),
                        status: "cancelled",
                    },
                };
            }
            break;

        // waiting 状态接受 Agent wait 的恢复、Action 审批/拒绝或取消。
        case "waiting":
            if (input.kind === "approve_action") {
                const pendingAction = currentState.pendingAction;

                if (
                    pendingAction === undefined
                    || (
                        pendingAction.status !== "awaiting_approval"
                        && pendingAction.status !== "outcome_unknown"
                    )
                ) {
                    return invalidTransition(
                        currentState,
                        input,
                        "approve_action requires an approval or recovery pendingAction",
                    );
                }

                if (pendingAction.action.actionId !== input.actionId) {
                    return invalidTransition(
                        currentState,
                        input,
                        "Approved actionId does not match pendingAction",
                    );
                }

                return {
                    ok: true,
                    state: {
                        ...currentState,
                        status: "running",
                        pendingAction: {
                            action: pendingAction.action,
                            status: "approved",
                        },
                    },
                };
            }

            if (input.kind === "reject_action") {
                const pendingAction = currentState.pendingAction;

                if (
                    pendingAction === undefined
                    || (
                        pendingAction.status !== "awaiting_approval"
                        && pendingAction.status !== "outcome_unknown"
                    )
                ) {
                    return invalidTransition(
                        currentState,
                        input,
                        "reject_action requires an approval or recovery pendingAction",
                    );
                }

                if (pendingAction.action.actionId !== input.actionId) {
                    return invalidTransition(
                        currentState,
                        input,
                        "Rejected actionId does not match pendingAction",
                    );
                }

                if (!hasText(input.reason)) {
                    return invalidTransition(
                        currentState,
                        input,
                        "Action rejection requires a non-empty reason",
                    );
                }

                return {
                    ok: true,
                    state: completeAction(
                        currentState,
                        pendingAction.action,
                        {
                            kind: "rejected",
                            reason: input.reason,
                        },
                    ),
                };
            }

            // 外部协调器解除 Agent wait 后恢复：回到 running，计数和最近结果不变。
            // 带 pendingAction 的审批/恢复等待不能通过通用 resume 绕过授权。
            if (
                input.kind === "resume"
                && currentState.pendingAction === undefined
            ) {
                const nextState: RunState = {
                    ...currentState,
                    status: "running",
                };

                return {
                    ok: true,
                    state: nextState,
                };
            }

            // 等待期间取消：进入 cancelled，清除未完成 Action，且不消费 Step。
            if (input.kind === "cancel") {
                return {
                    ok: true,
                    state: {
                        ...clearPendingAction(currentState),
                        status: "cancelled",
                    },
                };
            }
            break;
    }

    // 所有未匹配组合均为非法转换；返回原状态而不是抛出异常。
    return invalidTransition(currentState, input);
}
