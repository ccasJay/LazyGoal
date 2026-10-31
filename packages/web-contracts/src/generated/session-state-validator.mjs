var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserSessionState-validator.cjs
var require_BrowserSessionState_validator = __commonJS({
  "BrowserSessionState-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "runStatus": { "$ref": "#/definitions/BrowserRunStatus" }, "mode": { "type": "string", "enum": ["normal", "plan"] }, "commitRevision": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "queueRevision": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "queuePaused": { "type": "boolean" }, "queuePauseReason": { "type": "string", "enum": ["run_failed", "user_interrupt"] }, "pendingMessageCount": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "pendingSteerCount": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "waitingFor": { "type": "string", "enum": ["ask_user", "task_approval", "action_approval", "action_recovery", "blocked"] }, "interaction": { "$ref": "#/definitions/BrowserSessionStateInteraction" }, "messages": { "type": "object", "properties": { "count": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "throughMessageId": { "type": "string", "pattern": "\\S" }, "recent": { "type": "array", "items": { "$ref": "#/definitions/BrowserSessionStateMessage" } } }, "required": ["count", "recent"], "additionalProperties": false }, "needsRecovery": { "type": "boolean" }, "interruption": { "$ref": "#/definitions/BrowserSessionStateInterruption" }, "executionOwner": { "type": "boolean" } }, "required": ["goalId", "runId", "runStatus", "mode", "commitRevision", "queueRevision", "queuePaused", "pendingMessageCount", "pendingSteerCount", "messages", "needsRecovery", "executionOwner"], "additionalProperties": false, "description": "\u5B89\u5168\u4F1A\u8BDD\u72B6\u6001\u6295\u5F71\u3002" };
    var schema13 = { "type": "string", "enum": ["created", "running", "waiting", "completed", "failed", "cancelled"], "description": "Run \u751F\u547D\u5468\u671F\u72B6\u6001\u3002" };
    var schema18 = { "type": "object", "properties": { "requestId": { "type": "string", "pattern": "\\S" }, "status": { "type": "string", "enum": ["requested", "finished"] }, "outcomeUnknown": { "type": "boolean" } }, "required": ["requestId", "status", "outcomeUnknown"], "additionalProperties": false, "description": "\u5F53\u524D Run \u7684\u7528\u6237\u4E2D\u65AD\u72B6\u6001\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    var pattern0 = new RegExp("\\S", "u");
    var schema15 = { "type": "string", "enum": ["question", "task_approval", "action_approval", "action_recovery"], "description": "\u5F53\u524D\u4EA4\u4E92\u89C6\u56FE\u7684\u79CD\u7C7B\u3002" };
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
            const err7 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserInteractionKind/enum", keyword: "enum", params: { allowedValues: schema15.enum }, message: "must be equal to one of the allowed values" };
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
      validate12.errors = vErrors;
      return errors === 0;
    }
    var schema16 = { "type": "object", "properties": { "messageId": { "type": "string", "pattern": "\\S" }, "role": { "type": "string", "enum": ["user", "assistant"] }, "runId": { "type": "string", "pattern": "\\S" }, "position": { "$ref": "#/definitions/BrowserMessagePosition" }, "purpose": { "type": "string", "enum": ["process", "answer", "notice"] }, "sourceKind": { "type": "string", "pattern": "\\S" }, "sourceId": { "type": "string", "pattern": "\\S" } }, "required": ["messageId", "role", "runId", "position", "sourceKind", "sourceId"], "additionalProperties": false, "description": "\u4F1A\u8BDD\u72B6\u6001\u4E2D\u6709\u754C\u6D88\u606F\u8303\u56F4\u7684\u4E00\u6761\u6458\u8981\u3002" };
    function validate14(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
            const err10 = { instancePath: instancePath + "/role", schemaPath: "#/properties/role/enum", keyword: "enum", params: { allowedValues: schema16.properties.role.enum }, message: "must be equal to one of the allowed values" };
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
            const err24 = { instancePath: instancePath + "/purpose", schemaPath: "#/properties/purpose/enum", keyword: "enum", params: { allowedValues: schema16.properties.purpose.enum }, message: "must be equal to one of the allowed values" };
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
      validate14.errors = vErrors;
      return errors === 0;
    }
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
          if (!func2.call(schema12.properties, key0)) {
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
            const err18 = { instancePath: instancePath + "/runStatus", schemaPath: "#/definitions/BrowserRunStatus/enum", keyword: "enum", params: { allowedValues: schema13.enum }, message: "must be equal to one of the allowed values" };
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
            const err20 = { instancePath: instancePath + "/mode", schemaPath: "#/properties/mode/enum", keyword: "enum", params: { allowedValues: schema12.properties.mode.enum }, message: "must be equal to one of the allowed values" };
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
            const err29 = { instancePath: instancePath + "/queuePauseReason", schemaPath: "#/properties/queuePauseReason/enum", keyword: "enum", params: { allowedValues: schema12.properties.queuePauseReason.enum }, message: "must be equal to one of the allowed values" };
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
            const err37 = { instancePath: instancePath + "/waitingFor", schemaPath: "#/properties/waitingFor/enum", keyword: "enum", params: { allowedValues: schema12.properties.waitingFor.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err37];
            } else {
              vErrors.push(err37);
            }
            errors++;
          }
        }
        if (data.interaction !== void 0) {
          if (!validate12(data.interaction, { instancePath: instancePath + "/interaction", parentData: data, parentDataProperty: "interaction", rootData })) {
            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
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
                  if (!validate14(data15[i0], { instancePath: instancePath + "/messages/recent/" + i0, parentData: data15, parentDataProperty: i0, rootData })) {
                    vErrors = vErrors === null ? validate14.errors : vErrors.concat(validate14.errors);
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
                const err56 = { instancePath: instancePath + "/interruption/status", schemaPath: "#/definitions/BrowserSessionStateInterruption/properties/status/enum", keyword: "enum", params: { allowedValues: schema18.properties.status.enum }, message: "must be equal to one of the allowed values" };
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
export default require_BrowserSessionState_validator();
