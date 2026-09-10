import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
    GaiaLevel,
    GaiaManifest,
    GaiaManifestTask,
    GaiaRawMetadataRecord,
    GaiaSplit,
} from "./types";
import { saveGaiaManifest, validateGaiaManifest } from "./manifest";

/** HuggingFace GAIA 默认仓库名。 */
export const GAIA_DEFAULT_HF_REPO = "gaia-benchmark/GAIA";

/** GAIA 数据集加载器配置项。 */
export interface GaiaDatasetLoaderOptions {
    /** HuggingFace Access Token（用于 Gated Dataset 访问）。 */
    readonly hfToken?: string;
    /** 自定义 fetch 实现（用于离线测试或网络代理）。 */
    readonly fetchFn?: typeof fetch;
}

/**
 * GAIA 数据集加载器与清单构建器。
 *
 * @remarks
 * 支持从本地 JSONL 解析、从本地目录构建，以及通过 HuggingFace Hub API 下载
 * Gated Dataset 元数据与附件文件并构建 Manifest。
 *
 * @example
 * ```ts
 * const loader = new GaiaDatasetLoader({ hfToken: "hf_..." });
 * const manifest = await loader.loadFromDirectory("/data/gaia", "validation");
 * ```
 */
export class GaiaDatasetLoader {
    private readonly hfToken?: string;
    private readonly fetchFn: typeof fetch;

    constructor(options: GaiaDatasetLoaderOptions = {}) {
        this.hfToken = options.hfToken ?? process.env.HF_TOKEN;
        this.fetchFn = options.fetchFn ?? globalThis.fetch;
    }

    /**
     * 解析 JSONL 格式的元数据文本。
     *
     * @param jsonlContent - JSONL 文本内容。
     * @returns 解析出的原始记录数组。
     */
    parseJsonl(jsonlContent: string): readonly GaiaRawMetadataRecord[] {
        const lines = jsonlContent.split("\n");
        const records: GaiaRawMetadataRecord[] = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length === 0) continue;
            try {
                const parsed = JSON.parse(trimmed);
                records.push(parsed);
            } catch (error) {
                throw new Error(
                    `Failed to parse GAIA JSONL record: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }

        return records;
    }

    /**
     * 根据原始记录构建 GaiaManifest。
     *
     * @param records - 原始记录数组。
     * @param split - 数据集划分。
     * @param dataRoot - 数据集存放根目录绝对路径。
     * @returns 规范化的 GaiaManifest。
     */
    buildManifestFromRecords(
        records: readonly GaiaRawMetadataRecord[],
        split: GaiaSplit,
        dataRoot: string,
    ): GaiaManifest {
        const tasks: GaiaManifestTask[] = [];

        for (const record of records) {
            const taskId = String(record.task_id ?? "").trim();
            if (taskId.length === 0) {
                throw new Error("Missing task_id in GAIA metadata record");
            }

            const question = String(record.Question ?? "").trim();
            if (question.length === 0) {
                throw new Error(`Missing Question in GAIA task ${taskId}`);
            }

            const rawLevel = Number(record.Level);
            if (rawLevel !== 1 && rawLevel !== 2 && rawLevel !== 3) {
                throw new Error(`Invalid Level ${rawLevel} in GAIA task ${taskId}`);
            }
            const level = rawLevel as GaiaLevel;

            let expectedAnswer: string | null = null;
            if (split === "validation") {
                const answer = record["Final answer"];
                expectedAnswer = answer !== undefined && answer !== null ? String(answer).trim() : null;
            } else {
                expectedAnswer = null;
            }

            const attachments: string[] = [];
            const fileName = record.file_name ? String(record.file_name).trim() : "";
            if (fileName.length > 0) {
                attachments.push(`attachments/${taskId}/${fileName}`);
            }

            tasks.push({
                taskId,
                question,
                expectedAnswer,
                level,
                split,
                attachments: Object.freeze(attachments),
            });
        }

        const manifest: GaiaManifest = {
            source: "huggingface",
            loadedAt: new Date().toISOString(),
            dataRoot: resolve(dataRoot),
            tasks: Object.freeze(tasks),
        };

        return validateGaiaManifest(manifest);
    }

    /**
     * 从本地目录中读取 metadata.jsonl 并构建 Manifest。
     *
     * @param dataRoot - 本地数据目录。
     * @param split - 数据集划分。
     * @returns 构建的 Manifest。
     */
    async loadFromDirectory(dataRoot: string, split: GaiaSplit): Promise<GaiaManifest> {
        const metadataPath = join(dataRoot, split, "metadata.jsonl");
        let content: string;
        try {
            content = await readFile(metadataPath, "utf8");
        } catch {
            // 尝试直接在 dataRoot 下寻找
            const altPath = join(dataRoot, "metadata.jsonl");
            content = await readFile(altPath, "utf8");
        }
        const records = this.parseJsonl(content);
        return this.buildManifestFromRecords(records, split, dataRoot);
    }

    /**
     * 从 HuggingFace Hub 下载指定 split 的元数据并落盘。
     *
     * @param split - 划分名。
     * @param targetDir - 目标存放根目录。
     * @returns 构建完成并已写入 manifest.json 的 GaiaManifest。
     */
    async downloadSplit(split: GaiaSplit, targetDir: string): Promise<GaiaManifest> {
        const headers: Record<string, string> = {};
        if (this.hfToken) {
            headers["Authorization"] = `Bearer ${this.hfToken}`;
        }

        const url = `https://huggingface.co/datasets/${GAIA_DEFAULT_HF_REPO}/raw/main/2023/${split}/metadata.jsonl`;
        const response = await this.fetchFn(url, { headers });

        if (!response.ok) {
            throw new Error(
                `Failed to download GAIA ${split} metadata: HTTP ${response.status} ${response.statusText}`,
            );
        }

        const jsonlContent = await response.text();
        const splitDir = join(targetDir, split);
        await mkdir(splitDir, { recursive: true });
        await writeFile(join(splitDir, "metadata.jsonl"), jsonlContent, "utf8");

        const records = this.parseJsonl(jsonlContent);
        const manifest = this.buildManifestFromRecords(records, split, targetDir);

        const manifestPath = join(targetDir, `manifest-${split}.json`);
        await saveGaiaManifest(manifestPath, manifest);

        return manifest;
    }
}
