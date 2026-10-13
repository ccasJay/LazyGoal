import { identity } from "./content-identity.js";
import type { AgentProfile } from "../../packages/runtime/src/index.js";
import type { EnvironmentSpec } from "./isolated-environment.js";
import type { WorkerArtifact } from "./worker-builder.js";
import type { FilesystemArchive } from "./filesystem-archive.js";

/**
 * Agent 可见的固定工程任务投影；评分秘密不属于此契约。
 * @remarks 内容摘要覆盖全部来源字段，镜像使用不可变 Docker ID。
 * @example
 * ```ts
 * const task = await source.readTask(packagePath);
 * console.log(task.instanceId, task.imageId);
 * ```
 */
export interface SourceTaskPackage {
    readonly source: "swebench";
    readonly dataset: string;
    readonly revision: string;
    readonly instanceId: string;
    readonly repo: string;
    readonly baseCommit: string;
    readonly problemStatement: string;
    readonly image: string;
    readonly imageId: string;
    readonly contentHash: string;
}
/**
 * 来源环境回收的公共事实；文件系统归档只在安全捕获时存在。
 * @example
 * ```ts
 * console.log(artifacts.patch, artifacts.archive?.sha256);
 * ```
 */
export interface SourceArtifacts {
    readonly directory: string;
    readonly files: Readonly<Record<string, string>>;
    readonly verifier: null;
    readonly violations: readonly string[];
    readonly patch: string;
    readonly archive?: FilesystemArchive;
}
/**
 * 官方工程评分；不解释 Runtime 或 Context 成功状态。
 * @example
 * ```ts
 * console.log(grade.status, grade.resolved);
 * ```
 */
export interface TaskGrade {
    readonly status: "resolved" | "unresolved" | "empty_patch" | "grading_error";
    readonly resolved: boolean | null;
    readonly patchSha256: string;
    readonly harnessVersion: string;
    readonly raw: unknown;
}
/**
 * 工程任务来源端口；宿主组合根注入，不允许 benchmark 横向导入。
 * @remarks 私有评分路径只由实现持有；环境只收到公开任务。评分在干净的独立环境运行。
 * @example
 * ```ts
 * const task = await source.readTask(path);
 * const grade = await source.grade(task, patch, output);
 * ```
 */
export interface BenchmarkTaskSource {
    readonly id: "swebench";
    /** 进程加载时的来源实现与官方 bridge 摘要，不包含宿主凭据。 */
    readonly buildIdentity: Readonly<{ sourceDigest: string; bridgeDigest: string }>;
    readonly profile: AgentProfile;
    readonly workerEntryPoint: string;
    /** 导入固定清单；返回 Agent 可见任务包文件路径，评分数据独立保存。 */
    importTasks(manifestPath: string, directory: string, signal?: AbortSignal): Promise<readonly string[]>;
    /** 校验公开任务与宿主私有评分包身份，不启动 Agent。 */
    readTask(path: string): Promise<SourceTaskPackage>;
    /** 声明初始或恢复环境；恢复不得清理已有工作区。 */
    environment(task: SourceTaskPackage, worker: WorkerArtifact, capture: boolean, archive?: { readonly directory: string; readonly manifest: FilesystemArchive }, signal?: AbortSignal): Promise<EnvironmentSpec<SourceTaskPackage, SourceArtifacts>>;
    /** 导出的补丁进入官方评分边界；非 resolved 结果原样保存。 */
    grade(task: SourceTaskPackage, patch: string, directory: string, signal?: AbortSignal): Promise<TaskGrade>;
}

/** 严格解析公开任务投影，拒绝额外评分材料。 */
export function parseSourceTask(raw: unknown): SourceTaskPackage {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid source task");
    const v = raw as Record<string, unknown>;
    const fields = ["source", "dataset", "revision", "instanceId", "repo", "baseCommit", "problemStatement", "image", "imageId", "contentHash"];
    if (Object.keys(v).length !== fields.length || Object.keys(v).some(k => !fields.includes(k)) || fields.some(k => typeof v[k] !== "string" || !v[k]) ||
        v.source !== "swebench" || v.dataset !== "princeton-nlp/SWE-bench_Verified" || !/^[a-f0-9]{40}$/.test(String(v.revision)) ||
        !/^sha256:[a-f0-9]{64}$/.test(String(v.imageId))) throw new Error("Invalid source task identity");
    if (!/^[a-zA-Z0-9_.-]+__[a-zA-Z0-9_.-]+-\d+$/.test(String(v.instanceId)) || !/^[\w.-]+\/[\w.-]+$/.test(String(v.repo)) || !/^[a-f0-9]{40}$/.test(String(v.baseCommit)) ||
        v.image !== `swebench/sweb.eval.x86_64.${String(v.instanceId).toLowerCase().replaceAll("__", "_1776_")}:latest`) throw new Error("Invalid source task projection");
    const { contentHash, ...body } = v;
    if (identity(body) !== contentHash) throw new Error("Source task content mismatch");
    return v as unknown as SourceTaskPackage;
}
