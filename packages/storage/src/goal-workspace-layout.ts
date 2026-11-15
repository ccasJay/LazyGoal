import { join } from "node:path";
import { encodePathSegment } from "./path-segment";

/**
 * 工作区 Goal/Run 持久化布局的唯一定义。
 *
 * @remarks
 * 所有 Goal 专属内容集中在 `goals/<base64url(goalId)>/` 下：快照、归档标记、Run
 * 执行文件、跨 Run 共享的 Blob 与 Goal 级索引。每个 Store 只通过本模块生成路径，
 * 布局规则因此不会在多个 Store 之间漂移。调用方必须先完成各自的身份校验；
 * 本模块只按传入值编码路径段，不实现领域校验或目录创建。
 *
 * @example
 * ```ts
 * const snapshot = goalSnapshotPath("/workspace/goals", "goal-1");
 * const trace = runTracePath("/workspace/goals", "goal-1", "run-1");
 * ```
 */

/** Goal 快照文件名。 */
const SNAPSHOT_FILE_NAME = "snapshot.json";
/** Run 执行文件目录名。 */
const RUNS_DIRECTORY_NAME = "runs";
/** 跨 Run 共享载荷目录名。 */
const BLOBS_DIRECTORY_NAME = "blobs";
/** Goal 级索引目录名。 */
const INDEXES_DIRECTORY_NAME = "indexes";
/** Goal 归档标记文件名。 */
const ARCHIVE_MARKER_NAME = "archived";
/** Goal 列表派生摘要文件名。 */
const CATALOG_SUMMARY_NAME = "summary.json";
/** Goal 上下文索引文件名。 */
const GOAL_CONTEXT_INDEX_NAME = "goal-index.json";
/** 模型调用指标覆盖标记文件名。 */
const METRICS_COVERAGE_NAME = "metrics-coverage.jsonl";
/** Run 级检索索引目录名。 */
const RETRIEVAL_DIRECTORY_NAME = "retrieval";
/** Trajectory 分段共用的文件主干名。 */
const TRAJECTORY_FILE_STEM = "trajectory";

/**
 * 计算一个 Goal 的根目录。
 *
 * @param goalsRoot - 工作区 Goal 存储根目录。
 * @param goalId - 已校验的 Goal 稳定标识。
 * @returns Goal 目录的绝对路径。
 * @example
 * ```ts
 * goalDirectory("/workspace/goals", "goal-1");
 * ```
 */
export function goalDirectory(goalsRoot: string, goalId: string): string {
    return join(goalsRoot, encodePathSegment(goalId));
}

/**
 * @param goalsRoot - 工作区 Goal 存储根目录。
 * @param goalId - 已校验的 Goal 稳定标识。
 * @returns Goal 最新快照文件路径。
 */
export function goalSnapshotPath(goalsRoot: string, goalId: string): string {
    return join(goalDirectory(goalsRoot, goalId), SNAPSHOT_FILE_NAME);
}

/**
 * @param goalsRoot - 工作区 Goal 存储根目录。
 * @param goalId - 已校验的 Goal 稳定标识。
 * @returns 归档标记文件路径；文件存在表示该 Goal 已归档。
 */
export function goalArchiveMarkerPath(goalsRoot: string, goalId: string): string {
    return join(goalDirectory(goalsRoot, goalId), ARCHIVE_MARKER_NAME);
}

/**
 * @param goalsRoot - 工作区 Goal 存储根目录。
 * @param goalId - 已校验的 Goal 稳定标识。
 * @returns Goal 列表派生摘要文件路径。
 */
export function goalCatalogSummaryPath(goalsRoot: string, goalId: string): string {
    return join(goalIndexesDirectory(goalsRoot, goalId), CATALOG_SUMMARY_NAME);
}

/**
 * @param goalsRoot - 工作区 Goal 存储根目录。
 * @param goalId - 已校验的 Goal 稳定标识。
 * @returns 跨 Run 共享载荷目录。
 */
export function goalBlobsDirectory(goalsRoot: string, goalId: string): string {
    return join(goalDirectory(goalsRoot, goalId), BLOBS_DIRECTORY_NAME);
}

/**
 * @param goalsRoot - 工作区 Goal 存储根目录。
 * @param goalId - 已校验的 Goal 稳定标识。
 * @param sha256 - 裸十六进制内容摘要。
 * @param extension - `json` 表示 Trajectory payload，`txt` 表示模型输入正文。
 * @returns 内容寻址的共享载荷文件路径。
 */
export function goalBlobPath(
    goalsRoot: string,
    goalId: string,
    sha256: string,
    extension: "json" | "txt",
): string {
    return join(goalBlobsDirectory(goalsRoot, goalId), `${sha256}.${extension}`);
}

/**
 * @param goalsRoot - 工作区 Goal 存储根目录。
 * @param goalId - 已校验的 Goal 稳定标识。
 * @returns Goal 级索引目录。
 */
export function goalIndexesDirectory(goalsRoot: string, goalId: string): string {
    return join(goalDirectory(goalsRoot, goalId), INDEXES_DIRECTORY_NAME);
}

/**
 * @param goalsRoot - 工作区 Goal 存储根目录。
 * @param goalId - 已校验的 Goal 稳定标识。
 * @returns Goal 上下文派生索引文件路径。
 */
export function goalContextIndexPath(goalsRoot: string, goalId: string): string {
    return join(goalIndexesDirectory(goalsRoot, goalId), GOAL_CONTEXT_INDEX_NAME);
}

/**
 * @param goalsRoot - 工作区 Goal 存储根目录。
 * @param goalId - 已校验的 Goal 稳定标识。
 * @returns 模型调用指标覆盖标记文件路径。
 */
export function goalMetricsCoveragePath(goalsRoot: string, goalId: string): string {
    return join(goalIndexesDirectory(goalsRoot, goalId), METRICS_COVERAGE_NAME);
}

/**
 * @param goalsRoot - 工作区 Goal 存储根目录。
 * @param goalId - 已校验的 Goal 稳定标识。
 * @param runId - 已校验的 Run 稳定标识。
 * @returns Run 级检索索引文件路径。
 */
export function retrievalIndexPath(
    goalsRoot: string,
    goalId: string,
    runId: string,
): string {
    return join(
        goalIndexesDirectory(goalsRoot, goalId),
        RETRIEVAL_DIRECTORY_NAME,
        `${encodePathSegment(runId)}.json`,
    );
}

/**
 * @param goalsRoot - 工作区 Goal 存储根目录。
 * @param goalId - 已校验的 Goal 稳定标识。
 * @param runId - 已校验的 Run 稳定标识。
 * @returns 一个 Run 的执行文件目录。
 */
export function runDirectory(goalsRoot: string, goalId: string, runId: string): string {
    return join(
        goalDirectory(goalsRoot, goalId),
        RUNS_DIRECTORY_NAME,
        encodePathSegment(runId),
    );
}

/**
 * @param goalsRoot - 工作区 Goal 存储根目录。
 * @param goalId - 已校验的 Goal 稳定标识。
 * @param runId - 已校验的 Run 稳定标识。
 * @returns Trajectory 分段共用的文件主干路径，不含扩展名。
 */
export function runTrajectoryBasePath(
    goalsRoot: string,
    goalId: string,
    runId: string,
): string {
    return join(runDirectory(goalsRoot, goalId, runId), TRAJECTORY_FILE_STEM);
}

/**
 * @param goalsRoot - 工作区 Goal 存储根目录。
 * @param goalId - 已校验的 Goal 稳定标识。
 * @param runId - 已校验的 Run 稳定标识。
 * @param segment - 从 0 开始的分段序号。
 * @returns 该分段的 JSONL 文件路径；0 号分段不带序号后缀。
 */
export function runTrajectorySegmentPath(
    goalsRoot: string,
    goalId: string,
    runId: string,
    segment: number,
): string {
    const base = runTrajectoryBasePath(goalsRoot, goalId, runId);
    return segment === 0 ? `${base}.jsonl` : `${base}.part${segment + 1}.jsonl`;
}

/**
 * @param goalsRoot - 工作区 Goal 存储根目录。
 * @param goalId - 已校验的 Goal 稳定标识。
 * @param runId - 已校验的 Run 稳定标识。
 * @returns 该 Run 的可重建 Trajectory 索引文件路径。
 */
export function runTrajectoryIndexPath(
    goalsRoot: string,
    goalId: string,
    runId: string,
): string {
    return `${runTrajectoryBasePath(goalsRoot, goalId, runId)}.index.db`;
}

/**
 * @param goalsRoot - 工作区 Goal 存储根目录。
 * @param goalId - 已校验的 Goal 稳定标识。
 * @param runId - 已校验的 Run 稳定标识。
 * @returns 该 Run 的模型输入清单文件路径。
 */
export function runModelInputsPath(
    goalsRoot: string,
    goalId: string,
    runId: string,
): string {
    return join(runDirectory(goalsRoot, goalId, runId), "model-inputs.jsonl");
}

/**
 * @param goalsRoot - 工作区 Goal 存储根目录。
 * @param goalId - 已校验的 Goal 稳定标识。
 * @param runId - 已校验的 Run 稳定标识。
 * @returns 该 Run 的模型调用指标文件路径。
 */
export function runMetricsPath(
    goalsRoot: string,
    goalId: string,
    runId: string,
): string {
    return join(runDirectory(goalsRoot, goalId, runId), "metrics.jsonl");
}

/**
 * @param goalsRoot - 工作区 Goal 存储根目录。
 * @param goalId - 已校验的 Goal 稳定标识。
 * @param runId - 已校验的 Run 稳定标识。
 * @returns 该 Run 的诊断 Trace 文件路径。
 */
export function runTracePath(
    goalsRoot: string,
    goalId: string,
    runId: string,
): string {
    return join(runDirectory(goalsRoot, goalId, runId), "trace.jsonl");
}
