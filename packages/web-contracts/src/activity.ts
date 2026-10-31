/**
 * Web Activity 历史 DTO。
 *
 * @remarks
 * 类型与约束的唯一来源是 [`wire.ts`](./wire.ts)；本模块只保留既有公开导入路径。
 */

export { BROWSER_ACTIVITY_EVENT_TYPES } from "./wire";
export type {
    BrowserActivityActionContext,
    BrowserActivityEventType,
    BrowserActivityFactItem,
    BrowserActivityGap,
    BrowserActivityItem,
    BrowserActivityMessageItem,
    BrowserActivityPage,
    BrowserActivityPosition,
    BrowserActivityQuery,
    BrowserActivityReadResult,
    BrowserActivityRunContext,
    BrowserActivityRunWindow,
    BrowserActivityStageContext,
    BrowserActivityThinkItem,
    BrowserActivityToolLifecycleEntry,
    BrowserActivityToolState,
} from "./wire";
