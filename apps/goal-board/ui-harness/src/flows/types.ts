import type {
  BrowserControlIntentCommand,
  BrowserSessionInputCommand,
} from "../../../../../packages/web-contracts/src/index";
import type { DiagnosticsReport } from "../diagnostics";
import type { FixtureScenario } from "../fixture-types";
import type { ViewName } from "../view-registry";

/** 一次断言的轮询超时；未指定时使用 Flow 默认值。
 *
 * @example
 * ```ts
 * const timeout: FlowStepTimeout = { timeoutMs: 8000 };
 * ```
 */
export interface FlowStepTimeout {
  /** 等待条件成立的最长时间（毫秒）。 */
  readonly timeoutMs?: number;
}

/** 单个交互步骤。 */
export type FlowStep =
  | {
      readonly action: "click";
      /** 目标元素的 CSS 选择器。 */
      readonly selector: string;
    }
  | {
      readonly action: "fill";
      readonly selector: string;
      readonly value: string;
    }
  | {
      readonly action: "press";
      /** Playwright 键名，例如 `Enter` 或 `Escape`。 */
      readonly key: string;
      /** 可选的聚焦元素；省略时发送给当前焦点。 */
      readonly selector?: string;
    }
  | ({
      readonly action: "expect";
      readonly selector: string;
      /** 期望可见性；省略时不检查。 */
      readonly visible?: boolean;
      /** 期望文本包含的子串。 */
      readonly text?: string;
      /** 期望输入值完全相等。 */
      readonly value?: string;
      /** 期望禁用状态。 */
      readonly disabled?: boolean;
      /** 期望元素数量。 */
      readonly count?: number;
      /** 期望属性值完全相等。 */
      readonly attribute?: { readonly name: string; readonly value: string };
    } & FlowStepTimeout)
  | ({
      readonly action: "expectControl";
      /** 期望收到的控制命令种类。 */
      readonly kind: BrowserControlIntentCommand["kind"];
      /** 仅用于 `session_input`，限定输入种类。 */
      readonly inputKind?: BrowserSessionInputCommand["kind"];
      /** 期望的匹配数量；默认 1。 */
      readonly count?: number;
    } & FlowStepTimeout);

/** 一条可执行的 UI 交互流程。
 *
 * @example
 * ```ts
 * const flow: UiFlow = { id, description, view: "session", scenario, steps: [] };
 * ```
 */
export interface UiFlow {
  /** 流程唯一标识，用于 CLI 选择。 */
  readonly id: string;
  /** 流程意图说明。 */
  readonly description: string;
  /** 启动的视图。 */
  readonly view: ViewName;
  /** 流程专用的确定性场景。 */
  readonly scenario: FixtureScenario;
  /** 目标 Goal；省略时使用视图默认值。 */
  readonly goalId?: string;
  /** 按顺序执行的步骤。 */
  readonly steps: readonly FlowStep[];
  /** 所有断言步骤的默认超时（毫秒）；默认 5000。 */
  readonly stepTimeoutMs?: number;
}

/** 单个步骤的执行结果。
 *
 * @example
 * ```ts
 * const result: FlowStepResult = { index: 0, action: "click", ok: true, detail: "clicked", durationMs: 12 };
 * ```
 */
export interface FlowStepResult {
  /** 步骤在流程中的序号，从 0 开始。 */
  readonly index: number;
  readonly action: FlowStep["action"];
  /** 该步骤是否通过。 */
  readonly ok: boolean;
  /** 通过时的观测摘要或失败原因。 */
  readonly detail: string;
  readonly durationMs: number;
}

/** 一次流程执行报告。
 *
 * @example
 * ```ts
 * const report: FlowReport = { ok: true, flowId: "send-message", view: "session", steps: [] };
 * ```
 */
export interface FlowReport {
  /** 仅在全部步骤与运行时诊断都通过时为 true。 */
  readonly ok: boolean;
  readonly flowId: string;
  readonly view: ViewName;
  readonly steps: readonly FlowStepResult[];
  /** 失败时的页面截图路径。 */
  readonly screenshot?: string;
  /** 失败原因；通过时省略。 */
  readonly error?: string;
  /** 运行期间的 console、异常与 HTTP 错误；环境启动失败时省略。 */
  readonly diagnostics?: DiagnosticsReport;
}
