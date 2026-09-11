import type { AnyMessage, Stream as AcpStream } from "@agentclientprotocol/sdk";

/** 外层 Mux 帧支持的协议版本。 */
export const MUX_PROTOCOL_VERSION = 1 as const;
/** 单帧（含换行）的最大 UTF-8 字节数。 */
export const MAX_MUX_FRAME_BYTES = 16 * 1024 * 1024;
/** 每个通道默认允许排队的最大 UTF-8 字节数。 */
export const DEFAULT_MUX_QUEUE_BYTES = 16 * 1024 * 1024;

export type MuxChannel = "acp" | "llm" | "tools";

/** 复用传输上的版本化对象帧。 */
export interface MuxFrame {
    readonly version: typeof MUX_PROTOCOL_VERSION;
    readonly channel: MuxChannel;
    readonly sequence: number;
    readonly payload: Record<string, unknown>;
}

/** 可供 ACP SDK 或内部 LLM RPC 使用的对象级 Mux 端口。 */
export interface MuxChannelStream<T extends Record<string, unknown> = Record<string, unknown>> {
    readonly readable: ReadableStream<T>;
    readonly writable: WritableStream<T>;
}

/** Mux 协议帧或传输状态错误。 */
export class MuxProtocolError extends Error {
    readonly code: "invalid_frame" | "invalid_sequence" | "frame_too_large" | "transport_closed" | "queue_overflow";

    constructor(code: MuxProtocolError["code"], message: string) {
        super(message);
        this.name = "MuxProtocolError";
        this.code = code;
    }
}

/**
 * 将一个对象帧编码成单行 UTF-8 NDJSON。
 *
 * @param frame - 待编码的版本、通道、序号和对象 payload。
 * @param maxBytes - 可选的单帧上限，默认 16 MiB。
 * @returns 包含结尾换行的 UTF-8 字节。
 * @throws 帧字段非法、JSON 不可编码或超过字节上限时抛出 `MuxProtocolError`。
 *
 * @example
 * ```ts
 * const line = encodeMuxFrame({ version: 1, channel: "acp", sequence: 1, payload: { jsonrpc: "2.0" } });
 * ```
 */
export function encodeMuxFrame(frame: MuxFrame, maxBytes = MAX_MUX_FRAME_BYTES): Uint8Array {
    validateFrame(frame);
    let line: string;
    try {
        line = JSON.stringify(frame);
    } catch (error) {
        throw new MuxProtocolError("invalid_frame", `Mux payload is not JSON serializable: ${errorMessage(error)}`);
    }
    const bytes = new TextEncoder().encode(`${line}\n`);
    if (bytes.byteLength > maxBytes) {
        throw new MuxProtocolError("frame_too_large", `Mux frame exceeds ${maxBytes} bytes`);
    }
    return bytes;
}

/**
 * 将一行 JSON 解码为 Mux 帧并校验字段。
 *
 * @param line - 不含结尾换行的 UTF-8 文本。
 * @param expectedSequence - 当前方向期望的下一个序号。
 * @param maxBytes - 可选的帧上限。
 * @returns 校验后的帧。
 * @throws 非法 JSON、未知通道、重复/跳号或超限时抛出协议错误。
 */
export function decodeMuxFrame(
    line: string,
    expectedSequence: number,
    maxBytes = MAX_MUX_FRAME_BYTES,
): MuxFrame {
    const bytes = new TextEncoder().encode(`${line}\n`);
    if (bytes.byteLength > maxBytes) throw new MuxProtocolError("frame_too_large", `Mux frame exceeds ${maxBytes} bytes`);
    let value: unknown;
    try {
        value = JSON.parse(line);
    } catch (error) {
        throw new MuxProtocolError("invalid_frame", `Invalid Mux JSON: ${errorMessage(error)}`);
    }
    if (!isRecord(value)) throw new MuxProtocolError("invalid_frame", "Mux frame must be a JSON object");
    const frame = value as Partial<MuxFrame>;
    validateFrame(frame);
    if (frame.sequence !== expectedSequence) {
        throw new MuxProtocolError("invalid_sequence", `Expected sequence ${expectedSequence}, received ${frame.sequence}`);
    }
    return {
        version: MUX_PROTOCOL_VERSION,
        channel: frame.channel as MuxChannel,
        sequence: frame.sequence as number,
        payload: frame.payload as Record<string, unknown>,
    };
}

/**
 * 支持任意 chunk 边界的增量 NDJSON 解码器。
 *
 * @example
 * ```ts
 * const decoder = new MuxFrameDecoder();
 * decoder.push(new Uint8Array([/* arbitrary chunk *\/]))
 * ```
 */
export class MuxFrameDecoder {
    private readonly decoder = new TextDecoder("utf-8", { fatal: true });
    private buffered = "";
    private expectedSequence = 1;
    private readonly maxBytes: number;

    constructor(maxBytes = MAX_MUX_FRAME_BYTES) {
        if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new RangeError("maxBytes must be a positive safe integer");
        this.maxBytes = maxBytes;
    }

    /** 推入任意字节 chunk，并返回其中完整的帧。 */
    push(chunk: Uint8Array): MuxFrame[] {
        let text: string;
        try {
            text = this.decoder.decode(chunk, { stream: true });
        } catch (error) {
            throw new MuxProtocolError("invalid_frame", `Mux input is not valid UTF-8: ${errorMessage(error)}`);
        }
        this.buffered += text;
        if (new TextEncoder().encode(this.buffered).byteLength > this.maxBytes && !this.buffered.includes("\n")) {
            throw new MuxProtocolError("frame_too_large", `Mux frame exceeds ${this.maxBytes} bytes`);
        }
        const frames: MuxFrame[] = [];
        let newline: number;
        while ((newline = this.buffered.indexOf("\n")) >= 0) {
            const line = this.buffered.slice(0, newline).replace(/\r$/, "");
            this.buffered = this.buffered.slice(newline + 1);
            if (line.length === 0) throw new MuxProtocolError("invalid_frame", "Mux frame cannot be empty");
            const frame = decodeMuxFrame(line, this.expectedSequence, this.maxBytes);
            this.expectedSequence += 1;
            frames.push(frame);
        }
        if (new TextEncoder().encode(this.buffered).byteLength > this.maxBytes) {
            throw new MuxProtocolError("frame_too_large", `Mux frame exceeds ${this.maxBytes} bytes`);
        }
        return frames;
    }

    /** 结束输入；不完整的最后一帧会被拒绝。 */
    finish(): void {
        try {
            const text = this.decoder.decode();
            this.buffered += text;
        } catch (error) {
            throw new MuxProtocolError("invalid_frame", `Mux input is not valid UTF-8: ${errorMessage(error)}`);
        }
        if (this.buffered.length > 0) throw new MuxProtocolError("invalid_frame", "Mux input ended with a partial frame");
    }
}

interface PendingWrite {
    readonly bytes: Uint8Array;
    readonly resolve: () => void;
    readonly reject: (error: unknown) => void;
}

export interface MultiplexedConnectionOptions {
    readonly input: ReadableStream<Uint8Array>;
    readonly output: WritableStream<Uint8Array>;
    readonly maxFrameBytes?: number;
    readonly maxQueueBytes?: number;
}

/**
 * Mux 的唯一字节流拥有者。
 *
 * @remarks
 * 输入方向用全局单调 sequence 保持顺序，输出方向由一个 writer 轮转消费
 * `acp`/`llm` 两个有界队列；每次 writer.write 都写入完整帧，因此两个通道的
 * 字节不会交错。非法输入会让两个对象流同时失败，并拒绝全部待发送帧。
 *
 * @example
 * ```ts
 * const mux = new MultiplexedConnection({ input: stdin, output: stdout });
 * const acp = mux.channel<AnyMessage>("acp");
 * ```
 */
export class MultiplexedConnection {
    readonly closed: Promise<void>;
    failure: MuxProtocolError | undefined;

    private readonly input: ReadableStream<Uint8Array>;
    private readonly output: WritableStream<Uint8Array>;
    private readonly maxFrameBytes: number;
    private readonly maxQueueBytes: number;
    private readonly writer: WritableStreamDefaultWriter<Uint8Array>;
    private readonly queues: Record<MuxChannel, PendingWrite[]> = { acp: [], llm: [], tools: [] };
    private readonly queueBytes: Record<MuxChannel, number> = { acp: 0, llm: 0, tools: 0 };
    private readonly controllers = new Map<MuxChannel, Set<ReadableStreamDefaultController<Record<string, unknown>>>>();
    private readonly channelClosed: Record<MuxChannel, boolean> = { acp: false, llm: false, tools: false };
    private outputSequence = 1;
    private roundRobin: MuxChannel = "acp";
    private writing = false;
    private closedState = false;
    private resolveClosed!: () => void;
    private reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    constructor(options: MultiplexedConnectionOptions) {
        this.input = options.input;
        this.output = options.output;
        this.maxFrameBytes = options.maxFrameBytes ?? MAX_MUX_FRAME_BYTES;
        this.maxQueueBytes = options.maxQueueBytes ?? DEFAULT_MUX_QUEUE_BYTES;
        if (!Number.isSafeInteger(this.maxQueueBytes) || this.maxQueueBytes <= 0) throw new RangeError("maxQueueBytes must be positive");
        this.writer = this.output.getWriter();
        this.closed = new Promise<void>((resolve) => { this.resolveClosed = resolve; });
        void this.readLoop();
    }

    /** 获得一个对象级通道；ACP SDK 可以直接消费 `acp` 端口。 */
    channel<T extends Record<string, unknown> = Record<string, unknown>>(channel: MuxChannel): MuxChannelStream<T> {
        if (this.closedState) throw new MuxProtocolError("transport_closed", "Mux connection is closed");
        let readableController: ReadableStreamDefaultController<Record<string, unknown>> | undefined;
        const actualReadable = new ReadableStream<Record<string, unknown>>({
            start: (controller) => {
                readableController = controller;
                const set = this.controllers.get(channel) ?? new Set();
                set.add(controller);
                this.controllers.set(channel, set);
            },
            cancel: () => {
                if (readableController !== undefined) this.removeController(channel, readableController);
            },
        }) as ReadableStream<T>;
        const writable = new WritableStream<T>({
            write: (payload) => this.send(channel, payload),
            close: () => { this.channelClosed[channel] = true; },
        });
        return { readable: actualReadable, writable };
    }

    /** 发送一个对象 payload，队列达到上限时拒绝本次写入。 */
    send(channel: MuxChannel, payload: Record<string, unknown>): Promise<void> {
        if (this.closedState) return Promise.reject(this.failure ?? new MuxProtocolError("transport_closed", "Mux connection is closed"));
        if (!isRecord(payload)) return Promise.reject(new MuxProtocolError("invalid_frame", "Mux payload must be an object"));
        const bytes = encodeMuxFrame({ version: MUX_PROTOCOL_VERSION, channel, sequence: this.outputSequence++, payload }, this.maxFrameBytes);
        if (this.queueBytes[channel] + bytes.byteLength > this.maxQueueBytes) {
            this.outputSequence -= 1;
            return Promise.reject(new MuxProtocolError("queue_overflow", `${channel} queue exceeds ${this.maxQueueBytes} bytes`));
        }
        return new Promise<void>((resolve, reject) => {
            this.queues[channel].push({ bytes, resolve, reject });
            this.queueBytes[channel] += bytes.byteLength;
            this.scheduleWrite();
        });
    }

    /** 关闭连接并结束两个对象流；重复调用幂等。 */
    async close(error?: unknown): Promise<void> {
        if (!this.closedState) this.fail(error instanceof MuxProtocolError ? error : undefined, error);
        await this.closed;
    }

    private async readLoop(): Promise<void> {
        const decoder = new MuxFrameDecoder(this.maxFrameBytes);
        try {
            this.reader = this.input.getReader();
            while (true) {
                const next = await this.reader.read();
                if (next.done) break;
                for (const frame of decoder.push(next.value)) this.enqueueIncoming(frame);
            }
            decoder.finish();
            if (!this.closedState) this.fail(undefined, undefined);
        } catch (error) {
            if (!this.closedState) {
                const protocol = error instanceof MuxProtocolError
                    ? error
                    : new MuxProtocolError("transport_closed", errorMessage(error));
                this.fail(protocol, error);
            }
        }
    }

    private enqueueIncoming(frame: MuxFrame): void {
        const set = this.controllers.get(frame.channel);
        if (set === undefined || set.size === 0) return;
        for (const controller of set) controller.enqueue(frame.payload);
    }

    private scheduleWrite(): void {
        if (this.writing || this.closedState) return;
        this.writing = true;
        void this.drainWrites().finally(() => {
            this.writing = false;
            if (!this.closedState && (this.queues.acp.length > 0 || this.queues.llm.length > 0 || this.queues.tools.length > 0)) this.scheduleWrite();
        });
    }

    private async drainWrites(): Promise<void> {
        const channels: readonly MuxChannel[] = ["acp", "llm", "tools"];
        while (!this.closedState && (this.queues.acp.length > 0 || this.queues.llm.length > 0 || this.queues.tools.length > 0)) {
            let selected: MuxChannel | undefined;
            const startIdx = channels.indexOf(this.roundRobin);
            for (let i = 0; i < channels.length; i++) {
                const ch = channels[(startIdx + i) % channels.length]!;
                if (this.queues[ch].length > 0) {
                    selected = ch;
                    break;
                }
            }
            if (selected === undefined) continue;
            this.roundRobin = channels[(channels.indexOf(selected) + 1) % channels.length]!;
            const item = this.queues[selected].shift();
            if (item === undefined) continue;
            this.queueBytes[selected] -= item.bytes.byteLength;
            try {
                await this.writer.ready;
                await this.writer.write(item.bytes);
                item.resolve();
            } catch (error) {
                item.reject(error);
                this.fail(new MuxProtocolError("transport_closed", errorMessage(error)), error);
                return;
            }
        }
    }

    private fail(protocol: MuxProtocolError | undefined, reason: unknown): void {
        if (this.closedState) return;
        this.closedState = true;
        this.failure = protocol;
        const error = reason ?? protocol;
        for (const channel of ["acp", "llm", "tools"] as const) {
            for (const item of this.queues[channel]) item.reject(error ?? new MuxProtocolError("transport_closed", "Mux connection closed"));
            this.queues[channel].length = 0;
            this.queueBytes[channel] = 0;
            for (const controller of this.controllers.get(channel) ?? []) {
                if (error === undefined) controller.close();
                else controller.error(error);
            }
        }
        this.reader?.cancel().catch(() => undefined);
        this.writer.abort(error).catch(() => undefined);
        this.resolveClosed();
    }

    private removeController(channel: MuxChannel, controller: ReadableStreamDefaultController<Record<string, unknown>> | undefined): void {
        if (controller === undefined) return;
        this.controllers.get(channel)?.delete(controller);
    }
}

/** 便捷地把 ACP 通道投影为官方 SDK Stream。 */
export function createAcpMuxStream(connection: MultiplexedConnection): AcpStream {
    return connection.channel<AnyMessage>("acp") as AcpStream;
}

function validateFrame(frame: Partial<MuxFrame>): void {
    if (frame.version !== MUX_PROTOCOL_VERSION) throw new MuxProtocolError("invalid_frame", "Unknown Mux protocol version");
    if (frame.channel !== "acp" && frame.channel !== "llm" && frame.channel !== "tools") throw new MuxProtocolError("invalid_frame", "Unknown Mux channel");
    const sequence = frame.sequence;
    if (!Number.isSafeInteger(sequence) || sequence === undefined || sequence <= 0) throw new MuxProtocolError("invalid_frame", "Mux sequence must be a positive safe integer");
    if (!isRecord(frame.payload)) throw new MuxProtocolError("invalid_frame", "Mux payload must be an object");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
