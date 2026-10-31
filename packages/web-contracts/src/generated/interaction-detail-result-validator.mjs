var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserInteractionDetailResult-validator.cjs
var require_BrowserInteractionDetailResult_validator = __commonJS({
  "BrowserInteractionDetailResult-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "anyOf": [{ "type": "object", "properties": { "ok": { "type": "boolean", "const": true }, "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "interactionId": { "type": "string", "pattern": "\\S" }, "detail": { "$ref": "#/definitions/BrowserInteractionDetail" } }, "required": ["ok", "goalId", "runId", "interactionId", "detail"], "additionalProperties": false }, { "type": "object", "properties": { "ok": { "type": "boolean", "const": false }, "error": { "type": "string", "enum": ["goal_not_found", "stale_run", "interaction_not_waiting", "interaction_mismatch", "interaction_details_unavailable"] } }, "required": ["ok", "error"], "additionalProperties": false }], "description": "\u5F53\u524D\u4EA4\u4E92\u5B8C\u6574\u8BE6\u60C5\u8BFB\u53D6\u7684\u7ED3\u679C\u3002" };
    var pattern0 = new RegExp("\\S", "u");
    var schema13 = { "anyOf": [{ "type": "object", "properties": { "kind": { "type": "string", "const": "question" }, "mode": { "type": "string", "enum": ["plan", "execution"] }, "questions": { "type": "array", "items": { "$ref": "#/definitions/BrowserAskUserQuestion" } }, "routeRevision": { "$ref": "#/definitions/BrowserInteractionRouteRevision" } }, "required": ["kind", "mode", "questions"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "task_approval" }, "objective": { "type": "string" }, "approvalRequest": { "type": "string" }, "completionCriteria": { "type": "array", "items": { "type": "string" } }, "stages": { "type": "array", "items": { "$ref": "#/definitions/BrowserPlanRouteStage" } } }, "required": ["kind", "objective", "approvalRequest", "completionCriteria", "stages"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "action_approval" }, "actionId": { "type": "string", "pattern": "\\S" }, "toolId": { "type": "string", "pattern": "\\S" }, "approvalKind": { "type": "string", "enum": ["tool", "sandbox"] }, "input": {}, "recoveryRef": { "type": "string", "pattern": "\\S" }, "parentProgram": { "$ref": "#/definitions/BrowserParentProgram" } }, "required": ["kind", "actionId", "toolId", "input"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "action_recovery" }, "actionId": { "type": "string", "pattern": "\\S" }, "toolId": { "type": "string", "pattern": "\\S" }, "approvalKind": { "type": "string", "enum": ["tool", "sandbox"] }, "input": {}, "recoveryRef": { "type": "string", "pattern": "\\S" }, "parentProgram": { "$ref": "#/definitions/BrowserParentProgram" } }, "required": ["kind", "actionId", "toolId", "input"], "additionalProperties": false }], "description": "\u5F53\u524D\u4EA4\u4E92\u7684\u5B8C\u6574\u5BA1\u9605\u5185\u5BB9\u3002" };
    function validate13(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.id === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.header === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "header" }, message: "must have required property 'header'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.question === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "question" }, message: "must have required property 'question'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.multiSelect === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "multiSelect" }, message: "must have required property 'multiSelect'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.options === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "options" }, message: "must have required property 'options'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "id" || key0 === "header" || key0 === "question" || key0 === "multiSelect" || key0 === "options")) {
            const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.id !== void 0) {
          let data0 = data.id;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err6 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          } else {
            const err7 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.header !== void 0) {
          if (typeof data.header !== "string") {
            const err8 = { instancePath: instancePath + "/header", schemaPath: "#/properties/header/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.question !== void 0) {
          if (typeof data.question !== "string") {
            const err9 = { instancePath: instancePath + "/question", schemaPath: "#/properties/question/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.multiSelect !== void 0) {
          if (typeof data.multiSelect !== "boolean") {
            const err10 = { instancePath: instancePath + "/multiSelect", schemaPath: "#/properties/multiSelect/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.options !== void 0) {
          let data4 = data.options;
          if (Array.isArray(data4)) {
            const len0 = data4.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data5 = data4[i0];
              if (data5 && typeof data5 == "object" && !Array.isArray(data5)) {
                if (data5.id === void 0) {
                  const err11 = { instancePath: instancePath + "/options/" + i0, schemaPath: "#/definitions/BrowserAskUserOption/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
                  if (vErrors === null) {
                    vErrors = [err11];
                  } else {
                    vErrors.push(err11);
                  }
                  errors++;
                }
                if (data5.label === void 0) {
                  const err12 = { instancePath: instancePath + "/options/" + i0, schemaPath: "#/definitions/BrowserAskUserOption/required", keyword: "required", params: { missingProperty: "label" }, message: "must have required property 'label'" };
                  if (vErrors === null) {
                    vErrors = [err12];
                  } else {
                    vErrors.push(err12);
                  }
                  errors++;
                }
                for (const key1 in data5) {
                  if (!(key1 === "id" || key1 === "label" || key1 === "description")) {
                    const err13 = { instancePath: instancePath + "/options/" + i0, schemaPath: "#/definitions/BrowserAskUserOption/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err13];
                    } else {
                      vErrors.push(err13);
                    }
                    errors++;
                  }
                }
                if (data5.id !== void 0) {
                  let data6 = data5.id;
                  if (typeof data6 === "string") {
                    if (!pattern0.test(data6)) {
                      const err14 = { instancePath: instancePath + "/options/" + i0 + "/id", schemaPath: "#/definitions/BrowserAskUserOption/properties/id/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err14];
                      } else {
                        vErrors.push(err14);
                      }
                      errors++;
                    }
                  } else {
                    const err15 = { instancePath: instancePath + "/options/" + i0 + "/id", schemaPath: "#/definitions/BrowserAskUserOption/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err15];
                    } else {
                      vErrors.push(err15);
                    }
                    errors++;
                  }
                }
                if (data5.label !== void 0) {
                  if (typeof data5.label !== "string") {
                    const err16 = { instancePath: instancePath + "/options/" + i0 + "/label", schemaPath: "#/definitions/BrowserAskUserOption/properties/label/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err16];
                    } else {
                      vErrors.push(err16);
                    }
                    errors++;
                  }
                }
                if (data5.description !== void 0) {
                  if (typeof data5.description !== "string") {
                    const err17 = { instancePath: instancePath + "/options/" + i0 + "/description", schemaPath: "#/definitions/BrowserAskUserOption/properties/description/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err17];
                    } else {
                      vErrors.push(err17);
                    }
                    errors++;
                  }
                }
              } else {
                const err18 = { instancePath: instancePath + "/options/" + i0, schemaPath: "#/definitions/BrowserAskUserOption/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
          } else {
            const err19 = { instancePath: instancePath + "/options", schemaPath: "#/properties/options/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
      } else {
        const err20 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
      validate13.errors = vErrors;
      return errors === 0;
    }
    function validate15(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.baseRevision === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "baseRevision" }, message: "must have required property 'baseRevision'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.reason === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.approvalRequest === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "approvalRequest" }, message: "must have required property 'approvalRequest'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.approvalOptionId === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "approvalOptionId" }, message: "must have required property 'approvalOptionId'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.stages === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stages" }, message: "must have required property 'stages'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "baseRevision" || key0 === "reason" || key0 === "approvalRequest" || key0 === "approvalOptionId" || key0 === "stages")) {
            const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.baseRevision !== void 0) {
          let data0 = data.baseRevision;
          if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
            const err6 = { instancePath: instancePath + "/baseRevision", schemaPath: "#/properties/baseRevision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if (typeof data0 == "number" && isFinite(data0)) {
            if (data0 > 9007199254740991 || isNaN(data0)) {
              const err7 = { instancePath: instancePath + "/baseRevision", schemaPath: "#/properties/baseRevision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          }
        }
        if (data.reason !== void 0) {
          let data1 = data.reason;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err8 = { instancePath: instancePath + "/reason", schemaPath: "#/properties/reason/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          } else {
            const err9 = { instancePath: instancePath + "/reason", schemaPath: "#/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.approvalRequest !== void 0) {
          let data2 = data.approvalRequest;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err10 = { instancePath: instancePath + "/approvalRequest", schemaPath: "#/properties/approvalRequest/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          } else {
            const err11 = { instancePath: instancePath + "/approvalRequest", schemaPath: "#/properties/approvalRequest/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.approvalOptionId !== void 0) {
          let data3 = data.approvalOptionId;
          if (typeof data3 === "string") {
            if (!pattern0.test(data3)) {
              const err12 = { instancePath: instancePath + "/approvalOptionId", schemaPath: "#/properties/approvalOptionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          } else {
            const err13 = { instancePath: instancePath + "/approvalOptionId", schemaPath: "#/properties/approvalOptionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.stages !== void 0) {
          let data4 = data.stages;
          if (Array.isArray(data4)) {
            const len0 = data4.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data5 = data4[i0];
              if (data5 && typeof data5 == "object" && !Array.isArray(data5)) {
                if (data5.target === void 0) {
                  const err14 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStage/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
                if (data5.acceptanceCriteria === void 0) {
                  const err15 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStage/required", keyword: "required", params: { missingProperty: "acceptanceCriteria" }, message: "must have required property 'acceptanceCriteria'" };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                }
                for (const key1 in data5) {
                  if (!(key1 === "target" || key1 === "acceptanceCriteria")) {
                    const err16 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStage/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err16];
                    } else {
                      vErrors.push(err16);
                    }
                    errors++;
                  }
                }
                if (data5.target !== void 0) {
                  if (typeof data5.target !== "string") {
                    const err17 = { instancePath: instancePath + "/stages/" + i0 + "/target", schemaPath: "#/definitions/BrowserPlanRouteStage/properties/target/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err17];
                    } else {
                      vErrors.push(err17);
                    }
                    errors++;
                  }
                }
                if (data5.acceptanceCriteria !== void 0) {
                  let data7 = data5.acceptanceCriteria;
                  if (Array.isArray(data7)) {
                    const len1 = data7.length;
                    for (let i1 = 0; i1 < len1; i1++) {
                      if (typeof data7[i1] !== "string") {
                        const err18 = { instancePath: instancePath + "/stages/" + i0 + "/acceptanceCriteria/" + i1, schemaPath: "#/definitions/BrowserPlanRouteStage/properties/acceptanceCriteria/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err18];
                        } else {
                          vErrors.push(err18);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err19 = { instancePath: instancePath + "/stages/" + i0 + "/acceptanceCriteria", schemaPath: "#/definitions/BrowserPlanRouteStage/properties/acceptanceCriteria/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                    if (vErrors === null) {
                      vErrors = [err19];
                    } else {
                      vErrors.push(err19);
                    }
                    errors++;
                  }
                }
              } else {
                const err20 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/definitions/BrowserPlanRouteStage/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            }
          } else {
            const err21 = { instancePath: instancePath + "/stages", schemaPath: "#/properties/stages/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
        }
      } else {
        const err22 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
      validate15.errors = vErrors;
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
        if (data.mode === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "mode" }, message: "must have required property 'mode'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.questions === void 0) {
          const err2 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "questions" }, message: "must have required property 'questions'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "kind" || key0 === "mode" || key0 === "questions" || key0 === "routeRevision")) {
            const err3 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data0 = data.kind;
          if (typeof data0 !== "string") {
            const err4 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if ("question" !== data0) {
            const err5 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "question" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.mode !== void 0) {
          let data1 = data.mode;
          if (typeof data1 !== "string") {
            const err6 = { instancePath: instancePath + "/mode", schemaPath: "#/anyOf/0/properties/mode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if (!(data1 === "plan" || data1 === "execution")) {
            const err7 = { instancePath: instancePath + "/mode", schemaPath: "#/anyOf/0/properties/mode/enum", keyword: "enum", params: { allowedValues: schema13.anyOf[0].properties.mode.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.questions !== void 0) {
          let data2 = data.questions;
          if (Array.isArray(data2)) {
            const len0 = data2.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate13(data2[i0], { instancePath: instancePath + "/questions/" + i0, parentData: data2, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err8 = { instancePath: instancePath + "/questions", schemaPath: "#/anyOf/0/properties/questions/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.routeRevision !== void 0) {
          if (!validate15(data.routeRevision, { instancePath: instancePath + "/routeRevision", parentData: data, parentDataProperty: "routeRevision", rootData })) {
            vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err9 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs12 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.kind === void 0) {
            const err10 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
          if (data.objective === void 0) {
            const err11 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "objective" }, message: "must have required property 'objective'" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          if (data.approvalRequest === void 0) {
            const err12 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "approvalRequest" }, message: "must have required property 'approvalRequest'" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
          if (data.completionCriteria === void 0) {
            const err13 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "completionCriteria" }, message: "must have required property 'completionCriteria'" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
          if (data.stages === void 0) {
            const err14 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "stages" }, message: "must have required property 'stages'" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "kind" || key1 === "objective" || key1 === "approvalRequest" || key1 === "completionCriteria" || key1 === "stages")) {
              const err15 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          }
          if (data.kind !== void 0) {
            let data5 = data.kind;
            if (typeof data5 !== "string") {
              const err16 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
            if ("task_approval" !== data5) {
              const err17 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "task_approval" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
          }
          if (data.objective !== void 0) {
            if (typeof data.objective !== "string") {
              const err18 = { instancePath: instancePath + "/objective", schemaPath: "#/anyOf/1/properties/objective/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
          if (data.approvalRequest !== void 0) {
            if (typeof data.approvalRequest !== "string") {
              const err19 = { instancePath: instancePath + "/approvalRequest", schemaPath: "#/anyOf/1/properties/approvalRequest/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
          }
          if (data.completionCriteria !== void 0) {
            let data8 = data.completionCriteria;
            if (Array.isArray(data8)) {
              const len1 = data8.length;
              for (let i1 = 0; i1 < len1; i1++) {
                if (typeof data8[i1] !== "string") {
                  const err20 = { instancePath: instancePath + "/completionCriteria/" + i1, schemaPath: "#/anyOf/1/properties/completionCriteria/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err20];
                  } else {
                    vErrors.push(err20);
                  }
                  errors++;
                }
              }
            } else {
              const err21 = { instancePath: instancePath + "/completionCriteria", schemaPath: "#/anyOf/1/properties/completionCriteria/type", keyword: "type", params: { type: "array" }, message: "must be array" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
          if (data.stages !== void 0) {
            let data10 = data.stages;
            if (Array.isArray(data10)) {
              const len2 = data10.length;
              for (let i2 = 0; i2 < len2; i2++) {
                let data11 = data10[i2];
                if (data11 && typeof data11 == "object" && !Array.isArray(data11)) {
                  if (data11.target === void 0) {
                    const err22 = { instancePath: instancePath + "/stages/" + i2, schemaPath: "#/definitions/BrowserPlanRouteStage/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
                    if (vErrors === null) {
                      vErrors = [err22];
                    } else {
                      vErrors.push(err22);
                    }
                    errors++;
                  }
                  if (data11.acceptanceCriteria === void 0) {
                    const err23 = { instancePath: instancePath + "/stages/" + i2, schemaPath: "#/definitions/BrowserPlanRouteStage/required", keyword: "required", params: { missingProperty: "acceptanceCriteria" }, message: "must have required property 'acceptanceCriteria'" };
                    if (vErrors === null) {
                      vErrors = [err23];
                    } else {
                      vErrors.push(err23);
                    }
                    errors++;
                  }
                  for (const key2 in data11) {
                    if (!(key2 === "target" || key2 === "acceptanceCriteria")) {
                      const err24 = { instancePath: instancePath + "/stages/" + i2, schemaPath: "#/definitions/BrowserPlanRouteStage/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err24];
                      } else {
                        vErrors.push(err24);
                      }
                      errors++;
                    }
                  }
                  if (data11.target !== void 0) {
                    if (typeof data11.target !== "string") {
                      const err25 = { instancePath: instancePath + "/stages/" + i2 + "/target", schemaPath: "#/definitions/BrowserPlanRouteStage/properties/target/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err25];
                      } else {
                        vErrors.push(err25);
                      }
                      errors++;
                    }
                  }
                  if (data11.acceptanceCriteria !== void 0) {
                    let data13 = data11.acceptanceCriteria;
                    if (Array.isArray(data13)) {
                      const len3 = data13.length;
                      for (let i3 = 0; i3 < len3; i3++) {
                        if (typeof data13[i3] !== "string") {
                          const err26 = { instancePath: instancePath + "/stages/" + i2 + "/acceptanceCriteria/" + i3, schemaPath: "#/definitions/BrowserPlanRouteStage/properties/acceptanceCriteria/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err26];
                          } else {
                            vErrors.push(err26);
                          }
                          errors++;
                        }
                      }
                    } else {
                      const err27 = { instancePath: instancePath + "/stages/" + i2 + "/acceptanceCriteria", schemaPath: "#/definitions/BrowserPlanRouteStage/properties/acceptanceCriteria/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                      if (vErrors === null) {
                        vErrors = [err27];
                      } else {
                        vErrors.push(err27);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err28 = { instancePath: instancePath + "/stages/" + i2, schemaPath: "#/definitions/BrowserPlanRouteStage/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err28];
                  } else {
                    vErrors.push(err28);
                  }
                  errors++;
                }
              }
            } else {
              const err29 = { instancePath: instancePath + "/stages", schemaPath: "#/anyOf/1/properties/stages/type", keyword: "type", params: { type: "array" }, message: "must be array" };
              if (vErrors === null) {
                vErrors = [err29];
              } else {
                vErrors.push(err29);
              }
              errors++;
            }
          }
        } else {
          const err30 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
        var _valid0 = _errs12 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs37 = errors;
          if (data && typeof data == "object" && !Array.isArray(data)) {
            if (data.kind === void 0) {
              const err31 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
            if (data.actionId === void 0) {
              const err32 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
              if (vErrors === null) {
                vErrors = [err32];
              } else {
                vErrors.push(err32);
              }
              errors++;
            }
            if (data.toolId === void 0) {
              const err33 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "toolId" }, message: "must have required property 'toolId'" };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
            if (data.input === void 0) {
              const err34 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "input" }, message: "must have required property 'input'" };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
            for (const key3 in data) {
              if (!(key3 === "kind" || key3 === "actionId" || key3 === "toolId" || key3 === "approvalKind" || key3 === "input" || key3 === "recoveryRef" || key3 === "parentProgram")) {
                const err35 = { instancePath, schemaPath: "#/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err35];
                } else {
                  vErrors.push(err35);
                }
                errors++;
              }
            }
            if (data.kind !== void 0) {
              let data15 = data.kind;
              if (typeof data15 !== "string") {
                const err36 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/2/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err36];
                } else {
                  vErrors.push(err36);
                }
                errors++;
              }
              if ("action_approval" !== data15) {
                const err37 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/2/properties/kind/const", keyword: "const", params: { allowedValue: "action_approval" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err37];
                } else {
                  vErrors.push(err37);
                }
                errors++;
              }
            }
            if (data.actionId !== void 0) {
              let data16 = data.actionId;
              if (typeof data16 === "string") {
                if (!pattern0.test(data16)) {
                  const err38 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/2/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err38];
                  } else {
                    vErrors.push(err38);
                  }
                  errors++;
                }
              } else {
                const err39 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/2/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err39];
                } else {
                  vErrors.push(err39);
                }
                errors++;
              }
            }
            if (data.toolId !== void 0) {
              let data17 = data.toolId;
              if (typeof data17 === "string") {
                if (!pattern0.test(data17)) {
                  const err40 = { instancePath: instancePath + "/toolId", schemaPath: "#/anyOf/2/properties/toolId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err40];
                  } else {
                    vErrors.push(err40);
                  }
                  errors++;
                }
              } else {
                const err41 = { instancePath: instancePath + "/toolId", schemaPath: "#/anyOf/2/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err41];
                } else {
                  vErrors.push(err41);
                }
                errors++;
              }
            }
            if (data.approvalKind !== void 0) {
              let data18 = data.approvalKind;
              if (typeof data18 !== "string") {
                const err42 = { instancePath: instancePath + "/approvalKind", schemaPath: "#/anyOf/2/properties/approvalKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err42];
                } else {
                  vErrors.push(err42);
                }
                errors++;
              }
              if (!(data18 === "tool" || data18 === "sandbox")) {
                const err43 = { instancePath: instancePath + "/approvalKind", schemaPath: "#/anyOf/2/properties/approvalKind/enum", keyword: "enum", params: { allowedValues: schema13.anyOf[2].properties.approvalKind.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err43];
                } else {
                  vErrors.push(err43);
                }
                errors++;
              }
            }
            if (data.recoveryRef !== void 0) {
              let data19 = data.recoveryRef;
              if (typeof data19 === "string") {
                if (!pattern0.test(data19)) {
                  const err44 = { instancePath: instancePath + "/recoveryRef", schemaPath: "#/anyOf/2/properties/recoveryRef/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err44];
                  } else {
                    vErrors.push(err44);
                  }
                  errors++;
                }
              } else {
                const err45 = { instancePath: instancePath + "/recoveryRef", schemaPath: "#/anyOf/2/properties/recoveryRef/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
            }
            if (data.parentProgram !== void 0) {
              let data20 = data.parentProgram;
              if (data20 && typeof data20 == "object" && !Array.isArray(data20)) {
                if (data20.actionId === void 0) {
                  const err46 = { instancePath: instancePath + "/parentProgram", schemaPath: "#/definitions/BrowserParentProgram/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                  if (vErrors === null) {
                    vErrors = [err46];
                  } else {
                    vErrors.push(err46);
                  }
                  errors++;
                }
                if (data20.callNumber === void 0) {
                  const err47 = { instancePath: instancePath + "/parentProgram", schemaPath: "#/definitions/BrowserParentProgram/required", keyword: "required", params: { missingProperty: "callNumber" }, message: "must have required property 'callNumber'" };
                  if (vErrors === null) {
                    vErrors = [err47];
                  } else {
                    vErrors.push(err47);
                  }
                  errors++;
                }
                for (const key4 in data20) {
                  if (!(key4 === "actionId" || key4 === "callNumber")) {
                    const err48 = { instancePath: instancePath + "/parentProgram", schemaPath: "#/definitions/BrowserParentProgram/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err48];
                    } else {
                      vErrors.push(err48);
                    }
                    errors++;
                  }
                }
                if (data20.actionId !== void 0) {
                  let data21 = data20.actionId;
                  if (typeof data21 === "string") {
                    if (!pattern0.test(data21)) {
                      const err49 = { instancePath: instancePath + "/parentProgram/actionId", schemaPath: "#/definitions/BrowserParentProgram/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err49];
                      } else {
                        vErrors.push(err49);
                      }
                      errors++;
                    }
                  } else {
                    const err50 = { instancePath: instancePath + "/parentProgram/actionId", schemaPath: "#/definitions/BrowserParentProgram/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err50];
                    } else {
                      vErrors.push(err50);
                    }
                    errors++;
                  }
                }
                if (data20.callNumber !== void 0) {
                  let data22 = data20.callNumber;
                  if (!(typeof data22 == "number" && (!(data22 % 1) && !isNaN(data22)) && isFinite(data22))) {
                    const err51 = { instancePath: instancePath + "/parentProgram/callNumber", schemaPath: "#/definitions/BrowserParentProgram/properties/callNumber/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err51];
                    } else {
                      vErrors.push(err51);
                    }
                    errors++;
                  }
                  if (typeof data22 == "number" && isFinite(data22)) {
                    if (data22 > 9007199254740991 || isNaN(data22)) {
                      const err52 = { instancePath: instancePath + "/parentProgram/callNumber", schemaPath: "#/definitions/BrowserParentProgram/properties/callNumber/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err52];
                      } else {
                        vErrors.push(err52);
                      }
                      errors++;
                    }
                    if (data22 < 1 || isNaN(data22)) {
                      const err53 = { instancePath: instancePath + "/parentProgram/callNumber", schemaPath: "#/definitions/BrowserParentProgram/properties/callNumber/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                      if (vErrors === null) {
                        vErrors = [err53];
                      } else {
                        vErrors.push(err53);
                      }
                      errors++;
                    }
                  }
                }
              } else {
                const err54 = { instancePath: instancePath + "/parentProgram", schemaPath: "#/definitions/BrowserParentProgram/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err54];
                } else {
                  vErrors.push(err54);
                }
                errors++;
              }
            }
          } else {
            const err55 = { instancePath, schemaPath: "#/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err55];
            } else {
              vErrors.push(err55);
            }
            errors++;
          }
          var _valid0 = _errs37 === errors;
          valid0 = valid0 || _valid0;
          if (!valid0) {
            const _errs58 = errors;
            if (data && typeof data == "object" && !Array.isArray(data)) {
              if (data.kind === void 0) {
                const err56 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                if (vErrors === null) {
                  vErrors = [err56];
                } else {
                  vErrors.push(err56);
                }
                errors++;
              }
              if (data.actionId === void 0) {
                const err57 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                if (vErrors === null) {
                  vErrors = [err57];
                } else {
                  vErrors.push(err57);
                }
                errors++;
              }
              if (data.toolId === void 0) {
                const err58 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "toolId" }, message: "must have required property 'toolId'" };
                if (vErrors === null) {
                  vErrors = [err58];
                } else {
                  vErrors.push(err58);
                }
                errors++;
              }
              if (data.input === void 0) {
                const err59 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "input" }, message: "must have required property 'input'" };
                if (vErrors === null) {
                  vErrors = [err59];
                } else {
                  vErrors.push(err59);
                }
                errors++;
              }
              for (const key5 in data) {
                if (!(key5 === "kind" || key5 === "actionId" || key5 === "toolId" || key5 === "approvalKind" || key5 === "input" || key5 === "recoveryRef" || key5 === "parentProgram")) {
                  const err60 = { instancePath, schemaPath: "#/anyOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err60];
                  } else {
                    vErrors.push(err60);
                  }
                  errors++;
                }
              }
              if (data.kind !== void 0) {
                let data23 = data.kind;
                if (typeof data23 !== "string") {
                  const err61 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/3/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err61];
                  } else {
                    vErrors.push(err61);
                  }
                  errors++;
                }
                if ("action_recovery" !== data23) {
                  const err62 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/3/properties/kind/const", keyword: "const", params: { allowedValue: "action_recovery" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err62];
                  } else {
                    vErrors.push(err62);
                  }
                  errors++;
                }
              }
              if (data.actionId !== void 0) {
                let data24 = data.actionId;
                if (typeof data24 === "string") {
                  if (!pattern0.test(data24)) {
                    const err63 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/3/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                    if (vErrors === null) {
                      vErrors = [err63];
                    } else {
                      vErrors.push(err63);
                    }
                    errors++;
                  }
                } else {
                  const err64 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/3/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err64];
                  } else {
                    vErrors.push(err64);
                  }
                  errors++;
                }
              }
              if (data.toolId !== void 0) {
                let data25 = data.toolId;
                if (typeof data25 === "string") {
                  if (!pattern0.test(data25)) {
                    const err65 = { instancePath: instancePath + "/toolId", schemaPath: "#/anyOf/3/properties/toolId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                    if (vErrors === null) {
                      vErrors = [err65];
                    } else {
                      vErrors.push(err65);
                    }
                    errors++;
                  }
                } else {
                  const err66 = { instancePath: instancePath + "/toolId", schemaPath: "#/anyOf/3/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err66];
                  } else {
                    vErrors.push(err66);
                  }
                  errors++;
                }
              }
              if (data.approvalKind !== void 0) {
                let data26 = data.approvalKind;
                if (typeof data26 !== "string") {
                  const err67 = { instancePath: instancePath + "/approvalKind", schemaPath: "#/anyOf/3/properties/approvalKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err67];
                  } else {
                    vErrors.push(err67);
                  }
                  errors++;
                }
                if (!(data26 === "tool" || data26 === "sandbox")) {
                  const err68 = { instancePath: instancePath + "/approvalKind", schemaPath: "#/anyOf/3/properties/approvalKind/enum", keyword: "enum", params: { allowedValues: schema13.anyOf[3].properties.approvalKind.enum }, message: "must be equal to one of the allowed values" };
                  if (vErrors === null) {
                    vErrors = [err68];
                  } else {
                    vErrors.push(err68);
                  }
                  errors++;
                }
              }
              if (data.recoveryRef !== void 0) {
                let data27 = data.recoveryRef;
                if (typeof data27 === "string") {
                  if (!pattern0.test(data27)) {
                    const err69 = { instancePath: instancePath + "/recoveryRef", schemaPath: "#/anyOf/3/properties/recoveryRef/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                    if (vErrors === null) {
                      vErrors = [err69];
                    } else {
                      vErrors.push(err69);
                    }
                    errors++;
                  }
                } else {
                  const err70 = { instancePath: instancePath + "/recoveryRef", schemaPath: "#/anyOf/3/properties/recoveryRef/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err70];
                  } else {
                    vErrors.push(err70);
                  }
                  errors++;
                }
              }
              if (data.parentProgram !== void 0) {
                let data28 = data.parentProgram;
                if (data28 && typeof data28 == "object" && !Array.isArray(data28)) {
                  if (data28.actionId === void 0) {
                    const err71 = { instancePath: instancePath + "/parentProgram", schemaPath: "#/definitions/BrowserParentProgram/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                    if (vErrors === null) {
                      vErrors = [err71];
                    } else {
                      vErrors.push(err71);
                    }
                    errors++;
                  }
                  if (data28.callNumber === void 0) {
                    const err72 = { instancePath: instancePath + "/parentProgram", schemaPath: "#/definitions/BrowserParentProgram/required", keyword: "required", params: { missingProperty: "callNumber" }, message: "must have required property 'callNumber'" };
                    if (vErrors === null) {
                      vErrors = [err72];
                    } else {
                      vErrors.push(err72);
                    }
                    errors++;
                  }
                  for (const key6 in data28) {
                    if (!(key6 === "actionId" || key6 === "callNumber")) {
                      const err73 = { instancePath: instancePath + "/parentProgram", schemaPath: "#/definitions/BrowserParentProgram/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err73];
                      } else {
                        vErrors.push(err73);
                      }
                      errors++;
                    }
                  }
                  if (data28.actionId !== void 0) {
                    let data29 = data28.actionId;
                    if (typeof data29 === "string") {
                      if (!pattern0.test(data29)) {
                        const err74 = { instancePath: instancePath + "/parentProgram/actionId", schemaPath: "#/definitions/BrowserParentProgram/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                        if (vErrors === null) {
                          vErrors = [err74];
                        } else {
                          vErrors.push(err74);
                        }
                        errors++;
                      }
                    } else {
                      const err75 = { instancePath: instancePath + "/parentProgram/actionId", schemaPath: "#/definitions/BrowserParentProgram/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err75];
                      } else {
                        vErrors.push(err75);
                      }
                      errors++;
                    }
                  }
                  if (data28.callNumber !== void 0) {
                    let data30 = data28.callNumber;
                    if (!(typeof data30 == "number" && (!(data30 % 1) && !isNaN(data30)) && isFinite(data30))) {
                      const err76 = { instancePath: instancePath + "/parentProgram/callNumber", schemaPath: "#/definitions/BrowserParentProgram/properties/callNumber/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                      if (vErrors === null) {
                        vErrors = [err76];
                      } else {
                        vErrors.push(err76);
                      }
                      errors++;
                    }
                    if (typeof data30 == "number" && isFinite(data30)) {
                      if (data30 > 9007199254740991 || isNaN(data30)) {
                        const err77 = { instancePath: instancePath + "/parentProgram/callNumber", schemaPath: "#/definitions/BrowserParentProgram/properties/callNumber/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                        if (vErrors === null) {
                          vErrors = [err77];
                        } else {
                          vErrors.push(err77);
                        }
                        errors++;
                      }
                      if (data30 < 1 || isNaN(data30)) {
                        const err78 = { instancePath: instancePath + "/parentProgram/callNumber", schemaPath: "#/definitions/BrowserParentProgram/properties/callNumber/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                        if (vErrors === null) {
                          vErrors = [err78];
                        } else {
                          vErrors.push(err78);
                        }
                        errors++;
                      }
                    }
                  }
                } else {
                  const err79 = { instancePath: instancePath + "/parentProgram", schemaPath: "#/definitions/BrowserParentProgram/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err79];
                  } else {
                    vErrors.push(err79);
                  }
                  errors++;
                }
              }
            } else {
              const err80 = { instancePath, schemaPath: "#/anyOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err80];
              } else {
                vErrors.push(err80);
              }
              errors++;
            }
            var _valid0 = _errs58 === errors;
            valid0 = valid0 || _valid0;
          }
        }
      }
      if (!valid0) {
        const err81 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err81];
        } else {
          vErrors.push(err81);
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
        if (data.ok === void 0) {
          const err0 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
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
        if (data.runId === void 0) {
          const err2 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.interactionId === void 0) {
          const err3 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "interactionId" }, message: "must have required property 'interactionId'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.detail === void 0) {
          const err4 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "detail" }, message: "must have required property 'detail'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "ok" || key0 === "goalId" || key0 === "runId" || key0 === "interactionId" || key0 === "detail")) {
            const err5 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.ok !== void 0) {
          let data0 = data.ok;
          if (typeof data0 !== "boolean") {
            const err6 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if (true !== data0) {
            const err7 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data1 = data.goalId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err8 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/0/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          } else {
            const err9 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/0/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
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
              const err10 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/0/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          } else {
            const err11 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/0/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.interactionId !== void 0) {
          let data3 = data.interactionId;
          if (typeof data3 === "string") {
            if (!pattern0.test(data3)) {
              const err12 = { instancePath: instancePath + "/interactionId", schemaPath: "#/anyOf/0/properties/interactionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          } else {
            const err13 = { instancePath: instancePath + "/interactionId", schemaPath: "#/anyOf/0/properties/interactionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.detail !== void 0) {
          if (!validate12(data.detail, { instancePath: instancePath + "/detail", parentData: data, parentDataProperty: "detail", rootData })) {
            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err14 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs13 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.ok === void 0) {
            const err15 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
          if (data.error === void 0) {
            const err16 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "ok" || key1 === "error")) {
              const err17 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
          }
          if (data.ok !== void 0) {
            let data5 = data.ok;
            if (typeof data5 !== "boolean") {
              const err18 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            if (false !== data5) {
              const err19 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
          }
          if (data.error !== void 0) {
            let data6 = data.error;
            if (typeof data6 !== "string") {
              const err20 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
            if (!(data6 === "goal_not_found" || data6 === "stale_run" || data6 === "interaction_not_waiting" || data6 === "interaction_mismatch" || data6 === "interaction_details_unavailable")) {
              const err21 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/enum", keyword: "enum", params: { allowedValues: schema12.anyOf[1].properties.error.enum }, message: "must be equal to one of the allowed values" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
        } else {
          const err22 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
        var _valid0 = _errs13 === errors;
        valid0 = valid0 || _valid0;
      }
      if (!valid0) {
        const err23 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
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
export default require_BrowserInteractionDetailResult_validator();
