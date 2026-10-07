import { ModelContextSourceError } from "./trajectory-execution-unit-adapter";
import { sameNativeIdentity, type NativeConversationIdentity, type ModelAssistantMessage } from "../../model-contracts/src/index";
import type { TrajectoryEvent } from "../../runtime/src/trajectory";
import type { NativeModelExchange } from "./trajectory-event-projector";
import { TrajectoryEventProjector } from "./trajectory-event-projector";

/**
 * 从已提交事实派生同身份且已结算的原生调用交换；未结算调用不进入请求。
 * @remarks 当前 Run 内最后一次身份变更结束此前续接；不读取诊断日志或执行工具。
 * @param events - 同一 Goal/Run 且已按 Snapshot 提交边界筛选的轨迹。
 * @param identity - 本轮 Adapter 的原生对话身份。
 * @param projector - 现有大型输出预览投影器。
 * @returns 以执行单元分组、按响应顺序排列的完整交换。
 * @example
 * ```ts
 * const exchanges = collectNativeModelExchanges(committed, adapter.nativeConversationIdentity, projector);
 * ```
 */
export function collectNativeModelExchanges(
    events: readonly TrajectoryEvent[],
    identity: NativeConversationIdentity,
    projector: TrajectoryEventProjector,
): ReadonlyMap<string, readonly NativeModelExchange[]> {
    const responses = events.filter((event): event is Extract<TrajectoryEvent, { eventType: "model_response_received" }> => event.eventType === "model_response_received" && event.payload.stage === "decide");
    const lastMismatch = events.filter(event =>
        event.eventType === "model_response_received" && event.payload.stage === "decide" && !sameNativeIdentity(event.payload.message.continuation!.identity, identity)
        || event.eventType === "model_context_frame" && event.payload.stage === "decide" && event.payload.nativeIdentity !== undefined
            && (event.payload.nativeIdentity === null || !sameNativeIdentity(event.payload.nativeIdentity, identity)),
    ).at(-1)?.sequence ?? 0;
    const groups = new Map<string, NativeModelExchange[]>();
    for (const response of responses) {
        if (response.sequence <= lastMismatch || !sameNativeIdentity(response.payload.message.continuation!.identity, identity)) continue;
        const unitId = response.executionUnitId;
        if (unitId === undefined) throw new ModelContextSourceError("Native response has no execution unit identity");
        const message = response.payload.message;
        const call = message.toolCalls?.[0];
        if (call === undefined) throw new ModelContextSourceError("Committed Decide response has no native tool call");
        const unitEvents = events.filter(event => event.executionUnitId === unitId);
        const settlement = settle(message, response.sequence, unitEvents, projector);
        if (settlement === undefined) continue;
        const exchange: NativeModelExchange = {
            conversationPosition: response.payload.conversationPosition,
            responseSequence: response.sequence,
            settledThroughSequence: settlement.sequence,
            messages: [message, { role: "tool", callId: call.callId, toolId: call.toolId, content: JSON.stringify(settlement.result) }],
        };
        const existing = groups.get(unitId) ?? [];
        existing.push(exchange);
        groups.set(unitId, existing);
    }
    return groups;
}

function settle(
    message: ModelAssistantMessage,
    responseSequence: number,
    events: readonly TrajectoryEvent[],
    projector: TrajectoryEventProjector,
): { sequence: number; result: unknown } | undefined {
    const call = message.toolCalls![0]!;
    if (call.toolId === "system_request_think") {
        const request = events.filter(event => event.eventType === "think_requested" && event.sequence < responseSequence).at(-1);
        if (request?.eventType !== "think_requested") throw new ModelContextSourceError("Native Think call is missing its committed request");
        const completed = events.find(event => event.eventType === "think_completed" && event.payload.requestId === request.payload.requestId);
        if (completed?.eventType !== "think_completed") return undefined;
        return { sequence: completed.sequence, result: { kind: "think_completed", output: completed.payload.output } };
    }
    const decisionEvent = events.find(event => event.eventType === "decision_received" && event.sequence > responseSequence);
    if (decisionEvent?.eventType !== "decision_received") return undefined;
    // 已接受但尚未关联领域决策的响应可能在崩溃恢复后被重新生成；只回放实际决策前最后一次响应。
    if (events.some(event => event.eventType === "model_response_received" && event.payload.stage === "decide"
        && event.sequence > responseSequence && event.sequence < decisionEvent.sequence)) return undefined;
    const decision = decisionEvent.payload.decision;
    if (decision.kind === "tool_call") {
        if (decision.action.toolId !== call.toolId) throw new ModelContextSourceError("Native call and committed action disagree");
        const observation = events.find(event => event.eventType === "observation_recorded" && event.payload.actionId === decision.action.actionId);
        if (observation?.eventType !== "observation_recorded") return undefined;
        const projected = projector.project(observation).payload as { observation: unknown };
        return { sequence: observation.sequence, result: { actionId: decision.action.actionId, sourceSequence: observation.sequence, observation: projected.observation } };
    }
    if (decision.kind === "context_lookup") {
        const request = events.find(event => event.eventType === "context_lookup_requested");
        if (request?.eventType !== "context_lookup_requested") return undefined;
        const completed = events.find(event => (event.eventType === "context_lookup_completed" || event.eventType === "context_lookup_not_found" || event.eventType === "context_lookup_failed") && event.payload.lookupId === request.payload.lookupId);
        if (completed === undefined) return undefined;
        return { sequence: completed.sequence, result: projector.project(completed).payload };
    }
    const terminal = events.find(event => ["run_waiting", "run_completed", "run_failed"].includes(event.eventType) && event.sequence > decisionEvent.sequence);
    if (["wait", "ask_user", "task_proposal", "complete", "fail"].includes(decision.kind) && terminal === undefined) return undefined;
    // 非工具系统决策的接受确认不宣称任何外部工具执行成功。
    return { sequence: terminal?.sequence ?? decisionEvent.sequence, result: {
        kind: "decision_accepted", decisionKind: decision.kind,
        ...(terminal === undefined ? {} : { state: terminal.eventType }),
    } };
}
