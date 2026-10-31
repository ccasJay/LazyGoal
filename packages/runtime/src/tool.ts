import type {
    Goal,
    ToolCallAction,
} from "./domain";
import {
    throwIfAborted,
} from "../../execution-control/src/index";
import type {
    BoundToolDefinition,
    ToolRegistration,
    ToolRegistry,
} from "../../tool-core/src/index";

/**
 * 注册由 Runner 调度的程序入口；该入口自身不执行任何业务工具。
 *
 * @example
 * ```ts
 * const registration = createProgramToolRegistration(definition);
 * ```
 */
export function createProgramToolRegistration<Input>(
    definition: BoundToolDefinition<Input>,
): ToolRegistration {
    return {
        kind: "program",
        definition: definition as BoundToolDefinition,
        replayPolicy: "manual",
        prepare(input, control) {
            throwIfAborted(control);
            const parsed = definition.inputBinding.read(input, "strip");
            throwIfAborted(control);
            if (!parsed.ok) {
                const first = parsed.issues[0];
                const location = first === undefined || first.path === "" ? "$" : first.path;
                return {
                    ok: false,
                    error: {
                        code: "INVALID_TOOL_INPUT",
                        message: `${definition.id} 输入 Contract 校验失败：${first?.code ?? "constraint"} at ${location}`,
                    },
                };
            }
            if (typeof (parsed.data as { code?: unknown }).code !== "string"
                || Buffer.byteLength((parsed.data as { code: string }).code) > 64 * 1024) {
                return {
                    ok: false,
                    error: {
                        code: "INVALID_TOOL_INPUT",
                        message: "execute_program requires code within 64 KiB",
                    },
                };
            }
            return {
                ok: true,
                input: parsed.data as { readonly code: string },
                ...(parsed.diagnostic === undefined ? {} : { inputDiagnostic: parsed.diagnostic }),
                async execute() {
                    throw new Error("PTC_PROGRAM_REQUIRES_RUNNER");
                },
            };
        },
    };
}

/**
 * Tool 授权策略评估所需的只读上下文。
 *
 * @example
 * ```ts
 * const context: ToolPolicyContext = { goal, action, tool: tool.definition };
 * ```
 */
export interface ToolPolicyContext {
    /** 当前被冻结 Profile 与执行状态的 Goal。 */
    readonly goal: Goal;
    /** Agent 当前请求的 Action。 */
    readonly action: ToolCallAction;
    /** Registry 解析出的 Tool 描述与输入绑定。 */
    readonly tool: BoundToolDefinition;
}

/**
 * 在 Tool 执行前决定自动放行还是等待用户批准的策略边界。
 *
 * @remarks
 * Policy 不执行 Tool、不推进 Run，也不持久化授权；瞬时授权由后续 Runner 与
 * Coordinator 协作层消费。
 *
 * @example
 * ```ts
 * const policy: ToolPolicy = {
 *   evaluate: ({ tool }) => tool.id === "read_file"
 *     ? "allow"
 *     : "require_approval",
 * };
 * ```
 */
export interface ToolPolicy {
    /**
     * @param context - Goal、Action 与 Tool 描述组成的只读授权上下文。
     * @returns `allow` 或 `require_approval`；不得执行 Tool 或修改 Goal。
     */
    evaluate(context: ToolPolicyContext): "allow" | "require_approval";
}

/**
 * 解析当前 Goal 实际可见的 Tool 描述。
 *
 * @remarks
 * 结果只包含冻结 Profile 白名单与 Registry 已注册 Tool 的交集。每个
 * `id` 和 `description` 都会被复制；带内部品牌且不可变的 Input Contract 与注册项
 * 共享引用。本函数不判断 Prompt 版本、准备或执行 Tool，也不修改 Goal。
 *
 * @param goal - 提供冻结 Profile Tool 白名单的完整 Goal。
 * @param registry - 当前 Runtime 已注册的 Tool 查找边界。
 * @returns 按 Profile `toolIds` 顺序排列的独立 ToolDefinition 副本。
 * @throws Registry 查找或 ToolDefinition 复制失败时原样传播异常。
 *
 * @example
 * ```ts
 * const definitions = resolveAuthorizedToolDefinitions(goal, registry);
 * ```
 */
export function resolveAuthorizedToolDefinitions(
    goal: Goal,
    registry: ToolRegistry,
): readonly BoundToolDefinition[] {
    const definitions: BoundToolDefinition[] = [];

    for (const toolId of goal.definition.profile.toolIds) {
        const registration = registry.get(toolId);

        if (registration !== undefined) {
            definitions.push(Object.freeze({
                id: registration.definition.id,
                description: registration.definition.description,
                ...(registration.definition.discoveryAliases === undefined
                    ? {}
                    : { discoveryAliases: Object.freeze([...registration.definition.discoveryAliases]) }),
                inputBinding: registration.definition.inputBinding,
                inputContract: registration.definition.inputContract,
                isReadOnly: registration.definition.isReadOnly,
            }));
        }
    }

    return definitions;
}
