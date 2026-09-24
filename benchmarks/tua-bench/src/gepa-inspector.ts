import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, readlink, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { loadTuaBenchManifest } from "./manifest-loader.js";
import type { TuaBenchTaskDefinition } from "./types.js";

const execFileAsync = promisify(execFile);
const SHA256 = /^sha256:[a-f0-9]{64}$/u;

/**
 * TUA GEPA 预检所需的显式数据源和任务分组。
 *
 * @remarks
 * 每个集合必须非空且任务 ID 唯一；验证集与预留集必须覆盖训练集中的全部任务族。
 * 该请求只标识数据，不包含候选 Prompt 或评分结果。
 *
 * @example
 * ```ts
 * const request: TuaGepaDatasetRequest = {
 *   repoRoot: "/data/TUA-Bench",
 *   trainTaskIds: ["train-doc"],
 *   validationTaskIds: ["validation-doc"],
 *   holdoutTaskIds: ["holdout-doc"],
 * };
 * ```
 */
export interface TuaGepaDatasetRequest {
    /** 本机 TUA-Bench 仓库根目录。 */
    readonly repoRoot: string;
    /** 允许 GEPA 参与评分与反思的训练任务。 */
    readonly trainTaskIds: readonly string[];
    /** 仅用于 GEPA 候选选择的验证任务。 */
    readonly validationTaskIds: readonly string[];
    /** 只在候选冻结后执行对照的预留任务。 */
    readonly holdoutTaskIds: readonly string[];
}

/**
 * 一个不包含任务正文或验证器内容的 TUA 任务快照。
 *
 * @remarks
 * 摘要供预检与 Run 身份冻结使用。`resourceDigest` 覆盖所选任务目录文件，
 * `imageDigest` 指向本机已准备镜像的不可变身份；二者都不能还原文件正文。
 *
 * @example
 * ```ts
 * const task: TuaGepaTaskSnapshot = {
 *   taskId: "train-doc",
 *   taskFamily: "document",
 *   networkMode: "none",
 *   agentTimeoutSec: 600,
 *   verifierTimeoutSec: 600,
 *   resourceDigest: "a".repeat(64),
 *   imageDigest: `sha256:${"b".repeat(64)}`,
 * };
 * ```
 */
export interface TuaGepaTaskSnapshot {
    /** 任务唯一标识。 */
    readonly taskId: string;
    /** 任务所属族。 */
    readonly taskFamily: string;
    /** 任务容器允许的网络策略。 */
    readonly networkMode: TuaBenchTaskDefinition["networkMode"];
    /** Agent 单任务时限（秒）。 */
    readonly agentTimeoutSec: number;
    /** 验证器单任务时限（秒）。 */
    readonly verifierTimeoutSec: number;
    /** 任务目录内相关资源的内容摘要。 */
    readonly resourceDigest: string;
    /** 本机 Docker 中实际存在的不可变镜像身份。 */
    readonly imageDigest: string;
}

/**
 * TUA GEPA 数据预检得到的可冻结身份与安全摘要。
 *
 * @remarks
 * 仅包含任务 ID、任务族、网络策略、资源摘要和镜像身份；不包含任务指令、答案或验证器正文。
 * `partitions` 保留调用方提供的集合归属，供 GEPA 防止最终预留集进入优化反馈。
 *
 * @example
 * ```ts
 * const snapshot = await inspectTuaGepaDataset(request);
 * console.log(snapshot.datasetDigest, snapshot.partitions.holdout.taskIds);
 * ```
 */
export interface TuaGepaDatasetInspection {
    /** 当前 TUA-Bench Git revision。 */
    readonly sourceRevision: string;
    /** 所选任务资源在当前工作树中的集合摘要。 */
    readonly datasetDigest: string;
    /** 所选任务目录是否包含未提交文件变更。 */
    readonly workingTreeDirty: boolean;
    /** 所选任务的未提交相对路径。 */
    readonly changedPaths: readonly string[];
    /** 每个所选任务的定义、资源摘要和镜像身份。 */
    readonly tasks: Readonly<Record<string, TuaGepaTaskSnapshot>>;
    /** 显式分组及各组对应的任务族。 */
    readonly partitions: Readonly<Record<"train" | "validation" | "holdout", {
        readonly taskIds: readonly string[];
        readonly taskFamilies: readonly string[];
        readonly networkTasks: readonly string[];
    }>>;
}

/**
 * TUA 预检依赖的只读系统查询边界。
 *
 * @remarks
 * 镜像检查仅查询本机 Docker 镜像元数据，不得拉取镜像或启动容器；Git 查询只读取版本与所选任务路径状态。
 * 测试可以替换这两个操作以保证离线、确定性验证。
 *
 * @example
 * ```ts
 * const dependencies: TuaGepaInspectorDependencies = {
 *   inspectImage: async () => `sha256:${"a".repeat(64)}`,
 *   inspectGit: async () => ({ revision: "b".repeat(40), changedPaths: [] }),
 * };
 * ```
 */
export interface TuaGepaInspectorDependencies {
    /** 返回本机 Docker 镜像的 image ID；不得拉取镜像或启动容器。 */
    readonly inspectImage?: (imageRef: string) => Promise<string | null>;
    /** 读取仓库 revision 与选中任务目录内的未提交路径。 */
    readonly inspectGit?: (repoRoot: string, taskDirectories: readonly string[]) => Promise<{
        readonly revision: string;
        readonly changedPaths: readonly string[];
    }>;
}

/**
 * 对 TUA-Bench 显式分组做只读预检并冻结数据身份。
 *
 * @remarks
 * 只解析指定任务及其本地资源，使用本机镜像检查和 Git 只读查询；不会拉取镜像、启动容器、调用模型或写入文件。验证器内容只参与摘要计算，不会出现在返回值中。
 *
 * @param request - 数据仓库与互不重叠的三组任务 ID。
 * @param dependencies - 离线测试可替换的只读系统查询。
 * @returns 可写入 run manifest 的任务、来源、资源和镜像身份。
 * @throws 请求分组、任务资源、数据来源或本地镜像不可用时抛出错误。
 * @example
 * ```ts
 * const inspected = await inspectTuaGepaDataset({
 *   repoRoot: "/data/TUA-Bench",
 *   trainTaskIds: ["train-1"],
 *   validationTaskIds: ["validation-1"],
 *   holdoutTaskIds: ["holdout-1"],
 * });
 * console.log(inspected.datasetDigest);
 * ```
 */
export async function inspectTuaGepaDataset(
    request: TuaGepaDatasetRequest,
    dependencies: TuaGepaInspectorDependencies = {},
): Promise<TuaGepaDatasetInspection> {
    const repoRoot = await realpath(path.resolve(request.repoRoot)).catch(() => {
        throw new Error(`TUA-Bench repository does not exist: ${path.resolve(request.repoRoot)}`);
    });
    const rootStat = await stat(repoRoot);
    if (!rootStat.isDirectory()) throw new Error(`TUA-Bench repository is not a directory: ${repoRoot}`);

    const groups = {
        train: normalizeIds(request.trainTaskIds, "trainTaskIds"),
        validation: normalizeIds(request.validationTaskIds, "validationTaskIds"),
        holdout: normalizeIds(request.holdoutTaskIds, "holdoutTaskIds"),
    } as const;
    const seen = new Map<string, string>();
    for (const [partition, taskIds] of Object.entries(groups)) {
        for (const taskId of taskIds) {
            const previous = seen.get(taskId);
            if (previous !== undefined) {
                throw new Error(`TUA task ${taskId} appears in both ${previous} and ${partition} partitions`);
            }
            seen.set(taskId, partition);
        }
    }

    const manifest = await loadTuaBenchManifest(repoRoot);
    const taskIds = Object.values(groups).flat();
    const matches = new Map<string, TuaBenchTaskDefinition[]>();
    for (const task of manifest.tasks) {
        const matching = matches.get(task.taskId) ?? [];
        matching.push(task);
        matches.set(task.taskId, matching);
    }

    const selectedTasks = new Map<string, TuaBenchTaskDefinition>();
    for (const taskId of taskIds) {
        const tasks = matches.get(taskId) ?? [];
        if (tasks.length === 0) throw new Error(`TUA task does not exist or is invalid: ${taskId}`);
        if (tasks.length > 1) throw new Error(`TUA task ID is ambiguous in the dataset: ${taskId}`);
        selectedTasks.set(taskId, tasks[0]!);
    }

    const trainFamilies = new Set(groups.train.map((taskId) => selectedTasks.get(taskId)!.taskFamily));
    for (const partition of ["validation", "holdout"] as const) {
        const families = new Set(groups[partition].map((taskId) => selectedTasks.get(taskId)!.taskFamily));
        const missing = [...trainFamilies].filter((family) => !families.has(family));
        if (missing.length > 0) {
            throw new Error(`${partition} partition does not cover training task families: ${missing.join(", ")}`);
        }
    }

    const inspectImage = dependencies.inspectImage ?? inspectLocalDockerImage;
    const tasks: Record<string, TuaGepaTaskSnapshot> = {};
    for (const taskId of taskIds) {
        const task = selectedTasks.get(taskId)!;
        const resourceDigest = await digestTaskResources(repoRoot, task);
        const imageDigest = await inspectImage(task.imageRef);
        if (imageDigest === null) {
            throw new Error(`TUA task ${taskId} requires locally prepared Docker image ${task.imageRef}`);
        }
        if (!SHA256.test(imageDigest)) {
            throw new Error(`TUA task ${taskId} image inspection returned an invalid image ID`);
        }
        tasks[taskId] = {
            taskId,
            taskFamily: task.taskFamily,
            networkMode: task.networkMode,
            agentTimeoutSec: task.agentTimeoutSec,
            verifierTimeoutSec: task.verifierTimeoutSec,
            resourceDigest,
            imageDigest,
        };
    }

    const git = await (dependencies.inspectGit ?? inspectGit)(
        repoRoot,
        taskIds.map((taskId) => selectedTasks.get(taskId)!.taskDir),
    );
    const datasetDigest = createHash("sha256").update(JSON.stringify({
        repoRoot,
        sourceRevision: git.revision,
        changedPaths: git.changedPaths,
        tasks: taskIds.map((taskId) => ({
            taskId,
            resourceDigest: tasks[taskId]!.resourceDigest,
            imageDigest: tasks[taskId]!.imageDigest,
        })),
    }), "utf8").digest("hex");

    return {
        sourceRevision: git.revision,
        datasetDigest,
        workingTreeDirty: git.changedPaths.length > 0,
        changedPaths: git.changedPaths,
        tasks,
        partitions: {
            train: describePartition(groups.train, selectedTasks),
            validation: describePartition(groups.validation, selectedTasks),
            holdout: describePartition(groups.holdout, selectedTasks),
        },
    };
}

function normalizeIds(ids: readonly string[], field: string): readonly string[] {
    if (!Array.isArray(ids) || ids.length === 0) throw new Error(`${field} must be a non-empty task ID list`);
    const seen = new Set<string>();
    for (const id of ids) {
        if (typeof id !== "string" || id.trim() === "") throw new Error(`${field} contains an empty task ID`);
        if (id !== id.trim()) throw new Error(`${field} task IDs must not contain surrounding whitespace`);
        if (seen.has(id)) throw new Error(`${field} contains duplicate task ID ${id}`);
        seen.add(id);
    }
    return Object.freeze([...ids]);
}

function describePartition(
    taskIds: readonly string[],
    tasks: ReadonlyMap<string, TuaBenchTaskDefinition>,
): { readonly taskIds: readonly string[]; readonly taskFamilies: readonly string[]; readonly networkTasks: readonly string[] } {
    const taskFamilies = [...new Set(taskIds.map((taskId) => tasks.get(taskId)!.taskFamily))].sort();
    const networkTasks = taskIds.filter((taskId) => tasks.get(taskId)!.networkMode === "public");
    return { taskIds, taskFamilies, networkTasks };
}

async function digestTaskResources(repoRoot: string, task: TuaBenchTaskDefinition): Promise<string> {
    const taskRoot = path.resolve(task.taskDir);
    if (!isWithin(path.join(repoRoot, "tasks"), taskRoot)) {
        throw new Error(`TUA task path escapes the selected repository: ${task.taskId}`);
    }
    const files = await listTaskFiles(taskRoot);
    const requiredFiles = ["task.toml", "instruction.md", task.verifierPath ?? "tests/test.sh"];
    for (const relative of requiredFiles) {
        const resolved = path.resolve(taskRoot, relative);
        if (!isWithin(taskRoot, resolved)) throw new Error(`TUA task ${task.taskId} has an unsafe ${relative} path`);
        const entry = await lstat(resolved).catch(() => null);
        if (entry === null || !entry.isFile()) {
            throw new Error(`TUA task ${task.taskId} is missing required resource ${relative}`);
        }
    }
    const hash = createHash("sha256");
    for (const file of files) {
        hash.update(file.relative, "utf8");
        hash.update("\0", "utf8");
        hash.update(file.digest, "utf8");
        hash.update("\0", "utf8");
    }
    return hash.digest("hex");
}

async function listTaskFiles(taskRoot: string): Promise<readonly { readonly relative: string; readonly digest: string }[]> {
    const result: { relative: string; digest: string }[] = [];
    const visit = async (directory: string): Promise<void> => {
        const entries = await readdir(directory, { withFileTypes: true });
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
            const absolute = path.join(directory, entry.name);
            const relative = path.relative(taskRoot, absolute).split(path.sep).join("/");
            if (entry.isSymbolicLink()) {
                const target = await readlink(absolute);
                result.push({ relative, digest: createHash("sha256").update(`symlink:${target}`).digest("hex") });
            } else if (entry.isDirectory()) {
                await visit(absolute);
            } else if (entry.isFile()) {
                const content = await readFile(absolute);
                result.push({ relative, digest: createHash("sha256").update(content).digest("hex") });
            }
        }
    };
    await visit(taskRoot);
    return result;
}

async function inspectLocalDockerImage(imageRef: string): Promise<string | null> {
    try {
        const { stdout } = await execFileAsync("docker", ["image", "inspect", "--format", "{{.Id}}", imageRef], {
            timeout: 30_000,
            maxBuffer: 16 * 1024,
        });
        return stdout.trim() || null;
    } catch {
        return null;
    }
}

async function inspectGit(repoRoot: string, taskDirectories: readonly string[]): Promise<{
    readonly revision: string;
    readonly changedPaths: readonly string[];
}> {
    const [{ stdout: revisionRaw }, { stdout: statusRaw }] = await Promise.all([
        execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, timeout: 30_000, maxBuffer: 16 * 1024 }),
        execFileAsync("git", [
            "status",
            "--porcelain=v1",
            "--untracked-files=all",
            "--",
            ...taskDirectories.map((directory) => path.relative(repoRoot, directory)),
        ], {
            cwd: repoRoot,
            timeout: 30_000,
            maxBuffer: 1024 * 1024,
        }),
    ]);
    const revision = revisionRaw.trim();
    if (!/^[a-f0-9]{40,64}$/u.test(revision)) throw new Error("TUA-Bench Git revision is invalid");
    const changedPaths = statusRaw.split(/\r?\n/u).filter(Boolean).map((line) => line.slice(3).trim()).sort();
    return { revision, changedPaths };
}

function isWithin(parent: string, candidate: string): boolean {
    const relative = path.relative(path.resolve(parent), path.resolve(candidate));
    return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
