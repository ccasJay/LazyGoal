var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserModelSelectionResult-validator.cjs
var require_BrowserModelSelectionResult_validator = __commonJS({
  "BrowserModelSelectionResult-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "anyOf": [{ "type": "object", "properties": { "ok": { "type": "boolean", "const": true }, "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "modelId": { "type": "string", "pattern": "\\S" }, "defaultModelSaved": { "type": "boolean" } }, "required": ["ok", "goalId", "runId", "modelId", "defaultModelSaved"], "additionalProperties": false }, { "type": "object", "properties": { "ok": { "type": "boolean", "const": false }, "error": { "type": "string", "enum": ["goal_not_found", "stale_run", "goal_busy", "model_switch_not_allowed", "model_not_selectable", "model_catalog_unavailable", "model_selection_failed", "service_shutting_down"] } }, "required": ["ok", "error"], "additionalProperties": false }], "description": "\u6A21\u578B\u9009\u62E9\u7ED3\u679C\u3002" };
    var pattern0 = new RegExp("\\S", "u");
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      const _errs1 = errors;
      let valid1 = false;
      const _errs2 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.ok === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/0/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.goalId === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/0/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err2 = { instancePath, schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/0/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.modelId === void 0) {
          const err3 = { instancePath, schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/0/required", keyword: "required", params: { missingProperty: "modelId" }, message: "must have required property 'modelId'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.defaultModelSaved === void 0) {
          const err4 = { instancePath, schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/0/required", keyword: "required", params: { missingProperty: "defaultModelSaved" }, message: "must have required property 'defaultModelSaved'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "ok" || key0 === "goalId" || key0 === "runId" || key0 === "modelId" || key0 === "defaultModelSaved")) {
            const err5 = { instancePath, schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
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
            const err6 = { instancePath: instancePath + "/ok", schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/0/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if (true !== data0) {
            const err7 = { instancePath: instancePath + "/ok", schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/0/properties/ok/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
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
              const err8 = { instancePath: instancePath + "/goalId", schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/0/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          } else {
            const err9 = { instancePath: instancePath + "/goalId", schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/0/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
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
              const err10 = { instancePath: instancePath + "/runId", schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/0/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          } else {
            const err11 = { instancePath: instancePath + "/runId", schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/0/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.modelId !== void 0) {
          let data3 = data.modelId;
          if (typeof data3 === "string") {
            if (!pattern0.test(data3)) {
              const err12 = { instancePath: instancePath + "/modelId", schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/0/properties/modelId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          } else {
            const err13 = { instancePath: instancePath + "/modelId", schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/0/properties/modelId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.defaultModelSaved !== void 0) {
          if (typeof data.defaultModelSaved !== "boolean") {
            const err14 = { instancePath: instancePath + "/defaultModelSaved", schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/0/properties/defaultModelSaved/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
      } else {
        const err15 = { instancePath, schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
      var _valid0 = _errs2 === errors;
      valid1 = valid1 || _valid0;
      if (!valid1) {
        const _errs15 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.ok === void 0) {
            const err16 = { instancePath, schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
          if (data.error === void 0) {
            const err17 = { instancePath, schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "ok" || key1 === "error")) {
              const err18 = { instancePath, schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
          if (data.ok !== void 0) {
            let data5 = data.ok;
            if (typeof data5 !== "boolean") {
              const err19 = { instancePath: instancePath + "/ok", schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            if (false !== data5) {
              const err20 = { instancePath: instancePath + "/ok", schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
          }
          if (data.error !== void 0) {
            let data6 = data.error;
            if (typeof data6 !== "string") {
              const err21 = { instancePath: instancePath + "/error", schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/1/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
            if (!(data6 === "goal_not_found" || data6 === "stale_run" || data6 === "goal_busy" || data6 === "model_switch_not_allowed" || data6 === "model_not_selectable" || data6 === "model_catalog_unavailable" || data6 === "model_selection_failed" || data6 === "service_shutting_down")) {
              const err22 = { instancePath: instancePath + "/error", schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/1/properties/error/enum", keyword: "enum", params: { allowedValues: schema12.anyOf[1].properties.error.enum }, message: "must be equal to one of the allowed values" };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
          }
        } else {
          const err23 = { instancePath, schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
        var _valid0 = _errs15 === errors;
        valid1 = valid1 || _valid0;
      }
      if (!valid1) {
        const err24 = { instancePath, schemaPath: "#/definitions/BrowserModelSelectionResult/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
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
export default require_BrowserModelSelectionResult_validator();
