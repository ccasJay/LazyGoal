import { useEffect, useId, useReducer, useRef, useState } from "react";
import { Check, CircleHelp, Eye, Loader, ShieldAlert, X } from "lucide-react";

import type {
  BrowserAskUserQuestion,
  BrowserInteractionDetail,
  BrowserInteractionView,
} from "../../../packages/web-contracts/src/index";
import { BrowserApiError, browserApi } from "./api";
import {
  answeredQuestionCount,
  buildAnswers,
  buildReview,
  canSubmitAnswers,
  canSubmitDecision,
  createInteractionSubmissionState,
  createQuestionDraft,
  decisionSummary,
  isQuestionAnswered,
  moveQuestion,
  needsVerification,
  questionDraftFor,
  reduceInteractionSubmission,
  resolveDecisionInputId,
  selectQuestion,
  setOtherText,
  setReplyText,
  setResponseMode,
  toggleOption,
  type InteractionSubmissionState,
  type QuestionDraftState,
} from "./interaction-state";
import { errorMessage, toSessionInteractionResponse, type BrowserGoalInteractionCommand } from "./types";

/** 完整审阅详情的加载结果。 */
type InteractionDetailState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly detail: BrowserInteractionDetail }
  | { readonly kind: "error"; readonly message: string };

/** 详情读取失败的稳定说明；读取失败保留等待，不降级为批准。 */
export function interactionDetailErrorText(error: string): string {
  switch (error) {
    case "interaction_details_unavailable":
      return "The complete request could not be loaded. Retry before making a decision.";
    case "goal_not_found":
      return "This Goal is no longer available in the current workspace.";
    default:
      return "This request changed. The latest saved state is being loaded.";
  }
}

/** 提交状态对应的状态播报文案。 */
export function submissionStatusText(state: InteractionSubmissionState): string {
  switch (state.phase) {
    case "editing":
      return "Not submitted yet.";
    case "submitting":
      return "Sending your decision…";
    case "unverified":
      return "The result could not be confirmed. Check this decision before retrying.";
    case "accepted":
      return "Your decision was saved.";
    case "invalidated":
      return "This request is no longer current. The latest saved state is shown.";
  }
}

/** 已提交决定摘要条目；由交互区域上报给 Activity。 */
export interface AcceptedDecisionSummary {
  readonly interactionId: string;
  readonly runId: string;
  readonly summary: string;
}

/** 交互区域可处理的用户动作。 */
export type QuestionViewEvent =
  | { readonly kind: "select_question"; readonly index: number }
  | { readonly kind: "move_question"; readonly delta: number }
  | { readonly kind: "toggle_option"; readonly questionId: string; readonly optionId: string; readonly checked: boolean }
  | { readonly kind: "other_text"; readonly questionId: string; readonly value: string }
  | { readonly kind: "mode"; readonly mode: "answers" | "reply" }
  | { readonly kind: "reply_text"; readonly value: string }
  | { readonly kind: "submit_answers" }
  | { readonly kind: "submit_reply" }
  | { readonly kind: "request_skip" }
  | { readonly kind: "confirm_skip" }
  | { readonly kind: "cancel_skip" }
  | { readonly kind: "verify" }
  | { readonly kind: "retry" }
  | { readonly kind: "stop" };

/** 新交互区域共用的只读展示上下文。 */
export interface InteractionRegionChrome {
  readonly label: string;
  readonly stopping: boolean;
  readonly busy: boolean;
}

/**
 * 问答交互区域的纯展示视图。
 *
 * @remarks
 * 只消费显式传入的草稿、提交状态与完整详情，不读取整个会话、不自行推断交互
 * 种类。导航、审阅、模式切换与停止只发出事件；提交只发生在决定操作上，
 * 文本框 Enter／Escape 不隐式提交、批准或跳过。
 */
export function QuestionInteractionView({
  interactionId,
  detail,
  draft,
  submission,
  chrome,
  skipConfirmOpen,
  onEvent,
}: {
  interactionId: string;
  detail: Extract<BrowserInteractionDetail, { kind: "question" }>;
  draft: QuestionDraftState;
  submission: InteractionSubmissionState;
  chrome: InteractionRegionChrome;
  skipConfirmOpen: boolean;
  onEvent: (event: QuestionViewEvent) => void;
}) {
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const questions = detail.questions;
  const current = questions[Math.min(draft.currentIndex, Math.max(questions.length - 1, 0))];
  const answeredCount = answeredQuestionCount(draft, questions);
  const locked = !canSubmitDecision(submission) && submission.phase !== "editing";
  const review = buildReview(draft, questions);

  if (submission.phase === "accepted") {
    return (
      <section className="approval structured-form interaction-region question-region" aria-label="Interaction decision">
        <div className="interaction-accepted" role="status">
          <Check size={14} aria-hidden="true" /> {submissionStatusText(submission)}
        </div>
      </section>
    );
  }

  if (submission.phase === "invalidated") {
    return (
      <section className="approval structured-form interaction-region question-region" aria-label="Interaction decision">
        <p className="interaction-error" role="alert">{submission.error}</p>
        <p className="interaction-status" role="status">{submissionStatusText(submission)}</p>
      </section>
    );
  }

  const routeRevision = detail.routeRevision;

  return (
    <section className="approval structured-form interaction-region question-region" aria-labelledby={headingId}>
      <div className="approval-heading">
        <CircleHelp size={15} aria-hidden="true" />
        <strong id={headingId}>Your answer is needed</strong>
        <button
          type="button"
          className="interaction-stop"
          disabled={chrome.stopping}
          onClick={() => onEvent({ kind: "stop" })}
        >
          {chrome.stopping ? "Stopping…" : "Stop run"}
        </button>
      </div>
      <p className="interaction-note" id={hintId}>
        {detail.mode === "plan"
          ? "This questionnaire runs inside a Plan Run."
          : "The Runtime is waiting for this questionnaire."}
        {routeRevision !== undefined ? " This questionnaire also asks for a Plan route revision." : ""}
      </p>
      {routeRevision !== undefined && (
        <div className="route-revision-review">
          <h4>Plan route revision approval</h4>
          <p>{routeRevision.approvalRequest}</p>
          <p><strong>Reason:</strong> {routeRevision.reason}</p>
          <p className="interaction-note">
            Only the matching approval option accepts this route; an overall reply or a skip keeps the current route.
          </p>
          <div className="proposed-route" aria-label="Proposed route revision">
            <h5>Proposed stages</h5>
            <ol>
              {routeRevision.stages.map((stage, index) => (
                <li key={`${index}-${stage.target}`}>
                  <strong>{stage.target}</strong>
                  <ul>{stage.acceptanceCriteria.map((criterion, criterionIndex) => (
                    <li key={`${index}-${criterionIndex}`}>{criterion}</li>
                  ))}</ul>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
      <fieldset className="interaction-mode-switch" disabled={chrome.busy || locked}>
        <legend>Response method</legend>
        <label htmlFor={`${baseId}-mode-answers`}>
          <input
            id={`${baseId}-mode-answers`}
            type="radio"
            name={`response-method-${interactionId}`}
            checked={draft.mode === "answers"}
            onChange={() => onEvent({ kind: "mode", mode: "answers" })}
          />
          <span><strong>Answer each question</strong><small>Send one answer for every question.</small></span>
        </label>
        <label htmlFor={`${baseId}-mode-reply`}>
          <input
            id={`${baseId}-mode-reply`}
            type="radio"
            name={`response-method-${interactionId}`}
            checked={draft.mode === "reply"}
            onChange={() => onEvent({ kind: "mode", mode: "reply" })}
          />
          <span><strong>Reply instead</strong><small>Send one overall reply that replaces the questionnaire.</small></span>
        </label>
      </fieldset>
      <p className="interaction-note">
        Both drafts are kept while you switch. Only the selected response method is submitted.
      </p>

      {draft.mode === "answers" ? (
        questions.length === 0 ? (
          <p className="interaction-note">This questionnaire has no questions. Use Skip to continue.</p>
        ) : (
          <>
            <nav className="question-nav" aria-label="Questions">
              <p className="question-nav-progress" role="status" aria-live="polite">
                Answered {answeredCount} of {questions.length}
              </p>
              <ol>
                {questions.map((question, index) => (
                  <li key={question.id}>
                    <button
                      type="button"
                      className={`question-nav-item ${index === draft.currentIndex ? "current" : ""} ${isQuestionAnswered(draft, question) ? "answered" : "unanswered"}`}
                      aria-current={index === draft.currentIndex ? "step" : undefined}
                      disabled={chrome.busy || locked}
                      onClick={() => onEvent({ kind: "select_question", index })}
                    >
                      <span className="question-nav-index">Question {index + 1}</span>
                      <span className="question-nav-header">{question.header}</span>
                      <span className="question-nav-state">
                        {isQuestionAnswered(draft, question) ? "Answered" : "Not answered"}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
            {current !== undefined && (
              <QuestionField
                key={current.id}
                question={current}
                draft={questionDraftFor(draft, current.id)}
                describedBy={submission.error === null ? hintId : `${hintId} ${errorId}`}
                disabled={chrome.busy || locked}
                baseId={baseId}
                onEvent={onEvent}
              />
            )}
            <div className="question-nav-actions">
              <button
                type="button"
                disabled={chrome.busy || locked || draft.currentIndex === 0}
                onClick={() => onEvent({ kind: "move_question", delta: -1 })}
              >
                Previous question
              </button>
              <button
                type="button"
                disabled={chrome.busy || locked || draft.currentIndex >= questions.length - 1}
                onClick={() => onEvent({ kind: "move_question", delta: 1 })}
              >
                Next question
              </button>
            </div>
            <section className="interaction-review" aria-label="Answer review">
              <h5>Review before sending</h5>
              <ol>
                {review.map((entry, index) => (
                  <li key={entry.questionId} className={entry.answered ? "" : "unanswered"}>
                    <strong>{index + 1}. {entry.header}</strong>
                    <span>{entry.summary}</span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )
      ) : (
        <div className="overall-reply">
          <label htmlFor={`${baseId}-reply`}>Overall reply</label>
          <textarea
            id={`${baseId}-reply`}
            name="overall-reply"
            aria-label="Overall reply"
            aria-describedby={`${baseId}-reply-note`}
            value={draft.replyText}
            disabled={chrome.busy || locked}
            onChange={(event) => onEvent({ kind: "reply_text", value: event.target.value })}
            placeholder="Explain what should happen instead of answering each question…"
          />
          <p className="interaction-note" id={`${baseId}-reply-note`}>
            This reply replaces the questionnaire for this request. Per-question answers are kept but not submitted.
          </p>
        </div>
      )}

      {submission.error !== null && (
        <p className="interaction-error" id={errorId} role="alert">{submission.error}</p>
      )}
      <p className="interaction-status" role="status" aria-live="polite">
        {submissionStatusText(submission)}
      </p>
      {needsVerification(submission) && (
        <div className="interaction-resolve">
          <button type="button" className="approval-primary" onClick={() => onEvent({ kind: "verify" })}>
            <Eye size={13} aria-hidden="true" /> Check saved decision
          </button>
          <button type="button" onClick={() => onEvent({ kind: "retry" })}>
            Retry the same decision
          </button>
        </div>
      )}
      <div className="ask-user-actions">
        {draft.mode === "answers" ? (
          <button
            type="button"
            className="approval-primary"
            disabled={chrome.busy || locked || !canSubmitAnswers(draft, questions)}
            onClick={() => onEvent({ kind: "submit_answers" })}
          >
            <Check size={13} aria-hidden="true" /> Send answers
          </button>
        ) : (
          <button
            type="button"
            className="approval-primary"
            disabled={chrome.busy || locked || draft.replyText.trim().length === 0}
            onClick={() => onEvent({ kind: "submit_reply" })}
          >
            <Check size={13} aria-hidden="true" /> Send reply
          </button>
        )}
        {!skipConfirmOpen ? (
          <button
            type="button"
            className="interaction-skip"
            aria-expanded={false}
            disabled={chrome.busy || locked}
            onClick={() => onEvent({ kind: "request_skip" })}
          >
            <X size={13} aria-hidden="true" /> Skip questionnaire
          </button>
        ) : (
          <div className="skip-confirm" role="group" aria-label="Confirm skipping the questionnaire">
            <p>
              Skipping continues this Run without answers. The model is told that you did not answer, no options are
              chosen, and a Plan route revision stays unapproved.
            </p>
            <button type="button" className="approval-cancel" onClick={() => onEvent({ kind: "confirm_skip" })}>
              Confirm skip
            </button>
            <button type="button" onClick={() => onEvent({ kind: "cancel_skip" })}>Keep answering</button>
          </div>
        )}
      </div>
    </section>
  );
}

function QuestionField({
  question,
  draft,
  describedBy,
  disabled,
  baseId,
  onEvent,
}: {
  question: BrowserAskUserQuestion;
  draft: { readonly optionIds: readonly string[]; readonly otherText: string };
  describedBy: string;
  disabled: boolean;
  baseId: string;
  onEvent: (event: QuestionViewEvent) => void;
}) {
  return (
    <fieldset className="question" aria-describedby={describedBy}>
      <legend>{question.header}</legend>
      <p>{question.question}</p>
      <p className="interaction-note">
        {question.multiSelect ? "Select one or more options." : "Select one option, or write an other answer."}
      </p>
      <div className="question-options">
        {question.options.map((option) => {
          const optionId = `${baseId}-q-${question.id}-o-${option.id}`;
          return (
            <label className="answer-option" key={option.id} htmlFor={optionId}>
              <input
                id={optionId}
                type={question.multiSelect ? "checkbox" : "radio"}
                name={`question-${question.id}`}
                checked={draft.optionIds.includes(option.id)}
                disabled={disabled}
                onChange={(event) => onEvent({
                  kind: "toggle_option",
                  questionId: question.id,
                  optionId: option.id,
                  checked: event.target.checked,
                })}
              />
              <span>{option.label}
                {option.description && <small>{option.description}</small>}
              </span>
            </label>
          );
        })}
      </div>
      <label className="other-answer" htmlFor={`${baseId}-q-${question.id}-other`}>
        <span>Other answer</span>
        <input
          id={`${baseId}-q-${question.id}-other`}
          name={`question-${question.id}-other`}
          value={draft.otherText}
          disabled={disabled}
          onChange={(event) => onEvent({ kind: "other_text", questionId: question.id, value: event.target.value })}
        />
      </label>
    </fieldset>
  );
}

/**
 * 问答交互区域容器。
 *
 * @remarks
 * 按稳定交互引用读取完整详情，并把草稿、提交状态机与事件接到统一会话输入；
 * 引用变化（新请求、新 Run、其他客户端结算）会重建草稿，不复用旧编辑状态。
 */
export function QuestionInteractionRegion({
  view,
  chrome,
  onRefreshSession,
  onInterrupt,
  onDecisionAccepted,
}: {
  view: BrowserInteractionView;
  chrome: InteractionRegionChrome;
  onRefreshSession: () => Promise<void>;
  onInterrupt: () => Promise<void>;
  onDecisionAccepted: (summary: AcceptedDecisionSummary) => void;
}) {
  const [detail, setDetail] = useState<InteractionDetailState>({ kind: "loading" });
  const [draft, setDraft] = useState<QuestionDraftState>(createQuestionDraft);
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
  const [submission, dispatch] = useReducer(reduceInteractionSubmission, undefined, createInteractionSubmissionState);
  const requestRef = useRef(0);

  const identity = `${view.runId}:${view.interactionId}`;
  useEffect(() => {
    setDraft(createQuestionDraft());
    setSkipConfirmOpen(false);
    dispatch({ kind: "reset" });
  }, [identity]);

  useEffect(() => {
    let active = true;
    const request = requestRef.current + 1;
    requestRef.current = request;
    setDetail({ kind: "loading" });
    browserApi.readInteractionDetail(view.goalId, view.runId, view.interactionId).then((result) => {
      if (!active || requestRef.current !== request) return;
      setDetail(result.ok
        ? { kind: "ready", detail: result.detail }
        : { kind: "error", message: interactionDetailErrorText(result.error) });
    }).catch(() => {
      if (!active || requestRef.current !== request) return;
      setDetail({ kind: "error", message: "The complete request could not be loaded. Retry before making a decision." });
    });
    return () => { active = false; };
  }, [view.goalId, view.runId, view.interactionId]);

  const invalidatingCodes = ["stale_run", "stale_request", "action_not_waiting", "goal_not_waiting"];

  async function submitCommand(command: BrowserGoalInteractionCommand): Promise<void> {
    const inputId = resolveDecisionInputId(submission, command, () => crypto.randomUUID());
    dispatch({ kind: "submit", decision: { inputId, command } });
    try {
      const accepted = await browserApi.submitInput(view.goalId, {
        kind: "respond",
        inputId,
        runId: view.runId,
        requestId: view.requestId ?? view.actionId ?? "",
        response: toSessionInteractionResponse(command),
      });
      if (!accepted.ok) {
        const code = accepted.error;
        const message = errorMessage(new BrowserApiError(code, 409, true));
        if (invalidatingCodes.includes(code)) dispatch({ kind: "invalidated", message });
        else dispatch({ kind: "rejected", message });
        return;
      }
      dispatch({ kind: "accepted" });
      onDecisionAccepted({ interactionId: view.interactionId, runId: view.runId, summary: decisionSummary(command) });
      await onRefreshSession();
    } catch (error) {
      if (error instanceof BrowserApiError && invalidatingCodes.includes(error.code)) {
        dispatch({ kind: "invalidated", message: errorMessage(error) });
        return;
      }
      dispatch({ kind: "unverified", message: errorMessage(error) });
    }
  }

  async function verifyFrozen(): Promise<void> {
    if (submission.frozen === null) return;
    try {
      const queried = await browserApi.readInputReceipt(view.goalId, submission.frozen.inputId);
      if (!queried.ok) {
        dispatch({ kind: "unverified", message: "The saved decision could not be read. Check again before sending anything else." });
        return;
      }
      if (!queried.found) {
        dispatch({ kind: "verified_absent", message: "This decision was not saved. You can retry the same decision." });
        return;
      }
      dispatch({ kind: "verified_accepted" });
      onDecisionAccepted({
        interactionId: view.interactionId,
        runId: view.runId,
        summary: decisionSummary(submission.frozen.command),
      });
      await onRefreshSession();
    } catch (error) {
      dispatch({ kind: "unverified", message: errorMessage(error) });
    }
  }

  function handleEvent(event: QuestionViewEvent): void {
    if (detail.kind !== "ready" || detail.detail.kind !== "question") {
      if (event.kind === "stop") void onInterrupt();
      return;
    }
    const questions = detail.detail.questions;
    switch (event.kind) {
      case "select_question":
        setDraft((state) => selectQuestion(state, event.index, questions));
        return;
      case "move_question":
        setDraft((state) => moveQuestion(state, questions, event.delta));
        return;
      case "toggle_option": {
        const question = questions.find((candidate) => candidate.id === event.questionId);
        if (question === undefined) return;
        setDraft((state) => toggleOption(state, question, event.optionId, event.checked));
        return;
      }
      case "other_text": {
        const question = questions.find((candidate) => candidate.id === event.questionId);
        if (question === undefined) return;
        setDraft((state) => setOtherText(state, question, event.value));
        return;
      }
      case "mode":
        setDraft((state) => setResponseMode(state, event.mode));
        setSkipConfirmOpen(false);
        return;
      case "reply_text":
        setDraft((state) => setReplyText(state, event.value));
        return;
      case "submit_answers":
        if (!canSubmitAnswers(draft, questions)) return;
        void submitCommand({
          kind: "answer_ask_user",
          runId: view.runId,
          requestId: view.requestId ?? "",
          answers: buildAnswers(draft, questions),
        });
        return;
      case "submit_reply": {
        const content = draft.replyText.trim();
        if (content.length === 0) return;
        void submitCommand({ kind: "reply_to_question", runId: view.runId, requestId: view.requestId ?? "", content });
        return;
      }
      case "request_skip":
        setSkipConfirmOpen(true);
        return;
      case "cancel_skip":
        setSkipConfirmOpen(false);
        return;
      case "confirm_skip":
        setSkipConfirmOpen(false);
        void submitCommand({ kind: "skip_question", runId: view.runId, requestId: view.requestId ?? "" });
        return;
      case "verify":
        void verifyFrozen();
        return;
      case "retry":
        if (submission.frozen !== null) void submitCommand(submission.frozen.command);
        return;
      case "stop":
        void onInterrupt();
        return;
    }
    return;
  }

  if (detail.kind === "loading") {
    return (
      <section className="approval structured-form interaction-region" aria-busy="true">
        <p className="interaction-note">Loading the complete request…</p>
      </section>
    );
  }
  if (detail.kind === "error") {
    return (
      <section className="approval structured-form interaction-region" role="alert">
        <div className="approval-heading">
          <ShieldAlert size={15} aria-hidden="true" />
          <strong>The request could not be loaded</strong>
        </div>
        <p>{detail.message}</p>
        <button type="button" onClick={() => setDetail({ kind: "loading" })}>
          <Loader size={13} aria-hidden="true" /> Retry loading
        </button>
        <button type="button" className="interaction-stop" disabled={chrome.stopping} onClick={() => void onInterrupt()}>
          {chrome.stopping ? "Stopping…" : "Stop run"}
        </button>
      </section>
    );
  }
  if (detail.detail.kind !== "question") {
    return (
      <section className="approval structured-form interaction-region" role="alert">
        <p>The saved request no longer matches this form. The latest state is being loaded.</p>
      </section>
    );
  }

  return (
    <QuestionInteractionView
      interactionId={view.interactionId}
      detail={detail.detail}
      draft={draft}
      submission={submission}
      chrome={chrome}
      skipConfirmOpen={skipConfirmOpen}
      onEvent={handleEvent}
    />
  );
}
