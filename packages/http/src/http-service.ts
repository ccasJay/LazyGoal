import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const LOOPBACK_HOST = "127.0.0.1";

/**
 * 本机 HTTP 服务启动后可供客户端连接的地址。
 *
 * @example
 * ```ts
 * const address: HttpServiceAddress = {
 *     host: "127.0.0.1", port: 43127, origin: "http://127.0.0.1:43127",
 * };
 * ```
 */
export interface HttpServiceAddress {
    /** 固定的 IPv4 回环地址。 */
    readonly host: "127.0.0.1";
    /** 实际监听端口；请求端口 `0` 时由操作系统分配。 */
    readonly port: number;
    /** 含协议、主机和实际端口的 HTTP Origin。 */
    readonly origin: string;
}

/**
 * 可复用本机 HTTP 服务的显式生命周期边界。
 *
 * @remarks
 * 服务使用 Hono 路由子应用，只绑定 IPv4 回环地址。所有路由必须在启动前
 * 挂载；关闭后实例不能再次启动。
 *
 * @example
 * ```ts
 * const service = createHttpService();
 * service.mount("/health", healthRoutes);
 * const address = await service.start(0);
 * await service.close();
 * ```
 */
export interface HttpService {
    /**
     * 将一个 Hono 子应用挂载到指定前缀。
     *
     * @param prefix - 以 `/` 开始的路由前缀。
     * @param routes - 子应用路由。
     * @throws 服务已开始启动或前缀不是绝对路径时抛出 {@link HttpServiceLifecycleError}。
     */
    mount(prefix: string, routes: Hono): void;

    /**
     * 在本机 IPv4 回环地址监听指定端口。
     *
     * @param port - TCP 端口；`0` 表示交由操作系统分配。
     * @returns 服务监听成功后的实际连接地址。
     * @throws 非法端口、重复启动或端口监听失败时 reject。
     */
    start(port: number): Promise<HttpServiceAddress>;

    /**
     * 关闭本机监听及现有 HTTP 连接。
     *
     * @returns 关闭完成后 resolve；尚未启动时直接 resolve。
     * @throws 启动尚未完成或底层服务器关闭失败时 reject。
     */
    close(): Promise<void>;
}

/**
 * HTTP 服务生命周期配置或操作错误。
 *
 * @example
 * ```ts
 * if (error instanceof HttpServiceLifecycleError) console.error(error.code);
 * ```
 */
export class HttpServiceLifecycleError extends Error {
    readonly code = "HTTP_SERVICE_LIFECYCLE_ERROR" as const;

    /** @param message - 启动或生命周期状态错误的简短说明。 */
    constructor(message: string) {
        super(message);
        this.name = "HttpServiceLifecycleError";
    }
}

/**
 * 创建尚未监听端口的本机 HTTP 服务。
 *
 * @returns 可挂载路由、显式启动并关闭的 HTTP 服务。
 * @example
 * ```ts
 * const service = createHttpService();
 * service.mount("/api", apiRoutes);
 * const address = await service.start(43127);
 * ```
 */
export function createHttpService(): HttpService {
    return new LocalHttpService();
}

class LocalHttpService implements HttpService {
    private readonly app = new Hono();
    private server: Server | undefined;
    private lifecycle: "created" | "starting" | "running" | "closed" = "created";

    mount(prefix: string, routes: Hono): void {
        if (this.lifecycle !== "created") {
            throw new HttpServiceLifecycleError("Routes must be mounted before the HTTP service starts");
        }
        if (!prefix.startsWith("/") || prefix.length === 0) {
            throw new HttpServiceLifecycleError("Route prefix must be an absolute path");
        }
        this.app.route(prefix, routes);
    }

    start(port: number): Promise<HttpServiceAddress> {
        if (!Number.isInteger(port) || port < 0 || port > 65_535) {
            return Promise.reject(new HttpServiceLifecycleError("Port must be an integer from 0 to 65535"));
        }
        if (this.lifecycle !== "created") {
            return Promise.reject(new HttpServiceLifecycleError("HTTP service can only be started once"));
        }

        this.lifecycle = "starting";
        return new Promise<HttpServiceAddress>((resolve, reject) => {
            // 未提供 createServer 选项，适配器在此路径返回 Node HTTP Server。
            const server = serve({
                fetch: this.app.fetch,
                hostname: LOOPBACK_HOST,
                port,
            }) as Server;
            this.server = server;

            const onError = (error: Error) => {
                server.removeListener("listening", onListening);
                this.server = undefined;
                this.lifecycle = "created";
                reject(error);
            };
            const onListening = () => {
                server.removeListener("error", onError);
                const address = server.address() as AddressInfo | null;
                if (address === null) {
                    this.server = undefined;
                    this.lifecycle = "created";
                    reject(new HttpServiceLifecycleError("HTTP server started without a TCP address"));
                    return;
                }
                this.lifecycle = "running";
                resolve({
                    host: LOOPBACK_HOST,
                    port: address.port,
                    origin: `http://${LOOPBACK_HOST}:${address.port}`,
                });
            };
            server.once("error", onError);
            server.once("listening", onListening);
        });
    }

    close(): Promise<void> {
        if (this.lifecycle === "created") {
            this.lifecycle = "closed";
            return Promise.resolve();
        }
        if (this.lifecycle === "starting") {
            return Promise.reject(new HttpServiceLifecycleError("Cannot close before HTTP service startup completes"));
        }
        if (this.lifecycle === "closed" || this.server === undefined) return Promise.resolve();

        const server = this.server;
        this.lifecycle = "closed";
        this.server = undefined;
        return new Promise<void>((resolve, reject) => {
            server.close((error) => {
                if (error !== undefined) reject(error);
                else resolve();
            });
            server.closeAllConnections();
        });
    }
}
