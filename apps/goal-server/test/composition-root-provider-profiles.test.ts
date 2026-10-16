import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    JsonFileProviderProfileStore,
    ProviderProfileResolutionError,
    resolveLazyGoalHomePaths,
} from "../../../packages/config/src/index";
import type { GoalModelSelection } from "../../../packages/runtime/src/index";
import { createGoal } from "../../../packages/runtime/src/index";
import { currentProtocols } from "../../../packages/runtime/test/current-fixtures";
import { createCompositionRoot, createDefaultToolPolicy } from "../src/composition-root";

const OPENAI_KEY = "sk-canary-profile-openai";
const ENV_KEY = "sk-canary-environment";

const agentProfile = {
    id: "default",
    systemPrompt: "System prompt",
    instructions: [],
    toolIds: [],
};

async function setup() {
    const root = await mkdtemp(join(tmpdir(), "lazygoal-provider-profiles-"));
    const home = join(root, "home");
    const workspace = join(root, "workspace");
    const dataDirectory = join(root, "data");
    await Promise.all([
        mkdir(home, { recursive: true }),
        mkdir(workspace, { recursive: true }),
        mkdir(dataDirectory, { recursive: true }),
    ]);
    return {
        home,
        workspace,
        dataDirectory,
        store: new JsonFileProviderProfileStore(resolveLazyGoalHomePaths({ LAZYGOAL_HOME: home })),
        env: { LAZYGOAL_HOME: home } as NodeJS.ProcessEnv,
        cleanup: async () => { await rm(root, { recursive: true, force: true }); },
    };
}

test("激活的受管档案解析为启动配置，并进入默认模型选择", async () => {
    const scoped = await setup();
    try {
        const profile = await scoped.store.create({
            label: "OpenAI 受管",
            kind: "openai",
            apiKey: OPENAI_KEY,
            defaultModel: "gpt-4.1-mini",
            baseURL: "https://gateway.example/v1",
        });
        await scoped.store.setActive(profile.id);

        const root = await createCompositionRoot({
            cwd: scoped.workspace,
            dataDirectory: scoped.dataDirectory,
            env: scoped.env,
            profile: agentProfile,
            toolPolicy: createDefaultToolPolicy(),
        });

        assert.equal(root.llmConfig?.provider, "openai");
        assert.equal(root.llmConfig?.apiKey, OPENAI_KEY);
        assert.equal(root.llmConfig?.model, "gpt-4.1-mini");
        assert.equal((root.llmConfig as { baseURL?: string } | undefined)?.baseURL, "https://gateway.example/v1");
        assert.equal(root.defaultModelSelection.profileId, profile.id);
        assert.deepEqual(root.providerProfiles.map((candidate) => candidate.id), [profile.id]);
    } finally {
        await scoped.cleanup();
    }
});

test("按档案解析指定模型，且不可解析档案显式失败而不回退", async () => {
    const scoped = await setup();
    try {
        const profile = await scoped.store.create({
            label: "OpenAI 受管",
            kind: "openai",
            apiKey: OPENAI_KEY,
            defaultModel: "gpt-4.1-mini",
            baseURL: "https://gateway.example/v1",
        });
        await scoped.store.setActive(profile.id);

        const root = await createCompositionRoot({
            cwd: scoped.workspace,
            dataDirectory: scoped.dataDirectory,
            env: scoped.env,
            profile: agentProfile,
            toolPolicy: createDefaultToolPolicy(),
        });

        const resolved = root.resolveProviderProfileConfig(profile.id, "gpt-4o");
        assert.equal(resolved.model, "gpt-4o");
        assert.equal(resolved.apiKey, OPENAI_KEY);
        assert.equal(resolved.provider, "openai");

        assert.throws(
            () => root.resolveProviderProfileConfig("missing-profile", "gpt-4o"),
            ProviderProfileResolutionError,
        );

        const before = root.modelBinding.current().selection;
        assert.throws(
            () => root.alignModelBinding({ ...before, profileId: "missing-profile", modelId: "gpt-4o" }),
            ProviderProfileResolutionError,
        );
        assert.deepEqual(
            root.modelBinding.current().selection,
            before,
            "解析失败不得改变当前绑定，也不得回退到启动配置",
        );
    } finally {
        await scoped.cleanup();
    }
});

test("切换选择到受管档案后绑定按该档案构造适配器", async () => {
    const scoped = await setup();
    try {
        const profile = await scoped.store.create({
            label: "OpenAI 受管",
            kind: "openai",
            apiKey: OPENAI_KEY,
            defaultModel: "gpt-4.1-mini",
            baseURL: "https://gateway.example/v1",
        });
        await scoped.store.setActive(profile.id);

        const root = await createCompositionRoot({
            cwd: scoped.workspace,
            dataDirectory: scoped.dataDirectory,
            env: scoped.env,
            profile: agentProfile,
            toolPolicy: createDefaultToolPolicy(),
        });

        const selection: GoalModelSelection = {
            ...root.defaultModelSelection,
            profileId: profile.id,
            modelId: "gpt-4o",
        };
        root.alignModelBinding(selection);

        assert.equal(root.modelBinding.current().selection.profileId, profile.id);
        assert.equal(root.modelBinding.current().selection.modelId, "gpt-4o");
    } finally {
        await scoped.cleanup();
    }
});

test("Goal 快照往返保留 profileId 且不携带明文凭据", async () => {
    const scoped = await setup();
    try {
        const profile = await scoped.store.create({
            label: "OpenAI 受管",
            kind: "openai",
            apiKey: OPENAI_KEY,
            defaultModel: "gpt-4.1-mini",
        });
        await scoped.store.setActive(profile.id);

        const root = await createCompositionRoot({
            cwd: scoped.workspace,
            dataDirectory: scoped.dataDirectory,
            env: scoped.env,
            profile: agentProfile,
            toolPolicy: createDefaultToolPolicy(),
        });

        const goal = createGoal({
            ...currentProtocols,
            promptBundleVersion: 1,
            id: "goal-profile-roundtrip",
            intent: "Round trip the managed profile selection",
            profile: root.profile,
            runId: "run-1",
            modelSelection: { ...root.defaultModelSelection, profileId: profile.id, modelId: "gpt-4o" },
        });
        await root.store.save(goal);

        const restored = await root.store.restore("goal-profile-roundtrip");
        assert.equal(restored?.state.modelSelection.profileId, profile.id);
        assert.equal(restored?.state.modelSelection.modelId, "gpt-4o");
        assert.equal(JSON.stringify(restored).includes(OPENAI_KEY), false, "快照不得包含明文凭据");
    } finally {
        await scoped.cleanup();
    }
});

test("环境变量优先于受管档案，未被选择时回退 config.toml", async () => {
    const scoped = await setup();
    try {
        const profile = await scoped.store.create({
            label: "OpenAI 受管",
            kind: "openai",
            apiKey: OPENAI_KEY,
            defaultModel: "gpt-4.1-mini",
        });
        await scoped.store.setActive(profile.id);

        const envRoot = await createCompositionRoot({
            cwd: scoped.workspace,
            dataDirectory: scoped.dataDirectory,
            env: {
                LAZYGOAL_HOME: scoped.home,
                LLM_PROVIDER: "openai",
                LLM_MODEL: "gpt-4o",
                LLM_API_KEY: ENV_KEY,
            },
            profile: agentProfile,
            toolPolicy: createDefaultToolPolicy(),
        });
        assert.equal(envRoot.llmConfig?.apiKey, ENV_KEY, "显式环境变量必须优先于受管档案");
        assert.equal(envRoot.defaultModelSelection.profileId, undefined);

        const tomlHome = join(scoped.home, "..", "home-toml");
        await mkdir(tomlHome, { recursive: true });
        await writeFile(
            join(tomlHome, "config.toml"),
            `[llm]\nprovider = "openai"\nmodel = "gpt-4o"\napi_key = "${ENV_KEY}-toml"\n`,
            { encoding: "utf8", mode: 0o600 },
        );
        const tomlRoot = await createCompositionRoot({
            cwd: scoped.workspace,
            dataDirectory: join(scoped.dataDirectory, "toml"),
            env: { LAZYGOAL_HOME: tomlHome },
            profile: agentProfile,
            toolPolicy: createDefaultToolPolicy(),
        });
        assert.equal(tomlRoot.llmConfig?.apiKey, `${ENV_KEY}-toml`, "没有受管档案时必须保持 TOML 回退行为");
    } finally {
        await scoped.cleanup();
    }
});
