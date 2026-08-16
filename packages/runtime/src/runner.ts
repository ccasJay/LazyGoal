import type {
    AgentDecision,
    AssistantMessage,
    ExecutionErrorCode,
    Goal,
    JsonValue,
    RunInput,
    RunExecutionOptions,
    RunRef,
    RunState,
    StepResult,
    ToolCallAction,
} from "./domain";
import type { GoalStore } from "./goal-store";
import type {
    LegacyStepExecutor,
    StepExecutionResult,
    StepExecutor,
} from "./step-executor";
import type {
    Tool,
    ToolDefinition,
    ToolObservation,
    ToolPolicy,
    ToolRegistry,
} from "./tool";
import { transition } from "./transition";

const EMPTY_TOOL_REGISTRY: ToolRegistry = {
    get: () => undefined,
};

const ALLOW_ALL_TOOL_POLICY: ToolPolicy = {
    evaluate: () => "allow",
};

class RunnerExecutionError extends Error {
    readonly code: ExecutionErrorCode;

    constructor(code: ExecutionErrorCode, message: string) {
        super(message.trim().length > 0 ? message : code);
        this.name = "RunnerExecutionError";
        this.code = code;
    }
}

type NormalizedExecution =
    | { readonly kind: "legacy"; readonly result: StepResult }
    | { readonly kind: "agent"; readonly decision: AgentDecision };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
    value: Record<string, unknown>,
    keys: readonly string[],
): boolean {
    const allowed = new Set(keys);
    return Object.keys(value).every((key) => allowed.has(key));
}

function isNonEmptyText(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isJsonValue(value: unknown): value is JsonValue {
    if (value === null) {
        return true;
    }

    if (typeof value === "string" || typeof value === "boolean") {
        return true;
    }

    if (typeof value === "number") {
        return Number.isFinite(value);
    }

    if (Array.isArray(value)) {
        return value.every((item) => isJsonValue(item));
    }

    if (!isRecord(value)) {
        return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return (
        (prototype === Object.prototype || prototype === null)
        && Object.values(value).every((item) => isJsonValue(item))
    );
}

function invalidAgentDecision(message: string): never {
    throw new RunnerExecutionError("INVALID_AGENT_DECISION", message);
}

function validateAgentDecision(value: unknown): AgentDecision {
    if (!isRecord(value) || !isNonEmptyText(value.kind)) {
        return invalidAgentDecision("AgentDecision 必须是带 kind 的对象");
    }

    if (!isNonEmptyText(value.checkpoint)) {
        return invalidAgentDecision("AgentDecision checkpoint 必须是非空文本");
    }

    if (value.kind === "tool_call") {
        if (!hasOnlyKeys(value, ["kind", "checkpoint", "action"])) {
            return invalidAgentDecision("tool_call 包含协议外字段");
        }

        const action = value.action;

        if (
            !isRecord(action)
            || !hasOnlyKeys(action, ["actionId", "toolId", "input"])
            || !isNonEmptyText(action.actionId)
            || !isNonEmptyText(action.toolId)
            || !isJsonValue(action.input)
        ) {
            return invalidAgentDecision("tool_call action 不符合严格协议");
        }

        return value as unknown as AgentDecision;
    }

    const terminalFields: Record<string, "summary" | "reason" | "error"> = {
        complete: "summary",
        wait: "reason",
        fail: "error",
    };
    const textField = terminalFields[value.kind];

    if (textField === undefined) {
        return invalidAgentDecision(`不支持的 AgentDecision kind: ${value.kind}`);
    }

    if (
        !hasOnlyKeys(value, ["kind", "checkpoint", textField])
        || !isNonEmptyText(value[textField])
    ) {
        return invalidAgentDecision(`${value.kind} 不符合严格协议`);
    }

    return value as unknown as AgentDecision;
}

function isLegacyExecutionResult(
    value: unknown,
): value is StepExecutionResult {
    return (
        isRecord(value)
        && hasOnlyKeys(value, ["result"])
        && "result" in value
    );
}

function normalizeExecution(
    execution: AgentDecision | StepExecutionResult,
): NormalizedExecution {
    if (isLegacyExecutionResult(execution)) {
        return { kind: "legacy", result: execution.result };
    }

    return {
        kind: "agent",
        decision: validateAgentDecision(execution),
    };
}

function isProtocolError(error: unknown): boolean {
    return isRecord(error) && error.code === "INVALID_LLM_RESPONSE";
}

function toStableExecutionError(error: unknown): RunnerExecutionError | undefined {
    if (error instanceof RunnerExecutionError) {
        return error;
    }

    if (isProtocolError(error)) {
        return new RunnerExecutionError(
            "INVALID_AGENT_DECISION",
            error instanceof Error ? error.message : "AgentDecision 协议无效",
        );
    }

    return undefined;
}

function toolDefinition(tool: Tool): ToolDefinition {
    return structuredClone(tool.definition);
}

function validateToolAction(
    goal: Goal,
    action: Extract<AgentDecision, { readonly kind: "tool_call" }>['action'],
    registry: ToolRegistry,
    policy: ToolPolicy,
    evaluatePolicy = true,
): { readonly tool: Tool; readonly policy: "allow" | "require_approval" } {
    if (!goal.definition.profile.toolIds.includes(action.toolId)) {
        throw new RunnerExecutionError(
            "TOOL_NOT_AUTHORIZED",
            `Tool "${action.toolId}" is not authorized by the frozen Profile`,
        );
    }

    let tool: Tool | undefined;

    try {
        tool = registry.get(action.toolId);
    } catch (error) {
        throw new RunnerExecutionError(
            "TOOL_EXECUTION_ERROR",
            error instanceof Error ? error.message : String(error),
        );
    }

    if (tool === undefined) {
        throw new RunnerExecutionError(
            "TOOL_NOT_FOUND",
            `Authorized Tool "${action.toolId}" is not registered`,
        );
    }

    let validation;

    try {
        validation = tool.validate(action.input);
    } catch (error) {
        throw new RunnerExecutionError(
            "TOOL_EXECUTION_ERROR",
            error instanceof Error ? error.message : String(error),
        );
    }

    if (!isRecord(validation) || (validation.ok !== true && validation.ok !== false)) {
        throw new RunnerExecutionError(
            "TOOL_EXECUTION_ERROR",
            "Tool validate returned an invalid result",
        );
    }

    if (validation.ok === false) {
        if (
            !isRecord(validation.error)
            || validation.error.code !== "INVALID_TOOL_INPUT"
            || !isNonEmptyText(validation.error.message)
        ) {
            throw new RunnerExecutionError(
                "TOOL_EXECUTION_ERROR",
                "Tool validate returned an invalid error",
            );
        }

        throw new RunnerExecutionError(
            "INVALID_TOOL_INPUT",
            validation.error.message,
        );
    }

    if (!evaluatePolicy) {
        return { tool, policy: "allow" };
    }

    let policyResult: "allow" | "require_approval";

    try {
        policyResult = policy.evaluate({
            goal,
            action,
            tool: tool.definition,
        });
    } catch (error) {
        throw new RunnerExecutionError(
            "TOOL_EXECUTION_ERROR",
            error instanceof Error ? error.message : String(error),
        );
    }

    if (policyResult !== "allow" && policyResult !== "require_approval") {
        throw new RunnerExecutionError(
            "TOOL_EXECUTION_ERROR",
            `Unsupported Tool policy result "${String(policyResult)}"`,
        );
    }

    return { tool, policy: policyResult };
}

function validateToolObservation(value: unknown): ToolObservation {
    if (!isRecord(value) || !isNonEmptyText(value.kind)) {
        throw new RunnerExecutionError(
            "TOOL_EXECUTION_ERROR",
            "Tool returned an invalid Observation",
        );
    }

    if (value.kind === "success") {
        if (
            !hasOnlyKeys(value, ["kind", "output", "summary"])
            || !isJsonValue(value.output)
            || !isNonEmptyText(value.summary)
        ) {
            throw new RunnerExecutionError(
                "TOOL_EXECUTION_ERROR",
                "Tool success Observation does not match the protocol",
            );
        }

        return value as unknown as ToolObservation;
    }

    if (value.kind === "failure") {
        if (
            !hasOnlyKeys(value, ["kind", "code", "message", "retryable"])
            || !isNonEmptyText(value.code)
            || !isNonEmptyText(value.message)
            || typeof value.retryable !== "boolean"
        ) {
            throw new RunnerExecutionError(
                "TOOL_EXECUTION_ERROR",
                "Tool failure Observation does not match the protocol",
            );
        }

        return value as unknown as ToolObservation;
    }

    throw new RunnerExecutionError(
        "TOOL_EXECUTION_ERROR",
        `Unsupported Tool Observation kind: ${value.kind}`,
    );
}

function validateActionLifecycle(
    goal: Goal,
    action: Extract<AgentDecision, { readonly kind: "tool_call" }>['action'],
): void {
    if (goal.state.run.pendingAction !== undefined) {
        throw new RunnerExecutionError(
            "INVALID_AGENT_DECISION",
            "Cannot request a new Action while another Action is pending",
        );
    }

    const lastStep = goal.state.run.lastStep;

    if (
        lastStep?.kind === "action"
        && lastStep.action.actionId === action.actionId
    ) {
        throw new RunnerExecutionError(
            "INVALID_AGENT_DECISION",
            `Action ID "${action.actionId}" repeats the latest completed Action`,
        );
    }
}

/** Runner 的公开结果；其中 state 是 Run 状态，不是模型原始输出。 */
export type RunnerResult =
    | { readonly ok: true; readonly state: RunState }
    | {
        readonly ok: false;
        readonly error: {
            readonly code: "RUN_NOT_FOUND" | "ACTION_NOT_AUTHORIZED";
            readonly message: string;
        };
    };

/**
 * 创建 {@link Runner} 所需的持久化与单步执行依赖。
 *
 * @remarks
 * Step 上限来自每个 Goal 冻结的 executionPolicy，不属于 Runner 实例配置。
 *
 * @example
 * ```ts
 * const runner = new Runner({ store, executor });
 * ```
 */
export interface RunnerDependencies {
    /** 完整 Goal 的最新快照存储。 */
    readonly store: GoalStore;
    /** 新 AgentDecision 或旧 StepResult 兼容实现的单步执行器。 */
    readonly executor: StepExecutor | LegacyStepExecutor;
    /**
     * 按 Tool ID 查找实现；省略时视为空 Registry，所有 Tool Action 都会
     * 以 `TOOL_NOT_FOUND` 拒绝。
     */
    readonly toolRegistry?: ToolRegistry;
    /**
     * Tool 执行前的策略边界；省略时使用允许策略。返回
     * `require_approval` 时 Runner 保存等待中的 Action，由 Coordinator 接收
     * 用户批准或拒绝。
     */
    readonly toolPolicy?: ToolPolicy;
}

/**
 * 从 GoalStore 恢复并推进一个 Run，直到 waiting 或终态。
 *
 * @remarks
 * Runner 是状态推进与持久化顺序的拥有者。启动、恢复和每个 Step 完成后，
 * 都会先保存最新完整 Goal，再继续下一步。正数 `maxSteps` 使用快照中的
 * 累计 `stepCount`；`0` 表示不按 Step 数终止。
 *
 * 当前 Runner 仍兼容旧 StepResult。新 AgentDecision 会先做运行时严格校验；
 * `tool_call` 按冻结 Profile、Registry、输入协议和 Policy 顺序校验，自动允许
 * 的 Action 会先保存 pendingAction，再调用 Tool，最后保存 Observation；需要
 * 批准的 Action 会保存为 `awaiting_approval` 并返回 waiting，不调用 Tool。收到
 * 匹配的瞬时 `authorizedActionId` 后，Runner 才会执行已批准的同一 Action。
 * 领域 failure 会继续下一轮；Tool 异常会保存 `outcome_unknown` execution_error。
 *
 * Executor 异常会转换为持久化的 `fail` 结果；Store 的读取或写入异常原样
 * 传播，写入失败后不会继续执行下一 Step。
 */
export class Runner {
    private readonly store: GoalStore;
    private readonly executor: StepExecutor | LegacyStepExecutor;
    private readonly toolRegistry: ToolRegistry;
    private readonly toolPolicy: ToolPolicy;

    /** @param dependencies - GoalStore、Executor 与可选 Tool 边界依赖。 */
    constructor(dependencies: RunnerDependencies) {
        this.store = dependencies.store;
        this.executor = dependencies.executor;
        this.toolRegistry = dependencies.toolRegistry ?? EMPTY_TOOL_REGISTRY;
        this.toolPolicy = dependencies.toolPolicy ?? ALLOW_ALL_TOOL_POLICY;
    }

    /**
     * 启动或继续一个已经保存的 Goal。
     *
     * @remarks
     * `created` 会先转换并保存为 `running`；`running` 会继续执行；waiting
     * 和终态直接返回且不产生副作用。非 executing Goal 同样直接返回，
     * Preparation 不会启动 Run 或消费 Step。Goal 不存在或 runId 不匹配时
     * 返回 `RUN_NOT_FOUND`。
     *
     * @param ref - 目标 Goal 与 Run 的关联键。
     * @param options - 可选的本次调用瞬时 Action 授权；只接受与已批准
     *   `pendingAction` 相同的 `actionId`，不会写入快照。
     * @returns Run 到达 waiting 或终态时的结果。
     * @throws GoalStore 的恢复或保存错误。
     */
    async run(
        ref: RunRef,
        options: RunExecutionOptions = {},
    ): Promise<RunnerResult> {
        const goal = await this.restore(ref);

        if (goal === undefined) {
            return this.runNotFound(ref);
        }

        if (goal.state.workflow.phase !== "executing") {
            return { ok: true, state: goal.state.run };
        }

        if (!this.hasMatchingTransientAuthorization(goal, options)) {
            return this.actionNotAuthorized(ref, options.authorizedActionId);
        }

        if (goal.state.run.status === "created") {
            const runningGoal = this.withRun(
                goal,
                this.applyTransition(goal.state.run, { kind: "start" }),
            );
            await this.store.save(runningGoal);
            return this.runLoop(runningGoal, options.authorizedActionId);
        }

        return this.runLoop(goal, options.authorizedActionId);
    }

    /**
     * {@link run} 的语义化别名，供 Scheduler 表达“运行到阻塞点”。
     *
     * @param ref - 目标 Goal 与 Run 的关联键。
     * @param options - 可选的本次调用瞬时 Action 授权。
     * @returns 与 {@link run} 相同的 waiting、终态或业务失败结果。
     * @throws GoalStore 的恢复或保存错误。
     */
    async runUntilBlocked(
        ref: RunRef,
        options?: RunExecutionOptions,
    ): Promise<RunnerResult> {
        return this.run(ref, options);
    }

    private async restore(ref: RunRef): Promise<Goal | undefined> {
        const goal = await this.store.restore(ref.goalId);

        if (
            goal === undefined
            || goal.id !== ref.goalId
            || goal.state.run.id !== ref.runId
        ) {
            return undefined;
        }

        return goal;
    }

    private runNotFound(ref: RunRef): RunnerResult {
        return {
            ok: false,
            error: {
                code: "RUN_NOT_FOUND",
                message: `Run "${ref.runId}" for Goal "${ref.goalId}" was not found`,
            },
        };
    }

    private actionNotAuthorized(
        ref: RunRef,
        actionId: string | undefined,
    ): RunnerResult {
        return {
            ok: false,
            error: {
                code: "ACTION_NOT_AUTHORIZED",
                message: actionId === undefined
                    ? `Run "${ref.runId}" requires a matching transient Action authorization`
                    : `Action "${actionId}" is not the approved pending Action for Run "${ref.runId}"`,
            },
        };
    }

    private hasMatchingTransientAuthorization(
        goal: Goal,
        options: RunExecutionOptions,
    ): boolean {
        const pendingAction = goal.state.run.pendingAction;

        if (pendingAction === undefined) {
            return options.authorizedActionId === undefined;
        }

        if (pendingAction.status !== "approved") {
            return options.authorizedActionId === undefined;
        }

        return options.authorizedActionId === pendingAction.action.actionId;
    }

    private getAuthorizedToolDefinitions(goal: Goal): readonly ToolDefinition[] {
        const definitions: ToolDefinition[] = [];

        for (const toolId of goal.definition.profile.toolIds) {
            let tool: Tool | undefined;

            try {
                tool = this.toolRegistry.get(toolId);
            } catch (error) {
                throw new RunnerExecutionError(
                    "TOOL_EXECUTION_ERROR",
                    error instanceof Error ? error.message : String(error),
                );
            }

            if (tool !== undefined) {
                try {
                    definitions.push(toolDefinition(tool));
                } catch (error) {
                    throw new RunnerExecutionError(
                        "TOOL_EXECUTION_ERROR",
                        error instanceof Error ? error.message : String(error),
                    );
                }
            }
        }

        return definitions;
    }

    private async stopWithExecutionError(
        goal: Goal,
        error: RunnerExecutionError,
    ): Promise<RunnerResult> {
        const failedRun = this.applyTransition(goal.state.run, {
            kind: "execution_error",
            code: error.code,
            message: error.message,
        });
        const failedGoal = this.withRun(goal, failedRun);

        await this.store.save(failedGoal);
        return { ok: true, state: failedRun };
    }

    private async executeToolAndObserve(
        goal: Goal,
        tool: Tool,
        action: ToolCallAction,
    ): Promise<
        | { readonly kind: "observed"; readonly goal: Goal }
        | { readonly kind: "stopped"; readonly result: RunnerResult }
    > {
        let observation: ToolObservation;

        try {
            const rawObservation = await tool.execute({
                actionId: action.actionId,
                input: action.input,
            });
            observation = validateToolObservation(rawObservation);
        } catch (error) {
            const toolError = error instanceof RunnerExecutionError
                ? error
                : new RunnerExecutionError(
                    "TOOL_EXECUTION_ERROR",
                    error instanceof Error ? error.message : String(error),
                );

            return {
                kind: "stopped",
                result: await this.stopWithExecutionError(goal, toolError),
            };
        }

        const observedRun = this.applyTransition(goal.state.run, {
            kind: "observe_action",
            actionId: action.actionId,
            observation,
        });
        const observedGoal = this.withRun(goal, observedRun);

        // If this save fails, the already-saved goal remains the recovery baseline.
        await this.store.save(observedGoal);
        return { kind: "observed", goal: observedGoal };
    }

    private async runLoop(
        initialGoal: Goal,
        authorizedActionId?: string,
    ): Promise<RunnerResult> {
        let goal = initialGoal;
        let transientAuthorization = authorizedActionId;

        while (goal.state.run.status === "running") {
            const pendingAction = goal.state.run.pendingAction;

            if (pendingAction?.status === "approved") {
                if (transientAuthorization !== pendingAction.action.actionId) {
                    return this.actionNotAuthorized(
                        { goalId: goal.id, runId: goal.state.run.id },
                        transientAuthorization,
                    );
                }

                let validated;

                try {
                    validated = validateToolAction(
                        goal,
                        pendingAction.action,
                        this.toolRegistry,
                        this.toolPolicy,
                        false,
                    );
                } catch (error) {
                    const stableError = toStableExecutionError(error)
                        ?? new RunnerExecutionError(
                            "TOOL_EXECUTION_ERROR",
                            error instanceof Error ? error.message : String(error),
                        );

                    return this.stopWithExecutionError(goal, stableError);
                }

                const outcome = await this.executeToolAndObserve(
                    goal,
                    validated.tool,
                    pendingAction.action,
                );
                transientAuthorization = undefined;

                if (outcome.kind === "stopped") {
                    return outcome.result;
                }

                goal = outcome.goal;
                continue;
            }

            const maxSteps = goal.definition.executionPolicy.maxSteps;

            if (maxSteps > 0 && goal.state.run.stepCount >= maxSteps) {
                const failedGoal = this.withRun(goal, {
                    ...goal.state.run,
                    status: "failed",
                    stopReason: { kind: "max_steps_exceeded" },
                });

                await this.store.save(failedGoal);
                return { ok: true, state: failedGoal.state.run };
            }

            let normalized: NormalizedExecution;

            try {
                const tools = this.getAuthorizedToolDefinitions(goal);
                const execution = await this.executor.execute(goal, tools);
                normalized = normalizeExecution(execution);
            } catch (error) {
                const stableError = toStableExecutionError(error);

                if (stableError !== undefined) {
                    return this.stopWithExecutionError(goal, stableError);
                }

                const nextRun = this.applyTransition(goal.state.run, {
                    kind: "step",
                    result: {
                        kind: "fail",
                        error: error instanceof Error ? error.message : String(error),
                    },
                });
                const nextGoal = this.withRun(goal, nextRun);

                await this.store.save(nextGoal);
                goal = nextGoal;
                continue;
            }

            if (
                normalized.kind === "agent"
                && normalized.decision.kind === "tool_call"
            ) {
                let validated;

                try {
                    validated = validateToolAction(
                        goal,
                        normalized.decision.action,
                        this.toolRegistry,
                        this.toolPolicy,
                    );
                } catch (error) {
                    const stableError = toStableExecutionError(error)
                        ?? new RunnerExecutionError(
                            "TOOL_EXECUTION_ERROR",
                            error instanceof Error ? error.message : String(error),
                        );

                    return this.stopWithExecutionError(goal, stableError);
                }

                try {
                    validateActionLifecycle(goal, normalized.decision.action);
                } catch (error) {
                    const stableError = toStableExecutionError(error)
                        ?? new RunnerExecutionError(
                            "INVALID_AGENT_DECISION",
                            error instanceof Error ? error.message : String(error),
                        );

                    return this.stopWithExecutionError(goal, stableError);
                }

                if (validated.policy !== "allow") {
                    const stagedRun = this.applyTransition(goal.state.run, {
                        kind: "stage_action",
                        checkpoint: normalized.decision.checkpoint,
                        action: normalized.decision.action,
                        status: "awaiting_approval",
                    });
                    const stagedGoal = this.withRun(goal, stagedRun);

                    await this.store.save(stagedGoal);
                    goal = stagedGoal;
                    continue;
                }

                const stagedRun = this.applyTransition(goal.state.run, {
                    kind: "stage_action",
                    checkpoint: normalized.decision.checkpoint,
                    action: normalized.decision.action,
                    status: "approved",
                });
                const stagedGoal = this.withRun(goal, stagedRun);

                // Durable intent must exist before the Tool can produce an effect.
                await this.store.save(stagedGoal);

                const outcome = await this.executeToolAndObserve(
                    stagedGoal,
                    validated.tool,
                    normalized.decision.action,
                );

                if (outcome.kind === "stopped") {
                    return outcome.result;
                }

                goal = outcome.goal;
                continue;
            }

            if (
                normalized.kind === "agent"
                && normalized.decision.kind !== "tool_call"
            ) {
                const nextRun = this.applyTransition(goal.state.run, {
                    kind: "decision",
                    decision: normalized.decision,
                });
                const transitionedGoal = this.withRun(goal, nextRun);
                const nextGoal = this.appendDecisionMessage(
                    transitionedGoal,
                    normalized.decision,
                );

                await this.store.save(nextGoal);
                goal = nextGoal;
                continue;
            }

            if (normalized.kind !== "legacy") {
                throw new Error("Runner received an unhandled execution result");
            }

            const nextRun = this.applyTransition(goal.state.run, {
                kind: "step",
                result: normalized.result,
            });
            const transitionedGoal = this.withRun(goal, nextRun);
            const nextGoal = this.appendResultMessage(
                transitionedGoal,
                normalized.result,
            );

            await this.store.save(nextGoal);
            goal = nextGoal;
        }

        return { ok: true, state: goal.state.run };
    }

    private withRun(goal: Goal, run: RunState): Goal {
        return {
            ...goal,
            state: {
                ...goal.state,
                run,
            },
        };
    }

    private appendDecisionMessage(
        goal: Goal,
        decision: Exclude<AgentDecision, { readonly kind: "tool_call" }>,
    ): Goal {
        const content = decision.kind === "complete"
            ? decision.summary
            : decision.kind === "wait"
                ? decision.reason
                : decision.error;

        return this.appendAssistantContent(goal, content);
    }

    private appendAssistantContent(
        goal: Goal,
        content: string,
    ): Goal {
        return {
            ...goal,
            state: {
                ...goal.state,
                messages: [
                    ...goal.state.messages,
                    {
                        role: "assistant",
                        assistant: { profileId: goal.definition.profile.id },
                        content,
                    },
                ],
            },
        };
    }

    private appendResultMessage(
        goal: Goal,
        result: StepResult,
    ): Goal {
        const message = this.toAssistantMessage(goal, result);

        if (message === undefined) {
            return goal;
        }

        return {
            ...goal,
            state: {
                ...goal.state,
                messages: [
                    ...goal.state.messages,
                    message,
                ],
            },
        };
    }

    private toAssistantMessage(
        goal: Goal,
        result: StepResult,
    ): AssistantMessage | undefined {
        if (result.kind === "continue") {
            return undefined;
        }

        const content = result.kind === "wait"
            ? result.reason
            : result.kind === "complete"
                ? result.summary
                : result.error;

        return {
            role: "assistant",
            assistant: { profileId: goal.definition.profile.id },
            content,
        };
    }

    private applyTransition(state: RunState, input: RunInput): RunState {
        const result = transition(state, input);

        if (!result.ok) {
            throw new Error(`Runner invariant violated: ${result.error.message}`);
        }

        return result.state;
    }
}
