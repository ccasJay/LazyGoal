/** 模型调用指标 JSONL 的用量记录。 */
export type ModelCallMetricUsageFile =
    | {
        readonly source: "provider_reported";
        readonly inputTokens: number;
        readonly outputTokens: number;
        readonly cachedInputTokens?: number;
    }
    | {
        readonly source: "estimated";
        /** 供应商未上报用量时的本地 Token 估算；取值范围由 Store 运行时校验。 */
        readonly inputTokens: number;
    }
    | { readonly source: "unavailable" };

/** 模型调用指标 JSONL 的文件记录。 */
export type ModelCallMetricFileRecord =
    | {
        readonly recordType: "call_started";
        readonly goalId: string;
        readonly runId: string;
        readonly executionUnitId?: string;
        readonly callId: string;
        readonly occurredAt: string;
        readonly modelId?: string;
    }
    | {
        readonly recordType: "call_finished";
        readonly goalId: string;
        readonly runId: string;
        readonly executionUnitId?: string;
        readonly callId: string;
        readonly occurredAt: string;
        readonly outcome: "completed" | "failed" | "cancelled";
        readonly usage: ModelCallMetricUsageFile;
        readonly requestDurationMs?: number;
        readonly decodeDurationMs?: number;
    };

/** 指标覆盖文件的一条记录。 */
export type ModelCallMetricsCoverageFileRecord =
    | {
        readonly recordType: "goal_initialized";
        readonly goalId: string;
        readonly historyCovered: boolean;
        readonly occurredAt: string;
    }
    | {
        readonly recordType: "call_gap";
        readonly goalId: string;
        readonly runId: string;
        readonly callId: string;
        readonly occurredAt: string;
    };
