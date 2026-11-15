const { execFileSync } = require("node:child_process");
const { isIP } = require("node:net");

function readMacProxySettings() {
    try {
        return execFileSync("/usr/sbin/scutil", ["--proxy"], { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        throw new Error("Could not read macOS proxy settings. Set HTTPS_PROXY explicitly before starting LazyGoal.");
    }
}

function macProxySettings(output) {
    if (!output.trim().startsWith("<dictionary> {")) {
        throw new Error("Could not read macOS proxy settings. Set HTTPS_PROXY explicitly before starting LazyGoal.");
    }
    const values = new Map();
    const exceptions = [];
    let depth = 0;
    let readingExceptions = false;
    for (const line of output.trim().split("\n")) {
        const entry = line.trim();
        if (entry === "}") {
            if (depth === 2) readingExceptions = false;
            depth--;
            continue;
        }
        const match = /^([\w]+)\s*:\s*(.*?)$/.exec(entry);
        if (match !== null) {
            const [, key, value] = match;
            if (depth === 2 && readingExceptions) {
                if (/^\d+$/.test(key) && /^(?:\*?\.)?[\da-z][\da-z.-]*$/i.test(value)) {
                    exceptions.push(value.replace(/^\*\./, "."));
                }
            } else if (depth === 1) {
                if (key === "ExceptionsList" && value === "<array> {") {
                    readingExceptions = true;
                } else {
                    values.set(key, value);
                }
            }
        }
        if (entry.endsWith(" {")) depth++;
    }

    if (values.get("ProxyAutoConfigEnable") === "1" || values.get("ProxyAutoDiscoveryEnable") === "1") {
        throw new Error("Automatic macOS proxy configuration requires an explicit HTTP proxy in HTTPS_PROXY to start LazyGoal.");
    }
    const address = (scheme) => {
        if (values.get(`${scheme}Enable`) !== "1") return undefined;
        const host = values.get(`${scheme}Proxy`);
        const port = values.get(`${scheme}Port`);
        if (!host || (!isIP(host) && !/^[\da-z][\da-z.-]*$/i.test(host)) || !/^\d+$/.test(port ?? "") || Number(port) < 1 || Number(port) > 65535) {
            throw new Error("macOS returned an invalid web proxy address. Check System Settings or set HTTPS_PROXY explicitly.");
        }
        return `http://${isIP(host) === 6 ? `[${host}]` : host}:${port}`;
    };
    const http = address("HTTP");
    const https = address("HTTPS");
    if (http === undefined && https === undefined && values.get("SOCKSEnable") === "1") {
        throw new Error("The macOS proxy supports SOCKS only. Set HTTPS_PROXY to an HTTP proxy before starting LazyGoal.");
    }
    return { http, https, exceptions };
}

function validateProxy(value, name) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`${name} must be an HTTP or HTTPS proxy URL.`);
    }
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.pathname !== "/" || url.search || url.hash) {
        throw new Error(`${name} must be an HTTP or HTTPS proxy URL.`);
    }
}

function resolveWebProxyEnvironment(env, {
    platform = process.platform,
    readSystemProxy = readMacProxySettings,
    supportsProxy = process.allowedNodeEnvironmentFlags.has("--use-env-proxy"),
} = {}) {
    const explicitHttp = env.http_proxy?.trim() || env.HTTP_PROXY?.trim();
    const explicitHttps = env.https_proxy?.trim() || env.HTTPS_PROXY?.trim();
    const allProxy = env.all_proxy?.trim() || env.ALL_PROXY?.trim();
    const system = !explicitHttp && !explicitHttps && !allProxy && platform === "darwin"
        ? macProxySettings(readSystemProxy())
        : undefined;
    const http = explicitHttp || explicitHttps || allProxy || system?.http || system?.https;
    const https = explicitHttps || explicitHttp || allProxy || system?.https || system?.http;
    if (!http || !https) return env;
    validateProxy(http, "HTTP_PROXY");
    validateProxy(https, "HTTPS_PROXY");
    if (!supportsProxy) throw new Error("This Node.js version cannot apply the configured proxy. Use Node.js 22.21 or a newer version with --use-env-proxy support.");

    const bypass = ["localhost", "127.0.0.1", "::1", "[::1]", env.no_proxy ?? env.NO_PROXY ?? system?.exceptions.join(",")]
        .filter(Boolean).join(",");
    return {
        ...env,
        NODE_USE_ENV_PROXY: "1",
        http_proxy: http, HTTP_PROXY: http,
        https_proxy: https, HTTPS_PROXY: https,
        no_proxy: bypass, NO_PROXY: bypass,
    };
}

module.exports = { resolveWebProxyEnvironment };
