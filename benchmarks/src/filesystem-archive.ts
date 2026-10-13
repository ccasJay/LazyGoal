import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { runProcess, requireSuccess, type ProcessRunner } from "./process.js";

/**
 * 完整 Docker 文件系统归档身份，不包含进程内存或卷内容。
 * @remarks 文件名固定，摘要校验采用流式读取，不受普通项目归档大小限制。
 * @example
 * ```ts
 * await loadFilesystemArchive(directory, archive);
 * ```
 */
export interface FilesystemArchive {
    readonly file: "filesystem.tar";
    readonly imageId: string;
    readonly sha256: string;
}
/** 流式计算普通文件摘要；拒绝符号链接。 */
export async function hashArchiveFile(path: string): Promise<string> {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Archive must be a regular file");
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest("hex");
}
/** 校验归档字段和字节；缺失或损坏时不导入。 */
export async function validateFilesystemArchive(directory: string, value: FilesystemArchive): Promise<void> {
    if (value.file !== "filesystem.tar" || !/^sha256:[a-f0-9]{64}$/.test(value.imageId) || !/^[a-f0-9]{64}$/.test(value.sha256) ||
        await hashArchiveFile(join(directory, value.file)) !== value.sha256) throw new Error("Filesystem archive corrupted");
}
/** 校验后导入镜像；只使用清单指定身份，不信任 docker load 的显示文本。 */
export async function loadFilesystemArchive(directory: string, value: FilesystemArchive, run: ProcessRunner = runProcess, signal?: AbortSignal): Promise<void> {
    await validateFilesystemArchive(directory, value);
    requireSuccess(await run("docker", ["load", "--input", join(directory, value.file)], { timeoutMs: 1_200_000, maxBytes: 100_000, ...(signal ? { signal } : {}) }), "Load filesystem checkpoint");
    const id = requireSuccess(await run("docker", ["image", "inspect", value.imageId, "--format", "{{.Id}}"], { timeoutMs: 15_000, ...(signal ? { signal } : {}) }), "Inspect checkpoint image").trim();
    if (id !== value.imageId) throw new Error("Checkpoint image identity mismatch");
}
