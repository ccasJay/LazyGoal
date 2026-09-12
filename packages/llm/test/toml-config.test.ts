import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
    parseTomlConfig,
    parseProfileToml,
    loadProfileToml,
    TomlConfigurationError,
} from "../src/toml-config";

test("parseTomlConfig 正常解析各小节配置", () => {
    const toml = `
[llm]
provider = "openai-compatible"
model = "gpt-4o"
api_key = "sk-test"
base_url = "https://api.example.com/v1"
structured_output_mode = "strict"

[workspace]
root = "/custom/project"

[profile]
active = "deepseek"

[tui]
execution_mode = "confirm"
`;
    const config = parseTomlConfig(toml, "/path/to/config.toml");
    assert.equal(config.llm?.provider, "openai-compatible");
    assert.equal(config.llm?.model, "gpt-4o");
    assert.equal(config.llm?.api_key, "sk-test");
    assert.equal(config.llm?.base_url, "https://api.example.com/v1");
    assert.equal(config.llm?.structured_output_mode, "strict");
    assert.equal(config.workspace?.root, "/custom/project");
    assert.equal(config.profile?.active, "deepseek");
    assert.equal(config.tui?.execution_mode, "confirm");
});

test("parseTomlConfig 遇到语法错误精准报告行号", () => {
    const invalidToml = `
[llm]
provider = "openai"
invalid toml line without equal
`;
    assert.throws(
        () => parseTomlConfig(invalidToml, "/tmp/config.toml"),
        (err: unknown) => {
            assert.ok(err instanceof TomlConfigurationError);
            assert.match(err.message, /TOML 语法错误/);
            assert.match(err.message, /config\.toml/);
            return true;
        },
    );
});

test("parseTomlConfig 遇到未知小节时快速失败", () => {
    const unknownSection = `
[unknown_section]
foo = "bar"
`;
    assert.throws(
        () => parseTomlConfig(unknownSection),
        (err: unknown) => {
            assert.ok(err instanceof TomlConfigurationError);
            assert.match(err.message, /未知的配置小节: \[unknown_section\]/);
            return true;
        },
    );
});

test("parseTomlConfig 遇到 [llm] 中的未知字段时快速失败", () => {
    const unknownField = `
[llm]
provider = "openai"
unknown_field = 123
`;
    assert.throws(
        () => parseTomlConfig(unknownField),
        (err: unknown) => {
            assert.ok(err instanceof TomlConfigurationError);
            assert.match(err.message, /\[llm\] 小节包含未知字段: unknown_field/);
            return true;
        },
    );
});

test("parseProfileToml 正常解析 Profile 内容", () => {
    const toml = `
name = "deepseek"
description = "DeepSeek Profile"

[llm]
provider = "deepseek"
model = "deepseek-chat"
`;
    const profile = parseProfileToml(toml);
    assert.equal(profile.name, "deepseek");
    assert.equal(profile.description, "DeepSeek Profile");
    assert.equal(profile.llm?.provider, "deepseek");
    assert.equal(profile.llm?.model, "deepseek-chat");
});

test("loadProfileToml 成功读取指定 Profile", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-profile-test-"));
    try {
        await writeFile(join(tempDir, "default.toml"), "name = 'default'\n[llm]\nmodel = 'gpt-4o'");
        const profile = await loadProfileToml("default", tempDir);
        assert.equal(profile.name, "default");
        assert.equal(profile.llm?.model, "gpt-4o");
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("loadProfileToml 在 Profile 缺失时报错并列出可用候选", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "lazygoal-profile-test-"));
    try {
        await writeFile(join(tempDir, "default.toml"), "name = 'default'");
        await writeFile(join(tempDir, "deepseek.toml"), "name = 'deepseek'");

        await assert.rejects(
            async () => loadProfileToml("nonexistent", tempDir),
            (err: unknown) => {
                assert.ok(err instanceof TomlConfigurationError);
                assert.match(err.message, /Profile "nonexistent" 不存在/);
                assert.match(err.message, /当前可用 Profile:/);
                assert.match(err.message, /default/);
                assert.match(err.message, /deepseek/);
                return true;
            },
        );
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});
