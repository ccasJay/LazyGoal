import type { BrowserTrajectoryEntry } from "../../../packages/web-contracts/src/index";

/** 仅为当前已加载事件推导列表归组，不修改事件记录的 Step 索引。 */
export function displayStepBySequence(entries: readonly Pick<BrowserTrajectoryEntry, "sequence" | "eventType" | "stepIndex">[]): Map<number, number> {
  const steps = new Map<number, number>();
  let activeStep: number | undefined;
  for (const entry of entries) {
    if (["run_completed", "run_failed", "run_cancelled"].includes(entry.eventType)) {
      activeStep = undefined;
      continue;
    }
    if (entry.stepIndex !== undefined) activeStep = entry.stepIndex;
    if (activeStep !== undefined) steps.set(entry.sequence, activeStep);
  }
  return steps;
}
