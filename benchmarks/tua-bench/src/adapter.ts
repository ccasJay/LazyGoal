import {
    createToolRegistration,
    InMemoryToolRegistry,
} from "../../../packages/tool-core/src/index.js";
import type {
    BenchmarkAdapter,
    BenchmarkEpisode,
    BenchmarkEpisodeContext,
    BenchmarkTaskDescriptor,
} from "../../src/headless-composition-root.js";
import { BashExecTool } from "./bash-exec-tool.js";
import type { TuaBenchTaskDefinition } from "./types.js";

/** TUA-Bench 任务执行产物结果。 */
export interface TuaBenchEpisodeOutcome {
    /** Agent 是否宣告任务完成。 */
    readonly completed: boolean;
}

/** TUA-Bench 适配器初始化选项。 */
export interface TuaBenchAdapterOptions {
    /** 容器内终端工作目录，缺省 "/home/agent"。 */
    readonly workdir?: string;
    /** 最大执行步数上限，缺省 50。 */
    readonly maxSteps?: number;
}

/**
 * TUA-Bench 对 HeadlessCompositionRoot 的适配器。
 *
 * @remarks
 * 将 TuaBenchTaskDefinition 转换为执行目标与完成标准，并在 Episode 中装配 bash_exec 工具。
 *
 * @example
 * ```ts
 * const adapter = new TuaBenchBenchmarkAdapter({ workdir: "/home/agent" });
 * const descriptor = adapter.describeTask(task);
 * ```
 */
export class TuaBenchBenchmarkAdapter
    implements BenchmarkAdapter<TuaBenchTaskDefinition, TuaBenchEpisodeOutcome> {

    private readonly workdir: string;
    private readonly maxSteps: number;

    constructor(options: TuaBenchAdapterOptions = {}) {
        this.workdir = options.workdir ?? "/home/agent";
        this.maxSteps = options.maxSteps ?? 50;
    }

    describeTask(task: TuaBenchTaskDefinition): BenchmarkTaskDescriptor {
        return {
            intent: task.instruction,
            objective: `完成终端任务：${task.name}`,
            completionCriteria: ["Agent 认为任务已完成并终止执行"],
            maxSteps: this.maxSteps,
        };
    }

    async createEpisode(
        _task: TuaBenchTaskDefinition,
        _context: BenchmarkEpisodeContext,
    ): Promise<BenchmarkEpisode<TuaBenchEpisodeOutcome>> {
        const registry = new InMemoryToolRegistry([
            createToolRegistration(new BashExecTool({ defaultWorkdir: this.workdir })),
        ]);

        return {
            registry,
            readOutcome: () => ({ completed: true }),
            close: async () => {},
        };
    }
}
