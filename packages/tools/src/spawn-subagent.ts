import type { JsonValue } from "../../contracts/src/index";
import { SPAWN_SUBAGENT_TOOL_ID } from "../../runtime/src/index";
import type {
    SpawnSubagentInput as RuntimeSpawnSubagentInput,
    SpawnSubagentOutput,
    SubagentSpawner,
} from "../../runtime/src/index";
import type { ExecutionControl } from "../../execution-control/src/index";
import type {
    BoundToolDefinition,
    Tool,
    ToolExecutionRequest,
    ToolObservation,
    ToolValidationResult,
} from "../../tool-core/src/index";
import { spawnSubagentInputBinding } from "./generated/spawn-subagent/binding";

export { SPAWN_SUBAGENT_TOOL_ID } from "../../runtime/src/index";
export type { SpawnSubagentOutput, SubagentSpawner } from "../../runtime/src/index";
/** Catalog 生成的 `spawn_subagent` 模型输入绑定。 */
export { spawnSubagentInputBinding };


/**
 * `spawn_subagent` 的生成输入边界类型。
 *
 * @remarks 字段语义由 Runtime 派发端口拥有；本类型作为 Tools 的生成契约根。
 *
 * @example
 * ```ts
 * const input: SpawnSubagentToolInput = { intent: "Run the focused test suite", title: "Verify tests" };
 * ```
 */
export interface SpawnSubagentToolInput extends RuntimeSpawnSubagentInput {}

/**
 * 启动子 Agent 任务的 Tool 实现。
 *
 * @remarks
 * 父 Goal 通过调用此 Tool 派生子 Goal。子 Goal 独立执行，
 * 并在达到终态（Completed / Failed / Cancelled）后返回结果；父 Run 取消时，Runtime
 * 先中断子 Run 并等待其终态，再释放事件流与会话句柄。
 *
 * @example
 * ```ts
 * const tool = new SpawnSubagentTool(spawner);
 * const observation = await tool.execute(request, control);
 * ```
 */
export class SpawnSubagentTool implements Tool<SpawnSubagentToolInput> {
    readonly replayPolicy = "manual" as const;

    readonly definition: BoundToolDefinition<SpawnSubagentToolInput> = {
        id: SPAWN_SUBAGENT_TOOL_ID,
        description: "Spawn a child autonomous subagent Goal to execute a delegated subtask.",
        isReadOnly: false,
        inputBinding: spawnSubagentInputBinding,
    };

    /** @param spawner - Runtime 拥有的子 Goal 派发端口。 */
    constructor(private readonly spawner: SubagentSpawner) {}

    /**
     * 校验生成契约并拒绝仅含空白字符的子任务意图。
     *
     * @param input - 尚未信任的模型工具输入。
     * @returns 输入有效时返回成功；否则返回可供模型纠错的稳定诊断。
     */
    validate(input: unknown): ToolValidationResult {
        const result = spawnSubagentInputBinding.read(input, "strip");
        if (!result.ok) {
            return {
                ok: false,
                error: {
                    code: "INVALID_TOOL_INPUT",
                    message: result.issues
                        .map((issue) => `${issue.path || "/"}: ${issue.code}`)
                        .join("; "),
                },
            };
        }
        if (result.data.intent.trim().length === 0) {
            return {
                ok: false,
                error: {
                    code: "INVALID_TOOL_INPUT",
                    message: "intent must contain non-whitespace characters",
                    issues: [{
                        code: "invalid_semantics",
                        path: ["intent"],
                        message: "intent must contain non-whitespace characters",
                    }],
                },
            };
        }
        return { ok: true };
    }

    /**
     * 派发子 Goal 并把终态映射为工具观察。
     *
     * @param request - 已绑定的输入与父 Run 执行上下文。
     * @param control - 父 Run 的取消控制，用于中断并结算子 Run。
     * @returns 子 Run 完成时返回成功观察；失败、取消或创建错误映射为失败观察。
     */
    async execute(
        request: ToolExecutionRequest<SpawnSubagentToolInput>,
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
