import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ModelPreference, ModelPreferenceStore } from "../../runtime/src/model-preference";
import { modelPreferenceFileBinding } from "./generated/model-preference-binding";
import type { ModelPreferenceFile } from "./model-preference-file";
import { atomicWriteJson } from "./json-file-write";
import { KeyedSerialQueue } from "./keyed-serial-queue";

const MODEL_PREFERENCE_KEY = "model-preference";

/**
 * 工作区私有模型偏好文件存储。
 *
 * @remarks
 * 文件损坏时读取和写入均失败，避免覆盖用户偏好；同一实例的写入按提交顺序串行化。
 * 临时文件以私有权限写入，并通过重命名原子替换。读取使用 Catalog 生成的严格绑定。
 *
 * @example
 * ```ts
 * const store = new JsonFileModelPreferenceStore("/path/to/workspace-home");
 * await store.set({ provider: "openai", modelId: "gpt-4o" });
 * ```
 */
export class JsonFileModelPreferenceStore implements ModelPreferenceStore {
    private readonly queue = new KeyedSerialQueue();

    /** @param directory - 当前工作区的私有 LazyGoal 目录。 */
    constructor(private readonly directory: string) {}

    /** @returns 已保存偏好；文件不存在时返回 undefined，损坏或读取失败时拒绝。 */
    async get(): Promise<ModelPreference | undefined> {
        await this.queue.drain(MODEL_PREFERENCE_KEY);
        return this.readRecord();
    }

    /** @param preference - 已由调用方验证的当前 Provider 模型；损坏或写入失败时拒绝。 */
    async set(preference: ModelPreference): Promise<void> {
        return this.queue.run(MODEL_PREFERENCE_KEY, async () => {
            await this.readRecord();
            await atomicWriteJson({
                path: join(this.directory, "model-preference.json"),
                value: { version: 1, ...preference },
                indent: 2,
                trailingNewline: false,
                durable: false,
            });
        });
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
        const result = modelPreferenceFileBinding.read(parsed, "reject");
        if (!result.ok) throw new Error("Model preference file has an invalid or unsupported version.");
        return {
            ...(result.data.profileId === undefined ? {} : { profileId: result.data.profileId }),
            modelId: result.data.modelId,
        };
    }
}
