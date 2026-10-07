/**
 * 通用 Tool 定义、注册、输入准备与单次执行绑定核心。
 *
 * @remarks
 * 该包独立于 Runtime，不依赖 Goal、GoalStore 或 Runner。
 * 它提供统一的 Tool 抽象、单次 Input Contract 解析与语义校验闭包、
 * 以及内存中的 ToolRegistry。
 *
 * @example
 * ```ts
 * import {
 *   createToolRegistration,
 *   InMemoryToolRegistry,
 * } from "@lazygoal/tool-core";
 *
 * const registration = createToolRegistration(myTool);
 * const registry = new InMemoryToolRegistry([registration]);
 * ```
 */

export { TransientToolExecutionFailure } from "./errors";
export { createToolRegistration } from "./registration";
export { InMemoryToolRegistry } from "./registry";
export type {
    PreparedToolAction,
    Tool,
    ToolDefinition,
    ToolExecutionContext,
    ToolExecutionRequest,
    ToolInputContract,
    ToolObservation,
    ToolRegistration,
    ToolRegistry,
    ToolStreamEvent,
    ToolValidationIssue,
    ToolValidationResult,
} from "./types";
