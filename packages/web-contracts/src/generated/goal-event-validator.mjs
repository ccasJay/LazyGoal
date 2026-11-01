var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserGoalEvent-validator.cjs
var require_BrowserGoalEvent_validator = __commonJS({
  "BrowserGoalEvent-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "anyOf": [{ "type": "object", "properties": { "type": { "type": "string", "const": "state_sync" }, "goalId": { "type": "string", "pattern": "\\S" }, "state": { "$ref": "#/definitions/BrowserSessionState" }, "snapshot": { "$ref": "#/definitions/BrowserControlSnapshot", "description": "\u540C\u4E00\u63D0\u4EA4\u8FB9\u754C\u7684\u5B8C\u6574\u63A7\u5236\u5FEB\u7167\uFF1B\u65E0\u6CD5\u4E0E Runtime \u72B6\u6001\u5BF9\u9F50\u65F6\u7701\u7565\u3002" } }, "required": ["type", "goalId", "state"], "additionalProperties": false }, { "type": "object", "properties": { "type": { "type": "string", "const": "input_result" }, "goalId": { "type": "string", "pattern": "\\S" }, "outcome": { "$ref": "#/definitions/BrowserSessionInputOutcome" } }, "required": ["type", "goalId", "outcome"], "additionalProperties": false }, { "type": "object", "properties": { "type": { "type": "string", "const": "activity" }, "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "activity": { "$ref": "#/definitions/BrowserGoalActivityEvent" } }, "required": ["type", "goalId", "runId", "activity"], "additionalProperties": false }, { "type": "object", "properties": { "type": { "type": "string", "const": "message_committed" }, "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "message": { "$ref": "#/definitions/BrowserCommittedMessageEvent" } }, "required": ["type", "goalId", "runId", "message"], "additionalProperties": false }, { "type": "object", "properties": { "type": { "type": "string", "const": "state_committed" }, "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "commitRevision": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "changed": { "type": "array", "items": { "$ref": "#/definitions/BrowserControlScope" }, "minItems": 1 } }, "required": ["type", "goalId", "commitRevision", "changed"], "additionalProperties": false }, { "type": "object", "properties": { "type": { "type": "string", "const": "run_status_changed" }, "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "status": { "$ref": "#/definitions/BrowserRunStatus" }, "commitRevision": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 } }, "required": ["type", "goalId", "runId", "status"], "additionalProperties": false }, { "type": "object", "properties": { "type": { "type": "string", "const": "run_result" }, "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "result": { "type": "string", "enum": ["completed", "failed", "cancelled"] }, "commitRevision": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 } }, "required": ["type", "goalId", "runId", "result"], "additionalProperties": false }, { "type": "object", "properties": { "type": { "type": "string", "const": "interaction_opened" }, "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "interactionId": { "type": "string", "pattern": "\\S" }, "kind": { "$ref": "#/definitions/BrowserInteractionKind" } }, "required": ["type", "goalId", "runId", "interactionId", "kind"], "additionalProperties": false }, { "type": "object", "properties": { "type": { "type": "string", "const": "interaction_settled" }, "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "interactionId": { "type": "string", "pattern": "\\S" }, "kind": { "$ref": "#/definitions/BrowserInteractionKind" } }, "required": ["type", "goalId", "runId", "interactionId", "kind"], "additionalProperties": false }, { "type": "object", "properties": { "type": { "type": "string", "const": "tool_activity" }, "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "activity": { "$ref": "#/definitions/BrowserToolActivity" } }, "required": ["type", "goalId", "runId", "activity"], "additionalProperties": false }, { "type": "object", "properties": { "type": { "type": "string", "const": "stream_fault" }, "goalId": { "type": "string", "pattern": "\\S" }, "code": { "type": "string", "enum": ["gap", "read_failed", "backpressure", "publisher_closed"] }, "resync": { "type": "array", "items": { "$ref": "#/definitions/BrowserControlScope" }, "minItems": 1 } }, "required": ["type", "goalId", "code", "resync"], "additionalProperties": false }, { "type": "object", "properties": { "type": { "type": "string", "const": "closed" }, "goalId": { "type": "string", "pattern": "\\S" }, "reason": { "type": "string", "enum": ["backpressure", "closed", "publisher_closed"] } }, "required": ["type", "goalId", "reason"], "additionalProperties": false }], "description": "\u6D4F\u89C8\u5668\u7AEF\u6D88\u8D39\u7684 Goal \u8303\u56F4\u5B9E\u65F6\u63A8\u9001\u4E8B\u4EF6\u3002" };
    var schema50 = { "anyOf": [{ "type": "object", "properties": { "kind": { "type": "string", "const": "assistant_text_delta" }, "text": { "type": "string" }, "truncated": { "type": "boolean" }, "sourceEventId": { "type": "string", "pattern": "\\S" }, "sourceCursor": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 } }, "required": ["kind", "text", "truncated", "sourceEventId", "sourceCursor"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "model_started" }, "stage": { "type": "string", "enum": ["think", "decide", "completion_review"] }, "modelCallId": { "type": "string", "pattern": "\\S" }, "executionUnitId": { "type": "string", "pattern": "\\S" }, "occurredAt": { "type": "string" } }, "required": ["kind"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "model_completed" } }, "required": ["kind"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "step_started" } }, "required": ["kind"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "tool_started" }, "sourceEventId": { "type": "string", "pattern": "\\S" }, "sourceCursor": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "actionId": { "type": "string", "pattern": "\\S" }, "executionUnitId": { "type": "string", "pattern": "\\S" }, "toolId": { "type": "string", "pattern": "\\S" }, "inputSummary": { "type": "string" } }, "required": ["kind", "sourceEventId", "sourceCursor", "actionId", "executionUnitId", "toolId"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "tool_finished" }, "sourceEventId": { "type": "string", "pattern": "\\S" }, "sourceCursor": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "actionId": { "type": "string", "pattern": "\\S" }, "toolId": { "type": "string", "pattern": "\\S" }, "outcome": { "type": "string", "enum": ["success", "failure"] }, "summary": { "type": "string" } }, "required": ["kind", "sourceEventId", "sourceCursor", "actionId", "toolId", "outcome"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "tool_attempt_started" }, "sourceEventId": { "type": "string", "pattern": "\\S" }, "sourceCursor": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "actionId": { "type": "string", "pattern": "\\S" }, "attempt": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 } }, "required": ["kind", "sourceEventId", "sourceCursor", "actionId", "attempt"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "tool_attempt_failed" }, "sourceEventId": { "type": "string", "pattern": "\\S" }, "sourceCursor": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "actionId": { "type": "string", "pattern": "\\S" }, "attempt": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "reason": { "type": "string" } }, "required": ["kind", "sourceEventId", "sourceCursor", "actionId", "attempt", "reason"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "activity_boundary" }, "sourceEventId": { "type": "string", "pattern": "\\S" }, "sourceCursor": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "reason": { "type": "string", "enum": ["assistant_reply", "user_wait", "stage_change", "terminal", "failure", "unknown"] } }, "required": ["kind", "sourceEventId", "sourceCursor", "reason"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "candidate_preview" }, "sourceEventId": { "type": "string", "pattern": "\\S" }, "sourceCursor": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "candidateId": { "type": "string", "pattern": "\\S" }, "text": { "type": "string" }, "startOffset": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "truncated": { "type": "boolean" }, "complete": { "type": "boolean" } }, "required": ["kind", "sourceEventId", "sourceCursor", "candidateId", "text", "startOffset", "truncated", "complete"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "candidate_invalidated" }, "sourceEventId": { "type": "string", "pattern": "\\S" }, "sourceCursor": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "candidateId": { "type": "string", "pattern": "\\S" }, "reason": { "type": "string", "enum": ["rejected", "cancelled", "failed", "replaced", "ambiguous"] } }, "required": ["kind", "sourceEventId", "sourceCursor", "candidateId", "reason"], "additionalProperties": false }], "description": "\u5B9E\u65F6\u6267\u884C\u6D3B\u52A8\u4E8B\u4EF6\u7684\u7A33\u5B9A\u8054\u5408\u3002" };
    var schema53 = { "type": "string", "enum": ["session", "activity", "trajectory", "metrics", "goals", "grants", "permission", "model"], "description": "Browser \u63A7\u5236\u6295\u5F71\u7684\u53EF\u5931\u6548\u4F5C\u7528\u57DF\u3002" };
    var schema14 = { "type": "string", "enum": ["created", "running", "waiting", "completed", "failed", "cancelled"], "description": "Run \u751F\u547D\u5468\u671F\u72B6\u6001\u3002" };
    var schema16 = { "type": "string", "enum": ["question", "task_approval", "action_approval", "action_recovery"], "description": "\u5F53\u524D\u4EA4\u4E92\u89C6\u56FE\u7684\u79CD\u7C7B\u3002" };
    var schema57 = { "type": "object", "properties": { "actionId": { "type": "string", "pattern": "\\S" }, "executionUnitId": { "type": "string", "pattern": "\\S" }, "toolId": { "type": "string", "pattern": "\\S" }, "attempt": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "phase": { "type": "string", "enum": ["started", "attempting", "retrying", "result_pending", "observed_committed", "unknown"] }, "outcome": { "type": "string", "enum": ["success", "failure"] }, "summary": { "type": "string" }, "reason": { "type": "string" } }, "required": ["actionId", "phase"], "additionalProperties": false, "description": "\u5355\u4E2A\u5DE5\u5177\u6D3B\u52A8\u7684\u516C\u5F00\u63A7\u5236\u72B6\u6001\u3002" };
    var pattern0 = new RegExp("\\S", "u");
    var schema13 = { "type": "object", "properties": { "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "runStatus": { "$ref": "#/definitions/BrowserRunStatus" }, "mode": { "type": "string", "enum": ["normal", "plan"] }, "commitRevision": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "queueRevision": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "queuePaused": { "type": "boolean" }, "queuePauseReason": { "type": "string", "enum": ["run_failed", "user_interrupt"] }, "pendingMessageCount": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "pendingSteerCount": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "waitingFor": { "type": "string", "enum": ["ask_user", "task_approval", "action_approval", "action_recovery", "blocked"] }, "interaction": { "$ref": "#/definitions/BrowserSessionStateInteraction" }, "messages": { "type": "object", "properties": { "count": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "throughMessageId": { "type": "string", "pattern": "\\S" }, "recent": { "type": "array", "items": { "$ref": "#/definitions/BrowserSessionStateMessage" } } }, "required": ["count", "recent"], "additionalProperties": false }, "needsRecovery": { "type": "boolean" }, "interruption": { "$ref": "#/definitions/BrowserSessionStateInterruption" }, "executionOwner": { "type": "boolean" } }, "required": ["goalId", "runId", "runStatus", "mode", "commitRevision", "queueRevision", "queuePaused", "pendingMessageCount", "pendingSteerCount", "messages", "needsRecovery", "executionOwner"], "additionalProperties": false, "description": "\u5B89\u5168\u4F1A\u8BDD\u72B6\u6001\u6295\u5F71\u3002" };
    var schema19 = { "type": "object", "properties": { "requestId": { "type": "string", "pattern": "\\S" }, "status": { "type": "string", "enum": ["requested", "finished"] }, "outcomeUnknown": { "type": "boolean" } }, "required": ["requestId", "status", "outcomeUnknown"], "additionalProperties": false, "description": "\u5F53\u524D Run \u7684\u7528\u6237\u4E2D\u65AD\u72B6\u6001\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    function validate13(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.interactionId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "interactionId" }, message: "must have required property 'interactionId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.kind === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "interactionId" || key0 === "kind" || key0 === "runId" || key0 === "requestId" || key0 === "actionId")) {
            const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.interactionId !== void 0) {
          let data0 = data.interactionId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err4 = { instancePath: instancePath + "/interactionId", schemaPath: "#/properties/interactionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
          } else {
            const err5 = { instancePath: instancePath + "/interactionId", schemaPath: "#/properties/interactionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data1 = data.kind;
          if (typeof data1 !== "string") {
            const err6 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserInteractionKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if (!(data1 === "question" || data1 === "task_approval" || data1 === "action_approval" || data1 === "action_recovery")) {
            const err7 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserInteractionKind/enum", keyword: "enum", params: { allowedValues: schema16.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data2 = data.runId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err8 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          } else {
            const err9 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.requestId !== void 0) {
          let data3 = data.requestId;
          if (typeof data3 === "string") {
            if (!pattern0.test(data3)) {
              const err10 = { instancePath: instancePath + "/requestId", schemaPath: "#/properties/requestId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          } else {
            const err11 = { instancePath: instancePath + "/requestId", schemaPath: "#/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.actionId !== void 0) {
          let data4 = data.actionId;
          if (typeof data4 === "string") {
            if (!pattern0.test(data4)) {
              const err12 = { instancePath: instancePath + "/actionId", schemaPath: "#/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          } else {
            const err13 = { instancePath: instancePath + "/actionId", schemaPath: "#/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
      } else {
        const err14 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
      validate13.errors = vErrors;
      return errors === 0;
    }
    var schema17 = { "type": "object", "properties": { "messageId": { "type": "string", "pattern": "\\S" }, "role": { "type": "string", "enum": ["user", "assistant"] }, "runId": { "type": "string", "pattern": "\\S" }, "position": { "$ref": "#/definitions/BrowserMessagePosition" }, "purpose": { "type": "string", "enum": ["process", "answer", "notice"] }, "sourceKind": { "type": "string", "pattern": "\\S" }, "sourceId": { "type": "string", "pattern": "\\S" } }, "required": ["messageId", "role", "runId", "position", "sourceKind", "sourceId"], "additionalProperties": false, "description": "\u4F1A\u8BDD\u72B6\u6001\u4E2D\u6709\u754C\u6D88\u606F\u8303\u56F4\u7684\u4E00\u6761\u6458\u8981\u3002" };
    function validate15(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.messageId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "messageId" }, message: "must have required property 'messageId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.role === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.position === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "position" }, message: "must have required property 'position'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.sourceKind === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "sourceKind" }, message: "must have required property 'sourceKind'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.sourceId === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "sourceId" }, message: "must have required property 'sourceId'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "messageId" || key0 === "role" || key0 === "runId" || key0 === "position" || key0 === "purpose" || key0 === "sourceKind" || key0 === "sourceId")) {
            const err6 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.messageId !== void 0) {
          let data0 = data.messageId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err7 = { instancePath: instancePath + "/messageId", schemaPath: "#/properties/messageId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = { instancePath: instancePath + "/messageId", schemaPath: "#/properties/messageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.role !== void 0) {
          let data1 = data.role;
          if (typeof data1 !== "string") {
            const err9 = { instancePath: instancePath + "/role", schemaPath: "#/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          if (!(data1 === "user" || data1 === "assistant")) {
            const err10 = { instancePath: instancePath + "/role", schemaPath: "#/properties/role/enum", keyword: "enum", params: { allowedValues: schema17.properties.role.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data2 = data.runId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err11 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          } else {
            const err12 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.position !== void 0) {
          let data3 = data.position;
          if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
            if (data3.afterSequence === void 0) {
              const err13 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserMessagePosition/required", keyword: "required", params: { missingProperty: "afterSequence" }, message: "must have required property 'afterSequence'" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            if (data3.order === void 0) {
              const err14 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserMessagePosition/required", keyword: "required", params: { missingProperty: "order" }, message: "must have required property 'order'" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            for (const key1 in data3) {
              if (!(key1 === "afterSequence" || key1 === "order")) {
                const err15 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserMessagePosition/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
            }
            if (data3.afterSequence !== void 0) {
              let data4 = data3.afterSequence;
              if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)) && isFinite(data4))) {
                const err16 = { instancePath: instancePath + "/position/afterSequence", schemaPath: "#/definitions/BrowserMessagePosition/properties/afterSequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
              if (typeof data4 == "number" && isFinite(data4)) {
                if (data4 > 9007199254740991 || isNaN(data4)) {
                  const err17 = { instancePath: instancePath + "/position/afterSequence", schemaPath: "#/definitions/BrowserMessagePosition/properties/afterSequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err17];
                  } else {
                    vErrors.push(err17);
                  }
                  errors++;
                }
                if (data4 < 0 || isNaN(data4)) {
                  const err18 = { instancePath: instancePath + "/position/afterSequence", schemaPath: "#/definitions/BrowserMessagePosition/properties/afterSequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err18];
                  } else {
                    vErrors.push(err18);
                  }
                  errors++;
                }
              }
            }
            if (data3.order !== void 0) {
              let data5 = data3.order;
              if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
                const err19 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/BrowserMessagePosition/properties/order/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
              if (typeof data5 == "number" && isFinite(data5)) {
                if (data5 > 9007199254740991 || isNaN(data5)) {
                  const err20 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/BrowserMessagePosition/properties/order/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err20];
                  } else {
                    vErrors.push(err20);
                  }
                  errors++;
                }
                if (data5 < 0 || isNaN(data5)) {
                  const err21 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/BrowserMessagePosition/properties/order/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err21];
                  } else {
                    vErrors.push(err21);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err22 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserMessagePosition/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        }
        if (data.purpose !== void 0) {
          let data6 = data.purpose;
          if (typeof data6 !== "string") {
            const err23 = { instancePath: instancePath + "/purpose", schemaPath: "#/properties/purpose/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
          if (!(data6 === "process" || data6 === "answer" || data6 === "notice")) {
            const err24 = { instancePath: instancePath + "/purpose", schemaPath: "#/properties/purpose/enum", keyword: "enum", params: { allowedValues: schema17.properties.purpose.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
        }
        if (data.sourceKind !== void 0) {
          let data7 = data.sourceKind;
          if (typeof data7 === "string") {
            if (!pattern0.test(data7)) {
              const err25 = { instancePath: instancePath + "/sourceKind", schemaPath: "#/properties/sourceKind/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
          } else {
            const err26 = { instancePath: instancePath + "/sourceKind", schemaPath: "#/properties/sourceKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
        }
        if (data.sourceId !== void 0) {
          let data8 = data.sourceId;
          if (typeof data8 === "string") {
            if (!pattern0.test(data8)) {
              const err27 = { instancePath: instancePath + "/sourceId", schemaPath: "#/properties/sourceId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
          } else {
            const err28 = { instancePath: instancePath + "/sourceId", schemaPath: "#/properties/sourceId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
        }
      } else {
        const err29 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
      validate15.errors = vErrors;
      return errors === 0;
    }
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.goalId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.runStatus === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runStatus" }, message: "must have required property 'runStatus'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.mode === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "mode" }, message: "must have required property 'mode'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.commitRevision === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "commitRevision" }, message: "must have required property 'commitRevision'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.queueRevision === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "queueRevision" }, message: "must have required property 'queueRevision'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.queuePaused === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "queuePaused" }, message: "must have required property 'queuePaused'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data.pendingMessageCount === void 0) {
          const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "pendingMessageCount" }, message: "must have required property 'pendingMessageCount'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data.pendingSteerCount === void 0) {
          const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "pendingSteerCount" }, message: "must have required property 'pendingSteerCount'" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (data.messages === void 0) {
          const err9 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "messages" }, message: "must have required property 'messages'" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        if (data.needsRecovery === void 0) {
          const err10 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "needsRecovery" }, message: "must have required property 'needsRecovery'" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        if (data.executionOwner === void 0) {
          const err11 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "executionOwner" }, message: "must have required property 'executionOwner'" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema13.properties, key0)) {
            const err12 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data0 = data.goalId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err13 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          } else {
            const err14 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data1 = data.runId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err15 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          } else {
            const err16 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data.runStatus !== void 0) {
          let data2 = data.runStatus;
          if (typeof data2 !== "string") {
            const err17 = { instancePath: instancePath + "/runStatus", schemaPath: "#/definitions/BrowserRunStatus/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
          if (!(data2 === "created" || data2 === "running" || data2 === "waiting" || data2 === "completed" || data2 === "failed" || data2 === "cancelled")) {
            const err18 = { instancePath: instancePath + "/runStatus", schemaPath: "#/definitions/BrowserRunStatus/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
        if (data.mode !== void 0) {
          let data3 = data.mode;
          if (typeof data3 !== "string") {
            const err19 = { instancePath: instancePath + "/mode", schemaPath: "#/properties/mode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
          if (!(data3 === "normal" || data3 === "plan")) {
            const err20 = { instancePath: instancePath + "/mode", schemaPath: "#/properties/mode/enum", keyword: "enum", params: { allowedValues: schema13.properties.mode.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
        }
        if (data.commitRevision !== void 0) {
          let data4 = data.commitRevision;
          if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)) && isFinite(data4))) {
            const err21 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/properties/commitRevision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
          if (typeof data4 == "number" && isFinite(data4)) {
            if (data4 > 9007199254740991 || isNaN(data4)) {
              const err22 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/properties/commitRevision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
            if (data4 < 0 || isNaN(data4)) {
              const err23 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/properties/commitRevision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
          }
        }
        if (data.queueRevision !== void 0) {
          let data5 = data.queueRevision;
          if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
            const err24 = { instancePath: instancePath + "/queueRevision", schemaPath: "#/properties/queueRevision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
          if (typeof data5 == "number" && isFinite(data5)) {
            if (data5 > 9007199254740991 || isNaN(data5)) {
              const err25 = { instancePath: instancePath + "/queueRevision", schemaPath: "#/properties/queueRevision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
            if (data5 < 0 || isNaN(data5)) {
              const err26 = { instancePath: instancePath + "/queueRevision", schemaPath: "#/properties/queueRevision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
          }
        }
        if (data.queuePaused !== void 0) {
          if (typeof data.queuePaused !== "boolean") {
            const err27 = { instancePath: instancePath + "/queuePaused", schemaPath: "#/properties/queuePaused/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err27];
            } else {
              vErrors.push(err27);
            }
            errors++;
          }
        }
        if (data.queuePauseReason !== void 0) {
          let data7 = data.queuePauseReason;
          if (typeof data7 !== "string") {
            const err28 = { instancePath: instancePath + "/queuePauseReason", schemaPath: "#/properties/queuePauseReason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
          if (!(data7 === "run_failed" || data7 === "user_interrupt")) {
            const err29 = { instancePath: instancePath + "/queuePauseReason", schemaPath: "#/properties/queuePauseReason/enum", keyword: "enum", params: { allowedValues: schema13.properties.queuePauseReason.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        }
        if (data.pendingMessageCount !== void 0) {
          let data8 = data.pendingMessageCount;
          if (!(typeof data8 == "number" && (!(data8 % 1) && !isNaN(data8)) && isFinite(data8))) {
            const err30 = { instancePath: instancePath + "/pendingMessageCount", schemaPath: "#/properties/pendingMessageCount/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
          if (typeof data8 == "number" && isFinite(data8)) {
            if (data8 > 9007199254740991 || isNaN(data8)) {
              const err31 = { instancePath: instancePath + "/pendingMessageCount", schemaPath: "#/properties/pendingMessageCount/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
            if (data8 < 0 || isNaN(data8)) {
              const err32 = { instancePath: instancePath + "/pendingMessageCount", schemaPath: "#/properties/pendingMessageCount/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err32];
              } else {
                vErrors.push(err32);
              }
              errors++;
            }
          }
        }
        if (data.pendingSteerCount !== void 0) {
          let data9 = data.pendingSteerCount;
          if (!(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)) && isFinite(data9))) {
            const err33 = { instancePath: instancePath + "/pendingSteerCount", schemaPath: "#/properties/pendingSteerCount/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
          if (typeof data9 == "number" && isFinite(data9)) {
            if (data9 > 9007199254740991 || isNaN(data9)) {
              const err34 = { instancePath: instancePath + "/pendingSteerCount", schemaPath: "#/properties/pendingSteerCount/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
            if (data9 < 0 || isNaN(data9)) {
              const err35 = { instancePath: instancePath + "/pendingSteerCount", schemaPath: "#/properties/pendingSteerCount/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
          }
        }
        if (data.waitingFor !== void 0) {
          let data10 = data.waitingFor;
          if (typeof data10 !== "string") {
            const err36 = { instancePath: instancePath + "/waitingFor", schemaPath: "#/properties/waitingFor/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          }
          if (!(data10 === "ask_user" || data10 === "task_approval" || data10 === "action_approval" || data10 === "action_recovery" || data10 === "blocked")) {
            const err37 = { instancePath: instancePath + "/waitingFor", schemaPath: "#/properties/waitingFor/enum", keyword: "enum", params: { allowedValues: schema13.properties.waitingFor.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err37];
            } else {
              vErrors.push(err37);
            }
            errors++;
          }
        }
        if (data.interaction !== void 0) {
          if (!validate13(data.interaction, { instancePath: instancePath + "/interaction", parentData: data, parentDataProperty: "interaction", rootData })) {
            vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
            errors = vErrors.length;
          }
        }
        if (data.messages !== void 0) {
          let data12 = data.messages;
          if (data12 && typeof data12 == "object" && !Array.isArray(data12)) {
            if (data12.count === void 0) {
              const err38 = { instancePath: instancePath + "/messages", schemaPath: "#/properties/messages/required", keyword: "required", params: { missingProperty: "count" }, message: "must have required property 'count'" };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
            if (data12.recent === void 0) {
              const err39 = { instancePath: instancePath + "/messages", schemaPath: "#/properties/messages/required", keyword: "required", params: { missingProperty: "recent" }, message: "must have required property 'recent'" };
              if (vErrors === null) {
                vErrors = [err39];
              } else {
                vErrors.push(err39);
              }
              errors++;
            }
            for (const key1 in data12) {
              if (!(key1 === "count" || key1 === "throughMessageId" || key1 === "recent")) {
                const err40 = { instancePath: instancePath + "/messages", schemaPath: "#/properties/messages/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
            }
            if (data12.count !== void 0) {
              let data13 = data12.count;
              if (!(typeof data13 == "number" && (!(data13 % 1) && !isNaN(data13)) && isFinite(data13))) {
                const err41 = { instancePath: instancePath + "/messages/count", schemaPath: "#/properties/messages/properties/count/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err41];
                } else {
                  vErrors.push(err41);
                }
                errors++;
              }
              if (typeof data13 == "number" && isFinite(data13)) {
                if (data13 > 9007199254740991 || isNaN(data13)) {
                  const err42 = { instancePath: instancePath + "/messages/count", schemaPath: "#/properties/messages/properties/count/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err42];
                  } else {
                    vErrors.push(err42);
                  }
                  errors++;
                }
                if (data13 < 0 || isNaN(data13)) {
                  const err43 = { instancePath: instancePath + "/messages/count", schemaPath: "#/properties/messages/properties/count/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err43];
                  } else {
                    vErrors.push(err43);
                  }
                  errors++;
                }
              }
            }
            if (data12.throughMessageId !== void 0) {
              let data14 = data12.throughMessageId;
              if (typeof data14 === "string") {
                if (!pattern0.test(data14)) {
                  const err44 = { instancePath: instancePath + "/messages/throughMessageId", schemaPath: "#/properties/messages/properties/throughMessageId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err44];
                  } else {
                    vErrors.push(err44);
                  }
                  errors++;
                }
              } else {
                const err45 = { instancePath: instancePath + "/messages/throughMessageId", schemaPath: "#/properties/messages/properties/throughMessageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
            }
            if (data12.recent !== void 0) {
              let data15 = data12.recent;
              if (Array.isArray(data15)) {
                const len0 = data15.length;
                for (let i0 = 0; i0 < len0; i0++) {
                  if (!validate15(data15[i0], { instancePath: instancePath + "/messages/recent/" + i0, parentData: data15, parentDataProperty: i0, rootData })) {
                    vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
                    errors = vErrors.length;
                  }
                }
              } else {
                const err46 = { instancePath: instancePath + "/messages/recent", schemaPath: "#/properties/messages/properties/recent/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
            }
          } else {
            const err47 = { instancePath: instancePath + "/messages", schemaPath: "#/properties/messages/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err47];
            } else {
              vErrors.push(err47);
            }
            errors++;
          }
        }
        if (data.needsRecovery !== void 0) {
          if (typeof data.needsRecovery !== "boolean") {
            const err48 = { instancePath: instancePath + "/needsRecovery", schemaPath: "#/properties/needsRecovery/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err48];
            } else {
              vErrors.push(err48);
            }
            errors++;
          }
        }
        if (data.interruption !== void 0) {
          let data18 = data.interruption;
          if (data18 && typeof data18 == "object" && !Array.isArray(data18)) {
            if (data18.requestId === void 0) {
              const err49 = { instancePath: instancePath + "/interruption", schemaPath: "#/definitions/BrowserSessionStateInterruption/required", keyword: "required", params: { missingProperty: "requestId" }, message: "must have required property 'requestId'" };
              if (vErrors === null) {
                vErrors = [err49];
              } else {
                vErrors.push(err49);
              }
              errors++;
            }
            if (data18.status === void 0) {
              const err50 = { instancePath: instancePath + "/interruption", schemaPath: "#/definitions/BrowserSessionStateInterruption/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
              if (vErrors === null) {
                vErrors = [err50];
              } else {
                vErrors.push(err50);
              }
              errors++;
            }
            if (data18.outcomeUnknown === void 0) {
              const err51 = { instancePath: instancePath + "/interruption", schemaPath: "#/definitions/BrowserSessionStateInterruption/required", keyword: "required", params: { missingProperty: "outcomeUnknown" }, message: "must have required property 'outcomeUnknown'" };
              if (vErrors === null) {
                vErrors = [err51];
              } else {
                vErrors.push(err51);
              }
              errors++;
            }
            for (const key2 in data18) {
              if (!(key2 === "requestId" || key2 === "status" || key2 === "outcomeUnknown")) {
                const err52 = { instancePath: instancePath + "/interruption", schemaPath: "#/definitions/BrowserSessionStateInterruption/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err52];
                } else {
                  vErrors.push(err52);
                }
                errors++;
              }
            }
            if (data18.requestId !== void 0) {
              let data19 = data18.requestId;
              if (typeof data19 === "string") {
                if (!pattern0.test(data19)) {
                  const err53 = { instancePath: instancePath + "/interruption/requestId", schemaPath: "#/definitions/BrowserSessionStateInterruption/properties/requestId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err53];
                  } else {
                    vErrors.push(err53);
                  }
                  errors++;
                }
              } else {
                const err54 = { instancePath: instancePath + "/interruption/requestId", schemaPath: "#/definitions/BrowserSessionStateInterruption/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err54];
                } else {
                  vErrors.push(err54);
                }
                errors++;
              }
            }
            if (data18.status !== void 0) {
              let data20 = data18.status;
              if (typeof data20 !== "string") {
                const err55 = { instancePath: instancePath + "/interruption/status", schemaPath: "#/definitions/BrowserSessionStateInterruption/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err55];
                } else {
                  vErrors.push(err55);
                }
                errors++;
              }
              if (!(data20 === "requested" || data20 === "finished")) {
                const err56 = { instancePath: instancePath + "/interruption/status", schemaPath: "#/definitions/BrowserSessionStateInterruption/properties/status/enum", keyword: "enum", params: { allowedValues: schema19.properties.status.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err56];
                } else {
                  vErrors.push(err56);
                }
                errors++;
              }
            }
            if (data18.outcomeUnknown !== void 0) {
              if (typeof data18.outcomeUnknown !== "boolean") {
                const err57 = { instancePath: instancePath + "/interruption/outcomeUnknown", schemaPath: "#/definitions/BrowserSessionStateInterruption/properties/outcomeUnknown/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err57];
                } else {
                  vErrors.push(err57);
                }
                errors++;
              }
            }
          } else {
            const err58 = { instancePath: instancePath + "/interruption", schemaPath: "#/definitions/BrowserSessionStateInterruption/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err58];
            } else {
              vErrors.push(err58);
            }
            errors++;
          }
        }
        if (data.executionOwner !== void 0) {
          if (typeof data.executionOwner !== "boolean") {
            const err59 = { instancePath: instancePath + "/executionOwner", schemaPath: "#/properties/executionOwner/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err59];
            } else {
              vErrors.push(err59);
            }
            errors++;
          }
        }
      } else {
        const err60 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err60];
        } else {
          vErrors.push(err60);
        }
        errors++;
      }
      validate12.errors = vErrors;
      return errors === 0;
    }
    var schema21 = { "type": "object", "properties": { "goalId": { "type": "string", "pattern": "\\S" }, "intent": { "type": "string" }, "currentRunId": { "type": "string", "pattern": "\\S" }, "runStatus": { "$ref": "#/definitions/BrowserRunStatus" }, "currentRunMode": { "type": "string", "enum": ["normal", "plan"] }, "nextRunMode": { "type": "string", "const": "plan" }, "currentRunStepCount": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "currentRunTerminalDetail": { "$ref": "#/definitions/BrowserSessionRunTerminalDetail" }, "currentPlanRoute": { "$ref": "#/definitions/BrowserPlanRoute" }, "execution": { "$ref": "#/definitions/BrowserGoalExecution" }, "pendingSteers": { "type": "array", "items": { "$ref": "#/definitions/BrowserPendingSteer" } }, "pendingMessages": { "type": "array", "items": { "$ref": "#/definitions/BrowserPendingMessage" } }, "queue": { "$ref": "#/definitions/BrowserQueueState" }, "interruption": { "$ref": "#/definitions/BrowserInterruption" }, "goalPlan": { "$ref": "#/definitions/BrowserGoalPlan" }, "interaction": { "$ref": "#/definitions/BrowserInteractionView" }, "pendingAction": { "$ref": "#/definitions/BrowserPendingAction" }, "history": { "type": "object", "properties": { "messages": { "$ref": "#/definitions/BrowserActivityHistoryMarker" }, "steps": { "$ref": "#/definitions/BrowserActivityHistoryMarker" }, "stages": { "$ref": "#/definitions/BrowserActivityHistoryMarker" } }, "required": ["messages", "steps", "stages"], "additionalProperties": false } }, "required": ["goalId", "intent", "currentRunId", "runStatus", "currentRunMode", "currentRunStepCount", "history"], "additionalProperties": false, "description": "\u521D\u59CB\u8BFB\u53D6\u548C\u5206\u9875\u4F7F\u7528\u7684\u7A84 Goal \u72B6\u6001\u3002" };
    var schema30 = { "type": "object", "properties": { "revision": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "paused": { "type": "boolean" }, "pauseReason": { "type": "string", "enum": ["run_failed", "user_interrupt"] } }, "required": ["revision", "paused"], "additionalProperties": false, "description": "\u6D88\u606F\u961F\u5217\u4FEE\u8BA2\u4E0E\u6682\u505C\u4E8B\u5B9E\u3002" };
    var schema31 = { "type": "object", "properties": { "requestId": { "type": "string", "pattern": "\\S" }, "status": { "type": "string", "enum": ["requested", "finished"] }, "outcomeUnknown": { "type": "boolean" } }, "required": ["requestId", "status"], "additionalProperties": false, "description": "\u5DF2\u53D7\u7406\u7684\u7528\u6237\u7EC8\u6B62\u53CA\u53D6\u6D88\u7ED3\u7B97\u72B6\u6001\u3002" };
    var schema25 = { "type": "object", "properties": { "stageId": { "type": "string", "pattern": "\\S" }, "revision": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "status": { "type": "string", "enum": ["pending", "executing", "accepted"] }, "target": { "type": "string", "pattern": "\\S" }, "acceptanceCriteria": { "type": "array", "items": { "type": "string" }, "minItems": 1 }, "acceptedSequence": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 } }, "required": ["stageId", "revision", "status", "target", "acceptanceCriteria"], "additionalProperties": false, "description": "\u5DF2\u6279\u51C6 Plan Run \u4E2D\u5E26 Runtime \u8EAB\u4EFD\u7684\u9636\u6BB5\u72B6\u6001\u3002" };
    function validate20(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.revision === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.nextStageIndex === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "nextStageIndex" }, message: "must have required property 'nextStageIndex'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.stages === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stages" }, message: "must have required property 'stages'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "revision" || key0 === "revisionReason" || key0 === "nextStageIndex" || key0 === "stages")) {
            const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.revision !== void 0) {
          let data0 = data.revision;
          if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
            const err4 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if (typeof data0 == "number" && isFinite(data0)) {
            if (data0 > 9007199254740991 || isNaN(data0)) {
              const err5 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            if (data0 < 1 || isNaN(data0)) {
              const err6 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          }
        }
        if (data.revisionReason !== void 0) {
          let data1 = data.revisionReason;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err7 = { instancePath: instancePath + "/revisionReason", schemaPath: "#/properties/revisionReason/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = { instancePath: instancePath + "/revisionReason", schemaPath: "#/properties/revisionReason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.nextStageIndex !== void 0) {
          let data2 = data.nextStageIndex;
          if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
            const err9 = { instancePath: instancePath + "/nextStageIndex", schemaPath: "#/properties/nextStageIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          if (typeof data2 == "number" && isFinite(data2)) {
            if (data2 > 9007199254740991 || isNaN(data2)) {
              const err10 = { instancePath: instancePath + "/nextStageIndex", schemaPath: "#/properties/nextStageIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
            if (data2 < 0 || isNaN(data2)) {
              const err11 = { instancePath: instancePath + "/nextStageIndex", schemaPath: "#/properties/nextStageIndex/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          }
        }
        if (data.stages !== void 0) {
          let data3 = data.stages;
          if (Array.isArray(data3)) {
            if (data3.length < 1) {
              const err12 = { instancePath: instancePath + "/stages", schemaPath: "#/properties/stages/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            const len0 = data3.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data4 = data3[i0];
              if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
                if (data4.stageId === void 0) {
                  const err13 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/required", keyword: "required", params: { missingProperty: "stageId" }, message: "must have required property 'stageId'" };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
                if (data4.revision === void 0) {
                  const err14 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
                if (data4.status === void 0) {
                  const err15 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                }
                if (data4.target === void 0) {
                  const err16 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                  if (vErrors === null) {
                    vErrors = [err16];
                  } else {
                    vErrors.push(err16);
                  }
                  errors++;
                }
                if (data4.acceptanceCriteria === void 0) {
                  const err17 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/required", keyword: "required", params: { missingProperty: "acceptanceCriteria" }, message: "must have required property 'acceptanceCriteria'" };
                  if (vErrors === null) {
                    vErrors = [err17];
                  } else {
                    vErrors.push(err17);
                  }
                  errors++;
                }
                for (const key1 in data4) {
                  if (!(key1 === "stageId" || key1 === "revision" || key1 === "status" || key1 === "target" || key1 === "acceptanceCriteria" || key1 === "acceptedSequence")) {
                    const err18 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err18];
                    } else {
                      vErrors.push(err18);
                    }
                    errors++;
                  }
                }
                if (data4.stageId !== void 0) {
                  let data5 = data4.stageId;
                  if (typeof data5 === "string") {
                    if (!pattern0.test(data5)) {
                      const err19 = { instancePath: instancePath + "/stages/" + i0 + "/stageId", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/stageId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err19];
                      } else {
                        vErrors.push(err19);
                      }
                      errors++;
                    }
                  } else {
                    const err20 = { instancePath: instancePath + "/stages/" + i0 + "/stageId", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/stageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err20];
                    } else {
                      vErrors.push(err20);
                    }
                    errors++;
                  }
                }
                if (data4.revision !== void 0) {
                  let data6 = data4.revision;
                  if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
                    const err21 = { instancePath: instancePath + "/stages/" + i0 + "/revision", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/revision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err21];
                    } else {
                      vErrors.push(err21);
                    }
                    errors++;
                  }
                  if (typeof data6 == "number" && isFinite(data6)) {
                    if (data6 > 9007199254740991 || isNaN(data6)) {
                      const err22 = { instancePath: instancePath + "/stages/" + i0 + "/revision", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/revision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err22];
                      } else {
                        vErrors.push(err22);
                      }
                      errors++;
                    }
                    if (data6 < 1 || isNaN(data6)) {
                      const err23 = { instancePath: instancePath + "/stages/" + i0 + "/revision", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/revision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                      if (vErrors === null) {
                        vErrors = [err23];
                      } else {
                        vErrors.push(err23);
                      }
                      errors++;
                    }
                  }
                }
                if (data4.status !== void 0) {
                  let data7 = data4.status;
                  if (typeof data7 !== "string") {
                    const err24 = { instancePath: instancePath + "/stages/" + i0 + "/status", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err24];
                    } else {
                      vErrors.push(err24);
                    }
                    errors++;
                  }
                  if (!(data7 === "pending" || data7 === "executing" || data7 === "accepted")) {
                    const err25 = { instancePath: instancePath + "/stages/" + i0 + "/status", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/status/enum", keyword: "enum", params: { allowedValues: schema25.properties.status.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err25];
                    } else {
                      vErrors.push(err25);
                    }
                    errors++;
                  }
                }
                if (data4.target !== void 0) {
                  let data8 = data4.target;
                  if (typeof data8 === "string") {
                    if (!pattern0.test(data8)) {
                      const err26 = { instancePath: instancePath + "/stages/" + i0 + "/target", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/target/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err26];
                      } else {
                        vErrors.push(err26);
                      }
                      errors++;
                    }
                  } else {
                    const err27 = { instancePath: instancePath + "/stages/" + i0 + "/target", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/target/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err27];
                    } else {
                      vErrors.push(err27);
                    }
                    errors++;
                  }
                }
                if (data4.acceptanceCriteria !== void 0) {
                  let data9 = data4.acceptanceCriteria;
                  if (Array.isArray(data9)) {
                    if (data9.length < 1) {
                      const err28 = { instancePath: instancePath + "/stages/" + i0 + "/acceptanceCriteria", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/acceptanceCriteria/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
                      if (vErrors === null) {
                        vErrors = [err28];
                      } else {
                        vErrors.push(err28);
                      }
                      errors++;
                    }
                    const len1 = data9.length;
                    for (let i1 = 0; i1 < len1; i1++) {
                      if (typeof data9[i1] !== "string") {
                        const err29 = { instancePath: instancePath + "/stages/" + i0 + "/acceptanceCriteria/" + i1, schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/acceptanceCriteria/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err29];
                        } else {
                          vErrors.push(err29);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err30 = { instancePath: instancePath + "/stages/" + i0 + "/acceptanceCriteria", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/acceptanceCriteria/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                    if (vErrors === null) {
                      vErrors = [err30];
                    } else {
                      vErrors.push(err30);
                    }
                    errors++;
                  }
                }
                if (data4.acceptedSequence !== void 0) {
                  let data11 = data4.acceptedSequence;
                  if (!(typeof data11 == "number" && (!(data11 % 1) && !isNaN(data11)) && isFinite(data11))) {
                    const err31 = { instancePath: instancePath + "/stages/" + i0 + "/acceptedSequence", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/acceptedSequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err31];
                    } else {
                      vErrors.push(err31);
                    }
                    errors++;
                  }
                  if (typeof data11 == "number" && isFinite(data11)) {
                    if (data11 > 9007199254740991 || isNaN(data11)) {
                      const err32 = { instancePath: instancePath + "/stages/" + i0 + "/acceptedSequence", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/acceptedSequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err32];
                      } else {
                        vErrors.push(err32);
                      }
                      errors++;
                    }
                    if (data11 < 0 || isNaN(data11)) {
                      const err33 = { instancePath: instancePath + "/stages/" + i0 + "/acceptedSequence", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/acceptedSequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err33];
                      } else {
                        vErrors.push(err33);
                      }
                      errors++;
                    }
                  }
                }
              } else {
                const err34 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err34];
                } else {
                  vErrors.push(err34);
                }
                errors++;
              }
            }
          } else {
            const err35 = { instancePath: instancePath + "/stages", schemaPath: "#/properties/stages/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err35];
            } else {
              vErrors.push(err35);
            }
            errors++;
          }
        }
      } else {
        const err36 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
        }
        errors++;
      }
      validate20.errors = vErrors;
      return errors === 0;
    }
    var schema27 = { "type": "string", "enum": ["active", "recoverable", "inactive"], "description": "Run \u8FDB\u7A0B\u6D3B\u52A8\u72B6\u6001\u3002" };
    function validate22(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.state === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.committedThroughSequence === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "committedThroughSequence" }, message: "must have required property 'committedThroughSequence'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "state" || key0 === "committedThroughSequence")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.state !== void 0) {
          let data0 = data.state;
          if (typeof data0 !== "string") {
            const err3 = { instancePath: instancePath + "/state", schemaPath: "#/definitions/BrowserExecutionState/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (!(data0 === "active" || data0 === "recoverable" || data0 === "inactive")) {
            const err4 = { instancePath: instancePath + "/state", schemaPath: "#/definitions/BrowserExecutionState/enum", keyword: "enum", params: { allowedValues: schema27.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.committedThroughSequence !== void 0) {
          let data1 = data.committedThroughSequence;
          if (!(typeof data1 == "number" && isFinite(data1))) {
            const err5 = { instancePath: instancePath + "/committedThroughSequence", schemaPath: "#/properties/committedThroughSequence/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
      } else {
        const err6 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      validate22.errors = vErrors;
      return errors === 0;
    }
    var schema33 = { "type": "object", "properties": { "id": { "type": "string", "pattern": "\\S" }, "content": { "type": "string" }, "position": { "type": "integer", "maximum": 9007199254740991 }, "status": { "type": "string", "enum": ["pending", "in_progress", "completed", "cancelled"] } }, "required": ["id", "content", "position", "status"], "additionalProperties": false, "description": "\u76EE\u6807\u62C6\u89E3\u8BA1\u5212\u4E2D\u7684\u6761\u76EE\u3002" };
    function validate24(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.revision === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.items === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "items" }, message: "must have required property 'items'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "revision" || key0 === "items")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.revision !== void 0) {
          let data0 = data.revision;
          if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
            const err3 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (typeof data0 == "number" && isFinite(data0)) {
            if (data0 > 9007199254740991 || isNaN(data0)) {
              const err4 = { instancePath: instancePath + "/revision", schemaPath: "#/properties/revision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
          }
        }
        if (data.items !== void 0) {
          let data1 = data.items;
          if (Array.isArray(data1)) {
            const len0 = data1.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data2 = data1[i0];
              if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
                if (data2.id === void 0) {
                  const err5 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/BrowserGoalPlanItem/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                  if (vErrors === null) {
                    vErrors = [err5];
                  } else {
                    vErrors.push(err5);
                  }
                  errors++;
                }
                if (data2.content === void 0) {
                  const err6 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/BrowserGoalPlanItem/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
                  if (vErrors === null) {
                    vErrors = [err6];
                  } else {
                    vErrors.push(err6);
                  }
                  errors++;
                }
                if (data2.position === void 0) {
                  const err7 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/BrowserGoalPlanItem/required", keyword: "required", params: { missingProperty: "position" }, message: "must have required property 'position'" };
                  if (vErrors === null) {
                    vErrors = [err7];
                  } else {
                    vErrors.push(err7);
                  }
                  errors++;
                }
                if (data2.status === void 0) {
                  const err8 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/BrowserGoalPlanItem/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
                  if (vErrors === null) {
                    vErrors = [err8];
                  } else {
                    vErrors.push(err8);
                  }
                  errors++;
                }
                for (const key1 in data2) {
                  if (!(key1 === "id" || key1 === "content" || key1 === "position" || key1 === "status")) {
                    const err9 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/BrowserGoalPlanItem/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err9];
                    } else {
                      vErrors.push(err9);
                    }
                    errors++;
                  }
                }
                if (data2.id !== void 0) {
                  let data3 = data2.id;
                  if (typeof data3 === "string") {
                    if (!pattern0.test(data3)) {
                      const err10 = { instancePath: instancePath + "/items/" + i0 + "/id", schemaPath: "#/definitions/BrowserGoalPlanItem/properties/id/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err10];
                      } else {
                        vErrors.push(err10);
                      }
                      errors++;
                    }
                  } else {
                    const err11 = { instancePath: instancePath + "/items/" + i0 + "/id", schemaPath: "#/definitions/BrowserGoalPlanItem/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err11];
                    } else {
                      vErrors.push(err11);
                    }
                    errors++;
                  }
                }
                if (data2.content !== void 0) {
                  if (typeof data2.content !== "string") {
                    const err12 = { instancePath: instancePath + "/items/" + i0 + "/content", schemaPath: "#/definitions/BrowserGoalPlanItem/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err12];
                    } else {
                      vErrors.push(err12);
                    }
                    errors++;
                  }
                }
                if (data2.position !== void 0) {
                  let data5 = data2.position;
                  if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
                    const err13 = { instancePath: instancePath + "/items/" + i0 + "/position", schemaPath: "#/definitions/BrowserGoalPlanItem/properties/position/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err13];
                    } else {
                      vErrors.push(err13);
                    }
                    errors++;
                  }
                  if (typeof data5 == "number" && isFinite(data5)) {
                    if (data5 > 9007199254740991 || isNaN(data5)) {
                      const err14 = { instancePath: instancePath + "/items/" + i0 + "/position", schemaPath: "#/definitions/BrowserGoalPlanItem/properties/position/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err14];
                      } else {
                        vErrors.push(err14);
                      }
                      errors++;
                    }
                  }
                }
                if (data2.status !== void 0) {
                  let data6 = data2.status;
                  if (typeof data6 !== "string") {
                    const err15 = { instancePath: instancePath + "/items/" + i0 + "/status", schemaPath: "#/definitions/BrowserGoalPlanItem/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err15];
                    } else {
                      vErrors.push(err15);
                    }
                    errors++;
                  }
                  if (!(data6 === "pending" || data6 === "in_progress" || data6 === "completed" || data6 === "cancelled")) {
                    const err16 = { instancePath: instancePath + "/items/" + i0 + "/status", schemaPath: "#/definitions/BrowserGoalPlanItem/properties/status/enum", keyword: "enum", params: { allowedValues: schema33.properties.status.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err16];
                    } else {
                      vErrors.push(err16);
                    }
                    errors++;
                  }
                }
              } else {
                const err17 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/definitions/BrowserGoalPlanItem/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
          } else {
            const err18 = { instancePath: instancePath + "/items", schemaPath: "#/properties/items/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
      } else {
        const err19 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
      validate24.errors = vErrors;
      return errors === 0;
    }
    var schema34 = { "type": "object", "properties": { "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "kind": { "$ref": "#/definitions/BrowserInteractionKind" }, "interactionId": { "type": "string", "pattern": "\\S" }, "requestId": { "type": "string", "pattern": "\\S" }, "actionId": { "type": "string", "pattern": "\\S" }, "recoveryRef": { "type": "string", "pattern": "\\S" }, "decisions": { "type": "array", "items": { "$ref": "#/definitions/BrowserInteractionDecision" }, "minItems": 1 }, "truncated": { "type": "boolean" } }, "required": ["goalId", "runId", "kind", "interactionId", "decisions", "truncated"], "additionalProperties": false, "description": "\u5F53\u524D\u5DF2\u63D0\u4EA4\u7B49\u5F85\u7684\u7C7B\u578B\u5316\u4EA4\u4E92\u89C6\u56FE\u6458\u8981\u3002" };
    var schema36 = { "type": "string", "enum": ["answer_questions", "reply_to_question", "skip_question", "approve_task", "send_task_feedback", "approve_action", "approve_action_revision", "reject_action", "retry_unknown_action", "decline_unknown_action_retry"], "description": "\u5F53\u524D\u4EA4\u4E92\u5141\u8BB8\u7684\u51B3\u5B9A\u3002" };
    function validate26(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.goalId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.kind === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.interactionId === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "interactionId" }, message: "must have required property 'interactionId'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.decisions === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "decisions" }, message: "must have required property 'decisions'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.truncated === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "truncated" }, message: "must have required property 'truncated'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema34.properties, key0)) {
            const err6 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data0 = data.goalId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err7 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data1 = data.runId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err9 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          } else {
            const err10 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data2 = data.kind;
          if (typeof data2 !== "string") {
            const err11 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserInteractionKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          if (!(data2 === "question" || data2 === "task_approval" || data2 === "action_approval" || data2 === "action_recovery")) {
            const err12 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserInteractionKind/enum", keyword: "enum", params: { allowedValues: schema16.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.interactionId !== void 0) {
          let data3 = data.interactionId;
          if (typeof data3 === "string") {
            if (!pattern0.test(data3)) {
              const err13 = { instancePath: instancePath + "/interactionId", schemaPath: "#/properties/interactionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          } else {
            const err14 = { instancePath: instancePath + "/interactionId", schemaPath: "#/properties/interactionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.requestId !== void 0) {
          let data4 = data.requestId;
          if (typeof data4 === "string") {
            if (!pattern0.test(data4)) {
              const err15 = { instancePath: instancePath + "/requestId", schemaPath: "#/properties/requestId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          } else {
            const err16 = { instancePath: instancePath + "/requestId", schemaPath: "#/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data.actionId !== void 0) {
          let data5 = data.actionId;
          if (typeof data5 === "string") {
            if (!pattern0.test(data5)) {
              const err17 = { instancePath: instancePath + "/actionId", schemaPath: "#/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
          } else {
            const err18 = { instancePath: instancePath + "/actionId", schemaPath: "#/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
        if (data.recoveryRef !== void 0) {
          let data6 = data.recoveryRef;
          if (typeof data6 === "string") {
            if (!pattern0.test(data6)) {
              const err19 = { instancePath: instancePath + "/recoveryRef", schemaPath: "#/properties/recoveryRef/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
          } else {
            const err20 = { instancePath: instancePath + "/recoveryRef", schemaPath: "#/properties/recoveryRef/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
        }
        if (data.decisions !== void 0) {
          let data7 = data.decisions;
          if (Array.isArray(data7)) {
            if (data7.length < 1) {
              const err21 = { instancePath: instancePath + "/decisions", schemaPath: "#/properties/decisions/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
            const len0 = data7.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data8 = data7[i0];
              if (typeof data8 !== "string") {
                const err22 = { instancePath: instancePath + "/decisions/" + i0, schemaPath: "#/definitions/BrowserInteractionDecision/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
              if (!(data8 === "answer_questions" || data8 === "reply_to_question" || data8 === "skip_question" || data8 === "approve_task" || data8 === "send_task_feedback" || data8 === "approve_action" || data8 === "approve_action_revision" || data8 === "reject_action" || data8 === "retry_unknown_action" || data8 === "decline_unknown_action_retry")) {
                const err23 = { instancePath: instancePath + "/decisions/" + i0, schemaPath: "#/definitions/BrowserInteractionDecision/enum", keyword: "enum", params: { allowedValues: schema36.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
            }
          } else {
            const err24 = { instancePath: instancePath + "/decisions", schemaPath: "#/properties/decisions/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
        }
        if (data.truncated !== void 0) {
          if (typeof data.truncated !== "boolean") {
            const err25 = { instancePath: instancePath + "/truncated", schemaPath: "#/properties/truncated/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        }
      } else {
        const err26 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      }
      validate26.errors = vErrors;
      return errors === 0;
    }
    var schema37 = { "type": "object", "properties": { "actionId": { "type": "string", "pattern": "\\S" }, "toolId": { "type": "string", "pattern": "\\S" }, "status": { "type": "string", "enum": ["approved", "awaiting_approval", "outcome_unknown"] }, "inputSummary": { "type": "string" }, "inputPreview": { "type": "string" }, "inputPreviewTruncated": { "type": "boolean" }, "targetPath": { "type": "string" }, "approvalKind": { "type": "string", "enum": ["tool", "sandbox"] }, "sandboxReview": { "$ref": "#/definitions/BrowserSandboxReview" }, "parentProgram": { "$ref": "#/definitions/BrowserParentProgram" } }, "required": ["actionId", "toolId", "status", "inputPreview", "inputPreviewTruncated"], "additionalProperties": false, "description": "\u5F85\u7528\u6237\u5BA1\u6279\u7684\u5DE5\u5177\u6216\u6C99\u7BB1 Action \u89C6\u56FE\u3002" };
    var schema38 = { "type": "object", "properties": { "extraFiles": { "type": "array", "items": { "$ref": "#/definitions/BrowserToolGrantExtraFile" } }, "network": { "type": "string", "enum": ["none", "all_outbound"] }, "networkNotice": { "type": "string" } }, "required": ["extraFiles", "network"], "additionalProperties": false, "description": "\u6C99\u7BB1\u6743\u9650\u5BA1\u9605\u6458\u8981\u3002" };
    var schema39 = { "type": "object", "properties": { "canonicalPath": { "type": "string", "pattern": "\\S" }, "access": { "type": "string", "enum": ["read", "write"] }, "kind": { "type": "string", "enum": ["file", "directory_tree"] } }, "required": ["canonicalPath", "access", "kind"], "additionalProperties": false, "description": "\u5DE5\u5177\u6388\u6743\u6216\u6C99\u7BB1\u8BBF\u95EE\u4E2D\u7684\u5355\u4E2A\u5916\u90E8\u6587\u4EF6/\u76EE\u5F55\u6761\u76EE\u3002" };
    function validate29(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.extraFiles === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "extraFiles" }, message: "must have required property 'extraFiles'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.network === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "network" }, message: "must have required property 'network'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "extraFiles" || key0 === "network" || key0 === "networkNotice")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.extraFiles !== void 0) {
          let data0 = data.extraFiles;
          if (Array.isArray(data0)) {
            const len0 = data0.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data1 = data0[i0];
              if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
                if (data1.canonicalPath === void 0) {
                  const err3 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserToolGrantExtraFile/required", keyword: "required", params: { missingProperty: "canonicalPath" }, message: "must have required property 'canonicalPath'" };
                  if (vErrors === null) {
                    vErrors = [err3];
                  } else {
                    vErrors.push(err3);
                  }
                  errors++;
                }
                if (data1.access === void 0) {
                  const err4 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserToolGrantExtraFile/required", keyword: "required", params: { missingProperty: "access" }, message: "must have required property 'access'" };
                  if (vErrors === null) {
                    vErrors = [err4];
                  } else {
                    vErrors.push(err4);
                  }
                  errors++;
                }
                if (data1.kind === void 0) {
                  const err5 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserToolGrantExtraFile/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err5];
                  } else {
                    vErrors.push(err5);
                  }
                  errors++;
                }
                for (const key1 in data1) {
                  if (!(key1 === "canonicalPath" || key1 === "access" || key1 === "kind")) {
                    const err6 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserToolGrantExtraFile/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err6];
                    } else {
                      vErrors.push(err6);
                    }
                    errors++;
                  }
                }
                if (data1.canonicalPath !== void 0) {
                  let data2 = data1.canonicalPath;
                  if (typeof data2 === "string") {
                    if (!pattern0.test(data2)) {
                      const err7 = { instancePath: instancePath + "/extraFiles/" + i0 + "/canonicalPath", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/canonicalPath/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err7];
                      } else {
                        vErrors.push(err7);
                      }
                      errors++;
                    }
                  } else {
                    const err8 = { instancePath: instancePath + "/extraFiles/" + i0 + "/canonicalPath", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/canonicalPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err8];
                    } else {
                      vErrors.push(err8);
                    }
                    errors++;
                  }
                }
                if (data1.access !== void 0) {
                  let data3 = data1.access;
                  if (typeof data3 !== "string") {
                    const err9 = { instancePath: instancePath + "/extraFiles/" + i0 + "/access", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/access/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err9];
                    } else {
                      vErrors.push(err9);
                    }
                    errors++;
                  }
                  if (!(data3 === "read" || data3 === "write")) {
                    const err10 = { instancePath: instancePath + "/extraFiles/" + i0 + "/access", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/access/enum", keyword: "enum", params: { allowedValues: schema39.properties.access.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err10];
                    } else {
                      vErrors.push(err10);
                    }
                    errors++;
                  }
                }
                if (data1.kind !== void 0) {
                  let data4 = data1.kind;
                  if (typeof data4 !== "string") {
                    const err11 = { instancePath: instancePath + "/extraFiles/" + i0 + "/kind", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err11];
                    } else {
                      vErrors.push(err11);
                    }
                    errors++;
                  }
                  if (!(data4 === "file" || data4 === "directory_tree")) {
                    const err12 = { instancePath: instancePath + "/extraFiles/" + i0 + "/kind", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/kind/enum", keyword: "enum", params: { allowedValues: schema39.properties.kind.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err12];
                    } else {
                      vErrors.push(err12);
                    }
                    errors++;
                  }
                }
              } else {
                const err13 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserToolGrantExtraFile/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
            }
          } else {
            const err14 = { instancePath: instancePath + "/extraFiles", schemaPath: "#/properties/extraFiles/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.network !== void 0) {
          let data5 = data.network;
          if (typeof data5 !== "string") {
            const err15 = { instancePath: instancePath + "/network", schemaPath: "#/properties/network/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
          if (!(data5 === "none" || data5 === "all_outbound")) {
            const err16 = { instancePath: instancePath + "/network", schemaPath: "#/properties/network/enum", keyword: "enum", params: { allowedValues: schema38.properties.network.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data.networkNotice !== void 0) {
          if (typeof data.networkNotice !== "string") {
            const err17 = { instancePath: instancePath + "/networkNotice", schemaPath: "#/properties/networkNotice/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
      } else {
        const err18 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
      validate29.errors = vErrors;
      return errors === 0;
    }
    function validate28(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.actionId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.toolId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "toolId" }, message: "must have required property 'toolId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.status === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.inputPreview === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "inputPreview" }, message: "must have required property 'inputPreview'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.inputPreviewTruncated === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "inputPreviewTruncated" }, message: "must have required property 'inputPreviewTruncated'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema37.properties, key0)) {
            const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.actionId !== void 0) {
          let data0 = data.actionId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err6 = { instancePath: instancePath + "/actionId", schemaPath: "#/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          } else {
            const err7 = { instancePath: instancePath + "/actionId", schemaPath: "#/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.toolId !== void 0) {
          let data1 = data.toolId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err8 = { instancePath: instancePath + "/toolId", schemaPath: "#/properties/toolId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          } else {
            const err9 = { instancePath: instancePath + "/toolId", schemaPath: "#/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.status !== void 0) {
          let data2 = data.status;
          if (typeof data2 !== "string") {
            const err10 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
          if (!(data2 === "approved" || data2 === "awaiting_approval" || data2 === "outcome_unknown")) {
            const err11 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/enum", keyword: "enum", params: { allowedValues: schema37.properties.status.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.inputSummary !== void 0) {
          if (typeof data.inputSummary !== "string") {
            const err12 = { instancePath: instancePath + "/inputSummary", schemaPath: "#/properties/inputSummary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.inputPreview !== void 0) {
          if (typeof data.inputPreview !== "string") {
            const err13 = { instancePath: instancePath + "/inputPreview", schemaPath: "#/properties/inputPreview/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.inputPreviewTruncated !== void 0) {
          if (typeof data.inputPreviewTruncated !== "boolean") {
            const err14 = { instancePath: instancePath + "/inputPreviewTruncated", schemaPath: "#/properties/inputPreviewTruncated/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.targetPath !== void 0) {
          if (typeof data.targetPath !== "string") {
            const err15 = { instancePath: instancePath + "/targetPath", schemaPath: "#/properties/targetPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.approvalKind !== void 0) {
          let data7 = data.approvalKind;
          if (typeof data7 !== "string") {
            const err16 = { instancePath: instancePath + "/approvalKind", schemaPath: "#/properties/approvalKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
          if (!(data7 === "tool" || data7 === "sandbox")) {
            const err17 = { instancePath: instancePath + "/approvalKind", schemaPath: "#/properties/approvalKind/enum", keyword: "enum", params: { allowedValues: schema37.properties.approvalKind.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.sandboxReview !== void 0) {
          if (!validate29(data.sandboxReview, { instancePath: instancePath + "/sandboxReview", parentData: data, parentDataProperty: "sandboxReview", rootData })) {
            vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
            errors = vErrors.length;
          }
        }
        if (data.parentProgram !== void 0) {
          let data9 = data.parentProgram;
          if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
            if (data9.actionId === void 0) {
              const err18 = { instancePath: instancePath + "/parentProgram", schemaPath: "#/definitions/BrowserParentProgram/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            if (data9.callNumber === void 0) {
              const err19 = { instancePath: instancePath + "/parentProgram", schemaPath: "#/definitions/BrowserParentProgram/required", keyword: "required", params: { missingProperty: "callNumber" }, message: "must have required property 'callNumber'" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            for (const key1 in data9) {
              if (!(key1 === "actionId" || key1 === "callNumber")) {
                const err20 = { instancePath: instancePath + "/parentProgram", schemaPath: "#/definitions/BrowserParentProgram/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            }
            if (data9.actionId !== void 0) {
              let data10 = data9.actionId;
              if (typeof data10 === "string") {
                if (!pattern0.test(data10)) {
                  const err21 = { instancePath: instancePath + "/parentProgram/actionId", schemaPath: "#/definitions/BrowserParentProgram/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err21];
                  } else {
                    vErrors.push(err21);
                  }
                  errors++;
                }
              } else {
                const err22 = { instancePath: instancePath + "/parentProgram/actionId", schemaPath: "#/definitions/BrowserParentProgram/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
            }
            if (data9.callNumber !== void 0) {
              let data11 = data9.callNumber;
              if (!(typeof data11 == "number" && (!(data11 % 1) && !isNaN(data11)) && isFinite(data11))) {
                const err23 = { instancePath: instancePath + "/parentProgram/callNumber", schemaPath: "#/definitions/BrowserParentProgram/properties/callNumber/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
              if (typeof data11 == "number" && isFinite(data11)) {
                if (data11 > 9007199254740991 || isNaN(data11)) {
                  const err24 = { instancePath: instancePath + "/parentProgram/callNumber", schemaPath: "#/definitions/BrowserParentProgram/properties/callNumber/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err24];
                  } else {
                    vErrors.push(err24);
                  }
                  errors++;
                }
                if (data11 < 1 || isNaN(data11)) {
                  const err25 = { instancePath: instancePath + "/parentProgram/callNumber", schemaPath: "#/definitions/BrowserParentProgram/properties/callNumber/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                  if (vErrors === null) {
                    vErrors = [err25];
                  } else {
                    vErrors.push(err25);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err26 = { instancePath: instancePath + "/parentProgram", schemaPath: "#/definitions/BrowserParentProgram/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
        }
      } else {
        const err27 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
      validate28.errors = vErrors;
      return errors === 0;
    }
    function validate19(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.goalId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.intent === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "intent" }, message: "must have required property 'intent'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.currentRunId === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "currentRunId" }, message: "must have required property 'currentRunId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.runStatus === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runStatus" }, message: "must have required property 'runStatus'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.currentRunMode === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "currentRunMode" }, message: "must have required property 'currentRunMode'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.currentRunStepCount === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "currentRunStepCount" }, message: "must have required property 'currentRunStepCount'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.history === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "history" }, message: "must have required property 'history'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema21.properties, key0)) {
            const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data0 = data.goalId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err8 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          } else {
            const err9 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.intent !== void 0) {
          if (typeof data.intent !== "string") {
            const err10 = { instancePath: instancePath + "/intent", schemaPath: "#/properties/intent/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.currentRunId !== void 0) {
          let data2 = data.currentRunId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err11 = { instancePath: instancePath + "/currentRunId", schemaPath: "#/properties/currentRunId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          } else {
            const err12 = { instancePath: instancePath + "/currentRunId", schemaPath: "#/properties/currentRunId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.runStatus !== void 0) {
          let data3 = data.runStatus;
          if (typeof data3 !== "string") {
            const err13 = { instancePath: instancePath + "/runStatus", schemaPath: "#/definitions/BrowserRunStatus/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
          if (!(data3 === "created" || data3 === "running" || data3 === "waiting" || data3 === "completed" || data3 === "failed" || data3 === "cancelled")) {
            const err14 = { instancePath: instancePath + "/runStatus", schemaPath: "#/definitions/BrowserRunStatus/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.currentRunMode !== void 0) {
          let data4 = data.currentRunMode;
          if (typeof data4 !== "string") {
            const err15 = { instancePath: instancePath + "/currentRunMode", schemaPath: "#/properties/currentRunMode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
          if (!(data4 === "normal" || data4 === "plan")) {
            const err16 = { instancePath: instancePath + "/currentRunMode", schemaPath: "#/properties/currentRunMode/enum", keyword: "enum", params: { allowedValues: schema21.properties.currentRunMode.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data.nextRunMode !== void 0) {
          let data5 = data.nextRunMode;
          if (typeof data5 !== "string") {
            const err17 = { instancePath: instancePath + "/nextRunMode", schemaPath: "#/properties/nextRunMode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
          if ("plan" !== data5) {
            const err18 = { instancePath: instancePath + "/nextRunMode", schemaPath: "#/properties/nextRunMode/const", keyword: "const", params: { allowedValue: "plan" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
        if (data.currentRunStepCount !== void 0) {
          let data6 = data.currentRunStepCount;
          if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
            const err19 = { instancePath: instancePath + "/currentRunStepCount", schemaPath: "#/properties/currentRunStepCount/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
          if (typeof data6 == "number" && isFinite(data6)) {
            if (data6 > 9007199254740991 || isNaN(data6)) {
              const err20 = { instancePath: instancePath + "/currentRunStepCount", schemaPath: "#/properties/currentRunStepCount/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
            if (data6 < 0 || isNaN(data6)) {
              const err21 = { instancePath: instancePath + "/currentRunStepCount", schemaPath: "#/properties/currentRunStepCount/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
        }
        if (data.currentRunTerminalDetail !== void 0) {
          let data7 = data.currentRunTerminalDetail;
          if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
            if (data7.message === void 0) {
              const err22 = { instancePath: instancePath + "/currentRunTerminalDetail", schemaPath: "#/definitions/BrowserSessionRunTerminalDetail/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
            for (const key1 in data7) {
              if (!(key1 === "code" || key1 === "message")) {
                const err23 = { instancePath: instancePath + "/currentRunTerminalDetail", schemaPath: "#/definitions/BrowserSessionRunTerminalDetail/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
            }
            if (data7.code !== void 0) {
              if (typeof data7.code !== "string") {
                const err24 = { instancePath: instancePath + "/currentRunTerminalDetail/code", schemaPath: "#/definitions/BrowserSessionRunTerminalDetail/properties/code/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err24];
                } else {
                  vErrors.push(err24);
                }
                errors++;
              }
            }
            if (data7.message !== void 0) {
              if (typeof data7.message !== "string") {
                const err25 = { instancePath: instancePath + "/currentRunTerminalDetail/message", schemaPath: "#/definitions/BrowserSessionRunTerminalDetail/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err25];
                } else {
                  vErrors.push(err25);
                }
                errors++;
              }
            }
          } else {
            const err26 = { instancePath: instancePath + "/currentRunTerminalDetail", schemaPath: "#/definitions/BrowserSessionRunTerminalDetail/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
        }
        if (data.currentPlanRoute !== void 0) {
          if (!validate20(data.currentPlanRoute, { instancePath: instancePath + "/currentPlanRoute", parentData: data, parentDataProperty: "currentPlanRoute", rootData })) {
            vErrors = vErrors === null ? validate20.errors : vErrors.concat(validate20.errors);
            errors = vErrors.length;
          }
        }
        if (data.execution !== void 0) {
          if (!validate22(data.execution, { instancePath: instancePath + "/execution", parentData: data, parentDataProperty: "execution", rootData })) {
            vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
            errors = vErrors.length;
          }
        }
        if (data.pendingSteers !== void 0) {
          let data12 = data.pendingSteers;
          if (Array.isArray(data12)) {
            const len0 = data12.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data13 = data12[i0];
              if (data13 && typeof data13 == "object" && !Array.isArray(data13)) {
                if (data13.messageId === void 0) {
                  const err27 = { instancePath: instancePath + "/pendingSteers/" + i0, schemaPath: "#/definitions/BrowserPendingSteer/required", keyword: "required", params: { missingProperty: "messageId" }, message: "must have required property 'messageId'" };
                  if (vErrors === null) {
                    vErrors = [err27];
                  } else {
                    vErrors.push(err27);
                  }
                  errors++;
                }
                if (data13.content === void 0) {
                  const err28 = { instancePath: instancePath + "/pendingSteers/" + i0, schemaPath: "#/definitions/BrowserPendingSteer/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
                  if (vErrors === null) {
                    vErrors = [err28];
                  } else {
                    vErrors.push(err28);
                  }
                  errors++;
                }
                for (const key2 in data13) {
                  if (!(key2 === "messageId" || key2 === "content")) {
                    const err29 = { instancePath: instancePath + "/pendingSteers/" + i0, schemaPath: "#/definitions/BrowserPendingSteer/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err29];
                    } else {
                      vErrors.push(err29);
                    }
                    errors++;
                  }
                }
                if (data13.messageId !== void 0) {
                  let data14 = data13.messageId;
                  if (typeof data14 === "string") {
                    if (!pattern0.test(data14)) {
                      const err30 = { instancePath: instancePath + "/pendingSteers/" + i0 + "/messageId", schemaPath: "#/definitions/BrowserPendingSteer/properties/messageId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err30];
                      } else {
                        vErrors.push(err30);
                      }
                      errors++;
                    }
                  } else {
                    const err31 = { instancePath: instancePath + "/pendingSteers/" + i0 + "/messageId", schemaPath: "#/definitions/BrowserPendingSteer/properties/messageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err31];
                    } else {
                      vErrors.push(err31);
                    }
                    errors++;
                  }
                }
                if (data13.content !== void 0) {
                  if (typeof data13.content !== "string") {
                    const err32 = { instancePath: instancePath + "/pendingSteers/" + i0 + "/content", schemaPath: "#/definitions/BrowserPendingSteer/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err32];
                    } else {
                      vErrors.push(err32);
                    }
                    errors++;
                  }
                }
              } else {
                const err33 = { instancePath: instancePath + "/pendingSteers/" + i0, schemaPath: "#/definitions/BrowserPendingSteer/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err33];
                } else {
                  vErrors.push(err33);
                }
                errors++;
              }
            }
          } else {
            const err34 = { instancePath: instancePath + "/pendingSteers", schemaPath: "#/properties/pendingSteers/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
        }
        if (data.pendingMessages !== void 0) {
          let data16 = data.pendingMessages;
          if (Array.isArray(data16)) {
            const len1 = data16.length;
            for (let i1 = 0; i1 < len1; i1++) {
              let data17 = data16[i1];
              if (data17 && typeof data17 == "object" && !Array.isArray(data17)) {
                if (data17.inputId === void 0) {
                  const err35 = { instancePath: instancePath + "/pendingMessages/" + i1, schemaPath: "#/definitions/BrowserPendingMessage/required", keyword: "required", params: { missingProperty: "inputId" }, message: "must have required property 'inputId'" };
                  if (vErrors === null) {
                    vErrors = [err35];
                  } else {
                    vErrors.push(err35);
                  }
                  errors++;
                }
                if (data17.content === void 0) {
                  const err36 = { instancePath: instancePath + "/pendingMessages/" + i1, schemaPath: "#/definitions/BrowserPendingMessage/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
                  if (vErrors === null) {
                    vErrors = [err36];
                  } else {
                    vErrors.push(err36);
                  }
                  errors++;
                }
                for (const key3 in data17) {
                  if (!(key3 === "inputId" || key3 === "content")) {
                    const err37 = { instancePath: instancePath + "/pendingMessages/" + i1, schemaPath: "#/definitions/BrowserPendingMessage/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err37];
                    } else {
                      vErrors.push(err37);
                    }
                    errors++;
                  }
                }
                if (data17.inputId !== void 0) {
                  let data18 = data17.inputId;
                  if (typeof data18 === "string") {
                    if (!pattern0.test(data18)) {
                      const err38 = { instancePath: instancePath + "/pendingMessages/" + i1 + "/inputId", schemaPath: "#/definitions/BrowserPendingMessage/properties/inputId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err38];
                      } else {
                        vErrors.push(err38);
                      }
                      errors++;
                    }
                  } else {
                    const err39 = { instancePath: instancePath + "/pendingMessages/" + i1 + "/inputId", schemaPath: "#/definitions/BrowserPendingMessage/properties/inputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err39];
                    } else {
                      vErrors.push(err39);
                    }
                    errors++;
                  }
                }
                if (data17.content !== void 0) {
                  if (typeof data17.content !== "string") {
                    const err40 = { instancePath: instancePath + "/pendingMessages/" + i1 + "/content", schemaPath: "#/definitions/BrowserPendingMessage/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err40];
                    } else {
                      vErrors.push(err40);
                    }
                    errors++;
                  }
                }
              } else {
                const err41 = { instancePath: instancePath + "/pendingMessages/" + i1, schemaPath: "#/definitions/BrowserPendingMessage/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err41];
                } else {
                  vErrors.push(err41);
                }
                errors++;
              }
            }
          } else {
            const err42 = { instancePath: instancePath + "/pendingMessages", schemaPath: "#/properties/pendingMessages/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err42];
            } else {
              vErrors.push(err42);
            }
            errors++;
          }
        }
        if (data.queue !== void 0) {
          let data20 = data.queue;
          if (data20 && typeof data20 == "object" && !Array.isArray(data20)) {
            if (data20.revision === void 0) {
              const err43 = { instancePath: instancePath + "/queue", schemaPath: "#/definitions/BrowserQueueState/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
              if (vErrors === null) {
                vErrors = [err43];
              } else {
                vErrors.push(err43);
              }
              errors++;
            }
            if (data20.paused === void 0) {
              const err44 = { instancePath: instancePath + "/queue", schemaPath: "#/definitions/BrowserQueueState/required", keyword: "required", params: { missingProperty: "paused" }, message: "must have required property 'paused'" };
              if (vErrors === null) {
                vErrors = [err44];
              } else {
                vErrors.push(err44);
              }
              errors++;
            }
            for (const key4 in data20) {
              if (!(key4 === "revision" || key4 === "paused" || key4 === "pauseReason")) {
                const err45 = { instancePath: instancePath + "/queue", schemaPath: "#/definitions/BrowserQueueState/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
            }
            if (data20.revision !== void 0) {
              let data21 = data20.revision;
              if (!(typeof data21 == "number" && (!(data21 % 1) && !isNaN(data21)) && isFinite(data21))) {
                const err46 = { instancePath: instancePath + "/queue/revision", schemaPath: "#/definitions/BrowserQueueState/properties/revision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
              if (typeof data21 == "number" && isFinite(data21)) {
                if (data21 > 9007199254740991 || isNaN(data21)) {
                  const err47 = { instancePath: instancePath + "/queue/revision", schemaPath: "#/definitions/BrowserQueueState/properties/revision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err47];
                  } else {
                    vErrors.push(err47);
                  }
                  errors++;
                }
                if (data21 < 0 || isNaN(data21)) {
                  const err48 = { instancePath: instancePath + "/queue/revision", schemaPath: "#/definitions/BrowserQueueState/properties/revision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err48];
                  } else {
                    vErrors.push(err48);
                  }
                  errors++;
                }
              }
            }
            if (data20.paused !== void 0) {
              if (typeof data20.paused !== "boolean") {
                const err49 = { instancePath: instancePath + "/queue/paused", schemaPath: "#/definitions/BrowserQueueState/properties/paused/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err49];
                } else {
                  vErrors.push(err49);
                }
                errors++;
              }
            }
            if (data20.pauseReason !== void 0) {
              let data23 = data20.pauseReason;
              if (typeof data23 !== "string") {
                const err50 = { instancePath: instancePath + "/queue/pauseReason", schemaPath: "#/definitions/BrowserQueueState/properties/pauseReason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
              if (!(data23 === "run_failed" || data23 === "user_interrupt")) {
                const err51 = { instancePath: instancePath + "/queue/pauseReason", schemaPath: "#/definitions/BrowserQueueState/properties/pauseReason/enum", keyword: "enum", params: { allowedValues: schema30.properties.pauseReason.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
            }
          } else {
            const err52 = { instancePath: instancePath + "/queue", schemaPath: "#/definitions/BrowserQueueState/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err52];
            } else {
              vErrors.push(err52);
            }
            errors++;
          }
        }
        if (data.interruption !== void 0) {
          let data24 = data.interruption;
          if (data24 && typeof data24 == "object" && !Array.isArray(data24)) {
            if (data24.requestId === void 0) {
              const err53 = { instancePath: instancePath + "/interruption", schemaPath: "#/definitions/BrowserInterruption/required", keyword: "required", params: { missingProperty: "requestId" }, message: "must have required property 'requestId'" };
              if (vErrors === null) {
                vErrors = [err53];
              } else {
                vErrors.push(err53);
              }
              errors++;
            }
            if (data24.status === void 0) {
              const err54 = { instancePath: instancePath + "/interruption", schemaPath: "#/definitions/BrowserInterruption/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
              if (vErrors === null) {
                vErrors = [err54];
              } else {
                vErrors.push(err54);
              }
              errors++;
            }
            for (const key5 in data24) {
              if (!(key5 === "requestId" || key5 === "status" || key5 === "outcomeUnknown")) {
                const err55 = { instancePath: instancePath + "/interruption", schemaPath: "#/definitions/BrowserInterruption/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err55];
                } else {
                  vErrors.push(err55);
                }
                errors++;
              }
            }
            if (data24.requestId !== void 0) {
              let data25 = data24.requestId;
              if (typeof data25 === "string") {
                if (!pattern0.test(data25)) {
                  const err56 = { instancePath: instancePath + "/interruption/requestId", schemaPath: "#/definitions/BrowserInterruption/properties/requestId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err56];
                  } else {
                    vErrors.push(err56);
                  }
                  errors++;
                }
              } else {
                const err57 = { instancePath: instancePath + "/interruption/requestId", schemaPath: "#/definitions/BrowserInterruption/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err57];
                } else {
                  vErrors.push(err57);
                }
                errors++;
              }
            }
            if (data24.status !== void 0) {
              let data26 = data24.status;
              if (typeof data26 !== "string") {
                const err58 = { instancePath: instancePath + "/interruption/status", schemaPath: "#/definitions/BrowserInterruption/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err58];
                } else {
                  vErrors.push(err58);
                }
                errors++;
              }
              if (!(data26 === "requested" || data26 === "finished")) {
                const err59 = { instancePath: instancePath + "/interruption/status", schemaPath: "#/definitions/BrowserInterruption/properties/status/enum", keyword: "enum", params: { allowedValues: schema31.properties.status.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err59];
                } else {
                  vErrors.push(err59);
                }
                errors++;
              }
            }
            if (data24.outcomeUnknown !== void 0) {
              if (typeof data24.outcomeUnknown !== "boolean") {
                const err60 = { instancePath: instancePath + "/interruption/outcomeUnknown", schemaPath: "#/definitions/BrowserInterruption/properties/outcomeUnknown/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err60];
                } else {
                  vErrors.push(err60);
                }
                errors++;
              }
            }
          } else {
            const err61 = { instancePath: instancePath + "/interruption", schemaPath: "#/definitions/BrowserInterruption/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err61];
            } else {
              vErrors.push(err61);
            }
            errors++;
          }
        }
        if (data.goalPlan !== void 0) {
          if (!validate24(data.goalPlan, { instancePath: instancePath + "/goalPlan", parentData: data, parentDataProperty: "goalPlan", rootData })) {
            vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
            errors = vErrors.length;
          }
        }
        if (data.interaction !== void 0) {
          if (!validate26(data.interaction, { instancePath: instancePath + "/interaction", parentData: data, parentDataProperty: "interaction", rootData })) {
            vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
            errors = vErrors.length;
          }
        }
        if (data.pendingAction !== void 0) {
          if (!validate28(data.pendingAction, { instancePath: instancePath + "/pendingAction", parentData: data, parentDataProperty: "pendingAction", rootData })) {
            vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
            errors = vErrors.length;
          }
        }
        if (data.history !== void 0) {
          let data31 = data.history;
          if (data31 && typeof data31 == "object" && !Array.isArray(data31)) {
            if (data31.messages === void 0) {
              const err62 = { instancePath: instancePath + "/history", schemaPath: "#/properties/history/required", keyword: "required", params: { missingProperty: "messages" }, message: "must have required property 'messages'" };
              if (vErrors === null) {
                vErrors = [err62];
              } else {
                vErrors.push(err62);
              }
              errors++;
            }
            if (data31.steps === void 0) {
              const err63 = { instancePath: instancePath + "/history", schemaPath: "#/properties/history/required", keyword: "required", params: { missingProperty: "steps" }, message: "must have required property 'steps'" };
              if (vErrors === null) {
                vErrors = [err63];
              } else {
                vErrors.push(err63);
              }
              errors++;
            }
            if (data31.stages === void 0) {
              const err64 = { instancePath: instancePath + "/history", schemaPath: "#/properties/history/required", keyword: "required", params: { missingProperty: "stages" }, message: "must have required property 'stages'" };
              if (vErrors === null) {
                vErrors = [err64];
              } else {
                vErrors.push(err64);
              }
              errors++;
            }
            for (const key6 in data31) {
              if (!(key6 === "messages" || key6 === "steps" || key6 === "stages")) {
                const err65 = { instancePath: instancePath + "/history", schemaPath: "#/properties/history/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err65];
                } else {
                  vErrors.push(err65);
                }
                errors++;
              }
            }
            if (data31.messages !== void 0) {
              let data32 = data31.messages;
              if (data32 && typeof data32 == "object" && !Array.isArray(data32)) {
                if (data32.included === void 0) {
                  const err66 = { instancePath: instancePath + "/history/messages", schemaPath: "#/definitions/BrowserActivityHistoryMarker/required", keyword: "required", params: { missingProperty: "included" }, message: "must have required property 'included'" };
                  if (vErrors === null) {
                    vErrors = [err66];
                  } else {
                    vErrors.push(err66);
                  }
                  errors++;
                }
                if (data32.source === void 0) {
                  const err67 = { instancePath: instancePath + "/history/messages", schemaPath: "#/definitions/BrowserActivityHistoryMarker/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                  if (vErrors === null) {
                    vErrors = [err67];
                  } else {
                    vErrors.push(err67);
                  }
                  errors++;
                }
                for (const key7 in data32) {
                  if (!(key7 === "included" || key7 === "source")) {
                    const err68 = { instancePath: instancePath + "/history/messages", schemaPath: "#/definitions/BrowserActivityHistoryMarker/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key7 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err68];
                    } else {
                      vErrors.push(err68);
                    }
                    errors++;
                  }
                }
                if (data32.included !== void 0) {
                  let data33 = data32.included;
                  if (typeof data33 !== "boolean") {
                    const err69 = { instancePath: instancePath + "/history/messages/included", schemaPath: "#/definitions/BrowserActivityHistoryMarker/properties/included/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                    if (vErrors === null) {
                      vErrors = [err69];
                    } else {
                      vErrors.push(err69);
                    }
                    errors++;
                  }
                  if (false !== data33) {
                    const err70 = { instancePath: instancePath + "/history/messages/included", schemaPath: "#/definitions/BrowserActivityHistoryMarker/properties/included/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err70];
                    } else {
                      vErrors.push(err70);
                    }
                    errors++;
                  }
                }
                if (data32.source !== void 0) {
                  let data34 = data32.source;
                  if (typeof data34 !== "string") {
                    const err71 = { instancePath: instancePath + "/history/messages/source", schemaPath: "#/definitions/BrowserActivityHistoryMarker/properties/source/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err71];
                    } else {
                      vErrors.push(err71);
                    }
                    errors++;
                  }
                  if ("activity" !== data34) {
                    const err72 = { instancePath: instancePath + "/history/messages/source", schemaPath: "#/definitions/BrowserActivityHistoryMarker/properties/source/const", keyword: "const", params: { allowedValue: "activity" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err72];
                    } else {
                      vErrors.push(err72);
                    }
                    errors++;
                  }
                }
              } else {
                const err73 = { instancePath: instancePath + "/history/messages", schemaPath: "#/definitions/BrowserActivityHistoryMarker/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err73];
                } else {
                  vErrors.push(err73);
                }
                errors++;
              }
            }
            if (data31.steps !== void 0) {
              let data35 = data31.steps;
              if (data35 && typeof data35 == "object" && !Array.isArray(data35)) {
                if (data35.included === void 0) {
                  const err74 = { instancePath: instancePath + "/history/steps", schemaPath: "#/definitions/BrowserActivityHistoryMarker/required", keyword: "required", params: { missingProperty: "included" }, message: "must have required property 'included'" };
                  if (vErrors === null) {
                    vErrors = [err74];
                  } else {
                    vErrors.push(err74);
                  }
                  errors++;
                }
                if (data35.source === void 0) {
                  const err75 = { instancePath: instancePath + "/history/steps", schemaPath: "#/definitions/BrowserActivityHistoryMarker/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                  if (vErrors === null) {
                    vErrors = [err75];
                  } else {
                    vErrors.push(err75);
                  }
                  errors++;
                }
                for (const key8 in data35) {
                  if (!(key8 === "included" || key8 === "source")) {
                    const err76 = { instancePath: instancePath + "/history/steps", schemaPath: "#/definitions/BrowserActivityHistoryMarker/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key8 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err76];
                    } else {
                      vErrors.push(err76);
                    }
                    errors++;
                  }
                }
                if (data35.included !== void 0) {
                  let data36 = data35.included;
                  if (typeof data36 !== "boolean") {
                    const err77 = { instancePath: instancePath + "/history/steps/included", schemaPath: "#/definitions/BrowserActivityHistoryMarker/properties/included/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                    if (vErrors === null) {
                      vErrors = [err77];
                    } else {
                      vErrors.push(err77);
                    }
                    errors++;
                  }
                  if (false !== data36) {
                    const err78 = { instancePath: instancePath + "/history/steps/included", schemaPath: "#/definitions/BrowserActivityHistoryMarker/properties/included/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err78];
                    } else {
                      vErrors.push(err78);
                    }
                    errors++;
                  }
                }
                if (data35.source !== void 0) {
                  let data37 = data35.source;
                  if (typeof data37 !== "string") {
                    const err79 = { instancePath: instancePath + "/history/steps/source", schemaPath: "#/definitions/BrowserActivityHistoryMarker/properties/source/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err79];
                    } else {
                      vErrors.push(err79);
                    }
                    errors++;
                  }
                  if ("activity" !== data37) {
                    const err80 = { instancePath: instancePath + "/history/steps/source", schemaPath: "#/definitions/BrowserActivityHistoryMarker/properties/source/const", keyword: "const", params: { allowedValue: "activity" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err80];
                    } else {
                      vErrors.push(err80);
                    }
                    errors++;
                  }
                }
              } else {
                const err81 = { instancePath: instancePath + "/history/steps", schemaPath: "#/definitions/BrowserActivityHistoryMarker/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err81];
                } else {
                  vErrors.push(err81);
                }
                errors++;
              }
            }
            if (data31.stages !== void 0) {
              let data38 = data31.stages;
              if (data38 && typeof data38 == "object" && !Array.isArray(data38)) {
                if (data38.included === void 0) {
                  const err82 = { instancePath: instancePath + "/history/stages", schemaPath: "#/definitions/BrowserActivityHistoryMarker/required", keyword: "required", params: { missingProperty: "included" }, message: "must have required property 'included'" };
                  if (vErrors === null) {
                    vErrors = [err82];
                  } else {
                    vErrors.push(err82);
                  }
                  errors++;
                }
                if (data38.source === void 0) {
                  const err83 = { instancePath: instancePath + "/history/stages", schemaPath: "#/definitions/BrowserActivityHistoryMarker/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                  if (vErrors === null) {
                    vErrors = [err83];
                  } else {
                    vErrors.push(err83);
                  }
                  errors++;
                }
                for (const key9 in data38) {
                  if (!(key9 === "included" || key9 === "source")) {
                    const err84 = { instancePath: instancePath + "/history/stages", schemaPath: "#/definitions/BrowserActivityHistoryMarker/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key9 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err84];
                    } else {
                      vErrors.push(err84);
                    }
                    errors++;
                  }
                }
                if (data38.included !== void 0) {
                  let data39 = data38.included;
                  if (typeof data39 !== "boolean") {
                    const err85 = { instancePath: instancePath + "/history/stages/included", schemaPath: "#/definitions/BrowserActivityHistoryMarker/properties/included/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                    if (vErrors === null) {
                      vErrors = [err85];
                    } else {
                      vErrors.push(err85);
                    }
                    errors++;
                  }
                  if (false !== data39) {
                    const err86 = { instancePath: instancePath + "/history/stages/included", schemaPath: "#/definitions/BrowserActivityHistoryMarker/properties/included/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err86];
                    } else {
                      vErrors.push(err86);
                    }
                    errors++;
                  }
                }
                if (data38.source !== void 0) {
                  let data40 = data38.source;
                  if (typeof data40 !== "string") {
                    const err87 = { instancePath: instancePath + "/history/stages/source", schemaPath: "#/definitions/BrowserActivityHistoryMarker/properties/source/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err87];
                    } else {
                      vErrors.push(err87);
                    }
                    errors++;
                  }
                  if ("activity" !== data40) {
                    const err88 = { instancePath: instancePath + "/history/stages/source", schemaPath: "#/definitions/BrowserActivityHistoryMarker/properties/source/const", keyword: "const", params: { allowedValue: "activity" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err88];
                    } else {
                      vErrors.push(err88);
                    }
                    errors++;
                  }
                }
              } else {
                const err89 = { instancePath: instancePath + "/history/stages", schemaPath: "#/definitions/BrowserActivityHistoryMarker/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err89];
                } else {
                  vErrors.push(err89);
                }
                errors++;
              }
            }
          } else {
            const err90 = { instancePath: instancePath + "/history", schemaPath: "#/properties/history/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err90];
            } else {
              vErrors.push(err90);
            }
            errors++;
          }
        }
      } else {
        const err91 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err91];
        } else {
          vErrors.push(err91);
        }
        errors++;
      }
      validate19.errors = vErrors;
      return errors === 0;
    }
    function validate18(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.goal === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "goal" }, message: "must have required property 'goal'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.session === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "session" }, message: "must have required property 'session'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "goal" || key0 === "session")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.goal !== void 0) {
          if (!validate19(data.goal, { instancePath: instancePath + "/goal", parentData: data, parentDataProperty: "goal", rootData })) {
            vErrors = vErrors === null ? validate19.errors : vErrors.concat(validate19.errors);
            errors = vErrors.length;
          }
        }
        if (data.session !== void 0) {
          if (!validate12(data.session, { instancePath: instancePath + "/session", parentData: data, parentDataProperty: "session", rootData })) {
            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err3 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      validate18.errors = vErrors;
      return errors === 0;
    }
    var schema45 = { "type": "string", "enum": ["message", "steer", "interrupt", "respond", "resume", "queue_control"], "description": "\u4F1A\u8BDD\u8F93\u5165\u79CD\u7C7B\u3002" };
    var schema49 = { "type": "string", "enum": ["INVALID_INPUT", "INPUT_CONFLICT", "INPUT_NOT_FOUND", "GOAL_NOT_FOUND", "BUSY", "STEER_CONFLICT", "INTERRUPT_CONFLICT", "STALE_REVISION", "INTERACTION_MISMATCH", "INTERACTION_REQUIRED", "QUEUE_PAUSED", "RUN_NOT_RESUMABLE", "QUEUE_FULL", "QUEUE_TEXT_TOO_LARGE", "TEXT_TOO_LARGE", "QUEUE_NOT_PAUSED", "QUEUE_REVISION_MISMATCH", "QUEUED_MESSAGE_NOT_FOUND", "RUN_NOT_FOUND", "RUN_NOT_RUNNING", "RUN_CONTROL_UNAVAILABLE", "input_admission_failed", "session_unavailable"], "description": "\u8F93\u5165\u53D7\u7406\u4E0E\u67E5\u8BE2\u7684\u7A33\u5B9A wire \u62D2\u7EDD\u4EE3\u7801\u3002" };
    var schema46 = { "type": "object", "properties": { "goalId": { "type": "string", "pattern": "\\S" }, "inputId": { "type": "string", "pattern": "\\S" }, "kind": { "$ref": "#/definitions/BrowserSessionInputKind" }, "sequence": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "status": { "$ref": "#/definitions/BrowserSessionInputStatus" }, "admittedAtRevision": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "targetRunId": { "type": "string", "pattern": "\\S" }, "appliedRunId": { "type": "string", "pattern": "\\S" }, "messageIndex": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 } }, "required": ["goalId", "inputId", "kind", "sequence", "status", "admittedAtRevision"], "additionalProperties": false, "description": "\u4E00\u6761\u5DF2\u6301\u4E45\u5316\u8F93\u5165\u7684\u53D7\u7406\u6536\u636E\u6295\u5F71\u3002" };
    var schema48 = { "type": "string", "enum": ["pending", "applied", "cleared"], "description": "\u8F93\u5165\u8D26\u672C\u4E2D\u7684\u53D7\u7406\u72B6\u6001\u3002" };
    function validate36(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.goalId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.inputId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "inputId" }, message: "must have required property 'inputId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.kind === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.sequence === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.status === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.admittedAtRevision === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "admittedAtRevision" }, message: "must have required property 'admittedAtRevision'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema46.properties, key0)) {
            const err6 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data0 = data.goalId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err7 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.inputId !== void 0) {
          let data1 = data.inputId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err9 = { instancePath: instancePath + "/inputId", schemaPath: "#/properties/inputId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          } else {
            const err10 = { instancePath: instancePath + "/inputId", schemaPath: "#/properties/inputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data2 = data.kind;
          if (typeof data2 !== "string") {
            const err11 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserSessionInputKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          if (!(data2 === "message" || data2 === "steer" || data2 === "interrupt" || data2 === "respond" || data2 === "resume" || data2 === "queue_control")) {
            const err12 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserSessionInputKind/enum", keyword: "enum", params: { allowedValues: schema45.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.sequence !== void 0) {
          let data3 = data.sequence;
          if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
            const err13 = { instancePath: instancePath + "/sequence", schemaPath: "#/properties/sequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
          if (typeof data3 == "number" && isFinite(data3)) {
            if (data3 > 9007199254740991 || isNaN(data3)) {
              const err14 = { instancePath: instancePath + "/sequence", schemaPath: "#/properties/sequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            if (data3 < 1 || isNaN(data3)) {
              const err15 = { instancePath: instancePath + "/sequence", schemaPath: "#/properties/sequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          }
        }
        if (data.status !== void 0) {
          let data4 = data.status;
          if (typeof data4 !== "string") {
            const err16 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/BrowserSessionInputStatus/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
          if (!(data4 === "pending" || data4 === "applied" || data4 === "cleared")) {
            const err17 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/BrowserSessionInputStatus/enum", keyword: "enum", params: { allowedValues: schema48.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.admittedAtRevision !== void 0) {
          let data5 = data.admittedAtRevision;
          if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
            const err18 = { instancePath: instancePath + "/admittedAtRevision", schemaPath: "#/properties/admittedAtRevision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
          if (typeof data5 == "number" && isFinite(data5)) {
            if (data5 > 9007199254740991 || isNaN(data5)) {
              const err19 = { instancePath: instancePath + "/admittedAtRevision", schemaPath: "#/properties/admittedAtRevision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            if (data5 < 0 || isNaN(data5)) {
              const err20 = { instancePath: instancePath + "/admittedAtRevision", schemaPath: "#/properties/admittedAtRevision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
          }
        }
        if (data.targetRunId !== void 0) {
          let data6 = data.targetRunId;
          if (typeof data6 === "string") {
            if (!pattern0.test(data6)) {
              const err21 = { instancePath: instancePath + "/targetRunId", schemaPath: "#/properties/targetRunId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          } else {
            const err22 = { instancePath: instancePath + "/targetRunId", schemaPath: "#/properties/targetRunId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        }
        if (data.appliedRunId !== void 0) {
          let data7 = data.appliedRunId;
          if (typeof data7 === "string") {
            if (!pattern0.test(data7)) {
              const err23 = { instancePath: instancePath + "/appliedRunId", schemaPath: "#/properties/appliedRunId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
          } else {
            const err24 = { instancePath: instancePath + "/appliedRunId", schemaPath: "#/properties/appliedRunId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
        }
        if (data.messageIndex !== void 0) {
          let data8 = data.messageIndex;
          if (!(typeof data8 == "number" && (!(data8 % 1) && !isNaN(data8)) && isFinite(data8))) {
            const err25 = { instancePath: instancePath + "/messageIndex", schemaPath: "#/properties/messageIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
          if (typeof data8 == "number" && isFinite(data8)) {
            if (data8 > 9007199254740991 || isNaN(data8)) {
              const err26 = { instancePath: instancePath + "/messageIndex", schemaPath: "#/properties/messageIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
            if (data8 < 0 || isNaN(data8)) {
              const err27 = { instancePath: instancePath + "/messageIndex", schemaPath: "#/properties/messageIndex/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
          }
        }
      } else {
        const err28 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
      validate36.errors = vErrors;
      return errors === 0;
    }
    function validate35(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.goalId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.inputId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "inputId" }, message: "must have required property 'inputId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.kind === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.ok === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "goalId" || key0 === "inputId" || key0 === "kind" || key0 === "ok" || key0 === "existing" || key0 === "receipt" || key0 === "code")) {
            const err4 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data0 = data.goalId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err5 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
          } else {
            const err6 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.inputId !== void 0) {
          let data1 = data.inputId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err7 = { instancePath: instancePath + "/inputId", schemaPath: "#/properties/inputId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = { instancePath: instancePath + "/inputId", schemaPath: "#/properties/inputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data2 = data.kind;
          if (typeof data2 !== "string") {
            const err9 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserSessionInputKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          if (!(data2 === "message" || data2 === "steer" || data2 === "interrupt" || data2 === "respond" || data2 === "resume" || data2 === "queue_control")) {
            const err10 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserSessionInputKind/enum", keyword: "enum", params: { allowedValues: schema45.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.ok !== void 0) {
          if (typeof data.ok !== "boolean") {
            const err11 = { instancePath: instancePath + "/ok", schemaPath: "#/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.existing !== void 0) {
          if (typeof data.existing !== "boolean") {
            const err12 = { instancePath: instancePath + "/existing", schemaPath: "#/properties/existing/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.receipt !== void 0) {
          if (!validate36(data.receipt, { instancePath: instancePath + "/receipt", parentData: data, parentDataProperty: "receipt", rootData })) {
            vErrors = vErrors === null ? validate36.errors : vErrors.concat(validate36.errors);
            errors = vErrors.length;
          }
        }
        if (data.code !== void 0) {
          let data6 = data.code;
          if (typeof data6 !== "string") {
            const err13 = { instancePath: instancePath + "/code", schemaPath: "#/definitions/BrowserSessionInputErrorCode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
          if (!(data6 === "INVALID_INPUT" || data6 === "INPUT_CONFLICT" || data6 === "INPUT_NOT_FOUND" || data6 === "GOAL_NOT_FOUND" || data6 === "BUSY" || data6 === "STEER_CONFLICT" || data6 === "INTERRUPT_CONFLICT" || data6 === "STALE_REVISION" || data6 === "INTERACTION_MISMATCH" || data6 === "INTERACTION_REQUIRED" || data6 === "QUEUE_PAUSED" || data6 === "RUN_NOT_RESUMABLE" || data6 === "QUEUE_FULL" || data6 === "QUEUE_TEXT_TOO_LARGE" || data6 === "TEXT_TOO_LARGE" || data6 === "QUEUE_NOT_PAUSED" || data6 === "QUEUE_REVISION_MISMATCH" || data6 === "QUEUED_MESSAGE_NOT_FOUND" || data6 === "RUN_NOT_FOUND" || data6 === "RUN_NOT_RUNNING" || data6 === "RUN_CONTROL_UNAVAILABLE" || data6 === "input_admission_failed" || data6 === "session_unavailable")) {
            const err14 = { instancePath: instancePath + "/code", schemaPath: "#/definitions/BrowserSessionInputErrorCode/enum", keyword: "enum", params: { allowedValues: schema49.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
      } else {
        const err15 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
      validate35.errors = vErrors;
      return errors === 0;
    }
    var schema51 = { "type": "object", "properties": { "messageId": { "type": "string", "pattern": "\\S" }, "role": { "type": "string", "enum": ["user", "assistant"] }, "runId": { "type": "string", "pattern": "\\S" }, "position": { "$ref": "#/definitions/BrowserMessagePosition" }, "purpose": { "type": "string", "enum": ["process", "answer", "notice"] }, "commitRevision": { "type": "integer", "maximum": 9007199254740991 }, "previewId": { "type": "string", "pattern": "\\S" } }, "required": ["messageId", "role", "runId", "position", "commitRevision"], "additionalProperties": false, "description": "\u5DF2\u63D0\u4EA4\u6D88\u606F\u7684\u5B9E\u65F6\u63A8\u9001\u6458\u8981\u3002" };
    function validate39(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.messageId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "messageId" }, message: "must have required property 'messageId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.role === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.position === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "position" }, message: "must have required property 'position'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.commitRevision === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "commitRevision" }, message: "must have required property 'commitRevision'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "messageId" || key0 === "role" || key0 === "runId" || key0 === "position" || key0 === "purpose" || key0 === "commitRevision" || key0 === "previewId")) {
            const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.messageId !== void 0) {
          let data0 = data.messageId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err6 = { instancePath: instancePath + "/messageId", schemaPath: "#/properties/messageId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          } else {
            const err7 = { instancePath: instancePath + "/messageId", schemaPath: "#/properties/messageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.role !== void 0) {
          let data1 = data.role;
          if (typeof data1 !== "string") {
            const err8 = { instancePath: instancePath + "/role", schemaPath: "#/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (!(data1 === "user" || data1 === "assistant")) {
            const err9 = { instancePath: instancePath + "/role", schemaPath: "#/properties/role/enum", keyword: "enum", params: { allowedValues: schema51.properties.role.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data2 = data.runId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err10 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          } else {
            const err11 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.position !== void 0) {
          let data3 = data.position;
          if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
            if (data3.afterSequence === void 0) {
              const err12 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserMessagePosition/required", keyword: "required", params: { missingProperty: "afterSequence" }, message: "must have required property 'afterSequence'" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            if (data3.order === void 0) {
              const err13 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserMessagePosition/required", keyword: "required", params: { missingProperty: "order" }, message: "must have required property 'order'" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            for (const key1 in data3) {
              if (!(key1 === "afterSequence" || key1 === "order")) {
                const err14 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserMessagePosition/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
            }
            if (data3.afterSequence !== void 0) {
              let data4 = data3.afterSequence;
              if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)) && isFinite(data4))) {
                const err15 = { instancePath: instancePath + "/position/afterSequence", schemaPath: "#/definitions/BrowserMessagePosition/properties/afterSequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
              if (typeof data4 == "number" && isFinite(data4)) {
                if (data4 > 9007199254740991 || isNaN(data4)) {
                  const err16 = { instancePath: instancePath + "/position/afterSequence", schemaPath: "#/definitions/BrowserMessagePosition/properties/afterSequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err16];
                  } else {
                    vErrors.push(err16);
                  }
                  errors++;
                }
                if (data4 < 0 || isNaN(data4)) {
                  const err17 = { instancePath: instancePath + "/position/afterSequence", schemaPath: "#/definitions/BrowserMessagePosition/properties/afterSequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err17];
                  } else {
                    vErrors.push(err17);
                  }
                  errors++;
                }
              }
            }
            if (data3.order !== void 0) {
              let data5 = data3.order;
              if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
                const err18 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/BrowserMessagePosition/properties/order/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
              if (typeof data5 == "number" && isFinite(data5)) {
                if (data5 > 9007199254740991 || isNaN(data5)) {
                  const err19 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/BrowserMessagePosition/properties/order/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err19];
                  } else {
                    vErrors.push(err19);
                  }
                  errors++;
                }
                if (data5 < 0 || isNaN(data5)) {
                  const err20 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/BrowserMessagePosition/properties/order/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err20];
                  } else {
                    vErrors.push(err20);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err21 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserMessagePosition/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
        }
        if (data.purpose !== void 0) {
          let data6 = data.purpose;
          if (typeof data6 !== "string") {
            const err22 = { instancePath: instancePath + "/purpose", schemaPath: "#/properties/purpose/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
          if (!(data6 === "process" || data6 === "answer" || data6 === "notice")) {
            const err23 = { instancePath: instancePath + "/purpose", schemaPath: "#/properties/purpose/enum", keyword: "enum", params: { allowedValues: schema51.properties.purpose.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
        if (data.commitRevision !== void 0) {
          let data7 = data.commitRevision;
          if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
            const err24 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/properties/commitRevision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
          if (typeof data7 == "number" && isFinite(data7)) {
            if (data7 > 9007199254740991 || isNaN(data7)) {
              const err25 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/properties/commitRevision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
          }
        }
        if (data.previewId !== void 0) {
          let data8 = data.previewId;
          if (typeof data8 === "string") {
            if (!pattern0.test(data8)) {
              const err26 = { instancePath: instancePath + "/previewId", schemaPath: "#/properties/previewId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
          } else {
            const err27 = { instancePath: instancePath + "/previewId", schemaPath: "#/properties/previewId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err27];
            } else {
              vErrors.push(err27);
            }
            errors++;
          }
        }
      } else {
        const err28 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
      validate39.errors = vErrors;
      return errors === 0;
    }
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.type === void 0) {
          const err0 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.goalId === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.state === void 0) {
          const err2 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "type" || key0 === "goalId" || key0 === "state" || key0 === "snapshot")) {
            const err3 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.type !== void 0) {
          let data0 = data.type;
          if (typeof data0 !== "string") {
            const err4 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/0/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if ("state_sync" !== data0) {
            const err5 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/0/properties/type/const", keyword: "const", params: { allowedValue: "state_sync" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data1 = data.goalId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err6 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/0/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          } else {
            const err7 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/0/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.state !== void 0) {
          if (!validate12(data.state, { instancePath: instancePath + "/state", parentData: data, parentDataProperty: "state", rootData })) {
            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
            errors = vErrors.length;
          }
        }
        if (data.snapshot !== void 0) {
          if (!validate18(data.snapshot, { instancePath: instancePath + "/snapshot", parentData: data, parentDataProperty: "snapshot", rootData })) {
            vErrors = vErrors === null ? validate18.errors : vErrors.concat(validate18.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err8 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs10 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.type === void 0) {
            const err9 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          if (data.goalId === void 0) {
            const err10 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
          if (data.outcome === void 0) {
            const err11 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "outcome" }, message: "must have required property 'outcome'" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "type" || key1 === "goalId" || key1 === "outcome")) {
              const err12 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          }
          if (data.type !== void 0) {
            let data4 = data.type;
            if (typeof data4 !== "string") {
              const err13 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/1/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            if ("input_result" !== data4) {
              const err14 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/1/properties/type/const", keyword: "const", params: { allowedValue: "input_result" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          }
          if (data.goalId !== void 0) {
            let data5 = data.goalId;
            if (typeof data5 === "string") {
              if (!pattern0.test(data5)) {
                const err15 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/1/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
            } else {
              const err16 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/1/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
          if (data.outcome !== void 0) {
            if (!validate35(data.outcome, { instancePath: instancePath + "/outcome", parentData: data, parentDataProperty: "outcome", rootData })) {
              vErrors = vErrors === null ? validate35.errors : vErrors.concat(validate35.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err17 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
        var _valid0 = _errs10 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs18 = errors;
          if (data && typeof data == "object" && !Array.isArray(data)) {
            if (data.type === void 0) {
              const err18 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            if (data.goalId === void 0) {
              const err19 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            if (data.runId === void 0) {
              const err20 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
            if (data.activity === void 0) {
              const err21 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "activity" }, message: "must have required property 'activity'" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
            for (const key2 in data) {
              if (!(key2 === "type" || key2 === "goalId" || key2 === "runId" || key2 === "activity")) {
                const err22 = { instancePath, schemaPath: "#/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
            }
            if (data.type !== void 0) {
              let data7 = data.type;
              if (typeof data7 !== "string") {
                const err23 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/2/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
              if ("activity" !== data7) {
                const err24 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/2/properties/type/const", keyword: "const", params: { allowedValue: "activity" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err24];
                } else {
                  vErrors.push(err24);
                }
                errors++;
              }
            }
            if (data.goalId !== void 0) {
              let data8 = data.goalId;
              if (typeof data8 === "string") {
                if (!pattern0.test(data8)) {
                  const err25 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/2/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err25];
                  } else {
                    vErrors.push(err25);
                  }
                  errors++;
                }
              } else {
                const err26 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/2/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
            }
            if (data.runId !== void 0) {
              let data9 = data.runId;
              if (typeof data9 === "string") {
                if (!pattern0.test(data9)) {
                  const err27 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/2/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err27];
                  } else {
                    vErrors.push(err27);
                  }
                  errors++;
                }
              } else {
                const err28 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/2/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err28];
                } else {
                  vErrors.push(err28);
                }
                errors++;
              }
            }
            if (data.activity !== void 0) {
              let data10 = data.activity;
              const _errs29 = errors;
              let valid5 = false;
              const _errs30 = errors;
              if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
                if (data10.kind === void 0) {
                  const err29 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err29];
                  } else {
                    vErrors.push(err29);
                  }
                  errors++;
                }
                if (data10.text === void 0) {
                  const err30 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/required", keyword: "required", params: { missingProperty: "text" }, message: "must have required property 'text'" };
                  if (vErrors === null) {
                    vErrors = [err30];
                  } else {
                    vErrors.push(err30);
                  }
                  errors++;
                }
                if (data10.truncated === void 0) {
                  const err31 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/required", keyword: "required", params: { missingProperty: "truncated" }, message: "must have required property 'truncated'" };
                  if (vErrors === null) {
                    vErrors = [err31];
                  } else {
                    vErrors.push(err31);
                  }
                  errors++;
                }
                if (data10.sourceEventId === void 0) {
                  const err32 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/required", keyword: "required", params: { missingProperty: "sourceEventId" }, message: "must have required property 'sourceEventId'" };
                  if (vErrors === null) {
                    vErrors = [err32];
                  } else {
                    vErrors.push(err32);
                  }
                  errors++;
                }
                if (data10.sourceCursor === void 0) {
                  const err33 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/required", keyword: "required", params: { missingProperty: "sourceCursor" }, message: "must have required property 'sourceCursor'" };
                  if (vErrors === null) {
                    vErrors = [err33];
                  } else {
                    vErrors.push(err33);
                  }
                  errors++;
                }
                for (const key3 in data10) {
                  if (!(key3 === "kind" || key3 === "text" || key3 === "truncated" || key3 === "sourceEventId" || key3 === "sourceCursor")) {
                    const err34 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err34];
                    } else {
                      vErrors.push(err34);
                    }
                    errors++;
                  }
                }
                if (data10.kind !== void 0) {
                  let data11 = data10.kind;
                  if (typeof data11 !== "string") {
                    const err35 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err35];
                    } else {
                      vErrors.push(err35);
                    }
                    errors++;
                  }
                  if ("assistant_text_delta" !== data11) {
                    const err36 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "assistant_text_delta" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err36];
                    } else {
                      vErrors.push(err36);
                    }
                    errors++;
                  }
                }
                if (data10.text !== void 0) {
                  if (typeof data10.text !== "string") {
                    const err37 = { instancePath: instancePath + "/activity/text", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err37];
                    } else {
                      vErrors.push(err37);
                    }
                    errors++;
                  }
                }
                if (data10.truncated !== void 0) {
                  if (typeof data10.truncated !== "boolean") {
                    const err38 = { instancePath: instancePath + "/activity/truncated", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/properties/truncated/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                    if (vErrors === null) {
                      vErrors = [err38];
                    } else {
                      vErrors.push(err38);
                    }
                    errors++;
                  }
                }
                if (data10.sourceEventId !== void 0) {
                  let data14 = data10.sourceEventId;
                  if (typeof data14 === "string") {
                    if (!pattern0.test(data14)) {
                      const err39 = { instancePath: instancePath + "/activity/sourceEventId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/properties/sourceEventId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err39];
                      } else {
                        vErrors.push(err39);
                      }
                      errors++;
                    }
                  } else {
                    const err40 = { instancePath: instancePath + "/activity/sourceEventId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/properties/sourceEventId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err40];
                    } else {
                      vErrors.push(err40);
                    }
                    errors++;
                  }
                }
                if (data10.sourceCursor !== void 0) {
                  let data15 = data10.sourceCursor;
                  if (!(typeof data15 == "number" && (!(data15 % 1) && !isNaN(data15)) && isFinite(data15))) {
                    const err41 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/properties/sourceCursor/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err41];
                    } else {
                      vErrors.push(err41);
                    }
                    errors++;
                  }
                  if (typeof data15 == "number" && isFinite(data15)) {
                    if (data15 > 9007199254740991 || isNaN(data15)) {
                      const err42 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/properties/sourceCursor/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err42];
                      } else {
                        vErrors.push(err42);
                      }
                      errors++;
                    }
                    if (data15 < 1 || isNaN(data15)) {
                      const err43 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/properties/sourceCursor/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                      if (vErrors === null) {
                        vErrors = [err43];
                      } else {
                        vErrors.push(err43);
                      }
                      errors++;
                    }
                  }
                }
              } else {
                const err44 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err44];
                } else {
                  vErrors.push(err44);
                }
                errors++;
              }
              var _valid1 = _errs30 === errors;
              valid5 = valid5 || _valid1;
              if (!valid5) {
                const _errs43 = errors;
                if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
                  if (data10.kind === void 0) {
                    const err45 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                    if (vErrors === null) {
                      vErrors = [err45];
                    } else {
                      vErrors.push(err45);
                    }
                    errors++;
                  }
                  for (const key4 in data10) {
                    if (!(key4 === "kind" || key4 === "stage" || key4 === "modelCallId" || key4 === "executionUnitId" || key4 === "occurredAt")) {
                      const err46 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err46];
                      } else {
                        vErrors.push(err46);
                      }
                      errors++;
                    }
                  }
                  if (data10.kind !== void 0) {
                    let data16 = data10.kind;
                    if (typeof data16 !== "string") {
                      const err47 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err47];
                      } else {
                        vErrors.push(err47);
                      }
                      errors++;
                    }
                    if ("model_started" !== data16) {
                      const err48 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "model_started" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err48];
                      } else {
                        vErrors.push(err48);
                      }
                      errors++;
                    }
                  }
                  if (data10.stage !== void 0) {
                    let data17 = data10.stage;
                    if (typeof data17 !== "string") {
                      const err49 = { instancePath: instancePath + "/activity/stage", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/1/properties/stage/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err49];
                      } else {
                        vErrors.push(err49);
                      }
                      errors++;
                    }
                    if (!(data17 === "think" || data17 === "decide" || data17 === "completion_review")) {
                      const err50 = { instancePath: instancePath + "/activity/stage", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/1/properties/stage/enum", keyword: "enum", params: { allowedValues: schema50.anyOf[1].properties.stage.enum }, message: "must be equal to one of the allowed values" };
                      if (vErrors === null) {
                        vErrors = [err50];
                      } else {
                        vErrors.push(err50);
                      }
                      errors++;
                    }
                  }
                  if (data10.modelCallId !== void 0) {
                    let data18 = data10.modelCallId;
                    if (typeof data18 === "string") {
                      if (!pattern0.test(data18)) {
                        const err51 = { instancePath: instancePath + "/activity/modelCallId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/1/properties/modelCallId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                        if (vErrors === null) {
                          vErrors = [err51];
                        } else {
                          vErrors.push(err51);
                        }
                        errors++;
                      }
                    } else {
                      const err52 = { instancePath: instancePath + "/activity/modelCallId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/1/properties/modelCallId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err52];
                      } else {
                        vErrors.push(err52);
                      }
                      errors++;
                    }
                  }
                  if (data10.executionUnitId !== void 0) {
                    let data19 = data10.executionUnitId;
                    if (typeof data19 === "string") {
                      if (!pattern0.test(data19)) {
                        const err53 = { instancePath: instancePath + "/activity/executionUnitId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/1/properties/executionUnitId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                        if (vErrors === null) {
                          vErrors = [err53];
                        } else {
                          vErrors.push(err53);
                        }
                        errors++;
                      }
                    } else {
                      const err54 = { instancePath: instancePath + "/activity/executionUnitId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/1/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err54];
                      } else {
                        vErrors.push(err54);
                      }
                      errors++;
                    }
                  }
                  if (data10.occurredAt !== void 0) {
                    if (typeof data10.occurredAt !== "string") {
                      const err55 = { instancePath: instancePath + "/activity/occurredAt", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/1/properties/occurredAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err55];
                      } else {
                        vErrors.push(err55);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err56 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err56];
                  } else {
                    vErrors.push(err56);
                  }
                  errors++;
                }
                var _valid1 = _errs43 === errors;
                valid5 = valid5 || _valid1;
                if (!valid5) {
                  const _errs56 = errors;
                  if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
                    if (data10.kind === void 0) {
                      const err57 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/2/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                      if (vErrors === null) {
                        vErrors = [err57];
                      } else {
                        vErrors.push(err57);
                      }
                      errors++;
                    }
                    for (const key5 in data10) {
                      if (!(key5 === "kind")) {
                        const err58 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err58];
                        } else {
                          vErrors.push(err58);
                        }
                        errors++;
                      }
                    }
                    if (data10.kind !== void 0) {
                      let data21 = data10.kind;
                      if (typeof data21 !== "string") {
                        const err59 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/2/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err59];
                        } else {
                          vErrors.push(err59);
                        }
                        errors++;
                      }
                      if ("model_completed" !== data21) {
                        const err60 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/2/properties/kind/const", keyword: "const", params: { allowedValue: "model_completed" }, message: "must be equal to constant" };
                        if (vErrors === null) {
                          vErrors = [err60];
                        } else {
                          vErrors.push(err60);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err61 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err61];
                    } else {
                      vErrors.push(err61);
                    }
                    errors++;
                  }
                  var _valid1 = _errs56 === errors;
                  valid5 = valid5 || _valid1;
                  if (!valid5) {
                    const _errs61 = errors;
                    if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
                      if (data10.kind === void 0) {
                        const err62 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/3/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                        if (vErrors === null) {
                          vErrors = [err62];
                        } else {
                          vErrors.push(err62);
                        }
                        errors++;
                      }
                      for (const key6 in data10) {
                        if (!(key6 === "kind")) {
                          const err63 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
                          if (vErrors === null) {
                            vErrors = [err63];
                          } else {
                            vErrors.push(err63);
                          }
                          errors++;
                        }
                      }
                      if (data10.kind !== void 0) {
                        let data22 = data10.kind;
                        if (typeof data22 !== "string") {
                          const err64 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/3/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err64];
                          } else {
                            vErrors.push(err64);
                          }
                          errors++;
                        }
                        if ("step_started" !== data22) {
                          const err65 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/3/properties/kind/const", keyword: "const", params: { allowedValue: "step_started" }, message: "must be equal to constant" };
                          if (vErrors === null) {
                            vErrors = [err65];
                          } else {
                            vErrors.push(err65);
                          }
                          errors++;
                        }
                      }
                    } else {
                      const err66 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                      if (vErrors === null) {
                        vErrors = [err66];
                      } else {
                        vErrors.push(err66);
                      }
                      errors++;
                    }
                    var _valid1 = _errs61 === errors;
                    valid5 = valid5 || _valid1;
                    if (!valid5) {
                      const _errs66 = errors;
                      if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
                        if (data10.kind === void 0) {
                          const err67 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                          if (vErrors === null) {
                            vErrors = [err67];
                          } else {
                            vErrors.push(err67);
                          }
                          errors++;
                        }
                        if (data10.sourceEventId === void 0) {
                          const err68 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/required", keyword: "required", params: { missingProperty: "sourceEventId" }, message: "must have required property 'sourceEventId'" };
                          if (vErrors === null) {
                            vErrors = [err68];
                          } else {
                            vErrors.push(err68);
                          }
                          errors++;
                        }
                        if (data10.sourceCursor === void 0) {
                          const err69 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/required", keyword: "required", params: { missingProperty: "sourceCursor" }, message: "must have required property 'sourceCursor'" };
                          if (vErrors === null) {
                            vErrors = [err69];
                          } else {
                            vErrors.push(err69);
                          }
                          errors++;
                        }
                        if (data10.actionId === void 0) {
                          const err70 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                          if (vErrors === null) {
                            vErrors = [err70];
                          } else {
                            vErrors.push(err70);
                          }
                          errors++;
                        }
                        if (data10.executionUnitId === void 0) {
                          const err71 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/required", keyword: "required", params: { missingProperty: "executionUnitId" }, message: "must have required property 'executionUnitId'" };
                          if (vErrors === null) {
                            vErrors = [err71];
                          } else {
                            vErrors.push(err71);
                          }
                          errors++;
                        }
                        if (data10.toolId === void 0) {
                          const err72 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/required", keyword: "required", params: { missingProperty: "toolId" }, message: "must have required property 'toolId'" };
                          if (vErrors === null) {
                            vErrors = [err72];
                          } else {
                            vErrors.push(err72);
                          }
                          errors++;
                        }
                        for (const key7 in data10) {
                          if (!(key7 === "kind" || key7 === "sourceEventId" || key7 === "sourceCursor" || key7 === "actionId" || key7 === "executionUnitId" || key7 === "toolId" || key7 === "inputSummary")) {
                            const err73 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key7 }, message: "must NOT have additional properties" };
                            if (vErrors === null) {
                              vErrors = [err73];
                            } else {
                              vErrors.push(err73);
                            }
                            errors++;
                          }
                        }
                        if (data10.kind !== void 0) {
                          let data23 = data10.kind;
                          if (typeof data23 !== "string") {
                            const err74 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err74];
                            } else {
                              vErrors.push(err74);
                            }
                            errors++;
                          }
                          if ("tool_started" !== data23) {
                            const err75 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/properties/kind/const", keyword: "const", params: { allowedValue: "tool_started" }, message: "must be equal to constant" };
                            if (vErrors === null) {
                              vErrors = [err75];
                            } else {
                              vErrors.push(err75);
                            }
                            errors++;
                          }
                        }
                        if (data10.sourceEventId !== void 0) {
                          let data24 = data10.sourceEventId;
                          if (typeof data24 === "string") {
                            if (!pattern0.test(data24)) {
                              const err76 = { instancePath: instancePath + "/activity/sourceEventId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/properties/sourceEventId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                              if (vErrors === null) {
                                vErrors = [err76];
                              } else {
                                vErrors.push(err76);
                              }
                              errors++;
                            }
                          } else {
                            const err77 = { instancePath: instancePath + "/activity/sourceEventId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/properties/sourceEventId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err77];
                            } else {
                              vErrors.push(err77);
                            }
                            errors++;
                          }
                        }
                        if (data10.sourceCursor !== void 0) {
                          let data25 = data10.sourceCursor;
                          if (!(typeof data25 == "number" && (!(data25 % 1) && !isNaN(data25)) && isFinite(data25))) {
                            const err78 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/properties/sourceCursor/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                            if (vErrors === null) {
                              vErrors = [err78];
                            } else {
                              vErrors.push(err78);
                            }
                            errors++;
                          }
                          if (typeof data25 == "number" && isFinite(data25)) {
                            if (data25 > 9007199254740991 || isNaN(data25)) {
                              const err79 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/properties/sourceCursor/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                              if (vErrors === null) {
                                vErrors = [err79];
                              } else {
                                vErrors.push(err79);
                              }
                              errors++;
                            }
                            if (data25 < 1 || isNaN(data25)) {
                              const err80 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/properties/sourceCursor/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                              if (vErrors === null) {
                                vErrors = [err80];
                              } else {
                                vErrors.push(err80);
                              }
                              errors++;
                            }
                          }
                        }
                        if (data10.actionId !== void 0) {
                          let data26 = data10.actionId;
                          if (typeof data26 === "string") {
                            if (!pattern0.test(data26)) {
                              const err81 = { instancePath: instancePath + "/activity/actionId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                              if (vErrors === null) {
                                vErrors = [err81];
                              } else {
                                vErrors.push(err81);
                              }
                              errors++;
                            }
                          } else {
                            const err82 = { instancePath: instancePath + "/activity/actionId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err82];
                            } else {
                              vErrors.push(err82);
                            }
                            errors++;
                          }
                        }
                        if (data10.executionUnitId !== void 0) {
                          let data27 = data10.executionUnitId;
                          if (typeof data27 === "string") {
                            if (!pattern0.test(data27)) {
                              const err83 = { instancePath: instancePath + "/activity/executionUnitId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/properties/executionUnitId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                              if (vErrors === null) {
                                vErrors = [err83];
                              } else {
                                vErrors.push(err83);
                              }
                              errors++;
                            }
                          } else {
                            const err84 = { instancePath: instancePath + "/activity/executionUnitId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err84];
                            } else {
                              vErrors.push(err84);
                            }
                            errors++;
                          }
                        }
                        if (data10.toolId !== void 0) {
                          let data28 = data10.toolId;
                          if (typeof data28 === "string") {
                            if (!pattern0.test(data28)) {
                              const err85 = { instancePath: instancePath + "/activity/toolId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/properties/toolId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                              if (vErrors === null) {
                                vErrors = [err85];
                              } else {
                                vErrors.push(err85);
                              }
                              errors++;
                            }
                          } else {
                            const err86 = { instancePath: instancePath + "/activity/toolId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err86];
                            } else {
                              vErrors.push(err86);
                            }
                            errors++;
                          }
                        }
                        if (data10.inputSummary !== void 0) {
                          if (typeof data10.inputSummary !== "string") {
                            const err87 = { instancePath: instancePath + "/activity/inputSummary", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/properties/inputSummary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err87];
                            } else {
                              vErrors.push(err87);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err88 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                        if (vErrors === null) {
                          vErrors = [err88];
                        } else {
                          vErrors.push(err88);
                        }
                        errors++;
                      }
                      var _valid1 = _errs66 === errors;
                      valid5 = valid5 || _valid1;
                      if (!valid5) {
                        const _errs83 = errors;
                        if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
                          if (data10.kind === void 0) {
                            const err89 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                            if (vErrors === null) {
                              vErrors = [err89];
                            } else {
                              vErrors.push(err89);
                            }
                            errors++;
                          }
                          if (data10.sourceEventId === void 0) {
                            const err90 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/required", keyword: "required", params: { missingProperty: "sourceEventId" }, message: "must have required property 'sourceEventId'" };
                            if (vErrors === null) {
                              vErrors = [err90];
                            } else {
                              vErrors.push(err90);
                            }
                            errors++;
                          }
                          if (data10.sourceCursor === void 0) {
                            const err91 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/required", keyword: "required", params: { missingProperty: "sourceCursor" }, message: "must have required property 'sourceCursor'" };
                            if (vErrors === null) {
                              vErrors = [err91];
                            } else {
                              vErrors.push(err91);
                            }
                            errors++;
                          }
                          if (data10.actionId === void 0) {
                            const err92 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                            if (vErrors === null) {
                              vErrors = [err92];
                            } else {
                              vErrors.push(err92);
                            }
                            errors++;
                          }
                          if (data10.toolId === void 0) {
                            const err93 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/required", keyword: "required", params: { missingProperty: "toolId" }, message: "must have required property 'toolId'" };
                            if (vErrors === null) {
                              vErrors = [err93];
                            } else {
                              vErrors.push(err93);
                            }
                            errors++;
                          }
                          if (data10.outcome === void 0) {
                            const err94 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/required", keyword: "required", params: { missingProperty: "outcome" }, message: "must have required property 'outcome'" };
                            if (vErrors === null) {
                              vErrors = [err94];
                            } else {
                              vErrors.push(err94);
                            }
                            errors++;
                          }
                          for (const key8 in data10) {
                            if (!(key8 === "kind" || key8 === "sourceEventId" || key8 === "sourceCursor" || key8 === "actionId" || key8 === "toolId" || key8 === "outcome" || key8 === "summary")) {
                              const err95 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key8 }, message: "must NOT have additional properties" };
                              if (vErrors === null) {
                                vErrors = [err95];
                              } else {
                                vErrors.push(err95);
                              }
                              errors++;
                            }
                          }
                          if (data10.kind !== void 0) {
                            let data30 = data10.kind;
                            if (typeof data30 !== "string") {
                              const err96 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err96];
                              } else {
                                vErrors.push(err96);
                              }
                              errors++;
                            }
                            if ("tool_finished" !== data30) {
                              const err97 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/kind/const", keyword: "const", params: { allowedValue: "tool_finished" }, message: "must be equal to constant" };
                              if (vErrors === null) {
                                vErrors = [err97];
                              } else {
                                vErrors.push(err97);
                              }
                              errors++;
                            }
                          }
                          if (data10.sourceEventId !== void 0) {
                            let data31 = data10.sourceEventId;
                            if (typeof data31 === "string") {
                              if (!pattern0.test(data31)) {
                                const err98 = { instancePath: instancePath + "/activity/sourceEventId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/sourceEventId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                if (vErrors === null) {
                                  vErrors = [err98];
                                } else {
                                  vErrors.push(err98);
                                }
                                errors++;
                              }
                            } else {
                              const err99 = { instancePath: instancePath + "/activity/sourceEventId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/sourceEventId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err99];
                              } else {
                                vErrors.push(err99);
                              }
                              errors++;
                            }
                          }
                          if (data10.sourceCursor !== void 0) {
                            let data32 = data10.sourceCursor;
                            if (!(typeof data32 == "number" && (!(data32 % 1) && !isNaN(data32)) && isFinite(data32))) {
                              const err100 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/sourceCursor/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                              if (vErrors === null) {
                                vErrors = [err100];
                              } else {
                                vErrors.push(err100);
                              }
                              errors++;
                            }
                            if (typeof data32 == "number" && isFinite(data32)) {
                              if (data32 > 9007199254740991 || isNaN(data32)) {
                                const err101 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/sourceCursor/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                                if (vErrors === null) {
                                  vErrors = [err101];
                                } else {
                                  vErrors.push(err101);
                                }
                                errors++;
                              }
                              if (data32 < 1 || isNaN(data32)) {
                                const err102 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/sourceCursor/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                                if (vErrors === null) {
                                  vErrors = [err102];
                                } else {
                                  vErrors.push(err102);
                                }
                                errors++;
                              }
                            }
                          }
                          if (data10.actionId !== void 0) {
                            let data33 = data10.actionId;
                            if (typeof data33 === "string") {
                              if (!pattern0.test(data33)) {
                                const err103 = { instancePath: instancePath + "/activity/actionId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                if (vErrors === null) {
                                  vErrors = [err103];
                                } else {
                                  vErrors.push(err103);
                                }
                                errors++;
                              }
                            } else {
                              const err104 = { instancePath: instancePath + "/activity/actionId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err104];
                              } else {
                                vErrors.push(err104);
                              }
                              errors++;
                            }
                          }
                          if (data10.toolId !== void 0) {
                            let data34 = data10.toolId;
                            if (typeof data34 === "string") {
                              if (!pattern0.test(data34)) {
                                const err105 = { instancePath: instancePath + "/activity/toolId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/toolId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                if (vErrors === null) {
                                  vErrors = [err105];
                                } else {
                                  vErrors.push(err105);
                                }
                                errors++;
                              }
                            } else {
                              const err106 = { instancePath: instancePath + "/activity/toolId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err106];
                              } else {
                                vErrors.push(err106);
                              }
                              errors++;
                            }
                          }
                          if (data10.outcome !== void 0) {
                            let data35 = data10.outcome;
                            if (typeof data35 !== "string") {
                              const err107 = { instancePath: instancePath + "/activity/outcome", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/outcome/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err107];
                              } else {
                                vErrors.push(err107);
                              }
                              errors++;
                            }
                            if (!(data35 === "success" || data35 === "failure")) {
                              const err108 = { instancePath: instancePath + "/activity/outcome", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/outcome/enum", keyword: "enum", params: { allowedValues: schema50.anyOf[5].properties.outcome.enum }, message: "must be equal to one of the allowed values" };
                              if (vErrors === null) {
                                vErrors = [err108];
                              } else {
                                vErrors.push(err108);
                              }
                              errors++;
                            }
                          }
                          if (data10.summary !== void 0) {
                            if (typeof data10.summary !== "string") {
                              const err109 = { instancePath: instancePath + "/activity/summary", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err109];
                              } else {
                                vErrors.push(err109);
                              }
                              errors++;
                            }
                          }
                        } else {
                          const err110 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                          if (vErrors === null) {
                            vErrors = [err110];
                          } else {
                            vErrors.push(err110);
                          }
                          errors++;
                        }
                        var _valid1 = _errs83 === errors;
                        valid5 = valid5 || _valid1;
                        if (!valid5) {
                          const _errs100 = errors;
                          if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
                            if (data10.kind === void 0) {
                              const err111 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                              if (vErrors === null) {
                                vErrors = [err111];
                              } else {
                                vErrors.push(err111);
                              }
                              errors++;
                            }
                            if (data10.sourceEventId === void 0) {
                              const err112 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/required", keyword: "required", params: { missingProperty: "sourceEventId" }, message: "must have required property 'sourceEventId'" };
                              if (vErrors === null) {
                                vErrors = [err112];
                              } else {
                                vErrors.push(err112);
                              }
                              errors++;
                            }
                            if (data10.sourceCursor === void 0) {
                              const err113 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/required", keyword: "required", params: { missingProperty: "sourceCursor" }, message: "must have required property 'sourceCursor'" };
                              if (vErrors === null) {
                                vErrors = [err113];
                              } else {
                                vErrors.push(err113);
                              }
                              errors++;
                            }
                            if (data10.actionId === void 0) {
                              const err114 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                              if (vErrors === null) {
                                vErrors = [err114];
                              } else {
                                vErrors.push(err114);
                              }
                              errors++;
                            }
                            if (data10.attempt === void 0) {
                              const err115 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/required", keyword: "required", params: { missingProperty: "attempt" }, message: "must have required property 'attempt'" };
                              if (vErrors === null) {
                                vErrors = [err115];
                              } else {
                                vErrors.push(err115);
                              }
                              errors++;
                            }
                            for (const key9 in data10) {
                              if (!(key9 === "kind" || key9 === "sourceEventId" || key9 === "sourceCursor" || key9 === "actionId" || key9 === "attempt")) {
                                const err116 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key9 }, message: "must NOT have additional properties" };
                                if (vErrors === null) {
                                  vErrors = [err116];
                                } else {
                                  vErrors.push(err116);
                                }
                                errors++;
                              }
                            }
                            if (data10.kind !== void 0) {
                              let data37 = data10.kind;
                              if (typeof data37 !== "string") {
                                const err117 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err117];
                                } else {
                                  vErrors.push(err117);
                                }
                                errors++;
                              }
                              if ("tool_attempt_started" !== data37) {
                                const err118 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/properties/kind/const", keyword: "const", params: { allowedValue: "tool_attempt_started" }, message: "must be equal to constant" };
                                if (vErrors === null) {
                                  vErrors = [err118];
                                } else {
                                  vErrors.push(err118);
                                }
                                errors++;
                              }
                            }
                            if (data10.sourceEventId !== void 0) {
                              let data38 = data10.sourceEventId;
                              if (typeof data38 === "string") {
                                if (!pattern0.test(data38)) {
                                  const err119 = { instancePath: instancePath + "/activity/sourceEventId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/properties/sourceEventId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                  if (vErrors === null) {
                                    vErrors = [err119];
                                  } else {
                                    vErrors.push(err119);
                                  }
                                  errors++;
                                }
                              } else {
                                const err120 = { instancePath: instancePath + "/activity/sourceEventId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/properties/sourceEventId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err120];
                                } else {
                                  vErrors.push(err120);
                                }
                                errors++;
                              }
                            }
                            if (data10.sourceCursor !== void 0) {
                              let data39 = data10.sourceCursor;
                              if (!(typeof data39 == "number" && (!(data39 % 1) && !isNaN(data39)) && isFinite(data39))) {
                                const err121 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/properties/sourceCursor/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                if (vErrors === null) {
                                  vErrors = [err121];
                                } else {
                                  vErrors.push(err121);
                                }
                                errors++;
                              }
                              if (typeof data39 == "number" && isFinite(data39)) {
                                if (data39 > 9007199254740991 || isNaN(data39)) {
                                  const err122 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/properties/sourceCursor/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                                  if (vErrors === null) {
                                    vErrors = [err122];
                                  } else {
                                    vErrors.push(err122);
                                  }
                                  errors++;
                                }
                                if (data39 < 1 || isNaN(data39)) {
                                  const err123 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/properties/sourceCursor/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                                  if (vErrors === null) {
                                    vErrors = [err123];
                                  } else {
                                    vErrors.push(err123);
                                  }
                                  errors++;
                                }
                              }
                            }
                            if (data10.actionId !== void 0) {
                              let data40 = data10.actionId;
                              if (typeof data40 === "string") {
                                if (!pattern0.test(data40)) {
                                  const err124 = { instancePath: instancePath + "/activity/actionId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                  if (vErrors === null) {
                                    vErrors = [err124];
                                  } else {
                                    vErrors.push(err124);
                                  }
                                  errors++;
                                }
                              } else {
                                const err125 = { instancePath: instancePath + "/activity/actionId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err125];
                                } else {
                                  vErrors.push(err125);
                                }
                                errors++;
                              }
                            }
                            if (data10.attempt !== void 0) {
                              let data41 = data10.attempt;
                              if (!(typeof data41 == "number" && (!(data41 % 1) && !isNaN(data41)) && isFinite(data41))) {
                                const err126 = { instancePath: instancePath + "/activity/attempt", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/properties/attempt/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                if (vErrors === null) {
                                  vErrors = [err126];
                                } else {
                                  vErrors.push(err126);
                                }
                                errors++;
                              }
                              if (typeof data41 == "number" && isFinite(data41)) {
                                if (data41 > 9007199254740991 || isNaN(data41)) {
                                  const err127 = { instancePath: instancePath + "/activity/attempt", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/properties/attempt/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                                  if (vErrors === null) {
                                    vErrors = [err127];
                                  } else {
                                    vErrors.push(err127);
                                  }
                                  errors++;
                                }
                                if (data41 < 1 || isNaN(data41)) {
                                  const err128 = { instancePath: instancePath + "/activity/attempt", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/properties/attempt/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                                  if (vErrors === null) {
                                    vErrors = [err128];
                                  } else {
                                    vErrors.push(err128);
                                  }
                                  errors++;
                                }
                              }
                            }
                          } else {
                            const err129 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                            if (vErrors === null) {
                              vErrors = [err129];
                            } else {
                              vErrors.push(err129);
                            }
                            errors++;
                          }
                          var _valid1 = _errs100 === errors;
                          valid5 = valid5 || _valid1;
                          if (!valid5) {
                            const _errs113 = errors;
                            if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
                              if (data10.kind === void 0) {
                                const err130 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                                if (vErrors === null) {
                                  vErrors = [err130];
                                } else {
                                  vErrors.push(err130);
                                }
                                errors++;
                              }
                              if (data10.sourceEventId === void 0) {
                                const err131 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/required", keyword: "required", params: { missingProperty: "sourceEventId" }, message: "must have required property 'sourceEventId'" };
                                if (vErrors === null) {
                                  vErrors = [err131];
                                } else {
                                  vErrors.push(err131);
                                }
                                errors++;
                              }
                              if (data10.sourceCursor === void 0) {
                                const err132 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/required", keyword: "required", params: { missingProperty: "sourceCursor" }, message: "must have required property 'sourceCursor'" };
                                if (vErrors === null) {
                                  vErrors = [err132];
                                } else {
                                  vErrors.push(err132);
                                }
                                errors++;
                              }
                              if (data10.actionId === void 0) {
                                const err133 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                                if (vErrors === null) {
                                  vErrors = [err133];
                                } else {
                                  vErrors.push(err133);
                                }
                                errors++;
                              }
                              if (data10.attempt === void 0) {
                                const err134 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/required", keyword: "required", params: { missingProperty: "attempt" }, message: "must have required property 'attempt'" };
                                if (vErrors === null) {
                                  vErrors = [err134];
                                } else {
                                  vErrors.push(err134);
                                }
                                errors++;
                              }
                              if (data10.reason === void 0) {
                                const err135 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
                                if (vErrors === null) {
                                  vErrors = [err135];
                                } else {
                                  vErrors.push(err135);
                                }
                                errors++;
                              }
                              for (const key10 in data10) {
                                if (!(key10 === "kind" || key10 === "sourceEventId" || key10 === "sourceCursor" || key10 === "actionId" || key10 === "attempt" || key10 === "reason")) {
                                  const err136 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key10 }, message: "must NOT have additional properties" };
                                  if (vErrors === null) {
                                    vErrors = [err136];
                                  } else {
                                    vErrors.push(err136);
                                  }
                                  errors++;
                                }
                              }
                              if (data10.kind !== void 0) {
                                let data42 = data10.kind;
                                if (typeof data42 !== "string") {
                                  const err137 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err137];
                                  } else {
                                    vErrors.push(err137);
                                  }
                                  errors++;
                                }
                                if ("tool_attempt_failed" !== data42) {
                                  const err138 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/properties/kind/const", keyword: "const", params: { allowedValue: "tool_attempt_failed" }, message: "must be equal to constant" };
                                  if (vErrors === null) {
                                    vErrors = [err138];
                                  } else {
                                    vErrors.push(err138);
                                  }
                                  errors++;
                                }
                              }
                              if (data10.sourceEventId !== void 0) {
                                let data43 = data10.sourceEventId;
                                if (typeof data43 === "string") {
                                  if (!pattern0.test(data43)) {
                                    const err139 = { instancePath: instancePath + "/activity/sourceEventId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/properties/sourceEventId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                    if (vErrors === null) {
                                      vErrors = [err139];
                                    } else {
                                      vErrors.push(err139);
                                    }
                                    errors++;
                                  }
                                } else {
                                  const err140 = { instancePath: instancePath + "/activity/sourceEventId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/properties/sourceEventId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err140];
                                  } else {
                                    vErrors.push(err140);
                                  }
                                  errors++;
                                }
                              }
                              if (data10.sourceCursor !== void 0) {
                                let data44 = data10.sourceCursor;
                                if (!(typeof data44 == "number" && (!(data44 % 1) && !isNaN(data44)) && isFinite(data44))) {
                                  const err141 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/properties/sourceCursor/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                  if (vErrors === null) {
                                    vErrors = [err141];
                                  } else {
                                    vErrors.push(err141);
                                  }
                                  errors++;
                                }
                                if (typeof data44 == "number" && isFinite(data44)) {
                                  if (data44 > 9007199254740991 || isNaN(data44)) {
                                    const err142 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/properties/sourceCursor/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                                    if (vErrors === null) {
                                      vErrors = [err142];
                                    } else {
                                      vErrors.push(err142);
                                    }
                                    errors++;
                                  }
                                  if (data44 < 1 || isNaN(data44)) {
                                    const err143 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/properties/sourceCursor/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                                    if (vErrors === null) {
                                      vErrors = [err143];
                                    } else {
                                      vErrors.push(err143);
                                    }
                                    errors++;
                                  }
                                }
                              }
                              if (data10.actionId !== void 0) {
                                let data45 = data10.actionId;
                                if (typeof data45 === "string") {
                                  if (!pattern0.test(data45)) {
                                    const err144 = { instancePath: instancePath + "/activity/actionId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                    if (vErrors === null) {
                                      vErrors = [err144];
                                    } else {
                                      vErrors.push(err144);
                                    }
                                    errors++;
                                  }
                                } else {
                                  const err145 = { instancePath: instancePath + "/activity/actionId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err145];
                                  } else {
                                    vErrors.push(err145);
                                  }
                                  errors++;
                                }
                              }
                              if (data10.attempt !== void 0) {
                                let data46 = data10.attempt;
                                if (!(typeof data46 == "number" && (!(data46 % 1) && !isNaN(data46)) && isFinite(data46))) {
                                  const err146 = { instancePath: instancePath + "/activity/attempt", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/properties/attempt/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                  if (vErrors === null) {
                                    vErrors = [err146];
                                  } else {
                                    vErrors.push(err146);
                                  }
                                  errors++;
                                }
                                if (typeof data46 == "number" && isFinite(data46)) {
                                  if (data46 > 9007199254740991 || isNaN(data46)) {
                                    const err147 = { instancePath: instancePath + "/activity/attempt", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/properties/attempt/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                                    if (vErrors === null) {
                                      vErrors = [err147];
                                    } else {
                                      vErrors.push(err147);
                                    }
                                    errors++;
                                  }
                                  if (data46 < 1 || isNaN(data46)) {
                                    const err148 = { instancePath: instancePath + "/activity/attempt", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/properties/attempt/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                                    if (vErrors === null) {
                                      vErrors = [err148];
                                    } else {
                                      vErrors.push(err148);
                                    }
                                    errors++;
                                  }
                                }
                              }
                              if (data10.reason !== void 0) {
                                if (typeof data10.reason !== "string") {
                                  const err149 = { instancePath: instancePath + "/activity/reason", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err149];
                                  } else {
                                    vErrors.push(err149);
                                  }
                                  errors++;
                                }
                              }
                            } else {
                              const err150 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                              if (vErrors === null) {
                                vErrors = [err150];
                              } else {
                                vErrors.push(err150);
                              }
                              errors++;
                            }
                            var _valid1 = _errs113 === errors;
                            valid5 = valid5 || _valid1;
                            if (!valid5) {
                              const _errs128 = errors;
                              if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
                                if (data10.kind === void 0) {
                                  const err151 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                                  if (vErrors === null) {
                                    vErrors = [err151];
                                  } else {
                                    vErrors.push(err151);
                                  }
                                  errors++;
                                }
                                if (data10.sourceEventId === void 0) {
                                  const err152 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/required", keyword: "required", params: { missingProperty: "sourceEventId" }, message: "must have required property 'sourceEventId'" };
                                  if (vErrors === null) {
                                    vErrors = [err152];
                                  } else {
                                    vErrors.push(err152);
                                  }
                                  errors++;
                                }
                                if (data10.sourceCursor === void 0) {
                                  const err153 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/required", keyword: "required", params: { missingProperty: "sourceCursor" }, message: "must have required property 'sourceCursor'" };
                                  if (vErrors === null) {
                                    vErrors = [err153];
                                  } else {
                                    vErrors.push(err153);
                                  }
                                  errors++;
                                }
                                if (data10.reason === void 0) {
                                  const err154 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
                                  if (vErrors === null) {
                                    vErrors = [err154];
                                  } else {
                                    vErrors.push(err154);
                                  }
                                  errors++;
                                }
                                for (const key11 in data10) {
                                  if (!(key11 === "kind" || key11 === "sourceEventId" || key11 === "sourceCursor" || key11 === "reason")) {
                                    const err155 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key11 }, message: "must NOT have additional properties" };
                                    if (vErrors === null) {
                                      vErrors = [err155];
                                    } else {
                                      vErrors.push(err155);
                                    }
                                    errors++;
                                  }
                                }
                                if (data10.kind !== void 0) {
                                  let data48 = data10.kind;
                                  if (typeof data48 !== "string") {
                                    const err156 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err156];
                                    } else {
                                      vErrors.push(err156);
                                    }
                                    errors++;
                                  }
                                  if ("activity_boundary" !== data48) {
                                    const err157 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/properties/kind/const", keyword: "const", params: { allowedValue: "activity_boundary" }, message: "must be equal to constant" };
                                    if (vErrors === null) {
                                      vErrors = [err157];
                                    } else {
                                      vErrors.push(err157);
                                    }
                                    errors++;
                                  }
                                }
                                if (data10.sourceEventId !== void 0) {
                                  let data49 = data10.sourceEventId;
                                  if (typeof data49 === "string") {
                                    if (!pattern0.test(data49)) {
                                      const err158 = { instancePath: instancePath + "/activity/sourceEventId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/properties/sourceEventId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                      if (vErrors === null) {
                                        vErrors = [err158];
                                      } else {
                                        vErrors.push(err158);
                                      }
                                      errors++;
                                    }
                                  } else {
                                    const err159 = { instancePath: instancePath + "/activity/sourceEventId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/properties/sourceEventId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err159];
                                    } else {
                                      vErrors.push(err159);
                                    }
                                    errors++;
                                  }
                                }
                                if (data10.sourceCursor !== void 0) {
                                  let data50 = data10.sourceCursor;
                                  if (!(typeof data50 == "number" && (!(data50 % 1) && !isNaN(data50)) && isFinite(data50))) {
                                    const err160 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/properties/sourceCursor/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                    if (vErrors === null) {
                                      vErrors = [err160];
                                    } else {
                                      vErrors.push(err160);
                                    }
                                    errors++;
                                  }
                                  if (typeof data50 == "number" && isFinite(data50)) {
                                    if (data50 > 9007199254740991 || isNaN(data50)) {
                                      const err161 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/properties/sourceCursor/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                                      if (vErrors === null) {
                                        vErrors = [err161];
                                      } else {
                                        vErrors.push(err161);
                                      }
                                      errors++;
                                    }
                                    if (data50 < 1 || isNaN(data50)) {
                                      const err162 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/properties/sourceCursor/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                                      if (vErrors === null) {
                                        vErrors = [err162];
                                      } else {
                                        vErrors.push(err162);
                                      }
                                      errors++;
                                    }
                                  }
                                }
                                if (data10.reason !== void 0) {
                                  let data51 = data10.reason;
                                  if (typeof data51 !== "string") {
                                    const err163 = { instancePath: instancePath + "/activity/reason", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err163];
                                    } else {
                                      vErrors.push(err163);
                                    }
                                    errors++;
                                  }
                                  if (!(data51 === "assistant_reply" || data51 === "user_wait" || data51 === "stage_change" || data51 === "terminal" || data51 === "failure" || data51 === "unknown")) {
                                    const err164 = { instancePath: instancePath + "/activity/reason", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/properties/reason/enum", keyword: "enum", params: { allowedValues: schema50.anyOf[8].properties.reason.enum }, message: "must be equal to one of the allowed values" };
                                    if (vErrors === null) {
                                      vErrors = [err164];
                                    } else {
                                      vErrors.push(err164);
                                    }
                                    errors++;
                                  }
                                }
                              } else {
                                const err165 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                if (vErrors === null) {
                                  vErrors = [err165];
                                } else {
                                  vErrors.push(err165);
                                }
                                errors++;
                              }
                              var _valid1 = _errs128 === errors;
                              valid5 = valid5 || _valid1;
                              if (!valid5) {
                                const _errs139 = errors;
                                if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
                                  if (data10.kind === void 0) {
                                    const err166 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                                    if (vErrors === null) {
                                      vErrors = [err166];
                                    } else {
                                      vErrors.push(err166);
                                    }
                                    errors++;
                                  }
                                  if (data10.sourceEventId === void 0) {
                                    const err167 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/required", keyword: "required", params: { missingProperty: "sourceEventId" }, message: "must have required property 'sourceEventId'" };
                                    if (vErrors === null) {
                                      vErrors = [err167];
                                    } else {
                                      vErrors.push(err167);
                                    }
                                    errors++;
                                  }
                                  if (data10.sourceCursor === void 0) {
                                    const err168 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/required", keyword: "required", params: { missingProperty: "sourceCursor" }, message: "must have required property 'sourceCursor'" };
                                    if (vErrors === null) {
                                      vErrors = [err168];
                                    } else {
                                      vErrors.push(err168);
                                    }
                                    errors++;
                                  }
                                  if (data10.candidateId === void 0) {
                                    const err169 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/required", keyword: "required", params: { missingProperty: "candidateId" }, message: "must have required property 'candidateId'" };
                                    if (vErrors === null) {
                                      vErrors = [err169];
                                    } else {
                                      vErrors.push(err169);
                                    }
                                    errors++;
                                  }
                                  if (data10.text === void 0) {
                                    const err170 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/required", keyword: "required", params: { missingProperty: "text" }, message: "must have required property 'text'" };
                                    if (vErrors === null) {
                                      vErrors = [err170];
                                    } else {
                                      vErrors.push(err170);
                                    }
                                    errors++;
                                  }
                                  if (data10.startOffset === void 0) {
                                    const err171 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/required", keyword: "required", params: { missingProperty: "startOffset" }, message: "must have required property 'startOffset'" };
                                    if (vErrors === null) {
                                      vErrors = [err171];
                                    } else {
                                      vErrors.push(err171);
                                    }
                                    errors++;
                                  }
                                  if (data10.truncated === void 0) {
                                    const err172 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/required", keyword: "required", params: { missingProperty: "truncated" }, message: "must have required property 'truncated'" };
                                    if (vErrors === null) {
                                      vErrors = [err172];
                                    } else {
                                      vErrors.push(err172);
                                    }
                                    errors++;
                                  }
                                  if (data10.complete === void 0) {
                                    const err173 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/required", keyword: "required", params: { missingProperty: "complete" }, message: "must have required property 'complete'" };
                                    if (vErrors === null) {
                                      vErrors = [err173];
                                    } else {
                                      vErrors.push(err173);
                                    }
                                    errors++;
                                  }
                                  for (const key12 in data10) {
                                    if (!(key12 === "kind" || key12 === "sourceEventId" || key12 === "sourceCursor" || key12 === "candidateId" || key12 === "text" || key12 === "startOffset" || key12 === "truncated" || key12 === "complete")) {
                                      const err174 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key12 }, message: "must NOT have additional properties" };
                                      if (vErrors === null) {
                                        vErrors = [err174];
                                      } else {
                                        vErrors.push(err174);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data10.kind !== void 0) {
                                    let data52 = data10.kind;
                                    if (typeof data52 !== "string") {
                                      const err175 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err175];
                                      } else {
                                        vErrors.push(err175);
                                      }
                                      errors++;
                                    }
                                    if ("candidate_preview" !== data52) {
                                      const err176 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/kind/const", keyword: "const", params: { allowedValue: "candidate_preview" }, message: "must be equal to constant" };
                                      if (vErrors === null) {
                                        vErrors = [err176];
                                      } else {
                                        vErrors.push(err176);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data10.sourceEventId !== void 0) {
                                    let data53 = data10.sourceEventId;
                                    if (typeof data53 === "string") {
                                      if (!pattern0.test(data53)) {
                                        const err177 = { instancePath: instancePath + "/activity/sourceEventId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/sourceEventId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                        if (vErrors === null) {
                                          vErrors = [err177];
                                        } else {
                                          vErrors.push(err177);
                                        }
                                        errors++;
                                      }
                                    } else {
                                      const err178 = { instancePath: instancePath + "/activity/sourceEventId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/sourceEventId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err178];
                                      } else {
                                        vErrors.push(err178);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data10.sourceCursor !== void 0) {
                                    let data54 = data10.sourceCursor;
                                    if (!(typeof data54 == "number" && (!(data54 % 1) && !isNaN(data54)) && isFinite(data54))) {
                                      const err179 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/sourceCursor/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                      if (vErrors === null) {
                                        vErrors = [err179];
                                      } else {
                                        vErrors.push(err179);
                                      }
                                      errors++;
                                    }
                                    if (typeof data54 == "number" && isFinite(data54)) {
                                      if (data54 > 9007199254740991 || isNaN(data54)) {
                                        const err180 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/sourceCursor/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                                        if (vErrors === null) {
                                          vErrors = [err180];
                                        } else {
                                          vErrors.push(err180);
                                        }
                                        errors++;
                                      }
                                      if (data54 < 1 || isNaN(data54)) {
                                        const err181 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/sourceCursor/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                                        if (vErrors === null) {
                                          vErrors = [err181];
                                        } else {
                                          vErrors.push(err181);
                                        }
                                        errors++;
                                      }
                                    }
                                  }
                                  if (data10.candidateId !== void 0) {
                                    let data55 = data10.candidateId;
                                    if (typeof data55 === "string") {
                                      if (!pattern0.test(data55)) {
                                        const err182 = { instancePath: instancePath + "/activity/candidateId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/candidateId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                        if (vErrors === null) {
                                          vErrors = [err182];
                                        } else {
                                          vErrors.push(err182);
                                        }
                                        errors++;
                                      }
                                    } else {
                                      const err183 = { instancePath: instancePath + "/activity/candidateId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/candidateId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err183];
                                      } else {
                                        vErrors.push(err183);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data10.text !== void 0) {
                                    if (typeof data10.text !== "string") {
                                      const err184 = { instancePath: instancePath + "/activity/text", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err184];
                                      } else {
                                        vErrors.push(err184);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data10.startOffset !== void 0) {
                                    let data57 = data10.startOffset;
                                    if (!(typeof data57 == "number" && (!(data57 % 1) && !isNaN(data57)) && isFinite(data57))) {
                                      const err185 = { instancePath: instancePath + "/activity/startOffset", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/startOffset/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                      if (vErrors === null) {
                                        vErrors = [err185];
                                      } else {
                                        vErrors.push(err185);
                                      }
                                      errors++;
                                    }
                                    if (typeof data57 == "number" && isFinite(data57)) {
                                      if (data57 > 9007199254740991 || isNaN(data57)) {
                                        const err186 = { instancePath: instancePath + "/activity/startOffset", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/startOffset/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                                        if (vErrors === null) {
                                          vErrors = [err186];
                                        } else {
                                          vErrors.push(err186);
                                        }
                                        errors++;
                                      }
                                      if (data57 < 0 || isNaN(data57)) {
                                        const err187 = { instancePath: instancePath + "/activity/startOffset", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/startOffset/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                                        if (vErrors === null) {
                                          vErrors = [err187];
                                        } else {
                                          vErrors.push(err187);
                                        }
                                        errors++;
                                      }
                                    }
                                  }
                                  if (data10.truncated !== void 0) {
                                    if (typeof data10.truncated !== "boolean") {
                                      const err188 = { instancePath: instancePath + "/activity/truncated", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/truncated/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                                      if (vErrors === null) {
                                        vErrors = [err188];
                                      } else {
                                        vErrors.push(err188);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data10.complete !== void 0) {
                                    if (typeof data10.complete !== "boolean") {
                                      const err189 = { instancePath: instancePath + "/activity/complete", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/complete/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                                      if (vErrors === null) {
                                        vErrors = [err189];
                                      } else {
                                        vErrors.push(err189);
                                      }
                                      errors++;
                                    }
                                  }
                                } else {
                                  const err190 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                  if (vErrors === null) {
                                    vErrors = [err190];
                                  } else {
                                    vErrors.push(err190);
                                  }
                                  errors++;
                                }
                                var _valid1 = _errs139 === errors;
                                valid5 = valid5 || _valid1;
                                if (!valid5) {
                                  const _errs158 = errors;
                                  if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
                                    if (data10.kind === void 0) {
                                      const err191 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                                      if (vErrors === null) {
                                        vErrors = [err191];
                                      } else {
                                        vErrors.push(err191);
                                      }
                                      errors++;
                                    }
                                    if (data10.sourceEventId === void 0) {
                                      const err192 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/required", keyword: "required", params: { missingProperty: "sourceEventId" }, message: "must have required property 'sourceEventId'" };
                                      if (vErrors === null) {
                                        vErrors = [err192];
                                      } else {
                                        vErrors.push(err192);
                                      }
                                      errors++;
                                    }
                                    if (data10.sourceCursor === void 0) {
                                      const err193 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/required", keyword: "required", params: { missingProperty: "sourceCursor" }, message: "must have required property 'sourceCursor'" };
                                      if (vErrors === null) {
                                        vErrors = [err193];
                                      } else {
                                        vErrors.push(err193);
                                      }
                                      errors++;
                                    }
                                    if (data10.candidateId === void 0) {
                                      const err194 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/required", keyword: "required", params: { missingProperty: "candidateId" }, message: "must have required property 'candidateId'" };
                                      if (vErrors === null) {
                                        vErrors = [err194];
                                      } else {
                                        vErrors.push(err194);
                                      }
                                      errors++;
                                    }
                                    if (data10.reason === void 0) {
                                      const err195 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
                                      if (vErrors === null) {
                                        vErrors = [err195];
                                      } else {
                                        vErrors.push(err195);
                                      }
                                      errors++;
                                    }
                                    for (const key13 in data10) {
                                      if (!(key13 === "kind" || key13 === "sourceEventId" || key13 === "sourceCursor" || key13 === "candidateId" || key13 === "reason")) {
                                        const err196 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key13 }, message: "must NOT have additional properties" };
                                        if (vErrors === null) {
                                          vErrors = [err196];
                                        } else {
                                          vErrors.push(err196);
                                        }
                                        errors++;
                                      }
                                    }
                                    if (data10.kind !== void 0) {
                                      let data60 = data10.kind;
                                      if (typeof data60 !== "string") {
                                        const err197 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err197];
                                        } else {
                                          vErrors.push(err197);
                                        }
                                        errors++;
                                      }
                                      if ("candidate_invalidated" !== data60) {
                                        const err198 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/properties/kind/const", keyword: "const", params: { allowedValue: "candidate_invalidated" }, message: "must be equal to constant" };
                                        if (vErrors === null) {
                                          vErrors = [err198];
                                        } else {
                                          vErrors.push(err198);
                                        }
                                        errors++;
                                      }
                                    }
                                    if (data10.sourceEventId !== void 0) {
                                      let data61 = data10.sourceEventId;
                                      if (typeof data61 === "string") {
                                        if (!pattern0.test(data61)) {
                                          const err199 = { instancePath: instancePath + "/activity/sourceEventId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/properties/sourceEventId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                          if (vErrors === null) {
                                            vErrors = [err199];
                                          } else {
                                            vErrors.push(err199);
                                          }
                                          errors++;
                                        }
                                      } else {
                                        const err200 = { instancePath: instancePath + "/activity/sourceEventId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/properties/sourceEventId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err200];
                                        } else {
                                          vErrors.push(err200);
                                        }
                                        errors++;
                                      }
                                    }
                                    if (data10.sourceCursor !== void 0) {
                                      let data62 = data10.sourceCursor;
                                      if (!(typeof data62 == "number" && (!(data62 % 1) && !isNaN(data62)) && isFinite(data62))) {
                                        const err201 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/properties/sourceCursor/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                        if (vErrors === null) {
                                          vErrors = [err201];
                                        } else {
                                          vErrors.push(err201);
                                        }
                                        errors++;
                                      }
                                      if (typeof data62 == "number" && isFinite(data62)) {
                                        if (data62 > 9007199254740991 || isNaN(data62)) {
                                          const err202 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/properties/sourceCursor/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                                          if (vErrors === null) {
                                            vErrors = [err202];
                                          } else {
                                            vErrors.push(err202);
                                          }
                                          errors++;
                                        }
                                        if (data62 < 1 || isNaN(data62)) {
                                          const err203 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/properties/sourceCursor/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                                          if (vErrors === null) {
                                            vErrors = [err203];
                                          } else {
                                            vErrors.push(err203);
                                          }
                                          errors++;
                                        }
                                      }
                                    }
                                    if (data10.candidateId !== void 0) {
                                      let data63 = data10.candidateId;
                                      if (typeof data63 === "string") {
                                        if (!pattern0.test(data63)) {
                                          const err204 = { instancePath: instancePath + "/activity/candidateId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/properties/candidateId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                          if (vErrors === null) {
                                            vErrors = [err204];
                                          } else {
                                            vErrors.push(err204);
                                          }
                                          errors++;
                                        }
                                      } else {
                                        const err205 = { instancePath: instancePath + "/activity/candidateId", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/properties/candidateId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err205];
                                        } else {
                                          vErrors.push(err205);
                                        }
                                        errors++;
                                      }
                                    }
                                    if (data10.reason !== void 0) {
                                      let data64 = data10.reason;
                                      if (typeof data64 !== "string") {
                                        const err206 = { instancePath: instancePath + "/activity/reason", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err206];
                                        } else {
                                          vErrors.push(err206);
                                        }
                                        errors++;
                                      }
                                      if (!(data64 === "rejected" || data64 === "cancelled" || data64 === "failed" || data64 === "replaced" || data64 === "ambiguous")) {
                                        const err207 = { instancePath: instancePath + "/activity/reason", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/properties/reason/enum", keyword: "enum", params: { allowedValues: schema50.anyOf[10].properties.reason.enum }, message: "must be equal to one of the allowed values" };
                                        if (vErrors === null) {
                                          vErrors = [err207];
                                        } else {
                                          vErrors.push(err207);
                                        }
                                        errors++;
                                      }
                                    }
                                  } else {
                                    const err208 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                    if (vErrors === null) {
                                      vErrors = [err208];
                                    } else {
                                      vErrors.push(err208);
                                    }
                                    errors++;
                                  }
                                  var _valid1 = _errs158 === errors;
                                  valid5 = valid5 || _valid1;
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
              if (!valid5) {
                const err209 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                if (vErrors === null) {
                  vErrors = [err209];
                } else {
                  vErrors.push(err209);
                }
                errors++;
              } else {
                errors = _errs29;
                if (vErrors !== null) {
                  if (_errs29) {
                    vErrors.length = _errs29;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
          } else {
            const err210 = { instancePath, schemaPath: "#/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err210];
            } else {
              vErrors.push(err210);
            }
            errors++;
          }
          var _valid0 = _errs18 === errors;
          valid0 = valid0 || _valid0;
          if (!valid0) {
            const _errs171 = errors;
            if (data && typeof data == "object" && !Array.isArray(data)) {
              if (data.type === void 0) {
                const err211 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                if (vErrors === null) {
                  vErrors = [err211];
                } else {
                  vErrors.push(err211);
                }
                errors++;
              }
              if (data.goalId === void 0) {
                const err212 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                if (vErrors === null) {
                  vErrors = [err212];
                } else {
                  vErrors.push(err212);
                }
                errors++;
              }
              if (data.runId === void 0) {
                const err213 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                if (vErrors === null) {
                  vErrors = [err213];
                } else {
                  vErrors.push(err213);
                }
                errors++;
              }
              if (data.message === void 0) {
                const err214 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
                if (vErrors === null) {
                  vErrors = [err214];
                } else {
                  vErrors.push(err214);
                }
                errors++;
              }
              for (const key14 in data) {
                if (!(key14 === "type" || key14 === "goalId" || key14 === "runId" || key14 === "message")) {
                  const err215 = { instancePath, schemaPath: "#/anyOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key14 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err215];
                  } else {
                    vErrors.push(err215);
                  }
                  errors++;
                }
              }
              if (data.type !== void 0) {
                let data65 = data.type;
                if (typeof data65 !== "string") {
                  const err216 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/3/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err216];
                  } else {
                    vErrors.push(err216);
                  }
                  errors++;
                }
                if ("message_committed" !== data65) {
                  const err217 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/3/properties/type/const", keyword: "const", params: { allowedValue: "message_committed" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err217];
                  } else {
                    vErrors.push(err217);
                  }
                  errors++;
                }
              }
              if (data.goalId !== void 0) {
                let data66 = data.goalId;
                if (typeof data66 === "string") {
                  if (!pattern0.test(data66)) {
                    const err218 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/3/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                    if (vErrors === null) {
                      vErrors = [err218];
                    } else {
                      vErrors.push(err218);
                    }
                    errors++;
                  }
                } else {
                  const err219 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/3/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err219];
                  } else {
                    vErrors.push(err219);
                  }
                  errors++;
                }
              }
              if (data.runId !== void 0) {
                let data67 = data.runId;
                if (typeof data67 === "string") {
                  if (!pattern0.test(data67)) {
                    const err220 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/3/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                    if (vErrors === null) {
                      vErrors = [err220];
                    } else {
                      vErrors.push(err220);
                    }
                    errors++;
                  }
                } else {
                  const err221 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/3/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err221];
                  } else {
                    vErrors.push(err221);
                  }
                  errors++;
                }
              }
              if (data.message !== void 0) {
                if (!validate39(data.message, { instancePath: instancePath + "/message", parentData: data, parentDataProperty: "message", rootData })) {
                  vErrors = vErrors === null ? validate39.errors : vErrors.concat(validate39.errors);
                  errors = vErrors.length;
                }
              }
            } else {
              const err222 = { instancePath, schemaPath: "#/anyOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err222];
              } else {
                vErrors.push(err222);
              }
              errors++;
            }
            var _valid0 = _errs171 === errors;
            valid0 = valid0 || _valid0;
            if (!valid0) {
              const _errs181 = errors;
              if (data && typeof data == "object" && !Array.isArray(data)) {
                if (data.type === void 0) {
                  const err223 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                  if (vErrors === null) {
                    vErrors = [err223];
                  } else {
                    vErrors.push(err223);
                  }
                  errors++;
                }
                if (data.goalId === void 0) {
                  const err224 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                  if (vErrors === null) {
                    vErrors = [err224];
                  } else {
                    vErrors.push(err224);
                  }
                  errors++;
                }
                if (data.commitRevision === void 0) {
                  const err225 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "commitRevision" }, message: "must have required property 'commitRevision'" };
                  if (vErrors === null) {
                    vErrors = [err225];
                  } else {
                    vErrors.push(err225);
                  }
                  errors++;
                }
                if (data.changed === void 0) {
                  const err226 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "changed" }, message: "must have required property 'changed'" };
                  if (vErrors === null) {
                    vErrors = [err226];
                  } else {
                    vErrors.push(err226);
                  }
                  errors++;
                }
                for (const key15 in data) {
                  if (!(key15 === "type" || key15 === "goalId" || key15 === "runId" || key15 === "commitRevision" || key15 === "changed")) {
                    const err227 = { instancePath, schemaPath: "#/anyOf/4/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key15 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err227];
                    } else {
                      vErrors.push(err227);
                    }
                    errors++;
                  }
                }
                if (data.type !== void 0) {
                  let data69 = data.type;
                  if (typeof data69 !== "string") {
                    const err228 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/4/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err228];
                    } else {
                      vErrors.push(err228);
                    }
                    errors++;
                  }
                  if ("state_committed" !== data69) {
                    const err229 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/4/properties/type/const", keyword: "const", params: { allowedValue: "state_committed" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err229];
                    } else {
                      vErrors.push(err229);
                    }
                    errors++;
                  }
                }
                if (data.goalId !== void 0) {
                  let data70 = data.goalId;
                  if (typeof data70 === "string") {
                    if (!pattern0.test(data70)) {
                      const err230 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/4/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err230];
                      } else {
                        vErrors.push(err230);
                      }
                      errors++;
                    }
                  } else {
                    const err231 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/4/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err231];
                    } else {
                      vErrors.push(err231);
                    }
                    errors++;
                  }
                }
                if (data.runId !== void 0) {
                  let data71 = data.runId;
                  if (typeof data71 === "string") {
                    if (!pattern0.test(data71)) {
                      const err232 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/4/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err232];
                      } else {
                        vErrors.push(err232);
                      }
                      errors++;
                    }
                  } else {
                    const err233 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/4/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err233];
                    } else {
                      vErrors.push(err233);
                    }
                    errors++;
                  }
                }
                if (data.commitRevision !== void 0) {
                  let data72 = data.commitRevision;
                  if (!(typeof data72 == "number" && (!(data72 % 1) && !isNaN(data72)) && isFinite(data72))) {
                    const err234 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/anyOf/4/properties/commitRevision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err234];
                    } else {
                      vErrors.push(err234);
                    }
                    errors++;
                  }
                  if (typeof data72 == "number" && isFinite(data72)) {
                    if (data72 > 9007199254740991 || isNaN(data72)) {
                      const err235 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/anyOf/4/properties/commitRevision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err235];
                      } else {
                        vErrors.push(err235);
                      }
                      errors++;
                    }
                    if (data72 < 0 || isNaN(data72)) {
                      const err236 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/anyOf/4/properties/commitRevision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err236];
                      } else {
                        vErrors.push(err236);
                      }
                      errors++;
                    }
                  }
                }
                if (data.changed !== void 0) {
                  let data73 = data.changed;
                  if (Array.isArray(data73)) {
                    if (data73.length < 1) {
                      const err237 = { instancePath: instancePath + "/changed", schemaPath: "#/anyOf/4/properties/changed/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
                      if (vErrors === null) {
                        vErrors = [err237];
                      } else {
                        vErrors.push(err237);
                      }
                      errors++;
                    }
                    const len0 = data73.length;
                    for (let i0 = 0; i0 < len0; i0++) {
                      let data74 = data73[i0];
                      if (typeof data74 !== "string") {
                        const err238 = { instancePath: instancePath + "/changed/" + i0, schemaPath: "#/definitions/BrowserControlScope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err238];
                        } else {
                          vErrors.push(err238);
                        }
                        errors++;
                      }
                      if (!(data74 === "session" || data74 === "activity" || data74 === "trajectory" || data74 === "metrics" || data74 === "goals" || data74 === "grants" || data74 === "permission" || data74 === "model")) {
                        const err239 = { instancePath: instancePath + "/changed/" + i0, schemaPath: "#/definitions/BrowserControlScope/enum", keyword: "enum", params: { allowedValues: schema53.enum }, message: "must be equal to one of the allowed values" };
                        if (vErrors === null) {
                          vErrors = [err239];
                        } else {
                          vErrors.push(err239);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err240 = { instancePath: instancePath + "/changed", schemaPath: "#/anyOf/4/properties/changed/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                    if (vErrors === null) {
                      vErrors = [err240];
                    } else {
                      vErrors.push(err240);
                    }
                    errors++;
                  }
                }
              } else {
                const err241 = { instancePath, schemaPath: "#/anyOf/4/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err241];
                } else {
                  vErrors.push(err241);
                }
                errors++;
              }
              var _valid0 = _errs181 === errors;
              valid0 = valid0 || _valid0;
              if (!valid0) {
                const _errs197 = errors;
                if (data && typeof data == "object" && !Array.isArray(data)) {
                  if (data.type === void 0) {
                    const err242 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                    if (vErrors === null) {
                      vErrors = [err242];
                    } else {
                      vErrors.push(err242);
                    }
                    errors++;
                  }
                  if (data.goalId === void 0) {
                    const err243 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                    if (vErrors === null) {
                      vErrors = [err243];
                    } else {
                      vErrors.push(err243);
                    }
                    errors++;
                  }
                  if (data.runId === void 0) {
                    const err244 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                    if (vErrors === null) {
                      vErrors = [err244];
                    } else {
                      vErrors.push(err244);
                    }
                    errors++;
                  }
                  if (data.status === void 0) {
                    const err245 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
                    if (vErrors === null) {
                      vErrors = [err245];
                    } else {
                      vErrors.push(err245);
                    }
                    errors++;
                  }
                  for (const key16 in data) {
                    if (!(key16 === "type" || key16 === "goalId" || key16 === "runId" || key16 === "status" || key16 === "commitRevision")) {
                      const err246 = { instancePath, schemaPath: "#/anyOf/5/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key16 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err246];
                      } else {
                        vErrors.push(err246);
                      }
                      errors++;
                    }
                  }
                  if (data.type !== void 0) {
                    let data75 = data.type;
                    if (typeof data75 !== "string") {
                      const err247 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/5/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err247];
                      } else {
                        vErrors.push(err247);
                      }
                      errors++;
                    }
                    if ("run_status_changed" !== data75) {
                      const err248 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/5/properties/type/const", keyword: "const", params: { allowedValue: "run_status_changed" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err248];
                      } else {
                        vErrors.push(err248);
                      }
                      errors++;
                    }
                  }
                  if (data.goalId !== void 0) {
                    let data76 = data.goalId;
                    if (typeof data76 === "string") {
                      if (!pattern0.test(data76)) {
                        const err249 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/5/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                        if (vErrors === null) {
                          vErrors = [err249];
                        } else {
                          vErrors.push(err249);
                        }
                        errors++;
                      }
                    } else {
                      const err250 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/5/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err250];
                      } else {
                        vErrors.push(err250);
                      }
                      errors++;
                    }
                  }
                  if (data.runId !== void 0) {
                    let data77 = data.runId;
                    if (typeof data77 === "string") {
                      if (!pattern0.test(data77)) {
                        const err251 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/5/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                        if (vErrors === null) {
                          vErrors = [err251];
                        } else {
                          vErrors.push(err251);
                        }
                        errors++;
                      }
                    } else {
                      const err252 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/5/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err252];
                      } else {
                        vErrors.push(err252);
                      }
                      errors++;
                    }
                  }
                  if (data.status !== void 0) {
                    let data78 = data.status;
                    if (typeof data78 !== "string") {
                      const err253 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/BrowserRunStatus/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err253];
                      } else {
                        vErrors.push(err253);
                      }
                      errors++;
                    }
                    if (!(data78 === "created" || data78 === "running" || data78 === "waiting" || data78 === "completed" || data78 === "failed" || data78 === "cancelled")) {
                      const err254 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/BrowserRunStatus/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
                      if (vErrors === null) {
                        vErrors = [err254];
                      } else {
                        vErrors.push(err254);
                      }
                      errors++;
                    }
                  }
                  if (data.commitRevision !== void 0) {
                    let data79 = data.commitRevision;
                    if (!(typeof data79 == "number" && (!(data79 % 1) && !isNaN(data79)) && isFinite(data79))) {
                      const err255 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/anyOf/5/properties/commitRevision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                      if (vErrors === null) {
                        vErrors = [err255];
                      } else {
                        vErrors.push(err255);
                      }
                      errors++;
                    }
                    if (typeof data79 == "number" && isFinite(data79)) {
                      if (data79 > 9007199254740991 || isNaN(data79)) {
                        const err256 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/anyOf/5/properties/commitRevision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                        if (vErrors === null) {
                          vErrors = [err256];
                        } else {
                          vErrors.push(err256);
                        }
                        errors++;
                      }
                      if (data79 < 0 || isNaN(data79)) {
                        const err257 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/anyOf/5/properties/commitRevision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                        if (vErrors === null) {
                          vErrors = [err257];
                        } else {
                          vErrors.push(err257);
                        }
                        errors++;
                      }
                    }
                  }
                } else {
                  const err258 = { instancePath, schemaPath: "#/anyOf/5/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err258];
                  } else {
                    vErrors.push(err258);
                  }
                  errors++;
                }
                var _valid0 = _errs197 === errors;
                valid0 = valid0 || _valid0;
                if (!valid0) {
                  const _errs211 = errors;
                  if (data && typeof data == "object" && !Array.isArray(data)) {
                    if (data.type === void 0) {
                      const err259 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                      if (vErrors === null) {
                        vErrors = [err259];
                      } else {
                        vErrors.push(err259);
                      }
                      errors++;
                    }
                    if (data.goalId === void 0) {
                      const err260 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                      if (vErrors === null) {
                        vErrors = [err260];
                      } else {
                        vErrors.push(err260);
                      }
                      errors++;
                    }
                    if (data.runId === void 0) {
                      const err261 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                      if (vErrors === null) {
                        vErrors = [err261];
                      } else {
                        vErrors.push(err261);
                      }
                      errors++;
                    }
                    if (data.result === void 0) {
                      const err262 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "result" }, message: "must have required property 'result'" };
                      if (vErrors === null) {
                        vErrors = [err262];
                      } else {
                        vErrors.push(err262);
                      }
                      errors++;
                    }
                    for (const key17 in data) {
                      if (!(key17 === "type" || key17 === "goalId" || key17 === "runId" || key17 === "result" || key17 === "commitRevision")) {
                        const err263 = { instancePath, schemaPath: "#/anyOf/6/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key17 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err263];
                        } else {
                          vErrors.push(err263);
                        }
                        errors++;
                      }
                    }
                    if (data.type !== void 0) {
                      let data80 = data.type;
                      if (typeof data80 !== "string") {
                        const err264 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/6/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err264];
                        } else {
                          vErrors.push(err264);
                        }
                        errors++;
                      }
                      if ("run_result" !== data80) {
                        const err265 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/6/properties/type/const", keyword: "const", params: { allowedValue: "run_result" }, message: "must be equal to constant" };
                        if (vErrors === null) {
                          vErrors = [err265];
                        } else {
                          vErrors.push(err265);
                        }
                        errors++;
                      }
                    }
                    if (data.goalId !== void 0) {
                      let data81 = data.goalId;
                      if (typeof data81 === "string") {
                        if (!pattern0.test(data81)) {
                          const err266 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/6/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                          if (vErrors === null) {
                            vErrors = [err266];
                          } else {
                            vErrors.push(err266);
                          }
                          errors++;
                        }
                      } else {
                        const err267 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/6/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err267];
                        } else {
                          vErrors.push(err267);
                        }
                        errors++;
                      }
                    }
                    if (data.runId !== void 0) {
                      let data82 = data.runId;
                      if (typeof data82 === "string") {
                        if (!pattern0.test(data82)) {
                          const err268 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/6/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                          if (vErrors === null) {
                            vErrors = [err268];
                          } else {
                            vErrors.push(err268);
                          }
                          errors++;
                        }
                      } else {
                        const err269 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/6/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err269];
                        } else {
                          vErrors.push(err269);
                        }
                        errors++;
                      }
                    }
                    if (data.result !== void 0) {
                      let data83 = data.result;
                      if (typeof data83 !== "string") {
                        const err270 = { instancePath: instancePath + "/result", schemaPath: "#/anyOf/6/properties/result/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err270];
                        } else {
                          vErrors.push(err270);
                        }
                        errors++;
                      }
                      if (!(data83 === "completed" || data83 === "failed" || data83 === "cancelled")) {
                        const err271 = { instancePath: instancePath + "/result", schemaPath: "#/anyOf/6/properties/result/enum", keyword: "enum", params: { allowedValues: schema12.anyOf[6].properties.result.enum }, message: "must be equal to one of the allowed values" };
                        if (vErrors === null) {
                          vErrors = [err271];
                        } else {
                          vErrors.push(err271);
                        }
                        errors++;
                      }
                    }
                    if (data.commitRevision !== void 0) {
                      let data84 = data.commitRevision;
                      if (!(typeof data84 == "number" && (!(data84 % 1) && !isNaN(data84)) && isFinite(data84))) {
                        const err272 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/anyOf/6/properties/commitRevision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                        if (vErrors === null) {
                          vErrors = [err272];
                        } else {
                          vErrors.push(err272);
                        }
                        errors++;
                      }
                      if (typeof data84 == "number" && isFinite(data84)) {
                        if (data84 > 9007199254740991 || isNaN(data84)) {
                          const err273 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/anyOf/6/properties/commitRevision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                          if (vErrors === null) {
                            vErrors = [err273];
                          } else {
                            vErrors.push(err273);
                          }
                          errors++;
                        }
                        if (data84 < 0 || isNaN(data84)) {
                          const err274 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/anyOf/6/properties/commitRevision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                          if (vErrors === null) {
                            vErrors = [err274];
                          } else {
                            vErrors.push(err274);
                          }
                          errors++;
                        }
                      }
                    }
                  } else {
                    const err275 = { instancePath, schemaPath: "#/anyOf/6/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err275];
                    } else {
                      vErrors.push(err275);
                    }
                    errors++;
                  }
                  var _valid0 = _errs211 === errors;
                  valid0 = valid0 || _valid0;
                  if (!valid0) {
                    const _errs224 = errors;
                    if (data && typeof data == "object" && !Array.isArray(data)) {
                      if (data.type === void 0) {
                        const err276 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                        if (vErrors === null) {
                          vErrors = [err276];
                        } else {
                          vErrors.push(err276);
                        }
                        errors++;
                      }
                      if (data.goalId === void 0) {
                        const err277 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                        if (vErrors === null) {
                          vErrors = [err277];
                        } else {
                          vErrors.push(err277);
                        }
                        errors++;
                      }
                      if (data.runId === void 0) {
                        const err278 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                        if (vErrors === null) {
                          vErrors = [err278];
                        } else {
                          vErrors.push(err278);
                        }
                        errors++;
                      }
                      if (data.interactionId === void 0) {
                        const err279 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "interactionId" }, message: "must have required property 'interactionId'" };
                        if (vErrors === null) {
                          vErrors = [err279];
                        } else {
                          vErrors.push(err279);
                        }
                        errors++;
                      }
                      if (data.kind === void 0) {
                        const err280 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                        if (vErrors === null) {
                          vErrors = [err280];
                        } else {
                          vErrors.push(err280);
                        }
                        errors++;
                      }
                      for (const key18 in data) {
                        if (!(key18 === "type" || key18 === "goalId" || key18 === "runId" || key18 === "interactionId" || key18 === "kind")) {
                          const err281 = { instancePath, schemaPath: "#/anyOf/7/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key18 }, message: "must NOT have additional properties" };
                          if (vErrors === null) {
                            vErrors = [err281];
                          } else {
                            vErrors.push(err281);
                          }
                          errors++;
                        }
                      }
                      if (data.type !== void 0) {
                        let data85 = data.type;
                        if (typeof data85 !== "string") {
                          const err282 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/7/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err282];
                          } else {
                            vErrors.push(err282);
                          }
                          errors++;
                        }
                        if ("interaction_opened" !== data85) {
                          const err283 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/7/properties/type/const", keyword: "const", params: { allowedValue: "interaction_opened" }, message: "must be equal to constant" };
                          if (vErrors === null) {
                            vErrors = [err283];
                          } else {
                            vErrors.push(err283);
                          }
                          errors++;
                        }
                      }
                      if (data.goalId !== void 0) {
                        let data86 = data.goalId;
                        if (typeof data86 === "string") {
                          if (!pattern0.test(data86)) {
                            const err284 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/7/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                            if (vErrors === null) {
                              vErrors = [err284];
                            } else {
                              vErrors.push(err284);
                            }
                            errors++;
                          }
                        } else {
                          const err285 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/7/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err285];
                          } else {
                            vErrors.push(err285);
                          }
                          errors++;
                        }
                      }
                      if (data.runId !== void 0) {
                        let data87 = data.runId;
                        if (typeof data87 === "string") {
                          if (!pattern0.test(data87)) {
                            const err286 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/7/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                            if (vErrors === null) {
                              vErrors = [err286];
                            } else {
                              vErrors.push(err286);
                            }
                            errors++;
                          }
                        } else {
                          const err287 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/7/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err287];
                          } else {
                            vErrors.push(err287);
                          }
                          errors++;
                        }
                      }
                      if (data.interactionId !== void 0) {
                        let data88 = data.interactionId;
                        if (typeof data88 === "string") {
                          if (!pattern0.test(data88)) {
                            const err288 = { instancePath: instancePath + "/interactionId", schemaPath: "#/anyOf/7/properties/interactionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                            if (vErrors === null) {
                              vErrors = [err288];
                            } else {
                              vErrors.push(err288);
                            }
                            errors++;
                          }
                        } else {
                          const err289 = { instancePath: instancePath + "/interactionId", schemaPath: "#/anyOf/7/properties/interactionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err289];
                          } else {
                            vErrors.push(err289);
                          }
                          errors++;
                        }
                      }
                      if (data.kind !== void 0) {
                        let data89 = data.kind;
                        if (typeof data89 !== "string") {
                          const err290 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserInteractionKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err290];
                          } else {
                            vErrors.push(err290);
                          }
                          errors++;
                        }
                        if (!(data89 === "question" || data89 === "task_approval" || data89 === "action_approval" || data89 === "action_recovery")) {
                          const err291 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserInteractionKind/enum", keyword: "enum", params: { allowedValues: schema16.enum }, message: "must be equal to one of the allowed values" };
                          if (vErrors === null) {
                            vErrors = [err291];
                          } else {
                            vErrors.push(err291);
                          }
                          errors++;
                        }
                      }
                    } else {
                      const err292 = { instancePath, schemaPath: "#/anyOf/7/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                      if (vErrors === null) {
                        vErrors = [err292];
                      } else {
                        vErrors.push(err292);
                      }
                      errors++;
                    }
                    var _valid0 = _errs224 === errors;
                    valid0 = valid0 || _valid0;
                    if (!valid0) {
                      const _errs238 = errors;
                      if (data && typeof data == "object" && !Array.isArray(data)) {
                        if (data.type === void 0) {
                          const err293 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                          if (vErrors === null) {
                            vErrors = [err293];
                          } else {
                            vErrors.push(err293);
                          }
                          errors++;
                        }
                        if (data.goalId === void 0) {
                          const err294 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                          if (vErrors === null) {
                            vErrors = [err294];
                          } else {
                            vErrors.push(err294);
                          }
                          errors++;
                        }
                        if (data.runId === void 0) {
                          const err295 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                          if (vErrors === null) {
                            vErrors = [err295];
                          } else {
                            vErrors.push(err295);
                          }
                          errors++;
                        }
                        if (data.interactionId === void 0) {
                          const err296 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "interactionId" }, message: "must have required property 'interactionId'" };
                          if (vErrors === null) {
                            vErrors = [err296];
                          } else {
                            vErrors.push(err296);
                          }
                          errors++;
                        }
                        if (data.kind === void 0) {
                          const err297 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                          if (vErrors === null) {
                            vErrors = [err297];
                          } else {
                            vErrors.push(err297);
                          }
                          errors++;
                        }
                        for (const key19 in data) {
                          if (!(key19 === "type" || key19 === "goalId" || key19 === "runId" || key19 === "interactionId" || key19 === "kind")) {
                            const err298 = { instancePath, schemaPath: "#/anyOf/8/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key19 }, message: "must NOT have additional properties" };
                            if (vErrors === null) {
                              vErrors = [err298];
                            } else {
                              vErrors.push(err298);
                            }
                            errors++;
                          }
                        }
                        if (data.type !== void 0) {
                          let data90 = data.type;
                          if (typeof data90 !== "string") {
                            const err299 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/8/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err299];
                            } else {
                              vErrors.push(err299);
                            }
                            errors++;
                          }
                          if ("interaction_settled" !== data90) {
                            const err300 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/8/properties/type/const", keyword: "const", params: { allowedValue: "interaction_settled" }, message: "must be equal to constant" };
                            if (vErrors === null) {
                              vErrors = [err300];
                            } else {
                              vErrors.push(err300);
                            }
                            errors++;
                          }
                        }
                        if (data.goalId !== void 0) {
                          let data91 = data.goalId;
                          if (typeof data91 === "string") {
                            if (!pattern0.test(data91)) {
                              const err301 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/8/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                              if (vErrors === null) {
                                vErrors = [err301];
                              } else {
                                vErrors.push(err301);
                              }
                              errors++;
                            }
                          } else {
                            const err302 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/8/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err302];
                            } else {
                              vErrors.push(err302);
                            }
                            errors++;
                          }
                        }
                        if (data.runId !== void 0) {
                          let data92 = data.runId;
                          if (typeof data92 === "string") {
                            if (!pattern0.test(data92)) {
                              const err303 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/8/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                              if (vErrors === null) {
                                vErrors = [err303];
                              } else {
                                vErrors.push(err303);
                              }
                              errors++;
                            }
                          } else {
                            const err304 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/8/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err304];
                            } else {
                              vErrors.push(err304);
                            }
                            errors++;
                          }
                        }
                        if (data.interactionId !== void 0) {
                          let data93 = data.interactionId;
                          if (typeof data93 === "string") {
                            if (!pattern0.test(data93)) {
                              const err305 = { instancePath: instancePath + "/interactionId", schemaPath: "#/anyOf/8/properties/interactionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                              if (vErrors === null) {
                                vErrors = [err305];
                              } else {
                                vErrors.push(err305);
                              }
                              errors++;
                            }
                          } else {
                            const err306 = { instancePath: instancePath + "/interactionId", schemaPath: "#/anyOf/8/properties/interactionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err306];
                            } else {
                              vErrors.push(err306);
                            }
                            errors++;
                          }
                        }
                        if (data.kind !== void 0) {
                          let data94 = data.kind;
                          if (typeof data94 !== "string") {
                            const err307 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserInteractionKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err307];
                            } else {
                              vErrors.push(err307);
                            }
                            errors++;
                          }
                          if (!(data94 === "question" || data94 === "task_approval" || data94 === "action_approval" || data94 === "action_recovery")) {
                            const err308 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserInteractionKind/enum", keyword: "enum", params: { allowedValues: schema16.enum }, message: "must be equal to one of the allowed values" };
                            if (vErrors === null) {
                              vErrors = [err308];
                            } else {
                              vErrors.push(err308);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err309 = { instancePath, schemaPath: "#/anyOf/8/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                        if (vErrors === null) {
                          vErrors = [err309];
                        } else {
                          vErrors.push(err309);
                        }
                        errors++;
                      }
                      var _valid0 = _errs238 === errors;
                      valid0 = valid0 || _valid0;
                      if (!valid0) {
                        const _errs252 = errors;
                        if (data && typeof data == "object" && !Array.isArray(data)) {
                          if (data.type === void 0) {
                            const err310 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                            if (vErrors === null) {
                              vErrors = [err310];
                            } else {
                              vErrors.push(err310);
                            }
                            errors++;
                          }
                          if (data.goalId === void 0) {
                            const err311 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                            if (vErrors === null) {
                              vErrors = [err311];
                            } else {
                              vErrors.push(err311);
                            }
                            errors++;
                          }
                          if (data.runId === void 0) {
                            const err312 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                            if (vErrors === null) {
                              vErrors = [err312];
                            } else {
                              vErrors.push(err312);
                            }
                            errors++;
                          }
                          if (data.activity === void 0) {
                            const err313 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "activity" }, message: "must have required property 'activity'" };
                            if (vErrors === null) {
                              vErrors = [err313];
                            } else {
                              vErrors.push(err313);
                            }
                            errors++;
                          }
                          for (const key20 in data) {
                            if (!(key20 === "type" || key20 === "goalId" || key20 === "runId" || key20 === "activity")) {
                              const err314 = { instancePath, schemaPath: "#/anyOf/9/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key20 }, message: "must NOT have additional properties" };
                              if (vErrors === null) {
                                vErrors = [err314];
                              } else {
                                vErrors.push(err314);
                              }
                              errors++;
                            }
                          }
                          if (data.type !== void 0) {
                            let data95 = data.type;
                            if (typeof data95 !== "string") {
                              const err315 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/9/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err315];
                              } else {
                                vErrors.push(err315);
                              }
                              errors++;
                            }
                            if ("tool_activity" !== data95) {
                              const err316 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/9/properties/type/const", keyword: "const", params: { allowedValue: "tool_activity" }, message: "must be equal to constant" };
                              if (vErrors === null) {
                                vErrors = [err316];
                              } else {
                                vErrors.push(err316);
                              }
                              errors++;
                            }
                          }
                          if (data.goalId !== void 0) {
                            let data96 = data.goalId;
                            if (typeof data96 === "string") {
                              if (!pattern0.test(data96)) {
                                const err317 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/9/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                if (vErrors === null) {
                                  vErrors = [err317];
                                } else {
                                  vErrors.push(err317);
                                }
                                errors++;
                              }
                            } else {
                              const err318 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/9/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err318];
                              } else {
                                vErrors.push(err318);
                              }
                              errors++;
                            }
                          }
                          if (data.runId !== void 0) {
                            let data97 = data.runId;
                            if (typeof data97 === "string") {
                              if (!pattern0.test(data97)) {
                                const err319 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/9/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                if (vErrors === null) {
                                  vErrors = [err319];
                                } else {
                                  vErrors.push(err319);
                                }
                                errors++;
                              }
                            } else {
                              const err320 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/9/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err320];
                              } else {
                                vErrors.push(err320);
                              }
                              errors++;
                            }
                          }
                          if (data.activity !== void 0) {
                            let data98 = data.activity;
                            if (data98 && typeof data98 == "object" && !Array.isArray(data98)) {
                              if (data98.actionId === void 0) {
                                const err321 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserToolActivity/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                                if (vErrors === null) {
                                  vErrors = [err321];
                                } else {
                                  vErrors.push(err321);
                                }
                                errors++;
                              }
                              if (data98.phase === void 0) {
                                const err322 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserToolActivity/required", keyword: "required", params: { missingProperty: "phase" }, message: "must have required property 'phase'" };
                                if (vErrors === null) {
                                  vErrors = [err322];
                                } else {
                                  vErrors.push(err322);
                                }
                                errors++;
                              }
                              for (const key21 in data98) {
                                if (!(key21 === "actionId" || key21 === "executionUnitId" || key21 === "toolId" || key21 === "attempt" || key21 === "phase" || key21 === "outcome" || key21 === "summary" || key21 === "reason")) {
                                  const err323 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserToolActivity/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key21 }, message: "must NOT have additional properties" };
                                  if (vErrors === null) {
                                    vErrors = [err323];
                                  } else {
                                    vErrors.push(err323);
                                  }
                                  errors++;
                                }
                              }
                              if (data98.actionId !== void 0) {
                                let data99 = data98.actionId;
                                if (typeof data99 === "string") {
                                  if (!pattern0.test(data99)) {
                                    const err324 = { instancePath: instancePath + "/activity/actionId", schemaPath: "#/definitions/BrowserToolActivity/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                    if (vErrors === null) {
                                      vErrors = [err324];
                                    } else {
                                      vErrors.push(err324);
                                    }
                                    errors++;
                                  }
                                } else {
                                  const err325 = { instancePath: instancePath + "/activity/actionId", schemaPath: "#/definitions/BrowserToolActivity/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err325];
                                  } else {
                                    vErrors.push(err325);
                                  }
                                  errors++;
                                }
                              }
                              if (data98.executionUnitId !== void 0) {
                                let data100 = data98.executionUnitId;
                                if (typeof data100 === "string") {
                                  if (!pattern0.test(data100)) {
                                    const err326 = { instancePath: instancePath + "/activity/executionUnitId", schemaPath: "#/definitions/BrowserToolActivity/properties/executionUnitId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                    if (vErrors === null) {
                                      vErrors = [err326];
                                    } else {
                                      vErrors.push(err326);
                                    }
                                    errors++;
                                  }
                                } else {
                                  const err327 = { instancePath: instancePath + "/activity/executionUnitId", schemaPath: "#/definitions/BrowserToolActivity/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err327];
                                  } else {
                                    vErrors.push(err327);
                                  }
                                  errors++;
                                }
                              }
                              if (data98.toolId !== void 0) {
                                let data101 = data98.toolId;
                                if (typeof data101 === "string") {
                                  if (!pattern0.test(data101)) {
                                    const err328 = { instancePath: instancePath + "/activity/toolId", schemaPath: "#/definitions/BrowserToolActivity/properties/toolId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                    if (vErrors === null) {
                                      vErrors = [err328];
                                    } else {
                                      vErrors.push(err328);
                                    }
                                    errors++;
                                  }
                                } else {
                                  const err329 = { instancePath: instancePath + "/activity/toolId", schemaPath: "#/definitions/BrowserToolActivity/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err329];
                                  } else {
                                    vErrors.push(err329);
                                  }
                                  errors++;
                                }
                              }
                              if (data98.attempt !== void 0) {
                                let data102 = data98.attempt;
                                if (!(typeof data102 == "number" && (!(data102 % 1) && !isNaN(data102)) && isFinite(data102))) {
                                  const err330 = { instancePath: instancePath + "/activity/attempt", schemaPath: "#/definitions/BrowserToolActivity/properties/attempt/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                  if (vErrors === null) {
                                    vErrors = [err330];
                                  } else {
                                    vErrors.push(err330);
                                  }
                                  errors++;
                                }
                                if (typeof data102 == "number" && isFinite(data102)) {
                                  if (data102 > 9007199254740991 || isNaN(data102)) {
                                    const err331 = { instancePath: instancePath + "/activity/attempt", schemaPath: "#/definitions/BrowserToolActivity/properties/attempt/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                                    if (vErrors === null) {
                                      vErrors = [err331];
                                    } else {
                                      vErrors.push(err331);
                                    }
                                    errors++;
                                  }
                                  if (data102 < 1 || isNaN(data102)) {
                                    const err332 = { instancePath: instancePath + "/activity/attempt", schemaPath: "#/definitions/BrowserToolActivity/properties/attempt/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                                    if (vErrors === null) {
                                      vErrors = [err332];
                                    } else {
                                      vErrors.push(err332);
                                    }
                                    errors++;
                                  }
                                }
                              }
                              if (data98.phase !== void 0) {
                                let data103 = data98.phase;
                                if (typeof data103 !== "string") {
                                  const err333 = { instancePath: instancePath + "/activity/phase", schemaPath: "#/definitions/BrowserToolActivity/properties/phase/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err333];
                                  } else {
                                    vErrors.push(err333);
                                  }
                                  errors++;
                                }
                                if (!(data103 === "started" || data103 === "attempting" || data103 === "retrying" || data103 === "result_pending" || data103 === "observed_committed" || data103 === "unknown")) {
                                  const err334 = { instancePath: instancePath + "/activity/phase", schemaPath: "#/definitions/BrowserToolActivity/properties/phase/enum", keyword: "enum", params: { allowedValues: schema57.properties.phase.enum }, message: "must be equal to one of the allowed values" };
                                  if (vErrors === null) {
                                    vErrors = [err334];
                                  } else {
                                    vErrors.push(err334);
                                  }
                                  errors++;
                                }
                              }
                              if (data98.outcome !== void 0) {
                                let data104 = data98.outcome;
                                if (typeof data104 !== "string") {
                                  const err335 = { instancePath: instancePath + "/activity/outcome", schemaPath: "#/definitions/BrowserToolActivity/properties/outcome/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err335];
                                  } else {
                                    vErrors.push(err335);
                                  }
                                  errors++;
                                }
                                if (!(data104 === "success" || data104 === "failure")) {
                                  const err336 = { instancePath: instancePath + "/activity/outcome", schemaPath: "#/definitions/BrowserToolActivity/properties/outcome/enum", keyword: "enum", params: { allowedValues: schema57.properties.outcome.enum }, message: "must be equal to one of the allowed values" };
                                  if (vErrors === null) {
                                    vErrors = [err336];
                                  } else {
                                    vErrors.push(err336);
                                  }
                                  errors++;
                                }
                              }
                              if (data98.summary !== void 0) {
                                if (typeof data98.summary !== "string") {
                                  const err337 = { instancePath: instancePath + "/activity/summary", schemaPath: "#/definitions/BrowserToolActivity/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err337];
                                  } else {
                                    vErrors.push(err337);
                                  }
                                  errors++;
                                }
                              }
                              if (data98.reason !== void 0) {
                                if (typeof data98.reason !== "string") {
                                  const err338 = { instancePath: instancePath + "/activity/reason", schemaPath: "#/definitions/BrowserToolActivity/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err338];
                                  } else {
                                    vErrors.push(err338);
                                  }
                                  errors++;
                                }
                              }
                            } else {
                              const err339 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserToolActivity/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                              if (vErrors === null) {
                                vErrors = [err339];
                              } else {
                                vErrors.push(err339);
                              }
                              errors++;
                            }
                          }
                        } else {
                          const err340 = { instancePath, schemaPath: "#/anyOf/9/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                          if (vErrors === null) {
                            vErrors = [err340];
                          } else {
                            vErrors.push(err340);
                          }
                          errors++;
                        }
                        var _valid0 = _errs252 === errors;
                        valid0 = valid0 || _valid0;
                        if (!valid0) {
                          const _errs281 = errors;
                          if (data && typeof data == "object" && !Array.isArray(data)) {
                            if (data.type === void 0) {
                              const err341 = { instancePath, schemaPath: "#/anyOf/10/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                              if (vErrors === null) {
                                vErrors = [err341];
                              } else {
                                vErrors.push(err341);
                              }
                              errors++;
                            }
                            if (data.goalId === void 0) {
                              const err342 = { instancePath, schemaPath: "#/anyOf/10/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                              if (vErrors === null) {
                                vErrors = [err342];
                              } else {
                                vErrors.push(err342);
                              }
                              errors++;
                            }
                            if (data.code === void 0) {
                              const err343 = { instancePath, schemaPath: "#/anyOf/10/required", keyword: "required", params: { missingProperty: "code" }, message: "must have required property 'code'" };
                              if (vErrors === null) {
                                vErrors = [err343];
                              } else {
                                vErrors.push(err343);
                              }
                              errors++;
                            }
                            if (data.resync === void 0) {
                              const err344 = { instancePath, schemaPath: "#/anyOf/10/required", keyword: "required", params: { missingProperty: "resync" }, message: "must have required property 'resync'" };
                              if (vErrors === null) {
                                vErrors = [err344];
                              } else {
                                vErrors.push(err344);
                              }
                              errors++;
                            }
                            for (const key22 in data) {
                              if (!(key22 === "type" || key22 === "goalId" || key22 === "code" || key22 === "resync")) {
                                const err345 = { instancePath, schemaPath: "#/anyOf/10/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key22 }, message: "must NOT have additional properties" };
                                if (vErrors === null) {
                                  vErrors = [err345];
                                } else {
                                  vErrors.push(err345);
                                }
                                errors++;
                              }
                            }
                            if (data.type !== void 0) {
                              let data107 = data.type;
                              if (typeof data107 !== "string") {
                                const err346 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/10/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err346];
                                } else {
                                  vErrors.push(err346);
                                }
                                errors++;
                              }
                              if ("stream_fault" !== data107) {
                                const err347 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/10/properties/type/const", keyword: "const", params: { allowedValue: "stream_fault" }, message: "must be equal to constant" };
                                if (vErrors === null) {
                                  vErrors = [err347];
                                } else {
                                  vErrors.push(err347);
                                }
                                errors++;
                              }
                            }
                            if (data.goalId !== void 0) {
                              let data108 = data.goalId;
                              if (typeof data108 === "string") {
                                if (!pattern0.test(data108)) {
                                  const err348 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/10/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                  if (vErrors === null) {
                                    vErrors = [err348];
                                  } else {
                                    vErrors.push(err348);
                                  }
                                  errors++;
                                }
                              } else {
                                const err349 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/10/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err349];
                                } else {
                                  vErrors.push(err349);
                                }
                                errors++;
                              }
                            }
                            if (data.code !== void 0) {
                              let data109 = data.code;
                              if (typeof data109 !== "string") {
                                const err350 = { instancePath: instancePath + "/code", schemaPath: "#/anyOf/10/properties/code/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err350];
                                } else {
                                  vErrors.push(err350);
                                }
                                errors++;
                              }
                              if (!(data109 === "gap" || data109 === "read_failed" || data109 === "backpressure" || data109 === "publisher_closed")) {
                                const err351 = { instancePath: instancePath + "/code", schemaPath: "#/anyOf/10/properties/code/enum", keyword: "enum", params: { allowedValues: schema12.anyOf[10].properties.code.enum }, message: "must be equal to one of the allowed values" };
                                if (vErrors === null) {
                                  vErrors = [err351];
                                } else {
                                  vErrors.push(err351);
                                }
                                errors++;
                              }
                            }
                            if (data.resync !== void 0) {
                              let data110 = data.resync;
                              if (Array.isArray(data110)) {
                                if (data110.length < 1) {
                                  const err352 = { instancePath: instancePath + "/resync", schemaPath: "#/anyOf/10/properties/resync/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
                                  if (vErrors === null) {
                                    vErrors = [err352];
                                  } else {
                                    vErrors.push(err352);
                                  }
                                  errors++;
                                }
                                const len1 = data110.length;
                                for (let i1 = 0; i1 < len1; i1++) {
                                  let data111 = data110[i1];
                                  if (typeof data111 !== "string") {
                                    const err353 = { instancePath: instancePath + "/resync/" + i1, schemaPath: "#/definitions/BrowserControlScope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err353];
                                    } else {
                                      vErrors.push(err353);
                                    }
                                    errors++;
                                  }
                                  if (!(data111 === "session" || data111 === "activity" || data111 === "trajectory" || data111 === "metrics" || data111 === "goals" || data111 === "grants" || data111 === "permission" || data111 === "model")) {
                                    const err354 = { instancePath: instancePath + "/resync/" + i1, schemaPath: "#/definitions/BrowserControlScope/enum", keyword: "enum", params: { allowedValues: schema53.enum }, message: "must be equal to one of the allowed values" };
                                    if (vErrors === null) {
                                      vErrors = [err354];
                                    } else {
                                      vErrors.push(err354);
                                    }
                                    errors++;
                                  }
                                }
                              } else {
                                const err355 = { instancePath: instancePath + "/resync", schemaPath: "#/anyOf/10/properties/resync/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                                if (vErrors === null) {
                                  vErrors = [err355];
                                } else {
                                  vErrors.push(err355);
                                }
                                errors++;
                              }
                            }
                          } else {
                            const err356 = { instancePath, schemaPath: "#/anyOf/10/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                            if (vErrors === null) {
                              vErrors = [err356];
                            } else {
                              vErrors.push(err356);
                            }
                            errors++;
                          }
                          var _valid0 = _errs281 === errors;
                          valid0 = valid0 || _valid0;
                          if (!valid0) {
                            const _errs295 = errors;
                            if (data && typeof data == "object" && !Array.isArray(data)) {
                              if (data.type === void 0) {
                                const err357 = { instancePath, schemaPath: "#/anyOf/11/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                                if (vErrors === null) {
                                  vErrors = [err357];
                                } else {
                                  vErrors.push(err357);
                                }
                                errors++;
                              }
                              if (data.goalId === void 0) {
                                const err358 = { instancePath, schemaPath: "#/anyOf/11/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                                if (vErrors === null) {
                                  vErrors = [err358];
                                } else {
                                  vErrors.push(err358);
                                }
                                errors++;
                              }
                              if (data.reason === void 0) {
                                const err359 = { instancePath, schemaPath: "#/anyOf/11/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
                                if (vErrors === null) {
                                  vErrors = [err359];
                                } else {
                                  vErrors.push(err359);
                                }
                                errors++;
                              }
                              for (const key23 in data) {
                                if (!(key23 === "type" || key23 === "goalId" || key23 === "reason")) {
                                  const err360 = { instancePath, schemaPath: "#/anyOf/11/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key23 }, message: "must NOT have additional properties" };
                                  if (vErrors === null) {
                                    vErrors = [err360];
                                  } else {
                                    vErrors.push(err360);
                                  }
                                  errors++;
                                }
                              }
                              if (data.type !== void 0) {
                                let data112 = data.type;
                                if (typeof data112 !== "string") {
                                  const err361 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/11/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err361];
                                  } else {
                                    vErrors.push(err361);
                                  }
                                  errors++;
                                }
                                if ("closed" !== data112) {
                                  const err362 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/11/properties/type/const", keyword: "const", params: { allowedValue: "closed" }, message: "must be equal to constant" };
                                  if (vErrors === null) {
                                    vErrors = [err362];
                                  } else {
                                    vErrors.push(err362);
                                  }
                                  errors++;
                                }
                              }
                              if (data.goalId !== void 0) {
                                let data113 = data.goalId;
                                if (typeof data113 === "string") {
                                  if (!pattern0.test(data113)) {
                                    const err363 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/11/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                    if (vErrors === null) {
                                      vErrors = [err363];
                                    } else {
                                      vErrors.push(err363);
                                    }
                                    errors++;
                                  }
                                } else {
                                  const err364 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/11/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err364];
                                  } else {
                                    vErrors.push(err364);
                                  }
                                  errors++;
                                }
                              }
                              if (data.reason !== void 0) {
                                let data114 = data.reason;
                                if (typeof data114 !== "string") {
                                  const err365 = { instancePath: instancePath + "/reason", schemaPath: "#/anyOf/11/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err365];
                                  } else {
                                    vErrors.push(err365);
                                  }
                                  errors++;
                                }
                                if (!(data114 === "backpressure" || data114 === "closed" || data114 === "publisher_closed")) {
                                  const err366 = { instancePath: instancePath + "/reason", schemaPath: "#/anyOf/11/properties/reason/enum", keyword: "enum", params: { allowedValues: schema12.anyOf[11].properties.reason.enum }, message: "must be equal to one of the allowed values" };
                                  if (vErrors === null) {
                                    vErrors = [err366];
                                  } else {
                                    vErrors.push(err366);
                                  }
                                  errors++;
                                }
                              }
                            } else {
                              const err367 = { instancePath, schemaPath: "#/anyOf/11/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                              if (vErrors === null) {
                                vErrors = [err367];
                              } else {
                                vErrors.push(err367);
                              }
                              errors++;
                            }
                            var _valid0 = _errs295 === errors;
                            valid0 = valid0 || _valid0;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      if (!valid0) {
        const err368 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err368];
        } else {
          vErrors.push(err368);
        }
        errors++;
      } else {
        errors = _errs0;
        if (vErrors !== null) {
          if (_errs0) {
            vErrors.length = _errs0;
          } else {
            vErrors = null;
          }
        }
      }
      validate11.errors = vErrors;
      return errors === 0;
    }
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (!validate11(data, { instancePath, parentData, parentDataProperty, rootData })) {
        vErrors = vErrors === null ? validate11.errors : vErrors.concat(validate11.errors);
        errors = vErrors.length;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_BrowserGoalEvent_validator();
