import { SWE_ACP_TESTBED_ENV } from "./worker-config.js";
import type { WorkerManifest } from "./worker-builder.js";
import { requireSuccess, runProcess, type ProcessRunner, type ProcessResult } from "./process.js";

/** Worker 启动前必须通过的检查阶段。 */
export type WorkerPreflightCheck = "platform" | "node" | "dynamic_libraries" | "worker_digest" | "node_digest" | "base_commit" | "conda";

/**
 * Worker 预检失败；`check` 标识首个失败边界，`detail` 只包含有界命令诊断。
 *
 * @example
 * ```ts
 * try { await preflightWorker(options); } catch (error) {
 *   if (error instanceof WorkerPreflightError) console.error(error.check);
 * }
 * ```
 */
export class WorkerPreflightError extends Error {
    override readonly name = "WorkerPreflightError";

    constructor(readonly check: WorkerPreflightCheck, message: string) {
        super(`Worker preflight ${check} failed: ${message}`);
    }
}

/** Worker 预检的容器、固定身份和宿主进程边界。 */
export interface WorkerPreflightOptions {
    /** 已创建并启动的唯一容器名。 */
    readonly containerName: string;
    /** `docker image inspect` 得到的题目镜像内容 ID。 */
    readonly imageId: string;
    /** 题目原始 base commit；必须与容器 `/testbed` 当前 HEAD 相同。 */
    readonly baseCommit: string;
    /** 已由宿主构建并校验的 Worker 清单。 */
    readonly manifest: WorkerManifest;
    /** 测试可注入的 Docker 进程边界。 */
    readonly run?: ProcessRunner;
    /** 传播任务取消或宿主终止。 */
    readonly signal?: AbortSignal;
}

/** 预检通过后可用于报告的有界运行时事实。 */
export interface WorkerPreflightResult {
    readonly platform: "linux/amd64";
    readonly nodeVersion: "22.22.2";
    readonly workerSha256: string;
    readonly nodeSha256: string;
    readonly baseCommit: string;
    readonly condaPython: string;
}

/**
 * 在首次模型调用和容器内 Runtime 副作用前验证 Worker 运行环境。
 *
 * @param options - 容器身份、期望摘要和 Docker 进程边界。
 * @returns 通过平台、Node、动态库、文件摘要、base commit 和 Conda 检查的事实。
 * @throws `WorkerPreflightError` 表示首个失败检查；Docker 启动、取消和输出超限错误原样传播。
 * @example
 * ```ts
 * const facts = await preflightWorker({
 *   containerName: container.name,
 *   imageId: container.imageId!,
 *   baseCommit: task.base_commit,
 *   manifest: artifact.manifest,
 * });
 * ```
 */
export async function preflightWorker(options: WorkerPreflightOptions): Promise<WorkerPreflightResult> {
    const run = options.run ?? runProcess;
    const platform = requireOutput(await run("docker", ["image", "inspect", "--format", "{{.Os}}/{{.Architecture}}", options.imageId], processOptions(options)), "platform");
    if (platform.trim() !== "linux/amd64") throw new WorkerPreflightError("platform", `expected linux/amd64, received ${platform.trim() || "<empty>"}`);

    const nodeVersion = await execOutput(run, options, ["/opt/lazygoal/node", "--version"], "node");
    if (nodeVersion.trim() !== `v${options.manifest.nodeVersion}`) {
        throw new WorkerPreflightError("node", `expected v${options.manifest.nodeVersion}, received ${nodeVersion.trim() || "<empty>"}`);
    }

    const dynamicLibraries = await execOutput(run, options, ["/bin/sh", "-c", "ldd /opt/lazygoal/node"], "dynamic_libraries");
    if (/not found|cannot open shared object file/iu.test(dynamicLibraries)) {
        throw new WorkerPreflightError("dynamic_libraries", truncateDiagnostic(dynamicLibraries));
    }

    const workerSha256 = parseSha256(await execOutput(run, options, ["/bin/sh", "-c", "sha256sum /opt/lazygoal/worker.mjs"], "worker_digest"), "worker_digest");
    if (workerSha256 !== options.manifest.workerSha256) throw new WorkerPreflightError("worker_digest", `expected ${options.manifest.workerSha256}, received ${workerSha256}`);

    const nodeSha256 = parseSha256(await execOutput(run, options, ["/bin/sh", "-c", "sha256sum /opt/lazygoal/node"], "node_digest"), "node_digest");
    if (nodeSha256 !== options.manifest.nodeSha256) throw new WorkerPreflightError("node_digest", `expected ${options.manifest.nodeSha256}, received ${nodeSha256}`);

    const baseCommit = (await execOutput(run, options, ["git", "rev-parse", "HEAD"], "base_commit")).trim();
    if (baseCommit !== options.baseCommit) throw new WorkerPreflightError("base_commit", `expected ${options.baseCommit}, received ${baseCommit || "<empty>"}`);

    const condaPython = (await execOutput(run, options, ["/bin/bash", "-c", `${SWE_ACP_TESTBED_ENV} && python -c 'import sys, pytest; assert sys.prefix == "/opt/miniconda3/envs/testbed"; print("Python " + sys.version.split()[0])'`], "conda")).trim();
    if (!/^Python\s+\d+(?:\.\d+){1,2}(?:\s|$)/u.test(condaPython)) throw new WorkerPreflightError("conda", `unexpected Python version output: ${truncateDiagnostic(condaPython)}`);

    return {
        platform: "linux/amd64",
        nodeVersion: options.manifest.nodeVersion,
        workerSha256,
        nodeSha256,
        baseCommit,
        condaPython,
    };
}

async function execOutput(run: ProcessRunner, options: WorkerPreflightOptions, command: readonly string[], check: WorkerPreflightCheck): Promise<string> {
    const result = await run("docker", ["exec", "--workdir", "/testbed", options.containerName, ...command], {
        ...processOptions(options),
    });
    if (result.code !== 0) throw new WorkerPreflightError(check, processDiagnostic(result));
    return result.stdout;
}

function processOptions(options: WorkerPreflightOptions): { timeoutMs: number; maxBytes: number; signal?: AbortSignal } {
    return {
        timeoutMs: 30_000,
        maxBytes: 64 * 1024,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    };
}

function requireOutput(result: ProcessResult, check: WorkerPreflightCheck): string {
    if (result.code !== 0) throw new WorkerPreflightError(check, processDiagnostic(result));
    return result.stdout;
}

function parseSha256(output: string, check: WorkerPreflightCheck): string {
    const digest = output.trim().split(/\s+/u)[0];
    if (digest === undefined || !/^[a-f0-9]{64}$/u.test(digest)) throw new WorkerPreflightError(check, `invalid sha256sum output: ${truncateDiagnostic(output)}`);
    return digest;
}

function processDiagnostic(result: ProcessResult): string {
    return truncateDiagnostic(result.stderr || result.stdout || `exit ${result.code}`);
}

function truncateDiagnostic(value: string): string {
    return value.length <= 512 ? value : `${value.slice(0, 512)}…`;
}
