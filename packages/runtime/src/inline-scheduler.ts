import type { Runner, RunnerResult } from "./runner";
import type { RunRef } from "./domain";
import type { RunScheduler } from "./scheduler";

export class InlineScheduler implements RunScheduler {
    constructor(
        private readonly runner: Pick<Runner, "runUntilBlocked">,
    ) {}

    schedule(ref: RunRef): Promise<RunnerResult> {
        return this.runner.runUntilBlocked(ref);
    }
}
