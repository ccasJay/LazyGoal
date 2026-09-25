import {
    appendFile,
    chmod,
    mkdir,
    readFile,
} from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import type {
    MetricsStore,
    ModelCallMetricsCoverage,
    ModelCallMetricsCoverageStore,
    ModelCallMetricsGap,
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
const ModelCallMetricsCoverageRecordSchema = z.discriminatedUnion("recordType", [
    z.object({
        recordType: z.literal("goal_initialized"),
        goalId: IdentifierSchema,
        historyCovered: z.boolean(),
        occurredAt: z.string().datetime({ offset: true }),
    }).strict(),
    z.object({
        recordType: z.literal("call_gap"),
        goalId: IdentifierSchema,
        runId: IdentifierSchema,
        callId: IdentifierSchema,
        occurredAt: z.string().datetime({ offset: true }),
    }).strict(),
]);
type ModelCallMetricsCoverageRecord = z.infer<typeof ModelCallMetricsCoverageRecordSchema>;

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
export class JsonFileMetricsStore implements MetricsStore, ModelCallMetricsCoverageStore {
    private readonly appendQueues = new Map<string, Promise<unknown>>();
    private readonly coverageQueues = new Map<string, Promise<unknown>>();

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
            await this.ensureGoalDirectory(record.goalId);
            await appendFile(
                filePath,
                `${JSON.stringify(parsed.data)}\n`,
                { encoding: "utf8", mode: 0o600 },
            );
            if (process.platform !== "win32") await chmod(filePath, 0o600);
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

    /**
     * 首次为 Goal 持久化历史覆盖状态；后续调用保留既有状态。
     *
     * @param goalId - Session 的稳定标识。
     * @param historyCovered - 新建 Goal 为 `true`，既有历史 Goal 为 `false`。
     * @throws 目录或 JSONL 写入失败时 reject。
     */
    initializeGoal(goalId: string, historyCovered: boolean): Promise<void> {
        this.assertIdentifier(goalId, "goalId");
        return this.enqueueCoverage(goalId, async () => {
            if (await this.readCoverage(goalId) !== undefined) return;
            await this.appendCoverageRecord({
                recordType: "goal_initialized",
                goalId,
                historyCovered,
                occurredAt: new Date().toISOString(),
            });
        });
    }

    /**
     * 追加一个可检测的指标写入缺口；相同调用缺口只记录一次。
     *
     * @param gap - 发生事实写入失败的 Goal、Run 与调用标识。
     * @throws 缺口记录无法持久化时 reject。
     */
    recordGap(gap: ModelCallMetricsGap): Promise<void> {
        this.assertIdentifier(gap.goalId, "goalId");
        this.assertIdentifier(gap.runId, "runId");
        this.assertIdentifier(gap.callId, "callId");
        return this.enqueueCoverage(gap.goalId, async () => {
            if (await this.readCoverage(gap.goalId) === undefined) {
                await this.appendCoverageRecord({
                    recordType: "goal_initialized",
                    goalId: gap.goalId,
                    historyCovered: false,
                    occurredAt: new Date().toISOString(),
                });
            }
            const coverage = await this.readCoverage(gap.goalId);
            if (coverage?.gaps.some((existing) => existing.runId === gap.runId && existing.callId === gap.callId)) {
                return;
            }
            await this.appendCoverageRecord({
                recordType: "call_gap",
                ...gap,
                occurredAt: new Date().toISOString(),
            });
        });
    }

    /**
     * 严格读取 Goal 的覆盖标记与已知写入缺口。
     *
     * @param goalId - Session 的稳定标识。
     * @returns 覆盖状态；没有标记文件时返回 `undefined`。
     * @throws 损坏、未知或身份不匹配的覆盖记录时抛出协议错误；文件系统错误原样传播。
     */
    async readCoverage(goalId: string): Promise<ModelCallMetricsCoverage | undefined> {
        this.assertIdentifier(goalId, "goalId");
        let contents: string;
        try {
            contents = await readFile(this.coverageFilePath(goalId), "utf8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
            throw error;
        }

        const lines = contents.split("\n");
        if (lines.at(-1) === "") lines.pop();
        let historyCovered: boolean | undefined;
        const gaps = new Map<string, ModelCallMetricsGap>();
        for (let index = 0; index < lines.length; index += 1) {
            let decoded: unknown;
            try {
                decoded = JSON.parse(lines[index]!);
            } catch {
                throw new ModelCallMetricStoreProtocolError(
                    `Invalid model call metric coverage JSON at line ${index + 1}`,
                );
            }
            const parsed = ModelCallMetricsCoverageRecordSchema.safeParse(decoded);
            if (!parsed.success || parsed.data.goalId !== goalId) {
                throw new ModelCallMetricStoreProtocolError(
                    `Invalid model call metric coverage record at line ${index + 1}`,
                );
            }
            const record = parsed.data as ModelCallMetricsCoverageRecord;
            if (record.recordType === "goal_initialized") {
                if (historyCovered !== undefined && historyCovered !== record.historyCovered) {
                    throw new ModelCallMetricStoreProtocolError("Conflicting Goal metric coverage markers");
                }
                historyCovered = record.historyCovered;
            } else {
                const key = JSON.stringify([record.runId, record.callId]);
                gaps.set(key, { goalId: record.goalId, runId: record.runId, callId: record.callId });
            }
        }
        if (historyCovered === undefined) {
            throw new ModelCallMetricStoreProtocolError("Metric coverage file is missing its Goal marker");
        }
        return Object.freeze({
            goalId,
            historyCovered,
            gaps: Object.freeze([...gaps.values()]),
        });
    }

    private enqueueCoverage<T>(goalId: string, operation: () => Promise<T>): Promise<T> {
        const previous = this.coverageQueues.get(goalId) ?? Promise.resolve();
        const pending = previous.catch(() => undefined).then(operation);
        let tracked: Promise<unknown>;
        tracked = pending
            .catch(() => undefined)
            .finally(() => {
                if (this.coverageQueues.get(goalId) === tracked) {
                    this.coverageQueues.delete(goalId);
                }
            });
        this.coverageQueues.set(goalId, tracked);
        return pending;
    }

    private async appendCoverageRecord(record: ModelCallMetricsCoverageRecord): Promise<void> {
        const parsed = ModelCallMetricsCoverageRecordSchema.safeParse(record);
        if (!parsed.success) {
            throw new ModelCallMetricStoreProtocolError("Invalid model call metric coverage record");
        }
        await this.ensureGoalDirectory(record.goalId);
        const filePath = this.coverageFilePath(record.goalId);
        await appendFile(
            filePath,
            `${JSON.stringify(parsed.data)}\n`,
            { encoding: "utf8", mode: 0o600 },
        );
        if (process.platform !== "win32") await chmod(filePath, 0o600);
    }

    private async ensureGoalDirectory(goalId: string): Promise<void> {
        const goalDirectory = join(this.directory, this.encode(goalId));
        await mkdir(goalDirectory, { recursive: true, mode: 0o700 });
        if (process.platform !== "win32") {
            await chmod(this.directory, 0o700);
            await chmod(goalDirectory, 0o700);
        }
    }

    private filePath(goalId: string, runId: string): string {
        return join(
            this.directory,
            this.encode(goalId),
            `${this.encode(runId)}.jsonl`,
        );
    }

    private coverageFilePath(goalId: string): string {
        return join(this.directory, this.encode(goalId), "coverage.jsonl");
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
