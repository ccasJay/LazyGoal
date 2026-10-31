import { writeFile } from "node:fs/promises";
import type {
    BoundTool,
    Tool,
    BoundToolDefinition,
    ToolExecutionRequest,
    ToolObservation,
    ToolValidationResult,
} from "../../../packages/tool-core/src/index.js";
import { contract } from "../../../packages/contracts/src/index.js";
import {
    throwIfAborted,
    type ExecutionControl,
} from "../../../packages/execution-control/src/index.js";
import { invalidInput } from "../../../packages/tools/src/internal/invalid-input.js";
import { submitAnswerInputBinding } from "./generated/submit-answer/binding.js";
export { submitAnswerInputBinding };

/** `SubmitAnswerTool` 在 Profile 中使用的稳定标识。 */
export const SUBMIT_ANSWER_TOOL_ID = "submit_answer";

/** Submit Answer Tool 的唯一输入 Contract。 */

/**
 * `submit_answer` 的结构化输入。
 */
export interface SubmitAnswerInput {
    /** 要提交的最终答案文本。 */
    readonly answer: string;
}

/** SubmitAnswerTool 初始化配置。 */
export interface SubmitAnswerToolOptions {
    /** 当前评测任务 ID。 */
    readonly taskId: string;
    /** 答案落盘文件路径，默认 `/workspace/answer.json`。 */
    readonly answerFilePath?: string;
    /** 答案成功提交时的回调通知。 */
    readonly onSubmit?: (answer: string) => void;
}

/**
 * GAIA 任务答案提交 Tool。
 *
 * @remarks
 * 使用 O_EXCL（flag: "wx"）将最终答案原子写入指定答案文件。
 * 每个任务只允许提交一次；若文件已存在或已提交过，后续调用均返回拒绝。
 * 作为评测交卷探针，isReadOnly 声明为 true，确保在未提案阶段即可被 Agent 调用交卷。
 *
 * @example
 * ```ts
 * const tool = new SubmitAnswerTool({ taskId: "gaia-1", answerFilePath: "/tmp/answer.json" });
 * const result = await tool.execute({
 *   actionId: "action-1",
 *   input: { answer: "Paris" },
 * });
 * ```
 */
export class SubmitAnswerTool implements BoundTool<SubmitAnswerInput> {
    readonly definition: BoundToolDefinition<SubmitAnswerInput> = {
        id: SUBMIT_ANSWER_TOOL_ID,
        description: "提交 GAIA 任务的最终答案。每个任务只允许调用一次，提交后任务结束。",
        inputBinding: submitAnswerInputBinding,
        isReadOnly: true,
    };

    readonly replayPolicy = "manual" as const;

    private readonly taskId: string;
    private readonly answerFilePath: string;
    private readonly onSubmit?: ((answer: string) => void) | undefined;
    private submitted = false;

    constructor(options: SubmitAnswerToolOptions) {
        if (!options.taskId || options.taskId.trim().length === 0) {
            throw new Error("taskId must be non-empty for SubmitAnswerTool");
        }
        this.taskId = options.taskId.trim();
        this.answerFilePath = options.answerFilePath ?? "/workspace/answer.json";
        this.onSubmit = options.onSubmit;
    }

    /** 检查当前 Tool 实例是否已经成功提交过答案。 */
    isSubmitted(): boolean {
        return this.submitted;
    }

    /**
     * 校验答案输入语义。
     *
     * @param input - 结构化输入。
     * @returns 语义校验结果。
     */
    validate(input: SubmitAnswerInput): ToolValidationResult {
        if (this.submitted) {
            return invalidInput("submit_answer 每个任务仅限调用一次，当前任务已提交过答案");
        }
        return { ok: true };
    }

    /**
     * 执行单次答案原子写入。
     *
     * @param request - 包含 Action ID 与答案的请求。
     * @param control - 可选的中止控制信号。
     * @returns 成功 Observation 或重复提交拒绝 Observation。
     */
    async execute(
        request: ToolExecutionRequest<SubmitAnswerInput>,
        control?: ExecutionControl,
    ): Promise<ToolObservation> {
        throwIfAborted(control);

        if (this.submitted) {
            return {
                kind: "failure",
                code: "ALREADY_SUBMITTED",
                message: "答案已提交过，每个任务仅允许提交一次",
                retryable: false,
            };
        }

        const answer = request.input.answer;
        const payload = JSON.stringify(
            {
                taskId: this.taskId,
                answer,
            },
            null,
            2,
        ) + "\n";

        try {
            await writeFile(this.answerFilePath, payload, { flag: "wx", encoding: "utf8" });
            this.submitted = true;
            this.onSubmit?.(answer);
            throwIfAborted(control);

            return {
                kind: "success",
                output: "答案已成功提交并落盘",
                summary: `已提交最终答案: ${answer}`,
            };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "EEXIST") {
                this.submitted = true;
                return {
                    kind: "failure",
                    code: "ALREADY_SUBMITTED",
                    message: "答案文件已存在，不可重复提交答案",
                    retryable: false,
                };
            }
            throw error;
        }
    }
}
