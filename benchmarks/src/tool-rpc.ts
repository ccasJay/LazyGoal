import type {
    ExecutionControl,
    ToolObservation,
    ToolRegistration,
} from "../../packages/runtime/src/index.js";
import {
    ExecutionAbortedError,
    throwIfAborted,
} from "../../packages/runtime/src/index.js";
import { compileJsonSchema } from "../../packages/contracts/src/index.js";
import type { MuxChannelStream } from "./multiplex.js";

/** 工具清单中单个工具的导出元数据。 */
export interface ToolManifestEntry {
    /** 工具的稳定唯一标识。 */
    readonly id: string;
    /** 对外展示的稳定 Tool 描述。 */
    readonly description: string;
    /** 编译后的输入 JSON Schema。 */
    readonly inputSchema: Record<string, unknown>;
    /** 进程中断后对未完成 Action 的重放策略。 */
    readonly replayPolicy: "safe" | "manual";
}

/** 跨进程工具 RPC 支持的消息协议。 */
export type ToolRpcMessage =
    | { readonly type: "describe"; readonly id: string }
    | { readonly type: "describe_result"; readonly id: string; readonly tools: readonly ToolManifestEntry[] }
    | { readonly type: "execute"; readonly id: string; readonly actionId: string; readonly toolId: string; readonly input: unknown }
    | { readonly type: "execute_result"; readonly id: string; readonly actionId: string; readonly observation: ToolObservation }
    | { readonly type: "cancel"; readonly id: string }
    | { readonly type: "cancel_result"; readonly id: string; readonly cancelled: boolean }
    | { readonly type: "backend_call"; readonly id: string; readonly actionId: string; readonly toolId: string; readonly method: string; readonly params: unknown }
    | { readonly type: "backend_result"; readonly id: string; readonly actionId: string; readonly result?: unknown; readonly error?: string }
    | { readonly type: "error"; readonly id: string; readonly code: ToolRpcErrorCode; readonly message: string };

/** 工具 RPC 错误码。 */
export type ToolRpcErrorCode =
    | "invalid_message"
    | "protocol_error"
    | "unknown_tool"
    | "concurrent_execution"
    | "duplicate_execution"
    | "timeout"
    | "cancelled"
    | "transport_closed";

/**
 * 工具 RPC 协议与传输错误。
 *
 * @example
 * ```ts
 * throw new ToolRpcError("unknown_tool", "Tool bash was not found on worker");
 * ```
 */
export class ToolRpcError extends Error {
    readonly code: ToolRpcErrorCode;

    constructor(code: ToolRpcErrorCode, message: string) {
        super(message);
        this.name = "ToolRpcError";
        this.code = code;
    }
}

/**
 * 宿主端用于响应沙箱 Worker 显式后端调用的处理器契约。
 *
 * @example
 * ```ts
 * const handler: ToolBackendHandler = async ({ toolId, method, params }) => {
 *     if (toolId === "web_search") return await searchBackend.search(params);
 *     throw new Error(`Unsupported backend tool: ${toolId}`);
 * };
 * ```
 */
export type ToolBackendHandler = (call: {
    readonly toolId: string;
    readonly actionId: string;
    readonly method: string;
    readonly params: unknown;
}) => Promise<unknown>;

/**
 * 宿主端工具 RPC 客户端选项。
 *
 * @example
 * ```ts
 * const options: ToolRpcClientOptions = {
 *     stream: mux.channel("tools"),
 *     backendHandler: async (call) => ({ hits: [] }),
 * };
 * ```
 */
export interface ToolRpcClientOptions {
    /** 绑定的 Mux tools 通道。 */
    readonly stream: MuxChannelStream<ToolRpcMessage>;
    /** 可选的宿主显式后端处理器。 */
    readonly backendHandler?: ToolBackendHandler;
    /** 单次调用的默认超时毫秒数，默认 60 秒。 */
    readonly defaultTimeoutMs?: number;
}

interface ActiveExecution {
    readonly id: string;
    readonly actionId: string;
    readonly toolId: string;
    readonly resolve: (obs: ToolObservation) => void;
    readonly reject: (error: unknown) => void;
    readonly timeoutTimer: NodeJS.Timeout;
}

/**
 * 宿主端工具 RPC 客户端。
 *
 * @remarks
 * 管理与容器 Worker 间的握手、单在途工具执行以及受限宿主后端请求反向代理。
 *
 * @example
 * ```ts
 * const client = new ToolRpcClient({ stream: mux.channel("tools") });
 * const manifest = await client.describe();
 * const obs = await client.execute({ actionId: "a-1", toolId: "grep", input: { pattern: "test" } });
 * ```
 */
export class ToolRpcClient {
    private readonly stream: MuxChannelStream<ToolRpcMessage>;
    private readonly backendHandler?: ToolBackendHandler;
    private readonly defaultTimeoutMs: number;
    private readonly writer: WritableStreamDefaultWriter<ToolRpcMessage>;
    private reader?: ReadableStreamDefaultReader<ToolRpcMessage>;
    private readonly readPromise: Promise<void>;
    private nextId = 1;
    private currentExecution?: ActiveExecution;
    private pendingDescribe?: {
        readonly id: string;
        readonly resolve: (tools: readonly ToolManifestEntry[]) => void;
        readonly reject: (error: unknown) => void;
    };
    private readonly seenActionIds = new Set<string>();
    private closed = false;
    private failure?: ToolRpcError;

    constructor(options: ToolRpcClientOptions) {
        this.stream = options.stream;
        this.backendHandler = options.backendHandler;
        this.defaultTimeoutMs = options.defaultTimeoutMs ?? 60_000;
        this.writer = this.stream.writable.getWriter();
        this.readPromise = this.readLoop();
        this.readPromise.catch(() => undefined);
    }

    /**
     * 向 Worker 请求获取声明的工具清单。
     *
     * @returns Worker 提供的工具清单。
     * @throws 连接断开或协议非法时抛出 `ToolRpcError`。
     */
    async describe(control?: ExecutionControl): Promise<readonly ToolManifestEntry[]> {
        throwIfAborted(control);
        if (this.closed) throw this.failure ?? new ToolRpcError("transport_closed", "Tool RPC client is closed");
        if (this.pendingDescribe !== undefined) {
            throw new ToolRpcError("concurrent_execution", "Another describe request is already in flight");
        }
        const id = `desc-${this.nextId++}`;
        return new Promise<readonly ToolManifestEntry[]>((resolve, reject) => {
            this.pendingDescribe = { id, resolve, reject };
            void this.send({ type: "describe", id }).catch((err) => {
                this.pendingDescribe = undefined;
                reject(err);
            });
        });
    }

    /**
     * 触发沙箱 Worker 执行指定工具。
     *
     * @param options - 包含 actionId、toolId、input 与控制信号。
     * @returns 工具执行产出的结构化 Observation。
     * @throws 并发调用、重复 actionId、超时或协议违例时抛出异常。
     */
    async execute(options: {
        readonly actionId: string;
        readonly toolId: string;
        readonly input: unknown;
        readonly control?: ExecutionControl;
        readonly timeoutMs?: number;
    }): Promise<ToolObservation> {
        throwIfAborted(options.control);
        if (this.closed) throw this.failure ?? new ToolRpcError("transport_closed", "Tool RPC client is closed");
        if (this.currentExecution !== undefined) {
            throw new ToolRpcError("concurrent_execution", "Only one tool action execution is allowed at a time");
        }
        if (this.seenActionIds.has(options.actionId)) {
            throw new ToolRpcError("duplicate_execution", `Action ${options.actionId} has already been executed`);
        }
        this.seenActionIds.add(options.actionId);

        const id = `exec-${this.nextId++}`;
        const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;

        return new Promise<ToolObservation>((resolve, reject) => {
            const timeoutTimer = setTimeout(() => {
                this.handleTimeout(id, reject);
            }, timeoutMs);

            const active: ActiveExecution = {
                id,
                actionId: options.actionId,
                toolId: options.toolId,
                resolve: (obs) => {
                    clearTimeout(timeoutTimer);
                    resolve(obs);
                },
                reject: (err) => {
                    clearTimeout(timeoutTimer);
                    reject(err);
                },
                timeoutTimer,
            };
            this.currentExecution = active;

            const onAbort = () => {
                clearTimeout(timeoutTimer);
                void this.send({ type: "cancel", id }).catch(() => undefined);
                if (this.currentExecution?.id === id) {
                    this.currentExecution = undefined;
                }
                reject(new ExecutionAbortedError());
            };
            options.control?.signal?.addEventListener("abort", onAbort, { once: true });

            void this.send({
                type: "execute",
                id,
                actionId: options.actionId,
                toolId: options.toolId,
                input: options.input,
            }).catch((error) => {
                clearTimeout(timeoutTimer);
                options.control?.signal?.removeEventListener("abort", onAbort);
                if (this.currentExecution?.id === id) {
                    this.currentExecution = undefined;
                }
                reject(error);
            });
        });
    }

    private handleTimeout(id: string, reject: (error: unknown) => void): void {
        if (this.currentExecution?.id === id) {
            this.currentExecution = undefined;
            void this.send({ type: "cancel", id }).catch(() => undefined);
            reject(new ToolRpcError("timeout", `Tool execution ${id} exceeded timeout`));
        }
    }

    private async send(message: ToolRpcMessage): Promise<void> {
        if (this.closed) throw this.failure ?? new ToolRpcError("transport_closed", "Tool RPC client is closed");
        await this.writer.ready;
        await this.writer.write(message);
    }

    private async readLoop(): Promise<void> {
        try {
            this.reader = this.stream.readable.getReader();
            while (true) {
                const next = await this.reader.read();
                if (next.done) break;
                await this.handleIncoming(next.value);
            }
            this.fail(new ToolRpcError("transport_closed", "Tool RPC transport closed"));
        } catch (error) {
            const err = error instanceof ToolRpcError
                ? error
                : new ToolRpcError("transport_closed", error instanceof Error ? error.message : String(error));
            this.fail(err);
        }
    }

    private async handleIncoming(msg: ToolRpcMessage): Promise<void> {
        if (!isRecord(msg) || typeof msg.type !== "string") {
            throw new ToolRpcError("protocol_error", "Received malformed RPC message");
        }
        switch (msg.type) {
            case "describe_result": {
                if (this.pendingDescribe !== undefined && this.pendingDescribe.id === msg.id) {
                    const desc = this.pendingDescribe;
                    this.pendingDescribe = undefined;
                    desc.resolve(msg.tools);
                }
                break;
            }
            case "execute_result": {
                if (this.currentExecution !== undefined) {
                    if (this.currentExecution.id !== msg.id || this.currentExecution.actionId !== msg.actionId) {
                        const err = new ToolRpcError("protocol_error", `Execute response identity mismatch: expected (${this.currentExecution.id}, ${this.currentExecution.actionId}), got (${msg.id}, ${msg.actionId})`);
                        this.currentExecution.reject(err);
                        this.currentExecution = undefined;
                        throw err;
                    }
                    validateToolObservation(msg.observation);
                    const exec = this.currentExecution;
                    this.currentExecution = undefined;
                    exec.resolve(msg.observation);
                }
                break;
            }
            case "backend_call": {
                await this.handleBackendCall(msg);
                break;
            }
            case "error": {
                if (this.pendingDescribe?.id === msg.id) {
                    const desc = this.pendingDescribe;
                    this.pendingDescribe = undefined;
                    desc.reject(new ToolRpcError(msg.code, msg.message));
                } else if (this.currentExecution?.id === msg.id) {
                    const exec = this.currentExecution;
                    this.currentExecution = undefined;
                    exec.reject(new ToolRpcError(msg.code, msg.message));
                }
                break;
            }
            default:
                break;
        }
    }

    private async handleBackendCall(msg: Extract<ToolRpcMessage, { readonly type: "backend_call" }>): Promise<void> {
        // 校验是否属于当前在途执行
        if (
            this.currentExecution === undefined
            || this.currentExecution.id !== msg.id
            || this.currentExecution.actionId !== msg.actionId
            || this.currentExecution.toolId !== msg.toolId
        ) {
            await this.send({
                type: "backend_result",
                id: msg.id,
                actionId: msg.actionId,
                error: "Unauthorized backend call outside active execution context",
            });
            return;
        }

        if (this.backendHandler === undefined) {
            await this.send({
                type: "backend_result",
                id: msg.id,
                actionId: msg.actionId,
                error: "Host backend handler is not configured",
            });
            return;
        }

        try {
            const result = await this.backendHandler({
                toolId: msg.toolId,
                actionId: msg.actionId,
                method: msg.method,
                params: msg.params,
            });
            await this.send({
                type: "backend_result",
                id: msg.id,
                actionId: msg.actionId,
                result,
            });
        } catch (err) {
            await this.send({
                type: "backend_result",
                id: msg.id,
                actionId: msg.actionId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    private fail(err: ToolRpcError): void {
        if (this.closed) return;
        this.closed = true;
        this.failure = err;
        if (this.pendingDescribe !== undefined) {
            this.pendingDescribe.reject(err);
            this.pendingDescribe = undefined;
        }
        if (this.currentExecution !== undefined) {
            clearTimeout(this.currentExecution.timeoutTimer);
            this.currentExecution.reject(err);
            this.currentExecution = undefined;
        }
    }

    /** 关闭客户端连接并释放资源。 */
    async close(): Promise<void> {
        this.fail(new ToolRpcError("transport_closed", "Tool RPC client closed"));
        await this.reader?.cancel().catch(() => undefined);
        await this.writer.close().catch(() => undefined);
    }
}

/**
 * Worker 侧调用宿主显式后端的受控端口。
 *
 * @example
 * ```ts
 * const result = await backendPort.call("search", { query: "apple" });
 * ```
 */
export interface ToolRpcBackendPort {
    /** 调用宿主显式后端方法并返回响应。 */
    call(method: string, params: unknown): Promise<unknown>;
}

/**
 * Worker 侧工具 RPC 服务端配置。
 *
 * @example
 * ```ts
 * const options: ToolRpcServerOptions = {
 *     stream: mux.channel("tools"),
 *     tools: [createToolRegistration(readFileTool)],
 * };
 * ```
 */
export interface ToolRpcServerOptions {
    /** 绑定的 Mux tools 通道。 */
    readonly stream: MuxChannelStream<ToolRpcMessage>;
    /** Worker 注册的本地工具集；可以提供工厂以注入 backendPort。 */
    readonly getTools: (backendPort: ToolRpcBackendPort) => readonly ToolRegistration[];
}

/**
 * 沙箱 Worker 端工具 RPC 服务端。
 *
 * @remarks
 * 在容器 Worker 内运行，响应来自宿主的 describe 与 execute，并通过受限 backend 端口反向请求宿主后端。
 *
 * @example
 * ```ts
 * const server = new ToolRpcServer({
 *     stream: mux.channel("tools"),
 *     getTools: (backend) => [createReadFileTool(), createWebSearchTool(backend)],
 * });
 * ```
 */
export class ToolRpcServer {
    private readonly stream: MuxChannelStream<ToolRpcMessage>;
    private readonly writer: WritableStreamDefaultWriter<ToolRpcMessage>;
    private reader?: ReadableStreamDefaultReader<ToolRpcMessage>;
    private readonly tools: readonly ToolRegistration[];
    private readonly toolMap = new Map<string, ToolRegistration>();
    private readonly executedActionIds = new Set<string>();
    private inFlightExecution?: {
        readonly id: string;
        readonly actionId: string;
        readonly toolId: string;
        readonly abortController: AbortController;
    };
    private activeBackendCall?: {
        readonly id: string;
        readonly actionId: string;
        readonly resolve: (result: unknown) => void;
        readonly reject: (error: unknown) => void;
    };
    private closed = false;

    constructor(options: ToolRpcServerOptions) {
        this.stream = options.stream;
        this.writer = this.stream.writable.getWriter();
        const backendPort: ToolRpcBackendPort = {
            call: (method, params) => this.callHostBackend(method, params),
        };
        this.tools = options.getTools(backendPort);
        for (const tool of this.tools) {
            this.toolMap.set(tool.definition.id, tool);
        }
        void this.readLoop();
    }

    private async callHostBackend(method: string, params: unknown): Promise<unknown> {
        if (this.inFlightExecution === undefined) {
            throw new ToolRpcError("protocol_error", "Cannot make backend call when no tool action is in flight");
        }
        const { id, actionId, toolId } = this.inFlightExecution;
        return new Promise<unknown>((resolve, reject) => {
            this.activeBackendCall = { id, actionId, resolve, reject };
            void this.send({
                type: "backend_call",
                id,
                actionId,
                toolId,
                method,
                params,
            }).catch(reject);
        });
    }

    private async send(message: ToolRpcMessage): Promise<void> {
        if (this.closed) return;
        await this.writer.ready;
        await this.writer.write(message);
    }

    private async readLoop(): Promise<void> {
        try {
            this.reader = this.stream.readable.getReader();
            while (true) {
                const next = await this.reader.read();
                if (next.done) break;
                await this.handleIncoming(next.value);
            }
        } catch {
            // 连接断开
        } finally {
            this.close();
        }
    }

    private async handleIncoming(msg: ToolRpcMessage): Promise<void> {
        if (!isRecord(msg) || typeof msg.type !== "string") {
            return;
        }

        switch (msg.type) {
            case "describe": {
                const manifests: ToolManifestEntry[] = this.tools.map((t) => {
                    let inputSchema: Record<string, unknown> = {};
                    if ("inputContract" in t.definition && t.definition.inputContract !== undefined) {
                        inputSchema = compileJsonSchema(t.definition.inputContract) as Record<string, unknown>;
                    } else if ("inputSchema" in t.definition && (t.definition as Record<string, unknown>).inputSchema !== undefined) {
                        inputSchema = (t.definition as Record<string, unknown>).inputSchema as Record<string, unknown>;
                    }
                    return {
                        id: t.definition.id,
                        description: t.definition.description,
                        inputSchema,
                        replayPolicy: t.replayPolicy,
                    };
                });
                await this.send({ type: "describe_result", id: msg.id, tools: manifests });
                break;
            }
            case "execute": {
                void this.handleExecute(msg).catch(() => undefined);
                break;
            }
            case "cancel": {
                if (this.inFlightExecution !== undefined && this.inFlightExecution.id === msg.id) {
                    this.inFlightExecution.abortController.abort();
                    this.inFlightExecution = undefined;
                    await this.send({ type: "cancel_result", id: msg.id, cancelled: true });
                } else {
                    await this.send({ type: "cancel_result", id: msg.id, cancelled: false });
                }
                break;
            }
            case "backend_result": {
                if (
                    this.activeBackendCall !== undefined
                    && this.activeBackendCall.id === msg.id
                    && this.activeBackendCall.actionId === msg.actionId
                ) {
                    const call = this.activeBackendCall;
                    this.activeBackendCall = undefined;
                    if (msg.error !== undefined) {
                        call.reject(new Error(msg.error));
                    } else {
                        call.resolve(msg.result);
                    }
                }
                break;
            }
            default:
                break;
        }
    }

    private async handleExecute(msg: Extract<ToolRpcMessage, { readonly type: "execute" }>): Promise<void> {
        if (this.inFlightExecution !== undefined) {
            await this.send({
                type: "error",
                id: msg.id,
                code: "concurrent_execution",
                message: "Worker is currently executing another action",
            });
            return;
        }

        if (this.executedActionIds.has(msg.actionId)) {
            await this.send({
                type: "error",
                id: msg.id,
                code: "duplicate_execution",
                message: `Action ${msg.actionId} has already executed on worker`,
            });
            return;
        }
        this.executedActionIds.add(msg.actionId);

        const registration = this.toolMap.get(msg.toolId);
        if (registration === undefined) {
            await this.send({
                type: "execute_result",
                id: msg.id,
                actionId: msg.actionId,
                observation: {
                    kind: "failure",
                    error: `Tool "${msg.toolId}" not found in worker registry`,
                    recoverable: false,
                },
            });
            return;
        }

        const abortController = new AbortController();
        this.inFlightExecution = { id: msg.id, actionId: msg.actionId, toolId: msg.toolId, abortController };

        try {
            const control: ExecutionControl = { signal: abortController.signal };
            const prepared = registration.prepare(msg.input as never, control);
            if (!prepared.ok) {
                await this.send({
                    type: "execute_result",
                    id: msg.id,
                    actionId: msg.actionId,
                    observation: prepared.observation,
                });
                return;
            }

            const observation = await prepared.execute(control);
            validateToolObservation(observation);
            await this.send({
                type: "execute_result",
                id: msg.id,
                actionId: msg.actionId,
                observation,
            });
        } catch (error) {
            if (abortController.signal.aborted) {
                await this.send({
                    type: "error",
                    id: msg.id,
                    code: "cancelled",
                    message: "Action was cancelled",
                });
            } else {
                await this.send({
                    type: "execute_result",
                    id: msg.id,
                    actionId: msg.actionId,
                    observation: {
                        kind: "failure",
                        error: error instanceof Error ? error.message : String(error),
                        recoverable: false,
                    },
                });
            }
        } finally {
            if (this.inFlightExecution?.id === msg.id) {
                this.inFlightExecution = undefined;
            }
        }
    }

    /** 关闭服务端。 */
    close(): void {
        if (this.closed) return;
        this.closed = true;
        if (this.inFlightExecution !== undefined) {
            this.inFlightExecution.abortController.abort();
            this.inFlightExecution = undefined;
        }
        if (this.activeBackendCall !== undefined) {
            this.activeBackendCall.reject(new ToolRpcError("transport_closed", "Worker closed"));
            this.activeBackendCall = undefined;
        }
        this.reader?.cancel().catch(() => undefined);
        this.writer.close().catch(() => undefined);
    }
}

function validateToolObservation(val: unknown): asserts val is ToolObservation {
    if (!isRecord(val)) throw new ToolRpcError("protocol_error", "Observation must be an object");
    const kind = val.kind;
    if (kind !== "success" && kind !== "failure" && kind !== "outcome_unknown") {
        throw new ToolRpcError("protocol_error", `Invalid Observation kind: ${String(kind)}`);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
