import type { ModelAssistantMessage } from "../../contracts/src/model-conversation";
import type { CompletionReviewResult } from "../../contracts/src/index";
import type {
    AgentDecision,
    Goal,
    WorkingMemory,
} from "./domain";
import type { ContextLookupResult } from "./context-retrieval";
import type { ToolDefinition } from "../../tool-core/src/index";
import type { ExecutionControl } from "../../execution-control/src/index";
import type { ExecutionStreamPublisher } from "../../execution-stream/src/index";
import type { ModelContextFramePayload, TrajectoryEvent } from "./trajectory";
import type { RuntimeFeedback } from "./runtime-feedback";
import type { ToolDiscoveryResult } from "./tool-discovery";

/**
 * 一个已提交的 Think 目标与模型输出。
 *
 * @example
 * ```ts
 * const exchange: ThinkExchange = {
 *     requestId: "think-1",
 *     goal: "比较两种恢复方案",
 *     output: "方案 A 保留已提交状态。",
 * };
 * ```
 */
export interface ThinkExchange {
    /** 与 request_think、think_completed 轨迹事实关联的稳定标识。 */
    readonly requestId: string;
    /** Decide 阶段提出且已通过本地非空校验的推演目标。 */
    readonly goal: string;
    /** Think Adapter 返回并由 Runner 成功提交的自由文本。 */
    readonly output: string;
}

/** Decide 阶段返回的业务决策或独立 Think 控制结果。 */
export type DecideStageResult =
    | {
        readonly kind: "decision";
        readonly decision: AgentDecision;
        readonly modelContextFrame?: ModelContextFrameForStage;
      }
    | {
        readonly kind: "request_think";
        readonly goal: string;
        readonly modelContextFrame?: ModelContextFrameForStage;
      };

/**
 * 一次模型生成调用对应的模型可见上下文 frame。
 *
 * @remarks
 * Runner 将该 frame 与相应阶段事实一起提交；未提交的 frame 不作为后续请求的 diff 基线。
 *
 * @example
 * ```ts
 * const frame: ModelContextFrameForStage = {
 *     stage: "think", epochNumber: 0, conversationPosition: 1, sections: [],
 * };
 * ```
 */
export type ModelContextFrameForStage = Omit<ModelContextFramePayload, "type"> & {
    /** 已接受的原生响应；提交器单独记录为 model_response_received，不写入 Section frame。 */
    readonly modelResponse?: ModelAssistantMessage;
};

/**
 * Think 阶段成功返回的目标、文本与模型可见上下文 frame。
 *
 * @remarks
 * 只有 Runner 在 Trajectory 与 Snapshot 成功提交该结果后，才会调用后续 Decide。
 *
 * @example
 * ```ts
 * const result: ThinkStageResult = {
 *     goal: "比较恢复方案",
 *     output: "方案 A 有已提交 Snapshot 作为恢复边界。",
 * };
 * ```
 */
export interface ThinkStageResult {
    /** 本次 Think 要解决的明确目标。 */
    readonly goal: string;
    /** 非空 Think 自由文本。 */
    readonly output: string;
    /** 本次 Think 请求实际发送的动态 section frame。 */
    readonly modelContextFrame?: ModelContextFrameForStage;
}

/**
 * Step Executor 的单轮对象式输入。
 *
 * @remarks
 * `goal` 是已恢复的完整快照；`authorizedTools` 是 Runtime 解析出的授权工具
 * 描述；`workingMemory` 是当前 structured@1 协议的临时投影；`toolDiscoveryResult` 是
 * Runtime 上一轮发现的瞬时反馈；`control` 是当前调用的瞬时中止控制。Executor 不得通过该对象
 * 修改 Goal、执行 Tool 或持久化。
 *
 * @example
 * ```ts
 * const input: StepExecutionInput = {
 *     goal,
 *     authorizedTools: [],
 *     exposedToolIds: [],
 *     workingMemory,
 *     toolDiscoveryResult: { tools: [{ id: "read_file", description: "Read a file" }] },
 * };
 * ```
 */
export interface StepExecutionInput {
    /** 当前处于 executing 的完整 Goal 快照。 */
    readonly goal: Goal;
    /** 当前 Profile 白名单与 Registry 的交集 Tool 描述。 */
    readonly authorizedTools: readonly ToolDefinition[];
    /** 当前 Run 累积的可见 Tool ID；Runtime 仅投影其与授权工具的交集。 */
    readonly exposedToolIds?: readonly string[];
    /** 当前 structured@1 协议的临时 Working Memory。 */
    readonly workingMemory?: WorkingMemory;
    /** 当前 Run 推进调用的瞬时中止控制。 */
    readonly control?: ExecutionControl;
    /** 上一轮已提交 lookup 的瞬时结果；调用结束后由 Runtime 丢弃。 */
    readonly contextLookupResult?: ContextLookupResult;
    /** 上一轮工具发现的瞬时结果；仅供下一次 Decide 参考。 */
    readonly toolDiscoveryResult?: ToolDiscoveryResult;
    /** 当前 Step 已成功提交的 Think 目标与输出；普通 Decide 可据此继续分析。 */
    readonly thinkHistory?: readonly ThinkExchange[];
    /** 当前 Step 的稳定执行单元标识，供流式事件关联。 */
    readonly executionUnitId?: string;
    /** 当前 Goal/Run 的实时执行流发布端口。 */
    readonly executionStream?: ExecutionStreamPublisher;
    /** 上一次被 Runtime 拒绝的模型输出之修复反馈；不属于真实 Goal Conversation。 */
    readonly runtimeFeedback?: RuntimeFeedback;
}

/**
 * 已通过 Runtime 契约及证据引用校验的完成候选。
 *
 * @remarks evidence 只包含当前已提交边界内的引用事实及其 Action 来源；正文不得截断后默认为充分。
 * 审查不得执行 Tool、修改 Goal 或应用候选 Patch。Think 输出不作为审查证据。
 * @example
 * ```ts
 * const input: CompletionReviewInput = { ...stepInput, candidate, evidence: [] };
 * ```
 */
export interface CompletionReviewInput extends StepExecutionInput {
    readonly candidate: Extract<AgentDecision, { readonly kind: "complete" }>;
    readonly evidence: readonly TrajectoryEvent[];
}

/**
 * Agent 与 Runtime 之间的分阶段执行边界。
 *
 * @remarks
 * 实现必须接收当前 Profile 已授权的 ToolDefinition，并提供 Decide、Think 和完成审查。
 * Runner 管理循环、Think 检查点及审查后的提交；complete 返回值是待审查候选。
 * 实现只应读取传入 Goal，不应自行持久化、执行 Tool 或修改它；Runner 负责状态转换、
 * 授权、Tool 编排和保存。
 *
 * @example
 * ```ts
 * const executor: StepExecutor = {
 *   async decide({ goal }) {
 *     return {
 *       kind: "decision",
 *       decision: { kind: "complete", summary: "目标完成", completionEvidence: [] },
 *     };
 *   },
 *   async think() {
 *     throw new Error("unsupported");
 *   },
 *   async reviewCompletion() { return { kind: "accept" }; },
 * };
 * ```
 */
export interface StepExecutor {
    /**
     * 核查完整交付与事实支持；只返回审查结果，不执行业务工具或提交候选。
     * @param input - Runtime 已校验的候选、当前请求和提交证据。
     * @returns 接受或包含具体缺口的拒绝；接受后仍由 Runner 提交。
     * @throws 模型调用、预算或协议失败时抛出；Runner 保留 Decide 纠错恢复边界。
     * @example
     * ```ts
     * const result = await executor.reviewCompletion({ ...input, candidate, evidence: [] });
     * ```
     */
    reviewCompletion(input: CompletionReviewInput): Promise<CompletionReviewResult>;
    /**
     * 执行一次 Decide 阶段。
     *
     * @remarks
     * 返回业务决策或 `request_think`；后一种结果只请求 Runner 调用 Think，不表示 Action，也不推进 Step。
     *
     * @param input - 当前 Step 输入及已提交的 Think 链。
     * @returns 通过本地契约解析的 Think 请求或业务决策，可附本次模型请求 frame。
     * @throws 响应不符合协议或模型调用失败时抛出。若当前 Step 已有已提交 Think
     *   链，Runner 会保留 `pendingThink` 并传播阶段错误，恢复时只重试 Decide。
     *
     * @example
     * ```ts
     * const result = await executor.decide({ ...input, thinkHistory: [] });
     * ```
     */
    decide(input: StepExecutionInput & {
        readonly thinkHistory: readonly ThinkExchange[];
    }): Promise<DecideStageResult>;

    /**
     * 执行一次不含业务工具的 Think 阶段。
     *
     * @param input - 当前 Step 输入、明确 Think 目标和先前已提交的 Think 链。
     * @returns 非空推演文本及其请求 frame；由 Runner 在继续 Decide 前持久化。
     * @throws 响应为空、包含工具调用或模型调用失败时抛出。失败输出不会成为恢复
     *   历史；此前已提交的 Think 链由 Runner 保留。
     *
     * @example
     * ```ts
     * const result = await executor.think({
     *     ...input,
     *     thinkGoal: "比较两种方案",
     *     thinkHistory: [],
     * });
     * ```
     */
    think(input: StepExecutionInput & {
        readonly thinkGoal: string;
        readonly thinkHistory: readonly ThinkExchange[];
    }): Promise<ThinkStageResult>;

    /**
     * 可选的顶层执行方法。
     */
    execute?(input: StepExecutionInput): Promise<AgentDecision>;
}

/**
 * 便于将基于单个决策或单步处理函数快速构造为标准阶段化 StepExecutor 的工厂函数。
 *
 * @remarks
 * 常用于确定性单步测试或不需要推演思考的简单执行者。在 Decide 阶段直接包装目标决策，
 * 遇到未预期的 Think 阶段时抛出未支持异常。
 *
 * @param handler - 决策生成函数、决策列表或单个决策。
 * @param reviewCompletion - 显式提供的审查实现；没有默认放行。
 * @returns 完整的阶段化 StepExecutor。
 *
 * @example
 * ```ts
 * const executor = createStepExecutor(async ({ goal }) => ({
 *     kind: "complete",
 *     summary: "完成",
 *     completionEvidence: [],
 * }), async () => ({ kind: "accept" }));
 * ```
 */
export function createStepExecutor(
    handler:
        | AgentDecision
        | readonly AgentDecision[]
        | ((input: StepExecutionInput & { readonly thinkHistory?: readonly ThinkExchange[] }) => Promise<AgentDecision> | AgentDecision),
    reviewCompletion: StepExecutor["reviewCompletion"],
): StepExecutor {
    if (typeof handler === "function") {
        return {
            reviewCompletion,
            async decide(input) {
                const decision = await handler(input);
                return { kind: "decision", decision };
            },
            async think() {
                throw new Error("think not supported by createStepExecutor");
            },
            async execute(input) {
                return handler({ ...input, thinkHistory: [] });
            },
        };
    }
    const decisions = Array.isArray(handler) ? [...handler] : [handler];
    let index = 0;
    return {
        reviewCompletion,
        async decide() {
            const decision = decisions[index++];
            if (decision === undefined) throw new Error("no more decisions in StepExecutor");
            return { kind: "decision", decision };
        },
        async think() {
            throw new Error("think not supported by createStepExecutor");
        },
    };
}
