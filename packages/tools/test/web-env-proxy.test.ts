import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const tsxCliPath = fileURLToPath(new URL("../../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const fixturePath = fileURLToPath(new URL("./fixtures/env-proxy-fetch.ts", import.meta.url));

function listenProxy(connects: string[]): Promise<{ readonly port: number; close(): Promise<void> }> {
    return new Promise((resolve, reject) => {
        const server = createServer((_request, response) => {
            response.writeHead(502);
            response.end();
        });
        server.on("connect", (request, socket) => {
            connects.push(request.url ?? "");
            socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
        });
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (address === null || typeof address === "string") {
                reject(new Error("Proxy server did not expose a TCP port."));
                return;
            }
            resolve({
                port: address.port,
                close: () => new Promise<void>((resolveClose) => {
                    server.closeAllConnections();
                    server.close(() => resolveClose());
                }),
            });
        });
    });
}

function runFixture(port: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            NODE_USE_ENV_PROXY: "1",
            HTTP_PROXY: `http://127.0.0.1:${port}`,
            HTTPS_PROXY: `http://127.0.0.1:${port}`,
            http_proxy: `http://127.0.0.1:${port}`,
            https_proxy: `http://127.0.0.1:${port}`,
            NO_PROXY: "",
            no_proxy: "",
        };
        delete env.ALL_PROXY;
        delete env.all_proxy;

        const child = spawn(process.execPath, [tsxCliPath, fixturePath], {
            cwd: fileURLToPath(new URL("../../..", import.meta.url)),
            env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });
        child.once("error", reject);
        child.once("close", (code) => {
            if (code === 0) {
                resolve(stdout);
                return;
            }
            reject(new Error(`env proxy fixture exited with ${code}: ${stderr}`));
        });
    });
}

test("导入 undici 后仍保留 Node 内置 fetch 的环境代理 dispatcher", {
    skip: process.allowedNodeEnvironmentFlags.has("--use-env-proxy")
        ? false
        : "当前 Node 不支持 NODE_USE_ENV_PROXY",
}, async () => {
    const connects: string[] = [];
    const proxy = await listenProxy(connects);
    try {
        const output = await runFixture(proxy.port);
        const result = JSON.parse(output) as {
            readonly before: { readonly result: string };
            readonly after: { readonly result: string };
        };
        assert.equal(result.before.result, "error");
        assert.equal(result.after.result, "error");
        assert.deepEqual(connects, ["env-proxy-check.test:443", "env-proxy-check.test:443"]);
    } finally {
        await proxy.close();
    }
});
