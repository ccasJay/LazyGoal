import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./components/ui/collapsible";
import React from "react";
import type {
  BrowserTrajectoryDetail,
  BrowserModelRepairAttemptStartedPayload,
  BrowserModelRepairFeedbackRecordedPayload,
  BrowserExecutionErrorPayload,
} from "../../../packages/web-contracts/src/index";
import { AssistantMarkdown } from "./components/AssistantMarkdown";

export function EventSummary({ event }: { event: BrowserTrajectoryDetail["event"] }) {
  const payload = event.payload;
  const payloadRecord = payload as Readonly<Record<string, unknown>>;
  if (payload.type === "think_requested" || payload.type === "think_completed") {
    return <section className="markdown-body" aria-label="Think analysis">
      <h4>Think goal</h4><p>{String(payloadRecord.goal)}</p>
      {payload.type === "think_completed"
        ? <><h4>Analysis</h4><AssistantMarkdown content={String(payloadRecord.output)} /></>
        : <p>Think requested. The output is recorded in a separate completion event.</p>}
    </section>;
  }
  if (payload.type === "model_repair_feedback_recorded") {
    const feedbackPayload = payload as unknown as BrowserModelRepairFeedbackRecordedPayload;
    return <section className="tr-feedback-summary" aria-label="Output validation issues">
      <p>{feedbackPayload.stage} attempt {feedbackPayload.attempt} was rejected before execution.</p>
      <ul className="tr-validation-issues">{feedbackPayload.feedback.issues.map((issue, index) => <li key={index}>
        <code>{issue.path.join(".") || "Response"}</code><span>{issue.message}</span>
      </li>)}</ul>
      <dl><div><dt>Reason</dt><dd>{feedbackPayload.feedback.code}</dd></div><div><dt>Validation</dt><dd>{feedbackPayload.feedback.origin.replaceAll("_", " ")}</dd></div></dl>
      {feedbackPayload.feedback.constraints?.length ? <Collapsible defaultOpen><CollapsibleTrigger className="tr-feedback-summary-trigger">Correction instructions</CollapsibleTrigger><CollapsibleContent>{feedbackPayload.feedback.constraints.map((constraint, index) => <p key={index}>{constraint}</p>)}</CollapsibleContent></Collapsible> : null}
      <p className="tr-summary-note">View Raw for the complete saved event.</p>
    </section>;
  }
  if (payload.type === "model_repair_attempt_started") {
    const attemptPayload = payload as unknown as BrowserModelRepairAttemptStartedPayload;
    return <section className="tr-feedback-summary" aria-label="Model attempt">
      <p>{attemptPayload.stage ?? "model"} attempt {attemptPayload.attempt} started. Output validation and the next decision are recorded in later events.</p>
      <dl><div><dt>Stage</dt><dd>{attemptPayload.stage ?? "Unavailable"}</dd></div><div><dt>Attempt</dt><dd>{attemptPayload.attempt}</dd></div></dl>
      <p className="tr-summary-note">View Raw for the complete saved event.</p>
    </section>;
  }
  if (payload.type === "execution_error") {
    const errorPayload = payload as unknown as BrowserExecutionErrorPayload;
    return <section className="tr-feedback-summary"><h4>Execution stopped</h4><code>{errorPayload.code}</code><p>{errorPayload.message}</p><p className="tr-summary-note">View Raw for the complete saved event.</p></section>;
  }
  return <><h4>Recorded payload</h4><pre>{JSON.stringify(payload, null, 2)}</pre></>;
}
