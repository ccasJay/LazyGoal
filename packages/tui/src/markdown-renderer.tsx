import React from "react";
import { Box, Text } from "ink";
import { marked, type Token, type Tokens } from "marked";
import stringWidth from "string-width";

/**
 * Markdown 终端渲染组件属性。
 *
 * @remarks
 * 传入的 content 为标准 Markdown 源码字符串，既可为单个已提交 Block，亦可为 liveTail 动态尾部。
 *
 * @example
 * ```tsx
 * <MarkdownRenderer content="# Hello World\n\nThis is a paragraph." />
 * ```
 */
export interface MarkdownRendererProps {
    /** 待渲染的原始 Markdown 文本。 */
    readonly content: string;
}

/**
 * 递归渲染行内 Token 集合。
 */
function renderInlineTokens(tokens: Token[] | undefined, keyPrefix = "inline"): React.ReactNode {
    if (!tokens || tokens.length === 0) {
        return null;
    }

    return tokens.map((token, index) => {
        const key = `${keyPrefix}-${index}`;

        switch (token.type) {
            case "text":
                if ("tokens" in token && token.tokens && token.tokens.length > 0) {
                    return (
                        <React.Fragment key={key}>
                            {renderInlineTokens(token.tokens, key)}
                        </React.Fragment>
                    );
                }
                return <Text key={key}>{token.text}</Text>;

            case "strong":
                return (
                    <Text key={key} bold>
                        {renderInlineTokens(token.tokens, key)}
                    </Text>
                );

            case "em":
                return (
                    <Text key={key} italic>
                        {renderInlineTokens(token.tokens, key)}
                    </Text>
                );

            case "codespan":
                return (
                    <Text key={key} color="yellow">
                        `{token.text}`
                    </Text>
                );

            case "link":
                return (
                    <Text key={key} color="blue" underline>
                        {renderInlineTokens(token.tokens, key)} ({token.href})
                    </Text>
                );

            case "del":
                return (
                    <Text key={key} strikethrough>
                        {renderInlineTokens(token.tokens, key)}
                    </Text>
                );

            case "br":
                return <Text key={key}>{"\n"}</Text>;

            case "escape":
                return <Text key={key}>{token.text}</Text>;

            default:
                // 需求 5.2：未知 inline token 回退到 raw 文本
                return (
                    <Text key={key}>
                        {(token as any).raw ?? (token as any).text ?? ""}
                    </Text>
                );
        }
    });
}

/**
 * 格式化渲染 GFM 表格为整齐对齐的终端文本。
 */
function renderTableToken(token: Tokens.Table, key: string): React.ReactNode {
    const headers = token.header.map(h => h.text);
    const rows = token.rows.map(row => row.map(cell => cell.text));
    const colCount = Math.max(headers.length, ...rows.map(r => r.length));

    // 计算各列最大字符宽度
    const colWidths = new Array<number>(colCount).fill(3);
    for (let c = 0; c < colCount; c++) {
        if (headers[c]) {
            colWidths[c] = Math.max(colWidths[c]!, stringWidth(headers[c]!));
        }
        for (const row of rows) {
            if (row[c]) {
                colWidths[c] = Math.max(colWidths[c]!, stringWidth(row[c]!));
            }
        }
    }

    const padCell = (text: string, width: number): string => {
        const sw = stringWidth(text);
        const padding = Math.max(0, width - sw);
        return text + " ".repeat(padding);
    };

    const headerLine = "| " + headers.map((h, i) => padCell(h ?? "", colWidths[i]!)).join(" | ") + " |";
    const dividerLine = "|-" + colWidths.map(w => "-".repeat(w)).join("-|-") + "-|";
    const rowLines = rows.map(row => {
        return "| " + Array.from({ length: colCount }, (_, i) => padCell(row[i] ?? "", colWidths[i]!)).join(" | ") + " |";
    });

    return (
        <Box key={key} flexDirection="column" marginY={1}>
            <Text bold color="cyan">{headerLine}</Text>
            <Text dimColor>{dividerLine}</Text>
            {rowLines.map((line, rIdx) => (
                <Text key={rIdx}>{line}</Text>
            ))}
        </Box>
    );
}

/**
 * 渲染顶级 Block Token。
 */
function renderBlockToken(token: Token, index: number): React.ReactNode {
    const key = `block-${index}`;

    switch (token.type) {
        case "heading":
            return (
                <Box key={key} marginTop={index === 0 ? 0 : 1} marginBottom={0}>
                    <Text bold color={token.depth === 1 ? "magenta" : token.depth === 2 ? "cyan" : "yellow"}>
                        {"#".repeat(token.depth)} {renderInlineTokens(token.tokens, key)}
                    </Text>
                </Box>
            );

        case "paragraph":
            return (
                <Box key={key} marginTop={index === 0 ? 0 : 1} marginBottom={0}>
                    <Text>{renderInlineTokens(token.tokens, key)}</Text>
                </Box>
            );

        case "code":
            return (
                <Box key={key} flexDirection="column" marginY={1} borderStyle="single" borderColor="gray" paddingX={1}>
                    {token.lang ? (
                        <Box marginBottom={0}>
                            <Text dimColor bold>[{token.lang}]</Text>
                        </Box>
                    ) : null}
                    <Text color="green">{token.text}</Text>
                </Box>
            );

        case "table":
            return renderTableToken(token as Tokens.Table, key);

        case "blockquote":
            return (
                <Box key={key} flexDirection="row" marginY={1}>
                    <Text color="blue">│ </Text>
                    <Box flexDirection="column">
                        {(token as Tokens.Blockquote).tokens?.map((subToken, subIdx) => renderBlockToken(subToken, subIdx))}
                    </Box>
                </Box>
            );

        case "list": {
            const listToken = token as Tokens.List;
            return (
                <Box key={key} flexDirection="column" marginY={1}>
                    {listToken.items.map((item: Tokens.ListItem, itemIdx: number) => {
                        const bullet = listToken.ordered
                            ? `${(typeof listToken.start === "number" ? listToken.start : 1) + itemIdx}. `
                            : "• ";
                        return (
                            <Box key={itemIdx} flexDirection="row">
                                <Text color="yellow">{bullet}</Text>
                                <Box flexDirection="column">
                                    {item.tokens.map((itToken: Token, itIdx: number) => {
                                        if (itToken.type === "text" && "tokens" in itToken && itToken.tokens) {
                                            return <Text key={itIdx}>{renderInlineTokens(itToken.tokens)}</Text>;
                                        }
                                        return renderBlockToken(itToken, itIdx);
                                    })}
                                </Box>
                            </Box>
                        );
                    })}
                </Box>
            );
        }

        case "hr":
            return (
                <Box key={key} marginY={1}>
                    <Text dimColor>{"─".repeat(40)}</Text>
                </Box>
            );

        case "space":
            return null;

        default:
            // 需求 5.2：未知 block token 保留其原始文本，不得静默丢弃
            return (
                <Box key={key} marginTop={index === 0 ? 0 : 1}>
                    <Text>{(token as any).raw ?? (token as any).text ?? ""}</Text>
                </Box>
            );
    }
}

/**
 * 统一的 Ink Markdown 渲染组件。
 *
 * @remarks
 * 满足需求 5.1 与 5.2：
 * 1. 统一解析标题、段落、强调、行内代码、链接、列表、引用、围栏代码、分隔线与 GFM 表格；
 * 2. 无论已提交不可变历史还是 liveTail 动态尾部，使用完全同一渲染管线；
 * 3. 对未知或自定义 token 回退到其原始文本（`token.raw`），杜绝任何内容丢失。
 *
 * @example
 * ```tsx
 * const view = <MarkdownRenderer content="**Important**: Review completed." />;
 * ```
 */
export function MarkdownRenderer({ content }: MarkdownRendererProps): React.JSX.Element {
    if (!content) {
        return <Box />;
    }

    const tokens = marked.lexer(content);

    return (
        <Box flexDirection="column">
            {tokens.map((token, index) => renderBlockToken(token, index))}
        </Box>
    );
}
