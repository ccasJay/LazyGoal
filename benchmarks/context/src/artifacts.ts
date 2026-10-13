import { createHash } from "node:crypto";
import { lstat, readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { safePath } from "./scenario.js";
/** 内容身份使用实际字节；不以 Git HEAD 替代工作树。 */
export function digest(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
/** 确定性 JSON 身份；数组顺序保留，对象键排序。 */
export function identity(value: unknown): string { return digest(canonical(value)); }
function canonical(value: unknown): string {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value !== null && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ":" + canonical(item)).join(",") + "}";
    return JSON.stringify(value);
}
/** 读取普通文件树，拒绝符号链接、隐藏目录与过量产物，保证限定归档路径。 */
export async function hashTree(directory: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    let bytes = 0;
    async function walk(prefix: string): Promise<void> {
        for (const name of (await readdir(join(directory, prefix))).sort()) {
            const path = prefix ? prefix + "/" + name : name;
            safePath(path);
            const file = join(directory, path);
            const stats = await lstat(file);
            if (stats.isSymbolicLink()) throw new Error("Artifact symlink rejected");
            if (stats.isDirectory()) await walk(path);
            else if (stats.isFile()) {
                bytes += stats.size;
                if (bytes > 64 * 1024 * 1024 || Object.keys(result).length >= 10000) throw new Error("Artifact archive limit exceeded");
                result[path] = digest(await readFile(file));
            } else throw new Error("Non-regular artifact rejected");
        }
    }
    await walk("");
    return result;
}
/** 只写显式场景初始文件，不复制宿主项目。 */
export async function materializeFiles(directory: string, files: Readonly<Record<string, string>>): Promise<void> {
    for (const [path, value] of Object.entries(files)) {
        safePath(path);
        await mkdir(dirname(join(directory, path)), { recursive: true });
        await writeFile(join(directory, path), value, { flag: "wx" });
    }
}
