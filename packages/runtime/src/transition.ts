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
        // 实现 created + start -> running。
        case "created":
            if (input.kind === "start") {
                return {
                    ok: true,
                    state: {
                        ...currentState,
                        status: "running",
                    }
                };
            }
            break;
        // 实现 running + step -> waiting 或 completed。
        case "running":
            if (input.kind === "step") {
                if (input.result.kind === "wait") {
                    const nextState: RunState = {
                        ...currentState,
                        status: "waiting",
                        stepCount: currentState.stepCount + 1,
                        lastResult:  input.result,
                    };

                    return {
                        ok: true,
                        state: nextState,
                    };
                }
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
            }
            break;
        // 实现 waiting + resume -> running。
        case "waiting":
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
            break;
    }

    // Task 3 暂不处理 continue、fail、cancel 和非法转换。
    throw new Error("TODO: TASK-3");
}
