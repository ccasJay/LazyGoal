import { join } from "node:path";
import { homedir } from "node:os";
import { chmod, mkdir } from "node:fs/promises";

/**
 * XDG 基础目录资源路径定义。
 */
export interface XdgPaths {
    /** 配置主目录（如 `~/.config` 或 `$XDG_CONFIG_HOME`）。 */
    readonly configHome: string;
    /** LazyGoal 应用专属配置目录（`.../lazygoal`）。 */
    readonly lazygoalConfigDir: string;
    /** 主配置文件路径（`.../lazygoal/config.toml`）。 */
    readonly configFile: string;
    /** 用户级 Profile 存放目录（`.../lazygoal/profiles`）。 */
    readonly profilesDir: string;
}

/**
 * 依据 XDG 基础目录规范解析 LazyGoal 配置路径。
 *
 * @remarks
 * 优先读取 `XDG_CONFIG_HOME` 环境变量；若未定义或为空字符串，
 * 则默认回退到 `$HOME/.config`。
 *
 * @param env - 可选的环境变量映射，默认为当前进程环境。
 * @returns 解析得到的 XDG 路径对象。
 * @example
 * ```ts
 * const paths = resolveXdgPaths(process.env);
 * console.log(paths.configFile); // ~/.config/lazygoal/config.toml
 * ```
 */
export function resolveXdgPaths(env: NodeJS.ProcessEnv = process.env): XdgPaths {
    const rawConfigHome = env.XDG_CONFIG_HOME?.trim();
    const configHome = rawConfigHome && rawConfigHome.length > 0
        ? rawConfigHome
        : join(env.HOME || homedir(), ".config");

    const lazygoalConfigDir = join(configHome, "lazygoal");
    const configFile = join(lazygoalConfigDir, "config.toml");
    const profilesDir = join(lazygoalConfigDir, "profiles");

    return {
        configHome,
        lazygoalConfigDir,
        configFile,
        profilesDir,
    };
}

/**
 * 安全地创建 LazyGoal 配置目录（在 POSIX 环境下设置为 0700 权限）。
 *
 * @param paths - 解析好的 XdgPaths 对象。
 * @example
 * ```ts
 * await ensureSecureConfigDir(paths);
 * ```
 */
export async function ensureSecureConfigDir(paths: XdgPaths): Promise<void> {
    await mkdir(paths.lazygoalConfigDir, { recursive: true, mode: 0o700 });
    await mkdir(paths.profilesDir, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") {
        try {
            await chmod(paths.lazygoalConfigDir, 0o700);
            await chmod(paths.profilesDir, 0o700);
        } catch {
            // 忽略文件系统权限调整不支持的场景
        }
    }
}

/**
 * 确保配置文件的权限安全（在 POSIX 环境下设置为 0600 权限）。
 *
 * @param filePath - 配置文件路径。
 * @example
 * ```ts
 * await ensureSecureConfigFile(paths.configFile);
 * ```
 */
export async function ensureSecureConfigFile(filePath: string): Promise<void> {
    if (process.platform !== "win32") {
        try {
            await chmod(filePath, 0o600);
        } catch {
            // 忽略文件系统权限调整不支持的场景
        }
    }
}
