import type {
  BrowserControlIntentCommand,
  BrowserControlReceipt,
  BrowserControlScope,
  BrowserControlSnapshot,
  BrowserGoalList,
  BrowserModelCatalog,
  BrowserPermissionModeResult,
  BrowserToolGrantSummary,
} from "../../../../packages/web-contracts/src/index";
import type { ToolActivity } from "./tool-activity";

/**
 * 控制状态持有的独立资源投影。
 *
 * @remarks
 * 这些资源不属于 Goal SSE 的 `ControlSnapshot`：`goals`、`grants`、`permission`
 * 与 `model` 各自通过既有 HTTP 入口读取，并由 `ControlScope` 精确标记失效。
 * 省略字段表示该资源尚未读取，不等同于空集合。
 *
 * @example
 * ```ts
 * const resources: ControlResources = { grants: [], model: catalog };
 * ```
 */
export interface ControlResources {
  /** Goal 列表、归档与删除后的投影。 */
  readonly goals?: BrowserGoalList;
  /** Tool／Sandbox Grant 摘要。 */
  readonly grants?: readonly BrowserToolGrantSummary[];
  /** 项目权限模式与 revision。 */
  readonly permission?: Extract<BrowserPermissionModeResult, { readonly ok: true }>;
  /** 当前模型选择与模型目录。 */
  readonly model?: BrowserModelCatalog;
}

/**
 * 单条控制意图在页面侧的派生生命周期。
 *
 * @remarks
 * `pending` 表示请求尚未返回；`accepted` 表示服务端已受理但尚未确认应用；
 * `applied` 表示已有应用事实；`rejected` 与 `unknown` 分别对应稳定拒绝与
 * 结果不明。`verification` 只在结果不明后由统一核验重新结算。
 *
 * @example
 * ```ts
 * const state: ControlIntentState = { intent, phase: "pending" };
 * ```
 */
export interface ControlIntentState {
  /** 原冻结载荷；同一 `intentId` 不得被改写。 */
  readonly intent: BrowserControlIntentCommand;
  /** 浏览器预检发出时对应的视图及等待身份。 */
  readonly reviewTarget?: { readonly view: GoalView; readonly interactionId: string };
  readonly phase: "pending" | "accepted" | "applied" | "rejected" | "unknown";
  /** 最近一次受理收据；尚未收到时省略。 */
  readonly receipt?: BrowserControlReceipt;
  /** 结果不明后的统一核验结论；未核验时省略。 */
  readonly verification?: "applied" | "not_applied" | "unknown";
}

/**
 * 当前控制流连接与失效范围。
 *
 * @remarks
 * 只有接纳达到所需修订的控制快照才能清除会话失效。连接断开不等同于
 * Run 失败，也不清除最后确认的控制状态。
 *
 * @example
 * ```ts
 * const connection: ControlConnection = { connected: true, synced: true, stale: false, syncRevision: 3, staleScopes: [] };
 * ```
 */
export interface ControlConnection {
  /** SSE 连接是否仍然建立。 */
  readonly connected: boolean;
  /** 本次连接是否已接纳达到同步水位的控制快照。 */
  readonly synced: boolean;
  /** 已确认内容是否可能过期。 */
  readonly stale: boolean;
  /** 当前连接声明的同步修订，断开后清空。 */
  readonly syncRevision: number | null;
  /** 需要重新读取的投影作用域。 */
  readonly staleScopes: readonly BrowserControlScope[];
}

/** 本次选择的浏览器观察身份。对象身份区分同一 Goal 的不同打开过程。 */
export type GoalView = { readonly goalId: string };

/**
 * Goal Board 的控制状态。
 *
 * @remarks
 * 这是 runtime 事实、受理收据与本客户端意图的纯派生结果，不持久化。
 * `snapshot` 来自当前视图已接纳的窄 HTTP 或 SSE 投影。
 *
 * @example
 * ```ts
 * const next = applyControlEvent(createControlState(), event);
 * ```
 */
export interface ControlState {
  /** 当前选择的观察身份。 */
  readonly view: GoalView | null;
  /** 已收到的会话失效通知要求的最低修订。 */
  readonly requiredSessionRevision: number;
  /** 当前视图已接纳的控制快照。 */
  readonly snapshot: BrowserControlSnapshot | null;
  /** 本客户端最近的控制意图，按受理顺序保留。 */
  readonly intents: readonly ControlIntentState[];
  /** 当前活动工具尝试。 */
  readonly toolActivities: readonly ToolActivity[];
  /** 独立资源投影。 */
  readonly resources: ControlResources;
  readonly connection: ControlConnection;
}
