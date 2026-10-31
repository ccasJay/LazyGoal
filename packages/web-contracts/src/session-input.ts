/**
 * Web 统一会话输入、收据与安全会话状态的 wire 传输对象。
 *
 * @remarks
 * 类型与约束的唯一来源是 [`wire.ts`](./wire.ts)；本模块只保留既有公开导入路径。
 */

export type {
    BrowserCreateSessionCommand,
    BrowserCreateSessionResult,
    BrowserGoalSessionEnvelope,
    BrowserGoalSessionStateEnvelope,
    BrowserJsonValue,
    BrowserQueueBinding,
    BrowserSessionInputCommand,
    BrowserSessionInputErrorCode,
    BrowserSessionInputKind,
    BrowserSessionInputOutcome,
    BrowserSessionInputQueryResult,
    BrowserSessionInputReceipt,
    BrowserSessionInputResult,
    BrowserSessionInputStatus,
    BrowserSessionInteractionResponse,
    BrowserSessionMessageEntry,
    BrowserSessionMessageListResult,
    BrowserSessionMessageResult,
    BrowserSessionState,
    BrowserSessionStateInteraction,
    BrowserSessionStateMessage,
} from "./wire";
