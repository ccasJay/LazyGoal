/**
 * Web 轨迹查询与事件详情数据传输对象 (DTO)。
 *
 * @remarks
 * 类型与约束的唯一来源是 [`wire.ts`](./wire.ts)；本模块只保留既有公开导入路径。
 */

export type {
    BrowserExecutionErrorPayload,
    BrowserModelRepairAttemptStartedPayload,
    BrowserModelRepairFeedbackRecordedPayload,
    BrowserTrajectoryDetail,
    BrowserTrajectoryEntry,
    BrowserTrajectoryEventPayloadWire,
    BrowserTrajectoryEventWire,
    BrowserTrajectoryFeedbackWire,
    BrowserTrajectoryIssueWire,
    BrowserTrajectoryObservationWire,
    BrowserTrajectoryPage,
    BrowserTrajectoryRun,
    BrowserTrajectoryRuns,
} from "./wire";
