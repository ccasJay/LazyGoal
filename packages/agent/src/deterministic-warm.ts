import { createHash } from "node:crypto";
import type { TrajectoryWarmEntryExtractionInput } from "./trajectory-model-context-assembler";
import type { WarmCompactEntry, WarmEntryKind } from "./warm-reducer";

/** 基于已提交执行单元事实生成 Warm 候选的确定性提取器。 */
export class DeterministicWarmEntryExtractor {
    extract(input: TrajectoryWarmEntryExtractionInput): readonly WarmCompactEntry[] {
        const entries: WarmCompactEntry[] = [];
        for (const unit of input.omittedUnits) {
            const interesting = unit.events.filter((event) =>
                event.eventType === "decision_received"
                || event.eventType === "run_failed"
                || event.eventType === "execution_error"
                || event.eventType === "observation_recorded"
                || event.eventType === "run_waiting",
            );
            for (const event of interesting) {
                const kind = kindForEvent(event.eventType);
                const summary = summarize(event.payload);
                const source = `${event.eventId}:${JSON.stringify(event.payload)}`;
                entries.push({
                    id: `warm-${unit.executionUnitId}-${event.sequence}`,
                    kind,
                    summary,
                    status: "active",
                    lossy: true,
                    evidenceSequences: [event.sequence],
                    firstSequence: event.sequence,
                    lastSequence: event.sequence,
                    lastAccessedSequence: event.sequence,
                    reinforcementCount: 1,
                    sourceHash: `sha256:${createHash("sha256").update(source, "utf8").digest("hex")}`,
                });
            }
        }
        return Object.freeze(entries);
    }

    /** 兼容 `TrajectoryWarmEntryExtractor` 函数签名。 */
    call(input: TrajectoryWarmEntryExtractionInput): readonly WarmCompactEntry[] {
        return this.extract(input);
    }
}

/** 便于直接注入 Assembler 的函数形式。 */
export const deterministicWarmEntryExtractor = (
    input: TrajectoryWarmEntryExtractionInput,
): readonly WarmCompactEntry[] => new DeterministicWarmEntryExtractor().extract(input);

function kindForEvent(eventType: string): WarmEntryKind {
    if (eventType === "run_failed" || eventType === "execution_error") return "failure";
    if (eventType === "run_waiting") return "blocker";
    if (eventType === "observation_recorded") return "finding";
    return "decision";
}

function summarize(payload: unknown): string {
    const text = JSON.stringify(payload);
    return text.length > 1024 ? `${text.slice(0, 1021)}...` : text;
}
