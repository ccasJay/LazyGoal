import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import test from "node:test";
import { resolveWebProxyEnvironment } from "../bin/web-proxy.cjs";

const ROOT = resolve(import.meta.dirname, "..");
const BIN_PATH = resolve(ROOT, "bin/lazygoal.cjs");

const macProxy = (port) => `<dictionary> {
  ExceptionsList : <array> {
    0 : *.local
  }
  HTTPSEnable : 1
  HTTPSProxy : 127.0.0.1
  HTTPSPort : ${port}
  __SCOPED__ : <dictionary> {
    en0 : <dictionary> {
      HTTPSEnable : 0
    }
  }
}`;

test("web follows the macOS HTTPS proxy without shell exports and fails instead of connecting directly when the proxy stops", async () => {
    const proxy = createServer();
    proxy.listen(0, "127.0.0.1");
    await once(proxy, "listening");
    function fetchFromNode(env) {
        return new Promise((resolve, reject) => {
            const child = spawn(process.execPath, ["-e", `
                fetch("https://provider.invalid/", { signal: AbortSignal.timeout(3000) }).then(
                    () => process.exit(2),
                    error => console.log(error.cause?.code ?? error.message)
                );
            `], { env, stdio: ["ignore", "pipe", "ignore"] });
            let stdout = "";
            child.stdout.setEncoding("utf8").on("data", (text) => { stdout += text; });
            child.once("error", reject);
            child.once("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(`Probe exited with code ${code}`)));
        });
    }
    const env = resolveWebProxyEnvironment({}, { platform: "darwin", readSystemProxy: () => macProxy(proxy.address().port) });
    let connectLine;
    proxy.on("connection", (socket) => {
        socket.once("data", (data) => {
            connectLine = data.toString().split("\r\n")[0];
            socket.end("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n");
        });
    });
    try {
        await fetchFromNode(env);
        assert.equal(connectLine, "CONNECT provider.invalid:443 HTTP/1.1");
    } finally {
        await new Promise((resolve) => proxy.close(resolve));
    }
    assert.equal(await fetchFromNode(env), "ECONNREFUSED");
    assert.ok(env.no_proxy.split(",").includes("127.0.0.1"));
    assert.ok(env.no_proxy.split(",").includes(".local"));
});

test("web honors an explicit proxy and rejects proxy modes the runtime cannot use", () => {
    const readSystemProxy = () => { throw new Error("Explicit proxy should take precedence"); };
    const explicit = resolveWebProxyEnvironment({ HTTPS_PROXY: "http://localhost:9000" }, { platform: "darwin", readSystemProxy });
    assert.equal(explicit.https_proxy, "http://localhost:9000");
    const mac = (settings) => ({ platform: "darwin", readSystemProxy: () => `<dictionary> {\n${settings}\n}` });
    assert.deepEqual(resolveWebProxyEnvironment({}, mac("")), {});
    assert.throws(
        () => resolveWebProxyEnvironment({ HTTPS_PROXY: "http://localhost:9000" }, { supportsProxy: false }),
        /cannot apply the configured proxy/,
    );
    assert.throws(
        () => resolveWebProxyEnvironment({}, mac("ProxyAutoConfigEnable : 1")),
        /Automatic macOS proxy configuration/,
    );
    assert.throws(
        () => resolveWebProxyEnvironment({}, mac("SOCKSEnable : 1")),
        /supports SOCKS only/,
    );
});

test("lazygoal CLI eval gaia 显式拒绝 --tui 选项并返回退出码 2", () => {
    const res = spawnSync(process.execPath, [BIN_PATH, "eval", "gaia", "--tui", "--manifest", "m.json"], {
        encoding: "utf8",
    });
    assert.equal(res.status, 2);
    assert.match(res.stderr, /--tui 交互模式已被移除/);
});

test("lazygoal CLI eval swebench 显式拒绝 --tui 选项并返回退出码 2", () => {
    const res = spawnSync(process.execPath, [BIN_PATH, "eval", "swebench", "--tui", "--manifest", "m.json"], {
        encoding: "utf8",
    });
    assert.equal(res.status, 2);
    assert.match(res.stderr, /--tui 交互模式已被移除/);
});

test("lazygoal CLI grade swebench 缺少参数返回退出码 2", () => {
    const res = spawnSync(process.execPath, [BIN_PATH, "grade", "swebench"], {
        encoding: "utf8",
    });
    assert.equal(res.status, 2);
});

test("lazygoal CLI 显式拒绝旧终端命令 -c / resume / inspect 并返回退出码 2", () => {
    for (const cmd of ["-c", "resume", "inspect"]) {
        const res = spawnSync(process.execPath, [BIN_PATH, cmd], {
            encoding: "utf8",
        });
        assert.equal(res.status, 2, `command ${cmd} should exit with code 2`);
        assert.match(res.stderr, /已被移除.*lazygoal.*web/);
    }
});
