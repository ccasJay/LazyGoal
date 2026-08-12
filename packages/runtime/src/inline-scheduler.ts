import type { Runner, RunnerResult } from "./runner";
import type { RunScheduler } from "./scheduler";

export class InlineScheduler implements RunScheduler {
    constructor(
        private readonly runner: Pick<Runner, "runUntilBlocked">,
    ) {}

    schedule(runId: string): Promise<RunnerResult> {
        return this.runner.runUntilBlocked(runId);
    }
}
