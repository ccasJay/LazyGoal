import {
    readTrajectoryAtSnapshot,
    type RuntimeFeedbackOrigin,
    type TrajectoryEvent,
} from "../../../packages/runtime/src/index.js";
import {
    JsonFileGoalStore,
    JsonFileTrajectoryStore,
} from "../../../packages/storage/src/index.js";

/** Runtime 模型阶段修复反馈的 8 个标准来源。 */
export const RUNTIME_FEEDBACK_ORIGINS = Object.freeze([
    "response_parse",
    "output_contract",
    "decision_semantics",
    "tool_selection",
    "tool_input",
    "completion_evidence",
    "completion_review",
    "memory_patch",
] as const satisfies readonly RuntimeFeedbackOrigin[]);

/**
 * Trajectory 中捕获的单条 Runtime 过程故障摘要。
 *
 * @example
 * ```ts
 * const fault: RuntimeFaultEntry = {
 *   sequence: 4,
 *   category: "repair",
 *   code: "INVALID_AGENT_DECISION",
 *   origin: "decision_semantics",
 *   message: "Business tool called before starting a Run stage.",
 * };
 * ```
 */
export interface RuntimeFaultEntry {
    /** 事件在 Trajectory 中的提交序号；终态合成错误无序号时为 `null`。 */
    readonly sequence: number | null;
    /** 故障所属的顶层分类。 */
    readonly category: "repair" | "stage" | "tool" | "terminal";
    /** 稳定错误码或事件类型标识。 */
    readonly code: string;
    /** 模型修复反馈的具体来源或工具 ID。 */
    readonly origin?: string;
    /** 经过长度截断的可读诊断信息。 */
    readonly message: string;
}

/**
 * SWE-bench 单题 Runtime 执行过程的错误率与健康度评估报告。
 *
 * @remarks
 * 严格遵循“只要出现修复重试、错误、中断即视为存在故障”的判据：
 * - `zeroFaultPass` 仅在四类故障计数均为 0、`runStatus === "completed"` 且导出非空补丁时为 `true`；
 * - `runtimeScore` 提供 $[0, 1]$ 连续梯度分数，供 Harness² 在多个候选间比较改进幅度。
 *
 * @example
 * ```ts
 * const report = scoreRuntimeTrajectoryEvents({
 *   events,
 *   runStatus: "completed",
 *   stopReason: "end_turn",
 *   patch: "diff --git a/a.py b/a.py\n...",
 * });
 * console.log(report.zeroFaultPass, report.runtimeScore);
 * ```
 */
export interface SwebenchRuntimeHealthReport {
    /** 严格零错且产出非空补丁通过标记。 */
    readonly zeroFaultPass: boolean;
    /** 供优化器排序与合成的 $[0, 1]$ 连续得分。 */
    readonly runtimeScore: number;
    /** 调用级加权过程错误率 $\text{ER}_{\text{call}} \in [0, 1]$。 */
    readonly callErrorRate: number;
    /** 正常通过的模型阶段响应次数（$N_{\text{model\_ok}}$）。 */
    readonly modelOkCount: number;
    /** 工具调用总次数（$N_{\text{tool\_calls}}$）。 */
    readonly toolCallCount: number;
    /** 总交互尝试分母（$N_{\text{total}}$）。 */
    readonly totalInteractionUnits: number;
    /** 模型阶段修复重试次数（$E_{\text{repair}}$）。 */
    readonly repairCount: number;
    /** 按 `RuntimeFeedbackOrigin` 细分的修复重试计数。 */
    readonly repairByOrigin: Readonly<Record<RuntimeFeedbackOrigin, number>>;
    /** 阶段驳回、动作拒绝与历史检索失败次数（$E_{\text{stage}}$）。 */
    readonly stageRejectionCount: number;
    /** 工具调用失败与重复报错次数（$E_{\text{tool}}$）。 */
    readonly toolFaultCount: number;
    /** 终态异常或中断次数（$F_{\text{term}}$）。 */
    readonly terminalFaultCount: number;
    /** 加权过程错误总数（$E_{\text{weighted}}$）。 */
    readonly weightedFaults: number;
    /** Run 最终状态。 */
    readonly runStatus: string;
    /** ACP 停止原因。 */
    readonly stopReason: string | null;
    /** 是否导出了非空代码补丁。 */
    readonly hasNonEmptyPatch: boolean;
    /** 是否在修改文件后执行过至少一次验证命令。 */
    readonly hasVerificationBashCall: boolean;
    /** 被豁免未计入分数的网络相关错误次数（如沙箱网络权限拦截或外部网络请求失败）。 */
    readonly ignoredNetworkFaultCount?: number;
    /** 按发生顺序排列的有界故障明细列表。 */
    readonly faults: readonly RuntimeFaultEntry[];
}

/**
 * 纯内存 Trajectory 错误率评分器的输入参数。
 *
 * @example
 * ```ts
 * const input: RuntimeTrajectoryScoreInput = {
 *   events: [],
 *   runStatus: "completed",
 *   stopReason: "end_turn",
 *   patch: "diff --git ...",
 * };
 * ```
 */
export interface RuntimeTrajectoryScoreInput {
    /** 已提交的 Trajectory 事件序列。 */
    readonly events: readonly TrajectoryEvent[];
    /** Goal Snapshot 或 ACP 元数据报告的 Run 终态。 */
    readonly runStatus: string;
    /** ACP Session 终态停止原因。 */
    readonly stopReason: string | null;
    /** 导出的 git diff 补丁文本。 */
    readonly patch: string | null;
}

/**
 * 从持久化目录加载并评估 SWE-bench Trajectory 的输入选项。
 *
 * @example
 * ```ts
 * const options: PersistedTrajectoryScoreOptions = {
 *   goalSnapshotDir: "/tmp/out/runtime/goals",
 *   trajectoryDir: "/tmp/out/runtime/trajectories",
 *   goalId: "goal-1",
 *   runId: "run-1",
 *   stopReason: "end_turn",
 *   patch: "diff --git ...",
 * };
 * ```
 */
export interface PersistedTrajectoryScoreOptions {
    /** 已复制到宿主的 `goals` 存储目录。 */
    readonly goalSnapshotDir: string;
    /** 已复制到宿主的 `trajectories` 存储目录。 */
    readonly trajectoryDir: string;
    /** 目标 Goal ID。 */
    readonly goalId: string;
    /** 目标 Run ID。 */
    readonly runId: string;
    /** ACP 终态 `stopReason`。 */
    readonly stopReason: string | null;
    /** 导出的补丁文本。 */
    readonly patch: string | null;
}

const MAX_FAULT_MESSAGE_CHARS = 500;
const MAX_FAULT_ENTRIES = 64;

const NETWORK_ERROR_CODES = new Set([
    "SANDBOX_APPROVAL_REQUIRED",
    "NETWORK_ERROR",
    "NETWORK_TIMEOUT",
    "DNS_LOOKUP_FAILED",
    "CONNECTION_REFUSED",
    "CONNECT_TIMEOUT",
    "SOCKET_TIMEOUT",
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_SOCKET",
]);

const NETWORK_MESSAGE_REGEX = /(?:网络能力|network capability|could not resolve host|temporary failure in name resolution|failed to connect to|network is unreachable|network unreachable|connection reset by peer|connection refused|connection timed out|request timed? out|socket hang up|fetch failed|econnreset|etimedout|econnrefused|enetunreach)/i;

/**
 * 判断给定的运行故障或工具异常是否属于外部网络环境或沙箱网络能力相关。
 *
 * @remarks
 * 网络相关错误（如申请沙箱外部网络能力被拒、DNS 解析失败、连接超时或重置等）
 * 属于外部环境不可控或离线沙箱隔离限制，不作为 Agent 决策或实现缺陷计入错误率与降权。
 *
 * @param input - 待判定的错误码、诊断消息与可选工具原始输入。
 * @returns 若命中网络相关特征则返回 `true`，否则返回 `false`。
 *
 * @example
 * ```ts
 * const isNet = isNetworkRelatedFault({
 *   code: "SANDBOX_APPROVAL_REQUIRED",
 *   message: "命令申请了额外的沙箱文件或网络能力，须经 Permission 核准后方可执行",
 * });
 * ```
 */
export function isNetworkRelatedFault(input: {
    readonly code?: string | undefined;
    readonly message?: string | undefined;
    readonly toolInput?: unknown;
}): boolean {
    const rawCode = (input.code ?? "").toUpperCase().replace(/^REPEATED_/, "");
    const message = input.message ?? "";

    if (rawCode === "SANDBOX_APPROVAL_REQUIRED") {
        if (message.includes("网络") || message.toLowerCase().includes("network")) {
            return true;
        }
        if (typeof input.toolInput === "object" && input.toolInput !== null) {
            const sandboxAccess = (input.toolInput as { sandboxAccess?: { network?: unknown } }).sandboxAccess;
            if (sandboxAccess?.network !== undefined) {
                return true;
            }
        }
        return false;
    }

    if (NETWORK_ERROR_CODES.has(rawCode)) {
        return true;
    }

    if (NETWORK_MESSAGE_REGEX.test(message)) {
        return true;
    }

    return false;
}

/**
 * 根据已提交的 Trajectory 事件序列与终态事实计算 SWE-bench Runtime 错误率与健康度得分。
 *
 * @param input - 已提交 Trajectory 事件、Run 状态、ACP 停止原因与补丁文本。
 * @returns 结构化的 {@link SwebenchRuntimeHealthReport}。
 * @example
 * ```ts
 * const health = scoreRuntimeTrajectoryEvents({
 *   events,
 *   runStatus: "completed",
 *   stopReason: "end_turn",
 *   patch: "diff --git a/file.py b/file.py\n+pass\n",
 * });
 * ```
 */
export function scoreRuntimeTrajectoryEvents(
    input: RuntimeTrajectoryScoreInput,
): SwebenchRuntimeHealthReport {
    const repairByOrigin: Record<RuntimeFeedbackOrigin, number> = {
        response_parse: 0,
        output_contract: 0,
        decision_semantics: 0,
        tool_selection: 0,
        tool_input: 0,
        completion_evidence: 0,
        completion_review: 0,
        memory_patch: 0,
    };

    let modelOkCount = 0;
    let toolCallCount = 0;
    let repairCount = 0;
    let stageRejectionCount = 0;
    let toolFaultCount = 0;
    let terminalFaultCount = 0;
    let ignoredNetworkFaultCount = 0;
    let seenFileMutation = false;
    let hasVerificationBashCall = false;

    const faults: RuntimeFaultEntry[] = [];
    const startedToolInputs = new Map<string, string>();
    const startedToolRawInputs = new Map<string, unknown>();
    const failedToolSignatures = new Set<string>();

    for (const event of input.events) {
        const payload = event.payload;
        switch (payload.type) {
            case "model_response_received": {
                modelOkCount += 1;
                break;
            }
            case "model_repair_feedback_recorded": {
                const origin = payload.feedback.origin;
                const firstIssue = payload.feedback.issues[0];
                const issueSummary = firstIssue === undefined
                    ? payload.feedback.code
                    : `${firstIssue.code}: ${firstIssue.message}`;
                if (isNetworkRelatedFault({ code: payload.feedback.code, message: issueSummary })) {
                    ignoredNetworkFaultCount += 1;
                    break;
                }
                repairCount += 1;
                if (origin in repairByOrigin) {
                    repairByOrigin[origin] += 1;
                }
                pushFault(faults, {
                    sequence: event.sequence,
                    category: "repair",
                    code: payload.feedback.code,
                    origin,
                    message: issueSummary,
                });
                break;
            }
            case "run_stage_rejected": {
                stageRejectionCount += 1;
                pushFault(faults, {
                    sequence: event.sequence,
                    category: "stage",
                    code: "RUN_STAGE_REJECTED",
                    origin: payload.stageId,
                    message: payload.feedback,
                });
                break;
            }
            case "action_rejected": {
                stageRejectionCount += 1;
                pushFault(faults, {
                    sequence: event.sequence,
                    category: "stage",
                    code: "ACTION_REJECTED",
                    origin: payload.actionId,
                    message: payload.reason,
                });
                break;
            }
            case "context_lookup_failed": {
                stageRejectionCount += 1;
                pushFault(faults, {
                    sequence: event.sequence,
                    category: "stage",
                    code: payload.code,
                    origin: "context_lookup",
                    message: payload.message,
                });
                break;
            }
            case "tool_started": {
                toolCallCount += 1;
                const serializedInput = safeJson(payload.input);
                startedToolInputs.set(payload.actionId, `${payload.toolId}:${serializedInput}`);
                startedToolRawInputs.set(payload.actionId, payload.input);
                break;
            }
            case "tool_attempt_failed": {
                const rawInput = startedToolRawInputs.get(payload.actionId);
                if (isNetworkRelatedFault({ message: payload.reason, toolInput: rawInput })) {
                    ignoredNetworkFaultCount += 1;
                    break;
                }
                toolFaultCount += 1;
                pushFault(faults, {
                    sequence: event.sequence,
                    category: "tool",
                    code: "TOOL_ATTEMPT_FAILED",
                    origin: payload.actionId,
                    message: payload.reason,
                });
                break;
            }
            case "tool_finished": {
                const signature = startedToolInputs.get(payload.actionId) ?? payload.toolId;
                const rawInput = startedToolRawInputs.get(payload.actionId);
                if (payload.observation.kind === "success") {
                    if (payload.toolId === "write_file" || payload.toolId === "edit_file") {
                        seenFileMutation = true;
                    } else if (payload.toolId === "bash" && seenFileMutation) {
                        hasVerificationBashCall = true;
                    }
                } else {
                    if (isNetworkRelatedFault({
                        code: payload.observation.code,
                        message: payload.observation.message,
                        toolInput: rawInput,
                    })) {
                        ignoredNetworkFaultCount += 1;
                        break;
                    }
                    const isRepeatedIdenticalFailure = failedToolSignatures.has(signature);
                    failedToolSignatures.add(signature);
                    toolFaultCount += 1;
                    const code = payload.observation.code ?? "";
                    pushFault(faults, {
                        sequence: event.sequence,
                        category: "tool",
                        code: isRepeatedIdenticalFailure && !code.startsWith("REPEATED_")
                            ? `REPEATED_${code}`
                            : code,
                        origin: payload.toolId,
                        message: payload.observation.message,
                    });
                }
                break;
            }
            case "execution_error": {
                if (isNetworkRelatedFault({ code: String(payload.code), message: payload.message })) {
                    ignoredNetworkFaultCount += 1;
                    break;
                }
                terminalFaultCount += 1;
                pushFault(faults, {
                    sequence: event.sequence,
                    category: "terminal",
                    code: String(payload.code),
                    message: payload.message,
                });
                break;
            }
            case "run_failed": {
                if (isNetworkRelatedFault({ code: String(payload.code), message: payload.message })) {
                    ignoredNetworkFaultCount += 1;
                    break;
                }
                terminalFaultCount += 1;
                pushFault(faults, {
                    sequence: event.sequence,
                    category: "terminal",
                    code: String(payload.code),
                    message: payload.message,
                });
                break;
            }
            case "run_cancelled": {
                terminalFaultCount += 1;
                pushFault(faults, {
                    sequence: event.sequence,
                    category: "terminal",
                    code: "RUN_CANCELLED",
                    message: payload.reason,
                });
                break;
            }
            case "run_interrupted_action_unknown": {
                terminalFaultCount += 1;
                pushFault(faults, {
                    sequence: event.sequence,
                    category: "terminal",
                    code: "INTERRUPTED_ACTION_UNKNOWN",
                    origin: payload.toolId,
                    message: `Interrupted with unknown outcome on action ${payload.actionId}`,
                });
                break;
            }
            default:
                break;
        }
    }

    const isCompletedRun = input.runStatus === "completed" && input.stopReason === "end_turn";
    if (!isCompletedRun && terminalFaultCount === 0) {
        terminalFaultCount += 1;
        pushFault(faults, {
            sequence: null,
            category: "terminal",
            code: input.stopReason === "max_turn_requests" ? "MAX_STEPS_EXCEEDED" : "RUN_NOT_COMPLETED",
            message: `Run ended with runStatus=${input.runStatus}, stopReason=${String(input.stopReason)}`,
        });
    }

    const hasNonEmptyPatch = typeof input.patch === "string" && input.patch.trim().length > 0;
    const totalInteractionUnits = modelOkCount + repairCount + stageRejectionCount + toolCallCount;
    const weightedFaults = 1.0 * repairCount + 1.0 * stageRejectionCount + 0.5 * toolFaultCount;
    const callErrorRate = totalInteractionUnits === 0
        ? (terminalFaultCount > 0 ? 1.0 : 0.0)
        : Math.min(1.0, weightedFaults / Math.max(1, totalInteractionUnits));

    let terminalAlpha = 0.15;
    if (isCompletedRun && terminalFaultCount === 0) {
        terminalAlpha = hasNonEmptyPatch ? 1.0 : 0.3;
    }

    const rawScore = totalInteractionUnits === 0 && !isCompletedRun
        ? 0.0
        : terminalAlpha * (1.0 - callErrorRate) * Math.exp(-0.2 * weightedFaults);
    const runtimeScore = Math.max(0.0, Math.min(1.0, Number(rawScore.toFixed(6))));

    const zeroFaultPass = (
        repairCount === 0
        && stageRejectionCount === 0
        && toolFaultCount === 0
        && terminalFaultCount === 0
        && isCompletedRun
        && hasNonEmptyPatch
    );

    return Object.freeze({
        zeroFaultPass,
        runtimeScore,
        callErrorRate: Number(callErrorRate.toFixed(6)),
        modelOkCount,
        toolCallCount,
        totalInteractionUnits,
        repairCount,
        repairByOrigin: Object.freeze(repairByOrigin),
        stageRejectionCount,
        toolFaultCount,
        terminalFaultCount,
        weightedFaults: Number(weightedFaults.toFixed(4)),
        runStatus: input.runStatus,
        stopReason: input.stopReason,
        hasNonEmptyPatch,
        hasVerificationBashCall,
        ignoredNetworkFaultCount,
        faults: Object.freeze(faults),
    });
}

/**
 * 从已回收的宿主 `goals` 与 `trajectories` 目录读取已提交快照边界的 Trajectory 并计算健康度报告。
 *
 * @param options - 宿主持久化目录、Goal/Run 身份、停止原因与补丁。
 * @returns 结构化的 {@link SwebenchRuntimeHealthReport}。
 * @example
 * ```ts
 * const report = await scoreSwebenchPersistedTrajectory(options);
 * ```
 */
export async function scoreSwebenchPersistedTrajectory(
    options: PersistedTrajectoryScoreOptions,
): Promise<SwebenchRuntimeHealthReport> {
    const goalStore = new JsonFileGoalStore(options.goalSnapshotDir);
    const trajectoryStore = new JsonFileTrajectoryStore(options.trajectoryDir);
    const goal = await goalStore.restore(options.goalId);
    if (goal === undefined) {
        throw new Error(`Goal snapshot ${options.goalId} not found in ${options.goalSnapshotDir}`);
    }
    const { committed } = await readTrajectoryAtSnapshot(goalStore, trajectoryStore, {
        goalId: options.goalId,
        runId: options.runId,
    });
    return scoreRuntimeTrajectoryEvents({
        events: committed,
        runStatus: goal.state.run.status,
        stopReason: options.stopReason,
        patch: options.patch,
    });
}

function pushFault(target: RuntimeFaultEntry[], entry: RuntimeFaultEntry): void {
    if (target.length >= MAX_FAULT_ENTRIES) return;
    const truncatedMessage = entry.message.length <= MAX_FAULT_MESSAGE_CHARS
        ? entry.message
        : `${entry.message.slice(0, MAX_FAULT_MESSAGE_CHARS - 1)}…`;
    target.push(Object.freeze({
        sequence: entry.sequence,
        category: entry.category,
        code: entry.code,
        ...(entry.origin === undefined ? {} : { origin: entry.origin }),
        message: truncatedMessage,
    }));
}

function safeJson(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}
