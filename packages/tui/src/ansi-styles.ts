import stringWidth from "string-width";
import wrapAnsi from "wrap-ansi";

/**
 * 终端 ANSI 样式转义函数集。
 *
 * @remarks
 * 生成标准 ANSI 终端格式化序列，包括粗体、弱化、前景色，并在末尾闭合。
 *
 * @example
 * ```ts
 * const title = ansi.bold(ansi.cyan("Decision"));
 * ```
 */
export const ansi = {
    bold: (text: string): string => `\x1b[1m${text}\x1b[22m`,
    dim: (text: string): string => `\x1b[2m${text}\x1b[22m`,
    cyan: (text: string): string => `\x1b[36m${text}\x1b[39m`,
    yellow: (text: string): string => `\x1b[33m${text}\x1b[39m`,
    green: (text: string): string => `\x1b[32m${text}\x1b[39m`,
    red: (text: string): string => `\x1b[31m${text}\x1b[39m`,
    magenta: (text: string): string => `\x1b[35m${text}\x1b[39m`,
    gray: (text: string): string => `\x1b[90m${text}\x1b[39m`,
    softCyan: (text: string): string => `\x1b[38;5;73m${text}\x1b[39m`,
    softYellow: (text: string): string => `\x1b[38;5;179m${text}\x1b[39m`,
    softGreen: (text: string): string => `\x1b[38;5;71m${text}\x1b[39m`,
    softRed: (text: string): string => `\x1b[38;5;167m${text}\x1b[39m`,
    softMagenta: (text: string): string => `\x1b[38;5;139m${text}\x1b[39m`,
};

/**
 * 分隔条渲染可选配置。
 *
 * @example
 * const options: SectionDividerOptions = { color: ansi.cyan, badge: "Approved" };
 */
export interface SectionDividerOptions {
    /** 分隔线前置图标（如 ◈、⚡、❯、★）。 */
    readonly icon?: string;
    /** 标题主体色彩渲染函数。 */
    readonly color?: (text: string) => string;
    /** 右侧附加徽章文本（如审批状态）。 */
    readonly badge?: string;
    /** 徽章色彩渲染函数。 */
    readonly badgeColor?: (text: string) => string;
}

/**
 * 槽线格式化可选配置。
 *
 * @example
 * const options: GutterOptions = { color: ansi.cyan, width: 80 };
 */
export interface GutterOptions {
    /** 槽线符号，默认为粗实心竖条 "▎"（Unicode U+258E）。 */
    readonly char?: string;
    /** 槽线颜色函数，默认使用终端灰色。 */
    readonly color?: (text: string) => string;
    /** 包含槽线的可用终端列数；指定后先折行正文，续行保留槽线。 */
    readonly width?: number;
}

/**
 * 构造自适应终端内容宽度的带标区块分隔条。
 *
 * @remarks
 * 按终端显示列折行标题与徽章，再用弱化横线补齐剩余空间。
 * ANSI 转义不占列；中文、组合字符与 Emoji 按实际显示宽度计算。
 *
 * @param label - 区块核心标签文本。
 * @param contentWidth - 终端当前视口的字符可用宽度。
 * @param options - 包含图标、着色与右侧徽章的渲染选项。
 * @returns 带有完整 ANSI 色彩且自适应填充的分隔行字符串。
 *
 * @example
 * ```ts
 * const divider = formatSectionDivider("[Decision: complete]", 80, {
 *     icon: "◈",
 *     color: ansi.cyan,
 * });
 * ```
 */
export function formatSectionDivider(
    label: string,
    contentWidth: number,
    options?: SectionDividerOptions,
): string {
    const width = Math.max(1, contentWidth);
    const icon = options?.icon ? `${options.icon} ` : "";
    const colorFn = options?.color ?? ((text: string) => text);
    const badgeColorFn = options?.badgeColor ?? colorFn;

    const styledBadge = options?.badge
        ? `  ${badgeColorFn(options.badge)}`
        : "";
    return wrapAnsi(colorFn(ansi.bold(`${icon}${label}`)) + styledBadge, width, {
        hard: true,
        trim: false,
    }).split("\n").map((line) => {
        const remaining = width - stringWidth(line);
        return remaining > 2 ? line + " " + ansi.dim("─".repeat(remaining - 1)) : line;
    }).join("\n");
}

/**
 * 为多行输出的每一行添加前缀粗槽线。
 *
 * @remarks
 * 指定 width 时先折行正文，再为每条可见行添加槽线；代码缩进和空行保留。
 * 字符串参数作为完整前缀使用。
 *
 * @param text - 待添加槽线的多行文本。
 * @param options - 槽线粗细与彩色配置，或直接传入传统槽线前缀字符串。
 * @returns 附加槽线后的文本字符串。
 *
 * @example
 * ```ts
 * const quoted = formatGutter('{"command": "ls"}', {
 *     color: ansi.softYellow,
 * });
 * ```
 */
export function formatGutter(
    text: string,
    options?: GutterOptions | string,
): string {
    if (text.length === 0) return "";
    if (typeof options === "string") {
        return text
            .split("\n")
            .map((line) => `${options}${line}`)
            .join("\n");
    }

    const char = options?.char ?? "▎";
    const colorFn = options?.color ?? ansi.gray;
    const prefix = ` ${colorFn(char)} `;
    const content = options?.width === undefined ? text : wrapAnsi(
        text.replace(/\t/g, "    "),
        Math.max(1, options.width - stringWidth(prefix)),
        { hard: true, trim: false },
    );

    return content
        .split("\n")
        .map((line) => `${prefix}${line}`)
        .join("\n");
}
