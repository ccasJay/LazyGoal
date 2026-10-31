var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserTrajectoryPage-validator.cjs
var require_BrowserTrajectoryPage_validator = __commonJS({
  "BrowserTrajectoryPage-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "goalId": { "type": "string", "pattern": "\\S" }, "run": { "$ref": "#/definitions/BrowserTrajectoryRun" }, "entries": { "type": "array", "items": { "$ref": "#/definitions/BrowserTrajectoryEntry" } }, "total": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "committedCount": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "previousCursor": { "type": ["number", "null"] }, "nextCursor": { "type": ["number", "null"] }, "locatedSequence": { "type": ["number", "null"] } }, "required": ["goalId", "run", "entries", "total", "committedCount", "previousCursor", "nextCursor", "locatedSequence"], "additionalProperties": false, "description": "\u8F68\u8FF9\u5206\u9875\u67E5\u8BE2\u54CD\u5E94\u9875\u3002" };
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
        if (data.committedCount === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "committedCount" }, message: "must have required property 'committedCount'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.previousCursor === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "previousCursor" }, message: "must have required property 'previousCursor'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.nextCursor === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "nextCursor" }, message: "must have required property 'nextCursor'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data.locatedSequence === void 0) {
          const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "locatedSequence" }, message: "must have required property 'locatedSequence'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "goalId" || key0 === "run" || key0 === "entries" || key0 === "total" || key0 === "committedCount" || key0 === "previousCursor" || key0 === "nextCursor" || key0 === "locatedSequence")) {
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
        if (data.committedCount !== void 0) {
          let data23 = data.committedCount;
          if (!(typeof data23 == "number" && (!(data23 % 1) && !isNaN(data23)) && isFinite(data23))) {
            const err55 = { instancePath: instancePath + "/committedCount", schemaPath: "#/properties/committedCount/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err55];
            } else {
              vErrors.push(err55);
            }
            errors++;
          }
          if (typeof data23 == "number" && isFinite(data23)) {
            if (data23 > 9007199254740991 || isNaN(data23)) {
              const err56 = { instancePath: instancePath + "/committedCount", schemaPath: "#/properties/committedCount/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err56];
              } else {
                vErrors.push(err56);
              }
              errors++;
            }
            if (data23 < 0 || isNaN(data23)) {
              const err57 = { instancePath: instancePath + "/committedCount", schemaPath: "#/properties/committedCount/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err57];
              } else {
                vErrors.push(err57);
              }
              errors++;
            }
          }
        }
        if (data.previousCursor !== void 0) {
          let data24 = data.previousCursor;
          if (!(typeof data24 == "number" && isFinite(data24)) && data24 !== null) {
            const err58 = { instancePath: instancePath + "/previousCursor", schemaPath: "#/properties/previousCursor/type", keyword: "type", params: { type: schema12.properties.previousCursor.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err58];
            } else {
              vErrors.push(err58);
            }
            errors++;
          }
        }
        if (data.nextCursor !== void 0) {
          let data25 = data.nextCursor;
          if (!(typeof data25 == "number" && isFinite(data25)) && data25 !== null) {
            const err59 = { instancePath: instancePath + "/nextCursor", schemaPath: "#/properties/nextCursor/type", keyword: "type", params: { type: schema12.properties.nextCursor.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err59];
            } else {
              vErrors.push(err59);
            }
            errors++;
          }
        }
        if (data.locatedSequence !== void 0) {
          let data26 = data.locatedSequence;
          if (!(typeof data26 == "number" && isFinite(data26)) && data26 !== null) {
            const err60 = { instancePath: instancePath + "/locatedSequence", schemaPath: "#/properties/locatedSequence/type", keyword: "type", params: { type: schema12.properties.locatedSequence.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err60];
            } else {
              vErrors.push(err60);
            }
            errors++;
          }
        }
      } else {
        const err61 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err61];
        } else {
          vErrors.push(err61);
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
export default require_BrowserTrajectoryPage_validator();
