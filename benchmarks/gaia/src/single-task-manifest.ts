import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
    GaiaManifestValidationError,
    loadGaiaManifest,
    saveGaiaManifest,
} from "./manifest";
import type { GaiaManifest, GaiaManifestTask } from "./types";

/** GAIA GEPA validation 单任务 Manifest 物化选项。 */
export interface GaiaSingleTaskMaterializerOptions {
    /** 包含源任务集合的 Manifest JSON 文件路径。 */
    readonly sourceManifestPath: string;
    /** 调用方明确选择的 GAIA taskId。 */
    readonly taskId: string;
    /** 要写入的单任务 Manifest JSON 文件路径。 */
    readonly outputPath: string;
}

function assertGepaValidationTask(task: GaiaManifestTask): void {
    if (task.split !== "validation") {
        throw new GaiaManifestValidationError(
            "UNSUPPORTED_SINGLE_TASK",
            `GAIA single-task materialization requires validation split: ${task.taskId}`,
        );
    }
    if (task.level !== 1 && task.level !== 2) {
        throw new GaiaManifestValidationError(
            "UNSUPPORTED_SINGLE_TASK",
            `GAIA GEPA materialization requires validation level 1 or level 2: ${task.taskId}`,
        );
    }
    if (task.expectedAnswer === null || task.expectedAnswer.trim().length === 0) {
        throw new GaiaManifestValidationError(
            "INVALID_TASK",
            `GAIA validation task requires a non-empty expectedAnswer: ${task.taskId}`,
        );
    }
}

async function assertDataRoot(dataRoot: string): Promise<void> {
    if (!isAbsolute(dataRoot)) {
        throw new GaiaManifestValidationError(
            "INVALID_DATA_ROOT",
            `GAIA dataRoot must be absolute: ${dataRoot}`,
        );
    }
    try {
        const info = await stat(dataRoot);
        if (!info.isDirectory()) {
            throw new GaiaManifestValidationError(
                "INVALID_DATA_ROOT",
                `GAIA dataRoot must be a directory: ${dataRoot}`,
            );
        }
    } catch (error) {
        if (error instanceof GaiaManifestValidationError) throw error;
        throw new GaiaManifestValidationError(
            "DATA_ROOT_NOT_FOUND",
            `GAIA dataRoot does not exist or is not readable: ${dataRoot}`,
        );
    }
}

async function assertTaskAttachments(
    dataRoot: string,
    task: GaiaManifestTask,
): Promise<void> {
    let realDataRoot: string;
    try {
        realDataRoot = await realpath(dataRoot);
    } catch {
        throw new GaiaManifestValidationError(
            "DATA_ROOT_NOT_FOUND",
            `GAIA dataRoot does not exist or is not readable: ${dataRoot}`,
        );
    }
    for (const attachment of task.attachments) {
        try {
            const attachmentPath = await realpath(resolve(dataRoot, attachment));
            const relativePath = relative(realDataRoot, attachmentPath);
            if (
                relativePath === ".."
                || relativePath.startsWith(`..${sep}`)
                || isAbsolute(relativePath)
            ) {
                throw new GaiaManifestValidationError(
                    "ATTACHMENT_NOT_FOUND",
                    `GAIA task attachment must stay inside dataRoot: ${attachment}`,
                );
            }
            const info = await stat(attachmentPath);
            if (!info.isFile()) {
                throw new GaiaManifestValidationError(
                    "ATTACHMENT_NOT_FOUND",
                    `GAIA task attachment must be a file: ${attachment}`,
                );
            }
        } catch (error) {
            if (error instanceof GaiaManifestValidationError) throw error;
            throw new GaiaManifestValidationError(
                "ATTACHMENT_NOT_FOUND",
                `GAIA task attachment does not exist or is not readable: ${attachment}`,
            );
        }
    }
}

/**
 * 将用户明确选择的 GAIA validation Level 1/2 任务物化为单任务 Manifest。
 *
 * @remarks
 * 此入口服务于 GEPA 真实闸门，不改变源 Manifest；它拒绝 test split、Level 3
 * 和缺少标准答案的任务，从而保证一个 GEPA sample 只对应一个可评分的 GAIA task。
 * 附件路径由源 Manifest 的校验保证为相对路径，运行时由 GAIA Environment 注入沙箱。
 *
 * @param options - 源 Manifest、taskId 和输出文件路径。
 * @returns 已写入并通过校验的单任务 Manifest。
 * @throws 源文件、任务边界、数据根目录或输出路径无效时抛出
 * `GaiaManifestValidationError`。
 *
 * @example
 * ```ts
 * const manifest = await materializeGaiaSingleTask({
 *   sourceManifestPath: "/data/gaia/manifest-validation.json",
 *   taskId: "0-0-0-1",
 *   outputPath: "/tmp/gepa/task-0-0-0-1.json",
 * });
 * ```
 */
export async function materializeGaiaSingleTask(
    options: GaiaSingleTaskMaterializerOptions,
): Promise<GaiaManifest> {
    const taskId = options.taskId.trim();
    if (taskId.length === 0) {
        throw new GaiaManifestValidationError(
            "TASK_NOT_FOUND",
            "GAIA single-task materialization requires an explicit taskId",
        );
    }

    const source = await loadGaiaManifest(options.sourceManifestPath);
    await assertDataRoot(source.dataRoot);
    const matches = source.tasks.filter((task) => task.taskId === taskId);
    if (matches.length === 0) {
        throw new GaiaManifestValidationError(
            "TASK_NOT_FOUND",
            `GAIA task was not found in source Manifest: ${taskId}`,
        );
    }
    if (matches.length !== 1) {
        throw new GaiaManifestValidationError(
            "SINGLE_TASK_REQUIRED",
            `GAIA task selection must resolve to exactly one task: ${taskId}`,
        );
    }

    const task = matches[0]!;
    assertGepaValidationTask(task);
    await assertTaskAttachments(source.dataRoot, task);
    const outputPath = resolve(options.outputPath);
    if (outputPath === resolve(options.sourceManifestPath)) {
        throw new GaiaManifestValidationError(
            "OUTPUT_PATH_INVALID",
            "GAIA single-task output must not overwrite the source Manifest",
        );
    }

    const materialized: GaiaManifest = {
        source: source.source,
        loadedAt: source.loadedAt,
        dataRoot: source.dataRoot,
        tasks: Object.freeze([task]),
    };
    await saveGaiaManifest(outputPath, materialized);
    return materialized;
}
