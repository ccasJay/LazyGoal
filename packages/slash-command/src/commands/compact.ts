import { SLASH_COMMAND_ERROR_CODES, SlashCommandError } from "../errors.js";
import type { CompactCommandEffect, SlashCommandDefinition, SlashCommandInvocation } from "../types.js";

/**
 * 请求整理当前工作窗口的 `/compact` 命令。
 *
 * @remarks
 * 命令只返回控制 Effect，不把命令文本写入 Goal 对话，也不创建业务 Run；
 * 实际提炼由 Runtime 在安全边界执行，并绑定 Goal 的当前 Epoch。
 *
 * @example
 * ```ts
 * const effect = compactCommandDefinition.execute({ command: "compact", args: "", raw: "/compact" });
 * // { kind: "compact_context" }
 * ```
 */
export const compactCommandDefinition: SlashCommandDefinition<CompactCommandEffect> = {
    name: "compact",
    description: "Compact the current working window",
    usage: "/compact",
    execute(invocation: SlashCommandInvocation): CompactCommandEffect {
        if (invocation.args.trim().length > 0) {
            throw new SlashCommandError(
                SLASH_COMMAND_ERROR_CODES.INVALID_ARGS,
                "Command '/compact' does not accept arguments.",
            );
        }
        return { kind: "compact_context" };
    },
};
