import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
    loadRuntimeConfig,
    loadReflectionRuntimeConfig,
    loadGepaModelConfigs,
    resolveLazyGoalHomePaths,
    readLLMConfig,
    TomlConfigurationError,
} from "../src/index";
import { LLMConfigurationError } from "../../llm-core/src/index";

const CONFIG_TOML = `
[providers.openai.main]
api_key = "sk-openai"

[[providers.openai.main.models]]
id = "gpt-4o-mini"
context_window = 128000
max_output_tokens = 16384

[[providers.openai.main.models]]
id = "gpt-4o"
context_window = 128000
max_output_tokens = 16384

[llm]
provider = "main"
model = "gpt-4o-mini"
`;

async function withHome(run: (homePaths: ReturnType<typeof resolveLazyGoalHomePaths>) => Promise<void>): Promise<void> {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-loader-test-"));
    try {
        const homePaths = resolveLazyGoalHomePaths({ LAZYGOAL_HOME: tempDir });
        await mkdir(homePaths.homeDirectory, { recursive: true });
        await mkdir(homePaths.profilesDir, { recursive: true });
        await run(homePaths);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
}

test("loadRuntimeConfig 按 provider 声明解析连接，profile 与 CLI 只覆盖引用", async () => {
    await withHome(async (homePaths) => {
        await writeFile(homePaths.configFile, CONFIG_TOML);
        await writeFile(join(homePaths.profilesDir, "work.toml"), `
name = "work"
[llm]
provider = "main"
model = "gpt-4o"
`);
        await writeFile(homePaths.configFile, `${CONFIG_TOML}\n[profile]\nactive = "work"\n`);

        const config = await loadRuntimeConfig({ homePaths });
        assert.equal(config.llm.provider, "main");
        assert.equal(config.llm.model, "gpt-4o");
        assert.equal(config.llm.apiKey, "sk-openai");
        assert.equal(config.llm.contextWindowTokens, 128_000);
        assert.equal(config.llm.maxOutputTokens, 16_384);
        assert.equal(config.activeProfile, "work");
        assert.equal(config.providers?.[0]?.family, "openai");
        assert.equal(config.providers?.[0]?.models.length, 2);

        const originalFileContent = await readFile(homePaths.configFile, "utf-8");
        const overridden = await loadRuntimeConfig({ homePaths, cliArgs: { model: "gpt-4o-mini" } });
        assert.equal(overridden.llm.model, "gpt-4o-mini");
        assert.equal(await readFile(homePaths.configFile, "utf-8"), originalFileContent);
    });
});

test("loadRuntimeConfig 缺少选型或引用不存在的供应商/模型时快速失败", async () => {
    await withHome(async (homePaths) => {
        await assert.rejects(
            loadRuntimeConfig({ homePaths }),
            (error: unknown) => error instanceof LLMConfigurationError
                && /缺少必要的 LLM 选型/.test(error.message)
                && /providers/.test(error.message),
        );

        await writeFile(homePaths.configFile, `
[providers.openai.main]
api_key = "sk-openai"
[[providers.openai.main.models]]
id = "gpt-4o"
context_window = 128000
max_output_tokens = 16384
[llm]
provider = "missing"
model = "gpt-4o"
`);
        await assert.rejects(
            loadRuntimeConfig({ homePaths }),
            (error: unknown) => error instanceof LLMConfigurationError && /未知供应商 "missing"/.test(error.message),
        );

        await writeFile(homePaths.configFile, `
[providers.openai.main]
api_key = "sk-openai"
[[providers.openai.main.models]]
id = "gpt-4o"
context_window = 128000
max_output_tokens = 16384
[llm]
provider = "main"
model = "missing-model"
`);
        await assert.rejects(
            loadRuntimeConfig({ homePaths }),
            (error: unknown) => error instanceof LLMConfigurationError && /未声明模型 "missing-model"/.test(error.message),
        );
    });
});

test("loadRuntimeConfig 拒绝未知供应商家族与非原生 strict 模式", async () => {
    await withHome(async (homePaths) => {
        await writeFile(homePaths.configFile, `
[providers.mystery.main]
api_key = "sk-test"
[[providers.mystery.main.models]]
id = "model"
context_window = 1024
max_output_tokens = 512
[llm]
provider = "main"
model = "model"
`);
        await assert.rejects(
            loadRuntimeConfig({ homePaths, knownProviderFamilies: ["openai", "openai-compatible"] }),
            (error: unknown) => error instanceof TomlConfigurationError && /未知的供应商家族: mystery/.test(error.message),
        );
    });
});

test("自定义 openai-compatible 连接只靠配置完成接入", async () => {
    await withHome(async (homePaths) => {
        await writeFile(homePaths.configFile, `
[providers.openai-compatible.mistral]
api_key = "sk-mistral"
base_url = "https://gateway.example.test/v1"

[[providers.openai-compatible.mistral.models]]
id = "mistral-large-latest"
display_name = "Mistral Large"
context_window = 131072
max_output_tokens = 8192
tools = true
native_structured_output = false

[llm]
provider = "mistral"
model = "mistral-large-latest"
`);
        const config = await loadRuntimeConfig({ homePaths, knownProviderFamilies: ["openai-compatible"] });
        assert.equal(config.llm.provider, "mistral");
        assert.equal(config.llm.baseURL, "https://gateway.example.test/v1");
        assert.equal(config.llm.apiKey, "sk-mistral");
        assert.equal(config.llm.nativeStructuredOutput, false);
        assert.equal(config.providers?.[0]?.models[0]?.displayName, "Mistral Large");
    });
});

test("loadGepaModelConfigs 用独立 provider 声明隔离双模型凭据", async () => {
    await withHome(async (homePaths) => {
        await writeFile(homePaths.configFile, `
[providers.openai.main]
api_key = "sk-working"
[[providers.openai.main.models]]
id = "gpt-4o"
context_window = 128000
max_output_tokens = 16384

[providers.openai.reflect]
api_key = "sk-reflection"
[[providers.openai.reflect.models]]
id = "gpt-4o"
context_window = 128000
max_output_tokens = 16384

[gepa]
reflection_profile = "gepa-reflection"
`);
        await writeFile(join(homePaths.profilesDir, "default.toml"), `
name = "default"
[llm]
provider = "main"
model = "gpt-4o"
`);
        await writeFile(join(homePaths.profilesDir, "gepa-reflection.toml"), `
name = "gepa-reflection"
[llm]
provider = "reflect"
model = "gpt-4o"
`);
        const configs = await loadGepaModelConfigs({ homePaths });
        assert.equal(configs.working.apiKey, "sk-working");
        assert.equal(configs.reflection.apiKey, "sk-reflection");
        assert.equal(configs.workingProfileName, "default");
        assert.equal(configs.reflectionProfileName, "gepa-reflection");
    });
});

test("loadReflectionRuntimeConfig 拒绝同名 default 与缺失的反射 Profile", async () => {
    await withHome(async (homePaths) => {
        await writeFile(homePaths.configFile, `
[providers.openai.main]
api_key = "sk-main"
[[providers.openai.main.models]]
id = "gpt-4o"
context_window = 128000
max_output_tokens = 16384
[gepa]
reflection_profile = "default"
`);
        await assert.rejects(
            loadReflectionRuntimeConfig({ homePaths }),
            (error: unknown) => error instanceof TomlConfigurationError && /不能与 Working Profile 同名/.test(error.message),
        );

        await writeFile(homePaths.configFile, `
[providers.openai.main]
api_key = "sk-main"
[[providers.openai.main.models]]
id = "gpt-4o"
context_window = 128000
max_output_tokens = 16384
[gepa]
reflection_profile = "missing-reflection"
`);
        await assert.rejects(
            loadReflectionRuntimeConfig({ homePaths }),
            (error: unknown) => error instanceof TomlConfigurationError && /不存在/.test(error.message),
        );
    });
});

test("loadGepaModelConfigs 的 Working Profile 不受 [profile].active 影响", async () => {
    await withHome(async (homePaths) => {
        await writeFile(homePaths.configFile, `
[providers.openai.main]
api_key = "sk-main"
[[providers.openai.main.models]]
id = "gpt-4o"
context_window = 128000
max_output_tokens = 16384

[providers.openai.other]
api_key = "sk-other"
[[providers.openai.other.models]]
id = "gpt-4o-mini"
context_window = 128000
max_output_tokens = 16384

[profile]
active = "reflection"

[gepa]
reflection_profile = "reflection"
`);
        await writeFile(join(homePaths.profilesDir, "default.toml"), `
name = "default"
[llm]
provider = "main"
model = "gpt-4o"
`);
        await writeFile(join(homePaths.profilesDir, "reflection.toml"), `
name = "reflection"
[llm]
provider = "other"
model = "gpt-4o-mini"
`);
        const configs = await loadGepaModelConfigs({ homePaths });
        assert.equal(configs.working.provider, "main");
        assert.equal(configs.reflection.provider, "other");
    });
});

test("环境、TOML 与 GEPA 错误使用同一配置错误身份", () => {
    assert.throws(
        () => readLLMConfig({ LLM_PROVIDER: "openai", LLM_MODEL: "gpt-4o" }),
        (error: unknown) => error instanceof LLMConfigurationError,
    );
});
