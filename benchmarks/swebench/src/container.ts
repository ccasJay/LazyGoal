import type { Tool } from "../../../packages/runtime/src/index.js";
import { contract, type InferContract } from "../../../packages/contracts/src/index.js";
import { isRecord } from "./manifest.js";
import { requireSuccess, runProcess, type ProcessRunner } from "./process.js";

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
    constructor(readonly name: string, readonly task: SwebenchTask, private readonly run: ProcessRunner = runProcess) {}

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

    /** 导出相对 base_commit 的最终树差异，包含新增文件、暂存修改和 Agent 自己提交的修改。 */
    async exportPatch(): Promise<string> {
        return requireSuccess(await this.run("docker", ["exec", "--workdir", "/testbed", this.name,
            "/bin/bash", "-c", `git add -A && git diff --cached --binary --no-ext-diff ${this.task.base_commit}`],
        { timeoutMs: 30000, maxBytes: 16 * 1024 * 1024 }), "Export SWE-bench patch");
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
