import { encodePathSegment } from "./path-segment";
import { isModelConversationMessage } from "../../model-contracts/src/index";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import type { ModelInputMessage, ModelInputRecord, ModelInputStore } from "../../runtime/src/model-input";
import { modelInputFileBinding } from "./generated/model-input-manifest-binding";
import type { ModelInputManifest, ModelInputManifestMessage } from "./model-input-file";
import { appendJsonl } from "./json-file-write";
import { KeyedSerialQueue } from "./keyed-serial-queue";

const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const id = (value: string) => { if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) throw new Error("Invalid model input identity"); return encodePathSegment(value); };
const BODY_FILE_NAME = /^([a-f0-9]{64})\.txt$/;

/** 进程内已落盘正文摘要及其来源目录身份。 */
interface BodyIndex {
    readonly identity: string;
    readonly refs: Set<string>;
}

function isValidManifest(value: ModelInputManifest, goalId: string, runId: string): boolean {
    if (value.goalId !== goalId || value.runId !== runId) return false;
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(value.callId)) return false;
    if (value.executionUnitId !== undefined && !/^[A-Za-z0-9_-]{1,256}$/.test(value.executionUnitId)) return false;
    if (!Number.isSafeInteger(value.stepIndex) || value.stepIndex < 1) return false;
    if (!Number.isFinite(Date.parse(value.occurredAt))) return false;
    return true;
}

/**
 * 按 Goal/Run 保存调用清单与 SHA-256 寻址正文，未变化的 system 文本不重复写入。
 * @remarks 完整正文只留在工作区本地，文件权限 0600；读取当前仍遍历整个 Run 清单。
 * 清单追加前正文必须落盘；崩溃可留下未引用正文，但不会产生缺正文的有效调用。
 * 正文在同一 Goal 的所有 Run 之间复用。单实例按 Goal 串行追加，不承诺多进程共同写入或 exactly-once。
 * @example
 * ```ts
 * const store = new JsonFileModelInputStore("/workspace/model-inputs");
 * await store.append(input);
 * ```
 */
/**
 * 按 Goal/Run 保存调用清单与 SHA-256 寻址正文，未变化的 system 文本不重复写入。
 *
 * @remarks
 * 完整正文只留在工作区本地，文件权限 0600；读取当前仍遍历整个 Run 清单。
 * 清单追加前正文必须落盘；崩溃可留下未引用正文，但不会产生缺正文的有效调用。
 * 正文在同一 Goal 的所有 Run 之间复用。单实例按 Goal 串行追加，不承诺多进程共同写入或 exactly-once。
 *
 * 实例按 Goal 维护进程内正文摘要集合：首次追加时用一次 `readdir` 种子化，之后
 * 每次追加用一次 `stat` 校验正文目录身份；目录被外部删除或重建时重新种子化。
 * 集合只跳过写入与读回比对，不改变清单内容；它不是跨进程事实源，进程重启后
 * 自然失效。未命中集合的摘要仍执行 `wx` 写入与 EEXIST 读回校验。
 *
 * @example
 * ```ts
 * const store = new JsonFileModelInputStore("/workspace/model-inputs");
 * await store.append(input);
 * ```
 */
export class JsonFileModelInputStore implements ModelInputStore {
    private readonly queue = new KeyedSerialQueue();
    private readonly bodyIndexes = new Map<string, BodyIndex>();
    /** @param directory - 正式工作区或隔离评测的模型输入根目录。 */
    constructor(private readonly directory: string) {}
    /** @returns 全部正文写入且调用清单追加完成后 resolve。 @throws 写入失败拒绝。 */
    append(record: ModelInputRecord): Promise<void> {
        const directory = this.path(record.goalId, record.runId);
        const key = dirname(directory);
        const bodyDirectory = join(key, "messages");
        return this.queue.run(key, async () => {
            await mkdir(bodyDirectory, { recursive: true, mode: 0o700 });
            await mkdir(directory, { recursive: true, mode: 0o700 });
            const known = await this.knownBodies(key, bodyDirectory);
            const messages: ModelInputManifestMessage[] = [];
            for (const message of record.messages) {
                const ref = digest(message.content);
                if (!known.has(ref)) {
                    await this.storeBody(bodyDirectory, ref, message.content);
                    known.add(ref);
                }
                const { content: _, ...fields } = message;
                messages.push({ ...fields, ref } as ModelInputManifestMessage);
            }
            const { messages: _, ...identity } = record;
            await appendJsonl({
                path: join(directory, "requests.jsonl"),
                value: { schemaVersion: 1, ...identity, messages },
                durable: false,
            });
        });
    }

    /**
     * 解析当前正文目录已落盘的摘要集合。
     *
     * @remarks
     * 目录身份变化（删除后重建、被替换）时丢弃旧集合并重新 `readdir`。目录在
     * 校验期间消失时返回空集合且不建立缓存，本次追加回退到逐条 `wx` 语义。
     */
    private async knownBodies(key: string, bodyDirectory: string): Promise<Set<string>> {
        const identity = await this.directoryIdentity(bodyDirectory);
        const cached = this.bodyIndexes.get(key);
        if (identity !== undefined && cached !== undefined && cached.identity === identity) {
            return cached.refs;
        }
        const refs = new Set<string>();
        if (identity === undefined) {
            this.bodyIndexes.delete(key);
            return refs;
        }
        for (const name of await readdir(bodyDirectory)) {
            const match = BODY_FILE_NAME.exec(name);
            if (match !== null) refs.add(match[1]!);
        }
        this.bodyIndexes.set(key, { identity, refs });
        return refs;
    }

    /** @returns 正文目录的稳定身份；目录不存在时返回 `undefined`。 */
    private async directoryIdentity(path: string): Promise<string | undefined> {
        try {
            const stats = await stat(path);
            return `${stats.dev}:${stats.ino}:${stats.birthtimeMs}`;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
            throw error;
        }
    }

    /**
     * 写入一条尚未出现在摘要集合中的正文。
     *
     * @throws 正文已存在且内容与摘要不匹配时拒绝。
     */
    private async storeBody(bodyDirectory: string, ref: string, content: string): Promise<void> {
        const path = join(bodyDirectory, `${ref}.txt`);
        try { await writeFile(path, content, { flag: "wx", mode: 0o600 }); }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
            if (await readFile(path, "utf8") !== content) throw new Error("Model input content hash mismatch");
        }
    }
    /** @returns 完整且顺序不变的输入事实；不存在时为空。 @throws 格式、正文哈希或身份不匹配时拒绝。 */
    async read(goalId: string, runId: string): Promise<readonly ModelInputRecord[]> {
        const directory = this.path(goalId, runId);
        let content: string;
        try { content = await readFile(join(directory, "requests.jsonl"), "utf8"); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
        const bodies = new Map<string, string>();
        const result: ModelInputRecord[] = [];
        for (const line of content.split("\n").filter(Boolean)) {
            const read = modelInputFileBinding.read(JSON.parse(line) as unknown, "reject");
            if (!read.ok || !isValidManifest(read.data, goalId, runId)) throw new Error("Invalid model input manifest");
            const value = read.data;
            const messages: ModelInputMessage[] = [];
            for (const message of value.messages) {
                if (!/^[a-f0-9]{64}$/.test(message.ref)) throw new Error("Invalid model input message reference");
                let body = bodies.get(message.ref);
                if (body === undefined) {
                    body = await readFile(join(dirname(directory), "messages", `${message.ref}.txt`), "utf8");
                    if (digest(body) !== message.ref) throw new Error("Model input content hash mismatch");
                    bodies.set(message.ref, body);
                }
                const { ref: _, source, ...fields } = message;
                const restored = { ...fields, content: body };
                if (!isModelConversationMessage(restored)) throw new Error("Invalid model input message");
                messages.push({ ...restored, source });
            }
            result.push({
                goalId,
                runId,
                callId: value.callId,
                stage: value.stage,
                stepIndex: value.stepIndex,
                occurredAt: value.occurredAt,
                ...(value.executionUnitId === undefined ? {} : { executionUnitId: value.executionUnitId }),
                messages,
            });
        }
        return result;
    }
    /**
     * 删除一个 Run 的模型输入清单。
     *
     * @remarks
     * 只删除 `<goal>/<run>/requests.jsonl` 所在目录；同 Goal 共享的 `messages/`
     * 正文不在本方法内删除。调用方必须先确认该 Run 的清单已经整体失效。
     *
     * @param goalId - Goal 稳定标识。
     * @param runId - Run 稳定标识。
     * @returns 目录不存在或删除完成后 resolve。
     * @throws 底层删除失败时拒绝。
     *
     * @example
     * ```ts
     * await store.deleteRun("goal-1", "run-1");
     * ```
     */
    async deleteRun(goalId: string, runId: string): Promise<void> {
        await rm(this.path(goalId, runId), { recursive: true, force: true });
    }

    private path(goalId: string, runId: string) { return join(this.directory, id(goalId), id(runId)); }
}
