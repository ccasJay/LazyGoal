/**
 * 终端 ANSI 样式转义函数集。
 *
 * @remarks
 * 零第三方依赖生成标准 ANSI 终端格式化序列，包括粗体、弱化、前景色，并在末尾正确闭合。
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
};

/**
 * 分隔条渲染可选配置。
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
 * 构造自适应终端内容宽度的带标区块分隔条。
 *
 * @remarks
 * 计算纯文本可打印长度后使用弱化横线 `─` 补齐至指定 `contentWidth`，
 * 避免因 ANSI 转义字符导致行宽计算错误或多余换行。
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
    const icon = options?.icon ? `${options.icon} ` : "";
    const colorFn = options?.color ?? ((text: string) => text);
    const badgeColorFn = options?.badgeColor ?? colorFn;

    // 计算纯文本可见字符宽度（考虑终端中 Emoji/宽字符占用 2 列宽度，并预留安全边距）
    const iconWidth = options?.icon ? 2 : 0;
    const rawBadge = options?.badge ? ` ${options.badge} ──` : "";
    const visibleLength = 4 + iconWidth + label.length + 1 + rawBadge.length;
    const fillerLength = Math.max(2, contentWidth - visibleLength - 2);
    const filler = "─".repeat(fillerLength);

    const styledPrefix = ansi.dim("─── ") + colorFn(ansi.bold(`${icon}${label}`)) + " ";
    const styledFiller = ansi.dim(filler);
    const styledBadge = options?.badge
        ? ` ${badgeColorFn(options.badge)} ` + ansi.dim("──")
        : "";

    return styledPrefix + styledFiller + styledBadge;
}

/**
 * 为多行输出的每一行添加前缀缩进槽线。
 *
 * @remarks
 * 将传入文本按换行符拆分，逐行附加垂直槽线（如 `  │ `），
 * 形成类似代码块或引用块的视觉边界，同时保留原行内容。
 *
 * @param text - 待添加槽线的多行文本。
 * @param gutter - 槽线前缀字符，默认为深灰色 `  │ `。
 * @returns 附加槽线后的文本字符串。
 *
 * @example
 * ```ts
 * const quoted = formatGutter('{"command": "ls"}');
 * ```
 */
export function formatGutter(text: string, gutter = ansi.gray("  │ ")): string {
    if (text.length === 0) return "";
    return text
        .split("\n")
        .map((line) => `${gutter}${line}`)
        .join("\n");
}
