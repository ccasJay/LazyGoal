/**
 * ACP Worker 的固定 bundle 入口；宿主构建器与显式 Docker smoke 共用。
 */
export const SWE_ACP_WORKER_ENTRYPOINT = "benchmarks/swebench/src/worker.ts" as const;

/**
 * Worker 内置 Prompt 模板的仓库相对路径；这些文件会被 WorkerBuilder 嵌入产物。
 */
export const SWE_ACP_WORKER_PROMPT_ASSETS = Object.freeze([
    "packages/agent/src/global-system-prompt/global-overview@1.njk",
    "packages/agent/src/prompting/profile@1.njk",
    "packages/agent/src/preparation-prompt/gathering-context@1.njk",
    "packages/agent/src/preparation-prompt/planning@1.njk",
    "packages/agent/src/step-prompt/agent-decision@1.njk",
    "packages/agent/src/prompting/authorized-tools@1.njk",
] as const);

/** Prompt 资产路径到默认 Bundle 模板 ID 的固定映射。 */
export const SWE_ACP_WORKER_PROMPT_ASSET_IDS = Object.freeze([
    "global-overview@1",
    "profile@1",
    "gathering-context@1",
    "planning@1",
    "agent-decision@1",
    "authorized-tools@1",
] as const);
