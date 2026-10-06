import React from "react";
import type {
  BrowserTrajectoryDetail,
  BrowserModelRepairFeedbackRecordedPayload,
  BrowserExecutionErrorPayload,
} from "../../../packages/web-contracts/src/index";

export function EventSummary({ event }: { event: BrowserTrajectoryDetail["event"] }) {
  const payload = event.payload;
  if (payload.type === "model_repair_feedback_recorded") {
    const feedbackPayload = payload as BrowserModelRepairFeedbackRecordedPayload;
    return <section className="tr-feedback-summary" aria-label="Output validation issues">
      <p>{feedbackPayload.stage} attempt {feedbackPayload.attempt} was rejected before execution.</p>
      <ul className="tr-validation-issues">{feedbackPayload.feedback.issues.map((issue, index) => <li key={index}>
        <code>{issue.path.join(".") || "Response"}</code><span>{issue.message}</span>
      </li>)}</ul>
      <dl><div><dt>Reason</dt><dd>{feedbackPayload.feedback.code}</dd></div><div><dt>Validation</dt><dd>{feedbackPayload.feedback.origin.replaceAll("_", " ")}</dd></div></dl>
      {feedbackPayload.feedback.constraints?.length ? <details><summary>Correction instructions</summary>{feedbackPayload.feedback.constraints.map((constraint, index) => <p key={index}>{constraint}</p>)}</details> : null}
      <p className="tr-summary-note">View Raw for the complete saved event.</p>
    </section>;
  }
  if (payload.type === "execution_error") {
    const errorPayload = payload as BrowserExecutionErrorPayload;
    return <section className="tr-feedback-summary"><h4>Execution stopped</h4><code>{errorPayload.code}</code><p>{errorPayload.message}</p><p className="tr-summary-note">View Raw for the complete saved event.</p></section>;
  }
  return <><h4>Recorded payload</h4><pre>{JSON.stringify(payload, null, 2)}</pre></>;
}
