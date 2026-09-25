import {
    appendFile,
    mkdir,
    readFile,
} from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import type {
    MetricsStore,
    ModelCallMetricReadQuery,
    ModelCallMetricRecord,
} from "../../runtime/src/index";

const IdentifierSchema = z.string().min(1);
const MetricIdentitySchema = {
    goalId: IdentifierSchema,
    runId: IdentifierSchema,
    executionUnitId: IdentifierSchema.optional(),
    callId: IdentifierSchema,
    occurredAt: z.string().datetime({ offset: true }),
};

const ModelCallMetricRecordSchema = z.discriminatedUnion("recordType", [
    z.object({
        ...MetricIdentitySchema,
        recordType: z.literal("call_started"),
    }).strict(),
    z.object({
        ...MetricIdentitySchema,
        recordType: z.literal("call_finished"),
        outcome: z.enum(["completed", "failed", "cancelled"]),
        usage: z.discriminatedUnion("source", [
            z.object({
                source: z.literal("provider_reported"),
                inputTokens: z.number().int().nonnegative().safe(),
                outputTokens: z.number().int().nonnegative().safe(),
                cachedInputTokens: z.number().int().nonnegative().safe().optional(),
            }).strict(),
            z.object({ source: z.literal("unavailable") }).strict(),
        ]),
        decodeDurationMs: z.number().positive().finite().optional(),
    }).strict(),
]);

/** JSONL 记录违反当前调用指标协议时的错误代码。 */
export const MODEL_CALL_METRIC_STORE_PROTOCOL_ERROR_CODE =
    "MODEL_CALL_METRIC_STORE_PROTOCOL_ERROR" as const;

/**
 * 指标 JSONL 损坏、字段非法或事实互相冲突时抛出的协议错误。
 *
 * @example
 * ```ts
 * if (error instanceof ModelCallMetricStoreProtocolError) {
 *     console.error(error.code);
 * }
 * ```
 */
export class ModelCallMetricStoreProtocolError extends Error {
    readonly code = MODEL_CALL_METRIC_STORE_PROTOCOL_ERROR_CODE;

    constructor(message: string) {
        super(message);
        this.name = "ModelCallMetricStoreProtocolError";
    }
}

/**
 * 将模型调用指标事实追加到工作区范围 JSONL 文件。
 *
 * @remarks
 * 每个 `(goalId, runId)` 独立写入一个文件；实例内追加按 Run 串行化，读取时
 * 校验每一行并拒绝冲突的同类调用事实。Store 不做聚合、调用去重或跨进程锁。
 *
 * @example
 * ```ts
 * const store = new JsonFileMetricsStore("/data/metrics");
 * const records = await store.read({ goalId: "goal-1", runId: "run-1" });
 * ```
 */
export class JsonFileMetricsStore implements MetricsStore {
    private readonly appendQueues = new Map<string, Promise<unknown>>();

    /** @param directory - 指标 JSONL 根目录；追加时按需创建子目录。 */
    constructor(private readonly directory: string) {}

    /**
     * 追加一条经协议校验的调用事实。
     *
     * @param record - 一次调用的开始事实或结束事实。
     * @returns 文件追加完成后 resolve。
     * @throws 记录不符合当前协议或文件系统写入失败时 reject。
     */
    append(record: ModelCallMetricRecord): Promise<void> {
        const parsed = ModelCallMetricRecordSchema.safeParse(record);
        if (!parsed.success) {
            throw new ModelCallMetricStoreProtocolError(
                "Invalid model call metric record",
            );
        }
        const key = this.keyFor(record.goalId, record.runId);
        const filePath = this.filePath(record.goalId, record.runId);
        const previous = this.appendQueues.get(key) ?? Promise.resolve();
        const operation = previous.catch(() => undefined).then(async () => {
            await mkdir(join(this.directory, this.encode(record.goalId)), {
                recursive: true,
                mode: 0o700,
            });
            await appendFile(
                filePath,
                `${JSON.stringify(parsed.data)}\n`,
                { encoding: "utf8", mode: 0o600 },
            );
        });
        let tracked: Promise<unknown>;
        tracked = operation
            .catch(() => undefined)
            .finally(() => {
                if (this.appendQueues.get(key) === tracked) {
                    this.appendQueues.delete(key);
                }
            });
        this.appendQueues.set(key, tracked);
        return operation;
    }

    /**
     * 严格读取一个 Goal/Run 的全部 JSONL 调用事实。
     *
     * @param query - 需要读取的 Goal 与 Run 身份。
     * @returns 按持久化追加顺序排列的不可变事实；文件不存在时返回空数组。
     * @throws 非法 JSON、协议字段、文件身份或冲突事实时抛出协议错误；其他文件系统错误原样传播。
     */
    async read(
        query: ModelCallMetricReadQuery,
    ): Promise<readonly ModelCallMetricRecord[]> {
        this.assertIdentifier(query.goalId, "goalId");
        this.assertIdentifier(query.runId, "runId");
        let contents: string;
        try {
            contents = await readFile(
                this.filePath(query.goalId, query.runId),
                "utf8",
            );
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return Object.freeze([]);
            }
            throw error;
        }

        const lines = contents.split("\n");
        if (lines.at(-1) === "") lines.pop();
        const records: ModelCallMetricRecord[] = [];
        const factsByCallAndType = new Map<string, string>();
        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index]!;
            if (line.length === 0) {
                throw new ModelCallMetricStoreProtocolError(
                    `Empty model call metric record at line ${index + 1}`,
                );
            }
            let decoded: unknown;
            try {
                decoded = JSON.parse(line);
            } catch {
                throw new ModelCallMetricStoreProtocolError(
                    `Invalid model call metric JSON at line ${index + 1}`,
                );
            }
            const parsed = ModelCallMetricRecordSchema.safeParse(decoded);
            if (!parsed.success) {
                throw new ModelCallMetricStoreProtocolError(
                    `Invalid model call metric record at line ${index + 1}`,
                );
            }
            const record = parsed.data as ModelCallMetricRecord;
            if (
                record.goalId !== query.goalId
                || record.runId !== query.runId
            ) {
                throw new ModelCallMetricStoreProtocolError(
                    `Model call metric identity mismatch at line ${index + 1}`,
                );
            }
            const factKey = `${record.callId}\u0000${record.recordType}`;
            const serialized = JSON.stringify(record);
            const existing = factsByCallAndType.get(factKey);
            if (existing !== undefined && existing !== serialized) {
                throw new ModelCallMetricStoreProtocolError(
                    `Conflicting ${record.recordType} facts for call ${record.callId}`,
                );
            }
            factsByCallAndType.set(factKey, serialized);
            records.push(Object.freeze(record));
        }
        return Object.freeze(records);
    }

    private filePath(goalId: string, runId: string): string {
        return join(
            this.directory,
            this.encode(goalId),
            `${this.encode(runId)}.jsonl`,
        );
    }

    private keyFor(goalId: string, runId: string): string {
        this.assertIdentifier(goalId, "goalId");
        this.assertIdentifier(runId, "runId");
        return JSON.stringify([goalId, runId]);
    }

    private encode(value: string): string {
        this.assertIdentifier(value, "metric identifier");
        return Buffer.from(value, "utf8").toString("base64url");
    }

    private assertIdentifier(value: string, field: string): void {
        if (typeof value !== "string" || value.length === 0) {
            throw new ModelCallMetricStoreProtocolError(
                `${field} must be a non-empty string`,
            );
        }
    }
}
