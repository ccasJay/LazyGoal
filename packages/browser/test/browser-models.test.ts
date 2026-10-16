import assert from "node:assert/strict";
import { test } from "node:test";

import { createHttpService } from "../../http/src/index";
import {
    createBrowserGoalRoutes,
    createBrowserSessionAccess,
    projectBrowserModelCatalog,
    type BrowserGoalApiPort,
    type BrowserModelCatalogReadResult,
} from "../src/index";

function makePort(
    models: BrowserGoalApiPort["models"],
): BrowserGoalApiPort {
    return {
        list: async () => [],
        read: async () => undefined,
        create: async () => ({ ok: false, error: "goal_create_failed" }),
        interact: async () => ({ ok: false, error: "interaction_failed" }),
        message: async () => ({ ok: false, error: "message_failed" }),
        enterPlanMode: async () => ({ ok: false, error: "plan_mode_failed" }),
        models,
        setModelPreference: async () => ({ ok: false as const, error: "model_catalog_unavailable" as const }),
        selectModel: async () => ({ ok: false, error: "model_selection_failed" }),
        openStream: async () => ({ ok: false, error: "goal_not_found" }),
    };
}

const option = {
    provider: "openai",
    id: "gpt-test",
    displayName: "GPT Test",
    availabilitySource: "live" as const,
    metadataSource: "catalog" as const,
    selectable: true,
    apiKey: "DO_NOT_SEND_KEY",
    rawResponse: "DO_NOT_SEND_RAW",
};

const catalog = projectBrowserModelCatalog("openai", "gpt-test", [
    option,
    { ...option, provider: "google", id: "gemini-test" },
]);

async function withAuthenticatedRoutes(
    models: BrowserGoalApiPort["models"],
    verify: (base: string, token: string) => Promise<void>,
): Promise<void> {
    const access = createBrowserSessionAccess();
    const service = createHttpService({ middleware: access.middleware });
    service.mount("/", createBrowserGoalRoutes(makePort(models)));
    const address = await service.start(0);
    access.bindOrigin(address.origin);
    const token = new URL(access.createLaunchUrl(address.origin)).hash.slice(1);
    try {
        await verify(address.origin, token);
    } finally {
        await service.close();
    }
}

test("模型目录需要会话授权，响应仅包含当前 Provider 的白名单字段", async () => {
    let calls = 0;
    await withAuthenticatedRoutes(async () => {
        calls += 1;
        return { ok: true, catalog };
    }, async (base, token) => {
        const denied = await fetch(`${base}/api/models`);
        assert.equal(denied.status, 401);
        assert.equal(calls, 0);
        const allowed = await fetch(`${base}/api/models`, {
            headers: { authorization: `Bearer ${token}` },
        });
        assert.equal(allowed.status, 200);
        assert.deepEqual(await allowed.json(), {
            provider: "openai",
            currentModelId: "gpt-test",
            models: [{
                id: "gpt-test",
                displayName: "GPT Test",
                availabilitySource: "live",
                metadataSource: "catalog",
                selectable: true,
            }],
        });
        assert.equal(calls, 1);
    });
});

test("在线目录、离线兜底和鉴权故障保持不同分类", async () => {
    const results: BrowserModelCatalogReadResult[] = [
        { ok: true, catalog },
        { ok: true, catalog: { ...catalog, models: [{ ...catalog.models[0]!, availabilitySource: "catalog" }] } },
        { ok: false, error: "model_catalog_authentication" },
    ];
    await withAuthenticatedRoutes(async () => results.shift()!, async (base, token) => {
        const read = () => fetch(`${base}/api/models`, { headers: { authorization: `Bearer ${token}` } });
        const online = await read();
        assert.equal(online.status, 200);
        const onlineCatalog = await online.json() as typeof catalog;
        assert.equal(onlineCatalog.models[0]?.availabilitySource, "live");
        const offline = await read();
        assert.equal(offline.status, 200);
        const offlineCatalog = await offline.json() as typeof catalog;
        assert.equal(offlineCatalog.models[0]?.availabilitySource, "catalog");
        const auth = await read();
        assert.equal(auth.status, 502);
        assert.deepEqual(await auth.json(), { error: "model_catalog_authentication" });
    });
});

test("草稿目录按请求的受管档案取模型并回传来源维度", async () => {
    const targets: unknown[] = [];
    const catalogWithSources = {
        ...catalog,
        profileId: "profile-1",
        sources: [
            { profileId: "profile-1", kind: "openai", label: "OpenAI 主账号", active: true },
            { profileId: "profile-2", kind: "google", label: "Google 备用", active: false },
        ],
    };
    await withAuthenticatedRoutes(async (target, _signal, providerProfileId) => {
        targets.push([target, providerProfileId]);
        return { ok: true, catalog: catalogWithSources };
    }, async (base, token) => {
        const headers = { authorization: `Bearer ${token}` };
        const tooLong = await fetch(`${base}/api/models?providerProfileId=${"a".repeat(200)}`, { headers });
        assert.equal(tooLong.status, 400);
        const duplicated = await fetch(`${base}/api/models?providerProfileId=profile-1&providerProfileId=profile-2`, { headers });
        assert.equal(duplicated.status, 400);
        const extra = await fetch(`${base}/api/models?providerProfileId=profile-1&unknown=1`, { headers });
        assert.equal(extra.status, 400);
        assert.deepEqual(targets, [], "非法来源查询不得触达端口");

        const response = await fetch(`${base}/api/models?providerProfileId=profile-2`, { headers });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), catalogWithSources);
        assert.deepEqual(targets, [[undefined, "profile-2"]]);
    });
});

test("Goal 模型目录重验 Run 身份并拒绝非法查询", async () => {
    const targets: Array<unknown> = [];
    await withAuthenticatedRoutes(async (target) => {
        targets.push(target);
        return { ok: false, error: "stale_run" };
    }, async (base, token) => {
        const headers = { authorization: `Bearer ${token}` };
        const invalid = await fetch(`${base}/api/goals/goal-1/models?runId=old&runId=other`, { headers });
        assert.equal(invalid.status, 400);
        assert.deepEqual(targets, []);
        const stale = await fetch(`${base}/api/goals/goal-1/models?runId=old`, { headers });
        assert.equal(stale.status, 409);
        assert.deepEqual(await stale.json(), { error: "stale_run", refresh: true });
        assert.deepEqual(targets, [{ goalId: "goal-1", runId: "old" }]);
    });
});
