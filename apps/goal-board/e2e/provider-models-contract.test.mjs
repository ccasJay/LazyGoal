import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const appRoot = path.resolve(import.meta.dirname, "..");

test("browser provider models API consumes the generated binding against a local fake API", { timeout: 60_000 }, async () => {
    let scenario = "unknown";
    const calls = [];
    const protocolErrors = [];
    const backend = createServer(async (request, response) => {
        if (request.url !== "/api/providers/models" || request.method !== "POST") {
            protocolErrors.push(`Unexpected local request: ${request.method} ${request.url}`);
            respond(response, 404, { error: "not_found" });
            return;
        }
        let requestBody = "";
        for await (const chunk of request) requestBody += chunk;
        calls.push({
            scenario,
            authorization: request.headers.authorization,
            contentType: request.headers["content-type"],
            body: requestBody,
        });
        if (request.headers.authorization !== "Bearer e2e-token") {
            protocolErrors.push("Provider model request omitted the browser session token");
        }
        if (request.headers["content-type"] !== "application/json") {
            protocolErrors.push("Provider model request omitted JSON content type");
        }
        if (requestBody !== JSON.stringify({ kind: "openai" })) {
            protocolErrors.push(`Unexpected provider model request body: ${requestBody}`);
        }

        if (scenario === "invalid") {
            respond(response, 200, { ok: true, models: [{ id: 42, name: "Invalid" }] });
        } else if (scenario === "http") {
            respond(response, 503, { error: "provider_profile_unavailable" });
        } else if (scenario === "cancel") {
            setTimeout(() => {
                if (!response.destroyed) respond(response, 200, { ok: true, models: [] });
            }, 250);
        } else {
            respond(response, 200, {
                ok: true,
                models: [{ id: "m-1", name: "Model", privateModelDetail: "do-not-log-model-value" }],
                privateResponseDetail: "do-not-log-response-value",
            });
        }
    });
    await listen(backend, 0);
    const backendPort = backend.address().port;
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "lazygoal-provider-models-browser-"));
    const profile = path.join(temporaryRoot, "chrome-profile");
    let vite;
    let chrome;
    let socket;
    let viteOutput = "";
    let viteError = "";

    try {
        vite = startVite(backendPort, await findFreePort());
        vite.stdout.setEncoding("utf8");
        vite.stderr.setEncoding("utf8");
        vite.stdout.on("data", chunk => { viteOutput += chunk; });
        vite.stderr.on("data", chunk => { viteError += chunk; });
        const origin = await waitForVite(vite, () => viteOutput, () => viteError);

        chrome = spawn(findChrome(), [
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            "--remote-debugging-port=0",
            `--user-data-dir=${profile}`,
            "about:blank",
        ], { stdio: "ignore" });
        const devtools = await waitForDevtools(profile, chrome);
        const targets = await (await fetch(`http://127.0.0.1:${devtools.port}/json/list`)).json();
        const target = targets.find(item => item.type === "page");
        assert.ok(target?.webSocketDebuggerUrl, "Chrome exposes a page target");
        socket = await connectCdp(target.webSocketDebuggerUrl);
        await cdp(socket, "Page.enable");
        await cdp(socket, "Runtime.enable");
        await cdp(socket, "Emulation.setDeviceMetricsOverride", {
            width: 1280,
            height: 900,
            deviceScaleFactor: 1,
            mobile: false,
        });
        await cdp(socket, "Page.navigate", { url: `${origin}/e2e/provider-models-contract.html#e2e-token` });
        await waitForExpression(socket, "document.readyState === 'complete'", 20_000);

        scenario = "unknown";
        const accepted = await runBrowserRequest(socket);
        assert.deepEqual(accepted, {
            ok: true,
            data: { ok: true, models: [{ id: "m-1", name: "Model" }] },
            diagnostics: [["[goal-board] response has unknown fields", {
                contractId: "web.providers.models.success",
                version: 1,
                paths: ["/*", "/models/0/*"],
                truncated: false,
            }]],
        });
        assert.equal(JSON.stringify(accepted.diagnostics).includes("do-not-log"), false);

        scenario = "unknown";
        const sinkFailure = await runBrowserRequest(socket, { throwDiagnostic: true });
        assert.deepEqual(sinkFailure, {
            ok: true,
            data: { ok: true, models: [{ id: "m-1", name: "Model" }] },
            diagnostics: [],
        });

        scenario = "invalid";
        const invalid = await runBrowserRequest(socket);
        assert.equal(invalid.ok, false);
        assert.equal(invalid.message, "invalid_api_response");

        scenario = "http";
        const httpFailure = await runBrowserRequest(socket);
        assert.equal(httpFailure.ok, false);
        assert.equal(httpFailure.name, "BrowserApiError");
        assert.equal(httpFailure.code, "provider_profile_unavailable");
        assert.equal(httpFailure.status, 503);

        scenario = "cancel";
        const cancelled = await runBrowserRequest(socket, { cancel: true });
        assert.equal(cancelled.ok, false);
        assert.equal(cancelled.name, "AbortError");
        await delay(300);

        assert.deepEqual(protocolErrors, []);
        assert.equal(calls.length, 5);
        assert.deepEqual(calls.map(call => call.scenario), ["unknown", "unknown", "invalid", "http", "cancel"]);
        assert.ok(calls.every(call => call.authorization === "Bearer e2e-token"));
    } finally {
        socket?.close();
        await stopProcess(chrome, "SIGTERM", 5_000);
        await stopProcess(vite, "SIGTERM", 10_000, viteOutput + viteError);
        await close(backend);
        await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
    }
});

async function runBrowserRequest(socket, { cancel = false, throwDiagnostic = false } = {}) {
    const expression = `(async () => {
        const diagnostics = [];
        const originalDebug = console.debug;
        console.debug = ${throwDiagnostic
            ? "() => { throw new Error('diagnostic sink failed'); }"
            : "(...args) => { if (typeof args[0] === 'string' && args[0].startsWith('[vite]')) return; diagnostics.push(args); }"};
        try {
            const { browserApi } = await import('/src/api.ts');
            const controller = new AbortController();
            const request = browserApi.fetchProviderModels({ kind: 'openai' }, controller.signal);
            ${cancel ? "setTimeout(() => controller.abort(), 20);" : ""}
            const data = await request;
            return { ok: true, data, diagnostics };
        } catch (error) {
            return {
                ok: false,
                name: error?.name,
                message: error?.message,
                code: error?.code,
                status: error?.status,
                diagnostics,
            };
        } finally {
            console.debug = originalDebug;
        }
    })()`;
    const evaluated = await cdp(socket, "Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
    });
    if (evaluated.exceptionDetails !== undefined) {
        throw new Error(`Browser evaluation failed: ${evaluated.exceptionDetails.text ?? JSON.stringify(evaluated.exceptionDetails)}`);
    }
    return evaluated.result?.value;
}

function respond(response, status, body) {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
}

function startVite(backendPort, vitePort) {
    return spawn(process.execPath, [
        path.join(appRoot, "node_modules/vite/bin/vite.js"),
        "--host",
        "127.0.0.1",
        "--port",
        String(vitePort),
        "--strictPort",
        "--clearScreen",
        "false",
    ], {
        cwd: appRoot,
        env: { ...process.env, LAZYGOAL_E2E_API_PORT: String(backendPort) },
        stdio: ["ignore", "pipe", "pipe"],
    });
}

async function waitForVite(child, readOutput, readError) {
    return waitFor(async () => {
        if (child.exitCode !== null) throw new Error(`Vite exited: ${readError()}${readOutput()}`);
        const match = readOutput().match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+\/?)/);
        return match?.[1]?.replace(/\/$/, "");
    }, "Vite development server", 20_000);
}

async function findFreePort() {
    const server = createServer();
    await listen(server, 0);
    const port = server.address().port;
    await close(server);
    return port;
}

async function listen(server, port) {
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", resolve);
    });
}

async function close(server) {
    if (!server?.listening) return;
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

function findChrome() {
    const candidates = [
        process.env.CHROME_BIN,
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome",
    ].filter(Boolean);
    const binary = candidates.find(candidate => existsSync(candidate));
    assert.ok(binary, "Set CHROME_BIN or install Google Chrome/Chromium to run browser acceptance tests");
    return binary;
}

async function waitForDevtools(profile, chrome) {
    const marker = path.join(profile, "DevToolsActivePort");
    return waitFor(async () => {
        if (chrome.exitCode !== null) throw new Error(`Chrome exited with status ${chrome.exitCode}`);
        try {
            const [port] = (await readFile(marker, "utf8")).trim().split("\n");
            return port ? { port } : undefined;
        } catch {
            return undefined;
        }
    }, "Chrome DevTools endpoint", 20_000);
}

async function connectCdp(url) {
    const socket = new WebSocket(url);
    const pending = new Map();
    let nextId = 0;
    socket.addEventListener("message", event => {
        const message = JSON.parse(event.data);
        if (message.id === undefined) return;
        const entry = pending.get(message.id);
        if (entry === undefined) return;
        pending.delete(message.id);
        if (message.error !== undefined) entry.reject(new Error(JSON.stringify(message.error)));
        else entry.resolve(message.result);
    });
    await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, { once: true });
        socket.addEventListener("error", reject, { once: true });
    });
    return {
        close() { socket.close(); },
        send(method, params) {
            const id = ++nextId;
            const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
            socket.send(JSON.stringify({ id, method, params }));
            return promise;
        },
    };
}

function cdp(socket, method, params = {}) {
    return socket.send(method, params);
}

async function waitForExpression(socket, expression, timeoutMs) {
    await waitFor(async () => {
        const evaluated = await cdp(socket, "Runtime.evaluate", {
            expression: `Boolean(${expression})`,
            returnByValue: true,
        });
        return evaluated.result?.value === true;
    }, `browser expression ${expression}`, timeoutMs);
}

async function waitFor(callback, description, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const result = await callback();
        if (result !== undefined && result !== false) return result;
        await delay(50);
    }
    throw new Error(`Timed out waiting for ${description}`);
}

async function stopProcess(child, signal, timeoutMs, logs = "") {
    if (child === undefined || child.exitCode !== null) return;
    const exited = once(child, "close");
    child.kill(signal);
    try {
        await Promise.race([
            exited,
            delay(timeoutMs).then(() => { throw new Error(`Timed out stopping process: ${logs}`); }),
        ]);
    } catch (error) {
        child.kill("SIGKILL");
        await exited;
        throw error;
    }
}
