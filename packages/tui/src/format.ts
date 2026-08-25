/**
 * 截断标识符用于终端展示，避免完整 UUID 占用过宽。
 *
 * @remarks
 * 保留前缀以便在少量条目中辨认；长度不超过 `prefixLength` 则原样返回。
 * 供 `SessionStatus` 的 Goal id 与 `GoalSelectScreen` 的选项标签共用。
 *
 * @example
 * ```ts
 * truncateId("abcdefgh-1234-5678", 8); // "abcdefgh…"
 * truncateId("short", 8);               // "short"
 * ```
 */
export function truncateId(id: string, prefixLength = 8): string {
    if (id.length <= prefixLength) {
        return id;
    }
    return `${id.slice(0, prefixLength)}…`;
}
