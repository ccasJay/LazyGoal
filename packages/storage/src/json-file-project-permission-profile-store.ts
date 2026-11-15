import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
    DEFAULT_PERMISSION_PROFILE,
    PermissionProfileConflictError,
    type PermissionProfile,
    type ProjectPermissionProfile,
    type ProjectPermissionProfileStore,
} from "../../permission/src/index";
import { permissionProfileFileBinding } from "./generated/permission-profile-binding";
import type { PermissionProfileFile } from "./permission-profile-file";
import { atomicWriteJson } from "./json-file-write";
import { KeyedSerialQueue } from "./keyed-serial-queue";

const PERMISSION_PROFILE_KEY = "permission-profile";

type PermissionProfileRecord = PermissionProfileFile;

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return typeof error === "object"
        && error !== null
        && "code" in error
        && typeof error.code === "string";
}

function toProjectProfile(record: PermissionProfileRecord): ProjectPermissionProfile {
    return {
        workspaceId: record.workspaceId,
        profile: {
            sandbox: record.sandbox,
            approvals: record.approvals,
            reviewer: record.reviewer,
            writableRoots: record.writableRoots,
        },
        revision: record.revision,
    };
}

/**
 * 工作区权限档位的 JSON 文件存储实现。
 *
 * @remarks
 * 档位保存在 `<workspace-directory>/permission-profile.json`，每次写入都通过临时文件与原子重命名替换。
 * 同一实例的写入按键串行化，读取使用 Catalog 生成的严格绑定。记录损坏或版本不受支持时读取与写入
 * 都失败关闭，不退回默认档位，也不静默覆盖。
 *
 * @example
 * ```ts
 * const store = new JsonFileProjectPermissionProfileStore("/path/to/workspace-home");
 * const current = await store.get("ws-1");
 * const updated = await store.update("ws-1", PERMISSION_PRESETS.auto, current.revision);
 * ```
 */
export class JsonFileProjectPermissionProfileStore implements ProjectPermissionProfileStore {
    private readonly queue = new KeyedSerialQueue();

    /**
     * @param directory - 当前工作区的私有状态目录。
     */
    constructor(private readonly directory: string) {}

    private filePath(): string {
        return join(this.directory, "permission-profile.json");
    }

    /**
     * 读取指定工作区的当前权限档位。
     *
     * @param workspaceId - 工作区稳定标识。
     * @returns 当前档位与版本；无记录或记录属于其它工作区时返回默认档位与 `0`。
     * @throws 文件损坏、协议版本不受支持或底层读取失败时抛出异常。
     */
    async get(workspaceId: string): Promise<ProjectPermissionProfile> {
        await this.queue.drain(PERMISSION_PROFILE_KEY);
        const record = await this.readRecord();
        if (record === undefined || record.workspaceId !== workspaceId) {
            return {
                workspaceId,
                profile: DEFAULT_PERMISSION_PROFILE,
                revision: 0,
            };
        }

        return toProjectProfile(record);
    }

    /**
     * 以乐观并发写入工作区权限档位。
     *
     * @param workspaceId - 工作区稳定标识。
     * @param profile - 期望生效的完整档位，整体替换旧值。
     * @param expectedRevision - 调用方读取到的当前版本。
     * @returns 写入后的档位，`revision` 为 `expectedRevision + 1`。
     * @throws 版本不匹配时抛出 `PermissionProfileConflictError`；文件损坏或写入失败时抛出异常。
     */
    async update(
        workspaceId: string,
        profile: PermissionProfile,
        expectedRevision: number,
    ): Promise<ProjectPermissionProfile> {
        return this.mutate(async (current) => {
            const actualRevision = current?.workspaceId === workspaceId ? current.revision : 0;
            if (actualRevision !== expectedRevision) {
                throw new PermissionProfileConflictError(
                    workspaceId,
                    expectedRevision,
                    actualRevision,
                );
            }

            const nextRecord: PermissionProfileRecord = {
                version: 1,
                workspaceId,
                sandbox: profile.sandbox,
                approvals: profile.approvals,
                reviewer: profile.reviewer,
                writableRoots: [...profile.writableRoots],
                revision: actualRevision + 1,
            };

            await this.writeRecord(nextRecord);
            return toProjectProfile(nextRecord);
        });
    }

    private async mutate<T>(
        operation: (current: PermissionProfileRecord | undefined) => Promise<T>,
    ): Promise<T> {
        return this.queue.run(PERMISSION_PROFILE_KEY, async () => {
            const current = await this.readRecord();
            return operation(current);
        });
    }

    private async readRecord(): Promise<PermissionProfileRecord | undefined> {
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
            throw new Error(`Permission profile file contains invalid JSON: ${(error as Error).message}`);
        }

        const validated = permissionProfileFileBinding.read(parsed, "reject");
        if (!validated.ok) {
            throw new Error(`Permission profile file is structurally invalid: ${validated.issues.map(issue => `${issue.path || "/"}:${issue.code}`).join(", ")}`);
        }

        return validated.data;
    }

    private async writeRecord(record: PermissionProfileRecord): Promise<void> {
        await atomicWriteJson({
            path: this.filePath(),
            value: record,
            indent: 2,
            trailingNewline: false,
            durable: false,
        });
    }
}
