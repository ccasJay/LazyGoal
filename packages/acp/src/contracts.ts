import type * as acp from "@agentclientprotocol/sdk";

/** 稳定 ACP v1 的对象级双向消息流。 */
export type AcpStream = acp.Stream;

/** ACP Agent 连接的生命周期句柄。 */
export type AcpConnection = acp.AgentConnection;

/** ACP Session 更新通知。 */
export type AcpSessionUpdate = acp.SessionNotification;

/** ACP v1 支持的 Prompt 内容块；Agent 入口会进一步限制可接受的变体。 */
export type AcpContentBlock = acp.ContentBlock;

/** Prompt 的稳定终止原因。 */
export type AcpStopReason = acp.StopReason;

/** 传给 Session 实现的文本 Prompt 内容。 */
export interface AcpPromptText {
    /** 内容类型。 */
    readonly type: "text";
    /** 非空用户文本。 */
    readonly text: string;
}

/** 传给 Session 实现的本地资源引用。 */
export interface AcpPromptResourceLink {
    /** 内容类型。 */
    readonly type: "resource_link";
    /** 已通过 Session 工作目录边界校验的本地 file URI。 */
    readonly uri: string;
    /** ACP 客户端提供的资源名称。 */
    readonly name: string;
}

/** LazyGoal ACP Session 接受的已规范化 Prompt 内容。 */
export type AcpPromptContent = AcpPromptText | AcpPromptResourceLink;

/**
 * LazyGoal ACP Prompt 的执行控制。
 *
 * @remarks
 * signal 由请求、Session 取消和连接关闭信号合并而成；Session 不拥有该信号。
 *
 * @example
 * ```ts
 * const control: AcpPromptControl = { signal: new AbortController().signal };
 * ```
 */
export interface AcpPromptControl {
    /** 当前 Prompt 的合并中止信号。 */
    readonly signal: AbortSignal;
}

/**
 * Session 工厂创建 Session 时收到的上下文。
 *
 * @remarks
 * 每个连接拥有独立的 Session ID、工作目录和连接级 signal；工厂不得把资源
 * 注册到其他连接。
 *
 * @example
 * ```ts
 * const input: AcpSessionInput = {
 *   sessionId: "session-1",
 *   cwd: "/testbed",
 *   signal: new AbortController().signal,
 *   update: async () => undefined,
 * };
 * ```
 */
export interface AcpSessionInput {
    /** ACP 分配的 Session 标识。 */
    readonly sessionId: string;
    /** 已校验的绝对工作目录。 */
    readonly cwd: string;
    /** 连接关闭时中止的 signal。 */
    readonly signal: AbortSignal;
    /** 向该 Session 的 ACP Client 发送更新。 */
    readonly update: (update: AcpSessionUpdate) => Promise<void>;
}

/**
 * Session Prompt 的结果。
 *
 * @remarks
 * stopReason 只描述当前 Prompt 的 ACP 终止原因；meta 由集成层提供可审计事实，
 * 不应包含供应商凭据。
 *
 * @example
 * ```ts
 * const result: AcpPromptResult = { stopReason: "end_turn" };
 * ```
 */
export interface AcpPromptResult {
    /** ACP v1 Prompt 终止原因。 */
    readonly stopReason: AcpStopReason;
    /** 可选的集成层结果元数据。 */
    readonly meta?: Readonly<Record<string, unknown>>;
}

/**
 * 一个 ACP Session 的执行与释放边界。
 *
 * @remarks
 * 同一实例的 prompt 由 Agent 串行化；dispose 释放该 Session 拥有的资源并且可重复调用。
 *
 * @example
 * ```ts
 * const session: AcpSession = {
 *   async prompt(content, control) {
 *     return { stopReason: control.signal.aborted ? "cancelled" : "end_turn" };
 *   },
 *   async dispose() {},
 * };
 * ```
 */
export interface AcpSession {
    /**
     * @param content - 已按 ACP 输入顺序规范化的 Prompt 内容。
     * @param control - 当前 Prompt 的合并中止控制。
     * @returns Prompt 终止事实。
     * @throws Session 或模型执行失败时抛出原始失败；取消应返回 `cancelled`。
     */
    prompt(content: readonly AcpPromptContent[], control: AcpPromptControl): Promise<AcpPromptResult>;

    /**
     * 释放 Session 所有资源；调用方不得在完成后继续发送更新。
     *
     * @throws 资源释放失败时抛出错误，由连接拥有者记录并继续其他清理。
     */
    dispose(): Promise<void>;
}

/**
 * 为每个 ACP 连接创建隔离 Session 的工厂。
 *
 * @example
 * ```ts
 * const sessions: AcpSessionFactory = {
 *   async create() { return { async prompt() { return { stopReason: "end_turn" }; }, async dispose() {} }; },
 * };
 * ```
 */
export interface AcpSessionFactory {
    /**
     * @param input - 当前连接拥有的 Session 上下文。
     * @returns 新建且归当前连接所有的 Session。
     * @throws 工作区或资源装配失败时抛出错误。
     */
    create(input: AcpSessionInput): Promise<AcpSession>;
}

/**
 * 一次性 Client 操作的输入。
 *
 * @example
 * ```ts
 * const input: AcpClientInput = { stream, cwd: "/testbed", prompt: [{ type: "text", text: "修复问题" }] };
 * ```
 */
export interface AcpClientInput {
    /** ACP 双向消息流。 */
    readonly stream: AcpStream;
    /** 发送给 `session/new` 的绝对工作目录。 */
    readonly cwd: string;
    /** 一个 Prompt 的输入内容。 */
    readonly prompt: readonly AcpContentBlock[];
    /** 可选的 Session metadata。 */
    readonly sessionMeta?: Readonly<Record<string, unknown>>;
    /** 可选的外部取消信号。 */
    readonly signal?: AbortSignal;
    /** 接收当前 Session 的更新。 */
    readonly onUpdate?: (update: AcpSessionUpdate) => void | Promise<void>;
}

/**
 * 一次性 Client 的终态结果。
 *
 * @example
 * ```ts
 * const result = await runAcpClient(input);
 * console.log(result.stopReason);
 * ```
 */
export interface AcpClientResult extends AcpPromptResult {
    /** Agent 分配的 Session 标识。 */
    readonly sessionId: string;
}
