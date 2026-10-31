import { randomUUID } from "node:crypto";
import { ContractValidationError, isRecord } from "../../../contracts/src/index";
import type {
    AskUserQuestionInput,
    CompletionReviewResult,
} from "./schema-types";

/**
 * 规范化后的 AskUser 选项。
 *
 * @remarks
 * 由 Runtime 为模型提出或用户回答的选项分配局部稳定标识。
 *
 * @example
 * ```ts
 * const option: AskUserOption = { id: "o-1", label: "模式 1" };
 * ```
 */
export interface AskUserOption {
    /** 问题内唯一选项标识。 */
    readonly id: string;
    /** 面向用户的选项文本。 */
    readonly label: string;
    /** 可选补充说明。 */
    readonly description?: string;
}

/**
 * 规范化后的 AskUser 问题。
 *
 * @remarks
 * 由 Runtime 为问题分配局部唯一标识 `id`（如 `q-1`, `q-2`），并为选项分配 `id`。
 *
 * @example
 * ```ts
 * const question: AskUserQuestion = {
 *     id: "q-1",
 *     header: "模式选择",
 *     question: "请选择执行模式",
 *     options: [{ id: "o-1", label: "模式 1" }, { id: "o-2", label: "模式 2" }],
 *     multiSelect: false,
 * };
 * ```
 */
export interface AskUserQuestion {
    /** 问题局部唯一标识。 */
    readonly id: string;
    /** 简短分组标题。 */
    readonly header: string;
    /** 完整问题文本。 */
    readonly question: string;
    /** 可选项列表。 */
    readonly options: readonly AskUserOption[];
    /** 是否允许多选。 */
    readonly multiSelect: boolean;
}

/**
 * 用户对单个 AskUser 问题的回答。
 *
 * @remarks
 * 记录用户选择的选项标识数组或自由填写的 Other 文本。
 *
 * @example
 * ```ts
 * const answer: AskUserAnswer = {
 *     questionId: "q-1",
 *     optionIds: ["o-1"],
 * };
 * ```
 */
export interface AskUserAnswer {
    /** 对应问题标识。 */
    readonly questionId: string;
    /** 选中的选项标识。 */
    readonly optionIds: readonly string[];
    /** 可选的自由填写文本。 */
    readonly otherText?: string;
}

/**
 * 将模型提交的 AskUser 问题列表规范化，分配稳定局部标识与全局请求标识。
 *
 * @param input - 包含 1-3 个问题的原始模型输入。
 * @param requestId - 可选的指定请求标识，未提供时自动生成。
 * @returns 规范化后的请求对象，包含 requestId 与分配了 id 的问题数组。
 *
 * @example
 * ```ts
 * const normalized = normalizeAskUserRequest({ questions });
 * ```
 */
export function normalizeAskUserRequest(
    input: { readonly questions: readonly AskUserQuestionInput[] } | readonly AskUserQuestionInput[],
    requestId?: string,
): { readonly requestId: string; readonly questions: readonly AskUserQuestion[] } {
    const effectiveRequestId = requestId ?? `ask-${randomUUID()}`;
    const rawQuestions: readonly AskUserQuestionInput[] = "questions" in input
        ? input.questions
        : input;
    const questions = rawQuestions.map((q, qIndex) => {
        const questionId = `q-${qIndex + 1}`;
        const options = q.options.map((opt, optIndex) => ({
            id: `o-${optIndex + 1}`,
            label: opt.label,
            ...(opt.description !== undefined ? { description: opt.description } : {}),
        }));
        return {
            id: questionId,
            header: q.header,
            question: q.question,
            options: Object.freeze(options),
            multiSelect: q.multiSelect,
        };
    });
    return {
        requestId: effectiveRequestId,
        questions: Object.freeze(questions),
    };
}

/**
 * 校验用户提交的 AskUser 答案是否合法。
 *
 * @param questions - 原始规范化问题列表。
 * @param answers - 用户提交的答案列表。
 * @throws 答案数量不匹配、问题 ID 不对应、选项 ID 非法或单/多选规则违反时抛出异常。
 *
 * @example
 * ```ts
 * validateAskUserAnswers(questions, answers);
 * ```
 */
export function validateAskUserAnswers(
    questions: readonly AskUserQuestion[],
    answers: readonly AskUserAnswer[],
): void {
    if (answers.length !== questions.length) {
        throw new Error(`Answer count mismatch: expected ${questions.length}, received ${answers.length}`);
    }
    const questionMap = new Map<string, AskUserQuestion>();
    for (const q of questions) {
        questionMap.set(q.id, q);
    }

    const seenQuestionIds = new Set<string>();
    for (const answer of answers) {
        if (seenQuestionIds.has(answer.questionId)) {
            throw new Error(`Duplicate answer for question "${answer.questionId}"`);
        }
        seenQuestionIds.add(answer.questionId);

        const question = questionMap.get(answer.questionId);
        if (question === undefined) {
            throw new Error(`Answer references unknown question "${answer.questionId}"`);
        }

        const validOptionIds = new Set(question.options.map((o) => o.id));
        const selectedOptions = new Set<string>();
        for (const optId of answer.optionIds) {
            if (!validOptionIds.has(optId)) {
                throw new Error(`Option "${optId}" is not valid for question "${question.id}"`);
            }
            if (selectedOptions.has(optId)) {
                throw new Error(`Duplicate option "${optId}" selected in question "${question.id}"`);
            }
            selectedOptions.add(optId);
        }

        const hasOtherText = answer.otherText !== undefined && answer.otherText.trim().length > 0;
        if (answer.otherText !== undefined && !hasOtherText) {
            throw new Error(`otherText for question "${question.id}" must not be blank if provided`);
        }

        if (!question.multiSelect) {
            const selectedCount = answer.optionIds.length + (hasOtherText ? 1 : 0);
            if (selectedCount !== 1) {
                throw new Error(`Single-choice question "${question.id}" requires exactly one selection or otherText, got ${selectedCount}`);
            }
        } else {
            const totalSelections = answer.optionIds.length + (hasOtherText ? 1 : 0);
            if (totalSelections < 1) {
                throw new Error(`Multi-choice question "${question.id}" requires at least one selection or otherText`);
            }
        }
    }
}

/**
 * 在已解码的模型 JSON 边界拒绝空白审查反馈。
 * @param result - 通过结构契约的模型审查结果。
 * @returns 可用于 Runtime 反馈的审查结果。
 * @throws ContractValidationError 拒绝结果未指出任何缺口时抛出。
 * @example
 * ```ts
 * const result = validateCompletionReviewResult({ kind: "accept" });
 * ```
 */
export function validateCompletionReviewResult(result: CompletionReviewResult): CompletionReviewResult {
    if (result.kind === "reject" && result.feedback.trim().length === 0) {
        throw new ContractValidationError([{ code: "string_pattern", path: ["result", "feedback"], message: "Reject feedback must describe a concrete gap." }], false);
    }
    return result;
}

/** 基础语义校验问题的稳定分类码。 */
export type ModelOutputSemanticIssueCode =
    | "blank_string"
    | "string_too_long"
    | "invalid_sequence_range"
    | "invalid_evidence_reference"
    | "empty_update"
    | "invalid_tool_id"
    | "duplicate_option";

/**
 * 定位到结构字段的基础语义问题。
 *
 * @remarks
 * 用于表示非空白字符串、非反转 sequence range 或更新操作无字段等不满足业务协议语义的问题。
 *
 * @example
 * ```ts
 * const issue: ModelOutputSemanticIssue = {
 *     code: "blank_string",
 *     path: ["question"],
 *     message: "String must not be blank",
 * };
 * ```
 */
export interface ModelOutputSemanticIssue {
    /** 问题的稳定分类码。 */
    readonly code: ModelOutputSemanticIssueCode;
    /** 问题所在的访问路径。 */
    readonly path: readonly (string | number)[];
    /** 面向诊断的英文消息。 */
    readonly message: string;
}

function checkNonBlank(
    value: unknown,
    path: readonly (string | number)[],
    issues: ModelOutputSemanticIssue[],
    fieldName: string,
): void {
    if (typeof value === "string" && value.trim().length === 0) {
        issues.push({
            code: "blank_string",
            path,
            message: `${fieldName} must not be blank`,
        });
    }
}

function checkCriterionSemantics(
    criterion: unknown,
    path: readonly (string | number)[],
    issues: ModelOutputSemanticIssue[],
): void {
    if (!isRecord(criterion)) return;
    checkNonBlank(criterion.text, [...path, "text"], issues, "completion criterion text");
    if (isRecord(criterion.acceptance)) {
        checkNonBlank(
            criterion.acceptance.expectToolId,
            [...path, "acceptance", "expectToolId"],
            issues,
            "expectToolId",
        );
        if (typeof criterion.acceptance.expectToolId === "string" && criterion.acceptance.expectToolId.startsWith("system_")) {
            issues.push({
                code: "invalid_tool_id",
                path: [...path, "acceptance", "expectToolId"],
                message: `expectToolId "${criterion.acceptance.expectToolId}" must not be a system function`,
            });
        }
    }
}

function validateFiltersSemantics(
    filters: unknown,
    parentPath: readonly (string | number)[],
    issues: ModelOutputSemanticIssue[],
): void {
    if (!isRecord(filters)) return;
    const stringArrayFields = [
        "eventTypes",
        "toolIds",
        "actionIds",
        "paths",
        "errorCodes",
        "objectIds",
    ] as const;

    for (const field of stringArrayFields) {
        const arr = filters[field];
        if (Array.isArray(arr)) {
            arr.forEach((item, index) => {
                checkNonBlank(item, [...parentPath, field, index], issues, `${field}[${index}]`);
            });
        }
    }

    if (isRecord(filters.sequenceRange)) {
        const range = filters.sequenceRange;
        if (
            typeof range.from === "number"
            && typeof range.to === "number"
            && range.from > range.to
        ) {
            issues.push({
                code: "invalid_sequence_range",
                path: [...parentPath, "sequenceRange"],
                message: "sequenceRange.from must be less than or equal to sequenceRange.to",
            });
        }
    }
}

function validateMemoryPatchSemantics(
    patch: unknown,
    parentPath: readonly (string | number)[],
    issues: ModelOutputSemanticIssue[],
): void {
    if (!isRecord(patch) || !Array.isArray(patch.operations)) return;

    patch.operations.forEach((op, index) => {
        if (!isRecord(op) || typeof op.type !== "string") return;
        const opPath = [...parentPath, "operations", index];

        switch (op.type) {
            case "upsert_fact": {
                if (isRecord(op.fact)) {
                    checkNonBlank(op.fact.subject, [...opPath, "fact", "subject"], issues, "subject");
                    checkNonBlank(op.fact.predicate, [...opPath, "fact", "predicate"], issues, "predicate");
                }
                break;
            }
            case "retire_fact": {
                if (isRecord(op.fact)) {
                    checkNonBlank(op.fact.id, [...opPath, "fact", "id"], issues, "id");
                }
                break;
            }
            case "create_hypothesis": {
                if (isRecord(op.hypothesis)) {
                    checkNonBlank(op.hypothesis.statement, [...opPath, "hypothesis", "statement"], issues, "statement");
                }
                break;
            }
            case "update_hypothesis": {
                if (isRecord(op.hypothesis)) {
                    checkNonBlank(op.hypothesis.id, [...opPath, "hypothesis", "id"], issues, "id");
                    if (op.hypothesis.statement !== undefined) {
                        checkNonBlank(op.hypothesis.statement, [...opPath, "hypothesis", "statement"], issues, "statement");
                    }
                    if (op.hypothesis.statement === undefined && op.hypothesis.status === undefined) {
                        issues.push({
                            code: "empty_update",
                            path: [...opPath, "hypothesis"],
                            message: "update_hypothesis must update at least one field",
                        });
                    }
                }
                break;
            }
            case "create_blocker": {
                if (isRecord(op.blocker)) {
                    checkNonBlank(op.blocker.description, [...opPath, "blocker", "description"], issues, "description");
                }
                break;
            }
            case "update_blocker": {
                if (isRecord(op.blocker)) {
                    checkNonBlank(op.blocker.id, [...opPath, "blocker", "id"], issues, "id");
                    if (op.blocker.description !== undefined) {
                        checkNonBlank(op.blocker.description, [...opPath, "blocker", "description"], issues, "description");
                    }
                    if (op.blocker.description === undefined && op.blocker.status === undefined) {
                        issues.push({
                            code: "empty_update",
                            path: [...opPath, "blocker"],
                            message: "update_blocker must update at least one field",
                        });
                    }
                }
                break;
            }
        }
    });
}

function validateGoalPlanPatchSemantics(
    value: Record<string, unknown>,
    parentPath: readonly (string | number)[],
    issues: ModelOutputSemanticIssue[],
): void {
    if (typeof value.baseRevision === "number" && value.baseRevision < 0) {
        issues.push({
            code: "invalid_sequence_range",
            path: [...parentPath, "baseRevision"],
            message: "baseRevision must be non-negative",
        });
    }
    if (!Array.isArray(value.operations)) return;

    if (value.operations.length === 0) {
        issues.push({
            code: "empty_update",
            path: [...parentPath, "operations"],
            message: "goal_plan_update must contain at least one operation",
        });
    }

    value.operations.forEach((operation, index) => {
        if (!isRecord(operation) || typeof operation.type !== "string") return;
        const path = [...parentPath, "operations", index];
        switch (operation.type) {
            case "add":
                checkNonBlank(operation.content, [...path, "content"], issues, "Todo content");
                break;
            case "update":
                checkNonBlank(operation.id, [...path, "id"], issues, "Todo id");
                if (operation.content !== undefined) {
                    checkNonBlank(operation.content, [...path, "content"], issues, "Todo content");
                }
                if (operation.content === undefined && operation.status === undefined) {
                    issues.push({
                        code: "empty_update",
                        path,
                        message: "GoalPlan update must change content or status",
                    });
                }
                if (operation.status === "completed") {
                    if (!Array.isArray(operation.evidenceSequences) || operation.evidenceSequences.length === 0) {
                        issues.push({
                            code: "invalid_evidence_reference",
                            path: [...path, "evidenceSequences"],
                            message: "completed Todo update must cite current Run evidence",
                        });
                    }
                } else if (operation.evidenceSequences !== undefined) {
                    issues.push({
                        code: "invalid_evidence_reference",
                        path: [...path, "evidenceSequences"],
                        message: "evidenceSequences is only valid when completing a Todo",
                    });
                }
                break;
            case "reorder":
            case "cancel":
                checkNonBlank(operation.id, [...path, "id"], issues, "Todo id");
                break;
        }
    });
}

/**
 * 校验模型输出的协议基础语义。
 *
 * @remarks
 * 纯函数，不修改输入、不进行 trim、不补充默认值。
 * 针对 AgentDecision、ContextLookupRequest、GoalTask 或 MemoryPatch
 * 检查非空白字符串、非反转 sequenceRange 及 update 操作非空变更。
 *
 * @param value - 待校验的模型输出对象或子对象。
 * @param basePath - 可选的基础路径前缀，默认空数组。
 * @returns 语义问题列表；无问题时返回空数组。
 * @example
 * ```ts
 * const issues = validateModelOutputSemantics(result);
 * if (issues.length > 0) {
 *     console.error(issues[0].message);
 * }
 * ```
 */
export function validateModelOutputSemantics(
    value: unknown,
    basePath: readonly (string | number)[] = [],
): readonly ModelOutputSemanticIssue[] {
    const issues: ModelOutputSemanticIssue[] = [];

    if (!isRecord(value)) {
        return issues;
    }

    if (isRecord(value.memoryPatch)) {
        validateMemoryPatchSemantics(value.memoryPatch, [...basePath, "memoryPatch"], issues);
    } else if (value.protocolVersion === 1 && Array.isArray(value.operations)) {
        validateMemoryPatchSemantics(value, basePath, issues);
    }

    if (typeof value.kind === "string") {
        switch (value.kind) {
            case "request_think": {
                checkNonBlank(value.goal, [...basePath, "goal"], issues, "goal");
                break;
            }
            case "question": {
                checkNonBlank(value.question, [...basePath, "question"], issues, "question");
                break;
            }
            case "ask_user": {
                if (Array.isArray(value.questions)) {
                    value.questions.forEach((q, qIndex) => {
                        if (!isRecord(q)) return;
                        const qPath = [...basePath, "questions", qIndex];
                        checkNonBlank(q.header, [...qPath, "header"], issues, "header");
                        checkNonBlank(q.question, [...qPath, "question"], issues, "question");
                        if (Array.isArray(q.options)) {
                            const seenLabels = new Set<string>();
                            q.options.forEach((opt, optIndex) => {
                                if (!isRecord(opt)) return;
                                const optPath = [...qPath, "options", optIndex];
                                checkNonBlank(opt.label, [...optPath, "label"], issues, "label");
                                if (opt.description !== undefined) {
                                    checkNonBlank(opt.description, [...optPath, "description"], issues, "description");
                                }
                                if (typeof opt.label === "string" && opt.label.trim().length > 0) {
                                    const normalizedLabel = opt.label.trim();
                                    if (seenLabels.has(normalizedLabel)) {
                                        issues.push({
                                            code: "duplicate_option",
                                            path: [...optPath, "label"],
                                            message: `Duplicate option label "${opt.label}" in question`,
                                        });
                                    }
                                    seenLabels.add(normalizedLabel);
                                }
                            });
                        }
                    });
                }
                break;
            }
            case "task_proposal": {
                checkNonBlank(value.approvalRequest, [...basePath, "approvalRequest"], issues, "approvalRequest");
                if (isRecord(value.task)) {
                    checkNonBlank(value.task.objective, [...basePath, "task", "objective"], issues, "objective");
                    if (Array.isArray(value.task.completionCriteria)) {
                        value.task.completionCriteria.forEach((item, index) => {
                            checkCriterionSemantics(
                                item,
                                [...basePath, "task", "completionCriteria", index],
                                issues,
                            );
                        });
                    }
                }
                if (isRecord(value.planRoute) && Array.isArray(value.planRoute.stages)) {
                    value.planRoute.stages.forEach((stage, index) => {
                        if (!isRecord(stage)) return;
                        const stagePath = [...basePath, "planRoute", "stages", index];
                        checkNonBlank(stage.target, [...stagePath, "target"], issues, "stage target");
                        if (Array.isArray(stage.acceptanceCriteria)) {
                            stage.acceptanceCriteria.forEach((criterion, criterionIndex) => {
                                checkNonBlank(
                                    criterion,
                                    [...stagePath, "acceptanceCriteria", criterionIndex],
                                    issues,
                                    "stage acceptance criterion",
                                );
                            });
                        }
                    });
                }
                break;
            }
            case "run_plan_route_update": {
                checkNonBlank(value.reason, [...basePath, "reason"], issues, "route revision reason");
                if (value.approvalRequest !== undefined) {
                    checkNonBlank(value.approvalRequest, [...basePath, "approvalRequest"], issues, "approvalRequest");
                }
                if (isRecord(value.route) && Array.isArray(value.route.stages)) {
                    value.route.stages.forEach((stage, index) => {
                        if (!isRecord(stage)) return;
                        const stagePath = [...basePath, "route", "stages", index];
                        checkNonBlank(stage.target, [...stagePath, "target"], issues, "stage target");
                        if (Array.isArray(stage.acceptanceCriteria)) {
                            stage.acceptanceCriteria.forEach((criterion, criterionIndex) => {
                                checkNonBlank(criterion, [...stagePath, "acceptanceCriteria", criterionIndex], issues, "stage acceptance criterion");
                            });
                        }
                    });
                }
                break;
            }
            case "context_lookup": {
                checkNonBlank(value.question, [...basePath, "question"], issues, "question");
                if (isRecord(value.filters)) {
                    validateFiltersSemantics(value.filters, [...basePath, "filters"], issues);
                }
                break;
            }
            case "tool_discovery": {
                checkNonBlank(value.query, [...basePath, "query"], issues, "query");
                if (typeof value.query === "string" && value.query.length > 512) {
                    issues.push({
                        code: "string_too_long",
                        path: [...basePath, "query"],
                        message: "query must not exceed 512 characters",
                    });
                }
                break;
            }
            case "tool_call": {
                if (isRecord(value.action)) {
                    checkNonBlank(value.action.actionId, [...basePath, "action", "actionId"], issues, "actionId");
                    checkNonBlank(value.action.toolId, [...basePath, "action", "toolId"], issues, "toolId");
                }
                break;
            }
            case "complete": {
                checkNonBlank(value.summary, [...basePath, "summary"], issues, "summary");
                break;
            }
            case "wait": {
                checkNonBlank(value.reason, [...basePath, "reason"], issues, "reason");
                break;
            }
            case "fail": {
                checkNonBlank(value.error, [...basePath, "error"], issues, "error");
                break;
            }
            case "goal_plan_update": {
                validateGoalPlanPatchSemantics(value, basePath, issues);
                break;
            }
        }
    } else {
        if (typeof value.objective === "string") {
            checkNonBlank(value.objective, [...basePath, "objective"], issues, "objective");
            if (Array.isArray(value.completionCriteria)) {
                value.completionCriteria.forEach((item, index) => {
                    checkCriterionSemantics(item, [...basePath, "completionCriteria", index], issues);
                });
            }
        }
        if (typeof value.actionId === "string" && typeof value.toolId === "string") {
            checkNonBlank(value.actionId, [...basePath, "actionId"], issues, "actionId");
            checkNonBlank(value.toolId, [...basePath, "toolId"], issues, "toolId");
        }
    }

    return Object.freeze(issues);
}

