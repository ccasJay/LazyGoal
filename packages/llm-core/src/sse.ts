/**
 * 一个已分帧的 Server-Sent Events 消息。
 *
 * @remarks
 * `data` 是多行 `data:` 字段以换行连接后的原始内容，不做 JSON 解析。
 * `event` 与 `id` 只在供应商显式发送对应字段时出现。
 *
 * @example
 * ```ts
 * const event: ServerSentEvent = { data: '{"id":"chatcmpl-1"}' };
 * ```
 */
export interface ServerSentEvent {
    /** 供应商声明的消息类型；省略时按 `message` 处理。 */
    readonly event?: string;
    /** 原始数据正文；可能是不完整 JSON 分片。 */
    readonly data: string;
    /** 供应商声明的消息标识；省略时继承上一条消息的标识。 */
    readonly id?: string;
}

/**
 * 增量 Server-Sent Events 分帧器。
 *
 * @remarks
 * 只负责字节流到事件的切分：按空行派发消息、合并多行 `data:`、忽略注释行与未知字段。
 * 分片边界可以落在任意字符位置；未完成的最后一行保留到下一次 `push`。
 * 流结束时调用 `finish()` 以派发挂起消息。
 *
 * @example
 * ```ts
 * const decoder = new ServerSentEventDecoder();
 * const events = [...decoder.push('data: {"a":1}\n\n'), ...decoder.finish()];
 * ```
 */
export class ServerSentEventDecoder {
    private buffer = "";
    private event: string | undefined;
    private id: string | undefined;
    private readonly dataLines: string[] = [];

    /**
     * @param chunk - 任意边界的文本分片。
     * @returns 本次分片内完成的完整事件，按到达顺序排列。
     */
    push(chunk: string): readonly ServerSentEvent[] {
        if (chunk.length === 0) return [];
        this.buffer += chunk;
        return this.drain(this.buffer.length, false);
    }

    /**
     * 结束流并派发挂起消息。
     *
     * @returns 尚未以空行结束的最后一条消息；没有挂起内容时返回空数组。
     */
    finish(): readonly ServerSentEvent[] {
        const events = this.drain(this.buffer.length, true);
        if (this.buffer.length > 0) {
            const line = this.buffer;
            this.buffer = "";
            this.consumeLine(line, events);
        }
        this.dispatch(events);
        return events;
    }

    private drain(limit: number, atEnd: boolean): ServerSentEvent[] {
        const events: ServerSentEvent[] = [];
        let cursor = 0;
        while (cursor < limit) {
            const newline = this.indexOfLineBreak(cursor, limit, atEnd);
            if (newline === undefined) break;
            const line = this.buffer.slice(cursor, newline.start);
            cursor = newline.next;
            this.consumeLine(line, events);
        }
        this.buffer = this.buffer.slice(cursor);
        return events;
    }

    private indexOfLineBreak(
        from: number,
        limit: number,
        atEnd: boolean,
    ): { readonly start: number; readonly next: number } | undefined {
        const cr = this.buffer.indexOf("\r", from);
        const lf = this.buffer.indexOf("\n", from);
        if (cr === -1 && lf === -1) return undefined;
        if (cr === -1 || (lf !== -1 && lf < cr)) return { start: lf, next: lf + 1 };
        if (cr + 1 >= limit) {
            // CR 位于本次可读范围的末尾：可能属于被分片截断的 CRLF。
            if (atEnd) return { start: cr, next: cr + 1 };
            return undefined;
        }
        return { start: cr, next: this.buffer[cr + 1] === "\n" ? cr + 2 : cr + 1 };
    }

    private consumeLine(line: string, events: ServerSentEvent[]): void {
        if (line.length === 0) {
            this.dispatch(events);
            return;
        }
        if (line.startsWith(":")) return;
        const separator = line.indexOf(":");
        const field = separator === -1 ? line : line.slice(0, separator);
        let value = separator === -1 ? "" : line.slice(separator + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        switch (field) {
            case "data":
                this.dataLines.push(value);
                break;
            case "event":
                this.event = value;
                break;
            case "id":
                if (!value.includes("\0")) this.id = value;
                break;
            default:
                break;
        }
    }

    private dispatch(events: ServerSentEvent[]): void {
        if (this.dataLines.length > 0) {
            events.push({
                ...(this.event === undefined ? {} : { event: this.event }),
                data: this.dataLines.join("\n"),
                ...(this.id === undefined ? {} : { id: this.id }),
            });
        }
        this.event = undefined;
        this.id = undefined;
        this.dataLines.length = 0;
    }
}

/**
 * 把字节或文本流转换为有序 Server-Sent Events。
 *
 * @param source - 供应商响应体分片；字节按 UTF-8 增量解码。
 * @returns 逐条到达的事件；流结束时自动派发未闭合消息。
 *
 * @example
 * ```ts
 * for await (const event of readServerSentEvents(responseBody)) {
 *     console.log(event.data);
 * }
 * ```
 */
export async function* readServerSentEvents(
    source: AsyncIterable<Uint8Array | string>,
): AsyncGenerator<ServerSentEvent> {
    const decoder = new ServerSentEventDecoder();
    const textDecoder = new TextDecoder("utf-8");
    for await (const chunk of source) {
        const text = typeof chunk === "string" ? chunk : textDecoder.decode(chunk, { stream: true });
        for (const event of decoder.push(text)) yield event;
    }
    const tail = textDecoder.decode();
    for (const event of decoder.push(tail)) yield event;
    for (const event of decoder.finish()) yield event;
}
