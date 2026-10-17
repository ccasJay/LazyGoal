import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadRuntimeConfig, loadReflectionRuntimeConfig, loadGepaModelConfigs, resolveLazyGoalHomePaths, TomlConfigurationError, readLLMConfig } from "../src/index";
import { LLMConfigurationError } from "../../llm-core/src/index";

test("loadRuntimeConfig 遵循四层覆盖优先级", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-loader-test-"));
    try {
        const homePaths = resolveLazyGoalHomePaths({ LAZYGOAL_HOME: tempDir });
        await mkdir(homePaths.homeDirectory, { recursive: true });
        await mkdir(homePaths.profilesDir, { recursive: true });

        // 1. 写入 config.toml
        await writeFile(homePaths.configFile, `
[llm]
provider = "openai"
model = "gpt-4o-mini"
api_key = "sk-config-key"

[profile]
active = "work"
`);

        // 2. 写入 profile.toml
        await writeFile(join(homePaths.profilesDir, "work.toml"), `
[llm]
model = "gpt-4o"
`);

        // 3. 首次加载：profile 覆盖 config.toml 的 model
        const config1 = await loadRuntimeConfig({ homePaths });
        assert.equal(config1.llm.provider, "openai");
        assert.equal(config1.llm.model, "gpt-4o"); // 来自 profile
        assert.equal(config1.llm.apiKey, "sk-config-key"); // 来自 config.toml
        assert.equal(config1.llm.structuredOutputMode, "prompt_only"); // 内置默认值
        assert.equal(config1.activeProfile, "work");

        // 4. 二次加载：CLI 临时参数覆盖 model
        const originalFileContent = await readFile(homePaths.configFile, "utf-8");
        const config2 = await loadRuntimeConfig({
            homePaths,
            cliArgs: { model: "claude-3-7-sonnet" },
        });
        assert.equal(config2.llm.model, "claude-3-7-sonnet"); // 来自 CLI 覆盖

        // 5. 校验磁盘文件未被修改
        const currentFileContent = await readFile(homePaths.configFile, "utf-8");
        assert.equal(currentFileContent, originalFileContent);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("loadRuntimeConfig 缺少必填项时快速失败并提示配置路径", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-loader-fail-test-"));
    try {
        const homePaths = resolveLazyGoalHomePaths({ LAZYGOAL_HOME: tempDir });
        await assert.rejects(
            async () => loadRuntimeConfig({ homePaths }),
            (err: unknown) => {
                assert.ok(err instanceof LLMConfigurationError);
                assert.match(err.message, /缺少必要的 LLM 配置项/);
                assert.match(err.message, /config\.toml/);
                return true;
            },
        );
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("需求 5.1: 用户配置 config.toml 时无需指定 structured_output_mode 即可成功加载运行", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-loader-no-mode-"));
    try {
        const homePaths = resolveLazyGoalHomePaths({ LAZYGOAL_HOME: tempDir });
        await mkdir(homePaths.homeDirectory, { recursive: true });

        await writeFile(homePaths.configFile, `
[llm]
provider = "openai"
model = "gpt-4o"
api_key = "sk-test"
`);

        const config = await loadRuntimeConfig({ homePaths });
        assert.equal(config.llm.provider, "openai");
        assert.equal(config.llm.model, "gpt-4o");
        assert.equal(config.llm.apiKey, "sk-test");
        assert.ok(config.llm.structuredOutputMode !== undefined);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("loadGepaModelConfigs 正常双 Profile 独立解析与凭据隔离", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-gepa-loader-"));
    try {
        const homePaths = resolveLazyGoalHomePaths({ LAZYGOAL_HOME: tempDir });
        await mkdir(homePaths.homeDirectory, { recursive: true });
        await mkdir(homePaths.profilesDir, { recursive: true });

        // 1. 写入 config.toml，包含 [gepa].reflection_profile
        await writeFile(homePaths.configFile, `
[gepa]
reflection_profile = "gepa-reflection"
`);

        // 2. 写入 profiles/default.toml (Working LM)
        await writeFile(join(homePaths.profilesDir, "default.toml"), `
[llm]
provider = "openai"
model = "gpt-4o"
api_key = "sk-working-key"
`);

        // 3. 写入 profiles/gepa-reflection.toml (Reflection LM)
        await writeFile(join(homePaths.profilesDir, "gepa-reflection.toml"), `
[llm]
provider = "deepseek"
model = "deepseek-chat"
api_key = "sk-reflection-key"
`);

        const configs = await loadGepaModelConfigs({ homePaths });

        // 校验 Working LM
        assert.equal(configs.working.provider, "openai");
        assert.equal(configs.working.model, "gpt-4o");
        assert.equal(configs.working.apiKey, "sk-working-key");

        // 校验 Reflection LM
        assert.equal(configs.reflection.provider, "deepseek");
        assert.equal(configs.reflection.model, "deepseek-chat");
        assert.equal(configs.reflection.apiKey, "sk-reflection-key");
        assert.equal(configs.reflection.structuredOutputMode, "prompt_only");
        assert.equal(configs.workingProfileName, "default");
        assert.equal(configs.reflectionProfileName, "gepa-reflection");

        // 确保两者为不同对象且凭据相互隔离
        assert.notEqual(configs.working, configs.reflection);
        assert.notEqual(configs.working.apiKey, configs.reflection.apiKey);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("loadReflectionRuntimeConfig 遇到同名 default 时快速失败", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-gepa-conflict-"));
    try {
        const homePaths = resolveLazyGoalHomePaths({ LAZYGOAL_HOME: tempDir });
        await mkdir(homePaths.homeDirectory, { recursive: true });

        await writeFile(homePaths.configFile, `
[gepa]
reflection_profile = "default"
`);

        await assert.rejects(
            async () => loadReflectionRuntimeConfig({ homePaths }),
            (err: unknown) => {
                assert.ok(err instanceof TomlConfigurationError);
                assert.match(err.message, /reflection_profile 不能与 Working Profile 同名 \("default"\)/);
                return true;
            },
        );
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("loadReflectionRuntimeConfig 遇到路径穿越或非法字符时快速失败", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-gepa-traversal-"));
    try {
        const homePaths = resolveLazyGoalHomePaths({ LAZYGOAL_HOME: tempDir });
        await mkdir(homePaths.homeDirectory, { recursive: true });

        await writeFile(homePaths.configFile, `
[gepa]
reflection_profile = "../secret"
`);

        await assert.rejects(
            async () => loadReflectionRuntimeConfig({ homePaths }),
            (err: unknown) => {
                assert.ok(err instanceof TomlConfigurationError);
                assert.match(err.message, /reflection_profile 包含非法字符/);
                return true;
            },
        );
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("loadReflectionRuntimeConfig 缺少 [gepa] 配置时快速失败", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-gepa-missing-section-"));
    try {
        const homePaths = resolveLazyGoalHomePaths({ LAZYGOAL_HOME: tempDir });
        await mkdir(homePaths.homeDirectory, { recursive: true });

        await writeFile(homePaths.configFile, `
[llm]
provider = "openai"
model = "gpt-4o"
api_key = "sk-test"
`);

        await assert.rejects(
            async () => loadReflectionRuntimeConfig({ homePaths }),
            (err: unknown) => {
                assert.ok(err instanceof TomlConfigurationError);
                assert.match(err.message, /缺少必要的 \[gepa\]\.reflection_profile 配置项/);
                return true;
            },
        );
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("loadReflectionRuntimeConfig 在目标 Profile 不存在时报错并列出可用候选", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-gepa-missing-file-"));
    try {
        const homePaths = resolveLazyGoalHomePaths({ LAZYGOAL_HOME: tempDir });
        await mkdir(homePaths.homeDirectory, { recursive: true });
        await mkdir(homePaths.profilesDir, { recursive: true });

        await writeFile(homePaths.configFile, `
[gepa]
reflection_profile = "missing-reflection"
`);
        await writeFile(join(homePaths.profilesDir, "default.toml"), "name = 'default'\n");

        await assert.rejects(
            async () => loadReflectionRuntimeConfig({ homePaths }),
            (err: unknown) => {
                assert.ok(err instanceof TomlConfigurationError);
                assert.match(err.message, /Profile "missing-reflection" 不存在/);
                assert.match(err.message, /当前可用 Profile:/);
                return true;
            },
        );
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("loadGepaModelConfigs 中 Working Profile 不受 [profile].active 影响", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-gepa-active-ignore-"));
    try {
        const homePaths = resolveLazyGoalHomePaths({ LAZYGOAL_HOME: tempDir });
        await mkdir(homePaths.homeDirectory, { recursive: true });
        await mkdir(homePaths.profilesDir, { recursive: true });

        // config.toml 设置 active 为 "custom-work"
        await writeFile(homePaths.configFile, `
[profile]
active = "custom-work"

[gepa]
reflection_profile = "reflection"
`);

        // default.toml (Working LM)
        await writeFile(join(homePaths.profilesDir, "default.toml"), `
[llm]
provider = "openai"
model = "gpt-4o"
api_key = "sk-default-key"
`);

        // custom-work.toml (active profile)
        await writeFile(join(homePaths.profilesDir, "custom-work.toml"), `
[llm]
provider = "openai"
model = "gpt-3.5-turbo"
api_key = "sk-custom-key"
`);

        // reflection.toml (Reflection LM)
        await writeFile(join(homePaths.profilesDir, "reflection.toml"), `
[llm]
provider = "deepseek"
model = "deepseek-chat"
api_key = "sk-reflection-key"
`);

        const configs = await loadGepaModelConfigs({ homePaths });
        // Working LM 必须固定读取 default.toml，而不是 custom-work.toml
        assert.equal(configs.working.model, "gpt-4o");
        assert.equal(configs.working.apiKey, "sk-default-key");
        assert.equal(configs.reflection.model, "deepseek-chat");
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("环境、TOML/Profile、CLI 覆盖与 GEPA 双模型错误使用同一配置错误身份", async () => {
    // 环境解析：缺失必填项
    assert.throws(() => readLLMConfig({}), (error: unknown) => {
        assert.ok(error instanceof LLMConfigurationError);
        assert.equal(error.name, "LLMConfigurationError");
        assert.equal(error.code, "INVALID_LLM_CONFIG");
        assert.deepEqual(error.missing, ["LLM_PROVIDER", "LLM_MODEL", "LLM_API_KEY"]);
        return true;
    });

    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-loader-identity-"));
    try {
        const homePaths = resolveLazyGoalHomePaths({ LAZYGOAL_HOME: tempDir });
        await mkdir(homePaths.homeDirectory, { recursive: true });

        // TOML：没有任何 [llm] 段时使用同一构造器与 missing 语义
        await assert.rejects(() => loadRuntimeConfig({ homePaths }), (error: unknown) => {
            assert.ok(error instanceof LLMConfigurationError);
            assert.equal(error.name, "LLMConfigurationError");
            assert.equal(error.code, "INVALID_LLM_CONFIG");
            assert.deepEqual(error.missing, ["provider", "model", "api_key"]);
            return true;
        });

        // CLI 覆盖：补齐必填项后成功；非法覆盖值仍抛同一错误
        const config = await loadRuntimeConfig({
            homePaths,
            cliArgs: { provider: "openai", model: "gpt-4o", apiKey: "sk-cli" },
        });
        assert.equal(config.llm.apiKey, "sk-cli");
        await assert.rejects(
            () => loadRuntimeConfig({
                homePaths,
                cliArgs: { provider: "openai", model: "gpt-4o", apiKey: "sk-cli", structuredOutputMode: "auto" },
            }),
            (error: unknown) => {
                assert.ok(error instanceof LLMConfigurationError);
                assert.equal(error.code, "INVALID_LLM_CONFIG");
                assert.equal(error.missing.length, 0);
                assert.match(error.message, /无效的 structured_output_mode/);
                return true;
            },
        );

        // GEPA 双模型：Reflection Profile 缺少凭据时使用同一错误构造器
        await writeFile(homePaths.configFile, `
[gepa]
reflection_profile = "reflection"
`);
        await mkdir(homePaths.profilesDir, { recursive: true });
        await writeFile(join(homePaths.profilesDir, "default.toml"), `
[llm]
provider = "openai"
model = "gpt-4o"
api_key = "sk-working"
`);
        await writeFile(join(homePaths.profilesDir, "reflection.toml"), `
[llm]
provider = "deepseek"
model = "deepseek-chat"
`);
        await assert.rejects(() => loadGepaModelConfigs({ homePaths }), (error: unknown) => {
            assert.ok(error instanceof LLMConfigurationError);
            assert.equal(error.name, "LLMConfigurationError");
            assert.equal(error.code, "INVALID_LLM_CONFIG");
            assert.deepEqual(error.missing, ["api_key"]);
            return true;
        });
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("two_stage 的环境与 TOML 既有差异保持：环境接受、TOML 对非原生供应商拒绝", async () => {
    const envConfig = readLLMConfig({
        LLM_PROVIDER: "anthropic",
        LLM_MODEL: "claude-sonnet-4-5",
        LLM_API_KEY: "sk-test",
        LLM_STRUCTURED_OUTPUT_MODE: "two_stage",
    });
    assert.equal(envConfig.structuredOutputMode, "two_stage");

    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-loader-two-stage-"));
    try {
        const homePaths = resolveLazyGoalHomePaths({ LAZYGOAL_HOME: tempDir });
        await mkdir(homePaths.homeDirectory, { recursive: true });
        await writeFile(homePaths.configFile, `
[llm]
provider = "anthropic"
model = "claude-sonnet-4-5"
api_key = "sk-test"
structured_output_mode = "two_stage"
`);
        await assert.rejects(() => loadRuntimeConfig({ homePaths }), (error: unknown) => {
            assert.ok(error instanceof LLMConfigurationError);
            assert.equal(error.code, "INVALID_LLM_CONFIG");
            assert.equal(error.missing.length, 0);
            assert.match(error.message, /不支持 two_stage 模式/);
            return true;
        });

        // 同一配置省略模式后成功，证明拒绝来自模式而非其它字段
        await writeFile(homePaths.configFile, `
[llm]
provider = "anthropic"
model = "claude-sonnet-4-5"
api_key = "sk-test"
`);
        const config = await loadRuntimeConfig({ homePaths });
        assert.equal(config.llm.structuredOutputMode, "prompt_only");
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});
