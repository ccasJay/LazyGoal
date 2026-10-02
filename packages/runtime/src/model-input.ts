import type { ModelConversationMessage } from "../../contracts/src/model-conversation";
/**
 * 一次调用实际装配的消息及已知来源；正文不截断，顺序与 Adapter 输入一致。
 * @remarks source 只记录装配器已知的来源；request 表示未细分的请求消息，不能从文本猜测插件或技能身份。
 * @example
 * ```ts
 * const message: ModelInputMessage = { role: "system", content: "Follow the task.", source: "system" };
 * ```
 */
export type ModelInputMessage = ModelConversationMessage & {
    readonly source: "system" | "conversation" | "section" | "working_context" | "stage" | "request" | "native_history";
};

/**
 * Adapter 调用前保存的输入事实；不证明供应商已接收请求，不参与 Goal 恢复。
 * @remarks callId 与模型指标共享；失败、重试和阶段调用分别保留身份。
 * @example
 * ```ts
 * const input: ModelInputRecord = { goalId: "goal-1", runId: "run-1", callId: "call-1", stage: "decide", stepIndex: 1, occurredAt: new Date().toISOString(), messages: [] };
 * ```
 */
export interface ModelInputRecord {
    readonly goalId: string;
    readonly runId: string;
    readonly callId: string;
    readonly executionUnitId?: string;
    readonly stepIndex: number;
    readonly stage: "think" | "decide";
    readonly occurredAt: string;
    readonly messages: readonly ModelInputMessage[];
}

/**
 * 完整模型消息输入的独立持久化端口，不拥有 Snapshot 或上下文比较基线。
 * @remarks Store 可将正文按内容寻址去重；读取返回原始消息顺序，不允许截断或推测缺失输入。
 * @example
 * ```ts
 * await store.append(input);
 * const calls = await store.read(input.goalId, input.runId);
 * ```
 */
export interface ModelInputStore {
    /** @returns 输入可读取后 resolve；失败拒绝，调用方不得继续发送未记录的输入。 */
    append(record: ModelInputRecord): Promise<void>;
    /** @returns Run 的输入事实，文件不存在时为空；不受 Snapshot 提交边界限制。 @throws 文件损坏或 I/O 失败时拒绝。 */
    read(goalId: string, runId: string): Promise<readonly ModelInputRecord[]>;
}
