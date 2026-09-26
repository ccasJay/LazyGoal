import { randomBytes, timingSafeEqual } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { Hono, type Context } from "hono";

import type { HttpServiceMiddleware } from "../../http/src/index";

const SECURITY_HEADERS = {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
} as const;

const PUBLIC_ASSET_PATHS = new Set(["/", "/favicon.ico"]);

/**
 * 一个浏览器服务实例的临时访问能力。
 *
 * @remarks
 * 能力令牌只在此进程内存中保存，并通过启动 URL 的 fragment 交给页面；
 * fragment 不会随 HTTP 请求发送。页面资源可公开读取，但其他路由必须通过
 * 同源检查和 Bearer 校验。绑定真实监听 Origin 后才能创建入口 URL。
 *
 * @example
 * ```ts
 * const access = createBrowserSessionAccess();
 * access.bindOrigin("http://127.0.0.1:43127");
 * const launchUrl = access.createLaunchUrl("http://127.0.0.1:43127");
 * ```
 */
export interface BrowserSessionAccess {
    /** 在所有 HTTP 路由前执行的访问控制与安全响应头中间件。 */
    readonly middleware: HttpServiceMiddleware;
    /**
     * 绑定 HTTP 服务实际监听的 Origin。
     *
     * @param origin - IPv4 回环 HTTP Origin，包含实际端口。
     * @throws Origin 不是合法的 `127.0.0.1` HTTP 地址，或重复绑定到不同 Origin。
     */
    bindOrigin(origin: string): void;
    /**
     * 创建供本机用户打开的授权 URL。
     *
     * @param origin - 必须与先前绑定的 Origin 完全一致。
     * @returns 带有 fragment 能力令牌的页面 URL。
     * @throws 尚未绑定或传入 Origin 不匹配时抛出错误。
     */
    createLaunchUrl(origin: string): string;
}

/**
 * 创建仅供本机浏览器会话使用的临时访问能力。
 *
 * @returns 页面资源中间件、Origin 绑定和授权入口 URL 工厂。
 * @example
 * ```ts
 * const access = createBrowserSessionAccess();
 * ```
 */
export function createBrowserSessionAccess(): BrowserSessionAccess {
    const token = randomBytes(32).toString("base64url");
    let boundOrigin: string | undefined;

    const middleware: HttpServiceMiddleware = async (context, next) => {
        for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
            context.header(name, value);
        }

        const request = context.req.raw;
        const expectedOrigin = boundOrigin;
        const expectedHost = expectedOrigin === undefined
            ? undefined
            : new URL(expectedOrigin).host;
        if (
            expectedHost === undefined
            || request.headers.get("host")?.toLowerCase() !== expectedHost.toLowerCase()
        ) {
            return context.json({ error: "invalid_host" }, 403);
        }

        const path = new URL(request.url).pathname;
        const isPublicAsset = request.method === "GET"
            && (PUBLIC_ASSET_PATHS.has(path) || path.startsWith("/assets/"));
        if (isPublicAsset) {
            await next();
            return;
        }

        const origin = request.headers.get("origin");
        if (origin !== null && origin !== expectedOrigin) {
            return context.json({ error: "cross_origin_denied" }, 403);
        }
        if (request.method !== "GET" && request.method !== "HEAD" && origin !== expectedOrigin) {
            return context.json({ error: "origin_required" }, 403);
        }
        const fetchSite = request.headers.get("sec-fetch-site");
        if (fetchSite !== null && fetchSite !== "same-origin" && fetchSite !== "none") {
            return context.json({ error: "cross_origin_denied" }, 403);
        }
        if (!hasValidBearerToken(request.headers.get("authorization"), token)) {
            return context.json({ error: "unauthorized" }, 401);
        }

        await next();
    };

    return {
        middleware,
        bindOrigin(origin) {
            const parsed = new URL(origin);
            if (
                parsed.protocol !== "http:"
                || parsed.hostname !== "127.0.0.1"
                || parsed.username.length > 0
                || parsed.password.length > 0
                || parsed.pathname !== "/"
                || parsed.search.length > 0
                || parsed.hash.length > 0
                || parsed.port.length === 0
            ) {
                throw new Error("Browser session Origin must be an IPv4 loopback HTTP address with a port");
            }
            if (boundOrigin !== undefined && boundOrigin !== parsed.origin) {
                throw new Error("Browser session Origin is already bound");
            }
            boundOrigin = parsed.origin;
        },
        createLaunchUrl(origin) {
            if (boundOrigin === undefined || origin !== boundOrigin) {
                throw new Error("Browser session Origin must be bound before creating its launch URL");
            }
            return `${boundOrigin}/#${token}`;
        },
    };
}

function hasValidBearerToken(header: string | null, expectedToken: string): boolean {
    if (header === null || !header.startsWith("Bearer ")) return false;
    const provided = Buffer.from(header.slice("Bearer ".length));
    const expected = Buffer.from(expectedToken);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/**
 * 创建只提供页面根文档和构建资源的静态路由。
 *
 * @param assetDirectory - 包含 `index.html` 和可选 `assets/` 子目录的只读目录。
 * @returns 可挂载到 `HttpService` 的静态路由；路径越界与不存在的资源均返回 404。
 * @example
 * ```ts
 * const routes = createBrowserStaticRoutes("/app/dist");
 * httpService.mount("/", routes);
 * ```
 */
export function createBrowserStaticRoutes(assetDirectory: string): Hono {
    const routes = new Hono();

    routes.get("/", async (context) => serveFile(context, assetDirectory, "index.html"));
    routes.get("/favicon.ico", async (context) => serveFile(context, assetDirectory, "favicon.ico"));
    routes.get("/assets/*", async (context) => {
        let relativePath: string;
        try {
            relativePath = decodeURIComponent(context.req.path.slice("/assets/".length));
        } catch {
            return context.body(null, 404);
        }
        return serveFile(context, assetDirectory, `assets/${relativePath}`);
    });

    return routes;
}

async function serveFile(
    context: Context,
    assetDirectory: string,
    relativePath: string,
): Promise<Response> {
    const root = resolve(assetDirectory);
    const filePath = resolve(root, relativePath);
    const fromRoot = relative(root, filePath);
    if (isOutsideRoot(fromRoot)) return context.body(null, 404);

    try {
        const rootPath = await realpath(root);
        const actualPath = await realpath(filePath);
        const actualRelativePath = relative(rootPath, actualPath);
        if (isOutsideRoot(actualRelativePath)) return context.body(null, 404);
        const stat = await lstat(actualPath);
        if (!stat.isFile()) return context.body(null, 404);
        const content = await readFile(actualPath);
        return context.body(content, 200, { "content-type": contentType(actualPath) });
    } catch {
        return context.body(null, 404);
    }
}

function isOutsideRoot(path: string): boolean {
    return path === ".." || path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(path);
}

function contentType(path: string): string {
    switch (extname(path).toLowerCase()) {
        case ".html": return "text/html; charset=utf-8";
        case ".css": return "text/css; charset=utf-8";
        case ".js": return "text/javascript; charset=utf-8";
        case ".json": return "application/json; charset=utf-8";
        case ".svg": return "image/svg+xml";
        case ".png": return "image/png";
        case ".ico": return "image/x-icon";
        case ".woff2": return "font/woff2";
        default: return "application/octet-stream";
    }
}
