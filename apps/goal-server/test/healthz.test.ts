import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { healthzResponseBinding } from "../../../packages/web-contracts/src/index";
import { createBrowserSessionAccess } from "../../../packages/browser/src/index";
import { createCompositionRoot } from "../src/composition-root";

test("Goal Server health probe returns its wire contract and retains request guards", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "lg-healthz-"));
    const access = createBrowserSessionAccess();
    let root: Awaited<ReturnType<typeof createCompositionRoot>> | undefined;

    try {
        root = await createCompositionRoot({
            cwd: workspace,
            dataDirectory: join(workspace, "data"),
            env: { LAZYGOAL_HOME: join(workspace, "home") },
            profile: { id: "healthz-test", systemPrompt: "unused", instructions: [], toolIds: [] },
            adapter: {
                async generate(): Promise<never> {
                    throw new Error("health probe must not call the model");
                },
            },
            httpMiddleware: access.middleware,
        });
        const address = await root.httpService.start(0);
        access.bindOrigin(address.origin);

        const health = await fetch(`${address.origin}/healthz`);
        assert.equal(health.status, 200);
        const body: unknown = await health.json();
        assert.deepEqual(body, { status: "ok" });
        assert.equal(healthzResponseBinding.read(body, "reject").ok, true);

        const neighbor = await fetch(`${address.origin}/healthz/`);
        assert.equal(neighbor.status, 401);
        const otherRoute = await fetch(`${address.origin}/api/goals`);
        assert.equal(otherRoute.status, 401);

        const otherMethod = await fetch(`${address.origin}/healthz`, {
            method: "POST",
            headers: { origin: address.origin },
        });
        assert.equal(otherMethod.status, 401);

        const crossOrigin = await fetch(`${address.origin}/healthz`, {
            headers: { origin: "http://attacker.example" },
        });
        assert.equal(crossOrigin.status, 403);
        const crossSite = await fetch(`${address.origin}/healthz`, {
            headers: { "sec-fetch-site": "cross-site" },
        });
        assert.equal(crossSite.status, 403);

        const wrongHostStatus = await new Promise<number>((resolve, reject) => {
            const request = httpRequest(`${address.origin}/healthz`, {
                headers: { host: "127.0.0.1:1" },
            }, (response) => {
                response.resume();
                response.on("end", () => resolve(response.statusCode ?? 0));
            });
            request.on("error", reject);
            request.end();
        });
        assert.equal(wrongHostStatus, 403);
    } finally {
        if (root !== undefined) {
            await root.httpService.close().catch(() => undefined);
            await root.lifecycle.close().catch(() => undefined);
        }
        await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});
