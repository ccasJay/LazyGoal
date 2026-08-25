import { readFile } from "node:fs/promises";
import {
    isAbsolute,
    join,
    relative,
    resolve,
} from "node:path";

export const ALFWORLD_MANIFEST_VERSION = 1 as const;
export const MAX_ALFWORLD_TASK_STEPS = 100;
export const FIXED_MANIFEST_NAMES = ["smoke", "regression"] as const;
export type FixedManifestName = (typeof FIXED_MANIFEST_NAMES)[number];
export type AlfworldSplit =
    | "train"
    | "valid_seen"
    | "valid_unseen"
    | "test_seen"
    | "test_unseen";

/**
 * 固定 ALFWorld 任务清单中的一个任务。
 *
 * @remarks
 * `gameFile` 始终是相对于 `ALFWORLD_DATA` 的路径，`order` 从零开始并必须
 * 与清单数组下标一致；这样清单本身就是任务顺序的唯一来源。
 *
 * @example
 * ```ts
 * const task: AlfworldManifestTask = {
 *   order: 0,
 *   taskId: "valid-seen-0001",
 *   split: "valid_seen",
 *   gameFile: "json_2.1.1/valid_seen/0001/game.tw-pddl",
 *   seed: 7,
 *   maxSteps: 100,
 * };
 * ```
 */
export interface AlfworldManifestTask {
    readonly order: number;
    readonly taskId: string;
    readonly split: AlfworldSplit;
    readonly gameFile: string;
    readonly seed: number;
    readonly maxSteps: number;
}

/**
 * 可复现的 ALFWorld 任务清单。
 *
 * @remarks
 * 清单不包含机器绝对路径，也不支持隐式抽样。运行器必须按 `tasks` 的顺序
 * 消费所有条目；真实文件存在性由显式环境预检确认。
 *
 * @example
 * ```ts
 * const manifest: AlfworldManifest = {
 *   version: 1,
 *   name: "smoke",
 *   tasks: [task],
 * };
 * ```
 */
export interface AlfworldManifest {
    readonly version: typeof ALFWORLD_MANIFEST_VERSION;
    readonly name: string;
    readonly tasks: readonly AlfworldManifestTask[];
}

export type ManifestValidationErrorCode =
    | "INVALID_FORMAT"
    | "INVALID_VERSION"
    | "INVALID_NAME"
    | "EMPTY_TASKS"
    | "DUPLICATE_TASK_ID"
    | "INVALID_TASK_ID"
    | "INVALID_SPLIT"
    | "INVALID_GAME_FILE"
    | "PATH_ESCAPES_DATA_ROOT"
    | "INVALID_ORDER"
    | "INVALID_SEED"
    | "INVALID_STEP_LIMIT";

/**
 * 任务清单不满足可复现或路径安全约束时抛出的错误。
 *
 * @example
 * ```ts
 * try {
 *   validateManifest(input, "/data/alfworld");
 * } catch (error) {
 *   if (error instanceof ManifestValidationError) console.error(error.code);
 * }
 * ```
 */
export class ManifestValidationError extends Error {
    readonly name = "ManifestValidationError";

    constructor(
        readonly code: ManifestValidationErrorCode,
        message: string,
    ) {
        super(message);
    }
}

/**
 * 返回内置 Smoke 或 Regression 清单的固定路径。
 *
 * @remarks
 * 该函数只计算路径，不读取文件、不抽样任务。仓库提供的 Smoke 与 Regression
 * 清单使用固定、可审查的 ALFWorld gamefile；调用方仍必须通过 `loadManifest`
 * 校验其内容。
 *
 * @param benchmarksRoot - `benchmarks` package 的绝对根目录。
 * @param name - 固定清单名称。
 * @returns 固定清单文件的绝对路径。
 * @throws 根目录不是绝对路径时抛出 `ManifestValidationError`。
 * @example
 * ```ts
 * const path = fixedManifestPath("/repo/benchmarks", "smoke");
 * ```
 */
export function fixedManifestPath(
    benchmarksRoot: string,
    name: FixedManifestName,
): string {
    if (!isAbsolute(benchmarksRoot)) {
        throw new ManifestValidationError(
            "INVALID_FORMAT",
            `benchmarksRoot must be absolute: ${benchmarksRoot}`,
        );
    }
    return join(benchmarksRoot, "alfworld", "manifests", `${name}.json`);
}

/**
 * 校验并规范化一个固定任务清单。
 *
 * @param value - 从 JSON 解析得到的未知输入。
 * @param dataRoot - `ALFWORLD_DATA` 的绝对路径，用于验证 gamefile 边界。
 * @returns 可安全交给评测运行器的清单；任务顺序保持不变。
 * @throws 输入格式、任务 ID、顺序、seed、步数或路径不合法时抛出验证错误。
 * @example
 * ```ts
 * const manifest = validateManifest(jsonValue, "/data/alfworld");
 * for (const task of manifest.tasks) console.log(task.order, task.taskId);
 * ```
 */
export function validateManifest(
    value: unknown,
    dataRoot: string,
): AlfworldManifest {
    if (!isAbsolute(dataRoot)) {
        throw new ManifestValidationError(
            "INVALID_FORMAT",
            `dataRoot must be absolute: ${dataRoot}`,
        );
    }

    if (!isRecord(value)) {
        throw new ManifestValidationError(
            "INVALID_FORMAT",
            "ALFWorld manifest must be a JSON object",
        );
    }
    if (value.version !== ALFWORLD_MANIFEST_VERSION) {
        throw new ManifestValidationError(
            "INVALID_VERSION",
            `Unsupported ALFWorld manifest version: ${String(value.version)}`,
        );
    }
    if (typeof value.name !== "string" || value.name.trim().length === 0) {
        throw new ManifestValidationError(
            "INVALID_NAME",
            "ALFWorld manifest name must be a non-empty string",
        );
    }
    if (!Array.isArray(value.tasks) || value.tasks.length === 0) {
        throw new ManifestValidationError(
            "EMPTY_TASKS",
            "ALFWorld manifest must contain at least one fixed task",
        );
    }

    const taskIds = new Set<string>();
    const tasks = value.tasks.map((task, index) => {
        const parsed = parseTask(task, index, dataRoot);
        if (taskIds.has(parsed.taskId)) {
            throw new ManifestValidationError(
                "DUPLICATE_TASK_ID",
                `Duplicate ALFWorld taskId: ${parsed.taskId}`,
            );
        }
        taskIds.add(parsed.taskId);
        return parsed;
    });

    return {
        version: ALFWORLD_MANIFEST_VERSION,
        name: value.name,
        tasks,
    };
}

/**
 * 从 JSON 文件读取并校验固定任务清单。
 *
 * @param manifestPath - 清单 JSON 的绝对路径。
 * @param dataRoot - `ALFWORLD_DATA` 的绝对路径。
 * @returns 已校验的固定清单。
 * @throws 文件路径不是绝对路径、文件无法读取或内容不合法时抛出异常。
 * @example
 * ```ts
 * const manifest = await loadManifest("/repo/benchmarks/alfworld/manifests/smoke.json", dataRoot);
 * ```
 */
export async function loadManifest(
    manifestPath: string,
    dataRoot: string,
): Promise<AlfworldManifest> {
    if (!isAbsolute(manifestPath)) {
        throw new ManifestValidationError(
            "INVALID_FORMAT",
            `manifestPath must be absolute: ${manifestPath}`,
        );
    }
    const content = await readFile(manifestPath, "utf8");
    let value: unknown;
    try {
        value = JSON.parse(content);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "invalid JSON";
        throw new ManifestValidationError(
            "INVALID_FORMAT",
            `Unable to parse ALFWorld manifest ${manifestPath}: ${message}`,
        );
    }
    return validateManifest(value, dataRoot);
}

function parseTask(
    value: unknown,
    index: number,
    dataRoot: string,
): AlfworldManifestTask {
    if (!isRecord(value)) {
        throw new ManifestValidationError(
            "INVALID_FORMAT",
            `ALFWorld manifest task ${index} must be an object`,
        );
    }

    if (value.order !== index) {
        throw new ManifestValidationError(
            "INVALID_ORDER",
            `ALFWorld task order must equal its array index (${index})`,
        );
    }
    if (!Number.isInteger(value.order)) {
        throw new ManifestValidationError(
            "INVALID_ORDER",
            `ALFWorld task ${index} order must be an integer`,
        );
    }

    if (typeof value.taskId !== "string" || !/^[-a-zA-Z0-9_.]+$/.test(value.taskId)) {
        throw new ManifestValidationError(
            "INVALID_TASK_ID",
            `ALFWorld task ${index} taskId must contain only letters, digits, '-', '_' or '.'`,
        );
    }

    if (!isSplit(value.split)) {
        throw new ManifestValidationError(
            "INVALID_SPLIT",
            `ALFWorld task ${index} has unsupported split: ${String(value.split)}`,
        );
    }

    if (typeof value.gameFile !== "string" || value.gameFile.trim().length === 0) {
        throw new ManifestValidationError(
            "INVALID_GAME_FILE",
            `ALFWorld task ${index} gameFile must be a non-empty relative path`,
        );
    }
    const gameFile = normalizeGameFile(value.gameFile, dataRoot, index);

    if (!Number.isInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff) {
        throw new ManifestValidationError(
            "INVALID_SEED",
            `ALFWorld task ${index} seed must be an integer from 0 to 4294967295`,
        );
    }

    if (
        !Number.isInteger(value.maxSteps) ||
        value.maxSteps < 1 ||
        value.maxSteps > MAX_ALFWORLD_TASK_STEPS
    ) {
        throw new ManifestValidationError(
            "INVALID_STEP_LIMIT",
            `ALFWorld task ${index} maxSteps must be between 1 and ${MAX_ALFWORLD_TASK_STEPS}`,
        );
    }

    return {
        order: value.order,
        taskId: value.taskId,
        split: value.split,
        gameFile,
        seed: value.seed,
        maxSteps: value.maxSteps,
    };
}

function normalizeGameFile(
    gameFile: string,
    dataRoot: string,
    index: number,
): string {
    const normalized = gameFile.trim().replaceAll("\\", "/");
    if (
        normalized.length === 0 ||
        normalized.startsWith("/") ||
        /^[a-zA-Z]:\//.test(normalized) ||
        isAbsolute(gameFile)
    ) {
        throw new ManifestValidationError(
            "INVALID_GAME_FILE",
            `ALFWorld task ${index} gameFile must be relative: ${gameFile}`,
        );
    }

    const root = resolve(dataRoot);
    const candidate = resolve(root, normalized);
    const relativePath = relative(root, candidate);
    if (
        relativePath.length === 0 ||
        relativePath === ".." ||
        relativePath.startsWith(`..${"/"}`) ||
        isAbsolute(relativePath)
    ) {
        throw new ManifestValidationError(
            "PATH_ESCAPES_DATA_ROOT",
            `ALFWorld task ${index} gameFile escapes ALFWORLD_DATA: ${gameFile}`,
        );
    }
    return normalized;
}

function isSplit(value: unknown): value is AlfworldSplit {
    return (
        value === "train" ||
        value === "valid_seen" ||
        value === "valid_unseen" ||
        value === "test_seen" ||
        value === "test_unseen"
    );
}

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
