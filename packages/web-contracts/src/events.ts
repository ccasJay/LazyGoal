/**
 * Web SSE 实时流事件数据传输对象 (DTO)。
 *
 * @remarks
 * 类型与约束的唯一来源是 [`wire.ts`](./wire.ts)；本模块只保留既有公开导入路径。
 */

export type {
    BrowserGoalActivityEvent,
    BrowserGoalLiveEvent,
} from "./wire";
