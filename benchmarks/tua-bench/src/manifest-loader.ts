import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import type { TuaBenchManifest, TuaBenchTaskDefinition } from "./types.js";

/**
 * 单个任务解析结果包装。
 */
export interface ParseTaskResult {
    /** 解析出的任务定义；解析失败或关键信息缺失时为 null。 */
    readonly task: TuaBenchTaskDefinition | null;
    /** 警告信息；正常解析无警告时为 undefined。 */
    readonly warning?: string;
}

/**
 * 解析单个 TUA-Bench 任务目录。
 *
 * @param taskDir - 单个任务的绝对或相对目录路径。
 * @returns 包含任务定义与可选警告的结果对象。
 *
 * @example
 * ```ts
 * const { task, warning } = await parseTuaBenchTask("/path/to/tasks/sample");
 * ```
 */
export async function parseTuaBenchTask(taskDir: string): Promise<ParseTaskResult> {
    const dirName = path.basename(taskDir);
    const tomlPath = path.join(taskDir, "task.toml");
    const instructionPath = path.join(taskDir, "instruction.md");

    let tomlContent: string;
    try {
        tomlContent = await readFile(tomlPath, "utf8");
    } catch {
        return {
            task: null,
            warning: `跳过任务目录 ${dirName}：缺少 task.toml 文件`,
        };
    }

    let instructionContent: string;
    try {
        instructionContent = await readFile(instructionPath, "utf8");
    } catch {
        return {
            task: null,
            warning: `跳过任务目录 ${dirName}：缺少 instruction.md 文件`,
        };
    }

    const instruction = instructionContent.trim();
    if (instruction.length === 0) {
        return {
            task: null,
            warning: `跳过任务目录 ${dirName}：instruction.md 内容为空`,
        };
    }

    let rawToml: Record<string, unknown>;
    try {
        const parsed = parseToml(tomlContent);
        if (parsed === null || typeof parsed !== "object") {
            return {
                task: null,
                warning: `跳过任务目录 ${dirName}：task.toml 解析结果非有效对象`,
            };
        }
        rawToml = parsed as Record<string, unknown>;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            task: null,
            warning: `跳过任务目录 ${dirName}：task.toml 解析失败（${message}）`,
        };
    }

    const name = typeof rawToml.name === "string" && rawToml.name.trim().length > 0
        ? rawToml.name.trim()
        : dirName;

    const taskId = typeof rawToml.task_id === "string" && rawToml.task_id.trim().length > 0
        ? rawToml.task_id.trim()
        : (typeof rawToml.taskId === "string" && rawToml.taskId.trim().length > 0 ? rawToml.taskId.trim() : dirName);

    // metadata.category 为任务族必要字段
    const metadata = (rawToml.metadata !== null && typeof rawToml.metadata === "object")
        ? (rawToml.metadata as Record<string, unknown>)
        : undefined;
    const taskFamilyRaw = metadata?.category ?? rawToml.task_family ?? rawToml.category;
    if (typeof taskFamilyRaw !== "string" || taskFamilyRaw.trim().length === 0) {
        return {
            task: null,
            warning: `跳过任务目录 ${dirName}：缺少必要字段 metadata.category`,
        };
    }
    const taskFamily = taskFamilyRaw.trim();

    // environment 配置
    const environment = (rawToml.environment !== null && typeof rawToml.environment === "object")
        ? (rawToml.environment as Record<string, unknown>)
        : undefined;

    const imageRef = typeof environment?.docker_image === "string" && environment.docker_image.trim().length > 0
        ? environment.docker_image.trim()
        : `tua-bench/${name}:latest`;

    const networkMode: "none" | "public" = environment?.network_mode === "public"
        ? "public"
        : "none";

    // agent 配置
    const agent = (rawToml.agent !== null && typeof rawToml.agent === "object")
        ? (rawToml.agent as Record<string, unknown>)
        : undefined;
    const agentTimeoutSec = typeof agent?.timeout_sec === "number" && agent.timeout_sec > 0
        ? agent.timeout_sec
        : 600;

    // verifier 配置
    const verifier = (rawToml.verifier !== null && typeof rawToml.verifier === "object")
        ? (rawToml.verifier as Record<string, unknown>)
        : undefined;
    const verifierTimeoutSec = typeof verifier?.timeout_sec === "number" && verifier.timeout_sec > 0
        ? verifier.timeout_sec
        : 600;
    const verifierUser = typeof verifier?.user === "string" && verifier.user.trim().length > 0
        ? verifier.user.trim()
        : "root";

    const setupScript = typeof environment?.setup_script === "string" && environment.setup_script.trim().length > 0
        ? environment.setup_script.trim()
        : "environment/setup.sh";

    const verifierPath = typeof verifier?.script === "string" && verifier.script.trim().length > 0
        ? verifier.script.trim()
        : "tests/test.sh";

    const task: TuaBenchTaskDefinition = {
        taskId,
        name,
        instruction,
        taskFamily,
        imageRef,
        networkMode,
        agentTimeoutSec,
        verifierTimeoutSec,
        verifierUser,
        taskDir: path.resolve(taskDir),
        setupScript,
        verifierPath,
    };

    return { task };
}

/**
 * 从本地 TUA-Bench 仓库加载任务定义并构建 Manifest。
 *
 * @param repoRoot - TUA-Bench 仓库根目录。
 * @returns 包含所有已解析任务与分组信息的 TuaBenchManifest。
 * @throws 仓库目录不存在或 tasks 子目录不可读时抛出异常。
 *
 * @example
 * ```ts
 * const manifest = await loadTuaBenchManifest("/path/to/tua-bench");
 * console.log(`Loaded ${manifest.tasks.length} tasks`);
 * ```
 */
export async function loadTuaBenchManifest(repoRoot: string): Promise<TuaBenchManifest> {
    const resolvedRoot = path.resolve(repoRoot);
    const tasksDir = path.join(resolvedRoot, "tasks");

    const tasksStat = await stat(tasksDir).catch(() => null);
    if (tasksStat === null || !tasksStat.isDirectory()) {
        throw new Error(`TUA-Bench 任务目录不存在：${tasksDir}`);
    }

    const entries = await readdir(tasksDir, { withFileTypes: true });
    const subDirs = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

    const tasks: TuaBenchTaskDefinition[] = [];
    const warnings: string[] = [];

    for (const dir of subDirs) {
        const fullTaskDir = path.join(tasksDir, dir);
        const { task, warning } = await parseTuaBenchTask(fullTaskDir);
        if (warning !== undefined) {
            warnings.push(warning);
        }
        if (task !== null) {
            tasks.push(task);
        }
    }

    const byFamily: Record<string, TuaBenchTaskDefinition[]> = {};
    for (const task of tasks) {
        const list = byFamily[task.taskFamily] ?? [];
        list.push(task);
        byFamily[task.taskFamily] = list;
    }

    return {
        tasks,
        repoRoot: resolvedRoot,
        loadedAt: new Date().toISOString(),
        byFamily,
        ...(warnings.length > 0 ? { warnings } : {}),
    };
}

