import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import {
    PermissionModeConflictError,
    type PermissionMode,
    type ProjectPermissionMode,
    type ProjectPermissionModeStore,
} from "../../permission/src/index";

const PermissionModeRecordSchema = z.object({
    version: z.literal(1),
    workspaceId: z.string().min(1),
    mode: z.enum(["default", "yolo"]),
    revision: z.number().int().nonnegative(),
}).strict();

type PermissionModeRecord = z.infer<typeof PermissionModeRecordSchema>;

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return typeof error === "object"
        && error !== null
        && "code" in error
        && typeof error.code === "string";
}

/**
 * 项目权限模式持久化存储实现。
 *
 * @remarks
 * 将工作区的 Default/YOLO 执行模式持久化在 `<workspaceDirectory>/permission-mode.json`。
 * 每次修改均读取并校验版本号，通过临时文件与原子重命名实现可靠写入。
 * 若模式文件损坏，抛出异常失败关闭，绝不静默覆盖或回退。
 *
 * @example
 * ```ts
 * const store = new JsonFileProjectPermissionModeStore("/path/to/workspace-home");
 * const current = await store.get("ws-1");
 * const updated = await store.set("ws-1", "yolo", current.revision);
 * ```
 */
export class JsonFileProjectPermissionModeStore implements ProjectPermissionModeStore {
    private tail: Promise<void> = Promise.resolve();

    /**
     * @param directory - 当前工作区的私有状态目录。
     */
    constructor(private readonly directory: string) {}

    private filePath(): string {
        return join(this.directory, "permission-mode.json");
    }

    /**
     * 读取指定工作区的当前权限模式。
     *
     * @param workspaceId - 工作区唯一标识。
     * @returns 当前权限模式事实；若无记录则返回默认 default 模式（revision: 0）。
     * @throws 文件格式非法或损坏时抛出异常。
     */
    async get(workspaceId: string): Promise<ProjectPermissionMode> {
        const record = await this.readRecord();
        if (record === undefined) {
            return {
                workspaceId,
                mode: "default",
                revision: 0,
            };
        }

        if (record.workspaceId !== workspaceId) {
            return {
                workspaceId,
                mode: "default",
                revision: 0,
            };
        }

        return {
            workspaceId: record.workspaceId,
            mode: record.mode,
            revision: record.revision,
        };
    }

    /**
     * 乐观并发原子更新项目权限模式。
     *
     * @param workspaceId - 工作区唯一标识。
     * @param mode - 期望设置的权限模式。
     * @param expectedRevision - 期望的旧版本修订号。
     * @returns 更新后的新模式事实（revision 递增 1）。
     * @throws 版本冲突时抛出 PermissionModeConflictError；文件损坏抛出异常。
     */
    async set(
        workspaceId: string,
        mode: PermissionMode,
        expectedRevision: number,
    ): Promise<ProjectPermissionMode> {
        return this.mutate(async (current) => {
            const actualRevision = current?.workspaceId === workspaceId ? current.revision : 0;
            if (actualRevision !== expectedRevision) {
                throw new PermissionModeConflictError(
                    workspaceId,
                    expectedRevision,
                    actualRevision,
                );
            }

            const nextRecord: PermissionModeRecord = {
                version: 1,
                workspaceId,
                mode,
                revision: actualRevision + 1,
            };

            await this.writeRecord(nextRecord);
            return {
                workspaceId: nextRecord.workspaceId,
                mode: nextRecord.mode,
                revision: nextRecord.revision,
            };
        });
    }

    private async mutate<T>(
        operation: (current: PermissionModeRecord | undefined) => Promise<T>,
    ): Promise<T> {
        const run = async (): Promise<T> => {
            const current = await this.readRecord();
            return operation(current);
        };

        const result = this.tail.then(run, run);
        this.tail = result.then(() => undefined, () => undefined);
        return result;
    }

    private async readRecord(): Promise<PermissionModeRecord | undefined> {
        let content: string;
        try {
            content = await readFile(this.filePath(), "utf8");
        } catch (error) {
            if (isNodeError(error) && error.code === "ENOENT") {
                return undefined;
            }
            throw error;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch (error) {
            throw new Error(`权限模式文件损坏，JSON 解析失败: ${(error as Error).message}`);
        }

        const validated = PermissionModeRecordSchema.safeParse(parsed);
        if (!validated.success) {
            throw new Error(`权限模式文件结构损坏: ${validated.error.message}`);
        }

        return validated.data;
    }

    private async writeRecord(record: PermissionModeRecord): Promise<void> {
        await mkdir(this.directory, { recursive: true });
        const target = this.filePath();
        const temp = `${target}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;

        await writeFile(temp, JSON.stringify(record, null, 2), "utf8");
        try {
            await rename(temp, target);
        } catch (error) {
            try {
                await unlink(temp);
            } catch {
                // 忽略临时文件清理失败
            }
            throw error;
        }
    }
}
