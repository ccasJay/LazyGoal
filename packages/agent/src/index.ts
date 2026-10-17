/**
 * Agent 默认装配入口。
 *
 * @remarks
 * 本入口只提供 `createAgentExecutor` 与自身 `AgentExecutorOptions` 参数契约；
 * 预算、模型表示、上下文组装、渲染、请求、响应、单次调用与执行协调均从各自
 * 拥有者的包导入，不在此重新导出。
 */

export { createAgentExecutor } from "./create-agent-executor";
export type { AgentExecutorOptions } from "./create-agent-executor";
