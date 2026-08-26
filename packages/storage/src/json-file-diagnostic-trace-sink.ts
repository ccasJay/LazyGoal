import {
    appendFile,
    mkdir,
} from "node:fs/promises";
import { join } from "node:path";

import type {
    DiagnosticTraceSink,
    TraceRecord,
} from "../../runtime/src/index";

/**
 * 将 Diagnostic Trace 追加到独立 JSONL 文件的 Sink。
 *
 * @remarks
 * 每个 `(goalId, runId)` 使用独立的
 * `<directory>/<base64url(goalId)>/<base64url(runId)>.jsonl` 文件。Trace 不是
 * Runtime 恢复数据，也没有读取、重试、Outbox 或 exactly-once 语义；同一实例
 * 内只保证单文件追加顺序。
 *
 * @example
 * ```ts
 * const sink = new JsonFileDiagnosticTraceSink(".lazygoal/traces");
 * await sink.append(record);
 * ```
 */
export class JsonFileDiagnosticTraceSink implements DiagnosticTraceSink {
    private readonly appendQueues = new Map<string, Promise<unknown>>();

    /** @param directory - Trace JSONL 根目录；写入时按需创建。 */
    constructor(private readonly directory: string) {}

    /**
     * 追加一条已脱敏、已限长的诊断记录。
     *
     * @param record - Diagnostic Trace 记录；由上游负责脱敏和大小限制。
     * @returns 文件追加完成后 resolve。
     * @throws 文件系统错误或记录无法序列化时拒绝。
     */
    append(record: TraceRecord): Promise<void> {
        const key = this.keyFor(record.goalId, record.runId);
        const filePath = this.filePath(record.goalId, record.runId);
        const previous = this.appendQueues.get(key) ?? Promise.resolve();
        const operation = previous.catch(() => undefined).then(async () => {
            await mkdir(join(this.directory, this.encode(record.goalId)), {
                recursive: true,
            });
            await appendFile(
                filePath,
                `${JSON.stringify(record)}\n`,
                { encoding: "utf8", mode: 0o600 },
            );
        });
        let tracked: Promise<unknown>;
        tracked = operation.finally(() => {
            if (this.appendQueues.get(key) === tracked) {
                this.appendQueues.delete(key);
            }
        });
        this.appendQueues.set(key, tracked);
        return operation;
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
        return `${goalId}\u0000${runId}`;
    }

    private encode(value: string): string {
        this.assertIdentifier(value, "trace identifier");
        return Buffer.from(value, "utf8").toString("base64url");
    }

    private assertIdentifier(value: string, field: string): void {
        if (typeof value !== "string" || value.length === 0) {
            throw new Error(`${field} must be a non-empty string`);
        }
    }
}
