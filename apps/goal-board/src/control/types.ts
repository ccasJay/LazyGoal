import type {
  BrowserGoalList,
  BrowserModelCatalog,
  BrowserPermissionModeResult,
  BrowserToolGrantSummary,
} from "../../../../packages/web-contracts/src/index";

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
