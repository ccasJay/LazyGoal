import { randomUUID } from "node:crypto";
import {
    appendFile,
    mkdir,
    open,
    readFile,
    rename,
    unlink,
} from "node:fs/promises";
import { dirname } from "node:path";

/** 存储层写入原语可注入的 `node:fs/promises` 操作子集。 */
export type FileWriteOperations = Pick<
    typeof import("node:fs/promises"),
    "appendFile" | "mkdir" | "open" | "readFile" | "rename" | "unlink"
>;

/**
 * 一次写入的结果未知核对与重试策略。
 *
 * @remarks
 * `attempts` 包含首次尝试；只有 `codes` 中的 errno 才会触发核对，且调用点必须
 * 同时提供核对回调，否则原语在第一次失败时直接传播错误。
 *
 * @example
 * ```ts
 * const retry: FileWriteRetryPolicy = {
 *     attempts: 3,
 *     delayMs: 10,
 *     codes: TRANSIENT_FILE_ERROR_CODES,
 * };
 * ```
 */
export interface FileWriteRetryPolicy {
    /** 含首次尝试的总次数。 */
    readonly attempts: number;
    /** 两次尝试之间的等待毫秒；为 0 表示不等待。 */
    readonly delayMs: number;
    /** 触发核对与重试的 errno 集合。 */
    readonly codes: ReadonlySet<string>;
}

/**
 * 一次原子 JSON 替换的输入。
 *
 * @remarks
 * 原语在目标同目录创建 `<target>.<uuid>.tmp`，以 `0600` 写入并可选 `fsync`，
 * 再用 `rename` 覆盖目标；新建父目录为 `0700`。`verify` 返回 `applied` 时将
 * 该次写入视为成功，返回 `absent` 时才按策略重试。原语不定义错误类型。
 *
 * @example
 * ```ts
 * await atomicWriteJson({
 *     path: "/data/goals/abc.json",
 *     value: snapshot,
 *     indent: 2,
 *     trailingNewline: true,
 *     durable: true,
 * });
 * ```
 */
export interface AtomicWriteOptions {
    /** 完整目标文件路径；父目录按需创建。 */
    readonly path: string;
    /** 要序列化为 JSON 的值。 */
    readonly value: unknown;
    /** `JSON.stringify` 的缩进；`undefined` 表示紧凑输出。 */
    readonly indent: 2 | undefined;
    /** 是否在 JSON 文本后追加单个换行。 */
    readonly trailingNewline: boolean;
    /** 是否在 `rename` 前同步临时文件；`false` 时不执行 `fsync`。 */
    readonly durable: boolean;
    /** 可重试 errno 与次数上限；省略时不重试。 */
    readonly retry?: FileWriteRetryPolicy;
    /**
     * 结果未知时的效果核对；返回 `applied` 表示目标已是目标内容，
     * 返回 `absent` 表示尚未生效。核对抛错会立即终止写入。
     */
    readonly verify?: (serialized: string) => Promise<"applied" | "absent">;
    /** 仅 `rename` 阶段的 `ENOENT` 视为目标目录已被清理并正常返回。 */
    readonly tolerateRenameEnoent?: boolean;
    /** 可选文件操作替身；省略的项使用真实实现。 */
    readonly operations?: Partial<FileWriteOperations>;
}

/**
 * 一次 JSONL 记录追加的输入。
 *
 * @remarks
 * 每次调用只追加一条以单个换行结尾的 JSON 记录；追加原语不创建父目录。
 * 只有调用方声明可重试 errno 且提供 `verify` 时才重试，核对判定已写入后
 * 不再重复追加。
 *
 * @example
 * ```ts
 * await appendJsonl({ path: "/data/run.jsonl", value: event, durable: false });
 * ```
 */
export interface AppendJsonlOptions<T> {
    /** 完整目标文件路径；父目录由调用方负责创建。 */
    readonly path: string;
    /** 要序列化为单行 JSON 的记录。 */
    readonly value: T;
    /** 是否在返回前同步文件；`false` 时直接追加。 */
    readonly durable: boolean;
    /** 可重试 errno 与次数上限；省略时不重试。 */
    readonly retry?: FileWriteRetryPolicy;
    /** 使用本次序列化行核对追加是否已生效。 */
    readonly verify?: (line: string) => Promise<"applied" | "absent">;
    /** 可选文件操作替身；省略的项使用真实实现。 */
    readonly operations?: Partial<FileWriteOperations>;
}

/**
 * 一次原始字节追加的输入。
 *
 * @remarks
 * 用于不属于 JSONL 的追加日志；`durable` 为 `true` 时以追加模式打开并
 * `fsync`，否则直接 `appendFile`。追加原语不创建父目录，也没有重试语义。
 *
 * @example
 * ```ts
 * await appendFileChunk({ path: "/data/part-0.log", data: chunk, durable: true });
 * ```
 */
export interface AppendChunkOptions {
    /** 完整目标文件路径；父目录由调用方负责创建。 */
    readonly path: string;
    /** 原样追加的字节或文本。 */
    readonly data: string | Uint8Array;
    /** 是否在返回前同步文件。 */
    readonly durable: boolean;
    /** 可选文件操作替身；省略的项使用真实实现。 */
    readonly operations?: Partial<FileWriteOperations>;
}

/** 存储层视为可重试的临时文件系统 errno。 */
export const TRANSIENT_FILE_ERROR_CODES: ReadonlySet<string> = Object.freeze(
    new Set(["EINTR", "EAGAIN", "EBUSY"]),
);

/** 存储层通用的三次尝试、10ms 间隔重试预设。 */
export const WRITE_RETRY_THREE_ATTEMPTS: FileWriteRetryPolicy = Object.freeze({
    attempts: 3,
    delayMs: 10,
    codes: TRANSIENT_FILE_ERROR_CODES,
});

const DEFAULT_FILE_OPERATIONS: FileWriteOperations = Object.freeze({
    appendFile,
    mkdir,
    open,
    readFile,
    rename,
    unlink,
});

type AtomicWriteStage = "mkdir" | "open" | "write" | "sync" | "rename";

/**
 * 原子替换一个 JSON 文件。
 *
 * @remarks
 * 写入顺序固定为：创建父目录 → 以 `wx` 创建 `0600` 临时文件 → 写入 JSON →
 * 按需 `fsync` → `rename`。任何失败都会尽力删除临时文件；清理失败不会掩盖
 * 原始错误。`tolerateRenameEnoent` 只缩小 `rename` 阶段的 `ENOENT`，其它阶段
 * 与其它 errno 照旧抛出。
 *
 * @param options - 目标路径、序列化参数、持久性、核对与重试策略。
 * @returns 目标文件成为目标内容后 resolve；文件已生效但调用报错时也 resolve。
 * @throws 传播原始文件系统错误、核对错误或耗尽重试后的最后一次写入错误。
 */
export async function atomicWriteJson(options: AtomicWriteOptions): Promise<void> {
    const operations = resolveOperations(options.operations);
    const serialized = serializeJson(options.value, options.indent, options.trailingNewline);
    const parentDirectory = dirname(options.path);
    const temporaryPath = `${options.path}.${randomUUID()}.tmp`;

    for (let attempt = 1; ; attempt += 1) {
        let stage: AtomicWriteStage = "mkdir";

        try {
            await operations.mkdir(parentDirectory, { recursive: true, mode: 0o700 });
            stage = "open";
            const handle = await operations.open(temporaryPath, "wx", 0o600);

            try {
                stage = "write";
                await handle.writeFile(serialized, "utf8");

                if (options.durable) {
                    stage = "sync";
                    await handle.sync();
                }
            } finally {
                await handle.close();
            }

            stage = "rename";
            await operations.rename(temporaryPath, options.path);
            return;
        } catch (error) {
            const code = readErrorCode(error);

            if (
                stage === "rename"
                && code === "ENOENT"
                && options.tolerateRenameEnoent === true
            ) {
                await operations.unlink(temporaryPath).catch(() => undefined);
                return;
            }

            const retry = options.retry;
            const retryable = retry !== undefined
                && options.verify !== undefined
                && code !== undefined
                && retry.codes.has(code);

            if (!retryable) {
                await operations.unlink(temporaryPath).catch(() => undefined);
                throw error;
            }

            let outcome: "applied" | "absent";

            try {
                outcome = await options.verify!(serialized);
            } catch (verificationError) {
                await operations.unlink(temporaryPath).catch(() => undefined);
                throw verificationError;
            }

            if (outcome === "applied") return;

            await operations.unlink(temporaryPath).catch(() => undefined);

            if (attempt >= retry.attempts) throw error;
            if (retry.delayMs > 0) await delay(retry.delayMs);
        }
    }
}

/**
 * 追加一条 JSONL 记录。
 *
 * @remarks
 * 调用方必须先创建父目录。追加在 `durable` 为 `true` 时以 `600` 权限打开并
 * `fsync`，否则直接追加。只有声明可重试 errno 且提供 `verify` 时才重试；
 * 核对抛出的协议错误会立即传播，且不会截断或重写既有文件。
 *
 * @param options - 目标路径、记录、持久性、核对与重试策略。
 * @returns 记录已落盘后 resolve。
 * @throws 传播原始文件系统错误、核对错误或耗尽重试后的最后一次追加错误。
 */
export async function appendJsonl<T>(options: AppendJsonlOptions<T>): Promise<void> {
    const operations = resolveOperations(options.operations);
    const line = `${JSON.stringify(options.value)}\n`;
    const retry = options.retry;

    for (let attempt = 1; ; attempt += 1) {
        try {
            await appendLine(operations, options.path, line, options.durable);
            return;
        } catch (error) {
            const code = readErrorCode(error);
            const retryable = retry !== undefined
                && options.verify !== undefined
                && code !== undefined
                && retry.codes.has(code);

            if (!retryable) throw error;

            const outcome = await options.verify!(line);

            if (outcome === "applied") return;
            if (attempt >= retry.attempts) throw error;
            if (retry.delayMs > 0) await delay(retry.delayMs);
        }
    }
}

/**
 * 原样追加一段字节或文本。
 *
 * @remarks
 * 调用方必须先创建父目录。该原语没有重试与核对语义，失败时直接传播原始
 * 文件系统错误。
 *
 * @param options - 目标路径、待追加数据与持久性要求。
 * @returns 数据写入并（按需）同步完成后 resolve。
 * @throws 传播原始文件系统错误。
 */
export async function appendFileChunk(options: AppendChunkOptions): Promise<void> {
    const operations = resolveOperations(options.operations);

    if (!options.durable) {
        await operations.appendFile(options.path, options.data, { mode: 0o600 });
        return;
    }

    const handle = await operations.open(options.path, "a", 0o600);

    try {
        await handle.writeFile(options.data);
        await handle.sync();
    } finally {
        await handle.close();
    }
}

async function appendLine(
    operations: FileWriteOperations,
    path: string,
    line: string,
    durable: boolean,
): Promise<void> {
    if (!durable) {
        await operations.appendFile(path, line, { encoding: "utf8", mode: 0o600 });
        return;
    }

    const handle = await operations.open(path, "a", 0o600);

    try {
        await handle.writeFile(line, "utf8");
        await handle.sync();
    } finally {
        await handle.close();
    }
}

function serializeJson(value: unknown, indent: 2 | undefined, trailingNewline: boolean): string {
    const serialized = JSON.stringify(value, null, indent);

    if (serialized === undefined) {
        throw new TypeError("atomicWriteJson requires a JSON-serializable value");
    }

    return trailingNewline ? `${serialized}\n` : serialized;
}

function resolveOperations(
    overrides: Partial<FileWriteOperations> | undefined,
): FileWriteOperations {
    if (overrides === undefined) return DEFAULT_FILE_OPERATIONS;
    return { ...DEFAULT_FILE_OPERATIONS, ...overrides };
}

function readErrorCode(error: unknown): string | undefined {
    return error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
