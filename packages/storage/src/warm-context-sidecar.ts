import { createHash, randomUUID } from "node:crypto";
import {
    chmod,
    mkdir,
    open,
    readFile,
    rename,
    unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import type {
    TrajectoryEvent,
} from "../../runtime/src/index";
import { freezeTrajectoryEvent } from "../../runtime/src/index";

export type WarmContextSidecarEntryKind =
    | "decision"
    | "finding"
    | "failure"
    | "blocker"
    | "unresolved";

export type WarmContextSidecarEntryStatus = "active" | "resolved" | "superseded";

export interface WarmContextSidecarEntry {
    readonly id: string;
    readonly kind: WarmContextSidecarEntryKind;
    readonly summary: string;
    readonly status: WarmContextSidecarEntryStatus;
    readonly lossy: true;
    readonly evidenceSequences: readonly number[];
    readonly firstSequence: number;
    readonly lastSequence: number;
    readonly lastAccessedSequence: number;
    readonly reinforcementCount: number;
    readonly sourceHash: string;
}

export interface WarmContextSidecar {
    readonly schemaVersion: 1;
    readonly goalId: string;
    readonly runId: string;
    readonly derivedThroughSequence: number;
    readonly sourceDigest: string;
    readonly compactorVersion: string;
    readonly entries: readonly WarmContextSidecarEntry[];
}

export interface WarmContextSidecarRestoreOptions {
    readonly committedThroughSequence?: number;
    readonly compactorVersion?: string;
    readonly expectedSourceDigest?: string;
}

export interface WarmContextSidecarStore {
    restore(
        goalId: string,
        runId: string,
        options?: WarmContextSidecarRestoreOptions,
    ): Promise<WarmContextSidecar | undefined>;
    save(sidecar: WarmContextSidecar): Promise<void>;
    remove(goalId: string, runId: string): Promise<void>;
}

/** Warm Sidecar 协议错误代码。 */
export const WARM_SIDECAR_PROTOCOL_ERROR_CODE = "WARM_SIDECAR_PROTOCOL_ERROR" as const;

const WarmContextSidecarEntrySchema = z.object({
    id: z.string().trim().min(1),
    kind: z.enum(["decision", "finding", "failure", "blocker", "unresolved"]),
    summary: z.string().trim().min(1),
    status: z.enum(["active", "resolved", "superseded"]),
    lossy: z.literal(true),
    evidenceSequences: z.array(z.number().int().positive().safe()),
    firstSequence: z.number().int().positive().safe(),
    lastSequence: z.number().int().positive().safe(),
    lastAccessedSequence: z.number().int().positive().safe(),
    reinforcementCount: z.number().int().nonnegative().safe(),
    sourceHash: z.string().trim().min(1),
}).strict();

/** Warm Sidecar 的严格 JSON Schema。 */
export const WarmContextSidecarSchema = z.object({
    schemaVersion: z.literal(1),
    goalId: z.string().trim().min(1),
    runId: z.string().trim().min(1),
    derivedThroughSequence: z.number().int().nonnegative().safe(),
    sourceDigest: z.string().trim().min(1),
    compactorVersion: z.string().trim().min(1),
    entries: z.array(WarmContextSidecarEntrySchema),
}).strict();

/** Warm Sidecar 结构损坏或字段失配时抛出的协议错误。 */
export class WarmContextSidecarProtocolError extends Error {
    readonly code = WARM_SIDECAR_PROTOCOL_ERROR_CODE;

    constructor(message: string, options?: { readonly cause?: unknown }) {
        super(message, options);
        this.name = "WarmContextSidecarProtocolError";
    }
}

/**
 * Warm Sidecar 编解码边界。
 *
 * @example
 * ```ts
 * const decoded = warmContextSidecarCodec.decode(rawJson);
 * ```
 */
export interface WarmContextSidecarCodec {
    /**
     * @param sidecar - 待保存的派生 Sidecar。
     * @returns 已校验且与输入隔离的冻结副本。
     * @throws WarmContextSidecarProtocolError 当结构或序列范围非法时。
     */
    encode(sidecar: WarmContextSidecar): Readonly<WarmContextSidecar>;
    /**
     * @param input - 从文件或外部边界解析出的未知值。
     * @returns 已校验且深冻结的 Sidecar。
     * @throws WarmContextSidecarProtocolError 当 JSON 或协议非法时。
     */
    decode(input: unknown): Readonly<WarmContextSidecar>;
}

/** 默认 Warm Sidecar Codec。 */
export const warmContextSidecarCodec: WarmContextSidecarCodec = Object.freeze({
    encode(sidecar: WarmContextSidecar): Readonly<WarmContextSidecar> {
        return validateAndFreeze(sidecar);
    },
    decode(input: unknown): Readonly<WarmContextSidecar> {
        const parsed = WarmContextSidecarSchema.safeParse(input);
        if (!parsed.success) {
            throw new WarmContextSidecarProtocolError(
                "Warm Sidecar does not match schema version 1",
                { cause: parsed.error },
            );
        }
        return validateAndFreeze(parsed.data as WarmContextSidecar);
    },
});

/**
 * 对 Trajectory committed 前缀计算稳定来源摘要。
 *
 * @remarks
 * 摘要覆盖每个事件的完整 canonical envelope（包括 payload、eventId 和 sequence），
 * 不包含提交边界之外的 tail。该函数只读输入，不把摘要写入事件或 Snapshot；调用
 * 方必须保证 `events` 已来自同一 Goal/Run 且没有遗漏前缀事件。
 *
 * @param events - 按 sequence 升序读取的 Trajectory 事件。
 * @param throughSequence - 需要纳入摘要的最大序号。
 * @returns `sha256:` 前缀的稳定十六进制摘要。
 * @throws WarmContextSidecarProtocolError 当边界或事件序号非法时。
 * @example
 * ```ts
 * const digest = computeTrajectorySourceDigest(events, 42);
 * ```
 */
export function computeTrajectorySourceDigest(
    events: readonly TrajectoryEvent[],
    throughSequence: number,
): string {
    if (!Number.isSafeInteger(throughSequence) || throughSequence < 0) {
        throw new WarmContextSidecarProtocolError(
            "throughSequence must be a non-negative safe integer",
        );
    }
    let previousSequence = 0;
    const committed: TrajectoryEvent[] = [];
    for (const event of events) {
        if (event.sequence > throughSequence) continue;
        const immutable = freezeTrajectoryEvent(event) as TrajectoryEvent;
        if (immutable.sequence <= previousSequence) {
            throw new WarmContextSidecarProtocolError(
                "Trajectory sequence must increase for source digest",
            );
        }
        previousSequence = immutable.sequence;
        committed.push(immutable);
    }
    const canonical = canonicalJson(committed);
    return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

/**
 * 基于本地 JSON 文件的可丢弃 Warm Sidecar Store。
 *
 * @remarks
 * 文件位于 `<directory>/<base64url(goalId)>/<base64url(runId)>/warm-v1.json`，写入
 * 采用同目录临时文件、fsync 和 rename，并将文件限制为 owner-only `0600`。读取到
 * 缺失、损坏、版本/来源失配或领先 Snapshot 的 Sidecar 时统一返回 undefined，供
 * 上层从 committed Trajectory 重建；该 Store 不会修改 Goal Snapshot 或 Trajectory。
 *
 * @example
 * ```ts
 * const store = new JsonFileWarmContextSidecarStore(".lazygoal/context-sidecars");
 * const sidecar = await store.restore("goal-1", "run-1", {
 *     committedThroughSequence: 42,
 *     compactorVersion: "deterministic-warm-v1",
 * });
 * ```
 */
export class JsonFileWarmContextSidecarStore implements WarmContextSidecarStore {
    /**
     * @param directory - Sidecar 根目录；保存时按需创建。
     */
    constructor(private readonly directory: string) {}

    /**
     * @inheritdoc
     */
    async restore(
        goalId: string,
        runId: string,
        options: WarmContextSidecarRestoreOptions = {},
    ): Promise<WarmContextSidecar | undefined> {
        this.assertIdentifier(goalId, "goalId");
        this.assertIdentifier(runId, "runId");
        validateRestoreOptions(options);

        let content: string;
        try {
            content = await readFile(this.filePath(goalId, runId), "utf8");
        } catch (error) {
            if (isMissingFile(error)) return undefined;
            return undefined;
        }

        let sidecar: Readonly<WarmContextSidecar>;
        try {
            sidecar = warmContextSidecarCodec.decode(JSON.parse(content));
        } catch {
            return undefined;
        }

        if (sidecar.goalId !== goalId || sidecar.runId !== runId) return undefined;
        if (
            options.committedThroughSequence !== undefined
            && sidecar.derivedThroughSequence > options.committedThroughSequence
        ) {
            return undefined;
        }
        if (
            options.compactorVersion !== undefined
            && sidecar.compactorVersion !== options.compactorVersion
        ) {
            return undefined;
        }
        if (
            options.expectedSourceDigest !== undefined
            && sidecar.sourceDigest !== options.expectedSourceDigest
        ) {
            return undefined;
        }
        return sidecar;
    }

    /**
     * @inheritdoc
     */
    async save(sidecar: WarmContextSidecar): Promise<void> {
        const validated = warmContextSidecarCodec.encode(sidecar);
        const goalDirectory = join(this.directory, this.encodeIdentifier(validated.goalId));
        const runDirectory = join(goalDirectory, this.encodeIdentifier(validated.runId));
        const filePath = join(runDirectory, "warm-v1.json");
        const temporaryPath = `${filePath}.${randomUUID()}.tmp`;

        await mkdir(runDirectory, { recursive: true, mode: 0o700 });
        await chmod(goalDirectory, 0o700);
        await chmod(runDirectory, 0o700);

        try {
            const handle = await open(temporaryPath, "wx", 0o600);
            try {
                await handle.writeFile(`${JSON.stringify(validated, null, 2)}\n`, "utf8");
                await handle.sync();
            } finally {
                await handle.close();
            }
            await chmod(temporaryPath, 0o600);
            await rename(temporaryPath, filePath);
        } catch (error) {
            await unlink(temporaryPath).catch(() => undefined);
            throw error;
        }
    }

    /**
     * @inheritdoc
     */
    async remove(goalId: string, runId: string): Promise<void> {
        this.assertIdentifier(goalId, "goalId");
        this.assertIdentifier(runId, "runId");
        try {
            await unlink(this.filePath(goalId, runId));
        } catch (error) {
            if (!isMissingFile(error)) throw error;
        }
    }

    private filePath(goalId: string, runId: string): string {
        return join(
            this.directory,
            this.encodeIdentifier(goalId),
            this.encodeIdentifier(runId),
            "warm-v1.json",
        );
    }

    private encodeIdentifier(value: string): string {
        this.assertIdentifier(value, "sidecar identifier");
        return Buffer.from(value, "utf8").toString("base64url");
    }

    private assertIdentifier(value: string, field: string): void {
        if (typeof value !== "string" || value.trim().length === 0) {
            throw new WarmContextSidecarProtocolError(`${field} must be a non-empty string`);
        }
    }
}

function validateAndFreeze(sidecar: WarmContextSidecar): Readonly<WarmContextSidecar> {
    const parsed = WarmContextSidecarSchema.safeParse(sidecar);
    if (!parsed.success) {
        throw new WarmContextSidecarProtocolError(
            "Warm Sidecar does not match schema version 1",
            { cause: parsed.error },
        );
    }
    if (parsed.data.derivedThroughSequence < 0) {
        throw new WarmContextSidecarProtocolError(
            "derivedThroughSequence must be non-negative",
        );
    }
    const entries = parsed.data.entries.map(validateEntry);
    const ids = new Set<string>();
    for (const entry of entries) {
        if (ids.has(entry.id)) {
            throw new WarmContextSidecarProtocolError("Warm Sidecar contains duplicate entry IDs");
        }
        ids.add(entry.id);
    }
    return deepFreeze({
        ...parsed.data,
        entries,
    });
}

function validateEntry(entry: WarmContextSidecarEntry): WarmContextSidecarEntry {
    if (
        entry.firstSequence > entry.lastSequence
        || entry.lastAccessedSequence < entry.firstSequence
        || entry.evidenceSequences.some(
            (sequence) => sequence < entry.firstSequence || sequence > entry.lastSequence,
        )
    ) {
        throw new WarmContextSidecarProtocolError("Warm Sidecar entry sequence range is invalid");
    }
    const evidenceSequences = [...new Set(entry.evidenceSequences)].sort(
        (left, right) => left - right,
    );
    return {
        ...entry,
        evidenceSequences: Object.freeze(evidenceSequences),
    };
}

function validateRestoreOptions(options: WarmContextSidecarRestoreOptions): void {
    if (
        options.committedThroughSequence !== undefined
        && (!Number.isSafeInteger(options.committedThroughSequence)
            || options.committedThroughSequence < 0)
    ) {
        throw new WarmContextSidecarProtocolError(
            "committedThroughSequence must be a non-negative safe integer",
        );
    }
    for (const [value, field] of [
        [options.compactorVersion, "compactorVersion"],
        [options.expectedSourceDigest, "expectedSourceDigest"],
    ] as const) {
        if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
            throw new WarmContextSidecarProtocolError(`${field} must be a non-empty string`);
        }
    }
}

function canonicalJson(value: unknown): string {
    return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value !== null && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return Object.fromEntries(
            Object.keys(record)
                .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
                .map((key) => [key, sortKeys(record[key])]),
        );
    }
    return value;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
    if (typeof value !== "object" || value === null || seen.has(value as object)) return value;
    seen.add(value as object);
    for (const child of Object.values(value as Record<string, unknown>)) {
        deepFreeze(child, seen);
    }
    return Object.freeze(value);
}

function isMissingFile(error: unknown): boolean {
    return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
