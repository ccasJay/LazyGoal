var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserGoalList-validator.cjs
var require_BrowserGoalList_validator = __commonJS({
  "BrowserGoalList-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema14 = { "type": "string", "enum": ["created", "running", "waiting", "completed", "failed", "cancelled"], "description": "Run \u751F\u547D\u5468\u671F\u72B6\u6001\u3002" };
    var pattern0 = new RegExp("\\S", "u");
    var schema16 = { "type": "string", "enum": ["active", "recoverable", "inactive"], "description": "Run \u8FDB\u7A0B\u6D3B\u52A8\u72B6\u6001\u3002" };
    function validate13(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
            const err4 = { instancePath: instancePath + "/state", schemaPath: "#/definitions/BrowserExecutionState/enum", keyword: "enum", params: { allowedValues: schema16.enum }, message: "must be equal to one of the allowed values" };
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
      validate13.errors = vErrors;
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
        if (data.intent === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "intent" }, message: "must have required property 'intent'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.workflowPhase === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "workflowPhase" }, message: "must have required property 'workflowPhase'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.runStatus === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runStatus" }, message: "must have required property 'runStatus'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.updatedAt === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "updatedAt" }, message: "must have required property 'updatedAt'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.archived === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "archived" }, message: "must have required property 'archived'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "goalId" || key0 === "runId" || key0 === "intent" || key0 === "workflowPhase" || key0 === "runStatus" || key0 === "execution" || key0 === "updatedAt" || key0 === "archived")) {
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
        if (data.runId !== void 0) {
          let data1 = data.runId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
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
        if (data.intent !== void 0) {
          if (typeof data.intent !== "string") {
            const err12 = { instancePath: instancePath + "/intent", schemaPath: "#/properties/intent/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.workflowPhase !== void 0) {
          if (typeof data.workflowPhase !== "string") {
            const err13 = { instancePath: instancePath + "/workflowPhase", schemaPath: "#/properties/workflowPhase/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.runStatus !== void 0) {
          let data4 = data.runStatus;
          if (typeof data4 !== "string") {
            const err14 = { instancePath: instancePath + "/runStatus", schemaPath: "#/definitions/BrowserRunStatus/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          if (!(data4 === "created" || data4 === "running" || data4 === "waiting" || data4 === "completed" || data4 === "failed" || data4 === "cancelled")) {
            const err15 = { instancePath: instancePath + "/runStatus", schemaPath: "#/definitions/BrowserRunStatus/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.execution !== void 0) {
          if (!validate13(data.execution, { instancePath: instancePath + "/execution", parentData: data, parentDataProperty: "execution", rootData })) {
            vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
            errors = vErrors.length;
          }
        }
        if (data.updatedAt !== void 0) {
          if (typeof data.updatedAt !== "string") {
            const err16 = { instancePath: instancePath + "/updatedAt", schemaPath: "#/properties/updatedAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data.archived !== void 0) {
          if (typeof data.archived !== "boolean") {
            const err17 = { instancePath: instancePath + "/archived", schemaPath: "#/properties/archived/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
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
      validate12.errors = vErrors;
      return errors === 0;
    }
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.goals === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "goals" }, message: "must have required property 'goals'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.unreadableCount === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "unreadableCount" }, message: "must have required property 'unreadableCount'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "goals" || key0 === "unreadableCount")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.goals !== void 0) {
          let data0 = data.goals;
          if (Array.isArray(data0)) {
            const len0 = data0.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate12(data0[i0], { instancePath: instancePath + "/goals/" + i0, parentData: data0, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err3 = { instancePath: instancePath + "/goals", schemaPath: "#/properties/goals/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.unreadableCount !== void 0) {
          let data2 = data.unreadableCount;
          if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
            const err4 = { instancePath: instancePath + "/unreadableCount", schemaPath: "#/properties/unreadableCount/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if (typeof data2 == "number" && isFinite(data2)) {
            if (data2 > 9007199254740991 || isNaN(data2)) {
              const err5 = { instancePath: instancePath + "/unreadableCount", schemaPath: "#/properties/unreadableCount/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            if (data2 < 0 || isNaN(data2)) {
              const err6 = { instancePath: instancePath + "/unreadableCount", schemaPath: "#/properties/unreadableCount/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          }
        }
      } else {
        const err7 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
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
export default require_BrowserGoalList_validator();
