/** 模型输入清单允许的递归 JSON 值。 */
export type ModelInputJsonValue =
    | string
    | number
    | boolean
    | null
    | readonly ModelInputJsonValue[]
    | { readonly [key: string]: ModelInputJsonValue };

/** 模型输入清单中的一条消息引用；正文由 `ref` 指向 SHA-256 文件。 */
export interface ModelInputManifestMessage {
    readonly role: "system" | "user" | "assistant" | "tool";
    readonly source: "system" | "conversation" | "section" | "working_context" | "stage" | "request" | "native_history";
    readonly ref: string;
    readonly callId?: string;
    readonly toolId?: string;
    readonly reasoning?: string;
    readonly toolCalls?: readonly ModelInputJsonValue[];
    readonly continuation?: ModelInputJsonValue;
}

/** 模型输入 JSONL 清单的持久化 DTO。 */
export interface ModelInputManifest {
    readonly schemaVersion: 1;
    readonly goalId: string;
    readonly runId: string;
    readonly callId: string;
    readonly executionUnitId?: string;
    readonly stepIndex: number;
    readonly stage: "think" | "decide" | "completion_review";
    readonly occurredAt: string;
    readonly messages: readonly ModelInputManifestMessage[];
}
