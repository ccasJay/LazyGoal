import { convert } from "html-to-text";

/** 保持原始大小写的常见标题标签。 */
const HEADING_SELECTORS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

/**
 * 使用结构化 HTML 解析提取可见文本并折叠为单行。
 *
 * @remarks
 * 跳过 `script`、`style` 与 `img`，链接只保留文本，标题保留原始大小写。
 * 输出统一折叠空白并去除首尾空格，保持 `WebFetchOutput.text` 的单行形状。
 * 解析失败时抛出底层异常，由调用方映射为稳定的抓取失败。
 *
 * @param html - 待抽取的 HTML 文本。
 * @returns 单行可见文本。
 * @throws 底层 HTML 解析器拒绝输入或资源耗尽时抛出异常。
 *
 * @example
 * ```ts
 * const text = extractHtmlText("<h1>Title</h1><p>Body</p>");
 * ```
 */
export function extractHtmlText(html: string): string {
    const extracted = convert(html, {
        wordwrap: false,
        selectors: [
            { selector: "script", format: "skip" },
            { selector: "style", format: "skip" },
            { selector: "img", format: "skip" },
            { selector: "a", options: { ignoreHref: true } },
            { selector: "table", format: "dataTable", options: { uppercaseHeaderCells: false } },
            ...HEADING_SELECTORS.map((selector) => ({
                selector,
                options: { uppercase: false },
            })),
        ],
    });
    return extracted.replace(/\s+/g, " ").trim();
}
