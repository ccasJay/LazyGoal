import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

/**
 * 入口隔离探针：在独立子进程中导入并构造目标能力包的公共入口，
 * 记录被解析的模块、网络调用、进程事件注册、退出调用与显式环境读取。
 *
 * @remarks
 * 由 `package-entry-isolation.test.ts` 以 `tsx <probe> <scenario>` 启动，输出单行 JSON 到 stdout。
 * 探针只被测试使用，不属于任何生产入口；模块解析记录使用同步 resolve hook，与环境无关。
 */

const scenario = process.argv[2];
if (scenario === undefined) throw new Error("scenario argument required");

const resolvedModules: string[] = [];
registerHooks({
    resolve(specifier, context, nextResolve) {
        const result = nextResolve(specifier, context);
        resolvedModules.push(result.url);
        return result;
    },
});

let networkCalls = 0;
globalThis.fetch = (async () => {
    networkCalls += 1;
    throw new Error("unexpected network call");
}) as unknown as typeof fetch;

const registeredEvents: string[] = [];
const processRecord = process as unknown as Record<string, unknown>;
for (const method of ["on", "once", "addListener"] as const) {
    const original = processRecord[method] as (...args: unknown[]) => unknown;
    processRecord[method] = (event: unknown, ...rest: unknown[]) => {
        registeredEvents.push(String(event));
        return original.call(process, event, ...rest);
    };
}

let exitCalled = false;
process.exit = ((code?: number) => {
    exitCalled = true;
    throw new Error(`process.exit(${code ?? 0}) called during entry import or construction`);
}) as typeof process.exit;

const envReads: string[] = [];
process.env = new Proxy(process.env, {
    get(target, property, receiver) {
        if (typeof property === "string") envReads.push(property);
        return Reflect.get(target, property, receiver);
    },
}) as typeof process.env;

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const entry = (relativePath: string) => pathToFileURL(join(repoRoot, relativePath)).href;

let artifacts: Record<string, unknown>;

switch (scenario) {
    case "llm-core": {
        const core = await import(entry("packages/llm-core/src/index.ts"));
        const adapter: import("../../llm-core/src/index").LLMAdapter = {
            structuredOutputMode: "prompt_only",
            async generate() {
                return { blocks: [{ index: 0, type: "text", format: "plain", text: "probe" }], providerMetadata: { usage: { inputTokens: 1, outputTokens: 2 } } };
            },
        };
        const response = await adapter.generate({ messages: [{ role: "user", content: "hi" }] });
        artifacts = {
            mode: adapter.structuredOutputMode,
            usage: core.readNormalizedUsage(response.providerMetadata),
            errorCode: new core.LLMConfigurationError(["LLM_API_KEY"]).code,
            failureReason: core.classifyTransientModelFailure({ status: 429 })?.reason,
        };
        break;
    }
    case "config": {
        const config = await import(entry("packages/config/src/index.ts"));
        const parsed = config.readLLMConfig({ LLM_PROVIDER: "openai", LLM_MODEL: "gpt-4.1-mini", LLM_API_KEY: "probe" });
        artifacts = { provider: parsed.provider, mode: parsed.structuredOutputMode };
        break;
    }
    case "llm-google": {
        const { Gemini } = await import(entry("packages/llm-google/src/index.ts"));
        const instance = new Gemini({ apiKey: "probe-key", model: "gemini-2.5-flash", structuredOutputMode: "strict" });
        artifacts = { mode: instance.structuredOutputMode, endpoint: instance.nativeConversationIdentity.endpoint };
        break;
    }
    case "llm-pi-ai": {
        const { PiAiAdapter } = await import(entry("packages/llm-pi-ai/src/index.ts"));
        const instance = new PiAiAdapter({
            provider: "anthropic", apiKey: "probe-key", model: "claude-sonnet-4-5", structuredOutputMode: "prompt_only",
        });
        artifacts = { mode: instance.structuredOutputMode };
        break;
    }
    case "model-catalog": {
        const catalogModule = await import(entry("packages/model-catalog/src/index.ts"));
        const catalog = new catalogModule.DefaultLlmModelCatalog({
            sources: [{
                provider: "openai",
                protocol: "chat-completions",
                staticModels: [{
                    id: "gpt-4o", displayName: "GPT-4o",
                    contextWindowTokens: 128_000, maxOutputTokens: 4096,
                }],
            }],
            isProtocolImplemented: () => true,
        });
        const models = await catalog.list({
            provider: "openai", model: "gpt-4o", apiKey: "probe-key", structuredOutputMode: "prompt_only",
        }, { requireTokenCapacity: false });
        artifacts = { descriptorCount: models.length };
        break;
    }
    default:
        throw new Error(`unknown scenario: ${scenario}`);
}

process.stdout.write(JSON.stringify({ resolvedModules, networkCalls, registeredEvents, exitCalled, envReads, artifacts }) + "\n");
