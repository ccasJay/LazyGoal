import assert from "node:assert/strict";
import { test } from "node:test";

import { createHttpService } from "../../http/src/index";
import {
    createBrowserGoalRoutes,
    createBrowserSessionAccess,
    type BrowserGoalApiPort,
    type BrowserProviderSettingsPort,
} from "../src/index";

const CANARY = "sk-canary-provider-secret";

function maskedProfile(overrides: Record<string, unknown> = {}) {
    return {
        id: "profile-1",
        label: "OpenAI 主账号",
        kind: "openai",
        defaultModel: "gpt-4o",
        hasApiKey: true,
        apiKeyMask: "****c123",
        ...overrides,
    };
}

function makePort(providerSettings: BrowserProviderSettingsPort): BrowserGoalApiPort {
    return {
        list: async () => ({ goals: [], unreadableCount: 0 }),
        read: async () => undefined,
        enterPlanMode: async () => ({ ok: false, error: "plan_mode_failed" }),
        models: async () => ({ ok: false as const, error: "model_catalog_unavailable" as const }),
        setModelPreference: async () => ({ ok: false as const, error: "model_catalog_unavailable" as const }),
        selectModel: async () => ({ ok: false, error: "model_selection_failed" }),
        providerSettings,
    };
}

/** 未启用的端口实现；用例只覆盖被测方法。 */
function unusedPort(overrides: Partial<BrowserProviderSettingsPort>): BrowserProviderSettingsPort {
    return {
        read: async () => ({ ok: true, settings: { profiles: [] } }),
        create: async () => ({ ok: false, error: "provider_profile_unavailable" }),
        update: async () => ({ ok: false, error: "provider_profile_not_found" }),
        remove: async () => ({ ok: false, error: "provider_profile_not_found" }),
        activate: async () => ({ ok: false, error: "provider_profile_not_found" }),
        fetchModels: async () => ({ ok: false, error: "model_catalog_unavailable" }),
        test: async () => ({ ok: false, error: "provider_profile_not_found" }),
        ...overrides,
    };
}

async function withRoutes(
    providerSettings: BrowserProviderSettingsPort,
    verify: (base: string, authorize: Record<string, string>) => Promise<void>,
): Promise<void> {
    const access = createBrowserSessionAccess();
    const service = createHttpService({ middleware: access.middleware });
    service.mount("/", createBrowserGoalRoutes(makePort(providerSettings)));
    const address = await service.start(0);
    access.bindOrigin(address.origin);
    const token = new URL(access.createLaunchUrl(address.origin)).hash.slice(1);
    try {
        await verify(address.origin, {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            origin: address.origin,
        });
    } finally {
        await service.close();
    }
}

test("设置路由需要会话授权，且投影只含掩码字段", async () => {
    let reads = 0;
    const settings = {
        activeProfileId: "profile-1",
        profiles: [
            maskedProfile(),
            maskedProfile({ id: "profile-2", label: "OpenAI 备用额度", hasApiKey: false, apiKeyMask: "" }),
        ],
        fallback: { source: "config" as const, provider: "google", model: "gemini-2.5-pro" },
    };
    await withRoutes(unusedPort({
        read: async () => {
            reads += 1;
            return { ok: true, settings };
        },
    }), async (base, authorize) => {
        const denied = await fetch(`${base}/api/providers`);
        assert.equal(denied.status, 401);
        assert.equal(reads, 0, "未授权请求不得触达端口");

        const allowed = await fetch(`${base}/api/providers`, { headers: authorize });
        assert.equal(allowed.status, 200);
        const body = await allowed.text();
        assert.equal(body.includes(CANARY), false, "响应正文不得包含明文凭据");
        assert.equal(body.includes("apiKey\""), false, "响应不得暴露明文凭据字段");
        assert.deepEqual(JSON.parse(body), settings);
        assert.equal(reads, 1);
    });
});

test("读取失败映射为稳定错误码", async () => {
    await withRoutes(unusedPort({
        read: async () => ({ ok: false, error: "provider_profile_unavailable" }),
    }), async (base, authorize) => {
        const response = await fetch(`${base}/api/providers`, { headers: authorize });
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { error: "provider_profile_unavailable" });
    });
});

test("创建与更新拒绝非白名单或非法输入，且不触达端口", async () => {
    const calls: unknown[] = [];
    await withRoutes(unusedPort({
        create: async (input) => {
            calls.push(input);
            return { ok: false, error: "provider_profile_invalid", fields: ["base_url"] };
        },
        update: async (profileId, input) => {
            calls.push([profileId, input]);
            return { ok: true, profile: maskedProfile() };
        },
    }), async (base, authorize) => {
        const post = (body: unknown) => fetch(`${base}/api/providers`, {
            method: "POST",
            headers: authorize,
            body: JSON.stringify(body),
        });

        assert.equal((await post({ label: "x", kind: "openai", defaultModel: "m", unexpected: 1 })).status, 400);
        assert.equal((await post({ kind: "openai", defaultModel: "m" })).status, 400);
        assert.equal((await post({ label: "x", kind: "openai", defaultModel: "m", contextWindowTokens: 0 })).status, 400);
        assert.equal((await post({ label: "x", kind: "openai", defaultModel: "m", maxOutputTokens: -1 })).status, 400);
        assert.equal((await post({ label: "x", kind: "openai", defaultModel: "m", structuredOutputMode: "nope" })).status, 400);
        assert.equal((await post({ label: " ", kind: "openai", defaultModel: "m" })).status, 400);
        assert.deepEqual(calls, [], "非法输入不得触达端口");

        const created = await post({ label: "x", kind: "openai", defaultModel: "m", apiKey: CANARY });
        assert.equal(created.status, 400);
        assert.deepEqual(await created.json(), { error: "provider_profile_invalid", fields: ["base_url"] });
        assert.deepEqual(calls[0], { label: "x", kind: "openai", defaultModel: "m", apiKey: CANARY });

        const patched = await fetch(`${base}/api/providers/profile-1`, {
            method: "PATCH",
            headers: authorize,
            body: JSON.stringify({ label: "x", kind: "openai", defaultModel: "m", structuredOutputMode: null }),
        });
        assert.equal(patched.status, 200);
        assert.deepEqual(await patched.json(), { ok: true, profile: maskedProfile() });
        assert.deepEqual(calls[1], ["profile-1", { label: "x", kind: "openai", defaultModel: "m" }]);

        const invalidId = await fetch(`${base}/api/providers/${"a".repeat(200)}`, {
            method: "PATCH",
            headers: authorize,
            body: JSON.stringify({ label: "x", kind: "openai", defaultModel: "m" }),
        });
        assert.equal(invalidId.status, 400);
        assert.equal(calls.length, 2);
    });
});

test("删除激活档案被拒，删除其它返回引用提示，激活返回新标识", async () => {
    await withRoutes(unusedPort({
        remove: async (profileId) => profileId === "active-profile"
            ? { ok: false, error: "provider_profile_active" }
            : { ok: true, profile: maskedProfile({ id: profileId }), mayBeReferencedByGoals: true },
        activate: async (profileId) => profileId === "missing-profile"
            ? { ok: false, error: "provider_profile_not_found" }
            : { ok: true, activeProfileId: profileId },
    }), async (base, authorize) => {
        const deniedDelete = await fetch(`${base}/api/providers/active-profile`, { method: "DELETE", headers: authorize });
        assert.equal(deniedDelete.status, 409);
        assert.deepEqual(await deniedDelete.json(), { error: "provider_profile_active" });

        const removed = await fetch(`${base}/api/providers/spare-profile`, { method: "DELETE", headers: authorize });
        assert.equal(removed.status, 200);
        assert.deepEqual(await removed.json(), {
            ok: true,
            profile: maskedProfile({ id: "spare-profile" }),
            mayBeReferencedByGoals: true,
        });

        const missingActivation = await fetch(`${base}/api/providers/missing-profile/activate`, { method: "POST", headers: authorize });
        assert.equal(missingActivation.status, 404);

        const activated = await fetch(`${base}/api/providers/spare-profile/activate`, { method: "POST", headers: authorize });
        assert.equal(activated.status, 200);
        assert.deepEqual(await activated.json(), { ok: true, activeProfileId: "spare-profile" });
    });
});

test("连接测试只按档案拉取模型并映射稳定分类", async () => {
    const tested: string[] = [];
    const results = [
        { ok: true as const, modelCount: 29 },
        { ok: false as const, error: "model_catalog_authentication" as const },
        { ok: false as const, error: "provider_profile_not_found" as const },
        { ok: false as const, error: "model_catalog_unavailable" as const },
    ];
    await withRoutes(unusedPort({
        test: async (profileId) => {
            tested.push(profileId);
            return results.shift() ?? { ok: false, error: "model_catalog_unavailable" };
        },
    }), async (base, authorize) => {
        const run = () => fetch(`${base}/api/providers/profile-1/test`, { method: "POST", headers: authorize });
        const [online, auth, missing, unavailable] = [await run(), await run(), await run(), await run()];
        assert.equal(online.status, 200);
        assert.deepEqual(await online.json(), { ok: true, modelCount: 29 });
        assert.equal(auth.status, 502);
        assert.deepEqual(await auth.json(), { error: "model_catalog_authentication" });
        assert.equal(missing.status, 404);
        assert.equal(unavailable.status, 503);
        assert.deepEqual(tested, ["profile-1", "profile-1", "profile-1", "profile-1"]);
    });
});
