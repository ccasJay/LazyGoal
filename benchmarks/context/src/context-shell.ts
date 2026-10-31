/**
 * `context_shell` 的结构化输入。
 */
export interface ContextShellInput {
    /** 要在隔离项目工作区执行的 shell 命令。 */
    readonly command: string;
}
