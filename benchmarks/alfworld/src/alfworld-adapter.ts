import type {
    BenchmarkAdapter,
    BenchmarkEpisode,
    BenchmarkEpisodeContext,
    BenchmarkTaskDescriptor,
} from "../../src/headless-composition-root.js";
import {
    createAlfworldToolSet,
} from "./alfworld-tools.js";
import type {
    AlfworldManifestTask,
} from "./manifest.js";
import type {
    SidecarClient,
    SidecarResetResult,
    SidecarStepResult,
    SidecarTask,
} from "./sidecar-client.js";
import type {
    EpisodeEnvironmentFacts,
} from "./report.js";

/**
 * ALFWorld benchmark adapter 的外部依赖。
 *
 * @remarks
 * Adapter 只接收工作区和任务级 Sidecar 工厂；Goal、Run、持久化和评分由通用
 * Root 或 evaluator 负责。`createClient` 返回的客户端必须只服务当前 task。
 *
 * @example
 * ```ts
 * const options: AlfworldAdapterOptions = {
 *     workspaceRoot: "/repo",
 *     createClient: (task) => new SidecarClient({
 *         pythonExecutable: "/opt/conda/bin/python",
 *         scriptPath: "/repo/sidecar.py",
 *         dataRoot: "/data/alfworld",
 *     }),
 * };
 * ```
 */
export interface AlfworldAdapterOptions {
    /** `read_file` 和 `grep` Tool 使用的 workspace 根目录。 */
    readonly workspaceRoot: string;
    /** 为每个 Manifest task 创建独立 Sidecar 客户端。 */
    readonly createClient: (
        task: AlfworldManifestTask,
    ) => Pick<SidecarClient, "reset" | "step" | "close">;
}

/**
 * 将一个 Manifest task 装配成通用 benchmark Episode 的 ALFWorld adapter。
 *
 * @remarks
 * Episode 内部复用现有 `SidecarAlfworldSession` 和四个授权 Tool，仅将环境事实
 * 以不透明的 `EpisodeEnvironmentFacts` 暴露给 Root。`won`、评分和失败分类不在
 * 此处判定；`close` 交给 Root 在所有退出路径调用。
 *
 * @example
 * ```ts
 * const adapter = new AlfworldBenchmarkAdapter({
 *     workspaceRoot: "/repo",
 *     createClient: () => client,
 * });
 * const descriptor = adapter.describeTask(task);
 * ```
 */
export class AlfworldBenchmarkAdapter
    implements BenchmarkAdapter<AlfworldManifestTask, EpisodeEnvironmentFacts> {
    private readonly workspaceRoot: string;
    private readonly createClient: AlfworldAdapterOptions["createClient"];

    /** @param options - workspace 和任务级 Sidecar 工厂。 */
    constructor(options: AlfworldAdapterOptions) {
        if (options.workspaceRoot.trim() === "") {
            throw new TypeError("ALFWorld workspaceRoot must be non-empty text");
        }
        this.workspaceRoot = options.workspaceRoot;
        this.createClient = options.createClient;
    }

    /** @inheritdoc */
    describeTask(task: AlfworldManifestTask): BenchmarkTaskDescriptor {
        return {
            intent: `Evaluate fixed ALFWorld task ${task.taskId}`,
            objective: `Complete ALFWorld task ${task.taskId}`,
            completionCriteria: ["The environment reports won=true"],
            maxSteps: task.maxSteps,
        };
    }

    /** @inheritdoc */
    async createEpisode(
        task: AlfworldManifestTask,
        context: BenchmarkEpisodeContext,
    ): Promise<BenchmarkEpisode<EpisodeEnvironmentFacts>> {
        const client = this.createClient(task);
        const initial: EpisodeEnvironmentFacts = {
            done: false,
            won: false,
            steps: 0,
            goalConditionSuccessRate: 0,
        };
        let latest = initial;
        const trackingClient: Pick<SidecarClient, "reset" | "step" | "close"> = {
            reset: async (sidecarTask, signal): Promise<SidecarResetResult> => {
                const result = await client.reset(sidecarTask, signal);
                latest = initial;
                return result;
            },
            step: async (command, signal): Promise<SidecarStepResult> => {
                const result = await client.step(command, signal);
                latest = {
                    done: result.done,
                    won: result.won,
                    steps: latest.steps + 1,
                    goalConditionSuccessRate: result.goalConditionSuccessRate,
                };
                return result;
            },
            close: () => client.close(),
        };
        const toolSet = createAlfworldToolSet(
            context.workspaceRoot,
            toSidecarTask(task),
            trackingClient,
        );

        return {
            registry: toolSet.registry,
            readOutcome: () => latest,
            close: () => toolSet.session.close(),
        };
    }
}

function toSidecarTask(task: AlfworldManifestTask): SidecarTask {
    return {
        taskId: task.taskId,
        gameFile: task.gameFile,
        split: task.split,
        seed: task.seed,
        maxSteps: task.maxSteps,
    };
}
