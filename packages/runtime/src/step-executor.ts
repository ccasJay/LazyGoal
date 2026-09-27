import type {
    AgentDecision,
    Goal,
    WorkingMemory,
} from "./domain";
import type { ContextLookupResult } from "./context-retrieval";
import type { ToolDefinition } from "./tool";
import type { ExecutionControl } from "./execution-control";
import type { ExecutionStreamPublisher } from "../../execution-stream/src/index";
import type { ModelContextFramePayload } from "./trajectory";

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
        readonly modelContextFrame?: Omit<ModelContextFramePayload, "type">;
      }
    | {
        readonly kind: "request_think";
        readonly goal: string;
        readonly modelContextFrame?: Omit<ModelContextFramePayload, "type">;
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
export type ModelContextFrameForStage = Omit<ModelContextFramePayload, "type">;

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
    readonly modelContextFrame?: Omit<ModelContextFramePayload, "type">;
}

/**
 * Step Executor 的单轮对象式输入。
 *
 * @remarks
 * `goal` 是已恢复的完整快照；`authorizedTools` 是 Runtime 解析出的授权工具
 * 描述；`workingMemory` 是当前 structured@1 协议的临时投影；`control` 是
 * 当前调用的瞬时中止控制。Executor 不得通过该对象修改 Goal、执行 Tool 或持久化。
 *
 * @example
 * ```ts
 * const input: StepExecutionInput = {
 *     goal,
 *     authorizedTools: [],
 *     workingMemory,
 * };
 * ```
 */
export interface StepExecutionInput {
    /** 当前处于 executing 的完整 Goal 快照。 */
    readonly goal: Goal;
    /** 当前 Profile 白名单与 Registry 的交集 Tool 描述。 */
    readonly authorizedTools: readonly ToolDefinition[];
    /** 当前 structured@1 协议的临时 Working Memory。 */
    readonly workingMemory?: WorkingMemory;
    /** 当前 Run 推进调用的瞬时中止控制。 */
    readonly control?: ExecutionControl;
    /** 上一轮已提交 lookup 的瞬时结果；调用结束后由 Runtime 丢弃。 */
    readonly contextLookupResult?: ContextLookupResult;
    /** 当前 Step 已成功提交的 Think 目标与输出；普通 Decide 可据此继续分析。 */
    readonly thinkHistory?: readonly ThinkExchange[];
    /** 当前 Step 的稳定执行单元标识，供流式事件关联。 */
    readonly executionUnitId?: string;
    /** 当前 Goal/Run 的实时执行流发布端口。 */
    readonly executionStream?: ExecutionStreamPublisher;
}

/**
 * 携带可选阶段说明文本的兼容单步执行结果。
 *
 * @remarks
 * 保留给仍使用 `execute()` 单调用边界的外部 StepExecutor。新的 Think 阶段通过
 * `decide()`/`think()` 明确返回，并由 Runner 在下一次 Decide 前提交。
 *
 * @example
 * ```ts
 * const result: StepExecutionResult = {
 *   decision: { kind: "complete", summary: "完成", completionEvidence: [] },
 *   thought: "已根据文件内容完成审查，可以安全结束。",
 * };
 * ```
 */
export type StepExecutionResult = AgentDecision & {
    /** 当前 structured@1 的决策动作。 */
    readonly decision: AgentDecision;
    /** 兼容实现附带的阶段说明文本（如果有）。 */
    readonly thought?: string;
};

/**
 * Agent 与 Runtime 之间的单步/阶段执行边界。
 *
 * @remarks
 * 实现必须接收当前 Profile 已授权的 ToolDefinition。旧式实现只提供 `execute()`；
 * 阶段化实现同时提供 `decide()` 和 `think()`，由 Runner 管理循环和 Think 检查点。
 * 实现只应读取传入 Goal，不应自行持久化、执行 Tool 或修改它；Runner 负责状态转换、
 * 授权、Tool 编排和保存。
 *
 * @example
 * ```ts
 * const executor: StepExecutor = {
 *   async execute({ goal }) {
 *     return {
 *       kind: "complete",
 *       summary: "目标完成",
 *       completionEvidence: [],
 *     };
 *   },
 * };
 * ```
 */
export interface StepExecutor {
    /**
     * @param input - 当前已恢复并处于 `running` 的 Goal、授权 Tool 描述、当前
     *   Working Memory 与瞬时中止控制。
     * @returns 当前 structured@1 的 AgentDecision 或携带思考链的 StepExecutionResult。
     * @throws 执行失败时抛出异常；中止时抛出 `ExecutionAbortedError`，Runner
     *   会按执行边界处理其余异常。
     */
    execute(input: StepExecutionInput): Promise<AgentDecision | StepExecutionResult>;

    /**
     * 执行一次 Decide 阶段。
     *
     * @remarks
     * 支持阶段循环的实现返回业务决策或 `request_think`；后一种结果只请求 Runner
     * 调用 Think，不表示 Action，也不推进 Step。
     *
     * @param input - 当前 Step 输入及已提交的 Think 链。
     * @returns 通过本地契约解析的 Think 请求或业务决策，可附本次模型请求 frame。
     * @throws 响应不符合协议或模型调用失败时抛出。
     *
     * @example
     * ```ts
     * const result = await executor.decide?.({ ...input, thinkHistory: [] });
     * ```
     */
    decide?(input: StepExecutionInput & {
        readonly thinkHistory: readonly ThinkExchange[];
    }): Promise<DecideStageResult>;

    /**
     * 执行一次不含业务工具的 Think 阶段。
     *
     * @param input - 当前 Step 输入、明确 Think 目标和先前已提交的 Think 链。
     * @returns 非空推演文本及其请求 frame；由 Runner 在继续 Decide 前持久化。
     * @throws 响应为空、包含工具调用或模型调用失败时抛出。
     *
     * @example
     * ```ts
     * const result = await executor.think?.({
     *     ...input,
     *     thinkGoal: "比较两种方案",
     *     thinkHistory: [],
     * });
     * ```
     */
    think?(input: StepExecutionInput & {
        readonly thinkGoal: string;
        readonly thinkHistory: readonly ThinkExchange[];
    }): Promise<ThinkStageResult>;
}
