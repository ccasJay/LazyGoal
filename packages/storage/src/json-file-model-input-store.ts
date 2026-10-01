import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import type { ModelInputMessage, ModelInputRecord, ModelInputStore } from "../../runtime/src/model-input";

type Manifest = Omit<ModelInputRecord, "messages"> & { schemaVersion: 1; messages: { role: ModelInputMessage["role"]; source: ModelInputMessage["source"]; ref: string }[] };
const sources = ["system", "conversation", "section", "working_context", "stage", "request"];
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const id = (value: string) => { if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) throw new Error("Invalid model input identity"); return Buffer.from(value).toString("base64url"); };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

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
    private readonly queues = new Map<string, Promise<void>>();
    /** @param directory - 正式工作区或隔离评测的模型输入根目录。 */
    constructor(private readonly directory: string) {}
    /** @returns 全部正文写入且调用清单追加完成后 resolve。 @throws 写入失败拒绝。 */
    append(record: ModelInputRecord): Promise<void> {
        const directory = this.path(record.goalId, record.runId);
        const key = dirname(directory);
        const bodyDirectory = join(key, "messages");
        const operation = (this.queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
            await mkdir(bodyDirectory, { recursive: true, mode: 0o700 });
            await mkdir(directory, { recursive: true, mode: 0o700 });
            const messages: Manifest["messages"] = [];
            for (const message of record.messages) {
                const ref = digest(message.content);
                try { await writeFile(join(bodyDirectory, `${ref}.txt`), message.content, { flag: "wx", mode: 0o600 }); }
                catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
                    if (await readFile(join(bodyDirectory, `${ref}.txt`), "utf8") !== message.content) throw new Error("Model input content hash mismatch");
                }
                messages.push({ role: message.role, source: message.source, ref });
            }
            const { messages: _, ...identity } = record;
            await appendFile(join(directory, "requests.jsonl"), JSON.stringify({ schemaVersion: 1, ...identity, messages }) + "\n", { mode: 0o600 });
        });
        this.queues.set(key, operation);
        void operation.finally(() => { if (this.queues.get(key) === operation) this.queues.delete(key); }).catch(() => undefined);
        return operation;
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
            const value: unknown = JSON.parse(line);
            if (!object(value) || value.schemaVersion !== 1 || value.goalId !== goalId || value.runId !== runId
                || typeof value.callId !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(value.callId)
                || !["think", "decide"].includes(String(value.stage)) || !Number.isSafeInteger(value.stepIndex) || Number(value.stepIndex) < 1
                || typeof value.occurredAt !== "string" || !Number.isFinite(Date.parse(value.occurredAt))
                || value.executionUnitId !== undefined && (typeof value.executionUnitId !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(value.executionUnitId))
                || !Array.isArray(value.messages)) throw new Error("Invalid model input manifest");
            const messages: ModelInputMessage[] = [];
            for (const message of value.messages) {
                if (!object(message) || !["system", "user", "assistant"].includes(String(message.role)) || !sources.includes(String(message.source))
                    || typeof message.ref !== "string" || !/^[a-f0-9]{64}$/.test(message.ref)) throw new Error("Invalid model input message reference");
                let body = bodies.get(message.ref);
                if (body === undefined) {
                    body = await readFile(join(dirname(directory), "messages", `${message.ref}.txt`), "utf8");
                    if (digest(body) !== message.ref) throw new Error("Model input content hash mismatch");
                    bodies.set(message.ref, body);
                }
                messages.push({ role: message.role as ModelInputMessage["role"], source: message.source as ModelInputMessage["source"], content: body });
            }
            result.push({ goalId, runId, callId: value.callId, stage: value.stage as ModelInputRecord["stage"], stepIndex: Number(value.stepIndex), occurredAt: value.occurredAt,
                ...(value.executionUnitId === undefined ? {} : { executionUnitId: value.executionUnitId as string }), messages });
        }
        return result;
    }
    private path(goalId: string, runId: string) { return join(this.directory, id(goalId), id(runId)); }
}
