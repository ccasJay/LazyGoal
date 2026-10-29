import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    createServer as createHttpServer,
    type IncomingMessage,
    type Server,
    type ServerResponse,
} from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { Socket } from "node:net";
import { createSecureContext } from "node:tls";
import { test } from "node:test";

import { buildConnector } from "undici";

import {
    WebFetchBlockedUrlError,
    WebFetchHttpError,
    WebFetchNetworkError,
    WebFetchRedirectLimitError,
    WebResponseTooLargeError,
} from "../src/web/fetch-errors";
import {
    assertSafeWebFetchUrl,
    isBlockedWebFetchAddress,
    validateResolvedAddresses,
} from "../src/web/fetch-url-policy";
import {
    createBoundLookup,
    createDefaultWebFetchHandler,
    type WebFetchTransportAddress,
} from "../src/web/fetch-default";
import type { WebFetchHandler } from "../src/web-fetch";

const PUBLIC_V4 = "93.184.216.34";
const PUBLIC_V6 = "2001:4860:4860::8888";
const TLS_FIXTURE_DIR = new URL("./fixtures/tls/", import.meta.url);

interface FixtureServer {
    readonly port: number;
    readonly sockets: Set<Socket>;
    close(): Promise<void>;
}

function listen(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
        const onError = (error: Error): void => reject(error);
        server.once("error", onError);
        server.listen(0, "127.0.0.1", () => {
            server.off("error", onError);
            resolve();
        });
    });
}

function serverPort(server: Server): number {
    const address = server.address();
    if (address === null || typeof address === "string") {
        throw new Error("Fixture server did not expose a TCP port.");
    }
    return address.port;
}

async function closeServer(server: Server): Promise<void> {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
        server.close((error) => error === undefined ? resolve() : reject(error));
    });
}

async function startServer(server: Server): Promise<FixtureServer> {
    const sockets = new Set<Socket>();
    server.on("connection", (socket) => {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
    });
    await listen(server);
    return {
        port: serverPort(server),
        sockets,
        close: () => closeServer(server),
    };
}

async function startHttpFixture(
    handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<FixtureServer> {
    return startServer(createHttpServer(handler));
}

function createFixtureConnectorFactory(
    targetPort: number,
    dialed: string[][],
    ca?: string,
): (addresses: readonly WebFetchTransportAddress[]) => buildConnector.connector {
    return (addresses) => {
        const base = ca === undefined ? buildConnector({}) : buildConnector({ ca });
        return (options, callback) => {
            dialed.push(addresses.map((address) => address.address));
            const servername = options.protocol === "https:"
                ? options.servername ?? options.host ?? options.hostname
                : options.servername;
            base({
                ...options,
                hostname: "127.0.0.1",
                host: "127.0.0.1",
                port: String(targetPort),
                ...(servername !== undefined ? { servername } : {}),
            }, callback);
        };
    };
}

function createLocalHandler(
    port: number,
    resolveHostname: (hostname: string) => Promise<readonly string[]>,
    ca?: string,
): { handler: WebFetchHandler; dialed: string[][]; resolveCalls: () => number } {
    const dialed: string[][] = [];
    let resolveCalls = 0;
    const handler = createDefaultWebFetchHandler({
        resolveHostname: async (hostname) => {
            resolveCalls += 1;
            return resolveHostname(hostname);
        },
        createConnector: createFixtureConnectorFactory(port, dialed, ca),
    });
    return { handler, dialed, resolveCalls: () => resolveCalls };
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error("Timed out waiting for the fixture condition.");
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

function readTlsFixture(name: string): string {
    return readFileSync(new URL(name, TLS_FIXTURE_DIR), "utf8");
}

test("URL 策略拒绝非 http(s)、凭据、本机与私网字面地址", () => {
    for (const url of [
        "ftp://example.com/file",
        "file:///workspace/test.txt",
        "https://user:pass@example.com/",
        "http://localhost/",
        "http://api.localhost/",
        "http://127.0.0.1/",
        "http://10.1.2.3/",
        "http://172.16.0.1/",
        "http://192.168.1.1/",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",
        "http://[fe80::1%25eth0]/",
    ]) {
        assert.throws(() => assertSafeWebFetchUrl(url), WebFetchBlockedUrlError, url);
    }

    const url = assertSafeWebFetchUrl("https://example.com/docs?q=1");
    assert.equal(url.toString(), "https://example.com/docs?q=1");
});

test("地址策略覆盖 loopback、private、link-local、multicast、unspecified 与保留网段", () => {
    for (const address of [
        "127.0.0.1",
        "10.1.2.3",
        "172.16.0.1",
        "172.31.255.255",
        "192.168.1.1",
        "169.254.169.254",
        "224.0.0.1",
        "0.0.0.0",
        "100.64.0.1",
        "192.0.2.1",
        "198.51.100.1",
        "203.0.113.1",
        "::1",
        "::",
        "fc00::1",
        "fd00::1",
        "fe80::1",
        "ff02::1",
        "2001:db8::1",
        "::ffff:127.0.0.1",
        "::ffff:7f00:1",
        "0:0:0:0:0:ffff:7f00:1",
    ]) {
        assert.equal(isBlockedWebFetchAddress(address), true, address);
    }
    for (const address of ["8.8.8.8", "1.1.1.1", PUBLIC_V4, "2606:4700:4700::1111", PUBLIC_V6]) {
        assert.equal(isBlockedWebFetchAddress(address), false, address);
    }

    assert.deepEqual(validateResolvedAddresses([PUBLIC_V4, PUBLIC_V6]), [
        { address: PUBLIC_V4, family: 4 },
        { address: PUBLIC_V6, family: 6 },
    ]);
    assert.throws(
        () => validateResolvedAddresses([PUBLIC_V4, "10.0.0.1"]),
        WebFetchBlockedUrlError,
    );
    assert.throws(() => validateResolvedAddresses([]), WebFetchBlockedUrlError);
});

test("绑定 lookup 只返回该跳已验证地址并支持连接重试遍历集合", async () => {
    const addresses: readonly WebFetchTransportAddress[] = [
        { address: PUBLIC_V4, family: 4 },
        { address: PUBLIC_V6, family: 6 },
    ];
    const lookup = createBoundLookup(addresses);

    const all = await new Promise<unknown>((resolve, reject) => {
        lookup("ignored.example", { all: true }, (error, resolved) => {
            if (error !== null) reject(error);
            else resolve(resolved);
        });
    });
    assert.deepEqual(all, [
        { address: PUBLIC_V4, family: 4 },
        { address: PUBLIC_V6, family: 6 },
    ]);

    const ipv6Only = await new Promise<unknown>((resolve, reject) => {
        lookup("ignored.example", { all: true, family: 6 }, (error, resolved) => {
            if (error !== null) reject(error);
            else resolve(resolved);
        });
    });
    assert.deepEqual(ipv6Only, [{ address: PUBLIC_V6, family: 6 }]);

    const single = await new Promise<unknown>((resolve, reject) => {
        lookup("ignored.example", {}, (error, address, family) => {
            if (error !== null) reject(error);
            else resolve({ address, family });
        });
    });
    assert.deepEqual(single, { address: PUBLIC_V4, family: 4 });

    const missingFamily = createBoundLookup([{ address: PUBLIC_V4, family: 4 }]);
    const error = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
        missingFamily("ignored.example", { family: 6 }, (lookupError) => resolve(lookupError));
    });
    assert.equal(error?.code, "ENOTFOUND");
});

test("默认 handler 拒绝解析到本机或混合受限地址的公网主机", async () => {
    const privateOnly = createDefaultWebFetchHandler({
        resolveHostname: async () => ["127.0.0.1"],
    });
    await assert.rejects(
        () => privateOnly("http://public.example/page"),
        (error: unknown) => {
            assert.ok(error instanceof WebFetchBlockedUrlError);
            assert.doesNotMatch(error.message, /127\.0\.0\.1/);
            return true;
        },
    );

    const mixed = createDefaultWebFetchHandler({
        resolveHostname: async () => [PUBLIC_V4, "10.0.0.1"],
    });
    await assert.rejects(
        () => mixed("http://public.example/page"),
        WebFetchBlockedUrlError,
    );

    const noAddresses = createDefaultWebFetchHandler({
        resolveHostname: async () => [],
    });
    await assert.rejects(
        () => noAddresses("http://public.example/page"),
        WebFetchBlockedUrlError,
    );
});

test("DNS rebinding 不能把连接目标改成重新解析的私网地址", async () => {
    let requestCount = 0;
    const fixture = await startHttpFixture((_request, response) => {
        requestCount += 1;
        response.writeHead(200, { "content-type": "text/plain" });
        response.end("rebinding-safe");
    });
    try {
        let resolveCount = 0;
        const { handler, dialed, resolveCalls } = createLocalHandler(fixture.port, async () => {
            resolveCount += 1;
            return resolveCount === 1 ? [PUBLIC_V4] : ["127.0.0.1"];
        });

        const result = await handler("http://public.example/page");
        assert.deepEqual(result, { text: "rebinding-safe", isHtml: false });
        assert.equal(resolveCalls(), 1);
        assert.deepEqual(dialed, [[PUBLIC_V4]]);
        assert.equal(requestCount, 1);
    } finally {
        await fixture.close();
    }
});

test("重定向逐跳重新校验并阻止指向本机的目标", async () => {
    const requested: string[] = [];
    const fixture = await startHttpFixture((request, response) => {
        requested.push(request.url ?? "");
        if (request.url === "/start") {
            response.writeHead(302, { location: "/final" });
            response.end();
            return;
        }
        if (request.url === "/final") {
            response.writeHead(200, { "content-type": "text/plain" });
            response.end("redirect-ok");
            return;
        }
        if (request.url === "/to-private") {
            response.writeHead(302, { location: `http://127.0.0.1:${fixture.port}/private` });
            response.end();
            return;
        }
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("missing");
    });
    try {
        const { handler, dialed, resolveCalls } = createLocalHandler(
            fixture.port,
            async () => [PUBLIC_V4],
        );

        const result = await handler("http://public.example/start");
        assert.deepEqual(result, { text: "redirect-ok", isHtml: false });
        assert.deepEqual(requested, ["/start", "/final"]);
        assert.equal(resolveCalls(), 2);
        assert.deepEqual(dialed, [[PUBLIC_V4], [PUBLIC_V4]]);

        requested.length = 0;
        const blocked = createLocalHandler(fixture.port, async () => [PUBLIC_V4]);
        await assert.rejects(
            () => blocked.handler("http://public.example/to-private"),
            (error: unknown) => {
                assert.ok(error instanceof WebFetchBlockedUrlError);
                assert.match(error.message, /blocked by policy/);
                return true;
            },
        );
        assert.deepEqual(requested, ["/to-private"]);
        assert.equal(blocked.dialed.length, 1);
    } finally {
        await fixture.close();
    }
});

test("重定向允许 5 跳并在超过上限时返回 WEB_FETCH_REDIRECT_LIMIT 对应错误", async () => {
    const requested: string[] = [];
    const fixture = await startHttpFixture((request, response) => {
        const url = request.url ?? "";
        requested.push(url);
        const match = /^\/([rs])(\d+)$/.exec(url);
        if (match !== null) {
            const prefix = match[1] ?? "";
            const index = Number.parseInt(match[2] ?? "0", 10);
            const lastIndex = prefix === "r" ? 5 : 5;
            if (index < lastIndex) {
                response.writeHead(302, { location: `/${prefix}${index + 1}` });
                response.end();
                return;
            }
            if (prefix === "r") {
                response.writeHead(200, { "content-type": "text/plain" });
                response.end("five-redirects-ok");
                return;
            }
            response.writeHead(302, { location: `/${prefix}${index + 1}` });
            response.end();
            return;
        }
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("missing");
    });
    try {
        const allowed = createLocalHandler(fixture.port, async () => [PUBLIC_V4]);
        const result = await allowed.handler("http://public.example/r0");
        assert.deepEqual(result, { text: "five-redirects-ok", isHtml: false });
        assert.deepEqual(requested, ["/r0", "/r1", "/r2", "/r3", "/r4", "/r5"]);

        requested.length = 0;
        const limited = createLocalHandler(fixture.port, async () => [PUBLIC_V4]);
        await assert.rejects(
            () => limited.handler("http://public.example/s0"),
            WebFetchRedirectLimitError,
        );
        assert.deepEqual(requested, ["/s0", "/s1", "/s2", "/s3", "/s4", "/s5"]);
    } finally {
        await fixture.close();
    }
});

test("3xx 缺少 Location 与 4xx 映射为 WebFetchHttpError", async () => {
    const fixture = await startHttpFixture((request, response) => {
        if (request.url === "/no-location") {
            response.writeHead(302);
            response.end();
            return;
        }
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("not found");
    });
    try {
        const { handler } = createLocalHandler(fixture.port, async () => [PUBLIC_V4]);
        await assert.rejects(
            () => handler("http://public.example/no-location"),
            (error: unknown) => error instanceof WebFetchHttpError && error.status === 302,
        );
        await assert.rejects(
            () => handler("http://public.example/missing"),
            (error: unknown) => error instanceof WebFetchHttpError
                && error.status === 404
                && error.message === "Web fetch failed with HTTP status 404.",
        );
    } finally {
        await fixture.close();
    }
});

test("HTTPS 保留原域名 Host、SNI 与证书主机名校验", async () => {
    const key = readTlsFixture("public.example.key");
    const cert = readTlsFixture("public.example.crt");
    const secureContext = createSecureContext({ key, cert });
    const sniNames: string[] = [];
    const hosts: string[] = [];
    const fixture = await startServer(createHttpsServer({
        key,
        cert,
        SNICallback: (servername, callback) => {
            sniNames.push(servername);
            callback(null, secureContext);
        },
    }, (request, response) => {
        hosts.push(request.headers.host ?? "");
        response.writeHead(200, { "content-type": "text/plain" });
        response.end("tls-ok");
    }));
    try {
        const trusted = createLocalHandler(fixture.port, async () => [PUBLIC_V4], cert);
        const result = await trusted.handler("https://public.example/secure");
        assert.deepEqual(result, { text: "tls-ok", isHtml: false });
        assert.deepEqual(hosts, ["public.example"]);
        assert.deepEqual(sniNames, ["public.example"]);
        assert.deepEqual(trusted.dialed, [[PUBLIC_V4]]);

        const mismatched = createLocalHandler(fixture.port, async () => [PUBLIC_V4], cert);
        await assert.rejects(
            () => mismatched.handler("https://mismatch.example/secure"),
            (error: unknown) => {
                assert.ok(error instanceof WebFetchNetworkError);
                assert.equal(error.reason, "tls_verification_failed");
                assert.equal(error.message, "Web fetch network request failed.");
                return true;
            },
        );
    } finally {
        await fixture.close();
    }
});

test("成功、取消、超时和超限后释放自有连接与未消费正文", async () => {
    const fixture = await startHttpFixture((request, response) => {
        if (request.url === "/ok") {
            response.writeHead(200, { "content-type": "text/plain" });
            response.end("ok");
            return;
        }
        if (request.url === "/hang") {
            response.writeHead(200, { "content-type": "text/plain" });
            response.write("partial");
            return;
        }
        if (request.url === "/huge-chunked") {
            response.writeHead(200, { "content-type": "text/plain" });
            const chunk = Buffer.alloc(64 * 1024, "x");
            let sent = 0;
            const write = (): void => {
                while (sent <= 2 * 1024 * 1024) {
                    sent += chunk.byteLength;
                    if (!response.write(chunk)) {
                        response.once("drain", write);
                        return;
                    }
                }
                response.end();
            };
            write();
            return;
        }
        response.writeHead(200, {
            "content-type": "text/plain",
            "content-length": String(2 * 1024 * 1024 + 1),
        });
        response.write("x");
        response.end();
    });
    try {
        const success = createLocalHandler(fixture.port, async () => [PUBLIC_V4]);
        assert.deepEqual(await success.handler("http://public.example/ok"), {
            text: "ok",
            isHtml: false,
        });
        await waitFor(() => fixture.sockets.size === 0);

        const aborted = createLocalHandler(fixture.port, async () => [PUBLIC_V4]);
        const controller = new AbortController();
        const abortTimer = setTimeout(() => controller.abort(), 100);
        try {
            await assert.rejects(
                () => aborted.handler("http://public.example/hang", { signal: controller.signal }),
                (error: unknown) => (error as { name?: string }).name === "AbortError",
            );
        } finally {
            clearTimeout(abortTimer);
        }
        await waitFor(() => fixture.sockets.size === 0);

        const timedOut = createLocalHandler(fixture.port, async () => [PUBLIC_V4]);
        await assert.rejects(
            () => timedOut.handler("http://public.example/hang", {
                signal: AbortSignal.timeout(100),
            }),
            (error: unknown) => (error as { name?: string }).name === "TimeoutError"
                || (error as { name?: string }).name === "AbortError",
        );
        await waitFor(() => fixture.sockets.size === 0);

        const huge = createLocalHandler(fixture.port, async () => [PUBLIC_V4]);
        await assert.rejects(
            () => huge.handler("http://public.example/huge-chunked"),
            WebResponseTooLargeError,
        );
        await waitFor(() => fixture.sockets.size === 0);

        const declaredHuge = createLocalHandler(fixture.port, async () => [PUBLIC_V4]);
        await assert.rejects(
            () => declaredHuge.handler("http://public.example/huge-declared"),
            WebResponseTooLargeError,
        );
        await waitFor(() => fixture.sockets.size === 0);
    } finally {
        await fixture.close();
    }
});
