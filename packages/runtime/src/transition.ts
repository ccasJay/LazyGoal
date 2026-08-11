import type {
    RunInput,
    RunState,
    TransitionResult,
} from "./domain";

export  function transition(
    currentState: RunState,
    input: RunInput,
): TransitionResult {
    // EXERCISE-1: 根据当前状态和单次输入计算下一状态。
    // 要求: 每次调用最多完成一次转换，且不得修改 currentState 或执行 I/O。
    // HINT-1: 先根据 currentState.status 判断当前生命周期阶段。
    // HINT-2: 再检查该阶段是否接受 input.kind；非法组合返回失败结果。
    throw new Error("TODO: EXERCISE-1");
}
