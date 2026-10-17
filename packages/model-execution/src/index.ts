/**
 * 模型执行协调的公共入口。
 *
 * @remarks
 * 该入口提供单代模型执行 Binding、阶段协调执行器与阶段反馈转换；执行器组合请求、
 * 调用与解码实现，返回 Runtime 可消费的阶段结果。它不推进 Goal、不提交状态，
 * 也不拥有 Adapter、Store 或流资源的生命周期。
 */

export { LLMStepExecutor } from "./llm-step-executor";
export type {
    LLMStepExecutorDependencies,
} from "./llm-step-executor";

export {
    createModelExecutionBinding,
    MutableModelBinding,
} from "./model-execution-binding";
export type {
    CreateModelExecutionBindingInput,
    ModelExecutionBinding,
    ModelExecutionBindingProvider,
} from "./model-execution-binding";
