import { access, mkdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type {
    BenchmarkPersistenceLocator,
    EnvironmentHandle,
    EnvironmentSpec,
    ImageSource,
    PreflightResult,
    WorkerEntryConfig,
    WorkerArtifact,
} from "../../src/index.js";
import type {
    EpisodeEnvironmentFacts,
    EpisodeModelFacts,
} from "./report.js";
import type { AlfworldManifestTask } from "./manifest.js";
import type { AlfworldContainerEnvironmentConfig } from "./environment-config.js";
import {
    ALFWORLD_CONTAINER_DATA_ROOT,
    ALFWORLD_CONTAINER_SIDECAR_PATH,
    alfworldWorkerCommand,
} from "./worker-config.js";
import { requireSuccess } from "../../src/process.js";

/** ALFWorld 托管镜像的默认安装层。 */
export const ALFWORLD_MANAGED_INSTALL_COMMANDS = Object.freeze([
    "apt-get update && apt-get install -y --no-install-recommends build-essential python-is-python3 python3 python3-pip && rm -rf /var/lib/apt/lists/*",
    "python3 -m pip install --break-system-packages --no-cache-dir alfworld==0.4.2 textworld==1.6.2",
] as const);

/** ALFWorld 容器中回收的环境、Runtime 与持久化事实。 */
export interface AlfworldCollectedArtifacts {
    readonly environment: EpisodeEnvironmentFacts;
    readonly model: EpisodeModelFacts;
    readonly persistence: BenchmarkPersistenceLocator | null;
    readonly errors: readonly AlfworldCollectedArtifactError[];
}

/** ALFWorld 产物回收的稳定错误阶段。 */
export interface AlfworldCollectedArtifactError {
    readonly stage: "artifact_copy" | "result_read";
    readonly message: string;
}

/**
 * ALFWorld 的声明式隔离环境适配。
 *
 * @remarks
 * 该 Spec 只声明托管镜像安装层、数据复制、Python/sidecar 预检和结果回收。
 * 容器创建、安全参数、Worker 注入、ACP 通信与销毁由共享
 * `IsolatedEnvironment` 拥有；宿主 Python 可缺失。
 *
 * @example
 * ```ts
 * const spec = new AlfworldEnvironmentSpec({ task, environment, workerArtifact });
 * const image = spec.resolveImage(task);
 * // image.mode === "managed"
 * ```
 */
export class AlfworldEnvironmentSpec
    implements EnvironmentSpec<AlfworldManifestTask, AlfworldCollectedArtifacts> {
    readonly benchmarkId = "alfworld";
    private readonly task: AlfworldManifestTask;
    private readonly environment: AlfworldContainerEnvironmentConfig;
    private readonly workerArtifact: WorkerArtifact | undefined;
    private readonly baseImage: string | undefined;
    private readonly installCommands: readonly string[];
    private readonly sidecarScriptPath: string;
    private readonly workerPython: string;
    private readonly runId: string | undefined;

    /** @param options - 任务、容器数据配置、Worker 和可选镜像覆盖。 */
    constructor(options: AlfworldEnvironmentSpecOptions) {
        this.task = options.task;
        this.environment = options.environment;
        this.workerArtifact = options.workerArtifact;
        this.baseImage = options.baseImage;
        this.installCommands = options.installCommands ?? ALFWORLD_MANAGED_INSTALL_COMMANDS;
        this.sidecarScriptPath = resolve(options.sidecarScriptPath ?? "benchmarks/alfworld/python/sidecar.py");
        this.workerPython = options.workerPython?.trim() || "python3";
        this.runId = options.runId;
        if (this.runId !== undefined && !/^[A-Za-z0-9_.-]+$/u.test(this.runId)) {
            throw new TypeError("ALFWorld runId contains unsupported characters");
        }
        if (!/^[A-Za-z0-9_.:/@-]+$/u.test(this.workerPython)) {
            throw new TypeError("ALFWorld worker Python executable contains unsupported characters");
        }
        if (!this.environment.dataRoot.startsWith("/")) throw new TypeError("ALFWorld dataRoot must be absolute");
        if (this.installCommands.some((command) => command.trim() === "")) {
            throw new TypeError("ALFWorld managed install commands must be non-empty");
        }
    }

    /** 返回 LazyGoal 基础镜像加 ALFWorld/TextWorld 安装层。 */
    resolveImage(task: AlfworldManifestTask): ImageSource {
        this.assertTask(task);
        return {
            mode: "managed",
            ...(this.baseImage === undefined ? {} : { baseImage: this.baseImage }),
            platform: "linux/amd64",
            installCommands: this.installCommands,
        };
    }

    /** 返回注入 Worker、sidecar 和容器数据根均可访问的工作目录。 */
    getWorkerEntryConfig(task: AlfworldManifestTask): WorkerEntryConfig {
        this.assertTask(task);
        return {
            ...(this.workerArtifact === undefined ? {} : { artifact: this.workerArtifact }),
            cwd: "/workspace",
            command: alfworldWorkerCommand(this.workerPython),
        };
    }

    /** 在容器内复制 sidecar 和当前任务数据，不读取宿主 Python。 */
    async prepareEnvironment(env: EnvironmentHandle): Promise<void> {
        requireSuccess(await env.exec("mkdir -p /workspace /opt/alfworld/data /opt/lazygoal"), "Prepare ALFWorld container directories");
        await env.copyInto(this.sidecarScriptPath, ALFWORLD_CONTAINER_SIDECAR_PATH);
        const source = join(this.environment.dataRoot, this.task.gameFile);
        const target = join(ALFWORLD_CONTAINER_DATA_ROOT, this.task.gameFile);
        requireSuccess(await env.exec(`mkdir -p ${shellQuote(join(target, ".."))}`), "Prepare ALFWorld data directory");
        await env.copyInto(source, target);
    }

    /** 验证容器 Python、固定依赖版本和 sidecar 入口可用。 */
    async preflight(env: EnvironmentHandle): Promise<PreflightResult> {
        const python = await env.exec([
            "set -eu",
            `${shellQuote(this.workerPython)} -c ${shellQuote([
                "import importlib.metadata, json, sys",
                "import alfworld, textworld",
                "print(json.dumps({'pythonVersion': sys.version.split()[0], 'alfworldVersion': importlib.metadata.version('alfworld'), 'textworldVersion': importlib.metadata.version('textworld'), 'textworldOnly': True}))",
            ].join("\n"))}`,
        ].join("; "), { timeoutMs: 120_000, maxBytes: 64 * 1024, truncate: true });
        if (python.code !== 0) {
            return { ok: false, message: bounded(python.stderr || python.stdout || `Python exited with ${python.code}`) };
        }
        const probe = parseProbe(python.stdout);
        if (probe === undefined) return { ok: false, message: "ALFWorld Python preflight returned invalid JSON" };
        if (probe.alfworldVersion !== this.environment.alfworldVersion || probe.textworldVersion !== this.environment.textworldVersion || probe.textworldOnly !== true) {
            return { ok: false, details: probe, message: "ALFWorld/TextWorld version or capability mismatch" };
        }
        const sidecar = await env.exec([
            "set -eu",
            `export ALFWORLD_DATA=${shellQuote(ALFWORLD_CONTAINER_DATA_ROOT)}`,
            `test -s ${shellQuote(ALFWORLD_CONTAINER_SIDECAR_PATH)}`,
            `printf '%s\\n' '{"requestId":1,"op":"health"}' | ${shellQuote(this.workerPython)} ${shellQuote(ALFWORLD_CONTAINER_SIDECAR_PATH)}`,
        ].join("; "), { timeoutMs: 120_000, maxBytes: 64 * 1024, truncate: true });
        if (sidecar.code !== 0) {
            return { ok: false, message: bounded(sidecar.stderr || sidecar.stdout || "ALFWorld sidecar health check failed") };
        }
        const sidecarProbe = parseProbe(sidecar.stdout);
        if (sidecarProbe === undefined || sidecarProbe.alfworldVersion !== this.environment.alfworldVersion
            || sidecarProbe.textworldVersion !== this.environment.textworldVersion
            || sidecarProbe.textworldOnly !== true
            || sidecarProbe.dataRoot !== ALFWORLD_CONTAINER_DATA_ROOT) {
            return {
                ok: false,
                ...(sidecarProbe === undefined ? {} : { details: sidecarProbe }),
                message: "ALFWorld sidecar health check returned invalid facts",
            };
        }
        return { ok: true, details: { ...probe, sidecar: sidecarProbe } };
    }

    /** 回收容器内 Runtime 文件和 Worker 写入的领域结果。 */
    async collectArtifacts(
        env: EnvironmentHandle,
        outputDirectory: string,
        _graceMs: number,
    ): Promise<AlfworldCollectedArtifacts> {
        const output = resolve(outputDirectory);
        const errors: AlfworldCollectedArtifactError[] = [];
        let persistence: BenchmarkPersistenceLocator | null = null;
        const benchmarkKey = encode("alfworld");
        const taskKey = encode(this.task.taskId);
        const runtimeRoot = join(
            output,
            "runtime",
            benchmarkKey,
            taskKey,
            ...(this.runId === undefined ? [] : [encode(this.runId)]),
        );
        const copied: Partial<Record<"goals" | "trajectories" | "traces", string>> = {};
        await mkdir(runtimeRoot, { recursive: true });
        for (const kind of ["goals", "trajectories", "traces"] as const) {
            try {
                const target = join(runtimeRoot, kind);
                copied[kind] = await env.copyOut(`/opt/lazygoal/state/${benchmarkKey}/${taskKey}/${kind}`, target);
                await access(copied[kind]);
            } catch (error) {
                errors.push({ stage: "artifact_copy", message: bounded(error) });
            }
        }
        if (copied.goals !== undefined) {
            persistence = {
                goalSnapshot: relative(output, copied.goals),
                trajectory: relative(output, copied.trajectories ?? copied.goals),
                ...(copied.traces === undefined ? {} : { diagnosticTrace: relative(output, copied.traces) }),
            };
        }
        let environment: EpisodeEnvironmentFacts = { done: false, won: false, steps: 0, goalConditionSuccessRate: 0 };
        let model: EpisodeModelFacts = { runStatus: null, completed: false };
        try {
            const result = await env.exec("cat /opt/lazygoal/alfworld-result.json", { timeoutMs: 30_000, maxBytes: 256 * 1024, truncate: true });
            if (result.code !== 0) throw new Error(result.stderr || "ALFWorld result file is unavailable");
            const parsed = parseCollectedResult(result.stdout);
            if (parsed === undefined) throw new Error("ALFWorld result file has invalid shape");
            environment = parsed.environment;
            model = parsed.model;
        } catch (error) {
            errors.push({ stage: "result_read", message: bounded(error) });
        }
        return { environment, model, persistence, errors };
    }

    private assertTask(task: AlfworldManifestTask): void {
        if (task.taskId !== this.task.taskId || task.gameFile !== this.task.gameFile || task.seed !== this.task.seed) {
            throw new TypeError("ALFWorld EnvironmentSpec task identity mismatch");
        }
    }
}

/**
 * ALFWorld EnvironmentSpec 的构造输入。
 *
 * @example
 * ```ts
 * const options: AlfworldEnvironmentSpecOptions = {
 *   task, environment, workerArtifact,
 *   sidecarScriptPath: "/repo/benchmarks/alfworld/python/sidecar.py",
 * };
 * ```
 */
export interface AlfworldEnvironmentSpecOptions {
    readonly task: AlfworldManifestTask;
    readonly environment: AlfworldContainerEnvironmentConfig;
    readonly workerArtifact?: WorkerArtifact;
    readonly baseImage?: string;
    readonly installCommands?: readonly string[];
    readonly sidecarScriptPath?: string;
    readonly workerPython?: string;
    /** 当前 Goal/Run 的稳定标识；提供后使重试产物使用独立目录。 */
    readonly runId?: string;
}

interface CollectedResult {
    readonly environment: EpisodeEnvironmentFacts;
    readonly model: EpisodeModelFacts;
    readonly persistence: BenchmarkPersistenceLocator | null;
}

function parseProbe(text: string): Readonly<Record<string, unknown>> | undefined {
    const line = text.trim().split("\n").at(-1);
    if (line === undefined) return undefined;
    try {
        const value: unknown = JSON.parse(line);
        if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
        const record = value as Record<string, unknown>;
        // The Python sidecar speaks the shared `{requestId, ok, result}`
        // envelope, while the direct Python probe prints facts directly.
        // Accept both at this boundary and expose only the facts to the Spec.
        if (record.ok === true && isRecord(record.result)) return record.result;
        return record;
    } catch {
        return undefined;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCollectedResult(text: string): CollectedResult | undefined {
    try {
        const value: unknown = JSON.parse(text.trim());
        if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
        const row = value as Record<string, unknown>;
        const env = row.environment;
        const model = row.model;
        if (!isEnvironmentFacts(env) || !isModelFacts(model)) return undefined;
        const persistence = row.persistence === null ? null : isPersistence(row.persistence) ? row.persistence : null;
        return { environment: env, model, persistence };
    } catch {
        return undefined;
    }
}

function isEnvironmentFacts(value: unknown): value is EpisodeEnvironmentFacts {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const row = value as Record<string, unknown>;
    return typeof row.done === "boolean" && typeof row.won === "boolean"
        && typeof row.steps === "number" && Number.isSafeInteger(row.steps) && row.steps >= 0
        && typeof row.goalConditionSuccessRate === "number" && Number.isFinite(row.goalConditionSuccessRate)
        && row.goalConditionSuccessRate >= 0 && row.goalConditionSuccessRate <= 1;
}

function isModelFacts(value: unknown): value is EpisodeModelFacts {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const row = value as Record<string, unknown>;
    return (row.runStatus === null || typeof row.runStatus === "string") && typeof row.completed === "boolean";
}

function isPersistence(value: unknown): value is BenchmarkPersistenceLocator {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const row = value as Record<string, unknown>;
    return typeof row.goalSnapshot === "string" && typeof row.trajectory === "string"
        && (row.diagnosticTrace === undefined || typeof row.diagnosticTrace === "string");
}

function encode(value: string): string {
    return Buffer.from(value, "utf8").toString("base64url");
}

function shellQuote(value: string): string {
    return `'${value.replaceAll("'", "'\\''")}'`;
}

function bounded(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error);
    return text.length <= 1024 ? text : `${text.slice(0, 1024)}…`;
}
