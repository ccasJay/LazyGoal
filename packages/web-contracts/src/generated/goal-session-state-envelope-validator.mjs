var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserGoalSessionStateEnvelope-validator.cjs
var require_BrowserGoalSessionStateEnvelope_validator = __commonJS({
  "BrowserGoalSessionStateEnvelope-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema13 = { "type": "object", "properties": { "goalId": { "type": "string", "pattern": "\\S" }, "intent": { "type": "string" }, "currentRunId": { "type": "string", "pattern": "\\S" }, "runStatus": { "$ref": "#/definitions/BrowserRunStatus" }, "currentRunMode": { "type": "string", "enum": ["normal", "plan"] }, "nextRunMode": { "type": "string", "const": "plan" }, "currentRunStepCount": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "currentRunTerminalDetail": { "$ref": "#/definitions/BrowserSessionRunTerminalDetail" }, "currentPlanRoute": { "$ref": "#/definitions/BrowserPlanRoute" }, "execution": { "$ref": "#/definitions/BrowserGoalExecution" }, "pendingSteers": { "type": "array", "items": { "$ref": "#/definitions/BrowserPendingSteer" } }, "pendingMessages": { "type": "array", "items": { "$ref": "#/definitions/BrowserPendingMessage" } }, "queue": { "$ref": "#/definitions/BrowserQueueState" }, "interruption": { "$ref": "#/definitions/BrowserInterruption" }, "goalPlan": { "$ref": "#/definitions/BrowserGoalPlan" }, "interaction": { "$ref": "#/definitions/BrowserInteractionView" }, "pendingAction": { "$ref": "#/definitions/BrowserPendingAction" }, "history": { "type": "object", "properties": { "messages": { "$ref": "#/definitions/BrowserActivityHistoryMarker" }, "steps": { "$ref": "#/definitions/BrowserActivityHistoryMarker" }, "stages": { "$ref": "#/definitions/BrowserActivityHistoryMarker" } }, "required": ["messages", "steps", "stages"], "additionalProperties": false } }, "required": ["goalId", "intent", "currentRunId", "runStatus", "currentRunMode", "currentRunStepCount", "history"], "additionalProperties": false, "description": "\u521D\u59CB\u8BFB\u53D6\u548C\u5206\u9875\u4F7F\u7528\u7684\u7A84 Goal \u72B6\u6001\u3002" };
    var schema14 = { "type": "string", "enum": ["created", "running", "waiting", "completed", "failed", "cancelled"], "description": "Run \u751F\u547D\u5468\u671F\u72B6\u6001\u3002" };
    var schema22 = { "type": "object", "properties": { "revision": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "paused": { "type": "boolean" }, "pauseReason": { "type": "string", "enum": ["run_failed", "user_interrupt"] } }, "required": ["revision", "paused"], "additionalProperties": false, "description": "\u6D88\u606F\u961F\u5217\u4FEE\u8BA2\u4E0E\u6682\u505C\u4E8B\u5B9E\u3002" };
    var schema23 = { "type": "object", "properties": { "requestId": { "type": "string", "pattern": "\\S" }, "status": { "type": "string", "enum": ["requested", "finished"] }, "outcomeUnknown": { "type": "boolean" } }, "required": ["requestId", "status"], "additionalProperties": false, "description": "\u5DF2\u53D7\u7406\u7684\u7528\u6237\u7EC8\u6B62\u53CA\u53D6\u6D88\u7ED3\u7B97\u72B6\u6001\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    var pattern0 = new RegExp("\\S", "u");
    var schema17 = { "type": "object", "properties": { "stageId": { "type": "string", "pattern": "\\S" }, "revision": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "status": { "type": "string", "enum": ["pending", "executing", "accepted"] }, "target": { "type": "string", "pattern": "\\S" }, "acceptanceCriteria": { "type": "array", "items": { "type": "string" } }, "acceptedSequence": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 } }, "required": ["stageId", "revision", "status", "target", "acceptanceCriteria"], "additionalProperties": false, "description": "\u5DF2\u6279\u51C6 Plan Run \u4E2D\u5E26 Runtime \u8EAB\u4EFD\u7684\u9636\u6BB5\u72B6\u6001\u3002" };
    function validate13(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
            const len0 = data3.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data4 = data3[i0];
              if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
                if (data4.stageId === void 0) {
                  const err12 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/required", keyword: "required", params: { missingProperty: "stageId" }, message: "must have required property 'stageId'" };
                  if (vErrors === null) {
                    vErrors = [err12];
                  } else {
                    vErrors.push(err12);
                  }
                  errors++;
                }
                if (data4.revision === void 0) {
                  const err13 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
                if (data4.status === void 0) {
                  const err14 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
                if (data4.target === void 0) {
                  const err15 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                }
                if (data4.acceptanceCriteria === void 0) {
                  const err16 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/required", keyword: "required", params: { missingProperty: "acceptanceCriteria" }, message: "must have required property 'acceptanceCriteria'" };
                  if (vErrors === null) {
                    vErrors = [err16];
                  } else {
                    vErrors.push(err16);
                  }
                  errors++;
                }
                for (const key1 in data4) {
                  if (!(key1 === "stageId" || key1 === "revision" || key1 === "status" || key1 === "target" || key1 === "acceptanceCriteria" || key1 === "acceptedSequence")) {
                    const err17 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err17];
                    } else {
                      vErrors.push(err17);
                    }
                    errors++;
                  }
                }
                if (data4.stageId !== void 0) {
                  let data5 = data4.stageId;
                  if (typeof data5 === "string") {
                    if (!pattern0.test(data5)) {
                      const err18 = { instancePath: instancePath + "/stages/" + i0 + "/stageId", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/stageId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err18];
                      } else {
                        vErrors.push(err18);
                      }
                      errors++;
                    }
                  } else {
                    const err19 = { instancePath: instancePath + "/stages/" + i0 + "/stageId", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/stageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err19];
                    } else {
                      vErrors.push(err19);
                    }
                    errors++;
                  }
                }
                if (data4.revision !== void 0) {
                  let data6 = data4.revision;
                  if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
                    const err20 = { instancePath: instancePath + "/stages/" + i0 + "/revision", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/revision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err20];
                    } else {
                      vErrors.push(err20);
                    }
                    errors++;
                  }
                  if (typeof data6 == "number" && isFinite(data6)) {
                    if (data6 > 9007199254740991 || isNaN(data6)) {
                      const err21 = { instancePath: instancePath + "/stages/" + i0 + "/revision", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/revision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err21];
                      } else {
                        vErrors.push(err21);
                      }
                      errors++;
                    }
                    if (data6 < 1 || isNaN(data6)) {
                      const err22 = { instancePath: instancePath + "/stages/" + i0 + "/revision", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/revision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                      if (vErrors === null) {
                        vErrors = [err22];
                      } else {
                        vErrors.push(err22);
                      }
                      errors++;
                    }
                  }
                }
                if (data4.status !== void 0) {
                  let data7 = data4.status;
                  if (typeof data7 !== "string") {
                    const err23 = { instancePath: instancePath + "/stages/" + i0 + "/status", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err23];
                    } else {
                      vErrors.push(err23);
                    }
                    errors++;
                  }
                  if (!(data7 === "pending" || data7 === "executing" || data7 === "accepted")) {
                    const err24 = { instancePath: instancePath + "/stages/" + i0 + "/status", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/status/enum", keyword: "enum", params: { allowedValues: schema17.properties.status.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err24];
                    } else {
                      vErrors.push(err24);
                    }
                    errors++;
                  }
                }
                if (data4.target !== void 0) {
                  let data8 = data4.target;
                  if (typeof data8 === "string") {
                    if (!pattern0.test(data8)) {
                      const err25 = { instancePath: instancePath + "/stages/" + i0 + "/target", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/target/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err25];
                      } else {
                        vErrors.push(err25);
                      }
                      errors++;
                    }
                  } else {
                    const err26 = { instancePath: instancePath + "/stages/" + i0 + "/target", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/target/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err26];
                    } else {
                      vErrors.push(err26);
                    }
                    errors++;
                  }
                }
                if (data4.acceptanceCriteria !== void 0) {
                  let data9 = data4.acceptanceCriteria;
                  if (Array.isArray(data9)) {
                    const len1 = data9.length;
                    for (let i1 = 0; i1 < len1; i1++) {
                      if (typeof data9[i1] !== "string") {
                        const err27 = { instancePath: instancePath + "/stages/" + i0 + "/acceptanceCriteria/" + i1, schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/acceptanceCriteria/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err27];
                        } else {
                          vErrors.push(err27);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err28 = { instancePath: instancePath + "/stages/" + i0 + "/acceptanceCriteria", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/acceptanceCriteria/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                    if (vErrors === null) {
                      vErrors = [err28];
                    } else {
                      vErrors.push(err28);
                    }
                    errors++;
                  }
                }
                if (data4.acceptedSequence !== void 0) {
                  let data11 = data4.acceptedSequence;
                  if (!(typeof data11 == "number" && (!(data11 % 1) && !isNaN(data11)) && isFinite(data11))) {
                    const err29 = { instancePath: instancePath + "/stages/" + i0 + "/acceptedSequence", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/acceptedSequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err29];
                    } else {
                      vErrors.push(err29);
                    }
                    errors++;
                  }
                  if (typeof data11 == "number" && isFinite(data11)) {
                    if (data11 > 9007199254740991 || isNaN(data11)) {
                      const err30 = { instancePath: instancePath + "/stages/" + i0 + "/acceptedSequence", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/acceptedSequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err30];
                      } else {
                        vErrors.push(err30);
                      }
                      errors++;
                    }
                    if (data11 < 0 || isNaN(data11)) {
                      const err31 = { instancePath: instancePath + "/stages/" + i0 + "/acceptedSequence", schemaPath: "#/definitions/BrowserPlanRouteStageState/properties/acceptedSequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err31];
                      } else {
                        vErrors.push(err31);
                      }
                      errors++;
                    }
                  }
                }
              } else {
                const err32 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStageState/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
            }
          } else {
            const err33 = { instancePath: instancePath + "/stages", schemaPath: "#/properties/stages/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
        }
      } else {
        const err34 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err34];
        } else {
          vErrors.push(err34);
        }
        errors++;
      }
      validate13.errors = vErrors;
      return errors === 0;
    }
    var schema19 = { "type": "string", "enum": ["active", "recoverable", "inactive"], "description": "Run \u8FDB\u7A0B\u6D3B\u52A8\u72B6\u6001\u3002" };
    function validate15(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
            const err4 = { instancePath: instancePath + "/state", schemaPath: "#/definitions/BrowserExecutionState/enum", keyword: "enum", params: { allowedValues: schema19.enum }, message: "must be equal to one of the allowed values" };
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
      validate15.errors = vErrors;
      return errors === 0;
    }
    var schema25 = { "type": "object", "properties": { "id": { "type": "string", "pattern": "\\S" }, "content": { "type": "string" }, "position": { "type": "integer", "maximum": 9007199254740991 }, "status": { "type": "string", "enum": ["pending", "in_progress", "completed", "cancelled"] } }, "required": ["id", "content", "position", "status"], "additionalProperties": false, "description": "\u76EE\u6807\u62C6\u89E3\u8BA1\u5212\u4E2D\u7684\u6761\u76EE\u3002" };
    function validate17(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
                    const err16 = { instancePath: instancePath + "/items/" + i0 + "/status", schemaPath: "#/definitions/BrowserGoalPlanItem/properties/status/enum", keyword: "enum", params: { allowedValues: schema25.properties.status.enum }, message: "must be equal to one of the allowed values" };
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
      validate17.errors = vErrors;
      return errors === 0;
    }
    var schema26 = { "type": "object", "properties": { "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "kind": { "$ref": "#/definitions/BrowserInteractionKind" }, "interactionId": { "type": "string", "pattern": "\\S" }, "requestId": { "type": "string", "pattern": "\\S" }, "actionId": { "type": "string", "pattern": "\\S" }, "recoveryRef": { "type": "string", "pattern": "\\S" }, "decisions": { "type": "array", "items": { "$ref": "#/definitions/BrowserInteractionDecision" } }, "truncated": { "type": "boolean" } }, "required": ["goalId", "runId", "kind", "interactionId", "decisions", "truncated"], "additionalProperties": false, "description": "\u5F53\u524D\u5DF2\u63D0\u4EA4\u7B49\u5F85\u7684\u7C7B\u578B\u5316\u4EA4\u4E92\u89C6\u56FE\u6458\u8981\u3002" };
    var schema27 = { "type": "string", "enum": ["question", "task_approval", "action_approval", "action_recovery"], "description": "\u5F53\u524D\u4EA4\u4E92\u89C6\u56FE\u7684\u79CD\u7C7B\u3002" };
    var schema28 = { "type": "string", "enum": ["answer_questions", "reply_to_question", "skip_question", "approve_task", "send_task_feedback", "approve_action", "approve_action_revision", "reject_action", "retry_unknown_action", "decline_unknown_action_retry"], "description": "\u5F53\u524D\u4EA4\u4E92\u5141\u8BB8\u7684\u51B3\u5B9A\u3002" };
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
          if (!func2.call(schema26.properties, key0)) {
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
            const err12 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserInteractionKind/enum", keyword: "enum", params: { allowedValues: schema27.enum }, message: "must be equal to one of the allowed values" };
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
            const len0 = data7.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data8 = data7[i0];
              if (typeof data8 !== "string") {
                const err21 = { instancePath: instancePath + "/decisions/" + i0, schemaPath: "#/definitions/BrowserInteractionDecision/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
              if (!(data8 === "answer_questions" || data8 === "reply_to_question" || data8 === "skip_question" || data8 === "approve_task" || data8 === "send_task_feedback" || data8 === "approve_action" || data8 === "approve_action_revision" || data8 === "reject_action" || data8 === "retry_unknown_action" || data8 === "decline_unknown_action_retry")) {
                const err22 = { instancePath: instancePath + "/decisions/" + i0, schemaPath: "#/definitions/BrowserInteractionDecision/enum", keyword: "enum", params: { allowedValues: schema28.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
            }
          } else {
            const err23 = { instancePath: instancePath + "/decisions", schemaPath: "#/properties/decisions/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
        if (data.truncated !== void 0) {
          if (typeof data.truncated !== "boolean") {
            const err24 = { instancePath: instancePath + "/truncated", schemaPath: "#/properties/truncated/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
        }
      } else {
        const err25 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
      validate19.errors = vErrors;
      return errors === 0;
    }
    var schema29 = { "type": "object", "properties": { "actionId": { "type": "string", "pattern": "\\S" }, "toolId": { "type": "string", "pattern": "\\S" }, "status": { "type": "string", "enum": ["approved", "awaiting_approval", "outcome_unknown"] }, "inputSummary": { "type": "string" }, "inputPreview": { "type": "string" }, "inputPreviewTruncated": { "type": "boolean" }, "targetPath": { "type": "string" }, "approvalKind": { "type": "string", "enum": ["tool", "sandbox"] }, "sandboxReview": { "$ref": "#/definitions/BrowserSandboxReview" }, "parentProgram": { "$ref": "#/definitions/BrowserParentProgram" } }, "required": ["actionId", "toolId", "status", "inputPreview", "inputPreviewTruncated"], "additionalProperties": false, "description": "\u5F85\u7528\u6237\u5BA1\u6279\u7684\u5DE5\u5177\u6216\u6C99\u7BB1 Action \u89C6\u56FE\u3002" };
    var schema30 = { "type": "object", "properties": { "extraFiles": { "type": "array", "items": { "$ref": "#/definitions/BrowserToolGrantExtraFile" } }, "network": { "type": "string", "enum": ["none", "all_outbound"] }, "networkNotice": { "type": "string" } }, "required": ["extraFiles", "network"], "additionalProperties": false, "description": "\u6C99\u7BB1\u6743\u9650\u5BA1\u9605\u6458\u8981\u3002" };
    var schema31 = { "type": "object", "properties": { "canonicalPath": { "type": "string", "pattern": "\\S" }, "access": { "type": "string", "enum": ["read", "write"] }, "kind": { "type": "string", "enum": ["file", "directory_tree"] } }, "required": ["canonicalPath", "access", "kind"], "additionalProperties": false, "description": "\u5DE5\u5177\u6388\u6743\u6216\u6C99\u7BB1\u8BBF\u95EE\u4E2D\u7684\u5355\u4E2A\u5916\u90E8\u6587\u4EF6/\u76EE\u5F55\u6761\u76EE\u3002" };
    function validate22(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
                    const err10 = { instancePath: instancePath + "/extraFiles/" + i0 + "/access", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/access/enum", keyword: "enum", params: { allowedValues: schema31.properties.access.enum }, message: "must be equal to one of the allowed values" };
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
                    const err12 = { instancePath: instancePath + "/extraFiles/" + i0 + "/kind", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/kind/enum", keyword: "enum", params: { allowedValues: schema31.properties.kind.enum }, message: "must be equal to one of the allowed values" };
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
            const err16 = { instancePath: instancePath + "/network", schemaPath: "#/properties/network/enum", keyword: "enum", params: { allowedValues: schema30.properties.network.enum }, message: "must be equal to one of the allowed values" };
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
      validate22.errors = vErrors;
      return errors === 0;
    }
    function validate21(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
          if (!func2.call(schema29.properties, key0)) {
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
            const err11 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/enum", keyword: "enum", params: { allowedValues: schema29.properties.status.enum }, message: "must be equal to one of the allowed values" };
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
            const err17 = { instancePath: instancePath + "/approvalKind", schemaPath: "#/properties/approvalKind/enum", keyword: "enum", params: { allowedValues: schema29.properties.approvalKind.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.sandboxReview !== void 0) {
          if (!validate22(data.sandboxReview, { instancePath: instancePath + "/sandboxReview", parentData: data, parentDataProperty: "sandboxReview", rootData })) {
            vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
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
      validate21.errors = vErrors;
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
          if (!func2.call(schema13.properties, key0)) {
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
            const err16 = { instancePath: instancePath + "/currentRunMode", schemaPath: "#/properties/currentRunMode/enum", keyword: "enum", params: { allowedValues: schema13.properties.currentRunMode.enum }, message: "must be equal to one of the allowed values" };
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
          if (!validate13(data.currentPlanRoute, { instancePath: instancePath + "/currentPlanRoute", parentData: data, parentDataProperty: "currentPlanRoute", rootData })) {
            vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
            errors = vErrors.length;
          }
        }
        if (data.execution !== void 0) {
          if (!validate15(data.execution, { instancePath: instancePath + "/execution", parentData: data, parentDataProperty: "execution", rootData })) {
            vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
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
                const err51 = { instancePath: instancePath + "/queue/pauseReason", schemaPath: "#/definitions/BrowserQueueState/properties/pauseReason/enum", keyword: "enum", params: { allowedValues: schema22.properties.pauseReason.enum }, message: "must be equal to one of the allowed values" };
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
                const err59 = { instancePath: instancePath + "/interruption/status", schemaPath: "#/definitions/BrowserInterruption/properties/status/enum", keyword: "enum", params: { allowedValues: schema23.properties.status.enum }, message: "must be equal to one of the allowed values" };
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
          if (!validate17(data.goalPlan, { instancePath: instancePath + "/goalPlan", parentData: data, parentDataProperty: "goalPlan", rootData })) {
            vErrors = vErrors === null ? validate17.errors : vErrors.concat(validate17.errors);
            errors = vErrors.length;
          }
        }
        if (data.interaction !== void 0) {
          if (!validate19(data.interaction, { instancePath: instancePath + "/interaction", parentData: data, parentDataProperty: "interaction", rootData })) {
            vErrors = vErrors === null ? validate19.errors : vErrors.concat(validate19.errors);
            errors = vErrors.length;
          }
        }
        if (data.pendingAction !== void 0) {
          if (!validate21(data.pendingAction, { instancePath: instancePath + "/pendingAction", parentData: data, parentDataProperty: "pendingAction", rootData })) {
            vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
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
      validate12.errors = vErrors;
      return errors === 0;
    }
    var schema36 = { "type": "object", "properties": { "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "runStatus": { "$ref": "#/definitions/BrowserRunStatus" }, "mode": { "type": "string", "enum": ["normal", "plan"] }, "commitRevision": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "queueRevision": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "queuePaused": { "type": "boolean" }, "queuePauseReason": { "type": "string", "enum": ["run_failed", "user_interrupt"] }, "pendingMessageCount": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "pendingSteerCount": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "waitingFor": { "type": "string", "enum": ["ask_user", "task_approval", "action_approval", "action_recovery", "blocked"] }, "interaction": { "$ref": "#/definitions/BrowserSessionStateInteraction" }, "messages": { "type": "object", "properties": { "count": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "throughMessageId": { "type": "string", "pattern": "\\S" }, "recent": { "type": "array", "items": { "$ref": "#/definitions/BrowserSessionStateMessage" } } }, "required": ["count", "recent"], "additionalProperties": false }, "needsRecovery": { "type": "boolean" }, "interruption": { "$ref": "#/definitions/BrowserSessionStateInterruption" }, "executionOwner": { "type": "boolean" } }, "required": ["goalId", "runId", "runStatus", "mode", "commitRevision", "queueRevision", "queuePaused", "pendingMessageCount", "pendingSteerCount", "messages", "needsRecovery", "executionOwner"], "additionalProperties": false, "description": "\u5B89\u5168\u4F1A\u8BDD\u72B6\u6001\u6295\u5F71\u3002" };
    var schema42 = { "type": "object", "properties": { "requestId": { "type": "string", "pattern": "\\S" }, "status": { "type": "string", "enum": ["requested", "finished"] }, "outcomeUnknown": { "type": "boolean" } }, "required": ["requestId", "status", "outcomeUnknown"], "additionalProperties": false, "description": "\u5F53\u524D Run \u7684\u7528\u6237\u4E2D\u65AD\u72B6\u6001\u3002" };
    function validate27(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
            const err7 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserInteractionKind/enum", keyword: "enum", params: { allowedValues: schema27.enum }, message: "must be equal to one of the allowed values" };
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
      validate27.errors = vErrors;
      return errors === 0;
    }
    var schema40 = { "type": "object", "properties": { "messageId": { "type": "string", "pattern": "\\S" }, "role": { "type": "string", "enum": ["user", "assistant"] }, "runId": { "type": "string", "pattern": "\\S" }, "position": { "$ref": "#/definitions/BrowserMessagePosition" }, "purpose": { "type": "string", "enum": ["process", "answer", "notice"] }, "sourceKind": { "type": "string", "pattern": "\\S" }, "sourceId": { "type": "string", "pattern": "\\S" } }, "required": ["messageId", "role", "runId", "position", "sourceKind", "sourceId"], "additionalProperties": false, "description": "\u4F1A\u8BDD\u72B6\u6001\u4E2D\u6709\u754C\u6D88\u606F\u8303\u56F4\u7684\u4E00\u6761\u6458\u8981\u3002" };
    function validate29(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
            const err10 = { instancePath: instancePath + "/role", schemaPath: "#/properties/role/enum", keyword: "enum", params: { allowedValues: schema40.properties.role.enum }, message: "must be equal to one of the allowed values" };
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
            const err24 = { instancePath: instancePath + "/purpose", schemaPath: "#/properties/purpose/enum", keyword: "enum", params: { allowedValues: schema40.properties.purpose.enum }, message: "must be equal to one of the allowed values" };
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
      validate29.errors = vErrors;
      return errors === 0;
    }
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
          if (!func2.call(schema36.properties, key0)) {
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
            const err20 = { instancePath: instancePath + "/mode", schemaPath: "#/properties/mode/enum", keyword: "enum", params: { allowedValues: schema36.properties.mode.enum }, message: "must be equal to one of the allowed values" };
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
            const err29 = { instancePath: instancePath + "/queuePauseReason", schemaPath: "#/properties/queuePauseReason/enum", keyword: "enum", params: { allowedValues: schema36.properties.queuePauseReason.enum }, message: "must be equal to one of the allowed values" };
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
            const err37 = { instancePath: instancePath + "/waitingFor", schemaPath: "#/properties/waitingFor/enum", keyword: "enum", params: { allowedValues: schema36.properties.waitingFor.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err37];
            } else {
              vErrors.push(err37);
            }
            errors++;
          }
        }
        if (data.interaction !== void 0) {
          if (!validate27(data.interaction, { instancePath: instancePath + "/interaction", parentData: data, parentDataProperty: "interaction", rootData })) {
            vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
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
                  if (!validate29(data15[i0], { instancePath: instancePath + "/messages/recent/" + i0, parentData: data15, parentDataProperty: i0, rootData })) {
                    vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
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
                const err56 = { instancePath: instancePath + "/interruption/status", schemaPath: "#/definitions/BrowserSessionStateInterruption/properties/status/enum", keyword: "enum", params: { allowedValues: schema42.properties.status.enum }, message: "must be equal to one of the allowed values" };
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
      validate26.errors = vErrors;
      return errors === 0;
    }
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        for (const key0 in data) {
          if (!(key0 === "goal" || key0 === "session")) {
            const err1 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.goal !== void 0) {
          if (!validate12(data.goal, { instancePath: instancePath + "/goal", parentData: data, parentDataProperty: "goal", rootData })) {
            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
            errors = vErrors.length;
          }
        }
        if (data.session !== void 0) {
          if (!validate26(data.session, { instancePath: instancePath + "/session", parentData: data, parentDataProperty: "session", rootData })) {
            vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err2 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
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
export default require_BrowserGoalSessionStateEnvelope_validator();
