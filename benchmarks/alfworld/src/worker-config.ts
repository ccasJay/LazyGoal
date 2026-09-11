/** ALFWorld ACP Worker 的共享构建入口。 */
export const ALFWORLD_ACP_WORKER_ENTRYPOINT = "benchmarks/alfworld/src/worker.ts" as const;

/**
 * ALFWorld Worker 使用的 Prompt 模板；路径会由共享 WorkerBuilder 嵌入 bundle。
 */
export const ALFWORLD_ACP_WORKER_PROMPT_ASSETS = Object.freeze([
    "packages/agent/src/global-system-prompt/global-overview@1.njk",
    "packages/agent/src/prompting/profile@1.njk",
    "packages/agent/src/preparation-prompt/gathering-context@1.njk",
    "packages/agent/src/preparation-prompt/planning@1.njk",
    "packages/agent/src/step-prompt/agent-decision@1.njk",
    "packages/agent/src/prompting/authorized-tools@1.njk",
] as const);

/** Prompt 资产与默认 Bundle 的固定模板 ID 映射。 */
export const ALFWORLD_ACP_WORKER_PROMPT_ASSET_IDS = Object.freeze([
    "global-overview@1",
    "profile@1",
    "gathering-context@1",
    "planning@1",
    "agent-decision@1",
    "authorized-tools@1",
] as const);

/** 容器内 ALFWorld 数据根；宿主数据通过 EnvironmentHandle 复制到这里。 */
export const ALFWORLD_CONTAINER_DATA_ROOT = "/opt/alfworld/data" as const;

/** 注入容器的 Python sidecar 路径。 */
export const ALFWORLD_CONTAINER_SIDECAR_PATH = "/opt/lazygoal/alfworld-sidecar.py" as const;

/**
 * 构造不依赖宿主路径的 ALFWorld Worker 启动 shell 命令。
 *
 * @param pythonExecutable - 容器内 Python 可执行文件，默认使用 `python3`。
 * @returns 可传给 `WorkerEntryConfig.command` 的命令参数。
 * @example
 * ```ts
 * const command = alfworldWorkerCommand("python3");
 * ```
 */
export function alfworldWorkerCommand(pythonExecutable = "python3"): readonly string[] {
    if (pythonExecutable.trim() === "") throw new TypeError("ALFWorld Python executable must be non-empty");
    return ["/bin/bash", "-c", [
        `export ALFWORLD_DATA=${shellQuote(ALFWORLD_CONTAINER_DATA_ROOT)}`,
        `export ALFWORLD_SIDECAR=${shellQuote(ALFWORLD_CONTAINER_SIDECAR_PATH)}`,
        `export ALFWORLD_PYTHON=${shellQuote(pythonExecutable)}`,
        "exec /opt/lazygoal/node /opt/lazygoal/worker.mjs",
    ].join("; ")];
}

function shellQuote(value: string): string {
    return `'${value.replaceAll("'", "'\\''")}'`;
}
