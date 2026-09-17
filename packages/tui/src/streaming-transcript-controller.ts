import { collectMarkdownBlocks } from "./markdown-block-collector.js";

/**
 * 流式 Transcript 事件协议。
 *
 * @remarks
 * 定义流生命周期中严格的顺序事件：
 * 1. `started`：开启针对指定 `messageId` 的新流；
 * 2. `delta`：按到达顺序追加文本增量；
 * 3. `completed`：结束当前流，触发尾部所有未决内容收束。
 *
 * @example
 * ```ts
 * const event: TranscriptStreamEvent = {
 *     kind: "delta",
 *     streamId: "stream-1",
 *     text: "Hello world\n\n",
 * };
 * ```
 */
export type TranscriptStreamEvent =
    | { readonly kind: "started"; readonly streamId: string; readonly messageId: string }
    | { readonly kind: "delta"; readonly streamId: string; readonly text: string }
    | { readonly kind: "completed"; readonly streamId: string };

/**
 * 流式 Transcript 协议违反时抛出的稳定错误。
 *
 * @remarks
 * 用于拦截乱序事件、并发流调用、非活动流增量或已释放 Controller 的操作。
 * 抛出时 Controller 状态保持完全不变。
 *
 * @example
 * ```ts
 * try {
 *     controller.delta({ kind: "delta", streamId: "stale-id", text: "hi" });
 * } catch (error) {
 *     if (error instanceof TranscriptProtocolError) console.error(error.message);
 * }
 * ```
 */
export class TranscriptProtocolError extends Error {
    /** 机器可识别的稳定错误码。 */
    readonly code = "TRANSCRIPT_PROTOCOL_ERROR" as const;

    /**
     * @param message - 面向开发者的错误原因说明。
     */
    constructor(message: string) {
        super(message);
        this.name = "TranscriptProtocolError";
    }
}

/**
 * 外部注入的时间调度器抽象。
 *
 * @remarks
 * 允许单元测试注入确定性的 Fake Timer，避免真实等待 40ms。
 *
 * @example
 * ```ts
 * const scheduler: TranscriptScheduler = {
 *     setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
 *     clearTimeout: (h) => globalThis.clearTimeout(h as any),
 * };
 * ```
 */
export interface TranscriptScheduler {
    /** 启动延时回调。 */
    setTimeout(callback: () => void, ms: number): unknown;
    /** 取消延时回调。 */
    clearTimeout(handle: unknown): void;
}

/**
 * 流式 Transcript 在某一时刻的不可变视图快照。
 *
 * @remarks
 * 保证始终满足：
 * `rawText === committedBlocks.join("") + liveTail`
 * 以及 `liveTail === pendingBlocks.join("") + mutableTail`。
 *
 * @example
 * ```ts
 * const snapshot = controller.getSnapshot();
 * console.log(snapshot.committedBlocks, snapshot.liveTail);
 * ```
 */
export interface TranscriptSnapshot {
    /** 当前活跃或刚结束流的唯一标识，无活动流时为 null。 */
    readonly streamId: string | null;
    /** 关联的消息唯一标识，无活动流时为 null。 */
    readonly messageId: string | null;
    /** 原始完整累积文本，不随 Markdown 解析或视觉分块而变化。 */
    readonly rawText: string;
    /** 已提交到不可变历史（如终端原生 scrollback）的稳定 Markdown Block 列表。 */
    readonly committedBlocks: readonly string[];
    /** 已确认结构稳定、正在等待批次提交 Tick 的 Markdown Block 队列。 */
    readonly pendingBlocks: readonly string[];
    /** 尚未达到结构稳定条件的动态尾部原始字符串。 */
    readonly mutableTail: string;
    /**
     * 动态活动区可见的尾部总文本。
     *
     * @remarks
     * 由尚未提交的 pendingBlocks 与 mutableTail 直接拼接构成，保证向历史迁移时内容不丢不闪。
     */
    readonly liveTail: string;
    /** 是否正在接收流式增量（started 至 completed 之间为 true）。 */
    readonly isStreaming: boolean;
}

/**
 * 创建 StreamingTranscriptController 的可选依赖注入项。
 */
export interface StreamingTranscriptControllerOptions {
    /** 自定义时间调度器，默认使用 Node.js / 浏览器全局计时器。 */
    readonly scheduler?: TranscriptScheduler;
}

/**
 * 管理 Assistant 消息流式增量累积、Markdown 稳定切块、自适应提交节奏与快照分发的控制器。
 *
 * @remarks
 * 作为 React 外部的纯状态机与调度器：
 * 1. 严格校验流式事件生命周期，杜绝乱序与并发流污染；
 * 2. 累积不可修改的原始全文权威；
 * 3. 驱动保守 Markdown 收集器，仅当语法块确定不发生结构突变时才放入 pending 队列；
 * 4. 驱动 40ms 自适应 Tick 节流迁移到 committed 历史，或在必要时通过 flush 同步屏障提交；
 * 5. 支持 reset 与 dispose 生命周期清理，杜绝迟到更新。
 *
 * @example
 * ```ts
 * const controller = new StreamingTranscriptController();
 * controller.started({ kind: "started", streamId: "s1", messageId: "m1" });
 * controller.delta({ kind: "delta", streamId: "s1", text: "Hello\n\n" });
 * controller.completed({ kind: "completed", streamId: "s1" });
 * ```
 */
export class StreamingTranscriptController {
    private readonly scheduler: TranscriptScheduler;
    private readonly subscribers = new Set<(snapshot: TranscriptSnapshot) => void>();

    private activeStreamId: string | null = null;
    private currentMessageId: string | null = null;
    private rawAccumulatedText = "";
    private committed: string[] = [];
    private pending: string[] = [];
    private tail = "";
    private activeStreaming = false;

    private timerHandle: unknown = null;
    private isDisposed = false;
    private generation = 0;

    /**
     * @param options - 控制器构造配置，支持注入自定义调度器。
     */
    constructor(options?: StreamingTranscriptControllerOptions) {
        this.scheduler = options?.scheduler ?? {
            setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
            clearTimeout: (h) => globalThis.clearTimeout(h as any),
        };
    }

    /**
     * 开启一条新的消息流。
     *
     * @param event - 开始事件元数据。
     * @throws {TranscriptProtocolError} 当已处于活跃流、streamId 非法或控制器已释放时抛出。
     */
    started(event: { readonly streamId: string; readonly messageId: string }): void {
        if (this.isDisposed) {
            throw new TranscriptProtocolError("Controller is already disposed");
        }
        if (this.activeStreaming) {
            throw new TranscriptProtocolError(
                `Cannot start stream ${event.streamId}: stream ${this.activeStreamId} is still active`,
            );
        }
        if (!event.streamId) {
            throw new TranscriptProtocolError("streamId cannot be empty");
        }
        if (!event.messageId) {
            throw new TranscriptProtocolError("messageId cannot be empty");
        }

        if (this.pending.length > 0) {
            this.flush();
        }

        this.cancelTimer();
        this.generation++;
        this.activeStreamId = event.streamId;
        this.currentMessageId = event.messageId;
        this.rawAccumulatedText = "";
        this.committed = [];
        this.pending = [];
        this.tail = "";
        this.activeStreaming = true;

        this.notifySubscribers();
    }

    /**
     * 向当前活动流追加文本增量。
     *
     * @param event - 增量文本事件。
     * @throws {TranscriptProtocolError} 当无活动流、流标识不匹配或控制器已释放时抛出。
     */
    delta(event: { readonly streamId: string; readonly text: string }): void {
        if (this.isDisposed) {
            throw new TranscriptProtocolError("Controller is already disposed");
        }
        if (!this.activeStreaming || this.activeStreamId === null) {
            throw new TranscriptProtocolError(
                `Cannot deliver delta for stream ${event.streamId}: no active stream`,
            );
        }
        if (event.streamId !== this.activeStreamId) {
            throw new TranscriptProtocolError(
                `Stream ID mismatch: expected ${this.activeStreamId}, received ${event.streamId}`,
            );
        }

        if (event.text.length === 0) {
            return;
        }

        this.rawAccumulatedText += event.text;
        const currentUnstable = this.tail + event.text;
        const collection = collectMarkdownBlocks(currentUnstable, false);

        if (collection.stableBlocks.length > 0) {
            this.pending.push(...collection.stableBlocks);
            this.ensureTimer();
        }
        this.tail = collection.remainingTail;

        this.notifySubscribers();
    }

    /**
     * 标记当前活动流已完成，收束全部未决内容。
     *
     * @param event - 完成事件元数据。
     * @throws {TranscriptProtocolError} 当无活动流、流标识不匹配或控制器已释放时抛出。
     */
    completed(event: { readonly streamId: string }): void {
        if (this.isDisposed) {
            throw new TranscriptProtocolError("Controller is already disposed");
        }
        if (!this.activeStreaming || this.activeStreamId === null) {
            throw new TranscriptProtocolError(
                `Cannot complete stream ${event.streamId}: no active stream`,
            );
        }
        if (event.streamId !== this.activeStreamId) {
            throw new TranscriptProtocolError(
                `Stream ID mismatch: expected ${this.activeStreamId}, received ${event.streamId}`,
            );
        }

        this.activeStreaming = false;
        if (this.tail.length > 0) {
            const finalCollection = collectMarkdownBlocks(this.tail, true);
            if (finalCollection.stableBlocks.length > 0) {
                this.pending.push(...finalCollection.stableBlocks);
            }
            this.tail = "";
        }

        if (this.pending.length > 0) {
            this.ensureTimer();
        }

        this.notifySubscribers();
    }

    /**
     * 获取当前累积的原始全文。
     *
     * @remarks
     * 原始文本独立于渲染块保存，用于与 canonical GoalMessage 内容校验一致性。
     *
     * @returns 原始字符串。
     */
    getText(): string {
        return this.rawAccumulatedText;
    }

    /**
     * 获取当前快照。
     *
     * @returns 不可变快照对象。
     */
    getSnapshot(): TranscriptSnapshot {
        return {
            streamId: this.activeStreamId,
            messageId: this.currentMessageId,
            rawText: this.rawAccumulatedText,
            committedBlocks: [...this.committed],
            pendingBlocks: [...this.pending],
            mutableTail: this.tail,
            liveTail: this.pending.join("") + this.tail,
            isStreaming: this.activeStreaming,
        };
    }

    /**
     * 同步提交当前所有未决 pendingBlocks 到 committed 历史。
     *
     * @remarks
     * 取消进行中的提交计时器，立即发布一次快照。用作新消息或步骤到达时的顺序屏障。
     */
    flush(): void {
        if (this.isDisposed) {
            return;
        }
        this.cancelTimer();
        if (this.pending.length > 0) {
            this.committed.push(...this.pending);
            this.pending = [];
            this.notifySubscribers();
        }
    }

    /**
     * 重置内部状态并取消任何待处理定时器。
     *
     * @remarks
     * 用于切换 Goal 或 Session 重新初始化。保留已有订阅者，但使上一代异步流失效。
     */
    reset(): void {
        this.cancelTimer();
        this.generation++;
        this.activeStreamId = null;
        this.currentMessageId = null;
        this.rawAccumulatedText = "";
        this.committed = [];
        this.pending = [];
        this.tail = "";
        this.activeStreaming = false;

        this.notifySubscribers();
    }

    /**
     * 彻底释放控制器，清除所有订阅与定时器。
     *
     * @remarks
     * 释放后任何方法调用均拒绝，杜绝生命周期泄漏或迟到回调。
     */
    dispose(): void {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;
        this.cancelTimer();
        this.generation++;
        this.subscribers.clear();
    }

    /**
     * 订阅 Transcript 快照变更。
     *
     * @param listener - 接收最新快照的回调。
     * @returns 幂等注销监听的回调函数。
     */
    subscribe(listener: (snapshot: TranscriptSnapshot) => void): () => void {
        this.subscribers.add(listener);
        listener(this.getSnapshot());
        return () => {
            this.subscribers.delete(listener);
        };
    }

    private ensureTimer(): void {
        if (this.timerHandle !== null || this.isDisposed || this.pending.length === 0) {
            return;
        }
        const currentGen = this.generation;
        this.timerHandle = this.scheduler.setTimeout(() => {
            this.timerHandle = null;
            this.onTick(currentGen);
        }, 40);
    }

    private cancelTimer(): void {
        if (this.timerHandle !== null) {
            this.scheduler.clearTimeout(this.timerHandle);
            this.timerHandle = null;
        }
    }

    private onTick(expectedGeneration: number): void {
        if (this.isDisposed || this.generation !== expectedGeneration) {
            return;
        }
        if (this.pending.length === 0) {
            return;
        }

        // 自适应批量计算公式：clamp(1, 8, ceil(queueLength / 8))
        const batchSize = Math.min(8, Math.max(1, Math.ceil(this.pending.length / 8)));
        const batch = this.pending.splice(0, batchSize);
        this.committed.push(...batch);

        this.notifySubscribers();

        if (this.pending.length > 0) {
            this.ensureTimer();
        }
    }

    private notifySubscribers(): void {
        if (this.isDisposed || this.subscribers.size === 0) {
            return;
        }
        const snapshot = this.getSnapshot();
        for (const listener of this.subscribers) {
            listener(snapshot);
        }
    }
}
