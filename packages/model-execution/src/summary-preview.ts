/**
 * 完成候选的受限 summary 预览提取。
 *
 * @remarks
 * 该模块只做一件事：从**已确认身份**的完成候选工具参数 JSON 中，读取顶层
 * `summary` 字符串并按解码后的字段值提供有序增量。它不解释 Evidence、Memory
 * Patch 或完成审查内容，不扫描同名嵌套字段，不用正则或表达式猜测缺失字符，
 * 也不把半个参数对象交给业务解码。
 */

/**
 * 完成候选工具身份；只有该工具的顶层 `summary` 允许进入公开预览。
 *
 * @example
 * ```ts
 * if (toolId === COMPLETION_CANDIDATE_TOOL_ID) readPreview(...);
 * ```
 */
export const COMPLETION_CANDIDATE_TOOL_ID = "system_complete_task" as const;

/**
 * 允许公开的候选字段名。
 *
 * @remarks
 * 字段名固定为顶层 `summary`；调用方不能提供任意 JSON 路径绕过过滤。
 *
 * @example
 * ```ts
 * const field: string = SUMMARY_PREVIEW_FIELD;
 * ```
 */
export const SUMMARY_PREVIEW_FIELD = "summary" as const;

/**
 * 单条预览累计公开正文上限（UTF-16 code unit）。
 *
 * @remarks
 * 超限只停止增加公开正文并标记截断：模型继续生成，保存仍使用真实完整正文。
 *
 * @example
 * ```ts
 * const capped = value.slice(0, MAX_SUMMARY_PREVIEW_LENGTH);
 * ```
 */
export const MAX_SUMMARY_PREVIEW_LENGTH = 64_000;

/**
 * 一次预览正文增量。
 *
 * @remarks
 * 增量是**解码后**的字段值片段，不含 JSON 转义；`startOffset` 是该片段在解码后
 * 字段值中的起始位置（UTF-16 code unit）。
 *
 * @example
 * ```ts
 * const increment: SummaryPreviewIncrement = { text: "已完成", startOffset: 0 };
 * ```
 */
export interface SummaryPreviewIncrement {
    /** 解码后的字段值增量。 */
    readonly text: string;
    /** 该增量在解码后字段值中的起始位置。 */
    readonly startOffset: number;
}

/**
 * 一次候选预览的稳定引用与公开内容。
 *
 * @remarks
 * 预览只是进程内的临时观察状态：它始终未确认，既不是正式消息，也不构成完成
 * 证据。`candidateId` 关联同一模型调用与块内的同一次候选。
 *
 * @example
 * ```ts
 * const preview: SummaryPreview = {
 *   candidateId: "candidate-1", modelCallId: "call-1", blockIndex: 0,
 *   text: "已完成", truncated: false, complete: true,
 * };
 * ```
 */
export interface SummaryPreview {
    /** 候选稳定身份；同一调用与块内保持不变。 */
    readonly candidateId: string;
    /** 产生该预览的模型调用身份。 */
    readonly modelCallId: string;
    /** 产生该预览的内容块下标。 */
    readonly blockIndex: number;
    /** 已解码的公开正文；只包含 `summary` 字段值。 */
    readonly text: string;
    /** 公开正文是否因上限被截断。 */
    readonly truncated: boolean;
    /** 字段值是否已完整解析。 */
    readonly complete: boolean;
}

/**
 * 一次完整参数块的预览读取结果。
 *
 * @remarks
 * `matched` 为 `false` 表示该参数对象没有可公开的顶层 `summary`；`ambiguous`
 * 表示同一顶层键重复出现，解析结果不可信。
 *
 * @example
 * ```ts
 * const result = readCompleteSummaryPreview({ toolId: "system_complete_task", argumentsJson });
 * ```
 */
export interface CompleteSummaryPreview {
    /** 是否找到可公开的顶层 `summary` 字段。 */
    readonly matched: boolean;
    /** 解码后的字段值。 */
    readonly text: string;
    /** 公开正文是否因上限被截断。 */
    readonly truncated: boolean;
    /** 字段值是否已完整解析。 */
    readonly complete: boolean;
    /** 顶层键是否重复出现。 */
    readonly ambiguous: boolean;
}

/** 可变的解码文本缓冲；片段内逐字符累积。 */
interface TextBuffer {
    value: string;
}

interface ContainerFrame {
    readonly isObject: boolean;
    expectingKey: boolean;
}

/**
 * 增量参数扫描器：按 JSON 字符串状态解析顶层字段值。
 *
 * @remarks
 * 扫描器跨片段保持状态，正确处理转义、`\uXXXX` 与代理项；它只识别**顶层**
 * 字段，同名嵌套字段不会被当成目标。目标值不是字符串、顶层键重复出现或参数
 * 结构非法时，扫描器停止并报告不可用，不猜测缺失字符。
 *
 * @example
 * ```ts
 * const extractor = new SummaryPreviewExtractor({ toolId: COMPLETION_CANDIDATE_TOOL_ID });
 * for (const fragment of fragments) extractor.accept(fragment);
 * ```
 */
export class SummaryPreviewExtractor {
    private readonly field: string;
    private readonly maxLength: number;
    private readonly stack: ContainerFrame[] = [];
    private inString = false;
    private escaped = false;
    private unicodeRemaining = 0;
    private unicodeDigits = "";
    private stringBuffer = "";
    private stringIsKey = false;
    private pendingTopLevelKey: string | undefined;
    private awaitingTargetValue = false;
    private capturing = false;
    private targetSeen = false;
    private ambiguous = false;
    private aborted = false;
    private complete = false;
    private truncated = false;
    private decoded = "";
    private pendingHighSurrogate = "";

    /**
     * @param options - 工具身份、字段名与公开正文上限。
     */
    constructor(options: {
        readonly toolId: string;
        readonly field?: string;
        readonly maxLength?: number;
    }) {
        this.field = options.field ?? SUMMARY_PREVIEW_FIELD;
        this.maxLength = options.maxLength ?? MAX_SUMMARY_PREVIEW_LENGTH;
    }

    /** 是否已找到可公开的目标字段。 */
    get matched(): boolean {
        return this.targetSeen && !this.aborted && !this.ambiguous;
    }

    /** 顶层键是否重复出现。 */
    get isAmbiguous(): boolean {
        return this.ambiguous;
    }

    /** 目标字段值是否已完整解析。 */
    get isComplete(): boolean {
        return this.complete;
    }

    /** 公开正文是否已截断。 */
    get isTruncated(): boolean {
        return this.truncated;
    }

    /** 当前已解码的公开正文。 */
    get value(): string {
        return this.decoded;
    }

    /**
     * 接收一段参数 JSON 文本，返回本次可公开的解码增量。
     *
     * @remarks
     * 每次调用最多返回一段增量：片段内的解码结果按到达顺序合并，位置由已解码
     * 字段值长度确定。
     *
     * @param fragment - 本次到达的参数文本片段。
     * @returns 解码后的增量；没有可公开内容时返回空数组。
     */
    accept(fragment: string): readonly SummaryPreviewIncrement[] {
        const increments: SummaryPreviewIncrement[] = [];
        // 上次片段末尾留下的代理项高位先补全，再拼接本次解码结果。
        let payload = this.pendingHighSurrogate;
        this.pendingHighSurrogate = "";
        const appended = { value: "" };
        for (const character of fragment) {
            this.consume(character, appended);
            if (this.aborted) break;
        }
        if (appended.value.length > 0 && isHighSurrogate(appended.value.charCodeAt(appended.value.length - 1))) {
            // 代理项高位不单独公开：等待后续片段补全低位。
            this.pendingHighSurrogate = appended.value.slice(-1);
            appended.value = appended.value.slice(0, -1);
        }
        const combined = payload + appended.value;
        const remaining = this.maxLength - this.decoded.length;
        let text = combined;
        if (remaining <= 0) {
            this.truncated = true;
            text = "";
        } else if (combined.length > remaining) {
            this.truncated = true;
            text = combined.slice(0, remaining);
        }
        if (text.length > 0) {
            const startOffset = this.decoded.length;
            this.decoded += text;
            increments.push({ text, startOffset });
        }
        return increments;
    }

    private consume(character: string, payload: TextBuffer): void {
        if (this.inString) {
            this.consumeStringCharacter(character, payload);
            return;
        }
        if (this.awaitingTargetValue && !isJsonWhitespace(character) && character !== '"') {
            // 目标值不是字符串：参数对象不提供可公开的 summary。
            this.aborted = true;
            this.awaitingTargetValue = false;
            return;
        }
        switch (character) {
            case "{":
                this.stack.push({ isObject: true, expectingKey: true });
                return;
            case "[":
                this.stack.push({ isObject: false, expectingKey: false });
                return;
            case "}":
            case "]":
                this.stack.pop();
                return;
            case '"':
                this.startString();
                return;
            case ":":
                this.onColon();
                return;
            case ",":
                this.onComma();
                return;
            default:
                return;
        }
    }

    private startString(): void {
        const frame = this.stack.at(-1);
        const atTopLevel = this.stack.length === 1;
        this.stringIsKey = frame?.isObject === true && frame.expectingKey;
        if (this.stringIsKey) {
            this.stringBuffer = "";
            this.inString = true;
            this.escaped = false;
            this.unicodeRemaining = 0;
            this.unicodeDigits = "";
            return;
        }
        if (this.awaitingTargetValue && atTopLevel) {
            this.capturing = true;
            this.awaitingTargetValue = false;
        } else {
            this.capturing = false;
        }
        this.stringBuffer = "";
        this.inString = true;
        this.escaped = false;
        this.unicodeRemaining = 0;
        this.unicodeDigits = "";
    }

    private onColon(): void {
        const frame = this.stack.at(-1);
        if (frame?.isObject !== true) return;
        frame.expectingKey = false;
        if (this.stack.length !== 1) return;
        if (this.pendingTopLevelKey !== this.field) return;
        if (this.targetSeen) {
            // 同一顶层键重复出现：解析结果歧义，预览必须作废。
            this.ambiguous = true;
            this.awaitingTargetValue = false;
            return;
        }
        this.targetSeen = true;
        this.awaitingTargetValue = true;
    }

    private onComma(): void {
        const frame = this.stack.at(-1);
        if (frame?.isObject === true) frame.expectingKey = true;
        if (this.stack.length === 1) this.pendingTopLevelKey = undefined;
    }

    private consumeStringCharacter(character: string, payload: TextBuffer): void {
        if (this.unicodeRemaining > 0) {
            if (!isHexDigit(character)) {
                this.aborted = true;
                return;
            }
            this.unicodeDigits += character;
            this.unicodeRemaining -= 1;
            if (this.unicodeRemaining > 0) return;
            this.appendDecoded(String.fromCharCode(Number.parseInt(this.unicodeDigits, 16)), payload);
            this.unicodeDigits = "";
            return;
        }
        if (this.escaped) {
            this.escaped = false;
            switch (character) {
                case '"':
                case "\\":
                case "/":
                    this.appendDecoded(character, payload);
                    return;
                case "b":
                    this.appendDecoded("\b", payload);
                    return;
                case "f":
                    this.appendDecoded("\f", payload);
                    return;
                case "n":
                    this.appendDecoded("\n", payload);
                    return;
                case "r":
                    this.appendDecoded("\r", payload);
                    return;
                case "t":
                    this.appendDecoded("\t", payload);
                    return;
                case "u":
                    this.unicodeRemaining = 4;
                    this.unicodeDigits = "";
                    return;
                default:
                    this.aborted = true;
                    return;
            }
        }
        if (character === "\\") {
            this.escaped = true;
            return;
        }
        if (character === '"') {
            this.inString = false;
            this.finishString();
            return;
        }
        this.appendDecoded(character, payload);
    }

    private finishString(): void {
        if (this.stringIsKey) {
            if (this.stack.length === 1) this.pendingTopLevelKey = this.stringBuffer;
            this.stringIsKey = false;
            this.stringBuffer = "";
            return;
        }
        if (this.capturing) {
            this.capturing = false;
            this.complete = true;
        }
        this.stringBuffer = "";
    }

    private appendDecoded(text: string, payload: TextBuffer): void {
        if (!this.capturing) {
            this.stringBuffer += text;
            return;
        }
        payload.value += text;
    }
}

/**
 * 从完整参数 JSON 中读取可公开的顶层 `summary` 字段值。
 *
 * @remarks
 * 整块参数走同一条解析路径：不使用正则，不扫描同名嵌套字段，也不把整个参数
 * 对象交给调用方。目标值不是字符串或顶层键重复出现时返回不可用结果。
 *
 * @param options - 工具身份、参数 JSON 文本与可选上限。
 * @returns 预览读取结果。
 * @example
 * ```ts
 * const result = readCompleteSummaryPreview({ toolId: COMPLETION_CANDIDATE_TOOL_ID, argumentsJson: "{}" });
 * ```
 */
export function readCompleteSummaryPreview(options: {
    readonly toolId: string;
    readonly argumentsJson: string;
    readonly field?: string;
    readonly maxLength?: number;
}): CompleteSummaryPreview {
    const extractor = new SummaryPreviewExtractor({
        toolId: options.toolId,
        ...(options.field === undefined ? {} : { field: options.field }),
        ...(options.maxLength === undefined ? {} : { maxLength: options.maxLength }),
    });
    extractor.accept(options.argumentsJson);
    return {
        matched: extractor.matched,
        text: extractor.value,
        truncated: extractor.isTruncated,
        complete: extractor.isComplete,
        ambiguous: extractor.isAmbiguous,
    };
}

/**
 * 判断该工具身份是否允许公开 summary 预览。
 *
 * @param toolId - 已确认的工具身份。
 * @returns 是否为完成候选工具。
 * @example
 * ```ts
 * if (isCompletionCandidateTool(toolId)) readPreview();
 * ```
 */
export function isCompletionCandidateTool(toolId: string): boolean {
    return toolId === COMPLETION_CANDIDATE_TOOL_ID;
}

function isJsonWhitespace(character: string): boolean {
    return character === " " || character === "\t" || character === "\n" || character === "\r";
}

function isHexDigit(character: string): boolean {
    return /^[0-9a-fA-F]$/.test(character);
}

function isHighSurrogate(codeUnit: number): boolean {
    return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}
