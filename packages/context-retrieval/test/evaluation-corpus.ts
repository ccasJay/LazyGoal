import { performance } from "node:perf_hooks";

import type { ContextLookupRequest } from "../../model-contracts/src/index";
import {
    buildContextInvertedIndex,
    FieldedBm25LiteRanker,
    openContextRetrievalIndexSession,
    buildContextLookupResultFromRanking,
    type ContextRetrievalTrajectoryEvent,
    type ContextRetrievalMessage,
} from "../src/index";

export const goalId = "goal-eval-fixed-corpus";
export const runId = "run-eval-fixed-corpus";
export const boundary = 23;
export const conversationStartIndex = 4;

export const fixedMessages: readonly ContextRetrievalMessage[] = [
    {
        role: "user",
        content: "请帮我排查 packages/storage/src/goal-store.ts 中的权限异常，并且运行测试",
        createdAt: "2025-05-18T10:00:00.000Z",
    },
    {
        role: "assistant",
        content: "我将首先通过 read_file 查看 packages/storage/src/goal-store.ts，再检查权限相关配置。",
        createdAt: "2025-05-18T10:00:05.000Z",
    },
    {
        role: "user",
        content: "注意不要改动 public 接口签名，也不要修改无关文件",
        createdAt: "2025-05-18T10:00:10.000Z",
    },
    {
        role: "assistant",
        content: "明白，我将严格遵循接口约束并执行 npm test 验证。",
        createdAt: "2025-05-18T10:00:15.000Z",
    },
];

function rawEvent(
    sequence: number,
    eventId: string,
    draft: {
        readonly phase?: string;
        readonly executionUnitId?: string;
        readonly actionId?: string;
        readonly eventType: string;
        readonly payload: Record<string, unknown>;
    },
    occurredAt: string,
): ContextRetrievalTrajectoryEvent {
    return {
        eventSchemaVersion: 1,
        eventId,
        sequence,
        occurredAt,
        goalId,
        runId,
        phase: draft.phase ?? "executing",
        eventType: draft.eventType,
        payload: draft.payload,
        ...(draft.executionUnitId === undefined ? {} : { executionUnitId: draft.executionUnitId }),
        ...(draft.actionId === undefined ? {} : { actionId: draft.actionId }),
    };
}

export const fixedEvents: readonly ContextRetrievalTrajectoryEvent[] = [
    // Execution Unit 1: read_file
    rawEvent(1, "evt-1", {
        phase: "executing",
        executionUnitId: "unit-read-store",
        eventType: "decision_received",
        payload: {
            type: "decision_received",
            decision: {
                kind: "tool_call",
                action: {
                    actionId: "action-read-store",
                    toolId: "read_file",
                    input: { filePath: "packages/storage/src/goal-store.ts", objectId: "obj-store-1" },
                },
            },
        },
    }, "2025-05-18T10:00:20.000Z"),
    rawEvent(2, "evt-2", {
        phase: "executing",
        executionUnitId: "unit-read-store",
        actionId: "action-read-store",
        eventType: "action_staged",
        payload: {
            type: "action_staged",
            action: {
                actionId: "action-read-store",
                toolId: "read_file",
                input: { filePath: "packages/storage/src/goal-store.ts", objectId: "obj-store-1" },
            },
            approvalStatus: "approved",
        },
    }, "2025-05-18T10:00:21.000Z"),
    rawEvent(3, "evt-3", {
        phase: "executing",
        executionUnitId: "unit-read-store",
        actionId: "action-read-store",
        eventType: "tool_started",
        payload: {
            type: "tool_started",
            actionId: "action-read-store",
            toolId: "read_file",
            input: { filePath: "packages/storage/src/goal-store.ts", objectId: "obj-store-1" },
        },
    }, "2025-05-18T10:00:22.000Z"),
    rawEvent(4, "evt-4", {
        phase: "executing",
        executionUnitId: "unit-read-store",
        actionId: "action-read-store",
        eventType: "tool_finished",
        payload: {
            type: "tool_finished",
            actionId: "action-read-store",
            toolId: "read_file",
            observation: {
                kind: "success",
                output: { path: "packages/storage/src/goal-store.ts", value: "export class JsonFileGoalStore" },
                summary: "读取成功",
            },
        },
    }, "2025-05-18T10:00:23.000Z"),
    rawEvent(5, "evt-5", {
        phase: "executing",
        executionUnitId: "unit-read-store",
        actionId: "action-read-store",
        eventType: "observation_recorded",
        payload: {
            type: "observation_recorded",
            actionId: "action-read-store",
            observation: {
                kind: "success",
                output: { path: "packages/storage/src/goal-store.ts", value: "export class JsonFileGoalStore" },
                summary: "读取成功",
            },
        },
    }, "2025-05-18T10:00:24.000Z"),
    rawEvent(6, "evt-6", {
        phase: "executing",
        eventType: "state_committed",
        payload: { type: "state_committed", committedThroughSequence: 5 },
    }, "2025-05-18T10:00:25.000Z"),

    // Execution Unit 2: bash chmod -> error PERMISSION_DENIED
    rawEvent(7, "evt-7", {
        phase: "executing",
        executionUnitId: "unit-chmod-store",
        eventType: "decision_received",
        payload: {
            type: "decision_received",
            decision: {
                kind: "tool_call",
                action: {
                    actionId: "action-chmod-store",
                    toolId: "bash",
                    input: { command: "chmod 600 packages/storage/src/goal-store.ts", errorCode: "EPERM" },
                },
            },
        },
    }, "2025-05-18T10:00:26.000Z"),
    rawEvent(8, "evt-8", {
        phase: "executing",
        executionUnitId: "unit-chmod-store",
        actionId: "action-chmod-store",
        eventType: "action_staged",
        payload: {
            type: "action_staged",
            action: {
                actionId: "action-chmod-store",
                toolId: "bash",
                input: { command: "chmod 600 packages/storage/src/goal-store.ts", errorCode: "EPERM" },
            },
            approvalStatus: "approved",
        },
    }, "2025-05-18T10:00:27.000Z"),
    rawEvent(9, "evt-9", {
        phase: "executing",
        executionUnitId: "unit-chmod-store",
        actionId: "action-chmod-store",
        eventType: "tool_started",
        payload: {
            type: "tool_started",
            actionId: "action-chmod-store",
            toolId: "bash",
            input: { command: "chmod 600 packages/storage/src/goal-store.ts", errorCode: "EPERM" },
        },
    }, "2025-05-18T10:00:28.000Z"),
    rawEvent(10, "evt-10", {
        phase: "executing",
        executionUnitId: "unit-chmod-store",
        actionId: "action-chmod-store",
        eventType: "tool_finished",
        payload: {
            type: "tool_finished",
            actionId: "action-chmod-store",
            toolId: "bash",
            observation: {
                kind: "error",
                error: { code: "PERMISSION_DENIED", message: "Operation not permitted" },
                summary: "权限不足无法修改",
            },
        },
    }, "2025-05-18T10:00:29.000Z"),
    rawEvent(11, "evt-11", {
        phase: "executing",
        executionUnitId: "unit-chmod-store",
        actionId: "action-chmod-store",
        eventType: "observation_recorded",
        payload: {
            type: "observation_recorded",
            actionId: "action-chmod-store",
            observation: {
                kind: "error",
                error: { code: "PERMISSION_DENIED", message: "Operation not permitted" },
                summary: "权限不足无法修改",
            },
        },
    }, "2025-05-18T10:00:30.000Z"),
    rawEvent(12, "evt-12", {
        phase: "executing",
        eventType: "state_committed",
        payload: { type: "state_committed", committedThroughSequence: 11 },
    }, "2025-05-18T10:00:31.000Z"),

    // Execution Unit 3: npm test
    rawEvent(13, "evt-13", {
        phase: "executing",
        executionUnitId: "unit-npm-test",
        eventType: "decision_received",
        payload: {
            type: "decision_received",
            decision: {
                kind: "tool_call",
                action: {
                    actionId: "action-npm-test",
                    toolId: "bash",
                    input: { command: "npm test", toolId: "bash" },
                },
            },
        },
    }, "2025-05-18T10:00:32.000Z"),
    rawEvent(14, "evt-14", {
        phase: "executing",
        executionUnitId: "unit-npm-test",
        actionId: "action-npm-test",
        eventType: "action_staged",
        payload: {
            type: "action_staged",
            action: {
                actionId: "action-npm-test",
                toolId: "bash",
                input: { command: "npm test", toolId: "bash" },
            },
            approvalStatus: "approved",
        },
    }, "2025-05-18T10:00:33.000Z"),
    rawEvent(15, "evt-15", {
        phase: "executing",
        executionUnitId: "unit-npm-test",
        actionId: "action-npm-test",
        eventType: "tool_started",
        payload: {
            type: "tool_started",
            actionId: "action-npm-test",
            toolId: "bash",
            input: { command: "npm test", toolId: "bash" },
        },
    }, "2025-05-18T10:00:34.000Z"),
    rawEvent(16, "evt-16", {
        phase: "executing",
        executionUnitId: "unit-npm-test",
        actionId: "action-npm-test",
        eventType: "tool_finished",
        payload: {
            type: "tool_finished",
            actionId: "action-npm-test",
            toolId: "bash",
            observation: {
                kind: "success",
                output: { exitCode: 0, stdout: "pass 36\nfail 0" },
                summary: "全量测试通过",
            },
        },
    }, "2025-05-18T10:00:35.000Z"),
    rawEvent(17, "evt-17", {
        phase: "executing",
        executionUnitId: "unit-npm-test",
        actionId: "action-npm-test",
        eventType: "observation_recorded",
        payload: {
            type: "observation_recorded",
            actionId: "action-npm-test",
            observation: {
                kind: "success",
                output: { exitCode: 0, stdout: "pass 36\nfail 0" },
                summary: "全量测试通过",
            },
        },
    }, "2025-05-18T10:00:36.000Z"),
    rawEvent(18, "evt-18", {
        phase: "executing",
        eventType: "state_committed",
        payload: { type: "state_committed", committedThroughSequence: 17 },
    }, "2025-05-18T10:00:37.000Z"),

    // Execution Unit 4: write_file packages/runtime/src/domain.ts
    rawEvent(19, "evt-19", {
        phase: "executing",
        executionUnitId: "unit-write-domain",
        eventType: "decision_received",
        payload: {
            type: "decision_received",
            decision: {
                kind: "tool_call",
                action: {
                    actionId: "action-write-domain",
                    toolId: "write_file",
                    input: { filePath: "packages/runtime/src/domain.ts", objectId: "obj-domain-1" },
                },
            },
        },
    }, "2025-05-18T10:00:38.000Z"),
    rawEvent(20, "evt-20", {
        phase: "executing",
        executionUnitId: "unit-write-domain",
        actionId: "action-write-domain",
        eventType: "action_staged",
        payload: {
            type: "action_staged",
            action: {
                actionId: "action-write-domain",
                toolId: "write_file",
                input: { filePath: "packages/runtime/src/domain.ts", objectId: "obj-domain-1" },
            },
            approvalStatus: "approved",
        },
    }, "2025-05-18T10:00:39.000Z"),
    rawEvent(21, "evt-21", {
        phase: "executing",
        executionUnitId: "unit-write-domain",
        actionId: "action-write-domain",
        eventType: "tool_started",
        payload: {
            type: "tool_started",
            actionId: "action-write-domain",
            toolId: "write_file",
            input: { filePath: "packages/runtime/src/domain.ts", objectId: "obj-domain-1" },
        },
    }, "2025-05-18T10:00:40.000Z"),
    rawEvent(22, "evt-22", {
        phase: "executing",
        executionUnitId: "unit-write-domain",
        actionId: "action-write-domain",
        eventType: "tool_finished",
        payload: {
            type: "tool_finished",
            actionId: "action-write-domain",
            toolId: "write_file",
            observation: {
                kind: "success",
                output: { path: "packages/runtime/src/domain.ts", size: 1024 },
                summary: "写入领域定义成功",
            },
        },
    }, "2025-05-18T10:00:41.000Z"),
    rawEvent(23, "evt-23", {
        phase: "executing",
        executionUnitId: "unit-write-domain",
        actionId: "action-write-domain",
        eventType: "observation_recorded",
        payload: {
            type: "observation_recorded",
            actionId: "action-write-domain",
            observation: {
                kind: "success",
                output: { path: "packages/runtime/src/domain.ts", size: 1024 },
                summary: "写入领域定义成功",
            },
        },
    }, "2025-05-18T10:00:42.000Z"),
    rawEvent(24, "evt-24", {
        phase: "executing",
        eventType: "state_committed",
        payload: { type: "state_committed", committedThroughSequence: 23 },
    }, "2025-05-18T10:00:43.000Z"),
];

export interface FixedCorpusTestCase {
    readonly name: string;
    readonly need: "historical_execution" | "conversation_history";
    readonly question: string;
    readonly filters?: Record<string, readonly any[]>;
    readonly expectedDocIds: readonly string[];
}

export const fixedTestCases: readonly FixedCorpusTestCase[] = [
    {
        name: "exact_error_code",
        need: "historical_execution",
        question: "PERMISSION_DENIED",
        expectedDocIds: ["context-doc-3779bbc0866ade264f21c3b99cfe6577"],
    },
    {
        name: "exact_path",
        need: "historical_execution",
        question: "packages/storage/src/goal-store.ts",
        expectedDocIds: [
            "context-doc-640bc4e04ccbd56ba6af44b5ae0f64de",
            "context-doc-3779bbc0866ade264f21c3b99cfe6577",
        ],
    },
    {
        name: "command_execution",
        need: "historical_execution",
        question: "which action ran npm test?",
        expectedDocIds: ["context-doc-8d81b22dbfc10fd8aeb902195a5a529d"],
    },
    {
        name: "domain_file",
        need: "historical_execution",
        question: "packages/runtime/src/domain.ts",
        expectedDocIds: ["context-doc-62b3ec3a2b878996e52a505ce1e63473"],
    },
    {
        name: "filter_tool_id",
        need: "historical_execution",
        question: "packages storage goal-store read_file",
        filters: { toolIds: ["read_file"] },
        expectedDocIds: ["context-doc-640bc4e04ccbd56ba6af44b5ae0f64de"],
    },
    {
        name: "conversation_requirement",
        need: "conversation_history",
        question: "public interface signature",
        expectedDocIds: ["conversation-goal-eval-fixed-corpus-2"],
    },
    {
        name: "negative_execution",
        need: "historical_execution",
        question: "Docker container image build logs",
        expectedDocIds: [],
    },
    {
        name: "negative_conversation",
        need: "conversation_history",
        question: "external postgres database connection",
        expectedDocIds: [],
    },
];

export interface FixedCorpusEvaluationReport {
    readonly recallAt5: number;
    readonly mrr: number;
    readonly negativeAccuracy: number;
    readonly positiveCount: number;
    readonly negativeCount: number;
    readonly tokenizationTimeMs: number;
    readonly queryTimeMs: number;
}

export function runFixedCorpusEvaluation(): FixedCorpusEvaluationReport {
    const t0 = performance.now();
    const session = openContextRetrievalIndexSession({
        goalId,
        runId,
        committedThroughSequence: boundary,
        events: fixedEvents,
        messages: fixedMessages,
        conversationStartIndex,
    });
    const tokenizationTimeMs = performance.now() - t0;

    let totalRecall = 0;
    let totalMRR = 0;
    let positiveCount = 0;
    let negativeCorrect = 0;
    let negativeCount = 0;

    const t1 = performance.now();
    for (const tc of fixedTestCases) {
        const documents = tc.need === "conversation_history"
            ? session.sidecar.documents.filter((d) => d.source?.kind === "conversation")
            : session.sidecar.documents.filter((d) => d.source?.kind !== "conversation");

        const index = documents.length === session.sidecar.documents.length
            ? session.index
            : buildContextInvertedIndex(documents);

        const ranking = new FieldedBm25LiteRanker(index, {
            topK: 5,
            minimumScore: 0,
        }).rank({
            kind: "context_lookup",
            need: tc.need,
            question: tc.question,
            ...(tc.filters ? { filters: tc.filters } : {}),
        } as ContextLookupRequest);

        const lookupResult = buildContextLookupResultFromRanking({
            goalId,
            runId,
            lookupId: `lookup-${tc.name}`,
            request: {
                kind: "context_lookup",
                need: tc.need,
                question: tc.question,
                ...(tc.filters ? { filters: tc.filters } : {}),
            },
            committedThroughSequence: boundary,
            ranking,
            indexVersion: session.sidecar.indexVersion,
        });

        if (tc.expectedDocIds.length > 0) {
            positiveCount++;
            const top5 = ranking.matches.slice(0, 5).map((m) => m.documentId);
            const hits = tc.expectedDocIds.filter((id) => top5.includes(id)).length;
            totalRecall += hits / tc.expectedDocIds.length;

            let rank = 0;
            for (let i = 0; i < ranking.matches.length; i++) {
                if (tc.expectedDocIds.includes(ranking.matches[i]!.documentId)) {
                    rank = i + 1;
                    break;
                }
            }
            if (rank > 0) totalMRR += 1 / rank;
        } else {
            negativeCount++;
            if (lookupResult.status === "not_found") {
                negativeCorrect++;
            }
        }
    }
    const queryTimeMs = performance.now() - t1;

    return {
        recallAt5: positiveCount > 0 ? totalRecall / positiveCount : 0,
        mrr: positiveCount > 0 ? totalMRR / positiveCount : 0,
        negativeAccuracy: negativeCount > 0 ? negativeCorrect / negativeCount : 0,
        positiveCount,
        negativeCount,
        tokenizationTimeMs,
        queryTimeMs,
    };
}
