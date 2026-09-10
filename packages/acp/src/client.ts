import {
    client,
    methods,
    PROTOCOL_VERSION,
    type ContentBlock,
    type SessionNotification,
} from "@agentclientprotocol/sdk";
import type {
    AcpClientInput,
    AcpClientResult,
    AcpSessionUpdate,
} from "./contracts";

/**
 * 在一个 ACP v1 流上完成 initialize → session/new → session/prompt 的一次性 Client 生命周期。
 *
 * @remarks
 * Client 只负责本次调用创建的连接和更新路由；Agent 侧 Session 的释放由断开连接
 * 触发。外部取消会发送 `session/cancel` 并等待 Agent 返回 `cancelled`，连接关闭
 * 或远端协议错误则向调用方抛出原始错误。
 *
 * @param input - 流、绝对工作目录、受限 Prompt 以及可选取消和更新回调。
 * @returns Agent 返回的 Session ID、终止原因和可选结果 metadata。
 * @throws 初始化、建会话、Prompt 或更新回调失败时抛出错误；取消无法完成时抛出连接错误。
 *
 * @example
 * ```ts
 * const result = await runLazyGoalAcpClient({ stream, cwd: "/testbed", prompt: [
 *   { type: "text", text: "修复问题" },
 * ] });
 * ```
 */
export async function runLazyGoalAcpClient(input: AcpClientInput): Promise<AcpClientResult> {
    validateClientInput(input);
    let sessionId: string | undefined;
    let active = true;
    let updateError: unknown;
    const updateTasks: Promise<void>[] = [];
    const app = client({ name: "lazygoal-acp-client" });
    app.onNotification(methods.client.session.update, ({ params }) => {
        if (!active || sessionId === undefined || params.sessionId !== sessionId) return;
        const task = routeUpdate(input.onUpdate, params)
            .catch((error: unknown) => { updateError ??= error; });
        updateTasks.push(task);
    });

    try {
        return await app.connectWith(input.stream, async (context) => {
            if (input.signal?.aborted) throw createAbortError();
            await context.request(methods.agent.initialize, {
                protocolVersion: PROTOCOL_VERSION,
                clientCapabilities: {},
            });
            if (input.signal?.aborted) throw createAbortError();
            const session = await context.request(methods.agent.session.new, {
                cwd: input.cwd,
                mcpServers: [],
                ...(input.sessionMeta === undefined ? {} : { _meta: input.sessionMeta }),
            });
            sessionId = session.sessionId;
            const cancel = () => {
                void context.notify(methods.agent.session.cancel, { sessionId: session.sessionId })
                    .catch((error: unknown) => { updateError ??= error; });
            };
            input.signal?.addEventListener("abort", cancel, { once: true });
            try {
                const response = await context.request(methods.agent.session.prompt, {
                    sessionId: session.sessionId,
                    prompt: input.prompt as readonly ContentBlock[] as ContentBlock[],
                });
                await Promise.all(updateTasks);
                if (updateError !== undefined) throw updateError;
                return {
                    sessionId: session.sessionId,
                    stopReason: response.stopReason,
                    ...(response._meta === undefined || response._meta === null ? {} : { meta: response._meta }),
                };
            } finally {
                input.signal?.removeEventListener("abort", cancel);
            }
        });
    } finally {
        active = false;
        await Promise.allSettled(updateTasks);
    }
}

/** 与完整命名相同的简短 Client 入口，保留给一次性调用方。 */
export const runAcpClient = runLazyGoalAcpClient;

async function routeUpdate(
    onUpdate: AcpClientInput["onUpdate"],
    update: SessionNotification,
): Promise<void> {
    if (onUpdate === undefined) return;
    await onUpdate(update as AcpSessionUpdate);
}

function validateClientInput(input: AcpClientInput): void {
    if (!isAbsolutePath(input.cwd)) throw new Error("ACP client cwd must be an absolute path");
    if (input.prompt.length === 0) throw new Error("ACP client prompt must contain at least one content block");
    for (const block of input.prompt) {
        if (block.type === "text" && block.text.trim().length === 0) {
            throw new Error("ACP client text content must be non-empty");
        }
        if (block.type === "resource_link" && !isLocalFileUri(block.uri)) {
            throw new Error("ACP client resource link must use a local file URI");
        }
        if (block.type !== "text" && block.type !== "resource_link") {
            throw new Error(`ACP client does not support prompt content type ${block.type}`);
        }
    }
}

function isAbsolutePath(value: string): boolean {
    return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}

function isLocalFileUri(value: string): boolean {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "file:" && (parsed.hostname === "" || parsed.hostname === "localhost");
    } catch {
        return false;
    }
}

function createAbortError(): Error {
    const error = new Error("ACP client was aborted");
    error.name = "AbortError";
    return error;
}
