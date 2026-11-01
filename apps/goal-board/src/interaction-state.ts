import type { BrowserAskUserAnswer, BrowserAskUserQuestion, BrowserSessionInteractionResponse } from "../../../packages/web-contracts/src/index";
import type { BrowserGoalInteractionCommand } from "./types";
import { fromSessionInteractionResponse } from "./types";
import type { ControlIntentState } from "./control/types";

/**
 * 新交互区域的逐题问答草稿。
 *
 * @remarks
 * 草稿只属于当前页面会话：逐题选择、Other 文本与整体回复各自独立保存，
 * 切换响应方式或问题都不提交。`currentIndex` 只是导航位置，不参与提交载荷。
 */
export interface QuestionDraftState {
  readonly answers: Readonly<Record<string, { readonly optionIds: readonly string[]; readonly otherText: string }>>;
  readonly mode: "answers" | "reply";
  readonly replyText: string;
  readonly currentIndex: number;
}

/** 创建空问卷草稿；新请求必须使用全新草稿，不复用旧交互内容。 */
export function createQuestionDraft(): QuestionDraftState {
  return { answers: {}, mode: "answers", replyText: "", currentIndex: 0 };
}

/** 读取某题的当前草稿；没有回答时返回空选择。 */
export function questionDraftFor(
  state: QuestionDraftState,
  questionId: string,
): { readonly optionIds: readonly string[]; readonly otherText: string } {
  return state.answers[questionId] ?? { optionIds: [], otherText: "" };
}

/**
 * 判断某题是否已作答。
 *
 * @remarks
 * 单选与多选都要求至少一个选项或非空 Other 文本；纯空白不算回答，
 * 服务端会以同一规则拒绝不完整问卷。
 */
export function isQuestionAnswered(state: QuestionDraftState, question: BrowserAskUserQuestion): boolean {
  const draft = questionDraftFor(state, question.id);
  return draft.optionIds.length > 0 || draft.otherText.trim().length > 0;
}

/** 统计已作答问题数量，用于导航与审阅状态。 */
export function answeredQuestionCount(
  state: QuestionDraftState,
  questions: readonly BrowserAskUserQuestion[],
): number {
  return questions.filter((question) => isQuestionAnswered(state, question)).length;
}

/**
 * 切换一个选项的选择状态。
 *
 * @remarks
 * 多选题沿用既有组合规则：同一选项再次选择即取消。单选替换当前选项，
 * 并清空该题 Other 文本，保持自由文本与选项互斥。
 */
export function toggleOption(
  state: QuestionDraftState,
  question: BrowserAskUserQuestion,
  optionId: string,
  checked: boolean,
): QuestionDraftState {
  const draft = questionDraftFor(state, question.id);
  const optionIds = question.multiSelect
    ? checked ? [...draft.optionIds, optionId] : draft.optionIds.filter((id) => id !== optionId)
    : [optionId];
  return {
    ...state,
    answers: {
      ...state.answers,
      [question.id]: { optionIds, otherText: question.multiSelect ? draft.otherText : "" },
    },
  };
}

/**
 * 更新某题的 Other 自由文本。
 *
 * @remarks
 * 单选题输入非空文本时清空已选项，保证“其他答案”与选项互斥；多选保留组合。
 */
export function setOtherText(
  state: QuestionDraftState,
  question: BrowserAskUserQuestion,
  otherText: string,
): QuestionDraftState {
  const draft = questionDraftFor(state, question.id);
  return {
    ...state,
    answers: {
      ...state.answers,
      [question.id]: {
        optionIds: !question.multiSelect && otherText.trim().length > 0 ? [] : draft.optionIds,
        otherText,
      },
    },
  };
}

/** 按相对步进切换当前问题；导航不提交、不修改任何回答。 */
export function moveQuestion(
  state: QuestionDraftState,
  questions: readonly BrowserAskUserQuestion[],
  delta: number,
): QuestionDraftState {
  return selectQuestion(state, state.currentIndex + delta, questions);
}

/** 定位到指定问题；越界时收敛到有效范围。 */
export function selectQuestion(
  state: QuestionDraftState,
  index: number,
  questions: readonly BrowserAskUserQuestion[],
): QuestionDraftState {
  if (questions.length === 0) return { ...state, currentIndex: 0 };
  return { ...state, currentIndex: Math.min(Math.max(index, 0), questions.length - 1) };
}

/** 切换逐题回答与整体回复；两种草稿都保留。 */
export function setResponseMode(state: QuestionDraftState, mode: QuestionDraftState["mode"]): QuestionDraftState {
  return { ...state, mode };
}

/** 更新整体回复草稿；与逐题草稿互不影响，只提交当前模式。 */
export function setReplyText(state: QuestionDraftState, replyText: string): QuestionDraftState {
  return { ...state, replyText };
}

/** 判断完整问卷是否可以提交：每道题都必须已作答。 */
export function canSubmitAnswers(
  state: QuestionDraftState,
  questions: readonly BrowserAskUserQuestion[],
): boolean {
  return questions.length > 0 && questions.every((question) => isQuestionAnswered(state, question));
}

/**
 * 按问题顺序构造完整逐题回答载荷。
 *
 * @remarks
 * 只包含已作答问题；未作答问题保留在草稿中并由提交前检查拦截，
 * 不做默认填充，也不裁剪用户正文。
 */
export function buildAnswers(
  state: QuestionDraftState,
  questions: readonly BrowserAskUserQuestion[],
): readonly BrowserAskUserAnswer[] {
  return questions
    .filter((question) => isQuestionAnswered(state, question))
    .map((question) => {
      const draft = questionDraftFor(state, question.id);
      const otherText = draft.otherText.trim();
      return {
        questionId: question.id,
        optionIds: draft.optionIds,
        ...(otherText.length === 0 ? {} : { otherText }),
      };
    });
}

/** 审阅条目：逐题展示当前回答，未作答明确标记。 */
export interface QuestionReviewEntry {
  readonly questionId: string;
  readonly header: string;
  readonly answered: boolean;
  readonly summary: string;
}

/** 生成完整答案审阅列表；只读，不修改草稿。 */
export function buildReview(
  state: QuestionDraftState,
  questions: readonly BrowserAskUserQuestion[],
): readonly QuestionReviewEntry[] {
  return questions.map((question) => {
    const draft = questionDraftFor(state, question.id);
    const labels = question.options
      .filter((option) => draft.optionIds.includes(option.id))
      .map((option) => option.label);
    const otherText = draft.otherText.trim();
    if (otherText.length > 0) labels.push(`Other: ${otherText}`);
    return {
      questionId: question.id,
      header: question.header,
      answered: isQuestionAnswered(state, question),
      summary: labels.length === 0 ? "Not answered" : labels.join(", "),
    };
  });
}

/**
 * 一次交互决定在该页面上的提交阶段。
 *
 * @remarks
 * `editing` 表示可编辑或可产生新决定；`submitting` 表示已冻结身份与载荷、
 * 正在等待受理结果；`unverified` 表示提交结果不明，必须按原身份核验后
 * 才能重试或继续编辑；`accepted` 只表示决定已保存；`invalidated` 表示请求
 * 已被其他结算或新请求取代。
 */
export type InteractionSubmissionPhase = "editing" | "submitting" | "unverified" | "accepted" | "invalidated";

/** 冻结的决定身份与载荷；核验与重试都必须复用同一身份。 */
export interface FrozenInteractionDecision {
  readonly inputId: string;
  readonly command: BrowserGoalInteractionCommand;
}

/**
 * 从控制意图派生的交互提交展示状态。
 *
 * @remarks
 * 状态由 `control/reducer` 的 `respond` 意图派生，页面不再维护第二份提交状态机；
 * `frozen` 只用于核验与原身份重试。
 */
export interface InteractionSubmissionState {
  readonly phase: InteractionSubmissionPhase;
  readonly frozen: FrozenInteractionDecision | null;
  readonly error: string | null;
}

/** 创建初始提交状态。 */
export function createInteractionSubmissionState(): InteractionSubmissionState {
  return { phase: "editing", frozen: null, error: null };
}

/**
 * 判断一次交互拒绝是否意味着当前等待已失效。
 *
 * @param code - 控制收据或 API 错误码。
 * @returns 当前等待已被其他结算或新请求取代时返回 `true`。
 * @example
 * ```ts
 * isInvalidatingInteractionCode("action_not_waiting"); // true
 * ```
 */
export function isInvalidatingInteractionCode(code: string): boolean {
  return code === "stale_run" || code === "stale_request" || code === "action_not_waiting" || code === "goal_not_waiting";
}

/**
 * 从控制意图派生当前交互的提交状态。
 *
 * @remarks
 * 只读取与当前等待 `requestId` 关联的 `respond` 控制意图：待处理为 `submitting`，
 * 已受理为 `accepted`，结果不明为 `unverified`，明确失效拒绝为 `invalidated`。
 * 核验确认未保存的决定回到 `editing` 并保留冻结身份，使同一决定按原 `inputId`
 * 重试。本地编辑草稿不进入该状态。
 *
 * @param intents - 控制意图列表。
 * @param view - 当前等待交互的规范引用。
 * @param errorText - 把稳定业务码转成用户可读说明。
 * @returns 与页面组件兼容的提交状态。
 * @example
 * ```ts
 * const submission = selectInteractionSubmission(control.state.intents, view, textOf);
 * ```
 */
export function selectInteractionSubmission(
  intents: readonly ControlIntentState[],
  view: { readonly runId: string; readonly requestId?: string; readonly actionId?: string },
  errorText: (code: string) => string,
): InteractionSubmissionState {
  const requestId = view.requestId ?? view.actionId ?? "";
  const entry = [...intents].reverse().find((candidate) => candidate.intent.kind === "session_input"
    && candidate.intent.input.kind === "respond"
    && candidate.intent.input.requestId === requestId);
  if (entry === undefined || entry.intent.kind !== "session_input" || entry.intent.input.kind !== "respond") {
    return createInteractionSubmissionState();
  }
  const frozen: FrozenInteractionDecision = {
    inputId: entry.intent.input.inputId,
    command: fromSessionInteractionResponse(view, entry.intent.input.response),
  };
  switch (entry.phase) {
    case "pending":
      return { phase: "submitting", frozen, error: null };
    case "accepted":
    case "applied":
      return { phase: "accepted", frozen, error: null };
    case "unknown":
      return entry.verification === "not_applied"
        ? { phase: "editing", frozen, error: null }
        : { phase: "unverified", frozen, error: null };
    case "rejected": {
      const code = entry.receipt?.status === "rejected" ? entry.receipt.error : "interaction_rejected";
      return isInvalidatingInteractionCode(code)
        ? { phase: "invalidated", frozen, error: errorText(code) }
        : { phase: "editing", frozen: null, error: errorText(code) };
    }
  }
}

/**
 * 判断当前状态是否允许提交决定。
 *
 * @remarks
 * 编辑状态始终允许；结果不明时必须先核验，`accepted` 与 `invalidated`
 * 不再接受任何决定。
 */
export function canSubmitDecision(state: InteractionSubmissionState): boolean {
  return state.phase === "editing";
}

/** 判断是否必须先按原身份核验结果。 */
export function needsVerification(state: InteractionSubmissionState): boolean {
  return state.phase === "unverified";
}

/**
 * 为一次决定选择提交身份。
 *
 * @remarks
 * 与冻结载荷相同的决定必须复用原 `inputId`；修改后的新决定使用调用方提供的
 * 新身份。核验后确认未提交的决定保留原身份，避免产生第二个身份。
 */
export function resolveDecisionInputId(
  state: InteractionSubmissionState,
  command: BrowserGoalInteractionCommand,
  nextInputId: () => string,
): string {
  if (state.frozen !== null && sameCommand(state.frozen.command, command)) return state.frozen.inputId;
  return nextInputId();
}

/**
 * 判断两个决定载荷是否相同。
 *
 * @remarks 载荷只包含页面构造的判别联合，字段顺序稳定，可直接比较序列化结果。
 */
export function sameCommand(left: BrowserGoalInteractionCommand, right: BrowserGoalInteractionCommand): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** 已提交决定的简短摘要，用于 Activity 中的决定记录。 */
export function decisionSummary(command: BrowserGoalInteractionCommand): string {
  switch (command.kind) {
    case "answer_ask_user":
      return `Answers sent, ${command.answers.length} question${command.answers.length === 1 ? "" : "s"}`;
    case "reply_to_question":
      return "Overall reply sent";
    case "skip_question":
      return "Questionnaire skipped";
    case "approve_task":
      return "Task approved";
    case "feedback_task":
      return "Task feedback sent";
    case "approve_action":
      return command.scope === "goal" ? "Action approved for this Goal"
        : command.scope === "workspace" ? "Action approved for this project"
          : "Action approved once";
    case "approve_action_revision":
      return command.scope === "goal" ? "Revised action approved for this Goal"
        : command.scope === "workspace" ? "Revised action approved for this project"
          : "Revised action approved once";
    case "retry_unknown_action":
      return "Action allowed to run again";
    case "decline_unknown_action_retry":
      return "Repeated execution declined";
    case "reject_action":
      return "Action rejected";
  }
}
