import type { RunnerResult } from "./runner";
import type { RunRef } from "./domain";

/** Scheduler 的当前边界：接收一个已保存 Goal 中的明确 RunRef。 */
export interface RunScheduler {
    schedule(ref: RunRef): Promise<RunnerResult>;
}
