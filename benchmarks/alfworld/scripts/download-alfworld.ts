import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    ALFWORLD_DATA_ENV,
    loadAlfworldEnvironmentFile,
    resolveAlfworldEnvironment,
} from "../src/environment-config.js";

/**
 * ALFWorld 数据下载脚本的可注入边界。
 *
 * @remarks
 * 下载入口只在显式调用时启动 `alfworld-download`，不会被普通测试或评测
 * 自动触发。环境文件先解析，调用方显式传入的环境变量随后覆盖文件值；
 * 子进程收到解析后的绝对 `ALFWORLD_DATA`，保证下载位置与评测入口一致。
 *
 * @example
 * ```ts
 * const exitCode = await runAlfworldDownload({
 *   environmentFilePath: "benchmarks/alfworld/.env.alfworld",
 * });
 * ```
 */
export interface AlfworldDownloadOptions {
    /** 可选环境文件路径；默认读取 package 内的 `.env.alfworld`。 */
    readonly environmentFilePath?: string;
    /** 当前进程环境；显式值覆盖环境文件中的同名变量。 */
    readonly env?: NodeJS.ProcessEnv;
    /** 解析相对数据路径时使用的工作目录；生产入口默认使用当前目录。 */
    readonly cwd?: string;
    /** 测试替身；生产入口使用 Node 的同步子进程执行器。 */
    readonly spawn?: typeof spawnSync;
    /** 可选错误输出；默认写入 stderr。 */
    readonly writeError?: (text: string) => void;
}

/**
 * 按 ALFWorld 环境配置下载测试数据。
 *
 * @param options - 环境文件、覆盖变量和外部进程边界。
 * @returns `0` 表示下载进程成功退出；配置或子进程失败返回非零码。
 * @throws 环境文件非法或缺少 `ALFWORLD_PYTHON`/`ALFWORLD_DATA` 时抛出配置错误。
 * @example
 * ```ts
 * const exitCode = await runAlfworldDownload();
 * process.exitCode = exitCode;
 * ```
 */
export async function runAlfworldDownload(
    options: AlfworldDownloadOptions = {},
): Promise<number> {
    const callerEnv = options.env ?? process.env;
    const fileEnv = await loadAlfworldEnvironmentFile(
        options.environmentFilePath,
        callerEnv,
    );
    const environment = { ...fileEnv, ...callerEnv };
    const config = resolveAlfworldEnvironment({
        env: environment,
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    });
    const childEnv = {
        ...environment,
        [ALFWORLD_DATA_ENV]: config.dataRoot,
    };
    const writeError = options.writeError ?? ((text: string) => {
        process.stderr.write(`${text}\n`);
    });
    const spawn = options.spawn ?? spawnSync;

    writeError(`Downloading ALFWorld data to ${config.dataRoot}`);
    const result = spawn(
        "alfworld-download",
        ["--data-dir", config.dataRoot],
        { stdio: "inherit", env: childEnv },
    );

    if (result.error !== undefined) {
        writeError(`Unable to run alfworld-download: ${result.error.message}`);
        return 1;
    }
    return result.status ?? 1;
}

const entrypoint = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (entrypoint === fileURLToPath(import.meta.url)) {
    void runAlfworldDownload().then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
