/**
 * 工作区权限档位文件的持久化 DTO。
 *
 * @remarks
 * 字段取值与 `@lazygoal/permission` 的 `PermissionProfile` 一致。档位取值以内联字面量联合表达，
 * 使 Catalog 生成的 Schema 只包含单一根定义。
 *
 * @example
 * ```ts
 * const file: PermissionProfileFile = {
 *     version: 1,
 *     workspaceId: "ws-1",
 *     sandbox: "workspace-write",
 *     approvals: "on-request",
 *     reviewer: "user",
 *     writableRoots: [],
 *     revision: 1,
 * };
 * ```
 */
export interface PermissionProfileFile {
    readonly version: 1;
    /** @minLength 1 */
    readonly workspaceId: string;
    readonly sandbox: "read-only" | "workspace-write" | "danger-full-access";
    readonly approvals: "on-request" | "never";
    readonly reviewer: "user" | "auto_review";
    /** 工作区树之外额外允许读写的绝对路径根目录。 */
    readonly writableRoots: readonly string[];
    /**
     * @asType integer
     * @minimum 0
     */
    readonly revision: number;
}
