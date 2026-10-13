import { record, textValue } from "./scenario.js";
/**
 * 宿主当前操作；不允许携带完整脚本、评分或未来消息。
 * @example
 * ```ts
 * const operation = parseWorkerOperation({ operation: "continue", prompt: "Next" });
 * ```
 */
export type WorkerOperation = {
    readonly operation: "launch" | "continue" | "resume";
    readonly prompt: string;
    readonly answers?: readonly { readonly questionId: string; readonly answer: string }[];
};
/** 严格解析 ACP JSON；非法额外字段拒绝。 */
export function parseWorkerOperation(raw: unknown): WorkerOperation {
    const value = record(raw);
    if (Object.keys(value).some(key => !["operation", "prompt", "answers"].includes(key))) throw new Error("Unexpected Worker operation field");
    if (value.operation !== "launch" && value.operation !== "continue" && value.operation !== "resume") throw new Error("Invalid Worker operation");
    let answers: WorkerOperation["answers"];
    if (value.answers !== undefined) {
        if (!Array.isArray(value.answers)) throw new Error("Invalid answers");
        answers = value.answers.map(rawAnswer => {
            const answer = record(rawAnswer);
            return { questionId: textValue(answer.questionId), answer: textValue(answer.answer) };
        });
    }
    return { operation: value.operation, prompt: textValue(value.prompt), ...(answers === undefined ? {} : { answers }) };
}
