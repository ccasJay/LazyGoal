import type { LLMRequest } from "../../llm-core/src/index";

/**
 * 判断最终控制消息是否要求模型仅返回 Context Epoch 检查点。
 *
 * @remarks
 * 只读取最后一条 `user` 控制消息的 JSON 负载；非 JSON、缺少
 * `contextEpoch.control.status` 或状态不是 `checkpoint_required` 时返回 `false`，
 * 不抛错、不修改请求。
 *
 * @param request - LLM 请求对象（包含 messages 数组）。
 * @returns 是否需要 Context Epoch 检查点。
 *
 * @example
 * ```ts
 * const isCheckpoint = requestRequiresContextCheckpoint(request);
 * ```
 */
export function requestRequiresContextCheckpoint(
    request: Pick<LLMRequest, "messages">,
): boolean {
    const message = request.messages.at(-1);
    if (message === undefined || message.role !== "user") return false;
    try {
        const payload = JSON.parse(message.content) as {
            readonly contextEpoch?: {
                readonly control?: { readonly status?: unknown };
            };
        };
        return payload.contextEpoch?.control?.status === "checkpoint_required";
    } catch {
        return false;
    }
}
