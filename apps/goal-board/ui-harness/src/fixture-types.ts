import type {
  BrowserActivityPage,
  BrowserControlIntentCommand,
  BrowserControlReceipt,
  BrowserGoalEvent,
  BrowserGoalList,
  BrowserGoalSessionEnvelope,
  BrowserGoalSessionStateEnvelope,
  BrowserModelCatalog,
  BrowserPermissionModeResult,
  BrowserProviderSettings,
  BrowserToolGrantSummary,
  BrowserTrajectoryDetail,
  BrowserTrajectoryPage,
  BrowserTrajectoryRuns,
  BrowserTrajectoryTimeline,
  BrowserWorkspaceContext,
} from "../../../../packages/web-contracts/src/index";

/** Fixture 端点响应状态覆盖模式。 */
export type FixtureMode = "success" | "loading" | "error" | "empty";

/** 单个端点的 Fixture 配置。 */
export interface FixtureEndpointConfig<T> {
  /** 覆盖模式；默认 `success`。 */
  readonly mode?: FixtureMode;
  /** 模拟加载延迟时间（毫秒）；仅在 `loading` 或需要慢速时生效。 */
  readonly delayMs?: number;
  /** 成功模式下的数据负载。 */
  readonly data?: T;
  /** 错误模式下的 HTTP 状态码；默认 500。 */
  readonly errorStatus?: number;
  /** 错误模式下的错误代码。 */
  readonly errorCode?: string;
}

/** 完整场景的 Fixture 数据集合。 */
export interface FixtureScenario {
  /** 场景唯一标识。 */
  readonly id: string;
  /** 场景描述说明。 */
  readonly description?: string;
  /** 工作区上下文配置。 */
  readonly workspace?: FixtureEndpointConfig<BrowserWorkspaceContext>;
  /** 目标列表配置。 */
  readonly goals?: FixtureEndpointConfig<BrowserGoalList>;
  /** 会话完整信封（按 goalId 索引）。 */
  readonly goalSessionEnvelopes?: Record<string, FixtureEndpointConfig<BrowserGoalSessionEnvelope>>;
  /** 会话状态信封（按 goalId 索引）。 */
  readonly goalSessionStateEnvelopes?: Record<string, FixtureEndpointConfig<BrowserGoalSessionStateEnvelope>>;
  /** 活动时间线分页（按 goalId 索引）。 */
  readonly activities?: Record<string, FixtureEndpointConfig<BrowserActivityPage>>;
  /** 实时推送事件（按 goalId 索引）。 */
  readonly events?: Record<string, {
    readonly mode?: FixtureMode;
    readonly delayMs?: number;
    readonly initialEvents?: readonly BrowserGoalEvent[];
  }>;
  /** 工具授权记录（按 goalId 索引）。 */
  readonly toolGrants?: Record<string, FixtureEndpointConfig<readonly BrowserToolGrantSummary[]>>;
  /** 权限模式配置。 */
  readonly permissionMode?: FixtureEndpointConfig<BrowserPermissionModeResult>;
  /** 模型目录配置。 */
  readonly models?: FixtureEndpointConfig<BrowserModelCatalog>;
  /** 供应商设置配置。 */
  readonly providerSettings?: FixtureEndpointConfig<BrowserProviderSettings>;
  /** 轨迹 Run 列表（按 goalId 索引）。 */
  readonly trajectoryRuns?: Record<string, FixtureEndpointConfig<BrowserTrajectoryRuns>>;
  /** 轨迹事件页（按 goalId 索引）。 */
  readonly trajectories?: Record<string, FixtureEndpointConfig<BrowserTrajectoryPage>>;
  /** 轨迹时间线桶（按 goalId 索引）。 */
  readonly trajectoryTimelines?: Record<string, FixtureEndpointConfig<BrowserTrajectoryTimeline>>;
  /** 轨迹事件详情（按 `${goalId}:${sequence}` 索引）。 */
  readonly trajectoryDetails?: Record<string, FixtureEndpointConfig<BrowserTrajectoryDetail>>;
  /** 控制命令受理结果。 */
  readonly controlReceipt?: (intent: BrowserControlIntentCommand) => BrowserControlReceipt;
}

/** Fixture 服务器启动选项。 */
export interface FixtureServerOptions {
  /** 初始场景。 */
  readonly scenario: FixtureScenario;
  /** 静态页面构建产物目录；默认 `apps/goal-board/dist`。 */
  readonly distDir?: string;
  /** 浏览器鉴权 token，拼在 launchUrl 的 hash 片段中；默认 `fixture-token`。 */
  readonly token?: string;
  /** 监听端口；默认 0（随机空闲端口）。 */
  readonly port?: number;
}

/** Fixture 服务器运行实例。 */
export interface FixtureServerInstance {
  /** 服务根地址（如 `http://127.0.0.1:51234`）。 */
  readonly origin: string;
  /** 包含鉴权 token 的启动地址（如 `http://127.0.0.1:51234/#fixture-token`）。 */
  readonly launchUrl: string;
  /** 获取当前运行的场景。 */
  readonly getScenario: () => FixtureScenario;
  /** 动态更新场景。 */
  readonly updateScenario: (scenario: FixtureScenario) => void;
  /** 停止服务并释放端口。 */
  readonly close: () => Promise<void>;
}
