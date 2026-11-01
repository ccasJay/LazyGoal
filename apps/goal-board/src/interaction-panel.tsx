import { Alert } from "./components/ui/alert";
import { RadioGroup, RadioGroupItem } from "./components/ui/radio-group";
import { Checkbox } from "./components/ui/checkbox";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./components/ui/collapsible";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Label } from "./components/ui/label";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, CircleHelp, Eye, Loader, Shield, ShieldAlert, X, Zap } from "lucide-react";

import type {
  BrowserActionReview,
  BrowserAskUserQuestion,
  BrowserJsonValue,
  BrowserInteractionDetail,
  BrowserInteractionView,
  BrowserPendingAction,
} from "../../../packages/web-contracts/src/index";
import { BrowserApiError, browserApi } from "./api";
import {
  answeredQuestionCount,
  buildAnswers,
  buildReview,
  canSubmitAnswers,
  canSubmitDecision,
  createQuestionDraft,
  decisionSummary,
  isInvalidatingInteractionCode,
  isQuestionAnswered,
  moveQuestion,
  needsVerification,
  questionDraftFor,
  resolveDecisionInputId,
  selectInteractionSubmission,
  selectQuestion,
  setOtherText,
  setReplyText,
  setResponseMode,
  toggleOption,
  type InteractionSubmissionState,
  type QuestionDraftState,
} from "./interaction-state";
import { errorMessage, toSessionInteractionResponse, type BrowserGoalInteractionCommand } from "./types";
import type { ControlIntents } from "./hooks/useControlIntents";
import { reviewOf } from "./control/results";

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

/** 任务审批区域的用户动作。 */
export type TaskApprovalViewEvent =
  | { readonly kind: "submit_approve" }
  | { readonly kind: "feedback_text"; readonly value: string }
  | { readonly kind: "submit_feedback" }
  | { readonly kind: "verify" }
  | { readonly kind: "retry" }
  | { readonly kind: "stop" };

/** 工具／沙箱审批与结果恢复区域的用户动作。 */
export type ActionViewEvent =
  | { readonly kind: "scope"; readonly scope: "action" | "goal" | "workspace" }
  | { readonly kind: "submit_approve" }
  | { readonly kind: "edit_toggle"; readonly editing: boolean }
  | { readonly kind: "edit_text"; readonly value: string }
  | { readonly kind: "preview" }
  | { readonly kind: "submit_approve_revision" }
  | { readonly kind: "reject_text"; readonly value: string }
  | { readonly kind: "submit_reject" }
  | { readonly kind: "verify" }
  | { readonly kind: "retry" }
  | { readonly kind: "stop" };

/** 审批审阅结果的稳定错误说明；失败保留草稿与等待。 */
export function actionReviewErrorText(error: string): string {
  switch (error) {
    case "invalid_tool_input":
      return "These parameters are not valid for this tool. Fix the field and preview again.";
    case "tool_not_found":
      return "This tool is no longer available. Approve it unchanged or reject the action.";
    case "scope_unavailable":
    case "sandbox_scope_unavailable":
      return "Ongoing authorization is unavailable for this workspace. Approve the action once instead.";
    case "action_not_waiting":
      return "This request is no longer waiting for a decision. The latest saved state is being loaded.";
    case "action_id_mismatch":
      return "This request no longer matches the pending action. The latest saved state is being loaded.";
    case "goal_not_found":
      return "This Goal is no longer available in the current workspace.";
    case "stale_run":
      return "The session changed. The latest saved state is being loaded.";
    default:
      return "The proposed parameters could not be reviewed. Retry before making a decision.";
  }
}

/** 新交互区域共用的只读展示上下文。 */
export interface InteractionRegionChrome {
  readonly label: string;
  readonly stopping: boolean;
  readonly busy: boolean;
}

/** 按目标交互种类读取完整审阅内容；引用变化时重新读取。 */
export function useInteractionDetail(view: BrowserInteractionView): {
  readonly state: InteractionDetailState;
  readonly reload: () => void;
} {
  const [state, setState] = useState<InteractionDetailState>({ kind: "loading" });
  const requestRef = useRef(0);

  const load = useCallback(() => {
    const request = requestRef.current + 1;
    requestRef.current = request;
    setState({ kind: "loading" });
    browserApi.readInteractionDetail(view.goalId, view.runId, view.interactionId).then((result) => {
      if (requestRef.current !== request) return;
      setState(result.ok
        ? { kind: "ready", detail: result.detail }
        : { kind: "error", message: interactionDetailErrorText(result.error) });
    }).catch(() => {
      if (requestRef.current !== request) return;
      setState({ kind: "error", message: "The complete request could not be loaded. Retry before making a decision." });
    });
  }, [view.goalId, view.runId, view.interactionId]);

  useEffect(() => {
    load();
    return () => { requestRef.current += 1; };
  }, [load]);

  return { state, reload: load };
}

/** 权限批准属于当前交互的授权操作，不作为输入区的历史摘要保留。 */
function shouldRecordDecisionSummary(command: BrowserGoalInteractionCommand): boolean {
  return command.kind !== "approve_action" && command.kind !== "approve_action_revision";
}

/** 统一交互提交与结果核验；冻结身份、复用原身份重试并保留编辑草稿。 */
export function useInteractionSubmission({
  view,
  control,
  onRefreshSession,
  onDecisionAccepted,
}: {
  readonly view: BrowserInteractionView;
  readonly control: ControlIntents;
  readonly onRefreshSession: () => Promise<void>;
  readonly onDecisionAccepted: (summary: AcceptedDecisionSummary) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const derived = selectInteractionSubmission(control.state.intents, view, receiptErrorText);
  const submission: InteractionSubmissionState = error === null ? derived : { ...derived, error };

  const submitCommand = useCallback(async (command: BrowserGoalInteractionCommand): Promise<void> => {
    const inputId = resolveDecisionInputId(submission, command, () => crypto.randomUUID());
    setError(null);
    const receipt = await control.submit({
      kind: "session_input",
      intentId: inputId,
      goalId: view.goalId,
      input: {
        kind: "respond",
        inputId,
        runId: view.runId,
        requestId: view.requestId ?? view.actionId ?? "",
        response: toSessionInteractionResponse(command),
      },
    });
    if (receipt.status === "rejected") {
      setError(receiptErrorText(receipt.error));
      return;
    }
    if (receipt.status === "unknown") {
      setError("The decision result is unknown. Verify it before sending it again.");
      return;
    }
    if (shouldRecordDecisionSummary(command)) {
      onDecisionAccepted({ interactionId: view.interactionId, runId: view.runId, summary: decisionSummary(command) });
    }
    await onRefreshSession();
  }, [submission, view, control.submit, onRefreshSession, onDecisionAccepted]);

  const verifyFrozen = useCallback(async (): Promise<void> => {
    if (submission.frozen === null) return;
    const verification = await control.verify(submission.frozen.inputId);
    if (verification === "not_applied") {
      setError("This decision was not saved. You can retry the same decision.");
      return;
    }
    if (verification === "unknown") {
      setError("The saved decision could not be read. Check again before sending anything else.");
      return;
    }
    setError(null);
    if (shouldRecordDecisionSummary(submission.frozen.command)) {
      onDecisionAccepted({
        interactionId: view.interactionId,
        runId: view.runId,
        summary: decisionSummary(submission.frozen.command),
      });
    }
    await onRefreshSession();
  }, [submission.frozen, view, control.verify, onRefreshSession, onDecisionAccepted]);

  return { submission, submitCommand, verifyFrozen };
}

function receiptErrorText(code: string): string {
  if (code === "interaction_rejected") return "The decision was not saved. Edit it and submit again.";
  return errorMessage(new BrowserApiError(code, 409, false));
}

function isInvalidatingCode(code: string): boolean {
  return isInvalidatingInteractionCode(code);
}

/** 已受理／失效的终态摘要：移除可操作表单，只保留决定记录。 */
function DecisionSettled({
  submission,
  label,
}: {
  submission: InteractionSubmissionState;
  label: string;
}) {
  return (
    <section className="approval structured-form interaction-region" aria-label={label}>
      {submission.phase === "accepted" ? (
        <div className="interaction-accepted" role="status">
          <Check size={14} aria-hidden="true" /> {submissionStatusText(submission)}
        </div>
      ) : (
        <>
          <Alert variant="destructive" className="interaction-error" role="alert">{submission.error}</Alert>
          <p className="interaction-status" role="status">{submissionStatusText(submission)}</p>
        </>
      )}
    </section>
  );
}

function SubmissionStatus({
  submission,
  onEvent,
}: {
  submission: InteractionSubmissionState;
  onEvent: (event: { readonly kind: "verify" } | { readonly kind: "retry" }) => void;
}) {
  return (
    <>
      {submission.error !== null && (
        <Alert variant="destructive" className="interaction-error" role="alert">{submission.error}</Alert>
      )}
      <p className="interaction-status" role="status" aria-live="polite">
        {submissionStatusText(submission)}
      </p>
      {needsVerification(submission) && (
        <div className="interaction-resolve">
          <Button variant="ghost" size="sm" type="button" className="approval-primary" onClick={() => onEvent({ kind: "verify" })}>
            <Eye size={13} aria-hidden="true" /> Check saved decision
          </Button>
          <Button variant="ghost" size="sm" type="button" onClick={() => onEvent({ kind: "retry" })}>
            Retry the same decision
          </Button>
        </div>
      )}
    </>
  );
}

/** 停止 Run 的独立入口；只受停止状态限制，不受回答提交在途限制。 */
function StopRunButton({ stopping, onStop }: { stopping: boolean; onStop: () => void }) {
  return (
    <Button variant="ghost" size="sm" type="button" className="interaction-stop" disabled={stopping} onClick={onStop}>
      {stopping ? "Stopping…" : "Stop run"}
    </Button>
  );
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

  if (submission.phase === "accepted" || submission.phase === "invalidated") {
    return <DecisionSettled submission={submission} label="Interaction decision" />;
  }

  const routeRevision = detail.routeRevision;

  return (
    <section className="approval structured-form interaction-region question-region" aria-labelledby={headingId}>
      <div className="approval-heading">
        <CircleHelp size={15} aria-hidden="true" />
        <strong id={headingId}>Your answer is needed</strong>
        <StopRunButton stopping={chrome.stopping} onStop={() => onEvent({ kind: "stop" })} />
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
      <RadioGroup asChild value={draft.mode} onValueChange={mode => onEvent({ kind: "mode", mode: mode as "answers" | "reply" })} disabled={chrome.busy || locked}><fieldset className="interaction-mode-switch" disabled={chrome.busy || locked}>
        <legend>Response method</legend>
        <Label htmlFor={`${baseId}-mode-answers`}>
          <RadioGroupItem id={`${baseId}-mode-answers`} value="answers" />
          <span><strong>Answer each question</strong><small>Send one answer for every question.</small></span>
        </Label>
        <Label htmlFor={`${baseId}-mode-reply`}>
          <RadioGroupItem id={`${baseId}-mode-reply`} value="reply" />
          <span><strong>Reply instead</strong><small>Send one overall reply that replaces the questionnaire.</small></span>
        </Label>
      </fieldset></RadioGroup>
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
                    <Button variant="ghost" size="sm"
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
                    </Button>
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
              <Button variant="ghost" size="sm"
                type="button"
                disabled={chrome.busy || locked || draft.currentIndex === 0}
                onClick={() => onEvent({ kind: "move_question", delta: -1 })}
              >
                Previous question
              </Button>
              <Button variant="ghost" size="sm"
                type="button"
                disabled={chrome.busy || locked || draft.currentIndex >= questions.length - 1}
                onClick={() => onEvent({ kind: "move_question", delta: 1 })}
              >
                Next question
              </Button>
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
          <Label htmlFor={`${baseId}-reply`}>Overall reply</Label>
          <Textarea
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
        <Alert variant="destructive" className="interaction-error" id={errorId} role="alert">{submission.error}</Alert>
      )}
      <p className="interaction-status" role="status" aria-live="polite">
        {submissionStatusText(submission)}
      </p>
      {needsVerification(submission) && (
        <div className="interaction-resolve">
          <Button variant="ghost" size="sm" type="button" className="approval-primary" onClick={() => onEvent({ kind: "verify" })}>
            <Eye size={13} aria-hidden="true" /> Check saved decision
          </Button>
          <Button variant="ghost" size="sm" type="button" onClick={() => onEvent({ kind: "retry" })}>
            Retry the same decision
          </Button>
        </div>
      )}
      <div className="ask-user-actions">
        {draft.mode === "answers" ? (
          <Button variant="ghost" size="sm"
            type="button"
            className="approval-primary"
            disabled={chrome.busy || locked || !canSubmitAnswers(draft, questions)}
            onClick={() => onEvent({ kind: "submit_answers" })}
          >
            <Check size={13} aria-hidden="true" /> Send answers
          </Button>
        ) : (
          <Button variant="ghost" size="sm"
            type="button"
            className="approval-primary"
            disabled={chrome.busy || locked || draft.replyText.trim().length === 0}
            onClick={() => onEvent({ kind: "submit_reply" })}
          >
            <Check size={13} aria-hidden="true" /> Send reply
          </Button>
        )}
        {!skipConfirmOpen ? (
          <Button variant="ghost" size="sm"
            type="button"
            className="interaction-skip"
            aria-expanded={false}
            disabled={chrome.busy || locked}
            onClick={() => onEvent({ kind: "request_skip" })}
          >
            <X size={13} aria-hidden="true" /> Skip questionnaire
          </Button>
        ) : (
          <div className="skip-confirm" role="group" aria-label="Confirm skipping the questionnaire">
            <p>
              Skipping continues this Run without answers. The model is told that you did not answer, no options are
              chosen, and a Plan route revision stays unapproved.
            </p>
            <Button variant="ghost" size="sm" type="button" className="approval-cancel" onClick={() => onEvent({ kind: "confirm_skip" })}>
              Confirm skip
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => onEvent({ kind: "cancel_skip" })}>Keep answering</Button>
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
  const Options = question.multiSelect ? "div" : RadioGroup;
  return (
    <fieldset className="question" aria-describedby={describedBy}>
      <legend>{question.header}</legend>
      <p>{question.question}</p>
      <p className="interaction-note">
        {question.multiSelect ? "Select one or more options." : "Select one option, or write an other answer."}
      </p>
      <Options className="question-options" {...(question.multiSelect ? {} : { value: draft.optionIds[0] ?? "", disabled, onValueChange: (value: string) => onEvent({ kind: "toggle_option", questionId: question.id, optionId: value, checked: true }) })}>
        {question.options.map((option) => {
          const optionId = `${baseId}-q-${question.id}-o-${option.id}`;
          return (
            <Label className="answer-option" key={option.id} htmlFor={optionId}>
              {question.multiSelect ? <Checkbox id={optionId} name={`question-${question.id}`} checked={draft.optionIds.includes(option.id)} disabled={disabled}
                onCheckedChange={checked => onEvent({ kind: "toggle_option", questionId: question.id, optionId: option.id, checked: checked === true })} />
                : <RadioGroupItem id={optionId} value={option.id} disabled={disabled} />}
              <span>{option.label}
                {option.description && <small>{option.description}</small>}
              </span>
            </Label>
          );
        })}
      </Options>
      <Label className="other-answer" htmlFor={`${baseId}-q-${question.id}-other`}>
        <span>Other answer</span>
        <Input
          id={`${baseId}-q-${question.id}-other`}
          name={`question-${question.id}-other`}
          value={draft.otherText}
          disabled={disabled}
          onChange={(event) => onEvent({ kind: "other_text", questionId: question.id, value: event.target.value })}
        />
      </Label>
    </fieldset>
  );
}

/**
 * 任务提案审批区域的纯展示视图。
 *
 * @remarks
 * 决定前展示完整目标、验收条件与有序候选阶段；批准是明确操作，反馈携带非空
 * 文本并使提案失效后重新规划。反馈文本不构成批准。
 */
export function TaskApprovalInteractionView({
  detail,
  submission,
  feedback,
  chrome,
  onEvent,
}: {
  detail: Extract<BrowserInteractionDetail, { kind: "task_approval" }>;
  submission: InteractionSubmissionState;
  feedback: string;
  chrome: InteractionRegionChrome;
  onEvent: (event: TaskApprovalViewEvent) => void;
}) {
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const feedbackId = "task-feedback";
  const locked = submission.phase !== "editing";

  if (submission.phase === "accepted" || submission.phase === "invalidated") {
    return <DecisionSettled submission={submission} label="Task approval decision" />;
  }

  return (
    <section className="approval structured-form interaction-region task-approval-region" aria-labelledby={headingId}>
      <div className="approval-heading">
        <CircleHelp size={15} aria-hidden="true" />
        <strong id={headingId}>Review the proposed task</strong>
        <StopRunButton stopping={chrome.stopping} onStop={() => onEvent({ kind: "stop" })} />
      </div>
      <p>{detail.approvalRequest}</p>
      <h4>{detail.objective}</h4>
      {detail.completionCriteria.length > 0 && (
        <ul className="criteria-list" aria-label="Completion criteria">
          {detail.completionCriteria.map((criterion, index) => <li key={index}>{criterion}</li>)}
        </ul>
      )}
      <div className="proposed-route" aria-label="Proposed stages">
        <h5>Proposed stages</h5>
        <ol>
          {detail.stages.map((stage, index) => (
            <li key={index}>
              <strong>{stage.target}</strong>
              <ul>{stage.acceptanceCriteria.map((criterion, criterionIndex) => (
                <li key={criterionIndex}>{criterion}</li>
              ))}</ul>
            </li>
          ))}
        </ol>
      </div>
      <SubmissionStatus submission={submission} onEvent={onEvent} />
      <Button variant="ghost" size="sm"
        type="button"
        className="approval-primary"
        disabled={chrome.busy || locked}
        onClick={() => onEvent({ kind: "submit_approve" })}
      >
        <Check size={13} aria-hidden="true" /> Approve task
      </Button>
      <div className="feedback-form">
        <Label htmlFor={feedbackId}>Or send feedback</Label>
        <Textarea
          id={feedbackId}
          name="task-feedback"
          aria-label="Task feedback"
          value={feedback}
          disabled={chrome.busy || locked}
          onChange={(event) => onEvent({ kind: "feedback_text", value: event.target.value })}
          placeholder="Describe what should change…"
        />
        <Button variant="ghost" size="sm"
          type="button"
          disabled={chrome.busy || locked || feedback.trim().length === 0}
          onClick={() => onEvent({ kind: "submit_feedback" })}
        >
          Send feedback
        </Button>
      </div>
    </section>
  );
}

/**
 * 工具／沙箱审批与结果恢复区域的纯展示视图。
 *
 * @remarks
 * 完整展示操作输入、申请能力与授权期限；默认单次，持续授权受完整审阅限制。
 * 结果未知时明确说明可能已执行及重复效果，只提供单次重试与拒绝，不提供持续
 * 授权或参数编辑。拒绝必须携带非空理由。
 */
export function ActionInteractionView({
  detail,
  summary,
  scope,
  rejection,
  editing,
  draftInput,
  review,
  reviewError,
  reviewing,
  submission,
  chrome,
  onEvent,
}: {
  detail: Extract<BrowserInteractionDetail, { kind: "action_approval" | "action_recovery" }>;
  summary: BrowserPendingAction | undefined;
  scope: "action" | "goal" | "workspace";
  rejection: string;
  editing: boolean;
  draftInput: string;
  review: BrowserActionReview | undefined;
  reviewError: string | undefined;
  reviewing: boolean;
  submission: InteractionSubmissionState;
  chrome: InteractionRegionChrome;
  onEvent: (event: ActionViewEvent) => void;
}) {
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const reasonId = "action-reason";
  const recovery = detail.kind === "action_recovery";
  const locked = submission.phase !== "editing";
  const persistentDisabled = recovery || chrome.busy || locked;
  const targetPath = summary?.targetPath;
  const pathAuthorization = targetPath !== undefined && (detail.toolId === "write_file" || detail.toolId === "edit_file");

  if (submission.phase === "accepted" || submission.phase === "invalidated") {
    return <DecisionSettled submission={submission} label="Action decision" />;
  }

  return (
    <section className="approval structured-form action-approval interaction-region action-region" aria-labelledby={headingId}>
      <div className="approval-heading">
        <CircleHelp size={15} aria-hidden="true" />
        <strong id={headingId}>{recovery ? "Action result needs review" : "Your approval is needed"}</strong>
        <span className="action-summary"><Zap size={13} aria-hidden="true" />{detail.toolId}</span>
        <StopRunButton stopping={chrome.stopping} onStop={() => onEvent({ kind: "stop" })} />
      </div>
      <p className="interaction-kind-note">
        <Shield size={13} aria-hidden="true" />
        {detail.approvalKind === "sandbox" ? " Sandbox permission request." : " Tool permission request."}
      </p>
      {recovery && (
        <p className="interaction-warning" role="alert">
          This action may already have run. Retrying can execute it again and repeat its effects.
        </p>
      )}
      {detail.parentProgram !== undefined && (
        <p>
          Program <code>{detail.parentProgram.actionId}</code>, call {detail.parentProgram.callNumber}.
          Review this operation on its own merits.
        </p>
      )}
      <div className="action-input-preview">
        <Label>Tool input</Label>
        <pre className="action-input-full">{formatToolInput(detail.input)}</pre>
      </div>
      {!recovery && (
        <section className="action-parameter-editor" aria-label="Edit tool parameters">
          {!editing ? (
            <Button variant="ghost" size="sm"
              type="button"
              disabled={chrome.busy || locked}
              onClick={() => onEvent({ kind: "edit_toggle", editing: true })}
            >
              Edit parameters
            </Button>
          ) : (
            <>
              <Label htmlFor={`${baseId}-edited-input`}>Edited tool parameters (JSON)</Label>
              <Textarea
                id={`${baseId}-edited-input`}
                name="edited-tool-input"
                className="edited-tool-input"
                value={draftInput}
                disabled={chrome.busy || locked}
                onChange={(event) => onEvent({ kind: "edit_text", value: event.target.value })}
                spellCheck={false}
              />
              <div className="action-parameter-editor-actions">
                <Button variant="ghost" size="sm"
                  type="button"
                  disabled={chrome.busy || locked || reviewing}
                  onClick={() => onEvent({ kind: "preview" })}
                >
                  {reviewing ? "Reviewing…" : "Preview changes"}
                </Button>
                <Button variant="ghost" size="sm"
                  type="button"
                  disabled={chrome.busy || locked}
                  onClick={() => onEvent({ kind: "edit_toggle", editing: false })}
                >
                  Cancel editing
                </Button>
              </div>
            </>
          )}
        </section>
      )}
      {reviewError !== undefined && (
        <p className="interaction-warning" role="alert">{reviewError}</p>
      )}
      {review !== undefined && (
        <section className="action-review" aria-label="Reviewed changes">
          <h5>Reviewed changes</h5>
          <p>Scope: {review.scope === "action" ? "This action only"
            : review.scope === "goal" ? "This Goal" : "This project"}</p>
          <p>Network: {review.capability.network === "none" ? "None" : "All outbound"}</p>
          {review.capability.targetPaths.length > 0 && (
            <p>Targets: {review.capability.targetPaths.map((target) => <code key={target}>{target}</code>)}</p>
          )}
          {review.capability.extraFiles.length > 0 && (
            <ul>
              {review.capability.extraFiles.map((file) => (
                <li key={file.canonicalPath}><code>{file.canonicalPath}</code>, {file.access}</li>
              ))}
            </ul>
          )}
          {review.requiresSandboxApproval && (
            <p>This scope needs sandbox permission and must be approved explicitly.</p>
          )}
          <Collapsible defaultOpen>
            <CollapsibleTrigger>Original parameters</CollapsibleTrigger><CollapsibleContent>
            <pre className="action-input-full">{formatToolInput(review.originalInput)}</pre>
          </CollapsibleContent></Collapsible>
          <Collapsible defaultOpen>
            <CollapsibleTrigger>Final parameters</CollapsibleTrigger><CollapsibleContent>
            <pre className="action-input-full">{formatToolInput(review.finalInput)}</pre>
          </CollapsibleContent></Collapsible>
        </section>
      )}
      {pathAuthorization && (
        <p className="path-permission-note">
          Ongoing permission for <code>{targetPath}</code> also allows later writes to this path with different content.
        </p>
      )}
      {summary?.sandboxReview !== undefined && (
        <section className="sandbox-review" aria-label="Sandbox scope">
          <h5>Requested sandbox scope</h5>
          <p>Network: {summary.sandboxReview.network === "none" ? "None" : "All outbound"}</p>
          {summary.sandboxReview.networkNotice !== undefined && <p>{summary.sandboxReview.networkNotice}</p>}
          {summary.sandboxReview.extraFiles.length > 0 && (
            <ul>
              {summary.sandboxReview.extraFiles.map((file) => (
                <li key={file.canonicalPath}><code>{file.canonicalPath}</code>, {file.access}</li>
              ))}
            </ul>
          )}
        </section>
      )}
      {!recovery && (
        <RadioGroup asChild value={scope} onValueChange={value => onEvent({ kind: "scope", scope: value as "action" | "goal" | "workspace" })} disabled={chrome.busy || locked}><fieldset className="approval-scopes" disabled={chrome.busy || locked}>
          <legend>Allow this action</legend>
          <Label htmlFor={`${baseId}-scope-action`}>
            <RadioGroupItem id={`${baseId}-scope-action`} value="action" />
            <span><strong>Once</strong><small>Approve this action only.</small></span>
          </Label>
          <Label className={persistentDisabled ? "is-disabled" : ""} htmlFor={`${baseId}-scope-goal`}>
            <RadioGroupItem id={`${baseId}-scope-goal`} value="goal" disabled={persistentDisabled} />
            <span><strong>This Goal</strong><small>Allow matching actions in this session.</small></span>
          </Label>
          <Label className={persistentDisabled ? "is-disabled" : ""} htmlFor={`${baseId}-scope-workspace`}>
            <RadioGroupItem id={`${baseId}-scope-workspace`} value="workspace" disabled={persistentDisabled} />
            <span><strong>This project</strong><small>Allow matching actions in future Goals.</small></span>
          </Label>
        </fieldset></RadioGroup>
      )}
      <SubmissionStatus submission={submission} onEvent={onEvent} />
      <div className="action-approval-actions">
        <Button variant="ghost" size="sm"
          type="button"
          className="approval-primary"
          disabled={chrome.busy || locked}
          onClick={() => onEvent({ kind: "submit_approve" })}
        >
          <Check size={13} aria-hidden="true" />
          {recovery ? "Retry action"
            : scope === "goal" ? "Approve for this Goal"
              : scope === "workspace" ? "Approve for this project"
                : "Approve once"}
        </Button>
        {!recovery && review !== undefined && (
          <Button variant="ghost" size="sm"
            type="button"
            className="approval-primary"
            disabled={chrome.busy || locked}
            onClick={() => onEvent({ kind: "submit_approve_revision" })}
          >
            <Check size={13} aria-hidden="true" />
            {scope === "goal" ? "Approve revision for this Goal"
              : scope === "workspace" ? "Approve revision for this project"
                : "Approve revision once"}
          </Button>
        )}
        <Collapsible className="action-rejection" defaultOpen={recovery}>
          <CollapsibleTrigger>Reject action</CollapsibleTrigger><CollapsibleContent>
          <div className="feedback-form">
            <Label htmlFor={reasonId}>Reason for rejecting</Label>
            <Textarea
              id={reasonId}
              name="action-reason"
              value={rejection}
              disabled={chrome.busy || locked}
              onChange={(event) => onEvent({ kind: "reject_text", value: event.target.value })}
              placeholder="Explain why this action should not run…"
            />
            <Button variant="ghost" size="sm"
              type="button"
              disabled={chrome.busy || locked || rejection.trim().length === 0}
              onClick={() => onEvent({ kind: "submit_reject" })}
            >
              {recovery ? "Do not run again" : "Reject action"}
            </Button>
          </div>
        </CollapsibleContent></Collapsible>
      </div>
    </section>
  );
}

/** 完整 canonical 工具输入的只读格式；空对象也明确展示。 */
function formatToolInput(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2) ?? "{}";
  } catch {
    return "The complete input could not be displayed.";
  }
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
  control,
  onRefreshSession,
  onInterrupt,
  onDecisionAccepted,
}: {
  view: BrowserInteractionView;
  chrome: InteractionRegionChrome;
  control: ControlIntents;
  onRefreshSession: () => Promise<void>;
  onInterrupt: () => Promise<void>;
  onDecisionAccepted: (summary: AcceptedDecisionSummary) => void;
}) {
  const { state: detail, reload } = useInteractionDetail(view);
  const { submission, submitCommand, verifyFrozen } = useInteractionSubmission({ view, control, onRefreshSession, onDecisionAccepted });
  const [draft, setDraft] = useState<QuestionDraftState>(createQuestionDraft);
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);

  const identity = `${view.runId}:${view.interactionId}`;
  useEffect(() => {
    setDraft(createQuestionDraft());
    setSkipConfirmOpen(false);
  }, [identity]);

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
  }

  if (detail.kind === "loading") {
    return <InteractionLoading />;
  }
  if (detail.kind === "error") {
    return (
      <InteractionDetailFailure
        message={detail.message}
        stopping={chrome.stopping}
        onRetry={reload}
        onStop={() => void onInterrupt()}
      />
    );
  }
  if (detail.detail.kind !== "question") {
    return <InteractionMismatch />;
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

/** 任务审批区域容器：完整详情读取、批准与反馈提交。 */
export function TaskApprovalRegion({
  view,
  chrome,
  control,
  onRefreshSession,
  onInterrupt,
  onDecisionAccepted,
}: {
  view: BrowserInteractionView;
  chrome: InteractionRegionChrome;
  control: ControlIntents;
  onRefreshSession: () => Promise<void>;
  onInterrupt: () => Promise<void>;
  onDecisionAccepted: (summary: AcceptedDecisionSummary) => void;
}) {
  const { state: detail, reload } = useInteractionDetail(view);
  const { submission, submitCommand, verifyFrozen } = useInteractionSubmission({ view, control, onRefreshSession, onDecisionAccepted });
  const [feedback, setFeedback] = useState("");
  const identity = `${view.runId}:${view.interactionId}`;
  useEffect(() => { setFeedback(""); }, [identity]);

  function handleEvent(event: TaskApprovalViewEvent): void {
    switch (event.kind) {
      case "feedback_text":
        setFeedback(event.value);
        return;
      case "submit_approve":
        if (view.requestId === undefined) return;
        void submitCommand({ kind: "approve_task", runId: view.runId, requestId: view.requestId });
        return;
      case "submit_feedback": {
        const content = feedback.trim();
        if (content.length === 0 || view.requestId === undefined) return;
        void submitCommand({ kind: "feedback_task", runId: view.runId, requestId: view.requestId, feedback: content });
        return;
      }
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
  }

  if (detail.kind === "loading") {
    return <InteractionLoading />;
  }
  if (detail.kind === "error") {
    return (
      <InteractionDetailFailure
        message={detail.message}
        stopping={chrome.stopping}
        onRetry={reload}
        onStop={() => void onInterrupt()}
      />
    );
  }
  if (detail.detail.kind !== "task_approval") {
    return <InteractionMismatch />;
  }
  return (
    <TaskApprovalInteractionView
      detail={detail.detail}
      submission={submission}
      feedback={feedback}
      chrome={chrome}
      onEvent={handleEvent}
    />
  );
}

/**
 * 工具／沙箱审批与结果恢复区域容器。
 *
 * @remarks
 * 完整输入来自身份匹配的详情读取；读取失败或引用变化时保留等待并禁用批准。
 * 结果未知只允许单次重试或拒绝，授权范围固定为本次。
 */
export function ActionInteractionRegion({
  view,
  summary,
  chrome,
  control,
  onRefreshSession,
  onInterrupt,
  onDecisionAccepted,
}: {
  view: BrowserInteractionView;
  summary: BrowserPendingAction | undefined;
  chrome: InteractionRegionChrome;
  control: ControlIntents;
  onRefreshSession: () => Promise<void>;
  onInterrupt: () => Promise<void>;
  onDecisionAccepted: (summary: AcceptedDecisionSummary) => void;
}) {
  const { state: detail, reload } = useInteractionDetail(view);
  const { submission, submitCommand, verifyFrozen } = useInteractionSubmission({ view, control, onRefreshSession, onDecisionAccepted });
  const [scope, setScope] = useState<"action" | "goal" | "workspace">("action");
  const [rejection, setRejection] = useState("");
  const [editing, setEditing] = useState(false);
  const [draftInput, setDraftInput] = useState("");
  const [review, setReview] = useState<BrowserActionReview | undefined>(undefined);
  const [reviewError, setReviewError] = useState<string | undefined>(undefined);
  const [reviewing, setReviewing] = useState(false);
  const identity = `${view.runId}:${view.interactionId}`;
  useEffect(() => {
    setScope("action");
    setRejection("");
    setEditing(false);
    setDraftInput("");
    setReview(undefined);
    setReviewError(undefined);
  }, [identity]);

  // 再次编辑或更换期限都会让旧审阅结果失效。
  function invalidateReview(): void {
    setReview(undefined);
    setReviewError(undefined);
  }

  async function previewReview(actionId: string): Promise<void> {
    const parsed = parseEditedInput(draftInput);
    if (!parsed.ok) {
      setReviewError(parsed.message);
      setReview(undefined);
      return;
    }
    setReviewing(true);
    const receipt = await control.submit({
      kind: "action_review",
      intentId: crypto.randomUUID(),
      goalId: view.goalId,
      runId: view.runId,
      actionId,
      input: parsed.value as BrowserJsonValue,
      scope,
    });
    setReviewing(false);
    if (receipt.status === "rejected") {
      setReview(undefined);
      setReviewError(actionReviewErrorText(receipt.error));
      return;
    }
    if (receipt.status === "unknown") {
      setReview(undefined);
      setReviewError("The preview result is unknown. Reload the request before previewing again.");
      return;
    }
    const reviewed = reviewOf(receipt.result);
    if (reviewed === undefined) {
      setReview(undefined);
      setReviewError(actionReviewErrorText("review_unavailable"));
      return;
    }
    setReviewError(undefined);
    setReview(reviewed);
  }

  function handleEvent(event: ActionViewEvent): void {
    switch (event.kind) {
      case "scope":
        setScope(event.scope);
        invalidateReview();
        return;
      case "edit_toggle": {
        const current = detail.kind === "ready"
          && (detail.detail.kind === "action_approval" || detail.detail.kind === "action_recovery")
          ? formatToolInput(detail.detail.input)
          : "";
        setEditing(event.editing);
        setDraftInput(event.editing ? current : "");
        invalidateReview();
        return;
      }
      case "edit_text":
        setDraftInput(event.value);
        invalidateReview();
        return;
      case "preview": {
        if (view.actionId === undefined) return;
        void previewReview(view.actionId);
        return;
      }
      case "submit_approve_revision": {
        if (view.actionId === undefined || review === undefined) return;
        void submitCommand({
          kind: "approve_action_revision",
          runId: view.runId,
          actionId: view.actionId,
          input: review.finalInput,
          reviewRef: review.reviewRef,
          scope,
        });
        return;
      }
      case "reject_text":
        setRejection(event.value);
        return;
      case "submit_approve":
        if (view.actionId === undefined) return;
        if (view.kind === "action_recovery") {
          const recoveryRef = detail.kind === "ready" && detail.detail.kind === "action_recovery"
            ? detail.detail.recoveryRef
            : undefined;
          if (recoveryRef === undefined) return;
          void submitCommand({
            kind: "retry_unknown_action",
            runId: view.runId,
            actionId: view.actionId,
            recoveryRef,
          });
          return;
        }
        void submitCommand({
          kind: "approve_action",
          runId: view.runId,
          actionId: view.actionId,
          scope,
        });
        return;
      case "submit_reject": {
        const reason = rejection.trim();
        if (reason.length === 0 || view.actionId === undefined) return;
        if (view.kind === "action_recovery") {
          const recoveryRef = detail.kind === "ready" && detail.detail.kind === "action_recovery"
            ? detail.detail.recoveryRef
            : undefined;
          if (recoveryRef === undefined) return;
          void submitCommand({
            kind: "decline_unknown_action_retry",
            runId: view.runId,
            actionId: view.actionId,
            recoveryRef,
            reason,
          });
          return;
        }
        void submitCommand({ kind: "reject_action", runId: view.runId, actionId: view.actionId, reason });
        return;
      }
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
  }

  if (detail.kind === "loading") {
    return <InteractionLoading />;
  }
  if (detail.kind === "error") {
    return (
      <InteractionDetailFailure
        message={detail.message}
        stopping={chrome.stopping}
        onRetry={reload}
        onStop={() => void onInterrupt()}
      />
    );
  }
  if (detail.detail.kind !== "action_approval" && detail.detail.kind !== "action_recovery") {
    return <InteractionMismatch />;
  }
  return (
    <ActionInteractionView
      detail={detail.detail}
      summary={summary}
      scope={scope}
      rejection={rejection}
      editing={editing}
      draftInput={draftInput}
      review={review}
      reviewError={reviewError}
      reviewing={reviewing}
      submission={submission}
      chrome={chrome}
      onEvent={handleEvent}
    />
  );
}

/** 解析编辑后的 JSON 参数；解析失败给出可定位说明，不静默降级。 */
export function parseEditedInput(
  text: string,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly message: string } {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: "Enter the tool parameters as JSON before previewing." };
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false, message: "Tool parameters must be a JSON object." };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, message: "This is not valid JSON. Fix the syntax and preview again." };
  }
}

function InteractionLoading() {
  return (
    <section className="approval structured-form interaction-region" aria-busy="true">
      <p className="interaction-note">Loading the complete request…</p>
    </section>
  );
}

function InteractionDetailFailure({
  message,
  stopping,
  onRetry,
  onStop,
}: {
  message: string;
  stopping: boolean;
  onRetry: () => void;
  onStop: () => void;
}) {
  return (
    <section className="approval structured-form interaction-region" role="alert">
      <div className="approval-heading">
        <ShieldAlert size={15} aria-hidden="true" />
        <strong>The request could not be loaded</strong>
      </div>
      <p>{message}</p>
      <Button variant="ghost" size="sm" type="button" onClick={onRetry}>
        <Loader size={13} aria-hidden="true" /> Retry loading
      </Button>
      <StopRunButton stopping={stopping} onStop={onStop} />
    </section>
  );
}

function InteractionMismatch() {
  return (
    <section className="approval structured-form interaction-region" role="alert">
      <p>The saved request no longer matches this form. The latest state is being loaded.</p>
    </section>
  );
}
