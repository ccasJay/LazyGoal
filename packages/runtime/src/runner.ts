import type {
    AgentDecision,
    ExecutionErrorCode,
    Goal,
    JsonValue,
    RunInput,
    RunExecutionOptions,
    RunRef,
    RunState,
    ToolCallAction,
    MemoryProtocol,
    GoalProtocolValidator,
} from "./domain";
import {
    resolveMemoryProtocol,
    resolveModelContextProtocol,
} from "./domain";
import type { GoalStore } from "./goal-store";
import type { StepExecutor } from "./step-executor";
import type {
    Tool,
    ToolDefinition,
    ToolObservation,
    ToolPolicy,
    ToolRegistry,
} from "./tool";
import { resolveAuthorizedToolDefinitions } from "./tool";
import {
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "./execution-control";
import { transition } from "./transition";
import {
    TrajectoryAppendError,
    type DiagnosticTraceSink,
    type TrajectoryEventDraft,
    type TrajectoryStore,
    type TrajectorySink,
} from "./trajectory";
import {
    normalizeMemoryPatch,
    type NormalizedWorkingMemoryPatch,
    type WorkingMemoryLimitsInput,
} from "./working-memory-core";
import { WorkingMemorySession } from "./working-memory-session";
import {
    TrajectoryCheckpointCommitter,
    type AcceptedMemoryPatchInput,
    type TrajectoryCheckpointCommitter as TrajectoryCheckpointCommitterPort,
} from "./trajectory-checkpoint-committer";

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

type NormalizedExecution = { readonly decision: AgentDecision };

/** Executor 在返回 AgentDecision 前抛出非协议异常时使用的稳定 checkpoint。 */
const EXECUTOR_FAILURE_CHECKPOINT = "Executor failed before returning an AgentDecision.";

let executionUnitCounter = 0;

function createExecutionUnitId(): string {
    executionUnitCounter += 1;
    return `execution-unit-${Date.now().toString(36)}-${executionUnitCounter.toString(36)}`;
}

function resolveExecutionControl(
    options: RunExecutionOptions,
    control?: ExecutionControl,
): ExecutionControl | undefined {
    if (control?.signal !== undefined) {
        return control;
    }

    if (options.signal !== undefined) {
        return options.authorizedActionId === undefined
            ? options
            : { signal: options.signal };
    }

    return control;
}

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

function validateAgentDecision(
    value: unknown,
    memoryProtocol: MemoryProtocol,
): AgentDecision {
    if (!isRecord(value) || !isNonEmptyText(value.kind)) {
        return invalidAgentDecision("AgentDecision 必须是带 kind 的对象");
    }

    if (memoryProtocol.kind === "structured") {
        const memoryPatch = value.memoryPatch;
        if (
            memoryPatch !== undefined
            && (
                !isRecord(memoryPatch)
                || !hasOnlyKeys(memoryPatch, ["protocolVersion", "operations"])
                || memoryPatch.protocolVersion !== 1
                || !Array.isArray(memoryPatch.operations)
            )
        ) {
            return invalidAgentDecision("structured memoryPatch 不符合基础协议");
        }

        if (value.kind === "tool_call") {
            if (!hasOnlyKeys(value, ["kind", "action", "memoryPatch"])) {
                return invalidAgentDecision("structured tool_call 包含协议外字段");
            }

            const action = value.action;

            if (
                !isRecord(action)
                || !hasOnlyKeys(action, ["actionId", "toolId", "input"])
                || !isNonEmptyText(action.actionId)
                || !isNonEmptyText(action.toolId)
                || !isJsonValue(action.input)
            ) {
                return invalidAgentDecision("structured tool_call action 不符合严格协议");
            }

            return value as unknown as AgentDecision;
        }

        const structuredTextFields: Record<string, "summary" | "reason" | "error"> = {
            complete: "summary",
            wait: "reason",
            fail: "error",
        };
        const textField = structuredTextFields[value.kind];

        if (textField === undefined) {
            return invalidAgentDecision(`不支持的 AgentDecision kind: ${value.kind}`);
        }

        const allowed = ["kind", textField, "memoryPatch"];
        if (value.kind === "complete") {
            allowed.push("completionEvidence");
            if (!Array.isArray(value.completionEvidence)) {
                return invalidAgentDecision("structured complete 必须包含 completionEvidence");
            }
        }

        if (
            !hasOnlyKeys(value, allowed)
            || !isNonEmptyText(value[textField])
        ) {
            return invalidAgentDecision(`structured ${value.kind} 不符合严格协议`);
        }

        return value as unknown as AgentDecision;
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

function validateToolAction(
    goal: Goal,
    action: Extract<AgentDecision, { readonly kind: "tool_call" }>['action'],
    registry: ToolRegistry,
    policy: ToolPolicy,
    evaluatePolicy = true,
    control?: ExecutionControl,
): { readonly tool: Tool; readonly policy: "allow" | "require_approval" } {
    throwIfAborted(control);

    if (!goal.definition.profile.toolIds.includes(action.toolId)) {
        throw new RunnerExecutionError(
            "TOOL_NOT_AUTHORIZED",
            `Tool "${action.toolId}" is not authorized by the frozen Profile`,
        );
    }

    let tool: Tool | undefined;

    try {
        tool = registry.get(action.toolId);
        throwIfAborted(control);
    } catch (error) {
        if (isExecutionAbortedError(error)) {
            throw error;
        }

        throwIfAborted(control);

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
        throwIfAborted(control);
    } catch (error) {
        if (isExecutionAbortedError(error)) {
            throw error;
        }

        throwIfAborted(control);

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
        throwIfAborted(control);
    } catch (error) {
        if (isExecutionAbortedError(error)) {
            throw error;
        }

        throwIfAborted(control);

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
    /** 返回 AgentDecision 的单步执行器。 */
    readonly executor: StepExecutor;
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
    /** 可选 Domain Event 追加边界；省略时保留旧调用方的 no-op 行为。 */
    readonly trajectorySink?: TrajectorySink;
    /** 可选诊断记录边界；诊断故障不得改变 Snapshot 或 Domain Event 语义。 */
    readonly traceSink?: DiagnosticTraceSink;
    /** structured@1 Goal 的只读/追加 Trajectory 读取端口。 */
    readonly trajectoryStore?: TrajectoryStore;
    /** structured@1 Patch 接受时使用的 Working Memory 限制。 */
    readonly workingMemoryLimits?: WorkingMemoryLimitsInput;
    /**
     * 可选 Prompt/Memory 协议校验器；Composition Root 应为新 Goal 注入，
     * 旧的直接 Runtime 调用方可省略以保持 legacy 兼容。
     */
    readonly protocolValidator?: GoalProtocolValidator;
    /** 可选共享提交器；省略时由 Runner 按当前依赖创建。 */
    readonly checkpointCommitter?: TrajectoryCheckpointCommitterPort;
}

/**
 * 从 GoalStore 恢复并推进一个 Run，直到 waiting 或终态。
 *
 * @remarks
 * Runner 是状态推进与持久化顺序的拥有者。启动、恢复和每个 Step 完成后，
 * 都会先保存最新完整 Goal，再继续下一步。正数 `maxSteps` 使用快照中的
 * 累计 `stepCount`；`0` 表示不按 Step 数终止。
 *
 * 当前 Runner 只接受返回 AgentDecision 的 StepExecutor，返回值会先做运行时
 * 严格校验；`tool_call` 按冻结 Profile、Registry、输入协议和 Policy 顺序校验，自动允许
 * 的 Action 会先保存 pendingAction，再调用 Tool，最后保存 Observation；需要
 * 批准的 Action 会保存为 `awaiting_approval` 并返回 waiting，不调用 Tool。收到
 * 匹配的瞬时 `authorizedActionId` 后，Runner 才会执行已批准的同一 Action。
 * 进程恢复时，`safe` Tool 会沿用原 `actionId` 自动重放；`manual` Tool 会转为
 * `outcome_unknown` waiting，等待 Coordinator 再次批准或拒绝。领域 failure 会
 * 继续下一轮；Tool 异常会保存 `outcome_unknown` execution_error。
 *
 * Executor 抛出的非协议异常会规范化为当前 `fail` Decision 并持久化：沿用
 * 已有 checkpoint，不存在时使用稳定值；Store 的读取或写入异常原样传播，
 * 写入失败后不会继续执行下一 Step。
 */
export class Runner {
    private readonly store: GoalStore;
    private readonly executor: StepExecutor;
    private readonly toolRegistry: ToolRegistry;
    private readonly toolPolicy: ToolPolicy;
    private readonly checkpointCommitter: TrajectoryCheckpointCommitterPort;
    private readonly trajectoryStore: TrajectoryStore | undefined;
    private readonly workingMemoryLimits: WorkingMemoryLimitsInput | undefined;
    private readonly protocolValidator: GoalProtocolValidator | undefined;

    /** @param dependencies - GoalStore、Executor 与可选 Tool 边界依赖。 */
    constructor(dependencies: RunnerDependencies) {
        this.store = dependencies.store;
        this.executor = dependencies.executor;
        this.toolRegistry = dependencies.toolRegistry ?? EMPTY_TOOL_REGISTRY;
        this.toolPolicy = dependencies.toolPolicy ?? ALLOW_ALL_TOOL_POLICY;
        this.trajectoryStore = dependencies.trajectoryStore;
        this.workingMemoryLimits = dependencies.workingMemoryLimits;
        this.protocolValidator = dependencies.protocolValidator;
        const trajectorySink = dependencies.trajectorySink ?? dependencies.trajectoryStore;
        this.checkpointCommitter = dependencies.checkpointCommitter
            ?? new TrajectoryCheckpointCommitter({
                store: dependencies.store,
                ...(trajectorySink === undefined
                    ? {}
                    : { trajectorySink }),
                ...(dependencies.traceSink === undefined
                    ? {}
                    : { traceSink: dependencies.traceSink }),
            });
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
     * @param options - 可选的本次调用瞬时 Action 授权；有授权时只接受与已批准
     *   `pendingAction` 相同的 `actionId`，不会写入快照；无授权恢复已批准 Action
     *   时按 Tool 的 `replayPolicy` 分流。
     * @param control - 当前 Run 推进调用共享的中止控制。
     * @returns Run 到达 waiting 或终态时的结果。
     * @throws GoalStore 的恢复或保存错误；中止时抛出 `ExecutionAbortedError`。
     */
    async run(
        ref: RunRef,
        options: RunExecutionOptions = {},
        control?: ExecutionControl,
    ): Promise<RunnerResult> {
        const effectiveControl = resolveExecutionControl(options, control);
        throwIfAborted(effectiveControl);
        const goal = await this.restore(ref, effectiveControl);
        throwIfAborted(effectiveControl);

        if (goal === undefined) {
            return this.runNotFound(ref);
        }

        this.validateGoalProtocol(goal);

        if (goal.state.workflow.phase !== "executing") {
            return { ok: true, state: goal.state.run };
        }

        if (
            goal.state.run.status === "running"
            && goal.state.run.pendingAction?.status === "approved"
            && options.authorizedActionId === undefined
        ) {
            return this.recoverPendingAction(goal, effectiveControl);
        }

        if (!this.hasMatchingTransientAuthorization(goal, options)) {
            return this.actionNotAuthorized(ref, options.authorizedActionId);
        }

        if (goal.state.run.status === "created") {
            throwIfAborted(effectiveControl);
            await this.appendTrajectory({
                goalId: goal.id,
                runId: goal.state.run.id,
                phase: "executing",
                eventType: "run_started",
                payload: { type: "run_started" },
            }, effectiveControl);
            const runningGoal = this.withRun(
                goal,
                this.applyTransition(goal.state.run, { kind: "start" }),
            );
            const checkpoint = await this.saveCheckpoint(runningGoal, effectiveControl);
            return this.runLoop(
                checkpoint,
                options.authorizedActionId,
                effectiveControl,
            );
        }

        return this.runLoop(goal, options.authorizedActionId, effectiveControl);
    }

    /**
     * {@link run} 的语义化别名，供 Scheduler 表达“运行到阻塞点”。
     *
     * @param ref - 目标 Goal 与 Run 的关联键。
     * @param options - 可选的本次调用瞬时 Action 授权。
     * @param control - 当前 Run 推进调用共享的中止控制。
     * @returns 与 {@link run} 相同的 waiting、终态或业务失败结果。
     * @throws GoalStore 的恢复或保存错误；中止时抛出 `ExecutionAbortedError`。
     */
    async runUntilBlocked(
        ref: RunRef,
        options?: RunExecutionOptions,
        control?: ExecutionControl,
    ): Promise<RunnerResult> {
        return this.run(ref, options, control);
    }

    private async restore(
        ref: RunRef,
        control?: ExecutionControl,
    ): Promise<Goal | undefined> {
        throwIfAborted(control);
        const goal = await this.store.restore(ref.goalId);
        throwIfAborted(control);

        if (
            goal === undefined
            || goal.id !== ref.goalId
            || goal.state.run.id !== ref.runId
        ) {
            return undefined;
        }

        return goal;
    }

    private validateGoalProtocol(goal: Goal): void {
        if (this.protocolValidator === undefined) return;

        this.protocolValidator.validate({
            promptBundleVersion: goal.definition.promptBundleVersion,
            memoryProtocol: resolveMemoryProtocol(goal.definition),
            modelContextProtocol: resolveModelContextProtocol(goal.definition),
        });
    }

    private async saveCheckpoint(
        goal: Goal,
        control?: ExecutionControl,
    ): Promise<Goal> {
        return this.checkpointCommitter.saveCheckpoint(goal, control);
    }

    private async appendTrajectory(
        draft: TrajectoryEventDraft,
        control?: ExecutionControl,
        countAsFact = true,
    ): Promise<void> {
        await this.checkpointCommitter.append(draft, control, countAsFact);
    }

    private async openWorkingMemorySession(
        goal: Goal,
        control?: ExecutionControl,
    ): Promise<WorkingMemorySession | undefined> {
        throwIfAborted(control);
        const protocol = resolveMemoryProtocol(goal.definition);
        if (protocol.kind !== "structured") return undefined;

        const session = await WorkingMemorySession.restore(goal, {
            ...(this.trajectoryStore === undefined
                ? {}
                : { trajectoryStore: this.trajectoryStore }),
            ...(this.workingMemoryLimits === undefined
                ? {}
                : { limits: this.workingMemoryLimits }),
        });
        throwIfAborted(control);
        return session;
    }

    private normalizeDecisionPatch(
        goal: Goal,
        decision: AgentDecision,
        session: WorkingMemorySession | undefined,
        factCount: number,
    ): AcceptedMemoryPatchInput | undefined {
        const protocol = resolveMemoryProtocol(goal.definition);
        const memoryPatch = "memoryPatch" in decision
            ? decision.memoryPatch
            : undefined;

        if (protocol.kind !== "structured") {
            if (memoryPatch !== undefined) {
                throw new RunnerExecutionError(
                    "INVALID_MEMORY_PATCH",
                    "checkpoint protocol cannot accept structured Memory Patch",
                );
            }
            return undefined;
        }

        if (session === undefined) {
            throw new RunnerExecutionError(
                "INVALID_MEMORY_PATCH",
                "structured Memory Session is missing",
            );
        }
        if (memoryPatch === undefined) return undefined;

        const workingMemory = session.workingMemory;
        try {
            const validationSession: WorkingMemorySession = session;
            validationSession.validatePatch(memoryPatch);
            const normalized: NormalizedWorkingMemoryPatch = normalizeMemoryPatch(
                memoryPatch,
                {
                    phase: "executing",
                    originSequence: Math.max(
                        1,
                        (goal.state.run.committedThroughSequence ?? 0) + factCount + 1,
                    ),
                    workingMemory,
                    ...(this.workingMemoryLimits === undefined
                        ? {}
                        : { limits: this.workingMemoryLimits }),
                },
            );
            if (normalized.operations.length === 0) return undefined;
            return {
                phase: "executing",
                producers: ["model"],
                operations: normalized.operations,
            };
        } catch (error) {
            if (error instanceof RunnerExecutionError) throw error;
            throw new RunnerExecutionError(
                "INVALID_MEMORY_PATCH",
                error instanceof Error ? error.message : String(error),
            );
        }
    }

    private validateCompletionEvidence(
        goal: Goal,
        decision: AgentDecision,
        session: WorkingMemorySession | undefined,
    ): void {
        if (decision.kind !== "complete") return;
        if (resolveMemoryProtocol(goal.definition).kind !== "structured") return;

        if (session === undefined) {
            throw new RunnerExecutionError(
                "INVALID_AGENT_DECISION",
                "structured complete requires a Working Memory Session",
            );
        }

        const workflow = goal.state.workflow;
        if (workflow.phase !== "executing") {
            throw new RunnerExecutionError(
                "INVALID_AGENT_DECISION",
                "structured complete requires an executing Goal Task",
            );
        }

        const task = workflow.task;
        if (task === undefined) {
            throw new RunnerExecutionError(
                "INVALID_AGENT_DECISION",
                "structured complete requires an approved Goal Task",
            );
        }

        if (!("completionEvidence" in decision)) {
            throw new RunnerExecutionError(
                "INVALID_AGENT_DECISION",
                "structured complete must include completionEvidence",
            );
        }

        const evidence = decision.completionEvidence;
        if (!Array.isArray(evidence) || evidence.length !== task.completionCriteria.length) {
            throw new RunnerExecutionError(
                "INVALID_AGENT_DECISION",
                "completionEvidence must cover every completion criterion exactly once",
            );
        }

        const seen = new Set<number>();
        for (const item of evidence as readonly unknown[]) {
            const criterionIndexValue = isRecord(item)
                ? item.criterionIndex
                : undefined;
            if (
                !isRecord(item)
                || !hasOnlyKeys(item, ["criterionIndex", "evidenceSequences"])
                || typeof criterionIndexValue !== "number"
                || !Number.isSafeInteger(criterionIndexValue)
                || criterionIndexValue < 0
                || criterionIndexValue >= task.completionCriteria.length
                || !Array.isArray(item.evidenceSequences)
            ) {
                throw new RunnerExecutionError(
                    "INVALID_AGENT_DECISION",
                    "completionEvidence item is invalid",
                );
            }

            const criterionIndex = criterionIndexValue;
            if (seen.has(criterionIndex)) {
                throw new RunnerExecutionError(
                    "INVALID_AGENT_DECISION",
                    "completionEvidence contains duplicate criterionIndex",
                );
            }
            seen.add(criterionIndex);

            try {
                session.validateEvidence(item.evidenceSequences as readonly number[]);
            } catch (error) {
                throw new RunnerExecutionError(
                    "INVALID_AGENT_DECISION",
                    error instanceof Error ? error.message : String(error),
                );
            }
        }

        for (let index = 0; index < task.completionCriteria.length; index += 1) {
            if (!seen.has(index)) {
                throw new RunnerExecutionError(
                    "INVALID_AGENT_DECISION",
                    "completionEvidence is missing a criterion",
                );
            }
        }
    }

    private async commitDecision(
        goal: Goal,
        facts: readonly TrajectoryEventDraft[],
        acceptedPatch: AcceptedMemoryPatchInput | undefined,
        control?: ExecutionControl,
    ): Promise<Goal> {
        const result = await this.checkpointCommitter.commit(goal, {
            facts,
            ...(acceptedPatch === undefined ? {} : { acceptedPatch }),
            ...(control === undefined ? {} : { control }),
        });
        return result.goal;
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

    private async recoverPendingAction(
        goal: Goal,
        control?: ExecutionControl,
    ): Promise<RunnerResult> {
        throwIfAborted(control);
        const pendingAction = goal.state.run.pendingAction;

        if (pendingAction === undefined || pendingAction.status !== "approved") {
            return { ok: true, state: goal.state.run };
        }

        let validated;

        try {
            validated = validateToolAction(
                goal,
                pendingAction.action,
                this.toolRegistry,
                this.toolPolicy,
                false,
                control,
            );
        } catch (error) {
            if (isExecutionAbortedError(error)) {
                throw error;
            }

            throwIfAborted(control);

            const stableError = toStableExecutionError(error)
                ?? new RunnerExecutionError(
                    "TOOL_EXECUTION_ERROR",
                    error instanceof Error ? error.message : String(error),
                );

            return this.stopWithExecutionError(goal, stableError, control);
        }

        if (validated.tool.replayPolicy === "safe") {
            return this.runLoop(goal, pendingAction.action.actionId, control);
        }

        throwIfAborted(control);
        await this.appendTrajectory({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            actionId: pendingAction.action.actionId,
            eventType: "action_recovered",
            payload: {
                type: "action_recovered",
                actionId: pendingAction.action.actionId,
                replayPolicy: validated.tool.replayPolicy,
            },
        }, control);
        const recoveredRun = this.applyTransition(goal.state.run, {
            kind: "recover_action",
            actionId: pendingAction.action.actionId,
        });
        const recoveredGoal = this.withRun(goal, recoveredRun);

        const checkpoint = await this.saveCheckpoint(recoveredGoal, control);
        return { ok: true, state: checkpoint.state.run };
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

    private getAuthorizedToolDefinitions(
        goal: Goal,
        control?: ExecutionControl,
    ): readonly ToolDefinition[] {
        try {
            throwIfAborted(control);
            const definitions = resolveAuthorizedToolDefinitions(
                goal,
                this.toolRegistry,
            );
            throwIfAborted(control);
            return definitions;
        } catch (error) {
            if (isExecutionAbortedError(error)) {
                throw error;
            }
            throwIfAborted(control);
            throw new RunnerExecutionError(
                "TOOL_EXECUTION_ERROR",
                error instanceof Error ? error.message : String(error),
            );
        }
    }

    private async stopWithExecutionError(
        goal: Goal,
        error: RunnerExecutionError,
        control?: ExecutionControl,
    ): Promise<RunnerResult> {
        throwIfAborted(control);
        await this.appendTrajectory({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: goal.state.workflow.phase,
            ...(goal.state.run.pendingAction === undefined
                ? {}
                : { actionId: goal.state.run.pendingAction.action.actionId }),
            eventType: "execution_error",
            payload: {
                type: "execution_error",
                code: error.code,
                message: error.message,
                ...(goal.state.run.pendingAction === undefined
                    ? {}
                    : { actionId: goal.state.run.pendingAction.action.actionId }),
            },
        }, control);
        const failedRun = this.applyTransition(goal.state.run, {
            kind: "execution_error",
            code: error.code,
            message: error.message,
        });
        const failedGoal = this.withRun(goal, failedRun);

        const checkpoint = await this.saveCheckpoint(failedGoal, control);
        return { ok: true, state: checkpoint.state.run };
    }

    private async executeToolAndObserve(
        goal: Goal,
        tool: Tool,
        action: ToolCallAction,
        executionUnitId: string,
        control?: ExecutionControl,
    ): Promise<
        | { readonly kind: "observed"; readonly goal: Goal }
        | { readonly kind: "stopped"; readonly result: RunnerResult }
    > {
        let observation: ToolObservation;

        try {
            throwIfAborted(control);
            await this.appendTrajectory({
                goalId: goal.id,
                runId: goal.state.run.id,
                phase: "executing",
                executionUnitId,
                actionId: action.actionId,
                eventType: "tool_started",
                payload: {
                    type: "tool_started",
                    actionId: action.actionId,
                    toolId: action.toolId,
                    input: action.input,
                },
            }, control);
            const rawObservation = await tool.execute({
                actionId: action.actionId,
                input: action.input,
            }, control);
            throwIfAborted(control);
            observation = validateToolObservation(rawObservation);
        } catch (error) {
            if (isExecutionAbortedError(error)) {
                throw error;
            }
            if (error instanceof TrajectoryAppendError) {
                throw error;
            }

            throwIfAborted(control);

            const toolError = error instanceof RunnerExecutionError
                ? error
                : new RunnerExecutionError(
                    "TOOL_EXECUTION_ERROR",
                    error instanceof Error ? error.message : String(error),
                );

            return {
                kind: "stopped",
                result: await this.stopWithExecutionError(goal, toolError, control),
            };
        }

        throwIfAborted(control);
        await this.appendTrajectory({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId,
            actionId: action.actionId,
            eventType: "tool_finished",
            payload: {
                type: "tool_finished",
                actionId: action.actionId,
                toolId: action.toolId,
                observation,
            },
        }, control);
        await this.appendTrajectory({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId,
            actionId: action.actionId,
            eventType: "observation_recorded",
            payload: {
                type: "observation_recorded",
                actionId: action.actionId,
                observation,
            },
        }, control);
        const observedRun = this.applyTransition(goal.state.run, {
            kind: "observe_action",
            actionId: action.actionId,
            observation,
        });
        const observedGoal = this.withRun(goal, observedRun);

        // If this save fails, the already-saved goal remains the recovery baseline.
        const checkpoint = await this.saveCheckpoint(observedGoal, control);
        return { kind: "observed", goal: checkpoint };
    }

    private async runLoop(
        initialGoal: Goal,
        authorizedActionId?: string,
        control?: ExecutionControl,
    ): Promise<RunnerResult> {
        let goal = initialGoal;
        let transientAuthorization = authorizedActionId;

        while (goal.state.run.status === "running") {
            throwIfAborted(control);
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
                        control,
                    );
                } catch (error) {
                    if (isExecutionAbortedError(error)) {
                        throw error;
                    }

                    throwIfAborted(control);

                    const stableError = toStableExecutionError(error)
                        ?? new RunnerExecutionError(
                            "TOOL_EXECUTION_ERROR",
                            error instanceof Error ? error.message : String(error),
                        );

                    return this.stopWithExecutionError(goal, stableError, control);
                }

                const outcome = await this.executeToolAndObserve(
                    goal,
                    validated.tool,
                    pendingAction.action,
                    createExecutionUnitId(),
                    control,
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
                throwIfAborted(control);
                const failedGoal = this.withRun(goal, {
                    ...goal.state.run,
                    status: "failed",
                    stopReason: { kind: "max_steps_exceeded" },
                });
                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    eventType: "run_failed",
                    payload: {
                        type: "run_failed",
                        code: "MAX_STEPS_EXCEEDED",
                        message: "The configured maximum step count was exceeded",
                    },
                }, control);
                const checkpoint = await this.saveCheckpoint(failedGoal, control);
                return { ok: true, state: checkpoint.state.run };
            }

            const executionUnitId = createExecutionUnitId();
            const session = await this.openWorkingMemorySession(goal, control);

            try {
                let normalized: NormalizedExecution;
                try {
                    throwIfAborted(control);
                    const tools = this.getAuthorizedToolDefinitions(goal, control);
                    const execution = await this.executor.execute({
                        goal,
                        authorizedTools: tools,
                        ...(session === undefined
                            ? {}
                            : { workingMemory: session.workingMemory }),
                        ...(control === undefined ? {} : { control }),
                    });
                    throwIfAborted(control);
                    normalized = {
                        decision: validateAgentDecision(
                            execution,
                            resolveMemoryProtocol(goal.definition),
                        ),
                    };
                    this.validateCompletionEvidence(goal, normalized.decision, session);
                } catch (error) {
                    if (isExecutionAbortedError(error)) {
                        throw error;
                    }

                    throwIfAborted(control);

                    const stableError = toStableExecutionError(error);
                    if (stableError !== undefined) {
                        return this.stopWithExecutionError(goal, stableError, control);
                    }

                    // 非协议 Executor 异常规范化为当前 fail Decision：沿用已有
                    // checkpoint，不存在时使用稳定值；错误文本保持用户可见内容。
                    const memoryProtocol = resolveMemoryProtocol(goal.definition);
                    const decision: AgentDecision = memoryProtocol.kind === "structured"
                        ? {
                            kind: "fail",
                            error: error instanceof Error
                                ? error.message
                                : String(error),
                        }
                        : {
                            kind: "fail",
                            checkpoint: goal.state.run.checkpoint
                                ?? EXECUTOR_FAILURE_CHECKPOINT,
                            error: error instanceof Error
                                ? error.message
                                : String(error),
                        };
                    await this.appendTrajectory({
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "execution_error",
                        payload: {
                            type: "execution_error",
                            code: "EXECUTOR_FAILURE",
                            message: error instanceof Error ? error.message : String(error),
                        },
                    }, control);
                    const nextRun = this.applyTransition(goal.state.run, {
                        kind: "decision",
                        decision,
                    });
                    const nextGoal = this.appendDecisionMessage(
                        this.withRun(goal, nextRun),
                        decision,
                    );

                    goal = await this.saveCheckpoint(nextGoal, control);
                    continue;
                }

                let acceptedPatch: AcceptedMemoryPatchInput | undefined;
                try {
                    acceptedPatch = this.normalizeDecisionPatch(
                        goal,
                        normalized.decision,
                        session,
                        2,
                    );
                } catch (error) {
                    if (isExecutionAbortedError(error)) {
                        throw error;
                    }

                    throwIfAborted(control);
                    const stableError = toStableExecutionError(error)
                        ?? new RunnerExecutionError(
                            "INVALID_MEMORY_PATCH",
                            error instanceof Error ? error.message : String(error),
                        );
                    return this.stopWithExecutionError(goal, stableError, control);
                }

                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    executionUnitId,
                    eventType: "decision_received",
                    payload: { type: "decision_received", decision: normalized.decision },
                }, control);

                if (normalized.decision.kind === "tool_call") {
                    let validated;

                    try {
                        validated = validateToolAction(
                            goal,
                            normalized.decision.action,
                            this.toolRegistry,
                            this.toolPolicy,
                            true,
                            control,
                        );
                    } catch (error) {
                        if (isExecutionAbortedError(error)) {
                            throw error;
                        }

                        throwIfAborted(control);

                        const stableError = toStableExecutionError(error)
                            ?? new RunnerExecutionError(
                                "TOOL_EXECUTION_ERROR",
                                error instanceof Error ? error.message : String(error),
                            );

                        return this.stopWithExecutionError(goal, stableError, control);
                    }

                    try {
                        validateActionLifecycle(goal, normalized.decision.action);
                    } catch (error) {
                        if (isExecutionAbortedError(error)) {
                            throw error;
                        }

                        throwIfAborted(control);

                        const stableError = toStableExecutionError(error)
                            ?? new RunnerExecutionError(
                                "INVALID_AGENT_DECISION",
                                error instanceof Error ? error.message : String(error),
                            );

                        return this.stopWithExecutionError(goal, stableError, control);
                    }

                    if (validated.policy !== "allow") {
                        throwIfAborted(control);
                        const stagedRun = this.applyTransition(goal.state.run, {
                            kind: "stage_action",
                            ...(
                                "checkpoint" in normalized.decision
                                    ? { checkpoint: normalized.decision.checkpoint }
                                    : {}
                            ),
                            action: normalized.decision.action,
                            status: "awaiting_approval",
                        });
                        const stagedGoal = this.withRun(goal, stagedRun);

                        goal = await this.commitDecision(
                            stagedGoal,
                            [{
                                goalId: goal.id,
                                runId: goal.state.run.id,
                                phase: "executing",
                                executionUnitId,
                                actionId: normalized.decision.action.actionId,
                                eventType: "action_staged",
                                payload: {
                                    type: "action_staged",
                                    action: normalized.decision.action,
                                    approvalStatus: "awaiting_approval",
                                },
                            }],
                            acceptedPatch,
                            control,
                        );
                        continue;
                    }

                    throwIfAborted(control);
                    const stagedRun = this.applyTransition(goal.state.run, {
                        kind: "stage_action",
                        ...(
                            "checkpoint" in normalized.decision
                                ? { checkpoint: normalized.decision.checkpoint }
                                : {}
                        ),
                        action: normalized.decision.action,
                        status: "approved",
                    });
                    const stagedGoal = this.withRun(goal, stagedRun);

                    // Durable intent must exist before the Tool can produce an effect.
                    const stagedCheckpoint = await this.commitDecision(
                        stagedGoal,
                        [{
                            goalId: goal.id,
                            runId: goal.state.run.id,
                            phase: "executing",
                            executionUnitId,
                            actionId: normalized.decision.action.actionId,
                            eventType: "action_staged",
                            payload: {
                                type: "action_staged",
                                action: normalized.decision.action,
                                approvalStatus: "approved",
                            },
                        }],
                        acceptedPatch,
                        control,
                    );

                    const outcome = await this.executeToolAndObserve(
                        stagedCheckpoint,
                        validated.tool,
                        normalized.decision.action,
                        executionUnitId,
                        control,
                    );

                    if (outcome.kind === "stopped") {
                        return outcome.result;
                    }

                    goal = outcome.goal;
                    continue;
                }

                throwIfAborted(control);
                const nextRun = this.applyTransition(goal.state.run, {
                    kind: "decision",
                    decision: normalized.decision,
                });
                const transitionedGoal = this.withRun(goal, nextRun);
                const nextGoal = this.appendDecisionMessage(
                    transitionedGoal,
                    normalized.decision,
                );

                let terminalFact: TrajectoryEventDraft;
                if (normalized.decision.kind === "complete") {
                    terminalFact = {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "run_completed",
                        payload: { type: "run_completed", summary: normalized.decision.summary },
                    };
                } else if (normalized.decision.kind === "wait") {
                    terminalFact = {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "run_waiting",
                        payload: { type: "run_waiting", reason: normalized.decision.reason },
                    };
                } else {
                    terminalFact = {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "run_failed",
                        payload: {
                            type: "run_failed",
                            code: "AGENT_DECISION_FAILED",
                            message: normalized.decision.error,
                        },
                    };
                }
                goal = await this.commitDecision(
                    nextGoal,
                    [terminalFact],
                    acceptedPatch,
                    control,
                );
            } finally {
                session?.close();
            }
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

    private applyTransition(state: RunState, input: RunInput): RunState {
        const result = transition(state, input);

        if (!result.ok) {
            throw new Error(`Runner invariant violated: ${result.error.message}`);
        }

        return result.state;
    }
}
