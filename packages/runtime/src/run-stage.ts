/**
 * Run 阶段说明、修订与状态流转纯规则。
 *
 * @remarks
 * 阶段是 Run 内部的执行结构，由模型提出说明、修订和完成候选，Runtime 统一分配身份
 * 并通过检查点提交事实。同一 Run 内同时只允许存在一个当前活动阶段。
 */

/**
 * 阶段审查拒绝的最新缺口记录。
 */
export interface RunStageRejection {
    /** 审查拒绝的具体缺口与修正说明。 */
    readonly feedback: string;
    /** 发生拒绝时的 Trajectory 事实序列号（若有）。 */
    readonly rejectedAtSequence?: number;
}

/**
 * 前序已接受阶段的结果引用。
 */
export interface PreviousStageResultRef {
    /** 前序阶段的稳定身份。 */
    readonly stageId: string;
    /** 前序阶段被接受时的 Trajectory 序列号。 */
    readonly sequence: number;
}

/**
 * 单个 Run 阶段的可持久化状态。
 *
 * @remarks
 * 包含阶段身份、修订版本、状态（executing 或 accepted）、目标、完成条件及最新审查拒绝反馈。
 *
 * @example
 * ```ts
 * const stage: RunStageState = {
 *     stageId: "stage-1",
 *     revision: 1,
 *     status: "executing",
 *     target: "分析模块接口",
 *     acceptanceCriteria: ["列出接口定义"],
 * };
 * ```
 */
export interface RunStageState {
    /** 由 Runtime 统一分配的稳定阶段身份（如 `stage-1`）。 */
    readonly stageId: string;
    /** 当前阶段的修订版本号，从 1 开始递增。 */
    readonly revision: number;
    /** 阶段状态：执行中或已接受。 */
    readonly status: "executing" | "accepted";
    /** 阶段目标。 */
    readonly target: string;
    /** 阶段完成条件列表。 */
    readonly acceptanceCriteria: readonly string[];
    /** 前序已接受阶段的引用指针。 */
    readonly previousStageResultRef?: PreviousStageResultRef;
    /** 最新审查拒绝缺口（若当前修订或上一候选曾被拒绝）。 */
    readonly latestReviewRejection?: RunStageRejection;
    /** 阶段被接受时的 Trajectory 事实序列号（仅在 status 为 accepted 时存在）。 */
    readonly acceptedSequence?: number;
    /** 阶段归档所属的 Run 稳定标识（跨 Run 隔离同名 stageId 时使用）。 */
    readonly runId?: string;
    /** 阶段被接受时的阶段完成总结摘要。 */
    readonly summary?: string;
}

/**
 * 声明新阶段的输入。
 */
export interface DeclareRunStageInput {
    /** 阶段目标（非空）。 */
    readonly target: string;
    /** 阶段完成条件列表（非空）。 */
    readonly acceptanceCriteria: readonly string[];
}

/**
 * 修订当前阶段的输入。
 */
export interface ReviseRunStageInput {
    /** 目标阶段的身份，必须与当前活动阶段匹配。 */
    readonly stageId: string;
    /** 修订所基于的 revision，必须精确匹配当前 revision，否则为过期修订。 */
    readonly baseRevision: number;
    /** 非空修订理由。 */
    readonly reason: string;
    /** 修订后的阶段目标。 */
    readonly target: string;
    /** 修订后的完成条件列表。 */
    readonly acceptanceCriteria: readonly string[];
}

/**
 * 阶段流转异常。
 *
 * @remarks
 * 当阶段状态转换不满足前置条件（如跳过未完成阶段、过期修订、空字段）时抛出。
 *
 * @example
 * ```ts
 * throw new RunStageTransitionError("前序阶段尚未被接受，不能开启新阶段");
 * ```
 */
export class RunStageTransitionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RunStageTransitionError";
    }
}

function assertNonEmptyString(value: string, fieldName: string): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        throw new RunStageTransitionError(`${fieldName} 不能为空`);
    }
    return trimmed;
}

function assertNonEmptyCriteria(criteria: readonly string[]): readonly string[] {
    if (!Array.isArray(criteria) || criteria.length === 0) {
        throw new RunStageTransitionError("acceptanceCriteria 不能为空数组");
    }
    const cleaned = criteria.map((c, idx) => assertNonEmptyString(c, `acceptanceCriteria[${idx}]`));
    return cleaned;
}

/**
 * 创建新阶段的纯转换函数。
 *
 * @param input - 阶段目标与完成条件。
 * @param stageOrdinal - 阶段序号（1 开始），用于生成稳定 stageId（如 `stage-1`）。
 * @param previousStage - 前序阶段（若存在）。
 * @returns 初始化的执行中阶段状态。
 * @throws RunStageTransitionError 当输入不合法或前序阶段未被接受时抛出。
 *
 * @example
 * ```ts
 * const stage = createInitialRunStage({ target: "梳理架构", acceptanceCriteria: ["产出文档"] }, 1);
 * ```
 */
export function createInitialRunStage(
    input: DeclareRunStageInput,
    stageOrdinal: number,
    previousStage?: RunStageState,
): RunStageState {
    const target = assertNonEmptyString(input.target, "target");
    const acceptanceCriteria = assertNonEmptyCriteria(input.acceptanceCriteria);

    if (previousStage !== undefined) {
        if (previousStage.status !== "accepted") {
            throw new RunStageTransitionError(
                `前序阶段 ${previousStage.stageId} 尚未通过审查接受，不能开启新阶段`,
            );
        }
    }

    const previousStageResultRef: PreviousStageResultRef | undefined = previousStage !== undefined
        ? {
            stageId: previousStage.stageId,
            sequence: previousStage.acceptedSequence ?? 0,
        }
        : undefined;

    return {
        stageId: `stage-${stageOrdinal}`,
        revision: 1,
        status: "executing",
        target,
        acceptanceCriteria,
        ...(previousStageResultRef !== undefined ? { previousStageResultRef } : {}),
    };
}

/**
 * 修订当前阶段的纯转换函数。
 *
 * @param currentStage - 当前活动阶段状态。
 * @param input - 修订参数。
 * @returns 修订后的阶段状态（revision 递增 1）。
 * @throws RunStageTransitionError 当修订过期、阶段 ID 不匹配或字段为空时抛出。
 *
 * @example
 * ```ts
 * const revised = reviseRunStage(currentStage, {
 *     stageId: "stage-1", baseRevision: 1, reason: "补全检查项",
 *     target: "新目标", acceptanceCriteria: ["项 1", "项 2"]
 * });
 * ```
 */
export function reviseRunStage(
    currentStage: RunStageState,
    input: ReviseRunStageInput,
): RunStageState {
    if (currentStage.status !== "executing") {
        throw new RunStageTransitionError(
            `阶段 ${currentStage.stageId} 当前处于 ${currentStage.status} 状态，不可修订`,
        );
    }
    if (input.stageId !== currentStage.stageId) {
        throw new RunStageTransitionError(
            `stageId 不匹配：当前为 ${currentStage.stageId}，输入为 ${input.stageId}`,
        );
    }
    if (input.baseRevision !== currentStage.revision) {
        throw new RunStageTransitionError(
            `过期修订：当前 revision 为 ${currentStage.revision}，输入 baseRevision 为 ${input.baseRevision}`,
        );
    }
    assertNonEmptyString(input.reason, "reason");
    const target = assertNonEmptyString(input.target, "target");
    const acceptanceCriteria = assertNonEmptyCriteria(input.acceptanceCriteria);

    return {
        ...currentStage,
        revision: currentStage.revision + 1,
        target,
        acceptanceCriteria,
    };
}

/**
 * 记录阶段审查拒绝并保持执行中状态。
 *
 * @param currentStage - 当前活动阶段。
 * @param feedback - 审查拒绝的缺口反馈。
 * @param rejectedAtSequence - 事实发生的序列号（可选）。
 * @param finalReview - 最终交付审查可重新打开已接受阶段，清除当前接受指针；历史事实不变。
 * @returns 更新拒绝反馈后的阶段状态。
 *
 * @example
 * ```ts
 * const rejected = rejectCurrentRunStage(currentStage, "缺失测试用例", 15);
 * ```
 */
export function rejectCurrentRunStage(
    currentStage: RunStageState,
    feedback: string,
    rejectedAtSequence?: number,
    finalReview = false,
): RunStageState {
    if (currentStage.status !== "executing" && !finalReview) {
        throw new RunStageTransitionError(`只有处于 executing 状态的阶段才可记录审查拒绝`);
    }
    const trimmedFeedback = assertNonEmptyString(feedback, "feedback");

    const { acceptedSequence: _, ...stage } = currentStage;
    return {
        ...stage,
        status: "executing",
        latestReviewRejection: {
            feedback: trimmedFeedback,
            ...(rejectedAtSequence !== undefined ? { rejectedAtSequence } : {}),
        },
    };
}

/**
 * 接受当前阶段并标记为 accepted。
 *
 * @param currentStage - 当前活动阶段。
 * @param acceptedSequence - 阶段接受事实写入 Trajectory 的序列号。
 * @returns 标记为已接受的阶段状态。
 *
 * @example
 * ```ts
 * const accepted = acceptCurrentRunStage(currentStage, 20);
 * ```
 */
export function acceptCurrentRunStage(
    currentStage: RunStageState,
    acceptedSequence: number,
): RunStageState {
    if (currentStage.status !== "executing") {
        throw new RunStageTransitionError(`只有处于 executing 状态的阶段才可接受`);
    }

    const { latestReviewRejection: _, ...rest } = currentStage;
    return {
        ...rest,
        status: "accepted",
        acceptedSequence,
    };
}
