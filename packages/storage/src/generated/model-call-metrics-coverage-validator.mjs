var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// ModelCallMetricsCoverageFileRecord-validator.cjs
var require_ModelCallMetricsCoverageFileRecord_validator = __commonJS({
  "ModelCallMetricsCoverageFileRecord-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      const _errs1 = errors;
      let valid1 = false;
      const _errs2 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.recordType === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/0/required", keyword: "required", params: { missingProperty: "recordType" }, message: "must have required property 'recordType'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.goalId === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/0/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.historyCovered === void 0) {
          const err2 = { instancePath, schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/0/required", keyword: "required", params: { missingProperty: "historyCovered" }, message: "must have required property 'historyCovered'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.occurredAt === void 0) {
          const err3 = { instancePath, schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/0/required", keyword: "required", params: { missingProperty: "occurredAt" }, message: "must have required property 'occurredAt'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "recordType" || key0 === "goalId" || key0 === "historyCovered" || key0 === "occurredAt")) {
            const err4 = { instancePath, schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.recordType !== void 0) {
          let data0 = data.recordType;
          if (typeof data0 !== "string") {
            const err5 = { instancePath: instancePath + "/recordType", schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/0/properties/recordType/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if ("goal_initialized" !== data0) {
            const err6 = { instancePath: instancePath + "/recordType", schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/0/properties/recordType/const", keyword: "const", params: { allowedValue: "goal_initialized" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          if (typeof data.goalId !== "string") {
            const err7 = { instancePath: instancePath + "/goalId", schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/0/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.historyCovered !== void 0) {
          if (typeof data.historyCovered !== "boolean") {
            const err8 = { instancePath: instancePath + "/historyCovered", schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/0/properties/historyCovered/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.occurredAt !== void 0) {
          if (typeof data.occurredAt !== "string") {
            const err9 = { instancePath: instancePath + "/occurredAt", schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/0/properties/occurredAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
      } else {
        const err10 = { instancePath, schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
      var _valid0 = _errs2 === errors;
      valid1 = valid1 || _valid0;
      if (!valid1) {
        const _errs13 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.recordType === void 0) {
            const err11 = { instancePath, schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/1/required", keyword: "required", params: { missingProperty: "recordType" }, message: "must have required property 'recordType'" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          if (data.goalId === void 0) {
            const err12 = { instancePath, schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/1/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
          if (data.runId === void 0) {
            const err13 = { instancePath, schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/1/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
          if (data.callId === void 0) {
            const err14 = { instancePath, schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/1/required", keyword: "required", params: { missingProperty: "callId" }, message: "must have required property 'callId'" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          if (data.occurredAt === void 0) {
            const err15 = { instancePath, schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/1/required", keyword: "required", params: { missingProperty: "occurredAt" }, message: "must have required property 'occurredAt'" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "recordType" || key1 === "goalId" || key1 === "runId" || key1 === "callId" || key1 === "occurredAt")) {
              const err16 = { instancePath, schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
          if (data.recordType !== void 0) {
            let data4 = data.recordType;
            if (typeof data4 !== "string") {
              const err17 = { instancePath: instancePath + "/recordType", schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/1/properties/recordType/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if ("call_gap" !== data4) {
              const err18 = { instancePath: instancePath + "/recordType", schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/1/properties/recordType/const", keyword: "const", params: { allowedValue: "call_gap" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
          if (data.goalId !== void 0) {
            if (typeof data.goalId !== "string") {
              const err19 = { instancePath: instancePath + "/goalId", schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/1/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
          }
          if (data.runId !== void 0) {
            if (typeof data.runId !== "string") {
              const err20 = { instancePath: instancePath + "/runId", schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/1/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
          }
          if (data.callId !== void 0) {
            if (typeof data.callId !== "string") {
              const err21 = { instancePath: instancePath + "/callId", schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/1/properties/callId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
          if (data.occurredAt !== void 0) {
            if (typeof data.occurredAt !== "string") {
              const err22 = { instancePath: instancePath + "/occurredAt", schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/1/properties/occurredAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
          }
        } else {
          const err23 = { instancePath, schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
        var _valid0 = _errs13 === errors;
        valid1 = valid1 || _valid0;
      }
      if (!valid1) {
        const err24 = { instancePath, schemaPath: "#/definitions/ModelCallMetricsCoverageFileRecord/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      } else {
        errors = _errs1;
        if (vErrors !== null) {
          if (_errs1) {
            vErrors.length = _errs1;
          } else {
            vErrors = null;
          }
        }
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_ModelCallMetricsCoverageFileRecord_validator();
