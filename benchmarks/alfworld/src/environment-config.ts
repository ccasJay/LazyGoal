import { execFile } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

export const ALFWORLD_ENVIRONMENT_NAME = "lazygoal-alfworld";
export const ALFWORLD_VERSION = "0.4.2";
export const TEXTWORLD_VERSION = "1.6.2";
export const ALFWORLD_PYTHON_ENV = "ALFWORLD_PYTHON";
export const ALFWORLD_DATA_ENV = "ALFWORLD_DATA";
export const ALFWORLD_ENV_FILE_PATH = fileURLToPath(
    new URL("../.env.alfworld", import.meta.url),
);
const execFileAsync = promisify(execFile);
const PYTHON_PROBE_MAX_BUFFER = 64 * 1024;

export type CondaSubdir = "linux-64" | "osx-64" | "osx-arm64" | "win-64";

/**
 * ALFWorld TextWorld 评测所需的进程配置。
 *
 * @remarks
 * 配置只描述显式评测入口需要的 Python 可执行文件、数据根和版本约束，
 * 不会创建 Conda 环境，也不会触发外部进程。普通 LazyGoal 测试可以安全地
 * 使用此配置解析函数而无需安装 ALFWorld。
 *
 * @example
 * ```ts
 * const config = resolveAlfworldEnvironment({
 *   env: { ALFWORLD_PYTHON: "/opt/conda/envs/lazygoal-alfworld/bin/python", ALFWORLD_DATA: "/data/alfworld" },
 * });
 * ```
 */
export interface AlfworldEnvironmentConfig {
    readonly environmentName: string;
    readonly pythonExecutable: string;
    readonly dataRoot: string;
    readonly alfworldVersion: string;
    readonly textworldVersion: string;
    readonly condaSubdir: CondaSubdir | undefined;
    readonly textworldOnly: true;
}

/**
 * 环境配置解析时的可测试覆盖项。
 *
 * @example
 * ```ts
 * const input: EnvironmentConfigInput = { env: { ALFWORLD_DATA: "/data" } };
 * ```
 */
export interface EnvironmentConfigInput {
    readonly env?: NodeJS.ProcessEnv;
    readonly platform?: NodeJS.Platform;
    readonly arch?: string;
    readonly cwd?: string;
}

export type AlfworldConfigurationErrorCode =
    | "INVALID_ENV_FILE"
    | "MISSING_PYTHON"
    | "MISSING_DATA"
    | "INVALID_DATA_PATH"
    | "UNSUPPORTED_PLATFORM";

/**
 * ALFWorld 配置不满足显式评测前置条件时抛出的错误。
 *
 * @example
 * ```ts
 * try {
 *   resolveAlfworldEnvironment({ env: {} });
 * } catch (error) {
 *   if (error instanceof AlfworldConfigurationError) console.error(error.code);
 * }
 * ```
 */
export class AlfworldConfigurationError extends Error {
    readonly name = "AlfworldConfigurationError";

    constructor(
        readonly code: AlfworldConfigurationErrorCode,
        message: string,
    ) {
        super(message);
    }
}

/**
 * 读取 ALFWorld 本地环境变量文件，并返回其中声明的变量。
 *
 * @remarks
 * 默认读取 `benchmarks/alfworld/.env.alfworld`。支持空行、注释、`export KEY=value`
 * 和简单的 `${KEY}` 展开；文件中的变量不会覆盖调用方显式传入的环境变量，
 * 覆盖优先级由入口在合并时保证。文件不存在时返回空对象，使 CI 或手工导出
 * 环境变量的调用方式保持兼容。
 *
 * @param filePath - 可选的环境变量文件路径，主要用于测试覆盖。
 * @param baseEnv - 展开变量时使用的已有环境；默认使用当前进程环境。
 * @returns 文件中解析出的环境变量；文件不存在时返回空对象。
 * @throws 文件无法读取或包含非法行、未闭合引号时抛出配置错误。
 * @example
 * ```ts
 * const fileEnv = await loadAlfworldEnvironmentFile();
 * const env = { ...fileEnv, ...process.env };
 * ```
 */
export async function loadAlfworldEnvironmentFile(
    filePath = ALFWORLD_ENV_FILE_PATH,
    baseEnv: NodeJS.ProcessEnv = process.env,
): Promise<NodeJS.ProcessEnv> {
    let content: string;
    try {
        content = await readFile(filePath, "utf8");
    } catch (error: unknown) {
        if (isNodeError(error) && error.code === "ENOENT") return {};
        throw new AlfworldConfigurationError(
            "INVALID_ENV_FILE",
            `Unable to read ALFWorld environment file: ${filePath}`,
        );
    }

    const values: Record<string, string> = {};
    const expansionEnv: Record<string, string | undefined> = {
        ...baseEnv,
    };

    for (const [index, rawLine] of content.split(/\r?\n/u).entries()) {
        const line = rawLine.trim();
        if (line === "" || line.startsWith("#")) continue;

        const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(line);
        if (match === null) {
            throw new AlfworldConfigurationError(
                "INVALID_ENV_FILE",
                `Invalid ALFWorld environment assignment at ${filePath}:${index + 1}`,
            );
        }

        const key = match[1]!;
        let value = match[2]!.trim();
        if (value.startsWith('"') || value.startsWith("'")) {
            const quote = value[0]!;
            if (!value.endsWith(quote) || value.length < 2) {
                throw new AlfworldConfigurationError(
                    "INVALID_ENV_FILE",
                    `Unclosed quote in ALFWorld environment file at ${filePath}:${index + 1}`,
                );
            }
            value = value.slice(1, -1);
        }

        value = value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (_whole, name: string) => {
            return expansionEnv[name] ?? "";
        });
        values[key] = value;
        expansionEnv[key] = value;
    }

    return values;
}

/**
 * 返回当前平台在 Conda 中应使用的包架构。
 *
 * @remarks
 * Apple Silicon 明确选择 `osx-64`，以匹配 ALFWorld/TextWorld 的已验证依赖；
 * 该选择只用于初始化命令和诊断，不会在普通测试中运行 Conda。
 *
 * @param platform - Node 平台标识。
 * @param arch - Node CPU 架构标识。
 * @param explicit - 调用方显式指定的 Conda 子目录。
 * @returns 可识别的 Conda 子目录；不支持的平台返回 `undefined`。
 * @example
 * ```ts
 * getCondaSubdir("darwin", "arm64"); // "osx-64"
 * ```
 */
export function getCondaSubdir(
    platform: NodeJS.Platform,
    arch: string,
    explicit?: string,
): CondaSubdir | undefined {
    if (explicit !== undefined && explicit.trim() !== "") {
        if (isCondaSubdir(explicit)) return explicit;
        throw new AlfworldConfigurationError(
            "UNSUPPORTED_PLATFORM",
            `Unsupported ALFWorld Conda subdir: ${explicit}`,
        );
    }

    if (platform === "darwin") return "osx-64";
    if (platform === "linux" && arch === "x64") return "linux-64";
    if (platform === "win32" && arch === "x64") return "win-64";
    return undefined;
}

/**
 * 从进程环境解析 ALFWorld 配置。
 *
 * @param input - 可选环境、平台和工作目录覆盖，主要用于测试。
 * @returns 已解析且未执行外部副作用的配置。
 * @throws 缺少 Python、数据根或架构配置无效时抛出 `AlfworldConfigurationError`。
 * @example
 * ```ts
 * const config = resolveAlfworldEnvironment();
 * console.log(config.dataRoot);
 * ```
 */
export function resolveAlfworldEnvironment(
    input: EnvironmentConfigInput = {},
): AlfworldEnvironmentConfig {
    const env = input.env ?? process.env;
    const pythonExecutable = env[ALFWORLD_PYTHON_ENV]?.trim();
    if (pythonExecutable === undefined || pythonExecutable.length === 0) {
        throw new AlfworldConfigurationError(
            "MISSING_PYTHON",
            `Missing required environment variable: ${ALFWORLD_PYTHON_ENV}`,
        );
    }

    const dataValue = env[ALFWORLD_DATA_ENV]?.trim();
    if (dataValue === undefined || dataValue.length === 0) {
        throw new AlfworldConfigurationError(
            "MISSING_DATA",
            `Missing required environment variable: ${ALFWORLD_DATA_ENV}`,
        );
    }

    const dataRoot = resolve(input.cwd ?? process.cwd(), dataValue);
    if (!isAbsolute(dataValue)) {
        throw new AlfworldConfigurationError(
            "INVALID_DATA_PATH",
            `${ALFWORLD_DATA_ENV} must be an absolute directory: ${dataValue}`,
        );
    }

    const condaSubdir = getCondaSubdir(
        input.platform ?? process.platform,
        input.arch ?? process.arch,
        env.CONDA_SUBDIR,
    );

    return {
        environmentName: env.ALFWORLD_CONDA_ENV?.trim() || ALFWORLD_ENVIRONMENT_NAME,
        pythonExecutable,
        dataRoot,
        alfworldVersion: ALFWORLD_VERSION,
        textworldVersion: TEXTWORLD_VERSION,
        condaSubdir,
        textworldOnly: true,
    };
}

/**
 * Python 预检返回的稳定环境事实。
 *
 * @example
 * ```ts
 * const result: AlfworldPreflightResult = {
 *   pythonVersion: "3.9.19",
 *   alfworldVersion: "0.4.2",
 *   textworldVersion: "1.6.2",
 *   dataRoot: "/data/alfworld",
 *   textworldOnly: true,
 * };
 * ```
 */
export interface AlfworldPreflightResult {
    readonly pythonVersion: string;
    readonly alfworldVersion: string;
    readonly textworldVersion: string;
    readonly dataRoot: string;
    readonly textworldOnly: true;
}

/**
 * 可注入 Python 探针的进程结果。
 *
 * @example
 * ```ts
 * const result: PythonProbeResult = { stdout: "{}", stderr: "", exitCode: 0 };
 * ```
 */
export interface PythonProbeResult {
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number;
}

/**
 * 运行 ALFWorld Python 预检探针并把进程结果转换为统一 DTO。
 *
 * @remarks
 * 使用 `execFile` 的无 shell 调用，stdout/stderr 上限保持为 64 KiB；调用方环境
 * 变量覆盖当前进程环境，并始终把 `ALFWORLD_DATA` 传给探针。启动失败和非零退出
 * 不直接抛出，而是转换为 `PythonProbeResult`，由预检层决定错误分类。
 *
 * @param executable - Python 可执行文件路径。
 * @param script - 传给 Python `-c` 的探针脚本。
 * @param env - 探针使用的环境变量覆盖。
 * @returns stdout、stderr 和进程退出码。
 * @example
 * ```ts
 * const result = await runAlfworldPythonProbe(
 *   "/opt/conda/bin/python",
 *   PYTHON_PROBE,
 *   { ALFWORLD_DATA: "/data/alfworld" },
 * );
 * ```
 */
export async function runAlfworldPythonProbe(
    executable: string,
    script: string,
    env: NodeJS.ProcessEnv,
): Promise<PythonProbeResult> {
    try {
        const output = await execFileAsync(executable, ["-c", script], {
            env: { ...process.env, ...env, ALFWORLD_DATA: env[ALFWORLD_DATA_ENV] },
            maxBuffer: PYTHON_PROBE_MAX_BUFFER,
        });
        return { stdout: output.stdout, stderr: output.stderr, exitCode: 0 };
    } catch (error: unknown) {
        const failure = error as {
            stdout?: string;
            stderr?: string;
            code?: number;
            message?: string;
        };
        return {
            stdout: failure.stdout ?? "",
            stderr: failure.stderr ?? failure.message ?? "Python probe failed",
            exitCode: typeof failure.code === "number" ? failure.code : 1,
        };
    }
}

/**
 * ALFWorld 预检的外部边界。
 *
 * @remarks
 * 生产入口注入真实 Python 执行器，普通测试注入假的探针和目录检查器，
 * 从而不会隐式创建 Conda 进程。
 *
 * @example
 * ```ts
 * const dependencies: AlfworldPreflightDependencies = {
 *   probePython: async () => ({ stdout: "{}", stderr: "", exitCode: 0 }),
 * };
 * ```
 */
export interface AlfworldPreflightDependencies {
    readonly probePython: (
        executable: string,
        script: string,
        env: NodeJS.ProcessEnv,
    ) => Promise<PythonProbeResult>;
    readonly isDirectory?: (path: string) => Promise<boolean>;
}

export type AlfworldPreflightErrorCode =
    | "DATA_NOT_FOUND"
    | "PYTHON_PROBE_FAILED"
    | "INVALID_PYTHON_PROBE"
    | "VERSION_MISMATCH";

/**
 * 显式评测启动前的 Python、数据和 TextWorld 能力检查错误。
 *
 * @example
 * ```ts
 * const result = await preflightAlfworldEnvironment(config, dependencies);
 * console.log(result.textworldOnly);
 * ```
 */
export class AlfworldPreflightError extends Error {
    readonly name = "AlfworldPreflightError";

    constructor(
        readonly code: AlfworldPreflightErrorCode,
        message: string,
    ) {
        super(message);
    }
}

const PYTHON_PROBE = [
    "import importlib.metadata, json, os, sys",
    "import alfworld, textworld",
    "def package_version(module, package):",
    "  return getattr(module, '__version__', importlib.metadata.version(package))",
    "print(json.dumps({",
    "  'pythonVersion': sys.version.split()[0],",
    "  'alfworldVersion': package_version(alfworld, 'alfworld'),",
    "  'textworldVersion': package_version(textworld, 'textworld'),",
    "  'dataRoot': os.environ.get('ALFWORLD_DATA', ''),",
    "  'textworldOnly': True,",
    "}))",
].join("\n");

/**
 * 执行 ALFWorld 显式入口的无模型预检。
 *
 * @remarks
 * 该函数只在调用方明确启动评测时运行 Python；测试可注入 `probePython`，
 * 因此普通 Node/TypeScript 测试不会创建 Conda 进程。
 *
 * @param config - 已解析的 ALFWorld 环境配置。
 * @param dependencies - Python 探针和数据目录检查器。
 * @returns Python、ALFWorld、TextWorld 和数据根的机器可读事实。
 * @throws 数据目录不存在、探针失败、输出非法或版本不匹配时抛出预检错误。
 * @example
 * ```ts
 * const result = await preflightAlfworldEnvironment(config, {
 *   probePython: runAlfworldPythonProbe,
 * });
 * ```
 */
export async function preflightAlfworldEnvironment(
    config: AlfworldEnvironmentConfig,
    dependencies: AlfworldPreflightDependencies,
): Promise<AlfworldPreflightResult> {
    const isDirectory = dependencies.isDirectory ?? defaultIsDirectory;
    if (!(await isDirectory(config.dataRoot))) {
        throw new AlfworldPreflightError(
            "DATA_NOT_FOUND",
            `ALFWorld data directory is not available: ${config.dataRoot}`,
        );
    }

    const probe = await dependencies.probePython(
        config.pythonExecutable,
        PYTHON_PROBE,
        { ...process.env, ALFWORLD_DATA: config.dataRoot },
    );
    if (probe.exitCode !== 0) {
        throw new AlfworldPreflightError(
            "PYTHON_PROBE_FAILED",
            `ALFWorld Python preflight failed with exit code ${probe.exitCode}: ${probe.stderr.trim()}`,
        );
    }

    const result = parseProbeResult(probe.stdout);
    if (
        result.alfworldVersion !== config.alfworldVersion ||
        result.textworldVersion !== config.textworldVersion ||
        result.textworldOnly !== true ||
        result.dataRoot !== config.dataRoot
    ) {
        throw new AlfworldPreflightError(
            "VERSION_MISMATCH",
            `ALFWorld/TextWorld version or capability mismatch: expected ${config.alfworldVersion}/${config.textworldVersion} TextWorld-only`,
        );
    }

    return result;
}

function isCondaSubdir(value: string): value is CondaSubdir {
    return ["linux-64", "osx-64", "osx-arm64", "win-64"].includes(value);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}

async function defaultIsDirectory(path: string): Promise<boolean> {
    try {
        await access(path, constants.R_OK);
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

function parseProbeResult(stdout: string): AlfworldPreflightResult {
    const line = stdout.trim().split("\\n").at(-1);
    if (line === undefined || line.length === 0) {
        throw new AlfworldPreflightError(
            "INVALID_PYTHON_PROBE",
            "ALFWorld Python preflight returned no JSON result",
        );
    }

    try {
        const value: unknown = JSON.parse(line);
        if (!isPreflightResult(value)) throw new Error("shape");
        return value;
    } catch {
        throw new AlfworldPreflightError(
            "INVALID_PYTHON_PROBE",
            "ALFWorld Python preflight returned invalid JSON",
        );
    }
}

function isPreflightResult(value: unknown): value is AlfworldPreflightResult {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return (
        typeof record.pythonVersion === "string" &&
        typeof record.alfworldVersion === "string" &&
        typeof record.textworldVersion === "string" &&
        typeof record.dataRoot === "string" &&
        record.textworldOnly === true
    );
}

export { PYTHON_PROBE };
