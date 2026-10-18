/**
 * 内容块流的无 I/O 组装与契约核验。
 *
 * @remarks
 * 追踪器只消费 {@link LLMStreamEvent}，校验块的开始、增量、完整结束与唯一成功
 * 完成，并在结束时把已封口块与最终响应逐项比对。已发布增量的块要求结束内容与
 * 累计增量一致；未发布增量的块按整块到达处理。它不读取 Goal 或 Store、不调用
 * 供应商、不发布事件，也不把部分块当作可执行结果。
 */

import type {
    LLMContentBlock,
    LLMContentDeltaKind,
    LLMContentDelivery,
    LLMResponse,
    LLMStreamEvent,
    LLMTextBlockFormat,
} from "./types";

/**
 * 流式块协议违规。
 *
 * @remarks
 * 未知块索引、重复开始／结束、增量类型或交付方式冲突、块结束后继续追加、
 * 缺失或重复的成功完成，以及最终响应与已封口块不一致时抛出。
 *
 * @example
 * ```ts
 * try {
 *     tracker.accept(event);
 * } catch (error) {
 *     if (error instanceof LLMStreamProtocolError) throw error;
 * }
 * ```
 */
export class LLMStreamProtocolError extends Error {
    readonly code = "LLM_STREAM_PROTOCOL_ERROR";

    constructor(message: string) {
        super(message);
        this.name = "LLMStreamProtocolError";
    }
}

/**
 * 一次内容块流的契约核验状态。
 *
 * @example
 * ```ts
 * const tracker = createContentBlockStreamTracker();
 * for await (const event of stream) tracker.accept(event);
 * const response = tracker.result();
 * ```
 */
export interface ContentBlockStreamTracker {
    /**
     * 接收一个流事件并核验其块序列合法。
     *
     * @param event - Adapter 按顺序产生的逻辑事件。
     * @throws {@link LLMStreamProtocolError} 序列违反块生命周期或成功边界时抛出。
     */
    accept(event: LLMStreamEvent): void;

    /**
     * 结束消费并返回本次调用的完整响应。
     *
     * @returns 成功完成事件携带的完整响应；其块与已封口块逐项一致。
     * @throws {@link LLMStreamProtocolError} 缺少唯一成功完成、仍有未封口块，
     *   或最终响应的索引、类型与内容同已封口块不一致时抛出。
     */
    result(): LLMResponse;
}

interface TrackedBlock {
    readonly index: number;
    readonly blockType: LLMContentBlock["type"];
    readonly delivery: LLMContentDelivery;
    readonly format: LLMTextBlockFormat | undefined;
    readonly deltaKind: LLMContentDeltaKind;
    deltaText: string;
    sealed: LLMContentBlock | undefined;
}

const DELTA_KIND_BY_BLOCK: Record<LLMContentBlock["type"], LLMContentDeltaKind> = {
    text: "text",
    reasoning: "reasoning",
    tool_call: "tool_arguments",
};

/** 创建一次调用的内容块流追踪器。 */
export function createContentBlockStreamTracker(): ContentBlockStreamTracker {
    return new Tracker();
}

class Tracker implements ContentBlockStreamTracker {
    private readonly blocks: TrackedBlock[] = [];
    private response: LLMResponse | undefined;

    accept(event: LLMStreamEvent): void {
        if (this.response !== undefined) {
            throw new LLMStreamProtocolError("LLM stream produced an event after the completed response");
        }
        switch (event.kind) {
            case "started":
                return;
            case "content_block_started": {
                if (event.index !== this.blocks.length) {
                    throw new LLMStreamProtocolError(
                        `LLM stream started block ${event.index} out of order; expected ${this.blocks.length}`,
                    );
                }
                if (event.blockType !== "text" && event.format !== undefined) {
                    throw new LLMStreamProtocolError("LLM stream attached a text format to a non-text block");
                }
                this.blocks.push({
                    index: event.index,
                    blockType: event.blockType,
                    delivery: event.delivery,
                    format: event.format,
                    deltaKind: DELTA_KIND_BY_BLOCK[event.blockType],
                    deltaText: "",
                    sealed: undefined,
                });
                return;
            }
            case "content_block_delta": {
                const block = this.requireOpenBlock(event.index, "delta");
                if (block.delivery !== "incremental") {
                    throw new LLMStreamProtocolError(`LLM stream delivered a whole block ${event.index} incrementally`);
                }
                if (event.deltaKind !== block.deltaKind) {
                    throw new LLMStreamProtocolError(
                        `LLM stream delta kind "${event.deltaKind}" does not match block ${event.index} type "${block.blockType}"`,
                    );
                }
                block.deltaText += event.delta;
                return;
            }
            case "content_block_completed": {
                const block = this.requireOpenBlock(event.block.index, "completion");
                if (event.block.type !== block.blockType) {
                    throw new LLMStreamProtocolError(
                        `LLM stream completed block ${event.block.index} as "${event.block.type}" instead of "${block.blockType}"`,
                    );
                }
                if (event.delivery !== block.delivery) {
                    throw new LLMStreamProtocolError(
                        `LLM stream completed block ${event.block.index} with a different delivery`,
                    );
                }
                if (block.delivery === "incremental" && block.deltaText.length > 0
                    && block.deltaText !== blockText(event.block)) {
                    throw new LLMStreamProtocolError(
                        `LLM stream rewrote the ended block ${event.block.index}`,
                    );
                }
                block.sealed = event.block;
                return;
            }
            case "completed": {
                if (this.response !== undefined) {
                    throw new LLMStreamProtocolError("LLM stream produced multiple completed responses");
                }
                this.response = event.response;
                return;
            }
        }
    }

    result(): LLMResponse {
        if (this.response === undefined) {
            throw new LLMStreamProtocolError("LLM stream ended without a completed response");
        }
        const unsealed = this.blocks.find(block => block.sealed === undefined);
        if (unsealed !== undefined) {
            throw new LLMStreamProtocolError(`LLM stream ended with an unfinished block ${unsealed.index}`);
        }
        const responseBlocks = this.response.blocks;
        if (responseBlocks.length !== this.blocks.length) {
            throw new LLMStreamProtocolError("Completed response does not contain every streamed block");
        }
        for (let position = 0; position < this.blocks.length; position += 1) {
            const tracked = this.blocks[position]!;
            const actual = responseBlocks[position]!;
            const sealed = tracked.sealed!;
            if (actual.index !== tracked.index || actual.type !== tracked.blockType
                || !sameBlock(actual, sealed)) {
                throw new LLMStreamProtocolError(
                    `Completed response block ${position} does not match the ended stream block`,
                );
            }
        }
        return this.response;
    }

    private requireOpenBlock(index: number, action: string): TrackedBlock {
        const block = this.blocks[index];
        if (block === undefined || block.index !== index) {
            throw new LLMStreamProtocolError(`LLM stream referenced unknown block index ${index} before ${action}`);
        }
        if (block.sealed !== undefined) {
            throw new LLMStreamProtocolError(`LLM stream appended after block ${index} ended`);
        }
        return block;
    }
}

function blockText(block: LLMContentBlock): string {
    return block.type === "tool_call" ? block.argumentsJson : block.text;
}

/** 按块语义逐项比较；不比较对象键顺序。 */
function sameBlock(left: LLMContentBlock, right: LLMContentBlock): boolean {
    if (left.index !== right.index || left.type !== right.type) return false;
    if (left.type === "text" && right.type === "text") {
        return left.format === right.format && left.text === right.text;
    }
    if (left.type === "reasoning" && right.type === "reasoning") return left.text === right.text;
    if (left.type === "tool_call" && right.type === "tool_call") {
        return left.callId === right.callId && left.toolId === right.toolId
            && left.argumentsJson === right.argumentsJson;
    }
    return false;
}
