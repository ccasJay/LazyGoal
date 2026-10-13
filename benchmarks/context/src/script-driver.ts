import type { Goal } from "../../../packages/runtime/src/index.js";
import type { ContextScenario, ScriptStage } from "./scenario.js";

/**
 * Worker 返回的真实已持久化状态，不包含未来阶段。
 * @example
 * ```ts
 * const boundary: ScriptBoundary = { goalId: "g", runId: "r", status: "failed", sequence: 5 };
 * ```
 */
export interface ScriptBoundary {
    /** 真实 Worker 启动实例与容器内 PID，只用于诊断，不作为 Goal 身份。 */
    readonly workerInstanceId?: string;
    readonly workerPid?: number;
    readonly goalId: string;
    readonly runId: string;
    readonly status: Goal["state"]["run"]["status"];
    readonly sequence: number;
    readonly waitingFor?: string;
    readonly requestId?: string;
    readonly questions?: readonly { readonly id: string; readonly question: string }[];
    /** Runtime 的预算终止事实；与普通预期失败区分。 */
    readonly stopReason?: string;
    /** Snapshot 中实际持久化的用户消息；launch 可包含共享上下文说明。 */
    readonly userMessage?: string;
}
/**
 * 每段实际注入和触发边界的审计事实。
 * @example
 * ```ts
 * const event: StageRecord = { index: 1, prompt: "Retry", operation: "continue", boundary, trigger: previous };
 * ```
 */
export interface StageRecord {
    readonly index: number;
    readonly operation: ScriptStage["operation"];
    readonly prompt: string;
    readonly boundary: ScriptBoundary;
    readonly trigger: ScriptBoundary | null;
}
/** 固定脚本不匹配时保留已完成阶段，不生成补救消息。 */
export class ScriptMismatch extends Error {
    readonly code: string = "SCRIPT_MISMATCH";
    constructor(message: string, readonly records: readonly StageRecord[]) { super(message); }
}
/** 阶段时长或 Runtime 步数预算终止；保留已提交边界。 */
export class ScriptBudgetExceeded extends ScriptMismatch { override readonly code = "BUDGET_EXCEEDED"; }

/**
 * 自动推进宿主脚本，send 每次只收到当前阶段及其真实触发边界。
 * @remarks start/end 支持捕获前缀和恢复后缀；超时信号必须贯穿 send 到 Worker。
 * @example
 * ```ts
 * await driveScript(scenario, send, controller.signal);
 * ```
 */
export async function driveScript(
    scenario: ContextScenario,
    send: (stage: ScriptStage, previous: ScriptBoundary | null, signal: AbortSignal) => Promise<ScriptBoundary>,
    signal: AbortSignal,
    start = 0,
    end = scenario.stages.length,
    initial: ScriptBoundary | null = null,
): Promise<readonly StageRecord[]> {
    const records: StageRecord[] = [];
    let previous = initial;
    for (let index = start; index < end; index++) {
        signal.throwIfAborted();
        const stage = scenario.stages[index]!;
        if ((stage.operation === "launch") !== (previous === null)) throw new ScriptMismatch("Missing or unexpected launch boundary", records);
        if (previous !== null) {
            const expected = scenario.stages[index - 1]!;
            if (previous.status !== expected.expect || (expected.expect === "waiting" && previous.waitingFor !== expected.waitingFor)) throw new ScriptMismatch("Previous boundary does not match frozen trigger", records);
        }
        const timeout = AbortSignal.timeout(scenario.budget.stageTimeoutMs);
        let boundary: ScriptBoundary;
        try { boundary = await send(stage, previous, AbortSignal.any([signal, timeout])); }
        catch (error) {
            if (timeout.aborted && !signal.aborted) throw new ScriptBudgetExceeded("Stage timeout budget exceeded", records);
            throw error;
        }
        const event: StageRecord = { index, operation: stage.operation, prompt: stage.prompt, boundary, trigger: previous };
        records.push(event);
        if (boundary.stopReason === "max_steps_exceeded") throw new ScriptBudgetExceeded("Runtime step budget exceeded", records);
        if (boundary.status !== stage.expect || (stage.expect === "waiting" && boundary.waitingFor !== stage.waitingFor)) throw new ScriptMismatch("Actual state does not match frozen stage", records);
        if (stage.waitingQuestion !== undefined && (boundary.questions?.length !== 1 || boundary.questions[0]?.id !== "q-1" || boundary.questions[0]?.question !== stage.waitingQuestion)) throw new ScriptMismatch("Waiting question does not match frozen template", records);
        if (previous !== null && (boundary.goalId !== previous.goalId || (stage.operation === "resume" ? boundary.runId !== previous.runId : boundary.runId === previous.runId))) throw new ScriptMismatch("Goal/Run identity violated", records);
        previous = boundary;
    }
    return records;
}
