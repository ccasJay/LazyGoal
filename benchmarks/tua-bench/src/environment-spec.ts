import { randomUUID } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
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
    private privateTaskPaths: readonly string[] = [];

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
            const setupExists = await stat(hostSetup).then(() => true).catch(() => false);
            if (setupExists) {
                await env.exec("mkdir -p environment");
                const targetSetup = path.posix.join(env.workdir, "environment", "setup.sh");
                await env.copyInto(hostSetup, targetSetup);
                await env.exec(`chmod +x ${targetSetup}`);
            }
            this.privateTaskPaths = await findPrivateTaskPaths(taskDir);
        }

        const setupScript = this.task.setupScript ?? "environment/setup.sh";
        // 若容器内存在 setup 脚本则执行，镜像预构建完成时可平滑跳过
        await env.exec(`if [ -f ${shellQuote(setupScript)} ]; then bash ${shellQuote(setupScript)}; fi`);

        if (env.execAsRoot === undefined) {
            throw new Error("TUA verifier isolation requires root-scoped environment operations");
        }
        const privatePaths = new Set([
            ...DEFAULT_PRIVATE_PATHS,
            ...this.privateTaskPaths,
            path.posix.dirname(this.verifierRelativePath()),
        ]);
        const targets = [...privatePaths]
            .filter((entry) => entry !== ".")
            .map((entry) => path.posix.join(env.workdir, entry));
        const cleanup = [
            ...targets.map((target) => shellQuote(target)),
            shellQuote("/logs/verifier"),
            shellQuote("/tests"),
        ];
        requireCommandSuccess(await env.execAsRoot(
            `rm -rf -- ${cleanup.join(" ")}`,
        ), "Remove TUA scoring-only files before Agent execution");
    }

    /**
     * 验证容器内评分验证脚本存在且具备可执行权限。
     */
    async preflight(env: EnvironmentHandle): Promise<PreflightResult> {
        const verifier = this.verifierRelativePath();
        const hostVerifier = path.resolve(this.task.taskDir, verifier);
        const hostTaskRoot = path.resolve(this.task.taskDir);
        const relativeHostVerifier = path.relative(hostTaskRoot, hostVerifier);
        if (relativeHostVerifier.startsWith("..") || path.isAbsolute(relativeHostVerifier)) {
            return {
                ok: false,
                message: "TUA verifier path escapes the task resource directory",
            };
        }
        const verifierStat = await stat(hostVerifier).catch(() => null);
        if (verifierStat === null || !verifierStat.isFile()) {
            return { ok: false, message: `Host verifier resource is missing: ${verifier}` };
        }
        if (!/^(?:[a-z_][a-z0-9_-]*[$]?|\d+)$/iu.test(this.task.verifierUser)) {
            return { ok: false, message: "TUA verifier user is invalid" };
        }
        if (env.captureAgentProcessBaseline === undefined
            || env.assertAgentProcessesExited === undefined
            || env.execAsRoot === undefined
            || env.execAsUser === undefined) {
            return { ok: false, message: "Environment cannot prove TUA verifier isolation" };
        }

        // env.exec 与 TUA bash_exec 使用同一个容器默认用户，因此此探针检查实际 Agent 身份。
        const agentReadablePaths = [...new Set([
            ...DEFAULT_PRIVATE_PATHS,
            ...this.privateTaskPaths,
            path.posix.dirname(verifier),
        ])].filter((entry) => entry !== ".").map((entry) => path.posix.join(env.workdir, entry));
        const probe = agentReadablePaths.length === 0
            ? "id -u"
            : `for path in ${agentReadablePaths.map(shellQuote).join(" ")}; do if [ -e "$path" ] || [ -L "$path" ] || [ -w "$path" ]; then exit 41; fi; done; id -u`;
        const result = await env.exec(probe);
        if (result.code !== 0 || !/^\d+\s*$/u.test(result.stdout)) {
            return {
                ok: false,
                message: "Agent identity can access TUA scoring-only paths or could not be verified",
                details: { verifier, exitCode: result.code },
            };
        }
        await env.captureAgentProcessBaseline();
        return {
            ok: true,
            details: { verifier, agentUid: Number(result.stdout.trim()), verifierUser: this.task.verifierUser },
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
        const verifier = this.verifierRelativePath();
        const verifierUser = this.task.verifierUser;
        const timeoutMs = this.task.verifierTimeoutSec * 1000;

        if (env.assertAgentProcessesExited === undefined
            || env.execAsRoot === undefined
            || env.execAsUser === undefined) {
            throw new Error("TUA verifier isolation cannot be proven by this environment");
        }
        // 宿主 Docker 进程快照须确认 Worker 启动后没有新增进程仍可观察该容器文件系统。
        await env.assertAgentProcessesExited();
        const taskDir = path.resolve(this.task.taskDir);
        const privateRoot = `/run/lazygoal-verifier-${randomUUID()}`;
        const privateTaskRoot = path.posix.join(privateRoot, path.basename(taskDir));
        const verifierInPrivateTree = path.posix.join(privateTaskRoot, verifier);
        let reward: number;
        let rewardRaw: string;
        let execResult: Awaited<ReturnType<NonNullable<EnvironmentHandle["execAsUser"]>>>;
        try {
            requireCommandSuccess(await env.execAsRoot(
                `install -d -m 0700 ${shellQuote(privateRoot)} && rm -rf -- /logs/verifier && install -d -m 0700 /logs/verifier`,
            ), "Prepare private TUA verifier directory");
            // Staging occurs only after the Agent process snapshot proves quiescence.
            await env.copyInto(taskDir, privateTaskRoot);

            const taskOwnerUid = (await env.execAsRoot(`stat -c '%u' ${shellQuote(privateTaskRoot)} 2>/dev/null || echo 0`)).stdout.trim() || "0";
            if (taskOwnerUid !== "0") {
                await env.execAsUser(taskOwnerUid, `chmod -R a+rwX ${shellQuote(privateTaskRoot)} 2>/dev/null || true`).catch(() => undefined);
            }

            requireCommandSuccess(await env.execAsRoot(
                `chmod 0711 ${shellQuote(privateRoot)} && chmod -R a+rwX ${shellQuote(privateTaskRoot)} 2>/dev/null || true; chmod 0755 /logs && chmod 0777 /logs/verifier && if [ -d ${shellQuote(path.posix.join(privateTaskRoot, "tests"))} ]; then ln -sfn ${shellQuote(path.posix.join(privateTaskRoot, "tests"))} /tests; fi`,
            ), "Set TUA verifier execution permissions");
            execResult = await env.execAsUser(
                verifierUser,
                `cd ${shellQuote(env.workdir)} && bash ${shellQuote(verifierInPrivateTree)}`,
                { timeoutMs },
            );
            if (execResult.code !== 0) {
                throw new Error(`Official TUA verifier exited with code ${execResult.code}: ${execResult.stderr || execResult.stdout}`);
            }
            const rewardRead = await env.execAsRoot("cat /logs/verifier/reward.txt");
            if (rewardRead.code !== 0) throw new Error("Official TUA verifier did not produce reward.txt");
            const parsed = parseRewardFile(rewardRead.stdout);
            if (parsed.reward === null) throw new Error("Official TUA verifier produced an invalid reward");
            reward = parsed.reward;
            rewardRaw = rewardRead.stdout.trim();
        } finally {
            try {
                const taskOwnerUid = (await env.execAsRoot(`stat -c '%u' ${shellQuote(privateTaskRoot)} 2>/dev/null || echo 0`)).stdout.trim() || "0";
                if (taskOwnerUid !== "0") {
                    await env.execAsUser(
                        taskOwnerUid,
                        `chmod -R u+rwX ${shellQuote(privateTaskRoot)} 2>/dev/null; rm -rf ${shellQuote(privateTaskRoot)}/* ${shellQuote(privateTaskRoot)}/.* 2>/dev/null || true`,
                    ).catch(() => undefined);
                }
            } catch {
                // 忽略属主探测失败，继续由 root 清理
            }
            const cleanupResult = await env.execAsRoot(
                `rm -f /tests && chmod -R u+rwX ${shellQuote(privateRoot)} 2>/dev/null; rm -rf -- ${shellQuote(privateRoot)}`,
            );
            if (cleanupResult.code !== 0) throw new Error(`Could not remove the private TUA verifier directory: ${cleanupResult.stderr}`);
        }

        const domainResult = evaluateTuaBenchReward(
            reward,
            execResult.stdout || null,
            null,
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

    private verifierRelativePath(): string {
        const verifier = this.task.verifierPath ?? "tests/test.sh";
        if (path.posix.isAbsolute(verifier)
            || verifier.includes("\\")
            || verifier.split("/").some((part) => part === "" || part === "." || part === "..")) {
            throw new TypeError("TUA verifier path must be a normalized relative path");
        }
        return verifier;
    }
}

const DEFAULT_PRIVATE_PATHS = Object.freeze([
    "test", "tests", "answer", "answers", "solution", "solutions", "expected",
    "gold", "oracle", "secret", "private", "verifier", "grader",
]);
const PRIVATE_PATH_COMPONENT = /^(?:tests?|answers?|solutions?|expected|gold|oracle|secret|private|verifier|grader)$/iu;
const PRIVATE_FILE_NAME = /^(?:test|answer|solution|expected|gold|oracle|secret|verifier|grader)(?:[._-].*)?$/iu;

async function findPrivateTaskPaths(root: string, relative = ""): Promise<string[]> {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => {
        throw new Error("Could not inspect TUA task resources for private scoring paths");
    });
    const result: string[] = [];
    for (const entry of entries) {
        const child = relative === "" ? entry.name : path.posix.join(relative, entry.name);
        if (PRIVATE_PATH_COMPONENT.test(entry.name)
            || (entry.isFile() && PRIVATE_FILE_NAME.test(entry.name))) {
            result.push(child);
        } else if (entry.isDirectory()) {
            result.push(...await findPrivateTaskPaths(path.join(root, entry.name), child));
        }
    }
    return result;
}

function shellQuote(value: string): string {
    return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function requireCommandSuccess(result: { readonly code: number; readonly stdout: string; readonly stderr: string }, operation: string): void {
    if (result.code !== 0) throw new Error(`${operation} failed with exit code ${result.code}: ${result.stderr}`);
}
