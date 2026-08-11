import type {
    RunInput,
    RunState,
    TransitionResult,
} from "./domain";

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

            // 创建后直接取消：进入 cancelled，且不产生 StepResult。
            if (input.kind === "cancel") {
                const nextState: RunState = {
                    ...currentState,
                    status: "cancelled",
                };

                return {
                    ok: true,
                    state: nextState,
                };
            }
            break;

        // running 状态接受 step 结果或外部取消。
        case "running":
            // 消费一次 step：具体下一状态由 StepResult.kind 决定。
            if (input.kind === "step") {
                // step 暂时无法继续：记录结果、计数加一并进入 waiting。
                if (input.result.kind === "wait") {
                    const nextState: RunState = {
                        ...currentState,
                        status: "waiting",
                        stepCount: currentState.stepCount + 1,
                        lastResult: input.result,
                    };

                    return {
                        ok: true,
                        state: nextState,
                    };
                }

                // step 完成目标：记录结果、计数加一并进入 completed 终态。
                if (input.result.kind === "complete") {
                    const nextState: RunState = {
                        ...currentState,
                        status: "completed",
                        stepCount: currentState.stepCount + 1,
                        lastResult: input.result,
                    };

                    return {
                        ok: true,
                        state: nextState,
                    };
                }

                // step 仍需继续：记录结果、计数加一并保持 running。
                if (input.result.kind === "continue") {
                    const nextState: RunState = {
                        ...currentState,
                        status: "running",
                        stepCount: currentState.stepCount + 1,
                        lastResult: input.result,
                    };

                    return {
                        ok: true,
                        state: nextState,
                    };
                }

                // step 执行失败：合法地记录结果并进入 failed 终态。
                if (input.result.kind === "fail") {
                    const nextState: RunState = {
                        ...currentState,
                        status: "failed",
                        stepCount: currentState.stepCount + 1,
                        lastResult: input.result,
                    };

                    return {
                        ok: true,
                        state: nextState,
                    };
                }
            }

            // 运行期间取消：进入 cancelled，但不额外消费一次 step。
            if (input.kind === "cancel") {
                const nextState: RunState = {
                    ...currentState,
                    status: "cancelled",
                };

                return {
                    ok: true,
                    state: nextState,
                };
            }
            break;

        // waiting 状态只接受恢复或取消，不直接消费新的 step 结果。
        case "waiting":
            // 外部条件满足后恢复：回到 running，计数和最近结果不变。
            if (input.kind === "resume") {
                const nextState: RunState = {
                    ...currentState,
                    status: "running",
                };

                return {
                    ok: true,
                    state: nextState,
                };
            }

            // 等待期间取消：进入 cancelled，保留已有计数和最近结果。
            if (input.kind === "cancel") {
                const nextState: RunState = {
                    ...currentState,
                    status: "cancelled",
                };

                return {
                    ok: true,
                    state: nextState,
                };
            }
            break;
    }

    // 所有未匹配组合均为非法转换；返回原状态而不是抛出异常。
    return {
        ok: false,
        state: currentState,
        error: {
            code: "INVALID_TRANSITION",
            message: `Cannot apply "${input.kind}" while run is "${currentState.status}"`,
        },
    };
}
