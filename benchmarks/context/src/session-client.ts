import type { LLMAdapter } from "../../../packages/agent/src/index.js";
import { client, methods, PROTOCOL_VERSION, type ContentBlock } from "@agentclientprotocol/sdk";
import type { AcpStream } from "../../../packages/acp/src/index.js";
import { record, textValue, type ContextScenario } from "./scenario.js";
import { driveScript, type ScriptBoundary, type StageRecord } from "./script-driver.js";
/** ACP 返回边界是进程输入，必须验证身份、状态与提交序列。 */
export function parseBoundary(raw: unknown): ScriptBoundary {
    const value = record(raw);
    if (!["completed", "failed", "cancelled", "waiting"].includes(String(value.status)) || !Number.isSafeInteger(value.sequence) || (value.sequence as number) < 0) throw new Error("Invalid Worker boundary");
    if (value.workerPid !== undefined && (!Number.isSafeInteger(value.workerPid) || (value.workerPid as number) < 1)) throw new Error("Invalid Worker PID");
    let questions: ScriptBoundary["questions"];
    if (value.questions !== undefined) {
        if (!Array.isArray(value.questions)) throw new Error("Invalid boundary questions");
        questions = value.questions.map(raw => { const q = record(raw); return { id: textValue(q.id), question: textValue(q.question) }; });
    }
    return { ...(questions ? { questions } : {}), ...(value.workerInstanceId === undefined ? {} : { workerInstanceId: textValue(value.workerInstanceId) }), ...(value.workerPid === undefined ? {} : { workerPid: value.workerPid as number }), goalId: textValue(value.goalId), runId: textValue(value.runId), status: value.status as ScriptBoundary["status"], sequence: value.sequence as number,
        ...(value.waitingFor === undefined ? {} : { waitingFor: textValue(value.waitingFor) }),
        ...(value.userMessage === undefined ? {} : { userMessage: textValue(value.userMessage) }),
        ...(value.stopReason === undefined ? {} : { stopReason: textValue(value.stopReason) }),
        ...(value.requestId === undefined ? {} : { requestId: textValue(value.requestId) }) };
}
/**
 * 一条有界 ACP 连接驱动一个 Goal；只发送当前操作和消息。
 * @remarks 恢复关联键保留冻结身份。取消 stage 会取消整个 session，不追加补救 prompt。
 * @example
 * ```ts
 * const stages = await runContextSession(stream, scenario, mode, signal);
 * ```
 */
export async function runContextSession(stream: AcpStream, scenario: ContextScenario, mode: "strict" | "prompt_only", signal: AbortSignal, start = 0, end = scenario.stages.length, initial: ScriptBoundary | null = null, nativeIdentity?: NonNullable<LLMAdapter["nativeConversationIdentity"]>): Promise<readonly StageRecord[]> {
    const app = client({ name: "lazygoal-context-benchmark" });
    return app.connectWith(stream, async connection => {
        signal.throwIfAborted();
        await connection.request(methods.agent.initialize, { protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} });
        const session = await connection.request(methods.agent.session.new, {
            cwd: scenario.kind === "source" ? "/testbed" : "/workspace/project", mcpServers: [], _meta: { profile: scenario.profile, maxSteps: scenario.budget.maxSteps, mode,
                ...(nativeIdentity === undefined ? {} : { nativeIdentity }),
                ...(initial === null ? {} : { restoreRef: { goalId: initial.goalId, runId: initial.runId } }) },
        });
        return driveScript(scenario, async (stage, _previous, stageSignal) => {
            const cancel = () => { void connection.notify(methods.agent.session.cancel, { sessionId: session.sessionId }).catch(() => undefined); };
            stageSignal.addEventListener("abort", cancel, { once: true });
            try {
                const result = await connection.request(methods.agent.session.prompt, { sessionId: session.sessionId,
                    prompt: [{ type: "text", text: JSON.stringify({ operation: stage.operation, prompt: stage.prompt, ...(stage.answers === undefined ? {} : { answers: stage.answers }) }) }] as ContentBlock[] });
                stageSignal.throwIfAborted();
                return parseBoundary(record(result._meta).boundary);
            } finally { stageSignal.removeEventListener("abort", cancel); }
        }, signal, start, end, initial);
    });
}
