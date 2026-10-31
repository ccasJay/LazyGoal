var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserGoalLiveEvent-validator.cjs
var require_BrowserGoalLiveEvent_validator = __commonJS({
  "BrowserGoalLiveEvent-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema26 = { "anyOf": [{ "type": "object", "properties": { "kind": { "type": "string", "const": "assistant_text_delta" }, "text": { "type": "string" }, "truncated": { "type": "boolean" }, "sourceEventId": { "type": "string", "pattern": "\\S" }, "sourceCursor": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 } }, "required": ["kind", "text", "truncated", "sourceEventId", "sourceCursor"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "model_started" }, "stage": { "type": "string", "enum": ["think", "decide", "completion_review"] }, "modelCallId": { "type": "string", "pattern": "\\S" }, "executionUnitId": { "type": "string", "pattern": "\\S" }, "occurredAt": { "type": "string" } }, "required": ["kind"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "model_completed" } }, "required": ["kind"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "step_started" } }, "required": ["kind"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "tool_started" }, "sourceEventId": { "type": "string", "pattern": "\\S" }, "sourceCursor": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "actionId": { "type": "string", "pattern": "\\S" }, "executionUnitId": { "type": "string", "pattern": "\\S" }, "toolId": { "type": "string", "pattern": "\\S" }, "inputSummary": { "type": "string" } }, "required": ["kind", "sourceEventId", "sourceCursor", "actionId", "executionUnitId", "toolId"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "tool_finished" }, "sourceEventId": { "type": "string", "pattern": "\\S" }, "sourceCursor": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "actionId": { "type": "string", "pattern": "\\S" }, "toolId": { "type": "string", "pattern": "\\S" }, "outcome": { "type": "string", "enum": ["success", "failure"] }, "summary": { "type": "string" } }, "required": ["kind", "sourceEventId", "sourceCursor", "actionId", "toolId", "outcome"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "tool_attempt_started" }, "sourceEventId": { "type": "string", "pattern": "\\S" }, "sourceCursor": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "actionId": { "type": "string", "pattern": "\\S" }, "attempt": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 } }, "required": ["kind", "sourceEventId", "sourceCursor", "actionId", "attempt"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "tool_attempt_failed" }, "sourceEventId": { "type": "string", "pattern": "\\S" }, "sourceCursor": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "actionId": { "type": "string", "pattern": "\\S" }, "attempt": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "reason": { "type": "string" } }, "required": ["kind", "sourceEventId", "sourceCursor", "actionId", "attempt", "reason"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "activity_boundary" }, "sourceEventId": { "type": "string", "pattern": "\\S" }, "sourceCursor": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "reason": { "type": "string", "enum": ["assistant_reply", "user_wait", "stage_change", "terminal", "failure", "unknown"] } }, "required": ["kind", "sourceEventId", "sourceCursor", "reason"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "candidate_preview" }, "sourceEventId": { "type": "string", "pattern": "\\S" }, "sourceCursor": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "candidateId": { "type": "string", "pattern": "\\S" }, "text": { "type": "string" }, "startOffset": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "truncated": { "type": "boolean" }, "complete": { "type": "boolean" } }, "required": ["kind", "sourceEventId", "sourceCursor", "candidateId", "text", "startOffset", "truncated", "complete"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "candidate_invalidated" }, "sourceEventId": { "type": "string", "pattern": "\\S" }, "sourceCursor": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "candidateId": { "type": "string", "pattern": "\\S" }, "reason": { "type": "string", "enum": ["rejected", "cancelled", "failed", "replaced", "ambiguous"] } }, "required": ["kind", "sourceEventId", "sourceCursor", "candidateId", "reason"], "additionalProperties": false }], "description": "\u5B9E\u65F6\u6267\u884C\u6D3B\u52A8\u4E8B\u4EF6\u7684\u7A33\u5B9A\u8054\u5408\u3002" };
    var schema29 = { "type": "object", "properties": { "interactionId": { "type": "string", "pattern": "\\S" }, "kind": { "type": "string", "enum": ["ask_user", "task_approval", "action_approval", "action_recovery"] }, "runId": { "type": "string", "pattern": "\\S" } }, "required": ["interactionId", "kind", "runId"], "additionalProperties": false, "description": "\u4EA4\u4E92\u8981\u6C42\u7684\u5B9E\u65F6\u63A8\u9001\u6458\u8981\u3002" };
    var pattern0 = new RegExp("\\S", "u");
    var schema13 = { "type": "object", "properties": { "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "runStatus": { "$ref": "#/definitions/BrowserRunStatus" }, "mode": { "type": "string", "enum": ["normal", "plan"] }, "commitRevision": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "queueRevision": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "queuePaused": { "type": "boolean" }, "queuePauseReason": { "type": "string", "enum": ["run_failed", "user_interrupt"] }, "pendingMessageCount": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "pendingSteerCount": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "waitingFor": { "type": "string", "enum": ["ask_user", "task_approval", "action_approval", "action_recovery", "blocked"] }, "interaction": { "$ref": "#/definitions/BrowserSessionStateInteraction" }, "messages": { "type": "object", "properties": { "count": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "throughMessageId": { "type": "string", "pattern": "\\S" }, "recent": { "type": "array", "items": { "$ref": "#/definitions/BrowserSessionStateMessage" } } }, "required": ["count", "recent"], "additionalProperties": false }, "needsRecovery": { "type": "boolean" }, "interruption": { "$ref": "#/definitions/BrowserSessionStateInterruption" }, "executionOwner": { "type": "boolean" } }, "required": ["goalId", "runId", "runStatus", "mode", "commitRevision", "queueRevision", "queuePaused", "pendingMessageCount", "pendingSteerCount", "messages", "needsRecovery", "executionOwner"], "additionalProperties": false, "description": "\u5B89\u5168\u4F1A\u8BDD\u72B6\u6001\u6295\u5F71\u3002" };
    var schema14 = { "type": "string", "enum": ["created", "running", "waiting", "completed", "failed", "cancelled"], "description": "Run \u751F\u547D\u5468\u671F\u72B6\u6001\u3002" };
    var schema19 = { "type": "object", "properties": { "requestId": { "type": "string", "pattern": "\\S" }, "status": { "type": "string", "enum": ["requested", "finished"] }, "outcomeUnknown": { "type": "boolean" } }, "required": ["requestId", "status", "outcomeUnknown"], "additionalProperties": false, "description": "\u5F53\u524D Run \u7684\u7528\u6237\u4E2D\u65AD\u72B6\u6001\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    var schema16 = { "type": "string", "enum": ["question", "task_approval", "action_approval", "action_recovery"], "description": "\u5F53\u524D\u4EA4\u4E92\u89C6\u56FE\u7684\u79CD\u7C7B\u3002" };
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
    var schema21 = { "type": "string", "enum": ["message", "steer", "interrupt", "respond", "resume", "queue_control"], "description": "\u4F1A\u8BDD\u8F93\u5165\u79CD\u7C7B\u3002" };
    var schema25 = { "type": "string", "enum": ["INVALID_INPUT", "INPUT_CONFLICT", "INPUT_NOT_FOUND", "GOAL_NOT_FOUND", "BUSY", "STEER_CONFLICT", "INTERRUPT_CONFLICT", "STALE_REVISION", "INTERACTION_MISMATCH", "INTERACTION_REQUIRED", "QUEUE_PAUSED", "RUN_NOT_RESUMABLE", "QUEUE_FULL", "QUEUE_TEXT_TOO_LARGE", "TEXT_TOO_LARGE", "QUEUE_NOT_PAUSED", "QUEUE_REVISION_MISMATCH", "QUEUED_MESSAGE_NOT_FOUND", "RUN_NOT_FOUND", "RUN_NOT_RUNNING", "RUN_CONTROL_UNAVAILABLE", "input_admission_failed", "session_unavailable"], "description": "\u8F93\u5165\u53D7\u7406\u4E0E\u67E5\u8BE2\u7684\u7A33\u5B9A wire \u62D2\u7EDD\u4EE3\u7801\u3002" };
    var schema22 = { "type": "object", "properties": { "goalId": { "type": "string", "pattern": "\\S" }, "inputId": { "type": "string", "pattern": "\\S" }, "kind": { "$ref": "#/definitions/BrowserSessionInputKind" }, "sequence": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "status": { "$ref": "#/definitions/BrowserSessionInputStatus" }, "admittedAtRevision": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "targetRunId": { "type": "string", "pattern": "\\S" }, "appliedRunId": { "type": "string", "pattern": "\\S" }, "messageIndex": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 } }, "required": ["goalId", "inputId", "kind", "sequence", "status", "admittedAtRevision"], "additionalProperties": false, "description": "\u4E00\u6761\u5DF2\u6301\u4E45\u5316\u8F93\u5165\u7684\u53D7\u7406\u6536\u636E\u6295\u5F71\u3002" };
    var schema24 = { "type": "string", "enum": ["pending", "applied", "cleared"], "description": "\u8F93\u5165\u8D26\u672C\u4E2D\u7684\u53D7\u7406\u72B6\u6001\u3002" };
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
          if (!func2.call(schema22.properties, key0)) {
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
            const err12 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserSessionInputKind/enum", keyword: "enum", params: { allowedValues: schema21.enum }, message: "must be equal to one of the allowed values" };
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
            const err17 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/BrowserSessionInputStatus/enum", keyword: "enum", params: { allowedValues: schema24.enum }, message: "must be equal to one of the allowed values" };
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
      validate19.errors = vErrors;
      return errors === 0;
    }
    function validate18(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
            const err10 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserSessionInputKind/enum", keyword: "enum", params: { allowedValues: schema21.enum }, message: "must be equal to one of the allowed values" };
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
          if (!validate19(data.receipt, { instancePath: instancePath + "/receipt", parentData: data, parentDataProperty: "receipt", rootData })) {
            vErrors = vErrors === null ? validate19.errors : vErrors.concat(validate19.errors);
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
            const err14 = { instancePath: instancePath + "/code", schemaPath: "#/definitions/BrowserSessionInputErrorCode/enum", keyword: "enum", params: { allowedValues: schema25.enum }, message: "must be equal to one of the allowed values" };
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
      validate18.errors = vErrors;
      return errors === 0;
    }
    var schema27 = { "type": "object", "properties": { "messageId": { "type": "string", "pattern": "\\S" }, "role": { "type": "string", "enum": ["user", "assistant"] }, "runId": { "type": "string", "pattern": "\\S" }, "position": { "$ref": "#/definitions/BrowserMessagePosition" }, "purpose": { "type": "string", "enum": ["process", "answer", "notice"] }, "commitRevision": { "type": "integer", "maximum": 9007199254740991 }, "previewId": { "type": "string", "pattern": "\\S" } }, "required": ["messageId", "role", "runId", "position", "commitRevision"], "additionalProperties": false, "description": "\u5DF2\u63D0\u4EA4\u6D88\u606F\u7684\u5B9E\u65F6\u63A8\u9001\u6458\u8981\u3002" };
    function validate22(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
            const err9 = { instancePath: instancePath + "/role", schemaPath: "#/properties/role/enum", keyword: "enum", params: { allowedValues: schema27.properties.role.enum }, message: "must be equal to one of the allowed values" };
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
            const err23 = { instancePath: instancePath + "/purpose", schemaPath: "#/properties/purpose/enum", keyword: "enum", params: { allowedValues: schema27.properties.purpose.enum }, message: "must be equal to one of the allowed values" };
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
      validate22.errors = vErrors;
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
          if (!(key0 === "type" || key0 === "goalId" || key0 === "state")) {
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
        const _errs9 = errors;
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
            let data3 = data.type;
            if (typeof data3 !== "string") {
              const err13 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/1/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            if ("input_result" !== data3) {
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
            let data4 = data.goalId;
            if (typeof data4 === "string") {
              if (!pattern0.test(data4)) {
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
            if (!validate18(data.outcome, { instancePath: instancePath + "/outcome", parentData: data, parentDataProperty: "outcome", rootData })) {
              vErrors = vErrors === null ? validate18.errors : vErrors.concat(validate18.errors);
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
        var _valid0 = _errs9 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs17 = errors;
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
              let data6 = data.type;
              if (typeof data6 !== "string") {
                const err23 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/2/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
              if ("activity" !== data6) {
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
              let data7 = data.goalId;
              if (typeof data7 === "string") {
                if (!pattern0.test(data7)) {
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
              let data8 = data.runId;
              if (typeof data8 === "string") {
                if (!pattern0.test(data8)) {
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
              let data9 = data.activity;
              const _errs28 = errors;
              let valid5 = false;
              const _errs29 = errors;
              if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
                if (data9.kind === void 0) {
                  const err29 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err29];
                  } else {
                    vErrors.push(err29);
                  }
                  errors++;
                }
                if (data9.text === void 0) {
                  const err30 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/required", keyword: "required", params: { missingProperty: "text" }, message: "must have required property 'text'" };
                  if (vErrors === null) {
                    vErrors = [err30];
                  } else {
                    vErrors.push(err30);
                  }
                  errors++;
                }
                if (data9.truncated === void 0) {
                  const err31 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/required", keyword: "required", params: { missingProperty: "truncated" }, message: "must have required property 'truncated'" };
                  if (vErrors === null) {
                    vErrors = [err31];
                  } else {
                    vErrors.push(err31);
                  }
                  errors++;
                }
                if (data9.sourceEventId === void 0) {
                  const err32 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/required", keyword: "required", params: { missingProperty: "sourceEventId" }, message: "must have required property 'sourceEventId'" };
                  if (vErrors === null) {
                    vErrors = [err32];
                  } else {
                    vErrors.push(err32);
                  }
                  errors++;
                }
                if (data9.sourceCursor === void 0) {
                  const err33 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/required", keyword: "required", params: { missingProperty: "sourceCursor" }, message: "must have required property 'sourceCursor'" };
                  if (vErrors === null) {
                    vErrors = [err33];
                  } else {
                    vErrors.push(err33);
                  }
                  errors++;
                }
                for (const key3 in data9) {
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
                if (data9.kind !== void 0) {
                  let data10 = data9.kind;
                  if (typeof data10 !== "string") {
                    const err35 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err35];
                    } else {
                      vErrors.push(err35);
                    }
                    errors++;
                  }
                  if ("assistant_text_delta" !== data10) {
                    const err36 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "assistant_text_delta" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err36];
                    } else {
                      vErrors.push(err36);
                    }
                    errors++;
                  }
                }
                if (data9.text !== void 0) {
                  if (typeof data9.text !== "string") {
                    const err37 = { instancePath: instancePath + "/activity/text", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err37];
                    } else {
                      vErrors.push(err37);
                    }
                    errors++;
                  }
                }
                if (data9.truncated !== void 0) {
                  if (typeof data9.truncated !== "boolean") {
                    const err38 = { instancePath: instancePath + "/activity/truncated", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/properties/truncated/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                    if (vErrors === null) {
                      vErrors = [err38];
                    } else {
                      vErrors.push(err38);
                    }
                    errors++;
                  }
                }
                if (data9.sourceEventId !== void 0) {
                  let data13 = data9.sourceEventId;
                  if (typeof data13 === "string") {
                    if (!pattern0.test(data13)) {
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
                if (data9.sourceCursor !== void 0) {
                  let data14 = data9.sourceCursor;
                  if (!(typeof data14 == "number" && (!(data14 % 1) && !isNaN(data14)) && isFinite(data14))) {
                    const err41 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/properties/sourceCursor/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err41];
                    } else {
                      vErrors.push(err41);
                    }
                    errors++;
                  }
                  if (typeof data14 == "number" && isFinite(data14)) {
                    if (data14 > 9007199254740991 || isNaN(data14)) {
                      const err42 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/0/properties/sourceCursor/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err42];
                      } else {
                        vErrors.push(err42);
                      }
                      errors++;
                    }
                    if (data14 < 1 || isNaN(data14)) {
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
              var _valid1 = _errs29 === errors;
              valid5 = valid5 || _valid1;
              if (!valid5) {
                const _errs42 = errors;
                if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
                  if (data9.kind === void 0) {
                    const err45 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                    if (vErrors === null) {
                      vErrors = [err45];
                    } else {
                      vErrors.push(err45);
                    }
                    errors++;
                  }
                  for (const key4 in data9) {
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
                  if (data9.kind !== void 0) {
                    let data15 = data9.kind;
                    if (typeof data15 !== "string") {
                      const err47 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err47];
                      } else {
                        vErrors.push(err47);
                      }
                      errors++;
                    }
                    if ("model_started" !== data15) {
                      const err48 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "model_started" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err48];
                      } else {
                        vErrors.push(err48);
                      }
                      errors++;
                    }
                  }
                  if (data9.stage !== void 0) {
                    let data16 = data9.stage;
                    if (typeof data16 !== "string") {
                      const err49 = { instancePath: instancePath + "/activity/stage", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/1/properties/stage/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err49];
                      } else {
                        vErrors.push(err49);
                      }
                      errors++;
                    }
                    if (!(data16 === "think" || data16 === "decide" || data16 === "completion_review")) {
                      const err50 = { instancePath: instancePath + "/activity/stage", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/1/properties/stage/enum", keyword: "enum", params: { allowedValues: schema26.anyOf[1].properties.stage.enum }, message: "must be equal to one of the allowed values" };
                      if (vErrors === null) {
                        vErrors = [err50];
                      } else {
                        vErrors.push(err50);
                      }
                      errors++;
                    }
                  }
                  if (data9.modelCallId !== void 0) {
                    let data17 = data9.modelCallId;
                    if (typeof data17 === "string") {
                      if (!pattern0.test(data17)) {
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
                  if (data9.executionUnitId !== void 0) {
                    let data18 = data9.executionUnitId;
                    if (typeof data18 === "string") {
                      if (!pattern0.test(data18)) {
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
                  if (data9.occurredAt !== void 0) {
                    if (typeof data9.occurredAt !== "string") {
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
                var _valid1 = _errs42 === errors;
                valid5 = valid5 || _valid1;
                if (!valid5) {
                  const _errs55 = errors;
                  if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
                    if (data9.kind === void 0) {
                      const err57 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/2/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                      if (vErrors === null) {
                        vErrors = [err57];
                      } else {
                        vErrors.push(err57);
                      }
                      errors++;
                    }
                    for (const key5 in data9) {
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
                    if (data9.kind !== void 0) {
                      let data20 = data9.kind;
                      if (typeof data20 !== "string") {
                        const err59 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/2/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err59];
                        } else {
                          vErrors.push(err59);
                        }
                        errors++;
                      }
                      if ("model_completed" !== data20) {
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
                  var _valid1 = _errs55 === errors;
                  valid5 = valid5 || _valid1;
                  if (!valid5) {
                    const _errs60 = errors;
                    if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
                      if (data9.kind === void 0) {
                        const err62 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/3/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                        if (vErrors === null) {
                          vErrors = [err62];
                        } else {
                          vErrors.push(err62);
                        }
                        errors++;
                      }
                      for (const key6 in data9) {
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
                      if (data9.kind !== void 0) {
                        let data21 = data9.kind;
                        if (typeof data21 !== "string") {
                          const err64 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/3/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err64];
                          } else {
                            vErrors.push(err64);
                          }
                          errors++;
                        }
                        if ("step_started" !== data21) {
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
                    var _valid1 = _errs60 === errors;
                    valid5 = valid5 || _valid1;
                    if (!valid5) {
                      const _errs65 = errors;
                      if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
                        if (data9.kind === void 0) {
                          const err67 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                          if (vErrors === null) {
                            vErrors = [err67];
                          } else {
                            vErrors.push(err67);
                          }
                          errors++;
                        }
                        if (data9.sourceEventId === void 0) {
                          const err68 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/required", keyword: "required", params: { missingProperty: "sourceEventId" }, message: "must have required property 'sourceEventId'" };
                          if (vErrors === null) {
                            vErrors = [err68];
                          } else {
                            vErrors.push(err68);
                          }
                          errors++;
                        }
                        if (data9.sourceCursor === void 0) {
                          const err69 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/required", keyword: "required", params: { missingProperty: "sourceCursor" }, message: "must have required property 'sourceCursor'" };
                          if (vErrors === null) {
                            vErrors = [err69];
                          } else {
                            vErrors.push(err69);
                          }
                          errors++;
                        }
                        if (data9.actionId === void 0) {
                          const err70 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                          if (vErrors === null) {
                            vErrors = [err70];
                          } else {
                            vErrors.push(err70);
                          }
                          errors++;
                        }
                        if (data9.executionUnitId === void 0) {
                          const err71 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/required", keyword: "required", params: { missingProperty: "executionUnitId" }, message: "must have required property 'executionUnitId'" };
                          if (vErrors === null) {
                            vErrors = [err71];
                          } else {
                            vErrors.push(err71);
                          }
                          errors++;
                        }
                        if (data9.toolId === void 0) {
                          const err72 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/required", keyword: "required", params: { missingProperty: "toolId" }, message: "must have required property 'toolId'" };
                          if (vErrors === null) {
                            vErrors = [err72];
                          } else {
                            vErrors.push(err72);
                          }
                          errors++;
                        }
                        for (const key7 in data9) {
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
                        if (data9.kind !== void 0) {
                          let data22 = data9.kind;
                          if (typeof data22 !== "string") {
                            const err74 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err74];
                            } else {
                              vErrors.push(err74);
                            }
                            errors++;
                          }
                          if ("tool_started" !== data22) {
                            const err75 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/properties/kind/const", keyword: "const", params: { allowedValue: "tool_started" }, message: "must be equal to constant" };
                            if (vErrors === null) {
                              vErrors = [err75];
                            } else {
                              vErrors.push(err75);
                            }
                            errors++;
                          }
                        }
                        if (data9.sourceEventId !== void 0) {
                          let data23 = data9.sourceEventId;
                          if (typeof data23 === "string") {
                            if (!pattern0.test(data23)) {
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
                        if (data9.sourceCursor !== void 0) {
                          let data24 = data9.sourceCursor;
                          if (!(typeof data24 == "number" && (!(data24 % 1) && !isNaN(data24)) && isFinite(data24))) {
                            const err78 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/properties/sourceCursor/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                            if (vErrors === null) {
                              vErrors = [err78];
                            } else {
                              vErrors.push(err78);
                            }
                            errors++;
                          }
                          if (typeof data24 == "number" && isFinite(data24)) {
                            if (data24 > 9007199254740991 || isNaN(data24)) {
                              const err79 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/4/properties/sourceCursor/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                              if (vErrors === null) {
                                vErrors = [err79];
                              } else {
                                vErrors.push(err79);
                              }
                              errors++;
                            }
                            if (data24 < 1 || isNaN(data24)) {
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
                        if (data9.actionId !== void 0) {
                          let data25 = data9.actionId;
                          if (typeof data25 === "string") {
                            if (!pattern0.test(data25)) {
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
                        if (data9.executionUnitId !== void 0) {
                          let data26 = data9.executionUnitId;
                          if (typeof data26 === "string") {
                            if (!pattern0.test(data26)) {
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
                        if (data9.toolId !== void 0) {
                          let data27 = data9.toolId;
                          if (typeof data27 === "string") {
                            if (!pattern0.test(data27)) {
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
                        if (data9.inputSummary !== void 0) {
                          if (typeof data9.inputSummary !== "string") {
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
                      var _valid1 = _errs65 === errors;
                      valid5 = valid5 || _valid1;
                      if (!valid5) {
                        const _errs82 = errors;
                        if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
                          if (data9.kind === void 0) {
                            const err89 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                            if (vErrors === null) {
                              vErrors = [err89];
                            } else {
                              vErrors.push(err89);
                            }
                            errors++;
                          }
                          if (data9.sourceEventId === void 0) {
                            const err90 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/required", keyword: "required", params: { missingProperty: "sourceEventId" }, message: "must have required property 'sourceEventId'" };
                            if (vErrors === null) {
                              vErrors = [err90];
                            } else {
                              vErrors.push(err90);
                            }
                            errors++;
                          }
                          if (data9.sourceCursor === void 0) {
                            const err91 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/required", keyword: "required", params: { missingProperty: "sourceCursor" }, message: "must have required property 'sourceCursor'" };
                            if (vErrors === null) {
                              vErrors = [err91];
                            } else {
                              vErrors.push(err91);
                            }
                            errors++;
                          }
                          if (data9.actionId === void 0) {
                            const err92 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                            if (vErrors === null) {
                              vErrors = [err92];
                            } else {
                              vErrors.push(err92);
                            }
                            errors++;
                          }
                          if (data9.toolId === void 0) {
                            const err93 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/required", keyword: "required", params: { missingProperty: "toolId" }, message: "must have required property 'toolId'" };
                            if (vErrors === null) {
                              vErrors = [err93];
                            } else {
                              vErrors.push(err93);
                            }
                            errors++;
                          }
                          if (data9.outcome === void 0) {
                            const err94 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/required", keyword: "required", params: { missingProperty: "outcome" }, message: "must have required property 'outcome'" };
                            if (vErrors === null) {
                              vErrors = [err94];
                            } else {
                              vErrors.push(err94);
                            }
                            errors++;
                          }
                          for (const key8 in data9) {
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
                          if (data9.kind !== void 0) {
                            let data29 = data9.kind;
                            if (typeof data29 !== "string") {
                              const err96 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err96];
                              } else {
                                vErrors.push(err96);
                              }
                              errors++;
                            }
                            if ("tool_finished" !== data29) {
                              const err97 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/kind/const", keyword: "const", params: { allowedValue: "tool_finished" }, message: "must be equal to constant" };
                              if (vErrors === null) {
                                vErrors = [err97];
                              } else {
                                vErrors.push(err97);
                              }
                              errors++;
                            }
                          }
                          if (data9.sourceEventId !== void 0) {
                            let data30 = data9.sourceEventId;
                            if (typeof data30 === "string") {
                              if (!pattern0.test(data30)) {
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
                          if (data9.sourceCursor !== void 0) {
                            let data31 = data9.sourceCursor;
                            if (!(typeof data31 == "number" && (!(data31 % 1) && !isNaN(data31)) && isFinite(data31))) {
                              const err100 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/sourceCursor/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                              if (vErrors === null) {
                                vErrors = [err100];
                              } else {
                                vErrors.push(err100);
                              }
                              errors++;
                            }
                            if (typeof data31 == "number" && isFinite(data31)) {
                              if (data31 > 9007199254740991 || isNaN(data31)) {
                                const err101 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/sourceCursor/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                                if (vErrors === null) {
                                  vErrors = [err101];
                                } else {
                                  vErrors.push(err101);
                                }
                                errors++;
                              }
                              if (data31 < 1 || isNaN(data31)) {
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
                          if (data9.actionId !== void 0) {
                            let data32 = data9.actionId;
                            if (typeof data32 === "string") {
                              if (!pattern0.test(data32)) {
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
                          if (data9.toolId !== void 0) {
                            let data33 = data9.toolId;
                            if (typeof data33 === "string") {
                              if (!pattern0.test(data33)) {
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
                          if (data9.outcome !== void 0) {
                            let data34 = data9.outcome;
                            if (typeof data34 !== "string") {
                              const err107 = { instancePath: instancePath + "/activity/outcome", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/outcome/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err107];
                              } else {
                                vErrors.push(err107);
                              }
                              errors++;
                            }
                            if (!(data34 === "success" || data34 === "failure")) {
                              const err108 = { instancePath: instancePath + "/activity/outcome", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/5/properties/outcome/enum", keyword: "enum", params: { allowedValues: schema26.anyOf[5].properties.outcome.enum }, message: "must be equal to one of the allowed values" };
                              if (vErrors === null) {
                                vErrors = [err108];
                              } else {
                                vErrors.push(err108);
                              }
                              errors++;
                            }
                          }
                          if (data9.summary !== void 0) {
                            if (typeof data9.summary !== "string") {
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
                        var _valid1 = _errs82 === errors;
                        valid5 = valid5 || _valid1;
                        if (!valid5) {
                          const _errs99 = errors;
                          if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
                            if (data9.kind === void 0) {
                              const err111 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                              if (vErrors === null) {
                                vErrors = [err111];
                              } else {
                                vErrors.push(err111);
                              }
                              errors++;
                            }
                            if (data9.sourceEventId === void 0) {
                              const err112 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/required", keyword: "required", params: { missingProperty: "sourceEventId" }, message: "must have required property 'sourceEventId'" };
                              if (vErrors === null) {
                                vErrors = [err112];
                              } else {
                                vErrors.push(err112);
                              }
                              errors++;
                            }
                            if (data9.sourceCursor === void 0) {
                              const err113 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/required", keyword: "required", params: { missingProperty: "sourceCursor" }, message: "must have required property 'sourceCursor'" };
                              if (vErrors === null) {
                                vErrors = [err113];
                              } else {
                                vErrors.push(err113);
                              }
                              errors++;
                            }
                            if (data9.actionId === void 0) {
                              const err114 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                              if (vErrors === null) {
                                vErrors = [err114];
                              } else {
                                vErrors.push(err114);
                              }
                              errors++;
                            }
                            if (data9.attempt === void 0) {
                              const err115 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/required", keyword: "required", params: { missingProperty: "attempt" }, message: "must have required property 'attempt'" };
                              if (vErrors === null) {
                                vErrors = [err115];
                              } else {
                                vErrors.push(err115);
                              }
                              errors++;
                            }
                            for (const key9 in data9) {
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
                            if (data9.kind !== void 0) {
                              let data36 = data9.kind;
                              if (typeof data36 !== "string") {
                                const err117 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err117];
                                } else {
                                  vErrors.push(err117);
                                }
                                errors++;
                              }
                              if ("tool_attempt_started" !== data36) {
                                const err118 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/properties/kind/const", keyword: "const", params: { allowedValue: "tool_attempt_started" }, message: "must be equal to constant" };
                                if (vErrors === null) {
                                  vErrors = [err118];
                                } else {
                                  vErrors.push(err118);
                                }
                                errors++;
                              }
                            }
                            if (data9.sourceEventId !== void 0) {
                              let data37 = data9.sourceEventId;
                              if (typeof data37 === "string") {
                                if (!pattern0.test(data37)) {
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
                            if (data9.sourceCursor !== void 0) {
                              let data38 = data9.sourceCursor;
                              if (!(typeof data38 == "number" && (!(data38 % 1) && !isNaN(data38)) && isFinite(data38))) {
                                const err121 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/properties/sourceCursor/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                if (vErrors === null) {
                                  vErrors = [err121];
                                } else {
                                  vErrors.push(err121);
                                }
                                errors++;
                              }
                              if (typeof data38 == "number" && isFinite(data38)) {
                                if (data38 > 9007199254740991 || isNaN(data38)) {
                                  const err122 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/properties/sourceCursor/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                                  if (vErrors === null) {
                                    vErrors = [err122];
                                  } else {
                                    vErrors.push(err122);
                                  }
                                  errors++;
                                }
                                if (data38 < 1 || isNaN(data38)) {
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
                            if (data9.actionId !== void 0) {
                              let data39 = data9.actionId;
                              if (typeof data39 === "string") {
                                if (!pattern0.test(data39)) {
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
                            if (data9.attempt !== void 0) {
                              let data40 = data9.attempt;
                              if (!(typeof data40 == "number" && (!(data40 % 1) && !isNaN(data40)) && isFinite(data40))) {
                                const err126 = { instancePath: instancePath + "/activity/attempt", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/properties/attempt/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                if (vErrors === null) {
                                  vErrors = [err126];
                                } else {
                                  vErrors.push(err126);
                                }
                                errors++;
                              }
                              if (typeof data40 == "number" && isFinite(data40)) {
                                if (data40 > 9007199254740991 || isNaN(data40)) {
                                  const err127 = { instancePath: instancePath + "/activity/attempt", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/6/properties/attempt/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                                  if (vErrors === null) {
                                    vErrors = [err127];
                                  } else {
                                    vErrors.push(err127);
                                  }
                                  errors++;
                                }
                                if (data40 < 1 || isNaN(data40)) {
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
                          var _valid1 = _errs99 === errors;
                          valid5 = valid5 || _valid1;
                          if (!valid5) {
                            const _errs112 = errors;
                            if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
                              if (data9.kind === void 0) {
                                const err130 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                                if (vErrors === null) {
                                  vErrors = [err130];
                                } else {
                                  vErrors.push(err130);
                                }
                                errors++;
                              }
                              if (data9.sourceEventId === void 0) {
                                const err131 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/required", keyword: "required", params: { missingProperty: "sourceEventId" }, message: "must have required property 'sourceEventId'" };
                                if (vErrors === null) {
                                  vErrors = [err131];
                                } else {
                                  vErrors.push(err131);
                                }
                                errors++;
                              }
                              if (data9.sourceCursor === void 0) {
                                const err132 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/required", keyword: "required", params: { missingProperty: "sourceCursor" }, message: "must have required property 'sourceCursor'" };
                                if (vErrors === null) {
                                  vErrors = [err132];
                                } else {
                                  vErrors.push(err132);
                                }
                                errors++;
                              }
                              if (data9.actionId === void 0) {
                                const err133 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                                if (vErrors === null) {
                                  vErrors = [err133];
                                } else {
                                  vErrors.push(err133);
                                }
                                errors++;
                              }
                              if (data9.attempt === void 0) {
                                const err134 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/required", keyword: "required", params: { missingProperty: "attempt" }, message: "must have required property 'attempt'" };
                                if (vErrors === null) {
                                  vErrors = [err134];
                                } else {
                                  vErrors.push(err134);
                                }
                                errors++;
                              }
                              if (data9.reason === void 0) {
                                const err135 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
                                if (vErrors === null) {
                                  vErrors = [err135];
                                } else {
                                  vErrors.push(err135);
                                }
                                errors++;
                              }
                              for (const key10 in data9) {
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
                              if (data9.kind !== void 0) {
                                let data41 = data9.kind;
                                if (typeof data41 !== "string") {
                                  const err137 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err137];
                                  } else {
                                    vErrors.push(err137);
                                  }
                                  errors++;
                                }
                                if ("tool_attempt_failed" !== data41) {
                                  const err138 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/properties/kind/const", keyword: "const", params: { allowedValue: "tool_attempt_failed" }, message: "must be equal to constant" };
                                  if (vErrors === null) {
                                    vErrors = [err138];
                                  } else {
                                    vErrors.push(err138);
                                  }
                                  errors++;
                                }
                              }
                              if (data9.sourceEventId !== void 0) {
                                let data42 = data9.sourceEventId;
                                if (typeof data42 === "string") {
                                  if (!pattern0.test(data42)) {
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
                              if (data9.sourceCursor !== void 0) {
                                let data43 = data9.sourceCursor;
                                if (!(typeof data43 == "number" && (!(data43 % 1) && !isNaN(data43)) && isFinite(data43))) {
                                  const err141 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/properties/sourceCursor/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                  if (vErrors === null) {
                                    vErrors = [err141];
                                  } else {
                                    vErrors.push(err141);
                                  }
                                  errors++;
                                }
                                if (typeof data43 == "number" && isFinite(data43)) {
                                  if (data43 > 9007199254740991 || isNaN(data43)) {
                                    const err142 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/properties/sourceCursor/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                                    if (vErrors === null) {
                                      vErrors = [err142];
                                    } else {
                                      vErrors.push(err142);
                                    }
                                    errors++;
                                  }
                                  if (data43 < 1 || isNaN(data43)) {
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
                              if (data9.actionId !== void 0) {
                                let data44 = data9.actionId;
                                if (typeof data44 === "string") {
                                  if (!pattern0.test(data44)) {
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
                              if (data9.attempt !== void 0) {
                                let data45 = data9.attempt;
                                if (!(typeof data45 == "number" && (!(data45 % 1) && !isNaN(data45)) && isFinite(data45))) {
                                  const err146 = { instancePath: instancePath + "/activity/attempt", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/properties/attempt/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                  if (vErrors === null) {
                                    vErrors = [err146];
                                  } else {
                                    vErrors.push(err146);
                                  }
                                  errors++;
                                }
                                if (typeof data45 == "number" && isFinite(data45)) {
                                  if (data45 > 9007199254740991 || isNaN(data45)) {
                                    const err147 = { instancePath: instancePath + "/activity/attempt", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/7/properties/attempt/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                                    if (vErrors === null) {
                                      vErrors = [err147];
                                    } else {
                                      vErrors.push(err147);
                                    }
                                    errors++;
                                  }
                                  if (data45 < 1 || isNaN(data45)) {
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
                              if (data9.reason !== void 0) {
                                if (typeof data9.reason !== "string") {
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
                            var _valid1 = _errs112 === errors;
                            valid5 = valid5 || _valid1;
                            if (!valid5) {
                              const _errs127 = errors;
                              if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
                                if (data9.kind === void 0) {
                                  const err151 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                                  if (vErrors === null) {
                                    vErrors = [err151];
                                  } else {
                                    vErrors.push(err151);
                                  }
                                  errors++;
                                }
                                if (data9.sourceEventId === void 0) {
                                  const err152 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/required", keyword: "required", params: { missingProperty: "sourceEventId" }, message: "must have required property 'sourceEventId'" };
                                  if (vErrors === null) {
                                    vErrors = [err152];
                                  } else {
                                    vErrors.push(err152);
                                  }
                                  errors++;
                                }
                                if (data9.sourceCursor === void 0) {
                                  const err153 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/required", keyword: "required", params: { missingProperty: "sourceCursor" }, message: "must have required property 'sourceCursor'" };
                                  if (vErrors === null) {
                                    vErrors = [err153];
                                  } else {
                                    vErrors.push(err153);
                                  }
                                  errors++;
                                }
                                if (data9.reason === void 0) {
                                  const err154 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
                                  if (vErrors === null) {
                                    vErrors = [err154];
                                  } else {
                                    vErrors.push(err154);
                                  }
                                  errors++;
                                }
                                for (const key11 in data9) {
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
                                if (data9.kind !== void 0) {
                                  let data47 = data9.kind;
                                  if (typeof data47 !== "string") {
                                    const err156 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err156];
                                    } else {
                                      vErrors.push(err156);
                                    }
                                    errors++;
                                  }
                                  if ("activity_boundary" !== data47) {
                                    const err157 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/properties/kind/const", keyword: "const", params: { allowedValue: "activity_boundary" }, message: "must be equal to constant" };
                                    if (vErrors === null) {
                                      vErrors = [err157];
                                    } else {
                                      vErrors.push(err157);
                                    }
                                    errors++;
                                  }
                                }
                                if (data9.sourceEventId !== void 0) {
                                  let data48 = data9.sourceEventId;
                                  if (typeof data48 === "string") {
                                    if (!pattern0.test(data48)) {
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
                                if (data9.sourceCursor !== void 0) {
                                  let data49 = data9.sourceCursor;
                                  if (!(typeof data49 == "number" && (!(data49 % 1) && !isNaN(data49)) && isFinite(data49))) {
                                    const err160 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/properties/sourceCursor/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                    if (vErrors === null) {
                                      vErrors = [err160];
                                    } else {
                                      vErrors.push(err160);
                                    }
                                    errors++;
                                  }
                                  if (typeof data49 == "number" && isFinite(data49)) {
                                    if (data49 > 9007199254740991 || isNaN(data49)) {
                                      const err161 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/properties/sourceCursor/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                                      if (vErrors === null) {
                                        vErrors = [err161];
                                      } else {
                                        vErrors.push(err161);
                                      }
                                      errors++;
                                    }
                                    if (data49 < 1 || isNaN(data49)) {
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
                                if (data9.reason !== void 0) {
                                  let data50 = data9.reason;
                                  if (typeof data50 !== "string") {
                                    const err163 = { instancePath: instancePath + "/activity/reason", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err163];
                                    } else {
                                      vErrors.push(err163);
                                    }
                                    errors++;
                                  }
                                  if (!(data50 === "assistant_reply" || data50 === "user_wait" || data50 === "stage_change" || data50 === "terminal" || data50 === "failure" || data50 === "unknown")) {
                                    const err164 = { instancePath: instancePath + "/activity/reason", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/8/properties/reason/enum", keyword: "enum", params: { allowedValues: schema26.anyOf[8].properties.reason.enum }, message: "must be equal to one of the allowed values" };
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
                              var _valid1 = _errs127 === errors;
                              valid5 = valid5 || _valid1;
                              if (!valid5) {
                                const _errs138 = errors;
                                if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
                                  if (data9.kind === void 0) {
                                    const err166 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                                    if (vErrors === null) {
                                      vErrors = [err166];
                                    } else {
                                      vErrors.push(err166);
                                    }
                                    errors++;
                                  }
                                  if (data9.sourceEventId === void 0) {
                                    const err167 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/required", keyword: "required", params: { missingProperty: "sourceEventId" }, message: "must have required property 'sourceEventId'" };
                                    if (vErrors === null) {
                                      vErrors = [err167];
                                    } else {
                                      vErrors.push(err167);
                                    }
                                    errors++;
                                  }
                                  if (data9.sourceCursor === void 0) {
                                    const err168 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/required", keyword: "required", params: { missingProperty: "sourceCursor" }, message: "must have required property 'sourceCursor'" };
                                    if (vErrors === null) {
                                      vErrors = [err168];
                                    } else {
                                      vErrors.push(err168);
                                    }
                                    errors++;
                                  }
                                  if (data9.candidateId === void 0) {
                                    const err169 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/required", keyword: "required", params: { missingProperty: "candidateId" }, message: "must have required property 'candidateId'" };
                                    if (vErrors === null) {
                                      vErrors = [err169];
                                    } else {
                                      vErrors.push(err169);
                                    }
                                    errors++;
                                  }
                                  if (data9.text === void 0) {
                                    const err170 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/required", keyword: "required", params: { missingProperty: "text" }, message: "must have required property 'text'" };
                                    if (vErrors === null) {
                                      vErrors = [err170];
                                    } else {
                                      vErrors.push(err170);
                                    }
                                    errors++;
                                  }
                                  if (data9.startOffset === void 0) {
                                    const err171 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/required", keyword: "required", params: { missingProperty: "startOffset" }, message: "must have required property 'startOffset'" };
                                    if (vErrors === null) {
                                      vErrors = [err171];
                                    } else {
                                      vErrors.push(err171);
                                    }
                                    errors++;
                                  }
                                  if (data9.truncated === void 0) {
                                    const err172 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/required", keyword: "required", params: { missingProperty: "truncated" }, message: "must have required property 'truncated'" };
                                    if (vErrors === null) {
                                      vErrors = [err172];
                                    } else {
                                      vErrors.push(err172);
                                    }
                                    errors++;
                                  }
                                  if (data9.complete === void 0) {
                                    const err173 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/required", keyword: "required", params: { missingProperty: "complete" }, message: "must have required property 'complete'" };
                                    if (vErrors === null) {
                                      vErrors = [err173];
                                    } else {
                                      vErrors.push(err173);
                                    }
                                    errors++;
                                  }
                                  for (const key12 in data9) {
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
                                  if (data9.kind !== void 0) {
                                    let data51 = data9.kind;
                                    if (typeof data51 !== "string") {
                                      const err175 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err175];
                                      } else {
                                        vErrors.push(err175);
                                      }
                                      errors++;
                                    }
                                    if ("candidate_preview" !== data51) {
                                      const err176 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/kind/const", keyword: "const", params: { allowedValue: "candidate_preview" }, message: "must be equal to constant" };
                                      if (vErrors === null) {
                                        vErrors = [err176];
                                      } else {
                                        vErrors.push(err176);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data9.sourceEventId !== void 0) {
                                    let data52 = data9.sourceEventId;
                                    if (typeof data52 === "string") {
                                      if (!pattern0.test(data52)) {
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
                                  if (data9.sourceCursor !== void 0) {
                                    let data53 = data9.sourceCursor;
                                    if (!(typeof data53 == "number" && (!(data53 % 1) && !isNaN(data53)) && isFinite(data53))) {
                                      const err179 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/sourceCursor/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                      if (vErrors === null) {
                                        vErrors = [err179];
                                      } else {
                                        vErrors.push(err179);
                                      }
                                      errors++;
                                    }
                                    if (typeof data53 == "number" && isFinite(data53)) {
                                      if (data53 > 9007199254740991 || isNaN(data53)) {
                                        const err180 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/sourceCursor/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                                        if (vErrors === null) {
                                          vErrors = [err180];
                                        } else {
                                          vErrors.push(err180);
                                        }
                                        errors++;
                                      }
                                      if (data53 < 1 || isNaN(data53)) {
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
                                  if (data9.candidateId !== void 0) {
                                    let data54 = data9.candidateId;
                                    if (typeof data54 === "string") {
                                      if (!pattern0.test(data54)) {
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
                                  if (data9.text !== void 0) {
                                    if (typeof data9.text !== "string") {
                                      const err184 = { instancePath: instancePath + "/activity/text", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err184];
                                      } else {
                                        vErrors.push(err184);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data9.startOffset !== void 0) {
                                    let data56 = data9.startOffset;
                                    if (!(typeof data56 == "number" && (!(data56 % 1) && !isNaN(data56)) && isFinite(data56))) {
                                      const err185 = { instancePath: instancePath + "/activity/startOffset", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/startOffset/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                      if (vErrors === null) {
                                        vErrors = [err185];
                                      } else {
                                        vErrors.push(err185);
                                      }
                                      errors++;
                                    }
                                    if (typeof data56 == "number" && isFinite(data56)) {
                                      if (data56 > 9007199254740991 || isNaN(data56)) {
                                        const err186 = { instancePath: instancePath + "/activity/startOffset", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/startOffset/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                                        if (vErrors === null) {
                                          vErrors = [err186];
                                        } else {
                                          vErrors.push(err186);
                                        }
                                        errors++;
                                      }
                                      if (data56 < 0 || isNaN(data56)) {
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
                                  if (data9.truncated !== void 0) {
                                    if (typeof data9.truncated !== "boolean") {
                                      const err188 = { instancePath: instancePath + "/activity/truncated", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/9/properties/truncated/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                                      if (vErrors === null) {
                                        vErrors = [err188];
                                      } else {
                                        vErrors.push(err188);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data9.complete !== void 0) {
                                    if (typeof data9.complete !== "boolean") {
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
                                var _valid1 = _errs138 === errors;
                                valid5 = valid5 || _valid1;
                                if (!valid5) {
                                  const _errs157 = errors;
                                  if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
                                    if (data9.kind === void 0) {
                                      const err191 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                                      if (vErrors === null) {
                                        vErrors = [err191];
                                      } else {
                                        vErrors.push(err191);
                                      }
                                      errors++;
                                    }
                                    if (data9.sourceEventId === void 0) {
                                      const err192 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/required", keyword: "required", params: { missingProperty: "sourceEventId" }, message: "must have required property 'sourceEventId'" };
                                      if (vErrors === null) {
                                        vErrors = [err192];
                                      } else {
                                        vErrors.push(err192);
                                      }
                                      errors++;
                                    }
                                    if (data9.sourceCursor === void 0) {
                                      const err193 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/required", keyword: "required", params: { missingProperty: "sourceCursor" }, message: "must have required property 'sourceCursor'" };
                                      if (vErrors === null) {
                                        vErrors = [err193];
                                      } else {
                                        vErrors.push(err193);
                                      }
                                      errors++;
                                    }
                                    if (data9.candidateId === void 0) {
                                      const err194 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/required", keyword: "required", params: { missingProperty: "candidateId" }, message: "must have required property 'candidateId'" };
                                      if (vErrors === null) {
                                        vErrors = [err194];
                                      } else {
                                        vErrors.push(err194);
                                      }
                                      errors++;
                                    }
                                    if (data9.reason === void 0) {
                                      const err195 = { instancePath: instancePath + "/activity", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
                                      if (vErrors === null) {
                                        vErrors = [err195];
                                      } else {
                                        vErrors.push(err195);
                                      }
                                      errors++;
                                    }
                                    for (const key13 in data9) {
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
                                    if (data9.kind !== void 0) {
                                      let data59 = data9.kind;
                                      if (typeof data59 !== "string") {
                                        const err197 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err197];
                                        } else {
                                          vErrors.push(err197);
                                        }
                                        errors++;
                                      }
                                      if ("candidate_invalidated" !== data59) {
                                        const err198 = { instancePath: instancePath + "/activity/kind", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/properties/kind/const", keyword: "const", params: { allowedValue: "candidate_invalidated" }, message: "must be equal to constant" };
                                        if (vErrors === null) {
                                          vErrors = [err198];
                                        } else {
                                          vErrors.push(err198);
                                        }
                                        errors++;
                                      }
                                    }
                                    if (data9.sourceEventId !== void 0) {
                                      let data60 = data9.sourceEventId;
                                      if (typeof data60 === "string") {
                                        if (!pattern0.test(data60)) {
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
                                    if (data9.sourceCursor !== void 0) {
                                      let data61 = data9.sourceCursor;
                                      if (!(typeof data61 == "number" && (!(data61 % 1) && !isNaN(data61)) && isFinite(data61))) {
                                        const err201 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/properties/sourceCursor/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                                        if (vErrors === null) {
                                          vErrors = [err201];
                                        } else {
                                          vErrors.push(err201);
                                        }
                                        errors++;
                                      }
                                      if (typeof data61 == "number" && isFinite(data61)) {
                                        if (data61 > 9007199254740991 || isNaN(data61)) {
                                          const err202 = { instancePath: instancePath + "/activity/sourceCursor", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/properties/sourceCursor/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                                          if (vErrors === null) {
                                            vErrors = [err202];
                                          } else {
                                            vErrors.push(err202);
                                          }
                                          errors++;
                                        }
                                        if (data61 < 1 || isNaN(data61)) {
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
                                    if (data9.candidateId !== void 0) {
                                      let data62 = data9.candidateId;
                                      if (typeof data62 === "string") {
                                        if (!pattern0.test(data62)) {
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
                                    if (data9.reason !== void 0) {
                                      let data63 = data9.reason;
                                      if (typeof data63 !== "string") {
                                        const err206 = { instancePath: instancePath + "/activity/reason", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err206];
                                        } else {
                                          vErrors.push(err206);
                                        }
                                        errors++;
                                      }
                                      if (!(data63 === "rejected" || data63 === "cancelled" || data63 === "failed" || data63 === "replaced" || data63 === "ambiguous")) {
                                        const err207 = { instancePath: instancePath + "/activity/reason", schemaPath: "#/definitions/BrowserGoalActivityEvent/anyOf/10/properties/reason/enum", keyword: "enum", params: { allowedValues: schema26.anyOf[10].properties.reason.enum }, message: "must be equal to one of the allowed values" };
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
                                  var _valid1 = _errs157 === errors;
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
                errors = _errs28;
                if (vErrors !== null) {
                  if (_errs28) {
                    vErrors.length = _errs28;
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
          var _valid0 = _errs17 === errors;
          valid0 = valid0 || _valid0;
          if (!valid0) {
            const _errs170 = errors;
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
                let data64 = data.type;
                if (typeof data64 !== "string") {
                  const err216 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/3/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err216];
                  } else {
                    vErrors.push(err216);
                  }
                  errors++;
                }
                if ("message_committed" !== data64) {
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
                let data65 = data.goalId;
                if (typeof data65 === "string") {
                  if (!pattern0.test(data65)) {
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
                let data66 = data.runId;
                if (typeof data66 === "string") {
                  if (!pattern0.test(data66)) {
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
                if (!validate22(data.message, { instancePath: instancePath + "/message", parentData: data, parentDataProperty: "message", rootData })) {
                  vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
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
            var _valid0 = _errs170 === errors;
            valid0 = valid0 || _valid0;
            if (!valid0) {
              const _errs180 = errors;
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
                if (data.runId === void 0) {
                  const err225 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                  if (vErrors === null) {
                    vErrors = [err225];
                  } else {
                    vErrors.push(err225);
                  }
                  errors++;
                }
                if (data.interaction === void 0) {
                  const err226 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "interaction" }, message: "must have required property 'interaction'" };
                  if (vErrors === null) {
                    vErrors = [err226];
                  } else {
                    vErrors.push(err226);
                  }
                  errors++;
                }
                for (const key15 in data) {
                  if (!(key15 === "type" || key15 === "goalId" || key15 === "runId" || key15 === "interaction")) {
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
                  let data68 = data.type;
                  if (typeof data68 !== "string") {
                    const err228 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/4/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err228];
                    } else {
                      vErrors.push(err228);
                    }
                    errors++;
                  }
                  if ("interaction_required" !== data68) {
                    const err229 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/4/properties/type/const", keyword: "const", params: { allowedValue: "interaction_required" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err229];
                    } else {
                      vErrors.push(err229);
                    }
                    errors++;
                  }
                }
                if (data.goalId !== void 0) {
                  let data69 = data.goalId;
                  if (typeof data69 === "string") {
                    if (!pattern0.test(data69)) {
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
                  let data70 = data.runId;
                  if (typeof data70 === "string") {
                    if (!pattern0.test(data70)) {
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
                if (data.interaction !== void 0) {
                  let data71 = data.interaction;
                  if (data71 && typeof data71 == "object" && !Array.isArray(data71)) {
                    if (data71.interactionId === void 0) {
                      const err234 = { instancePath: instancePath + "/interaction", schemaPath: "#/definitions/BrowserInteractionRequiredEvent/required", keyword: "required", params: { missingProperty: "interactionId" }, message: "must have required property 'interactionId'" };
                      if (vErrors === null) {
                        vErrors = [err234];
                      } else {
                        vErrors.push(err234);
                      }
                      errors++;
                    }
                    if (data71.kind === void 0) {
                      const err235 = { instancePath: instancePath + "/interaction", schemaPath: "#/definitions/BrowserInteractionRequiredEvent/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                      if (vErrors === null) {
                        vErrors = [err235];
                      } else {
                        vErrors.push(err235);
                      }
                      errors++;
                    }
                    if (data71.runId === void 0) {
                      const err236 = { instancePath: instancePath + "/interaction", schemaPath: "#/definitions/BrowserInteractionRequiredEvent/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                      if (vErrors === null) {
                        vErrors = [err236];
                      } else {
                        vErrors.push(err236);
                      }
                      errors++;
                    }
                    for (const key16 in data71) {
                      if (!(key16 === "interactionId" || key16 === "kind" || key16 === "runId")) {
                        const err237 = { instancePath: instancePath + "/interaction", schemaPath: "#/definitions/BrowserInteractionRequiredEvent/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key16 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err237];
                        } else {
                          vErrors.push(err237);
                        }
                        errors++;
                      }
                    }
                    if (data71.interactionId !== void 0) {
                      let data72 = data71.interactionId;
                      if (typeof data72 === "string") {
                        if (!pattern0.test(data72)) {
                          const err238 = { instancePath: instancePath + "/interaction/interactionId", schemaPath: "#/definitions/BrowserInteractionRequiredEvent/properties/interactionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                          if (vErrors === null) {
                            vErrors = [err238];
                          } else {
                            vErrors.push(err238);
                          }
                          errors++;
                        }
                      } else {
                        const err239 = { instancePath: instancePath + "/interaction/interactionId", schemaPath: "#/definitions/BrowserInteractionRequiredEvent/properties/interactionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err239];
                        } else {
                          vErrors.push(err239);
                        }
                        errors++;
                      }
                    }
                    if (data71.kind !== void 0) {
                      let data73 = data71.kind;
                      if (typeof data73 !== "string") {
                        const err240 = { instancePath: instancePath + "/interaction/kind", schemaPath: "#/definitions/BrowserInteractionRequiredEvent/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err240];
                        } else {
                          vErrors.push(err240);
                        }
                        errors++;
                      }
                      if (!(data73 === "ask_user" || data73 === "task_approval" || data73 === "action_approval" || data73 === "action_recovery")) {
                        const err241 = { instancePath: instancePath + "/interaction/kind", schemaPath: "#/definitions/BrowserInteractionRequiredEvent/properties/kind/enum", keyword: "enum", params: { allowedValues: schema29.properties.kind.enum }, message: "must be equal to one of the allowed values" };
                        if (vErrors === null) {
                          vErrors = [err241];
                        } else {
                          vErrors.push(err241);
                        }
                        errors++;
                      }
                    }
                    if (data71.runId !== void 0) {
                      let data74 = data71.runId;
                      if (typeof data74 === "string") {
                        if (!pattern0.test(data74)) {
                          const err242 = { instancePath: instancePath + "/interaction/runId", schemaPath: "#/definitions/BrowserInteractionRequiredEvent/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                          if (vErrors === null) {
                            vErrors = [err242];
                          } else {
                            vErrors.push(err242);
                          }
                          errors++;
                        }
                      } else {
                        const err243 = { instancePath: instancePath + "/interaction/runId", schemaPath: "#/definitions/BrowserInteractionRequiredEvent/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err243];
                        } else {
                          vErrors.push(err243);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err244 = { instancePath: instancePath + "/interaction", schemaPath: "#/definitions/BrowserInteractionRequiredEvent/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err244];
                    } else {
                      vErrors.push(err244);
                    }
                    errors++;
                  }
                }
              } else {
                const err245 = { instancePath, schemaPath: "#/anyOf/4/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err245];
                } else {
                  vErrors.push(err245);
                }
                errors++;
              }
              var _valid0 = _errs180 === errors;
              valid0 = valid0 || _valid0;
              if (!valid0) {
                const _errs199 = errors;
                if (data && typeof data == "object" && !Array.isArray(data)) {
                  if (data.type === void 0) {
                    const err246 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                    if (vErrors === null) {
                      vErrors = [err246];
                    } else {
                      vErrors.push(err246);
                    }
                    errors++;
                  }
                  if (data.goalId === void 0) {
                    const err247 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                    if (vErrors === null) {
                      vErrors = [err247];
                    } else {
                      vErrors.push(err247);
                    }
                    errors++;
                  }
                  for (const key17 in data) {
                    if (!(key17 === "type" || key17 === "goalId" || key17 === "runId")) {
                      const err248 = { instancePath, schemaPath: "#/anyOf/5/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key17 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err248];
                      } else {
                        vErrors.push(err248);
                      }
                      errors++;
                    }
                  }
                  if (data.type !== void 0) {
                    let data75 = data.type;
                    if (typeof data75 !== "string") {
                      const err249 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/5/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err249];
                      } else {
                        vErrors.push(err249);
                      }
                      errors++;
                    }
                    if ("snapshot_changed" !== data75) {
                      const err250 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/5/properties/type/const", keyword: "const", params: { allowedValue: "snapshot_changed" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err250];
                      } else {
                        vErrors.push(err250);
                      }
                      errors++;
                    }
                  }
                  if (data.goalId !== void 0) {
                    let data76 = data.goalId;
                    if (typeof data76 === "string") {
                      if (!pattern0.test(data76)) {
                        const err251 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/5/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                        if (vErrors === null) {
                          vErrors = [err251];
                        } else {
                          vErrors.push(err251);
                        }
                        errors++;
                      }
                    } else {
                      const err252 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/5/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err252];
                      } else {
                        vErrors.push(err252);
                      }
                      errors++;
                    }
                  }
                  if (data.runId !== void 0) {
                    let data77 = data.runId;
                    if (typeof data77 === "string") {
                      if (!pattern0.test(data77)) {
                        const err253 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/5/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                        if (vErrors === null) {
                          vErrors = [err253];
                        } else {
                          vErrors.push(err253);
                        }
                        errors++;
                      }
                    } else {
                      const err254 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/5/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err254];
                      } else {
                        vErrors.push(err254);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err255 = { instancePath, schemaPath: "#/anyOf/5/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err255];
                  } else {
                    vErrors.push(err255);
                  }
                  errors++;
                }
                var _valid0 = _errs199 === errors;
                valid0 = valid0 || _valid0;
                if (!valid0) {
                  const _errs208 = errors;
                  if (data && typeof data == "object" && !Array.isArray(data)) {
                    if (data.type === void 0) {
                      const err256 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                      if (vErrors === null) {
                        vErrors = [err256];
                      } else {
                        vErrors.push(err256);
                      }
                      errors++;
                    }
                    if (data.goalId === void 0) {
                      const err257 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                      if (vErrors === null) {
                        vErrors = [err257];
                      } else {
                        vErrors.push(err257);
                      }
                      errors++;
                    }
                    for (const key18 in data) {
                      if (!(key18 === "type" || key18 === "goalId" || key18 === "runId")) {
                        const err258 = { instancePath, schemaPath: "#/anyOf/6/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key18 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err258];
                        } else {
                          vErrors.push(err258);
                        }
                        errors++;
                      }
                    }
                    if (data.type !== void 0) {
                      let data78 = data.type;
                      if (typeof data78 !== "string") {
                        const err259 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/6/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err259];
                        } else {
                          vErrors.push(err259);
                        }
                        errors++;
                      }
                      if ("refresh_required" !== data78) {
                        const err260 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/6/properties/type/const", keyword: "const", params: { allowedValue: "refresh_required" }, message: "must be equal to constant" };
                        if (vErrors === null) {
                          vErrors = [err260];
                        } else {
                          vErrors.push(err260);
                        }
                        errors++;
                      }
                    }
                    if (data.goalId !== void 0) {
                      let data79 = data.goalId;
                      if (typeof data79 === "string") {
                        if (!pattern0.test(data79)) {
                          const err261 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/6/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                          if (vErrors === null) {
                            vErrors = [err261];
                          } else {
                            vErrors.push(err261);
                          }
                          errors++;
                        }
                      } else {
                        const err262 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/6/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err262];
                        } else {
                          vErrors.push(err262);
                        }
                        errors++;
                      }
                    }
                    if (data.runId !== void 0) {
                      let data80 = data.runId;
                      if (typeof data80 === "string") {
                        if (!pattern0.test(data80)) {
                          const err263 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/6/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                          if (vErrors === null) {
                            vErrors = [err263];
                          } else {
                            vErrors.push(err263);
                          }
                          errors++;
                        }
                      } else {
                        const err264 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/6/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err264];
                        } else {
                          vErrors.push(err264);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err265 = { instancePath, schemaPath: "#/anyOf/6/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err265];
                    } else {
                      vErrors.push(err265);
                    }
                    errors++;
                  }
                  var _valid0 = _errs208 === errors;
                  valid0 = valid0 || _valid0;
                }
              }
            }
          }
        }
      }
      if (!valid0) {
        const err266 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err266];
        } else {
          vErrors.push(err266);
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
export default require_BrowserGoalLiveEvent_validator();
