import type {
  BrowserRunStageGroup,
  BrowserRunStageStatus,
  BrowserSessionRun,
  BrowserSessionStep,
} from "../../../../packages/web-contracts/src/index";
import { stepActivity } from "./step-activity";


export interface GroupedStagesResult {
  readonly runLevelSteps: readonly BrowserSessionStep[];
  readonly stages: readonly BrowserRunStageGroup[];
}

/**
 * 将平铺的 Steps 按已提交的阶段分组聚合。
 *
 * @param steps - 该 Run 的全部真实步骤。
 * @param stages - 已解析出的阶段分组定义列表。
 * @returns 分离的 Run 级步骤与填充了所属 steps 的阶段分组。
 */
export function groupStepsByStage(
  steps: readonly BrowserSessionStep[],
  stages: readonly BrowserRunStageGroup[] = []
): GroupedStagesResult {
  if (stages.length === 0) {
    return {
      runLevelSteps: steps,
      stages: [],
    };
  }

  const stageMap = new Map<string, BrowserSessionStep[]>();
  for (const stage of stages) {
    stageMap.set(stage.stageId, []);
  }

  const runLevelSteps: BrowserSessionStep[] = [];

  for (const step of steps) {
    if (step.stageId !== undefined && stageMap.has(step.stageId)) {
      stageMap.get(step.stageId)!.push(step);
    } else {
      runLevelSteps.push(step);
    }
  }

  const populatedStages = stages.map((stage) => ({
    ...stage,
    steps: stageMap.get(stage.stageId) ?? [],
  }));

  return {
    runLevelSteps,
    stages: populatedStages,
  };
}

/**
 * 将阶段生命周期状态转换为用户友好的英文标签。
 */
export function renderStageStatusLabel(status: BrowserRunStageStatus): string {
  switch (status) {
    case "in_progress":
      return "In progress";
    case "review_pending":
      return "Review pending";
    case "accepted":
      return "Accepted";
    default:
      return status;
  }
}

/**
 * 格式化未按 Stage 划分的 Run 步骤折叠卡片标题。
 *
 * @remarks
 * 在长会话中，未按 Stage 划分的历史 Run 降级显示为 `Run ${runIndex} (${stepCount} steps)`，
 * 并尽可能提取首个动作摘要提高辨识度；当前最新 Run 显示为 `Execution activity`。
 *
 * @param run - 该 Run 的全部状态。
 * @param runIndex - 该 Run 在会话历史中的序号（1-indexed）。
 * @returns 折叠卡片标题文案。
 *
 * @example
 * ```ts
 * const title = formatRunStepsTitle(run, 1);
 * // "Run 1 (3 steps) · Ran ls -la"
 * ```
 */
export function formatRunStepsTitle(
  run: BrowserSessionRun,
  runIndex?: number
): string {
  if (run.current) {
    return "Execution activity";
  }

  const indexPart = runIndex !== undefined ? `Run ${runIndex}` : "Earlier Run";
  const stepCount = run.stepCount || run.steps.length;
  const countLabel = `${stepCount} ${stepCount === 1 ? "step" : "steps"}`;

  const firstStep = run.steps[0];
  const firstAction = firstStep ? stepActivity(firstStep).label : undefined;

  if (firstAction) {
    return `${indexPart} (${countLabel}) · ${firstAction}`;
  }
  return `${indexPart} (${countLabel})`;
}

