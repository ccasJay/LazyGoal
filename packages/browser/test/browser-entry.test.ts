import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { Hono } from "hono";

import { createHttpService } from "../../http/src/index";
import {
    createBrowserSessionAccess,
    createBrowserStaticRoutes,
} from "../src/index";

test("browser access serves only public static assets without exposing the launch token", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-browser-entry-"));
    const assetDirectory = join(directory, "static");
    await mkdir(join(assetDirectory, "assets"), { recursive: true });
    await writeFile(join(assetDirectory, "index.html"), "<title>board</title>");
    await writeFile(join(assetDirectory, "assets", "app.js"), "export const app = true;");
    await writeFile(join(directory, "secret.txt"), "private");
    await symlink(join(directory, "secret.txt"), join(assetDirectory, "assets", "leak.txt"));

    const access = createBrowserSessionAccess();
    const service = createHttpService({ middleware: access.middleware });
    const api = new Hono().get("/api/private", (context) => context.json({ ok: true }));
    service.mount("/", api);
    service.mount("/", createBrowserStaticRoutes(assetDirectory));
    const address = await service.start(0);
    access.bindOrigin(address.origin);
    const launchUrl = access.createLaunchUrl(address.origin);
    const token = new URL(launchUrl).hash.slice(1);

    try {
        const page = await fetch(launchUrl);
        assert.equal(page.status, 200);
        assert.equal(await page.text(), "<title>board</title>");
        assert.equal(page.headers.get("cache-control"), "no-store");
        assert.equal(page.headers.get("referrer-policy"), "no-referrer");
        assert.equal(page.headers.get("x-content-type-options"), "nosniff");
        assert.match(page.headers.get("content-security-policy") ?? "", /default-src 'self'/);
        assert.equal(page.headers.get("access-control-allow-origin"), null);
        assert.equal((await readFile(join(assetDirectory, "index.html"), "utf8")).includes(token), false);

        const asset = await fetch(`${address.origin}/assets/app.js`);
        assert.equal(asset.status, 200);
        assert.match(asset.headers.get("content-type") ?? "", /javascript/);

        const missingAsset = await fetch(`${address.origin}/assets/missing.js`);
        assert.equal(missingAsset.status, 404);
        const escapedAsset = await fetch(`${address.origin}/assets/leak.txt`);
        assert.equal(escapedAsset.status, 404);
    } finally {
        await service.close();
        await rm(directory, { recursive: true, force: true });
    }
});

test("browser session routes reject unauthorized, cross-origin, and wrong-host requests", async () => {
    const access = createBrowserSessionAccess();
    const service = createHttpService({ middleware: access.middleware });
    let routeCalls = 0;
    const routes = new Hono().get("/api/private", (context) => {
        routeCalls += 1;
        return context.json({ ok: true });
    });
    service.mount("/", routes);
    const address = await service.start(0);
    access.bindOrigin(address.origin);
    const token = new URL(access.createLaunchUrl(address.origin)).hash.slice(1);

    try {
        const unauthenticated = await fetch(`${address.origin}/api/private`);
        assert.equal(unauthenticated.status, 401);
        assert.deepEqual(await unauthenticated.json(), { error: "unauthorized" });

        const wrongToken = await fetch(`${address.origin}/api/private`, {
            headers: { authorization: "Bearer invalid" },
        });
        assert.equal(wrongToken.status, 401);

        const crossOrigin = await fetch(`${address.origin}/api/private`, {
            headers: {
                authorization: `Bearer ${token}`,
                origin: "http://attacker.example",
            },
        });
        assert.equal(crossOrigin.status, 403);

        const crossSite = await fetch(`${address.origin}/api/private`, {
            headers: {
                authorization: `Bearer ${token}`,
                "sec-fetch-site": "cross-site",
            },
        });
        assert.equal(crossSite.status, 403);

        const missingWriteOrigin = await fetch(`${address.origin}/api/private`, {
            method: "POST",
            headers: { authorization: `Bearer ${token}` },
        });
        assert.equal(missingWriteOrigin.status, 403);

        const wrongHostStatus = await new Promise<number>((resolve, reject) => {
            const request = httpRequest(`${address.origin}/api/private`, {
                headers: {
                    authorization: `Bearer ${token}`,
                    host: "127.0.0.1:1",
                },
            }, (response) => {
                response.resume();
                response.on("end", () => resolve(response.statusCode ?? 0));
            });
            request.on("error", reject);
            request.end();
        });
        assert.equal(wrongHostStatus, 403);

        const authorized = await fetch(`${address.origin}/api/private`, {
            headers: {
                authorization: `Bearer ${token}`,
                origin: address.origin,
                "sec-fetch-site": "same-origin",
            },
        });
        assert.equal(authorized.status, 200);
        assert.deepEqual(await authorized.json(), { ok: true });
        assert.equal(routeCalls, 1);
    } finally {
        await service.close();
    }
});

test("browser session Origin must be an exact IPv4 loopback HTTP origin", () => {
    const access = createBrowserSessionAccess();
    assert.throws(() => access.createLaunchUrl("http://127.0.0.1:43127"), /must be bound/);
    assert.throws(() => access.bindOrigin("http://localhost:43127"), /IPv4 loopback/);
    assert.throws(() => access.bindOrigin("https://127.0.0.1:43127"), /IPv4 loopback/);
});
