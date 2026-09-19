import { SLASH_COMMAND_ERROR_CODES, SlashCommandError } from "../errors.js";
import type { ModelCommandEffect, SlashCommandDefinition, SlashCommandInvocation } from "../types.js";

/**
 * 显式进入后端 Plan Mode 的 `/plan` 命令。
 *
 * @remarks
 * 命令只返回控制 Effect，不把原始命令文本交给 Goal 消息或 Runner。参数由
 * Slash 层拒绝，实际模式切换由 Runtime Coordinator 在安全提交边界完成。
 *
 * @example
 * ```ts
 * const effect = planCommandDefinition.execute({ command: "plan", args: "", raw: "/plan" });
 * // { kind: "enter_plan_mode" }
 * ```
 */
export const planCommandDefinition: SlashCommandDefinition<ModelCommandEffect> = {
    name: "plan",
    description: "Enter Plan Mode for the current Goal",
    usage: "/plan",
    execute(invocation: SlashCommandInvocation): ModelCommandEffect {
        if (invocation.args.trim().length > 0) {
            throw new SlashCommandError(
                SLASH_COMMAND_ERROR_CODES.INVALID_ARGS,
                "Command '/plan' does not accept arguments.",
            );
        }
        return { kind: "enter_plan_mode" };
    },
};
