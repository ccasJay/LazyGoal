import { join } from "node:path";

import {
    resolveLazyGoalHomePaths,
    resolveWorkspaceHomePaths,
} from "../../packages/config/src/index.js";

/**
 * Benchmark 默认运行和 cache 路径。
 *
 * @example
 * ```ts
 * const paths = await resolveBenchmarkHomePaths(process.cwd(), "gaia");
 * console.log(paths.cacheDirectory);
 * ```
 */
export interface BenchmarkHomePaths {
    /** 当前 workspace 下的 benchmark 根目录。 */
    readonly benchmarkDirectory: string;
    /** 当前 benchmark 的默认运行目录。 */
    readonly runsDirectory: string;
    /** 当前 benchmark 的全局可重建 cache 目录。 */
    readonly cacheDirectory: string;
}

/**
 * 解析某个 benchmark 的默认 Home 路径。
 *
 * @remarks
 * 运行结果与当前 checkout 隔离；数据集和 Worker 等可重建内容放入全局 cache。
 * 该函数只解析路径，不创建目录，也不覆盖调用方显式指定的输出目录。
 *
 * @param workspaceRoot - benchmark 使用的 workspace 根目录。
 * @param benchmarkId - 稳定的 benchmark 标识。
 * @param env - 可选环境变量映射，主要用于测试注入 Home。
 * @returns 当前 benchmark 的运行和 cache 路径。
 * @throws workspace 无法解析或 Home 配置非法时传播错误。
 * @example
 * ```ts
 * const paths = await resolveBenchmarkHomePaths(process.cwd(), "gaia");
 * console.log(paths.runsDirectory);
 * ```
 */
export async function resolveBenchmarkHomePaths(
    workspaceRoot: string,
    benchmarkId: string,
    env: NodeJS.ProcessEnv = process.env,
): Promise<BenchmarkHomePaths> {
    const home = resolveLazyGoalHomePaths(env);
    const workspace = await resolveWorkspaceHomePaths(home, workspaceRoot);
    const benchmarkDirectory = join(workspace.benchmarksDirectory, benchmarkId);
    return {
        benchmarkDirectory,
        runsDirectory: join(benchmarkDirectory, "runs"),
        cacheDirectory: join(workspace.benchmarkCacheDirectory, benchmarkId),
    };
}
