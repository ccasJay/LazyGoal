import { createHash, randomUUID } from "node:crypto";

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
    WorkingMemoryPatch,
    GoalProtocolValidator,
    AskUserQuestion,
    GoalTask,
    PendingInteractionAskUser,
    PendingInteractionTaskApproval,
    PendingThink,
    PendingModelRepair,
} from "./domain";
import type { ModelContextCheckpointResult } from "./domain";
import type { GoalStore } from "./goal-store";
import type {
    DecideStageResult,
    StepExecutionInput,
    StepExecutor,
    ThinkExchange,
    ThinkStageResult,
} from "./step-executor";
import type {
    ExecutionStreamEventDraft,
    ExecutionStreamPublisher,
    StreamJsonValue,
} from "../../execution-stream/src/index";
import {
    CONTEXT_LOOKUP_CHAIN_LIMIT_CODE,
    CONTEXT_LOOKUP_PROTOCOL_ERROR_CODE,
    ContextLookupProtocolError,
    assertContextLookupResultOwnership,
    createContextLookupId,
    getCommittedRunBoundaries,
    invokeContextLookup,
    normalizeContextLookupRequest,
    normalizeContextLookupResult,
    type ContextLookupPort,
    type ContextLookupResult,
} from "./context-retrieval";
import {
    AgentDecisionContract,
    normalizeAskUserRequest,
    safeParse,
    validateModelOutputSemantics,
} from "../../contracts/src/index";

import type {
    ToolDefinition,
    ToolObservation,
    ToolStreamEvent,
    ToolPolicy,
    PreparedToolAction as PreparedToolResult,
    ToolRegistration,
    ToolRegistry,
} from "./tool";
import { resolveAuthorizedToolDefinitions, TransientToolExecutionFailure } from "./tool";
import {
    isSeatbeltSupported,
    resolveEffectiveSandboxScope,
    type EffectiveSandboxScope,
    type SandboxAccessRequest,
    type SandboxExecutionPlan,
} from "../../sandbox/src/index";
import { evaluateSandboxAuthorization } from "../../permission/src/index";

/**
 * 沙箱执行计划解析器接口。
 *
 * @remarks
 * Runner 在受限 Action 执行前调用该函数以获取核准的执行计划。
 *
 * @example
 * ```ts
 * const resolver: SandboxPlanResolver = async ({ workspaceRoot, action, effectiveScope }) => plan;
 * ```
 */
export type SandboxPlanResolver = (query: {
    readonly workspaceRoot: string;
    readonly action: ToolCallAction;
    readonly effectiveScope?: EffectiveSandboxScope | undefined;
}) => Promise<SandboxExecutionPlan | undefined> | SandboxExecutionPlan | undefined;
import {
    ExecutionAbortedError,
    isExecutionAbortedError,
    throwIfAborted,
    type ExecutionControl,
} from "./execution-control";
import {
    ModelRequestRetriesExhaustedError,
    TransientModelRequestFailure,
    type ModelRequestAttemptFailure,
} from "./model-request-failure";
import {
    createRuntimeFeedback,
    ModelStageFeedbackError,
    type RuntimeFeedback,
    type RuntimeFeedbackOrigin,
    type RuntimeFeedbackStage,
} from "./runtime-feedback";
import { transition } from "./transition";
import {
    createEmptyGoalPlan,
    reduceGoalPlan,
} from "./goal-plan";
import { canUpdateGoalPlan } from "./run-mode-capabilities";
import {
    TrajectoryAppendError,
    allocateDiagnosticTraceRecord,
    type DiagnosticTraceSink,
    type TrajectoryEvent,
    type TrajectoryEventDraft,
    type ModelContextFramePayload,
    type ModelContextStage,
    type TrajectoryStore,
} from "./trajectory";
import {
    createSupersedeScopeOperation,
    normalizeMemoryPatch,
    type NormalizedWorkingMemoryPatch,
    type WorkingMemoryLimitsInput,
    validateMemoryPatchPhase,
} from "./working-memory-core";
import { WorkingMemorySession } from "./working-memory-session";
import { resolveEvidenceObservation } from "./evidence-gate";
import {
    buildCommittedEvidenceIndex,
    validateContextLookupSourceReferences,
} from "./evidence-gate";
import type { CommittedEvidenceIndex } from "./evidence-gate";
import {
    createNoopToolMemoryProjectorRegistry,
    normalizeToolMemoryProjectionResult,
    type ToolMemoryProjectorRegistry,
} from "./tool-memory-projector";
import {
    TrajectoryCheckpointCommitter,
    type AcceptedMemoryPatchInput,
    type TrajectoryCheckpointCommitResult,
    type TrajectoryCheckpointCommitterPort,
} from "./trajectory-checkpoint-committer";
import {
    advanceContextEpoch,
    selectLatestConversationStart,
    toEpochRange,
} from "./context-epoch";
import { withRunModeSelectionGate } from "./run-mode-selection-gate";
import {
    createSandboxGrantMatcher,
    createToolGrantMatcher,
    type PermissionMode,
    type ProjectPermissionModeStore,
    type SandboxGrantLookup,
    type ToolGrantLookup,
} from "./tool-grant";

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

class StageExecutionFailure extends Error {
    constructor(readonly original: unknown) {
        super(original instanceof Error ? original.message : String(original));
        this.name = "StageExecutionFailure";
    }
}

class StageCheckpointFailure extends Error {
    constructor(readonly original: unknown) {
        super(original instanceof Error ? original.message : String(original));
        this.name = "StageCheckpointFailure";
    }
}

type NormalizedExecution = {
    readonly decision: AgentDecision;
    readonly thought?: string;
    readonly preparedToolAction?: PreparedToolAction;
};

let executionUnitCounter = 0;

function createExecutionUnitId(): string {
    executionUnitCounter += 1;
    return `execution-unit-${Date.now().toString(36)}-${executionUnitCounter.toString(36)}`;
}

async function waitForRetry(delayMs: number, control?: ExecutionControl): Promise<void> {
    throwIfAborted(control);
    if (delayMs === 0) return;
    await new Promise<void>((resolve, reject) => {
        const signal = control?.signal;
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, delayMs);
        const onAbort = () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            reject(new ExecutionAbortedError());
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        if (signal?.aborted) onAbort();
    });
    throwIfAborted(control);
}

function canonicalizeBoundaryValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalizeBoundaryValue);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
                .map(([key, child]) => [key, canonicalizeBoundaryValue(child)]),
        );
    }
    return value;
}

function createThinkInputBoundary(
    input: StepExecutionInput,
    stepOrdinal: number,
): `sha256:${string}` {
    const goal = input.goal;
    const workingMemoryInput = input.workingMemory;
    let workingMemory: Omit<NonNullable<StepExecutionInput["workingMemory"]>, "derivedThroughSequence"> | undefined;
    if (workingMemoryInput !== undefined) {
        const { derivedThroughSequence: _derivedThroughSequence, ...stableMemory } = workingMemoryInput;
        workingMemory = stableMemory;
    }
    const boundary = {
        goalId: goal.id,
        stepOrdinal,
        definition: goal.definition,
        messages: goal.state.messages,
        run: {
            id: goal.state.run.id,
            mode: goal.state.run.mode,
            approvedTask: goal.state.run.approvedTask,
            stepCount: goal.state.run.stepCount,
            lastStep: goal.state.run.lastStep,
            contextEpoch: goal.state.run.contextEpoch,
        },
        modelSelection: goal.state.modelSelection,
        goalPlan: goal.state.goalPlan,
        authorizedTools: input.authorizedTools,
        workingMemory,
        contextLookupResult: input.contextLookupResult,
    };
    const serialized = JSON.stringify(canonicalizeBoundaryValue(boundary));
    return `sha256:${createHash("sha256").update(serialized, "utf8").digest("hex")}`;
}

function isStreamDeltaKind(kind: string): boolean {
    return kind.endsWith("_delta");
}

function streamCoalescingKey(
    executionUnitId: string | undefined,
    actionId: string | undefined,
    kind: string,
): string {
    return `${kind}:${executionUnitId ?? actionId ?? "run"}`;
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

function createRunnerFeedbackError(
    error: unknown,
    goal: Goal,
    executionUnitId: string,
    stage: RuntimeFeedbackStage,
    origin: RuntimeFeedbackOrigin,
    constraints: readonly string[] = [],
): ModelStageFeedbackError {
    const code = error instanceof RunnerExecutionError ? error.code : "INVALID_AGENT_DECISION";
    const message = origin === "tool_selection"
        ? "Select a Tool listed as available in this request."
        : origin === "tool_input"
            ? "Correct the Tool input to match its supplied schema and constraints."
            : origin === "completion_evidence"
                ? "Use only committed evidence that satisfies every completion criterion."
                : "Return a decision that satisfies the active output contract and semantic rules.";
    return new ModelStageFeedbackError(createRuntimeFeedback({
        goalId: goal.id,
        runId: goal.state.run.id,
        executionUnitId,
        stepOrdinal: goal.state.run.stepCount + 1,
        stage,
        origin,
        code,
        attempt: 1,
        issues: [{
            code,
            path: origin === "tool_selection"
                ? ["result", "action", "toolId"]
                : origin === "tool_input"
                    ? ["result", "action", "input"]
                    : origin === "completion_evidence"
                        ? ["result", "completionEvidence"]
                        : ["result"],
            message,
        }],
        constraints,
    }),
    `${stage} decision failed ${origin} validation`,
    error);
}

function validateAgentDecision(
    value: unknown,
): AgentDecision {
    const parsed = safeParse(AgentDecisionContract, value);
    if (!parsed.success) {
        return invalidAgentDecision(
            `AgentDecision 不符合 canonical Contract: ${parsed.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        );
    }
    const semanticIssues = validateModelOutputSemantics(parsed.data);
    if (semanticIssues.length > 0) {
        return invalidAgentDecision(
            `AgentDecision 不符合语义规则: ${semanticIssues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        );
    }
    if (parsed.data.kind === "context_lookup") {
        return normalizeContextLookupRequest(parsed.data);
    }
    return parsed.data;
}

function isProtocolError(error: unknown): boolean {
    return isRecord(error) && error.code === "INVALID_LLM_RESPONSE";
}

function toStableExecutionError(error: unknown): RunnerExecutionError | undefined {
    if (error instanceof RunnerExecutionError) {
        return error;
    }

    if (error instanceof ModelStageFeedbackError) {
        const code = error.feedback.origin === "tool_selection"
            ? "TOOL_NOT_AUTHORIZED"
            : error.feedback.origin === "tool_input"
                ? "INVALID_TOOL_INPUT"
                : "INVALID_AGENT_DECISION";
        return new RunnerExecutionError(code, error.feedback.issues[0]?.message ?? error.feedback.code);
    }

    if (isProtocolError(error)) {
        return new RunnerExecutionError(
            "INVALID_AGENT_DECISION",
            error instanceof Error ? error.message : "AgentDecision 协议无效",
        );
    }

    if (error instanceof ModelRequestRetriesExhaustedError) {
        return new RunnerExecutionError("MODEL_REQUEST_FAILED", error.message);
    }

    return undefined;
}

interface PreparedToolAction {
    readonly registration: ToolRegistration;
    readonly action: ToolCallAction;
    readonly policy: "allow" | "require_approval";
    readonly plan?: SandboxExecutionPlan;
    execute(control?: ExecutionControl, plan?: SandboxExecutionPlan): Promise<ToolObservation>;
    stream?(control?: ExecutionControl, plan?: SandboxExecutionPlan): AsyncIterable<ToolStreamEvent>;
}

function prepareToolAction(
    goal: Goal,
    action: Extract<AgentDecision, { readonly kind: "tool_call" }>['action'],
    registry: ToolRegistry,
    policy: ToolPolicy,
    evaluatePolicy = true,
    control?: ExecutionControl,
    plan?: SandboxExecutionPlan,
): PreparedToolAction {
    throwIfAborted(control);

    if (!goal.definition.profile.toolIds.includes(action.toolId)) {
        throw new RunnerExecutionError(
            "TOOL_NOT_AUTHORIZED",
            `Tool "${action.toolId}" is not authorized by the frozen Profile`,
        );
    }

    let registration: ToolRegistration | undefined;

    try {
        registration = registry.get(action.toolId);
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

    if (registration === undefined) {
        throw new RunnerExecutionError(
            "TOOL_NOT_FOUND",
            `Authorized Tool "${action.toolId}" is not registered`,
        );
    }

    let prepared: PreparedToolResult;

    try {
        prepared = registration.prepare(action.input, control);
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

    if (!isRecord(prepared) || (prepared.ok !== true && prepared.ok !== false)) {
        throw new RunnerExecutionError(
            "TOOL_EXECUTION_ERROR",
            "Tool prepare returned an invalid result",
        );
    }

    if (prepared.ok === false) {
        if (
            !isRecord(prepared.error)
            || prepared.error.code !== "INVALID_TOOL_INPUT"
            || !isNonEmptyText(prepared.error.message)
        ) {
            throw new RunnerExecutionError(
                "TOOL_EXECUTION_ERROR",
                "Tool prepare returned an invalid error",
            );
        }

        throw new RunnerExecutionError(
            "INVALID_TOOL_INPUT",
            prepared.error.message,
        );
    }

    if (
        !isJsonValue(prepared.input)
        || typeof prepared.execute !== "function"
        || (prepared.stream !== undefined && typeof prepared.stream !== "function")
    ) {
        throw new RunnerExecutionError(
            "TOOL_EXECUTION_ERROR",
            "Tool prepare returned an invalid success result",
        );
    }

    const canonicalAction: ToolCallAction = {
        ...action,
        input: prepared.input,
    };

    if (!evaluatePolicy) {
        return {
            registration,
            action: canonicalAction,
            policy: "allow",
            ...(plan !== undefined ? { plan } : {}),
            execute: (executeControl, execPlan) =>
                prepared.execute(canonicalAction.actionId, executeControl, execPlan ?? plan),
            ...(prepared.stream === undefined
                ? {}
                : {
                    stream: (executeControl?: ExecutionControl, streamPlan?: SandboxExecutionPlan) =>
                        prepared.stream!(canonicalAction.actionId, executeControl, streamPlan ?? plan),
                }),
        };
    }

    let policyResult: "allow" | "require_approval";

    try {
        policyResult = policy.evaluate({
            goal,
            action: canonicalAction,
            tool: registration.definition,
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

    return {
        registration,
        action: canonicalAction,
        policy: policyResult,
        ...(plan !== undefined ? { plan } : {}),
        execute: (executeControl, execPlan) =>
            prepared.execute(canonicalAction.actionId, executeControl, execPlan ?? plan),
        ...(prepared.stream === undefined
            ? {}
            : {
                stream: (executeControl?: ExecutionControl, streamPlan?: SandboxExecutionPlan) =>
                    prepared.stream!(canonicalAction.actionId, executeControl, streamPlan ?? plan),
            }),
    };
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
            readonly code:
                | "RUN_NOT_FOUND"
                | "ACTION_NOT_AUTHORIZED"
                | "INVALID_CONTEXT_LOOKUP"
                | "CONTEXT_LOOKUP_CHAIN_LIMIT";
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
    /** 读取会话或 Workspace 级持续 Tool 授权；缺省时所有受 Policy 门控的 Action 仍需审批。 */
    readonly toolGrantLookup?: ToolGrantLookup;
    /** 读取会话或 Workspace 级持续 Sandbox 授权；缺省时所有越界沙箱能力仍需审批。 */
    readonly sandboxGrantLookup?: SandboxGrantLookup;
    /** 用于隔离 Workspace 授权的稳定身份；必须与授权账本位置一致。 */
    readonly workspaceId?: string;
    /** 文件 Tool 授权身份解析时使用的 Workspace 根目录。 */
    readonly workspaceRoot?: string;
    /** 可选 Domain Event 追加与 Snapshot 边界读取端口；省略时只保存 Snapshot。 */
    readonly trajectoryStore?: TrajectoryStore;
    /** 可选诊断记录边界；诊断故障不得改变 Snapshot 或 Domain Event 语义。 */
    readonly traceSink?: DiagnosticTraceSink;
    /** 可选 Tool Observation 事实投影表；省略时不生成 Runtime Fact proposal。 */
    readonly toolMemoryProjectors?: ToolMemoryProjectorRegistry;
    /** structured@1 Patch 接受时使用的 Working Memory 限制。 */
    readonly workingMemoryLimits?: WorkingMemoryLimitsInput;
    /**
     * 可选 Prompt/Memory 协议校验器；Composition Root 可用它在运行前执行
     * 额外的协议边界校验。
     */
    readonly protocolValidator?: GoalProtocolValidator;
    /** 可选共享提交器；省略时由 Runner 按当前依赖创建。 */
    readonly checkpointCommitter?: TrajectoryCheckpointCommitterPort;
    /** 只读 committed Trajectory 检索端口；缺失时 lookup 产生 unavailable 结果。 */
    readonly contextLookupPort?: ContextLookupPort;
    /** 可选的 Goal/Run 实时事件发布端口；发布故障不得改变执行语义。 */
    readonly executionStream?: ExecutionStreamPublisher;
    /**
     * 可选的沙箱执行计划解析器。
     *
     * @remarks
     * Runner 在受限 Action 获准执行前调用此解析器以生成或验证沙箱执行计划。
     */
    readonly sandboxPlanResolver?: SandboxPlanResolver;
    /** 可选的项目权限执行模式存储端口。 */
    readonly permissionModeStore?: ProjectPermissionModeStore;
}

/**
 * 从 GoalStore 恢复并推进一个 Run，直到 waiting 或终态。
 *
 * @remarks
 * Runner 是状态推进与持久化顺序的拥有者。启动、恢复和每个 Step 完成后，
 * 都会先保存最新完整 Goal，再继续下一步。阶段化 Executor 可在一个 Step 内返回
 * 多个 Decide/Think 结果；每次 Think 的请求与输出先提交 Trajectory 和 Snapshot，
 * Snapshot 的 `pendingThink` 指向当前 Step 最近一个已提交输出。恢复会校验 Goal、Run、
 * Step、执行单元、输入摘要及事件父链，复用该链并只重试 Decide；最终有效 AgentDecision
 * 才进入状态转换。正数 `maxSteps` 使用快照中的累计 `stepCount`；`0` 表示不按 Step 数终止。
 *
 * `execute()` 兼容实现返回的 AgentDecision 会先做运行时严格校验；阶段化实现由
 * `decide()` 返回业务决策或 Think 请求，并由 `think()` 生成自由文本。Think 不增加
 * Step、不执行 Tool。`tool_call` 按冻结 Profile、Registry、输入协议和 Policy 顺序校验，自动允许
 * 的 Action 会先保存 pendingAction，再调用 Tool，最后保存 Observation；需要
 * 批准的 Action 会保存为 `awaiting_approval` 并返回 waiting，不调用 Tool。收到
 * 匹配的瞬时 `authorizedActionId` 后，Runner 才会执行已批准的同一 Action。
 * 进程恢复时，`safe` Tool 会沿用原 `actionId` 自动重放；`manual` Tool 会转为
 * `outcome_unknown` waiting，等待 Coordinator 再次批准或拒绝。领域 failure 会
 * 继续下一轮；Tool 异常会保存 `outcome_unknown` execution_error。
 *
 * 旧式 Executor 抛出的非协议异常会规范化为当前 `fail` Decision 并持久化；阶段化
 * Executor 在 Think 请求或输出检查点之后失败/取消时，Runner 保留运行中的 Step 和
 * 已提交 `pendingThink`，传播原错误供调用方恢复，且不伪造 AgentDecision。Store 的
 * 读取或写入异常原样传播，写入失败后不会继续执行下一阶段或 Step。
 */
export class Runner {
    private readonly store: GoalStore;
    private readonly executor: StepExecutor;
    private readonly toolRegistry: ToolRegistry;
    private readonly toolPolicy: ToolPolicy;
    private readonly toolGrantLookup: ToolGrantLookup | undefined;
    private readonly sandboxGrantLookup: SandboxGrantLookup | undefined;
    private readonly workspaceId: string | undefined;
    private readonly workspaceRoot: string | undefined;
    private readonly checkpointCommitter: TrajectoryCheckpointCommitterPort;
    private readonly trajectoryStore: TrajectoryStore | undefined;
    private readonly workingMemoryLimits: WorkingMemoryLimitsInput | undefined;
    private readonly protocolValidator: GoalProtocolValidator | undefined;
    private readonly contextLookupPort: ContextLookupPort | undefined;
    private readonly executionStream: ExecutionStreamPublisher | undefined;
    private readonly traceSink: DiagnosticTraceSink | undefined;
    private readonly toolMemoryProjectors: ToolMemoryProjectorRegistry;
    private readonly sandboxPlanResolver: SandboxPlanResolver | undefined;
    private readonly permissionModeStore: ProjectPermissionModeStore | undefined;

    /** @param dependencies - GoalStore、Executor 与可选 Tool 边界依赖。 */
    constructor(dependencies: RunnerDependencies) {
        this.store = dependencies.store;
        this.executor = dependencies.executor;
        this.toolRegistry = dependencies.toolRegistry ?? EMPTY_TOOL_REGISTRY;
        this.toolPolicy = dependencies.toolPolicy ?? ALLOW_ALL_TOOL_POLICY;
        this.toolGrantLookup = dependencies.toolGrantLookup;
        this.sandboxGrantLookup = dependencies.sandboxGrantLookup;
        this.permissionModeStore = dependencies.permissionModeStore;
        this.workspaceId = dependencies.workspaceId;
        this.workspaceRoot = dependencies.workspaceRoot;
        this.sandboxPlanResolver = dependencies.sandboxPlanResolver;
        this.trajectoryStore = dependencies.trajectoryStore;
        this.workingMemoryLimits = dependencies.workingMemoryLimits;
        this.protocolValidator = dependencies.protocolValidator;
        this.contextLookupPort = dependencies.contextLookupPort;
        this.executionStream = dependencies.executionStream;
        this.traceSink = dependencies.traceSink;
        this.toolMemoryProjectors = dependencies.toolMemoryProjectors
            ?? createNoopToolMemoryProjectorRegistry();
        this.checkpointCommitter = dependencies.checkpointCommitter
            ?? new TrajectoryCheckpointCommitter({
                store: dependencies.store,
                ...(dependencies.trajectoryStore === undefined
                    ? {}
                    : { trajectoryStore: dependencies.trajectoryStore }),
                ...(dependencies.traceSink === undefined
                    ? {}
                    : { traceSink: dependencies.traceSink }),
            });
    }

    /** 发布一次旁路执行事件；发布端故障不得覆盖 Runtime 结果。 */
    private publishExecutionEvent(
        target: Goal | { readonly goalId: string; readonly runId: string },
        event: Omit<ExecutionStreamEventDraft, "goalId" | "runId">,
    ): void {
        if (this.executionStream === undefined) return;
        const goalId = "goalId" in target ? target.goalId : target.id;
        const runId = "runId" in target ? target.runId : target.state.run.id;
        try {
            this.executionStream.publish({
                goalId,
                runId,
                ...event,
            });
        } catch {
            // Stream 是旁路观察面，不能改变 Goal 状态机或持久化语义。
        }
    }

    /** 在同一模型阶段内执行最多三次调用；只有适配器分类的暂时故障会重试。 */
    private async executeModelStage<T>(
        operation: () => Promise<T>,
        control?: ExecutionControl,
        onTransientFailure?: (attempt: number, error: TransientModelRequestFailure) => Promise<void>,
    ): Promise<T> {
        const failures: ModelRequestAttemptFailure[] = [];
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            throwIfAborted(control);
            try {
                return await operation();
            } catch (error) {
                if (isExecutionAbortedError(error) || control?.signal?.aborted) {
                    throwIfAborted(control);
                    throw error;
                }
                if (!(error instanceof TransientModelRequestFailure)) throw error;
                failures.push({
                    attempt,
                    reason: error.reason,
                    ...(error.status === undefined ? {} : { status: error.status }),
                });
                await onTransientFailure?.(attempt, error);
                if (attempt === 3) throw new ModelRequestRetriesExhaustedError(failures);
                const exponentialDelay = 250 * 2 ** (attempt - 1);
                await waitForRetry(Math.min(30_000, Math.max(exponentialDelay, error.retryAfterMs ?? 0)), control);
            }
        }
        throw new Error("Unreachable model retry state");
    }

    private async recordModelRequestFailure(
        goal: Goal,
        input: StepExecutionInput,
        stage: ModelContextStage,
        attempt: number,
        error: TransientModelRequestFailure,
        control?: ExecutionControl,
    ): Promise<Goal> {
        const draft: TrajectoryEventDraft = {
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            ...(input.executionUnitId === undefined ? {} : { executionUnitId: input.executionUnitId }),
            stepIndex: goal.state.run.stepCount + 1,
            eventType: "model_request_retry_recorded",
            payload: {
                type: "model_request_retry_recorded",
                stage,
                attempt,
                reason: error.reason,
                ...(error.status === undefined ? {} : { status: error.status }),
            },
        };
        const event = await this.checkpointCommitter.append(draft, control);
        if (event?.eventType !== "model_request_retry_recorded") {
            throw new TrajectoryAppendError("Model request retries require an enabled Trajectory sink");
        }
        const savedGoal = await this.commitStageCheckpoint(goal, [], control);
        const committed = { goal: savedGoal, events: [event] };
        this.publishCommittedEvents(committed);
        this.publishCheckpointCommitted(committed, [draft]);
        return savedGoal;
    }

    /**
     * 启动或继续一个已经保存的 Goal。
     *
     * @remarks
     * `created` 会先转换并保存为 `running`；`running` 会继续执行；waiting
     * 和终态直接返回且不产生副作用。当前 workflow 只有 executing 阶段，
     * 因此没有其它阶段需要启动 Run 或消费 Step。Goal 不存在或 runId 不匹配时
     * 返回 `RUN_NOT_FOUND`。
     *
     * @param ref - 目标 Goal 与 Run 的关联键。
     * @param options - 可选的本次调用瞬时 Action 授权；有授权时只接受与已批准
     *   `pendingAction` 相同的 `actionId`，不会写入快照；无授权恢复已批准 Action
     *   时按 Tool 的 `replayPolicy` 分流。
     * @param control - 当前 Run 推进调用共享的中止控制。
     * @returns Run 到达 waiting 或终态时的结果。
     * @throws GoalStore/Trajectory 读取或保存错误；有已提交阶段检查点时阶段调用错误
     *   原样传播且保留恢复指针；中止时抛出 `ExecutionAbortedError`。
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
            const start = await withRunModeSelectionGate(this.store, goal.id, async () => {
                throwIfAborted(effectiveControl);
                const latestGoal = await this.restore(ref, effectiveControl);
                throwIfAborted(effectiveControl);
                if (latestGoal === undefined) return { kind: "missing" as const };
                this.validateGoalProtocol(latestGoal);
                if (latestGoal.state.run.status !== "created") {
                    return { kind: "already_started" as const, goal: latestGoal };
                }
                if (!this.hasMatchingTransientAuthorization(latestGoal, options)) {
                    return {
                        kind: "unauthorized" as const,
                        result: this.actionNotAuthorized(ref, options.authorizedActionId),
                    };
                }

                const runningGoal = this.withRun(
                    latestGoal,
                    this.applyTransition(latestGoal.state.run, { kind: "start" }),
                );
                const committed = await this.checkpointCommitter.commit(runningGoal, {
                    facts: [{
                        goalId: latestGoal.id,
                        runId: latestGoal.state.run.id,
                        phase: "executing",
                        eventType: "run_started",
                        payload: { type: "run_started" },
                    }],
                    ...(effectiveControl === undefined ? {} : { control: effectiveControl }),
                });
                this.publishCommittedEvents(committed);
                return { kind: "started" as const, goal: committed.goal };
            });

            if (start.kind === "missing") return this.runNotFound(ref);
            if (start.kind === "unauthorized") return start.result;
            if (start.kind === "already_started") return { ok: true, state: start.goal.state.run };

            const contextLookupResult = options.contextLookupResult
                ?? await this.restoreContextLookupResult(start.goal, effectiveControl);
            return this.runLoop(
                start.goal,
                options.authorizedActionId,
                effectiveControl,
                contextLookupResult,
                undefined,
                options.sandboxExecutionPlan,
            );
        }

        const contextLookupResult = options.contextLookupResult
            ?? await this.restoreContextLookupResult(goal, effectiveControl);

        return this.runLoop(
            goal,
            options.authorizedActionId,
            effectiveControl,
            contextLookupResult,
            undefined,
            options.sandboxExecutionPlan,
        );
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

    private async restoreContextLookupResult(
        goal: Goal,
        control?: ExecutionControl,
    ): Promise<ContextLookupResult | undefined> {
        const trajectoryStore = this.trajectoryStore;
        const boundary = goal.state.run.committedThroughSequence;
        const lastStep = goal.state.run.lastStep;
        if (
            trajectoryStore === undefined
            || boundary <= 0
            || lastStep?.kind !== "decision"
            || lastStep.result.kind !== "context_lookup"
        ) {
            return undefined;
        }

        throwIfAborted(control);
        const raw = await trajectoryStore.readWithBoundary(
            { goalId: goal.id, runId: goal.state.run.id },
            boundary,
        );
        throwIfAborted(control);
        const committed = [...raw.committed]
            .filter((event) => event.goalId === goal.id && event.runId === goal.state.run.id)
            .sort((left, right) => right.sequence - left.sequence);
        const runBoundaries = getCommittedRunBoundaries(goal);
        const currentEvidenceIndex = buildCommittedEvidenceIndex({
            goalId: goal.id,
            runId: goal.state.run.id,
            committedThroughSequence: boundary,
            events: raw.committed,
        });
        const historicalEvidenceIndexes: CommittedEvidenceIndex[] = [];
        for (const source of runBoundaries) {
            if (source.runId === goal.state.run.id) continue;
            const sourceRaw = await trajectoryStore.readWithBoundary(
                { goalId: goal.id, runId: source.runId },
                source.committedThroughSequence,
            );
            historicalEvidenceIndexes.push(buildCommittedEvidenceIndex({
                goalId: goal.id,
                runId: source.runId,
                committedThroughSequence: source.committedThroughSequence,
                events: sourceRaw.committed,
            }));
        }
        const lookupBoundary = Math.max(...runBoundaries.map((source) => source.committedThroughSequence));

        const request = normalizeContextLookupRequest(lastStep.result);
        const expectedLookupId = createContextLookupId(
            goal.id,
            goal.state.run.id,
            request,
        );
        const lastFact = committed.find((event) =>
            (event.eventType === "context_lookup_completed"
                || event.eventType === "context_lookup_not_found"
                || event.eventType === "context_lookup_failed")
            && event.payload.lookupId === expectedLookupId,
        );
        if (lastFact === undefined) return undefined;

        const normalizeRestoredResult = (value: unknown): ContextLookupResult => {
            const result = normalizeContextLookupResult(
                value,
                expectedLookupId,
                lookupBoundary,
                request,
            );
            if (result.status === "found") {
                assertContextLookupResultOwnership(
                    result,
                    goal.id,
                    goal.state.run.id,
                    runBoundaries,
                );
                validateContextLookupSourceReferences(
                    result,
                    currentEvidenceIndex,
                    historicalEvidenceIndexes,
                );
            }
            return result;
        };
        if (
            (lastFact.eventType !== "context_lookup_completed"
                && lastFact.eventType !== "context_lookup_not_found"
                && lastFact.eventType !== "context_lookup_failed")
            || lastFact.payload.lookupId !== expectedLookupId
        ) {
            return undefined;
        }

        const requested = committed.find((event) =>
            event.eventType === "context_lookup_requested"
            && event.payload.lookupId === expectedLookupId
            && event.sequence < lastFact.sequence,
        );
        if (requested === undefined) {
            throw new ContextLookupProtocolError(
                "committed lookup result has no preceding requested fact",
            );
        }

        if (lastFact.eventType === "context_lookup_completed") {
            return normalizeRestoredResult(lastFact.payload.result);
        }
        if (lastFact.eventType === "context_lookup_not_found") {
            return normalizeRestoredResult(lastFact.payload.result);
        }

        return normalizeRestoredResult(
            {
                status: "lookup_error",
                lookupId: expectedLookupId,
                code: lastFact.payload.code,
                message: lastFact.payload.message,
                committedThroughSequence: boundary,
            },
        );
    }

    /** 从 committed Trajectory 尾部恢复本次连续 Lookup 链长度。 */
    private async restoreContextLookupChainCount(
        goal: Goal,
        control?: ExecutionControl,
    ): Promise<number> {
        const trajectoryStore = this.trajectoryStore;
        const boundary = goal.state.run.committedThroughSequence;
        if (trajectoryStore === undefined || boundary <= 0) return 0;
        throwIfAborted(control);
        const raw = await trajectoryStore.readWithBoundary(
            { goalId: goal.id, runId: goal.state.run.id },
            boundary,
        );
        throwIfAborted(control);
        const facts = [...raw.committed]
            .filter((event) => event.goalId === goal.id && event.runId === goal.state.run.id)
            .filter((event) => event.eventType === "context_lookup_requested"
                || event.eventType === "context_lookup_completed"
                || event.eventType === "context_lookup_not_found"
                || event.eventType === "context_lookup_failed")
            .sort((left, right) => left.sequence - right.sequence);
        let count = 0;
        for (let index = facts.length - 1; index >= 1;) {
            const result = facts[index];
            const requested = facts[index - 1];
            if (
                result === undefined
                || requested === undefined
                ||
                (result.eventType !== "context_lookup_completed"
                    && result.eventType !== "context_lookup_not_found"
                    && result.eventType !== "context_lookup_failed")
                || requested.eventType !== "context_lookup_requested"
                || !("lookupId" in result.payload)
                || !("lookupId" in requested.payload)
                || result.payload.lookupId !== requested.payload.lookupId
            ) {
                break;
            }
            count += 1;
            index -= 2;
        }
        return count;
    }

    private validateGoalProtocol(goal: Goal): void {
        if (this.protocolValidator === undefined) return;

        this.protocolValidator.validate({
            promptBundleVersion: goal.definition.promptBundleVersion,
            memoryProtocol: goal.definition.memoryProtocol,
            modelContextProtocol: goal.definition.modelContextProtocol,
            contextRetrievalProtocol: goal.definition.contextRetrievalProtocol,
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
    ): Promise<Readonly<TrajectoryEvent> | undefined> {
        const event = await this.checkpointCommitter.append(draft, control, countAsFact);
        this.publishExecutionEvent(
            draft,
            {
                ...(event?.executionUnitId ?? draft.executionUnitId) === undefined
                    ? {}
                    : { executionUnitId: event?.executionUnitId ?? draft.executionUnitId },
                ...(event?.actionId ?? draft.actionId) === undefined
                    ? {}
                    : { actionId: event?.actionId ?? draft.actionId },
                kind: event?.payload.type ?? draft.eventType,
                visibility: "public",
                durability: event?.payload.type === "state_committed"
                    ? "checkpoint"
                    : event === undefined ? "live" : "trajectory",
                delivery: isStreamDeltaKind(event?.payload.type ?? draft.eventType)
                    ? "delta"
                    : "control",
                ...(isStreamDeltaKind(event?.payload.type ?? draft.eventType)
                    ? { coalescingKey: streamCoalescingKey(event?.executionUnitId ?? draft.executionUnitId, event?.actionId ?? draft.actionId, event?.payload.type ?? draft.eventType) }
                    : {}),
                payload: (event?.payload ?? draft.payload) as unknown as StreamJsonValue,
            },
        );
        return event;
    }

    private async recordToolProjectorDiagnostic(
        goal: Goal,
        action: ToolCallAction,
        error: unknown,
    ): Promise<void> {
        if (this.traceSink === undefined) return;
        try {
            await this.traceSink.append(allocateDiagnosticTraceRecord({
                goalId: goal.id,
                runId: goal.state.run.id,
                kind: "tool_memory_projector_failed",
                payload: {
                    toolId: action.toolId,
                    actionId: action.actionId,
                    error: error instanceof Error ? error.message : String(error),
                },
            }));
        } catch {
            // Diagnostic Trace 是旁路，不能覆盖 Observation 提交语义。
        }
    }

    private async projectToolMemoryPatch(
        goal: Goal,
        action: ToolCallAction,
        observation: ToolObservation,
        observationSequence: number,
        control?: ExecutionControl,
    ): Promise<AcceptedMemoryPatchInput | undefined> {
        const projector = this.toolMemoryProjectors.get(action.toolId);
        if (projector === undefined) return undefined;
        const session = await this.openWorkingMemorySession(goal, control);
        try {
            const projected = normalizeToolMemoryProjectionResult(projector.project({
                goal: structuredClone(goal),
                action: structuredClone(action),
                observation: structuredClone(observation),
                observationSequence,
                workingMemory: structuredClone(session.workingMemory),
            }));
            if (projected.status !== "changed") return undefined;

            for (const fact of projected.facts) {
                if (!fact.evidenceSequences.includes(observationSequence)) {
                    throw new TypeError(
                        "ToolMemoryProjector Fact must reference the current observation sequence",
                    );
                }
                const committedEvidence = fact.evidenceSequences.filter(
                    (sequence) => sequence !== observationSequence,
                );
                if (committedEvidence.length > 0) session.validateEvidence(committedEvidence);
            }

            const patch: WorkingMemoryPatch = {
                protocolVersion: 1,
                operations: projected.facts.map((fact) => ({
                    type: "upsert_fact" as const,
                    fact,
                })),
            };
            validateMemoryPatchPhase(patch, "executing", {
                workingMemory: session.workingMemory,
                ...(this.workingMemoryLimits === undefined
                    ? {}
                    : { limits: this.workingMemoryLimits }),
            });
            const normalized = normalizeMemoryPatch(patch, {
                phase: "executing",
                originSequence: observationSequence + 2,
                source: "tool_projector",
                workingMemory: session.workingMemory,
                ...(this.workingMemoryLimits === undefined
                    ? {}
                    : { limits: this.workingMemoryLimits }),
            });
            if (normalized.operations.length === 0) return undefined;
            return {
                phase: "executing",
                producers: ["tool_projector"],
                operations: normalized.operations,
                actionId: action.actionId,
            };
        } catch (error) {
            await this.recordToolProjectorDiagnostic(goal, action, error);
            return undefined;
        } finally {
            session.close();
        }
    }

    private async openWorkingMemorySession(
        goal: Goal,
        control?: ExecutionControl,
    ): Promise<WorkingMemorySession> {
        throwIfAborted(control);
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
        session: WorkingMemorySession,
        factCount: number,
    ): AcceptedMemoryPatchInput | undefined {
        const memoryPatch = "memoryPatch" in decision
            ? decision.memoryPatch
            : undefined;

        const workingMemory = session.workingMemory;
        try {
            let normalized: NormalizedWorkingMemoryPatch = {
                protocolVersion: 1,
                operations: [],
                suppressed: [],
            };
            if (memoryPatch !== undefined) {
                const validationSession: WorkingMemorySession = session;
                validateMemoryPatchPhase(memoryPatch, "executing", {
                    workingMemory,
                    ...(this.workingMemoryLimits === undefined
                        ? {}
                        : { limits: this.workingMemoryLimits }),
                });
                validationSession.validatePatch(memoryPatch, "execution");
                normalized = normalizeMemoryPatch(memoryPatch, {
                    phase: "executing",
                    originSequence: Math.max(
                        1,
                        goal.state.run.committedThroughSequence + factCount + 1,
                    ),
                    workingMemory,
                    ...(this.workingMemoryLimits === undefined
                        ? {}
                        : { limits: this.workingMemoryLimits }),
                });
            }
            const terminalLifecycle = decision.kind === "complete" || decision.kind === "fail"
                ? [createSupersedeScopeOperation("phase", {
                    phase: "executing",
                    kinds: ["hypothesis", "plan", "blocker"],
                })]
                : [];
            const operations = [...normalized.operations, ...terminalLifecycle];
            if (operations.length === 0) return undefined;
            return {
                phase: "executing",
                producers: [
                    ...(normalized.operations.length === 0 ? [] : ["model" as const]),
                    ...(terminalLifecycle.length === 0 ? [] : ["runtime_lifecycle" as const]),
                ],
                operations,
            };
        } catch (error) {
            if (error instanceof RunnerExecutionError) throw error;
            throw new RunnerExecutionError(
                "INVALID_MEMORY_PATCH",
                error instanceof Error ? error.message : String(error),
            );
        }
    }

    private async createTerminalLifecyclePatch(
        goal: Goal,
        factCount: number,
        control?: ExecutionControl,
    ): Promise<AcceptedMemoryPatchInput | undefined> {
        const session = await this.openWorkingMemorySession(goal, control);
        try {
            return this.normalizeDecisionPatch(
                goal,
                { kind: "fail", error: "Runtime terminal lifecycle cleanup" },
                session,
                factCount,
            );
        } finally {
            session.close();
        }
    }

    private validateDecisionForStage(
        goal: Goal,
        candidate: unknown,
        executionUnitId: string,
        control?: ExecutionControl,
    ): NormalizedExecution {
        let decision: AgentDecision;
        try {
            decision = validateAgentDecision(candidate);
        } catch (error) {
            if (error instanceof RunnerExecutionError && error.code === "INVALID_AGENT_DECISION") {
                throw createRunnerFeedbackError(error, goal, executionUnitId, "decide", "decision_semantics");
            }
            throw error;
        }
        if (decision.kind !== "tool_call") return { decision };

        let prepared: PreparedToolAction;
        try {
            prepared = prepareToolAction(
                goal,
                decision.action,
                this.toolRegistry,
                this.toolPolicy,
                true,
                control,
            );
            validateActionLifecycle(goal, prepared.action);
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            if (error instanceof RunnerExecutionError
                && (error.code === "TOOL_NOT_AUTHORIZED"
                    || error.code === "TOOL_NOT_FOUND"
                    || error.code === "INVALID_TOOL_INPUT")) {
                throw createRunnerFeedbackError(
                    error,
                    goal,
                    executionUnitId,
                    "decide",
                    error.code === "INVALID_TOOL_INPUT" ? "tool_input" : "tool_selection",
                );
            }
            if (error instanceof RunnerExecutionError && error.code === "INVALID_AGENT_DECISION") {
                throw createRunnerFeedbackError(error, goal, executionUnitId, "decide", "decision_semantics");
            }
            throw error;
        }
        return { decision: { ...decision, action: prepared.action }, preparedToolAction: prepared };
    }

    private validateEvidenceForStage(
        goal: Goal,
        decision: AgentDecision,
        session: WorkingMemorySession,
        executionUnitId: string,
    ): void {
        try {
            this.validateCompletionEvidence(goal, decision, session);
        } catch (error) {
            if (!(error instanceof RunnerExecutionError) || error.code !== "INVALID_AGENT_DECISION") throw error;
            if (decision.kind !== "complete") {
                throw createRunnerFeedbackError(error, goal, executionUnitId, "decide", "decision_semantics");
            }
            const validSequences = [...session.evidenceIndex.events.entries()]
                .filter(([, event]) => event.eventType === "tool_finished" || event.eventType === "observation_recorded")
                .map(([sequence]) => sequence);
            throw createRunnerFeedbackError(
                error,
                goal,
                executionUnitId,
                "decide",
                "completion_evidence",
                [`Valid committed evidence sequences: ${validSequences.join(", ") || "none"}.`],
            );
        }
    }

    private validateCompletionEvidence(
        goal: Goal,
        decision: AgentDecision,
        session: WorkingMemorySession,
    ): void {
        if (goal.state.workflow.phase !== "executing") {
            throw new RunnerExecutionError(
                "INVALID_AGENT_DECISION",
                "structured decisions require an executing Goal",
            );
        }

        const run = goal.state.run;
        const task = goal.state.run.approvedTask;
        if (decision.kind === "task_proposal" && (run.mode !== "plan" || task !== undefined)) {
            throw new RunnerExecutionError(
                "INVALID_AGENT_DECISION",
                "task_proposal is only allowed before approval in Plan Mode",
            );
        }
        if (decision.kind === "goal_plan_update" && !canUpdateGoalPlan(run.mode)) {
            throw new RunnerExecutionError(
                "INVALID_AGENT_DECISION",
                "goal_plan_update is not authorized in the current Run mode",
            );
        }

        if (run.mode === "plan" && task === undefined) {
            if (["complete", "wait", "fail"].includes(decision.kind)) {
                throw new RunnerExecutionError(
                    "INVALID_AGENT_DECISION",
                    `${decision.kind} is not allowed before a Plan task is approved`,
                );
            }
            return;
        }

        if (decision.kind !== "complete") return;

        if (run.mode === "normal") {
            if (!("evidenceSequences" in decision) || !Array.isArray(decision.evidenceSequences)) {
                throw new RunnerExecutionError(
                    "INVALID_AGENT_DECISION",
                    "normal complete must include evidenceSequences",
                );
            }
            if (decision.evidenceSequences.length > 0) {
                try {
                    session.validateEvidence(decision.evidenceSequences);
                } catch (error) {
                    throw new RunnerExecutionError(
                        "INVALID_AGENT_DECISION",
                        error instanceof Error ? error.message : String(error),
                    );
                }
            }

            const evidenceIndex = session.evidenceIndex;
            const hasBusinessObservation = [...evidenceIndex.events.values()].some((event) =>
                event.payload.type === "tool_finished",
            );
            if (hasBusinessObservation && decision.evidenceSequences.length === 0) {
                throw new RunnerExecutionError(
                    "INVALID_AGENT_DECISION",
                    "normal complete must cite current Run Tool/Observation evidence",
                );
            }
            return;
        }

        if (task === undefined) {
            throw new RunnerExecutionError(
                "INVALID_AGENT_DECISION",
                "Plan complete requires an approved Goal Task",
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

        const evidenceIndex = session.evidenceIndex;
        for (const item of evidence as readonly { readonly criterionIndex: number; readonly evidenceSequences: readonly number[] }[]) {
            const criterion = task.completionCriteria[item.criterionIndex];
            if (criterion?.acceptance !== undefined) {
                const { expectToolId, expectOutcome } = criterion.acceptance;
                if (expectToolId.startsWith("system_")) {
                    continue;
                }
                const hasMatch = item.evidenceSequences.some((seq) => {
                    const observation = resolveEvidenceObservation(seq, evidenceIndex);
                    return (
                        observation !== undefined
                        && observation.toolId === expectToolId
                        && observation.outcome === expectOutcome
                    );
                });
                if (!hasMatch) {
                    throw new RunnerExecutionError(
                        "INVALID_AGENT_DECISION",
                        `completion criterion ${item.criterionIndex} requires ${expectToolId} ${expectOutcome} observation, referenced evidence does not match`,
                    );
                }
            }
        }
    }

    private async commitDecision(
        goal: Goal,
        facts: readonly TrajectoryEventDraft[],
        acceptedPatch: AcceptedMemoryPatchInput | undefined,
        control?: ExecutionControl,
        modelContextFrame?: Omit<ModelContextFramePayload, "type"> & {
            readonly executionUnitId?: string;
            readonly stepIndex?: number;
        },
    ): Promise<Goal> {
        const result = await this.checkpointCommitter.commit(goal, {
            facts,
            ...(acceptedPatch === undefined ? {} : { acceptedPatch }),
            ...(control === undefined ? {} : { control }),
            ...(modelContextFrame === undefined ? {} : { modelContextFrame }),
        });
        this.publishCommittedEvents(result);
        this.publishCheckpointCommitted(result, facts);
        return result.goal;
    }

    private async commitStageCheckpoint(
        goal: Goal,
        facts: readonly TrajectoryEventDraft[],
        control: ExecutionControl | undefined,
        modelContextFrame?: Omit<ModelContextFramePayload, "type"> & {
            readonly executionUnitId?: string;
            readonly stepIndex?: number;
        },
    ): Promise<Goal> {
        try {
            if (this.trajectoryStore === undefined
                && facts.some((fact) => fact.eventType === "think_requested")) {
                throw new TrajectoryAppendError("Think checkpoints require an enabled Trajectory sink");
            }
            return await this.commitDecision(
                goal,
                facts,
                undefined,
                control,
                modelContextFrame,
            );
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            throw new StageCheckpointFailure(error);
        }
    }

    private async appendRepairAttempt(
        goal: Goal,
        input: StepExecutionInput,
        stage: ModelContextStage,
        inputBoundary: PendingThink["inputBoundary"],
        thinkRequestId: string | undefined,
        control?: ExecutionControl,
    ): Promise<{ readonly goal: Goal; readonly pending: PendingModelRepair }> {
        const previous = goal.state.run.pendingModelRepair;
        if (previous !== undefined && (
            previous.goalId !== goal.id
            || previous.runId !== goal.state.run.id
            || previous.stepOrdinal !== goal.state.run.stepCount + 1
            || previous.executionUnitId !== input.executionUnitId
            || previous.stage !== stage
            || previous.inputBoundary !== inputBoundary
            || previous.thinkRequestId !== thinkRequestId
        )) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Pending model repair identity does not match the current stage");
        }
        const attempt = (previous?.attemptsStarted ?? 0) + 1;
        if (attempt > 3) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Model output correction exhausted after three calls");
        }
        if (this.trajectoryStore === undefined) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Model output correction requires a Trajectory store");
        }
        const draft: TrajectoryEventDraft = {
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            ...(input.executionUnitId === undefined ? {} : { executionUnitId: input.executionUnitId }),
            stepIndex: goal.state.run.stepCount + 1,
            eventType: "model_repair_attempt_started",
            payload: {
                type: "model_repair_attempt_started",
                stage,
                attempt,
                inputBoundary,
                ...(thinkRequestId === undefined ? {} : { thinkRequestId }),
            },
        };
        const event = await this.checkpointCommitter.append(draft, control);
        if (event?.eventType !== "model_repair_attempt_started") {
            throw new TrajectoryAppendError("Model repair attempts require an enabled Trajectory sink");
        }
        const pending: PendingModelRepair = {
            goalId: goal.id,
            runId: goal.state.run.id,
            stepOrdinal: goal.state.run.stepCount + 1,
            executionUnitId: input.executionUnitId ?? "unbound",
            stage,
            inputBoundary,
            attemptsStarted: attempt,
            latestAttemptEventId: event.eventId,
            ...(previous?.latestFeedbackEventId === undefined
                ? {}
                : { latestFeedbackEventId: previous.latestFeedbackEventId }),
            ...(thinkRequestId === undefined ? {} : { thinkRequestId }),
        };
        const nextGoal = this.withRun(goal, {
            ...goal.state.run,
            pendingModelRepair: pending,
        });
        const savedGoal = await this.commitStageCheckpoint(nextGoal, [], control);
        const committed = { goal: savedGoal, events: [event] };
        this.publishCommittedEvents(committed);
        this.publishCheckpointCommitted(committed, [draft]);
        return { goal: savedGoal, pending };
    }

    private async appendRepairFeedback(
        goal: Goal,
        pending: PendingModelRepair,
        feedback: RuntimeFeedback,
        control?: ExecutionControl,
    ): Promise<Goal> {
        const draft: TrajectoryEventDraft = {
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId: pending.executionUnitId,
            stepIndex: pending.stepOrdinal,
            eventType: "model_repair_feedback_recorded",
            payload: {
                type: "model_repair_feedback_recorded",
                stage: pending.stage,
                attempt: pending.attemptsStarted,
                feedback,
            },
        };
        const event = await this.checkpointCommitter.append(draft, control);
        if (event?.eventType !== "model_repair_feedback_recorded") {
            throw new TrajectoryAppendError("Model repair feedback requires an enabled Trajectory sink");
        }
        const nextPending: PendingModelRepair = {
            ...pending,
            latestFeedbackEventId: event.eventId,
        };
        const nextGoal = this.withRun(goal, {
            ...goal.state.run,
            pendingModelRepair: nextPending,
        });
        const savedGoal = await this.commitStageCheckpoint(nextGoal, [], control);
        const committed = { goal: savedGoal, events: [event] };
        this.publishCommittedEvents(committed);
        this.publishCheckpointCommitted(committed, [draft]);
        return savedGoal;
    }

    private async readRepairFeedback(
        goal: Goal,
        pending: PendingModelRepair | undefined,
        control?: ExecutionControl,
    ): Promise<RuntimeFeedback | undefined> {
        if (pending?.latestFeedbackEventId === undefined) return undefined;
        if (this.trajectoryStore === undefined) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Cannot restore model repair feedback without Trajectory");
        }
        const result = await this.trajectoryStore.readWithBoundary(
            { goalId: goal.id, runId: goal.state.run.id },
            goal.state.run.committedThroughSequence,
        );
        const matches = result.committed.filter((event) =>
            event.eventType === "model_repair_feedback_recorded"
            && event.eventId === pending.latestFeedbackEventId,
        );
        if (matches.length !== 1) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Pending model repair feedback is missing or duplicated");
        }
        const event = matches[0]!;
        if (event.eventType !== "model_repair_feedback_recorded"
            || event.goalId !== goal.id
            || event.runId !== goal.state.run.id
            || event.executionUnitId !== pending.executionUnitId
            || event.stepIndex !== pending.stepOrdinal
            || event.payload.stage !== pending.stage
            || event.payload.feedback.goalId !== goal.id
            || event.payload.feedback.runId !== goal.state.run.id
            || event.payload.feedback.executionUnitId !== pending.executionUnitId
            || event.payload.feedback.stepOrdinal !== pending.stepOrdinal
            || event.payload.feedback.stage !== pending.stage) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Pending model repair feedback identity is invalid");
        }
        throwIfAborted(control);
        return event.payload.feedback;
    }

    private async executeRepairableModelStage<T, U>(
        goal: Goal,
        input: StepExecutionInput,
        stage: ModelContextStage,
        inputBoundary: PendingThink["inputBoundary"],
        thinkRequestId: string | undefined,
        operation: (goal: Goal, feedback: RuntimeFeedback | undefined) => Promise<T>,
        validate: (goal: Goal, value: T) => U,
        control?: ExecutionControl,
    ): Promise<{ readonly goal: Goal; readonly result: U }> {
        let currentGoal = goal;
        let pending = currentGoal.state.run.pendingModelRepair;
        if (pending !== undefined && pending.stage !== stage) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Pending model repair stage does not match the requested stage");
        }
        let feedback = await this.readRepairFeedback(currentGoal, pending, control);
        while (true) {
            throwIfAborted(control);
            const started = await this.appendRepairAttempt(
                currentGoal,
                input,
                stage,
                inputBoundary,
                thinkRequestId,
                control,
            );
            currentGoal = started.goal;
            pending = started.pending;
            try {
                const value = await this.executeModelStage(
                    () => operation(currentGoal, feedback),
                    control,
                    async (attempt, error) => {
                        currentGoal = await this.recordModelRequestFailure(currentGoal, input, stage, attempt, error, control);
                    },
                );
                return { goal: currentGoal, result: validate(currentGoal, value) };
            } catch (error) {
                if (isExecutionAbortedError(error)) throw error;
                if (error instanceof StageCheckpointFailure) throw error;
                if (!(error instanceof ModelStageFeedbackError)) throw new StageExecutionFailure(error);
                if (error.feedback.stage !== stage
                    || error.feedback.goalId !== currentGoal.id
                    || error.feedback.runId !== currentGoal.state.run.id
                    || error.feedback.stepOrdinal !== currentGoal.state.run.stepCount + 1
                    || error.feedback.executionUnitId !== input.executionUnitId) {
                    throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Model repair feedback identity does not match the current stage");
                }
                feedback = createRuntimeFeedback({ ...error.feedback, attempt: pending.attemptsStarted });
                currentGoal = await this.appendRepairFeedback(currentGoal, pending, feedback, control);
                if (pending.attemptsStarted >= 3) {
                    throw new RunnerExecutionError(
                        "INVALID_AGENT_DECISION",
                        "Model output correction exhausted after three " + stage + " calls (" + feedback.code + ")",
                    );
                }
            }
        }
    }

    private createRepairInputBoundary(
        baseBoundary: string,
        stage: ModelContextStage,
        thinkRequestId?: string,
        thinkGoal?: string,
    ): PendingThink["inputBoundary"] {
        const identity = JSON.stringify(canonicalizeBoundaryValue({
            baseBoundary,
            stage,
            thinkRequestId,
            thinkGoal,
        }));
        return ("sha256:" + createHash("sha256").update(identity, "utf8").digest("hex")) as PendingThink["inputBoundary"];
    }

    private async commitThinkRequestForRepair(
        goal: Goal,
        fact: Extract<TrajectoryEventDraft, { readonly eventType: "think_requested" }>,
        input: StepExecutionInput,
        baseBoundary: string,
        modelContextFrame: Omit<ModelContextFramePayload, "type"> & {
            readonly executionUnitId?: string;
            readonly stepIndex?: number;
        } | undefined,
        control?: ExecutionControl,
    ): Promise<{ readonly goal: Goal; readonly requestEventId: string }> {
        if (this.trajectoryStore === undefined) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Think recovery requires an enabled Trajectory store");
        }
        const event = await this.checkpointCommitter.append(fact, control);
        if (event?.eventType !== "think_requested") {
            throw new TrajectoryAppendError("Think repair requires a committed Think request event");
        }
        const boundary = this.createRepairInputBoundary(
            baseBoundary,
            "think",
            event.payload.requestId,
            event.payload.goal,
        );
        const pending: PendingModelRepair = {
            goalId: goal.id,
            runId: goal.state.run.id,
            stepOrdinal: goal.state.run.stepCount + 1,
            executionUnitId: input.executionUnitId ?? "unbound",
            stage: "think",
            inputBoundary: boundary,
            attemptsStarted: 0,
            latestAttemptEventId: event.eventId,
            thinkRequestId: event.payload.requestId,
        };
        const checkpointGoal = this.withRun(goal, {
            ...goal.state.run,
            pendingModelRepair: pending,
        });
        const savedGoal = await this.commitStageCheckpoint(
            checkpointGoal,
            [],
            control,
            modelContextFrame,
        );
        const committed = { goal: savedGoal, events: [event] };
        this.publishCommittedEvents(committed);
        this.publishCheckpointCommitted(committed, [fact]);
        return { goal: savedGoal, requestEventId: event.payload.requestId };
    }

    private async restoreThinkRequest(
        goal: Goal,
        pending: PendingModelRepair,
        baseBoundary: PendingThink["inputBoundary"],
        control?: ExecutionControl,
    ): Promise<Extract<TrajectoryEvent, { readonly eventType: "think_requested" }>> {
        if (this.trajectoryStore === undefined || pending.thinkRequestId === undefined) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Pending Think repair has no restorable request");
        }
        const result = await this.trajectoryStore.readWithBoundary(
            { goalId: goal.id, runId: goal.state.run.id },
            goal.state.run.committedThroughSequence,
        );
        const matches = result.committed.filter((event) =>
            event.eventType === "think_requested"
            && event.payload.requestId === pending.thinkRequestId,
        );
        if (matches.length !== 1) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Pending Think request is missing or duplicated");
        }
        const event = matches[0]!;
        if (event.eventType !== "think_requested"
            || event.goalId !== goal.id
            || event.runId !== goal.state.run.id
            || event.executionUnitId !== pending.executionUnitId
            || event.stepIndex !== pending.stepOrdinal
            || event.payload.stepOrdinal !== pending.stepOrdinal
            || event.payload.requestId !== pending.thinkRequestId
            || pending.inputBoundary !== this.createRepairInputBoundary(
                baseBoundary,
                "think",
                event.payload.requestId,
                event.payload.goal,
            )) {
            throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Pending Think request identity is invalid");
        }
        throwIfAborted(control);
        return event;
    }

    private async executeThinkRepair(
        goal: Goal,
        input: StepExecutionInput,
        request: Extract<TrajectoryEvent, { readonly eventType: "think_requested" }>,
        baseBoundary: PendingThink["inputBoundary"],
        thinkHistory: ThinkExchange[],
        control?: ExecutionControl,
    ): Promise<{ readonly goal: Goal; readonly exchange: ThinkExchange }> {
        const repairBoundary = this.createRepairInputBoundary(
            baseBoundary,
            "think",
            request.payload.requestId,
            request.payload.goal,
        );
        const executed = await this.executeRepairableModelStage(
            goal,
            input,
            "think",
            repairBoundary,
            request.payload.requestId,
            (activeGoal, runtimeFeedback) => this.executor.think!({
                ...input,
                goal: activeGoal,
                thinkGoal: request.payload.goal,
                thinkHistory,
                ...(runtimeFeedback === undefined ? {} : { runtimeFeedback }),
            }),
            (activeGoal, result) => {
                if (result.goal.trim() !== request.payload.goal
                    || (result.modelContextFrame?.stage !== undefined
                        && result.modelContextFrame.stage !== "think")
                    || result.output.trim().length === 0) {
                    throw createRunnerFeedbackError(
                        new RunnerExecutionError("INVALID_AGENT_DECISION", "Think output does not satisfy the requested goal contract"),
                        activeGoal,
                        input.executionUnitId ?? "unbound",
                        "think",
                        "output_contract",
                    );
                }
                return result;
            },
            control,
        );
        const output = executed.result.output.trim();
        const completedFact: TrajectoryEventDraft = {
            goalId: executed.goal.id,
            runId: executed.goal.state.run.id,
            phase: "executing",
            executionUnitId: input.executionUnitId ?? "unbound",
            stepIndex: request.payload.stepOrdinal,
            ...(executed.goal.state.run.pendingThink === undefined
                ? {}
                : { parentEventId: executed.goal.state.run.pendingThink.latestThinkEventId }),
            eventType: "think_completed",
            payload: {
                type: "think_completed",
                requestId: request.payload.requestId,
                stepOrdinal: request.payload.stepOrdinal,
                goal: request.payload.goal,
                output,
            },
        };
        const nextGoal = await this.commitThinkCompletion(
            executed.goal,
            completedFact as Extract<TrajectoryEventDraft, { readonly eventType: "think_completed" }>,
            request.payload.stepOrdinal,
            request.executionUnitId ?? "unbound",
            baseBoundary,
            control,
            executed.result.modelContextFrame === undefined
                ? undefined
                : {
                    ...executed.result.modelContextFrame,
                    executionUnitId: input.executionUnitId ?? "unbound",
                    stepIndex: request.payload.stepOrdinal,
                },
        );
        return {
            goal: nextGoal,
            exchange: {
                requestId: request.payload.requestId,
                goal: request.payload.goal,
                output,
            },
        };
    }

    private async commitThinkCompletion(
        goal: Goal,
        fact: Extract<TrajectoryEventDraft, { readonly eventType: "think_completed" }>,
        stepOrdinal: number,
        executionUnitId: string,
        inputBoundary: `sha256:${string}`,
        control: ExecutionControl | undefined,
        modelContextFrame?: Omit<ModelContextFramePayload, "type"> & {
            readonly executionUnitId?: string;
            readonly stepIndex?: number;
        },
    ): Promise<Goal> {
        try {
            const event = await this.checkpointCommitter.append(fact, control);
            if (event?.eventType !== "think_completed") {
                throw new TrajectoryAppendError("Think checkpoints require an enabled Trajectory sink");
            }
            const pendingThink: PendingThink = {
                goalId: goal.id,
                runId: goal.state.run.id,
                stepOrdinal,
                executionUnitId,
                inputBoundary,
                latestThinkEventId: event.eventId,
            };
            const { pendingModelRepair: _pendingModelRepair, ...runWithoutRepair } = goal.state.run;
            const checkpointGoal = this.withRun(goal, {
                ...runWithoutRepair,
                pendingThink,
            });
            const savedGoal = await this.commitStageCheckpoint(
                checkpointGoal,
                [],
                control,
                modelContextFrame,
            );
            const committed = { goal: savedGoal, events: [event] };
            this.publishCommittedEvents(committed);
            this.publishCheckpointCommitted(committed, [fact]);
            return savedGoal;
        } catch (error) {
            if (error instanceof StageCheckpointFailure) throw error;
            if (isExecutionAbortedError(error)) throw error;
            throw new StageCheckpointFailure(error);
        }
    }

    private async restoreThinkHistory(
        goal: Goal,
        stepOrdinal: number,
        executionUnitId: string,
        inputBoundary: `sha256:${string}`,
        control?: ExecutionControl,
    ): Promise<ThinkExchange[]> {
        const pendingThink = goal.state.run.pendingThink;
        if (this.trajectoryStore === undefined) {
            if (pendingThink !== undefined) {
                invalidAgentDecision("Cannot restore a Think chain without its Trajectory store");
            }
            return [];
        }

        let committed: readonly TrajectoryEvent[];
        try {
            throwIfAborted(control);
            const result = await this.trajectoryStore.readWithBoundary(
                { goalId: goal.id, runId: goal.state.run.id },
                goal.state.run.committedThroughSequence,
            );
            if (result.committed.some((event) =>
                event.goalId !== goal.id || event.runId !== goal.state.run.id,
            )) {
                invalidAgentDecision("Committed Think history contains a foreign Goal or Run event");
            }
            committed = result.committed.filter((event) =>
                event.sequence <= goal.state.run.committedThroughSequence,
            );
            throwIfAborted(control);
        } catch (error) {
            if (isExecutionAbortedError(error)) throw error;
            if (error instanceof RunnerExecutionError) throw error;
            throw new StageCheckpointFailure(error);
        }

        const stepCompletions = committed.filter((event): event is Extract<
            TrajectoryEvent,
            { readonly eventType: "think_completed" }
        > =>
            event.eventType === "think_completed"
            && event.payload.stepOrdinal === stepOrdinal,
        );
        if (pendingThink === undefined) {
            // Without a Snapshot pointer, no output may seed a resumed stage chain.
            // This also excludes an append-only tail that a later commit may have crossed.
            return [];
        }

        const pendingThinkMismatch = [
            pendingThink.goalId !== goal.id ? "Goal" : undefined,
            pendingThink.runId !== goal.state.run.id ? "Run" : undefined,
            pendingThink.stepOrdinal !== stepOrdinal ? "Step" : undefined,
            pendingThink.executionUnitId !== executionUnitId ? "execution unit" : undefined,
            pendingThink.inputBoundary !== inputBoundary ? "input boundary" : undefined,
        ].filter((value): value is string => value !== undefined);
        if (pendingThinkMismatch.length > 0) {
            invalidAgentDecision(`Pending Think identity does not match the current execution: ${pendingThinkMismatch.join(", ")}`);
        }

        const completions = stepCompletions.filter((event) =>
            event.executionUnitId === executionUnitId && event.stepIndex === stepOrdinal,
        );
        const completionById = new Map(completions.map((event) => [event.eventId, event]));
        const requests = committed.filter((event): event is Extract<
            TrajectoryEvent,
            { readonly eventType: "think_requested" }
        > =>
            event.eventType === "think_requested"
            && event.executionUnitId === executionUnitId
            && event.stepIndex === stepOrdinal
            && event.payload.stepOrdinal === stepOrdinal,
        );
        const requestById = new Map<string, typeof requests>();
        for (const request of requests) {
            if (requestById.has(request.payload.requestId)) {
                invalidAgentDecision("Think request ID is duplicated inside the committed Step chain");
            }
            requestById.set(request.payload.requestId, [request]);
            if (request.parentEventId !== undefined && !completionById.has(request.parentEventId)) {
                invalidAgentDecision("Think request points outside its committed Step chain");
            }
        }

        const reverseChain: Extract<TrajectoryEvent, { readonly eventType: "think_completed" }>[] = [];
        const visited = new Set<string>();
        let currentEventId: string | undefined = pendingThink.latestThinkEventId;
        while (currentEventId !== undefined) {
            if (visited.has(currentEventId)) {
                invalidAgentDecision("Committed Think chain contains a parent cycle");
            }
            visited.add(currentEventId);
            const completion = completionById.get(currentEventId);
            if (completion === undefined) {
                invalidAgentDecision("Pending Think pointer references a missing or uncommitted output");
            }
            const matchingRequests = requestById.get(completion.payload.requestId);
            if (matchingRequests === undefined || matchingRequests.length !== 1) {
                invalidAgentDecision("Committed Think output has no unique matching request");
            }
            const request = matchingRequests[0]!;
            if (
                completion.goalId !== goal.id
                || completion.runId !== goal.state.run.id
                || completion.phase !== "executing"
                || completion.payload.stepOrdinal !== stepOrdinal
                || completion.stepIndex !== stepOrdinal
                || request.goalId !== completion.goalId
                || request.runId !== completion.runId
                || request.phase !== completion.phase
                || request.payload.goal !== completion.payload.goal
                || request.payload.stepOrdinal !== completion.payload.stepOrdinal
                || request.parentEventId !== completion.parentEventId
                || request.sequence >= completion.sequence
            ) {
                invalidAgentDecision("Think request and output identities do not match");
            }
            reverseChain.push(completion);
            if (completion.parentEventId !== undefined) {
                const parent = completionById.get(completion.parentEventId);
                if (parent === undefined || parent.sequence >= completion.sequence) {
                    invalidAgentDecision("Think output parent is missing or out of order");
                }
            }
            currentEventId = completion.parentEventId;
        }

        // Only the Snapshot pointer's parent chain is recoverable. Disconnected facts can
        // be append-only tails from an interrupted attempt and never seed this history.
        return reverseChain.reverse().map((completion) => ({
            requestId: completion.payload.requestId,
            goal: completion.payload.goal,
            output: completion.payload.output,
        }));
    }

    private publishCommittedEvents(result: TrajectoryCheckpointCommitResult): void {
        for (const event of result.events) {
            const executionUnitId = event.executionUnitId;
            const actionId = event.actionId;
            this.publishExecutionEvent(result.goal, {
                ...(executionUnitId === undefined ? {} : { executionUnitId }),
                ...(actionId === undefined ? {} : { actionId }),
                kind: event.eventType,
                visibility: "public",
                durability: "checkpoint",
                delivery: isStreamDeltaKind(event.eventType) ? "delta" : "control",
                ...(isStreamDeltaKind(event.eventType)
                    ? { coalescingKey: streamCoalescingKey(executionUnitId, actionId, event.eventType) }
                    : {}),
                payload: event.payload as unknown as StreamJsonValue,
            });
        }
    }

    private publishCheckpointCommitted(
        result: TrajectoryCheckpointCommitResult,
        facts: readonly TrajectoryEventDraft[],
    ): void {
        const firstFact = facts.find((fact) => fact.executionUnitId !== undefined);
        if (firstFact === undefined) return;
        this.publishExecutionEvent(result.goal, {
            ...(firstFact.executionUnitId === undefined ? {} : { executionUnitId: firstFact.executionUnitId }),
            ...(firstFact.actionId === undefined ? {} : { actionId: firstFact.actionId }),
            kind: "step_committed",
            visibility: "public",
            durability: "checkpoint",
            delivery: "control",
            payload: {
                committedThroughSequence: result.goal.state.run.committedThroughSequence,
                eventIds: result.events.map((event) => event.eventId),
                eventTypes: result.events.map((event) => event.eventType),
            },
        });
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

    private invalidContextLookup(message: string): RunnerResult {
        return {
            ok: false,
            error: {
                code: "INVALID_CONTEXT_LOOKUP",
                message,
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
            validated = prepareToolAction(
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

        if (validated.registration.replayPolicy === "safe") {
            return this.runLoop(
                goal,
                pendingAction.action.actionId,
                control,
                undefined,
                validated,
            );
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
                replayPolicy: validated.registration.replayPolicy,
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
        const lifecyclePatch = await this.createTerminalLifecyclePatch(
            goal,
            1,
            control,
        );
        const executionErrorFact: TrajectoryEventDraft = {
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
        };
        const failedRun = this.applyTransition(goal.state.run, {
            kind: "execution_error",
            code: error.code,
            message: error.message,
        });
        const failedGoal = this.withRun(goal, failedRun);
        const closedEpochFact = this.contextEpochClosedFact(failedGoal, "run_failed");

        const checkpoint = await this.commitDecision(
            failedGoal,
            [
                executionErrorFact,
                ...(closedEpochFact === undefined ? [] : [closedEpochFact]),
            ],
            lifecyclePatch,
            control,
        );
        return { ok: true, state: checkpoint.state.run };
    }

    private contextEpochClosedFact(
        goal: Goal,
        reason: "run_completed" | "run_failed" | "run_cancelled",
    ): TrajectoryEventDraft | undefined {
        const epoch = goal.state.run.contextEpoch;
        return {
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: goal.state.workflow.phase,
            eventType: "context_epoch_closed",
            payload: {
                type: "context_epoch_closed",
                epoch: toEpochRange(
                    epoch,
                    goal.state.messages.length,
                    goal.state.run.committedThroughSequence,
                ),
                reason,
            },
        };
    }

    private async executeToolAndObserve(
        goal: Goal,
        prepared: PreparedToolAction,
        executionUnitId: string,
        control?: ExecutionControl,
        plan?: SandboxExecutionPlan,
    ): Promise<
        | { readonly kind: "observed"; readonly goal: Goal }
        | { readonly kind: "stopped"; readonly result: RunnerResult }
    > {
        let observation: ToolObservation | undefined;
        const replaySafe = prepared.registration.replayPolicy === "safe";
        const effectivePlan = plan ?? prepared.plan;
        while (observation === undefined) {
            throwIfAborted(control);
            const pending = goal.state.run.pendingAction;
            if (pending === undefined || pending.status !== "approved"
                || pending.action.actionId !== prepared.action.actionId) {
                throw new RunnerExecutionError("INVALID_AGENT_DECISION", "Tool attempt lost its approved pending Action");
            }
            const attempt = (pending.attemptsStarted ?? 0) + 1;
            if (attempt > 3) {
                return {
                    kind: "stopped",
                    result: await this.stopWithExecutionError(
                        goal,
                        new RunnerExecutionError("TOOL_EXECUTION_ERROR", "Safe Tool retry limit exhausted after three calls"),
                        control,
                    ),
                };
            }
            const attemptFact: TrajectoryEventDraft = {
                goalId: goal.id,
                runId: goal.state.run.id,
                phase: "executing",
                executionUnitId,
                actionId: prepared.action.actionId,
                eventType: "tool_attempt_started",
                payload: { type: "tool_attempt_started", actionId: prepared.action.actionId, attempt },
            };
            const attemptGoal = this.withRun(goal, {
                ...goal.state.run,
                pendingAction: { ...pending, attemptsStarted: attempt },
            });
            const attemptCommit = await this.checkpointCommitter.commit(attemptGoal, {
                facts: [attemptFact],
                ...(control === undefined ? {} : { control }),
            });
            this.publishCommittedEvents(attemptCommit);
            this.publishCheckpointCommitted(attemptCommit, [attemptFact]);
            goal = attemptCommit.goal;

            try {
                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    executionUnitId,
                    actionId: prepared.action.actionId,
                    eventType: "tool_started",
                    payload: {
                        type: "tool_started",
                        actionId: prepared.action.actionId,
                        toolId: prepared.action.toolId,
                        input: prepared.action.input,
                    },
                }, control);
                const rawObservation = prepared.stream === undefined
                    ? await prepared.execute(control, effectivePlan)
                    : await this.consumeToolStream(goal, prepared, executionUnitId, control, effectivePlan);
                throwIfAborted(control);
                observation = validateToolObservation(rawObservation);
            } catch (error) {
                if (isExecutionAbortedError(error)) throw error;
                if (error instanceof TrajectoryAppendError) throw error;
                throwIfAborted(control);
                if (error instanceof TransientToolExecutionFailure && replaySafe) {
                    const failedFact: TrajectoryEventDraft = {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        actionId: prepared.action.actionId,
                        eventType: "tool_attempt_failed",
                        payload: {
                            type: "tool_attempt_failed",
                            actionId: prepared.action.actionId,
                            attempt,
                            reason: error.reason.slice(0, 120),
                            ...(error.retryAfterMs === undefined
                                ? {}
                                : { retryAfterMs: Math.min(30_000, Math.max(0, error.retryAfterMs)) }),
                        },
                    };
                    const failedCommit = await this.checkpointCommitter.commit(goal, {
                        facts: [failedFact],
                        ...(control === undefined ? {} : { control }),
                    });
                    this.publishCommittedEvents(failedCommit);
                    this.publishCheckpointCommitted(failedCommit, [failedFact]);
                    goal = failedCommit.goal;
                    if (attempt === 3) {
                        return {
                            kind: "stopped",
                            result: await this.stopWithExecutionError(
                                goal,
                                new RunnerExecutionError("TOOL_EXECUTION_ERROR", "Safe Tool retry limit exhausted after three calls"),
                                control,
                            ),
                        };
                    }
                    const delay = Math.min(30_000, Math.max(250 * 2 ** (attempt - 1), error.retryAfterMs ?? 0));
                    await waitForRetry(delay, control);
                    continue;
                }

                const message = error instanceof TransientToolExecutionFailure
                    ? error.reason
                    : error instanceof Error ? error.message : String(error);
                const toolError = error instanceof RunnerExecutionError
                    ? error
                    : new RunnerExecutionError("TOOL_EXECUTION_ERROR", message);
                if (!replaySafe) {
                    const failedFact: TrajectoryEventDraft = {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        actionId: prepared.action.actionId,
                        eventType: "tool_attempt_failed",
                        payload: {
                            type: "tool_attempt_failed",
                            actionId: prepared.action.actionId,
                            attempt,
                            reason: "outcome_unknown",
                        },
                    };
                    const waitingRun = this.applyTransition(goal.state.run, {
                        kind: "tool_outcome_unknown",
                        actionId: prepared.action.actionId,
                    });
                    const waitingGoal = this.withRun(goal, waitingRun);
                    const waitingCommit = await this.commitDecision(waitingGoal, [failedFact], undefined, control);
                    return { kind: "stopped", result: { ok: true, state: waitingCommit.state.run } };
                }
                return {
                    kind: "stopped",
                    result: await this.stopWithExecutionError(goal, toolError, control),
                };
            }
        }

        throwIfAborted(control);
        const toolFinishedEvent = await this.appendTrajectory({
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId,
            actionId: prepared.action.actionId,
            eventType: "tool_finished",
            payload: {
                type: "tool_finished",
                actionId: prepared.action.actionId,
                toolId: prepared.action.toolId,
                observation,
            },
        }, control);
        const projectorPatch = toolFinishedEvent === undefined
            ? undefined
            : await this.projectToolMemoryPatch(
                goal,
                prepared.action,
                observation,
                toolFinishedEvent.sequence,
                control,
            );
        const observedRun = this.applyTransition(goal.state.run, {
            kind: "observe_action",
            actionId: prepared.action.actionId,
            observation,
        });
        const observedGoal = this.withRun(goal, observedRun);

        // Observation、Projector Patch 与 Snapshot 共用提交边界；Projector 失败只会
        // 省略 accepted Patch，原始 Observation 仍然提交。
        const committed = await this.checkpointCommitter.commit(observedGoal, {
            facts: [{
                goalId: goal.id,
                runId: goal.state.run.id,
                phase: "executing",
                executionUnitId,
                actionId: prepared.action.actionId,
                eventType: "observation_recorded",
                payload: {
                    type: "observation_recorded",
                    actionId: prepared.action.actionId,
                    observation,
                },
            }],
            ...(projectorPatch === undefined ? {} : { acceptedPatch: projectorPatch }),
            ...(control === undefined ? {} : { control }),
        });
        this.publishCommittedEvents(committed);
        this.publishCheckpointCommitted(committed, [{
            goalId: goal.id,
            runId: goal.state.run.id,
            phase: "executing",
            executionUnitId,
            actionId: prepared.action.actionId,
            eventType: "observation_recorded",
            payload: {
                type: "observation_recorded",
                actionId: prepared.action.actionId,
                observation,
            },
        }]);
        const checkpoint = committed.goal;
        return { kind: "observed", goal: checkpoint };
    }

    private async consumeToolStream(
        goal: Goal,
        prepared: PreparedToolAction,
        executionUnitId: string,
        control?: ExecutionControl,
        plan?: SandboxExecutionPlan,
    ): Promise<ToolObservation> {
        const stream = prepared.stream;
        if (stream === undefined) {
            return prepared.execute(control, plan);
        }

        let observation: ToolObservation | undefined;
        for await (const event of stream(control, plan)) {
            throwIfAborted(control);
            if (event.kind === "output") {
                if (event.text.length === 0) continue;
                this.publishExecutionEvent(goal, {
                    executionUnitId,
                    actionId: prepared.action.actionId,
                    kind: "tool_output_delta",
                    visibility: "diagnostic",
                    durability: "live",
                    delivery: "delta",
                    coalescingKey: `tool:${prepared.action.actionId}:${event.channel}`,
                    payload: {
                        channel: event.channel,
                        text: event.text,
                    },
                });
                continue;
            }

            if (observation !== undefined) {
                throw new RunnerExecutionError(
                    "TOOL_EXECUTION_ERROR",
                    "Tool stream returned more than one completed Observation",
                );
            }
            observation = validateToolObservation(event.observation);
        }

        if (observation === undefined) {
            throw new RunnerExecutionError(
                "TOOL_EXECUTION_ERROR",
                "Tool stream completed without an Observation",
            );
        }
        return observation;
    }

    private async runLoop(
        initialGoal: Goal,
        authorizedActionId?: string,
        control?: ExecutionControl,
        initialContextLookupResult?: ContextLookupResult,
        initialPreparedAction?: PreparedToolAction,
        initialSandboxPlan?: SandboxExecutionPlan,
    ): Promise<RunnerResult> {
        let goal = initialGoal;
        let transientAuthorization = authorizedActionId;
        let transientSandboxPlan = initialSandboxPlan;
        let contextLookupResult = initialContextLookupResult;
        let preparedAction = initialPreparedAction;
        let contextLookupChainCount = await this.restoreContextLookupChainCount(goal, control);

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

                let effectivePlan: SandboxExecutionPlan | undefined = undefined;
                if (
                    transientSandboxPlan !== undefined
                    && (transientSandboxPlan.actionId === undefined || transientSandboxPlan.actionId === pendingAction.action.actionId)
                    && (this.workspaceRoot === undefined || transientSandboxPlan.workspaceRoot === this.workspaceRoot)
                ) {
                    effectivePlan = transientSandboxPlan;
                } else if (this.sandboxPlanResolver !== undefined && this.workspaceRoot !== undefined) {
                    effectivePlan = await this.sandboxPlanResolver({
                        workspaceRoot: this.workspaceRoot,
                        action: pendingAction.action,
                        effectiveScope: pendingAction.effectiveSandboxScope,
                    });
                }

                let validated: PreparedToolAction;

                try {
                    validated = preparedAction === undefined
                        ? prepareToolAction(
                            goal,
                            pendingAction.action,
                            this.toolRegistry,
                            this.toolPolicy,
                            false,
                            control,
                            effectivePlan,
                        )
                        : preparedAction;
                    preparedAction = undefined;
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
                    validated,
                    createExecutionUnitId(),
                    control,
                    effectivePlan,
                );
                transientAuthorization = undefined;
                transientSandboxPlan = undefined;

                if (outcome.kind === "stopped") {
                    return outcome.result;
                }

                goal = outcome.goal;
                contextLookupResult = undefined;
                contextLookupChainCount = 0;
                continue;
            }

            const maxSteps = goal.definition.executionPolicy.maxSteps;

            if (maxSteps > 0 && goal.state.run.stepCount >= maxSteps) {
                throwIfAborted(control);
                const lifecyclePatch = await this.createTerminalLifecyclePatch(
                    goal,
                    1,
                    control,
                );
                const failedGoal = this.withRun(goal, {
                    ...goal.state.run,
                    status: "failed",
                    stopReason: { kind: "max_steps_exceeded" },
                });
                const closedEpochFact = this.contextEpochClosedFact(failedGoal, "run_failed");
                const checkpoint = await this.commitDecision(
                    failedGoal,
                    [
                        {
                            goalId: goal.id,
                            runId: goal.state.run.id,
                            phase: "executing",
                            eventType: "run_failed",
                            payload: {
                                type: "run_failed",
                                code: "MAX_STEPS_EXCEEDED",
                                message: "The configured maximum step count was exceeded",
                            },
                        },
                        ...(closedEpochFact === undefined ? [] : [closedEpochFact]),
                    ],
                    lifecyclePatch,
                    control,
                );
                return { ok: true, state: checkpoint.state.run };
            }

            const executionUnitId = goal.state.run.pendingThink?.executionUnitId
                ?? goal.state.run.pendingModelRepair?.executionUnitId
                ?? createExecutionUnitId();
            const session = await this.openWorkingMemorySession(goal, control);

            this.publishExecutionEvent(goal, {
                executionUnitId,
                kind: "step_started",
                visibility: "public",
                durability: "live",
                delivery: "control",
                payload: {
                    stepCount: goal.state.run.stepCount + 1,
                },
            });

            try {
                let normalized: NormalizedExecution;
                let pendingThinkRequestCommitted = false;
                try {
                    throwIfAborted(control);
                    const tools = this.getAuthorizedToolDefinitions(goal, control);
                    const stepInput: StepExecutionInput = {
                        goal,
                        authorizedTools: tools,
                        ...(session === undefined
                            ? {}
                            : { workingMemory: session.workingMemory }),
                        ...(control === undefined ? {} : { control }),
                        ...(contextLookupResult === undefined
                            ? {}
                            : { contextLookupResult }),
                        executionUnitId,
                        ...(this.executionStream === undefined
                            ? {}
                            : { executionStream: this.executionStream }),
                    };
                    const supportsStages = this.executor.decide !== undefined
                        && this.executor.think !== undefined;
                    if ((this.executor.decide === undefined) !== (this.executor.think === undefined)) {
                        throw invalidAgentDecision("StepExecutor must provide both decide() and think() for staged execution");
                    }

                    const stepOrdinal = goal.state.run.stepCount + 1;
                    const thinkInputBoundary = createThinkInputBoundary(stepInput, stepOrdinal);
                    if (supportsStages) {
                        const thinkHistory = await this.restoreThinkHistory(
                            goal,
                            stepOrdinal,
                            executionUnitId,
                            thinkInputBoundary,
                            control,
                        );
                        const pendingRepair = goal.state.run.pendingModelRepair;
                        if (pendingRepair?.stage === "think") {
                            const request = await this.restoreThinkRequest(
                                goal,
                                pendingRepair,
                                thinkInputBoundary,
                                control,
                            );
                            const recoveredThink = await this.executeThinkRepair(
                                goal,
                                stepInput,
                                request,
                                thinkInputBoundary,
                                thinkHistory,
                                control,
                            );
                            goal = recoveredThink.goal;
                            thinkHistory.push(recoveredThink.exchange);
                            pendingThinkRequestCommitted = false;
                        }

                        while (true) {
                            throwIfAborted(control);
                            const decideBoundary = this.createRepairInputBoundary(
                                thinkInputBoundary,
                                "decide",
                                goal.state.run.pendingThink?.latestThinkEventId,
                            );
                            const decided = await this.executeRepairableModelStage(
                                goal,
                                stepInput,
                                "decide",
                                decideBoundary,
                                undefined,
                                (activeGoal, runtimeFeedback) => this.executor.decide!({
                                    ...stepInput,
                                    goal: activeGoal,
                                    thinkHistory,
                                    ...(runtimeFeedback === undefined ? {} : { runtimeFeedback }),
                                }),
                                (activeGoal, result) => {
                                    if (result.modelContextFrame !== undefined
                                        && result.modelContextFrame.stage !== "decide") {
                                        throw createRunnerFeedbackError(
                                            new RunnerExecutionError("INVALID_AGENT_DECISION", "Decide frame stage is invalid"),
                                            activeGoal,
                                            executionUnitId,
                                            "decide",
                                            "output_contract",
                                        );
                                    }
                                    if (result.kind === "request_think") {
                                        const thinkGoal = result.goal.trim();
                                        if (thinkGoal.length === 0) {
                                            throw createRunnerFeedbackError(
                                                new RunnerExecutionError("INVALID_AGENT_DECISION", "Think goal must not be blank"),
                                                activeGoal,
                                                executionUnitId,
                                                "decide",
                                                "decision_semantics",
                                            );
                                        }
                                        return { stageResult: { ...result, goal: thinkGoal } };
                                    }
                                    const normalizedDecision = this.validateDecisionForStage(
                                        activeGoal,
                                        result.decision,
                                        executionUnitId,
                                        control,
                                    );
                                    this.validateEvidenceForStage(
                                        activeGoal,
                                        normalizedDecision.decision,
                                        session,
                                        executionUnitId,
                                    );
                                    return {
                                        stageResult: {
                                            ...result,
                                            decision: normalizedDecision.decision,
                                        },
                                        ...(normalizedDecision.preparedToolAction === undefined
                                            ? {}
                                            : { preparedToolAction: normalizedDecision.preparedToolAction }),
                                    };
                                },
                                control,
                            );
                            goal = decided.goal;
                            const stageResult = decided.result.stageResult;

                            if (stageResult.kind === "request_think") {
                                const requestId = randomUUID();
                                const requestedFact: TrajectoryEventDraft = {
                                    goalId: goal.id,
                                    runId: goal.state.run.id,
                                    phase: "executing",
                                    executionUnitId,
                                    stepIndex: stepOrdinal,
                                    ...(goal.state.run.pendingThink === undefined
                                        ? {}
                                        : { parentEventId: goal.state.run.pendingThink.latestThinkEventId }),
                                    eventType: "think_requested",
                                    payload: {
                                        type: "think_requested",
                                        requestId,
                                        stepOrdinal,
                                        goal: stageResult.goal,
                                    },
                                };
                                const requested = await this.commitThinkRequestForRepair(
                                    goal,
                                    requestedFact as Extract<TrajectoryEventDraft, { readonly eventType: "think_requested" }>,
                                    stepInput,
                                    thinkInputBoundary,
                                    stageResult.modelContextFrame === undefined
                                        ? undefined
                                        : {
                                            ...stageResult.modelContextFrame,
                                            executionUnitId,
                                            stepIndex: stepOrdinal,
                                        },
                                    control,
                                );
                                goal = requested.goal;
                                pendingThinkRequestCommitted = true;
                                const request = await this.restoreThinkRequest(
                                    goal,
                                    goal.state.run.pendingModelRepair!,
                                    thinkInputBoundary,
                                    control,
                                );
                                const completedThink = await this.executeThinkRepair(
                                    goal,
                                    stepInput,
                                    request,
                                    thinkInputBoundary,
                                    thinkHistory,
                                    control,
                                );
                                goal = completedThink.goal;
                                pendingThinkRequestCommitted = false;
                                thinkHistory.push(completedThink.exchange);
                                continue;
                            }

                            if (stageResult.modelContextFrame !== undefined) {
                                goal = await this.commitStageCheckpoint(
                                    goal,
                                    [],
                                    control,
                                    {
                                        ...stageResult.modelContextFrame,
                                        executionUnitId,
                                        stepIndex: stepOrdinal,
                                    },
                                );
                            }
                            normalized = {
                                decision: stageResult.decision,
                                ...(!("preparedToolAction" in decided.result)
                                    || decided.result.preparedToolAction === undefined
                                    ? {}
                                    : { preparedToolAction: decided.result.preparedToolAction }),
                            };
                            break;
                        }
                    } else {
                        const repairBoundary = this.createRepairInputBoundary(thinkInputBoundary, "decide");
                        const executed = await this.executeRepairableModelStage(
                            goal,
                            stepInput,
                            "decide",
                            repairBoundary,
                            undefined,
                            (activeGoal, runtimeFeedback) => this.executor.execute({
                                ...stepInput,
                                goal: activeGoal,
                                ...(runtimeFeedback === undefined ? {} : { runtimeFeedback }),
                            }),
                            (activeGoal, execution) => {
                                const isResultObject = typeof execution === "object"
                                    && execution !== null
                                    && "decision" in execution;
                                const extractedDecision = isResultObject ? (execution as any).decision : execution;
                                const extractedThought = isResultObject && typeof (execution as any).thought === "string"
                                    ? (execution as any).thought
                                    : undefined;
                                const validated = this.validateDecisionForStage(
                                    activeGoal,
                                    extractedDecision,
                                    executionUnitId,
                                    control,
                                );
                                this.validateEvidenceForStage(activeGoal, validated.decision, session, executionUnitId);
                                return {
                                    ...validated,
                                    ...(extractedThought === undefined ? {} : { thought: extractedThought }),
                                };
                            },
                            control,
                        );
                        goal = executed.goal;
                        normalized = executed.result;
                    }
                } catch (error) {
                    if (isExecutionAbortedError(error)) {
                        throw error;
                    }

                    if (error instanceof StageCheckpointFailure) {
                        throw error.original;
                    }

                    throwIfAborted(control);

                    const stableError = toStableExecutionError(error);
                    if (stableError !== undefined) {
                        return this.stopWithExecutionError(goal, stableError, control);
                    }
                    if (error instanceof ContextLookupProtocolError) {
                        return this.invalidContextLookup(error.message);
                    }
                    if (error instanceof StageExecutionFailure) {
                        const stageError = toStableExecutionError(error.original);
                        if (stageError !== undefined) {
                            return this.stopWithExecutionError(goal, stageError, control);
                        }
                        if (goal.state.run.pendingThink !== undefined
                            || goal.state.run.pendingModelRepair !== undefined
                            || pendingThinkRequestCommitted) {
                            throw error.original;
                        }
                        return this.stopWithExecutionError(
                            goal,
                            new RunnerExecutionError(
                                "INVALID_AGENT_DECISION",
                                error.message,
                            ),
                            control,
                        );
                    }

                    // 未批准任务时，当前协议尚未允许 fail Decision 形成执行 Step。
                    // 直接记录稳定执行错误，保持无任务快照仍满足 stepCount/lastStep 不变量。
                    if (goal.state.run.mode === "plan" && goal.state.run.approvedTask === undefined) {
                        return this.stopWithExecutionError(
                            goal,
                            new RunnerExecutionError(
                                "INVALID_AGENT_DECISION",
                                error instanceof Error ? error.message : String(error),
                            ),
                            control,
                        );
                    }

                    // 非协议 Executor 异常规范化为当前 fail Decision；错误文本保持
                    // 用户可见内容。
                    const decision: AgentDecision = {
                        kind: "fail",
                        error: error instanceof Error ? error.message : String(error),
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

                    const closedEpochFact = this.contextEpochClosedFact(nextGoal, "run_failed");
                    goal = await this.commitDecision(
                        nextGoal,
                        [
                            ...(closedEpochFact === undefined ? [] : [closedEpochFact]),
                        ],
                        undefined,
                        control,
                    );
                    contextLookupResult = undefined;
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

                if (normalized.decision.kind === "context_lookup") {
                    if (contextLookupChainCount >= 3) {
                        return {
                            ok: false,
                            error: {
                                code: "CONTEXT_LOOKUP_CHAIN_LIMIT",
                                message: `${CONTEXT_LOOKUP_CHAIN_LIMIT_CODE}: Executing lookup chain exceeds 3 queries`,
                            },
                        };
                    }

                    throwIfAborted(control);
                    let invocation;
                    try {
                        invocation = await invokeContextLookup({
                            goal,
                            request: normalized.decision,
                            phase: "executing",
                            ...(this.contextLookupPort === undefined
                                ? {}
                                : { port: this.contextLookupPort }),
                            executionUnitId,
                            ...(control === undefined ? {} : { control }),
                        });
                    } catch (error) {
                        if (error instanceof ContextLookupProtocolError) {
                            return this.invalidContextLookup(error.message);
                        }
                        throw error;
                    }
                    throwIfAborted(control);

                    const nextRun = this.applyTransition(goal.state.run, {
                        kind: "context_lookup",
                        request: invocation.request,
                    });
                    const nextGoal = this.withRun(goal, nextRun);
                    goal = await this.commitDecision(
                        nextGoal,
                        [
                            {
                                goalId: goal.id,
                                runId: goal.state.run.id,
                                phase: "executing",
                                executionUnitId,
                                eventType: "decision_received",
                                payload: {
                                    type: "decision_received",
                                    decision: invocation.request,
                                    ...(normalized.thought !== undefined ? { thought: normalized.thought } : {}),
                                },
                            },
                            ...invocation.facts,
                        ],
                        undefined,
                        control,
                    );
                    contextLookupResult = invocation.result;
                    contextLookupChainCount += 1;
                    continue;
                }

                if (normalized.decision.kind === "context_checkpoint") {
                    if (goal.state.run.pendingAction !== undefined) {
                        return this.stopWithExecutionError(
                            goal,
                            new RunnerExecutionError(
                                "INVALID_AGENT_DECISION",
                                "context_checkpoint cannot advance with a pending Action",
                            ),
                            control,
                        );
                    }
                    const currentEpoch = goal.state.run.contextEpoch;
                    const messages = goal.state.messages;
                    const newStart = selectLatestConversationStart(
                        messages,
                        currentEpoch.conversationStartIndex,
                    );
                    const nextEpoch = advanceContextEpoch(
                        currentEpoch,
                        messages,
                        newStart,
                        goal.state.run.committedThroughSequence + 1,
                    );
                    const closedEpoch = toEpochRange(
                        currentEpoch,
                        messages.length,
                        goal.state.run.committedThroughSequence,
                    );
                    const {
                        pendingThink: _pendingThink,
                        pendingModelRepair: _pendingModelRepair,
                        ...runWithoutPendingThink
                    } = goal.state.run;
                    const nextGoal = this.withRun(goal, {
                        ...runWithoutPendingThink,
                        contextEpoch: nextEpoch,
                    });
                    goal = await this.commitDecision(nextGoal, [{
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "context_epoch_advanced",
                        payload: {
                            type: "context_epoch_advanced",
                            closedEpoch,
                            openedEpoch: nextEpoch,
                            reason: "input_threshold",
                        },
                    }], acceptedPatch, control);
                    contextLookupResult = undefined;
                    contextLookupChainCount = 0;
                    continue;
                }

                if (normalized.decision.kind === "ask_user") {
                    const normalizedReq = normalizeAskUserRequest(normalized.decision.questions);
                    const mode: "plan" | "execution" = goal.state.run.approvedTask === undefined ? "plan" : "execution";
                    const pendingInteraction: PendingInteractionAskUser = {
                        kind: "ask_user",
                        requestId: normalizedReq.requestId,
                        mode,
                        questions: normalizedReq.questions,
                    };

                    const nextRun = this.applyTransition(goal.state.run, {
                        kind: "stage_interaction",
                        interaction: pendingInteraction,
                    });
                    const transitionedGoal = this.withRun(goal, nextRun);
                    const formattedContent = this.formatAskUserQuestions(normalizedReq.questions);
                    const nextGoal = this.appendAssistantContent(transitionedGoal, formattedContent);

                    const decisionFact: TrajectoryEventDraft = {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "decision_received",
                        payload: {
                            type: "decision_received",
                            decision: normalized.decision,
                            ...(normalized.thought !== undefined ? { thought: normalized.thought } : {}),
                        },
                    };

                    const waitingFact: TrajectoryEventDraft = {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "run_waiting",
                        payload: {
                            type: "run_waiting",
                            reason: "ask_user",
                        },
                    };

                    goal = await this.commitDecision(
                        nextGoal,
                        [decisionFact, waitingFact],
                        acceptedPatch,
                        control,
                    );
                    contextLookupResult = undefined;
                    contextLookupChainCount = 0;
                    continue;
                }

                if (normalized.decision.kind === "task_proposal") {
                    if (goal.state.run.mode !== "plan" || goal.state.run.approvedTask !== undefined) {
                        return this.stopWithExecutionError(
                            goal,
                            new RunnerExecutionError(
                                "INVALID_AGENT_DECISION",
                                "task_proposal is only allowed before approval in Plan Mode",
                            ),
                            control,
                        );
                    }

                    const requestId = `proposal-${randomUUID()}`;
                    const pendingInteraction: PendingInteractionTaskApproval = {
                        kind: "task_approval",
                        requestId,
                        proposal: normalized.decision.task,
                        approvalRequest: normalized.decision.approvalRequest,
                    };

                    const nextRun = this.applyTransition(goal.state.run, {
                        kind: "stage_interaction",
                        interaction: pendingInteraction,
                    });
                    const transitionedGoal = this.withRun(goal, nextRun);
                    const formattedContent = this.formatTaskProposal(
                        normalized.decision.task,
                        normalized.decision.approvalRequest,
                    );
                    const nextGoal = this.appendAssistantContent(transitionedGoal, formattedContent);

                    const decisionFact: TrajectoryEventDraft = {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "decision_received",
                        payload: {
                            type: "decision_received",
                            decision: normalized.decision,
                            ...(normalized.thought !== undefined ? { thought: normalized.thought } : {}),
                        },
                    };

                    const waitingFact: TrajectoryEventDraft = {
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "run_waiting",
                        payload: {
                            type: "run_waiting",
                            reason: "task_approval",
                            requestId,
                        },
                    };

                    goal = await this.commitDecision(
                        nextGoal,
                        [decisionFact, waitingFact],
                        acceptedPatch,
                        control,
                    );
                    contextLookupResult = undefined;
                    contextLookupChainCount = 0;
                    continue;
                }

                if (normalized.decision.kind === "tool_call") {
                    const validated = normalized.preparedToolAction;
                    if (validated === undefined) {
                        return this.stopWithExecutionError(
                            goal,
                            new RunnerExecutionError("INVALID_AGENT_DECISION", "Tool Action passed validation without a prepared Action"),
                            control,
                        );
                    }

                    try {
                        validateActionLifecycle(goal, validated.action);
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

                    await this.appendTrajectory({
                        goalId: goal.id,
                        runId: goal.state.run.id,
                        phase: "executing",
                        executionUnitId,
                        eventType: "decision_received",
                        payload: {
                            type: "decision_received",
                            decision: {
                                ...normalized.decision,
                                action: validated.action,
                            },
                            ...(normalized.thought !== undefined ? { thought: normalized.thought } : {}),
                        },
                    }, control);

                    let grantMatched = false;
                    let projectMode: PermissionMode = "default";
                    if (this.permissionModeStore !== undefined && this.workspaceId !== undefined) {
                        try {
                            const modeRecord = await this.permissionModeStore.get(this.workspaceId);
                            projectMode = modeRecord.mode;
                        } catch (error) {
                            if (isExecutionAbortedError(error)) throw error;
                            throwIfAborted(control);
                            return this.stopWithExecutionError(
                                goal,
                                new RunnerExecutionError(
                                    "TOOL_EXECUTION_ERROR",
                                    error instanceof Error ? error.message : String(error),
                                ),
                                control,
                            );
                        }
                    }

                    if (
                        validated.policy === "require_approval"
                        && this.toolGrantLookup !== undefined
                        && this.workspaceId !== undefined
                    ) {
                        try {
                            const matcher = await createToolGrantMatcher(
                                validated.action.toolId,
                                validated.action.input,
                                this.workspaceRoot,
                            );
                            grantMatched = await this.toolGrantLookup.findActiveMatching({
                                workspaceId: this.workspaceId,
                                goalId: goal.id,
                                matcher,
                            }) !== undefined;
                        } catch (error) {
                            if (isExecutionAbortedError(error)) throw error;
                            throwIfAborted(control);
                            return this.stopWithExecutionError(
                                goal,
                                new RunnerExecutionError(
                                    "TOOL_EXECUTION_ERROR",
                                    error instanceof Error ? error.message : String(error),
                                ),
                                control,
                            );
                        }
                    }

                    const rawActionInput = validated.action.input;
                    let effectiveSandboxScope: EffectiveSandboxScope = { extraFiles: [], network: "none" };
                    if (this.workspaceRoot !== undefined && isRecord(rawActionInput) && isRecord(rawActionInput.sandboxAccess)) {
                        try {
                            effectiveSandboxScope = await resolveEffectiveSandboxScope(
                                this.workspaceRoot,
                                rawActionInput.sandboxAccess as SandboxAccessRequest,
                            );
                        } catch (error) {
                            if (isExecutionAbortedError(error)) throw error;
                            throwIfAborted(control);
                            return this.stopWithExecutionError(
                                goal,
                                new RunnerExecutionError(
                                    "TOOL_EXECUTION_ERROR",
                                    error instanceof Error ? error.message : String(error),
                                ),
                                control,
                            );
                        }
                    }

                    const sandboxDecision = evaluateSandboxAuthorization({
                        isSeatbeltSupported: isSeatbeltSupported(),
                        workspaceRoot: this.workspaceRoot,
                        effectiveScope: effectiveSandboxScope,
                    });

                    let sandboxGrantMatched = false;
                    if (
                        sandboxDecision.decision === "approval_required"
                        && this.sandboxGrantLookup !== undefined
                        && this.workspaceId !== undefined
                        && validated.action.toolId === "bash"
                    ) {
                        try {
                            const bashCommand = typeof (rawActionInput as any).command === "string"
                                ? (rawActionInput as any).command
                                : "";
                            const candidateMatcher = createSandboxGrantMatcher(bashCommand, effectiveSandboxScope);
                            const activeGrant = await this.sandboxGrantLookup.findActiveMatching({
                                workspaceId: this.workspaceId,
                                goalId: goal.id,
                                matcher: candidateMatcher,
                            });
                            if (activeGrant !== undefined) {
                                sandboxGrantMatched = true;
                            }
                        } catch (error) {
                            if (isExecutionAbortedError(error)) throw error;
                            throwIfAborted(control);
                            return this.stopWithExecutionError(
                                goal,
                                new RunnerExecutionError(
                                    "TOOL_EXECUTION_ERROR",
                                    error instanceof Error ? error.message : String(error),
                                ),
                                control,
                            );
                        }
                    }

                    const requiresSandboxApproval = sandboxDecision.decision === "approval_required" && !sandboxGrantMatched;
                    const requiresToolApproval = validated.policy !== "allow" && !grantMatched && projectMode !== "yolo";

                    if (requiresSandboxApproval || requiresToolApproval) {
                        throwIfAborted(control);
                        const approvalKind = requiresSandboxApproval ? "sandbox" : undefined;
                        const hasCustomSandboxScope = effectiveSandboxScope.extraFiles.length > 0 || effectiveSandboxScope.network !== "none";
                        const stagedRun = this.applyTransition(goal.state.run, {
                            kind: "stage_action",
                            action: validated.action,
                            status: "awaiting_approval",
                            ...(approvalKind === undefined ? {} : { approvalKind }),
                            ...(hasCustomSandboxScope ? { effectiveSandboxScope } : {}),
                        });
                        const stagedGoal = this.withRun(goal, stagedRun);

                        goal = await this.commitDecision(
                            stagedGoal,
                            [{
                                goalId: goal.id,
                                runId: goal.state.run.id,
                                phase: "executing",
                                executionUnitId,
                                actionId: validated.action.actionId,
                                eventType: "action_staged",
                                payload: {
                                    type: "action_staged",
                                    action: validated.action,
                                    approvalStatus: "awaiting_approval",
                                    ...(approvalKind === undefined ? {} : { approvalKind }),
                                    ...(hasCustomSandboxScope ? { effectiveSandboxScope } : {}),
                                },
                            }],
                            acceptedPatch,
                            control,
                        );
                        continue;
                    }

                    throwIfAborted(control);
                    const hasCustomSandboxScope = effectiveSandboxScope.extraFiles.length > 0 || effectiveSandboxScope.network !== "none";
                    const stagedRun = this.applyTransition(goal.state.run, {
                        kind: "stage_action",
                        action: validated.action,
                        status: "approved",
                        ...(hasCustomSandboxScope ? { effectiveSandboxScope } : {}),
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
                            actionId: validated.action.actionId,
                            eventType: "action_staged",
                            payload: {
                                type: "action_staged",
                                action: validated.action,
                                approvalStatus: "approved",
                            },
                        }],
                        acceptedPatch,
                        control,
                    );

                    let effectivePlan: SandboxExecutionPlan | undefined = undefined;
                    if (this.sandboxPlanResolver !== undefined && this.workspaceRoot !== undefined) {
                        effectivePlan = await this.sandboxPlanResolver({
                            workspaceRoot: this.workspaceRoot,
                            action: validated.action,
                            effectiveScope: effectiveSandboxScope,
                        });
                    }

                    const outcome = await this.executeToolAndObserve(
                        stagedCheckpoint,
                        validated,
                        executionUnitId,
                        control,
                        effectivePlan,
                    );

                    if (outcome.kind === "stopped") {
                        return outcome.result;
                    }

                    goal = outcome.goal;
                    contextLookupResult = undefined;
                    contextLookupChainCount = 0;
                    continue;
                }

                if (normalized.decision.kind === "goal_plan_update") {
                    if (
                        !canUpdateGoalPlan(goal.state.run.mode)
                        || (goal.state.goalPlan === undefined && normalized.decision.baseRevision !== 0)
                    ) {
                        return this.stopWithExecutionError(
                            goal,
                            new RunnerExecutionError(
                                "INVALID_AGENT_DECISION",
                                "goal_plan_update is not authorized in the current Run mode",
                            ),
                            control,
                        );
                    }

                    try {
                        for (const operation of normalized.decision.operations) {
                            if (operation.type !== "update") continue;
                            if (operation.status === "completed") {
                                if (
                                    operation.evidenceSequences === undefined
                                    || operation.evidenceSequences.length === 0
                                ) {
                                    throw new RunnerExecutionError(
                                        "INVALID_AGENT_DECISION",
                                        "completed Todo update must cite current Run evidence",
                                    );
                                }
                                session.validateEvidence(operation.evidenceSequences);
                            } else if (operation.evidenceSequences !== undefined) {
                                throw new RunnerExecutionError(
                                    "INVALID_AGENT_DECISION",
                                    "GoalPlan evidence is only valid when completing a Todo",
                                );
                            }
                        }
                    } catch (error) {
                        return this.stopWithExecutionError(
                            goal,
                            error instanceof RunnerExecutionError
                                ? error
                                : new RunnerExecutionError(
                                    "INVALID_AGENT_DECISION",
                                    error instanceof Error ? error.message : String(error),
                                ),
                            control,
                        );
                    }

                    const reduced = reduceGoalPlan(
                        goal.state.goalPlan ?? createEmptyGoalPlan(),
                        {
                            baseRevision: normalized.decision.baseRevision,
                            operations: normalized.decision.operations,
                        },
                    );
                    if (!reduced.ok) {
                        return this.stopWithExecutionError(
                            goal,
                            new RunnerExecutionError(
                                "INVALID_AGENT_DECISION",
                                reduced.error.message,
                            ),
                            control,
                        );
                    }

                    const nextRun = this.applyTransition(goal.state.run, {
                        kind: "plan_update",
                        decision: normalized.decision,
                    });
                    const nextGoal = this.withRun(
                        {
                            ...goal,
                            state: {
                                ...goal.state,
                                goalPlan: reduced.plan,
                            },
                        },
                        nextRun,
                    );

                    goal = await this.commitDecision(
                        nextGoal,
                        [
                            {
                                goalId: goal.id,
                                runId: goal.state.run.id,
                                phase: "executing",
                                executionUnitId,
                                eventType: "decision_received",
                                payload: {
                                    type: "decision_received",
                                    decision: normalized.decision,
                                    ...(normalized.thought !== undefined ? { thought: normalized.thought } : {}),
                                },
                            },
                            {
                                goalId: goal.id,
                                runId: goal.state.run.id,
                                phase: "executing",
                                executionUnitId,
                                eventType: "goal_plan_updated",
                                payload: {
                                    type: "goal_plan_updated",
                                    revision: reduced.plan.revision,
                                    operations: normalized.decision.operations,
                                },
                            },
                        ],
                        acceptedPatch,
                        control,
                    );
                    contextLookupResult = undefined;
                    contextLookupChainCount = 0;
                    continue;
                }

                await this.appendTrajectory({
                    goalId: goal.id,
                    runId: goal.state.run.id,
                    phase: "executing",
                    executionUnitId,
                    eventType: "decision_received",
                    payload: {
                        type: "decision_received",
                        decision: normalized.decision,
                        ...(normalized.thought !== undefined ? { thought: normalized.thought } : {}),
                    },
                }, control);

                throwIfAborted(control);
                const nextRun = this.applyTransition(goal.state.run, {
                    kind: "decision",
                    decision: normalized.decision,
                });
                let nextGoal = this.appendDecisionMessage(
                    this.withRun(goal, nextRun),
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
                } else if (normalized.decision.kind === "fail") {
                    nextGoal = this.appendDecisionMessage(
                        this.withRun(goal, nextRun),
                        normalized.decision,
                    );
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
                } else {
                    return this.stopWithExecutionError(
                        goal,
                        new RunnerExecutionError(
                            "INVALID_AGENT_DECISION",
                            "Unsupported non-terminal AgentDecision",
                        ),
                        control,
                    );
                }
                goal = await this.commitDecision(
                    nextGoal,
                    [
                        terminalFact,
                        ...(normalized.decision.kind === "complete" || normalized.decision.kind === "fail"
                            ? (() => {
                                const closed = this.contextEpochClosedFact(
                                    nextGoal,
                                    normalized.decision.kind === "complete" ? "run_completed" : "run_failed",
                                );
                                return closed === undefined ? [] : [closed];
                            })()
                            : []),
                    ],
                    acceptedPatch,
                    control,
                );
                contextLookupResult = undefined;
                contextLookupChainCount = 0;
            } finally {
                session?.close();
            }
        }

        return { ok: true, state: goal.state.run };
    }

    private formatAskUserQuestions(questions: readonly AskUserQuestion[]): string {
        const blocks: string[] = [];
        for (const q of questions) {
            const lines: string[] = [
                `### ${q.header}`,
                q.question,
                `Options (${q.multiSelect ? "multiple choice" : "single choice"}):`,
            ];
            for (const opt of q.options) {
                const desc = opt.description ? ` - ${opt.description}` : "";
                lines.push(`- [${opt.id}] ${opt.label}${desc}`);
            }
            blocks.push(lines.join("\n"));
        }
        return blocks.join("\n\n");
    }

    private formatTaskProposal(task: GoalTask, approvalRequest: string): string {
        const criteria = task.completionCriteria.length === 0
            ? ["None"]
            : task.completionCriteria.map(
                (criterion, index) => `${index + 1}. ${criterion.text}`,
            );

        return [
            `Objective: ${task.objective}`,
            "Completion criteria:",
            ...criteria,
            `Approval request: ${approvalRequest}`,
        ].join("\n");
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
        decision: Exclude<
            AgentDecision,
            { readonly kind: "tool_call" }
                | { readonly kind: "context_lookup" }
                | { readonly kind: "context_checkpoint" }
                | { readonly kind: "ask_user" }
                | { readonly kind: "task_proposal" }
                | { readonly kind: "goal_plan_update" }
        >,
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
