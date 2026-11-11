import { createSessionMetricsRoutes } from "../../../packages/session-metrics/src/index";
import { createHealthzRoutes } from "../../../packages/browser/src/index";
import {
    createHttpService,
    type HttpService,
    type HttpServiceMiddleware,
} from "../../../packages/http/src/index";
import {
    HostShutdownCoordinator,
    ProcessExitPort,
    type ExitPort,
} from "./process-exit";
import {
    createRuntimeComposition,
    type RuntimeComposition,
    type RuntimeCompositionOptions,
} from "./runtime";

export { createDefaultToolPolicy, resolveWorkspaceRoot } from "./runtime";
export type { RuntimeComposition, RuntimeCompositionOptions } from "./runtime";

export interface CompositionRootOptions extends RuntimeCompositionOptions {
    /** 宿主 HTTP 中间件（含浏览器访问控制）；关闭准入由本层追加。 */
    readonly httpMiddleware?: HttpServiceMiddleware;
    /** 宿主进程退出请求实现；省略时使用 `ProcessExitPort`。 */
    readonly exitPort?: ExitPort;
}

export interface CompositionRoot extends RuntimeComposition {
    /** 已挂载健康探针与指标路由、尚未启动的 HTTP 服务。 */
    readonly httpService: HttpService;
    /** 宿主关闭协调：结算实例后按应用决定退出。 */
    readonly shutdownCoordinator: HostShutdownCoordinator;
}

/**
 * 装配无界面运行时并叠加 HTTP/进程宿主职责。
 *
 * @remarks
 * 依赖装配、执行链与生命周期由 `createRuntimeComposition` 完成；本函数只创建
 * HTTP 服务、挂载健康探针与指标路由、追加关闭准入中间件、把 HTTP 关闭注册为应用资源，
 * 并构造宿主退出协调器。实例关闭后仍拒绝新的 Web 写请求，直到 HTTP 关闭。
 *
 * @param options - 运行时装配选项与宿主 HTTP/退出选项。
 * @returns 无界面运行时加上 HTTP 服务与宿主关闭协调器。
 * @throws 运行时装配失败时保留原始故障；装配层自有的资源已结算。
 */
export async function createCompositionRoot(
    options: CompositionRootOptions = {},
): Promise<CompositionRoot> {
    const runtime = await createRuntimeComposition(options);
    const rejectWriteAfterShutdown = (method: string): boolean =>
        runtime.abortController.signal.aborted
        && (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE");
    const shutdownAdmission: HttpServiceMiddleware = async (context, next) => {
        if (rejectWriteAfterShutdown(context.req.method)) {
            return context.json({ error: "service_shutting_down" }, 503);
        }
        await next();
    };
    const httpMiddleware: HttpServiceMiddleware = options.httpMiddleware === undefined
        ? shutdownAdmission
        : async (context, next) => {
            let rejectedForShutdown = false;
            const middlewareResult = await options.httpMiddleware!(context, async () => {
                if (rejectWriteAfterShutdown(context.req.method)) {
                    rejectedForShutdown = true;
                    return;
                }
                await next();
            });
            if (rejectedForShutdown) return context.json({ error: "service_shutting_down" }, 503);
            return middlewareResult;
        };
    const httpService = createHttpService({ middleware: httpMiddleware });
    httpService.mount("/", createHealthzRoutes());
    httpService.mount("/", createSessionMetricsRoutes(runtime.sessionMetricsService));

    return {
        ...runtime,
        httpService,
        shutdownCoordinator: new HostShutdownCoordinator({
            lifecycle: runtime.lifecycle,
            exitPort: options.exitPort ?? new ProcessExitPort(),
            closeAppResources: async () => {
                await httpService.close();
            },
        }),
    };
}
