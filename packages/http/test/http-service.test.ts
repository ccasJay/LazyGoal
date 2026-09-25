import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

import { Hono } from "hono";
import { createHttpService, HttpServiceLifecycleError } from "../src/index";

test("HttpService mounts independent Hono routes on IPv4 loopback and closes the listener", async () => {
    const service = createHttpService();
    const healthRoutes = new Hono().get("/ping", (context) => context.json({ ok: true }));
    service.mount("/health", healthRoutes);

    const address = await service.start(0);
    assert.equal(address.host, "127.0.0.1");
    assert.match(address.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    const response = await fetch(`${address.origin}/health/ping`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal((await fetch(`${address.origin}/goals/example/metrics`)).status, 404);

    await service.close();
    await assert.rejects(fetch(`${address.origin}/health/ping`));
});

test("HttpService enforces mount and start lifecycle", async () => {
    const service = createHttpService();
    assert.throws(() => service.mount("relative", new Hono()), HttpServiceLifecycleError);
    const address = await service.start(0);
    assert.throws(() => service.mount("/late", new Hono()), HttpServiceLifecycleError);
    await assert.rejects(service.start(0), HttpServiceLifecycleError);
    await service.close();
    await assert.rejects(service.start(0), HttpServiceLifecycleError);
    assert.match(address.origin, /^http:/);
});

test("HttpService reports a port bind failure to its startup caller", async () => {
    const occupied = createServer();
    await new Promise<void>((resolve) => occupied.listen(0, "127.0.0.1", resolve));
    const address = occupied.address();
    assert.ok(address && typeof address !== "string");

    try {
        await assert.rejects(createHttpService().start(address.port), /EADDRINUSE/);
    } finally {
        await new Promise<void>((resolve, reject) => {
            occupied.close((error) => error === undefined ? resolve() : reject(error));
        });
    }
});
