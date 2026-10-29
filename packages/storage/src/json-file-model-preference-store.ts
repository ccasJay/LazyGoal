import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import type { ModelPreference, ModelPreferenceStore } from "../../runtime/src/model-preference";
import { atomicWriteJson } from "./json-file-write";

const ModelPreferenceRecordSchema = z.object({
    version: z.literal(1),
    profileId: z.string().min(1).optional(),
    modelId: z.string().min(1),
}).strict();

/**
 * 工作区私有模型偏好文件存储。
 *
 * @remarks
 * 文件损坏时读取和写入均失败，避免覆盖用户偏好；同一实例的写入按提交顺序串行化。
 * 临时文件以私有权限写入，并通过重命名原子替换。
 *
 * @example
 * ```ts
 * const store = new JsonFileModelPreferenceStore("/path/to/workspace-home");
 * await store.set({ provider: "openai", modelId: "gpt-4o" });
 * ```
 */
export class JsonFileModelPreferenceStore implements ModelPreferenceStore {
    private tail: Promise<void> = Promise.resolve();

    /** @param directory - 当前工作区的私有 LazyGoal 目录。 */
    constructor(private readonly directory: string) {}

    /** @returns 已保存偏好；文件不存在时返回 undefined，损坏或读取失败时拒绝。 */
    async get(): Promise<ModelPreference | undefined> {
        await this.tail;
        return this.readRecord();
    }

    /** @param preference - 已由调用方验证的当前 Provider 模型；损坏或写入失败时拒绝。 */
    async set(preference: ModelPreference): Promise<void> {
        const write = async (): Promise<void> => {
            await this.readRecord();
            await atomicWriteJson({
                path: join(this.directory, "model-preference.json"),
                value: { version: 1, ...preference },
                indent: 2,
                trailingNewline: false,
                durable: false,
            });
        };
        const result = this.tail.then(write, write);
        this.tail = result.then(() => undefined, () => undefined);
        return result;
    }

    private async readRecord(): Promise<ModelPreference | undefined> {
        let content: string;
        try {
            content = await readFile(join(this.directory, "model-preference.json"), "utf8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
            throw error;
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch {
            throw new Error("Model preference file contains invalid JSON.");
        }
        const result = ModelPreferenceRecordSchema.safeParse(parsed);
        if (!result.success) throw new Error("Model preference file has an invalid or unsupported version.");
        return {
            ...(result.data.profileId === undefined ? {} : { profileId: result.data.profileId }),
            modelId: result.data.modelId,
        };
    }
}
