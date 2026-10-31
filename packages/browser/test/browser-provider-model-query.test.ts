import assert from "node:assert/strict";
import { test } from "node:test";

import { createHttpService } from "../../http/src/index";
import {
    createBrowserGoalRoutes,
    createBrowserSessionAccess,
    type BrowserGoalApiPort,
    type BrowserProviderSettingsPort,
} from "../src/index";

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

test("provider model query route passes only extracted fields and emits a value-free diagnostic", async t => {
    const calls: unknown[] = [];
    const diagnostics: unknown[][] = [];
    t.mock.method(console, "debug", (...args: unknown[]) => diagnostics.push(args));
    await withRoutes(unusedPort({
        fetchModels: async (input, signal) => {
            calls.push({ input, aborted: signal.aborted });
            return { ok: true, models: [{ id: "m-1", name: "Model" }] };
        },
    }), async (base, authorize) => {
        const response = await fetch(`${base}/api/providers/models`, {
            method: "POST",
            headers: authorize,
            body: JSON.stringify({
                kind: "openai",
                apiKey: "sk-private",
                debug: "private-value",
            }),
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { ok: true, models: [{ id: "m-1", name: "Model" }] });
        assert.deepEqual(calls, [{ input: { kind: "openai", apiKey: "sk-private" }, aborted: false }]);
        assert.equal(diagnostics.length, 1);
        assert.deepEqual(diagnostics[0]?.[1], {
            contractId: "web.providers.model_query",
            version: 1,
            paths: ["/debug"],
            truncated: false,
        });
        assert.equal(JSON.stringify(diagnostics).includes("sk-private"), false);
        assert.equal(JSON.stringify(diagnostics).includes("private-value"), false);
    });
});

test("provider model query route rejects invalid known fields before the port", async () => {
    let calls = 0;
    await withRoutes(unusedPort({
        fetchModels: async () => {
            calls += 1;
            return { ok: true, models: [] };
        },
    }), async (base, authorize) => {
        const bodies: unknown[] = [
            {},
            { kind: "" },
            { kind: "   " },
            { kind: 42 },
            { kind: "openai", apiKey: null },
            { kind: "openai", apiKey: "   " },
            { kind: "openai", baseURL: null },
            { kind: "openai", profileId: null },
            { kind: "openai", profileId: "bad id" },
            { kind: "openai", apiKey: "x".repeat(4_097) },
            { kind: "openai", baseURL: "x".repeat(2_049) },
            { kind: "openai", profileId: "a".repeat(129) },
            { kind: "x".repeat(65) },
        ];
        for (const body of bodies) {
            const response = await fetch(`${base}/api/providers/models`, {
                method: "POST",
                headers: authorize,
                body: JSON.stringify(body),
            });
            assert.equal(response.status, 400, JSON.stringify(body));
            assert.deepEqual(await response.json(), { error: "invalid_provider_profile" });
        }
        assert.equal(calls, 0);
    });
});

test("provider model query route keeps JSON, authorization and request size boundaries", async () => {
    let calls = 0;
    await withRoutes(unusedPort({
        fetchModels: async () => {
            calls += 1;
            return { ok: true, models: [] };
        },
    }), async (base, authorize) => {
        const unauthorized = await fetch(`${base}/api/providers/models`, {
            method: "POST",
            headers: { "content-type": "application/json", origin: base },
            body: JSON.stringify({ kind: "openai" }),
        });
        assert.equal(unauthorized.status, 401);

        const wrongType = await fetch(`${base}/api/providers/models`, {
            method: "POST",
            headers: { ...authorize, "content-type": "text/plain" },
            body: JSON.stringify({ kind: "openai" }),
        });
        assert.equal(wrongType.status, 415);

        const tooLarge = await fetch(`${base}/api/providers/models`, {
            method: "POST",
            headers: authorize,
            body: JSON.stringify({ kind: "openai", padding: "x".repeat(17 * 1024) }),
        });
        assert.equal(tooLarge.status, 413);
        assert.equal(calls, 0);
    });
});

test("provider model query route preserves stable error mapping and cancellation signal", async () => {
    const errors = [
        ["provider_profile_invalid", 400],
        ["model_catalog_authentication", 502],
        ["model_catalog_permission", 502],
        ["model_catalog_protocol", 502],
        ["model_catalog_unavailable", 503],
    ] as const;
    for (const [error, status] of errors) {
        await withRoutes(unusedPort({
            fetchModels: async () => ({ ok: false, error }),
        }), async (base, authorize) => {
            const response = await fetch(`${base}/api/providers/models`, {
                method: "POST",
                headers: authorize,
                body: JSON.stringify({ kind: "openai" }),
            });
            assert.equal(response.status, status);
            assert.deepEqual(await response.json(), { error });
        });
    }

    await withRoutes(unusedPort({
        fetchModels: async (_input, signal) => {
            assert.equal(signal instanceof AbortSignal, true);
            return { ok: true, models: [] };
        },
    }), async (base, authorize) => {
        const response = await fetch(`${base}/api/providers/models`, {
            method: "POST",
            headers: authorize,
            body: JSON.stringify({ kind: "openai" }),
        });
        assert.equal(response.status, 200);
    });
});
