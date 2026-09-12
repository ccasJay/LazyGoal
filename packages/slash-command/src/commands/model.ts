import { SLASH_COMMAND_ERROR_CODES, SlashCommandError } from "../errors.js";
import type { ModelCommandEffect, SlashCommandDefinition, SlashCommandInvocation } from "../types.js";

/**
 * 切换活动语言模型的内置 Slash 命令定义。
 *
 * @remarks
 * 该命令不接收任何参数。执行成功后返回 `{ kind: "open_model_selector" }` 副作用描述。
 *
 * @example
 * ```ts
 * const registry = createSlashCommandRegistry<ModelCommandEffect>();
 * registry.register(modelCommandDefinition);
 * ```
 */
export const modelCommandDefinition: SlashCommandDefinition<ModelCommandEffect> = {
    name: "model",
    description: "Switch the active language model for the current provider",
    usage: "/model",
    execute(invocation: SlashCommandInvocation): ModelCommandEffect {
        if (invocation.args.trim().length > 0) {
            throw new SlashCommandError(
                SLASH_COMMAND_ERROR_CODES.INVALID_ARGS,
                "Command '/model' does not accept arguments.",
            );
        }
        return { kind: "open_model_selector" };
    },
};
