/**
 * 模型调用的公共入口。
 *
 * @remarks
 * 该入口提供单次 Adapter 调用、输入记录、指标、诊断与流收集；不选择模型、不持有
 * 可变 Binding、不重试、不解码业务结果，也不关闭借用资源。
 */

export { callModel } from "./model-call";
export type {
    ModelCallContext,
    ModelCallDependencies,
    ModelCallInput,
} from "./model-call";

export {
    recordLlmDiagnosticTrace,
    recordLlmError,
    recordLlmRequest,
    recordLlmResponse,
    recordModelContextSoftOverflowDiagnosticTrace,
} from "./llm-diagnostic-trace";
