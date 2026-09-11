/** GAIA 数据集的评测子集划分。 */
export type GaiaSplit = "validation" | "test";

/** GAIA 数据集的任务难度级别（1 为最简，3 为最复杂）。 */
export type GaiaLevel = 1 | 2 | 3;

/**
 * GAIA 清单中的单个任务契约。
 *
 * @remarks
 * validation split 包含预期答案；test split 遵循评测契约 expectedAnswer 始终为 null。
 * attachments 包含相对于 dataRoot 的相对文件路径。
 *
 * @example
 * ```ts
 * const task: GaiaManifestTask = {
 *   taskId: "0-0-0-1",
 *   question: "What is the capital of France?",
 *   expectedAnswer: "Paris",
 *   level: 1,
 *   split: "validation",
 *   attachments: ["attachments/0-0-0-1/map.png"],
 * };
 * ```
 */
export interface GaiaManifestTask {
    /** 任务的全局唯一标识符。 */
    readonly taskId: string;
    /** 任务的自然语言问题。 */
    readonly question: string;
    /** 任务的标准答案；在 test split 中为 null。 */
    readonly expectedAnswer: string | null;
    /** 任务的难度等级（1、2 或 3）。 */
    readonly level: GaiaLevel;
    /** 所属的评测数据集划分。 */
    readonly split: GaiaSplit;
    /** 该任务关联的附件相对路径列表（相对于 dataRoot）。 */
    readonly attachments: readonly string[];
}

/**
 * GAIA Benchmark 评测任务清单契约。
 *
 * @remarks
 * 清单为自包含的评测规格，保存从 HuggingFace 加载或本地构建的固定任务集合。
 *
 * @example
 * ```ts
 * const manifest: GaiaManifest = {
 *   source: "huggingface",
 *   loadedAt: "2026-09-10T12:00:00.000Z",
 *   dataRoot: "/data/gaia",
 *   tasks: [],
 * };
 * ```
 */
export interface GaiaManifest {
    /** 数据来源标识，固定为 "huggingface"。 */
    readonly source: "huggingface";
    /** 清单构建的 ISO 8601 时间戳。 */
    readonly loadedAt: string;
    /** 数据集与附件存储的根目录绝对路径。 */
    readonly dataRoot: string;
    /** 任务列表。 */
    readonly tasks: readonly GaiaManifestTask[];
}

/**
 * GAIA 原始 JSONL 记录结构。
 */
export interface GaiaRawMetadataRecord {
    readonly task_id: string;
    readonly Question: string;
    readonly Level: number;
    readonly "Final answer"?: string | null;
    readonly file_name?: string | null;
    readonly file_path?: string | null;
    readonly [key: string]: unknown;
}

/**
 * GAIA 评测单次 Attempt 的领域结果契约。
 *
 * @remarks
 * `correct` 字段在独立评分阶段计算；test split 或评分前保持为 null。
 *
 * @example
 * ```ts
 * const result: GaiaDomainResult = {
 *   submittedAnswer: "paris",
 *   correct: true,
 *   normalizedAnswer: "paris",
 *   normalizedExpected: "paris",
 *   level: 1,
 * };
 * ```
 */
export interface GaiaDomainResult {
    /** Agent 最终提交的原始答案字符串；未作答时为 null。 */
    readonly submittedAnswer: string | null;
    /** 是否命中预期答案；评分前或 test split 下为 null。 */
    readonly correct: boolean | null;
    /** 经归一化处理后的提交答案；未作答时为 null。 */
    readonly normalizedAnswer: string | null;
    /** 经归一化处理后的预期标准答案；无预期答案时为 null。 */
    readonly normalizedExpected: string | null;
    /** 任务所属难度级别。 */
    readonly level: GaiaLevel;
}

