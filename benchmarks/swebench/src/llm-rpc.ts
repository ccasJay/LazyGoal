import type { LLMAdapter, LLMRequest, LLMResponse } from "../../../packages/agent/src/index.js";
import type { ExecutionControl } from "../../../packages/runtime/src/index.js";
import { ExecutionAbortedError, throwIfAborted } from "../../../packages/runtime/src/index.js";
import type { StructuredOutputMode } from "../../../packages/llm/src/core/types.js";
import type { MuxChannelStream } from "./multiplex.js";

/** Worker 与宿主之间传输的结构化 LLM RPC 消息。 */
export type LlmRpcMessage =
    | { readonly type: "generate"; readonly id: string; readonly request: LLMRequest; readonly structuredOutputMode: StructuredOutputMode }
    | { readonly type: "cancel"; readonly id: string }
    | { readonly type: "result"; readonly id: string; readonly response: LLMResponse }
    | { readonly type: "error"; readonly id: string; readonly code: "provider" | "cancelled" | "protocol"; readonly message: string };

/** RPC 传输、结构化模式或远端协议错误。 */
export class LlmRpcError extends Error {
    constructor(message: string, readonly code: "provider" | "cancelled" | "protocol" | "mode_mismatch") {
        super(message);
        this.name = "LlmRpcError";
    }
}

/** Worker 侧 LLM Adapter 的装配输入。 */
/**
 * Worker RPC Adapter 的固定模式和对象级 Mux 通道。
 *
 * @example
 * ```ts
 * const options: RpcLlmAdapterOptions = { stream: mux.channel("llm"), structuredOutputMode: "strict" };
 * ```
 */
export interface RpcLlmAdapterOptions {
    readonly stream: MuxChannelStream<LlmRpcMessage>;
    readonly structuredOutputMode: StructuredOutputMode;
}

interface PendingRequest {
    readonly resolve: (response: LLMResponse) => void;
    readonly reject: (error: unknown) => void;
    readonly signal?: AbortSignal;
    abort: (() => void) | undefined;
    settled: boolean;
}

/**
 * 只通过 `llm` Mux 通道调用宿主模型的 Worker Adapter。
 *
 * @remarks
 * 实例不读取环境变量、API Key 或供应商配置；结构化输出模式在构造时冻结，
 * 每个请求只允许一次宿主调用。取消后本地请求立即以 `ExecutionAbortedError`
 * 结束，迟到的宿主响应会被消费并丢弃，不会污染后续请求。
 *
 * @example
 * ```ts
 * const adapter = new RpcLlmAdapter({ stream: mux.channel("llm"), structuredOutputMode: "strict" });
 * const response = await adapter.generate(request);
 * ```
 */
export class RpcLlmAdapter implements LLMAdapter {
    readonly structuredOutputMode: StructuredOutputMode;
    private readonly stream: MuxChannelStream<LlmRpcMessage>;
    private readonly pending = new Map<string, PendingRequest>();
    private readonly cancelled = new Set<string>();
    private readonly readPromise: Promise<void>;
    private readonly writer: WritableStreamDefaultWriter<LlmRpcMessage>;
    private reader: ReadableStreamDefaultReader<LlmRpcMessage> | undefined;
    private nextId = 1;
    private closedError: unknown;

    constructor(options: RpcLlmAdapterOptions) {
        this.stream = options.stream;
        this.structuredOutputMode = options.structuredOutputMode;
        this.writer = this.stream.writable.getWriter();
        this.readPromise = this.readResponses();
        this.readPromise.catch(() => undefined);
    }

    async generate(request: LLMRequest, control?: ExecutionControl): Promise<LLMResponse> {
        throwIfAborted(control);
        validateMode(this.structuredOutputMode, request);
        if (this.closedError !== undefined) throw this.closedError;
        const id = `llm-${this.nextId++}`;
        return new Promise<LLMResponse>((resolve, reject) => {
            const pending: PendingRequest = {
                resolve,
                reject,
                ...(control?.signal === undefined ? {} : { signal: control.signal }),
                abort: undefined,
                settled: false,
            };
            this.pending.set(id, pending);
            const abort = () => {
                if (pending.settled) return;
                pending.settled = true;
                this.cancelled.add(id);
                void this.send({ type: "cancel", id }).catch((error: unknown) => {
                    this.closedError ??= error;
                });
                this.pending.delete(id);
                reject(new ExecutionAbortedError());
            };
            pending.abort = abort;
            control?.signal?.addEventListener("abort", abort, { once: true });
            void this.send({ type: "generate", id, request, structuredOutputMode: this.structuredOutputMode })
                .catch((error: unknown) => {
                    control?.signal?.removeEventListener("abort", abort);
                    if (pending.settled) return;
                    pending.settled = true;
                    this.pending.delete(id);
                    reject(error);
                });
        });
    }

    /** 关闭 Adapter，并拒绝仍在等待的模型请求。 */
    async close(): Promise<void> {
        const error = new LlmRpcError("LLM RPC connection closed", "protocol");
        this.failPending(error);
        await this.reader?.cancel().catch(() => undefined);
        await this.readPromise.catch(() => undefined);
        this.writer.releaseLock();
    }

    private async send(message: LlmRpcMessage): Promise<void> {
        await this.writer.write(message);
    }

    private async readResponses(): Promise<void> {
        const reader = this.stream.readable.getReader();
        this.reader = reader;
        try {
            while (true) {
                const next = await reader.read();
                if (next.done) break;
                const message = parseLlmRpcMessage(next.value);
                if (message.type !== "result" && message.type !== "error") {
                    throw new LlmRpcError("Worker received an unexpected LLM RPC message", "protocol");
                }
                const pending = this.pending.get(message.id);
                if (pending === undefined) {
                    if (this.cancelled.delete(message.id)) continue;
                    throw new LlmRpcError("Unknown LLM RPC response id", "protocol");
                }
                this.pending.delete(message.id);
                if (pending.abort !== undefined) pending.signal?.removeEventListener("abort", pending.abort);
                if (pending.settled) continue;
                pending.settled = true;
                if (message.type === "result") {
                    try { validateLlmResponse(message.response); }
                    catch (error) { pending.reject(error); continue; }
                    pending.resolve(message.response);
                } else if (message.code === "cancelled") {
                    pending.reject(new ExecutionAbortedError());
                } else {
                    pending.reject(new LlmRpcError(message.message, message.code));
                }
            }
            const closed = new LlmRpcError("LLM RPC stream closed", "protocol");
            this.closedError ??= closed;
            this.failPending(closed);
        } catch (error) {
            this.closedError = error;
            this.failPending(error);
            throw error;
        } finally {
            reader.releaseLock();
        }
    }

    private failPending(error: unknown): void {
        for (const [id, pending] of this.pending) {
            this.pending.delete(id);
            if (!pending.settled) {
                pending.settled = true;
                pending.reject(error);
            }
        }
    }
}

/**
 * 宿主 RPC Server 的模型适配器和对象级 Mux 通道。
 *
 * @example
 * ```ts
 * const options: LlmRpcServerOptions = { stream: mux.channel("llm"), adapter };
 * ```
 */
export interface LlmRpcServerOptions {
    readonly stream: MuxChannelStream<LlmRpcMessage>;
    readonly adapter: LLMAdapter;
}

interface ActiveRequest {
    readonly controller: AbortController;
    settled: boolean;
}

/**
 * 宿主侧 LLM RPC Server。
 *
 * @remarks
 * Server 只接受 Worker 发来的 `generate`/`cancel`，按唯一 request ID 维护独立
 * pending map，并把供应商错误脱敏为稳定分类。请求的 structured-output mode
 * 必须与宿主 Adapter 的固定模式一致；连接断开会中止所有进行中的 Adapter。
 *
 * @example
 * ```ts
 * const server = new LlmRpcServer({ stream: mux.channel("llm"), adapter });
 * await server.closed;
 * ```
 */
export class LlmRpcServer {
    readonly closed: Promise<void>;
    private readonly stream: MuxChannelStream<LlmRpcMessage>;
    private readonly adapter: LLMAdapter;
    private readonly active = new Map<string, ActiveRequest>();
    private readonly readPromise: Promise<void>;
    private readonly writer: WritableStreamDefaultWriter<LlmRpcMessage>;
    private reader: ReadableStreamDefaultReader<LlmRpcMessage> | undefined;
    private resolveClosed!: () => void;
    private closedState = false;

    constructor(options: LlmRpcServerOptions) {
        this.stream = options.stream;
        this.adapter = options.adapter;
        this.writer = this.stream.writable.getWriter();
        this.closed = new Promise<void>((resolve) => { this.resolveClosed = resolve; });
        this.readPromise = this.run();
        this.readPromise.catch(() => undefined);
    }

    /** 中止 Server 的所有请求并关闭读取循环。 */
    async close(): Promise<void> {
        this.finish(new LlmRpcError("LLM RPC server closed", "protocol"));
        await this.reader?.cancel().catch(() => undefined);
        await this.closed;
        this.writer.releaseLock();
    }

    private async run(): Promise<void> {
        const reader = this.stream.readable.getReader();
        this.reader = reader;
        try {
            while (true) {
                const next = await reader.read();
                if (next.done) break;
                const message = parseLlmRpcMessage(next.value);
                if (message.type === "generate") {
                    void this.acceptGenerate(message).catch((error: unknown) => this.finish(error));
                } else if (message.type === "cancel") {
                    this.acceptCancel(message.id);
                } else {
                    throw new LlmRpcError("Host received an unexpected LLM RPC message", "protocol");
                }
            }
        } catch (error) {
            this.finish(error);
            throw error;
        } finally {
            reader.releaseLock();
            this.finish();
        }
    }

    private async acceptGenerate(message: Extract<LlmRpcMessage, { type: "generate" }>): Promise<void> {
        if (this.active.has(message.id)) {
            await this.send({ type: "error", id: message.id, code: "protocol", message: "Duplicate LLM RPC request id" });
            return;
        }
        try {
            validateMode(this.adapter.structuredOutputMode, message.request);
            if (message.structuredOutputMode !== this.adapter.structuredOutputMode) {
                throw new LlmRpcError("Structured-output mode mismatch", "mode_mismatch");
            }
        } catch (error) {
            await this.send({ type: "error", id: message.id, code: "protocol", message: sanitizeProtocolError(error) });
            return;
        }
        const active: ActiveRequest = { controller: new AbortController(), settled: false };
        this.active.set(message.id, active);
        try {
            const response = await this.adapter.generate(message.request, { signal: active.controller.signal });
            if (active.controller.signal.aborted) {
                await this.send({ type: "error", id: message.id, code: "cancelled", message: "Model request cancelled" });
            } else {
                validateLlmResponse(response);
                await this.send({ type: "result", id: message.id, response });
            }
        } catch (error) {
            const cancelled = active.controller.signal.aborted || isAbortLike(error);
            await this.send(cancelled
                ? { type: "error", id: message.id, code: "cancelled", message: "Model request cancelled" }
                : error instanceof LlmRpcError && error.code === "protocol"
                    ? { type: "error", id: message.id, code: "protocol", message: "Invalid LLM response" }
                    : { type: "error", id: message.id, code: "provider", message: "Model provider request failed" });
        } finally {
            active.settled = true;
            this.active.delete(message.id);
        }
    }

    private acceptCancel(id: string): void {
        const active = this.active.get(id);
        if (active === undefined) return;
        active.controller.abort();
    }

    private async send(message: LlmRpcMessage): Promise<void> {
        if (this.closedState) throw new LlmRpcError("LLM RPC server closed", "protocol");
        await this.writer.write(message);
    }

    private finish(error?: unknown): void {
        if (this.closedState) return;
        this.closedState = true;
        for (const active of this.active.values()) active.controller.abort();
        this.active.clear();
        this.resolveClosed();
        void error;
    }
}

/** 创建 Worker Adapter 的便捷函数。 */
export function createRpcLlmAdapter(options: RpcLlmAdapterOptions): RpcLlmAdapter {
    return new RpcLlmAdapter(options);
}

/** 创建并立即开始消费宿主模型请求的便捷函数。 */
export function createLlmRpcServer(options: LlmRpcServerOptions): LlmRpcServer {
    return new LlmRpcServer(options);
}

function validateMode(mode: StructuredOutputMode, request: LLMRequest): void {
    if (mode === "strict" && request.structuredOutput === undefined) {
        throw new LlmRpcError("Strict mode requires structuredOutput", "mode_mismatch");
    }
    if (mode === "prompt_only" && request.structuredOutput !== undefined) {
        throw new LlmRpcError("Prompt-only mode forbids structuredOutput", "mode_mismatch");
    }
}

function validateLlmResponse(response: LLMResponse): void {
    if (!isRecord(response) || typeof response.content !== "string") {
        throw new LlmRpcError("Invalid LLM response", "protocol");
    }
}

function parseLlmRpcMessage(value: unknown): LlmRpcMessage {
    if (!isRecord(value) || typeof value.type !== "string" || typeof value.id !== "string" || value.id.length === 0) {
        throw new LlmRpcError("Invalid LLM RPC message", "protocol");
    }
    if (value.type === "cancel") return { type: "cancel", id: value.id };
    if (value.type === "generate") {
        if (!isRecord(value.request) || (value.structuredOutputMode !== "strict" && value.structuredOutputMode !== "prompt_only")) {
            throw new LlmRpcError("Invalid LLM generate message", "protocol");
        }
        const request = value.request as unknown as LLMRequest;
        validateLlmRequest(request);
        return {
            type: "generate",
            id: value.id,
            request,
            structuredOutputMode: value.structuredOutputMode,
        };
    }
    if (value.type === "result") {
        if (!isRecord(value.response)) throw new LlmRpcError("Invalid LLM result message", "protocol");
        validateLlmResponse(value.response as unknown as LLMResponse);
        return { type: "result", id: value.id, response: value.response as unknown as LLMResponse };
    }
    if (value.type === "error" && (value.code === "provider" || value.code === "cancelled" || value.code === "protocol") && typeof value.message === "string") {
        return { type: "error", id: value.id, code: value.code, message: value.message };
    }
    throw new LlmRpcError("Invalid LLM RPC message", "protocol");
}

function validateLlmRequest(request: LLMRequest): void {
    if (!isRecord(request) || !Array.isArray(request.messages) || request.messages.length === 0) {
        throw new LlmRpcError("Invalid LLM request", "protocol");
    }
    for (const message of request.messages) {
        if (!isRecord(message) || (message.role !== "system" && message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") {
            throw new LlmRpcError("Invalid LLM request", "protocol");
        }
    }
    if (request.maxOutputTokens !== undefined && (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0)) {
        throw new LlmRpcError("Invalid LLM request", "protocol");
    }
    if (request.structuredOutput !== undefined
        && (!isRecord(request.structuredOutput) || typeof request.structuredOutput.name !== "string" || !isRecord(request.structuredOutput.schema))) {
        throw new LlmRpcError("Invalid LLM request", "protocol");
    }
}

function sanitizeProtocolError(error: unknown): string {
    return error instanceof LlmRpcError && error.code === "mode_mismatch"
        ? "Structured-output mode mismatch"
        : "Invalid LLM RPC request";
}

function isAbortLike(error: unknown): boolean {
    return error instanceof ExecutionAbortedError
        || (error instanceof Error && (error.name === "AbortError" || error.name === "ExecutionAbortedError"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
