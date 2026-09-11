import { access, mkdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type {
    BenchmarkPersistenceLocator,
    EnvironmentHandle,
    EnvironmentSpec,
    ImageSource,
    PreflightResult,
    WorkerEntryConfig,
} from "../../src/index.js";
import type { SwebenchAcpTaskMetadata } from "./worker-runtime.js";
import { SWE_ACP_TESTBED_ENV } from "./worker-config.js";
import type { SwebenchTask } from "./container.js";
import type { WorkerArtifact, WorkerManifest } from "../../src/worker-builder.js";
import type { WorkerPreflightResult } from "./worker-preflight.js";
import { preflightWorkerInEnvironment } from "./worker-preflight.js";
import { recoverSwebenchResult } from "./result-recovery.js";
import { requireSuccess } from "../../src/process.js";

/**
 * SWE-bench 环境导出阶段的领域事实。
 *
 * @example
 * ```ts
 * const artifacts: SwebenchCollectedArtifacts = {
 *   patch: "", persistence: null, errors: [],
 * };
 * ```
 */
export interface SwebenchCollectedArtifacts {
    readonly patch: string | null;
    readonly persistence: BenchmarkPersistenceLocator | null;
    readonly meta?: Readonly<Record<string, unknown>>;
    readonly errors: readonly SwebenchCollectedArtifactError[];
}

/**
 * SWE-bench 产物回收的有界阶段错误。
 *
 * @example
 * ```ts
 * const error: SwebenchCollectedArtifactError = {
 *   stage: "patch_export", message: "git diff failed",
 * };
 * ```
 */
export interface SwebenchCollectedArtifactError {
    readonly stage: "artifact_copy" | "patch_export";
    readonly message: string;
}

/**
 * 从 SWE-bench 容器中提取临时 git diff 补丁。
 *
 * @remarks
 * 纯领域操作，不读取或修改任何 Runtime 持久化。
 *
 * @param env - 容器环境执行句柄。
 * @param baseCommit - 基础 commit SHA。
 * @returns 提取的 git patch 字符串或失败信息。
 *
 * @example
 * ```ts
 * const { patch } = await exportSwebenchPatch(env, "abc1234");
 * ```
 */
export async function exportSwebenchPatch(
    env: EnvironmentHandle,
    baseCommit: string,
): Promise<{ readonly patch: string | null; readonly error?: string }> {
    try {
        const result = await env.exec([
            "set -eu",
            "index=/opt/lazygoal/git-index",
            "rm -f \"$index\"",
            "trap 'rm -f \"$index\"' EXIT",
            `GIT_INDEX_FILE=\"$index\" git read-tree ${baseCommit}`,
            "GIT_INDEX_FILE=\"$index\" git add -A",
            `GIT_INDEX_FILE=\"$index\" git diff --cached --binary --no-ext-diff ${baseCommit}`,
        ].join("; "), { timeoutMs: 30_000, maxBytes: 16 * 1024 * 1024 });
        if (result.code !== 0) {
            return { patch: null, error: result.stderr || result.stdout || `exit ${result.code}` };
        }
        return { patch: result.stdout };
    } catch (error) {
        return { patch: null, error: boundedMessage(error) };
    }
}

/**
 * SWE-bench 的声明式隔离环境适配。
 *
 * @remarks
 * 自带官方题目镜像，工作目录固定为 `/testbed`；领域预检仍复用已验证的
 * WorkerPreflight，补丁和 Runtime 状态通过 `EnvironmentHandle` 回收。容器创建、
 * 安全参数、Worker 注入与删除由共享 `IsolatedEnvironment` 拥有。
 *
 * @example
 * ```ts
 * const spec = new SwebenchEnvironmentSpec({ task, artifact, manifest, metadata, preflight });
 * const image = spec.resolveImage(task);
 * ```
 */
export class SwebenchEnvironmentSpec implements EnvironmentSpec<SwebenchTask, SwebenchCollectedArtifacts> {
    readonly benchmarkId = "swebench-acp";
    private readonly task: SwebenchTask;
    private readonly artifact: WorkerArtifact;
    private readonly manifest: WorkerManifest;
    private readonly metadata: SwebenchAcpTaskMetadata;
    private readonly preflightWorker: (() => Promise<WorkerPreflightResult>) | undefined;
    private readonly domainOnly: boolean;

    /**
     * @param options - 已校验的任务、Worker 清单、Runtime 身份和可选预检回调。
     */
    constructor(options: SwebenchEnvironmentSpecOptions) {
        this.task = options.task;
        this.artifact = options.artifact;
        this.manifest = options.manifest;
        this.metadata = options.metadata;
        this.preflightWorker = options.preflight;
        this.domainOnly = options.domainOnly ?? false;
    }

    /** 返回固定官方 SWE-bench 镜像，不接受任务字段中的任意镜像。 */
    resolveImage(task: SwebenchTask): ImageSource {
        if (task.instance_id !== this.task.instance_id || task.image !== this.task.image) {
            throw new TypeError("SWE-bench EnvironmentSpec task does not match its captured task");
        }
        return { mode: "custom", image: task.image, platform: "linux/amd64" };
    }

    /** 返回带 Conda 激活的 Worker 启动命令；激活日志定向到 stderr。 */
    getWorkerEntryConfig(task: SwebenchTask): WorkerEntryConfig {
        if (task.instance_id !== this.task.instance_id) throw new TypeError("SWE-bench Worker task identity mismatch");
        return {
            artifact: this.artifact,
            cwd: "/testbed",
            command: ["/bin/bash", "-c", `${SWE_ACP_TESTBED_ENV} && exec /opt/lazygoal/node /opt/lazygoal/worker.mjs`],
        };
    }

    /** 在共享容器句柄中重置仓库到固定 base commit。 */
    async prepareEnvironment(env: EnvironmentHandle): Promise<void> {
        const result = await env.exec(
            `git reset --hard ${this.task.base_commit} && git clean -fd && git diff --exit-code ${this.task.base_commit}`,
            { timeoutMs: 120_000, maxBytes: 64 * 1024, truncate: true },
        );
        requireSuccess(result, "Reset SWE-bench repository");
    }

    /** 保持现有完整 Worker 预检的身份和 Conda 检查语义。 */
    async preflight(env: EnvironmentHandle): Promise<PreflightResult> {
        const result = this.preflightWorker === undefined
            ? await preflightWorkerInEnvironment({ environment: env, baseCommit: this.task.base_commit, manifest: this.manifest })
            : await this.preflightWorker();
        return {
            ok: true,
            details: {
                platform: result.platform,
                nodeVersion: result.nodeVersion,
                workerSha256: result.workerSha256,
                nodeSha256: result.nodeSha256,
                baseCommit: result.baseCommit,
                condaPython: result.condaPython,
            },
        };
    }

    /**
     * 分别复制 Goal、Trajectory、Trace 并导出临时 index patch；单个产物失败不会
     * 阻止其他产物回收，也不会把失败误判成空补丁。
     */
    async collectArtifacts(
        env: EnvironmentHandle,
        outputDirectory: string,
        _graceMs: number,
    ): Promise<SwebenchCollectedArtifacts> {
        const output = resolve(outputDirectory);

        if (this.domainOnly) {
            const { patch, error } = await exportSwebenchPatch(env, this.task.base_commit);
            const errors: SwebenchCollectedArtifactError[] = [];
            if (error !== undefined) {
                errors.push({ stage: "patch_export", message: error });
            }
            return {
                patch,
                persistence: null,
                errors: Object.freeze(errors),
            };
        }

        const benchmarkKey = encode("swebench-acp");
        const instanceKey = encode(this.metadata.instanceId);
        const runtimeRoot = join(output, "runtime", benchmarkKey, instanceKey, encode(this.metadata.runId));
        await mkdir(runtimeRoot, { recursive: true });
        const copied: Partial<Record<"goals" | "trajectories" | "traces", string>> = {};
        const errors: SwebenchCollectedArtifactError[] = [];
        for (const kind of ["goals", "trajectories", "traces"] as const) {
            try {
                const target = join(runtimeRoot, kind);
                const source = `/opt/lazygoal/state/${benchmarkKey}/${instanceKey}/${kind}`;
                copied[kind] = await env.copyOut(source, target);
                await access(copied[kind]);
            } catch (error) {
                errors.push({ stage: "artifact_copy", message: boundedMessage(error) });
            }
        }

        const { patch, error: patchError } = await exportSwebenchPatch(env, this.task.base_commit);
        if (patchError !== undefined) {
            errors.push({ stage: "patch_export", message: patchError });
        }

        let meta: Readonly<Record<string, unknown>> | undefined;
        try {
            meta = await recoverSwebenchResult(copied, this.metadata, (message) => {
                errors.push({ stage: "artifact_copy", message });
            }, new AbortController().signal);
        } catch (error) {
            errors.push({ stage: "artifact_copy", message: boundedMessage(error) });
        }

        const goalDirectory = copied.goals;
        if (goalDirectory === undefined || !(await hasGoalIdentity(goalDirectory, this.metadata.goalId, this.metadata.runId))) {
            if (goalDirectory !== undefined) errors.push({ stage: "artifact_copy", message: "Copied Goal snapshot identity mismatch" });
            return { patch, persistence: null, ...(meta === undefined ? {} : { meta }), errors };
        }
        const persistence: BenchmarkPersistenceLocator = {
            goalSnapshot: relative(output, goalDirectory),
            trajectory: copied.trajectories === undefined ? relative(output, goalDirectory) : relative(output, copied.trajectories),
            ...(copied.traces === undefined ? {} : { diagnosticTrace: relative(output, copied.traces) }),
        };
        return { patch, persistence, ...(meta === undefined ? {} : { meta }), errors };
    }
}

/**
 * SWE-bench Spec 的构造输入。
 *
 * @example
 * ```ts
 * const options: SwebenchEnvironmentSpecOptions = {
 *   task, artifact, manifest, metadata,
 * };
 * ```
 */
export interface SwebenchEnvironmentSpecOptions {
    readonly task: SwebenchTask;
    readonly artifact: WorkerArtifact;
    readonly manifest: WorkerManifest;
    readonly metadata: SwebenchAcpTaskMetadata;
    /** 仅供旧容器测试替身覆盖；生产路径使用受限 EnvironmentHandle 预检。 */
    readonly preflight?: () => Promise<WorkerPreflightResult>;
    /** 是否仅回收领域产物（TUI 模式下宿主拥有持久化，不从容器复制 state）。 */
    readonly domainOnly?: boolean;
}

function encode(value: string): string {
    return Buffer.from(value, "utf8").toString("base64url");
}

async function hasGoalIdentity(directory: string, goalId: string, runId: string): Promise<boolean> {
    try {
        const file = join(directory, `${encode(goalId)}.json`);
        const value: unknown = JSON.parse(await readFile(file, "utf8"));
        if (typeof value !== "object" || value === null) return false;
        const state = (value as { state?: unknown }).state;
        const run = typeof state === "object" && state !== null ? (state as { run?: unknown }).run : undefined;
        return (value as { id?: unknown }).id === goalId
            && typeof run === "object" && run !== null && (run as { id?: unknown }).id === runId;
    } catch {
        return false;
    }
}

function boundedMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.length <= 1024 ? message : `${message.slice(0, 1024)}…`;
}
