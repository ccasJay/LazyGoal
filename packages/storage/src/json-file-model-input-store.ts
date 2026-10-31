import { encodePathSegment } from "./path-segment";
import { isModelConversationMessage } from "../../model-contracts/src/index";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import type { ModelInputMessage, ModelInputRecord, ModelInputStore } from "../../runtime/src/model-input";
import { modelInputFileBinding } from "./generated/model-input-manifest-binding";
import type { ModelInputManifest, ModelInputManifestMessage } from "./model-input-file";
import { appendJsonl } from "./json-file-write";
import { KeyedSerialQueue } from "./keyed-serial-queue";

const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const id = (value: string) => { if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) throw new Error("Invalid model input identity"); return encodePathSegment(value); };

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
export class JsonFileModelInputStore implements ModelInputStore {
    private readonly queue = new KeyedSerialQueue();
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
            const messages: ModelInputManifestMessage[] = [];
            for (const message of record.messages) {
                const ref = digest(message.content);
                try { await writeFile(join(bodyDirectory, `${ref}.txt`), message.content, { flag: "wx", mode: 0o600 }); }
                catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
                    if (await readFile(join(bodyDirectory, `${ref}.txt`), "utf8") !== message.content) throw new Error("Model input content hash mismatch");
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
    private path(goalId: string, runId: string) { return join(this.directory, id(goalId), id(runId)); }
}
