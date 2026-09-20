import { stat } from "node:fs/promises";
import path from "node:path";
import type {
    EnvironmentHandle,
    EnvironmentSpec,
    ImageSource,
    PreflightResult,
    WorkerArtifact,
    WorkerEntryConfig,
} from "../../src/index.js";
import type {
    TuaBenchCollectedArtifacts,
    TuaBenchDomainResult,
    TuaBenchTaskDefinition,
} from "./types.js";
import { evaluateTuaBenchReward, parseRewardFile } from "./scoring.js";

/**
 * 创建 TuaBenchEnvironmentSpec 所需的构造选项。
 *
 * @example
 * ```ts
 * const options: TuaBenchEnvironmentSpecOptions = {
 *   task: myTaskDefinition,
 *   workerArtifact,
 * };
 * ```
 */
export interface TuaBenchEnvironmentSpecOptions {
    /** 当前 Attempt 执行的 TUA-Bench 任务定义。 */
    readonly task: TuaBenchTaskDefinition;
    /** 共享 Worker 编译打包产物（若已构建）。 */
    readonly workerArtifact?: WorkerArtifact;
}

/**
 * TUA-Bench 在 LazyGoal 统一隔离环境下的声明式 Spec 实现。
 *
 * @remarks
 * 负责解析预构建 custom 镜像、按 task.toml 声明放行网络、执行环境 preflight 以及评分产物回收。
 *
 * @example
 * ```ts
 * const spec = new TuaBenchEnvironmentSpec({ task });
 * const image = spec.resolveImage(task);
 * ```
 */
export class TuaBenchEnvironmentSpec
    implements EnvironmentSpec<TuaBenchTaskDefinition, TuaBenchCollectedArtifacts> {

    readonly benchmarkId = "tua-bench";

    readonly task: TuaBenchTaskDefinition;
    readonly workerArtifact?: WorkerArtifact;

    constructor(options: TuaBenchEnvironmentSpecOptions) {
        this.task = options.task;
        if (options.workerArtifact !== undefined) {
            this.workerArtifact = options.workerArtifact;
        }
    }

    /**
     * 解析任务使用的镜像，TUA-Bench 统一采用 custom 镜像模式。
     */
    resolveImage(task: TuaBenchTaskDefinition): ImageSource {
        return {
            mode: "custom",
            image: task.imageRef,
        };
    }

    /**
     * 获取容器内 Worker 启动参数及默认工作目录（/home/agent）。
     */
    getWorkerEntryConfig(_task: TuaBenchTaskDefinition): WorkerEntryConfig {
        return {
            cwd: "/home/agent",
            ...(this.workerArtifact !== undefined ? { artifact: this.workerArtifact } : {}),
        };
    }

    /**
     * 根据任务声明返回网络模式（public 映射为 bridge，其余均为 none）。
     */
    resolveNetworkMode(task: TuaBenchTaskDefinition): "none" | "bridge" {
        return task.networkMode === "public" ? "bridge" : "none";
    }

    /**
     * 执行容器初始化 setup 脚本。
     */
    async prepareEnvironment(env: EnvironmentHandle): Promise<void> {
        const taskDir = this.task.taskDir;
        if (taskDir) {
            const hostSetup = path.join(taskDir, "environment", "setup.sh");
            const hostTest = path.join(taskDir, "tests", "test.sh");
            const setupExists = await stat(hostSetup).then(() => true).catch(() => false);
            if (setupExists) {
                await env.exec("mkdir -p environment");
                const targetSetup = path.posix.join(env.workdir, "environment", "setup.sh");
                await env.copyInto(hostSetup, targetSetup);
                await env.exec(`chmod +x ${targetSetup}`);
            }
            const testExists = await stat(hostTest).then(() => true).catch(() => false);
            if (testExists) {
                await env.exec("mkdir -p tests");
                const targetTest = path.posix.join(env.workdir, "tests", "test.sh");
                await env.copyInto(hostTest, targetTest);
                await env.exec(`chmod +x ${targetTest}`);
            }
        }

        const setupScript = this.task.setupScript ?? "environment/setup.sh";
        // 若容器内存在 setup 脚本则执行，镜像预构建完成时可平滑跳过
        await env.exec(`if [ -f "${setupScript}" ]; then bash "${setupScript}"; fi`);
    }

    /**
     * 验证容器内评分验证脚本存在且具备可执行权限。
     */
    async preflight(env: EnvironmentHandle): Promise<PreflightResult> {
        const verifier = this.task.verifierPath ?? "tests/test.sh";
        const result = await env.exec(`test -f "${verifier}" && test -x "${verifier}"`);
        if (result.code !== 0) {
            return {
                ok: false,
                message: `Verifier script not found or not executable: ${verifier}`,
                details: {
                    verifier,
                    exitCode: result.code,
                    stderr: result.stderr,
                },
            };
        }
        return {
            ok: true,
            details: { verifier },
        };
    }

    /**
     * 执行官方验证脚本并回收 reward 与输出日志。
     */
    async collectArtifacts(
        env: EnvironmentHandle,
        _outputDirectory: string,
        _graceMs: number,
    ): Promise<TuaBenchCollectedArtifacts> {
        const verifier = this.task.verifierPath ?? "tests/test.sh";
        const verifierUser = this.task.verifierUser || "root";
        const timeoutMs = this.task.verifierTimeoutSec * 1000;

        // 以 verifierUser 身份运行验证脚本
        const runCmd = verifierUser === "root"
            ? `bash "${verifier}"`
            : `su -s /bin/bash "${verifierUser}" -c 'bash "${verifier}"'`;

        const execResult = await env.exec(runCmd, { timeoutMs });

        // 读取 /logs/verifier/reward.txt
        const rewardReadResult = await env.exec("cat /logs/verifier/reward.txt");
        let reward: number | null = null;
        let rewardRaw: string | null = null;
        let verifierError: string | null = null;

        if (rewardReadResult.code === 0 && rewardReadResult.stdout.trim().length > 0) {
            rewardRaw = rewardReadResult.stdout.trim();
            const parsed = parseRewardFile(rewardRaw);
            reward = parsed.reward;
            if (reward === null) {
                verifierError = parsed.error ?? "Invalid reward content";
            }
        } else {
            verifierError = execResult.code !== 0
                ? `Verifier script failed with code ${execResult.code}: ${execResult.stderr || execResult.stdout}`
                : "Reward file /logs/verifier/reward.txt not found or empty";
        }

        const domainResult = evaluateTuaBenchReward(
            reward,
            execResult.stdout || null,
            verifierError,
            this.task.taskFamily,
        );

        return {
            reward,
            rewardRaw,
            verifierStdout: execResult.stdout,
            verifierStderr: execResult.stderr,
            verifierExitCode: execResult.code,
            domainResult,
        };
    }
}
