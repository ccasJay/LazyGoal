import {
    mkdir,
} from "node:fs/promises";
import { dirname } from "node:path";
import { runTracePath } from "./goal-workspace-layout";

import type {
    DiagnosticTraceSink,
    TraceRecord,
} from "../../runtime/src/index";
import { appendJsonl } from "./json-file-write";
import { KeyedSerialQueue } from "./keyed-serial-queue";

/**
 * 将 Diagnostic Trace 追加到独立 JSONL 文件的 Sink。
 *
 * @remarks
 * 每个 `(goalId, runId)` 使用独立的
 * `<directory>/<base64url(goalId)>/runs/<base64url(runId)>/trace.jsonl` 文件。Trace 不是
 * Runtime 恢复数据，也没有读取、重试、Outbox 或 exactly-once 语义；同一实例
 * 内只保证单文件追加顺序。
 *
 * @example
 * ```ts
 * const sink = new JsonFileDiagnosticTraceSink("~/.lazygoal/workspaces/<workspace-id>/goals");
 * await sink.append(record);
 * ```
 */
export class JsonFileDiagnosticTraceSink implements DiagnosticTraceSink {
    private readonly appendQueue = new KeyedSerialQueue();

    /** @param directory - 工作区 Goal 存储根目录；写入时按需创建 Run 目录。 */
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
        return this.appendQueue.run(key, async () => {
            await mkdir(dirname(filePath), {
                recursive: true,
                mode: 0o700,
            });
            await appendJsonl({
                path: filePath,
                value: record,
                durable: false,
            });
        });
    }

    private filePath(goalId: string, runId: string): string {
        return runTracePath(this.directory, goalId, runId);
    }

    private keyFor(goalId: string, runId: string): string {
        this.assertIdentifier(goalId, "goalId");
        this.assertIdentifier(runId, "runId");
        return `${goalId}\u0000${runId}`;
    }

    private assertIdentifier(value: string, field: string): void {
        if (typeof value !== "string" || value.length === 0) {
            throw new Error(`${field} must be a non-empty string`);
        }
    }
}
