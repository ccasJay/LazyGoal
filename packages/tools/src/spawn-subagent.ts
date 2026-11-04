import type { JsonValue } from "../../contracts/src/index";
import {
    createContractBinding,
    type ContractSchemaNode,
} from "../../contract-binding/src/index";
import type { ExecutionControl } from "../../execution-control/src/index";
import type {
    BoundToolDefinition,
    Tool,
    ToolExecutionContext,
    ToolExecutionRequest,
    ToolObservation,
    ToolValidationIssue,
    ToolValidationResult,
} from "../../tool-core/src/index";

/**
 * spawn_subagent 工具的标准 ID 标识。
 */
export const SPAWN_SUBAGENT_TOOL_ID = "spawn_subagent" as const;

/**
 * 启动子 Agent 任务的入参契约。
 *
 * @example
 * ```ts
 * const input: SpawnSubagentInput = {
 *   intent: "Run all test suites and fix lint errors",
 *   title: "Fix lint errors",
 * };
 * ```
 */
export interface SpawnSubagentInput {
    /**
     * 子任务的核心意图描述（非空字符串）。
     */
    readonly intent: string;

    /**
     * 可选的子任务标题。
     */
    readonly title?: string;
}

/**
 * 子 Agent 执行完成后的终态结果契约。
 *
 * @example
 * ```ts
 * const output: SpawnSubagentOutput = {
 *   childGoalId: "child-goal-123",
 *   status: "completed",
 *   answer: "All tests passed successfully",
 * };
 * ```
 */
export interface SpawnSubagentOutput {
    /**
     * 子 Goal 的唯一标识符。
     */
    readonly childGoalId: string;

    /**
     * 子 Goal 结束时的终态状态。
     */
    readonly status: "completed" | "failed" | "cancelled";

    /**
     * 成功完成时子 Agent 提交的最终交付回答。
     */
    readonly answer?: string;

    /**
     * 失败或取消时的简明原因描述。
     */
    readonly reason?: string;
}

/**
 * 驱动子 Agent 创建与等待的运行时派发器接口。
 *
 * @example
 * ```ts
 * class MySpawner implements SubagentSpawner {
 *   async spawn(input, context, control) {
 *     return { childGoalId: "c1", status: "completed", answer: "ok" };
 *   }
 * }
 * ```
 */
export interface SubagentSpawner {
    /**
     * 派发并阻塞等待子 Agent 执行至终态。
     *
     * @param input - 委派子任务入参
     * @param context - 父任务执行上下文，包含 parent goalId 与 runId
     * @param control - 执行控制句柄，包含 abort signal
     * @returns 子任务终态执行结果
     */
    spawn(
        input: SpawnSubagentInput,
        context: ToolExecutionContext,
        control?: ExecutionControl,
    ): Promise<SpawnSubagentOutput>;
}

/**
 * spawn_subagent 工具入参的 Contract Schema 定义。
 */
export const spawnSubagentSchema: ContractSchemaNode = {
    type: "object",
    properties: {
        intent: {
            type: "string",
            description: "The core intent/subtask description for the autonomous child subagent. Must be non-empty.",
        },
        title: {
            type: "string",
            description: "Optional human-readable title for the delegated subtask.",
        },
    },
    required: ["intent"],
};

/**
 * 校验 spawn_subagent 原始输入对象是否符合契约定义。
 *
 * @param input - 待校验的原始输入
 * @returns 校验结果及解析后的结构化入参或校验问题列表
 */
export function validateInput(
    input: unknown,
): { readonly ok: true; readonly value: SpawnSubagentInput } | { readonly ok: false; readonly issues: readonly ToolValidationIssue[] } {
    const issues: ToolValidationIssue[] = [];

    if (input === null || typeof input !== "object" || Array.isArray(input)) {
        return {
            ok: false,
            issues: [
                {
                    code: "INVALID_INPUT_TYPE",
                    path: [],
                    message: "Input must be an object",
                },
            ],
        };
    }

    const record = input as Record<string, unknown>;

    if (typeof record.intent !== "string") {
        issues.push({
            code: "MISSING_REQUIRED_FIELD",
            path: ["intent"],
            message: "Field 'intent' must be a string",
        });
    } else if (record.intent.trim().length === 0) {
        issues.push({
            code: "EMPTY_INTENT",
            path: ["intent"],
            message: "Field 'intent' cannot be empty",
        });
    }

    if (record.title !== undefined) {
        if (typeof record.title !== "string") {
            issues.push({
                code: "INVALID_FIELD_TYPE",
                path: ["title"],
                message: "Field 'title' must be a string if provided",
            });
        }
    }

    if (issues.length > 0) {
        return { ok: false, issues };
    }

    const value: SpawnSubagentInput = {
        intent: record.intent as string,
        ...(typeof record.title === "string" ? { title: record.title } : {}),
    };

    return {
        ok: true,
        value,
    };
}

/**
 * spawn_subagent 输入绑定的契约实例。
 *
 * @example
 * ```ts
 * const binding = spawnSubagentInputBinding;
 * ```
 */
export const spawnSubagentInputBinding = createContractBinding<SpawnSubagentInput>({
    contractId: "lazygoal.spawn-subagent.input",
    version: 1,
    schema: spawnSubagentSchema,
    validate: (data: unknown) => {
        const res = validateInput(data);
        return res.ok;
    },
});

/**
 * 启动子 Agent 任务的 Tool 实现。
 *
 * @remarks
 * 父 Goal 通过调用此 Tool 派生子 Goal。子 Goal 独立执行，
 * 并在达到终态（Completed / Failed / Cancelled）后返回结果。
 *
 * @example
 * ```ts
 * const tool = new SpawnSubagentTool(spawner);
 * const observation = await tool.execute(request, control);
 * ```
 */
export class SpawnSubagentTool implements Tool<SpawnSubagentInput> {
    readonly replayPolicy = "manual" as const;

    readonly definition: BoundToolDefinition<SpawnSubagentInput> = {
        id: SPAWN_SUBAGENT_TOOL_ID,
        description: "Spawn a child autonomous subagent Goal to execute a delegated subtask.",
        isReadOnly: false,
        inputBinding: spawnSubagentInputBinding,
    };

    constructor(private readonly spawner: SubagentSpawner) {}

    validate(input: unknown): ToolValidationResult {
        const result = validateInput(input);
        if (!result.ok) {
            return {
                ok: false,
                error: {
                    code: "INVALID_TOOL_INPUT",
                    message: result.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
                    issues: result.issues,
                },
            };
        }
        return { ok: true };
    }

    async execute(
        request: ToolExecutionRequest<SpawnSubagentInput>,
        control: ExecutionControl,
    ): Promise<ToolObservation> {
        try {
            if (!request.context) {
                return {
                    kind: "failure",
                    code: "SPAWN_SUBAGENT_FAILED",
                    message: "Execution context is required for spawn_subagent",
                    retryable: false,
                };
            }

            const result = await this.spawner.spawn(
                request.input,
                request.context,
                control,
            );

            if (result.status === "completed") {
                return {
                    kind: "success",
                    output: {
                        childGoalId: result.childGoalId,
                        status: "completed",
                        answer: result.answer ?? "",
                    } as unknown as JsonValue,
                    summary: result.answer ?? `Subagent ${result.childGoalId} completed`,
                };
            }

            return {
                kind: "failure",
                code: result.status === "cancelled" ? "SUBAGENT_CANCELLED" : "SUBAGENT_FAILED",
                message: result.reason ?? `Subagent ${result.childGoalId} finished with status ${result.status}`,
                retryable: false,
            };
        } catch (error) {
            return {
                kind: "failure",
                code: "SPAWN_SUBAGENT_FAILED",
                message: error instanceof Error ? error.message : String(error),
                retryable: false,
            };
        }
    }
}
