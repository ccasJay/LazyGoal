var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserExecutionUnitPage-validator.cjs
var require_BrowserExecutionUnitPage_validator = __commonJS({
  "BrowserExecutionUnitPage-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "goalId": { "type": "string", "pattern": "\\S" }, "run": { "$ref": "#/definitions/BrowserTrajectoryRun" }, "entries": { "type": "array", "items": { "$ref": "#/definitions/BrowserTrajectoryEntry" } }, "total": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "committedThroughSequence": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "nextCursor": { "type": ["string", "null"] }, "contextBefore": { "type": "array", "items": { "$ref": "#/definitions/BrowserTrajectoryEntry" } }, "contextAfter": { "type": "array", "items": { "$ref": "#/definitions/BrowserTrajectoryEntry" } } }, "required": ["goalId", "run", "entries", "total", "committedThroughSequence", "nextCursor", "contextBefore", "contextAfter"], "additionalProperties": false, "description": "\u6267\u884C\u5355\u5143\u4E8B\u4EF6\u9875\u53CA\u663E\u5F0F\u4E0A\u4E0B\u6587\u4E8B\u4EF6\u3002" };
    var schema15 = { "type": "object", "properties": { "eventId": { "type": "string", "pattern": "\\S" }, "sequence": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "occurredAt": { "type": "string" }, "eventType": { "type": "string" }, "category": { "type": "string", "enum": ["lifecycle", "decision", "memory", "action", "tool", "observation", "terminal", "commit"] }, "executionUnitId": { "type": "string", "pattern": "\\S" }, "stepIndex": { "type": "integer", "maximum": 9007199254740991 }, "actionId": { "type": "string", "pattern": "\\S" }, "programId": { "type": "string", "pattern": "\\S" }, "callIndex": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "parentActionId": { "type": "string", "pattern": "\\S" }, "title": { "type": "string" }, "preview": { "type": "string" }, "previewTruncated": { "type": "boolean" }, "inputPreview": { "type": "string" }, "resultPreview": { "type": "string" }, "modelCallId": { "type": "string" }, "modelStage": { "type": "string", "enum": ["think", "decide"] } }, "required": ["eventId", "sequence", "occurredAt", "eventType", "category", "title", "preview", "previewTruncated"], "additionalProperties": false, "description": "\u5355\u6761\u8F68\u8FF9\u4E8B\u4EF6\u5217\u8868\u6761\u76EE\u3002" };
    var pattern0 = new RegExp("\\S", "u");
    var schema14 = { "type": "string", "enum": ["created", "running", "waiting", "completed", "failed", "cancelled"], "description": "Run \u751F\u547D\u5468\u671F\u72B6\u6001\u3002" };
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.runId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.status === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.current === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "current" }, message: "must have required property 'current'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.committedThroughSequence === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "committedThroughSequence" }, message: "must have required property 'committedThroughSequence'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "runId" || key0 === "status" || key0 === "current" || key0 === "committedThroughSequence")) {
            const err4 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data0 = data.runId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err5 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
          } else {
            const err6 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.status !== void 0) {
          let data1 = data.status;
          if (typeof data1 !== "string") {
            const err7 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/BrowserRunStatus/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          if (!(data1 === "created" || data1 === "running" || data1 === "waiting" || data1 === "completed" || data1 === "failed" || data1 === "cancelled")) {
            const err8 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/BrowserRunStatus/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.current !== void 0) {
          if (typeof data.current !== "boolean") {
            const err9 = { instancePath: instancePath + "/current", schemaPath: "#/properties/current/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.committedThroughSequence !== void 0) {
          let data3 = data.committedThroughSequence;
          if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
            const err10 = { instancePath: instancePath + "/committedThroughSequence", schemaPath: "#/properties/committedThroughSequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
          if (typeof data3 == "number" && isFinite(data3)) {
            if (data3 > 9007199254740991 || isNaN(data3)) {
              const err11 = { instancePath: instancePath + "/committedThroughSequence", schemaPath: "#/properties/committedThroughSequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
            if (data3 < 0 || isNaN(data3)) {
              const err12 = { instancePath: instancePath + "/committedThroughSequence", schemaPath: "#/properties/committedThroughSequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          }
        }
      } else {
        const err13 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
      validate12.errors = vErrors;
      return errors === 0;
    }
    var func2 = Object.prototype.hasOwnProperty;
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
        if (data.run === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "run" }, message: "must have required property 'run'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.entries === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "entries" }, message: "must have required property 'entries'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.total === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "total" }, message: "must have required property 'total'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.committedThroughSequence === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "committedThroughSequence" }, message: "must have required property 'committedThroughSequence'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.nextCursor === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "nextCursor" }, message: "must have required property 'nextCursor'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.contextBefore === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "contextBefore" }, message: "must have required property 'contextBefore'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data.contextAfter === void 0) {
          const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "contextAfter" }, message: "must have required property 'contextAfter'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "goalId" || key0 === "run" || key0 === "entries" || key0 === "total" || key0 === "committedThroughSequence" || key0 === "nextCursor" || key0 === "contextBefore" || key0 === "contextAfter")) {
            const err8 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data0 = data.goalId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err9 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          } else {
            const err10 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.run !== void 0) {
          if (!validate12(data.run, { instancePath: instancePath + "/run", parentData: data, parentDataProperty: "run", rootData })) {
            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
            errors = vErrors.length;
          }
        }
        if (data.entries !== void 0) {
          let data2 = data.entries;
          if (Array.isArray(data2)) {
            const len0 = data2.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data3 = data2[i0];
              if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
                if (data3.eventId === void 0) {
                  const err11 = { instancePath: instancePath + "/entries/" + i0, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "eventId" }, message: "must have required property 'eventId'" };
                  if (vErrors === null) {
                    vErrors = [err11];
                  } else {
                    vErrors.push(err11);
                  }
                  errors++;
                }
                if (data3.sequence === void 0) {
                  const err12 = { instancePath: instancePath + "/entries/" + i0, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
                  if (vErrors === null) {
                    vErrors = [err12];
                  } else {
                    vErrors.push(err12);
                  }
                  errors++;
                }
                if (data3.occurredAt === void 0) {
                  const err13 = { instancePath: instancePath + "/entries/" + i0, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "occurredAt" }, message: "must have required property 'occurredAt'" };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
                if (data3.eventType === void 0) {
                  const err14 = { instancePath: instancePath + "/entries/" + i0, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "eventType" }, message: "must have required property 'eventType'" };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
                if (data3.category === void 0) {
                  const err15 = { instancePath: instancePath + "/entries/" + i0, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "category" }, message: "must have required property 'category'" };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                }
                if (data3.title === void 0) {
                  const err16 = { instancePath: instancePath + "/entries/" + i0, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "title" }, message: "must have required property 'title'" };
                  if (vErrors === null) {
                    vErrors = [err16];
                  } else {
                    vErrors.push(err16);
                  }
                  errors++;
                }
                if (data3.preview === void 0) {
                  const err17 = { instancePath: instancePath + "/entries/" + i0, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "preview" }, message: "must have required property 'preview'" };
                  if (vErrors === null) {
                    vErrors = [err17];
                  } else {
                    vErrors.push(err17);
                  }
                  errors++;
                }
                if (data3.previewTruncated === void 0) {
                  const err18 = { instancePath: instancePath + "/entries/" + i0, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "previewTruncated" }, message: "must have required property 'previewTruncated'" };
                  if (vErrors === null) {
                    vErrors = [err18];
                  } else {
                    vErrors.push(err18);
                  }
                  errors++;
                }
                for (const key1 in data3) {
                  if (!func2.call(schema15.properties, key1)) {
                    const err19 = { instancePath: instancePath + "/entries/" + i0, schemaPath: "#/definitions/BrowserTrajectoryEntry/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err19];
                    } else {
                      vErrors.push(err19);
                    }
                    errors++;
                  }
                }
                if (data3.eventId !== void 0) {
                  let data4 = data3.eventId;
                  if (typeof data4 === "string") {
                    if (!pattern0.test(data4)) {
                      const err20 = { instancePath: instancePath + "/entries/" + i0 + "/eventId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/eventId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err20];
                      } else {
                        vErrors.push(err20);
                      }
                      errors++;
                    }
                  } else {
                    const err21 = { instancePath: instancePath + "/entries/" + i0 + "/eventId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/eventId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err21];
                    } else {
                      vErrors.push(err21);
                    }
                    errors++;
                  }
                }
                if (data3.sequence !== void 0) {
                  let data5 = data3.sequence;
                  if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
                    const err22 = { instancePath: instancePath + "/entries/" + i0 + "/sequence", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/sequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err22];
                    } else {
                      vErrors.push(err22);
                    }
                    errors++;
                  }
                  if (typeof data5 == "number" && isFinite(data5)) {
                    if (data5 > 9007199254740991 || isNaN(data5)) {
                      const err23 = { instancePath: instancePath + "/entries/" + i0 + "/sequence", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/sequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err23];
                      } else {
                        vErrors.push(err23);
                      }
                      errors++;
                    }
                    if (data5 < 1 || isNaN(data5)) {
                      const err24 = { instancePath: instancePath + "/entries/" + i0 + "/sequence", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/sequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                      if (vErrors === null) {
                        vErrors = [err24];
                      } else {
                        vErrors.push(err24);
                      }
                      errors++;
                    }
                  }
                }
                if (data3.occurredAt !== void 0) {
                  if (typeof data3.occurredAt !== "string") {
                    const err25 = { instancePath: instancePath + "/entries/" + i0 + "/occurredAt", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/occurredAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err25];
                    } else {
                      vErrors.push(err25);
                    }
                    errors++;
                  }
                }
                if (data3.eventType !== void 0) {
                  if (typeof data3.eventType !== "string") {
                    const err26 = { instancePath: instancePath + "/entries/" + i0 + "/eventType", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/eventType/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err26];
                    } else {
                      vErrors.push(err26);
                    }
                    errors++;
                  }
                }
                if (data3.category !== void 0) {
                  let data8 = data3.category;
                  if (typeof data8 !== "string") {
                    const err27 = { instancePath: instancePath + "/entries/" + i0 + "/category", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/category/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err27];
                    } else {
                      vErrors.push(err27);
                    }
                    errors++;
                  }
                  if (!(data8 === "lifecycle" || data8 === "decision" || data8 === "memory" || data8 === "action" || data8 === "tool" || data8 === "observation" || data8 === "terminal" || data8 === "commit")) {
                    const err28 = { instancePath: instancePath + "/entries/" + i0 + "/category", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/category/enum", keyword: "enum", params: { allowedValues: schema15.properties.category.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err28];
                    } else {
                      vErrors.push(err28);
                    }
                    errors++;
                  }
                }
                if (data3.executionUnitId !== void 0) {
                  let data9 = data3.executionUnitId;
                  if (typeof data9 === "string") {
                    if (!pattern0.test(data9)) {
                      const err29 = { instancePath: instancePath + "/entries/" + i0 + "/executionUnitId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/executionUnitId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err29];
                      } else {
                        vErrors.push(err29);
                      }
                      errors++;
                    }
                  } else {
                    const err30 = { instancePath: instancePath + "/entries/" + i0 + "/executionUnitId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err30];
                    } else {
                      vErrors.push(err30);
                    }
                    errors++;
                  }
                }
                if (data3.stepIndex !== void 0) {
                  let data10 = data3.stepIndex;
                  if (!(typeof data10 == "number" && (!(data10 % 1) && !isNaN(data10)) && isFinite(data10))) {
                    const err31 = { instancePath: instancePath + "/entries/" + i0 + "/stepIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/stepIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err31];
                    } else {
                      vErrors.push(err31);
                    }
                    errors++;
                  }
                  if (typeof data10 == "number" && isFinite(data10)) {
                    if (data10 > 9007199254740991 || isNaN(data10)) {
                      const err32 = { instancePath: instancePath + "/entries/" + i0 + "/stepIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/stepIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err32];
                      } else {
                        vErrors.push(err32);
                      }
                      errors++;
                    }
                  }
                }
                if (data3.actionId !== void 0) {
                  let data11 = data3.actionId;
                  if (typeof data11 === "string") {
                    if (!pattern0.test(data11)) {
                      const err33 = { instancePath: instancePath + "/entries/" + i0 + "/actionId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err33];
                      } else {
                        vErrors.push(err33);
                      }
                      errors++;
                    }
                  } else {
                    const err34 = { instancePath: instancePath + "/entries/" + i0 + "/actionId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err34];
                    } else {
                      vErrors.push(err34);
                    }
                    errors++;
                  }
                }
                if (data3.programId !== void 0) {
                  let data12 = data3.programId;
                  if (typeof data12 === "string") {
                    if (!pattern0.test(data12)) {
                      const err35 = { instancePath: instancePath + "/entries/" + i0 + "/programId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/programId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err35];
                      } else {
                        vErrors.push(err35);
                      }
                      errors++;
                    }
                  } else {
                    const err36 = { instancePath: instancePath + "/entries/" + i0 + "/programId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/programId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err36];
                    } else {
                      vErrors.push(err36);
                    }
                    errors++;
                  }
                }
                if (data3.callIndex !== void 0) {
                  let data13 = data3.callIndex;
                  if (!(typeof data13 == "number" && (!(data13 % 1) && !isNaN(data13)) && isFinite(data13))) {
                    const err37 = { instancePath: instancePath + "/entries/" + i0 + "/callIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/callIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err37];
                    } else {
                      vErrors.push(err37);
                    }
                    errors++;
                  }
                  if (typeof data13 == "number" && isFinite(data13)) {
                    if (data13 > 9007199254740991 || isNaN(data13)) {
                      const err38 = { instancePath: instancePath + "/entries/" + i0 + "/callIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/callIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err38];
                      } else {
                        vErrors.push(err38);
                      }
                      errors++;
                    }
                    if (data13 < 0 || isNaN(data13)) {
                      const err39 = { instancePath: instancePath + "/entries/" + i0 + "/callIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/callIndex/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err39];
                      } else {
                        vErrors.push(err39);
                      }
                      errors++;
                    }
                  }
                }
                if (data3.parentActionId !== void 0) {
                  let data14 = data3.parentActionId;
                  if (typeof data14 === "string") {
                    if (!pattern0.test(data14)) {
                      const err40 = { instancePath: instancePath + "/entries/" + i0 + "/parentActionId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/parentActionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err40];
                      } else {
                        vErrors.push(err40);
                      }
                      errors++;
                    }
                  } else {
                    const err41 = { instancePath: instancePath + "/entries/" + i0 + "/parentActionId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/parentActionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err41];
                    } else {
                      vErrors.push(err41);
                    }
                    errors++;
                  }
                }
                if (data3.title !== void 0) {
                  if (typeof data3.title !== "string") {
                    const err42 = { instancePath: instancePath + "/entries/" + i0 + "/title", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/title/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err42];
                    } else {
                      vErrors.push(err42);
                    }
                    errors++;
                  }
                }
                if (data3.preview !== void 0) {
                  if (typeof data3.preview !== "string") {
                    const err43 = { instancePath: instancePath + "/entries/" + i0 + "/preview", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/preview/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err43];
                    } else {
                      vErrors.push(err43);
                    }
                    errors++;
                  }
                }
                if (data3.previewTruncated !== void 0) {
                  if (typeof data3.previewTruncated !== "boolean") {
                    const err44 = { instancePath: instancePath + "/entries/" + i0 + "/previewTruncated", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/previewTruncated/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                    if (vErrors === null) {
                      vErrors = [err44];
                    } else {
                      vErrors.push(err44);
                    }
                    errors++;
                  }
                }
                if (data3.inputPreview !== void 0) {
                  if (typeof data3.inputPreview !== "string") {
                    const err45 = { instancePath: instancePath + "/entries/" + i0 + "/inputPreview", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/inputPreview/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err45];
                    } else {
                      vErrors.push(err45);
                    }
                    errors++;
                  }
                }
                if (data3.resultPreview !== void 0) {
                  if (typeof data3.resultPreview !== "string") {
                    const err46 = { instancePath: instancePath + "/entries/" + i0 + "/resultPreview", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/resultPreview/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err46];
                    } else {
                      vErrors.push(err46);
                    }
                    errors++;
                  }
                }
                if (data3.modelCallId !== void 0) {
                  if (typeof data3.modelCallId !== "string") {
                    const err47 = { instancePath: instancePath + "/entries/" + i0 + "/modelCallId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/modelCallId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err47];
                    } else {
                      vErrors.push(err47);
                    }
                    errors++;
                  }
                }
                if (data3.modelStage !== void 0) {
                  let data21 = data3.modelStage;
                  if (typeof data21 !== "string") {
                    const err48 = { instancePath: instancePath + "/entries/" + i0 + "/modelStage", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/modelStage/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err48];
                    } else {
                      vErrors.push(err48);
                    }
                    errors++;
                  }
                  if (!(data21 === "think" || data21 === "decide")) {
                    const err49 = { instancePath: instancePath + "/entries/" + i0 + "/modelStage", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/modelStage/enum", keyword: "enum", params: { allowedValues: schema15.properties.modelStage.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err49];
                    } else {
                      vErrors.push(err49);
                    }
                    errors++;
                  }
                }
              } else {
                const err50 = { instancePath: instancePath + "/entries/" + i0, schemaPath: "#/definitions/BrowserTrajectoryEntry/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
            }
          } else {
            const err51 = { instancePath: instancePath + "/entries", schemaPath: "#/properties/entries/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err51];
            } else {
              vErrors.push(err51);
            }
            errors++;
          }
        }
        if (data.total !== void 0) {
          let data22 = data.total;
          if (!(typeof data22 == "number" && (!(data22 % 1) && !isNaN(data22)) && isFinite(data22))) {
            const err52 = { instancePath: instancePath + "/total", schemaPath: "#/properties/total/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err52];
            } else {
              vErrors.push(err52);
            }
            errors++;
          }
          if (typeof data22 == "number" && isFinite(data22)) {
            if (data22 > 9007199254740991 || isNaN(data22)) {
              const err53 = { instancePath: instancePath + "/total", schemaPath: "#/properties/total/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err53];
              } else {
                vErrors.push(err53);
              }
              errors++;
            }
            if (data22 < 0 || isNaN(data22)) {
              const err54 = { instancePath: instancePath + "/total", schemaPath: "#/properties/total/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err54];
              } else {
                vErrors.push(err54);
              }
              errors++;
            }
          }
        }
        if (data.committedThroughSequence !== void 0) {
          let data23 = data.committedThroughSequence;
          if (!(typeof data23 == "number" && (!(data23 % 1) && !isNaN(data23)) && isFinite(data23))) {
            const err55 = { instancePath: instancePath + "/committedThroughSequence", schemaPath: "#/properties/committedThroughSequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err55];
            } else {
              vErrors.push(err55);
            }
            errors++;
          }
          if (typeof data23 == "number" && isFinite(data23)) {
            if (data23 > 9007199254740991 || isNaN(data23)) {
              const err56 = { instancePath: instancePath + "/committedThroughSequence", schemaPath: "#/properties/committedThroughSequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err56];
              } else {
                vErrors.push(err56);
              }
              errors++;
            }
            if (data23 < 0 || isNaN(data23)) {
              const err57 = { instancePath: instancePath + "/committedThroughSequence", schemaPath: "#/properties/committedThroughSequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err57];
              } else {
                vErrors.push(err57);
              }
              errors++;
            }
          }
        }
        if (data.nextCursor !== void 0) {
          let data24 = data.nextCursor;
          if (typeof data24 !== "string" && data24 !== null) {
            const err58 = { instancePath: instancePath + "/nextCursor", schemaPath: "#/properties/nextCursor/type", keyword: "type", params: { type: schema12.properties.nextCursor.type }, message: "must be string,null" };
            if (vErrors === null) {
              vErrors = [err58];
            } else {
              vErrors.push(err58);
            }
            errors++;
          }
        }
        if (data.contextBefore !== void 0) {
          let data25 = data.contextBefore;
          if (Array.isArray(data25)) {
            const len1 = data25.length;
            for (let i1 = 0; i1 < len1; i1++) {
              let data26 = data25[i1];
              if (data26 && typeof data26 == "object" && !Array.isArray(data26)) {
                if (data26.eventId === void 0) {
                  const err59 = { instancePath: instancePath + "/contextBefore/" + i1, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "eventId" }, message: "must have required property 'eventId'" };
                  if (vErrors === null) {
                    vErrors = [err59];
                  } else {
                    vErrors.push(err59);
                  }
                  errors++;
                }
                if (data26.sequence === void 0) {
                  const err60 = { instancePath: instancePath + "/contextBefore/" + i1, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
                  if (vErrors === null) {
                    vErrors = [err60];
                  } else {
                    vErrors.push(err60);
                  }
                  errors++;
                }
                if (data26.occurredAt === void 0) {
                  const err61 = { instancePath: instancePath + "/contextBefore/" + i1, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "occurredAt" }, message: "must have required property 'occurredAt'" };
                  if (vErrors === null) {
                    vErrors = [err61];
                  } else {
                    vErrors.push(err61);
                  }
                  errors++;
                }
                if (data26.eventType === void 0) {
                  const err62 = { instancePath: instancePath + "/contextBefore/" + i1, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "eventType" }, message: "must have required property 'eventType'" };
                  if (vErrors === null) {
                    vErrors = [err62];
                  } else {
                    vErrors.push(err62);
                  }
                  errors++;
                }
                if (data26.category === void 0) {
                  const err63 = { instancePath: instancePath + "/contextBefore/" + i1, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "category" }, message: "must have required property 'category'" };
                  if (vErrors === null) {
                    vErrors = [err63];
                  } else {
                    vErrors.push(err63);
                  }
                  errors++;
                }
                if (data26.title === void 0) {
                  const err64 = { instancePath: instancePath + "/contextBefore/" + i1, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "title" }, message: "must have required property 'title'" };
                  if (vErrors === null) {
                    vErrors = [err64];
                  } else {
                    vErrors.push(err64);
                  }
                  errors++;
                }
                if (data26.preview === void 0) {
                  const err65 = { instancePath: instancePath + "/contextBefore/" + i1, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "preview" }, message: "must have required property 'preview'" };
                  if (vErrors === null) {
                    vErrors = [err65];
                  } else {
                    vErrors.push(err65);
                  }
                  errors++;
                }
                if (data26.previewTruncated === void 0) {
                  const err66 = { instancePath: instancePath + "/contextBefore/" + i1, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "previewTruncated" }, message: "must have required property 'previewTruncated'" };
                  if (vErrors === null) {
                    vErrors = [err66];
                  } else {
                    vErrors.push(err66);
                  }
                  errors++;
                }
                for (const key2 in data26) {
                  if (!func2.call(schema15.properties, key2)) {
                    const err67 = { instancePath: instancePath + "/contextBefore/" + i1, schemaPath: "#/definitions/BrowserTrajectoryEntry/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err67];
                    } else {
                      vErrors.push(err67);
                    }
                    errors++;
                  }
                }
                if (data26.eventId !== void 0) {
                  let data27 = data26.eventId;
                  if (typeof data27 === "string") {
                    if (!pattern0.test(data27)) {
                      const err68 = { instancePath: instancePath + "/contextBefore/" + i1 + "/eventId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/eventId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err68];
                      } else {
                        vErrors.push(err68);
                      }
                      errors++;
                    }
                  } else {
                    const err69 = { instancePath: instancePath + "/contextBefore/" + i1 + "/eventId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/eventId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err69];
                    } else {
                      vErrors.push(err69);
                    }
                    errors++;
                  }
                }
                if (data26.sequence !== void 0) {
                  let data28 = data26.sequence;
                  if (!(typeof data28 == "number" && (!(data28 % 1) && !isNaN(data28)) && isFinite(data28))) {
                    const err70 = { instancePath: instancePath + "/contextBefore/" + i1 + "/sequence", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/sequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err70];
                    } else {
                      vErrors.push(err70);
                    }
                    errors++;
                  }
                  if (typeof data28 == "number" && isFinite(data28)) {
                    if (data28 > 9007199254740991 || isNaN(data28)) {
                      const err71 = { instancePath: instancePath + "/contextBefore/" + i1 + "/sequence", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/sequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err71];
                      } else {
                        vErrors.push(err71);
                      }
                      errors++;
                    }
                    if (data28 < 1 || isNaN(data28)) {
                      const err72 = { instancePath: instancePath + "/contextBefore/" + i1 + "/sequence", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/sequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                      if (vErrors === null) {
                        vErrors = [err72];
                      } else {
                        vErrors.push(err72);
                      }
                      errors++;
                    }
                  }
                }
                if (data26.occurredAt !== void 0) {
                  if (typeof data26.occurredAt !== "string") {
                    const err73 = { instancePath: instancePath + "/contextBefore/" + i1 + "/occurredAt", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/occurredAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err73];
                    } else {
                      vErrors.push(err73);
                    }
                    errors++;
                  }
                }
                if (data26.eventType !== void 0) {
                  if (typeof data26.eventType !== "string") {
                    const err74 = { instancePath: instancePath + "/contextBefore/" + i1 + "/eventType", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/eventType/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err74];
                    } else {
                      vErrors.push(err74);
                    }
                    errors++;
                  }
                }
                if (data26.category !== void 0) {
                  let data31 = data26.category;
                  if (typeof data31 !== "string") {
                    const err75 = { instancePath: instancePath + "/contextBefore/" + i1 + "/category", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/category/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err75];
                    } else {
                      vErrors.push(err75);
                    }
                    errors++;
                  }
                  if (!(data31 === "lifecycle" || data31 === "decision" || data31 === "memory" || data31 === "action" || data31 === "tool" || data31 === "observation" || data31 === "terminal" || data31 === "commit")) {
                    const err76 = { instancePath: instancePath + "/contextBefore/" + i1 + "/category", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/category/enum", keyword: "enum", params: { allowedValues: schema15.properties.category.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err76];
                    } else {
                      vErrors.push(err76);
                    }
                    errors++;
                  }
                }
                if (data26.executionUnitId !== void 0) {
                  let data32 = data26.executionUnitId;
                  if (typeof data32 === "string") {
                    if (!pattern0.test(data32)) {
                      const err77 = { instancePath: instancePath + "/contextBefore/" + i1 + "/executionUnitId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/executionUnitId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err77];
                      } else {
                        vErrors.push(err77);
                      }
                      errors++;
                    }
                  } else {
                    const err78 = { instancePath: instancePath + "/contextBefore/" + i1 + "/executionUnitId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err78];
                    } else {
                      vErrors.push(err78);
                    }
                    errors++;
                  }
                }
                if (data26.stepIndex !== void 0) {
                  let data33 = data26.stepIndex;
                  if (!(typeof data33 == "number" && (!(data33 % 1) && !isNaN(data33)) && isFinite(data33))) {
                    const err79 = { instancePath: instancePath + "/contextBefore/" + i1 + "/stepIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/stepIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err79];
                    } else {
                      vErrors.push(err79);
                    }
                    errors++;
                  }
                  if (typeof data33 == "number" && isFinite(data33)) {
                    if (data33 > 9007199254740991 || isNaN(data33)) {
                      const err80 = { instancePath: instancePath + "/contextBefore/" + i1 + "/stepIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/stepIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err80];
                      } else {
                        vErrors.push(err80);
                      }
                      errors++;
                    }
                  }
                }
                if (data26.actionId !== void 0) {
                  let data34 = data26.actionId;
                  if (typeof data34 === "string") {
                    if (!pattern0.test(data34)) {
                      const err81 = { instancePath: instancePath + "/contextBefore/" + i1 + "/actionId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err81];
                      } else {
                        vErrors.push(err81);
                      }
                      errors++;
                    }
                  } else {
                    const err82 = { instancePath: instancePath + "/contextBefore/" + i1 + "/actionId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err82];
                    } else {
                      vErrors.push(err82);
                    }
                    errors++;
                  }
                }
                if (data26.programId !== void 0) {
                  let data35 = data26.programId;
                  if (typeof data35 === "string") {
                    if (!pattern0.test(data35)) {
                      const err83 = { instancePath: instancePath + "/contextBefore/" + i1 + "/programId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/programId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err83];
                      } else {
                        vErrors.push(err83);
                      }
                      errors++;
                    }
                  } else {
                    const err84 = { instancePath: instancePath + "/contextBefore/" + i1 + "/programId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/programId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err84];
                    } else {
                      vErrors.push(err84);
                    }
                    errors++;
                  }
                }
                if (data26.callIndex !== void 0) {
                  let data36 = data26.callIndex;
                  if (!(typeof data36 == "number" && (!(data36 % 1) && !isNaN(data36)) && isFinite(data36))) {
                    const err85 = { instancePath: instancePath + "/contextBefore/" + i1 + "/callIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/callIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err85];
                    } else {
                      vErrors.push(err85);
                    }
                    errors++;
                  }
                  if (typeof data36 == "number" && isFinite(data36)) {
                    if (data36 > 9007199254740991 || isNaN(data36)) {
                      const err86 = { instancePath: instancePath + "/contextBefore/" + i1 + "/callIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/callIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err86];
                      } else {
                        vErrors.push(err86);
                      }
                      errors++;
                    }
                    if (data36 < 0 || isNaN(data36)) {
                      const err87 = { instancePath: instancePath + "/contextBefore/" + i1 + "/callIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/callIndex/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err87];
                      } else {
                        vErrors.push(err87);
                      }
                      errors++;
                    }
                  }
                }
                if (data26.parentActionId !== void 0) {
                  let data37 = data26.parentActionId;
                  if (typeof data37 === "string") {
                    if (!pattern0.test(data37)) {
                      const err88 = { instancePath: instancePath + "/contextBefore/" + i1 + "/parentActionId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/parentActionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err88];
                      } else {
                        vErrors.push(err88);
                      }
                      errors++;
                    }
                  } else {
                    const err89 = { instancePath: instancePath + "/contextBefore/" + i1 + "/parentActionId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/parentActionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err89];
                    } else {
                      vErrors.push(err89);
                    }
                    errors++;
                  }
                }
                if (data26.title !== void 0) {
                  if (typeof data26.title !== "string") {
                    const err90 = { instancePath: instancePath + "/contextBefore/" + i1 + "/title", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/title/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err90];
                    } else {
                      vErrors.push(err90);
                    }
                    errors++;
                  }
                }
                if (data26.preview !== void 0) {
                  if (typeof data26.preview !== "string") {
                    const err91 = { instancePath: instancePath + "/contextBefore/" + i1 + "/preview", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/preview/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err91];
                    } else {
                      vErrors.push(err91);
                    }
                    errors++;
                  }
                }
                if (data26.previewTruncated !== void 0) {
                  if (typeof data26.previewTruncated !== "boolean") {
                    const err92 = { instancePath: instancePath + "/contextBefore/" + i1 + "/previewTruncated", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/previewTruncated/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                    if (vErrors === null) {
                      vErrors = [err92];
                    } else {
                      vErrors.push(err92);
                    }
                    errors++;
                  }
                }
                if (data26.inputPreview !== void 0) {
                  if (typeof data26.inputPreview !== "string") {
                    const err93 = { instancePath: instancePath + "/contextBefore/" + i1 + "/inputPreview", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/inputPreview/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err93];
                    } else {
                      vErrors.push(err93);
                    }
                    errors++;
                  }
                }
                if (data26.resultPreview !== void 0) {
                  if (typeof data26.resultPreview !== "string") {
                    const err94 = { instancePath: instancePath + "/contextBefore/" + i1 + "/resultPreview", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/resultPreview/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err94];
                    } else {
                      vErrors.push(err94);
                    }
                    errors++;
                  }
                }
                if (data26.modelCallId !== void 0) {
                  if (typeof data26.modelCallId !== "string") {
                    const err95 = { instancePath: instancePath + "/contextBefore/" + i1 + "/modelCallId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/modelCallId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err95];
                    } else {
                      vErrors.push(err95);
                    }
                    errors++;
                  }
                }
                if (data26.modelStage !== void 0) {
                  let data44 = data26.modelStage;
                  if (typeof data44 !== "string") {
                    const err96 = { instancePath: instancePath + "/contextBefore/" + i1 + "/modelStage", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/modelStage/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err96];
                    } else {
                      vErrors.push(err96);
                    }
                    errors++;
                  }
                  if (!(data44 === "think" || data44 === "decide")) {
                    const err97 = { instancePath: instancePath + "/contextBefore/" + i1 + "/modelStage", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/modelStage/enum", keyword: "enum", params: { allowedValues: schema15.properties.modelStage.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err97];
                    } else {
                      vErrors.push(err97);
                    }
                    errors++;
                  }
                }
              } else {
                const err98 = { instancePath: instancePath + "/contextBefore/" + i1, schemaPath: "#/definitions/BrowserTrajectoryEntry/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err98];
                } else {
                  vErrors.push(err98);
                }
                errors++;
              }
            }
          } else {
            const err99 = { instancePath: instancePath + "/contextBefore", schemaPath: "#/properties/contextBefore/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err99];
            } else {
              vErrors.push(err99);
            }
            errors++;
          }
        }
        if (data.contextAfter !== void 0) {
          let data45 = data.contextAfter;
          if (Array.isArray(data45)) {
            const len2 = data45.length;
            for (let i2 = 0; i2 < len2; i2++) {
              let data46 = data45[i2];
              if (data46 && typeof data46 == "object" && !Array.isArray(data46)) {
                if (data46.eventId === void 0) {
                  const err100 = { instancePath: instancePath + "/contextAfter/" + i2, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "eventId" }, message: "must have required property 'eventId'" };
                  if (vErrors === null) {
                    vErrors = [err100];
                  } else {
                    vErrors.push(err100);
                  }
                  errors++;
                }
                if (data46.sequence === void 0) {
                  const err101 = { instancePath: instancePath + "/contextAfter/" + i2, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
                  if (vErrors === null) {
                    vErrors = [err101];
                  } else {
                    vErrors.push(err101);
                  }
                  errors++;
                }
                if (data46.occurredAt === void 0) {
                  const err102 = { instancePath: instancePath + "/contextAfter/" + i2, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "occurredAt" }, message: "must have required property 'occurredAt'" };
                  if (vErrors === null) {
                    vErrors = [err102];
                  } else {
                    vErrors.push(err102);
                  }
                  errors++;
                }
                if (data46.eventType === void 0) {
                  const err103 = { instancePath: instancePath + "/contextAfter/" + i2, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "eventType" }, message: "must have required property 'eventType'" };
                  if (vErrors === null) {
                    vErrors = [err103];
                  } else {
                    vErrors.push(err103);
                  }
                  errors++;
                }
                if (data46.category === void 0) {
                  const err104 = { instancePath: instancePath + "/contextAfter/" + i2, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "category" }, message: "must have required property 'category'" };
                  if (vErrors === null) {
                    vErrors = [err104];
                  } else {
                    vErrors.push(err104);
                  }
                  errors++;
                }
                if (data46.title === void 0) {
                  const err105 = { instancePath: instancePath + "/contextAfter/" + i2, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "title" }, message: "must have required property 'title'" };
                  if (vErrors === null) {
                    vErrors = [err105];
                  } else {
                    vErrors.push(err105);
                  }
                  errors++;
                }
                if (data46.preview === void 0) {
                  const err106 = { instancePath: instancePath + "/contextAfter/" + i2, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "preview" }, message: "must have required property 'preview'" };
                  if (vErrors === null) {
                    vErrors = [err106];
                  } else {
                    vErrors.push(err106);
                  }
                  errors++;
                }
                if (data46.previewTruncated === void 0) {
                  const err107 = { instancePath: instancePath + "/contextAfter/" + i2, schemaPath: "#/definitions/BrowserTrajectoryEntry/required", keyword: "required", params: { missingProperty: "previewTruncated" }, message: "must have required property 'previewTruncated'" };
                  if (vErrors === null) {
                    vErrors = [err107];
                  } else {
                    vErrors.push(err107);
                  }
                  errors++;
                }
                for (const key3 in data46) {
                  if (!func2.call(schema15.properties, key3)) {
                    const err108 = { instancePath: instancePath + "/contextAfter/" + i2, schemaPath: "#/definitions/BrowserTrajectoryEntry/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err108];
                    } else {
                      vErrors.push(err108);
                    }
                    errors++;
                  }
                }
                if (data46.eventId !== void 0) {
                  let data47 = data46.eventId;
                  if (typeof data47 === "string") {
                    if (!pattern0.test(data47)) {
                      const err109 = { instancePath: instancePath + "/contextAfter/" + i2 + "/eventId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/eventId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err109];
                      } else {
                        vErrors.push(err109);
                      }
                      errors++;
                    }
                  } else {
                    const err110 = { instancePath: instancePath + "/contextAfter/" + i2 + "/eventId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/eventId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err110];
                    } else {
                      vErrors.push(err110);
                    }
                    errors++;
                  }
                }
                if (data46.sequence !== void 0) {
                  let data48 = data46.sequence;
                  if (!(typeof data48 == "number" && (!(data48 % 1) && !isNaN(data48)) && isFinite(data48))) {
                    const err111 = { instancePath: instancePath + "/contextAfter/" + i2 + "/sequence", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/sequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err111];
                    } else {
                      vErrors.push(err111);
                    }
                    errors++;
                  }
                  if (typeof data48 == "number" && isFinite(data48)) {
                    if (data48 > 9007199254740991 || isNaN(data48)) {
                      const err112 = { instancePath: instancePath + "/contextAfter/" + i2 + "/sequence", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/sequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err112];
                      } else {
                        vErrors.push(err112);
                      }
                      errors++;
                    }
                    if (data48 < 1 || isNaN(data48)) {
                      const err113 = { instancePath: instancePath + "/contextAfter/" + i2 + "/sequence", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/sequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                      if (vErrors === null) {
                        vErrors = [err113];
                      } else {
                        vErrors.push(err113);
                      }
                      errors++;
                    }
                  }
                }
                if (data46.occurredAt !== void 0) {
                  if (typeof data46.occurredAt !== "string") {
                    const err114 = { instancePath: instancePath + "/contextAfter/" + i2 + "/occurredAt", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/occurredAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err114];
                    } else {
                      vErrors.push(err114);
                    }
                    errors++;
                  }
                }
                if (data46.eventType !== void 0) {
                  if (typeof data46.eventType !== "string") {
                    const err115 = { instancePath: instancePath + "/contextAfter/" + i2 + "/eventType", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/eventType/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err115];
                    } else {
                      vErrors.push(err115);
                    }
                    errors++;
                  }
                }
                if (data46.category !== void 0) {
                  let data51 = data46.category;
                  if (typeof data51 !== "string") {
                    const err116 = { instancePath: instancePath + "/contextAfter/" + i2 + "/category", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/category/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err116];
                    } else {
                      vErrors.push(err116);
                    }
                    errors++;
                  }
                  if (!(data51 === "lifecycle" || data51 === "decision" || data51 === "memory" || data51 === "action" || data51 === "tool" || data51 === "observation" || data51 === "terminal" || data51 === "commit")) {
                    const err117 = { instancePath: instancePath + "/contextAfter/" + i2 + "/category", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/category/enum", keyword: "enum", params: { allowedValues: schema15.properties.category.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err117];
                    } else {
                      vErrors.push(err117);
                    }
                    errors++;
                  }
                }
                if (data46.executionUnitId !== void 0) {
                  let data52 = data46.executionUnitId;
                  if (typeof data52 === "string") {
                    if (!pattern0.test(data52)) {
                      const err118 = { instancePath: instancePath + "/contextAfter/" + i2 + "/executionUnitId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/executionUnitId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err118];
                      } else {
                        vErrors.push(err118);
                      }
                      errors++;
                    }
                  } else {
                    const err119 = { instancePath: instancePath + "/contextAfter/" + i2 + "/executionUnitId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err119];
                    } else {
                      vErrors.push(err119);
                    }
                    errors++;
                  }
                }
                if (data46.stepIndex !== void 0) {
                  let data53 = data46.stepIndex;
                  if (!(typeof data53 == "number" && (!(data53 % 1) && !isNaN(data53)) && isFinite(data53))) {
                    const err120 = { instancePath: instancePath + "/contextAfter/" + i2 + "/stepIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/stepIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err120];
                    } else {
                      vErrors.push(err120);
                    }
                    errors++;
                  }
                  if (typeof data53 == "number" && isFinite(data53)) {
                    if (data53 > 9007199254740991 || isNaN(data53)) {
                      const err121 = { instancePath: instancePath + "/contextAfter/" + i2 + "/stepIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/stepIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err121];
                      } else {
                        vErrors.push(err121);
                      }
                      errors++;
                    }
                  }
                }
                if (data46.actionId !== void 0) {
                  let data54 = data46.actionId;
                  if (typeof data54 === "string") {
                    if (!pattern0.test(data54)) {
                      const err122 = { instancePath: instancePath + "/contextAfter/" + i2 + "/actionId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err122];
                      } else {
                        vErrors.push(err122);
                      }
                      errors++;
                    }
                  } else {
                    const err123 = { instancePath: instancePath + "/contextAfter/" + i2 + "/actionId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err123];
                    } else {
                      vErrors.push(err123);
                    }
                    errors++;
                  }
                }
                if (data46.programId !== void 0) {
                  let data55 = data46.programId;
                  if (typeof data55 === "string") {
                    if (!pattern0.test(data55)) {
                      const err124 = { instancePath: instancePath + "/contextAfter/" + i2 + "/programId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/programId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err124];
                      } else {
                        vErrors.push(err124);
                      }
                      errors++;
                    }
                  } else {
                    const err125 = { instancePath: instancePath + "/contextAfter/" + i2 + "/programId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/programId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err125];
                    } else {
                      vErrors.push(err125);
                    }
                    errors++;
                  }
                }
                if (data46.callIndex !== void 0) {
                  let data56 = data46.callIndex;
                  if (!(typeof data56 == "number" && (!(data56 % 1) && !isNaN(data56)) && isFinite(data56))) {
                    const err126 = { instancePath: instancePath + "/contextAfter/" + i2 + "/callIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/callIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err126];
                    } else {
                      vErrors.push(err126);
                    }
                    errors++;
                  }
                  if (typeof data56 == "number" && isFinite(data56)) {
                    if (data56 > 9007199254740991 || isNaN(data56)) {
                      const err127 = { instancePath: instancePath + "/contextAfter/" + i2 + "/callIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/callIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err127];
                      } else {
                        vErrors.push(err127);
                      }
                      errors++;
                    }
                    if (data56 < 0 || isNaN(data56)) {
                      const err128 = { instancePath: instancePath + "/contextAfter/" + i2 + "/callIndex", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/callIndex/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err128];
                      } else {
                        vErrors.push(err128);
                      }
                      errors++;
                    }
                  }
                }
                if (data46.parentActionId !== void 0) {
                  let data57 = data46.parentActionId;
                  if (typeof data57 === "string") {
                    if (!pattern0.test(data57)) {
                      const err129 = { instancePath: instancePath + "/contextAfter/" + i2 + "/parentActionId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/parentActionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err129];
                      } else {
                        vErrors.push(err129);
                      }
                      errors++;
                    }
                  } else {
                    const err130 = { instancePath: instancePath + "/contextAfter/" + i2 + "/parentActionId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/parentActionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err130];
                    } else {
                      vErrors.push(err130);
                    }
                    errors++;
                  }
                }
                if (data46.title !== void 0) {
                  if (typeof data46.title !== "string") {
                    const err131 = { instancePath: instancePath + "/contextAfter/" + i2 + "/title", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/title/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err131];
                    } else {
                      vErrors.push(err131);
                    }
                    errors++;
                  }
                }
                if (data46.preview !== void 0) {
                  if (typeof data46.preview !== "string") {
                    const err132 = { instancePath: instancePath + "/contextAfter/" + i2 + "/preview", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/preview/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err132];
                    } else {
                      vErrors.push(err132);
                    }
                    errors++;
                  }
                }
                if (data46.previewTruncated !== void 0) {
                  if (typeof data46.previewTruncated !== "boolean") {
                    const err133 = { instancePath: instancePath + "/contextAfter/" + i2 + "/previewTruncated", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/previewTruncated/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                    if (vErrors === null) {
                      vErrors = [err133];
                    } else {
                      vErrors.push(err133);
                    }
                    errors++;
                  }
                }
                if (data46.inputPreview !== void 0) {
                  if (typeof data46.inputPreview !== "string") {
                    const err134 = { instancePath: instancePath + "/contextAfter/" + i2 + "/inputPreview", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/inputPreview/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err134];
                    } else {
                      vErrors.push(err134);
                    }
                    errors++;
                  }
                }
                if (data46.resultPreview !== void 0) {
                  if (typeof data46.resultPreview !== "string") {
                    const err135 = { instancePath: instancePath + "/contextAfter/" + i2 + "/resultPreview", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/resultPreview/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err135];
                    } else {
                      vErrors.push(err135);
                    }
                    errors++;
                  }
                }
                if (data46.modelCallId !== void 0) {
                  if (typeof data46.modelCallId !== "string") {
                    const err136 = { instancePath: instancePath + "/contextAfter/" + i2 + "/modelCallId", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/modelCallId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err136];
                    } else {
                      vErrors.push(err136);
                    }
                    errors++;
                  }
                }
                if (data46.modelStage !== void 0) {
                  let data64 = data46.modelStage;
                  if (typeof data64 !== "string") {
                    const err137 = { instancePath: instancePath + "/contextAfter/" + i2 + "/modelStage", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/modelStage/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err137];
                    } else {
                      vErrors.push(err137);
                    }
                    errors++;
                  }
                  if (!(data64 === "think" || data64 === "decide")) {
                    const err138 = { instancePath: instancePath + "/contextAfter/" + i2 + "/modelStage", schemaPath: "#/definitions/BrowserTrajectoryEntry/properties/modelStage/enum", keyword: "enum", params: { allowedValues: schema15.properties.modelStage.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err138];
                    } else {
                      vErrors.push(err138);
                    }
                    errors++;
                  }
                }
              } else {
                const err139 = { instancePath: instancePath + "/contextAfter/" + i2, schemaPath: "#/definitions/BrowserTrajectoryEntry/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err139];
                } else {
                  vErrors.push(err139);
                }
                errors++;
              }
            }
          } else {
            const err140 = { instancePath: instancePath + "/contextAfter", schemaPath: "#/properties/contextAfter/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err140];
            } else {
              vErrors.push(err140);
            }
            errors++;
          }
        }
      } else {
        const err141 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err141];
        } else {
          vErrors.push(err141);
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
export default require_BrowserExecutionUnitPage_validator();
