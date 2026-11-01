/**
 * Browser 控制命令与受理收据的 wire DTO。
 *
 * @remarks
 * 类型与约束的唯一来源是 [`wire.ts`](./wire.ts)；本模块只保留公开导入路径。
 */

export type {
    BrowserControlIntentCommand,
    BrowserControlIntentResult,
    BrowserControlReceipt,
    BrowserControlScope,
    BrowserControlSnapshot,
} from "./wire";
