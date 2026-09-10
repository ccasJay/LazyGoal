/**
 * ALFWorld Worker 的独立构建入口。
 *
 * @remarks
 * 具体 ACP/Mux、Headless Root 和 sidecar 生命周期由 `worker-runtime.ts` 实现；
 * 此文件提供与 SWE-bench 分离且稳定的 WorkerBuilder 入口路径。打包后的
 * `worker.mjs` 会由 runtime 模块的直接入口守卫启动 Worker。
 *
 * @example
 * ```ts
 * // WorkerBuilder: entryPoint = "benchmarks/alfworld/src/worker.ts"
 * export { runAlfworldWorker } from "./worker-runtime.js";
 * ```
 */
export { runAlfworldWorker } from "./worker-runtime.js";
