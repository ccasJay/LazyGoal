import { access, lstat, readFile, realpath } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { isAbsolute, normalize, relative, resolve, sep } from "node:path";
import {
    agent,
    methods,
    PROTOCOL_VERSION,
    RequestError,
    type AgentConnection,
    type ContentBlock,
    type InitializeResponse,
    type NewSessionRequest,
    type PromptRequest,
    type SessionNotification,
} from "@agentclientprotocol/sdk";
import type {
    AcpAgentInput,
    AcpPromptContent,
    AcpSession,
    AcpSessionInput,
} from "./contracts";

type SessionState = "idle" | "prompting" | "disposed";

interface SessionRecord {
    readonly id: string;
    readonly cwd: string;
    readonly session: AcpSession;
    controller: AbortController | undefined;
    state: SessionState;
    promptPromise: Promise<unknown> | undefined;
    disposed: Promise<void> | undefined;
}

interface AgentState {
    readonly sessions: Map<string, SessionRecord>;
    connection?: AgentConnection;
    closed: boolean;
    cleanupPromise?: Promise<void>;
}

const DEFAULT_AGENT_INFO = { name: "lazygoal-acp", version: "0.1.0" } as const;

/**
 * 启动一个只拥有当前 ACP 连接状态的 LazyGoal Agent。
 *
 * @remarks
 * 连接拥有 Session Map、连接级中止 signal 和所有 Session 的释放责任；返回的
 * 句柄由调用方关闭。函数不会复用其他连接的 Session，也不会注册认证、客户端
 * 文件系统、终端、MCP 或恢复能力。
 *
 * @param input - ACP 流、Session 工厂和可选 Agent 身份。
 * @returns 可用于观察或关闭当前 ACP 连接的句柄。
 * @throws 流无法建立时由官方 SDK 抛出连接错误；请求参数错误以 JSON-RPC 错误响应返回。
 *
 * @example
 * ```ts
 * const connection = serveLazyGoalAcpAgent({ stream, sessions });
 * await connection.closed;
 * ```
 */
export function serveLazyGoalAcpAgent(input: AcpAgentInput): AgentConnection {
    const state: AgentState = { sessions: new Map(), closed: false };
    const app = agent({ name: input.agentInfo?.name ?? DEFAULT_AGENT_INFO.name });

    app.onConnect((connection) => {
        state.connection = connection;
        connection.closed.then(
            () => { void cleanupAgentState(state); },
            () => { void cleanupAgentState(state); },
        );
    });

    app.onRequest(methods.agent.initialize, ({ params }): InitializeResponse => ({
        protocolVersion: params.protocolVersion === PROTOCOL_VERSION ? PROTOCOL_VERSION : PROTOCOL_VERSION,
        agentCapabilities: {
            loadSession: false,
            promptCapabilities: {},
        },
        agentInfo: {
            name: input.agentInfo?.name ?? DEFAULT_AGENT_INFO.name,
            version: input.agentInfo?.version ?? DEFAULT_AGENT_INFO.version,
        },
    }));

    app.onRequest(methods.agent.session.new, async ({ params }) => {
        return createSession(state, input, params);
    });

    app.onRequest(methods.agent.session.prompt, async ({ params, signal }) => {
        return runPrompt(state, params, signal);
    });

    app.onNotification(methods.agent.session.cancel, ({ params }) => {
        const record = state.sessions.get(params.sessionId);
        if (record !== undefined && record.state === "prompting") record.controller?.abort();
    });

    const connection = app.connect(input.stream);
    state.connection ??= connection;
    return connection;
}

async function createSession(
    state: AgentState,
    input: AcpAgentInput,
    params: NewSessionRequest,
): Promise<{ sessionId: string }> {
    if (state.closed) throw RequestError.requestCancelled(undefined, "ACP connection is closed");
    validateNewSession(params);
    const sessionId = createSessionId(state.sessions);
    const connectionSignal = state.connection?.signal ?? new AbortController().signal;
    const sessionInput: AcpSessionInput = {
        sessionId,
        cwd: params.cwd,
        signal: connectionSignal,
        ...(params._meta === undefined || params._meta === null ? {} : { sessionMeta: params._meta }),
        update: async (update) => {
            const record = state.sessions.get(sessionId);
            if (state.closed || record === undefined || record.state === "disposed") return;
            const client = state.connection?.client;
            if (client === undefined) return;
            const notification: SessionNotification = { ...update, sessionId };
            await client.notify(methods.client.session.update, notification);
        },
    };
    let session: AcpSession;
    try {
        session = await input.sessions.create(sessionInput);
    } catch (error) {
        throw error;
    }
    const record: SessionRecord = {
        id: sessionId,
        cwd: params.cwd,
        session,
        state: "idle",
        controller: undefined,
        promptPromise: undefined,
        disposed: undefined,
    };
    state.sessions.set(sessionId, record);
    return { sessionId };
}

async function runPrompt(
    state: AgentState,
    params: PromptRequest,
    requestSignal: AbortSignal,
): Promise<{ stopReason: "end_turn" | "max_tokens" | "max_turn_requests" | "refusal" | "cancelled"; _meta?: Record<string, unknown> }> {
    const record = state.sessions.get(params.sessionId);
    if (state.closed || record === undefined || record.state === "disposed") {
        throw RequestError.invalidParams(undefined, `Unknown ACP session ${params.sessionId}`);
    }
    if (record.state !== "idle") {
        throw RequestError.invalidParams(undefined, "ACP session already has a prompt in progress");
    }
    const content = await validatePrompt(params.prompt, record.cwd);
    const promptController = new AbortController();
    record.controller = promptController;
    const unlinkSignals = linkAbortSignals(
        [state.connection?.signal, requestSignal, promptController.signal],
        promptController,
    );
    record.state = "prompting";
    const control = { signal: promptController.signal };
    const prompt = record.session.prompt(content, control)
        .then((result) => ({
            stopReason: result.stopReason,
            ...(result.meta === undefined ? {} : { _meta: result.meta as Record<string, unknown> }),
        }))
        .catch((error: unknown) => {
            if (promptController.signal.aborted) return { stopReason: "cancelled" as const };
            throw error;
        })
        .finally(() => {
            unlinkSignals();
            if (record.state !== "disposed") record.state = "idle";
            record.controller = undefined;
            record.promptPromise = undefined;
        });
    record.promptPromise = prompt;
    try {
        return await prompt;
    } finally {
        // The SDK may close the request before the Session promise settles. The
        // record remains owned by the connection cleanup until that promise ends.
    }
}

function validateNewSession(params: NewSessionRequest): void {
    if (!isAbsolute(params.cwd)) throw RequestError.invalidParams(undefined, "cwd must be an absolute path");
    if (params.additionalDirectories !== undefined && params.additionalDirectories.length > 0) {
        throw RequestError.invalidParams(undefined, "additionalDirectories are not supported");
    }
    if (params.mcpServers.length > 0) {
        throw RequestError.invalidParams(undefined, "MCP servers are not supported");
    }
}

async function validatePrompt(
    blocks: readonly ContentBlock[],
    cwd: string,
): Promise<readonly AcpPromptContent[]> {
    if (blocks.length === 0) throw RequestError.invalidParams(undefined, "prompt must contain at least one content block");
    const result: AcpPromptContent[] = [];
    for (const block of blocks) {
        if (block.type === "text") {
            if (block.text.trim().length === 0) throw RequestError.invalidParams(undefined, "text content must be non-empty");
            result.push({ type: "text", text: block.text });
            continue;
        }
        if (block.type === "resource_link") {
            await validateResourceLink(block.uri, cwd);
            result.push({ type: "resource_link", uri: block.uri, name: block.name });
            continue;
        }
        throw RequestError.invalidParams(undefined, `Unsupported prompt content type ${block.type}`);
    }
    return result;
}

async function validateResourceLink(uri: string, cwd: string): Promise<void> {
    let path: string;
    try {
        const parsed = new URL(uri);
        if (parsed.protocol !== "file:" || (parsed.hostname !== "" && parsed.hostname !== "localhost")) {
            throw new Error("resource must be a local file URI");
        }
        path = fileURLToPath(parsed);
    } catch (error) {
        throw RequestError.invalidParams(undefined, `Invalid resource link: ${errorMessage(error)}`);
    }
    const cwdPath = normalize(resolve(cwd));
    const cwdReal = await safeRealpath(cwdPath);
    const candidate = normalize(resolve(path));
    const candidateReal = await safeRealpath(candidate);
    const escaped = relative(cwdReal, candidateReal);
    if (escaped === ".." || escaped.startsWith(`..${sep}`) || isAbsolute(escaped)) {
        throw RequestError.invalidParams(undefined, "resource link is outside the session cwd");
    }
    if (await containsSymlink(cwdPath, candidate)) {
        throw RequestError.invalidParams(undefined, "resource link must not traverse a symbolic link");
    }
    const metadata = await lstat(candidate).catch((error: unknown) => {
        throw RequestError.invalidParams(undefined, `resource link is not readable: ${errorMessage(error)}`);
    });
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw RequestError.invalidParams(undefined, "resource link must refer to a regular file");
    }
    try {
        await access(candidate, fsConstants.R_OK);
        await readFile(candidate);
    } catch (error) {
        throw RequestError.invalidParams(undefined, `resource link is not readable: ${errorMessage(error)}`);
    }
}

async function containsSymlink(root: string, target: string): Promise<boolean> {
    const rootParts = root.split(sep).filter(Boolean);
    const targetParts = target.split(sep).filter(Boolean);
    let current = target.startsWith(sep) ? sep : "";
    for (let index = 0; index < targetParts.length; index += 1) {
        current = current === sep ? `${current}${targetParts[index]}` : `${current}${sep}${targetParts[index]}`;
        if (index < rootParts.length && current === `${sep}${rootParts.slice(0, index + 1).join(sep)}`) continue;
        const metadata = await lstat(current).catch(() => undefined);
        if (metadata?.isSymbolicLink()) return true;
    }
    return false;
}

async function safeRealpath(path: string): Promise<string> {
    try {
        return await realpath(path);
    } catch (error) {
        throw RequestError.invalidParams(undefined, `resource path cannot be resolved: ${errorMessage(error)}`);
    }
}

function createSessionId(sessions: Map<string, SessionRecord>): string {
    let id = `session-${randomUUID()}`;
    while (sessions.has(id)) id = `session-${randomUUID()}`;
    return id;
}

function linkAbortSignals(signals: readonly (AbortSignal | undefined)[], target: AbortController): () => void {
    const listeners: { readonly signal: AbortSignal; readonly listener: () => void }[] = [];
    const abort = () => target.abort();
    for (const signal of signals) {
        if (signal === undefined) continue;
        if (signal.aborted) target.abort();
        signal.addEventListener("abort", abort, { once: true });
        listeners.push({ signal, listener: abort });
    }
    return () => {
        for (const { signal, listener } of listeners) signal.removeEventListener("abort", listener);
    };
}

async function cleanupAgentState(state: AgentState): Promise<void> {
    if (state.cleanupPromise !== undefined) return state.cleanupPromise;
    state.closed = true;
    state.cleanupPromise = (async () => {
        const records = [...state.sessions.values()];
        for (const record of records) {
            if (record.state === "disposed") continue;
            record.state = "disposed";
            record.controller?.abort();
        }
        await Promise.all(records.map(async (record) => {
            try { await record.promptPromise; } catch { /* preserve original prompt failure */ }
            if (record.disposed !== undefined) return record.disposed;
            record.disposed = Promise.resolve().then(() => record.session.dispose());
            try { await record.disposed; } catch { /* cleanup is best effort after disconnect */ }
        }));
        state.sessions.clear();
    })();
    return state.cleanupPromise;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
