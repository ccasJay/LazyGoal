import "dotenv/config";
import { pathToFileURL } from "node:url";
import { readLlmConfig } from "../src/config";
import { createLlmAdapter } from "../src/factory";
import type { LLMMessage } from "../src/core/types";
import type { ExecutionControl } from "../../runtime/src/execution-control";

/**
 * 使用显式凭据验证两轮原生工具调用及首轮结果回传，不执行文件或外部工具。
 * @remarks 每次运行产生两次付费模型请求；仅支持原生 OpenAI/Gemini，诊断不打印消息或凭据。
 * @param env - 当前供应商、端点、模型及 API Key 的显式环境配置。
 * @param control - 可取消两次网络调用的共享信号。
 * @returns 已验证的供应商、模型及调用数。
 * @throws 配置不完整、调用数量或参数错误、网络失败时拒绝。
 * @example
 * ```ts
 * const report = await runNativeDialogueSmoke(process.env);
 * ```
 */
export async function runNativeDialogueSmoke(env: Readonly<Record<string, string | undefined>>, control?: ExecutionControl) {
    const config = readLlmConfig({ ...env, LLM_STRUCTURED_OUTPUT_MODE: "strict" });
    const adapter = createLlmAdapter(config);
    if (adapter.nativeConversationIdentity === undefined) throw new Error("Native OpenAI or Gemini provider required");
    const messages: LLMMessage[] = [{ role: "user", content: "Call smoke_evidence with empty arguments. The application returns a result, then asks for another call. Do not perform any other work." }];
    const tools = [{ id: "smoke_evidence", description: "Return fixed test evidence. Use empty arguments.", parametersSchema: { type: "object", properties: {}, required: [], additionalProperties: false } }];
    for (let turn = 0; turn < 2; turn++) {
        const response = await adapter.generate({ messages, tools, toolChoice: "required", maxOutputTokens: Math.min(config.maxOutputTokens ?? 1024, 1024) }, control);
        const call = response.toolCalls?.[0];
        if (response.toolCalls?.length !== 1 || call?.toolId !== "smoke_evidence" || !call.callId || response.continuation === undefined
            || JSON.stringify(JSON.parse(call.argumentsJson)) !== "{}") throw new Error("Invalid native smoke tool response");
        messages.push({ role: "assistant", content: response.content,
            ...(response.reasoning === undefined ? {} : { reasoning: response.reasoning }),
            toolCalls: response.toolCalls, continuation: response.continuation });
        messages.push({ role: "tool", callId: call.callId, toolId: call.toolId, content: JSON.stringify({ kind: "success", output: { evidence: `smoke-${turn + 1}` } }) });
        if (turn === 0) messages.push({ role: "user", content: "The first result is recorded. Call smoke_evidence once more with empty arguments." });
    }
    return { provider: config.provider, model: config.model, nativeDialogue: "passed", modelCalls: 2 };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const controller = new AbortController();
    process.once("SIGINT", () => controller.abort());
    runNativeDialogueSmoke(process.env, { signal: controller.signal }).then(report => console.log(JSON.stringify(report))).catch(() => {
        console.error("Native dialogue smoke failed. Check provider configuration and credentials.");
        process.exitCode = controller.signal.aborted ? 130 : 1;
    });
}
