import { createReadStream } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { JsonFileGoalStore } from "../../../packages/storage/src/index.js";
import { readNormalizedUsage } from "../../../packages/agent/src/index.js";
import { isRecord } from "./manifest.js";

/**
 * 从已回收产物恢复报告事实，不推进 Runtime 或写回 Snapshot。
 * @remarks Trace 只提供已记录的用量；读取失败不冒充零消耗，也不覆盖其他可恢复事实。
 * @param copied - 已复制的宿主目录，不接受 Worker 提供的路径。
 * @param identity - 本题 Goal/Run 身份。
 * @param diagnostic - 接收不含文件内容的读取失败诊断。
 * @param signal - 产物回收宽限期的中止信号。
 * @returns 部分报告 metadata；没有可验证事实时返回 undefined。
 * @example
 * ```ts
 * const meta = await recoverSwebenchResult(copied, { goalId, runId }, console.error, signal);
 * ```
 */
export async function recoverSwebenchResult(
    copied: Partial<Record<"goals" | "trajectories" | "traces", string>>,
    identity: { goalId: string; runId: string },
    diagnostic: (message: string) => void,
    signal: AbortSignal,
): Promise<Readonly<Record<string, unknown>> | undefined> {
    const meta: Record<string, unknown> = {};
    if (copied.goals !== undefined) {
        try {
            signal.throwIfAborted();
            const goal = await new JsonFileGoalStore(copied.goals).restore(identity.goalId);
            if (goal === undefined || goal.state.run.id !== identity.runId) throw new Error("identity mismatch");
            Object.assign(meta, { goalId: goal.id, runId: goal.state.run.id, runStatus: goal.state.run.status,
                stopReason: goal.state.run.stopReason ?? null, completed: goal.state.run.status === "completed" });
        } catch { diagnostic("Could not recover a valid Goal snapshot for this attempt"); }
    }
    if (copied.traces !== undefined) {
        const file = join(copied.traces, Buffer.from(identity.goalId).toString("base64url"), `${Buffer.from(identity.runId).toString("base64url")}.jsonl`);
        const stream = createReadStream(file, { encoding: "utf8", signal });
        const lines = createInterface({ input: stream, crlfDelay: Infinity });
        try {
            let inputTokens = 0, outputTokens = 0, missingCalls = 0, responses = 0;
            const seen = new Set<string>();
            for await (const line of lines) {
                signal.throwIfAborted();
                if (!line.trim()) continue;
                const row: unknown = JSON.parse(line);
                if (!isRecord(row) || row.traceSchemaVersion !== 1 || row.goalId !== identity.goalId || row.runId !== identity.runId
                    || typeof row.traceId !== "string" || typeof row.kind !== "string" || !isRecord(row.payload)) throw new Error("Invalid trace record");
                if (seen.has(row.traceId)) continue;
                seen.add(row.traceId);
                if (row.kind !== "model_response") continue;
                responses++;
                const usage = readNormalizedUsage(row.payload.providerMetadata);
                if (usage === undefined) missingCalls++;
                else { inputTokens += usage.inputTokens; outputTokens += usage.outputTokens; }
                if (![inputTokens, outputTokens, missingCalls].every(Number.isSafeInteger)) throw new Error("Usage overflow");
            }
            if (responses > 0) meta.usage = { inputTokens, outputTokens, missingCalls };
        } catch { diagnostic("Could not recover model usage from this attempt's Trace"); }
        finally { lines.close(); stream.destroy(); }
    }
    return Object.keys(meta).length === 0 ? undefined : meta;
}
