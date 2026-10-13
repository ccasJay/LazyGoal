import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { digest } from "./content-identity.js";
/**
 * 读取恢复所需持久化字节身份，排除可重建的 context-index。
 * @remarks 此函数只处理 Runtime 文件，不适用于真实仓库或容器镜像。
 * @example
 * ```ts
 * const files = await hashRuntimeFiles(stateDirectory);
 * ```
 */
export async function hashRuntimeFiles(directory: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    let bytes = 0;
    async function walk(prefix: string): Promise<void> {
        for (const name of (await readdir(join(directory, prefix))).sort()) {
            const path = prefix ? `${prefix}/${name}` : name;
            if (name === "context-index") continue;
            const stat = await lstat(join(directory, path));
            if (stat.isSymbolicLink()) throw new Error("Runtime persistence symlink rejected");
            if (stat.isDirectory()) await walk(path);
            else if (stat.isFile()) {
                bytes += stat.size;
                if (bytes > 64 * 1024 * 1024 || Object.keys(result).length >= 10000) throw new Error("Runtime persistence limit exceeded");
                result[path] = digest(await readFile(join(directory, path)));
            } else throw new Error("Runtime persistence must contain regular files");
        }
    }
    await walk(""); return result;
}
