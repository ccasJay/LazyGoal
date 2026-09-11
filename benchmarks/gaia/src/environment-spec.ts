import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import type {
    BenchmarkPersistenceLocator,
    EnvironmentHandle,
    EnvironmentSpec,
    ImageSource,
    PreflightResult,
    WorkerArtifact,
    WorkerEntryConfig,
} from "../../src/index.js";
import { requireSuccess } from "../../src/process.js";
import type { GaiaManifestTask } from "./types.js";

/** GAIA 托管镜像的默认安装命令。 */
export const GAIA_MANAGED_INSTALL_COMMANDS = Object.freeze([
    "apt-get update && apt-get install -y --no-install-recommends python-is-python3 python3 python3-pip ffmpeg && rm -rf /var/lib/apt/lists/*",
    "python3 -m pip install --break-system-packages --no-cache-dir openpyxl==3.1.5 python-docx==1.1.2 PyPDF2==3.0.1 pydub==0.25.1 Pillow==11.2.1",
] as const);

/** GAIA 容器回收的产物结构。 */
export interface GaiaCollectedArtifacts {
    /** 提交的答案字符串；未提交或解析失败时为 null。 */
    readonly submittedAnswer: string | null;
    /** 答案关联的 taskId；未提交时为 null。 */
    readonly answerTaskId: string | null;
    /** 持久化快照与轨迹定位信息。 */
    readonly persistence: BenchmarkPersistenceLocator | null;
    /** 回收过程中的错误列表。 */
    readonly errors: readonly GaiaCollectedArtifactError[];
}

/** GAIA 产物回收错误结构。 */
export interface GaiaCollectedArtifactError {
    readonly stage: "artifact_copy" | "result_read";
    readonly message: string;
}

/**
 * 从 GAIA 容器环境中回收领域产物（/workspace/answer.json）。
 *
 * @remarks
 * 只读取领域答案，不复制容器内 Runtime 状态。
 *
 * @param env - 容器环境执行句柄。
 * @returns 包含提交的答案、关联 taskId 及错误列表的结果对象。
 *
 * @example
 * ```ts
 * const artifacts = await collectGaiaDomainArtifacts(env);
 * console.log(artifacts.submittedAnswer);
 * ```
 */
export async function collectGaiaDomainArtifacts(env: EnvironmentHandle): Promise<{
    readonly submittedAnswer: string | null;
    readonly answerTaskId: string | null;
    readonly errors: readonly GaiaCollectedArtifactError[];
}> {
    const errors: GaiaCollectedArtifactError[] = [];
    let submittedAnswer: string | null = null;
    let answerTaskId: string | null = null;

    try {
        const catResult = await env.exec("cat /workspace/answer.json", {
            timeoutMs: 15_000,
            maxBytes: 128 * 1024,
            truncate: true,
        });
        if (catResult.code === 0) {
            const answerData = JSON.parse(catResult.stdout.trim());
            if (typeof answerData === "object" && answerData !== null) {
                submittedAnswer = typeof answerData.answer === "string" ? answerData.answer : null;
                answerTaskId = typeof answerData.taskId === "string" ? answerData.taskId : null;
            }
        } else {
            errors.push({
                stage: "result_read",
                message: catResult.stderr || "answer.json not found or not readable",
            });
        }
    } catch (error) {
        errors.push({
            stage: "result_read",
            message: error instanceof Error ? error.message : String(error),
        });
    }

    return {
        submittedAnswer,
        answerTaskId,
        errors: Object.freeze(errors),
    };
}

/** GAIA EnvironmentSpec 构造配置。 */
export interface GaiaEnvironmentSpecOptions {
    /** 当前执行的目标任务。 */
    readonly task: GaiaManifestTask;
    /** 数据集存放根目录绝对路径。 */
    readonly dataRoot: string;
    /** 由 WorkerBuilder 生成的 Worker 产物。 */
    readonly workerArtifact?: WorkerArtifact;
    /** 基础镜像名称覆盖。 */
    readonly baseImage?: string;
    /** 安装层命令覆盖。 */
    readonly installCommands?: readonly string[];
    /** 可选的评测 Run ID。 */
    readonly runId?: string;
    /** 是否仅回收领域产物（TUI 模式下宿主控制持久化，不从容器复制 state）。 */
    readonly domainOnly?: boolean;
    /** Worker 类型；TUI 透明代理使用 Tool RPC Worker，Headless 使用 ACP Worker。 */
    readonly workerMode?: "acp" | "tools";
}

function shellQuote(str: string): string {
    return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * GAIA 对统一隔离环境的声明式适配。
 *
 * @remarks
 * 声明 managed 模式镜像（含 Python 文件处理依赖）、工作区准备、附件注入、
 * Python 关键依赖预检和答案回收。
 *
 * @example
 * ```ts
 * const spec = new GaiaEnvironmentSpec({ task, dataRoot: "/data/gaia" });
 * const image = spec.resolveImage(task);
 * ```
 */
export class GaiaEnvironmentSpec
    implements EnvironmentSpec<GaiaManifestTask, GaiaCollectedArtifacts> {
    readonly benchmarkId = "gaia";
    private readonly task: GaiaManifestTask;
    private readonly dataRoot: string;
    private readonly workerArtifact?: WorkerArtifact | undefined;
    private readonly baseImage?: string | undefined;
    private readonly installCommands: readonly string[];
    private readonly runId?: string | undefined;
    private readonly domainOnly: boolean;
    private readonly workerMode: "acp" | "tools";

    constructor(options: GaiaEnvironmentSpecOptions) {
        this.task = options.task;
        this.dataRoot = resolve(options.dataRoot);
        this.workerArtifact = options.workerArtifact;
        this.baseImage = options.baseImage;
        this.installCommands = options.installCommands ?? (options.baseImage !== undefined ? [] : GAIA_MANAGED_INSTALL_COMMANDS);
        this.runId = options.runId;
        this.domainOnly = options.domainOnly ?? false;
        this.workerMode = options.workerMode ?? "acp";

        if (this.runId !== undefined && !/^[A-Za-z0-9_.-]+$/u.test(this.runId)) {
            throw new TypeError("GAIA runId contains unsupported characters");
        }
    }

    /** 返回 managed 模式镜像及安装命令。 */
    resolveImage(task: GaiaManifestTask): ImageSource {
        this.assertTask(task);
        return {
            mode: "managed",
            ...(this.baseImage === undefined ? {} : { baseImage: this.baseImage }),
            platform: "linux/amd64",
            installCommands: this.installCommands,
        };
    }

    /** 返回 Worker 入口配置。 */
    getWorkerEntryConfig(task: GaiaManifestTask): WorkerEntryConfig {
        this.assertTask(task);
        return {
            ...(this.workerArtifact === undefined ? {} : { artifact: this.workerArtifact }),
            cwd: "/workspace",
            command: this.workerMode === "tools"
                ? ["/opt/lazygoal/node", "/opt/lazygoal/worker.mjs", "--task-id", task.taskId]
                : ["/opt/lazygoal/node", "/opt/lazygoal/worker.mjs"],
        };
    }

    /** 在容器中创建工作区、写入 question.txt 并复制附件。 */
    async prepareEnvironment(env: EnvironmentHandle): Promise<void> {
        requireSuccess(
            await env.exec("mkdir -p /workspace /workspace/attachments /opt/lazygoal /opt/lazygoal/state"),
            "Prepare GAIA container directories",
        );

        // 写入 /workspace/question.txt
        const tempDir = await mkdtemp(join(tmpdir(), "gaia-question-"));
        try {
            const hostQuestionFile = join(tempDir, "question.txt");
            await writeFile(hostQuestionFile, this.task.question, "utf8");
            await env.copyInto(hostQuestionFile, "/workspace/question.txt");
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }

        // 复制附件
        for (const attachment of this.task.attachments) {
            const hostSource = resolve(this.dataRoot, attachment);
            const containerTarget = join("/workspace", attachment);
            const containerDir = dirname(containerTarget);
            requireSuccess(
                await env.exec(`mkdir -p ${shellQuote(containerDir)}`),
                `Prepare attachment directory ${containerDir}`,
            );
            await env.copyInto(hostSource, containerTarget);
        }
    }

    /** 预检验证 Python 和关键文件处理库（openpyxl、docx、PyPDF2、pydub、PIL）。 */
    async preflight(env: EnvironmentHandle): Promise<PreflightResult> {
        const pythonScript = [
            "import importlib, importlib.metadata, json, sys",
            "libs = ['openpyxl', 'docx', 'PyPDF2', 'pydub', 'PIL']",
            "details = {'pythonVersion': sys.version.split()[0]}",
            "missing = []",
            "for lib in libs:",
            "    try:",
            "        importlib.import_module(lib)",
            "        details[lib] = 'available'",
            "    except Exception as e:",
            "        details[lib] = f'missing: {e}'",
            "        missing.append(lib)",
            "details['missing'] = missing",
            "print(json.dumps(details))",
        ].join("\n");

        const result = await env.exec(
            `python3 -c ${shellQuote(pythonScript)}`,
            { timeoutMs: 60_000, maxBytes: 64 * 1024, truncate: true },
        );

        if (result.code !== 0) {
            return {
                ok: false,
                message: result.stderr || result.stdout || `Python preflight exited with code ${result.code}`,
            };
        }

        try {
            const parsed = JSON.parse(result.stdout.trim());
            if (Array.isArray(parsed.missing) && parsed.missing.length > 0) {
                return {
                    ok: false,
                    details: parsed,
                    message: `Missing required Python libraries: ${parsed.missing.join(", ")}`,
                };
            }
            return { ok: true, details: parsed };
        } catch {
            return { ok: false, message: "GAIA Python preflight returned invalid JSON output" };
        }
    }

    /** 回收容器内的 /workspace/answer.json 及持久化状态。 */
    async collectArtifacts(
        env: EnvironmentHandle,
        outputDirectory: string,
        _graceMs: number,
    ): Promise<GaiaCollectedArtifacts> {
        const output = resolve(outputDirectory);
        const domain = await collectGaiaDomainArtifacts(env);
        const errors: GaiaCollectedArtifactError[] = [...domain.errors];

        // 若开启 domainOnly（TUI 模式），宿主掌控持久化，跳过容器 state 复制
        if (this.domainOnly) {
            return {
                submittedAnswer: domain.submittedAnswer,
                answerTaskId: domain.answerTaskId,
                persistence: null,
                errors: Object.freeze(errors),
            };
        }

        let persistence: BenchmarkPersistenceLocator | null = null;

        // 回收持久化文件
        const benchmarkKey = encodeIdentifier("gaia");
        const taskKey = encodeIdentifier(this.task.taskId);
        const runtimeRoot = join(
            output,
            "runtime",
            benchmarkKey,
            taskKey,
            ...(this.runId === undefined ? [] : [encodeIdentifier(this.runId)]),
        );

        const copied: Partial<Record<"goals" | "trajectories" | "traces", string>> = {};
        await mkdir(runtimeRoot, { recursive: true });

        for (const kind of ["goals", "trajectories", "traces"] as const) {
            try {
                const target = join(runtimeRoot, kind);
                copied[kind] = await env.copyOut(
                    `/opt/lazygoal/state/${benchmarkKey}/${taskKey}/${kind}`,
                    target,
                );
                await access(copied[kind]);
            } catch {
                // 持久化文件在未启用状态或异常时可能缺失，不阻塞整体流程
            }
        }

        if (copied.goals !== undefined) {
            persistence = {
                goalSnapshot: relative(output, copied.goals),
                trajectory: relative(output, copied.trajectories ?? copied.goals),
                ...(copied.traces === undefined ? {} : { diagnosticTrace: relative(output, copied.traces) }),
            };
        }

        return {
            submittedAnswer: domain.submittedAnswer,
            answerTaskId: domain.answerTaskId,
            persistence,
            errors: Object.freeze(errors),
        };
    }

    private assertTask(task: GaiaManifestTask): void {
        if (task.taskId !== this.task.taskId) {
            throw new TypeError("GAIA EnvironmentSpec task identity mismatch");
        }
    }
}

function encodeIdentifier(value: string): string {
    return Buffer.from(value, "utf8").toString("base64url");
}
