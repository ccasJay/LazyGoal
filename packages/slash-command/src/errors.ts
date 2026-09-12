/**
 * Slash Command 领域错误。
 *
 * @remarks
 * 用于表示命令定义注册、输入解析或命令执行过程中的受控失败。
 *
 * @example
 * ```ts
 * throw new SlashCommandError("SLASH_COMMAND_INVALID_ARGS", "Command does not accept arguments.");
 * ```
 */
export class SlashCommandError extends Error {
    /** 稳定的机器可读错误码。 */
    public readonly code: string;

    /**
     * @param code - 稳定的错误标识符（如 SLASH_COMMAND_*）。
     * @param message - 人类可读的英文错误描述。
     */
    constructor(code: string, message: string) {
        super(message);
        this.name = "SlashCommandError";
        this.code = code;
    }
}

/** 预定义的 Slash Command 稳定错误码常量。 */
export const SLASH_COMMAND_ERROR_CODES = {
    INVALID_NAME: "SLASH_COMMAND_INVALID_NAME",
    DUPLICATE_NAME: "SLASH_COMMAND_DUPLICATE_NAME",
    UNKNOWN: "SLASH_COMMAND_UNKNOWN",
    INVALID_ARGS: "SLASH_COMMAND_INVALID_ARGS",
} as const;
