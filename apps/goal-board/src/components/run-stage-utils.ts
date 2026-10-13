import type {
  BrowserRunStageGroup,
  BrowserRunStageStatus,
  BrowserSessionStep,
} from "../../../../packages/web-contracts/src/index";

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
