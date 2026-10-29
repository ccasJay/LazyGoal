/**
 * 在加载 npm `undici` 后恢复 Node 内置 fetch 的环境代理 dispatcher。
 *
 * @remarks
 * Node 22 的 `NODE_USE_ENV_PROXY` 把 `EnvHttpProxyAgent` 写入
 * `Symbol.for("undici.globalDispatcher.1")`。`undici@8` 初始化自己的全局
 * dispatcher 时会覆盖同一槽位，使后续 `fetch()` 退回普通 `Agent` 并绕过代理。
 * 本模块必须在 `undici` 之前求值以捕获原 dispatcher；导入方在 `undici` 求值后
 * 调用 `restoreNodeGlobalDispatcher()`。未启用环境代理或槽位为空时不写入。
 *
 * @example
 * ```ts
 * import { restoreNodeGlobalDispatcher } from "./undici-env-proxy-guard";
 * import { request } from "undici";
 *
 * restoreNodeGlobalDispatcher();
 * ```
 */
const NODE_GLOBAL_DISPATCHER = Symbol.for("undici.globalDispatcher.1");
const dispatcherSlot = globalThis as unknown as Record<symbol, unknown>;
const nodeGlobalDispatcher = dispatcherSlot[NODE_GLOBAL_DISPATCHER];

/**
 * 把 Node 内置 fetch 的全局 dispatcher 恢复为本模块求值时的实例。
 *
 * @remarks
 * 只恢复 Node 的环境代理槽位，不改变 npm `undici` 自己的全局 dispatcher；
 * 抓取请求仍显式传入各自创建的 `Agent`。槽位不可写时保持现状，避免阻断请求。
 */
export function restoreNodeGlobalDispatcher(): void {
    if (
        nodeGlobalDispatcher === undefined
        || dispatcherSlot[NODE_GLOBAL_DISPATCHER] === nodeGlobalDispatcher
    ) {
        return;
    }
    try {
        dispatcherSlot[NODE_GLOBAL_DISPATCHER] = nodeGlobalDispatcher;
    } catch {
        // Node 若改变该槽位的可写性，保留调用方原有行为。
    }
}
