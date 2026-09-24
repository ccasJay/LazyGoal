import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, readlink, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { loadTuaBenchManifest } from "./manifest-loader.js";
import type { TuaBenchTaskDefinition } from "./types.js";

const execFileAsync = promisify(execFile);
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const CANDIDATE_ID = /^(?:sha256:)?[a-f0-9]{64}$/u;
const PRIVATE_PATH = /(?:^|[\\/_.-])(?:answers?|solutions?|expected|gold|oracle|secret|private|verifier|grader|test|tests)(?:$|[\\/_.-])/iu;
const ANSWER_PATH = /(?:^|[\\/_.-])(?:answers?|solutions?|expected|gold|oracle|secret)(?:$|[\\/_.-])/iu;

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
 * TUA 训练/验证任务的 Prompt 泄漏审计请求。
 *
 * @remarks
 * 任务集合只允许包含 GEPA 训练和验证任务。候选指纹使用 GEPA codec 的 SHA-256，
 * 审计器不会读取请求集合以外的任务目录。
 *
 * @example
 * ```ts
 * const request: TuaGepaCandidateAuditRequest = {
 *   repoRoot: "/data/TUA-Bench",
 *   taskIds: ["train-doc", "validation-doc"],
 *   candidateId: "a".repeat(64),
 *   systemPrompt: "Solve the task carefully.",
 *   instructions: ["Use authorized tools."],
 * };
 * ```
 */
export interface TuaGepaCandidateAuditRequest {
    /** 本机 TUA-Bench 仓库根目录。 */
    readonly repoRoot: string;
    /** 仅允许传入 GEPA 训练和验证任务；最终预留集不得进入候选选择。 */
    readonly taskIds: readonly string[];
    /** 候选内容的稳定 SHA-256 身份。 */
    readonly candidateId: string;
    /** 候选 systemPrompt。 */
    readonly systemPrompt: string;
    /** 候选完整 instructions。 */
    readonly instructions: readonly string[];
}

/**
 * 候选与已知任务私有事实发生字面匹配时的脱敏原因。
 *
 * @remarks
 * 只记录任务、候选组件和匹配类别；不含答案、私有路径或 verifier 片段。
 *
 * @example
 * ```ts
 * const finding: TuaGepaCandidateAuditFinding = {
 *   taskId: "train-doc",
 *   component: "instruction_000",
 *   matchKind: "expected_answer",
 * };
 * ```
 */
export interface TuaGepaCandidateAuditFinding {
    /** 匹配到的 TUA 任务 ID。 */
    readonly taskId: string;
    /** 命中的 GEPA 候选组件。 */
    readonly component: string;
    /** 匹配类别；不返回任何匹配文本或私有文件内容。 */
    readonly matchKind: "task_id" | "private_filename" | "expected_answer" | "verifier_content";
}

/**
 * TUA 候选的脱敏泄漏审计结果。
 *
 * @remarks
 * 任一命中都阻断该候选的正向审阅结论；无命中只表示指定训练/验证集未发现字面匹配。
 *
 * @example
 * ```ts
 * const result: TuaGepaCandidateAuditResult = {
 *   candidateId: "a".repeat(64),
 *   auditedTaskIds: ["train-doc"],
 *   findings: [],
 *   positiveConclusionBlocked: false,
 * };
 * ```
 */
export interface TuaGepaCandidateAuditResult {
    /** 与请求中候选一致的稳定身份。 */
    readonly candidateId: string;
    /** 本次实际检查的任务 ID；不含 holdout。 */
    readonly auditedTaskIds: readonly string[];
    /** 不含命中原文的审计原因。 */
    readonly findings: readonly TuaGepaCandidateAuditFinding[];
    /** 有任一 finding 时必须阻断候选的正向晋升结论。 */
    readonly positiveConclusionBlocked: boolean;
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

/**
 * 在 TUA 数据源内做候选 Prompt 字面泄漏检查。
 *
 * @remarks
 * 仅读取传入的 train/validation 任务；调用方不得把 holdout ID 交给本函数。匹配结果只返回任务、候选组件和类别，不返回答案或 verifier 原文。此检查用于发现已知字面泄漏，不证明候选不存在语义过拟合。
 *
 * @param request - TUA 源、训练/验证任务及两个候选 Prompt 字段。
 * @returns 可持久化的脱敏审计结果；有命中时禁止形成正向晋升结论。
 * @throws 任务源、任务目录或候选请求无效时抛出错误。
 * @example
 * ```ts
 * const audit = await auditTuaGepaCandidate({
 *   repoRoot: "/data/TUA-Bench",
 *   taskIds: ["train-doc", "validation-doc"],
 *   candidateId: "a".repeat(64),
 *   systemPrompt: "Solve the task carefully.",
 *   instructions: ["Use only authorized tools."],
 * });
 * console.log(audit.positiveConclusionBlocked);
 * ```
 */
export async function auditTuaGepaCandidate(
    request: TuaGepaCandidateAuditRequest,
): Promise<TuaGepaCandidateAuditResult> {
    if (typeof request.repoRoot !== "string" || request.repoRoot.trim() === "") {
        throw new Error("TUA candidate audit repoRoot must be a non-empty path");
    }
    if (!CANDIDATE_ID.test(request.candidateId)) throw new Error("TUA candidate audit candidateId is invalid");
    if (typeof request.systemPrompt !== "string" || request.systemPrompt.trim() === "") {
        throw new Error("TUA candidate audit systemPrompt must be non-empty");
    }
    const taskIds = normalizeIds(request.taskIds, "taskIds");
    const instructions = normalizeCandidateInstructions(request.instructions);
    const repoRoot = await realpath(path.resolve(request.repoRoot)).catch(() => {
        throw new Error(`TUA-Bench repository does not exist: ${path.resolve(request.repoRoot)}`);
    });
    const tasksRoot = await realpath(path.join(repoRoot, "tasks")).catch(() => {
        throw new Error("TUA candidate audit could not resolve the task root");
    });
    if (!isWithin(repoRoot, tasksRoot)) throw new Error("TUA task root escapes the selected repository");
    const manifest = await loadTuaBenchManifest(repoRoot);
    const tasksById = new Map<string, TuaBenchTaskDefinition[]>();
    for (const task of manifest.tasks) {
        const tasks = tasksById.get(task.taskId) ?? [];
        tasks.push(task);
        tasksById.set(task.taskId, tasks);
    }

    const components = [
        { name: "system_prompt", text: request.systemPrompt },
        ...instructions.map((text, index) => ({ name: `instruction_${String(index).padStart(3, "0")}`, text })),
    ];
    const findings = new Map<string, TuaGepaCandidateAuditFinding>();
    for (const taskId of taskIds) {
        const matches = tasksById.get(taskId) ?? [];
        if (matches.length !== 1) throw new Error(`TUA task does not exist or is ambiguous: ${taskId}`);
        const task = matches[0]!;
        const taskRoot = path.resolve(task.taskDir);
        if (!isWithin(tasksRoot, taskRoot)) {
            throw new Error(`TUA task path escapes the selected repository: ${task.taskId}`);
        }
        const taskEntry = await lstat(taskRoot).catch(() => null);
        if (taskEntry === null || !taskEntry.isDirectory() || taskEntry.isSymbolicLink()) {
            throw new Error(`TUA task path is not a regular directory: ${task.taskId}`);
        }
        const realTaskRoot = await realpath(taskRoot);
        if (!isWithin(tasksRoot, realTaskRoot)) {
            throw new Error(`TUA task path escapes the selected repository: ${task.taskId}`);
        }
        for (const component of components) {
            if (containsTaskId(component.text, task.taskId)) {
                addAuditFinding(findings, taskId, component.name, "task_id");
            }
        }

        const files = await listRegularTaskFiles(realTaskRoot);
        const verifierPath = task.verifierPath ?? "tests/test.sh";
        const verifierAbsolute = path.resolve(realTaskRoot, verifierPath);
        if (!isWithin(realTaskRoot, verifierAbsolute)) {
            throw new Error(`TUA task ${task.taskId} has an unsafe verifier path`);
        }
        const verifierRelative = path.relative(realTaskRoot, verifierAbsolute).split(path.sep).join("/");
        for (const file of files) {
            const isVerifier = file.relative === verifierRelative;
            const isAnswerSource = ANSWER_PATH.test(file.relative);
            if (PRIVATE_PATH.test(file.relative)) {
                for (const name of [file.relative, path.posix.basename(file.relative)]) {
                    for (const component of components) {
                        if (containsLiteral(component.text, name)) {
                            addAuditFinding(findings, taskId, component.name, "private_filename");
                        }
                    }
                }
            }
            if (!isVerifier && !isAnswerSource) continue;
            const content = await readFile(file.absolute, "utf8");
            const markers = isAnswerSource
                ? answerMarkers(content)
                : verifierMarkers(content);
            const matchKind = isAnswerSource ? "expected_answer" : "verifier_content";
            for (const marker of markers) {
                for (const component of components) {
                    if (containsLiteral(component.text, marker)) {
                        addAuditFinding(findings, taskId, component.name, matchKind);
                    }
                }
            }
        }
        if (!files.some((file) => file.relative === verifierRelative)) {
            throw new Error(`TUA task ${taskId} is missing verifier resource ${verifierRelative}`);
        }
    }

    const orderedFindings = [...findings.values()].sort((left, right) =>
        left.taskId.localeCompare(right.taskId)
        || left.component.localeCompare(right.component)
        || left.matchKind.localeCompare(right.matchKind));
    return {
        candidateId: request.candidateId,
        auditedTaskIds: taskIds,
        findings: orderedFindings,
        positiveConclusionBlocked: orderedFindings.length > 0,
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

function normalizeCandidateInstructions(instructions: readonly string[]): readonly string[] {
    if (!Array.isArray(instructions) || instructions.length === 0) {
        throw new Error("TUA candidate audit instructions must be a non-empty string list");
    }
    return instructions.map((instruction, index) => {
        if (typeof instruction !== "string" || instruction.trim() === "") {
            throw new Error(`TUA candidate audit instruction ${index} must be non-empty`);
        }
        return instruction;
    });
}

async function listRegularTaskFiles(taskRoot: string): Promise<readonly { readonly relative: string; readonly absolute: string }[]> {
    const files: { relative: string; absolute: string }[] = [];
    const visit = async (directory: string): Promise<void> => {
        const entries = await readdir(directory, { withFileTypes: true });
        entries.sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            const absolute = path.join(directory, entry.name);
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) await visit(absolute);
            else if (entry.isFile()) {
                files.push({
                    absolute,
                    relative: path.relative(taskRoot, absolute).split(path.sep).join("/"),
                });
            }
        }
    };
    await visit(taskRoot);
    return files;
}

function answerMarkers(content: string): readonly string[] {
    const values = new Set<string>();
    const add = (value: unknown): void => {
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            const text = String(value).trim();
            if (text.length >= 2) values.add(text);
        } else if (Array.isArray(value)) {
            value.forEach(add);
        } else if (value !== null && typeof value === "object") {
            Object.values(value as Record<string, unknown>).forEach(add);
        }
    };
    try {
        add(JSON.parse(content) as unknown);
    } catch {
        for (const line of content.split(/\r?\n/u)) {
            const text = line.trim();
            if (text.length >= 2) values.add(text);
        }
    }
    return [...values];
}

function verifierMarkers(content: string): readonly string[] {
    return [...new Set(content.split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => normalizeForMatch(line).length >= 24))];
}

function containsTaskId(candidate: string, taskId: string): boolean {
    const escaped = taskId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?:$|[^\\p{L}\\p{N}_])`, "iu").test(candidate);
}

function containsLiteral(candidate: string, marker: string): boolean {
    const normalizedCandidate = normalizeForMatch(candidate);
    const normalizedMarker = normalizeForMatch(marker);
    if (!normalizedMarker) return false;
    if (/^[\p{L}\p{N}_-]+$/u.test(normalizedMarker)) {
        const escaped = normalizedMarker.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
        return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?:$|[^\\p{L}\\p{N}_])`, "iu")
            .test(normalizedCandidate);
    }
    return normalizedCandidate.includes(normalizedMarker);
}

function normalizeForMatch(value: string): string {
    return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/gu, " ").trim();
}

function addAuditFinding(
    findings: Map<string, TuaGepaCandidateAuditFinding>,
    taskId: string,
    component: string,
    matchKind: TuaGepaCandidateAuditFinding["matchKind"],
): void {
    const key = `${taskId}\0${component}\0${matchKind}`;
    findings.set(key, { taskId, component, matchKind });
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
