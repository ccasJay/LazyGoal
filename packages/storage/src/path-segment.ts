/**
 * storage 路径段的唯一 base64url 编码实现。
 *
 * @remarks
 * 文件名与目录名是持久化布局的一部分，编码规则必须只在一处定义：所有 Store 通过
 * 本模块生成路径段，未来修正路径安全性时不会漏掉某个 Store。该函数只做 UTF-8
 * base64url 编码，不做身份校验；身份格式校验仍由各调用点在编码前完成。
 */

/**
 * 把字符串编码为可作为单个路径段的 base64url 文本。
 *
 * @param value - 需要编码的身份或路径段原文。
 * @returns 与 `Buffer.from(value, "utf8").toString("base64url")` 相同的文本。
 *
 * @example
 * ```ts
 * const segment = encodePathSegment("goal-1");
 * ```
 */
export function encodePathSegment(value: string): string {
    return Buffer.from(value, "utf8").toString("base64url");
}
