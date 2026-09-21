import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

/**
 * LazyGoal Home 下全局资源的路径集合。
 *
 * @example
 * ```ts
 * const paths = resolveLazyGoalHomePaths();
 * console.log(paths.agentProfilesDir);
 * ```
 */
export interface LazyGoalHomePaths {
    /** LazyGoal Home 根目录。 */
    readonly homeDirectory: string;
    /** 全局 TOML 配置文件。 */
    readonly configFile: string;
    /** LLM TOML Profile 目录。 */
    readonly profilesDir: string;
    /** Agent JSON Profile 目录。 */
    readonly agentProfilesDir: string;
    /** workspace 隔离目录。 */
    readonly workspacesDir: string;
    /** 可重建缓存目录。 */
    readonly cacheDir: string;
}

/**
 * 当前 workspace 的 LazyGoal Home 路径集合。
 *
 * @example
 * ```ts
 * const paths = await resolveWorkspaceHomePaths(home, process.cwd());
 * console.log(paths.goalsDirectory);
 * ```
 */
export interface WorkspaceHomePaths {
    /** 由规范化 workspace 路径计算出的稳定标识。 */
    readonly workspaceId: string;
    /** 当前 workspace 的 Home 目录。 */
    readonly workspaceDirectory: string;
    /** workspace 身份清单文件。 */
    readonly manifestFile: string;
    /** Goal 快照目录。 */
    readonly goalsDirectory: string;
    /** 执行轨迹目录。 */
    readonly trajectoriesDirectory: string;
    /** 诊断 Trace 目录。 */
    readonly tracesDirectory: string;
    /** Context Sidecar 目录。 */
    readonly contextSidecarsDirectory: string;
    /** Benchmark 运行根目录。 */
    readonly benchmarksDirectory: string;
    /** GEPA 运行根目录。 */
    readonly gepaDirectory: string;
    /** Benchmark 全局可重建 cache 根目录。 */
    readonly benchmarkCacheDirectory: string;
}

/**
 * workspace 身份清单的当前协议。
 *
 * @example
 * ```ts
 * const manifest: WorkspaceManifest = {
 *     schemaVersion: 1,
 *     workspaceRoot: "/workspace/project",
 * };
 * ```
 */
export interface WorkspaceManifest {
    readonly schemaVersion: 1;
    readonly workspaceRoot: string;
}

/** Home 路径配置错误。 */
export class LazyGoalHomeConfigurationError extends Error {
    readonly code = "INVALID_LAZYGOAL_HOME" as const;

    constructor(message: string) {
        super(message);
        this.name = "LazyGoalHomeConfigurationError";
    }
}

/** workspace 身份清单协议错误。 */
export class WorkspaceManifestProtocolError extends Error {
    readonly code = "INVALID_LAZYGOAL_WORKSPACE_MANIFEST" as const;

    constructor(message: string) {
        super(message);
        this.name = "WorkspaceManifestProtocolError";
    }
}

/**
 * 解析 LazyGoal Home 的全局资源路径。
 *
 * @remarks
 * `LAZYGOAL_HOME` 缺失或空白时回退到当前用户 Home 下的 `.lazygoal`；非空值必须是绝对路径。
 * 该函数是纯路径解析，不创建目录或文件，也不读取旧的 XDG 路径。
 *
 * @param env - 可选的环境变量映射。
 * @returns 全局配置、Profile、workspace 与 cache 路径。
 * @throws `LazyGoalHomeConfigurationError` 当覆盖路径不是绝对路径时抛出。
 * @example
 * ```ts
 * const home = resolveLazyGoalHomePaths({ LAZYGOAL_HOME: "/tmp/lazygoal" });
 * console.log(home.configFile); // /tmp/lazygoal/config.toml
 * ```
 */
export function resolveLazyGoalHomePaths(
    env: NodeJS.ProcessEnv = process.env,
): LazyGoalHomePaths {
    const configured = env.LAZYGOAL_HOME?.trim();
    const homeDirectory = configured === undefined || configured.length === 0
        ? join(env.HOME?.trim() || homedir(), ".lazygoal")
        : configured;

    if (!isAbsolute(homeDirectory)) {
        throw new LazyGoalHomeConfigurationError(
            `LAZYGOAL_HOME 必须是绝对路径，当前值为 "${configured}"`,
        );
    }

    return {
        homeDirectory,
        configFile: join(homeDirectory, "config.toml"),
        profilesDir: join(homeDirectory, "profiles"),
        agentProfilesDir: join(homeDirectory, "agent-profiles"),
        workspacesDir: join(homeDirectory, "workspaces"),
        cacheDir: join(homeDirectory, "cache"),
    };
}

/**
 * 解析当前 workspace 的隔离路径。
 *
 * @remarks
 * 先解析 `workspaceRoot` 的真实路径，再以 SHA-256 生成稳定 ID；此函数不创建目录或 manifest。
 *
 * @param home - 已解析的 LazyGoal Home。
 * @param workspaceRoot - workspace 根目录。
 * @returns 当前 workspace 的 Store、benchmark、GEPA 与 cache 路径。
 * @throws 底层 `realpath` 无法解析 workspace 时传播文件系统错误。
 * @example
 * ```ts
 * const paths = await resolveWorkspaceHomePaths(home, "/workspace/project");
 * console.log(paths.goalsDirectory);
 * ```
 */
export async function resolveWorkspaceHomePaths(
    home: LazyGoalHomePaths,
    workspaceRoot: string,
): Promise<WorkspaceHomePaths> {
    const normalizedRoot = await realpath(workspaceRoot);
    const workspaceId = createHash("sha256").update(normalizedRoot, "utf8").digest("hex");
    const workspaceDirectory = join(home.workspacesDir, workspaceId);

    return {
        workspaceId,
        workspaceDirectory,
        manifestFile: join(workspaceDirectory, "workspace.json"),
        goalsDirectory: join(workspaceDirectory, "goals"),
        trajectoriesDirectory: join(workspaceDirectory, "trajectories"),
        tracesDirectory: join(workspaceDirectory, "traces"),
        contextSidecarsDirectory: join(workspaceDirectory, "context-sidecars"),
        benchmarksDirectory: join(workspaceDirectory, "benchmarks"),
        gepaDirectory: join(workspaceDirectory, "gepa"),
        benchmarkCacheDirectory: join(home.cacheDir, "benchmarks"),
    };
}

/**
 * 创建并修正 LazyGoal Home 的受保护目录。
 *
 * @param paths - 已解析的 Home 路径。
 * @returns 所有目录创建和权限修正完成后的 Promise。
 * @throws 底层文件系统创建失败时抛出。
 * @example
 * ```ts
 * await ensureSecureHomeDirectories(resolveLazyGoalHomePaths());
 * ```
 */
export async function ensureSecureHomeDirectories(paths: LazyGoalHomePaths): Promise<void> {
    const directories = [
        paths.homeDirectory,
        paths.profilesDir,
        paths.agentProfilesDir,
        paths.workspacesDir,
        paths.cacheDir,
        join(paths.cacheDir, "benchmarks"),
    ];
    await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true, mode: 0o700 })));
    if (process.platform !== "win32") {
        await Promise.all(directories.map((directory) => chmod(directory, 0o700)));
    }
}

/**
 * 创建或校验 workspace 身份清单。
 *
 * @remarks
 * 已有清单必须与当前 workspaceRoot 一致；首次创建通过同目录临时文件和原子替换完成。
 *
 * @param paths - 已解析的 workspace 路径。
 * @param workspaceRoot - 已规范化的 workspace 根路径。
 * @returns 清单创建或校验完成后的 Promise。
 * @throws `WorkspaceManifestProtocolError` 当清单损坏、版本不支持或根路径不一致时抛出。
 * @example
 * ```ts
 * await ensureWorkspaceManifest(paths, realWorkspaceRoot);
 * ```
 */
export async function ensureWorkspaceManifest(
    paths: WorkspaceHomePaths,
    workspaceRoot: string,
): Promise<void> {
    if (existsSync(paths.manifestFile)) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(await readFile(paths.manifestFile, "utf8"));
        } catch (error) {
            throw new WorkspaceManifestProtocolError(
                `workspace.json 无法解析: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
        if (!isWorkspaceManifest(parsed) || parsed.workspaceRoot !== workspaceRoot) {
            throw new WorkspaceManifestProtocolError(
                `workspace.json 与当前 workspaceRoot 不一致: ${workspaceRoot}`,
            );
        }
        if (process.platform !== "win32") await chmod(paths.manifestFile, 0o600);
        return;
    }

    await mkdir(paths.workspaceDirectory, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") await chmod(paths.workspaceDirectory, 0o700);
    const temporaryFile = join(paths.workspaceDirectory, `.workspace-${randomUUID()}.tmp`);
    await writeFile(
        temporaryFile,
        `${JSON.stringify({ schemaVersion: 1, workspaceRoot } satisfies WorkspaceManifest, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600 },
    );
    if (process.platform !== "win32") await chmod(temporaryFile, 0o600);
    await rename(temporaryFile, paths.manifestFile);
    if (process.platform !== "win32") await chmod(paths.manifestFile, 0o600);
}

/**
 * 创建并修正当前 workspace Home 的受保护目录。
 *
 * @param paths - 已解析的 workspace Home 路径。
 * @returns workspace 运行目录创建和权限修正完成后的 Promise。
 * @throws 底层文件系统创建失败时抛出。
 * @example
 * ```ts
 * await ensureSecureWorkspaceDirectories(workspacePaths);
 * ```
 */
export async function ensureSecureWorkspaceDirectories(
    paths: WorkspaceHomePaths,
): Promise<void> {
    const directories = [
        paths.workspaceDirectory,
        paths.goalsDirectory,
        paths.trajectoriesDirectory,
        paths.tracesDirectory,
        paths.contextSidecarsDirectory,
        paths.benchmarksDirectory,
        paths.gepaDirectory,
    ];
    await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true, mode: 0o700 })));
    if (process.platform !== "win32") {
        await Promise.all(directories.map((directory) => chmod(directory, 0o700)));
    }
}

function isWorkspaceManifest(value: unknown): value is WorkspaceManifest {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return record.schemaVersion === 1 && typeof record.workspaceRoot === "string";
}

/**
 * 确保敏感配置文件使用 POSIX `0600` 权限。
 *
 * @param filePath - 配置或 Profile 文件路径。
 * @returns 权限修正完成后的 Promise。
 */
export async function ensureSecureConfigFile(filePath: string): Promise<void> {
    if (process.platform !== "win32") await chmod(filePath, 0o600);
}
