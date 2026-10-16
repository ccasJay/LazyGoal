import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveLazyGoalHomePaths, type LazyGoalHomePaths } from "../src/home";
import { maskProviderApiKey, ProviderProfileValidationError, validateProviderProfileDraft } from "../src/provider-profile";
import {
    JsonFileProviderProfileStore,
    ProviderProfileActiveDeletionError,
    ProviderProfileNotFoundError,
    ProviderProfileProtocolError,
} from "../src/provider-profile-store";

const OPENAI_KEY = "sk-canary-openai-abc123";
const ANTHROPIC_KEY = "sk-canary-anthropic-def456";
const PROFILE_FILE = "provider-profiles.json";

async function createHome(): Promise<LazyGoalHomePaths> {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-profiles-"));
    return resolveLazyGoalHomePaths({ LAZYGOAL_HOME: directory });
}

function draft(overrides: Record<string, unknown> = {}) {
    return {
        label: "OpenAI 主账号",
        kind: "openai",
        apiKey: OPENAI_KEY,
        defaultModel: "gpt-4o",
        ...overrides,
    };
}

test("Profile Store: 创建多份同 kind 档案、按 id 读取与更新时省略凭据保留原值", async () => {
    const home = await createHome();
    const store = new JsonFileProviderProfileStore(home);

    const first = await store.create(draft());
    const second = await store.create(draft({ label: "OpenAI 备用额度", apiKey: "sk-canary-openai-second", defaultModel: "gpt-4.1-mini" }));

    assert.notEqual(first.id, second.id);
    assert.equal(first.kind, "openai");
    assert.equal(first.apiKey, OPENAI_KEY);
    assert.deepEqual((await store.list()).map((profile) => profile.id), [first.id, second.id]);

    const renamed = await store.update(first.id, { label: "OpenAI 主账号（重命名）" });
    assert.equal(renamed.label, "OpenAI 主账号（重命名）");
    assert.equal(renamed.id, first.id);
    assert.equal(renamed.apiKey, OPENAI_KEY, "省略 apiKey 必须保留原凭据");

    const rotated = await store.update(first.id, { apiKey: "sk-canary-openai-rotated" });
    assert.equal(rotated.apiKey, "sk-canary-openai-rotated", "显式提供 apiKey 必须替换");

    const stored = JSON.parse(await readFile(join(home.homeDirectory, PROFILE_FILE), "utf8")) as { version: number };
    assert.equal(stored.version, 1);
});

test("Profile Store: 以 0600 原子写入且不残留临时文件", async () => {
    const home = await createHome();
    const store = new JsonFileProviderProfileStore(home);
    await store.create(draft());

    const file = join(home.homeDirectory, PROFILE_FILE);
    const mode = (await stat(file)).mode & 0o777;
    if (process.platform !== "win32") assert.equal(mode, 0o600);
    assert.deepEqual((await readdir(home.homeDirectory)).filter((name) => name.endsWith(".tmp")), []);
});

test("Profile Store: 损坏内容与不支持的 schema 版本 fail-fast", async () => {
    const corrupted = await createHome();
    await writeFile(join(corrupted.homeDirectory, PROFILE_FILE), "{ not json", { encoding: "utf8", mode: 0o600 });
    await assert.rejects(
        new JsonFileProviderProfileStore(corrupted).list(),
        (error: unknown) => error instanceof ProviderProfileProtocolError,
    );

    const unsupported = await createHome();
    await writeFile(
        join(unsupported.homeDirectory, PROFILE_FILE),
        JSON.stringify({ version: 2, profiles: [] }),
        { encoding: "utf8", mode: 0o600 },
    );
    await assert.rejects(
        new JsonFileProviderProfileStore(unsupported).list(),
        (error: unknown) => error instanceof ProviderProfileProtocolError,
    );

    const invalidProfile = await createHome();
    await writeFile(
        join(invalidProfile.homeDirectory, PROFILE_FILE),
        JSON.stringify({ version: 1, profiles: [{ ...draft({ kind: "anthropic", defaultModel: "claude-sonnet-4-5" }), id: "profile-1", structuredOutputMode: "strict" }] }),
        { encoding: "utf8", mode: 0o600 },
    );
    await assert.rejects(
        new JsonFileProviderProfileStore(invalidProfile).list(),
        (error: unknown) => error instanceof ProviderProfileProtocolError,
    );
});

test("Profile Store: 空 Store 不创建文件且不导入 config.toml 凭据", async () => {
    const home = await createHome();
    await writeFile(
        join(home.homeDirectory, "config.toml"),
        `[llm]\nprovider = "openai"\nmodel = "gpt-4o"\napi_key = "${OPENAI_KEY}"\n`,
        { encoding: "utf8", mode: 0o600 },
    );

    const store = new JsonFileProviderProfileStore(home);
    assert.deepEqual(await store.list(), []);
    assert.equal(await store.activeProfileId(), undefined);
    await assert.rejects(stat(join(home.homeDirectory, PROFILE_FILE)));

    const configContent = await readFile(join(home.homeDirectory, "config.toml"), "utf8");
    assert.match(configContent, /api_key/, "回退配置不得被改写");
});

test("Profile Store: Provider 规则校验在落盘前失败", async () => {
    const home = await createHome();
    const store = new JsonFileProviderProfileStore(home);

    const strictAnthropic = draft({ kind: "anthropic", defaultModel: "claude-sonnet-4-5", structuredOutputMode: "strict" });
    await assert.rejects(
        store.create(strictAnthropic),
        (error: unknown) => error instanceof ProviderProfileValidationError && error.fields.includes("structured_output_mode"),
    );

    const baseUrlOnDeepseek = draft({ kind: "deepseek", defaultModel: "deepseek-v4-pro", baseURL: "https://api.deepseek.com" });
    await assert.rejects(
        store.create(baseUrlOnDeepseek),
        (error: unknown) => error instanceof ProviderProfileValidationError && error.fields.includes("base_url"),
    );

    await assert.rejects(
        store.create(draft({ kind: "openai-compatible", baseURL: "https://gateway.example/v1", defaultModel: "local-model" })),
        (error: unknown) => error instanceof ProviderProfileValidationError
            && error.fields.includes("context_window_tokens")
            && error.fields.includes("max_output_tokens"),
    );

    await assert.rejects(
        store.create(draft({ kind: "openai-compatible", baseURL: "https://gateway.example/v1", contextWindowTokens: 4096, maxOutputTokens: 4096, defaultModel: "local-model" })),
        (error: unknown) => error instanceof ProviderProfileValidationError && error.fields.includes("max_output_tokens"),
    );

    await assert.rejects(
        store.create(draft({ baseURL: "https://user:secret@gateway.example/v1" })),
        (error: unknown) => error instanceof ProviderProfileValidationError && error.fields.includes("base_url"),
    );

    await assert.rejects(
        store.create(draft({ kind: "unknown-vendor" })),
        (error: unknown) => error instanceof ProviderProfileValidationError && error.fields.includes("kind"),
    );

    await assert.rejects(
        store.create(draft({ label: `旋转前的 ${OPENAI_KEY}` })),
        (error: unknown) => error instanceof ProviderProfileValidationError && error.fields.includes("label"),
    );

    await assert.rejects(
        store.create(draft({ apiKey: "   " })),
        (error: unknown) => error instanceof ProviderProfileValidationError && error.fields.includes("api_key"),
    );

    await assert.rejects(stat(join(home.homeDirectory, PROFILE_FILE)), "校验失败不得创建 Store 文件");
});

test("Profile Store: 激活标识往返、删除激活被拒、删除其它返回被删档案", async () => {
    const home = await createHome();
    const store = new JsonFileProviderProfileStore(home);

    const active = await store.create(draft());
    const other = await store.create(draft({ label: "OpenAI 备用额度", apiKey: ANTHROPIC_KEY, defaultModel: "gpt-4.1-mini" }));

    await store.setActive(active.id);
    assert.equal(await store.activeProfileId(), active.id);

    await assert.rejects(
        store.delete(active.id),
        (error: unknown) => error instanceof ProviderProfileActiveDeletionError && error.profileId === active.id,
    );
    assert.equal((await store.list()).length, 2, "被拒删除不得改变集合");

    const deleted = await store.delete(other.id);
    assert.equal(deleted.id, other.id);
    assert.deepEqual((await store.list()).map((profile) => profile.id), [active.id]);

    await assert.rejects(
        store.update("missing-profile", { label: "x" }),
        (error: unknown) => error instanceof ProviderProfileNotFoundError && error.profileId === "missing-profile",
    );
    await assert.rejects(
        store.setActive("missing-profile"),
        (error: unknown) => error instanceof ProviderProfileNotFoundError,
    );
    await assert.rejects(
        store.delete("missing-profile"),
        (error: unknown) => error instanceof ProviderProfileNotFoundError,
    );
});

test("Profile Store: 掩码与校验函数不泄漏明文凭据", () => {
    assert.equal(maskProviderApiKey(OPENAI_KEY).includes(OPENAI_KEY), false);
    assert.equal(maskProviderApiKey("short").includes("short"), false);
    assert.equal(maskProviderApiKey(""), "");

    const validated = validateProviderProfileDraft(draft());
    assert.equal(validated.kind, "openai");
    assert.equal(validated.apiKey, OPENAI_KEY);

    const compatible = validateProviderProfileDraft(draft({
        kind: "openai-compatible",
        baseURL: "https://gateway.example/v1",
        contextWindowTokens: 32768,
        maxOutputTokens: 4096,
        defaultModel: "local-model",
    }));
    assert.equal(compatible.contextWindowTokens, 32768);
    assert.equal(compatible.maxOutputTokens, 4096);
    assert.equal(compatible.structuredOutputMode, undefined);
});
