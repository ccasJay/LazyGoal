import type { BrowserGoalEvent } from "../../../packages/web-contracts/src/index";

/**
 * 当前连接实际观察到的公开执行阶段，不作为持久化历史或 Runtime 状态。
 *
 * @remarks
 * 最多保留 20 条；只保存事件语义与安全摘要，不复制正文、参数或推理。模型开始时间来自
 * 来源事件，其余时间只表示浏览器观察时间；两者在视图中分别标记。
 *
 * @example
 * ```ts
 * const entries = recordExecutionProgress([], event, Date.now());
 * ```
 */
export interface ExecutionProgressEntry {
  /** 当前连接内递增的展示身份。 */
  readonly id: number;
  /** 实际来源 Run；后继 Run 不继承前一 Run 的提示。 */
  readonly runId: string;
  /** 最后观察的公开事件种类。 */
  readonly kind: string;
  /** 用户可理解的工作描述。 */
  readonly label: string;
  /** 说明当前正在等待的公开结果。 */
  readonly detail: string;
  /** 模型事件来源时间，或浏览器实际观察时间（毫秒）。 */
  readonly startedAt: number;
  /** 最近收到同一操作公开事件的浏览器时间；正文分片更新此值而不重置开始时间。 */
  readonly lastObservedAt: number;
  /** 是否具有真实调用开始时间；false 时只能显示观察时长。 */
  readonly hasSourceTime: boolean;
  /** 已知的执行单元；用于归入对应步骤及定位真实轨迹。 */
  readonly executionUnitId?: string;
  /** 工具事件的真实 Action 身份；用于归入对应步骤，不能按相邻位置猜测。 */
  readonly actionId?: string;
}

/**
 * 将有意义的进度变化追加到当前连接的有界记录中。
 * @remarks 正文增量只记录首次开始到达，不为重复文本片段追加一行或重置观察时钟。
 * @param entries - 此连接已观察的进度。
 * @param event - 已通过 wire 校验的公开事件。
 * @param observedAt - 浏览器实际接收时间。
 * @returns 最多 20 条新记录；无语义变化时返回原引用。
 */
export function recordExecutionProgress(entries: readonly ExecutionProgressEntry[], event: BrowserGoalEvent, observedAt: number): readonly ExecutionProgressEntry[] {
  if (event.type !== "activity") return entries;
  const activity = event.activity;
  let label: string;
  let detail: string;
  switch (activity.kind) {
    case "model_started":
      label = "Waiting for model response";
      detail = activity.stage === "decide" ? "Choosing the next action. No response received yet."
        : activity.stage === "think" ? "Analyzing the question. No response received yet."
          : activity.stage === "completion_review" ? "Checking the proposed answer. No response received yet."
            : "Waiting for model output. No response received yet.";
      break;
    case "model_completed":
      label = "Processing model response";
      detail = "The model call returned. Waiting for the next execution event.";
      break;
    case "step_started":
      label = "Starting the next execution step";
      detail = "Waiting for a model or tool event.";
      break;
    case "assistant_text_delta":
      label = "Generating a response";
      detail = "Response text is arriving.";
      break;
    case "tool_started":
      label = `Running ${activity.toolId}`;
      detail = activity.inputSummary ?? "Waiting for the tool result.";
      break;
    case "tool_finished":
      label = `${activity.toolId} returned`;
      detail = "Waiting for the result to be saved.";
      break;
    case "tool_attempt_failed":
      label = `Tool attempt ${activity.attempt} failed`;
      detail = activity.reason;
      break;
    case "tool_attempt_started":
      label = `Running tool attempt ${activity.attempt}`;
      detail = "Waiting for the tool result.";
      break;
    default: return entries;
  }
  const previous = entries.at(-1);
  const sourceTime = activity.kind === "model_started" ? activity.occurredAt : undefined;
  const actionId = "actionId" in activity ? activity.actionId : undefined;
  const origin = actionId === undefined
    ? previous?.runId === event.runId && (previous.kind === "model_started" || previous.kind === "assistant_text_delta")
      && (activity.kind === "model_completed" || activity.kind === "assistant_text_delta") ? previous : undefined
    : [...entries].reverse().find(entry => entry.runId === event.runId && entry.actionId === actionId);
  const executionUnitId = "executionUnitId" in activity ? activity.executionUnitId : origin?.executionUnitId;
  if (previous?.runId === event.runId && previous.kind === activity.kind && previous.label === label && previous.detail === detail
    && previous.actionId === actionId && previous.executionUnitId === executionUnitId
    && activity.kind !== "model_started" && activity.kind !== "tool_started" && activity.kind !== "step_started") {
    return [...entries.slice(0, -1), { ...previous, lastObservedAt: observedAt }];
  }
  return [...entries, {
    id: (previous?.id ?? 0) + 1, runId: event.runId, kind: activity.kind, label, detail,
    startedAt: sourceTime === undefined ? observedAt : Date.parse(sourceTime), lastObservedAt: observedAt, hasSourceTime: sourceTime !== undefined,
    ...(executionUnitId === undefined ? {} : { executionUnitId }),
    ...(actionId === undefined ? {} : { actionId }),
  }].slice(-20);
}
