/**
 * ACP Worker 的固定 bundle 入口；宿主构建器与显式 Docker smoke 共用。
 */
export const SWE_ACP_WORKER_ENTRYPOINT = "benchmarks/swebench/src/worker.ts" as const;

/** TUI 透明代理使用的 Tool RPC Worker bundle 入口。 */
export const SWE_TOOLS_WORKER_ENTRYPOINT = "benchmarks/swebench/src/tools-worker-entry.ts" as const;

/**
 * Worker 内置 Prompt 模板的仓库相对路径；这些文件会被 WorkerBuilder 嵌入产物。
 */
export const SWE_ACP_WORKER_PROMPT_ASSETS = Object.freeze([
    "packages/agent/src/global-system-prompt/global-overview@1.njk",
    "packages/agent/src/prompting/profile@1.njk",
    "packages/agent/src/step-prompt/agent-decision@1.njk",
    "packages/agent/src/prompting/authorized-tools@1.njk",
] as const);

/** Prompt 资产路径到默认 Bundle 模板 ID 的固定映射。 */
export const SWE_ACP_WORKER_PROMPT_ASSET_IDS = Object.freeze([
    "global-overview@1",
    "profile@1",
    "agent-decision@1",
    "authorized-tools@1",
] as const);

/** Worker 与预检共用的环境初始化；日志不得写入 ACP stdout。 */
export const SWE_ACP_TESTBED_ENV = "{ source /opt/miniconda3/etc/profile.d/conda.sh && conda activate testbed; } >&2";

/**
 * 构造容器 Worker 启动参数，激活 testbed 后用 exec 保持进程取消语义。
 * @param containerName - 本题已经创建的容器名称。
 * @returns docker 的参数；不含凭据或宿主环境注入。
 * @example
 * ```ts
 * const args = swebenchWorkerArgs("lazygoal-task-1");
 * ```
 */
export function swebenchWorkerArgs(containerName: string): string[] {
    return ["exec", "-i", "--workdir", "/opt/lazygoal", containerName, "/bin/bash", "-c",
        `${SWE_ACP_TESTBED_ENV} && exec /opt/lazygoal/node /opt/lazygoal/worker.mjs`];
}
