var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserActionDetailsResult-validator.cjs
var require_BrowserActionDetailsResult_validator = __commonJS({
  "BrowserActionDetailsResult-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "anyOf": [{ "type": "object", "properties": { "ok": { "type": "boolean", "const": true }, "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "actionId": { "type": "string", "pattern": "\\S" }, "toolId": { "type": "string", "pattern": "\\S" }, "input": {} }, "required": ["ok", "goalId", "runId", "actionId", "toolId", "input"], "additionalProperties": false }, { "type": "object", "properties": { "ok": { "type": "boolean", "const": false }, "error": { "type": "string", "enum": ["goal_not_found", "stale_run", "action_not_waiting", "action_details_unavailable"] } }, "required": ["ok", "error"], "additionalProperties": false }], "description": "Action \u5B8C\u6574\u8F93\u5165\u67E5\u8BE2\u7ED3\u679C\u3002" };
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
          const err0 = { instancePath, schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/0/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.goalId === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/0/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err2 = { instancePath, schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/0/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.actionId === void 0) {
          const err3 = { instancePath, schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/0/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.toolId === void 0) {
          const err4 = { instancePath, schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/0/required", keyword: "required", params: { missingProperty: "toolId" }, message: "must have required property 'toolId'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.input === void 0) {
          const err5 = { instancePath, schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/0/required", keyword: "required", params: { missingProperty: "input" }, message: "must have required property 'input'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "ok" || key0 === "goalId" || key0 === "runId" || key0 === "actionId" || key0 === "toolId" || key0 === "input")) {
            const err6 = { instancePath, schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.ok !== void 0) {
          let data0 = data.ok;
          if (typeof data0 !== "boolean") {
            const err7 = { instancePath: instancePath + "/ok", schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/0/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          if (true !== data0) {
            const err8 = { instancePath: instancePath + "/ok", schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/0/properties/ok/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data1 = data.goalId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err9 = { instancePath: instancePath + "/goalId", schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/0/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          } else {
            const err10 = { instancePath: instancePath + "/goalId", schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/0/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
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
              const err11 = { instancePath: instancePath + "/runId", schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/0/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          } else {
            const err12 = { instancePath: instancePath + "/runId", schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/0/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.actionId !== void 0) {
          let data3 = data.actionId;
          if (typeof data3 === "string") {
            if (!pattern0.test(data3)) {
              const err13 = { instancePath: instancePath + "/actionId", schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/0/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          } else {
            const err14 = { instancePath: instancePath + "/actionId", schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/0/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.toolId !== void 0) {
          let data4 = data.toolId;
          if (typeof data4 === "string") {
            if (!pattern0.test(data4)) {
              const err15 = { instancePath: instancePath + "/toolId", schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/0/properties/toolId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          } else {
            const err16 = { instancePath: instancePath + "/toolId", schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/0/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
      } else {
        const err17 = { instancePath, schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
      var _valid0 = _errs2 === errors;
      valid1 = valid1 || _valid0;
      if (!valid1) {
        const _errs15 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.ok === void 0) {
            const err18 = { instancePath, schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
          if (data.error === void 0) {
            const err19 = { instancePath, schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "ok" || key1 === "error")) {
              const err20 = { instancePath, schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
          }
          if (data.ok !== void 0) {
            let data5 = data.ok;
            if (typeof data5 !== "boolean") {
              const err21 = { instancePath: instancePath + "/ok", schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
            if (false !== data5) {
              const err22 = { instancePath: instancePath + "/ok", schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
          }
          if (data.error !== void 0) {
            let data6 = data.error;
            if (typeof data6 !== "string") {
              const err23 = { instancePath: instancePath + "/error", schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/1/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
            if (!(data6 === "goal_not_found" || data6 === "stale_run" || data6 === "action_not_waiting" || data6 === "action_details_unavailable")) {
              const err24 = { instancePath: instancePath + "/error", schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/1/properties/error/enum", keyword: "enum", params: { allowedValues: schema12.anyOf[1].properties.error.enum }, message: "must be equal to one of the allowed values" };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
          }
        } else {
          const err25 = { instancePath, schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
        var _valid0 = _errs15 === errors;
        valid1 = valid1 || _valid0;
      }
      if (!valid1) {
        const err26 = { instancePath, schemaPath: "#/definitions/BrowserActionDetailsResult/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
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
export default require_BrowserActionDetailsResult_validator();
