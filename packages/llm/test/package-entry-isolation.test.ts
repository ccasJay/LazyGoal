import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

/**
 * 入口与构造隔离。
 *
 * 为 core、Config、每个供应商适配包与模型目录分别在独立子进程中导入公共入口并构造实例，
 * 断言导入与构造期间：零网络请求、零进程事件注册、零退出调用、不读取隐式或跨供应商凭据，
 * 且单个适配包不经 LazyGoal 源码加载其它适配包或默认装配门面。类型依赖由静态类型检查另行覆盖。
 */
interface ProbeResult {
    readonly resolvedModules: readonly string[];
    readonly networkCalls: number;
    readonly registeredEvents: readonly string[];
    readonly exitCalled: boolean;
    readonly envReads: readonly string[];
    readonly artifacts: Record<string, unknown>;
}

interface ScenarioDefinition {
    /** 探针必须解析到该入口路径前缀。 */
    readonly entryMarker: string;
    /** 允许被读取的供应商标准环境键（第三方 SDK 内部行为）。 */
    readonly allowedProviderEnvKeys: readonly string[];
    /** 在解析模块 URL 中禁止出现的路径标记。 */
    readonly forbiddenModuleMarkers: readonly string[];
    /** 构造与调用必须产出的确定性事实。 */
    readonly expectedArtifacts: Record<string, unknown>;
    /** 非固定取值的附加断言。 */
    readonly validateArtifacts?: (artifacts: Record<string, unknown>) => void;
}

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const probePath = fileURLToPath(new URL("./entry-isolation-probe.ts", import.meta.url));
const tsxBin = join(repoRoot, "node_modules", ".bin", "tsx");

/** LazyGoal 自有配置键；任何入口都不得在导入或构造期间隐式读取。 */
const LLM_ENV_KEYS = ["LLM_PROVIDER", "LLM_MODEL", "LLM_API_KEY", "LLM_BASE_URL", "LAZYGOAL_HOME"];

const PROVIDER_ENV_KEYS = {
    openai: ["OPENAI_API_KEY"],
    google: ["GOOGLE_API_KEY", "GEMINI_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS"],
    anthropic: ["ANTHROPIC_API_KEY"],
    openrouter: ["OPENROUTER_API_KEY"],
    deepseek: ["DEEPSEEK_API_KEY"],
} as const;

const ALL_PROVIDER_ENV_KEYS = Object.values(PROVIDER_ENV_KEYS).flat();

const SIGNAL_EVENTS = ["SIGINT", "SIGTERM", "SIGHUP", "exit", "beforeExit", "uncaughtException", "unhandledRejection"];

const SCENARIOS: Record<string, ScenarioDefinition> = {
    "llm-core": {
        entryMarker: "/packages/llm-core/src/index.ts",
        allowedProviderEnvKeys: [],
        forbiddenModuleMarkers: [
            "/node_modules/",
            "/packages/llm-openai/",
            "/packages/llm-google/",
            "/packages/llm-pi-ai/",
            "/packages/model-catalog/",
            "/packages/llm/src/",
            "/packages/config/src/",
        ],
        expectedArtifacts: {
            usage: { inputTokens: 1, outputTokens: 2 },
            errorCode: "INVALID_LLM_CONFIG",
            failureReason: "rate_limited",
        },
    },
    config: {
        entryMarker: "/packages/config/src/index.ts",
        allowedProviderEnvKeys: [],
        forbiddenModuleMarkers: [
            "/node_modules/openai/",
            "/node_modules/@google/genai/",
            "/node_modules/@earendil-works/",
            "/packages/llm-openai/",
            "/packages/llm-google/",
            "/packages/llm-pi-ai/",
            "/packages/model-catalog/",
            "/packages/llm/src/",
        ],
        expectedArtifacts: { provider: "openai" },
    },
    "llm-google": {
        entryMarker: "/packages/llm-google/src/index.ts",
        allowedProviderEnvKeys: PROVIDER_ENV_KEYS.google,
        forbiddenModuleMarkers: [
            "/packages/llm-openai/",
            "/packages/llm-pi-ai/",
            "/packages/model-catalog/",
            "/packages/llm/src/",
            "/node_modules/openai/",
            "/node_modules/@earendil-works/",
        ],
        expectedArtifacts: { endpoint: "https://generativelanguage.googleapis.com/v1beta" },
    },
    "llm-pi-ai": {
        entryMarker: "/packages/llm-pi-ai/src/index.ts",
        allowedProviderEnvKeys: [],
        forbiddenModuleMarkers: [
            "/packages/llm-openai/",
            "/packages/llm-google/",
            "/packages/model-catalog/",
            "/packages/llm/src/",
        ],
        expectedArtifacts: {},
    },
    "model-catalog": {
        entryMarker: "/packages/model-catalog/src/index.ts",
        allowedProviderEnvKeys: [],
        forbiddenModuleMarkers: [
            "/packages/llm-openai/",
            "/packages/llm-google/",
            "/packages/llm-pi-ai/",
            "/packages/llm/src/",
        ],
        expectedArtifacts: {},
        validateArtifacts: artifacts => {
            assert.ok(
                typeof artifacts.descriptorCount === "number" && artifacts.descriptorCount > 0,
                "离线目录查询必须返回描述符",
            );
        },
    },
};

function runProbe(scenario: string): ProbeResult {
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" };
    for (const key of [...LLM_ENV_KEYS, ...ALL_PROVIDER_ENV_KEYS]) env[key] = "canary-secret-value";
    const stdout = execFileSync(tsxBin, [probePath, scenario], {
        cwd: repoRoot,
        env,
        encoding: "utf8",
        timeout: 180_000,
    });
    return JSON.parse(stdout) as ProbeResult;
}

for (const [scenario, definition] of Object.entries(SCENARIOS)) {
    test(`入口隔离：${scenario} 导入与构造零请求、零宿主副作用、零越界加载`, () => {
        const result = runProbe(scenario);

        assert.ok(
            result.resolvedModules.some(url => url.includes(definition.entryMarker)),
            `${scenario} 探针必须解析目标入口`,
        );
        assert.equal(result.networkCalls, 0, "导入与构造不得发起网络请求");
        assert.equal(result.exitCalled, false, "导入与构造不得调用 process.exit");
        assert.deepEqual(
            result.registeredEvents.filter(event => SIGNAL_EVENTS.includes(event)),
            [],
            "导入与构造不得注册信号或退出事件",
        );

        const allowedProviderKeys = new Set(definition.allowedProviderEnvKeys);
        const forbiddenEnvKeys = new Set([
            ...LLM_ENV_KEYS,
            ...ALL_PROVIDER_ENV_KEYS.filter(key => !allowedProviderKeys.has(key as never)),
        ]);
        assert.deepEqual(
            result.envReads.filter(key => forbiddenEnvKeys.has(key as never)),
            [],
            "不得隐式读取 LazyGoal 配置键或跨供应商凭据",
        );

        assert.deepEqual(
            result.resolvedModules.filter(url => definition.forbiddenModuleMarkers.some(marker => url.includes(marker))),
            [],
            "单个能力包不得经 LazyGoal 源码加载其它适配包、目录或默认门面",
        );

        for (const [key, value] of Object.entries(definition.expectedArtifacts)) {
            assert.deepEqual(result.artifacts[key], value, `artifacts.${key}`);
        }
        definition.validateArtifacts?.(result.artifacts);
    });
}
