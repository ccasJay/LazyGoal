import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import type { LLMAdapter } from "../../../packages/llm/src/core/adapter.js";
import type { LLMRequest } from "../../../packages/llm/src/core/types.js";
import { createLlmAdapter, createReflectionLlmAdapter } from "../../../packages/llm/src/factory.js";
import { loadReflectionRuntimeConfig } from "../../../packages/llm/src/config-loader.js";
import { resolveLazyGoalHomePaths } from "../../../packages/llm/src/xdg.js";
import { readNormalizedUsage } from "../../../packages/llm/src/core/usage.js";

/** 反思响应文本的最大字符数，避免模型回显撑爆机器协议。 */
export const GEPA_REFLECTION_OUTPUT_MAX_CHARS = 256 * 1024;

/** 反思桥 stderr 诊断消息的最大字符数。 */
export const GEPA_REFLECTION_DIAGNOSTIC_MAX_CHARS = 4 * 1024;

/**
 * GEPA 反思机器请求协议模型定位结构契约。
 *
 * @remarks
 * 用于在跨语言 CLI 请求中声明预期的 Reflection 模型目标标识。
 * 若提供 `configId`，必须与当前主配置中 `[gepa].reflection_profile` 解析的目标 Profile 一致；
 * `modelId` 可用于临时覆盖实际调用的底层模型名称。
 *
 * @example
 * ```ts
 * const target: GepaReflectModelTarget = {
 *     configId: "gepa-reflection",
 *     modelId: "gpt-4o",
 * };
 * ```
 */
export interface GepaReflectModelTarget {
    /** 目标 Profile 标识（如 "reflection"）。若提供，可用于一致性校验。 */
    readonly configId?: string;
    /** 显式覆盖的模型名称（可选）。 */
    readonly modelId?: string;
}

/**
 * GEPA 反思机器请求消息结构契约。
 *
 * @remarks
 * 表示反思推理中的单条结构化上下文消息。
 * 契约约束：
 * 1. 严格限制仅允许纯文本角色，限定在 `"system" | "user" | "assistant"`；
 * 2. 严禁传递带有工具调用（`toolCalls`）或非文本块的消息对象，保证与任务执行完全解耦。
 *
 * @example
 * ```ts
 * const message: GepaReflectMessage = {
 *     role: "user",
 *     content: "Analyze the failure trajectory and propose prompt improvements.",
 * };
 * ```
 */
export interface GepaReflectMessage {
    /** 消息角色，仅允许 "system" | "user" | "assistant"。 */
    readonly role: "system" | "user" | "assistant";
    /** 纯文本消息正文。 */
    readonly content: string;
}

/**
 * GEPA 反思机器请求协议契约。
 *
 * @remarks
 * 支持纯文本字符串 Prompt（自动归一化为单条 user 消息）或结构化纯文本消息列表。
 *
 * @example
 * ```ts
 * const request: GepaReflectRequest = {
 *     model: { configId: "gepa-reflection" },
 *     prompt: "Optimize this prompt",
 * };
 * ```
 */
export interface GepaReflectRequest {
    readonly model?: GepaReflectModelTarget;
    readonly prompt: string | readonly GepaReflectMessage[];
}

/**
 * GEPA 反思机器响应协议结构契约。
 *
 * @remarks
 * 反思推理成功时输出给调用方的数据结构。CLI 在 stdout 恰好输出该结构的单行 JSON，包含生成的反思文本与标准用量。
 *
 * @example
 * ```ts
 * const response: GepaReflectResponse = {
 *     text: "Optimized prompt content...",
 *     usage: { inputTokens: 120, outputTokens: 80 },
 * };
 * ```
 */
export interface GepaReflectResponse {
    /** 模型生成的文本内容。 */
    readonly text: string;
    /** 标准归一化用量统计。 */
    readonly usage: {
        readonly inputTokens: number;
        readonly outputTokens: number;
        readonly cachedInputTokens?: number;
    };
}

/**
 * GEPA 反思机器错误响应协议契约。
 *
 * @remarks
 * 发生错误时输出至 stderr 的单行结构化诊断 JSON 契约。
 *
 * @example
 * ```ts
 * const errorResponse: GepaReflectErrorResponse = {
 *     error: "invalid_request",
 *     message: "Missing --request argument",
 * };
 * ```
 */
export interface GepaReflectErrorResponse {
    /** 错误分类。 */
    readonly error: "invalid_request" | "model_error";
    /** 清晰且脱敏后的诊断说明。 */
    readonly message: string;
}

/**
 * GEPA 反思机器桥 CLI 执行选项契约。
 *
 * @remarks
 * 为 `runGepaReflectCli` 提供执行环境与测试替身依赖注入能力。
 * 生产环境下自动读取工作目录与环境变量并加载 Profile，测试时可直接注入 `reflectionAdapter` 与自定义输出捕获回调，避免文件系统与网络依赖。
 *
 * @example
 * ```ts
 * const options: GepaReflectCliOptions = {
 *     cwd: "/path/to/workspace",
 *     writeOutput: (line) => console.log(line),
 *     reflectionAdapter: mockAdapter,
 * };
 * ```
 */
export interface GepaReflectCliOptions {
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly signal?: AbortSignal;
    readonly writeOutput?: (line: string) => void;
    readonly writeError?: (line: string) => void;
    /** 测试注入的独立 Reflection LM Adapter。提供后不读取文件系统。 */
    readonly reflectionAdapter?: LLMAdapter;
}

import { redactSensitiveString } from "./protocol.js";
export { redactSensitiveString };

/**
 * 校验并归一化反思请求 JSON 内容。
 *
 * @remarks
 * 执行反思请求的多层安全与格式预检：
 * 1. 请求载荷上限保护（限制最大 2MB，防止超大请求内存耗尽）；
 * 2. 严格的 JSON 语法及顶级键值对象校验；
 * 3. 未知字段白名单拦截（仅允许 "model" 与 "prompt"）；
 * 4. Prompt 格式归一化：支持纯文本字符串（转换为单条 user 消息）或结构化纯文本消息列表，拒绝空字符串、空列表与非法角色。
 *
 * @param rawText - 原始请求文件文本内容。
 * @returns 经过校验并归一化的请求对象，包含安全的 model 目标与标准结构化 messages 列表。
 * @throws Error 当请求超限、JSON 非法、包含未知字段、Prompt 为空或角色非法时抛出。
 * @example
 * ```ts
 * const validated = parseAndValidateReflectRequest('{"prompt": "Hello"}');
 * // validated.messages[0] === { role: "user", content: "Hello" }
 * ```
 */
export function parseAndValidateReflectRequest(rawText: string): {
    model?: GepaReflectModelTarget;
    messages: { role: "system" | "user" | "assistant"; content: string }[];
} {
    // 请求大小上限保护（2MB）
    if (rawText.length > 2 * 1024 * 1024) {
        throw new Error("Payload too large: request file exceeds 2MB limit");
    }

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
        throw new Error("Invalid request JSON: syntax error");
    }

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid request JSON: root must be an object");
    }

    const allowedKeys = new Set(["model", "prompt"]);
    for (const key of Object.keys(parsed)) {
        if (!allowedKeys.has(key)) {
            throw new Error(`Unknown field in request: "${key}"`);
        }
    }

    let modelTarget: GepaReflectModelTarget | undefined;
    if (parsed.model !== undefined) {
        if (parsed.model === null || typeof parsed.model !== "object" || Array.isArray(parsed.model)) {
            throw new Error('Field "model" must be an object');
        }
        const modelObj = parsed.model as Record<string, unknown>;
        const allowedModelKeys = new Set(["configId", "modelId"]);
        for (const k of Object.keys(modelObj)) {
            if (!allowedModelKeys.has(k)) {
                throw new Error(`Unknown field in model: "${k}"`);
            }
        }
        if (modelObj.configId !== undefined && typeof modelObj.configId !== "string") {
            throw new Error('Field "model.configId" must be a string');
        }
        if (modelObj.modelId !== undefined && typeof modelObj.modelId !== "string") {
            throw new Error('Field "model.modelId" must be a string');
        }
        modelTarget = {
            ...(typeof modelObj.configId === "string" ? { configId: modelObj.configId } : {}),
            ...(typeof modelObj.modelId === "string" ? { modelId: modelObj.modelId } : {}),
        };
    }

    const rawPrompt = parsed.prompt;
    let normalizedMessages: { role: "system" | "user" | "assistant"; content: string }[];
    if (typeof rawPrompt === "string") {
        if (rawPrompt.trim() === "") {
            throw new Error("Prompt cannot be empty");
        }
        normalizedMessages = [{ role: "user", content: rawPrompt }];
    } else if (Array.isArray(rawPrompt)) {
        if (rawPrompt.length === 0) {
            throw new Error("Prompt messages array cannot be empty");
        }
        normalizedMessages = rawPrompt.map((item: unknown, idx: number) => {
            if (item === null || typeof item !== "object" || Array.isArray(item)) {
                throw new Error(`Prompt message at index ${idx} must be an object`);
            }
            const msgObj = item as Record<string, unknown>;
            const allowedMsgKeys = new Set(["role", "content"]);
            for (const k of Object.keys(msgObj)) {
                if (!allowedMsgKeys.has(k)) {
                    throw new Error(`Unknown field in message[${idx}]: "${k}"`);
                }
            }
            if (typeof msgObj.content !== "string") {
                throw new Error(`Message content at index ${idx} must be a string`);
            }
            if (msgObj.role !== "system" && msgObj.role !== "user" && msgObj.role !== "assistant") {
                throw new Error(`Invalid message role: "${String(msgObj.role)}". Only system, user, assistant are permitted.`);
            }
            return {
                role: msgObj.role as "system" | "user" | "assistant",
                content: msgObj.content,
            };
        });
    } else {
        throw new Error('Field "prompt" must be a string or an array of messages');
    }

    return {
        ...(modelTarget !== undefined ? { model: modelTarget } : {}),
        messages: normalizedMessages,
    };
}

function parseReflectArgs(argv: readonly string[]): string {
    let parsed: ReturnType<typeof parseArgs>;
    try {
        parsed = parseArgs({
            args: [...argv],
            options: { request: { type: "string" } },
            allowPositionals: true,
            strict: true,
        });
    } catch (error: unknown) {
        throw new Error(`Invalid arguments: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (parsed.positionals.length > 0) {
        if (!(parsed.positionals.length === 2 && parsed.positionals[0] === "gepa" && parsed.positionals[1] === "reflect")) {
            throw new Error("Usage: lazygoal gepa reflect --request <path>");
        }
    }
    const requestPath = parsed.values.request;
    if (typeof requestPath !== "string" || requestPath.trim() === "") {
        throw new Error("Missing --request argument. Usage: lazygoal gepa reflect --request <path>");
    }
    return requestPath;
}

/**
 * 执行机器可调用的 GEPA 纯文本反思推理桥。
 *
 * @remarks
 * 接收 GEPA 反思请求并使用独立的 Reflection LM Profile 进行纯文本生成。
 * 强制 `prompt_only` 输出模式且禁止挂载任何工具调用。
 * stdout 输出单行 JSON 格式的生成结果与归一化用量；
 * 发生错误时 stderr 输出单行结构化 JSON 诊断信息（区分 invalid_request 与 model_error），
 * 且进程退出码非 0。严禁在失败时回退到 Working LM。
 *
 * @param argv - CLI 命令行参数（通常包含 `gepa reflect --request <path>`）。
 * @param options - 执行选项，可注入进程环境、输出流或测试 Adapter。
 * @returns 进程退出码：成功为 0，模型故障为 1，无效请求为 2，取消为 130。
 * @example
 * ```ts
 * const exitCode = await runGepaReflectCli(["gepa", "reflect", "--request", "/tmp/req.json"]);
 * ```
 */
export async function runGepaReflectCli(
    argv: readonly string[] = process.argv.slice(2),
    options: GepaReflectCliOptions = {},
): Promise<number> {
    const writeOutput = options.writeOutput ?? ((line: string) => process.stdout.write(`${line}\n`));
    const writeError = options.writeError ?? ((line: string) => process.stderr.write(`${line}\n`));
    const env = options.env ?? process.env;
    const cwd = resolve(options.cwd ?? process.cwd());

    // 1. 解析命令行参数
    let requestPath: string;
    try {
        requestPath = parseReflectArgs(argv);
    } catch (error: unknown) {
        const message = boundDiagnostic(redactSensitiveString(error instanceof Error ? error.message : String(error), env));
        writeError(JSON.stringify({ error: "invalid_request", message }));
        return 2;
    }

    // 2. 读取并解析请求文件
    let normalizedRequest: {
        model?: GepaReflectModelTarget;
        messages: { role: "system" | "user" | "assistant"; content: string }[];
    };
    try {
        const absolutePath = resolve(cwd, requestPath);
        if (!existsSync(absolutePath)) {
            throw new Error(`Request file not found: ${requestPath}`);
        }
        const fileContent = await readFile(absolutePath, "utf-8");
        normalizedRequest = parseAndValidateReflectRequest(fileContent);
    } catch (error: unknown) {
        const message = boundDiagnostic(redactSensitiveString(error instanceof Error ? error.message : String(error), env));
        writeError(JSON.stringify({ error: "invalid_request", message }));
        return 2;
    }

    // 3. 准备 LLM Adapter（严格隔离 Working Profile）。提供 configId 时，
    // 若存在主配置则先解析真实 Reflection Profile，禁止请求冒充其它 Profile。
    let adapter: LLMAdapter;
    try {
        const configId = normalizedRequest.model?.configId;
        // 注入 Adapter 的单元测试不应被宿主用户配置污染；只有调用方显式提供
        // 环境且该环境存在主配置时，才对请求 configId 执行跨边界一致性校验。
        const configFileExists = options.env !== undefined
            && existsSync(resolveLazyGoalHomePaths(env).configFile);
        const shouldLoadReflectionProfile = options.reflectionAdapter === undefined
            || (configId !== undefined && configFileExists);
        let reflectionRuntime: Awaited<ReturnType<typeof loadReflectionRuntimeConfig>> | undefined;
        if (shouldLoadReflectionProfile) {
            reflectionRuntime = await loadReflectionRuntimeConfig({
                env,
                cliArgs: normalizedRequest.model?.modelId !== undefined
                    ? { model: normalizedRequest.model.modelId }
                    : {},
            });
            if (configId !== undefined && configId !== reflectionRuntime.profileName) {
                throw new Error(
                    `Reflection model configId must match configured profile "${reflectionRuntime.profileName}"`,
                );
            }
        }
        if (options.reflectionAdapter !== undefined) {
            adapter = options.reflectionAdapter;
        } else {
            // shouldLoadReflectionProfile 为 true 时已完成加载；此断言只隔离类型，
            // 不引入回退配置。
            if (reflectionRuntime === undefined) throw new Error("Reflection profile was not resolved");
            adapter = createReflectionLlmAdapter(reflectionRuntime.llm);
        }
    } catch (error: unknown) {
        const message = boundDiagnostic(redactSensitiveString(error instanceof Error ? error.message : String(error), env));
        writeError(JSON.stringify({ error: "invalid_request", message }));
        return 2;
    }

    // 4. 处理信号监听
    const ownedAbortController = options.signal === undefined ? new AbortController() : undefined;
    const signal = options.signal ?? ownedAbortController!.signal;
    const abort = () => ownedAbortController?.abort();
    if (ownedAbortController !== undefined) {
        process.once("SIGINT", abort);
        process.once("SIGTERM", abort);
    }

    // 5. 纯文本无工具推理
    try {
        if (signal.aborted) {
            return 130;
        }

        const llmRequest: LLMRequest = {
            messages: normalizedRequest.messages,
            toolChoice: "none",
        };

        const response = await adapter.generate(llmRequest, { signal });

        const outputText = boundText(redactSensitiveString(response.content, env), GEPA_REFLECTION_OUTPUT_MAX_CHARS);
        const normalizedUsage = readNormalizedUsage(response.providerMetadata) ?? {
            inputTokens: 0,
            outputTokens: 0,
        };

        const resultResponse: GepaReflectResponse = {
            text: outputText,
            usage: {
                inputTokens: normalizedUsage.inputTokens,
                outputTokens: normalizedUsage.outputTokens,
                ...(normalizedUsage.cachedInputTokens !== undefined
                    ? { cachedInputTokens: normalizedUsage.cachedInputTokens }
                    : {}),
            },
        };

        // 单行紧凑输出到 stdout
        writeOutput(JSON.stringify(resultResponse));
        return 0;
    } catch (error: unknown) {
        if (signal.aborted) {
            return 130;
        }
        const message = boundDiagnostic(redactSensitiveString(error instanceof Error ? error.message : String(error), env));
        writeError(JSON.stringify({ error: "model_error", message }));
        return 1;
    } finally {
        if (ownedAbortController !== undefined) {
            process.removeListener("SIGINT", abort);
            process.removeListener("SIGTERM", abort);
        }
    }
}

function boundDiagnostic(text: string): string {
    return boundText(text, GEPA_REFLECTION_DIAGNOSTIC_MAX_CHARS);
}

function boundText(text: string, limit: number): string {
    if (text.length <= limit) return text;
    return `${text.slice(0, Math.max(0, limit - 1))}…`;
}
