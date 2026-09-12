import { SLASH_COMMAND_ERROR_CODES, SlashCommandError } from "./errors.js";
import type {
    SlashCommandDefinition,
    SlashCommandDispatchResult,
    SlashCommandInvocation,
    SlashCommandRegistry,
    SlashCommandSummary,
    SlashInputInspection,
} from "./types.js";

const COMMAND_NAME_REGEX = /^[a-z][a-z0-9-]*$/;

class DefaultSlashCommandRegistry<TEffect> implements SlashCommandRegistry<TEffect> {
    private readonly definitions = new Map<string, SlashCommandDefinition<TEffect>>();

    public register(definition: SlashCommandDefinition<TEffect>): void {
        if (!COMMAND_NAME_REGEX.test(definition.name)) {
            throw new SlashCommandError(
                SLASH_COMMAND_ERROR_CODES.INVALID_NAME,
                `Invalid slash command name '/${definition.name}'. Command names must start with a lowercase letter and contain only lowercase letters, digits, or hyphens.`,
            );
        }
        if (this.definitions.has(definition.name)) {
            throw new SlashCommandError(
                SLASH_COMMAND_ERROR_CODES.DUPLICATE_NAME,
                `Command '${definition.name}' is already registered.`,
            );
        }
        this.definitions.set(definition.name, definition);
    }

    public get(name: string): SlashCommandDefinition<TEffect> | undefined {
        return this.definitions.get(name);
    }

    public list(): readonly SlashCommandSummary[] {
        return Array.from(this.definitions.values())
            .map(({ name, description, usage }) => ({ name, description, usage }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    public inspect(input: string): SlashInputInspection {
        const firstNonWs = input.search(/\S/);
        if (firstNonWs === -1 || input[firstNonWs] !== "/") {
            return { kind: "text" };
        }

        if (input.startsWith("//", firstNonWs)) {
            const content = input.slice(0, firstNonWs) + input.slice(firstNonWs + 1);
            return { kind: "escaped_text", content };
        }

        const rest = input.slice(firstNonWs + 1);
        const wsIndex = rest.search(/\s/);

        if (wsIndex !== -1) {
            const commandName = rest.slice(0, wsIndex);
            const args = rest.slice(wsIndex + 1).trim();

            if (commandName.length === 0) {
                return {
                    kind: "rejected",
                    code: SLASH_COMMAND_ERROR_CODES.INVALID_NAME,
                    message: "Slash command name cannot be empty.",
                };
            }

            if (!COMMAND_NAME_REGEX.test(commandName)) {
                return {
                    kind: "rejected",
                    code: SLASH_COMMAND_ERROR_CODES.INVALID_NAME,
                    message: `Invalid slash command name '/${commandName}'. Command names must start with a lowercase letter and contain only lowercase letters, digits, or hyphens.`,
                };
            }

            const definition = this.definitions.get(commandName);
            if (!definition) {
                return {
                    kind: "rejected",
                    code: SLASH_COMMAND_ERROR_CODES.UNKNOWN,
                    message: `Unknown slash command '/${commandName}'.`,
                };
            }

            const invocation: SlashCommandInvocation = {
                command: commandName,
                args,
                raw: input,
            };

            return { kind: "invocation", invocation };
        }

        const prefix = rest;
        if (prefix.length > 0 && !/^[a-z0-9-]*$/.test(prefix)) {
            return { kind: "candidates", candidates: [] };
        }

        const candidates = Array.from(this.definitions.values())
            .filter((def) => def.name.startsWith(prefix))
            .map(({ name, description, usage }) => ({ name, description, usage }))
            .sort((a, b) => a.name.localeCompare(b.name));

        return { kind: "candidates", candidates };
    }

    public async dispatch(input: string): Promise<SlashCommandDispatchResult<TEffect>> {
        const firstNonWs = input.search(/\S/);
        if (firstNonWs === -1 || input[firstNonWs] !== "/") {
            return { kind: "text" };
        }

        if (input.startsWith("//", firstNonWs)) {
            const content = input.slice(0, firstNonWs) + input.slice(firstNonWs + 1);
            return { kind: "escaped_text", content };
        }

        const rest = input.slice(firstNonWs + 1);
        const match = rest.match(/^(\S+)(?:\s+(.*))?$/s);
        if (!match) {
            return {
                kind: "rejected",
                code: SLASH_COMMAND_ERROR_CODES.INVALID_NAME,
                message: "Slash command name cannot be empty.",
            };
        }

        const commandName = match[1]!;
        const args = match[2]?.trim() ?? "";

        if (!COMMAND_NAME_REGEX.test(commandName)) {
            return {
                kind: "rejected",
                code: SLASH_COMMAND_ERROR_CODES.INVALID_NAME,
                message: `Invalid slash command name '/${commandName}'. Command names must start with a lowercase letter and contain only lowercase letters, digits, or hyphens.`,
            };
        }

        const definition = this.definitions.get(commandName);
        if (!definition) {
            return {
                kind: "rejected",
                code: SLASH_COMMAND_ERROR_CODES.UNKNOWN,
                message: `Unknown slash command '/${commandName}'.`,
            };
        }

        const invocation: SlashCommandInvocation = {
            command: commandName,
            args,
            raw: input,
        };

        try {
            const effect = await definition.execute(invocation);
            return { kind: "executed", effect };
        } catch (error) {
            if (error instanceof SlashCommandError) {
                return {
                    kind: "rejected",
                    code: error.code,
                    message: error.message,
                };
            }
            throw error;
        }
    }
}

/**
 * 创建全新的 Slash Command 注册表实例。
 *
 * @remarks
 * 返回一个纯内存、无外部副作用、无 UI 依赖的命令注册与派发中心。
 *
 * @example
 * ```ts
 * const registry = createSlashCommandRegistry<{ kind: "open_model_selector" }>();
 * registry.register(modelCommandDefinition);
 * ```
 */
export function createSlashCommandRegistry<TEffect = unknown>(): SlashCommandRegistry<TEffect> {
    return new DefaultSlashCommandRegistry<TEffect>();
}
