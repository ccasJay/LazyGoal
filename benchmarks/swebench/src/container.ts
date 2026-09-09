import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Tool } from "../../../packages/runtime/src/index.js";
import { contract, type InferContract } from "../../../packages/contracts/src/index.js";
import { isRecord } from "./manifest.js";
import { requireSuccess, runInteractiveProcess, runProcess, type InteractiveProcess, type InteractiveProcessRunner, type ProcessRunner } from "./process.js";
import type { WorkerArtifact, WorkerManifest } from "./worker-builder.js";
import { preflightWorker, type WorkerPreflightResult } from "./worker-preflight.js";

/**
 * 从固定数据集投影的作答输入；禁止携带 gold patch、测试补丁或评分目标。
 * @example
 * ```ts
 * const task = parseSwebenchTasks(bridgeResponse)[0];
 * ```
 */
export interface SwebenchTask {
    readonly instance_id: string;
    readonly repo: string;
    readonly base_commit: string;
    readonly problem_statement: string;
    readonly image: string;
}

/** 校验 Python JSON 边界并只返回允许给作答适配器的字段。 */
export function parseSwebenchTasks(value: unknown): SwebenchTask[] {
    if (!isRecord(value) || !Array.isArray(value.tasks)) throw new Error("Invalid SWE-bench task response");
    return value.tasks.map((row: unknown) => {
        if (!isRecord(row) || typeof row.instance_id !== "string"
            || !/^[a-zA-Z0-9_.-]+__[a-zA-Z0-9_.-]+-\d+$/.test(row.instance_id)
            || typeof row.repo !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(row.repo)
            || typeof row.base_commit !== "string" || !/^[a-f0-9]{40}$/.test(row.base_commit)
            || typeof row.problem_statement !== "string" || !row.problem_statement.trim()
            || row.image !== `swebench/sweb.eval.x86_64.${row.instance_id.toLowerCase().replaceAll("__", "_1776_")}:latest`) {
            throw new Error("Invalid SWE-bench task fields");
        }
        return { instance_id: row.instance_id, repo: row.repo, base_commit: row.base_commit,
            problem_statement: row.problem_statement, image: row.image as string };
    });
}

export const SWE_SHELL_CONTRACT = contract.object({
    command: contract.string(),
    timeoutSeconds: contract.optional(contract.integer({ minimum: 1, maximum: 120 })),
});
type ShellInput = InferContract<typeof SWE_SHELL_CONTRACT>;

/**
 * 单题 Docker 工作区。无宿主挂载、无网络，固定 linux/amd64；close 仅删除自己的容器。
 * @remarks
 * shell 的目录与环境不跨调用保留，文件修改保留；补丁须在 close 前导出。
 * @example
 * ```ts
 * const container = new SwebenchContainer("lg-swe-unique-0", task);
 * await container.start();
 * try { const patch = await container.exportPatch(); } finally { await container.close(); }
 * ```
 */
export class SwebenchContainer {
    private created = false;
    private closed = false;
    imageId: string | undefined;

    /** @param name - 调用方为本次单题生成的唯一容器名；不得复用其他任务的名称。
     * @param task - 已校验的作答输入与官方镜像引用。
     * @param run - 子进程边界，测试可注入替身；构造期间不启动容器。
     */
    constructor(
        readonly name: string,
        readonly task: SwebenchTask,
        private readonly run: ProcessRunner = runProcess,
        private readonly interactiveRun: InteractiveProcessRunner = runInteractiveProcess,
    ) {}

    /** 拉取官方镜像并重置到指定 base_commit；部分创建失败也会清理本容器。 */
    async start(signal?: AbortSignal): Promise<void> {
        requireSuccess(await this.run("docker", ["pull", "--platform", "linux/amd64", this.task.image],
            { timeoutMs: 1200000, signal, truncate: true }), "Pull SWE-bench image");
        this.imageId = requireSuccess(await this.run("docker", ["image", "inspect", "--format", "{{.Id}}", this.task.image],
            { timeoutMs: 10000, signal }), "Inspect SWE-bench image").trim();
        // 创建请求中止时 daemon 仍可能已经创建容器，清理范围由唯一 name 确定。
        this.created = true;
        try {
            requireSuccess(await this.run("docker", ["create", "--name", this.name, "--platform", "linux/amd64",
                "--network", "none", "--cpus", "2", "--memory", "4g", "--pids-limit", "256",
                "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--workdir", "/testbed",
                "--entrypoint", "/bin/bash", this.imageId, "-c", "sleep infinity"],
            { timeoutMs: 60000, signal }), "Create SWE-bench container");
            requireSuccess(await this.run("docker", ["start", this.name], { timeoutMs: 60000, signal }), "Start SWE-bench container");
            requireSuccess(await this.exec(`git reset --hard ${this.task.base_commit} && git clean -fd && git diff --exit-code ${this.task.base_commit}`, 120, signal),
                "Reset SWE-bench repository");
        } catch (error) {
            try { await this.close(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], "Container setup and cleanup failed"); }
            throw error;
        }
    }

    /** shell 在容器内受 GNU timeout 约束；外部中止由 Episode 清理容器。 */
    async exec(command: string, timeoutSeconds: number, signal?: AbortSignal) {
        return this.run("docker", ["exec", "--workdir", "/testbed", this.name,
            "timeout", "--signal=TERM", "--kill-after=5", String(timeoutSeconds),
            "/bin/bash", "-c", `source /opt/miniconda3/etc/profile.d/conda.sh && conda activate testbed && ${command}`],
        { timeoutMs: (timeoutSeconds + 15) * 1000, signal, maxBytes: 16000, truncate: true });
    }

    /**
     * 把完整 Worker 目录注入 `/opt/lazygoal`；源文件只作为 Docker 参数传递，不进入 shell。
     * @param artifact - 已通过 WorkerBuilder manifest 校验的宿主产物。
     * @param signal - 取消时中止尚未完成的注入命令。
     * @throws 任一目录创建、复制或权限设置失败时抛出；调用方应记录 `worker_inject` 阶段。
     */
    async injectWorker(artifact: WorkerArtifact, signal?: AbortSignal): Promise<void> {
        if (!this.created || this.closed) throw new Error("Cannot inject Worker into a non-running container");
        const options = { timeoutMs: 60_000, signal, maxBytes: 16 * 1024, truncate: true } as const;
        requireSuccess(await this.run("docker", ["exec", this.name, "/bin/mkdir", "-p", "/opt/lazygoal"], options), "Create Worker injection directory");
        for (const [source, target] of [[artifact.workerPath, "worker.mjs"], [artifact.nodePath, "node"], [artifact.manifestPath, "manifest.json"]] as const) {
            requireSuccess(await this.run("docker", ["cp", source, `${this.name}:/opt/lazygoal/${target}`], options), `Inject Worker ${target}`);
        }
        requireSuccess(await this.run("docker", ["exec", this.name, "/bin/chmod", "0755", "/opt/lazygoal/node", "/opt/lazygoal/worker.mjs"], options), "Set Worker permissions");
    }

    /** 在首次模型调用或 Runtime 副作用前运行固定 Worker 预检。 */
    async preflightWorker(manifest: WorkerManifest, signal?: AbortSignal): Promise<WorkerPreflightResult> {
        if (!this.created || this.closed || this.imageId === undefined) throw new Error("Cannot preflight a non-running container");
        return preflightWorker({
            containerName: this.name,
            imageId: this.imageId,
            baseCommit: this.task.base_commit,
            manifest,
            run: this.run,
            ...(signal === undefined ? {} : { signal }),
        });
    }

    /** 以 `docker exec -i` 启动 Worker；stdin/stdout 仍由宿主 ProcessRunner 持有。 */
    async runWorker(signal?: AbortSignal) {
        if (!this.created || this.closed) throw new Error("Cannot run Worker in a non-running container");
        return this.run("docker", ["exec", "-i", "--workdir", "/opt/lazygoal", this.name, "/opt/lazygoal/node", "/opt/lazygoal/worker.mjs"], {
            timeoutMs: 120_000,
            signal,
            maxBytes: 16 * 1024 * 1024,
        });
    }

    /** 启动可接入 ACP/Mux 的 Worker 进程；不会等待 Worker 退出。 */
    async openWorkerProcess(signal?: AbortSignal): Promise<InteractiveProcess> {
        if (!this.created || this.closed) throw new Error("Cannot run Worker in a non-running container");
        return this.interactiveRun("docker", ["exec", "-i", "--workdir", "/opt/lazygoal", this.name, "/opt/lazygoal/node", "/opt/lazygoal/worker.mjs"], {
            timeoutMs: 120_000,
            signal,
            maxBytes: 16 * 1024 * 1024,
        });
    }

    /**
     * 从容器内固定状态根复制一个可审计目录；返回值仍然是宿主 output 下的绝对目录。
     *
     * @param instanceId - 经过 metadata 校验的题目 ID，用于计算 Storage namespace。
     * @param outputDirectory - 宿主本次评测的专属 output 目录。
     * @param kind - Goal、Trajectory 或 Diagnostic Trace 目录。
     * @param signal - 复制过程的可选取消信号。
     * @returns 宿主上复制出的目录路径。
     * @throws Docker 复制失败或参数不安全时抛出。
     * @example
     * ```ts
     * const goals = await container.copyWorkerArtifact("astropy__astropy-12907", output, "goals");
     * ```
     */
    async copyWorkerArtifact(
        instanceId: string,
        outputDirectory: string,
        kind: "goals" | "trajectories" | "traces",
        signal?: AbortSignal,
    ): Promise<string> {
        if (!/^[a-zA-Z0-9_.-]+__[a-zA-Z0-9_.-]+-\d+$/u.test(instanceId)) throw new TypeError("instanceId is invalid");
        const encodedBenchmark = Buffer.from("swebench-acp", "utf8").toString("base64url");
        const encodedInstance = Buffer.from(instanceId, "utf8").toString("base64url");
        const hostRoot = join(outputDirectory, "runtime", encodedBenchmark, encodedInstance);
        await mkdir(hostRoot, { recursive: true });
        const source = `${this.name}:/opt/lazygoal/state/${encodedBenchmark}/${encodedInstance}/${kind}`;
        requireSuccess(await this.run("docker", ["cp", source, hostRoot], {
            timeoutMs: 30_000,
            signal,
            maxBytes: 16 * 1024,
            truncate: true,
        }), `Copy Worker ${kind}`);
        return join(hostRoot, kind);
    }

    /** 导出相对 base_commit 的最终树差异，包含新增文件、暂存修改和 Agent 自己提交的修改。 */
    async exportPatch(signal?: AbortSignal): Promise<string> {
        return requireSuccess(await this.run("docker", ["exec", "--workdir", "/testbed", this.name,
            "/bin/bash", "-c", [
                "set -eu",
                "index=/opt/lazygoal/git-index",
                "rm -f \"$index\"",
                "trap 'rm -f \"$index\"' EXIT",
                `GIT_INDEX_FILE=\"$index\" git read-tree ${this.task.base_commit}`,
                "GIT_INDEX_FILE=\"$index\" git add -A",
                `GIT_INDEX_FILE=\"$index\" git diff --cached --binary --no-ext-diff ${this.task.base_commit}`,
            ].join("; ")],
        { timeoutMs: 30000, maxBytes: 16 * 1024 * 1024, ...(signal === undefined ? {} : { signal }) }), "Export SWE-bench patch");
    }

    /** 幂等删除本题容器；Docker 删除失败向调用方传播，允许之后再次清理。 */
    async close(): Promise<void> {
        if (!this.created || this.closed) return;
        const result = await this.run("docker", ["rm", "--force", this.name], { timeoutMs: 30000 });
        if (result.code !== 0 && !result.stderr.includes("No such container")) requireSuccess(result, "Remove SWE-bench container");
        this.closed = true;
    }
}

/** 构造只在任务容器执行的 shell 工具；非零命令退出是可观察的作答失败。 */
export function createSwebenchShell(container: SwebenchContainer): Tool<typeof SWE_SHELL_CONTRACT> {
    return {
        definition: { id: "swebench_shell", inputContract: SWE_SHELL_CONTRACT,
            description: "Run bash in /testbed with conda testbed activated. Read, search, edit files and run tests here. No network. Shell state resets each call; file changes persist. Output is bounded." },
        replayPolicy: "manual",
        validate: (input: ShellInput) => input.command.trim() && !input.command.includes("\0")
            ? { ok: true } : { ok: false, error: { code: "INVALID_TOOL_INPUT", message: "command must be non-empty and contain no NUL" } },
        execute: async ({ input }, control) => {
            const result = await container.exec(input.command, input.timeoutSeconds ?? 30, control?.signal);
            const output = `${result.stdout}\n${result.stderr}`.trim();
            return result.code === 0
                ? { kind: "success", output, summary: "Container command exited 0" }
                : { kind: "failure", code: result.code === 124 || result.code === 137 ? "COMMAND_TIMEOUT" : "COMMAND_FAILED",
                    message: `Container command exited ${result.code}: ${output}`, retryable: true };
        },
    };
}
