/**
 * Markdown 稳定 Block 收集结果。
 */
export interface MarkdownBlockCollectionResult {
    /** 已达到结构稳定条件的完整 Markdown Block 列表。 */
    readonly stableBlocks: readonly string[];
    /** 尚未稳定、需保留在动态尾部的剩余原始内容。 */
    readonly remainingTail: string;
}

/**
 * 判断一行是否为表格分隔行。
 *
 * 语法格式形如：`| :--- | :---: | ---: |` 或 `--- | ---`。
 */
function isTableDelimiterLine(content: string): boolean {
    const trimmed = content.trim();
    if (!trimmed.includes("-")) {
        return false;
    }
    const cellPattern = /^[ \t]*:?-{1,}:?[ \t]*$/;
    const parts = trimmed.split("|");
    const startIdx = parts[0]?.trim() === "" ? 1 : 0;
    const endIdx = parts[parts.length - 1]?.trim() === "" ? parts.length - 1 : parts.length;
    const cells = parts.slice(startIdx, endIdx);
    if (cells.length === 0) {
        return false;
    }
    return cells.every(cell => cellPattern.test(cell));
}

/**
 * 扫描文本并保守提取结构已稳定的 Markdown Block。
 *
 * @remarks
 * 保守收集策略遵循以下原则：
 * 1. 任意未闭合围栏代码块（``` 或 ~~~）在出现闭合行前保留在尾部；闭合行换行后立即稳定；
 * 2. 表格表头在下一行分隔行确定前不提前提交；表格体在遇到空行终止前持续保留在尾部；
 * 3. 普通段落、列表、引用在遇到终止空行前保留在尾部，以避免被后续 Setext 下划线或表格分隔行改变语义；
 * 4. 任意块间空行自然归入相邻块，绝不丢失任何字符；
 * 5. 当 `isCompleted` 为 true 时，将尾部所有剩余内容按最终边界收束为稳定 Block；
 * 6. 所有 stableBlocks 拼接 remainingTail 严格等于输入文本，且对任意 delta 分块输入产生等价 Block 顺序。
 *
 * @param text - 当前累积的未提交文本缓冲。
 * @param isCompleted - 当前流是否已结束。
 * @returns 稳定 Block 数组与剩余尾部。
 *
 * @example
 * ```ts
 * const result = collectMarkdownBlocks("# Header\n\nBody line.\n\n", false);
 * console.log(result.stableBlocks);
 * ```
 */
export function collectMarkdownBlocks(
    text: string,
    isCompleted: boolean,
): MarkdownBlockCollectionResult {
    if (text.length === 0) {
        return { stableBlocks: [], remainingTail: "" };
    }

    interface LineSlice {
        readonly line: string;
        readonly content: string;
        readonly hasNewline: boolean;
        readonly start: number;
        readonly end: number;
    }

    const lines: LineSlice[] = [];
    let lineStart = 0;
    while (lineStart < text.length) {
        const newlineIdx = text.indexOf("\n", lineStart);
        if (newlineIdx === -1) {
            const raw = text.slice(lineStart);
            lines.push({
                line: raw,
                content: raw.replace(/\r$/, ""),
                hasNewline: false,
                start: lineStart,
                end: text.length,
            });
            break;
        } else {
            const raw = text.slice(lineStart, newlineIdx + 1);
            lines.push({
                line: raw,
                content: raw.replace(/\r?\n$/, ""),
                hasNewline: true,
                start: lineStart,
                end: newlineIdx + 1,
            });
            lineStart = newlineIdx + 1;
        }
    }

    const stableBlocks: string[] = [];
    let currentLineIdx = 0;

    while (currentLineIdx < lines.length) {
        // 计算前导空行
        let contentLineIdx = currentLineIdx;
        while (contentLineIdx < lines.length && /^[ \t]*$/.test(lines[contentLineIdx]!.content)) {
            if (!lines[contentLineIdx]!.hasNewline && !isCompleted) {
                break;
            }
            contentLineIdx++;
        }

        // 如果全部剩余行都是空行
        if (contentLineIdx >= lines.length) {
            break;
        }

        if (
            contentLineIdx > currentLineIdx &&
            !lines[contentLineIdx - 1]!.hasNewline &&
            !isCompleted
        ) {
            break;
        }

        const blockStart = lines[currentLineIdx]!.start;
        const firstContentLine = lines[contentLineIdx]!;

        // 1. 内容首行若无换行且未结束，保留在尾部
        if (!firstContentLine.hasNewline && !isCompleted) {
            break;
        }

        // 2. 检查围栏代码块（Fenced Code Block）
        const fenceMatch = /^[ ]{0,3}(`{3,}|~{3,})(.*)$/.exec(firstContentLine.content);
        if (fenceMatch) {
            const fenceChar = fenceMatch[1]![0]!;
            const fenceLen = fenceMatch[1]!.length;
            let closedLineIdx = -1;

            for (let i = contentLineIdx + 1; i < lines.length; i++) {
                const candLine = lines[i]!;
                const closeMatch = new RegExp(`^[ ]{0,3}${fenceChar}{${fenceLen},}[ \\t]*$`).exec(candLine.content);
                if (closeMatch) {
                    if (candLine.hasNewline || isCompleted) {
                        closedLineIdx = i;
                        break;
                    }
                }
            }

            if (closedLineIdx !== -1) {
                const blockEnd = lines[closedLineIdx]!.end;
                stableBlocks.push(text.slice(blockStart, blockEnd));
                currentLineIdx = closedLineIdx + 1;
                continue;
            } else if (isCompleted) {
                stableBlocks.push(text.slice(blockStart));
                currentLineIdx = lines.length;
                break;
            } else {
                break;
            }
        }

        // 3. 检查 GFM 表格（Table）
        if (firstContentLine.content.includes("|")) {
            if (contentLineIdx + 1 >= lines.length) {
                if (!isCompleted) {
                    break;
                }
            } else {
                const secondLine = lines[contentLineIdx + 1]!;
                if (isTableDelimiterLine(secondLine.content)) {
                    let tableEndLineIdx = contentLineIdx + 1;
                    let foundTableEnd = false;

                    for (let i = contentLineIdx + 2; i < lines.length; i++) {
                        const line = lines[i]!;
                        if (/^[ \t]*$/.test(line.content)) {
                            tableEndLineIdx = i;
                            while (
                                tableEndLineIdx + 1 < lines.length &&
                                /^[ \t]*$/.test(lines[tableEndLineIdx + 1]!.content) &&
                                (lines[tableEndLineIdx + 1]!.hasNewline || isCompleted)
                            ) {
                                tableEndLineIdx++;
                            }
                            foundTableEnd = true;
                            break;
                        } else if (!line.content.includes("|")) {
                            tableEndLineIdx = i - 1;
                            foundTableEnd = true;
                            break;
                        } else {
                            tableEndLineIdx = i;
                        }
                    }

                    if (foundTableEnd) {
                        const blockEnd = lines[tableEndLineIdx]!.end;
                        stableBlocks.push(text.slice(blockStart, blockEnd));
                        currentLineIdx = tableEndLineIdx + 1;
                        continue;
                    } else if (isCompleted) {
                        const blockEnd = lines[tableEndLineIdx]!.end;
                        stableBlocks.push(text.slice(blockStart, blockEnd));
                        currentLineIdx = tableEndLineIdx + 1;
                        continue;
                    } else {
                        break;
                    }
                }
            }
        }

        // 4. 检查 Setext 标题
        if (contentLineIdx + 1 < lines.length) {
            const secondLine = lines[contentLineIdx + 1]!;
            const setextMatch = /^[ \t]*(=+|-+)[ \t]*$/.exec(secondLine.content);
            if (setextMatch) {
                if (secondLine.hasNewline || isCompleted) {
                    let blockEndIdx = contentLineIdx + 1;
                    while (
                        blockEndIdx + 1 < lines.length &&
                        /^[ \t]*$/.test(lines[blockEndIdx + 1]!.content) &&
                        (lines[blockEndIdx + 1]!.hasNewline || isCompleted)
                    ) {
                        blockEndIdx++;
                    }

                    const blockEnd = lines[blockEndIdx]!.end;
                    stableBlocks.push(text.slice(blockStart, blockEnd));
                    currentLineIdx = blockEndIdx + 1;
                    continue;
                } else if (!isCompleted) {
                    break;
                }
            }
        } else if (!isCompleted) {
            break;
        }

        // 5. 普通段落、列表、引用或 ATX 标题
        let blankLineIdx = -1;
        for (let i = contentLineIdx; i < lines.length; i++) {
            const line = lines[i]!;
            if (/^[ \t]*$/.test(line.content)) {
                blankLineIdx = i;
                break;
            }
        }

        if (blankLineIdx !== -1) {
            let blockEndIdx = blankLineIdx;
            while (
                blockEndIdx + 1 < lines.length &&
                /^[ \t]*$/.test(lines[blockEndIdx + 1]!.content) &&
                (lines[blockEndIdx + 1]!.hasNewline || isCompleted)
            ) {
                blockEndIdx++;
            }
            const blockEnd = lines[blockEndIdx]!.end;
            stableBlocks.push(text.slice(blockStart, blockEnd));
            currentLineIdx = blockEndIdx + 1;
            continue;
        } else if (isCompleted) {
            stableBlocks.push(text.slice(blockStart));
            currentLineIdx = lines.length;
            break;
        } else {
            break;
        }
    }

    const processedEnd = currentLineIdx < lines.length
        ? lines[currentLineIdx]!.start
        : text.length;

    let remainingTail = text.slice(processedEnd);

    if (isCompleted && remainingTail.length > 0) {
        if (/^[ \t\r\n]*$/.test(remainingTail) && stableBlocks.length > 0) {
            const lastIdx = stableBlocks.length - 1;
            stableBlocks[lastIdx] = stableBlocks[lastIdx]! + remainingTail;
            remainingTail = "";
        } else {
            stableBlocks.push(remainingTail);
            remainingTail = "";
        }
    }

    return {
        stableBlocks,
        remainingTail,
    };
}
