import { parseArgs } from "node:util";

import { loadGepaModelConfigs } from "../../../packages/llm/src/config-loader.js";

/** GEPA 解析模型身份时允许的单行机器输出最大字符数。 */
export const GEPA_MODEL_OUTPUT_MAX_CHARS = 16 * 1024;

/** GEPA 机器诊断消息的最大字符数；凭据脱敏后仍受此上限约束。 */
export const GEPA_DIAGNOSTIC_MAX_CHARS = 4 * 1024;

/**
 * GEPA 双模型身份机器输出契约。
 *
 * @remarks
 * 只暴露 Profile 名称、供应商和模型标识，不包含 API key、URL 中的凭据或其他运行时配置。
 * stdout 始终为该对象的单行 JSON；加载失败时 stdout 为空、stderr 为有界诊断。
 *
 * @example
 * ```ts
 * const models: GepaResolvedModels = {
 *     working: { profileName: "default", provider: "openai", modelId: "gpt-4o" },
 *     reflection: { profileName: "gepa-reflection", provider: "openai", modelId: "gpt-4o-mini" },
 * };
 * ```
 */
export interface GepaResolvedModels {
    readonly working: GepaResolvedModel;
    readonly reflection: GepaResolvedModel;
}

/**
 * 一个 GEPA 角色的无凭据模型身份。
 *
 * @example
 * ```ts
 * const identity: GepaResolvedModel = {
 *     profileName: "default",
 *     provider: "openai",
 *     modelId: "gpt-4o",
 * };
 * ```
 */
export interface GepaResolvedModel {
    readonly profileName: string;
    readonly provider: string;
    readonly modelId: string;
}

/**
 * GEPA 模型解析命令的输出依赖注入选项。
 *
 * @remarks
 * 测试可注入环境变量和输出函数；生产调用仍通过 `loadGepaModelConfigs` 读取当前 XDG 配置。
 *
 * @example
 * ```ts
 * await runGepaResolveModelsCli(["gepa", "resolve-models"], {
 *     env: { XDG_CONFIG_HOME: "/tmp/config" },
 * });
 * ```
 */
export interface GepaResolveModelsCliOptions {
    readonly env?: NodeJS.ProcessEnv;
    readonly writeOutput?: (line: string) => void;
    readonly writeError?: (line: string) => void;
}

/**
 * 执行只读的 GEPA 双模型解析机器命令。
 *
 * @remarks
 * 该命令仅加载并校验 Working/Reflection Profile，不创建运行、不启动模型调用，也不向 stdout
 * 输出任何凭据。成功时 stdout 恰好一行 JSON；失败时 stdout 为空且 stderr 恰好一行有界 JSON。
 *
 * @param argv - 通常为 `["gepa", "resolve-models"]`。
 * @param options - 环境变量及输出回调。
 * @returns 成功为 `0`，参数或配置无效为 `2`。
 * @example
 * ```ts
 * const exitCode = await runGepaResolveModelsCli(["gepa", "resolve-models"]);
 * ```
 */
export async function runGepaResolveModelsCli(
    argv: readonly string[] = process.argv.slice(2),
    options: GepaResolveModelsCliOptions = {},
): Promise<number> {
    const writeOutput = options.writeOutput ?? ((line: string) => process.stdout.write(`${line}\n`));
    const writeError = options.writeError ?? ((line: string) => process.stderr.write(`${line}\n`));
    const env = options.env ?? process.env;

    try {
        parseResolveModelsArgs(argv);
    } catch (error: unknown) {
        writeError(serializeDiagnostic("invalid_request", redactDiagnostic(errorMessage(error), env)));
        return 2;
    }

    try {
        const configs = await loadGepaModelConfigs({ env });
        const output: GepaResolvedModels = {
            working: {
                profileName: configs.workingProfileName,
                provider: configs.working.provider,
                modelId: configs.working.model,
            },
            reflection: {
                profileName: configs.reflectionProfileName,
                provider: configs.reflection.provider,
                modelId: configs.reflection.model,
            },
        };
        const line = JSON.stringify(output);
        if (line.length > GEPA_MODEL_OUTPUT_MAX_CHARS) {
            throw new Error(`Resolved model identity exceeds ${GEPA_MODEL_OUTPUT_MAX_CHARS} characters`);
        }
        writeOutput(line);
        return 0;
    } catch (error: unknown) {
        writeError(serializeDiagnostic("invalid_request", redactDiagnostic(errorMessage(error), env)));
        return 2;
    }
}

function parseResolveModelsArgs(argv: readonly string[]): void {
    let parsed: ReturnType<typeof parseArgs>;
    try {
        parsed = parseArgs({
            args: [...argv],
            options: {},
            allowPositionals: true,
            strict: true,
        });
    } catch (error: unknown) {
        throw new Error(`Invalid arguments: ${errorMessage(error)}`);
    }
    if (parsed.positionals.length !== 2
        || parsed.positionals[0] !== "gepa"
        || parsed.positionals[1] !== "resolve-models") {
        throw new Error("Usage: lazygoal gepa resolve-models");
    }
}

function serializeDiagnostic(error: "invalid_request", message: string): string {
    return JSON.stringify({ error, message });
}

function redactDiagnostic(text: string, env: NodeJS.ProcessEnv): string {
    let result = text;
    for (const [name, value] of Object.entries(env)) {
        if (value !== undefined && value.length >= 4 && /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name)) {
            result = result.split(value).join("[REDACTED]");
        }
    }
    result = result.replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED]");
    result = result.replace(/Bearer\s+[a-zA-Z0-9_\-.]+/gi, "Bearer [REDACTED]");
    result = result.replace(/((?:api[-_ ]?key|access[-_ ]?token|secret|password)\s*[:=]\s*)([^\s,;]+)/gi, "$1[REDACTED]");
    return boundText(result, GEPA_DIAGNOSTIC_MAX_CHARS);
}

function boundText(text: string, limit: number): string {
    if (text.length <= limit) return text;
    return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
