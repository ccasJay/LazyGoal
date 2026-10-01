import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { BrowserTrajectoryDetail } from "../../../packages/browser/src/index";
import { EventSummary } from "../src/trajectory-event-summary";

test("rejected output shows every field correction while keeping event metadata in Raw", () => {
  const event = {
    payload: {
      type: "model_repair_feedback_recorded", stage: "decide", attempt: 3,
      feedback: { code: "INVALID_LLM_RESPONSE", origin: "tool_input", issues: [
        { code: "missing_field", path: ["result", "action", "input", "path"], message: "Supply this required field." },
        { code: "extra_field", path: ["result", "action", "input", "command"], message: "Remove this field." },
      ], constraints: ["Continue the original task."] },
    },
  } as BrowserTrajectoryDetail["event"];
  const html = renderToStaticMarkup(<EventSummary event={event}/>);
  assert.match(html, /attempt 3 was rejected before execution/);
  assert.match(html, /result.action.input.path/);
  assert.match(html, /Supply this required field/);
  assert.match(html, /result.action.input.command/);
  assert.match(html, /Remove this field/);
  assert.match(html, /Continue the original task/);
  assert.match(html, /View Raw/);
  assert.doesNotMatch(html, /<pre>/);
});
