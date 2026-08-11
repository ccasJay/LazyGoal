import type {
    RunInput,
    RunState,
    TransitionResult,
} from "./domain";

export function transition(
    currentState: RunState,
    input: RunInput,
): TransitionResult {
    // TODO-1: 实现 created + start -> running。
    // 要求: stepCount 与 lastResult 保持不变，并返回新的 RunState。
    // HINT-1: 同时检查 currentState.status 和 input.kind。
    // HINT-2: 成功结果需要符合 TransitionResult 的 ok: true 分支。
    switch (currentState.status) {
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

    // TODO-2: 实现 running + step.wait/step.complete。
    // 要求: 每个 step 只将 stepCount 加 1，并把 input.result 写入 lastResult。
    // HINT-1: 先缩小 input.kind，再根据 input.result.kind 区分结果。
    // HINT-2: 从 currentState 构造新对象，只覆盖发生变化的字段。

    // TODO-3: 实现 waiting + resume -> running。
    // 要求: stepCount 和 lastResult 均保持不变，并返回新的 RunState。
    // HINT-1: resume 本身不是 step，不应增加计数。

    // Task 3 暂不处理 continue、fail、cancel 和非法转换。
    throw new Error("TODO: TASK-3");
}
