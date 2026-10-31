import type { PreparedToolAction } from "../../tool-core/src/index";
import type { Goal } from "./domain";
import {
    allocateDiagnosticTraceRecord,
    type DiagnosticTraceSink,
} from "./trajectory";

/**
 * 工具输入绑定剥离未知字段时产生的诊断类型。
 *
 * @remarks
 * 诊断由 Tool Contract 绑定生成；Runtime 只消费其中的契约身份、版本、脱敏路径与截断标记。
 *
 * @example
 * ```ts
 * const diagnostic: ToolInputDiagnostic = {
 *     contractId: "test.tool", version: 1, paths: ["/*"], truncated: false,
 * };
 * ```
 */
export type ToolInputDiagnostic = Extract<PreparedToolAction, { readonly ok: true }>["inputDiagnostic"];

/**
 * 将工具输入的未知字段剥离诊断写入诊断 Trace。
 *
 * @remarks
 * 记录是 best-effort：Trace 缺失、同步抛错或异步失败都不改变工具准备与审批语义。
 * 负载只包含契约身份、版本、脱敏路径和截断标记，不包含原始输入或字段值。
 *
 * @param traceSink - 当前 Goal 的诊断 Trace 端口；省略时直接返回。
 * @param goal - 当前 Goal，用于填充 Goal/Run 身份。
 * @param diagnostic - Tool Contract 绑定返回的剥离诊断；缺失时直接返回。
 *
 * @example
 * ```ts
 * recordToolInputDiagnostic(traceSink, goal, prepared.inputDiagnostic);
 * ```
 */
export function recordToolInputDiagnostic(
    traceSink: DiagnosticTraceSink | undefined,
    goal: Goal,
    diagnostic: ToolInputDiagnostic,
): void {
    if (traceSink === undefined || diagnostic === undefined) return;
    try {
        void traceSink.append(allocateDiagnosticTraceRecord({
            goalId: goal.id,
            runId: goal.state.run.id,
            kind: "tool_input_diagnostic",
            payload: {
                contractId: diagnostic.contractId,
                version: diagnostic.version,
                paths: diagnostic.paths,
                truncated: diagnostic.truncated,
            },
        })).catch(() => undefined);
    } catch {
        // Diagnostic Trace 是 best-effort，不得改变工具准备或审批语义。
    }
}
