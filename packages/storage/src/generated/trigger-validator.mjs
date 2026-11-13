var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// Trigger-validator.cjs
var require_Trigger_validator = __commonJS({
  "Trigger-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "anyOf": [{ "type": "object", "properties": { "id": { "type": "string" }, "name": { "type": "string" }, "type": { "type": "string", "const": "work" }, "source": { "$ref": "#/definitions/TriggerActor" }, "target": { "$ref": "#/definitions/TriggerTarget" }, "payload": { "type": "object", "properties": { "action": { "type": "string", "const": "submitted" }, "material": { "type": "object", "properties": { "kind": { "type": "string", "const": "text" }, "text": { "type": "string" } }, "required": ["kind", "text"], "additionalProperties": false } }, "required": ["action", "material"], "additionalProperties": false }, "sentAt": { "type": "string" } }, "required": ["id", "name", "type", "source", "target", "payload", "sentAt"], "additionalProperties": false }, { "type": "object", "properties": { "id": { "type": "string" }, "name": { "type": "string" }, "type": { "type": "string", "const": "response" }, "source": { "$ref": "#/definitions/TriggerActor" }, "target": { "$ref": "#/definitions/TriggerTarget" }, "payload": { "type": "object", "properties": { "action": { "type": "string", "const": "goal_created" } }, "required": ["action"], "additionalProperties": false }, "sentAt": { "type": "string" }, "goalId": { "type": "string" }, "replyTo": { "type": "string" } }, "required": ["id", "name", "type", "source", "target", "payload", "sentAt", "goalId", "replyTo"], "additionalProperties": false }, { "type": "object", "properties": { "id": { "type": "string" }, "name": { "type": "string" }, "type": { "type": "string", "const": "response" }, "source": { "$ref": "#/definitions/TriggerActor" }, "target": { "$ref": "#/definitions/TriggerTarget" }, "payload": { "anyOf": [{ "type": "object", "properties": { "action": { "type": "string", "const": "progress" }, "runId": { "type": "string" }, "status": { "type": "string", "const": "running" } }, "required": ["action", "runId", "status"], "additionalProperties": false }, { "type": "object", "properties": { "action": { "type": "string", "const": "progress" }, "runId": { "type": "string" }, "status": { "type": "string", "const": "waiting" }, "waitingFor": { "type": "string", "enum": ["ask_user", "task_approval", "action_approval", "action_recovery", "blocked"] } }, "required": ["action", "runId", "status", "waitingFor"], "additionalProperties": false }] }, "sentAt": { "type": "string" }, "goalId": { "type": "string" }, "replyTo": { "type": "string" } }, "required": ["id", "name", "type", "source", "target", "payload", "sentAt", "goalId", "replyTo"], "additionalProperties": false }, { "type": "object", "properties": { "id": { "type": "string" }, "name": { "type": "string" }, "type": { "type": "string", "const": "response" }, "source": { "$ref": "#/definitions/TriggerActor" }, "target": { "$ref": "#/definitions/TriggerTarget" }, "payload": { "type": "object", "properties": { "action": { "type": "string", "const": "completed" }, "runId": { "type": "string" }, "answer": { "type": "string" } }, "required": ["action", "runId", "answer"], "additionalProperties": false }, "sentAt": { "type": "string" }, "goalId": { "type": "string" }, "replyTo": { "type": "string" } }, "required": ["id", "name", "type", "source", "target", "payload", "sentAt", "goalId", "replyTo"], "additionalProperties": false }, { "type": "object", "properties": { "id": { "type": "string" }, "name": { "type": "string" }, "type": { "type": "string", "const": "response" }, "source": { "$ref": "#/definitions/TriggerActor" }, "target": { "$ref": "#/definitions/TriggerTarget" }, "payload": { "type": "object", "properties": { "action": { "type": "string", "enum": ["failed", "cancelled"] }, "runId": { "type": "string" } }, "required": ["action", "runId"], "additionalProperties": false }, "sentAt": { "type": "string" }, "goalId": { "type": "string" }, "replyTo": { "type": "string" } }, "required": ["id", "name", "type", "source", "target", "payload", "sentAt", "goalId", "replyTo"], "additionalProperties": false }, { "type": "object", "properties": { "id": { "type": "string" }, "name": { "type": "string" }, "type": { "type": "string", "const": "permission" }, "source": { "$ref": "#/definitions/TriggerActor" }, "target": { "$ref": "#/definitions/TriggerTarget" }, "payload": { "type": "object", "properties": { "action": { "type": "string", "const": "requested" }, "runId": { "type": "string" }, "actionId": { "type": "string" }, "interactionId": { "type": "string" }, "commitRevision": { "type": "number" } }, "required": ["action", "runId", "actionId", "interactionId", "commitRevision"], "additionalProperties": false }, "sentAt": { "type": "string" }, "goalId": { "type": "string" } }, "required": ["id", "name", "type", "source", "target", "payload", "sentAt", "goalId"], "additionalProperties": false }, { "type": "object", "properties": { "id": { "type": "string" }, "name": { "type": "string" }, "type": { "type": "string", "const": "permission" }, "source": { "$ref": "#/definitions/TriggerActor" }, "target": { "$ref": "#/definitions/TriggerTarget" }, "payload": { "type": "object", "properties": { "action": { "type": "string", "const": "decided" }, "decision": { "type": "string", "const": "approve" }, "scope": { "type": "string", "const": "action" }, "reason": { "type": "string" } }, "required": ["action", "decision", "scope"], "additionalProperties": false }, "sentAt": { "type": "string" }, "goalId": { "type": "string" }, "replyTo": { "type": "string" } }, "required": ["id", "name", "type", "source", "target", "payload", "sentAt", "goalId", "replyTo"], "additionalProperties": false }, { "type": "object", "properties": { "id": { "type": "string" }, "name": { "type": "string" }, "type": { "type": "string", "const": "permission" }, "source": { "$ref": "#/definitions/TriggerActor" }, "target": { "$ref": "#/definitions/TriggerTarget" }, "payload": { "type": "object", "properties": { "action": { "type": "string", "const": "decided" }, "decision": { "type": "string", "const": "reject" }, "scope": { "type": "string", "const": "action" }, "reason": { "type": "string" } }, "required": ["action", "decision", "scope", "reason"], "additionalProperties": false }, "sentAt": { "type": "string" }, "goalId": { "type": "string" }, "replyTo": { "type": "string" } }, "required": ["id", "name", "type", "source", "target", "payload", "sentAt", "goalId", "replyTo"], "additionalProperties": false }, { "type": "object", "properties": { "id": { "type": "string" }, "name": { "type": "string" }, "type": { "type": "string", "const": "interaction" }, "source": { "$ref": "#/definitions/TriggerActor" }, "target": { "$ref": "#/definitions/TriggerTarget" }, "payload": { "type": "object", "properties": { "action": { "type": "string", "const": "answered" }, "answer": { "$ref": "#/definitions/GoalUserAction" } }, "required": ["action", "answer"], "additionalProperties": false }, "sentAt": { "type": "string" }, "goalId": { "type": "string" }, "replyTo": { "type": "string" } }, "required": ["id", "name", "type", "source", "target", "payload", "sentAt", "goalId", "replyTo"], "additionalProperties": false }, { "type": "object", "properties": { "id": { "type": "string" }, "name": { "type": "string" }, "type": { "type": "string", "const": "instruction" }, "source": { "$ref": "#/definitions/TriggerActor" }, "target": { "$ref": "#/definitions/TriggerTarget" }, "payload": { "type": "object", "properties": { "action": { "type": "string", "const": "cancel" }, "runId": { "type": "string" } }, "required": ["action", "runId"], "additionalProperties": false }, "sentAt": { "type": "string" }, "goalId": { "type": "string" } }, "required": ["id", "name", "type", "source", "target", "payload", "sentAt", "goalId"], "additionalProperties": false }, { "type": "object", "properties": { "id": { "type": "string" }, "name": { "type": "string" }, "type": { "type": "string", "const": "instruction" }, "source": { "$ref": "#/definitions/TriggerActor" }, "target": { "$ref": "#/definitions/TriggerTarget" }, "payload": { "type": "object", "properties": { "action": { "type": "string", "const": "resume" }, "runId": { "type": "string" }, "acknowledgeUnknownEffects": { "type": "boolean" } }, "required": ["action", "runId", "acknowledgeUnknownEffects"], "additionalProperties": false }, "sentAt": { "type": "string" }, "goalId": { "type": "string" }, "replyTo": { "type": "string" } }, "required": ["id", "name", "type", "source", "target", "payload", "sentAt", "goalId", "replyTo"], "additionalProperties": false }, { "type": "object", "properties": { "id": { "type": "string" }, "name": { "type": "string" }, "type": { "type": "string", "const": "instruction" }, "source": { "$ref": "#/definitions/TriggerActor" }, "target": { "$ref": "#/definitions/TriggerTarget" }, "payload": { "type": "object", "properties": { "action": { "type": "string", "const": "continue" }, "runId": { "type": "string" }, "content": { "type": "string" } }, "required": ["action", "runId", "content"], "additionalProperties": false }, "sentAt": { "type": "string" }, "goalId": { "type": "string" }, "replyTo": { "type": "string" } }, "required": ["id", "name", "type", "source", "target", "payload", "sentAt", "goalId", "replyTo"], "additionalProperties": false }, { "type": "object", "properties": { "id": { "type": "string" }, "name": { "type": "string" }, "type": { "type": "string", "const": "lifecycle" }, "source": { "$ref": "#/definitions/TriggerActor" }, "target": { "$ref": "#/definitions/TriggerTarget" }, "payload": { "type": "object", "properties": { "action": { "type": "string", "const": "started" } }, "required": ["action"], "additionalProperties": false }, "sentAt": { "type": "string" } }, "required": ["id", "name", "type", "source", "target", "payload", "sentAt"], "additionalProperties": false }, { "type": "object", "properties": { "id": { "type": "string" }, "name": { "type": "string" }, "type": { "type": "string", "const": "lifecycle" }, "source": { "$ref": "#/definitions/TriggerActor" }, "target": { "$ref": "#/definitions/TriggerTarget" }, "payload": { "type": "object", "properties": { "action": { "type": "string", "const": "exited" }, "outcome": { "type": "string", "enum": ["normal", "unexpected"] } }, "required": ["action", "outcome"], "additionalProperties": false }, "sentAt": { "type": "string" } }, "required": ["id", "name", "type", "source", "target", "payload", "sentAt"], "additionalProperties": false }, { "type": "object", "properties": { "id": { "type": "string" }, "name": { "type": "string" }, "type": { "type": "string", "const": "collaboration" }, "source": { "$ref": "#/definitions/TriggerActor" }, "target": { "$ref": "#/definitions/TriggerTarget" }, "payload": { "type": "object", "properties": { "action": { "type": "string", "const": "requested" } }, "required": ["action"], "additionalProperties": false }, "sentAt": { "type": "string" }, "goalId": { "type": "string" } }, "required": ["id", "name", "type", "source", "target", "payload", "sentAt"], "additionalProperties": false }, { "type": "object", "properties": { "id": { "type": "string" }, "name": { "type": "string" }, "type": { "type": "string", "const": "collaboration" }, "source": { "$ref": "#/definitions/TriggerActor" }, "target": { "$ref": "#/definitions/TriggerTarget" }, "payload": { "type": "object", "properties": { "action": { "type": "string", "const": "result" } }, "required": ["action"], "additionalProperties": false }, "sentAt": { "type": "string" }, "goalId": { "type": "string" }, "replyTo": { "type": "string" } }, "required": ["id", "name", "type", "source", "target", "payload", "sentAt", "replyTo"], "additionalProperties": false }], "description": "Supervisor\u3001Worker \u4E0E\u5916\u90E8\u751F\u4EA7\u8005\u5171\u4EAB\u7684\u4E0D\u53EF\u53D8\u6D88\u606F\u534F\u8BAE\u3002" };
    var schema14 = { "type": "string", "enum": ["supervisor", "worker"], "description": "Trigger \u7684\u903B\u8F91\u6295\u9012\u89D2\u8272\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    var schema31 = { "anyOf": [{ "type": "object", "properties": { "kind": { "type": "string", "const": "message" }, "content": { "type": "string" }, "inputId": { "type": "string" } }, "required": ["kind", "content"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "approve_task" }, "requestId": { "type": "string" } }, "required": ["kind", "requestId"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "feedback_task" }, "requestId": { "type": "string" }, "feedback": { "type": "string" } }, "required": ["kind", "requestId", "feedback"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "answer_ask_user" }, "requestId": { "type": "string" }, "answers": { "type": "array", "items": { "type": "object", "properties": { "questionId": { "type": "string" }, "optionIds": { "type": "array", "items": { "type": "string" } }, "otherText": { "type": "string" } }, "required": ["questionId", "optionIds"], "additionalProperties": false } } }, "required": ["kind", "requestId", "answers"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "reply_to_question" }, "requestId": { "type": "string" }, "content": { "type": "string" } }, "required": ["kind", "requestId", "content"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "skip_question" }, "requestId": { "type": "string" } }, "required": ["kind", "requestId"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "approve_action" }, "actionId": { "type": "string" }, "scope": { "type": "string", "enum": ["action", "goal", "workspace"] }, "approvalInputId": { "type": "string" } }, "required": ["kind", "actionId"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "approve_action_revision" }, "actionId": { "type": "string" }, "input": { "$ref": "#/definitions/GoalActionJsonValue" }, "scope": { "type": "string", "enum": ["action", "goal", "workspace"] }, "reviewRef": { "type": "string" }, "approvalInputId": { "type": "string" } }, "required": ["kind", "actionId", "input", "reviewRef"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "retry_unknown_action" }, "actionId": { "type": "string" }, "recoveryRef": { "type": "string" } }, "required": ["kind", "actionId", "recoveryRef"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "decline_unknown_action_retry" }, "actionId": { "type": "string" }, "recoveryRef": { "type": "string" }, "reason": { "type": "string" } }, "required": ["kind", "actionId", "recoveryRef", "reason"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "reject_action" }, "actionId": { "type": "string" }, "reason": { "type": "string" } }, "required": ["kind", "actionId", "reason"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "approve" }, "requestId": { "type": "string" } }, "required": ["kind", "requestId"], "additionalProperties": false }], "description": "\u7528\u6237\u5BF9 Goal \u5F53\u524D\u4EA4\u4E92\u7B49\u5F85\u70B9\u63D0\u4EA4\u7684\u64CD\u4F5C\u3002" };
    var wrapper0 = { validate: validate13 };
    function validate13(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (typeof data !== "string") {
        const err0 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs3 = errors;
        if (!(typeof data == "number" && isFinite(data))) {
          const err1 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "number" }, message: "must be number" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        var _valid0 = _errs3 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs5 = errors;
          if (typeof data !== "boolean") {
            const err2 = { instancePath, schemaPath: "#/anyOf/2/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
          var _valid0 = _errs5 === errors;
          valid0 = valid0 || _valid0;
          if (!valid0) {
            const _errs7 = errors;
            if (data !== null) {
              const err3 = { instancePath, schemaPath: "#/anyOf/3/type", keyword: "type", params: { type: "null" }, message: "must be null" };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
            }
            var _valid0 = _errs7 === errors;
            valid0 = valid0 || _valid0;
            if (!valid0) {
              const _errs9 = errors;
              if (Array.isArray(data)) {
                const len0 = data.length;
                for (let i0 = 0; i0 < len0; i0++) {
                  if (!wrapper0.validate(data[i0], { instancePath: instancePath + "/" + i0, parentData: data, parentDataProperty: i0, rootData })) {
                    vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
                    errors = vErrors.length;
                  }
                }
              } else {
                const err4 = { instancePath, schemaPath: "#/anyOf/4/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err4];
                } else {
                  vErrors.push(err4);
                }
                errors++;
              }
              var _valid0 = _errs9 === errors;
              valid0 = valid0 || _valid0;
              if (!valid0) {
                const _errs12 = errors;
                if (data && typeof data == "object" && !Array.isArray(data)) {
                  for (const key0 in data) {
                    if (!wrapper0.validate(data[key0], { instancePath: instancePath + "/" + key0.replace(/~/g, "~0").replace(/\//g, "~1"), parentData: data, parentDataProperty: key0, rootData })) {
                      vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
                      errors = vErrors.length;
                    }
                  }
                } else {
                  const err5 = { instancePath, schemaPath: "#/anyOf/5/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err5];
                  } else {
                    vErrors.push(err5);
                  }
                  errors++;
                }
                var _valid0 = _errs12 === errors;
                valid0 = valid0 || _valid0;
              }
            }
          }
        }
      }
      if (!valid0) {
        const err6 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
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
      validate13.errors = vErrors;
      return errors === 0;
    }
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.kind === void 0) {
          const err0 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.content === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "kind" || key0 === "content" || key0 === "inputId")) {
            const err2 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data0 = data.kind;
          if (typeof data0 !== "string") {
            const err3 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if ("message" !== data0) {
            const err4 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "message" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.content !== void 0) {
          if (typeof data.content !== "string") {
            const err5 = { instancePath: instancePath + "/content", schemaPath: "#/anyOf/0/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.inputId !== void 0) {
          if (typeof data.inputId !== "string") {
            const err6 = { instancePath: instancePath + "/inputId", schemaPath: "#/anyOf/0/properties/inputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
      } else {
        const err7 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs10 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.kind === void 0) {
            const err8 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (data.requestId === void 0) {
            const err9 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "requestId" }, message: "must have required property 'requestId'" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "kind" || key1 === "requestId")) {
              const err10 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
          if (data.kind !== void 0) {
            let data3 = data.kind;
            if (typeof data3 !== "string") {
              const err11 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
            if ("approve_task" !== data3) {
              const err12 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "approve_task" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          }
          if (data.requestId !== void 0) {
            if (typeof data.requestId !== "string") {
              const err13 = { instancePath: instancePath + "/requestId", schemaPath: "#/anyOf/1/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
        } else {
          const err14 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
        var _valid0 = _errs10 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs17 = errors;
          if (data && typeof data == "object" && !Array.isArray(data)) {
            if (data.kind === void 0) {
              const err15 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            if (data.requestId === void 0) {
              const err16 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "requestId" }, message: "must have required property 'requestId'" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
            if (data.feedback === void 0) {
              const err17 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "feedback" }, message: "must have required property 'feedback'" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            for (const key2 in data) {
              if (!(key2 === "kind" || key2 === "requestId" || key2 === "feedback")) {
                const err18 = { instancePath, schemaPath: "#/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
            if (data.kind !== void 0) {
              let data5 = data.kind;
              if (typeof data5 !== "string") {
                const err19 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/2/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
              if ("feedback_task" !== data5) {
                const err20 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/2/properties/kind/const", keyword: "const", params: { allowedValue: "feedback_task" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            }
            if (data.requestId !== void 0) {
              if (typeof data.requestId !== "string") {
                const err21 = { instancePath: instancePath + "/requestId", schemaPath: "#/anyOf/2/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            }
            if (data.feedback !== void 0) {
              if (typeof data.feedback !== "string") {
                const err22 = { instancePath: instancePath + "/feedback", schemaPath: "#/anyOf/2/properties/feedback/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
            }
          } else {
            const err23 = { instancePath, schemaPath: "#/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
          var _valid0 = _errs17 === errors;
          valid0 = valid0 || _valid0;
          if (!valid0) {
            const _errs26 = errors;
            if (data && typeof data == "object" && !Array.isArray(data)) {
              if (data.kind === void 0) {
                const err24 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                if (vErrors === null) {
                  vErrors = [err24];
                } else {
                  vErrors.push(err24);
                }
                errors++;
              }
              if (data.requestId === void 0) {
                const err25 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "requestId" }, message: "must have required property 'requestId'" };
                if (vErrors === null) {
                  vErrors = [err25];
                } else {
                  vErrors.push(err25);
                }
                errors++;
              }
              if (data.answers === void 0) {
                const err26 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "answers" }, message: "must have required property 'answers'" };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
              for (const key3 in data) {
                if (!(key3 === "kind" || key3 === "requestId" || key3 === "answers")) {
                  const err27 = { instancePath, schemaPath: "#/anyOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err27];
                  } else {
                    vErrors.push(err27);
                  }
                  errors++;
                }
              }
              if (data.kind !== void 0) {
                let data8 = data.kind;
                if (typeof data8 !== "string") {
                  const err28 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/3/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err28];
                  } else {
                    vErrors.push(err28);
                  }
                  errors++;
                }
                if ("answer_ask_user" !== data8) {
                  const err29 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/3/properties/kind/const", keyword: "const", params: { allowedValue: "answer_ask_user" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err29];
                  } else {
                    vErrors.push(err29);
                  }
                  errors++;
                }
              }
              if (data.requestId !== void 0) {
                if (typeof data.requestId !== "string") {
                  const err30 = { instancePath: instancePath + "/requestId", schemaPath: "#/anyOf/3/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err30];
                  } else {
                    vErrors.push(err30);
                  }
                  errors++;
                }
              }
              if (data.answers !== void 0) {
                let data10 = data.answers;
                if (Array.isArray(data10)) {
                  const len0 = data10.length;
                  for (let i0 = 0; i0 < len0; i0++) {
                    let data11 = data10[i0];
                    if (data11 && typeof data11 == "object" && !Array.isArray(data11)) {
                      if (data11.questionId === void 0) {
                        const err31 = { instancePath: instancePath + "/answers/" + i0, schemaPath: "#/anyOf/3/properties/answers/items/required", keyword: "required", params: { missingProperty: "questionId" }, message: "must have required property 'questionId'" };
                        if (vErrors === null) {
                          vErrors = [err31];
                        } else {
                          vErrors.push(err31);
                        }
                        errors++;
                      }
                      if (data11.optionIds === void 0) {
                        const err32 = { instancePath: instancePath + "/answers/" + i0, schemaPath: "#/anyOf/3/properties/answers/items/required", keyword: "required", params: { missingProperty: "optionIds" }, message: "must have required property 'optionIds'" };
                        if (vErrors === null) {
                          vErrors = [err32];
                        } else {
                          vErrors.push(err32);
                        }
                        errors++;
                      }
                      for (const key4 in data11) {
                        if (!(key4 === "questionId" || key4 === "optionIds" || key4 === "otherText")) {
                          const err33 = { instancePath: instancePath + "/answers/" + i0, schemaPath: "#/anyOf/3/properties/answers/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                          if (vErrors === null) {
                            vErrors = [err33];
                          } else {
                            vErrors.push(err33);
                          }
                          errors++;
                        }
                      }
                      if (data11.questionId !== void 0) {
                        if (typeof data11.questionId !== "string") {
                          const err34 = { instancePath: instancePath + "/answers/" + i0 + "/questionId", schemaPath: "#/anyOf/3/properties/answers/items/properties/questionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err34];
                          } else {
                            vErrors.push(err34);
                          }
                          errors++;
                        }
                      }
                      if (data11.optionIds !== void 0) {
                        let data13 = data11.optionIds;
                        if (Array.isArray(data13)) {
                          const len1 = data13.length;
                          for (let i1 = 0; i1 < len1; i1++) {
                            if (typeof data13[i1] !== "string") {
                              const err35 = { instancePath: instancePath + "/answers/" + i0 + "/optionIds/" + i1, schemaPath: "#/anyOf/3/properties/answers/items/properties/optionIds/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err35];
                              } else {
                                vErrors.push(err35);
                              }
                              errors++;
                            }
                          }
                        } else {
                          const err36 = { instancePath: instancePath + "/answers/" + i0 + "/optionIds", schemaPath: "#/anyOf/3/properties/answers/items/properties/optionIds/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                          if (vErrors === null) {
                            vErrors = [err36];
                          } else {
                            vErrors.push(err36);
                          }
                          errors++;
                        }
                      }
                      if (data11.otherText !== void 0) {
                        if (typeof data11.otherText !== "string") {
                          const err37 = { instancePath: instancePath + "/answers/" + i0 + "/otherText", schemaPath: "#/anyOf/3/properties/answers/items/properties/otherText/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err37];
                          } else {
                            vErrors.push(err37);
                          }
                          errors++;
                        }
                      }
                    } else {
                      const err38 = { instancePath: instancePath + "/answers/" + i0, schemaPath: "#/anyOf/3/properties/answers/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                      if (vErrors === null) {
                        vErrors = [err38];
                      } else {
                        vErrors.push(err38);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err39 = { instancePath: instancePath + "/answers", schemaPath: "#/anyOf/3/properties/answers/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                  if (vErrors === null) {
                    vErrors = [err39];
                  } else {
                    vErrors.push(err39);
                  }
                  errors++;
                }
              }
            } else {
              const err40 = { instancePath, schemaPath: "#/anyOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err40];
              } else {
                vErrors.push(err40);
              }
              errors++;
            }
            var _valid0 = _errs26 === errors;
            valid0 = valid0 || _valid0;
            if (!valid0) {
              const _errs46 = errors;
              if (data && typeof data == "object" && !Array.isArray(data)) {
                if (data.kind === void 0) {
                  const err41 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err41];
                  } else {
                    vErrors.push(err41);
                  }
                  errors++;
                }
                if (data.requestId === void 0) {
                  const err42 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "requestId" }, message: "must have required property 'requestId'" };
                  if (vErrors === null) {
                    vErrors = [err42];
                  } else {
                    vErrors.push(err42);
                  }
                  errors++;
                }
                if (data.content === void 0) {
                  const err43 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
                  if (vErrors === null) {
                    vErrors = [err43];
                  } else {
                    vErrors.push(err43);
                  }
                  errors++;
                }
                for (const key5 in data) {
                  if (!(key5 === "kind" || key5 === "requestId" || key5 === "content")) {
                    const err44 = { instancePath, schemaPath: "#/anyOf/4/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err44];
                    } else {
                      vErrors.push(err44);
                    }
                    errors++;
                  }
                }
                if (data.kind !== void 0) {
                  let data16 = data.kind;
                  if (typeof data16 !== "string") {
                    const err45 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/4/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err45];
                    } else {
                      vErrors.push(err45);
                    }
                    errors++;
                  }
                  if ("reply_to_question" !== data16) {
                    const err46 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/4/properties/kind/const", keyword: "const", params: { allowedValue: "reply_to_question" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err46];
                    } else {
                      vErrors.push(err46);
                    }
                    errors++;
                  }
                }
                if (data.requestId !== void 0) {
                  if (typeof data.requestId !== "string") {
                    const err47 = { instancePath: instancePath + "/requestId", schemaPath: "#/anyOf/4/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err47];
                    } else {
                      vErrors.push(err47);
                    }
                    errors++;
                  }
                }
                if (data.content !== void 0) {
                  if (typeof data.content !== "string") {
                    const err48 = { instancePath: instancePath + "/content", schemaPath: "#/anyOf/4/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err48];
                    } else {
                      vErrors.push(err48);
                    }
                    errors++;
                  }
                }
              } else {
                const err49 = { instancePath, schemaPath: "#/anyOf/4/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err49];
                } else {
                  vErrors.push(err49);
                }
                errors++;
              }
              var _valid0 = _errs46 === errors;
              valid0 = valid0 || _valid0;
              if (!valid0) {
                const _errs55 = errors;
                if (data && typeof data == "object" && !Array.isArray(data)) {
                  if (data.kind === void 0) {
                    const err50 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                    if (vErrors === null) {
                      vErrors = [err50];
                    } else {
                      vErrors.push(err50);
                    }
                    errors++;
                  }
                  if (data.requestId === void 0) {
                    const err51 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "requestId" }, message: "must have required property 'requestId'" };
                    if (vErrors === null) {
                      vErrors = [err51];
                    } else {
                      vErrors.push(err51);
                    }
                    errors++;
                  }
                  for (const key6 in data) {
                    if (!(key6 === "kind" || key6 === "requestId")) {
                      const err52 = { instancePath, schemaPath: "#/anyOf/5/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err52];
                      } else {
                        vErrors.push(err52);
                      }
                      errors++;
                    }
                  }
                  if (data.kind !== void 0) {
                    let data19 = data.kind;
                    if (typeof data19 !== "string") {
                      const err53 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/5/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err53];
                      } else {
                        vErrors.push(err53);
                      }
                      errors++;
                    }
                    if ("skip_question" !== data19) {
                      const err54 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/5/properties/kind/const", keyword: "const", params: { allowedValue: "skip_question" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err54];
                      } else {
                        vErrors.push(err54);
                      }
                      errors++;
                    }
                  }
                  if (data.requestId !== void 0) {
                    if (typeof data.requestId !== "string") {
                      const err55 = { instancePath: instancePath + "/requestId", schemaPath: "#/anyOf/5/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err55];
                      } else {
                        vErrors.push(err55);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err56 = { instancePath, schemaPath: "#/anyOf/5/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err56];
                  } else {
                    vErrors.push(err56);
                  }
                  errors++;
                }
                var _valid0 = _errs55 === errors;
                valid0 = valid0 || _valid0;
                if (!valid0) {
                  const _errs62 = errors;
                  if (data && typeof data == "object" && !Array.isArray(data)) {
                    if (data.kind === void 0) {
                      const err57 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                      if (vErrors === null) {
                        vErrors = [err57];
                      } else {
                        vErrors.push(err57);
                      }
                      errors++;
                    }
                    if (data.actionId === void 0) {
                      const err58 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                      if (vErrors === null) {
                        vErrors = [err58];
                      } else {
                        vErrors.push(err58);
                      }
                      errors++;
                    }
                    for (const key7 in data) {
                      if (!(key7 === "kind" || key7 === "actionId" || key7 === "scope" || key7 === "approvalInputId")) {
                        const err59 = { instancePath, schemaPath: "#/anyOf/6/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key7 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err59];
                        } else {
                          vErrors.push(err59);
                        }
                        errors++;
                      }
                    }
                    if (data.kind !== void 0) {
                      let data21 = data.kind;
                      if (typeof data21 !== "string") {
                        const err60 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/6/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err60];
                        } else {
                          vErrors.push(err60);
                        }
                        errors++;
                      }
                      if ("approve_action" !== data21) {
                        const err61 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/6/properties/kind/const", keyword: "const", params: { allowedValue: "approve_action" }, message: "must be equal to constant" };
                        if (vErrors === null) {
                          vErrors = [err61];
                        } else {
                          vErrors.push(err61);
                        }
                        errors++;
                      }
                    }
                    if (data.actionId !== void 0) {
                      if (typeof data.actionId !== "string") {
                        const err62 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/6/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err62];
                        } else {
                          vErrors.push(err62);
                        }
                        errors++;
                      }
                    }
                    if (data.scope !== void 0) {
                      let data23 = data.scope;
                      if (typeof data23 !== "string") {
                        const err63 = { instancePath: instancePath + "/scope", schemaPath: "#/anyOf/6/properties/scope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err63];
                        } else {
                          vErrors.push(err63);
                        }
                        errors++;
                      }
                      if (!(data23 === "action" || data23 === "goal" || data23 === "workspace")) {
                        const err64 = { instancePath: instancePath + "/scope", schemaPath: "#/anyOf/6/properties/scope/enum", keyword: "enum", params: { allowedValues: schema31.anyOf[6].properties.scope.enum }, message: "must be equal to one of the allowed values" };
                        if (vErrors === null) {
                          vErrors = [err64];
                        } else {
                          vErrors.push(err64);
                        }
                        errors++;
                      }
                    }
                    if (data.approvalInputId !== void 0) {
                      if (typeof data.approvalInputId !== "string") {
                        const err65 = { instancePath: instancePath + "/approvalInputId", schemaPath: "#/anyOf/6/properties/approvalInputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err65];
                        } else {
                          vErrors.push(err65);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err66 = { instancePath, schemaPath: "#/anyOf/6/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err66];
                    } else {
                      vErrors.push(err66);
                    }
                    errors++;
                  }
                  var _valid0 = _errs62 === errors;
                  valid0 = valid0 || _valid0;
                  if (!valid0) {
                    const _errs73 = errors;
                    if (data && typeof data == "object" && !Array.isArray(data)) {
                      if (data.kind === void 0) {
                        const err67 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                        if (vErrors === null) {
                          vErrors = [err67];
                        } else {
                          vErrors.push(err67);
                        }
                        errors++;
                      }
                      if (data.actionId === void 0) {
                        const err68 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                        if (vErrors === null) {
                          vErrors = [err68];
                        } else {
                          vErrors.push(err68);
                        }
                        errors++;
                      }
                      if (data.input === void 0) {
                        const err69 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "input" }, message: "must have required property 'input'" };
                        if (vErrors === null) {
                          vErrors = [err69];
                        } else {
                          vErrors.push(err69);
                        }
                        errors++;
                      }
                      if (data.reviewRef === void 0) {
                        const err70 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "reviewRef" }, message: "must have required property 'reviewRef'" };
                        if (vErrors === null) {
                          vErrors = [err70];
                        } else {
                          vErrors.push(err70);
                        }
                        errors++;
                      }
                      for (const key8 in data) {
                        if (!(key8 === "kind" || key8 === "actionId" || key8 === "input" || key8 === "scope" || key8 === "reviewRef" || key8 === "approvalInputId")) {
                          const err71 = { instancePath, schemaPath: "#/anyOf/7/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key8 }, message: "must NOT have additional properties" };
                          if (vErrors === null) {
                            vErrors = [err71];
                          } else {
                            vErrors.push(err71);
                          }
                          errors++;
                        }
                      }
                      if (data.kind !== void 0) {
                        let data25 = data.kind;
                        if (typeof data25 !== "string") {
                          const err72 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/7/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err72];
                          } else {
                            vErrors.push(err72);
                          }
                          errors++;
                        }
                        if ("approve_action_revision" !== data25) {
                          const err73 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/7/properties/kind/const", keyword: "const", params: { allowedValue: "approve_action_revision" }, message: "must be equal to constant" };
                          if (vErrors === null) {
                            vErrors = [err73];
                          } else {
                            vErrors.push(err73);
                          }
                          errors++;
                        }
                      }
                      if (data.actionId !== void 0) {
                        if (typeof data.actionId !== "string") {
                          const err74 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/7/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err74];
                          } else {
                            vErrors.push(err74);
                          }
                          errors++;
                        }
                      }
                      if (data.input !== void 0) {
                        if (!validate13(data.input, { instancePath: instancePath + "/input", parentData: data, parentDataProperty: "input", rootData })) {
                          vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
                          errors = vErrors.length;
                        }
                      }
                      if (data.scope !== void 0) {
                        let data28 = data.scope;
                        if (typeof data28 !== "string") {
                          const err75 = { instancePath: instancePath + "/scope", schemaPath: "#/anyOf/7/properties/scope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err75];
                          } else {
                            vErrors.push(err75);
                          }
                          errors++;
                        }
                        if (!(data28 === "action" || data28 === "goal" || data28 === "workspace")) {
                          const err76 = { instancePath: instancePath + "/scope", schemaPath: "#/anyOf/7/properties/scope/enum", keyword: "enum", params: { allowedValues: schema31.anyOf[7].properties.scope.enum }, message: "must be equal to one of the allowed values" };
                          if (vErrors === null) {
                            vErrors = [err76];
                          } else {
                            vErrors.push(err76);
                          }
                          errors++;
                        }
                      }
                      if (data.reviewRef !== void 0) {
                        if (typeof data.reviewRef !== "string") {
                          const err77 = { instancePath: instancePath + "/reviewRef", schemaPath: "#/anyOf/7/properties/reviewRef/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err77];
                          } else {
                            vErrors.push(err77);
                          }
                          errors++;
                        }
                      }
                      if (data.approvalInputId !== void 0) {
                        if (typeof data.approvalInputId !== "string") {
                          const err78 = { instancePath: instancePath + "/approvalInputId", schemaPath: "#/anyOf/7/properties/approvalInputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err78];
                          } else {
                            vErrors.push(err78);
                          }
                          errors++;
                        }
                      }
                    } else {
                      const err79 = { instancePath, schemaPath: "#/anyOf/7/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                      if (vErrors === null) {
                        vErrors = [err79];
                      } else {
                        vErrors.push(err79);
                      }
                      errors++;
                    }
                    var _valid0 = _errs73 === errors;
                    valid0 = valid0 || _valid0;
                    if (!valid0) {
                      const _errs87 = errors;
                      if (data && typeof data == "object" && !Array.isArray(data)) {
                        if (data.kind === void 0) {
                          const err80 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                          if (vErrors === null) {
                            vErrors = [err80];
                          } else {
                            vErrors.push(err80);
                          }
                          errors++;
                        }
                        if (data.actionId === void 0) {
                          const err81 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                          if (vErrors === null) {
                            vErrors = [err81];
                          } else {
                            vErrors.push(err81);
                          }
                          errors++;
                        }
                        if (data.recoveryRef === void 0) {
                          const err82 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "recoveryRef" }, message: "must have required property 'recoveryRef'" };
                          if (vErrors === null) {
                            vErrors = [err82];
                          } else {
                            vErrors.push(err82);
                          }
                          errors++;
                        }
                        for (const key9 in data) {
                          if (!(key9 === "kind" || key9 === "actionId" || key9 === "recoveryRef")) {
                            const err83 = { instancePath, schemaPath: "#/anyOf/8/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key9 }, message: "must NOT have additional properties" };
                            if (vErrors === null) {
                              vErrors = [err83];
                            } else {
                              vErrors.push(err83);
                            }
                            errors++;
                          }
                        }
                        if (data.kind !== void 0) {
                          let data31 = data.kind;
                          if (typeof data31 !== "string") {
                            const err84 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/8/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err84];
                            } else {
                              vErrors.push(err84);
                            }
                            errors++;
                          }
                          if ("retry_unknown_action" !== data31) {
                            const err85 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/8/properties/kind/const", keyword: "const", params: { allowedValue: "retry_unknown_action" }, message: "must be equal to constant" };
                            if (vErrors === null) {
                              vErrors = [err85];
                            } else {
                              vErrors.push(err85);
                            }
                            errors++;
                          }
                        }
                        if (data.actionId !== void 0) {
                          if (typeof data.actionId !== "string") {
                            const err86 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/8/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err86];
                            } else {
                              vErrors.push(err86);
                            }
                            errors++;
                          }
                        }
                        if (data.recoveryRef !== void 0) {
                          if (typeof data.recoveryRef !== "string") {
                            const err87 = { instancePath: instancePath + "/recoveryRef", schemaPath: "#/anyOf/8/properties/recoveryRef/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err87];
                            } else {
                              vErrors.push(err87);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err88 = { instancePath, schemaPath: "#/anyOf/8/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                        if (vErrors === null) {
                          vErrors = [err88];
                        } else {
                          vErrors.push(err88);
                        }
                        errors++;
                      }
                      var _valid0 = _errs87 === errors;
                      valid0 = valid0 || _valid0;
                      if (!valid0) {
                        const _errs96 = errors;
                        if (data && typeof data == "object" && !Array.isArray(data)) {
                          if (data.kind === void 0) {
                            const err89 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                            if (vErrors === null) {
                              vErrors = [err89];
                            } else {
                              vErrors.push(err89);
                            }
                            errors++;
                          }
                          if (data.actionId === void 0) {
                            const err90 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                            if (vErrors === null) {
                              vErrors = [err90];
                            } else {
                              vErrors.push(err90);
                            }
                            errors++;
                          }
                          if (data.recoveryRef === void 0) {
                            const err91 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "recoveryRef" }, message: "must have required property 'recoveryRef'" };
                            if (vErrors === null) {
                              vErrors = [err91];
                            } else {
                              vErrors.push(err91);
                            }
                            errors++;
                          }
                          if (data.reason === void 0) {
                            const err92 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
                            if (vErrors === null) {
                              vErrors = [err92];
                            } else {
                              vErrors.push(err92);
                            }
                            errors++;
                          }
                          for (const key10 in data) {
                            if (!(key10 === "kind" || key10 === "actionId" || key10 === "recoveryRef" || key10 === "reason")) {
                              const err93 = { instancePath, schemaPath: "#/anyOf/9/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key10 }, message: "must NOT have additional properties" };
                              if (vErrors === null) {
                                vErrors = [err93];
                              } else {
                                vErrors.push(err93);
                              }
                              errors++;
                            }
                          }
                          if (data.kind !== void 0) {
                            let data34 = data.kind;
                            if (typeof data34 !== "string") {
                              const err94 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/9/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err94];
                              } else {
                                vErrors.push(err94);
                              }
                              errors++;
                            }
                            if ("decline_unknown_action_retry" !== data34) {
                              const err95 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/9/properties/kind/const", keyword: "const", params: { allowedValue: "decline_unknown_action_retry" }, message: "must be equal to constant" };
                              if (vErrors === null) {
                                vErrors = [err95];
                              } else {
                                vErrors.push(err95);
                              }
                              errors++;
                            }
                          }
                          if (data.actionId !== void 0) {
                            if (typeof data.actionId !== "string") {
                              const err96 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/9/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err96];
                              } else {
                                vErrors.push(err96);
                              }
                              errors++;
                            }
                          }
                          if (data.recoveryRef !== void 0) {
                            if (typeof data.recoveryRef !== "string") {
                              const err97 = { instancePath: instancePath + "/recoveryRef", schemaPath: "#/anyOf/9/properties/recoveryRef/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err97];
                              } else {
                                vErrors.push(err97);
                              }
                              errors++;
                            }
                          }
                          if (data.reason !== void 0) {
                            if (typeof data.reason !== "string") {
                              const err98 = { instancePath: instancePath + "/reason", schemaPath: "#/anyOf/9/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err98];
                              } else {
                                vErrors.push(err98);
                              }
                              errors++;
                            }
                          }
                        } else {
                          const err99 = { instancePath, schemaPath: "#/anyOf/9/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                          if (vErrors === null) {
                            vErrors = [err99];
                          } else {
                            vErrors.push(err99);
                          }
                          errors++;
                        }
                        var _valid0 = _errs96 === errors;
                        valid0 = valid0 || _valid0;
                        if (!valid0) {
                          const _errs107 = errors;
                          if (data && typeof data == "object" && !Array.isArray(data)) {
                            if (data.kind === void 0) {
                              const err100 = { instancePath, schemaPath: "#/anyOf/10/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                              if (vErrors === null) {
                                vErrors = [err100];
                              } else {
                                vErrors.push(err100);
                              }
                              errors++;
                            }
                            if (data.actionId === void 0) {
                              const err101 = { instancePath, schemaPath: "#/anyOf/10/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                              if (vErrors === null) {
                                vErrors = [err101];
                              } else {
                                vErrors.push(err101);
                              }
                              errors++;
                            }
                            if (data.reason === void 0) {
                              const err102 = { instancePath, schemaPath: "#/anyOf/10/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
                              if (vErrors === null) {
                                vErrors = [err102];
                              } else {
                                vErrors.push(err102);
                              }
                              errors++;
                            }
                            for (const key11 in data) {
                              if (!(key11 === "kind" || key11 === "actionId" || key11 === "reason")) {
                                const err103 = { instancePath, schemaPath: "#/anyOf/10/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key11 }, message: "must NOT have additional properties" };
                                if (vErrors === null) {
                                  vErrors = [err103];
                                } else {
                                  vErrors.push(err103);
                                }
                                errors++;
                              }
                            }
                            if (data.kind !== void 0) {
                              let data38 = data.kind;
                              if (typeof data38 !== "string") {
                                const err104 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/10/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err104];
                                } else {
                                  vErrors.push(err104);
                                }
                                errors++;
                              }
                              if ("reject_action" !== data38) {
                                const err105 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/10/properties/kind/const", keyword: "const", params: { allowedValue: "reject_action" }, message: "must be equal to constant" };
                                if (vErrors === null) {
                                  vErrors = [err105];
                                } else {
                                  vErrors.push(err105);
                                }
                                errors++;
                              }
                            }
                            if (data.actionId !== void 0) {
                              if (typeof data.actionId !== "string") {
                                const err106 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/10/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err106];
                                } else {
                                  vErrors.push(err106);
                                }
                                errors++;
                              }
                            }
                            if (data.reason !== void 0) {
                              if (typeof data.reason !== "string") {
                                const err107 = { instancePath: instancePath + "/reason", schemaPath: "#/anyOf/10/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err107];
                                } else {
                                  vErrors.push(err107);
                                }
                                errors++;
                              }
                            }
                          } else {
                            const err108 = { instancePath, schemaPath: "#/anyOf/10/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                            if (vErrors === null) {
                              vErrors = [err108];
                            } else {
                              vErrors.push(err108);
                            }
                            errors++;
                          }
                          var _valid0 = _errs107 === errors;
                          valid0 = valid0 || _valid0;
                          if (!valid0) {
                            const _errs116 = errors;
                            if (data && typeof data == "object" && !Array.isArray(data)) {
                              if (data.kind === void 0) {
                                const err109 = { instancePath, schemaPath: "#/anyOf/11/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                                if (vErrors === null) {
                                  vErrors = [err109];
                                } else {
                                  vErrors.push(err109);
                                }
                                errors++;
                              }
                              if (data.requestId === void 0) {
                                const err110 = { instancePath, schemaPath: "#/anyOf/11/required", keyword: "required", params: { missingProperty: "requestId" }, message: "must have required property 'requestId'" };
                                if (vErrors === null) {
                                  vErrors = [err110];
                                } else {
                                  vErrors.push(err110);
                                }
                                errors++;
                              }
                              for (const key12 in data) {
                                if (!(key12 === "kind" || key12 === "requestId")) {
                                  const err111 = { instancePath, schemaPath: "#/anyOf/11/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key12 }, message: "must NOT have additional properties" };
                                  if (vErrors === null) {
                                    vErrors = [err111];
                                  } else {
                                    vErrors.push(err111);
                                  }
                                  errors++;
                                }
                              }
                              if (data.kind !== void 0) {
                                let data41 = data.kind;
                                if (typeof data41 !== "string") {
                                  const err112 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/11/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err112];
                                  } else {
                                    vErrors.push(err112);
                                  }
                                  errors++;
                                }
                                if ("approve" !== data41) {
                                  const err113 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/11/properties/kind/const", keyword: "const", params: { allowedValue: "approve" }, message: "must be equal to constant" };
                                  if (vErrors === null) {
                                    vErrors = [err113];
                                  } else {
                                    vErrors.push(err113);
                                  }
                                  errors++;
                                }
                              }
                              if (data.requestId !== void 0) {
                                if (typeof data.requestId !== "string") {
                                  const err114 = { instancePath: instancePath + "/requestId", schemaPath: "#/anyOf/11/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err114];
                                  } else {
                                    vErrors.push(err114);
                                  }
                                  errors++;
                                }
                              }
                            } else {
                              const err115 = { instancePath, schemaPath: "#/anyOf/11/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                              if (vErrors === null) {
                                vErrors = [err115];
                              } else {
                                vErrors.push(err115);
                              }
                              errors++;
                            }
                            var _valid0 = _errs116 === errors;
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
        const err116 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err116];
        } else {
          vErrors.push(err116);
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
      validate12.errors = vErrors;
      return errors === 0;
    }
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.id === void 0) {
          const err0 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.name === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.type === void 0) {
          const err2 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.source === void 0) {
          const err3 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.target === void 0) {
          const err4 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.payload === void 0) {
          const err5 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.sentAt === void 0) {
          const err6 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "sentAt" }, message: "must have required property 'sentAt'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "id" || key0 === "name" || key0 === "type" || key0 === "source" || key0 === "target" || key0 === "payload" || key0 === "sentAt")) {
            const err7 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.id !== void 0) {
          if (typeof data.id !== "string") {
            const err8 = { instancePath: instancePath + "/id", schemaPath: "#/anyOf/0/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.name !== void 0) {
          if (typeof data.name !== "string") {
            const err9 = { instancePath: instancePath + "/name", schemaPath: "#/anyOf/0/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.type !== void 0) {
          let data2 = data.type;
          if (typeof data2 !== "string") {
            const err10 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/0/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
          if ("work" !== data2) {
            const err11 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/0/properties/type/const", keyword: "const", params: { allowedValue: "work" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.source !== void 0) {
          let data3 = data.source;
          const _errs12 = errors;
          let valid3 = false;
          const _errs13 = errors;
          if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
            if (data3.role === void 0) {
              const err12 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            if (data3.workerId === void 0) {
              const err13 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "workerId" }, message: "must have required property 'workerId'" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            if (data3.generation === void 0) {
              const err14 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "generation" }, message: "must have required property 'generation'" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            for (const key1 in data3) {
              if (!(key1 === "role" || key1 === "workerId" || key1 === "generation")) {
                const err15 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
            }
            if (data3.role !== void 0) {
              let data4 = data3.role;
              if (typeof data4 !== "string") {
                const err16 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
              if ("worker" !== data4) {
                const err17 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/const", keyword: "const", params: { allowedValue: "worker" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
            if (data3.workerId !== void 0) {
              if (typeof data3.workerId !== "string") {
                const err18 = { instancePath: instancePath + "/source/workerId", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/workerId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
            if (data3.generation !== void 0) {
              if (typeof data3.generation !== "string") {
                const err19 = { instancePath: instancePath + "/source/generation", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/generation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
          } else {
            const err20 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
          var _valid1 = _errs13 === errors;
          valid3 = valid3 || _valid1;
          if (!valid3) {
            const _errs22 = errors;
            if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
              if (data3.role === void 0) {
                const err21 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
              if (data3.externalId === void 0) {
                const err22 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "externalId" }, message: "must have required property 'externalId'" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
              for (const key2 in data3) {
                if (!(key2 === "role" || key2 === "externalId")) {
                  const err23 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err23];
                  } else {
                    vErrors.push(err23);
                  }
                  errors++;
                }
              }
              if (data3.role !== void 0) {
                let data7 = data3.role;
                if (typeof data7 !== "string") {
                  const err24 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err24];
                  } else {
                    vErrors.push(err24);
                  }
                  errors++;
                }
                if ("external" !== data7) {
                  const err25 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/const", keyword: "const", params: { allowedValue: "external" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err25];
                  } else {
                    vErrors.push(err25);
                  }
                  errors++;
                }
              }
              if (data3.externalId !== void 0) {
                if (typeof data3.externalId !== "string") {
                  const err26 = { instancePath: instancePath + "/source/externalId", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/externalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err26];
                  } else {
                    vErrors.push(err26);
                  }
                  errors++;
                }
              }
            } else {
              const err27 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
            var _valid1 = _errs22 === errors;
            valid3 = valid3 || _valid1;
            if (!valid3) {
              const _errs29 = errors;
              if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
                if (data3.role === void 0) {
                  const err28 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                  if (vErrors === null) {
                    vErrors = [err28];
                  } else {
                    vErrors.push(err28);
                  }
                  errors++;
                }
                for (const key3 in data3) {
                  if (!(key3 === "role")) {
                    const err29 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err29];
                    } else {
                      vErrors.push(err29);
                    }
                    errors++;
                  }
                }
                if (data3.role !== void 0) {
                  let data9 = data3.role;
                  if (typeof data9 !== "string") {
                    const err30 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err30];
                    } else {
                      vErrors.push(err30);
                    }
                    errors++;
                  }
                  if ("supervisor" !== data9) {
                    const err31 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/const", keyword: "const", params: { allowedValue: "supervisor" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err31];
                    } else {
                      vErrors.push(err31);
                    }
                    errors++;
                  }
                }
              } else {
                const err32 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
              var _valid1 = _errs29 === errors;
              valid3 = valid3 || _valid1;
            }
          }
          if (!valid3) {
            const err33 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          } else {
            errors = _errs12;
            if (vErrors !== null) {
              if (_errs12) {
                vErrors.length = _errs12;
              } else {
                vErrors = null;
              }
            }
          }
        }
        if (data.target !== void 0) {
          let data10 = data.target;
          if (typeof data10 !== "string") {
            const err34 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
          if (!(data10 === "supervisor" || data10 === "worker")) {
            const err35 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err35];
            } else {
              vErrors.push(err35);
            }
            errors++;
          }
        }
        if (data.payload !== void 0) {
          let data11 = data.payload;
          if (data11 && typeof data11 == "object" && !Array.isArray(data11)) {
            if (data11.action === void 0) {
              const err36 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/0/properties/payload/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
              if (vErrors === null) {
                vErrors = [err36];
              } else {
                vErrors.push(err36);
              }
              errors++;
            }
            if (data11.material === void 0) {
              const err37 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/0/properties/payload/required", keyword: "required", params: { missingProperty: "material" }, message: "must have required property 'material'" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
            for (const key4 in data11) {
              if (!(key4 === "action" || key4 === "material")) {
                const err38 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/0/properties/payload/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err38];
                } else {
                  vErrors.push(err38);
                }
                errors++;
              }
            }
            if (data11.action !== void 0) {
              let data12 = data11.action;
              if (typeof data12 !== "string") {
                const err39 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/0/properties/payload/properties/action/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err39];
                } else {
                  vErrors.push(err39);
                }
                errors++;
              }
              if ("submitted" !== data12) {
                const err40 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/0/properties/payload/properties/action/const", keyword: "const", params: { allowedValue: "submitted" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
            }
            if (data11.material !== void 0) {
              let data13 = data11.material;
              if (data13 && typeof data13 == "object" && !Array.isArray(data13)) {
                if (data13.kind === void 0) {
                  const err41 = { instancePath: instancePath + "/payload/material", schemaPath: "#/anyOf/0/properties/payload/properties/material/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err41];
                  } else {
                    vErrors.push(err41);
                  }
                  errors++;
                }
                if (data13.text === void 0) {
                  const err42 = { instancePath: instancePath + "/payload/material", schemaPath: "#/anyOf/0/properties/payload/properties/material/required", keyword: "required", params: { missingProperty: "text" }, message: "must have required property 'text'" };
                  if (vErrors === null) {
                    vErrors = [err42];
                  } else {
                    vErrors.push(err42);
                  }
                  errors++;
                }
                for (const key5 in data13) {
                  if (!(key5 === "kind" || key5 === "text")) {
                    const err43 = { instancePath: instancePath + "/payload/material", schemaPath: "#/anyOf/0/properties/payload/properties/material/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err43];
                    } else {
                      vErrors.push(err43);
                    }
                    errors++;
                  }
                }
                if (data13.kind !== void 0) {
                  let data14 = data13.kind;
                  if (typeof data14 !== "string") {
                    const err44 = { instancePath: instancePath + "/payload/material/kind", schemaPath: "#/anyOf/0/properties/payload/properties/material/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err44];
                    } else {
                      vErrors.push(err44);
                    }
                    errors++;
                  }
                  if ("text" !== data14) {
                    const err45 = { instancePath: instancePath + "/payload/material/kind", schemaPath: "#/anyOf/0/properties/payload/properties/material/properties/kind/const", keyword: "const", params: { allowedValue: "text" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err45];
                    } else {
                      vErrors.push(err45);
                    }
                    errors++;
                  }
                }
                if (data13.text !== void 0) {
                  if (typeof data13.text !== "string") {
                    const err46 = { instancePath: instancePath + "/payload/material/text", schemaPath: "#/anyOf/0/properties/payload/properties/material/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err46];
                    } else {
                      vErrors.push(err46);
                    }
                    errors++;
                  }
                }
              } else {
                const err47 = { instancePath: instancePath + "/payload/material", schemaPath: "#/anyOf/0/properties/payload/properties/material/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              }
            }
          } else {
            const err48 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/0/properties/payload/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err48];
            } else {
              vErrors.push(err48);
            }
            errors++;
          }
        }
        if (data.sentAt !== void 0) {
          if (typeof data.sentAt !== "string") {
            const err49 = { instancePath: instancePath + "/sentAt", schemaPath: "#/anyOf/0/properties/sentAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err49];
            } else {
              vErrors.push(err49);
            }
            errors++;
          }
        }
      } else {
        const err50 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err50];
        } else {
          vErrors.push(err50);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs51 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.id === void 0) {
            const err51 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
            if (vErrors === null) {
              vErrors = [err51];
            } else {
              vErrors.push(err51);
            }
            errors++;
          }
          if (data.name === void 0) {
            const err52 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
            if (vErrors === null) {
              vErrors = [err52];
            } else {
              vErrors.push(err52);
            }
            errors++;
          }
          if (data.type === void 0) {
            const err53 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
            if (vErrors === null) {
              vErrors = [err53];
            } else {
              vErrors.push(err53);
            }
            errors++;
          }
          if (data.source === void 0) {
            const err54 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
            if (vErrors === null) {
              vErrors = [err54];
            } else {
              vErrors.push(err54);
            }
            errors++;
          }
          if (data.target === void 0) {
            const err55 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
            if (vErrors === null) {
              vErrors = [err55];
            } else {
              vErrors.push(err55);
            }
            errors++;
          }
          if (data.payload === void 0) {
            const err56 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
            if (vErrors === null) {
              vErrors = [err56];
            } else {
              vErrors.push(err56);
            }
            errors++;
          }
          if (data.sentAt === void 0) {
            const err57 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "sentAt" }, message: "must have required property 'sentAt'" };
            if (vErrors === null) {
              vErrors = [err57];
            } else {
              vErrors.push(err57);
            }
            errors++;
          }
          if (data.goalId === void 0) {
            const err58 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
            if (vErrors === null) {
              vErrors = [err58];
            } else {
              vErrors.push(err58);
            }
            errors++;
          }
          if (data.replyTo === void 0) {
            const err59 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "replyTo" }, message: "must have required property 'replyTo'" };
            if (vErrors === null) {
              vErrors = [err59];
            } else {
              vErrors.push(err59);
            }
            errors++;
          }
          for (const key6 in data) {
            if (!func2.call(schema12.anyOf[1].properties, key6)) {
              const err60 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err60];
              } else {
                vErrors.push(err60);
              }
              errors++;
            }
          }
          if (data.id !== void 0) {
            if (typeof data.id !== "string") {
              const err61 = { instancePath: instancePath + "/id", schemaPath: "#/anyOf/1/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err61];
              } else {
                vErrors.push(err61);
              }
              errors++;
            }
          }
          if (data.name !== void 0) {
            if (typeof data.name !== "string") {
              const err62 = { instancePath: instancePath + "/name", schemaPath: "#/anyOf/1/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err62];
              } else {
                vErrors.push(err62);
              }
              errors++;
            }
          }
          if (data.type !== void 0) {
            let data19 = data.type;
            if (typeof data19 !== "string") {
              const err63 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/1/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err63];
              } else {
                vErrors.push(err63);
              }
              errors++;
            }
            if ("response" !== data19) {
              const err64 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/1/properties/type/const", keyword: "const", params: { allowedValue: "response" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err64];
              } else {
                vErrors.push(err64);
              }
              errors++;
            }
          }
          if (data.source !== void 0) {
            let data20 = data.source;
            const _errs62 = errors;
            let valid12 = false;
            const _errs63 = errors;
            if (data20 && typeof data20 == "object" && !Array.isArray(data20)) {
              if (data20.role === void 0) {
                const err65 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                if (vErrors === null) {
                  vErrors = [err65];
                } else {
                  vErrors.push(err65);
                }
                errors++;
              }
              if (data20.workerId === void 0) {
                const err66 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "workerId" }, message: "must have required property 'workerId'" };
                if (vErrors === null) {
                  vErrors = [err66];
                } else {
                  vErrors.push(err66);
                }
                errors++;
              }
              if (data20.generation === void 0) {
                const err67 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "generation" }, message: "must have required property 'generation'" };
                if (vErrors === null) {
                  vErrors = [err67];
                } else {
                  vErrors.push(err67);
                }
                errors++;
              }
              for (const key7 in data20) {
                if (!(key7 === "role" || key7 === "workerId" || key7 === "generation")) {
                  const err68 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key7 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err68];
                  } else {
                    vErrors.push(err68);
                  }
                  errors++;
                }
              }
              if (data20.role !== void 0) {
                let data21 = data20.role;
                if (typeof data21 !== "string") {
                  const err69 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err69];
                  } else {
                    vErrors.push(err69);
                  }
                  errors++;
                }
                if ("worker" !== data21) {
                  const err70 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/const", keyword: "const", params: { allowedValue: "worker" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err70];
                  } else {
                    vErrors.push(err70);
                  }
                  errors++;
                }
              }
              if (data20.workerId !== void 0) {
                if (typeof data20.workerId !== "string") {
                  const err71 = { instancePath: instancePath + "/source/workerId", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/workerId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err71];
                  } else {
                    vErrors.push(err71);
                  }
                  errors++;
                }
              }
              if (data20.generation !== void 0) {
                if (typeof data20.generation !== "string") {
                  const err72 = { instancePath: instancePath + "/source/generation", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/generation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err72];
                  } else {
                    vErrors.push(err72);
                  }
                  errors++;
                }
              }
            } else {
              const err73 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err73];
              } else {
                vErrors.push(err73);
              }
              errors++;
            }
            var _valid2 = _errs63 === errors;
            valid12 = valid12 || _valid2;
            if (!valid12) {
              const _errs72 = errors;
              if (data20 && typeof data20 == "object" && !Array.isArray(data20)) {
                if (data20.role === void 0) {
                  const err74 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                  if (vErrors === null) {
                    vErrors = [err74];
                  } else {
                    vErrors.push(err74);
                  }
                  errors++;
                }
                if (data20.externalId === void 0) {
                  const err75 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "externalId" }, message: "must have required property 'externalId'" };
                  if (vErrors === null) {
                    vErrors = [err75];
                  } else {
                    vErrors.push(err75);
                  }
                  errors++;
                }
                for (const key8 in data20) {
                  if (!(key8 === "role" || key8 === "externalId")) {
                    const err76 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key8 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err76];
                    } else {
                      vErrors.push(err76);
                    }
                    errors++;
                  }
                }
                if (data20.role !== void 0) {
                  let data24 = data20.role;
                  if (typeof data24 !== "string") {
                    const err77 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err77];
                    } else {
                      vErrors.push(err77);
                    }
                    errors++;
                  }
                  if ("external" !== data24) {
                    const err78 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/const", keyword: "const", params: { allowedValue: "external" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err78];
                    } else {
                      vErrors.push(err78);
                    }
                    errors++;
                  }
                }
                if (data20.externalId !== void 0) {
                  if (typeof data20.externalId !== "string") {
                    const err79 = { instancePath: instancePath + "/source/externalId", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/externalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err79];
                    } else {
                      vErrors.push(err79);
                    }
                    errors++;
                  }
                }
              } else {
                const err80 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err80];
                } else {
                  vErrors.push(err80);
                }
                errors++;
              }
              var _valid2 = _errs72 === errors;
              valid12 = valid12 || _valid2;
              if (!valid12) {
                const _errs79 = errors;
                if (data20 && typeof data20 == "object" && !Array.isArray(data20)) {
                  if (data20.role === void 0) {
                    const err81 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                    if (vErrors === null) {
                      vErrors = [err81];
                    } else {
                      vErrors.push(err81);
                    }
                    errors++;
                  }
                  for (const key9 in data20) {
                    if (!(key9 === "role")) {
                      const err82 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key9 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err82];
                      } else {
                        vErrors.push(err82);
                      }
                      errors++;
                    }
                  }
                  if (data20.role !== void 0) {
                    let data26 = data20.role;
                    if (typeof data26 !== "string") {
                      const err83 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err83];
                      } else {
                        vErrors.push(err83);
                      }
                      errors++;
                    }
                    if ("supervisor" !== data26) {
                      const err84 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/const", keyword: "const", params: { allowedValue: "supervisor" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err84];
                      } else {
                        vErrors.push(err84);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err85 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err85];
                  } else {
                    vErrors.push(err85);
                  }
                  errors++;
                }
                var _valid2 = _errs79 === errors;
                valid12 = valid12 || _valid2;
              }
            }
            if (!valid12) {
              const err86 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
              if (vErrors === null) {
                vErrors = [err86];
              } else {
                vErrors.push(err86);
              }
              errors++;
            } else {
              errors = _errs62;
              if (vErrors !== null) {
                if (_errs62) {
                  vErrors.length = _errs62;
                } else {
                  vErrors = null;
                }
              }
            }
          }
          if (data.target !== void 0) {
            let data27 = data.target;
            if (typeof data27 !== "string") {
              const err87 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err87];
              } else {
                vErrors.push(err87);
              }
              errors++;
            }
            if (!(data27 === "supervisor" || data27 === "worker")) {
              const err88 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
              if (vErrors === null) {
                vErrors = [err88];
              } else {
                vErrors.push(err88);
              }
              errors++;
            }
          }
          if (data.payload !== void 0) {
            let data28 = data.payload;
            if (data28 && typeof data28 == "object" && !Array.isArray(data28)) {
              if (data28.action === void 0) {
                const err89 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/1/properties/payload/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
                if (vErrors === null) {
                  vErrors = [err89];
                } else {
                  vErrors.push(err89);
                }
                errors++;
              }
              for (const key10 in data28) {
                if (!(key10 === "action")) {
                  const err90 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/1/properties/payload/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key10 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err90];
                  } else {
                    vErrors.push(err90);
                  }
                  errors++;
                }
              }
              if (data28.action !== void 0) {
                let data29 = data28.action;
                if (typeof data29 !== "string") {
                  const err91 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/1/properties/payload/properties/action/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err91];
                  } else {
                    vErrors.push(err91);
                  }
                  errors++;
                }
                if ("goal_created" !== data29) {
                  const err92 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/1/properties/payload/properties/action/const", keyword: "const", params: { allowedValue: "goal_created" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err92];
                  } else {
                    vErrors.push(err92);
                  }
                  errors++;
                }
              }
            } else {
              const err93 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/1/properties/payload/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err93];
              } else {
                vErrors.push(err93);
              }
              errors++;
            }
          }
          if (data.sentAt !== void 0) {
            if (typeof data.sentAt !== "string") {
              const err94 = { instancePath: instancePath + "/sentAt", schemaPath: "#/anyOf/1/properties/sentAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err94];
              } else {
                vErrors.push(err94);
              }
              errors++;
            }
          }
          if (data.goalId !== void 0) {
            if (typeof data.goalId !== "string") {
              const err95 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/1/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err95];
              } else {
                vErrors.push(err95);
              }
              errors++;
            }
          }
          if (data.replyTo !== void 0) {
            if (typeof data.replyTo !== "string") {
              const err96 = { instancePath: instancePath + "/replyTo", schemaPath: "#/anyOf/1/properties/replyTo/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err96];
              } else {
                vErrors.push(err96);
              }
              errors++;
            }
          }
        } else {
          const err97 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err97];
          } else {
            vErrors.push(err97);
          }
          errors++;
        }
        var _valid0 = _errs51 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs98 = errors;
          if (data && typeof data == "object" && !Array.isArray(data)) {
            if (data.id === void 0) {
              const err98 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err98];
              } else {
                vErrors.push(err98);
              }
              errors++;
            }
            if (data.name === void 0) {
              const err99 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
              if (vErrors === null) {
                vErrors = [err99];
              } else {
                vErrors.push(err99);
              }
              errors++;
            }
            if (data.type === void 0) {
              const err100 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
              if (vErrors === null) {
                vErrors = [err100];
              } else {
                vErrors.push(err100);
              }
              errors++;
            }
            if (data.source === void 0) {
              const err101 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
              if (vErrors === null) {
                vErrors = [err101];
              } else {
                vErrors.push(err101);
              }
              errors++;
            }
            if (data.target === void 0) {
              const err102 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
              if (vErrors === null) {
                vErrors = [err102];
              } else {
                vErrors.push(err102);
              }
              errors++;
            }
            if (data.payload === void 0) {
              const err103 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
              if (vErrors === null) {
                vErrors = [err103];
              } else {
                vErrors.push(err103);
              }
              errors++;
            }
            if (data.sentAt === void 0) {
              const err104 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "sentAt" }, message: "must have required property 'sentAt'" };
              if (vErrors === null) {
                vErrors = [err104];
              } else {
                vErrors.push(err104);
              }
              errors++;
            }
            if (data.goalId === void 0) {
              const err105 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
              if (vErrors === null) {
                vErrors = [err105];
              } else {
                vErrors.push(err105);
              }
              errors++;
            }
            if (data.replyTo === void 0) {
              const err106 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "replyTo" }, message: "must have required property 'replyTo'" };
              if (vErrors === null) {
                vErrors = [err106];
              } else {
                vErrors.push(err106);
              }
              errors++;
            }
            for (const key11 in data) {
              if (!func2.call(schema12.anyOf[2].properties, key11)) {
                const err107 = { instancePath, schemaPath: "#/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key11 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err107];
                } else {
                  vErrors.push(err107);
                }
                errors++;
              }
            }
            if (data.id !== void 0) {
              if (typeof data.id !== "string") {
                const err108 = { instancePath: instancePath + "/id", schemaPath: "#/anyOf/2/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err108];
                } else {
                  vErrors.push(err108);
                }
                errors++;
              }
            }
            if (data.name !== void 0) {
              if (typeof data.name !== "string") {
                const err109 = { instancePath: instancePath + "/name", schemaPath: "#/anyOf/2/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err109];
                } else {
                  vErrors.push(err109);
                }
                errors++;
              }
            }
            if (data.type !== void 0) {
              let data35 = data.type;
              if (typeof data35 !== "string") {
                const err110 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/2/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err110];
                } else {
                  vErrors.push(err110);
                }
                errors++;
              }
              if ("response" !== data35) {
                const err111 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/2/properties/type/const", keyword: "const", params: { allowedValue: "response" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err111];
                } else {
                  vErrors.push(err111);
                }
                errors++;
              }
            }
            if (data.source !== void 0) {
              let data36 = data.source;
              const _errs109 = errors;
              let valid20 = false;
              const _errs110 = errors;
              if (data36 && typeof data36 == "object" && !Array.isArray(data36)) {
                if (data36.role === void 0) {
                  const err112 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                  if (vErrors === null) {
                    vErrors = [err112];
                  } else {
                    vErrors.push(err112);
                  }
                  errors++;
                }
                if (data36.workerId === void 0) {
                  const err113 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "workerId" }, message: "must have required property 'workerId'" };
                  if (vErrors === null) {
                    vErrors = [err113];
                  } else {
                    vErrors.push(err113);
                  }
                  errors++;
                }
                if (data36.generation === void 0) {
                  const err114 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "generation" }, message: "must have required property 'generation'" };
                  if (vErrors === null) {
                    vErrors = [err114];
                  } else {
                    vErrors.push(err114);
                  }
                  errors++;
                }
                for (const key12 in data36) {
                  if (!(key12 === "role" || key12 === "workerId" || key12 === "generation")) {
                    const err115 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key12 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err115];
                    } else {
                      vErrors.push(err115);
                    }
                    errors++;
                  }
                }
                if (data36.role !== void 0) {
                  let data37 = data36.role;
                  if (typeof data37 !== "string") {
                    const err116 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err116];
                    } else {
                      vErrors.push(err116);
                    }
                    errors++;
                  }
                  if ("worker" !== data37) {
                    const err117 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/const", keyword: "const", params: { allowedValue: "worker" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err117];
                    } else {
                      vErrors.push(err117);
                    }
                    errors++;
                  }
                }
                if (data36.workerId !== void 0) {
                  if (typeof data36.workerId !== "string") {
                    const err118 = { instancePath: instancePath + "/source/workerId", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/workerId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err118];
                    } else {
                      vErrors.push(err118);
                    }
                    errors++;
                  }
                }
                if (data36.generation !== void 0) {
                  if (typeof data36.generation !== "string") {
                    const err119 = { instancePath: instancePath + "/source/generation", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/generation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err119];
                    } else {
                      vErrors.push(err119);
                    }
                    errors++;
                  }
                }
              } else {
                const err120 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err120];
                } else {
                  vErrors.push(err120);
                }
                errors++;
              }
              var _valid3 = _errs110 === errors;
              valid20 = valid20 || _valid3;
              if (!valid20) {
                const _errs119 = errors;
                if (data36 && typeof data36 == "object" && !Array.isArray(data36)) {
                  if (data36.role === void 0) {
                    const err121 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                    if (vErrors === null) {
                      vErrors = [err121];
                    } else {
                      vErrors.push(err121);
                    }
                    errors++;
                  }
                  if (data36.externalId === void 0) {
                    const err122 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "externalId" }, message: "must have required property 'externalId'" };
                    if (vErrors === null) {
                      vErrors = [err122];
                    } else {
                      vErrors.push(err122);
                    }
                    errors++;
                  }
                  for (const key13 in data36) {
                    if (!(key13 === "role" || key13 === "externalId")) {
                      const err123 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key13 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err123];
                      } else {
                        vErrors.push(err123);
                      }
                      errors++;
                    }
                  }
                  if (data36.role !== void 0) {
                    let data40 = data36.role;
                    if (typeof data40 !== "string") {
                      const err124 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err124];
                      } else {
                        vErrors.push(err124);
                      }
                      errors++;
                    }
                    if ("external" !== data40) {
                      const err125 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/const", keyword: "const", params: { allowedValue: "external" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err125];
                      } else {
                        vErrors.push(err125);
                      }
                      errors++;
                    }
                  }
                  if (data36.externalId !== void 0) {
                    if (typeof data36.externalId !== "string") {
                      const err126 = { instancePath: instancePath + "/source/externalId", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/externalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err126];
                      } else {
                        vErrors.push(err126);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err127 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err127];
                  } else {
                    vErrors.push(err127);
                  }
                  errors++;
                }
                var _valid3 = _errs119 === errors;
                valid20 = valid20 || _valid3;
                if (!valid20) {
                  const _errs126 = errors;
                  if (data36 && typeof data36 == "object" && !Array.isArray(data36)) {
                    if (data36.role === void 0) {
                      const err128 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                      if (vErrors === null) {
                        vErrors = [err128];
                      } else {
                        vErrors.push(err128);
                      }
                      errors++;
                    }
                    for (const key14 in data36) {
                      if (!(key14 === "role")) {
                        const err129 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key14 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err129];
                        } else {
                          vErrors.push(err129);
                        }
                        errors++;
                      }
                    }
                    if (data36.role !== void 0) {
                      let data42 = data36.role;
                      if (typeof data42 !== "string") {
                        const err130 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err130];
                        } else {
                          vErrors.push(err130);
                        }
                        errors++;
                      }
                      if ("supervisor" !== data42) {
                        const err131 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/const", keyword: "const", params: { allowedValue: "supervisor" }, message: "must be equal to constant" };
                        if (vErrors === null) {
                          vErrors = [err131];
                        } else {
                          vErrors.push(err131);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err132 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err132];
                    } else {
                      vErrors.push(err132);
                    }
                    errors++;
                  }
                  var _valid3 = _errs126 === errors;
                  valid20 = valid20 || _valid3;
                }
              }
              if (!valid20) {
                const err133 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                if (vErrors === null) {
                  vErrors = [err133];
                } else {
                  vErrors.push(err133);
                }
                errors++;
              } else {
                errors = _errs109;
                if (vErrors !== null) {
                  if (_errs109) {
                    vErrors.length = _errs109;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
            if (data.target !== void 0) {
              let data43 = data.target;
              if (typeof data43 !== "string") {
                const err134 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err134];
                } else {
                  vErrors.push(err134);
                }
                errors++;
              }
              if (!(data43 === "supervisor" || data43 === "worker")) {
                const err135 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err135];
                } else {
                  vErrors.push(err135);
                }
                errors++;
              }
            }
            if (data.payload !== void 0) {
              let data44 = data.payload;
              const _errs135 = errors;
              let valid25 = false;
              const _errs136 = errors;
              if (data44 && typeof data44 == "object" && !Array.isArray(data44)) {
                if (data44.action === void 0) {
                  const err136 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/2/properties/payload/anyOf/0/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
                  if (vErrors === null) {
                    vErrors = [err136];
                  } else {
                    vErrors.push(err136);
                  }
                  errors++;
                }
                if (data44.runId === void 0) {
                  const err137 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/2/properties/payload/anyOf/0/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                  if (vErrors === null) {
                    vErrors = [err137];
                  } else {
                    vErrors.push(err137);
                  }
                  errors++;
                }
                if (data44.status === void 0) {
                  const err138 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/2/properties/payload/anyOf/0/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
                  if (vErrors === null) {
                    vErrors = [err138];
                  } else {
                    vErrors.push(err138);
                  }
                  errors++;
                }
                for (const key15 in data44) {
                  if (!(key15 === "action" || key15 === "runId" || key15 === "status")) {
                    const err139 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/2/properties/payload/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key15 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err139];
                    } else {
                      vErrors.push(err139);
                    }
                    errors++;
                  }
                }
                if (data44.action !== void 0) {
                  let data45 = data44.action;
                  if (typeof data45 !== "string") {
                    const err140 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/2/properties/payload/anyOf/0/properties/action/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err140];
                    } else {
                      vErrors.push(err140);
                    }
                    errors++;
                  }
                  if ("progress" !== data45) {
                    const err141 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/2/properties/payload/anyOf/0/properties/action/const", keyword: "const", params: { allowedValue: "progress" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err141];
                    } else {
                      vErrors.push(err141);
                    }
                    errors++;
                  }
                }
                if (data44.runId !== void 0) {
                  if (typeof data44.runId !== "string") {
                    const err142 = { instancePath: instancePath + "/payload/runId", schemaPath: "#/anyOf/2/properties/payload/anyOf/0/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err142];
                    } else {
                      vErrors.push(err142);
                    }
                    errors++;
                  }
                }
                if (data44.status !== void 0) {
                  let data47 = data44.status;
                  if (typeof data47 !== "string") {
                    const err143 = { instancePath: instancePath + "/payload/status", schemaPath: "#/anyOf/2/properties/payload/anyOf/0/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err143];
                    } else {
                      vErrors.push(err143);
                    }
                    errors++;
                  }
                  if ("running" !== data47) {
                    const err144 = { instancePath: instancePath + "/payload/status", schemaPath: "#/anyOf/2/properties/payload/anyOf/0/properties/status/const", keyword: "const", params: { allowedValue: "running" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err144];
                    } else {
                      vErrors.push(err144);
                    }
                    errors++;
                  }
                }
              } else {
                const err145 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/2/properties/payload/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err145];
                } else {
                  vErrors.push(err145);
                }
                errors++;
              }
              var _valid4 = _errs136 === errors;
              valid25 = valid25 || _valid4;
              if (!valid25) {
                const _errs145 = errors;
                if (data44 && typeof data44 == "object" && !Array.isArray(data44)) {
                  if (data44.action === void 0) {
                    const err146 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/2/properties/payload/anyOf/1/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
                    if (vErrors === null) {
                      vErrors = [err146];
                    } else {
                      vErrors.push(err146);
                    }
                    errors++;
                  }
                  if (data44.runId === void 0) {
                    const err147 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/2/properties/payload/anyOf/1/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                    if (vErrors === null) {
                      vErrors = [err147];
                    } else {
                      vErrors.push(err147);
                    }
                    errors++;
                  }
                  if (data44.status === void 0) {
                    const err148 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/2/properties/payload/anyOf/1/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
                    if (vErrors === null) {
                      vErrors = [err148];
                    } else {
                      vErrors.push(err148);
                    }
                    errors++;
                  }
                  if (data44.waitingFor === void 0) {
                    const err149 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/2/properties/payload/anyOf/1/required", keyword: "required", params: { missingProperty: "waitingFor" }, message: "must have required property 'waitingFor'" };
                    if (vErrors === null) {
                      vErrors = [err149];
                    } else {
                      vErrors.push(err149);
                    }
                    errors++;
                  }
                  for (const key16 in data44) {
                    if (!(key16 === "action" || key16 === "runId" || key16 === "status" || key16 === "waitingFor")) {
                      const err150 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/2/properties/payload/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key16 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err150];
                      } else {
                        vErrors.push(err150);
                      }
                      errors++;
                    }
                  }
                  if (data44.action !== void 0) {
                    let data48 = data44.action;
                    if (typeof data48 !== "string") {
                      const err151 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/2/properties/payload/anyOf/1/properties/action/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err151];
                      } else {
                        vErrors.push(err151);
                      }
                      errors++;
                    }
                    if ("progress" !== data48) {
                      const err152 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/2/properties/payload/anyOf/1/properties/action/const", keyword: "const", params: { allowedValue: "progress" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err152];
                      } else {
                        vErrors.push(err152);
                      }
                      errors++;
                    }
                  }
                  if (data44.runId !== void 0) {
                    if (typeof data44.runId !== "string") {
                      const err153 = { instancePath: instancePath + "/payload/runId", schemaPath: "#/anyOf/2/properties/payload/anyOf/1/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err153];
                      } else {
                        vErrors.push(err153);
                      }
                      errors++;
                    }
                  }
                  if (data44.status !== void 0) {
                    let data50 = data44.status;
                    if (typeof data50 !== "string") {
                      const err154 = { instancePath: instancePath + "/payload/status", schemaPath: "#/anyOf/2/properties/payload/anyOf/1/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err154];
                      } else {
                        vErrors.push(err154);
                      }
                      errors++;
                    }
                    if ("waiting" !== data50) {
                      const err155 = { instancePath: instancePath + "/payload/status", schemaPath: "#/anyOf/2/properties/payload/anyOf/1/properties/status/const", keyword: "const", params: { allowedValue: "waiting" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err155];
                      } else {
                        vErrors.push(err155);
                      }
                      errors++;
                    }
                  }
                  if (data44.waitingFor !== void 0) {
                    let data51 = data44.waitingFor;
                    if (typeof data51 !== "string") {
                      const err156 = { instancePath: instancePath + "/payload/waitingFor", schemaPath: "#/anyOf/2/properties/payload/anyOf/1/properties/waitingFor/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err156];
                      } else {
                        vErrors.push(err156);
                      }
                      errors++;
                    }
                    if (!(data51 === "ask_user" || data51 === "task_approval" || data51 === "action_approval" || data51 === "action_recovery" || data51 === "blocked")) {
                      const err157 = { instancePath: instancePath + "/payload/waitingFor", schemaPath: "#/anyOf/2/properties/payload/anyOf/1/properties/waitingFor/enum", keyword: "enum", params: { allowedValues: schema12.anyOf[2].properties.payload.anyOf[1].properties.waitingFor.enum }, message: "must be equal to one of the allowed values" };
                      if (vErrors === null) {
                        vErrors = [err157];
                      } else {
                        vErrors.push(err157);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err158 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/2/properties/payload/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err158];
                  } else {
                    vErrors.push(err158);
                  }
                  errors++;
                }
                var _valid4 = _errs145 === errors;
                valid25 = valid25 || _valid4;
              }
              if (!valid25) {
                const err159 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/2/properties/payload/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                if (vErrors === null) {
                  vErrors = [err159];
                } else {
                  vErrors.push(err159);
                }
                errors++;
              } else {
                errors = _errs135;
                if (vErrors !== null) {
                  if (_errs135) {
                    vErrors.length = _errs135;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
            if (data.sentAt !== void 0) {
              if (typeof data.sentAt !== "string") {
                const err160 = { instancePath: instancePath + "/sentAt", schemaPath: "#/anyOf/2/properties/sentAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err160];
                } else {
                  vErrors.push(err160);
                }
                errors++;
              }
            }
            if (data.goalId !== void 0) {
              if (typeof data.goalId !== "string") {
                const err161 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/2/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err161];
                } else {
                  vErrors.push(err161);
                }
                errors++;
              }
            }
            if (data.replyTo !== void 0) {
              if (typeof data.replyTo !== "string") {
                const err162 = { instancePath: instancePath + "/replyTo", schemaPath: "#/anyOf/2/properties/replyTo/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err162];
                } else {
                  vErrors.push(err162);
                }
                errors++;
              }
            }
          } else {
            const err163 = { instancePath, schemaPath: "#/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err163];
            } else {
              vErrors.push(err163);
            }
            errors++;
          }
          var _valid0 = _errs98 === errors;
          valid0 = valid0 || _valid0;
          if (!valid0) {
            const _errs162 = errors;
            if (data && typeof data == "object" && !Array.isArray(data)) {
              if (data.id === void 0) {
                const err164 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                if (vErrors === null) {
                  vErrors = [err164];
                } else {
                  vErrors.push(err164);
                }
                errors++;
              }
              if (data.name === void 0) {
                const err165 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
                if (vErrors === null) {
                  vErrors = [err165];
                } else {
                  vErrors.push(err165);
                }
                errors++;
              }
              if (data.type === void 0) {
                const err166 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                if (vErrors === null) {
                  vErrors = [err166];
                } else {
                  vErrors.push(err166);
                }
                errors++;
              }
              if (data.source === void 0) {
                const err167 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                if (vErrors === null) {
                  vErrors = [err167];
                } else {
                  vErrors.push(err167);
                }
                errors++;
              }
              if (data.target === void 0) {
                const err168 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                if (vErrors === null) {
                  vErrors = [err168];
                } else {
                  vErrors.push(err168);
                }
                errors++;
              }
              if (data.payload === void 0) {
                const err169 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
                if (vErrors === null) {
                  vErrors = [err169];
                } else {
                  vErrors.push(err169);
                }
                errors++;
              }
              if (data.sentAt === void 0) {
                const err170 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "sentAt" }, message: "must have required property 'sentAt'" };
                if (vErrors === null) {
                  vErrors = [err170];
                } else {
                  vErrors.push(err170);
                }
                errors++;
              }
              if (data.goalId === void 0) {
                const err171 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                if (vErrors === null) {
                  vErrors = [err171];
                } else {
                  vErrors.push(err171);
                }
                errors++;
              }
              if (data.replyTo === void 0) {
                const err172 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "replyTo" }, message: "must have required property 'replyTo'" };
                if (vErrors === null) {
                  vErrors = [err172];
                } else {
                  vErrors.push(err172);
                }
                errors++;
              }
              for (const key17 in data) {
                if (!func2.call(schema12.anyOf[3].properties, key17)) {
                  const err173 = { instancePath, schemaPath: "#/anyOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key17 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err173];
                  } else {
                    vErrors.push(err173);
                  }
                  errors++;
                }
              }
              if (data.id !== void 0) {
                if (typeof data.id !== "string") {
                  const err174 = { instancePath: instancePath + "/id", schemaPath: "#/anyOf/3/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err174];
                  } else {
                    vErrors.push(err174);
                  }
                  errors++;
                }
              }
              if (data.name !== void 0) {
                if (typeof data.name !== "string") {
                  const err175 = { instancePath: instancePath + "/name", schemaPath: "#/anyOf/3/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err175];
                  } else {
                    vErrors.push(err175);
                  }
                  errors++;
                }
              }
              if (data.type !== void 0) {
                let data57 = data.type;
                if (typeof data57 !== "string") {
                  const err176 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/3/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err176];
                  } else {
                    vErrors.push(err176);
                  }
                  errors++;
                }
                if ("response" !== data57) {
                  const err177 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/3/properties/type/const", keyword: "const", params: { allowedValue: "response" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err177];
                  } else {
                    vErrors.push(err177);
                  }
                  errors++;
                }
              }
              if (data.source !== void 0) {
                let data58 = data.source;
                const _errs173 = errors;
                let valid30 = false;
                const _errs174 = errors;
                if (data58 && typeof data58 == "object" && !Array.isArray(data58)) {
                  if (data58.role === void 0) {
                    const err178 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                    if (vErrors === null) {
                      vErrors = [err178];
                    } else {
                      vErrors.push(err178);
                    }
                    errors++;
                  }
                  if (data58.workerId === void 0) {
                    const err179 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "workerId" }, message: "must have required property 'workerId'" };
                    if (vErrors === null) {
                      vErrors = [err179];
                    } else {
                      vErrors.push(err179);
                    }
                    errors++;
                  }
                  if (data58.generation === void 0) {
                    const err180 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "generation" }, message: "must have required property 'generation'" };
                    if (vErrors === null) {
                      vErrors = [err180];
                    } else {
                      vErrors.push(err180);
                    }
                    errors++;
                  }
                  for (const key18 in data58) {
                    if (!(key18 === "role" || key18 === "workerId" || key18 === "generation")) {
                      const err181 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key18 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err181];
                      } else {
                        vErrors.push(err181);
                      }
                      errors++;
                    }
                  }
                  if (data58.role !== void 0) {
                    let data59 = data58.role;
                    if (typeof data59 !== "string") {
                      const err182 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err182];
                      } else {
                        vErrors.push(err182);
                      }
                      errors++;
                    }
                    if ("worker" !== data59) {
                      const err183 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/const", keyword: "const", params: { allowedValue: "worker" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err183];
                      } else {
                        vErrors.push(err183);
                      }
                      errors++;
                    }
                  }
                  if (data58.workerId !== void 0) {
                    if (typeof data58.workerId !== "string") {
                      const err184 = { instancePath: instancePath + "/source/workerId", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/workerId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err184];
                      } else {
                        vErrors.push(err184);
                      }
                      errors++;
                    }
                  }
                  if (data58.generation !== void 0) {
                    if (typeof data58.generation !== "string") {
                      const err185 = { instancePath: instancePath + "/source/generation", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/generation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err185];
                      } else {
                        vErrors.push(err185);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err186 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err186];
                  } else {
                    vErrors.push(err186);
                  }
                  errors++;
                }
                var _valid5 = _errs174 === errors;
                valid30 = valid30 || _valid5;
                if (!valid30) {
                  const _errs183 = errors;
                  if (data58 && typeof data58 == "object" && !Array.isArray(data58)) {
                    if (data58.role === void 0) {
                      const err187 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                      if (vErrors === null) {
                        vErrors = [err187];
                      } else {
                        vErrors.push(err187);
                      }
                      errors++;
                    }
                    if (data58.externalId === void 0) {
                      const err188 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "externalId" }, message: "must have required property 'externalId'" };
                      if (vErrors === null) {
                        vErrors = [err188];
                      } else {
                        vErrors.push(err188);
                      }
                      errors++;
                    }
                    for (const key19 in data58) {
                      if (!(key19 === "role" || key19 === "externalId")) {
                        const err189 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key19 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err189];
                        } else {
                          vErrors.push(err189);
                        }
                        errors++;
                      }
                    }
                    if (data58.role !== void 0) {
                      let data62 = data58.role;
                      if (typeof data62 !== "string") {
                        const err190 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err190];
                        } else {
                          vErrors.push(err190);
                        }
                        errors++;
                      }
                      if ("external" !== data62) {
                        const err191 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/const", keyword: "const", params: { allowedValue: "external" }, message: "must be equal to constant" };
                        if (vErrors === null) {
                          vErrors = [err191];
                        } else {
                          vErrors.push(err191);
                        }
                        errors++;
                      }
                    }
                    if (data58.externalId !== void 0) {
                      if (typeof data58.externalId !== "string") {
                        const err192 = { instancePath: instancePath + "/source/externalId", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/externalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err192];
                        } else {
                          vErrors.push(err192);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err193 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err193];
                    } else {
                      vErrors.push(err193);
                    }
                    errors++;
                  }
                  var _valid5 = _errs183 === errors;
                  valid30 = valid30 || _valid5;
                  if (!valid30) {
                    const _errs190 = errors;
                    if (data58 && typeof data58 == "object" && !Array.isArray(data58)) {
                      if (data58.role === void 0) {
                        const err194 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                        if (vErrors === null) {
                          vErrors = [err194];
                        } else {
                          vErrors.push(err194);
                        }
                        errors++;
                      }
                      for (const key20 in data58) {
                        if (!(key20 === "role")) {
                          const err195 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key20 }, message: "must NOT have additional properties" };
                          if (vErrors === null) {
                            vErrors = [err195];
                          } else {
                            vErrors.push(err195);
                          }
                          errors++;
                        }
                      }
                      if (data58.role !== void 0) {
                        let data64 = data58.role;
                        if (typeof data64 !== "string") {
                          const err196 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err196];
                          } else {
                            vErrors.push(err196);
                          }
                          errors++;
                        }
                        if ("supervisor" !== data64) {
                          const err197 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/const", keyword: "const", params: { allowedValue: "supervisor" }, message: "must be equal to constant" };
                          if (vErrors === null) {
                            vErrors = [err197];
                          } else {
                            vErrors.push(err197);
                          }
                          errors++;
                        }
                      }
                    } else {
                      const err198 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                      if (vErrors === null) {
                        vErrors = [err198];
                      } else {
                        vErrors.push(err198);
                      }
                      errors++;
                    }
                    var _valid5 = _errs190 === errors;
                    valid30 = valid30 || _valid5;
                  }
                }
                if (!valid30) {
                  const err199 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                  if (vErrors === null) {
                    vErrors = [err199];
                  } else {
                    vErrors.push(err199);
                  }
                  errors++;
                } else {
                  errors = _errs173;
                  if (vErrors !== null) {
                    if (_errs173) {
                      vErrors.length = _errs173;
                    } else {
                      vErrors = null;
                    }
                  }
                }
              }
              if (data.target !== void 0) {
                let data65 = data.target;
                if (typeof data65 !== "string") {
                  const err200 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err200];
                  } else {
                    vErrors.push(err200);
                  }
                  errors++;
                }
                if (!(data65 === "supervisor" || data65 === "worker")) {
                  const err201 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
                  if (vErrors === null) {
                    vErrors = [err201];
                  } else {
                    vErrors.push(err201);
                  }
                  errors++;
                }
              }
              if (data.payload !== void 0) {
                let data66 = data.payload;
                if (data66 && typeof data66 == "object" && !Array.isArray(data66)) {
                  if (data66.action === void 0) {
                    const err202 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/3/properties/payload/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
                    if (vErrors === null) {
                      vErrors = [err202];
                    } else {
                      vErrors.push(err202);
                    }
                    errors++;
                  }
                  if (data66.runId === void 0) {
                    const err203 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/3/properties/payload/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                    if (vErrors === null) {
                      vErrors = [err203];
                    } else {
                      vErrors.push(err203);
                    }
                    errors++;
                  }
                  if (data66.answer === void 0) {
                    const err204 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/3/properties/payload/required", keyword: "required", params: { missingProperty: "answer" }, message: "must have required property 'answer'" };
                    if (vErrors === null) {
                      vErrors = [err204];
                    } else {
                      vErrors.push(err204);
                    }
                    errors++;
                  }
                  for (const key21 in data66) {
                    if (!(key21 === "action" || key21 === "runId" || key21 === "answer")) {
                      const err205 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/3/properties/payload/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key21 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err205];
                      } else {
                        vErrors.push(err205);
                      }
                      errors++;
                    }
                  }
                  if (data66.action !== void 0) {
                    let data67 = data66.action;
                    if (typeof data67 !== "string") {
                      const err206 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/3/properties/payload/properties/action/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err206];
                      } else {
                        vErrors.push(err206);
                      }
                      errors++;
                    }
                    if ("completed" !== data67) {
                      const err207 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/3/properties/payload/properties/action/const", keyword: "const", params: { allowedValue: "completed" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err207];
                      } else {
                        vErrors.push(err207);
                      }
                      errors++;
                    }
                  }
                  if (data66.runId !== void 0) {
                    if (typeof data66.runId !== "string") {
                      const err208 = { instancePath: instancePath + "/payload/runId", schemaPath: "#/anyOf/3/properties/payload/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err208];
                      } else {
                        vErrors.push(err208);
                      }
                      errors++;
                    }
                  }
                  if (data66.answer !== void 0) {
                    if (typeof data66.answer !== "string") {
                      const err209 = { instancePath: instancePath + "/payload/answer", schemaPath: "#/anyOf/3/properties/payload/properties/answer/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err209];
                      } else {
                        vErrors.push(err209);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err210 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/3/properties/payload/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err210];
                  } else {
                    vErrors.push(err210);
                  }
                  errors++;
                }
              }
              if (data.sentAt !== void 0) {
                if (typeof data.sentAt !== "string") {
                  const err211 = { instancePath: instancePath + "/sentAt", schemaPath: "#/anyOf/3/properties/sentAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err211];
                  } else {
                    vErrors.push(err211);
                  }
                  errors++;
                }
              }
              if (data.goalId !== void 0) {
                if (typeof data.goalId !== "string") {
                  const err212 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/3/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err212];
                  } else {
                    vErrors.push(err212);
                  }
                  errors++;
                }
              }
              if (data.replyTo !== void 0) {
                if (typeof data.replyTo !== "string") {
                  const err213 = { instancePath: instancePath + "/replyTo", schemaPath: "#/anyOf/3/properties/replyTo/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err213];
                  } else {
                    vErrors.push(err213);
                  }
                  errors++;
                }
              }
            } else {
              const err214 = { instancePath, schemaPath: "#/anyOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err214];
              } else {
                vErrors.push(err214);
              }
              errors++;
            }
            var _valid0 = _errs162 === errors;
            valid0 = valid0 || _valid0;
            if (!valid0) {
              const _errs213 = errors;
              if (data && typeof data == "object" && !Array.isArray(data)) {
                if (data.id === void 0) {
                  const err215 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                  if (vErrors === null) {
                    vErrors = [err215];
                  } else {
                    vErrors.push(err215);
                  }
                  errors++;
                }
                if (data.name === void 0) {
                  const err216 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
                  if (vErrors === null) {
                    vErrors = [err216];
                  } else {
                    vErrors.push(err216);
                  }
                  errors++;
                }
                if (data.type === void 0) {
                  const err217 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                  if (vErrors === null) {
                    vErrors = [err217];
                  } else {
                    vErrors.push(err217);
                  }
                  errors++;
                }
                if (data.source === void 0) {
                  const err218 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                  if (vErrors === null) {
                    vErrors = [err218];
                  } else {
                    vErrors.push(err218);
                  }
                  errors++;
                }
                if (data.target === void 0) {
                  const err219 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                  if (vErrors === null) {
                    vErrors = [err219];
                  } else {
                    vErrors.push(err219);
                  }
                  errors++;
                }
                if (data.payload === void 0) {
                  const err220 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
                  if (vErrors === null) {
                    vErrors = [err220];
                  } else {
                    vErrors.push(err220);
                  }
                  errors++;
                }
                if (data.sentAt === void 0) {
                  const err221 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "sentAt" }, message: "must have required property 'sentAt'" };
                  if (vErrors === null) {
                    vErrors = [err221];
                  } else {
                    vErrors.push(err221);
                  }
                  errors++;
                }
                if (data.goalId === void 0) {
                  const err222 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                  if (vErrors === null) {
                    vErrors = [err222];
                  } else {
                    vErrors.push(err222);
                  }
                  errors++;
                }
                if (data.replyTo === void 0) {
                  const err223 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "replyTo" }, message: "must have required property 'replyTo'" };
                  if (vErrors === null) {
                    vErrors = [err223];
                  } else {
                    vErrors.push(err223);
                  }
                  errors++;
                }
                for (const key22 in data) {
                  if (!func2.call(schema12.anyOf[4].properties, key22)) {
                    const err224 = { instancePath, schemaPath: "#/anyOf/4/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key22 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err224];
                    } else {
                      vErrors.push(err224);
                    }
                    errors++;
                  }
                }
                if (data.id !== void 0) {
                  if (typeof data.id !== "string") {
                    const err225 = { instancePath: instancePath + "/id", schemaPath: "#/anyOf/4/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err225];
                    } else {
                      vErrors.push(err225);
                    }
                    errors++;
                  }
                }
                if (data.name !== void 0) {
                  if (typeof data.name !== "string") {
                    const err226 = { instancePath: instancePath + "/name", schemaPath: "#/anyOf/4/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err226];
                    } else {
                      vErrors.push(err226);
                    }
                    errors++;
                  }
                }
                if (data.type !== void 0) {
                  let data75 = data.type;
                  if (typeof data75 !== "string") {
                    const err227 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/4/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err227];
                    } else {
                      vErrors.push(err227);
                    }
                    errors++;
                  }
                  if ("response" !== data75) {
                    const err228 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/4/properties/type/const", keyword: "const", params: { allowedValue: "response" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err228];
                    } else {
                      vErrors.push(err228);
                    }
                    errors++;
                  }
                }
                if (data.source !== void 0) {
                  let data76 = data.source;
                  const _errs224 = errors;
                  let valid38 = false;
                  const _errs225 = errors;
                  if (data76 && typeof data76 == "object" && !Array.isArray(data76)) {
                    if (data76.role === void 0) {
                      const err229 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                      if (vErrors === null) {
                        vErrors = [err229];
                      } else {
                        vErrors.push(err229);
                      }
                      errors++;
                    }
                    if (data76.workerId === void 0) {
                      const err230 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "workerId" }, message: "must have required property 'workerId'" };
                      if (vErrors === null) {
                        vErrors = [err230];
                      } else {
                        vErrors.push(err230);
                      }
                      errors++;
                    }
                    if (data76.generation === void 0) {
                      const err231 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "generation" }, message: "must have required property 'generation'" };
                      if (vErrors === null) {
                        vErrors = [err231];
                      } else {
                        vErrors.push(err231);
                      }
                      errors++;
                    }
                    for (const key23 in data76) {
                      if (!(key23 === "role" || key23 === "workerId" || key23 === "generation")) {
                        const err232 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key23 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err232];
                        } else {
                          vErrors.push(err232);
                        }
                        errors++;
                      }
                    }
                    if (data76.role !== void 0) {
                      let data77 = data76.role;
                      if (typeof data77 !== "string") {
                        const err233 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err233];
                        } else {
                          vErrors.push(err233);
                        }
                        errors++;
                      }
                      if ("worker" !== data77) {
                        const err234 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/const", keyword: "const", params: { allowedValue: "worker" }, message: "must be equal to constant" };
                        if (vErrors === null) {
                          vErrors = [err234];
                        } else {
                          vErrors.push(err234);
                        }
                        errors++;
                      }
                    }
                    if (data76.workerId !== void 0) {
                      if (typeof data76.workerId !== "string") {
                        const err235 = { instancePath: instancePath + "/source/workerId", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/workerId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err235];
                        } else {
                          vErrors.push(err235);
                        }
                        errors++;
                      }
                    }
                    if (data76.generation !== void 0) {
                      if (typeof data76.generation !== "string") {
                        const err236 = { instancePath: instancePath + "/source/generation", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/generation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err236];
                        } else {
                          vErrors.push(err236);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err237 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err237];
                    } else {
                      vErrors.push(err237);
                    }
                    errors++;
                  }
                  var _valid6 = _errs225 === errors;
                  valid38 = valid38 || _valid6;
                  if (!valid38) {
                    const _errs234 = errors;
                    if (data76 && typeof data76 == "object" && !Array.isArray(data76)) {
                      if (data76.role === void 0) {
                        const err238 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                        if (vErrors === null) {
                          vErrors = [err238];
                        } else {
                          vErrors.push(err238);
                        }
                        errors++;
                      }
                      if (data76.externalId === void 0) {
                        const err239 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "externalId" }, message: "must have required property 'externalId'" };
                        if (vErrors === null) {
                          vErrors = [err239];
                        } else {
                          vErrors.push(err239);
                        }
                        errors++;
                      }
                      for (const key24 in data76) {
                        if (!(key24 === "role" || key24 === "externalId")) {
                          const err240 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key24 }, message: "must NOT have additional properties" };
                          if (vErrors === null) {
                            vErrors = [err240];
                          } else {
                            vErrors.push(err240);
                          }
                          errors++;
                        }
                      }
                      if (data76.role !== void 0) {
                        let data80 = data76.role;
                        if (typeof data80 !== "string") {
                          const err241 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err241];
                          } else {
                            vErrors.push(err241);
                          }
                          errors++;
                        }
                        if ("external" !== data80) {
                          const err242 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/const", keyword: "const", params: { allowedValue: "external" }, message: "must be equal to constant" };
                          if (vErrors === null) {
                            vErrors = [err242];
                          } else {
                            vErrors.push(err242);
                          }
                          errors++;
                        }
                      }
                      if (data76.externalId !== void 0) {
                        if (typeof data76.externalId !== "string") {
                          const err243 = { instancePath: instancePath + "/source/externalId", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/externalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err243];
                          } else {
                            vErrors.push(err243);
                          }
                          errors++;
                        }
                      }
                    } else {
                      const err244 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                      if (vErrors === null) {
                        vErrors = [err244];
                      } else {
                        vErrors.push(err244);
                      }
                      errors++;
                    }
                    var _valid6 = _errs234 === errors;
                    valid38 = valid38 || _valid6;
                    if (!valid38) {
                      const _errs241 = errors;
                      if (data76 && typeof data76 == "object" && !Array.isArray(data76)) {
                        if (data76.role === void 0) {
                          const err245 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                          if (vErrors === null) {
                            vErrors = [err245];
                          } else {
                            vErrors.push(err245);
                          }
                          errors++;
                        }
                        for (const key25 in data76) {
                          if (!(key25 === "role")) {
                            const err246 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key25 }, message: "must NOT have additional properties" };
                            if (vErrors === null) {
                              vErrors = [err246];
                            } else {
                              vErrors.push(err246);
                            }
                            errors++;
                          }
                        }
                        if (data76.role !== void 0) {
                          let data82 = data76.role;
                          if (typeof data82 !== "string") {
                            const err247 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err247];
                            } else {
                              vErrors.push(err247);
                            }
                            errors++;
                          }
                          if ("supervisor" !== data82) {
                            const err248 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/const", keyword: "const", params: { allowedValue: "supervisor" }, message: "must be equal to constant" };
                            if (vErrors === null) {
                              vErrors = [err248];
                            } else {
                              vErrors.push(err248);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err249 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                        if (vErrors === null) {
                          vErrors = [err249];
                        } else {
                          vErrors.push(err249);
                        }
                        errors++;
                      }
                      var _valid6 = _errs241 === errors;
                      valid38 = valid38 || _valid6;
                    }
                  }
                  if (!valid38) {
                    const err250 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                    if (vErrors === null) {
                      vErrors = [err250];
                    } else {
                      vErrors.push(err250);
                    }
                    errors++;
                  } else {
                    errors = _errs224;
                    if (vErrors !== null) {
                      if (_errs224) {
                        vErrors.length = _errs224;
                      } else {
                        vErrors = null;
                      }
                    }
                  }
                }
                if (data.target !== void 0) {
                  let data83 = data.target;
                  if (typeof data83 !== "string") {
                    const err251 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err251];
                    } else {
                      vErrors.push(err251);
                    }
                    errors++;
                  }
                  if (!(data83 === "supervisor" || data83 === "worker")) {
                    const err252 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err252];
                    } else {
                      vErrors.push(err252);
                    }
                    errors++;
                  }
                }
                if (data.payload !== void 0) {
                  let data84 = data.payload;
                  if (data84 && typeof data84 == "object" && !Array.isArray(data84)) {
                    if (data84.action === void 0) {
                      const err253 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/4/properties/payload/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
                      if (vErrors === null) {
                        vErrors = [err253];
                      } else {
                        vErrors.push(err253);
                      }
                      errors++;
                    }
                    if (data84.runId === void 0) {
                      const err254 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/4/properties/payload/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                      if (vErrors === null) {
                        vErrors = [err254];
                      } else {
                        vErrors.push(err254);
                      }
                      errors++;
                    }
                    for (const key26 in data84) {
                      if (!(key26 === "action" || key26 === "runId")) {
                        const err255 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/4/properties/payload/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key26 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err255];
                        } else {
                          vErrors.push(err255);
                        }
                        errors++;
                      }
                    }
                    if (data84.action !== void 0) {
                      let data85 = data84.action;
                      if (typeof data85 !== "string") {
                        const err256 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/4/properties/payload/properties/action/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err256];
                        } else {
                          vErrors.push(err256);
                        }
                        errors++;
                      }
                      if (!(data85 === "failed" || data85 === "cancelled")) {
                        const err257 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/4/properties/payload/properties/action/enum", keyword: "enum", params: { allowedValues: schema12.anyOf[4].properties.payload.properties.action.enum }, message: "must be equal to one of the allowed values" };
                        if (vErrors === null) {
                          vErrors = [err257];
                        } else {
                          vErrors.push(err257);
                        }
                        errors++;
                      }
                    }
                    if (data84.runId !== void 0) {
                      if (typeof data84.runId !== "string") {
                        const err258 = { instancePath: instancePath + "/payload/runId", schemaPath: "#/anyOf/4/properties/payload/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err258];
                        } else {
                          vErrors.push(err258);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err259 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/4/properties/payload/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err259];
                    } else {
                      vErrors.push(err259);
                    }
                    errors++;
                  }
                }
                if (data.sentAt !== void 0) {
                  if (typeof data.sentAt !== "string") {
                    const err260 = { instancePath: instancePath + "/sentAt", schemaPath: "#/anyOf/4/properties/sentAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err260];
                    } else {
                      vErrors.push(err260);
                    }
                    errors++;
                  }
                }
                if (data.goalId !== void 0) {
                  if (typeof data.goalId !== "string") {
                    const err261 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/4/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err261];
                    } else {
                      vErrors.push(err261);
                    }
                    errors++;
                  }
                }
                if (data.replyTo !== void 0) {
                  if (typeof data.replyTo !== "string") {
                    const err262 = { instancePath: instancePath + "/replyTo", schemaPath: "#/anyOf/4/properties/replyTo/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err262];
                    } else {
                      vErrors.push(err262);
                    }
                    errors++;
                  }
                }
              } else {
                const err263 = { instancePath, schemaPath: "#/anyOf/4/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err263];
                } else {
                  vErrors.push(err263);
                }
                errors++;
              }
              var _valid0 = _errs213 === errors;
              valid0 = valid0 || _valid0;
              if (!valid0) {
                const _errs262 = errors;
                if (data && typeof data == "object" && !Array.isArray(data)) {
                  if (data.id === void 0) {
                    const err264 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                    if (vErrors === null) {
                      vErrors = [err264];
                    } else {
                      vErrors.push(err264);
                    }
                    errors++;
                  }
                  if (data.name === void 0) {
                    const err265 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
                    if (vErrors === null) {
                      vErrors = [err265];
                    } else {
                      vErrors.push(err265);
                    }
                    errors++;
                  }
                  if (data.type === void 0) {
                    const err266 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                    if (vErrors === null) {
                      vErrors = [err266];
                    } else {
                      vErrors.push(err266);
                    }
                    errors++;
                  }
                  if (data.source === void 0) {
                    const err267 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                    if (vErrors === null) {
                      vErrors = [err267];
                    } else {
                      vErrors.push(err267);
                    }
                    errors++;
                  }
                  if (data.target === void 0) {
                    const err268 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                    if (vErrors === null) {
                      vErrors = [err268];
                    } else {
                      vErrors.push(err268);
                    }
                    errors++;
                  }
                  if (data.payload === void 0) {
                    const err269 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
                    if (vErrors === null) {
                      vErrors = [err269];
                    } else {
                      vErrors.push(err269);
                    }
                    errors++;
                  }
                  if (data.sentAt === void 0) {
                    const err270 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "sentAt" }, message: "must have required property 'sentAt'" };
                    if (vErrors === null) {
                      vErrors = [err270];
                    } else {
                      vErrors.push(err270);
                    }
                    errors++;
                  }
                  if (data.goalId === void 0) {
                    const err271 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                    if (vErrors === null) {
                      vErrors = [err271];
                    } else {
                      vErrors.push(err271);
                    }
                    errors++;
                  }
                  for (const key27 in data) {
                    if (!(key27 === "id" || key27 === "name" || key27 === "type" || key27 === "source" || key27 === "target" || key27 === "payload" || key27 === "sentAt" || key27 === "goalId")) {
                      const err272 = { instancePath, schemaPath: "#/anyOf/5/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key27 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err272];
                      } else {
                        vErrors.push(err272);
                      }
                      errors++;
                    }
                  }
                  if (data.id !== void 0) {
                    if (typeof data.id !== "string") {
                      const err273 = { instancePath: instancePath + "/id", schemaPath: "#/anyOf/5/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err273];
                      } else {
                        vErrors.push(err273);
                      }
                      errors++;
                    }
                  }
                  if (data.name !== void 0) {
                    if (typeof data.name !== "string") {
                      const err274 = { instancePath: instancePath + "/name", schemaPath: "#/anyOf/5/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err274];
                      } else {
                        vErrors.push(err274);
                      }
                      errors++;
                    }
                  }
                  if (data.type !== void 0) {
                    let data92 = data.type;
                    if (typeof data92 !== "string") {
                      const err275 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/5/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err275];
                      } else {
                        vErrors.push(err275);
                      }
                      errors++;
                    }
                    if ("permission" !== data92) {
                      const err276 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/5/properties/type/const", keyword: "const", params: { allowedValue: "permission" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err276];
                      } else {
                        vErrors.push(err276);
                      }
                      errors++;
                    }
                  }
                  if (data.source !== void 0) {
                    let data93 = data.source;
                    const _errs273 = errors;
                    let valid46 = false;
                    const _errs274 = errors;
                    if (data93 && typeof data93 == "object" && !Array.isArray(data93)) {
                      if (data93.role === void 0) {
                        const err277 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                        if (vErrors === null) {
                          vErrors = [err277];
                        } else {
                          vErrors.push(err277);
                        }
                        errors++;
                      }
                      if (data93.workerId === void 0) {
                        const err278 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "workerId" }, message: "must have required property 'workerId'" };
                        if (vErrors === null) {
                          vErrors = [err278];
                        } else {
                          vErrors.push(err278);
                        }
                        errors++;
                      }
                      if (data93.generation === void 0) {
                        const err279 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "generation" }, message: "must have required property 'generation'" };
                        if (vErrors === null) {
                          vErrors = [err279];
                        } else {
                          vErrors.push(err279);
                        }
                        errors++;
                      }
                      for (const key28 in data93) {
                        if (!(key28 === "role" || key28 === "workerId" || key28 === "generation")) {
                          const err280 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key28 }, message: "must NOT have additional properties" };
                          if (vErrors === null) {
                            vErrors = [err280];
                          } else {
                            vErrors.push(err280);
                          }
                          errors++;
                        }
                      }
                      if (data93.role !== void 0) {
                        let data94 = data93.role;
                        if (typeof data94 !== "string") {
                          const err281 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err281];
                          } else {
                            vErrors.push(err281);
                          }
                          errors++;
                        }
                        if ("worker" !== data94) {
                          const err282 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/const", keyword: "const", params: { allowedValue: "worker" }, message: "must be equal to constant" };
                          if (vErrors === null) {
                            vErrors = [err282];
                          } else {
                            vErrors.push(err282);
                          }
                          errors++;
                        }
                      }
                      if (data93.workerId !== void 0) {
                        if (typeof data93.workerId !== "string") {
                          const err283 = { instancePath: instancePath + "/source/workerId", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/workerId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err283];
                          } else {
                            vErrors.push(err283);
                          }
                          errors++;
                        }
                      }
                      if (data93.generation !== void 0) {
                        if (typeof data93.generation !== "string") {
                          const err284 = { instancePath: instancePath + "/source/generation", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/generation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err284];
                          } else {
                            vErrors.push(err284);
                          }
                          errors++;
                        }
                      }
                    } else {
                      const err285 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                      if (vErrors === null) {
                        vErrors = [err285];
                      } else {
                        vErrors.push(err285);
                      }
                      errors++;
                    }
                    var _valid7 = _errs274 === errors;
                    valid46 = valid46 || _valid7;
                    if (!valid46) {
                      const _errs283 = errors;
                      if (data93 && typeof data93 == "object" && !Array.isArray(data93)) {
                        if (data93.role === void 0) {
                          const err286 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                          if (vErrors === null) {
                            vErrors = [err286];
                          } else {
                            vErrors.push(err286);
                          }
                          errors++;
                        }
                        if (data93.externalId === void 0) {
                          const err287 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "externalId" }, message: "must have required property 'externalId'" };
                          if (vErrors === null) {
                            vErrors = [err287];
                          } else {
                            vErrors.push(err287);
                          }
                          errors++;
                        }
                        for (const key29 in data93) {
                          if (!(key29 === "role" || key29 === "externalId")) {
                            const err288 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key29 }, message: "must NOT have additional properties" };
                            if (vErrors === null) {
                              vErrors = [err288];
                            } else {
                              vErrors.push(err288);
                            }
                            errors++;
                          }
                        }
                        if (data93.role !== void 0) {
                          let data97 = data93.role;
                          if (typeof data97 !== "string") {
                            const err289 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err289];
                            } else {
                              vErrors.push(err289);
                            }
                            errors++;
                          }
                          if ("external" !== data97) {
                            const err290 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/const", keyword: "const", params: { allowedValue: "external" }, message: "must be equal to constant" };
                            if (vErrors === null) {
                              vErrors = [err290];
                            } else {
                              vErrors.push(err290);
                            }
                            errors++;
                          }
                        }
                        if (data93.externalId !== void 0) {
                          if (typeof data93.externalId !== "string") {
                            const err291 = { instancePath: instancePath + "/source/externalId", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/externalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err291];
                            } else {
                              vErrors.push(err291);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err292 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                        if (vErrors === null) {
                          vErrors = [err292];
                        } else {
                          vErrors.push(err292);
                        }
                        errors++;
                      }
                      var _valid7 = _errs283 === errors;
                      valid46 = valid46 || _valid7;
                      if (!valid46) {
                        const _errs290 = errors;
                        if (data93 && typeof data93 == "object" && !Array.isArray(data93)) {
                          if (data93.role === void 0) {
                            const err293 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                            if (vErrors === null) {
                              vErrors = [err293];
                            } else {
                              vErrors.push(err293);
                            }
                            errors++;
                          }
                          for (const key30 in data93) {
                            if (!(key30 === "role")) {
                              const err294 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key30 }, message: "must NOT have additional properties" };
                              if (vErrors === null) {
                                vErrors = [err294];
                              } else {
                                vErrors.push(err294);
                              }
                              errors++;
                            }
                          }
                          if (data93.role !== void 0) {
                            let data99 = data93.role;
                            if (typeof data99 !== "string") {
                              const err295 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err295];
                              } else {
                                vErrors.push(err295);
                              }
                              errors++;
                            }
                            if ("supervisor" !== data99) {
                              const err296 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/const", keyword: "const", params: { allowedValue: "supervisor" }, message: "must be equal to constant" };
                              if (vErrors === null) {
                                vErrors = [err296];
                              } else {
                                vErrors.push(err296);
                              }
                              errors++;
                            }
                          }
                        } else {
                          const err297 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                          if (vErrors === null) {
                            vErrors = [err297];
                          } else {
                            vErrors.push(err297);
                          }
                          errors++;
                        }
                        var _valid7 = _errs290 === errors;
                        valid46 = valid46 || _valid7;
                      }
                    }
                    if (!valid46) {
                      const err298 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                      if (vErrors === null) {
                        vErrors = [err298];
                      } else {
                        vErrors.push(err298);
                      }
                      errors++;
                    } else {
                      errors = _errs273;
                      if (vErrors !== null) {
                        if (_errs273) {
                          vErrors.length = _errs273;
                        } else {
                          vErrors = null;
                        }
                      }
                    }
                  }
                  if (data.target !== void 0) {
                    let data100 = data.target;
                    if (typeof data100 !== "string") {
                      const err299 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err299];
                      } else {
                        vErrors.push(err299);
                      }
                      errors++;
                    }
                    if (!(data100 === "supervisor" || data100 === "worker")) {
                      const err300 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
                      if (vErrors === null) {
                        vErrors = [err300];
                      } else {
                        vErrors.push(err300);
                      }
                      errors++;
                    }
                  }
                  if (data.payload !== void 0) {
                    let data101 = data.payload;
                    if (data101 && typeof data101 == "object" && !Array.isArray(data101)) {
                      if (data101.action === void 0) {
                        const err301 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/5/properties/payload/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
                        if (vErrors === null) {
                          vErrors = [err301];
                        } else {
                          vErrors.push(err301);
                        }
                        errors++;
                      }
                      if (data101.runId === void 0) {
                        const err302 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/5/properties/payload/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                        if (vErrors === null) {
                          vErrors = [err302];
                        } else {
                          vErrors.push(err302);
                        }
                        errors++;
                      }
                      if (data101.actionId === void 0) {
                        const err303 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/5/properties/payload/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                        if (vErrors === null) {
                          vErrors = [err303];
                        } else {
                          vErrors.push(err303);
                        }
                        errors++;
                      }
                      if (data101.interactionId === void 0) {
                        const err304 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/5/properties/payload/required", keyword: "required", params: { missingProperty: "interactionId" }, message: "must have required property 'interactionId'" };
                        if (vErrors === null) {
                          vErrors = [err304];
                        } else {
                          vErrors.push(err304);
                        }
                        errors++;
                      }
                      if (data101.commitRevision === void 0) {
                        const err305 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/5/properties/payload/required", keyword: "required", params: { missingProperty: "commitRevision" }, message: "must have required property 'commitRevision'" };
                        if (vErrors === null) {
                          vErrors = [err305];
                        } else {
                          vErrors.push(err305);
                        }
                        errors++;
                      }
                      for (const key31 in data101) {
                        if (!(key31 === "action" || key31 === "runId" || key31 === "actionId" || key31 === "interactionId" || key31 === "commitRevision")) {
                          const err306 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/5/properties/payload/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key31 }, message: "must NOT have additional properties" };
                          if (vErrors === null) {
                            vErrors = [err306];
                          } else {
                            vErrors.push(err306);
                          }
                          errors++;
                        }
                      }
                      if (data101.action !== void 0) {
                        let data102 = data101.action;
                        if (typeof data102 !== "string") {
                          const err307 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/5/properties/payload/properties/action/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err307];
                          } else {
                            vErrors.push(err307);
                          }
                          errors++;
                        }
                        if ("requested" !== data102) {
                          const err308 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/5/properties/payload/properties/action/const", keyword: "const", params: { allowedValue: "requested" }, message: "must be equal to constant" };
                          if (vErrors === null) {
                            vErrors = [err308];
                          } else {
                            vErrors.push(err308);
                          }
                          errors++;
                        }
                      }
                      if (data101.runId !== void 0) {
                        if (typeof data101.runId !== "string") {
                          const err309 = { instancePath: instancePath + "/payload/runId", schemaPath: "#/anyOf/5/properties/payload/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err309];
                          } else {
                            vErrors.push(err309);
                          }
                          errors++;
                        }
                      }
                      if (data101.actionId !== void 0) {
                        if (typeof data101.actionId !== "string") {
                          const err310 = { instancePath: instancePath + "/payload/actionId", schemaPath: "#/anyOf/5/properties/payload/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err310];
                          } else {
                            vErrors.push(err310);
                          }
                          errors++;
                        }
                      }
                      if (data101.interactionId !== void 0) {
                        if (typeof data101.interactionId !== "string") {
                          const err311 = { instancePath: instancePath + "/payload/interactionId", schemaPath: "#/anyOf/5/properties/payload/properties/interactionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err311];
                          } else {
                            vErrors.push(err311);
                          }
                          errors++;
                        }
                      }
                      if (data101.commitRevision !== void 0) {
                        let data106 = data101.commitRevision;
                        if (!(typeof data106 == "number" && isFinite(data106))) {
                          const err312 = { instancePath: instancePath + "/payload/commitRevision", schemaPath: "#/anyOf/5/properties/payload/properties/commitRevision/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                          if (vErrors === null) {
                            vErrors = [err312];
                          } else {
                            vErrors.push(err312);
                          }
                          errors++;
                        }
                      }
                    } else {
                      const err313 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/5/properties/payload/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                      if (vErrors === null) {
                        vErrors = [err313];
                      } else {
                        vErrors.push(err313);
                      }
                      errors++;
                    }
                  }
                  if (data.sentAt !== void 0) {
                    if (typeof data.sentAt !== "string") {
                      const err314 = { instancePath: instancePath + "/sentAt", schemaPath: "#/anyOf/5/properties/sentAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err314];
                      } else {
                        vErrors.push(err314);
                      }
                      errors++;
                    }
                  }
                  if (data.goalId !== void 0) {
                    if (typeof data.goalId !== "string") {
                      const err315 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/5/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err315];
                      } else {
                        vErrors.push(err315);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err316 = { instancePath, schemaPath: "#/anyOf/5/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err316];
                  } else {
                    vErrors.push(err316);
                  }
                  errors++;
                }
                var _valid0 = _errs262 === errors;
                valid0 = valid0 || _valid0;
                if (!valid0) {
                  const _errs315 = errors;
                  if (data && typeof data == "object" && !Array.isArray(data)) {
                    if (data.id === void 0) {
                      const err317 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                      if (vErrors === null) {
                        vErrors = [err317];
                      } else {
                        vErrors.push(err317);
                      }
                      errors++;
                    }
                    if (data.name === void 0) {
                      const err318 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
                      if (vErrors === null) {
                        vErrors = [err318];
                      } else {
                        vErrors.push(err318);
                      }
                      errors++;
                    }
                    if (data.type === void 0) {
                      const err319 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                      if (vErrors === null) {
                        vErrors = [err319];
                      } else {
                        vErrors.push(err319);
                      }
                      errors++;
                    }
                    if (data.source === void 0) {
                      const err320 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                      if (vErrors === null) {
                        vErrors = [err320];
                      } else {
                        vErrors.push(err320);
                      }
                      errors++;
                    }
                    if (data.target === void 0) {
                      const err321 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                      if (vErrors === null) {
                        vErrors = [err321];
                      } else {
                        vErrors.push(err321);
                      }
                      errors++;
                    }
                    if (data.payload === void 0) {
                      const err322 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
                      if (vErrors === null) {
                        vErrors = [err322];
                      } else {
                        vErrors.push(err322);
                      }
                      errors++;
                    }
                    if (data.sentAt === void 0) {
                      const err323 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "sentAt" }, message: "must have required property 'sentAt'" };
                      if (vErrors === null) {
                        vErrors = [err323];
                      } else {
                        vErrors.push(err323);
                      }
                      errors++;
                    }
                    if (data.goalId === void 0) {
                      const err324 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                      if (vErrors === null) {
                        vErrors = [err324];
                      } else {
                        vErrors.push(err324);
                      }
                      errors++;
                    }
                    if (data.replyTo === void 0) {
                      const err325 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "replyTo" }, message: "must have required property 'replyTo'" };
                      if (vErrors === null) {
                        vErrors = [err325];
                      } else {
                        vErrors.push(err325);
                      }
                      errors++;
                    }
                    for (const key32 in data) {
                      if (!func2.call(schema12.anyOf[6].properties, key32)) {
                        const err326 = { instancePath, schemaPath: "#/anyOf/6/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key32 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err326];
                        } else {
                          vErrors.push(err326);
                        }
                        errors++;
                      }
                    }
                    if (data.id !== void 0) {
                      if (typeof data.id !== "string") {
                        const err327 = { instancePath: instancePath + "/id", schemaPath: "#/anyOf/6/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err327];
                        } else {
                          vErrors.push(err327);
                        }
                        errors++;
                      }
                    }
                    if (data.name !== void 0) {
                      if (typeof data.name !== "string") {
                        const err328 = { instancePath: instancePath + "/name", schemaPath: "#/anyOf/6/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err328];
                        } else {
                          vErrors.push(err328);
                        }
                        errors++;
                      }
                    }
                    if (data.type !== void 0) {
                      let data111 = data.type;
                      if (typeof data111 !== "string") {
                        const err329 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/6/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err329];
                        } else {
                          vErrors.push(err329);
                        }
                        errors++;
                      }
                      if ("permission" !== data111) {
                        const err330 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/6/properties/type/const", keyword: "const", params: { allowedValue: "permission" }, message: "must be equal to constant" };
                        if (vErrors === null) {
                          vErrors = [err330];
                        } else {
                          vErrors.push(err330);
                        }
                        errors++;
                      }
                    }
                    if (data.source !== void 0) {
                      let data112 = data.source;
                      const _errs326 = errors;
                      let valid54 = false;
                      const _errs327 = errors;
                      if (data112 && typeof data112 == "object" && !Array.isArray(data112)) {
                        if (data112.role === void 0) {
                          const err331 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                          if (vErrors === null) {
                            vErrors = [err331];
                          } else {
                            vErrors.push(err331);
                          }
                          errors++;
                        }
                        if (data112.workerId === void 0) {
                          const err332 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "workerId" }, message: "must have required property 'workerId'" };
                          if (vErrors === null) {
                            vErrors = [err332];
                          } else {
                            vErrors.push(err332);
                          }
                          errors++;
                        }
                        if (data112.generation === void 0) {
                          const err333 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "generation" }, message: "must have required property 'generation'" };
                          if (vErrors === null) {
                            vErrors = [err333];
                          } else {
                            vErrors.push(err333);
                          }
                          errors++;
                        }
                        for (const key33 in data112) {
                          if (!(key33 === "role" || key33 === "workerId" || key33 === "generation")) {
                            const err334 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key33 }, message: "must NOT have additional properties" };
                            if (vErrors === null) {
                              vErrors = [err334];
                            } else {
                              vErrors.push(err334);
                            }
                            errors++;
                          }
                        }
                        if (data112.role !== void 0) {
                          let data113 = data112.role;
                          if (typeof data113 !== "string") {
                            const err335 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err335];
                            } else {
                              vErrors.push(err335);
                            }
                            errors++;
                          }
                          if ("worker" !== data113) {
                            const err336 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/const", keyword: "const", params: { allowedValue: "worker" }, message: "must be equal to constant" };
                            if (vErrors === null) {
                              vErrors = [err336];
                            } else {
                              vErrors.push(err336);
                            }
                            errors++;
                          }
                        }
                        if (data112.workerId !== void 0) {
                          if (typeof data112.workerId !== "string") {
                            const err337 = { instancePath: instancePath + "/source/workerId", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/workerId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err337];
                            } else {
                              vErrors.push(err337);
                            }
                            errors++;
                          }
                        }
                        if (data112.generation !== void 0) {
                          if (typeof data112.generation !== "string") {
                            const err338 = { instancePath: instancePath + "/source/generation", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/generation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err338];
                            } else {
                              vErrors.push(err338);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err339 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                        if (vErrors === null) {
                          vErrors = [err339];
                        } else {
                          vErrors.push(err339);
                        }
                        errors++;
                      }
                      var _valid8 = _errs327 === errors;
                      valid54 = valid54 || _valid8;
                      if (!valid54) {
                        const _errs336 = errors;
                        if (data112 && typeof data112 == "object" && !Array.isArray(data112)) {
                          if (data112.role === void 0) {
                            const err340 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                            if (vErrors === null) {
                              vErrors = [err340];
                            } else {
                              vErrors.push(err340);
                            }
                            errors++;
                          }
                          if (data112.externalId === void 0) {
                            const err341 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "externalId" }, message: "must have required property 'externalId'" };
                            if (vErrors === null) {
                              vErrors = [err341];
                            } else {
                              vErrors.push(err341);
                            }
                            errors++;
                          }
                          for (const key34 in data112) {
                            if (!(key34 === "role" || key34 === "externalId")) {
                              const err342 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key34 }, message: "must NOT have additional properties" };
                              if (vErrors === null) {
                                vErrors = [err342];
                              } else {
                                vErrors.push(err342);
                              }
                              errors++;
                            }
                          }
                          if (data112.role !== void 0) {
                            let data116 = data112.role;
                            if (typeof data116 !== "string") {
                              const err343 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err343];
                              } else {
                                vErrors.push(err343);
                              }
                              errors++;
                            }
                            if ("external" !== data116) {
                              const err344 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/const", keyword: "const", params: { allowedValue: "external" }, message: "must be equal to constant" };
                              if (vErrors === null) {
                                vErrors = [err344];
                              } else {
                                vErrors.push(err344);
                              }
                              errors++;
                            }
                          }
                          if (data112.externalId !== void 0) {
                            if (typeof data112.externalId !== "string") {
                              const err345 = { instancePath: instancePath + "/source/externalId", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/externalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err345];
                              } else {
                                vErrors.push(err345);
                              }
                              errors++;
                            }
                          }
                        } else {
                          const err346 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                          if (vErrors === null) {
                            vErrors = [err346];
                          } else {
                            vErrors.push(err346);
                          }
                          errors++;
                        }
                        var _valid8 = _errs336 === errors;
                        valid54 = valid54 || _valid8;
                        if (!valid54) {
                          const _errs343 = errors;
                          if (data112 && typeof data112 == "object" && !Array.isArray(data112)) {
                            if (data112.role === void 0) {
                              const err347 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                              if (vErrors === null) {
                                vErrors = [err347];
                              } else {
                                vErrors.push(err347);
                              }
                              errors++;
                            }
                            for (const key35 in data112) {
                              if (!(key35 === "role")) {
                                const err348 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key35 }, message: "must NOT have additional properties" };
                                if (vErrors === null) {
                                  vErrors = [err348];
                                } else {
                                  vErrors.push(err348);
                                }
                                errors++;
                              }
                            }
                            if (data112.role !== void 0) {
                              let data118 = data112.role;
                              if (typeof data118 !== "string") {
                                const err349 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err349];
                                } else {
                                  vErrors.push(err349);
                                }
                                errors++;
                              }
                              if ("supervisor" !== data118) {
                                const err350 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/const", keyword: "const", params: { allowedValue: "supervisor" }, message: "must be equal to constant" };
                                if (vErrors === null) {
                                  vErrors = [err350];
                                } else {
                                  vErrors.push(err350);
                                }
                                errors++;
                              }
                            }
                          } else {
                            const err351 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                            if (vErrors === null) {
                              vErrors = [err351];
                            } else {
                              vErrors.push(err351);
                            }
                            errors++;
                          }
                          var _valid8 = _errs343 === errors;
                          valid54 = valid54 || _valid8;
                        }
                      }
                      if (!valid54) {
                        const err352 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                        if (vErrors === null) {
                          vErrors = [err352];
                        } else {
                          vErrors.push(err352);
                        }
                        errors++;
                      } else {
                        errors = _errs326;
                        if (vErrors !== null) {
                          if (_errs326) {
                            vErrors.length = _errs326;
                          } else {
                            vErrors = null;
                          }
                        }
                      }
                    }
                    if (data.target !== void 0) {
                      let data119 = data.target;
                      if (typeof data119 !== "string") {
                        const err353 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err353];
                        } else {
                          vErrors.push(err353);
                        }
                        errors++;
                      }
                      if (!(data119 === "supervisor" || data119 === "worker")) {
                        const err354 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
                        if (vErrors === null) {
                          vErrors = [err354];
                        } else {
                          vErrors.push(err354);
                        }
                        errors++;
                      }
                    }
                    if (data.payload !== void 0) {
                      let data120 = data.payload;
                      if (data120 && typeof data120 == "object" && !Array.isArray(data120)) {
                        if (data120.action === void 0) {
                          const err355 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/6/properties/payload/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
                          if (vErrors === null) {
                            vErrors = [err355];
                          } else {
                            vErrors.push(err355);
                          }
                          errors++;
                        }
                        if (data120.decision === void 0) {
                          const err356 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/6/properties/payload/required", keyword: "required", params: { missingProperty: "decision" }, message: "must have required property 'decision'" };
                          if (vErrors === null) {
                            vErrors = [err356];
                          } else {
                            vErrors.push(err356);
                          }
                          errors++;
                        }
                        if (data120.scope === void 0) {
                          const err357 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/6/properties/payload/required", keyword: "required", params: { missingProperty: "scope" }, message: "must have required property 'scope'" };
                          if (vErrors === null) {
                            vErrors = [err357];
                          } else {
                            vErrors.push(err357);
                          }
                          errors++;
                        }
                        for (const key36 in data120) {
                          if (!(key36 === "action" || key36 === "decision" || key36 === "scope" || key36 === "reason")) {
                            const err358 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/6/properties/payload/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key36 }, message: "must NOT have additional properties" };
                            if (vErrors === null) {
                              vErrors = [err358];
                            } else {
                              vErrors.push(err358);
                            }
                            errors++;
                          }
                        }
                        if (data120.action !== void 0) {
                          let data121 = data120.action;
                          if (typeof data121 !== "string") {
                            const err359 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/6/properties/payload/properties/action/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err359];
                            } else {
                              vErrors.push(err359);
                            }
                            errors++;
                          }
                          if ("decided" !== data121) {
                            const err360 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/6/properties/payload/properties/action/const", keyword: "const", params: { allowedValue: "decided" }, message: "must be equal to constant" };
                            if (vErrors === null) {
                              vErrors = [err360];
                            } else {
                              vErrors.push(err360);
                            }
                            errors++;
                          }
                        }
                        if (data120.decision !== void 0) {
                          let data122 = data120.decision;
                          if (typeof data122 !== "string") {
                            const err361 = { instancePath: instancePath + "/payload/decision", schemaPath: "#/anyOf/6/properties/payload/properties/decision/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err361];
                            } else {
                              vErrors.push(err361);
                            }
                            errors++;
                          }
                          if ("approve" !== data122) {
                            const err362 = { instancePath: instancePath + "/payload/decision", schemaPath: "#/anyOf/6/properties/payload/properties/decision/const", keyword: "const", params: { allowedValue: "approve" }, message: "must be equal to constant" };
                            if (vErrors === null) {
                              vErrors = [err362];
                            } else {
                              vErrors.push(err362);
                            }
                            errors++;
                          }
                        }
                        if (data120.scope !== void 0) {
                          let data123 = data120.scope;
                          if (typeof data123 !== "string") {
                            const err363 = { instancePath: instancePath + "/payload/scope", schemaPath: "#/anyOf/6/properties/payload/properties/scope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err363];
                            } else {
                              vErrors.push(err363);
                            }
                            errors++;
                          }
                          if ("action" !== data123) {
                            const err364 = { instancePath: instancePath + "/payload/scope", schemaPath: "#/anyOf/6/properties/payload/properties/scope/const", keyword: "const", params: { allowedValue: "action" }, message: "must be equal to constant" };
                            if (vErrors === null) {
                              vErrors = [err364];
                            } else {
                              vErrors.push(err364);
                            }
                            errors++;
                          }
                        }
                        if (data120.reason !== void 0) {
                          if (typeof data120.reason !== "string") {
                            const err365 = { instancePath: instancePath + "/payload/reason", schemaPath: "#/anyOf/6/properties/payload/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err365];
                            } else {
                              vErrors.push(err365);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err366 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/6/properties/payload/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                        if (vErrors === null) {
                          vErrors = [err366];
                        } else {
                          vErrors.push(err366);
                        }
                        errors++;
                      }
                    }
                    if (data.sentAt !== void 0) {
                      if (typeof data.sentAt !== "string") {
                        const err367 = { instancePath: instancePath + "/sentAt", schemaPath: "#/anyOf/6/properties/sentAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err367];
                        } else {
                          vErrors.push(err367);
                        }
                        errors++;
                      }
                    }
                    if (data.goalId !== void 0) {
                      if (typeof data.goalId !== "string") {
                        const err368 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/6/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err368];
                        } else {
                          vErrors.push(err368);
                        }
                        errors++;
                      }
                    }
                    if (data.replyTo !== void 0) {
                      if (typeof data.replyTo !== "string") {
                        const err369 = { instancePath: instancePath + "/replyTo", schemaPath: "#/anyOf/6/properties/replyTo/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err369];
                        } else {
                          vErrors.push(err369);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err370 = { instancePath, schemaPath: "#/anyOf/6/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err370];
                    } else {
                      vErrors.push(err370);
                    }
                    errors++;
                  }
                  var _valid0 = _errs315 === errors;
                  valid0 = valid0 || _valid0;
                  if (!valid0) {
                    const _errs368 = errors;
                    if (data && typeof data == "object" && !Array.isArray(data)) {
                      if (data.id === void 0) {
                        const err371 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                        if (vErrors === null) {
                          vErrors = [err371];
                        } else {
                          vErrors.push(err371);
                        }
                        errors++;
                      }
                      if (data.name === void 0) {
                        const err372 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
                        if (vErrors === null) {
                          vErrors = [err372];
                        } else {
                          vErrors.push(err372);
                        }
                        errors++;
                      }
                      if (data.type === void 0) {
                        const err373 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                        if (vErrors === null) {
                          vErrors = [err373];
                        } else {
                          vErrors.push(err373);
                        }
                        errors++;
                      }
                      if (data.source === void 0) {
                        const err374 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                        if (vErrors === null) {
                          vErrors = [err374];
                        } else {
                          vErrors.push(err374);
                        }
                        errors++;
                      }
                      if (data.target === void 0) {
                        const err375 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                        if (vErrors === null) {
                          vErrors = [err375];
                        } else {
                          vErrors.push(err375);
                        }
                        errors++;
                      }
                      if (data.payload === void 0) {
                        const err376 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
                        if (vErrors === null) {
                          vErrors = [err376];
                        } else {
                          vErrors.push(err376);
                        }
                        errors++;
                      }
                      if (data.sentAt === void 0) {
                        const err377 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "sentAt" }, message: "must have required property 'sentAt'" };
                        if (vErrors === null) {
                          vErrors = [err377];
                        } else {
                          vErrors.push(err377);
                        }
                        errors++;
                      }
                      if (data.goalId === void 0) {
                        const err378 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                        if (vErrors === null) {
                          vErrors = [err378];
                        } else {
                          vErrors.push(err378);
                        }
                        errors++;
                      }
                      if (data.replyTo === void 0) {
                        const err379 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "replyTo" }, message: "must have required property 'replyTo'" };
                        if (vErrors === null) {
                          vErrors = [err379];
                        } else {
                          vErrors.push(err379);
                        }
                        errors++;
                      }
                      for (const key37 in data) {
                        if (!func2.call(schema12.anyOf[7].properties, key37)) {
                          const err380 = { instancePath, schemaPath: "#/anyOf/7/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key37 }, message: "must NOT have additional properties" };
                          if (vErrors === null) {
                            vErrors = [err380];
                          } else {
                            vErrors.push(err380);
                          }
                          errors++;
                        }
                      }
                      if (data.id !== void 0) {
                        if (typeof data.id !== "string") {
                          const err381 = { instancePath: instancePath + "/id", schemaPath: "#/anyOf/7/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err381];
                          } else {
                            vErrors.push(err381);
                          }
                          errors++;
                        }
                      }
                      if (data.name !== void 0) {
                        if (typeof data.name !== "string") {
                          const err382 = { instancePath: instancePath + "/name", schemaPath: "#/anyOf/7/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err382];
                          } else {
                            vErrors.push(err382);
                          }
                          errors++;
                        }
                      }
                      if (data.type !== void 0) {
                        let data130 = data.type;
                        if (typeof data130 !== "string") {
                          const err383 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/7/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err383];
                          } else {
                            vErrors.push(err383);
                          }
                          errors++;
                        }
                        if ("permission" !== data130) {
                          const err384 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/7/properties/type/const", keyword: "const", params: { allowedValue: "permission" }, message: "must be equal to constant" };
                          if (vErrors === null) {
                            vErrors = [err384];
                          } else {
                            vErrors.push(err384);
                          }
                          errors++;
                        }
                      }
                      if (data.source !== void 0) {
                        let data131 = data.source;
                        const _errs379 = errors;
                        let valid62 = false;
                        const _errs380 = errors;
                        if (data131 && typeof data131 == "object" && !Array.isArray(data131)) {
                          if (data131.role === void 0) {
                            const err385 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                            if (vErrors === null) {
                              vErrors = [err385];
                            } else {
                              vErrors.push(err385);
                            }
                            errors++;
                          }
                          if (data131.workerId === void 0) {
                            const err386 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "workerId" }, message: "must have required property 'workerId'" };
                            if (vErrors === null) {
                              vErrors = [err386];
                            } else {
                              vErrors.push(err386);
                            }
                            errors++;
                          }
                          if (data131.generation === void 0) {
                            const err387 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "generation" }, message: "must have required property 'generation'" };
                            if (vErrors === null) {
                              vErrors = [err387];
                            } else {
                              vErrors.push(err387);
                            }
                            errors++;
                          }
                          for (const key38 in data131) {
                            if (!(key38 === "role" || key38 === "workerId" || key38 === "generation")) {
                              const err388 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key38 }, message: "must NOT have additional properties" };
                              if (vErrors === null) {
                                vErrors = [err388];
                              } else {
                                vErrors.push(err388);
                              }
                              errors++;
                            }
                          }
                          if (data131.role !== void 0) {
                            let data132 = data131.role;
                            if (typeof data132 !== "string") {
                              const err389 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err389];
                              } else {
                                vErrors.push(err389);
                              }
                              errors++;
                            }
                            if ("worker" !== data132) {
                              const err390 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/const", keyword: "const", params: { allowedValue: "worker" }, message: "must be equal to constant" };
                              if (vErrors === null) {
                                vErrors = [err390];
                              } else {
                                vErrors.push(err390);
                              }
                              errors++;
                            }
                          }
                          if (data131.workerId !== void 0) {
                            if (typeof data131.workerId !== "string") {
                              const err391 = { instancePath: instancePath + "/source/workerId", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/workerId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err391];
                              } else {
                                vErrors.push(err391);
                              }
                              errors++;
                            }
                          }
                          if (data131.generation !== void 0) {
                            if (typeof data131.generation !== "string") {
                              const err392 = { instancePath: instancePath + "/source/generation", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/generation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err392];
                              } else {
                                vErrors.push(err392);
                              }
                              errors++;
                            }
                          }
                        } else {
                          const err393 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                          if (vErrors === null) {
                            vErrors = [err393];
                          } else {
                            vErrors.push(err393);
                          }
                          errors++;
                        }
                        var _valid9 = _errs380 === errors;
                        valid62 = valid62 || _valid9;
                        if (!valid62) {
                          const _errs389 = errors;
                          if (data131 && typeof data131 == "object" && !Array.isArray(data131)) {
                            if (data131.role === void 0) {
                              const err394 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                              if (vErrors === null) {
                                vErrors = [err394];
                              } else {
                                vErrors.push(err394);
                              }
                              errors++;
                            }
                            if (data131.externalId === void 0) {
                              const err395 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "externalId" }, message: "must have required property 'externalId'" };
                              if (vErrors === null) {
                                vErrors = [err395];
                              } else {
                                vErrors.push(err395);
                              }
                              errors++;
                            }
                            for (const key39 in data131) {
                              if (!(key39 === "role" || key39 === "externalId")) {
                                const err396 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key39 }, message: "must NOT have additional properties" };
                                if (vErrors === null) {
                                  vErrors = [err396];
                                } else {
                                  vErrors.push(err396);
                                }
                                errors++;
                              }
                            }
                            if (data131.role !== void 0) {
                              let data135 = data131.role;
                              if (typeof data135 !== "string") {
                                const err397 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err397];
                                } else {
                                  vErrors.push(err397);
                                }
                                errors++;
                              }
                              if ("external" !== data135) {
                                const err398 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/const", keyword: "const", params: { allowedValue: "external" }, message: "must be equal to constant" };
                                if (vErrors === null) {
                                  vErrors = [err398];
                                } else {
                                  vErrors.push(err398);
                                }
                                errors++;
                              }
                            }
                            if (data131.externalId !== void 0) {
                              if (typeof data131.externalId !== "string") {
                                const err399 = { instancePath: instancePath + "/source/externalId", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/externalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err399];
                                } else {
                                  vErrors.push(err399);
                                }
                                errors++;
                              }
                            }
                          } else {
                            const err400 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                            if (vErrors === null) {
                              vErrors = [err400];
                            } else {
                              vErrors.push(err400);
                            }
                            errors++;
                          }
                          var _valid9 = _errs389 === errors;
                          valid62 = valid62 || _valid9;
                          if (!valid62) {
                            const _errs396 = errors;
                            if (data131 && typeof data131 == "object" && !Array.isArray(data131)) {
                              if (data131.role === void 0) {
                                const err401 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                if (vErrors === null) {
                                  vErrors = [err401];
                                } else {
                                  vErrors.push(err401);
                                }
                                errors++;
                              }
                              for (const key40 in data131) {
                                if (!(key40 === "role")) {
                                  const err402 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key40 }, message: "must NOT have additional properties" };
                                  if (vErrors === null) {
                                    vErrors = [err402];
                                  } else {
                                    vErrors.push(err402);
                                  }
                                  errors++;
                                }
                              }
                              if (data131.role !== void 0) {
                                let data137 = data131.role;
                                if (typeof data137 !== "string") {
                                  const err403 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err403];
                                  } else {
                                    vErrors.push(err403);
                                  }
                                  errors++;
                                }
                                if ("supervisor" !== data137) {
                                  const err404 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/const", keyword: "const", params: { allowedValue: "supervisor" }, message: "must be equal to constant" };
                                  if (vErrors === null) {
                                    vErrors = [err404];
                                  } else {
                                    vErrors.push(err404);
                                  }
                                  errors++;
                                }
                              }
                            } else {
                              const err405 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                              if (vErrors === null) {
                                vErrors = [err405];
                              } else {
                                vErrors.push(err405);
                              }
                              errors++;
                            }
                            var _valid9 = _errs396 === errors;
                            valid62 = valid62 || _valid9;
                          }
                        }
                        if (!valid62) {
                          const err406 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                          if (vErrors === null) {
                            vErrors = [err406];
                          } else {
                            vErrors.push(err406);
                          }
                          errors++;
                        } else {
                          errors = _errs379;
                          if (vErrors !== null) {
                            if (_errs379) {
                              vErrors.length = _errs379;
                            } else {
                              vErrors = null;
                            }
                          }
                        }
                      }
                      if (data.target !== void 0) {
                        let data138 = data.target;
                        if (typeof data138 !== "string") {
                          const err407 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err407];
                          } else {
                            vErrors.push(err407);
                          }
                          errors++;
                        }
                        if (!(data138 === "supervisor" || data138 === "worker")) {
                          const err408 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
                          if (vErrors === null) {
                            vErrors = [err408];
                          } else {
                            vErrors.push(err408);
                          }
                          errors++;
                        }
                      }
                      if (data.payload !== void 0) {
                        let data139 = data.payload;
                        if (data139 && typeof data139 == "object" && !Array.isArray(data139)) {
                          if (data139.action === void 0) {
                            const err409 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/7/properties/payload/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
                            if (vErrors === null) {
                              vErrors = [err409];
                            } else {
                              vErrors.push(err409);
                            }
                            errors++;
                          }
                          if (data139.decision === void 0) {
                            const err410 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/7/properties/payload/required", keyword: "required", params: { missingProperty: "decision" }, message: "must have required property 'decision'" };
                            if (vErrors === null) {
                              vErrors = [err410];
                            } else {
                              vErrors.push(err410);
                            }
                            errors++;
                          }
                          if (data139.scope === void 0) {
                            const err411 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/7/properties/payload/required", keyword: "required", params: { missingProperty: "scope" }, message: "must have required property 'scope'" };
                            if (vErrors === null) {
                              vErrors = [err411];
                            } else {
                              vErrors.push(err411);
                            }
                            errors++;
                          }
                          if (data139.reason === void 0) {
                            const err412 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/7/properties/payload/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
                            if (vErrors === null) {
                              vErrors = [err412];
                            } else {
                              vErrors.push(err412);
                            }
                            errors++;
                          }
                          for (const key41 in data139) {
                            if (!(key41 === "action" || key41 === "decision" || key41 === "scope" || key41 === "reason")) {
                              const err413 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/7/properties/payload/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key41 }, message: "must NOT have additional properties" };
                              if (vErrors === null) {
                                vErrors = [err413];
                              } else {
                                vErrors.push(err413);
                              }
                              errors++;
                            }
                          }
                          if (data139.action !== void 0) {
                            let data140 = data139.action;
                            if (typeof data140 !== "string") {
                              const err414 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/7/properties/payload/properties/action/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err414];
                              } else {
                                vErrors.push(err414);
                              }
                              errors++;
                            }
                            if ("decided" !== data140) {
                              const err415 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/7/properties/payload/properties/action/const", keyword: "const", params: { allowedValue: "decided" }, message: "must be equal to constant" };
                              if (vErrors === null) {
                                vErrors = [err415];
                              } else {
                                vErrors.push(err415);
                              }
                              errors++;
                            }
                          }
                          if (data139.decision !== void 0) {
                            let data141 = data139.decision;
                            if (typeof data141 !== "string") {
                              const err416 = { instancePath: instancePath + "/payload/decision", schemaPath: "#/anyOf/7/properties/payload/properties/decision/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err416];
                              } else {
                                vErrors.push(err416);
                              }
                              errors++;
                            }
                            if ("reject" !== data141) {
                              const err417 = { instancePath: instancePath + "/payload/decision", schemaPath: "#/anyOf/7/properties/payload/properties/decision/const", keyword: "const", params: { allowedValue: "reject" }, message: "must be equal to constant" };
                              if (vErrors === null) {
                                vErrors = [err417];
                              } else {
                                vErrors.push(err417);
                              }
                              errors++;
                            }
                          }
                          if (data139.scope !== void 0) {
                            let data142 = data139.scope;
                            if (typeof data142 !== "string") {
                              const err418 = { instancePath: instancePath + "/payload/scope", schemaPath: "#/anyOf/7/properties/payload/properties/scope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err418];
                              } else {
                                vErrors.push(err418);
                              }
                              errors++;
                            }
                            if ("action" !== data142) {
                              const err419 = { instancePath: instancePath + "/payload/scope", schemaPath: "#/anyOf/7/properties/payload/properties/scope/const", keyword: "const", params: { allowedValue: "action" }, message: "must be equal to constant" };
                              if (vErrors === null) {
                                vErrors = [err419];
                              } else {
                                vErrors.push(err419);
                              }
                              errors++;
                            }
                          }
                          if (data139.reason !== void 0) {
                            if (typeof data139.reason !== "string") {
                              const err420 = { instancePath: instancePath + "/payload/reason", schemaPath: "#/anyOf/7/properties/payload/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err420];
                              } else {
                                vErrors.push(err420);
                              }
                              errors++;
                            }
                          }
                        } else {
                          const err421 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/7/properties/payload/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                          if (vErrors === null) {
                            vErrors = [err421];
                          } else {
                            vErrors.push(err421);
                          }
                          errors++;
                        }
                      }
                      if (data.sentAt !== void 0) {
                        if (typeof data.sentAt !== "string") {
                          const err422 = { instancePath: instancePath + "/sentAt", schemaPath: "#/anyOf/7/properties/sentAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err422];
                          } else {
                            vErrors.push(err422);
                          }
                          errors++;
                        }
                      }
                      if (data.goalId !== void 0) {
                        if (typeof data.goalId !== "string") {
                          const err423 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/7/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err423];
                          } else {
                            vErrors.push(err423);
                          }
                          errors++;
                        }
                      }
                      if (data.replyTo !== void 0) {
                        if (typeof data.replyTo !== "string") {
                          const err424 = { instancePath: instancePath + "/replyTo", schemaPath: "#/anyOf/7/properties/replyTo/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err424];
                          } else {
                            vErrors.push(err424);
                          }
                          errors++;
                        }
                      }
                    } else {
                      const err425 = { instancePath, schemaPath: "#/anyOf/7/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                      if (vErrors === null) {
                        vErrors = [err425];
                      } else {
                        vErrors.push(err425);
                      }
                      errors++;
                    }
                    var _valid0 = _errs368 === errors;
                    valid0 = valid0 || _valid0;
                    if (!valid0) {
                      const _errs421 = errors;
                      if (data && typeof data == "object" && !Array.isArray(data)) {
                        if (data.id === void 0) {
                          const err426 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                          if (vErrors === null) {
                            vErrors = [err426];
                          } else {
                            vErrors.push(err426);
                          }
                          errors++;
                        }
                        if (data.name === void 0) {
                          const err427 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
                          if (vErrors === null) {
                            vErrors = [err427];
                          } else {
                            vErrors.push(err427);
                          }
                          errors++;
                        }
                        if (data.type === void 0) {
                          const err428 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                          if (vErrors === null) {
                            vErrors = [err428];
                          } else {
                            vErrors.push(err428);
                          }
                          errors++;
                        }
                        if (data.source === void 0) {
                          const err429 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                          if (vErrors === null) {
                            vErrors = [err429];
                          } else {
                            vErrors.push(err429);
                          }
                          errors++;
                        }
                        if (data.target === void 0) {
                          const err430 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                          if (vErrors === null) {
                            vErrors = [err430];
                          } else {
                            vErrors.push(err430);
                          }
                          errors++;
                        }
                        if (data.payload === void 0) {
                          const err431 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
                          if (vErrors === null) {
                            vErrors = [err431];
                          } else {
                            vErrors.push(err431);
                          }
                          errors++;
                        }
                        if (data.sentAt === void 0) {
                          const err432 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "sentAt" }, message: "must have required property 'sentAt'" };
                          if (vErrors === null) {
                            vErrors = [err432];
                          } else {
                            vErrors.push(err432);
                          }
                          errors++;
                        }
                        if (data.goalId === void 0) {
                          const err433 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                          if (vErrors === null) {
                            vErrors = [err433];
                          } else {
                            vErrors.push(err433);
                          }
                          errors++;
                        }
                        if (data.replyTo === void 0) {
                          const err434 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "replyTo" }, message: "must have required property 'replyTo'" };
                          if (vErrors === null) {
                            vErrors = [err434];
                          } else {
                            vErrors.push(err434);
                          }
                          errors++;
                        }
                        for (const key42 in data) {
                          if (!func2.call(schema12.anyOf[8].properties, key42)) {
                            const err435 = { instancePath, schemaPath: "#/anyOf/8/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key42 }, message: "must NOT have additional properties" };
                            if (vErrors === null) {
                              vErrors = [err435];
                            } else {
                              vErrors.push(err435);
                            }
                            errors++;
                          }
                        }
                        if (data.id !== void 0) {
                          if (typeof data.id !== "string") {
                            const err436 = { instancePath: instancePath + "/id", schemaPath: "#/anyOf/8/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err436];
                            } else {
                              vErrors.push(err436);
                            }
                            errors++;
                          }
                        }
                        if (data.name !== void 0) {
                          if (typeof data.name !== "string") {
                            const err437 = { instancePath: instancePath + "/name", schemaPath: "#/anyOf/8/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err437];
                            } else {
                              vErrors.push(err437);
                            }
                            errors++;
                          }
                        }
                        if (data.type !== void 0) {
                          let data149 = data.type;
                          if (typeof data149 !== "string") {
                            const err438 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/8/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err438];
                            } else {
                              vErrors.push(err438);
                            }
                            errors++;
                          }
                          if ("interaction" !== data149) {
                            const err439 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/8/properties/type/const", keyword: "const", params: { allowedValue: "interaction" }, message: "must be equal to constant" };
                            if (vErrors === null) {
                              vErrors = [err439];
                            } else {
                              vErrors.push(err439);
                            }
                            errors++;
                          }
                        }
                        if (data.source !== void 0) {
                          let data150 = data.source;
                          const _errs432 = errors;
                          let valid70 = false;
                          const _errs433 = errors;
                          if (data150 && typeof data150 == "object" && !Array.isArray(data150)) {
                            if (data150.role === void 0) {
                              const err440 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                              if (vErrors === null) {
                                vErrors = [err440];
                              } else {
                                vErrors.push(err440);
                              }
                              errors++;
                            }
                            if (data150.workerId === void 0) {
                              const err441 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "workerId" }, message: "must have required property 'workerId'" };
                              if (vErrors === null) {
                                vErrors = [err441];
                              } else {
                                vErrors.push(err441);
                              }
                              errors++;
                            }
                            if (data150.generation === void 0) {
                              const err442 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "generation" }, message: "must have required property 'generation'" };
                              if (vErrors === null) {
                                vErrors = [err442];
                              } else {
                                vErrors.push(err442);
                              }
                              errors++;
                            }
                            for (const key43 in data150) {
                              if (!(key43 === "role" || key43 === "workerId" || key43 === "generation")) {
                                const err443 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key43 }, message: "must NOT have additional properties" };
                                if (vErrors === null) {
                                  vErrors = [err443];
                                } else {
                                  vErrors.push(err443);
                                }
                                errors++;
                              }
                            }
                            if (data150.role !== void 0) {
                              let data151 = data150.role;
                              if (typeof data151 !== "string") {
                                const err444 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err444];
                                } else {
                                  vErrors.push(err444);
                                }
                                errors++;
                              }
                              if ("worker" !== data151) {
                                const err445 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/const", keyword: "const", params: { allowedValue: "worker" }, message: "must be equal to constant" };
                                if (vErrors === null) {
                                  vErrors = [err445];
                                } else {
                                  vErrors.push(err445);
                                }
                                errors++;
                              }
                            }
                            if (data150.workerId !== void 0) {
                              if (typeof data150.workerId !== "string") {
                                const err446 = { instancePath: instancePath + "/source/workerId", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/workerId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err446];
                                } else {
                                  vErrors.push(err446);
                                }
                                errors++;
                              }
                            }
                            if (data150.generation !== void 0) {
                              if (typeof data150.generation !== "string") {
                                const err447 = { instancePath: instancePath + "/source/generation", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/generation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err447];
                                } else {
                                  vErrors.push(err447);
                                }
                                errors++;
                              }
                            }
                          } else {
                            const err448 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                            if (vErrors === null) {
                              vErrors = [err448];
                            } else {
                              vErrors.push(err448);
                            }
                            errors++;
                          }
                          var _valid10 = _errs433 === errors;
                          valid70 = valid70 || _valid10;
                          if (!valid70) {
                            const _errs442 = errors;
                            if (data150 && typeof data150 == "object" && !Array.isArray(data150)) {
                              if (data150.role === void 0) {
                                const err449 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                if (vErrors === null) {
                                  vErrors = [err449];
                                } else {
                                  vErrors.push(err449);
                                }
                                errors++;
                              }
                              if (data150.externalId === void 0) {
                                const err450 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "externalId" }, message: "must have required property 'externalId'" };
                                if (vErrors === null) {
                                  vErrors = [err450];
                                } else {
                                  vErrors.push(err450);
                                }
                                errors++;
                              }
                              for (const key44 in data150) {
                                if (!(key44 === "role" || key44 === "externalId")) {
                                  const err451 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key44 }, message: "must NOT have additional properties" };
                                  if (vErrors === null) {
                                    vErrors = [err451];
                                  } else {
                                    vErrors.push(err451);
                                  }
                                  errors++;
                                }
                              }
                              if (data150.role !== void 0) {
                                let data154 = data150.role;
                                if (typeof data154 !== "string") {
                                  const err452 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err452];
                                  } else {
                                    vErrors.push(err452);
                                  }
                                  errors++;
                                }
                                if ("external" !== data154) {
                                  const err453 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/const", keyword: "const", params: { allowedValue: "external" }, message: "must be equal to constant" };
                                  if (vErrors === null) {
                                    vErrors = [err453];
                                  } else {
                                    vErrors.push(err453);
                                  }
                                  errors++;
                                }
                              }
                              if (data150.externalId !== void 0) {
                                if (typeof data150.externalId !== "string") {
                                  const err454 = { instancePath: instancePath + "/source/externalId", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/externalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err454];
                                  } else {
                                    vErrors.push(err454);
                                  }
                                  errors++;
                                }
                              }
                            } else {
                              const err455 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                              if (vErrors === null) {
                                vErrors = [err455];
                              } else {
                                vErrors.push(err455);
                              }
                              errors++;
                            }
                            var _valid10 = _errs442 === errors;
                            valid70 = valid70 || _valid10;
                            if (!valid70) {
                              const _errs449 = errors;
                              if (data150 && typeof data150 == "object" && !Array.isArray(data150)) {
                                if (data150.role === void 0) {
                                  const err456 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                  if (vErrors === null) {
                                    vErrors = [err456];
                                  } else {
                                    vErrors.push(err456);
                                  }
                                  errors++;
                                }
                                for (const key45 in data150) {
                                  if (!(key45 === "role")) {
                                    const err457 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key45 }, message: "must NOT have additional properties" };
                                    if (vErrors === null) {
                                      vErrors = [err457];
                                    } else {
                                      vErrors.push(err457);
                                    }
                                    errors++;
                                  }
                                }
                                if (data150.role !== void 0) {
                                  let data156 = data150.role;
                                  if (typeof data156 !== "string") {
                                    const err458 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err458];
                                    } else {
                                      vErrors.push(err458);
                                    }
                                    errors++;
                                  }
                                  if ("supervisor" !== data156) {
                                    const err459 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/const", keyword: "const", params: { allowedValue: "supervisor" }, message: "must be equal to constant" };
                                    if (vErrors === null) {
                                      vErrors = [err459];
                                    } else {
                                      vErrors.push(err459);
                                    }
                                    errors++;
                                  }
                                }
                              } else {
                                const err460 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                if (vErrors === null) {
                                  vErrors = [err460];
                                } else {
                                  vErrors.push(err460);
                                }
                                errors++;
                              }
                              var _valid10 = _errs449 === errors;
                              valid70 = valid70 || _valid10;
                            }
                          }
                          if (!valid70) {
                            const err461 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                            if (vErrors === null) {
                              vErrors = [err461];
                            } else {
                              vErrors.push(err461);
                            }
                            errors++;
                          } else {
                            errors = _errs432;
                            if (vErrors !== null) {
                              if (_errs432) {
                                vErrors.length = _errs432;
                              } else {
                                vErrors = null;
                              }
                            }
                          }
                        }
                        if (data.target !== void 0) {
                          let data157 = data.target;
                          if (typeof data157 !== "string") {
                            const err462 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err462];
                            } else {
                              vErrors.push(err462);
                            }
                            errors++;
                          }
                          if (!(data157 === "supervisor" || data157 === "worker")) {
                            const err463 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
                            if (vErrors === null) {
                              vErrors = [err463];
                            } else {
                              vErrors.push(err463);
                            }
                            errors++;
                          }
                        }
                        if (data.payload !== void 0) {
                          let data158 = data.payload;
                          if (data158 && typeof data158 == "object" && !Array.isArray(data158)) {
                            if (data158.action === void 0) {
                              const err464 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/8/properties/payload/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
                              if (vErrors === null) {
                                vErrors = [err464];
                              } else {
                                vErrors.push(err464);
                              }
                              errors++;
                            }
                            if (data158.answer === void 0) {
                              const err465 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/8/properties/payload/required", keyword: "required", params: { missingProperty: "answer" }, message: "must have required property 'answer'" };
                              if (vErrors === null) {
                                vErrors = [err465];
                              } else {
                                vErrors.push(err465);
                              }
                              errors++;
                            }
                            for (const key46 in data158) {
                              if (!(key46 === "action" || key46 === "answer")) {
                                const err466 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/8/properties/payload/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key46 }, message: "must NOT have additional properties" };
                                if (vErrors === null) {
                                  vErrors = [err466];
                                } else {
                                  vErrors.push(err466);
                                }
                                errors++;
                              }
                            }
                            if (data158.action !== void 0) {
                              let data159 = data158.action;
                              if (typeof data159 !== "string") {
                                const err467 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/8/properties/payload/properties/action/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err467];
                                } else {
                                  vErrors.push(err467);
                                }
                                errors++;
                              }
                              if ("answered" !== data159) {
                                const err468 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/8/properties/payload/properties/action/const", keyword: "const", params: { allowedValue: "answered" }, message: "must be equal to constant" };
                                if (vErrors === null) {
                                  vErrors = [err468];
                                } else {
                                  vErrors.push(err468);
                                }
                                errors++;
                              }
                            }
                            if (data158.answer !== void 0) {
                              if (!validate12(data158.answer, { instancePath: instancePath + "/payload/answer", parentData: data158, parentDataProperty: "answer", rootData })) {
                                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                                errors = vErrors.length;
                              }
                            }
                          } else {
                            const err469 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/8/properties/payload/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                            if (vErrors === null) {
                              vErrors = [err469];
                            } else {
                              vErrors.push(err469);
                            }
                            errors++;
                          }
                        }
                        if (data.sentAt !== void 0) {
                          if (typeof data.sentAt !== "string") {
                            const err470 = { instancePath: instancePath + "/sentAt", schemaPath: "#/anyOf/8/properties/sentAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err470];
                            } else {
                              vErrors.push(err470);
                            }
                            errors++;
                          }
                        }
                        if (data.goalId !== void 0) {
                          if (typeof data.goalId !== "string") {
                            const err471 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/8/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err471];
                            } else {
                              vErrors.push(err471);
                            }
                            errors++;
                          }
                        }
                        if (data.replyTo !== void 0) {
                          if (typeof data.replyTo !== "string") {
                            const err472 = { instancePath: instancePath + "/replyTo", schemaPath: "#/anyOf/8/properties/replyTo/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err472];
                            } else {
                              vErrors.push(err472);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err473 = { instancePath, schemaPath: "#/anyOf/8/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                        if (vErrors === null) {
                          vErrors = [err473];
                        } else {
                          vErrors.push(err473);
                        }
                        errors++;
                      }
                      var _valid0 = _errs421 === errors;
                      valid0 = valid0 || _valid0;
                      if (!valid0) {
                        const _errs469 = errors;
                        if (data && typeof data == "object" && !Array.isArray(data)) {
                          if (data.id === void 0) {
                            const err474 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                            if (vErrors === null) {
                              vErrors = [err474];
                            } else {
                              vErrors.push(err474);
                            }
                            errors++;
                          }
                          if (data.name === void 0) {
                            const err475 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
                            if (vErrors === null) {
                              vErrors = [err475];
                            } else {
                              vErrors.push(err475);
                            }
                            errors++;
                          }
                          if (data.type === void 0) {
                            const err476 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                            if (vErrors === null) {
                              vErrors = [err476];
                            } else {
                              vErrors.push(err476);
                            }
                            errors++;
                          }
                          if (data.source === void 0) {
                            const err477 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                            if (vErrors === null) {
                              vErrors = [err477];
                            } else {
                              vErrors.push(err477);
                            }
                            errors++;
                          }
                          if (data.target === void 0) {
                            const err478 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                            if (vErrors === null) {
                              vErrors = [err478];
                            } else {
                              vErrors.push(err478);
                            }
                            errors++;
                          }
                          if (data.payload === void 0) {
                            const err479 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
                            if (vErrors === null) {
                              vErrors = [err479];
                            } else {
                              vErrors.push(err479);
                            }
                            errors++;
                          }
                          if (data.sentAt === void 0) {
                            const err480 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "sentAt" }, message: "must have required property 'sentAt'" };
                            if (vErrors === null) {
                              vErrors = [err480];
                            } else {
                              vErrors.push(err480);
                            }
                            errors++;
                          }
                          if (data.goalId === void 0) {
                            const err481 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                            if (vErrors === null) {
                              vErrors = [err481];
                            } else {
                              vErrors.push(err481);
                            }
                            errors++;
                          }
                          for (const key47 in data) {
                            if (!(key47 === "id" || key47 === "name" || key47 === "type" || key47 === "source" || key47 === "target" || key47 === "payload" || key47 === "sentAt" || key47 === "goalId")) {
                              const err482 = { instancePath, schemaPath: "#/anyOf/9/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key47 }, message: "must NOT have additional properties" };
                              if (vErrors === null) {
                                vErrors = [err482];
                              } else {
                                vErrors.push(err482);
                              }
                              errors++;
                            }
                          }
                          if (data.id !== void 0) {
                            if (typeof data.id !== "string") {
                              const err483 = { instancePath: instancePath + "/id", schemaPath: "#/anyOf/9/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err483];
                              } else {
                                vErrors.push(err483);
                              }
                              errors++;
                            }
                          }
                          if (data.name !== void 0) {
                            if (typeof data.name !== "string") {
                              const err484 = { instancePath: instancePath + "/name", schemaPath: "#/anyOf/9/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err484];
                              } else {
                                vErrors.push(err484);
                              }
                              errors++;
                            }
                          }
                          if (data.type !== void 0) {
                            let data166 = data.type;
                            if (typeof data166 !== "string") {
                              const err485 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/9/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err485];
                              } else {
                                vErrors.push(err485);
                              }
                              errors++;
                            }
                            if ("instruction" !== data166) {
                              const err486 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/9/properties/type/const", keyword: "const", params: { allowedValue: "instruction" }, message: "must be equal to constant" };
                              if (vErrors === null) {
                                vErrors = [err486];
                              } else {
                                vErrors.push(err486);
                              }
                              errors++;
                            }
                          }
                          if (data.source !== void 0) {
                            let data167 = data.source;
                            const _errs480 = errors;
                            let valid78 = false;
                            const _errs481 = errors;
                            if (data167 && typeof data167 == "object" && !Array.isArray(data167)) {
                              if (data167.role === void 0) {
                                const err487 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                if (vErrors === null) {
                                  vErrors = [err487];
                                } else {
                                  vErrors.push(err487);
                                }
                                errors++;
                              }
                              if (data167.workerId === void 0) {
                                const err488 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "workerId" }, message: "must have required property 'workerId'" };
                                if (vErrors === null) {
                                  vErrors = [err488];
                                } else {
                                  vErrors.push(err488);
                                }
                                errors++;
                              }
                              if (data167.generation === void 0) {
                                const err489 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "generation" }, message: "must have required property 'generation'" };
                                if (vErrors === null) {
                                  vErrors = [err489];
                                } else {
                                  vErrors.push(err489);
                                }
                                errors++;
                              }
                              for (const key48 in data167) {
                                if (!(key48 === "role" || key48 === "workerId" || key48 === "generation")) {
                                  const err490 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key48 }, message: "must NOT have additional properties" };
                                  if (vErrors === null) {
                                    vErrors = [err490];
                                  } else {
                                    vErrors.push(err490);
                                  }
                                  errors++;
                                }
                              }
                              if (data167.role !== void 0) {
                                let data168 = data167.role;
                                if (typeof data168 !== "string") {
                                  const err491 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err491];
                                  } else {
                                    vErrors.push(err491);
                                  }
                                  errors++;
                                }
                                if ("worker" !== data168) {
                                  const err492 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/const", keyword: "const", params: { allowedValue: "worker" }, message: "must be equal to constant" };
                                  if (vErrors === null) {
                                    vErrors = [err492];
                                  } else {
                                    vErrors.push(err492);
                                  }
                                  errors++;
                                }
                              }
                              if (data167.workerId !== void 0) {
                                if (typeof data167.workerId !== "string") {
                                  const err493 = { instancePath: instancePath + "/source/workerId", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/workerId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err493];
                                  } else {
                                    vErrors.push(err493);
                                  }
                                  errors++;
                                }
                              }
                              if (data167.generation !== void 0) {
                                if (typeof data167.generation !== "string") {
                                  const err494 = { instancePath: instancePath + "/source/generation", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/generation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err494];
                                  } else {
                                    vErrors.push(err494);
                                  }
                                  errors++;
                                }
                              }
                            } else {
                              const err495 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                              if (vErrors === null) {
                                vErrors = [err495];
                              } else {
                                vErrors.push(err495);
                              }
                              errors++;
                            }
                            var _valid11 = _errs481 === errors;
                            valid78 = valid78 || _valid11;
                            if (!valid78) {
                              const _errs490 = errors;
                              if (data167 && typeof data167 == "object" && !Array.isArray(data167)) {
                                if (data167.role === void 0) {
                                  const err496 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                  if (vErrors === null) {
                                    vErrors = [err496];
                                  } else {
                                    vErrors.push(err496);
                                  }
                                  errors++;
                                }
                                if (data167.externalId === void 0) {
                                  const err497 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "externalId" }, message: "must have required property 'externalId'" };
                                  if (vErrors === null) {
                                    vErrors = [err497];
                                  } else {
                                    vErrors.push(err497);
                                  }
                                  errors++;
                                }
                                for (const key49 in data167) {
                                  if (!(key49 === "role" || key49 === "externalId")) {
                                    const err498 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key49 }, message: "must NOT have additional properties" };
                                    if (vErrors === null) {
                                      vErrors = [err498];
                                    } else {
                                      vErrors.push(err498);
                                    }
                                    errors++;
                                  }
                                }
                                if (data167.role !== void 0) {
                                  let data171 = data167.role;
                                  if (typeof data171 !== "string") {
                                    const err499 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err499];
                                    } else {
                                      vErrors.push(err499);
                                    }
                                    errors++;
                                  }
                                  if ("external" !== data171) {
                                    const err500 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/const", keyword: "const", params: { allowedValue: "external" }, message: "must be equal to constant" };
                                    if (vErrors === null) {
                                      vErrors = [err500];
                                    } else {
                                      vErrors.push(err500);
                                    }
                                    errors++;
                                  }
                                }
                                if (data167.externalId !== void 0) {
                                  if (typeof data167.externalId !== "string") {
                                    const err501 = { instancePath: instancePath + "/source/externalId", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/externalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err501];
                                    } else {
                                      vErrors.push(err501);
                                    }
                                    errors++;
                                  }
                                }
                              } else {
                                const err502 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                if (vErrors === null) {
                                  vErrors = [err502];
                                } else {
                                  vErrors.push(err502);
                                }
                                errors++;
                              }
                              var _valid11 = _errs490 === errors;
                              valid78 = valid78 || _valid11;
                              if (!valid78) {
                                const _errs497 = errors;
                                if (data167 && typeof data167 == "object" && !Array.isArray(data167)) {
                                  if (data167.role === void 0) {
                                    const err503 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                    if (vErrors === null) {
                                      vErrors = [err503];
                                    } else {
                                      vErrors.push(err503);
                                    }
                                    errors++;
                                  }
                                  for (const key50 in data167) {
                                    if (!(key50 === "role")) {
                                      const err504 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key50 }, message: "must NOT have additional properties" };
                                      if (vErrors === null) {
                                        vErrors = [err504];
                                      } else {
                                        vErrors.push(err504);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data167.role !== void 0) {
                                    let data173 = data167.role;
                                    if (typeof data173 !== "string") {
                                      const err505 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err505];
                                      } else {
                                        vErrors.push(err505);
                                      }
                                      errors++;
                                    }
                                    if ("supervisor" !== data173) {
                                      const err506 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/const", keyword: "const", params: { allowedValue: "supervisor" }, message: "must be equal to constant" };
                                      if (vErrors === null) {
                                        vErrors = [err506];
                                      } else {
                                        vErrors.push(err506);
                                      }
                                      errors++;
                                    }
                                  }
                                } else {
                                  const err507 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                  if (vErrors === null) {
                                    vErrors = [err507];
                                  } else {
                                    vErrors.push(err507);
                                  }
                                  errors++;
                                }
                                var _valid11 = _errs497 === errors;
                                valid78 = valid78 || _valid11;
                              }
                            }
                            if (!valid78) {
                              const err508 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                              if (vErrors === null) {
                                vErrors = [err508];
                              } else {
                                vErrors.push(err508);
                              }
                              errors++;
                            } else {
                              errors = _errs480;
                              if (vErrors !== null) {
                                if (_errs480) {
                                  vErrors.length = _errs480;
                                } else {
                                  vErrors = null;
                                }
                              }
                            }
                          }
                          if (data.target !== void 0) {
                            let data174 = data.target;
                            if (typeof data174 !== "string") {
                              const err509 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err509];
                              } else {
                                vErrors.push(err509);
                              }
                              errors++;
                            }
                            if (!(data174 === "supervisor" || data174 === "worker")) {
                              const err510 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
                              if (vErrors === null) {
                                vErrors = [err510];
                              } else {
                                vErrors.push(err510);
                              }
                              errors++;
                            }
                          }
                          if (data.payload !== void 0) {
                            let data175 = data.payload;
                            if (data175 && typeof data175 == "object" && !Array.isArray(data175)) {
                              if (data175.action === void 0) {
                                const err511 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/9/properties/payload/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
                                if (vErrors === null) {
                                  vErrors = [err511];
                                } else {
                                  vErrors.push(err511);
                                }
                                errors++;
                              }
                              if (data175.runId === void 0) {
                                const err512 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/9/properties/payload/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                                if (vErrors === null) {
                                  vErrors = [err512];
                                } else {
                                  vErrors.push(err512);
                                }
                                errors++;
                              }
                              for (const key51 in data175) {
                                if (!(key51 === "action" || key51 === "runId")) {
                                  const err513 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/9/properties/payload/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key51 }, message: "must NOT have additional properties" };
                                  if (vErrors === null) {
                                    vErrors = [err513];
                                  } else {
                                    vErrors.push(err513);
                                  }
                                  errors++;
                                }
                              }
                              if (data175.action !== void 0) {
                                let data176 = data175.action;
                                if (typeof data176 !== "string") {
                                  const err514 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/9/properties/payload/properties/action/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err514];
                                  } else {
                                    vErrors.push(err514);
                                  }
                                  errors++;
                                }
                                if ("cancel" !== data176) {
                                  const err515 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/9/properties/payload/properties/action/const", keyword: "const", params: { allowedValue: "cancel" }, message: "must be equal to constant" };
                                  if (vErrors === null) {
                                    vErrors = [err515];
                                  } else {
                                    vErrors.push(err515);
                                  }
                                  errors++;
                                }
                              }
                              if (data175.runId !== void 0) {
                                if (typeof data175.runId !== "string") {
                                  const err516 = { instancePath: instancePath + "/payload/runId", schemaPath: "#/anyOf/9/properties/payload/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err516];
                                  } else {
                                    vErrors.push(err516);
                                  }
                                  errors++;
                                }
                              }
                            } else {
                              const err517 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/9/properties/payload/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                              if (vErrors === null) {
                                vErrors = [err517];
                              } else {
                                vErrors.push(err517);
                              }
                              errors++;
                            }
                          }
                          if (data.sentAt !== void 0) {
                            if (typeof data.sentAt !== "string") {
                              const err518 = { instancePath: instancePath + "/sentAt", schemaPath: "#/anyOf/9/properties/sentAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err518];
                              } else {
                                vErrors.push(err518);
                              }
                              errors++;
                            }
                          }
                          if (data.goalId !== void 0) {
                            if (typeof data.goalId !== "string") {
                              const err519 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/9/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err519];
                              } else {
                                vErrors.push(err519);
                              }
                              errors++;
                            }
                          }
                        } else {
                          const err520 = { instancePath, schemaPath: "#/anyOf/9/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                          if (vErrors === null) {
                            vErrors = [err520];
                          } else {
                            vErrors.push(err520);
                          }
                          errors++;
                        }
                        var _valid0 = _errs469 === errors;
                        valid0 = valid0 || _valid0;
                        if (!valid0) {
                          const _errs516 = errors;
                          if (data && typeof data == "object" && !Array.isArray(data)) {
                            if (data.id === void 0) {
                              const err521 = { instancePath, schemaPath: "#/anyOf/10/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                              if (vErrors === null) {
                                vErrors = [err521];
                              } else {
                                vErrors.push(err521);
                              }
                              errors++;
                            }
                            if (data.name === void 0) {
                              const err522 = { instancePath, schemaPath: "#/anyOf/10/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
                              if (vErrors === null) {
                                vErrors = [err522];
                              } else {
                                vErrors.push(err522);
                              }
                              errors++;
                            }
                            if (data.type === void 0) {
                              const err523 = { instancePath, schemaPath: "#/anyOf/10/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                              if (vErrors === null) {
                                vErrors = [err523];
                              } else {
                                vErrors.push(err523);
                              }
                              errors++;
                            }
                            if (data.source === void 0) {
                              const err524 = { instancePath, schemaPath: "#/anyOf/10/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                              if (vErrors === null) {
                                vErrors = [err524];
                              } else {
                                vErrors.push(err524);
                              }
                              errors++;
                            }
                            if (data.target === void 0) {
                              const err525 = { instancePath, schemaPath: "#/anyOf/10/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                              if (vErrors === null) {
                                vErrors = [err525];
                              } else {
                                vErrors.push(err525);
                              }
                              errors++;
                            }
                            if (data.payload === void 0) {
                              const err526 = { instancePath, schemaPath: "#/anyOf/10/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
                              if (vErrors === null) {
                                vErrors = [err526];
                              } else {
                                vErrors.push(err526);
                              }
                              errors++;
                            }
                            if (data.sentAt === void 0) {
                              const err527 = { instancePath, schemaPath: "#/anyOf/10/required", keyword: "required", params: { missingProperty: "sentAt" }, message: "must have required property 'sentAt'" };
                              if (vErrors === null) {
                                vErrors = [err527];
                              } else {
                                vErrors.push(err527);
                              }
                              errors++;
                            }
                            if (data.goalId === void 0) {
                              const err528 = { instancePath, schemaPath: "#/anyOf/10/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                              if (vErrors === null) {
                                vErrors = [err528];
                              } else {
                                vErrors.push(err528);
                              }
                              errors++;
                            }
                            if (data.replyTo === void 0) {
                              const err529 = { instancePath, schemaPath: "#/anyOf/10/required", keyword: "required", params: { missingProperty: "replyTo" }, message: "must have required property 'replyTo'" };
                              if (vErrors === null) {
                                vErrors = [err529];
                              } else {
                                vErrors.push(err529);
                              }
                              errors++;
                            }
                            for (const key52 in data) {
                              if (!func2.call(schema12.anyOf[10].properties, key52)) {
                                const err530 = { instancePath, schemaPath: "#/anyOf/10/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key52 }, message: "must NOT have additional properties" };
                                if (vErrors === null) {
                                  vErrors = [err530];
                                } else {
                                  vErrors.push(err530);
                                }
                                errors++;
                              }
                            }
                            if (data.id !== void 0) {
                              if (typeof data.id !== "string") {
                                const err531 = { instancePath: instancePath + "/id", schemaPath: "#/anyOf/10/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err531];
                                } else {
                                  vErrors.push(err531);
                                }
                                errors++;
                              }
                            }
                            if (data.name !== void 0) {
                              if (typeof data.name !== "string") {
                                const err532 = { instancePath: instancePath + "/name", schemaPath: "#/anyOf/10/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err532];
                                } else {
                                  vErrors.push(err532);
                                }
                                errors++;
                              }
                            }
                            if (data.type !== void 0) {
                              let data182 = data.type;
                              if (typeof data182 !== "string") {
                                const err533 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/10/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err533];
                                } else {
                                  vErrors.push(err533);
                                }
                                errors++;
                              }
                              if ("instruction" !== data182) {
                                const err534 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/10/properties/type/const", keyword: "const", params: { allowedValue: "instruction" }, message: "must be equal to constant" };
                                if (vErrors === null) {
                                  vErrors = [err534];
                                } else {
                                  vErrors.push(err534);
                                }
                                errors++;
                              }
                            }
                            if (data.source !== void 0) {
                              let data183 = data.source;
                              const _errs527 = errors;
                              let valid86 = false;
                              const _errs528 = errors;
                              if (data183 && typeof data183 == "object" && !Array.isArray(data183)) {
                                if (data183.role === void 0) {
                                  const err535 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                  if (vErrors === null) {
                                    vErrors = [err535];
                                  } else {
                                    vErrors.push(err535);
                                  }
                                  errors++;
                                }
                                if (data183.workerId === void 0) {
                                  const err536 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "workerId" }, message: "must have required property 'workerId'" };
                                  if (vErrors === null) {
                                    vErrors = [err536];
                                  } else {
                                    vErrors.push(err536);
                                  }
                                  errors++;
                                }
                                if (data183.generation === void 0) {
                                  const err537 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "generation" }, message: "must have required property 'generation'" };
                                  if (vErrors === null) {
                                    vErrors = [err537];
                                  } else {
                                    vErrors.push(err537);
                                  }
                                  errors++;
                                }
                                for (const key53 in data183) {
                                  if (!(key53 === "role" || key53 === "workerId" || key53 === "generation")) {
                                    const err538 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key53 }, message: "must NOT have additional properties" };
                                    if (vErrors === null) {
                                      vErrors = [err538];
                                    } else {
                                      vErrors.push(err538);
                                    }
                                    errors++;
                                  }
                                }
                                if (data183.role !== void 0) {
                                  let data184 = data183.role;
                                  if (typeof data184 !== "string") {
                                    const err539 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err539];
                                    } else {
                                      vErrors.push(err539);
                                    }
                                    errors++;
                                  }
                                  if ("worker" !== data184) {
                                    const err540 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/const", keyword: "const", params: { allowedValue: "worker" }, message: "must be equal to constant" };
                                    if (vErrors === null) {
                                      vErrors = [err540];
                                    } else {
                                      vErrors.push(err540);
                                    }
                                    errors++;
                                  }
                                }
                                if (data183.workerId !== void 0) {
                                  if (typeof data183.workerId !== "string") {
                                    const err541 = { instancePath: instancePath + "/source/workerId", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/workerId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err541];
                                    } else {
                                      vErrors.push(err541);
                                    }
                                    errors++;
                                  }
                                }
                                if (data183.generation !== void 0) {
                                  if (typeof data183.generation !== "string") {
                                    const err542 = { instancePath: instancePath + "/source/generation", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/generation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err542];
                                    } else {
                                      vErrors.push(err542);
                                    }
                                    errors++;
                                  }
                                }
                              } else {
                                const err543 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                if (vErrors === null) {
                                  vErrors = [err543];
                                } else {
                                  vErrors.push(err543);
                                }
                                errors++;
                              }
                              var _valid12 = _errs528 === errors;
                              valid86 = valid86 || _valid12;
                              if (!valid86) {
                                const _errs537 = errors;
                                if (data183 && typeof data183 == "object" && !Array.isArray(data183)) {
                                  if (data183.role === void 0) {
                                    const err544 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                    if (vErrors === null) {
                                      vErrors = [err544];
                                    } else {
                                      vErrors.push(err544);
                                    }
                                    errors++;
                                  }
                                  if (data183.externalId === void 0) {
                                    const err545 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "externalId" }, message: "must have required property 'externalId'" };
                                    if (vErrors === null) {
                                      vErrors = [err545];
                                    } else {
                                      vErrors.push(err545);
                                    }
                                    errors++;
                                  }
                                  for (const key54 in data183) {
                                    if (!(key54 === "role" || key54 === "externalId")) {
                                      const err546 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key54 }, message: "must NOT have additional properties" };
                                      if (vErrors === null) {
                                        vErrors = [err546];
                                      } else {
                                        vErrors.push(err546);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data183.role !== void 0) {
                                    let data187 = data183.role;
                                    if (typeof data187 !== "string") {
                                      const err547 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err547];
                                      } else {
                                        vErrors.push(err547);
                                      }
                                      errors++;
                                    }
                                    if ("external" !== data187) {
                                      const err548 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/const", keyword: "const", params: { allowedValue: "external" }, message: "must be equal to constant" };
                                      if (vErrors === null) {
                                        vErrors = [err548];
                                      } else {
                                        vErrors.push(err548);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data183.externalId !== void 0) {
                                    if (typeof data183.externalId !== "string") {
                                      const err549 = { instancePath: instancePath + "/source/externalId", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/externalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err549];
                                      } else {
                                        vErrors.push(err549);
                                      }
                                      errors++;
                                    }
                                  }
                                } else {
                                  const err550 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                  if (vErrors === null) {
                                    vErrors = [err550];
                                  } else {
                                    vErrors.push(err550);
                                  }
                                  errors++;
                                }
                                var _valid12 = _errs537 === errors;
                                valid86 = valid86 || _valid12;
                                if (!valid86) {
                                  const _errs544 = errors;
                                  if (data183 && typeof data183 == "object" && !Array.isArray(data183)) {
                                    if (data183.role === void 0) {
                                      const err551 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                      if (vErrors === null) {
                                        vErrors = [err551];
                                      } else {
                                        vErrors.push(err551);
                                      }
                                      errors++;
                                    }
                                    for (const key55 in data183) {
                                      if (!(key55 === "role")) {
                                        const err552 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key55 }, message: "must NOT have additional properties" };
                                        if (vErrors === null) {
                                          vErrors = [err552];
                                        } else {
                                          vErrors.push(err552);
                                        }
                                        errors++;
                                      }
                                    }
                                    if (data183.role !== void 0) {
                                      let data189 = data183.role;
                                      if (typeof data189 !== "string") {
                                        const err553 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err553];
                                        } else {
                                          vErrors.push(err553);
                                        }
                                        errors++;
                                      }
                                      if ("supervisor" !== data189) {
                                        const err554 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/const", keyword: "const", params: { allowedValue: "supervisor" }, message: "must be equal to constant" };
                                        if (vErrors === null) {
                                          vErrors = [err554];
                                        } else {
                                          vErrors.push(err554);
                                        }
                                        errors++;
                                      }
                                    }
                                  } else {
                                    const err555 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                    if (vErrors === null) {
                                      vErrors = [err555];
                                    } else {
                                      vErrors.push(err555);
                                    }
                                    errors++;
                                  }
                                  var _valid12 = _errs544 === errors;
                                  valid86 = valid86 || _valid12;
                                }
                              }
                              if (!valid86) {
                                const err556 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                                if (vErrors === null) {
                                  vErrors = [err556];
                                } else {
                                  vErrors.push(err556);
                                }
                                errors++;
                              } else {
                                errors = _errs527;
                                if (vErrors !== null) {
                                  if (_errs527) {
                                    vErrors.length = _errs527;
                                  } else {
                                    vErrors = null;
                                  }
                                }
                              }
                            }
                            if (data.target !== void 0) {
                              let data190 = data.target;
                              if (typeof data190 !== "string") {
                                const err557 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err557];
                                } else {
                                  vErrors.push(err557);
                                }
                                errors++;
                              }
                              if (!(data190 === "supervisor" || data190 === "worker")) {
                                const err558 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
                                if (vErrors === null) {
                                  vErrors = [err558];
                                } else {
                                  vErrors.push(err558);
                                }
                                errors++;
                              }
                            }
                            if (data.payload !== void 0) {
                              let data191 = data.payload;
                              if (data191 && typeof data191 == "object" && !Array.isArray(data191)) {
                                if (data191.action === void 0) {
                                  const err559 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/10/properties/payload/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
                                  if (vErrors === null) {
                                    vErrors = [err559];
                                  } else {
                                    vErrors.push(err559);
                                  }
                                  errors++;
                                }
                                if (data191.runId === void 0) {
                                  const err560 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/10/properties/payload/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                                  if (vErrors === null) {
                                    vErrors = [err560];
                                  } else {
                                    vErrors.push(err560);
                                  }
                                  errors++;
                                }
                                if (data191.acknowledgeUnknownEffects === void 0) {
                                  const err561 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/10/properties/payload/required", keyword: "required", params: { missingProperty: "acknowledgeUnknownEffects" }, message: "must have required property 'acknowledgeUnknownEffects'" };
                                  if (vErrors === null) {
                                    vErrors = [err561];
                                  } else {
                                    vErrors.push(err561);
                                  }
                                  errors++;
                                }
                                for (const key56 in data191) {
                                  if (!(key56 === "action" || key56 === "runId" || key56 === "acknowledgeUnknownEffects")) {
                                    const err562 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/10/properties/payload/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key56 }, message: "must NOT have additional properties" };
                                    if (vErrors === null) {
                                      vErrors = [err562];
                                    } else {
                                      vErrors.push(err562);
                                    }
                                    errors++;
                                  }
                                }
                                if (data191.action !== void 0) {
                                  let data192 = data191.action;
                                  if (typeof data192 !== "string") {
                                    const err563 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/10/properties/payload/properties/action/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err563];
                                    } else {
                                      vErrors.push(err563);
                                    }
                                    errors++;
                                  }
                                  if ("resume" !== data192) {
                                    const err564 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/10/properties/payload/properties/action/const", keyword: "const", params: { allowedValue: "resume" }, message: "must be equal to constant" };
                                    if (vErrors === null) {
                                      vErrors = [err564];
                                    } else {
                                      vErrors.push(err564);
                                    }
                                    errors++;
                                  }
                                }
                                if (data191.runId !== void 0) {
                                  if (typeof data191.runId !== "string") {
                                    const err565 = { instancePath: instancePath + "/payload/runId", schemaPath: "#/anyOf/10/properties/payload/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err565];
                                    } else {
                                      vErrors.push(err565);
                                    }
                                    errors++;
                                  }
                                }
                                if (data191.acknowledgeUnknownEffects !== void 0) {
                                  if (typeof data191.acknowledgeUnknownEffects !== "boolean") {
                                    const err566 = { instancePath: instancePath + "/payload/acknowledgeUnknownEffects", schemaPath: "#/anyOf/10/properties/payload/properties/acknowledgeUnknownEffects/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                                    if (vErrors === null) {
                                      vErrors = [err566];
                                    } else {
                                      vErrors.push(err566);
                                    }
                                    errors++;
                                  }
                                }
                              } else {
                                const err567 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/10/properties/payload/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                if (vErrors === null) {
                                  vErrors = [err567];
                                } else {
                                  vErrors.push(err567);
                                }
                                errors++;
                              }
                            }
                            if (data.sentAt !== void 0) {
                              if (typeof data.sentAt !== "string") {
                                const err568 = { instancePath: instancePath + "/sentAt", schemaPath: "#/anyOf/10/properties/sentAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err568];
                                } else {
                                  vErrors.push(err568);
                                }
                                errors++;
                              }
                            }
                            if (data.goalId !== void 0) {
                              if (typeof data.goalId !== "string") {
                                const err569 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/10/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err569];
                                } else {
                                  vErrors.push(err569);
                                }
                                errors++;
                              }
                            }
                            if (data.replyTo !== void 0) {
                              if (typeof data.replyTo !== "string") {
                                const err570 = { instancePath: instancePath + "/replyTo", schemaPath: "#/anyOf/10/properties/replyTo/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err570];
                                } else {
                                  vErrors.push(err570);
                                }
                                errors++;
                              }
                            }
                          } else {
                            const err571 = { instancePath, schemaPath: "#/anyOf/10/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                            if (vErrors === null) {
                              vErrors = [err571];
                            } else {
                              vErrors.push(err571);
                            }
                            errors++;
                          }
                          var _valid0 = _errs516 === errors;
                          valid0 = valid0 || _valid0;
                          if (!valid0) {
                            const _errs567 = errors;
                            if (data && typeof data == "object" && !Array.isArray(data)) {
                              if (data.id === void 0) {
                                const err572 = { instancePath, schemaPath: "#/anyOf/11/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                                if (vErrors === null) {
                                  vErrors = [err572];
                                } else {
                                  vErrors.push(err572);
                                }
                                errors++;
                              }
                              if (data.name === void 0) {
                                const err573 = { instancePath, schemaPath: "#/anyOf/11/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
                                if (vErrors === null) {
                                  vErrors = [err573];
                                } else {
                                  vErrors.push(err573);
                                }
                                errors++;
                              }
                              if (data.type === void 0) {
                                const err574 = { instancePath, schemaPath: "#/anyOf/11/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                                if (vErrors === null) {
                                  vErrors = [err574];
                                } else {
                                  vErrors.push(err574);
                                }
                                errors++;
                              }
                              if (data.source === void 0) {
                                const err575 = { instancePath, schemaPath: "#/anyOf/11/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                                if (vErrors === null) {
                                  vErrors = [err575];
                                } else {
                                  vErrors.push(err575);
                                }
                                errors++;
                              }
                              if (data.target === void 0) {
                                const err576 = { instancePath, schemaPath: "#/anyOf/11/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                                if (vErrors === null) {
                                  vErrors = [err576];
                                } else {
                                  vErrors.push(err576);
                                }
                                errors++;
                              }
                              if (data.payload === void 0) {
                                const err577 = { instancePath, schemaPath: "#/anyOf/11/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
                                if (vErrors === null) {
                                  vErrors = [err577];
                                } else {
                                  vErrors.push(err577);
                                }
                                errors++;
                              }
                              if (data.sentAt === void 0) {
                                const err578 = { instancePath, schemaPath: "#/anyOf/11/required", keyword: "required", params: { missingProperty: "sentAt" }, message: "must have required property 'sentAt'" };
                                if (vErrors === null) {
                                  vErrors = [err578];
                                } else {
                                  vErrors.push(err578);
                                }
                                errors++;
                              }
                              if (data.goalId === void 0) {
                                const err579 = { instancePath, schemaPath: "#/anyOf/11/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                                if (vErrors === null) {
                                  vErrors = [err579];
                                } else {
                                  vErrors.push(err579);
                                }
                                errors++;
                              }
                              if (data.replyTo === void 0) {
                                const err580 = { instancePath, schemaPath: "#/anyOf/11/required", keyword: "required", params: { missingProperty: "replyTo" }, message: "must have required property 'replyTo'" };
                                if (vErrors === null) {
                                  vErrors = [err580];
                                } else {
                                  vErrors.push(err580);
                                }
                                errors++;
                              }
                              for (const key57 in data) {
                                if (!func2.call(schema12.anyOf[11].properties, key57)) {
                                  const err581 = { instancePath, schemaPath: "#/anyOf/11/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key57 }, message: "must NOT have additional properties" };
                                  if (vErrors === null) {
                                    vErrors = [err581];
                                  } else {
                                    vErrors.push(err581);
                                  }
                                  errors++;
                                }
                              }
                              if (data.id !== void 0) {
                                if (typeof data.id !== "string") {
                                  const err582 = { instancePath: instancePath + "/id", schemaPath: "#/anyOf/11/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err582];
                                  } else {
                                    vErrors.push(err582);
                                  }
                                  errors++;
                                }
                              }
                              if (data.name !== void 0) {
                                if (typeof data.name !== "string") {
                                  const err583 = { instancePath: instancePath + "/name", schemaPath: "#/anyOf/11/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err583];
                                  } else {
                                    vErrors.push(err583);
                                  }
                                  errors++;
                                }
                              }
                              if (data.type !== void 0) {
                                let data200 = data.type;
                                if (typeof data200 !== "string") {
                                  const err584 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/11/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err584];
                                  } else {
                                    vErrors.push(err584);
                                  }
                                  errors++;
                                }
                                if ("instruction" !== data200) {
                                  const err585 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/11/properties/type/const", keyword: "const", params: { allowedValue: "instruction" }, message: "must be equal to constant" };
                                  if (vErrors === null) {
                                    vErrors = [err585];
                                  } else {
                                    vErrors.push(err585);
                                  }
                                  errors++;
                                }
                              }
                              if (data.source !== void 0) {
                                let data201 = data.source;
                                const _errs578 = errors;
                                let valid94 = false;
                                const _errs579 = errors;
                                if (data201 && typeof data201 == "object" && !Array.isArray(data201)) {
                                  if (data201.role === void 0) {
                                    const err586 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                    if (vErrors === null) {
                                      vErrors = [err586];
                                    } else {
                                      vErrors.push(err586);
                                    }
                                    errors++;
                                  }
                                  if (data201.workerId === void 0) {
                                    const err587 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "workerId" }, message: "must have required property 'workerId'" };
                                    if (vErrors === null) {
                                      vErrors = [err587];
                                    } else {
                                      vErrors.push(err587);
                                    }
                                    errors++;
                                  }
                                  if (data201.generation === void 0) {
                                    const err588 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "generation" }, message: "must have required property 'generation'" };
                                    if (vErrors === null) {
                                      vErrors = [err588];
                                    } else {
                                      vErrors.push(err588);
                                    }
                                    errors++;
                                  }
                                  for (const key58 in data201) {
                                    if (!(key58 === "role" || key58 === "workerId" || key58 === "generation")) {
                                      const err589 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key58 }, message: "must NOT have additional properties" };
                                      if (vErrors === null) {
                                        vErrors = [err589];
                                      } else {
                                        vErrors.push(err589);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data201.role !== void 0) {
                                    let data202 = data201.role;
                                    if (typeof data202 !== "string") {
                                      const err590 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err590];
                                      } else {
                                        vErrors.push(err590);
                                      }
                                      errors++;
                                    }
                                    if ("worker" !== data202) {
                                      const err591 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/const", keyword: "const", params: { allowedValue: "worker" }, message: "must be equal to constant" };
                                      if (vErrors === null) {
                                        vErrors = [err591];
                                      } else {
                                        vErrors.push(err591);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data201.workerId !== void 0) {
                                    if (typeof data201.workerId !== "string") {
                                      const err592 = { instancePath: instancePath + "/source/workerId", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/workerId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err592];
                                      } else {
                                        vErrors.push(err592);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data201.generation !== void 0) {
                                    if (typeof data201.generation !== "string") {
                                      const err593 = { instancePath: instancePath + "/source/generation", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/generation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err593];
                                      } else {
                                        vErrors.push(err593);
                                      }
                                      errors++;
                                    }
                                  }
                                } else {
                                  const err594 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                  if (vErrors === null) {
                                    vErrors = [err594];
                                  } else {
                                    vErrors.push(err594);
                                  }
                                  errors++;
                                }
                                var _valid13 = _errs579 === errors;
                                valid94 = valid94 || _valid13;
                                if (!valid94) {
                                  const _errs588 = errors;
                                  if (data201 && typeof data201 == "object" && !Array.isArray(data201)) {
                                    if (data201.role === void 0) {
                                      const err595 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                      if (vErrors === null) {
                                        vErrors = [err595];
                                      } else {
                                        vErrors.push(err595);
                                      }
                                      errors++;
                                    }
                                    if (data201.externalId === void 0) {
                                      const err596 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "externalId" }, message: "must have required property 'externalId'" };
                                      if (vErrors === null) {
                                        vErrors = [err596];
                                      } else {
                                        vErrors.push(err596);
                                      }
                                      errors++;
                                    }
                                    for (const key59 in data201) {
                                      if (!(key59 === "role" || key59 === "externalId")) {
                                        const err597 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key59 }, message: "must NOT have additional properties" };
                                        if (vErrors === null) {
                                          vErrors = [err597];
                                        } else {
                                          vErrors.push(err597);
                                        }
                                        errors++;
                                      }
                                    }
                                    if (data201.role !== void 0) {
                                      let data205 = data201.role;
                                      if (typeof data205 !== "string") {
                                        const err598 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err598];
                                        } else {
                                          vErrors.push(err598);
                                        }
                                        errors++;
                                      }
                                      if ("external" !== data205) {
                                        const err599 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/const", keyword: "const", params: { allowedValue: "external" }, message: "must be equal to constant" };
                                        if (vErrors === null) {
                                          vErrors = [err599];
                                        } else {
                                          vErrors.push(err599);
                                        }
                                        errors++;
                                      }
                                    }
                                    if (data201.externalId !== void 0) {
                                      if (typeof data201.externalId !== "string") {
                                        const err600 = { instancePath: instancePath + "/source/externalId", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/externalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err600];
                                        } else {
                                          vErrors.push(err600);
                                        }
                                        errors++;
                                      }
                                    }
                                  } else {
                                    const err601 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                    if (vErrors === null) {
                                      vErrors = [err601];
                                    } else {
                                      vErrors.push(err601);
                                    }
                                    errors++;
                                  }
                                  var _valid13 = _errs588 === errors;
                                  valid94 = valid94 || _valid13;
                                  if (!valid94) {
                                    const _errs595 = errors;
                                    if (data201 && typeof data201 == "object" && !Array.isArray(data201)) {
                                      if (data201.role === void 0) {
                                        const err602 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                        if (vErrors === null) {
                                          vErrors = [err602];
                                        } else {
                                          vErrors.push(err602);
                                        }
                                        errors++;
                                      }
                                      for (const key60 in data201) {
                                        if (!(key60 === "role")) {
                                          const err603 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key60 }, message: "must NOT have additional properties" };
                                          if (vErrors === null) {
                                            vErrors = [err603];
                                          } else {
                                            vErrors.push(err603);
                                          }
                                          errors++;
                                        }
                                      }
                                      if (data201.role !== void 0) {
                                        let data207 = data201.role;
                                        if (typeof data207 !== "string") {
                                          const err604 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                          if (vErrors === null) {
                                            vErrors = [err604];
                                          } else {
                                            vErrors.push(err604);
                                          }
                                          errors++;
                                        }
                                        if ("supervisor" !== data207) {
                                          const err605 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/const", keyword: "const", params: { allowedValue: "supervisor" }, message: "must be equal to constant" };
                                          if (vErrors === null) {
                                            vErrors = [err605];
                                          } else {
                                            vErrors.push(err605);
                                          }
                                          errors++;
                                        }
                                      }
                                    } else {
                                      const err606 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                      if (vErrors === null) {
                                        vErrors = [err606];
                                      } else {
                                        vErrors.push(err606);
                                      }
                                      errors++;
                                    }
                                    var _valid13 = _errs595 === errors;
                                    valid94 = valid94 || _valid13;
                                  }
                                }
                                if (!valid94) {
                                  const err607 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                                  if (vErrors === null) {
                                    vErrors = [err607];
                                  } else {
                                    vErrors.push(err607);
                                  }
                                  errors++;
                                } else {
                                  errors = _errs578;
                                  if (vErrors !== null) {
                                    if (_errs578) {
                                      vErrors.length = _errs578;
                                    } else {
                                      vErrors = null;
                                    }
                                  }
                                }
                              }
                              if (data.target !== void 0) {
                                let data208 = data.target;
                                if (typeof data208 !== "string") {
                                  const err608 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err608];
                                  } else {
                                    vErrors.push(err608);
                                  }
                                  errors++;
                                }
                                if (!(data208 === "supervisor" || data208 === "worker")) {
                                  const err609 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
                                  if (vErrors === null) {
                                    vErrors = [err609];
                                  } else {
                                    vErrors.push(err609);
                                  }
                                  errors++;
                                }
                              }
                              if (data.payload !== void 0) {
                                let data209 = data.payload;
                                if (data209 && typeof data209 == "object" && !Array.isArray(data209)) {
                                  if (data209.action === void 0) {
                                    const err610 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/11/properties/payload/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
                                    if (vErrors === null) {
                                      vErrors = [err610];
                                    } else {
                                      vErrors.push(err610);
                                    }
                                    errors++;
                                  }
                                  if (data209.runId === void 0) {
                                    const err611 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/11/properties/payload/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                                    if (vErrors === null) {
                                      vErrors = [err611];
                                    } else {
                                      vErrors.push(err611);
                                    }
                                    errors++;
                                  }
                                  if (data209.content === void 0) {
                                    const err612 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/11/properties/payload/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
                                    if (vErrors === null) {
                                      vErrors = [err612];
                                    } else {
                                      vErrors.push(err612);
                                    }
                                    errors++;
                                  }
                                  for (const key61 in data209) {
                                    if (!(key61 === "action" || key61 === "runId" || key61 === "content")) {
                                      const err613 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/11/properties/payload/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key61 }, message: "must NOT have additional properties" };
                                      if (vErrors === null) {
                                        vErrors = [err613];
                                      } else {
                                        vErrors.push(err613);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data209.action !== void 0) {
                                    let data210 = data209.action;
                                    if (typeof data210 !== "string") {
                                      const err614 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/11/properties/payload/properties/action/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err614];
                                      } else {
                                        vErrors.push(err614);
                                      }
                                      errors++;
                                    }
                                    if ("continue" !== data210) {
                                      const err615 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/11/properties/payload/properties/action/const", keyword: "const", params: { allowedValue: "continue" }, message: "must be equal to constant" };
                                      if (vErrors === null) {
                                        vErrors = [err615];
                                      } else {
                                        vErrors.push(err615);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data209.runId !== void 0) {
                                    if (typeof data209.runId !== "string") {
                                      const err616 = { instancePath: instancePath + "/payload/runId", schemaPath: "#/anyOf/11/properties/payload/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err616];
                                      } else {
                                        vErrors.push(err616);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data209.content !== void 0) {
                                    if (typeof data209.content !== "string") {
                                      const err617 = { instancePath: instancePath + "/payload/content", schemaPath: "#/anyOf/11/properties/payload/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err617];
                                      } else {
                                        vErrors.push(err617);
                                      }
                                      errors++;
                                    }
                                  }
                                } else {
                                  const err618 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/11/properties/payload/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                  if (vErrors === null) {
                                    vErrors = [err618];
                                  } else {
                                    vErrors.push(err618);
                                  }
                                  errors++;
                                }
                              }
                              if (data.sentAt !== void 0) {
                                if (typeof data.sentAt !== "string") {
                                  const err619 = { instancePath: instancePath + "/sentAt", schemaPath: "#/anyOf/11/properties/sentAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err619];
                                  } else {
                                    vErrors.push(err619);
                                  }
                                  errors++;
                                }
                              }
                              if (data.goalId !== void 0) {
                                if (typeof data.goalId !== "string") {
                                  const err620 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/11/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err620];
                                  } else {
                                    vErrors.push(err620);
                                  }
                                  errors++;
                                }
                              }
                              if (data.replyTo !== void 0) {
                                if (typeof data.replyTo !== "string") {
                                  const err621 = { instancePath: instancePath + "/replyTo", schemaPath: "#/anyOf/11/properties/replyTo/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                  if (vErrors === null) {
                                    vErrors = [err621];
                                  } else {
                                    vErrors.push(err621);
                                  }
                                  errors++;
                                }
                              }
                            } else {
                              const err622 = { instancePath, schemaPath: "#/anyOf/11/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                              if (vErrors === null) {
                                vErrors = [err622];
                              } else {
                                vErrors.push(err622);
                              }
                              errors++;
                            }
                            var _valid0 = _errs567 === errors;
                            valid0 = valid0 || _valid0;
                            if (!valid0) {
                              const _errs618 = errors;
                              if (data && typeof data == "object" && !Array.isArray(data)) {
                                if (data.id === void 0) {
                                  const err623 = { instancePath, schemaPath: "#/anyOf/12/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                                  if (vErrors === null) {
                                    vErrors = [err623];
                                  } else {
                                    vErrors.push(err623);
                                  }
                                  errors++;
                                }
                                if (data.name === void 0) {
                                  const err624 = { instancePath, schemaPath: "#/anyOf/12/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
                                  if (vErrors === null) {
                                    vErrors = [err624];
                                  } else {
                                    vErrors.push(err624);
                                  }
                                  errors++;
                                }
                                if (data.type === void 0) {
                                  const err625 = { instancePath, schemaPath: "#/anyOf/12/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                                  if (vErrors === null) {
                                    vErrors = [err625];
                                  } else {
                                    vErrors.push(err625);
                                  }
                                  errors++;
                                }
                                if (data.source === void 0) {
                                  const err626 = { instancePath, schemaPath: "#/anyOf/12/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                                  if (vErrors === null) {
                                    vErrors = [err626];
                                  } else {
                                    vErrors.push(err626);
                                  }
                                  errors++;
                                }
                                if (data.target === void 0) {
                                  const err627 = { instancePath, schemaPath: "#/anyOf/12/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                                  if (vErrors === null) {
                                    vErrors = [err627];
                                  } else {
                                    vErrors.push(err627);
                                  }
                                  errors++;
                                }
                                if (data.payload === void 0) {
                                  const err628 = { instancePath, schemaPath: "#/anyOf/12/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
                                  if (vErrors === null) {
                                    vErrors = [err628];
                                  } else {
                                    vErrors.push(err628);
                                  }
                                  errors++;
                                }
                                if (data.sentAt === void 0) {
                                  const err629 = { instancePath, schemaPath: "#/anyOf/12/required", keyword: "required", params: { missingProperty: "sentAt" }, message: "must have required property 'sentAt'" };
                                  if (vErrors === null) {
                                    vErrors = [err629];
                                  } else {
                                    vErrors.push(err629);
                                  }
                                  errors++;
                                }
                                for (const key62 in data) {
                                  if (!(key62 === "id" || key62 === "name" || key62 === "type" || key62 === "source" || key62 === "target" || key62 === "payload" || key62 === "sentAt")) {
                                    const err630 = { instancePath, schemaPath: "#/anyOf/12/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key62 }, message: "must NOT have additional properties" };
                                    if (vErrors === null) {
                                      vErrors = [err630];
                                    } else {
                                      vErrors.push(err630);
                                    }
                                    errors++;
                                  }
                                }
                                if (data.id !== void 0) {
                                  if (typeof data.id !== "string") {
                                    const err631 = { instancePath: instancePath + "/id", schemaPath: "#/anyOf/12/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err631];
                                    } else {
                                      vErrors.push(err631);
                                    }
                                    errors++;
                                  }
                                }
                                if (data.name !== void 0) {
                                  if (typeof data.name !== "string") {
                                    const err632 = { instancePath: instancePath + "/name", schemaPath: "#/anyOf/12/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err632];
                                    } else {
                                      vErrors.push(err632);
                                    }
                                    errors++;
                                  }
                                }
                                if (data.type !== void 0) {
                                  let data218 = data.type;
                                  if (typeof data218 !== "string") {
                                    const err633 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/12/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err633];
                                    } else {
                                      vErrors.push(err633);
                                    }
                                    errors++;
                                  }
                                  if ("lifecycle" !== data218) {
                                    const err634 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/12/properties/type/const", keyword: "const", params: { allowedValue: "lifecycle" }, message: "must be equal to constant" };
                                    if (vErrors === null) {
                                      vErrors = [err634];
                                    } else {
                                      vErrors.push(err634);
                                    }
                                    errors++;
                                  }
                                }
                                if (data.source !== void 0) {
                                  let data219 = data.source;
                                  const _errs629 = errors;
                                  let valid102 = false;
                                  const _errs630 = errors;
                                  if (data219 && typeof data219 == "object" && !Array.isArray(data219)) {
                                    if (data219.role === void 0) {
                                      const err635 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                      if (vErrors === null) {
                                        vErrors = [err635];
                                      } else {
                                        vErrors.push(err635);
                                      }
                                      errors++;
                                    }
                                    if (data219.workerId === void 0) {
                                      const err636 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "workerId" }, message: "must have required property 'workerId'" };
                                      if (vErrors === null) {
                                        vErrors = [err636];
                                      } else {
                                        vErrors.push(err636);
                                      }
                                      errors++;
                                    }
                                    if (data219.generation === void 0) {
                                      const err637 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "generation" }, message: "must have required property 'generation'" };
                                      if (vErrors === null) {
                                        vErrors = [err637];
                                      } else {
                                        vErrors.push(err637);
                                      }
                                      errors++;
                                    }
                                    for (const key63 in data219) {
                                      if (!(key63 === "role" || key63 === "workerId" || key63 === "generation")) {
                                        const err638 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key63 }, message: "must NOT have additional properties" };
                                        if (vErrors === null) {
                                          vErrors = [err638];
                                        } else {
                                          vErrors.push(err638);
                                        }
                                        errors++;
                                      }
                                    }
                                    if (data219.role !== void 0) {
                                      let data220 = data219.role;
                                      if (typeof data220 !== "string") {
                                        const err639 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err639];
                                        } else {
                                          vErrors.push(err639);
                                        }
                                        errors++;
                                      }
                                      if ("worker" !== data220) {
                                        const err640 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/const", keyword: "const", params: { allowedValue: "worker" }, message: "must be equal to constant" };
                                        if (vErrors === null) {
                                          vErrors = [err640];
                                        } else {
                                          vErrors.push(err640);
                                        }
                                        errors++;
                                      }
                                    }
                                    if (data219.workerId !== void 0) {
                                      if (typeof data219.workerId !== "string") {
                                        const err641 = { instancePath: instancePath + "/source/workerId", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/workerId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err641];
                                        } else {
                                          vErrors.push(err641);
                                        }
                                        errors++;
                                      }
                                    }
                                    if (data219.generation !== void 0) {
                                      if (typeof data219.generation !== "string") {
                                        const err642 = { instancePath: instancePath + "/source/generation", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/generation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err642];
                                        } else {
                                          vErrors.push(err642);
                                        }
                                        errors++;
                                      }
                                    }
                                  } else {
                                    const err643 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                    if (vErrors === null) {
                                      vErrors = [err643];
                                    } else {
                                      vErrors.push(err643);
                                    }
                                    errors++;
                                  }
                                  var _valid14 = _errs630 === errors;
                                  valid102 = valid102 || _valid14;
                                  if (!valid102) {
                                    const _errs639 = errors;
                                    if (data219 && typeof data219 == "object" && !Array.isArray(data219)) {
                                      if (data219.role === void 0) {
                                        const err644 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                        if (vErrors === null) {
                                          vErrors = [err644];
                                        } else {
                                          vErrors.push(err644);
                                        }
                                        errors++;
                                      }
                                      if (data219.externalId === void 0) {
                                        const err645 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "externalId" }, message: "must have required property 'externalId'" };
                                        if (vErrors === null) {
                                          vErrors = [err645];
                                        } else {
                                          vErrors.push(err645);
                                        }
                                        errors++;
                                      }
                                      for (const key64 in data219) {
                                        if (!(key64 === "role" || key64 === "externalId")) {
                                          const err646 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key64 }, message: "must NOT have additional properties" };
                                          if (vErrors === null) {
                                            vErrors = [err646];
                                          } else {
                                            vErrors.push(err646);
                                          }
                                          errors++;
                                        }
                                      }
                                      if (data219.role !== void 0) {
                                        let data223 = data219.role;
                                        if (typeof data223 !== "string") {
                                          const err647 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                          if (vErrors === null) {
                                            vErrors = [err647];
                                          } else {
                                            vErrors.push(err647);
                                          }
                                          errors++;
                                        }
                                        if ("external" !== data223) {
                                          const err648 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/const", keyword: "const", params: { allowedValue: "external" }, message: "must be equal to constant" };
                                          if (vErrors === null) {
                                            vErrors = [err648];
                                          } else {
                                            vErrors.push(err648);
                                          }
                                          errors++;
                                        }
                                      }
                                      if (data219.externalId !== void 0) {
                                        if (typeof data219.externalId !== "string") {
                                          const err649 = { instancePath: instancePath + "/source/externalId", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/externalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                          if (vErrors === null) {
                                            vErrors = [err649];
                                          } else {
                                            vErrors.push(err649);
                                          }
                                          errors++;
                                        }
                                      }
                                    } else {
                                      const err650 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                      if (vErrors === null) {
                                        vErrors = [err650];
                                      } else {
                                        vErrors.push(err650);
                                      }
                                      errors++;
                                    }
                                    var _valid14 = _errs639 === errors;
                                    valid102 = valid102 || _valid14;
                                    if (!valid102) {
                                      const _errs646 = errors;
                                      if (data219 && typeof data219 == "object" && !Array.isArray(data219)) {
                                        if (data219.role === void 0) {
                                          const err651 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                          if (vErrors === null) {
                                            vErrors = [err651];
                                          } else {
                                            vErrors.push(err651);
                                          }
                                          errors++;
                                        }
                                        for (const key65 in data219) {
                                          if (!(key65 === "role")) {
                                            const err652 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key65 }, message: "must NOT have additional properties" };
                                            if (vErrors === null) {
                                              vErrors = [err652];
                                            } else {
                                              vErrors.push(err652);
                                            }
                                            errors++;
                                          }
                                        }
                                        if (data219.role !== void 0) {
                                          let data225 = data219.role;
                                          if (typeof data225 !== "string") {
                                            const err653 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                            if (vErrors === null) {
                                              vErrors = [err653];
                                            } else {
                                              vErrors.push(err653);
                                            }
                                            errors++;
                                          }
                                          if ("supervisor" !== data225) {
                                            const err654 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/const", keyword: "const", params: { allowedValue: "supervisor" }, message: "must be equal to constant" };
                                            if (vErrors === null) {
                                              vErrors = [err654];
                                            } else {
                                              vErrors.push(err654);
                                            }
                                            errors++;
                                          }
                                        }
                                      } else {
                                        const err655 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                        if (vErrors === null) {
                                          vErrors = [err655];
                                        } else {
                                          vErrors.push(err655);
                                        }
                                        errors++;
                                      }
                                      var _valid14 = _errs646 === errors;
                                      valid102 = valid102 || _valid14;
                                    }
                                  }
                                  if (!valid102) {
                                    const err656 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                                    if (vErrors === null) {
                                      vErrors = [err656];
                                    } else {
                                      vErrors.push(err656);
                                    }
                                    errors++;
                                  } else {
                                    errors = _errs629;
                                    if (vErrors !== null) {
                                      if (_errs629) {
                                        vErrors.length = _errs629;
                                      } else {
                                        vErrors = null;
                                      }
                                    }
                                  }
                                }
                                if (data.target !== void 0) {
                                  let data226 = data.target;
                                  if (typeof data226 !== "string") {
                                    const err657 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err657];
                                    } else {
                                      vErrors.push(err657);
                                    }
                                    errors++;
                                  }
                                  if (!(data226 === "supervisor" || data226 === "worker")) {
                                    const err658 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
                                    if (vErrors === null) {
                                      vErrors = [err658];
                                    } else {
                                      vErrors.push(err658);
                                    }
                                    errors++;
                                  }
                                }
                                if (data.payload !== void 0) {
                                  let data227 = data.payload;
                                  if (data227 && typeof data227 == "object" && !Array.isArray(data227)) {
                                    if (data227.action === void 0) {
                                      const err659 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/12/properties/payload/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
                                      if (vErrors === null) {
                                        vErrors = [err659];
                                      } else {
                                        vErrors.push(err659);
                                      }
                                      errors++;
                                    }
                                    for (const key66 in data227) {
                                      if (!(key66 === "action")) {
                                        const err660 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/12/properties/payload/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key66 }, message: "must NOT have additional properties" };
                                        if (vErrors === null) {
                                          vErrors = [err660];
                                        } else {
                                          vErrors.push(err660);
                                        }
                                        errors++;
                                      }
                                    }
                                    if (data227.action !== void 0) {
                                      let data228 = data227.action;
                                      if (typeof data228 !== "string") {
                                        const err661 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/12/properties/payload/properties/action/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err661];
                                        } else {
                                          vErrors.push(err661);
                                        }
                                        errors++;
                                      }
                                      if ("started" !== data228) {
                                        const err662 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/12/properties/payload/properties/action/const", keyword: "const", params: { allowedValue: "started" }, message: "must be equal to constant" };
                                        if (vErrors === null) {
                                          vErrors = [err662];
                                        } else {
                                          vErrors.push(err662);
                                        }
                                        errors++;
                                      }
                                    }
                                  } else {
                                    const err663 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/12/properties/payload/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                    if (vErrors === null) {
                                      vErrors = [err663];
                                    } else {
                                      vErrors.push(err663);
                                    }
                                    errors++;
                                  }
                                }
                                if (data.sentAt !== void 0) {
                                  if (typeof data.sentAt !== "string") {
                                    const err664 = { instancePath: instancePath + "/sentAt", schemaPath: "#/anyOf/12/properties/sentAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                    if (vErrors === null) {
                                      vErrors = [err664];
                                    } else {
                                      vErrors.push(err664);
                                    }
                                    errors++;
                                  }
                                }
                              } else {
                                const err665 = { instancePath, schemaPath: "#/anyOf/12/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                if (vErrors === null) {
                                  vErrors = [err665];
                                } else {
                                  vErrors.push(err665);
                                }
                                errors++;
                              }
                              var _valid0 = _errs618 === errors;
                              valid0 = valid0 || _valid0;
                              if (!valid0) {
                                const _errs661 = errors;
                                if (data && typeof data == "object" && !Array.isArray(data)) {
                                  if (data.id === void 0) {
                                    const err666 = { instancePath, schemaPath: "#/anyOf/13/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                                    if (vErrors === null) {
                                      vErrors = [err666];
                                    } else {
                                      vErrors.push(err666);
                                    }
                                    errors++;
                                  }
                                  if (data.name === void 0) {
                                    const err667 = { instancePath, schemaPath: "#/anyOf/13/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
                                    if (vErrors === null) {
                                      vErrors = [err667];
                                    } else {
                                      vErrors.push(err667);
                                    }
                                    errors++;
                                  }
                                  if (data.type === void 0) {
                                    const err668 = { instancePath, schemaPath: "#/anyOf/13/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                                    if (vErrors === null) {
                                      vErrors = [err668];
                                    } else {
                                      vErrors.push(err668);
                                    }
                                    errors++;
                                  }
                                  if (data.source === void 0) {
                                    const err669 = { instancePath, schemaPath: "#/anyOf/13/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                                    if (vErrors === null) {
                                      vErrors = [err669];
                                    } else {
                                      vErrors.push(err669);
                                    }
                                    errors++;
                                  }
                                  if (data.target === void 0) {
                                    const err670 = { instancePath, schemaPath: "#/anyOf/13/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                                    if (vErrors === null) {
                                      vErrors = [err670];
                                    } else {
                                      vErrors.push(err670);
                                    }
                                    errors++;
                                  }
                                  if (data.payload === void 0) {
                                    const err671 = { instancePath, schemaPath: "#/anyOf/13/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
                                    if (vErrors === null) {
                                      vErrors = [err671];
                                    } else {
                                      vErrors.push(err671);
                                    }
                                    errors++;
                                  }
                                  if (data.sentAt === void 0) {
                                    const err672 = { instancePath, schemaPath: "#/anyOf/13/required", keyword: "required", params: { missingProperty: "sentAt" }, message: "must have required property 'sentAt'" };
                                    if (vErrors === null) {
                                      vErrors = [err672];
                                    } else {
                                      vErrors.push(err672);
                                    }
                                    errors++;
                                  }
                                  for (const key67 in data) {
                                    if (!(key67 === "id" || key67 === "name" || key67 === "type" || key67 === "source" || key67 === "target" || key67 === "payload" || key67 === "sentAt")) {
                                      const err673 = { instancePath, schemaPath: "#/anyOf/13/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key67 }, message: "must NOT have additional properties" };
                                      if (vErrors === null) {
                                        vErrors = [err673];
                                      } else {
                                        vErrors.push(err673);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data.id !== void 0) {
                                    if (typeof data.id !== "string") {
                                      const err674 = { instancePath: instancePath + "/id", schemaPath: "#/anyOf/13/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err674];
                                      } else {
                                        vErrors.push(err674);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data.name !== void 0) {
                                    if (typeof data.name !== "string") {
                                      const err675 = { instancePath: instancePath + "/name", schemaPath: "#/anyOf/13/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err675];
                                      } else {
                                        vErrors.push(err675);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data.type !== void 0) {
                                    let data232 = data.type;
                                    if (typeof data232 !== "string") {
                                      const err676 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/13/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err676];
                                      } else {
                                        vErrors.push(err676);
                                      }
                                      errors++;
                                    }
                                    if ("lifecycle" !== data232) {
                                      const err677 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/13/properties/type/const", keyword: "const", params: { allowedValue: "lifecycle" }, message: "must be equal to constant" };
                                      if (vErrors === null) {
                                        vErrors = [err677];
                                      } else {
                                        vErrors.push(err677);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data.source !== void 0) {
                                    let data233 = data.source;
                                    const _errs672 = errors;
                                    let valid110 = false;
                                    const _errs673 = errors;
                                    if (data233 && typeof data233 == "object" && !Array.isArray(data233)) {
                                      if (data233.role === void 0) {
                                        const err678 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                        if (vErrors === null) {
                                          vErrors = [err678];
                                        } else {
                                          vErrors.push(err678);
                                        }
                                        errors++;
                                      }
                                      if (data233.workerId === void 0) {
                                        const err679 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "workerId" }, message: "must have required property 'workerId'" };
                                        if (vErrors === null) {
                                          vErrors = [err679];
                                        } else {
                                          vErrors.push(err679);
                                        }
                                        errors++;
                                      }
                                      if (data233.generation === void 0) {
                                        const err680 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "generation" }, message: "must have required property 'generation'" };
                                        if (vErrors === null) {
                                          vErrors = [err680];
                                        } else {
                                          vErrors.push(err680);
                                        }
                                        errors++;
                                      }
                                      for (const key68 in data233) {
                                        if (!(key68 === "role" || key68 === "workerId" || key68 === "generation")) {
                                          const err681 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key68 }, message: "must NOT have additional properties" };
                                          if (vErrors === null) {
                                            vErrors = [err681];
                                          } else {
                                            vErrors.push(err681);
                                          }
                                          errors++;
                                        }
                                      }
                                      if (data233.role !== void 0) {
                                        let data234 = data233.role;
                                        if (typeof data234 !== "string") {
                                          const err682 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                          if (vErrors === null) {
                                            vErrors = [err682];
                                          } else {
                                            vErrors.push(err682);
                                          }
                                          errors++;
                                        }
                                        if ("worker" !== data234) {
                                          const err683 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/const", keyword: "const", params: { allowedValue: "worker" }, message: "must be equal to constant" };
                                          if (vErrors === null) {
                                            vErrors = [err683];
                                          } else {
                                            vErrors.push(err683);
                                          }
                                          errors++;
                                        }
                                      }
                                      if (data233.workerId !== void 0) {
                                        if (typeof data233.workerId !== "string") {
                                          const err684 = { instancePath: instancePath + "/source/workerId", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/workerId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                          if (vErrors === null) {
                                            vErrors = [err684];
                                          } else {
                                            vErrors.push(err684);
                                          }
                                          errors++;
                                        }
                                      }
                                      if (data233.generation !== void 0) {
                                        if (typeof data233.generation !== "string") {
                                          const err685 = { instancePath: instancePath + "/source/generation", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/generation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                          if (vErrors === null) {
                                            vErrors = [err685];
                                          } else {
                                            vErrors.push(err685);
                                          }
                                          errors++;
                                        }
                                      }
                                    } else {
                                      const err686 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                      if (vErrors === null) {
                                        vErrors = [err686];
                                      } else {
                                        vErrors.push(err686);
                                      }
                                      errors++;
                                    }
                                    var _valid15 = _errs673 === errors;
                                    valid110 = valid110 || _valid15;
                                    if (!valid110) {
                                      const _errs682 = errors;
                                      if (data233 && typeof data233 == "object" && !Array.isArray(data233)) {
                                        if (data233.role === void 0) {
                                          const err687 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                          if (vErrors === null) {
                                            vErrors = [err687];
                                          } else {
                                            vErrors.push(err687);
                                          }
                                          errors++;
                                        }
                                        if (data233.externalId === void 0) {
                                          const err688 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "externalId" }, message: "must have required property 'externalId'" };
                                          if (vErrors === null) {
                                            vErrors = [err688];
                                          } else {
                                            vErrors.push(err688);
                                          }
                                          errors++;
                                        }
                                        for (const key69 in data233) {
                                          if (!(key69 === "role" || key69 === "externalId")) {
                                            const err689 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key69 }, message: "must NOT have additional properties" };
                                            if (vErrors === null) {
                                              vErrors = [err689];
                                            } else {
                                              vErrors.push(err689);
                                            }
                                            errors++;
                                          }
                                        }
                                        if (data233.role !== void 0) {
                                          let data237 = data233.role;
                                          if (typeof data237 !== "string") {
                                            const err690 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                            if (vErrors === null) {
                                              vErrors = [err690];
                                            } else {
                                              vErrors.push(err690);
                                            }
                                            errors++;
                                          }
                                          if ("external" !== data237) {
                                            const err691 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/const", keyword: "const", params: { allowedValue: "external" }, message: "must be equal to constant" };
                                            if (vErrors === null) {
                                              vErrors = [err691];
                                            } else {
                                              vErrors.push(err691);
                                            }
                                            errors++;
                                          }
                                        }
                                        if (data233.externalId !== void 0) {
                                          if (typeof data233.externalId !== "string") {
                                            const err692 = { instancePath: instancePath + "/source/externalId", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/externalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                            if (vErrors === null) {
                                              vErrors = [err692];
                                            } else {
                                              vErrors.push(err692);
                                            }
                                            errors++;
                                          }
                                        }
                                      } else {
                                        const err693 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                        if (vErrors === null) {
                                          vErrors = [err693];
                                        } else {
                                          vErrors.push(err693);
                                        }
                                        errors++;
                                      }
                                      var _valid15 = _errs682 === errors;
                                      valid110 = valid110 || _valid15;
                                      if (!valid110) {
                                        const _errs689 = errors;
                                        if (data233 && typeof data233 == "object" && !Array.isArray(data233)) {
                                          if (data233.role === void 0) {
                                            const err694 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                            if (vErrors === null) {
                                              vErrors = [err694];
                                            } else {
                                              vErrors.push(err694);
                                            }
                                            errors++;
                                          }
                                          for (const key70 in data233) {
                                            if (!(key70 === "role")) {
                                              const err695 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key70 }, message: "must NOT have additional properties" };
                                              if (vErrors === null) {
                                                vErrors = [err695];
                                              } else {
                                                vErrors.push(err695);
                                              }
                                              errors++;
                                            }
                                          }
                                          if (data233.role !== void 0) {
                                            let data239 = data233.role;
                                            if (typeof data239 !== "string") {
                                              const err696 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                              if (vErrors === null) {
                                                vErrors = [err696];
                                              } else {
                                                vErrors.push(err696);
                                              }
                                              errors++;
                                            }
                                            if ("supervisor" !== data239) {
                                              const err697 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/const", keyword: "const", params: { allowedValue: "supervisor" }, message: "must be equal to constant" };
                                              if (vErrors === null) {
                                                vErrors = [err697];
                                              } else {
                                                vErrors.push(err697);
                                              }
                                              errors++;
                                            }
                                          }
                                        } else {
                                          const err698 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                          if (vErrors === null) {
                                            vErrors = [err698];
                                          } else {
                                            vErrors.push(err698);
                                          }
                                          errors++;
                                        }
                                        var _valid15 = _errs689 === errors;
                                        valid110 = valid110 || _valid15;
                                      }
                                    }
                                    if (!valid110) {
                                      const err699 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                                      if (vErrors === null) {
                                        vErrors = [err699];
                                      } else {
                                        vErrors.push(err699);
                                      }
                                      errors++;
                                    } else {
                                      errors = _errs672;
                                      if (vErrors !== null) {
                                        if (_errs672) {
                                          vErrors.length = _errs672;
                                        } else {
                                          vErrors = null;
                                        }
                                      }
                                    }
                                  }
                                  if (data.target !== void 0) {
                                    let data240 = data.target;
                                    if (typeof data240 !== "string") {
                                      const err700 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err700];
                                      } else {
                                        vErrors.push(err700);
                                      }
                                      errors++;
                                    }
                                    if (!(data240 === "supervisor" || data240 === "worker")) {
                                      const err701 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
                                      if (vErrors === null) {
                                        vErrors = [err701];
                                      } else {
                                        vErrors.push(err701);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data.payload !== void 0) {
                                    let data241 = data.payload;
                                    if (data241 && typeof data241 == "object" && !Array.isArray(data241)) {
                                      if (data241.action === void 0) {
                                        const err702 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/13/properties/payload/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
                                        if (vErrors === null) {
                                          vErrors = [err702];
                                        } else {
                                          vErrors.push(err702);
                                        }
                                        errors++;
                                      }
                                      if (data241.outcome === void 0) {
                                        const err703 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/13/properties/payload/required", keyword: "required", params: { missingProperty: "outcome" }, message: "must have required property 'outcome'" };
                                        if (vErrors === null) {
                                          vErrors = [err703];
                                        } else {
                                          vErrors.push(err703);
                                        }
                                        errors++;
                                      }
                                      for (const key71 in data241) {
                                        if (!(key71 === "action" || key71 === "outcome")) {
                                          const err704 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/13/properties/payload/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key71 }, message: "must NOT have additional properties" };
                                          if (vErrors === null) {
                                            vErrors = [err704];
                                          } else {
                                            vErrors.push(err704);
                                          }
                                          errors++;
                                        }
                                      }
                                      if (data241.action !== void 0) {
                                        let data242 = data241.action;
                                        if (typeof data242 !== "string") {
                                          const err705 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/13/properties/payload/properties/action/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                          if (vErrors === null) {
                                            vErrors = [err705];
                                          } else {
                                            vErrors.push(err705);
                                          }
                                          errors++;
                                        }
                                        if ("exited" !== data242) {
                                          const err706 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/13/properties/payload/properties/action/const", keyword: "const", params: { allowedValue: "exited" }, message: "must be equal to constant" };
                                          if (vErrors === null) {
                                            vErrors = [err706];
                                          } else {
                                            vErrors.push(err706);
                                          }
                                          errors++;
                                        }
                                      }
                                      if (data241.outcome !== void 0) {
                                        let data243 = data241.outcome;
                                        if (typeof data243 !== "string") {
                                          const err707 = { instancePath: instancePath + "/payload/outcome", schemaPath: "#/anyOf/13/properties/payload/properties/outcome/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                          if (vErrors === null) {
                                            vErrors = [err707];
                                          } else {
                                            vErrors.push(err707);
                                          }
                                          errors++;
                                        }
                                        if (!(data243 === "normal" || data243 === "unexpected")) {
                                          const err708 = { instancePath: instancePath + "/payload/outcome", schemaPath: "#/anyOf/13/properties/payload/properties/outcome/enum", keyword: "enum", params: { allowedValues: schema12.anyOf[13].properties.payload.properties.outcome.enum }, message: "must be equal to one of the allowed values" };
                                          if (vErrors === null) {
                                            vErrors = [err708];
                                          } else {
                                            vErrors.push(err708);
                                          }
                                          errors++;
                                        }
                                      }
                                    } else {
                                      const err709 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/13/properties/payload/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                      if (vErrors === null) {
                                        vErrors = [err709];
                                      } else {
                                        vErrors.push(err709);
                                      }
                                      errors++;
                                    }
                                  }
                                  if (data.sentAt !== void 0) {
                                    if (typeof data.sentAt !== "string") {
                                      const err710 = { instancePath: instancePath + "/sentAt", schemaPath: "#/anyOf/13/properties/sentAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                      if (vErrors === null) {
                                        vErrors = [err710];
                                      } else {
                                        vErrors.push(err710);
                                      }
                                      errors++;
                                    }
                                  }
                                } else {
                                  const err711 = { instancePath, schemaPath: "#/anyOf/13/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                  if (vErrors === null) {
                                    vErrors = [err711];
                                  } else {
                                    vErrors.push(err711);
                                  }
                                  errors++;
                                }
                                var _valid0 = _errs661 === errors;
                                valid0 = valid0 || _valid0;
                                if (!valid0) {
                                  const _errs706 = errors;
                                  if (data && typeof data == "object" && !Array.isArray(data)) {
                                    if (data.id === void 0) {
                                      const err712 = { instancePath, schemaPath: "#/anyOf/14/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                                      if (vErrors === null) {
                                        vErrors = [err712];
                                      } else {
                                        vErrors.push(err712);
                                      }
                                      errors++;
                                    }
                                    if (data.name === void 0) {
                                      const err713 = { instancePath, schemaPath: "#/anyOf/14/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
                                      if (vErrors === null) {
                                        vErrors = [err713];
                                      } else {
                                        vErrors.push(err713);
                                      }
                                      errors++;
                                    }
                                    if (data.type === void 0) {
                                      const err714 = { instancePath, schemaPath: "#/anyOf/14/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                                      if (vErrors === null) {
                                        vErrors = [err714];
                                      } else {
                                        vErrors.push(err714);
                                      }
                                      errors++;
                                    }
                                    if (data.source === void 0) {
                                      const err715 = { instancePath, schemaPath: "#/anyOf/14/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                                      if (vErrors === null) {
                                        vErrors = [err715];
                                      } else {
                                        vErrors.push(err715);
                                      }
                                      errors++;
                                    }
                                    if (data.target === void 0) {
                                      const err716 = { instancePath, schemaPath: "#/anyOf/14/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                                      if (vErrors === null) {
                                        vErrors = [err716];
                                      } else {
                                        vErrors.push(err716);
                                      }
                                      errors++;
                                    }
                                    if (data.payload === void 0) {
                                      const err717 = { instancePath, schemaPath: "#/anyOf/14/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
                                      if (vErrors === null) {
                                        vErrors = [err717];
                                      } else {
                                        vErrors.push(err717);
                                      }
                                      errors++;
                                    }
                                    if (data.sentAt === void 0) {
                                      const err718 = { instancePath, schemaPath: "#/anyOf/14/required", keyword: "required", params: { missingProperty: "sentAt" }, message: "must have required property 'sentAt'" };
                                      if (vErrors === null) {
                                        vErrors = [err718];
                                      } else {
                                        vErrors.push(err718);
                                      }
                                      errors++;
                                    }
                                    for (const key72 in data) {
                                      if (!(key72 === "id" || key72 === "name" || key72 === "type" || key72 === "source" || key72 === "target" || key72 === "payload" || key72 === "sentAt" || key72 === "goalId")) {
                                        const err719 = { instancePath, schemaPath: "#/anyOf/14/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key72 }, message: "must NOT have additional properties" };
                                        if (vErrors === null) {
                                          vErrors = [err719];
                                        } else {
                                          vErrors.push(err719);
                                        }
                                        errors++;
                                      }
                                    }
                                    if (data.id !== void 0) {
                                      if (typeof data.id !== "string") {
                                        const err720 = { instancePath: instancePath + "/id", schemaPath: "#/anyOf/14/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err720];
                                        } else {
                                          vErrors.push(err720);
                                        }
                                        errors++;
                                      }
                                    }
                                    if (data.name !== void 0) {
                                      if (typeof data.name !== "string") {
                                        const err721 = { instancePath: instancePath + "/name", schemaPath: "#/anyOf/14/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err721];
                                        } else {
                                          vErrors.push(err721);
                                        }
                                        errors++;
                                      }
                                    }
                                    if (data.type !== void 0) {
                                      let data247 = data.type;
                                      if (typeof data247 !== "string") {
                                        const err722 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/14/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err722];
                                        } else {
                                          vErrors.push(err722);
                                        }
                                        errors++;
                                      }
                                      if ("collaboration" !== data247) {
                                        const err723 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/14/properties/type/const", keyword: "const", params: { allowedValue: "collaboration" }, message: "must be equal to constant" };
                                        if (vErrors === null) {
                                          vErrors = [err723];
                                        } else {
                                          vErrors.push(err723);
                                        }
                                        errors++;
                                      }
                                    }
                                    if (data.source !== void 0) {
                                      let data248 = data.source;
                                      const _errs717 = errors;
                                      let valid118 = false;
                                      const _errs718 = errors;
                                      if (data248 && typeof data248 == "object" && !Array.isArray(data248)) {
                                        if (data248.role === void 0) {
                                          const err724 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                          if (vErrors === null) {
                                            vErrors = [err724];
                                          } else {
                                            vErrors.push(err724);
                                          }
                                          errors++;
                                        }
                                        if (data248.workerId === void 0) {
                                          const err725 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "workerId" }, message: "must have required property 'workerId'" };
                                          if (vErrors === null) {
                                            vErrors = [err725];
                                          } else {
                                            vErrors.push(err725);
                                          }
                                          errors++;
                                        }
                                        if (data248.generation === void 0) {
                                          const err726 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "generation" }, message: "must have required property 'generation'" };
                                          if (vErrors === null) {
                                            vErrors = [err726];
                                          } else {
                                            vErrors.push(err726);
                                          }
                                          errors++;
                                        }
                                        for (const key73 in data248) {
                                          if (!(key73 === "role" || key73 === "workerId" || key73 === "generation")) {
                                            const err727 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key73 }, message: "must NOT have additional properties" };
                                            if (vErrors === null) {
                                              vErrors = [err727];
                                            } else {
                                              vErrors.push(err727);
                                            }
                                            errors++;
                                          }
                                        }
                                        if (data248.role !== void 0) {
                                          let data249 = data248.role;
                                          if (typeof data249 !== "string") {
                                            const err728 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                            if (vErrors === null) {
                                              vErrors = [err728];
                                            } else {
                                              vErrors.push(err728);
                                            }
                                            errors++;
                                          }
                                          if ("worker" !== data249) {
                                            const err729 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/const", keyword: "const", params: { allowedValue: "worker" }, message: "must be equal to constant" };
                                            if (vErrors === null) {
                                              vErrors = [err729];
                                            } else {
                                              vErrors.push(err729);
                                            }
                                            errors++;
                                          }
                                        }
                                        if (data248.workerId !== void 0) {
                                          if (typeof data248.workerId !== "string") {
                                            const err730 = { instancePath: instancePath + "/source/workerId", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/workerId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                            if (vErrors === null) {
                                              vErrors = [err730];
                                            } else {
                                              vErrors.push(err730);
                                            }
                                            errors++;
                                          }
                                        }
                                        if (data248.generation !== void 0) {
                                          if (typeof data248.generation !== "string") {
                                            const err731 = { instancePath: instancePath + "/source/generation", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/generation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                            if (vErrors === null) {
                                              vErrors = [err731];
                                            } else {
                                              vErrors.push(err731);
                                            }
                                            errors++;
                                          }
                                        }
                                      } else {
                                        const err732 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                        if (vErrors === null) {
                                          vErrors = [err732];
                                        } else {
                                          vErrors.push(err732);
                                        }
                                        errors++;
                                      }
                                      var _valid16 = _errs718 === errors;
                                      valid118 = valid118 || _valid16;
                                      if (!valid118) {
                                        const _errs727 = errors;
                                        if (data248 && typeof data248 == "object" && !Array.isArray(data248)) {
                                          if (data248.role === void 0) {
                                            const err733 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                            if (vErrors === null) {
                                              vErrors = [err733];
                                            } else {
                                              vErrors.push(err733);
                                            }
                                            errors++;
                                          }
                                          if (data248.externalId === void 0) {
                                            const err734 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "externalId" }, message: "must have required property 'externalId'" };
                                            if (vErrors === null) {
                                              vErrors = [err734];
                                            } else {
                                              vErrors.push(err734);
                                            }
                                            errors++;
                                          }
                                          for (const key74 in data248) {
                                            if (!(key74 === "role" || key74 === "externalId")) {
                                              const err735 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key74 }, message: "must NOT have additional properties" };
                                              if (vErrors === null) {
                                                vErrors = [err735];
                                              } else {
                                                vErrors.push(err735);
                                              }
                                              errors++;
                                            }
                                          }
                                          if (data248.role !== void 0) {
                                            let data252 = data248.role;
                                            if (typeof data252 !== "string") {
                                              const err736 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                              if (vErrors === null) {
                                                vErrors = [err736];
                                              } else {
                                                vErrors.push(err736);
                                              }
                                              errors++;
                                            }
                                            if ("external" !== data252) {
                                              const err737 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/const", keyword: "const", params: { allowedValue: "external" }, message: "must be equal to constant" };
                                              if (vErrors === null) {
                                                vErrors = [err737];
                                              } else {
                                                vErrors.push(err737);
                                              }
                                              errors++;
                                            }
                                          }
                                          if (data248.externalId !== void 0) {
                                            if (typeof data248.externalId !== "string") {
                                              const err738 = { instancePath: instancePath + "/source/externalId", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/externalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                              if (vErrors === null) {
                                                vErrors = [err738];
                                              } else {
                                                vErrors.push(err738);
                                              }
                                              errors++;
                                            }
                                          }
                                        } else {
                                          const err739 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                          if (vErrors === null) {
                                            vErrors = [err739];
                                          } else {
                                            vErrors.push(err739);
                                          }
                                          errors++;
                                        }
                                        var _valid16 = _errs727 === errors;
                                        valid118 = valid118 || _valid16;
                                        if (!valid118) {
                                          const _errs734 = errors;
                                          if (data248 && typeof data248 == "object" && !Array.isArray(data248)) {
                                            if (data248.role === void 0) {
                                              const err740 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                              if (vErrors === null) {
                                                vErrors = [err740];
                                              } else {
                                                vErrors.push(err740);
                                              }
                                              errors++;
                                            }
                                            for (const key75 in data248) {
                                              if (!(key75 === "role")) {
                                                const err741 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key75 }, message: "must NOT have additional properties" };
                                                if (vErrors === null) {
                                                  vErrors = [err741];
                                                } else {
                                                  vErrors.push(err741);
                                                }
                                                errors++;
                                              }
                                            }
                                            if (data248.role !== void 0) {
                                              let data254 = data248.role;
                                              if (typeof data254 !== "string") {
                                                const err742 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                                if (vErrors === null) {
                                                  vErrors = [err742];
                                                } else {
                                                  vErrors.push(err742);
                                                }
                                                errors++;
                                              }
                                              if ("supervisor" !== data254) {
                                                const err743 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/const", keyword: "const", params: { allowedValue: "supervisor" }, message: "must be equal to constant" };
                                                if (vErrors === null) {
                                                  vErrors = [err743];
                                                } else {
                                                  vErrors.push(err743);
                                                }
                                                errors++;
                                              }
                                            }
                                          } else {
                                            const err744 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                            if (vErrors === null) {
                                              vErrors = [err744];
                                            } else {
                                              vErrors.push(err744);
                                            }
                                            errors++;
                                          }
                                          var _valid16 = _errs734 === errors;
                                          valid118 = valid118 || _valid16;
                                        }
                                      }
                                      if (!valid118) {
                                        const err745 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                                        if (vErrors === null) {
                                          vErrors = [err745];
                                        } else {
                                          vErrors.push(err745);
                                        }
                                        errors++;
                                      } else {
                                        errors = _errs717;
                                        if (vErrors !== null) {
                                          if (_errs717) {
                                            vErrors.length = _errs717;
                                          } else {
                                            vErrors = null;
                                          }
                                        }
                                      }
                                    }
                                    if (data.target !== void 0) {
                                      let data255 = data.target;
                                      if (typeof data255 !== "string") {
                                        const err746 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err746];
                                        } else {
                                          vErrors.push(err746);
                                        }
                                        errors++;
                                      }
                                      if (!(data255 === "supervisor" || data255 === "worker")) {
                                        const err747 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
                                        if (vErrors === null) {
                                          vErrors = [err747];
                                        } else {
                                          vErrors.push(err747);
                                        }
                                        errors++;
                                      }
                                    }
                                    if (data.payload !== void 0) {
                                      let data256 = data.payload;
                                      if (data256 && typeof data256 == "object" && !Array.isArray(data256)) {
                                        if (data256.action === void 0) {
                                          const err748 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/14/properties/payload/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
                                          if (vErrors === null) {
                                            vErrors = [err748];
                                          } else {
                                            vErrors.push(err748);
                                          }
                                          errors++;
                                        }
                                        for (const key76 in data256) {
                                          if (!(key76 === "action")) {
                                            const err749 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/14/properties/payload/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key76 }, message: "must NOT have additional properties" };
                                            if (vErrors === null) {
                                              vErrors = [err749];
                                            } else {
                                              vErrors.push(err749);
                                            }
                                            errors++;
                                          }
                                        }
                                        if (data256.action !== void 0) {
                                          let data257 = data256.action;
                                          if (typeof data257 !== "string") {
                                            const err750 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/14/properties/payload/properties/action/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                            if (vErrors === null) {
                                              vErrors = [err750];
                                            } else {
                                              vErrors.push(err750);
                                            }
                                            errors++;
                                          }
                                          if ("requested" !== data257) {
                                            const err751 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/14/properties/payload/properties/action/const", keyword: "const", params: { allowedValue: "requested" }, message: "must be equal to constant" };
                                            if (vErrors === null) {
                                              vErrors = [err751];
                                            } else {
                                              vErrors.push(err751);
                                            }
                                            errors++;
                                          }
                                        }
                                      } else {
                                        const err752 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/14/properties/payload/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                        if (vErrors === null) {
                                          vErrors = [err752];
                                        } else {
                                          vErrors.push(err752);
                                        }
                                        errors++;
                                      }
                                    }
                                    if (data.sentAt !== void 0) {
                                      if (typeof data.sentAt !== "string") {
                                        const err753 = { instancePath: instancePath + "/sentAt", schemaPath: "#/anyOf/14/properties/sentAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err753];
                                        } else {
                                          vErrors.push(err753);
                                        }
                                        errors++;
                                      }
                                    }
                                    if (data.goalId !== void 0) {
                                      if (typeof data.goalId !== "string") {
                                        const err754 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/14/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                        if (vErrors === null) {
                                          vErrors = [err754];
                                        } else {
                                          vErrors.push(err754);
                                        }
                                        errors++;
                                      }
                                    }
                                  } else {
                                    const err755 = { instancePath, schemaPath: "#/anyOf/14/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                    if (vErrors === null) {
                                      vErrors = [err755];
                                    } else {
                                      vErrors.push(err755);
                                    }
                                    errors++;
                                  }
                                  var _valid0 = _errs706 === errors;
                                  valid0 = valid0 || _valid0;
                                  if (!valid0) {
                                    const _errs751 = errors;
                                    if (data && typeof data == "object" && !Array.isArray(data)) {
                                      if (data.id === void 0) {
                                        const err756 = { instancePath, schemaPath: "#/anyOf/15/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                                        if (vErrors === null) {
                                          vErrors = [err756];
                                        } else {
                                          vErrors.push(err756);
                                        }
                                        errors++;
                                      }
                                      if (data.name === void 0) {
                                        const err757 = { instancePath, schemaPath: "#/anyOf/15/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
                                        if (vErrors === null) {
                                          vErrors = [err757];
                                        } else {
                                          vErrors.push(err757);
                                        }
                                        errors++;
                                      }
                                      if (data.type === void 0) {
                                        const err758 = { instancePath, schemaPath: "#/anyOf/15/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                                        if (vErrors === null) {
                                          vErrors = [err758];
                                        } else {
                                          vErrors.push(err758);
                                        }
                                        errors++;
                                      }
                                      if (data.source === void 0) {
                                        const err759 = { instancePath, schemaPath: "#/anyOf/15/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                                        if (vErrors === null) {
                                          vErrors = [err759];
                                        } else {
                                          vErrors.push(err759);
                                        }
                                        errors++;
                                      }
                                      if (data.target === void 0) {
                                        const err760 = { instancePath, schemaPath: "#/anyOf/15/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                                        if (vErrors === null) {
                                          vErrors = [err760];
                                        } else {
                                          vErrors.push(err760);
                                        }
                                        errors++;
                                      }
                                      if (data.payload === void 0) {
                                        const err761 = { instancePath, schemaPath: "#/anyOf/15/required", keyword: "required", params: { missingProperty: "payload" }, message: "must have required property 'payload'" };
                                        if (vErrors === null) {
                                          vErrors = [err761];
                                        } else {
                                          vErrors.push(err761);
                                        }
                                        errors++;
                                      }
                                      if (data.sentAt === void 0) {
                                        const err762 = { instancePath, schemaPath: "#/anyOf/15/required", keyword: "required", params: { missingProperty: "sentAt" }, message: "must have required property 'sentAt'" };
                                        if (vErrors === null) {
                                          vErrors = [err762];
                                        } else {
                                          vErrors.push(err762);
                                        }
                                        errors++;
                                      }
                                      if (data.replyTo === void 0) {
                                        const err763 = { instancePath, schemaPath: "#/anyOf/15/required", keyword: "required", params: { missingProperty: "replyTo" }, message: "must have required property 'replyTo'" };
                                        if (vErrors === null) {
                                          vErrors = [err763];
                                        } else {
                                          vErrors.push(err763);
                                        }
                                        errors++;
                                      }
                                      for (const key77 in data) {
                                        if (!func2.call(schema12.anyOf[15].properties, key77)) {
                                          const err764 = { instancePath, schemaPath: "#/anyOf/15/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key77 }, message: "must NOT have additional properties" };
                                          if (vErrors === null) {
                                            vErrors = [err764];
                                          } else {
                                            vErrors.push(err764);
                                          }
                                          errors++;
                                        }
                                      }
                                      if (data.id !== void 0) {
                                        if (typeof data.id !== "string") {
                                          const err765 = { instancePath: instancePath + "/id", schemaPath: "#/anyOf/15/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                          if (vErrors === null) {
                                            vErrors = [err765];
                                          } else {
                                            vErrors.push(err765);
                                          }
                                          errors++;
                                        }
                                      }
                                      if (data.name !== void 0) {
                                        if (typeof data.name !== "string") {
                                          const err766 = { instancePath: instancePath + "/name", schemaPath: "#/anyOf/15/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                          if (vErrors === null) {
                                            vErrors = [err766];
                                          } else {
                                            vErrors.push(err766);
                                          }
                                          errors++;
                                        }
                                      }
                                      if (data.type !== void 0) {
                                        let data262 = data.type;
                                        if (typeof data262 !== "string") {
                                          const err767 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/15/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                          if (vErrors === null) {
                                            vErrors = [err767];
                                          } else {
                                            vErrors.push(err767);
                                          }
                                          errors++;
                                        }
                                        if ("collaboration" !== data262) {
                                          const err768 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/15/properties/type/const", keyword: "const", params: { allowedValue: "collaboration" }, message: "must be equal to constant" };
                                          if (vErrors === null) {
                                            vErrors = [err768];
                                          } else {
                                            vErrors.push(err768);
                                          }
                                          errors++;
                                        }
                                      }
                                      if (data.source !== void 0) {
                                        let data263 = data.source;
                                        const _errs762 = errors;
                                        let valid126 = false;
                                        const _errs763 = errors;
                                        if (data263 && typeof data263 == "object" && !Array.isArray(data263)) {
                                          if (data263.role === void 0) {
                                            const err769 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                            if (vErrors === null) {
                                              vErrors = [err769];
                                            } else {
                                              vErrors.push(err769);
                                            }
                                            errors++;
                                          }
                                          if (data263.workerId === void 0) {
                                            const err770 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "workerId" }, message: "must have required property 'workerId'" };
                                            if (vErrors === null) {
                                              vErrors = [err770];
                                            } else {
                                              vErrors.push(err770);
                                            }
                                            errors++;
                                          }
                                          if (data263.generation === void 0) {
                                            const err771 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/required", keyword: "required", params: { missingProperty: "generation" }, message: "must have required property 'generation'" };
                                            if (vErrors === null) {
                                              vErrors = [err771];
                                            } else {
                                              vErrors.push(err771);
                                            }
                                            errors++;
                                          }
                                          for (const key78 in data263) {
                                            if (!(key78 === "role" || key78 === "workerId" || key78 === "generation")) {
                                              const err772 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key78 }, message: "must NOT have additional properties" };
                                              if (vErrors === null) {
                                                vErrors = [err772];
                                              } else {
                                                vErrors.push(err772);
                                              }
                                              errors++;
                                            }
                                          }
                                          if (data263.role !== void 0) {
                                            let data264 = data263.role;
                                            if (typeof data264 !== "string") {
                                              const err773 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                              if (vErrors === null) {
                                                vErrors = [err773];
                                              } else {
                                                vErrors.push(err773);
                                              }
                                              errors++;
                                            }
                                            if ("worker" !== data264) {
                                              const err774 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/role/const", keyword: "const", params: { allowedValue: "worker" }, message: "must be equal to constant" };
                                              if (vErrors === null) {
                                                vErrors = [err774];
                                              } else {
                                                vErrors.push(err774);
                                              }
                                              errors++;
                                            }
                                          }
                                          if (data263.workerId !== void 0) {
                                            if (typeof data263.workerId !== "string") {
                                              const err775 = { instancePath: instancePath + "/source/workerId", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/workerId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                              if (vErrors === null) {
                                                vErrors = [err775];
                                              } else {
                                                vErrors.push(err775);
                                              }
                                              errors++;
                                            }
                                          }
                                          if (data263.generation !== void 0) {
                                            if (typeof data263.generation !== "string") {
                                              const err776 = { instancePath: instancePath + "/source/generation", schemaPath: "#/definitions/TriggerActor/anyOf/0/properties/generation/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                              if (vErrors === null) {
                                                vErrors = [err776];
                                              } else {
                                                vErrors.push(err776);
                                              }
                                              errors++;
                                            }
                                          }
                                        } else {
                                          const err777 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                          if (vErrors === null) {
                                            vErrors = [err777];
                                          } else {
                                            vErrors.push(err777);
                                          }
                                          errors++;
                                        }
                                        var _valid17 = _errs763 === errors;
                                        valid126 = valid126 || _valid17;
                                        if (!valid126) {
                                          const _errs772 = errors;
                                          if (data263 && typeof data263 == "object" && !Array.isArray(data263)) {
                                            if (data263.role === void 0) {
                                              const err778 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                              if (vErrors === null) {
                                                vErrors = [err778];
                                              } else {
                                                vErrors.push(err778);
                                              }
                                              errors++;
                                            }
                                            if (data263.externalId === void 0) {
                                              const err779 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/required", keyword: "required", params: { missingProperty: "externalId" }, message: "must have required property 'externalId'" };
                                              if (vErrors === null) {
                                                vErrors = [err779];
                                              } else {
                                                vErrors.push(err779);
                                              }
                                              errors++;
                                            }
                                            for (const key79 in data263) {
                                              if (!(key79 === "role" || key79 === "externalId")) {
                                                const err780 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key79 }, message: "must NOT have additional properties" };
                                                if (vErrors === null) {
                                                  vErrors = [err780];
                                                } else {
                                                  vErrors.push(err780);
                                                }
                                                errors++;
                                              }
                                            }
                                            if (data263.role !== void 0) {
                                              let data267 = data263.role;
                                              if (typeof data267 !== "string") {
                                                const err781 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                                if (vErrors === null) {
                                                  vErrors = [err781];
                                                } else {
                                                  vErrors.push(err781);
                                                }
                                                errors++;
                                              }
                                              if ("external" !== data267) {
                                                const err782 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/role/const", keyword: "const", params: { allowedValue: "external" }, message: "must be equal to constant" };
                                                if (vErrors === null) {
                                                  vErrors = [err782];
                                                } else {
                                                  vErrors.push(err782);
                                                }
                                                errors++;
                                              }
                                            }
                                            if (data263.externalId !== void 0) {
                                              if (typeof data263.externalId !== "string") {
                                                const err783 = { instancePath: instancePath + "/source/externalId", schemaPath: "#/definitions/TriggerActor/anyOf/1/properties/externalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                                if (vErrors === null) {
                                                  vErrors = [err783];
                                                } else {
                                                  vErrors.push(err783);
                                                }
                                                errors++;
                                              }
                                            }
                                          } else {
                                            const err784 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                            if (vErrors === null) {
                                              vErrors = [err784];
                                            } else {
                                              vErrors.push(err784);
                                            }
                                            errors++;
                                          }
                                          var _valid17 = _errs772 === errors;
                                          valid126 = valid126 || _valid17;
                                          if (!valid126) {
                                            const _errs779 = errors;
                                            if (data263 && typeof data263 == "object" && !Array.isArray(data263)) {
                                              if (data263.role === void 0) {
                                                const err785 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                                                if (vErrors === null) {
                                                  vErrors = [err785];
                                                } else {
                                                  vErrors.push(err785);
                                                }
                                                errors++;
                                              }
                                              for (const key80 in data263) {
                                                if (!(key80 === "role")) {
                                                  const err786 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key80 }, message: "must NOT have additional properties" };
                                                  if (vErrors === null) {
                                                    vErrors = [err786];
                                                  } else {
                                                    vErrors.push(err786);
                                                  }
                                                  errors++;
                                                }
                                              }
                                              if (data263.role !== void 0) {
                                                let data269 = data263.role;
                                                if (typeof data269 !== "string") {
                                                  const err787 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                                  if (vErrors === null) {
                                                    vErrors = [err787];
                                                  } else {
                                                    vErrors.push(err787);
                                                  }
                                                  errors++;
                                                }
                                                if ("supervisor" !== data269) {
                                                  const err788 = { instancePath: instancePath + "/source/role", schemaPath: "#/definitions/TriggerActor/anyOf/2/properties/role/const", keyword: "const", params: { allowedValue: "supervisor" }, message: "must be equal to constant" };
                                                  if (vErrors === null) {
                                                    vErrors = [err788];
                                                  } else {
                                                    vErrors.push(err788);
                                                  }
                                                  errors++;
                                                }
                                              }
                                            } else {
                                              const err789 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                              if (vErrors === null) {
                                                vErrors = [err789];
                                              } else {
                                                vErrors.push(err789);
                                              }
                                              errors++;
                                            }
                                            var _valid17 = _errs779 === errors;
                                            valid126 = valid126 || _valid17;
                                          }
                                        }
                                        if (!valid126) {
                                          const err790 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/TriggerActor/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                                          if (vErrors === null) {
                                            vErrors = [err790];
                                          } else {
                                            vErrors.push(err790);
                                          }
                                          errors++;
                                        } else {
                                          errors = _errs762;
                                          if (vErrors !== null) {
                                            if (_errs762) {
                                              vErrors.length = _errs762;
                                            } else {
                                              vErrors = null;
                                            }
                                          }
                                        }
                                      }
                                      if (data.target !== void 0) {
                                        let data270 = data.target;
                                        if (typeof data270 !== "string") {
                                          const err791 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                          if (vErrors === null) {
                                            vErrors = [err791];
                                          } else {
                                            vErrors.push(err791);
                                          }
                                          errors++;
                                        }
                                        if (!(data270 === "supervisor" || data270 === "worker")) {
                                          const err792 = { instancePath: instancePath + "/target", schemaPath: "#/definitions/TriggerTarget/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
                                          if (vErrors === null) {
                                            vErrors = [err792];
                                          } else {
                                            vErrors.push(err792);
                                          }
                                          errors++;
                                        }
                                      }
                                      if (data.payload !== void 0) {
                                        let data271 = data.payload;
                                        if (data271 && typeof data271 == "object" && !Array.isArray(data271)) {
                                          if (data271.action === void 0) {
                                            const err793 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/15/properties/payload/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
                                            if (vErrors === null) {
                                              vErrors = [err793];
                                            } else {
                                              vErrors.push(err793);
                                            }
                                            errors++;
                                          }
                                          for (const key81 in data271) {
                                            if (!(key81 === "action")) {
                                              const err794 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/15/properties/payload/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key81 }, message: "must NOT have additional properties" };
                                              if (vErrors === null) {
                                                vErrors = [err794];
                                              } else {
                                                vErrors.push(err794);
                                              }
                                              errors++;
                                            }
                                          }
                                          if (data271.action !== void 0) {
                                            let data272 = data271.action;
                                            if (typeof data272 !== "string") {
                                              const err795 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/15/properties/payload/properties/action/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                              if (vErrors === null) {
                                                vErrors = [err795];
                                              } else {
                                                vErrors.push(err795);
                                              }
                                              errors++;
                                            }
                                            if ("result" !== data272) {
                                              const err796 = { instancePath: instancePath + "/payload/action", schemaPath: "#/anyOf/15/properties/payload/properties/action/const", keyword: "const", params: { allowedValue: "result" }, message: "must be equal to constant" };
                                              if (vErrors === null) {
                                                vErrors = [err796];
                                              } else {
                                                vErrors.push(err796);
                                              }
                                              errors++;
                                            }
                                          }
                                        } else {
                                          const err797 = { instancePath: instancePath + "/payload", schemaPath: "#/anyOf/15/properties/payload/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                          if (vErrors === null) {
                                            vErrors = [err797];
                                          } else {
                                            vErrors.push(err797);
                                          }
                                          errors++;
                                        }
                                      }
                                      if (data.sentAt !== void 0) {
                                        if (typeof data.sentAt !== "string") {
                                          const err798 = { instancePath: instancePath + "/sentAt", schemaPath: "#/anyOf/15/properties/sentAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                          if (vErrors === null) {
                                            vErrors = [err798];
                                          } else {
                                            vErrors.push(err798);
                                          }
                                          errors++;
                                        }
                                      }
                                      if (data.goalId !== void 0) {
                                        if (typeof data.goalId !== "string") {
                                          const err799 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/15/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                          if (vErrors === null) {
                                            vErrors = [err799];
                                          } else {
                                            vErrors.push(err799);
                                          }
                                          errors++;
                                        }
                                      }
                                      if (data.replyTo !== void 0) {
                                        if (typeof data.replyTo !== "string") {
                                          const err800 = { instancePath: instancePath + "/replyTo", schemaPath: "#/anyOf/15/properties/replyTo/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                          if (vErrors === null) {
                                            vErrors = [err800];
                                          } else {
                                            vErrors.push(err800);
                                          }
                                          errors++;
                                        }
                                      }
                                    } else {
                                      const err801 = { instancePath, schemaPath: "#/anyOf/15/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                                      if (vErrors === null) {
                                        vErrors = [err801];
                                      } else {
                                        vErrors.push(err801);
                                      }
                                      errors++;
                                    }
                                    var _valid0 = _errs751 === errors;
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
            }
          }
        }
      }
      if (!valid0) {
        const err802 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err802];
        } else {
          vErrors.push(err802);
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
export default require_Trigger_validator();
