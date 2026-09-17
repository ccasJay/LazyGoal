import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadRuntimeConfig } from "../src/config-loader";
import { resolveXdgPaths } from "../src/xdg";
import { LlmConfigurationError } from "../src/config";

test("loadRuntimeConfig 遵循四层覆盖优先级", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-loader-test-"));
    try {
        const xdgPaths = resolveXdgPaths({ XDG_CONFIG_HOME: tempDir });
        await mkdir(xdgPaths.lazygoalConfigDir, { recursive: true });
        await mkdir(xdgPaths.profilesDir, { recursive: true });

        // 1. 写入 config.toml
        await writeFile(xdgPaths.configFile, `
[llm]
provider = "openai"
model = "gpt-4o-mini"
api_key = "sk-config-key"

[profile]
active = "work"
`);

        // 2. 写入 profile.toml
        await writeFile(join(xdgPaths.profilesDir, "work.toml"), `
[llm]
model = "gpt-4o"
`);

        // 3. 首次加载：profile 覆盖 config.toml 的 model
        const config1 = await loadRuntimeConfig({ xdgPaths });
        assert.equal(config1.llm.provider, "openai");
        assert.equal(config1.llm.model, "gpt-4o"); // 来自 profile
        assert.equal(config1.llm.apiKey, "sk-config-key"); // 来自 config.toml
        assert.equal(config1.llm.structuredOutputMode, "prompt_only"); // 内置默认值
        assert.equal(config1.activeProfile, "work");

        // 4. 二次加载：CLI 临时参数覆盖 model
        const originalFileContent = await readFile(xdgPaths.configFile, "utf-8");
        const config2 = await loadRuntimeConfig({
            xdgPaths,
            cliArgs: { model: "claude-3-7-sonnet" },
        });
        assert.equal(config2.llm.model, "claude-3-7-sonnet"); // 来自 CLI 覆盖

        // 5. 校验磁盘文件未被修改
        const currentFileContent = await readFile(xdgPaths.configFile, "utf-8");
        assert.equal(currentFileContent, originalFileContent);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("loadRuntimeConfig 缺少必填项时快速失败并提示配置路径", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-loader-fail-test-"));
    try {
        const xdgPaths = resolveXdgPaths({ XDG_CONFIG_HOME: tempDir });
        await assert.rejects(
            async () => loadRuntimeConfig({ xdgPaths }),
            (err: unknown) => {
                assert.ok(err instanceof LlmConfigurationError);
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
        const xdgPaths = resolveXdgPaths({ XDG_CONFIG_HOME: tempDir });
        await mkdir(xdgPaths.lazygoalConfigDir, { recursive: true });

        await writeFile(xdgPaths.configFile, `
[llm]
provider = "openai"
model = "gpt-4o"
api_key = "sk-test"
`);

        const config = await loadRuntimeConfig({ xdgPaths });
        assert.equal(config.llm.provider, "openai");
        assert.equal(config.llm.model, "gpt-4o");
        assert.equal(config.llm.apiKey, "sk-test");
        assert.ok(config.llm.structuredOutputMode !== undefined);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});
