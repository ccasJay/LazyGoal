var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserControlReceipt-validator.cjs
var require_BrowserControlReceipt_validator = __commonJS({
  "BrowserControlReceipt-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "anyOf": [{ "type": "object", "properties": { "intentId": { "type": "string" }, "status": { "type": "string", "enum": ["accepted", "existing"] }, "result": { "$ref": "#/definitions/BrowserControlIntentResult" } }, "required": ["intentId", "status", "result"], "additionalProperties": false }, { "type": "object", "properties": { "intentId": { "type": "string" }, "status": { "type": "string", "const": "rejected" }, "error": { "type": "string" }, "refresh": { "type": "boolean" }, "actualRevision": { "type": "integer", "maximum": 9007199254740991 } }, "required": ["intentId", "status", "error"], "additionalProperties": false }, { "type": "object", "properties": { "intentId": { "type": "string" }, "status": { "type": "string", "const": "unknown" } }, "required": ["intentId", "status"], "additionalProperties": false }], "description": "\u63A7\u5236\u547D\u4EE4\u7684\u53D7\u7406\u6536\u636E\uFF1B\u53EA\u8868\u8FBE\u53D7\u7406\u7ED3\u679C\uFF0C\u4E0D\u8868\u8FBE Runtime \u4E8B\u5B9E\u3002" };
    var schema20 = { "anyOf": [{ "type": "object", "properties": { "ok": { "type": "boolean", "const": true }, "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "existing": { "type": "boolean" } }, "required": ["ok", "goalId", "runId", "existing"], "additionalProperties": false }, { "type": "object", "properties": { "ok": { "type": "boolean", "const": false }, "error": { "type": "string", "enum": ["goal_not_found", "stale_run", "goal_busy", "plan_mode_busy", "plan_mode_failed", "service_shutting_down"] } }, "required": ["ok", "error"], "additionalProperties": false }], "description": "\u5207\u6362\u8BA1\u5212\u6A21\u5F0F\u7ED3\u679C\u3002" };
    var schema14 = { "anyOf": [{ "type": "object", "properties": { "ok": { "type": "boolean", "const": true }, "existing": { "type": "boolean" }, "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "receipt": { "$ref": "#/definitions/BrowserSessionInputReceipt" } }, "required": ["ok", "existing", "goalId", "runId", "receipt"], "additionalProperties": false }, { "type": "object", "properties": { "ok": { "type": "boolean", "const": false }, "error": { "type": "string", "enum": ["goal_id_conflict", "goal_busy", "model_not_selectable", "model_catalog_unavailable", "profile_not_found", "invalid_goal_input", "goal_unreadable", "service_shutting_down", "create_failed"] } }, "required": ["ok", "error"], "additionalProperties": false }], "description": "\u521B\u5EFA Session \u7684 wire \u7ED3\u679C\u3002" };
    var pattern0 = new RegExp("\\S", "u");
    var schema15 = { "type": "object", "properties": { "goalId": { "type": "string", "pattern": "\\S" }, "inputId": { "type": "string", "pattern": "\\S" }, "kind": { "$ref": "#/definitions/BrowserSessionInputKind" }, "sequence": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "status": { "$ref": "#/definitions/BrowserSessionInputStatus" }, "admittedAtRevision": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "targetRunId": { "type": "string", "pattern": "\\S" }, "appliedRunId": { "type": "string", "pattern": "\\S" }, "messageIndex": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 } }, "required": ["goalId", "inputId", "kind", "sequence", "status", "admittedAtRevision"], "additionalProperties": false, "description": "\u4E00\u6761\u5DF2\u6301\u4E45\u5316\u8F93\u5165\u7684\u53D7\u7406\u6536\u636E\u6295\u5F71\u3002" };
    var schema16 = { "type": "string", "enum": ["message", "steer", "interrupt", "respond", "resume", "queue_control"], "description": "\u4F1A\u8BDD\u8F93\u5165\u79CD\u7C7B\u3002" };
    var schema17 = { "type": "string", "enum": ["pending", "applied", "cleared"], "description": "\u8F93\u5165\u8D26\u672C\u4E2D\u7684\u53D7\u7406\u72B6\u6001\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    function validate14(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (data.inputId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "inputId" }, message: "must have required property 'inputId'" };
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
        if (data.sequence === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.status === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.admittedAtRevision === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "admittedAtRevision" }, message: "must have required property 'admittedAtRevision'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema15.properties, key0)) {
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
        if (data.inputId !== void 0) {
          let data1 = data.inputId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err9 = { instancePath: instancePath + "/inputId", schemaPath: "#/properties/inputId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          } else {
            const err10 = { instancePath: instancePath + "/inputId", schemaPath: "#/properties/inputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
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
            const err11 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserSessionInputKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          if (!(data2 === "message" || data2 === "steer" || data2 === "interrupt" || data2 === "respond" || data2 === "resume" || data2 === "queue_control")) {
            const err12 = { instancePath: instancePath + "/kind", schemaPath: "#/definitions/BrowserSessionInputKind/enum", keyword: "enum", params: { allowedValues: schema16.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.sequence !== void 0) {
          let data3 = data.sequence;
          if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
            const err13 = { instancePath: instancePath + "/sequence", schemaPath: "#/properties/sequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
          if (typeof data3 == "number" && isFinite(data3)) {
            if (data3 > 9007199254740991 || isNaN(data3)) {
              const err14 = { instancePath: instancePath + "/sequence", schemaPath: "#/properties/sequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            if (data3 < 1 || isNaN(data3)) {
              const err15 = { instancePath: instancePath + "/sequence", schemaPath: "#/properties/sequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          }
        }
        if (data.status !== void 0) {
          let data4 = data.status;
          if (typeof data4 !== "string") {
            const err16 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/BrowserSessionInputStatus/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
          if (!(data4 === "pending" || data4 === "applied" || data4 === "cleared")) {
            const err17 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/BrowserSessionInputStatus/enum", keyword: "enum", params: { allowedValues: schema17.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.admittedAtRevision !== void 0) {
          let data5 = data.admittedAtRevision;
          if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
            const err18 = { instancePath: instancePath + "/admittedAtRevision", schemaPath: "#/properties/admittedAtRevision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
          if (typeof data5 == "number" && isFinite(data5)) {
            if (data5 > 9007199254740991 || isNaN(data5)) {
              const err19 = { instancePath: instancePath + "/admittedAtRevision", schemaPath: "#/properties/admittedAtRevision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            if (data5 < 0 || isNaN(data5)) {
              const err20 = { instancePath: instancePath + "/admittedAtRevision", schemaPath: "#/properties/admittedAtRevision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
          }
        }
        if (data.targetRunId !== void 0) {
          let data6 = data.targetRunId;
          if (typeof data6 === "string") {
            if (!pattern0.test(data6)) {
              const err21 = { instancePath: instancePath + "/targetRunId", schemaPath: "#/properties/targetRunId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          } else {
            const err22 = { instancePath: instancePath + "/targetRunId", schemaPath: "#/properties/targetRunId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        }
        if (data.appliedRunId !== void 0) {
          let data7 = data.appliedRunId;
          if (typeof data7 === "string") {
            if (!pattern0.test(data7)) {
              const err23 = { instancePath: instancePath + "/appliedRunId", schemaPath: "#/properties/appliedRunId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
          } else {
            const err24 = { instancePath: instancePath + "/appliedRunId", schemaPath: "#/properties/appliedRunId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
        }
        if (data.messageIndex !== void 0) {
          let data8 = data.messageIndex;
          if (!(typeof data8 == "number" && (!(data8 % 1) && !isNaN(data8)) && isFinite(data8))) {
            const err25 = { instancePath: instancePath + "/messageIndex", schemaPath: "#/properties/messageIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
          if (typeof data8 == "number" && isFinite(data8)) {
            if (data8 > 9007199254740991 || isNaN(data8)) {
              const err26 = { instancePath: instancePath + "/messageIndex", schemaPath: "#/properties/messageIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
            if (data8 < 0 || isNaN(data8)) {
              const err27 = { instancePath: instancePath + "/messageIndex", schemaPath: "#/properties/messageIndex/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
          }
        }
      } else {
        const err28 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
      validate14.errors = vErrors;
      return errors === 0;
    }
    function validate13(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (data.existing === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "existing" }, message: "must have required property 'existing'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.goalId === void 0) {
          const err2 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err3 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.receipt === void 0) {
          const err4 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "receipt" }, message: "must have required property 'receipt'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "ok" || key0 === "existing" || key0 === "goalId" || key0 === "runId" || key0 === "receipt")) {
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
        if (data.existing !== void 0) {
          if (typeof data.existing !== "boolean") {
            const err8 = { instancePath: instancePath + "/existing", schemaPath: "#/anyOf/0/properties/existing/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data2 = data.goalId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err9 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/0/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          } else {
            const err10 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/0/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data3 = data.runId;
          if (typeof data3 === "string") {
            if (!pattern0.test(data3)) {
              const err11 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/0/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          } else {
            const err12 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/0/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.receipt !== void 0) {
          if (!validate14(data.receipt, { instancePath: instancePath + "/receipt", parentData: data, parentDataProperty: "receipt", rootData })) {
            vErrors = vErrors === null ? validate14.errors : vErrors.concat(validate14.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err13 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs13 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.ok === void 0) {
            const err14 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          if (data.error === void 0) {
            const err15 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "ok" || key1 === "error")) {
              const err16 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
          if (data.ok !== void 0) {
            let data5 = data.ok;
            if (typeof data5 !== "boolean") {
              const err17 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if (false !== data5) {
              const err18 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
          if (data.error !== void 0) {
            let data6 = data.error;
            if (typeof data6 !== "string") {
              const err19 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            if (!(data6 === "goal_id_conflict" || data6 === "goal_busy" || data6 === "model_not_selectable" || data6 === "model_catalog_unavailable" || data6 === "profile_not_found" || data6 === "invalid_goal_input" || data6 === "goal_unreadable" || data6 === "service_shutting_down" || data6 === "create_failed")) {
              const err20 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/enum", keyword: "enum", params: { allowedValues: schema14.anyOf[1].properties.error.enum }, message: "must be equal to one of the allowed values" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
          }
        } else {
          const err21 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
        var _valid0 = _errs13 === errors;
        valid0 = valid0 || _valid0;
      }
      if (!valid0) {
        const err22 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
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
    var schema19 = { "type": "string", "enum": ["INVALID_INPUT", "INPUT_CONFLICT", "INPUT_NOT_FOUND", "GOAL_NOT_FOUND", "BUSY", "STEER_CONFLICT", "INTERRUPT_CONFLICT", "STALE_REVISION", "INTERACTION_MISMATCH", "INTERACTION_REQUIRED", "QUEUE_PAUSED", "RUN_NOT_RESUMABLE", "QUEUE_FULL", "QUEUE_TEXT_TOO_LARGE", "TEXT_TOO_LARGE", "QUEUE_NOT_PAUSED", "QUEUE_REVISION_MISMATCH", "QUEUED_MESSAGE_NOT_FOUND", "RUN_NOT_FOUND", "RUN_NOT_RUNNING", "RUN_CONTROL_UNAVAILABLE", "input_admission_failed", "session_unavailable"], "description": "\u8F93\u5165\u53D7\u7406\u4E0E\u67E5\u8BE2\u7684\u7A33\u5B9A wire \u62D2\u7EDD\u4EE3\u7801\u3002" };
    function validate17(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (data.existing === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "existing" }, message: "must have required property 'existing'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.receipt === void 0) {
          const err2 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "receipt" }, message: "must have required property 'receipt'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "ok" || key0 === "existing" || key0 === "receipt")) {
            const err3 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.ok !== void 0) {
          let data0 = data.ok;
          if (typeof data0 !== "boolean") {
            const err4 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if (true !== data0) {
            const err5 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.existing !== void 0) {
          if (typeof data.existing !== "boolean") {
            const err6 = { instancePath: instancePath + "/existing", schemaPath: "#/anyOf/0/properties/existing/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.receipt !== void 0) {
          if (!validate14(data.receipt, { instancePath: instancePath + "/receipt", parentData: data, parentDataProperty: "receipt", rootData })) {
            vErrors = vErrors === null ? validate14.errors : vErrors.concat(validate14.errors);
            errors = vErrors.length;
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
        const _errs9 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.ok === void 0) {
            const err8 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (data.error === void 0) {
            const err9 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "ok" || key1 === "error")) {
              const err10 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
          if (data.ok !== void 0) {
            let data3 = data.ok;
            if (typeof data3 !== "boolean") {
              const err11 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
            if (false !== data3) {
              const err12 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          }
          if (data.error !== void 0) {
            let data4 = data.error;
            if (typeof data4 !== "string") {
              const err13 = { instancePath: instancePath + "/error", schemaPath: "#/definitions/BrowserSessionInputErrorCode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            if (!(data4 === "INVALID_INPUT" || data4 === "INPUT_CONFLICT" || data4 === "INPUT_NOT_FOUND" || data4 === "GOAL_NOT_FOUND" || data4 === "BUSY" || data4 === "STEER_CONFLICT" || data4 === "INTERRUPT_CONFLICT" || data4 === "STALE_REVISION" || data4 === "INTERACTION_MISMATCH" || data4 === "INTERACTION_REQUIRED" || data4 === "QUEUE_PAUSED" || data4 === "RUN_NOT_RESUMABLE" || data4 === "QUEUE_FULL" || data4 === "QUEUE_TEXT_TOO_LARGE" || data4 === "TEXT_TOO_LARGE" || data4 === "QUEUE_NOT_PAUSED" || data4 === "QUEUE_REVISION_MISMATCH" || data4 === "QUEUED_MESSAGE_NOT_FOUND" || data4 === "RUN_NOT_FOUND" || data4 === "RUN_NOT_RUNNING" || data4 === "RUN_CONTROL_UNAVAILABLE" || data4 === "input_admission_failed" || data4 === "session_unavailable")) {
              const err14 = { instancePath: instancePath + "/error", schemaPath: "#/definitions/BrowserSessionInputErrorCode/enum", keyword: "enum", params: { allowedValues: schema19.enum }, message: "must be equal to one of the allowed values" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          }
        } else {
          const err15 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
        var _valid0 = _errs9 === errors;
        valid0 = valid0 || _valid0;
      }
      if (!valid0) {
        const err16 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
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
      validate17.errors = vErrors;
      return errors === 0;
    }
    var schema21 = { "anyOf": [{ "type": "object", "properties": { "ok": { "type": "boolean", "const": true }, "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "selection": { "$ref": "#/definitions/BrowserModelSelectionCommit" }, "defaultPreference": { "$ref": "#/definitions/BrowserModelPreferenceOutcome", "description": "\u53EA\u5728\u8BF7\u6C42\u4FDD\u5B58\u9ED8\u8BA4\u504F\u597D\u65F6\u62A5\u544A\uFF1B\u6A21\u578B\u5207\u6362\u5DF2\u6210\u529F\u65F6\u4ECD\u53EF\u5355\u72EC\u5931\u8D25\u3002" } }, "required": ["ok", "goalId", "runId", "selection"], "additionalProperties": false }, { "type": "object", "properties": { "ok": { "type": "boolean", "const": false }, "error": { "type": "string", "enum": ["goal_not_found", "stale_run", "goal_busy", "model_switch_not_allowed", "model_not_selectable", "model_catalog_unavailable", "model_selection_failed", "service_shutting_down"] } }, "required": ["ok", "error"], "additionalProperties": false }], "description": "\u6A21\u578B\u9009\u62E9\u7ED3\u679C\u3002" };
    function validate20(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (data.selection === void 0) {
          const err3 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "selection" }, message: "must have required property 'selection'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "ok" || key0 === "goalId" || key0 === "runId" || key0 === "selection" || key0 === "defaultPreference")) {
            const err4 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.ok !== void 0) {
          let data0 = data.ok;
          if (typeof data0 !== "boolean") {
            const err5 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if (true !== data0) {
            const err6 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data1 = data.goalId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err7 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/0/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/0/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data2 = data.runId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err9 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/0/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          } else {
            const err10 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/0/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.selection !== void 0) {
          let data3 = data.selection;
          if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
            if (data3.modelId === void 0) {
              const err11 = { instancePath: instancePath + "/selection", schemaPath: "#/definitions/BrowserModelSelectionCommit/required", keyword: "required", params: { missingProperty: "modelId" }, message: "must have required property 'modelId'" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
            for (const key1 in data3) {
              if (!(key1 === "modelId" || key1 === "providerProfileId")) {
                const err12 = { instancePath: instancePath + "/selection", schemaPath: "#/definitions/BrowserModelSelectionCommit/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            }
            if (data3.modelId !== void 0) {
              let data4 = data3.modelId;
              if (typeof data4 === "string") {
                if (!pattern0.test(data4)) {
                  const err13 = { instancePath: instancePath + "/selection/modelId", schemaPath: "#/definitions/BrowserModelSelectionCommit/properties/modelId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
              } else {
                const err14 = { instancePath: instancePath + "/selection/modelId", schemaPath: "#/definitions/BrowserModelSelectionCommit/properties/modelId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
            }
            if (data3.providerProfileId !== void 0) {
              let data5 = data3.providerProfileId;
              if (typeof data5 === "string") {
                if (!pattern0.test(data5)) {
                  const err15 = { instancePath: instancePath + "/selection/providerProfileId", schemaPath: "#/definitions/BrowserModelSelectionCommit/properties/providerProfileId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                }
              } else {
                const err16 = { instancePath: instancePath + "/selection/providerProfileId", schemaPath: "#/definitions/BrowserModelSelectionCommit/properties/providerProfileId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
          } else {
            const err17 = { instancePath: instancePath + "/selection", schemaPath: "#/definitions/BrowserModelSelectionCommit/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.defaultPreference !== void 0) {
          let data6 = data.defaultPreference;
          const _errs20 = errors;
          let valid5 = false;
          const _errs21 = errors;
          if (data6 && typeof data6 == "object" && !Array.isArray(data6)) {
            if (data6.ok === void 0) {
              const err18 = { instancePath: instancePath + "/defaultPreference", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/0/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            for (const key2 in data6) {
              if (!(key2 === "ok")) {
                const err19 = { instancePath: instancePath + "/defaultPreference", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
            if (data6.ok !== void 0) {
              let data7 = data6.ok;
              if (typeof data7 !== "boolean") {
                const err20 = { instancePath: instancePath + "/defaultPreference/ok", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/0/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
              if (true !== data7) {
                const err21 = { instancePath: instancePath + "/defaultPreference/ok", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/0/properties/ok/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            }
          } else {
            const err22 = { instancePath: instancePath + "/defaultPreference", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
          var _valid1 = _errs21 === errors;
          valid5 = valid5 || _valid1;
          if (!valid5) {
            const _errs26 = errors;
            if (data6 && typeof data6 == "object" && !Array.isArray(data6)) {
              if (data6.ok === void 0) {
                const err23 = { instancePath: instancePath + "/defaultPreference", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
              if (data6.error === void 0) {
                const err24 = { instancePath: instancePath + "/defaultPreference", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
                if (vErrors === null) {
                  vErrors = [err24];
                } else {
                  vErrors.push(err24);
                }
                errors++;
              }
              for (const key3 in data6) {
                if (!(key3 === "ok" || key3 === "error")) {
                  const err25 = { instancePath: instancePath + "/defaultPreference", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err25];
                  } else {
                    vErrors.push(err25);
                  }
                  errors++;
                }
              }
              if (data6.ok !== void 0) {
                let data8 = data6.ok;
                if (typeof data8 !== "boolean") {
                  const err26 = { instancePath: instancePath + "/defaultPreference/ok", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                  if (vErrors === null) {
                    vErrors = [err26];
                  } else {
                    vErrors.push(err26);
                  }
                  errors++;
                }
                if (false !== data8) {
                  const err27 = { instancePath: instancePath + "/defaultPreference/ok", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err27];
                  } else {
                    vErrors.push(err27);
                  }
                  errors++;
                }
              }
              if (data6.error !== void 0) {
                let data9 = data6.error;
                if (typeof data9 !== "string") {
                  const err28 = { instancePath: instancePath + "/defaultPreference/error", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/1/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err28];
                  } else {
                    vErrors.push(err28);
                  }
                  errors++;
                }
                if ("model_preference_save_failed" !== data9) {
                  const err29 = { instancePath: instancePath + "/defaultPreference/error", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/1/properties/error/const", keyword: "const", params: { allowedValue: "model_preference_save_failed" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err29];
                  } else {
                    vErrors.push(err29);
                  }
                  errors++;
                }
              }
            } else {
              const err30 = { instancePath: instancePath + "/defaultPreference", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err30];
              } else {
                vErrors.push(err30);
              }
              errors++;
            }
            var _valid1 = _errs26 === errors;
            valid5 = valid5 || _valid1;
          }
          if (!valid5) {
            const err31 = { instancePath: instancePath + "/defaultPreference", schemaPath: "#/definitions/BrowserModelPreferenceOutcome/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          } else {
            errors = _errs20;
            if (vErrors !== null) {
              if (_errs20) {
                vErrors.length = _errs20;
              } else {
                vErrors = null;
              }
            }
          }
        }
      } else {
        const err32 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs33 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.ok === void 0) {
            const err33 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
          if (data.error === void 0) {
            const err34 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
          for (const key4 in data) {
            if (!(key4 === "ok" || key4 === "error")) {
              const err35 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
          }
          if (data.ok !== void 0) {
            let data10 = data.ok;
            if (typeof data10 !== "boolean") {
              const err36 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
              if (vErrors === null) {
                vErrors = [err36];
              } else {
                vErrors.push(err36);
              }
              errors++;
            }
            if (false !== data10) {
              const err37 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
          }
          if (data.error !== void 0) {
            let data11 = data.error;
            if (typeof data11 !== "string") {
              const err38 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
            if (!(data11 === "goal_not_found" || data11 === "stale_run" || data11 === "goal_busy" || data11 === "model_switch_not_allowed" || data11 === "model_not_selectable" || data11 === "model_catalog_unavailable" || data11 === "model_selection_failed" || data11 === "service_shutting_down")) {
              const err39 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/enum", keyword: "enum", params: { allowedValues: schema21.anyOf[1].properties.error.enum }, message: "must be equal to one of the allowed values" };
              if (vErrors === null) {
                vErrors = [err39];
              } else {
                vErrors.push(err39);
              }
              errors++;
            }
          }
        } else {
          const err40 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err40];
          } else {
            vErrors.push(err40);
          }
          errors++;
        }
        var _valid0 = _errs33 === errors;
        valid0 = valid0 || _valid0;
      }
      if (!valid0) {
        const err41 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err41];
        } else {
          vErrors.push(err41);
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
      validate20.errors = vErrors;
      return errors === 0;
    }
    var schema24 = { "anyOf": [{ "type": "object", "properties": { "ok": { "type": "boolean", "const": true }, "mode": { "$ref": "#/definitions/BrowserPermissionMode" }, "revision": { "type": "integer", "maximum": 9007199254740991 }, "workspaceId": { "type": "string", "pattern": "\\S" } }, "required": ["ok", "mode", "revision", "workspaceId"], "additionalProperties": false }, { "type": "object", "properties": { "ok": { "type": "boolean", "const": false }, "error": { "type": "string", "enum": ["permissions_unavailable", "conflict", "service_shutting_down"] }, "actualRevision": { "type": "integer", "maximum": 9007199254740991 } }, "required": ["ok", "error"], "additionalProperties": false }], "description": "\u6743\u9650\u6A21\u5F0F\u53D8\u66F4\u7ED3\u679C\u3002" };
    var schema25 = { "type": "string", "enum": ["default", "yolo"], "description": "\u9879\u76EE\u6743\u9650\u6A21\u5F0F\u3002" };
    function validate22(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (data.mode === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "mode" }, message: "must have required property 'mode'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.revision === void 0) {
          const err2 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.workspaceId === void 0) {
          const err3 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "workspaceId" }, message: "must have required property 'workspaceId'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "ok" || key0 === "mode" || key0 === "revision" || key0 === "workspaceId")) {
            const err4 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.ok !== void 0) {
          let data0 = data.ok;
          if (typeof data0 !== "boolean") {
            const err5 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if (true !== data0) {
            const err6 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.mode !== void 0) {
          let data1 = data.mode;
          if (typeof data1 !== "string") {
            const err7 = { instancePath: instancePath + "/mode", schemaPath: "#/definitions/BrowserPermissionMode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          if (!(data1 === "default" || data1 === "yolo")) {
            const err8 = { instancePath: instancePath + "/mode", schemaPath: "#/definitions/BrowserPermissionMode/enum", keyword: "enum", params: { allowedValues: schema25.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.revision !== void 0) {
          let data2 = data.revision;
          if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
            const err9 = { instancePath: instancePath + "/revision", schemaPath: "#/anyOf/0/properties/revision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          if (typeof data2 == "number" && isFinite(data2)) {
            if (data2 > 9007199254740991 || isNaN(data2)) {
              const err10 = { instancePath: instancePath + "/revision", schemaPath: "#/anyOf/0/properties/revision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
        }
        if (data.workspaceId !== void 0) {
          let data3 = data.workspaceId;
          if (typeof data3 === "string") {
            if (!pattern0.test(data3)) {
              const err11 = { instancePath: instancePath + "/workspaceId", schemaPath: "#/anyOf/0/properties/workspaceId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          } else {
            const err12 = { instancePath: instancePath + "/workspaceId", schemaPath: "#/anyOf/0/properties/workspaceId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
      } else {
        const err13 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs13 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.ok === void 0) {
            const err14 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          if (data.error === void 0) {
            const err15 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "ok" || key1 === "error" || key1 === "actualRevision")) {
              const err16 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
          if (data.ok !== void 0) {
            let data4 = data.ok;
            if (typeof data4 !== "boolean") {
              const err17 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if (false !== data4) {
              const err18 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
          if (data.error !== void 0) {
            let data5 = data.error;
            if (typeof data5 !== "string") {
              const err19 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            if (!(data5 === "permissions_unavailable" || data5 === "conflict" || data5 === "service_shutting_down")) {
              const err20 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/enum", keyword: "enum", params: { allowedValues: schema24.anyOf[1].properties.error.enum }, message: "must be equal to one of the allowed values" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
          }
          if (data.actualRevision !== void 0) {
            let data6 = data.actualRevision;
            if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
              const err21 = { instancePath: instancePath + "/actualRevision", schemaPath: "#/anyOf/1/properties/actualRevision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
            if (typeof data6 == "number" && isFinite(data6)) {
              if (data6 > 9007199254740991 || isNaN(data6)) {
                const err22 = { instancePath: instancePath + "/actualRevision", schemaPath: "#/anyOf/1/properties/actualRevision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
            }
          }
        } else {
          const err23 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
        var _valid0 = _errs13 === errors;
        valid0 = valid0 || _valid0;
      }
      if (!valid0) {
        const err24 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
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
      validate22.errors = vErrors;
      return errors === 0;
    }
    var schema26 = { "anyOf": [{ "type": "object", "properties": { "ok": { "type": "boolean", "const": true }, "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "grants": { "type": "array", "items": { "$ref": "#/definitions/BrowserToolGrantSummary" } } }, "required": ["ok", "goalId", "runId", "grants"], "additionalProperties": false }, { "type": "object", "properties": { "ok": { "type": "boolean", "const": false }, "error": { "type": "string", "enum": ["goal_not_found", "stale_run", "permissions_unavailable", "grant_failed", "service_shutting_down"] } }, "required": ["ok", "error"], "additionalProperties": false }], "description": "\u5DE5\u5177\u6388\u6743\u67E5\u8BE2\u6216\u64A4\u9500\u7ED3\u679C\u3002" };
    var schema27 = { "type": "object", "properties": { "grantId": { "type": "string", "pattern": "\\S" }, "scope": { "type": "string", "enum": ["goal", "workspace"] }, "toolId": { "type": "string", "pattern": "\\S" }, "status": { "type": "string", "enum": ["pending", "active", "revoked"] }, "kind": { "type": "string", "enum": ["tool", "sandbox"] }, "targetPath": { "type": "string" }, "command": { "type": "string" }, "network": { "type": "string", "enum": ["none", "all_outbound"] }, "extraFiles": { "type": "array", "items": { "$ref": "#/definitions/BrowserToolGrantExtraFile" } } }, "required": ["grantId", "scope", "toolId", "status"], "additionalProperties": false, "description": "\u6388\u6743\u6458\u8981\u6761\u76EE\u3002" };
    var schema28 = { "type": "object", "properties": { "canonicalPath": { "type": "string", "pattern": "\\S" }, "access": { "type": "string", "enum": ["read", "write"] }, "kind": { "type": "string", "enum": ["file", "directory_tree"] } }, "required": ["canonicalPath", "access", "kind"], "additionalProperties": false, "description": "\u5DE5\u5177\u6388\u6743\u6216\u6C99\u7BB1\u8BBF\u95EE\u4E2D\u7684\u5355\u4E2A\u5916\u90E8\u6587\u4EF6/\u76EE\u5F55\u6761\u76EE\u3002" };
    function validate25(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.grantId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "grantId" }, message: "must have required property 'grantId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.scope === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "scope" }, message: "must have required property 'scope'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.toolId === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "toolId" }, message: "must have required property 'toolId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.status === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema27.properties, key0)) {
            const err4 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.grantId !== void 0) {
          let data0 = data.grantId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err5 = { instancePath: instancePath + "/grantId", schemaPath: "#/properties/grantId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
          } else {
            const err6 = { instancePath: instancePath + "/grantId", schemaPath: "#/properties/grantId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.scope !== void 0) {
          let data1 = data.scope;
          if (typeof data1 !== "string") {
            const err7 = { instancePath: instancePath + "/scope", schemaPath: "#/properties/scope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          if (!(data1 === "goal" || data1 === "workspace")) {
            const err8 = { instancePath: instancePath + "/scope", schemaPath: "#/properties/scope/enum", keyword: "enum", params: { allowedValues: schema27.properties.scope.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.toolId !== void 0) {
          let data2 = data.toolId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err9 = { instancePath: instancePath + "/toolId", schemaPath: "#/properties/toolId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          } else {
            const err10 = { instancePath: instancePath + "/toolId", schemaPath: "#/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.status !== void 0) {
          let data3 = data.status;
          if (typeof data3 !== "string") {
            const err11 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          if (!(data3 === "pending" || data3 === "active" || data3 === "revoked")) {
            const err12 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/enum", keyword: "enum", params: { allowedValues: schema27.properties.status.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data4 = data.kind;
          if (typeof data4 !== "string") {
            const err13 = { instancePath: instancePath + "/kind", schemaPath: "#/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
          if (!(data4 === "tool" || data4 === "sandbox")) {
            const err14 = { instancePath: instancePath + "/kind", schemaPath: "#/properties/kind/enum", keyword: "enum", params: { allowedValues: schema27.properties.kind.enum }, message: "must be equal to one of the allowed values" };
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
        if (data.command !== void 0) {
          if (typeof data.command !== "string") {
            const err16 = { instancePath: instancePath + "/command", schemaPath: "#/properties/command/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data.network !== void 0) {
          let data7 = data.network;
          if (typeof data7 !== "string") {
            const err17 = { instancePath: instancePath + "/network", schemaPath: "#/properties/network/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
          if (!(data7 === "none" || data7 === "all_outbound")) {
            const err18 = { instancePath: instancePath + "/network", schemaPath: "#/properties/network/enum", keyword: "enum", params: { allowedValues: schema27.properties.network.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
        if (data.extraFiles !== void 0) {
          let data8 = data.extraFiles;
          if (Array.isArray(data8)) {
            const len0 = data8.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data9 = data8[i0];
              if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
                if (data9.canonicalPath === void 0) {
                  const err19 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserToolGrantExtraFile/required", keyword: "required", params: { missingProperty: "canonicalPath" }, message: "must have required property 'canonicalPath'" };
                  if (vErrors === null) {
                    vErrors = [err19];
                  } else {
                    vErrors.push(err19);
                  }
                  errors++;
                }
                if (data9.access === void 0) {
                  const err20 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserToolGrantExtraFile/required", keyword: "required", params: { missingProperty: "access" }, message: "must have required property 'access'" };
                  if (vErrors === null) {
                    vErrors = [err20];
                  } else {
                    vErrors.push(err20);
                  }
                  errors++;
                }
                if (data9.kind === void 0) {
                  const err21 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserToolGrantExtraFile/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err21];
                  } else {
                    vErrors.push(err21);
                  }
                  errors++;
                }
                for (const key1 in data9) {
                  if (!(key1 === "canonicalPath" || key1 === "access" || key1 === "kind")) {
                    const err22 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserToolGrantExtraFile/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err22];
                    } else {
                      vErrors.push(err22);
                    }
                    errors++;
                  }
                }
                if (data9.canonicalPath !== void 0) {
                  let data10 = data9.canonicalPath;
                  if (typeof data10 === "string") {
                    if (!pattern0.test(data10)) {
                      const err23 = { instancePath: instancePath + "/extraFiles/" + i0 + "/canonicalPath", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/canonicalPath/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err23];
                      } else {
                        vErrors.push(err23);
                      }
                      errors++;
                    }
                  } else {
                    const err24 = { instancePath: instancePath + "/extraFiles/" + i0 + "/canonicalPath", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/canonicalPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err24];
                    } else {
                      vErrors.push(err24);
                    }
                    errors++;
                  }
                }
                if (data9.access !== void 0) {
                  let data11 = data9.access;
                  if (typeof data11 !== "string") {
                    const err25 = { instancePath: instancePath + "/extraFiles/" + i0 + "/access", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/access/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err25];
                    } else {
                      vErrors.push(err25);
                    }
                    errors++;
                  }
                  if (!(data11 === "read" || data11 === "write")) {
                    const err26 = { instancePath: instancePath + "/extraFiles/" + i0 + "/access", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/access/enum", keyword: "enum", params: { allowedValues: schema28.properties.access.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err26];
                    } else {
                      vErrors.push(err26);
                    }
                    errors++;
                  }
                }
                if (data9.kind !== void 0) {
                  let data12 = data9.kind;
                  if (typeof data12 !== "string") {
                    const err27 = { instancePath: instancePath + "/extraFiles/" + i0 + "/kind", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err27];
                    } else {
                      vErrors.push(err27);
                    }
                    errors++;
                  }
                  if (!(data12 === "file" || data12 === "directory_tree")) {
                    const err28 = { instancePath: instancePath + "/extraFiles/" + i0 + "/kind", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/kind/enum", keyword: "enum", params: { allowedValues: schema28.properties.kind.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err28];
                    } else {
                      vErrors.push(err28);
                    }
                    errors++;
                  }
                }
              } else {
                const err29 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserToolGrantExtraFile/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err29];
                } else {
                  vErrors.push(err29);
                }
                errors++;
              }
            }
          } else {
            const err30 = { instancePath: instancePath + "/extraFiles", schemaPath: "#/properties/extraFiles/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
        }
      } else {
        const err31 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
      validate25.errors = vErrors;
      return errors === 0;
    }
    function validate24(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (data.grants === void 0) {
          const err3 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "grants" }, message: "must have required property 'grants'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "ok" || key0 === "goalId" || key0 === "runId" || key0 === "grants")) {
            const err4 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.ok !== void 0) {
          let data0 = data.ok;
          if (typeof data0 !== "boolean") {
            const err5 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if (true !== data0) {
            const err6 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data1 = data.goalId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err7 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/0/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/0/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data2 = data.runId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err9 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/0/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          } else {
            const err10 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/0/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.grants !== void 0) {
          let data3 = data.grants;
          if (Array.isArray(data3)) {
            const len0 = data3.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate25(data3[i0], { instancePath: instancePath + "/grants/" + i0, parentData: data3, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err11 = { instancePath: instancePath + "/grants", schemaPath: "#/anyOf/0/properties/grants/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
      } else {
        const err12 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs13 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.ok === void 0) {
            const err13 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
          if (data.error === void 0) {
            const err14 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "ok" || key1 === "error")) {
              const err15 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          }
          if (data.ok !== void 0) {
            let data5 = data.ok;
            if (typeof data5 !== "boolean") {
              const err16 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
            if (false !== data5) {
              const err17 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
          }
          if (data.error !== void 0) {
            let data6 = data.error;
            if (typeof data6 !== "string") {
              const err18 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            if (!(data6 === "goal_not_found" || data6 === "stale_run" || data6 === "permissions_unavailable" || data6 === "grant_failed" || data6 === "service_shutting_down")) {
              const err19 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/enum", keyword: "enum", params: { allowedValues: schema26.anyOf[1].properties.error.enum }, message: "must be equal to one of the allowed values" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
          }
        } else {
          const err20 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
        var _valid0 = _errs13 === errors;
        valid0 = valid0 || _valid0;
      }
      if (!valid0) {
        const err21 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
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
      validate24.errors = vErrors;
      return errors === 0;
    }
    var schema31 = { "anyOf": [{ "type": "object", "properties": { "ok": { "type": "boolean", "const": true }, "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "review": { "$ref": "#/definitions/BrowserActionReview" } }, "required": ["ok", "goalId", "runId", "review"], "additionalProperties": false }, { "type": "object", "properties": { "ok": { "type": "boolean", "const": false }, "error": { "type": "string", "enum": ["goal_not_found", "stale_run", "action_not_waiting", "action_id_mismatch", "tool_not_found", "invalid_tool_input", "scope_unavailable", "sandbox_scope_unavailable", "review_unavailable"] }, "issues": { "type": "array", "items": { "$ref": "#/definitions/BrowserActionReviewIssue" } } }, "required": ["ok", "error"], "additionalProperties": false }], "description": "\u53EA\u8BFB\u5BA1\u6279\u9884\u68C0\u7684 wire \u7ED3\u679C\u3002" };
    var schema37 = { "type": "object", "properties": { "path": { "type": "array", "items": { "type": ["string", "number"] } }, "message": { "type": "string" } }, "required": ["path", "message"], "additionalProperties": false, "description": "\u53EF\u5B9A\u4F4D\u7684\u5B57\u6BB5\u7EA7\u95EE\u9898\u3002" };
    var schema32 = { "type": "object", "properties": { "actionId": { "type": "string", "pattern": "\\S" }, "toolId": { "type": "string", "pattern": "\\S" }, "originalInput": {}, "finalInput": {}, "changed": { "type": "boolean" }, "scope": { "$ref": "#/definitions/BrowserActionReviewScope" }, "availableScopes": { "type": "array", "items": { "$ref": "#/definitions/BrowserActionReviewScope" } }, "capability": { "$ref": "#/definitions/BrowserActionCapability" }, "requiresSandboxApproval": { "type": "boolean" }, "reviewRef": { "type": "string", "pattern": "\\S" } }, "required": ["actionId", "toolId", "originalInput", "finalInput", "changed", "scope", "availableScopes", "capability", "requiresSandboxApproval", "reviewRef"], "additionalProperties": false, "description": "\u53EA\u8BFB\u5BA1\u6279\u9884\u68C0\u8FD4\u56DE\u7684\u53EF\u5BA1\u9605\u5185\u5BB9\u3002" };
    var schema33 = { "type": "string", "enum": ["action", "goal", "workspace"], "description": "Action \u5BA1\u9605\u53EF\u7533\u8BF7\u7684\u6388\u6743\u671F\u9650\u3002" };
    var schema35 = { "type": "object", "properties": { "network": { "type": "string", "enum": ["none", "all_outbound"] }, "extraFiles": { "type": "array", "items": { "$ref": "#/definitions/BrowserToolGrantExtraFile" } }, "targetPaths": { "type": "array", "items": { "type": "string" } } }, "required": ["network", "extraFiles", "targetPaths"], "additionalProperties": false, "description": "\u91CD\u65B0\u8BA1\u7B97\u51FA\u7684\u5B9E\u9645\u80FD\u529B\u8303\u56F4\u3002" };
    function validate30(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.network === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "network" }, message: "must have required property 'network'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.extraFiles === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "extraFiles" }, message: "must have required property 'extraFiles'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.targetPaths === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "targetPaths" }, message: "must have required property 'targetPaths'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "network" || key0 === "extraFiles" || key0 === "targetPaths")) {
            const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.network !== void 0) {
          let data0 = data.network;
          if (typeof data0 !== "string") {
            const err4 = { instancePath: instancePath + "/network", schemaPath: "#/properties/network/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if (!(data0 === "none" || data0 === "all_outbound")) {
            const err5 = { instancePath: instancePath + "/network", schemaPath: "#/properties/network/enum", keyword: "enum", params: { allowedValues: schema35.properties.network.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.extraFiles !== void 0) {
          let data1 = data.extraFiles;
          if (Array.isArray(data1)) {
            const len0 = data1.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data2 = data1[i0];
              if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
                if (data2.canonicalPath === void 0) {
                  const err6 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserToolGrantExtraFile/required", keyword: "required", params: { missingProperty: "canonicalPath" }, message: "must have required property 'canonicalPath'" };
                  if (vErrors === null) {
                    vErrors = [err6];
                  } else {
                    vErrors.push(err6);
                  }
                  errors++;
                }
                if (data2.access === void 0) {
                  const err7 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserToolGrantExtraFile/required", keyword: "required", params: { missingProperty: "access" }, message: "must have required property 'access'" };
                  if (vErrors === null) {
                    vErrors = [err7];
                  } else {
                    vErrors.push(err7);
                  }
                  errors++;
                }
                if (data2.kind === void 0) {
                  const err8 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserToolGrantExtraFile/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err8];
                  } else {
                    vErrors.push(err8);
                  }
                  errors++;
                }
                for (const key1 in data2) {
                  if (!(key1 === "canonicalPath" || key1 === "access" || key1 === "kind")) {
                    const err9 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserToolGrantExtraFile/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err9];
                    } else {
                      vErrors.push(err9);
                    }
                    errors++;
                  }
                }
                if (data2.canonicalPath !== void 0) {
                  let data3 = data2.canonicalPath;
                  if (typeof data3 === "string") {
                    if (!pattern0.test(data3)) {
                      const err10 = { instancePath: instancePath + "/extraFiles/" + i0 + "/canonicalPath", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/canonicalPath/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err10];
                      } else {
                        vErrors.push(err10);
                      }
                      errors++;
                    }
                  } else {
                    const err11 = { instancePath: instancePath + "/extraFiles/" + i0 + "/canonicalPath", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/canonicalPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err11];
                    } else {
                      vErrors.push(err11);
                    }
                    errors++;
                  }
                }
                if (data2.access !== void 0) {
                  let data4 = data2.access;
                  if (typeof data4 !== "string") {
                    const err12 = { instancePath: instancePath + "/extraFiles/" + i0 + "/access", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/access/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err12];
                    } else {
                      vErrors.push(err12);
                    }
                    errors++;
                  }
                  if (!(data4 === "read" || data4 === "write")) {
                    const err13 = { instancePath: instancePath + "/extraFiles/" + i0 + "/access", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/access/enum", keyword: "enum", params: { allowedValues: schema28.properties.access.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err13];
                    } else {
                      vErrors.push(err13);
                    }
                    errors++;
                  }
                }
                if (data2.kind !== void 0) {
                  let data5 = data2.kind;
                  if (typeof data5 !== "string") {
                    const err14 = { instancePath: instancePath + "/extraFiles/" + i0 + "/kind", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err14];
                    } else {
                      vErrors.push(err14);
                    }
                    errors++;
                  }
                  if (!(data5 === "file" || data5 === "directory_tree")) {
                    const err15 = { instancePath: instancePath + "/extraFiles/" + i0 + "/kind", schemaPath: "#/definitions/BrowserToolGrantExtraFile/properties/kind/enum", keyword: "enum", params: { allowedValues: schema28.properties.kind.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err15];
                    } else {
                      vErrors.push(err15);
                    }
                    errors++;
                  }
                }
              } else {
                const err16 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserToolGrantExtraFile/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
          } else {
            const err17 = { instancePath: instancePath + "/extraFiles", schemaPath: "#/properties/extraFiles/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.targetPaths !== void 0) {
          let data6 = data.targetPaths;
          if (Array.isArray(data6)) {
            const len1 = data6.length;
            for (let i1 = 0; i1 < len1; i1++) {
              if (typeof data6[i1] !== "string") {
                const err18 = { instancePath: instancePath + "/targetPaths/" + i1, schemaPath: "#/properties/targetPaths/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
          } else {
            const err19 = { instancePath: instancePath + "/targetPaths", schemaPath: "#/properties/targetPaths/type", keyword: "type", params: { type: "array" }, message: "must be array" };
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
      validate30.errors = vErrors;
      return errors === 0;
    }
    function validate29(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (data.originalInput === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "originalInput" }, message: "must have required property 'originalInput'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.finalInput === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "finalInput" }, message: "must have required property 'finalInput'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.changed === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "changed" }, message: "must have required property 'changed'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.scope === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "scope" }, message: "must have required property 'scope'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.availableScopes === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "availableScopes" }, message: "must have required property 'availableScopes'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data.capability === void 0) {
          const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "capability" }, message: "must have required property 'capability'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data.requiresSandboxApproval === void 0) {
          const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "requiresSandboxApproval" }, message: "must have required property 'requiresSandboxApproval'" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (data.reviewRef === void 0) {
          const err9 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "reviewRef" }, message: "must have required property 'reviewRef'" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema32.properties, key0)) {
            const err10 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.actionId !== void 0) {
          let data0 = data.actionId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err11 = { instancePath: instancePath + "/actionId", schemaPath: "#/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          } else {
            const err12 = { instancePath: instancePath + "/actionId", schemaPath: "#/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.toolId !== void 0) {
          let data1 = data.toolId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err13 = { instancePath: instancePath + "/toolId", schemaPath: "#/properties/toolId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          } else {
            const err14 = { instancePath: instancePath + "/toolId", schemaPath: "#/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.changed !== void 0) {
          if (typeof data.changed !== "boolean") {
            const err15 = { instancePath: instancePath + "/changed", schemaPath: "#/properties/changed/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.scope !== void 0) {
          let data3 = data.scope;
          if (typeof data3 !== "string") {
            const err16 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/BrowserActionReviewScope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
          if (!(data3 === "action" || data3 === "goal" || data3 === "workspace")) {
            const err17 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/BrowserActionReviewScope/enum", keyword: "enum", params: { allowedValues: schema33.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.availableScopes !== void 0) {
          let data4 = data.availableScopes;
          if (Array.isArray(data4)) {
            const len0 = data4.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data5 = data4[i0];
              if (typeof data5 !== "string") {
                const err18 = { instancePath: instancePath + "/availableScopes/" + i0, schemaPath: "#/definitions/BrowserActionReviewScope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
              if (!(data5 === "action" || data5 === "goal" || data5 === "workspace")) {
                const err19 = { instancePath: instancePath + "/availableScopes/" + i0, schemaPath: "#/definitions/BrowserActionReviewScope/enum", keyword: "enum", params: { allowedValues: schema33.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
          } else {
            const err20 = { instancePath: instancePath + "/availableScopes", schemaPath: "#/properties/availableScopes/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
        }
        if (data.capability !== void 0) {
          if (!validate30(data.capability, { instancePath: instancePath + "/capability", parentData: data, parentDataProperty: "capability", rootData })) {
            vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
            errors = vErrors.length;
          }
        }
        if (data.requiresSandboxApproval !== void 0) {
          if (typeof data.requiresSandboxApproval !== "boolean") {
            const err21 = { instancePath: instancePath + "/requiresSandboxApproval", schemaPath: "#/properties/requiresSandboxApproval/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
        }
        if (data.reviewRef !== void 0) {
          let data8 = data.reviewRef;
          if (typeof data8 === "string") {
            if (!pattern0.test(data8)) {
              const err22 = { instancePath: instancePath + "/reviewRef", schemaPath: "#/properties/reviewRef/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
          } else {
            const err23 = { instancePath: instancePath + "/reviewRef", schemaPath: "#/properties/reviewRef/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
      } else {
        const err24 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
      validate29.errors = vErrors;
      return errors === 0;
    }
    function validate28(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (data.review === void 0) {
          const err3 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "review" }, message: "must have required property 'review'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "ok" || key0 === "goalId" || key0 === "runId" || key0 === "review")) {
            const err4 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.ok !== void 0) {
          let data0 = data.ok;
          if (typeof data0 !== "boolean") {
            const err5 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if (true !== data0) {
            const err6 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data1 = data.goalId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err7 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/0/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/0/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data2 = data.runId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err9 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/0/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          } else {
            const err10 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/0/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.review !== void 0) {
          if (!validate29(data.review, { instancePath: instancePath + "/review", parentData: data, parentDataProperty: "review", rootData })) {
            vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err11 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs11 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.ok === void 0) {
            const err12 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
          if (data.error === void 0) {
            const err13 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "ok" || key1 === "error" || key1 === "issues")) {
              const err14 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          }
          if (data.ok !== void 0) {
            let data4 = data.ok;
            if (typeof data4 !== "boolean") {
              const err15 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            if (false !== data4) {
              const err16 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
          if (data.error !== void 0) {
            let data5 = data.error;
            if (typeof data5 !== "string") {
              const err17 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if (!(data5 === "goal_not_found" || data5 === "stale_run" || data5 === "action_not_waiting" || data5 === "action_id_mismatch" || data5 === "tool_not_found" || data5 === "invalid_tool_input" || data5 === "scope_unavailable" || data5 === "sandbox_scope_unavailable" || data5 === "review_unavailable")) {
              const err18 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/enum", keyword: "enum", params: { allowedValues: schema31.anyOf[1].properties.error.enum }, message: "must be equal to one of the allowed values" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
          if (data.issues !== void 0) {
            let data6 = data.issues;
            if (Array.isArray(data6)) {
              const len0 = data6.length;
              for (let i0 = 0; i0 < len0; i0++) {
                let data7 = data6[i0];
                if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
                  if (data7.path === void 0) {
                    const err19 = { instancePath: instancePath + "/issues/" + i0, schemaPath: "#/definitions/BrowserActionReviewIssue/required", keyword: "required", params: { missingProperty: "path" }, message: "must have required property 'path'" };
                    if (vErrors === null) {
                      vErrors = [err19];
                    } else {
                      vErrors.push(err19);
                    }
                    errors++;
                  }
                  if (data7.message === void 0) {
                    const err20 = { instancePath: instancePath + "/issues/" + i0, schemaPath: "#/definitions/BrowserActionReviewIssue/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
                    if (vErrors === null) {
                      vErrors = [err20];
                    } else {
                      vErrors.push(err20);
                    }
                    errors++;
                  }
                  for (const key2 in data7) {
                    if (!(key2 === "path" || key2 === "message")) {
                      const err21 = { instancePath: instancePath + "/issues/" + i0, schemaPath: "#/definitions/BrowserActionReviewIssue/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err21];
                      } else {
                        vErrors.push(err21);
                      }
                      errors++;
                    }
                  }
                  if (data7.path !== void 0) {
                    let data8 = data7.path;
                    if (Array.isArray(data8)) {
                      const len1 = data8.length;
                      for (let i1 = 0; i1 < len1; i1++) {
                        let data9 = data8[i1];
                        if (typeof data9 !== "string" && !(typeof data9 == "number" && isFinite(data9))) {
                          const err22 = { instancePath: instancePath + "/issues/" + i0 + "/path/" + i1, schemaPath: "#/definitions/BrowserActionReviewIssue/properties/path/items/type", keyword: "type", params: { type: schema37.properties.path.items.type }, message: "must be string,number" };
                          if (vErrors === null) {
                            vErrors = [err22];
                          } else {
                            vErrors.push(err22);
                          }
                          errors++;
                        }
                      }
                    } else {
                      const err23 = { instancePath: instancePath + "/issues/" + i0 + "/path", schemaPath: "#/definitions/BrowserActionReviewIssue/properties/path/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                      if (vErrors === null) {
                        vErrors = [err23];
                      } else {
                        vErrors.push(err23);
                      }
                      errors++;
                    }
                  }
                  if (data7.message !== void 0) {
                    if (typeof data7.message !== "string") {
                      const err24 = { instancePath: instancePath + "/issues/" + i0 + "/message", schemaPath: "#/definitions/BrowserActionReviewIssue/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err24];
                      } else {
                        vErrors.push(err24);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err25 = { instancePath: instancePath + "/issues/" + i0, schemaPath: "#/definitions/BrowserActionReviewIssue/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err25];
                  } else {
                    vErrors.push(err25);
                  }
                  errors++;
                }
              }
            } else {
              const err26 = { instancePath: instancePath + "/issues", schemaPath: "#/anyOf/1/properties/issues/type", keyword: "type", params: { type: "array" }, message: "must be array" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
          }
        } else {
          const err27 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
        var _valid0 = _errs11 === errors;
        valid0 = valid0 || _valid0;
      }
      if (!valid0) {
        const err28 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
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
      validate28.errors = vErrors;
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
        if (data.result === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "result" }, message: "must have required property 'result'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "kind" || key0 === "result")) {
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
          if ("create_session" !== data0) {
            const err4 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "create_session" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.result !== void 0) {
          if (!validate13(data.result, { instancePath: instancePath + "/result", parentData: data, parentDataProperty: "result", rootData })) {
            vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err5 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs7 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.kind === void 0) {
            const err6 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if (data.result === void 0) {
            const err7 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "result" }, message: "must have required property 'result'" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "kind" || key1 === "result")) {
              const err8 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          }
          if (data.kind !== void 0) {
            let data2 = data.kind;
            if (typeof data2 !== "string") {
              const err9 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            if ("session_input" !== data2) {
              const err10 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "session_input" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
          if (data.result !== void 0) {
            if (!validate17(data.result, { instancePath: instancePath + "/result", parentData: data, parentDataProperty: "result", rootData })) {
              vErrors = vErrors === null ? validate17.errors : vErrors.concat(validate17.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err11 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        var _valid0 = _errs7 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs13 = errors;
          if (data && typeof data == "object" && !Array.isArray(data)) {
            if (data.kind === void 0) {
              const err12 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            if (data.result === void 0) {
              const err13 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "result" }, message: "must have required property 'result'" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            for (const key2 in data) {
              if (!(key2 === "kind" || key2 === "result")) {
                const err14 = { instancePath, schemaPath: "#/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
            }
            if (data.kind !== void 0) {
              let data4 = data.kind;
              if (typeof data4 !== "string") {
                const err15 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/2/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
              if ("plan_mode" !== data4) {
                const err16 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/2/properties/kind/const", keyword: "const", params: { allowedValue: "plan_mode" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
            if (data.result !== void 0) {
              let data5 = data.result;
              const _errs20 = errors;
              let valid5 = false;
              const _errs21 = errors;
              if (data5 && typeof data5 == "object" && !Array.isArray(data5)) {
                if (data5.ok === void 0) {
                  const err17 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/0/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
                  if (vErrors === null) {
                    vErrors = [err17];
                  } else {
                    vErrors.push(err17);
                  }
                  errors++;
                }
                if (data5.goalId === void 0) {
                  const err18 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/0/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                  if (vErrors === null) {
                    vErrors = [err18];
                  } else {
                    vErrors.push(err18);
                  }
                  errors++;
                }
                if (data5.runId === void 0) {
                  const err19 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/0/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                  if (vErrors === null) {
                    vErrors = [err19];
                  } else {
                    vErrors.push(err19);
                  }
                  errors++;
                }
                if (data5.existing === void 0) {
                  const err20 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/0/required", keyword: "required", params: { missingProperty: "existing" }, message: "must have required property 'existing'" };
                  if (vErrors === null) {
                    vErrors = [err20];
                  } else {
                    vErrors.push(err20);
                  }
                  errors++;
                }
                for (const key3 in data5) {
                  if (!(key3 === "ok" || key3 === "goalId" || key3 === "runId" || key3 === "existing")) {
                    const err21 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err21];
                    } else {
                      vErrors.push(err21);
                    }
                    errors++;
                  }
                }
                if (data5.ok !== void 0) {
                  let data6 = data5.ok;
                  if (typeof data6 !== "boolean") {
                    const err22 = { instancePath: instancePath + "/result/ok", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/0/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                    if (vErrors === null) {
                      vErrors = [err22];
                    } else {
                      vErrors.push(err22);
                    }
                    errors++;
                  }
                  if (true !== data6) {
                    const err23 = { instancePath: instancePath + "/result/ok", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/0/properties/ok/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err23];
                    } else {
                      vErrors.push(err23);
                    }
                    errors++;
                  }
                }
                if (data5.goalId !== void 0) {
                  let data7 = data5.goalId;
                  if (typeof data7 === "string") {
                    if (!pattern0.test(data7)) {
                      const err24 = { instancePath: instancePath + "/result/goalId", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/0/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err24];
                      } else {
                        vErrors.push(err24);
                      }
                      errors++;
                    }
                  } else {
                    const err25 = { instancePath: instancePath + "/result/goalId", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/0/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err25];
                    } else {
                      vErrors.push(err25);
                    }
                    errors++;
                  }
                }
                if (data5.runId !== void 0) {
                  let data8 = data5.runId;
                  if (typeof data8 === "string") {
                    if (!pattern0.test(data8)) {
                      const err26 = { instancePath: instancePath + "/result/runId", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/0/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err26];
                      } else {
                        vErrors.push(err26);
                      }
                      errors++;
                    }
                  } else {
                    const err27 = { instancePath: instancePath + "/result/runId", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/0/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err27];
                    } else {
                      vErrors.push(err27);
                    }
                    errors++;
                  }
                }
                if (data5.existing !== void 0) {
                  if (typeof data5.existing !== "boolean") {
                    const err28 = { instancePath: instancePath + "/result/existing", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/0/properties/existing/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                    if (vErrors === null) {
                      vErrors = [err28];
                    } else {
                      vErrors.push(err28);
                    }
                    errors++;
                  }
                }
              } else {
                const err29 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err29];
                } else {
                  vErrors.push(err29);
                }
                errors++;
              }
              var _valid1 = _errs21 === errors;
              valid5 = valid5 || _valid1;
              if (!valid5) {
                const _errs32 = errors;
                if (data5 && typeof data5 == "object" && !Array.isArray(data5)) {
                  if (data5.ok === void 0) {
                    const err30 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
                    if (vErrors === null) {
                      vErrors = [err30];
                    } else {
                      vErrors.push(err30);
                    }
                    errors++;
                  }
                  if (data5.error === void 0) {
                    const err31 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
                    if (vErrors === null) {
                      vErrors = [err31];
                    } else {
                      vErrors.push(err31);
                    }
                    errors++;
                  }
                  for (const key4 in data5) {
                    if (!(key4 === "ok" || key4 === "error")) {
                      const err32 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err32];
                      } else {
                        vErrors.push(err32);
                      }
                      errors++;
                    }
                  }
                  if (data5.ok !== void 0) {
                    let data10 = data5.ok;
                    if (typeof data10 !== "boolean") {
                      const err33 = { instancePath: instancePath + "/result/ok", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                      if (vErrors === null) {
                        vErrors = [err33];
                      } else {
                        vErrors.push(err33);
                      }
                      errors++;
                    }
                    if (false !== data10) {
                      const err34 = { instancePath: instancePath + "/result/ok", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err34];
                      } else {
                        vErrors.push(err34);
                      }
                      errors++;
                    }
                  }
                  if (data5.error !== void 0) {
                    let data11 = data5.error;
                    if (typeof data11 !== "string") {
                      const err35 = { instancePath: instancePath + "/result/error", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/1/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err35];
                      } else {
                        vErrors.push(err35);
                      }
                      errors++;
                    }
                    if (!(data11 === "goal_not_found" || data11 === "stale_run" || data11 === "goal_busy" || data11 === "plan_mode_busy" || data11 === "plan_mode_failed" || data11 === "service_shutting_down")) {
                      const err36 = { instancePath: instancePath + "/result/error", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/1/properties/error/enum", keyword: "enum", params: { allowedValues: schema20.anyOf[1].properties.error.enum }, message: "must be equal to one of the allowed values" };
                      if (vErrors === null) {
                        vErrors = [err36];
                      } else {
                        vErrors.push(err36);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err37 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err37];
                  } else {
                    vErrors.push(err37);
                  }
                  errors++;
                }
                var _valid1 = _errs32 === errors;
                valid5 = valid5 || _valid1;
              }
              if (!valid5) {
                const err38 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalPlanModeResult/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                if (vErrors === null) {
                  vErrors = [err38];
                } else {
                  vErrors.push(err38);
                }
                errors++;
              } else {
                errors = _errs20;
                if (vErrors !== null) {
                  if (_errs20) {
                    vErrors.length = _errs20;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
          } else {
            const err39 = { instancePath, schemaPath: "#/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err39];
            } else {
              vErrors.push(err39);
            }
            errors++;
          }
          var _valid0 = _errs13 === errors;
          valid0 = valid0 || _valid0;
          if (!valid0) {
            const _errs39 = errors;
            if (data && typeof data == "object" && !Array.isArray(data)) {
              if (data.kind === void 0) {
                const err40 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
              if (data.result === void 0) {
                const err41 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "result" }, message: "must have required property 'result'" };
                if (vErrors === null) {
                  vErrors = [err41];
                } else {
                  vErrors.push(err41);
                }
                errors++;
              }
              for (const key5 in data) {
                if (!(key5 === "kind" || key5 === "result")) {
                  const err42 = { instancePath, schemaPath: "#/anyOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err42];
                  } else {
                    vErrors.push(err42);
                  }
                  errors++;
                }
              }
              if (data.kind !== void 0) {
                let data12 = data.kind;
                if (typeof data12 !== "string") {
                  const err43 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/3/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err43];
                  } else {
                    vErrors.push(err43);
                  }
                  errors++;
                }
                if ("model_selection" !== data12) {
                  const err44 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/3/properties/kind/const", keyword: "const", params: { allowedValue: "model_selection" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err44];
                  } else {
                    vErrors.push(err44);
                  }
                  errors++;
                }
              }
              if (data.result !== void 0) {
                if (!validate20(data.result, { instancePath: instancePath + "/result", parentData: data, parentDataProperty: "result", rootData })) {
                  vErrors = vErrors === null ? validate20.errors : vErrors.concat(validate20.errors);
                  errors = vErrors.length;
                }
              }
            } else {
              const err45 = { instancePath, schemaPath: "#/anyOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err45];
              } else {
                vErrors.push(err45);
              }
              errors++;
            }
            var _valid0 = _errs39 === errors;
            valid0 = valid0 || _valid0;
            if (!valid0) {
              const _errs45 = errors;
              if (data && typeof data == "object" && !Array.isArray(data)) {
                if (data.kind === void 0) {
                  const err46 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err46];
                  } else {
                    vErrors.push(err46);
                  }
                  errors++;
                }
                if (data.result === void 0) {
                  const err47 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "result" }, message: "must have required property 'result'" };
                  if (vErrors === null) {
                    vErrors = [err47];
                  } else {
                    vErrors.push(err47);
                  }
                  errors++;
                }
                for (const key6 in data) {
                  if (!(key6 === "kind" || key6 === "result")) {
                    const err48 = { instancePath, schemaPath: "#/anyOf/4/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err48];
                    } else {
                      vErrors.push(err48);
                    }
                    errors++;
                  }
                }
                if (data.kind !== void 0) {
                  let data14 = data.kind;
                  if (typeof data14 !== "string") {
                    const err49 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/4/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err49];
                    } else {
                      vErrors.push(err49);
                    }
                    errors++;
                  }
                  if ("permission_mode" !== data14) {
                    const err50 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/4/properties/kind/const", keyword: "const", params: { allowedValue: "permission_mode" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err50];
                    } else {
                      vErrors.push(err50);
                    }
                    errors++;
                  }
                }
                if (data.result !== void 0) {
                  if (!validate22(data.result, { instancePath: instancePath + "/result", parentData: data, parentDataProperty: "result", rootData })) {
                    vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
                    errors = vErrors.length;
                  }
                }
              } else {
                const err51 = { instancePath, schemaPath: "#/anyOf/4/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
              var _valid0 = _errs45 === errors;
              valid0 = valid0 || _valid0;
              if (!valid0) {
                const _errs51 = errors;
                if (data && typeof data == "object" && !Array.isArray(data)) {
                  if (data.kind === void 0) {
                    const err52 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                    if (vErrors === null) {
                      vErrors = [err52];
                    } else {
                      vErrors.push(err52);
                    }
                    errors++;
                  }
                  if (data.result === void 0) {
                    const err53 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "result" }, message: "must have required property 'result'" };
                    if (vErrors === null) {
                      vErrors = [err53];
                    } else {
                      vErrors.push(err53);
                    }
                    errors++;
                  }
                  for (const key7 in data) {
                    if (!(key7 === "kind" || key7 === "result")) {
                      const err54 = { instancePath, schemaPath: "#/anyOf/5/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key7 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err54];
                      } else {
                        vErrors.push(err54);
                      }
                      errors++;
                    }
                  }
                  if (data.kind !== void 0) {
                    let data16 = data.kind;
                    if (typeof data16 !== "string") {
                      const err55 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/5/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err55];
                      } else {
                        vErrors.push(err55);
                      }
                      errors++;
                    }
                    if ("grant_revoke" !== data16) {
                      const err56 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/5/properties/kind/const", keyword: "const", params: { allowedValue: "grant_revoke" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err56];
                      } else {
                        vErrors.push(err56);
                      }
                      errors++;
                    }
                  }
                  if (data.result !== void 0) {
                    if (!validate24(data.result, { instancePath: instancePath + "/result", parentData: data, parentDataProperty: "result", rootData })) {
                      vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
                      errors = vErrors.length;
                    }
                  }
                } else {
                  const err57 = { instancePath, schemaPath: "#/anyOf/5/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err57];
                  } else {
                    vErrors.push(err57);
                  }
                  errors++;
                }
                var _valid0 = _errs51 === errors;
                valid0 = valid0 || _valid0;
                if (!valid0) {
                  const _errs57 = errors;
                  if (data && typeof data == "object" && !Array.isArray(data)) {
                    if (data.kind === void 0) {
                      const err58 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                      if (vErrors === null) {
                        vErrors = [err58];
                      } else {
                        vErrors.push(err58);
                      }
                      errors++;
                    }
                    if (data.result === void 0) {
                      const err59 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "result" }, message: "must have required property 'result'" };
                      if (vErrors === null) {
                        vErrors = [err59];
                      } else {
                        vErrors.push(err59);
                      }
                      errors++;
                    }
                    for (const key8 in data) {
                      if (!(key8 === "kind" || key8 === "result")) {
                        const err60 = { instancePath, schemaPath: "#/anyOf/6/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key8 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err60];
                        } else {
                          vErrors.push(err60);
                        }
                        errors++;
                      }
                    }
                    if (data.kind !== void 0) {
                      let data18 = data.kind;
                      if (typeof data18 !== "string") {
                        const err61 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/6/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err61];
                        } else {
                          vErrors.push(err61);
                        }
                        errors++;
                      }
                      if ("goal_archive" !== data18) {
                        const err62 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/6/properties/kind/const", keyword: "const", params: { allowedValue: "goal_archive" }, message: "must be equal to constant" };
                        if (vErrors === null) {
                          vErrors = [err62];
                        } else {
                          vErrors.push(err62);
                        }
                        errors++;
                      }
                    }
                    if (data.result !== void 0) {
                      let data19 = data.result;
                      const _errs64 = errors;
                      let valid13 = false;
                      const _errs65 = errors;
                      if (data19 && typeof data19 == "object" && !Array.isArray(data19)) {
                        if (data19.ok === void 0) {
                          const err63 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalArchiveResult/anyOf/0/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
                          if (vErrors === null) {
                            vErrors = [err63];
                          } else {
                            vErrors.push(err63);
                          }
                          errors++;
                        }
                        if (data19.archived === void 0) {
                          const err64 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalArchiveResult/anyOf/0/required", keyword: "required", params: { missingProperty: "archived" }, message: "must have required property 'archived'" };
                          if (vErrors === null) {
                            vErrors = [err64];
                          } else {
                            vErrors.push(err64);
                          }
                          errors++;
                        }
                        for (const key9 in data19) {
                          if (!(key9 === "ok" || key9 === "archived")) {
                            const err65 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalArchiveResult/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key9 }, message: "must NOT have additional properties" };
                            if (vErrors === null) {
                              vErrors = [err65];
                            } else {
                              vErrors.push(err65);
                            }
                            errors++;
                          }
                        }
                        if (data19.ok !== void 0) {
                          let data20 = data19.ok;
                          if (typeof data20 !== "boolean") {
                            const err66 = { instancePath: instancePath + "/result/ok", schemaPath: "#/definitions/BrowserGoalArchiveResult/anyOf/0/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                            if (vErrors === null) {
                              vErrors = [err66];
                            } else {
                              vErrors.push(err66);
                            }
                            errors++;
                          }
                          if (true !== data20) {
                            const err67 = { instancePath: instancePath + "/result/ok", schemaPath: "#/definitions/BrowserGoalArchiveResult/anyOf/0/properties/ok/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
                            if (vErrors === null) {
                              vErrors = [err67];
                            } else {
                              vErrors.push(err67);
                            }
                            errors++;
                          }
                        }
                        if (data19.archived !== void 0) {
                          if (typeof data19.archived !== "boolean") {
                            const err68 = { instancePath: instancePath + "/result/archived", schemaPath: "#/definitions/BrowserGoalArchiveResult/anyOf/0/properties/archived/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                            if (vErrors === null) {
                              vErrors = [err68];
                            } else {
                              vErrors.push(err68);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err69 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalArchiveResult/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                        if (vErrors === null) {
                          vErrors = [err69];
                        } else {
                          vErrors.push(err69);
                        }
                        errors++;
                      }
                      var _valid2 = _errs65 === errors;
                      valid13 = valid13 || _valid2;
                      if (!valid13) {
                        const _errs72 = errors;
                        if (data19 && typeof data19 == "object" && !Array.isArray(data19)) {
                          if (data19.ok === void 0) {
                            const err70 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalArchiveResult/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
                            if (vErrors === null) {
                              vErrors = [err70];
                            } else {
                              vErrors.push(err70);
                            }
                            errors++;
                          }
                          if (data19.error === void 0) {
                            const err71 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalArchiveResult/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
                            if (vErrors === null) {
                              vErrors = [err71];
                            } else {
                              vErrors.push(err71);
                            }
                            errors++;
                          }
                          for (const key10 in data19) {
                            if (!(key10 === "ok" || key10 === "error")) {
                              const err72 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalArchiveResult/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key10 }, message: "must NOT have additional properties" };
                              if (vErrors === null) {
                                vErrors = [err72];
                              } else {
                                vErrors.push(err72);
                              }
                              errors++;
                            }
                          }
                          if (data19.ok !== void 0) {
                            let data22 = data19.ok;
                            if (typeof data22 !== "boolean") {
                              const err73 = { instancePath: instancePath + "/result/ok", schemaPath: "#/definitions/BrowserGoalArchiveResult/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                              if (vErrors === null) {
                                vErrors = [err73];
                              } else {
                                vErrors.push(err73);
                              }
                              errors++;
                            }
                            if (false !== data22) {
                              const err74 = { instancePath: instancePath + "/result/ok", schemaPath: "#/definitions/BrowserGoalArchiveResult/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
                              if (vErrors === null) {
                                vErrors = [err74];
                              } else {
                                vErrors.push(err74);
                              }
                              errors++;
                            }
                          }
                          if (data19.error !== void 0) {
                            if (typeof data19.error !== "string") {
                              const err75 = { instancePath: instancePath + "/result/error", schemaPath: "#/definitions/BrowserGoalArchiveResult/anyOf/1/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err75];
                              } else {
                                vErrors.push(err75);
                              }
                              errors++;
                            }
                          }
                        } else {
                          const err76 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalArchiveResult/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                          if (vErrors === null) {
                            vErrors = [err76];
                          } else {
                            vErrors.push(err76);
                          }
                          errors++;
                        }
                        var _valid2 = _errs72 === errors;
                        valid13 = valid13 || _valid2;
                      }
                      if (!valid13) {
                        const err77 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalArchiveResult/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                        if (vErrors === null) {
                          vErrors = [err77];
                        } else {
                          vErrors.push(err77);
                        }
                        errors++;
                      } else {
                        errors = _errs64;
                        if (vErrors !== null) {
                          if (_errs64) {
                            vErrors.length = _errs64;
                          } else {
                            vErrors = null;
                          }
                        }
                      }
                    }
                  } else {
                    const err78 = { instancePath, schemaPath: "#/anyOf/6/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err78];
                    } else {
                      vErrors.push(err78);
                    }
                    errors++;
                  }
                  var _valid0 = _errs57 === errors;
                  valid0 = valid0 || _valid0;
                  if (!valid0) {
                    const _errs79 = errors;
                    if (data && typeof data == "object" && !Array.isArray(data)) {
                      if (data.kind === void 0) {
                        const err79 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                        if (vErrors === null) {
                          vErrors = [err79];
                        } else {
                          vErrors.push(err79);
                        }
                        errors++;
                      }
                      if (data.result === void 0) {
                        const err80 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "result" }, message: "must have required property 'result'" };
                        if (vErrors === null) {
                          vErrors = [err80];
                        } else {
                          vErrors.push(err80);
                        }
                        errors++;
                      }
                      for (const key11 in data) {
                        if (!(key11 === "kind" || key11 === "result")) {
                          const err81 = { instancePath, schemaPath: "#/anyOf/7/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key11 }, message: "must NOT have additional properties" };
                          if (vErrors === null) {
                            vErrors = [err81];
                          } else {
                            vErrors.push(err81);
                          }
                          errors++;
                        }
                      }
                      if (data.kind !== void 0) {
                        let data24 = data.kind;
                        if (typeof data24 !== "string") {
                          const err82 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/7/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err82];
                          } else {
                            vErrors.push(err82);
                          }
                          errors++;
                        }
                        if ("goal_delete" !== data24) {
                          const err83 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/7/properties/kind/const", keyword: "const", params: { allowedValue: "goal_delete" }, message: "must be equal to constant" };
                          if (vErrors === null) {
                            vErrors = [err83];
                          } else {
                            vErrors.push(err83);
                          }
                          errors++;
                        }
                      }
                      if (data.result !== void 0) {
                        let data25 = data.result;
                        const _errs86 = errors;
                        let valid18 = false;
                        const _errs87 = errors;
                        if (data25 && typeof data25 == "object" && !Array.isArray(data25)) {
                          if (data25.ok === void 0) {
                            const err84 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalDeleteResult/anyOf/0/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
                            if (vErrors === null) {
                              vErrors = [err84];
                            } else {
                              vErrors.push(err84);
                            }
                            errors++;
                          }
                          if (data25.deleted === void 0) {
                            const err85 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalDeleteResult/anyOf/0/required", keyword: "required", params: { missingProperty: "deleted" }, message: "must have required property 'deleted'" };
                            if (vErrors === null) {
                              vErrors = [err85];
                            } else {
                              vErrors.push(err85);
                            }
                            errors++;
                          }
                          for (const key12 in data25) {
                            if (!(key12 === "ok" || key12 === "deleted")) {
                              const err86 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalDeleteResult/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key12 }, message: "must NOT have additional properties" };
                              if (vErrors === null) {
                                vErrors = [err86];
                              } else {
                                vErrors.push(err86);
                              }
                              errors++;
                            }
                          }
                          if (data25.ok !== void 0) {
                            let data26 = data25.ok;
                            if (typeof data26 !== "boolean") {
                              const err87 = { instancePath: instancePath + "/result/ok", schemaPath: "#/definitions/BrowserGoalDeleteResult/anyOf/0/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                              if (vErrors === null) {
                                vErrors = [err87];
                              } else {
                                vErrors.push(err87);
                              }
                              errors++;
                            }
                            if (true !== data26) {
                              const err88 = { instancePath: instancePath + "/result/ok", schemaPath: "#/definitions/BrowserGoalDeleteResult/anyOf/0/properties/ok/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
                              if (vErrors === null) {
                                vErrors = [err88];
                              } else {
                                vErrors.push(err88);
                              }
                              errors++;
                            }
                          }
                          if (data25.deleted !== void 0) {
                            let data27 = data25.deleted;
                            if (typeof data27 !== "boolean") {
                              const err89 = { instancePath: instancePath + "/result/deleted", schemaPath: "#/definitions/BrowserGoalDeleteResult/anyOf/0/properties/deleted/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                              if (vErrors === null) {
                                vErrors = [err89];
                              } else {
                                vErrors.push(err89);
                              }
                              errors++;
                            }
                            if (true !== data27) {
                              const err90 = { instancePath: instancePath + "/result/deleted", schemaPath: "#/definitions/BrowserGoalDeleteResult/anyOf/0/properties/deleted/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
                              if (vErrors === null) {
                                vErrors = [err90];
                              } else {
                                vErrors.push(err90);
                              }
                              errors++;
                            }
                          }
                        } else {
                          const err91 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalDeleteResult/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                          if (vErrors === null) {
                            vErrors = [err91];
                          } else {
                            vErrors.push(err91);
                          }
                          errors++;
                        }
                        var _valid3 = _errs87 === errors;
                        valid18 = valid18 || _valid3;
                        if (!valid18) {
                          const _errs94 = errors;
                          if (data25 && typeof data25 == "object" && !Array.isArray(data25)) {
                            if (data25.ok === void 0) {
                              const err92 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalDeleteResult/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
                              if (vErrors === null) {
                                vErrors = [err92];
                              } else {
                                vErrors.push(err92);
                              }
                              errors++;
                            }
                            if (data25.error === void 0) {
                              const err93 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalDeleteResult/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
                              if (vErrors === null) {
                                vErrors = [err93];
                              } else {
                                vErrors.push(err93);
                              }
                              errors++;
                            }
                            for (const key13 in data25) {
                              if (!(key13 === "ok" || key13 === "error")) {
                                const err94 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalDeleteResult/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key13 }, message: "must NOT have additional properties" };
                                if (vErrors === null) {
                                  vErrors = [err94];
                                } else {
                                  vErrors.push(err94);
                                }
                                errors++;
                              }
                            }
                            if (data25.ok !== void 0) {
                              let data28 = data25.ok;
                              if (typeof data28 !== "boolean") {
                                const err95 = { instancePath: instancePath + "/result/ok", schemaPath: "#/definitions/BrowserGoalDeleteResult/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                                if (vErrors === null) {
                                  vErrors = [err95];
                                } else {
                                  vErrors.push(err95);
                                }
                                errors++;
                              }
                              if (false !== data28) {
                                const err96 = { instancePath: instancePath + "/result/ok", schemaPath: "#/definitions/BrowserGoalDeleteResult/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
                                if (vErrors === null) {
                                  vErrors = [err96];
                                } else {
                                  vErrors.push(err96);
                                }
                                errors++;
                              }
                            }
                            if (data25.error !== void 0) {
                              if (typeof data25.error !== "string") {
                                const err97 = { instancePath: instancePath + "/result/error", schemaPath: "#/definitions/BrowserGoalDeleteResult/anyOf/1/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                                if (vErrors === null) {
                                  vErrors = [err97];
                                } else {
                                  vErrors.push(err97);
                                }
                                errors++;
                              }
                            }
                          } else {
                            const err98 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalDeleteResult/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                            if (vErrors === null) {
                              vErrors = [err98];
                            } else {
                              vErrors.push(err98);
                            }
                            errors++;
                          }
                          var _valid3 = _errs94 === errors;
                          valid18 = valid18 || _valid3;
                        }
                        if (!valid18) {
                          const err99 = { instancePath: instancePath + "/result", schemaPath: "#/definitions/BrowserGoalDeleteResult/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                          if (vErrors === null) {
                            vErrors = [err99];
                          } else {
                            vErrors.push(err99);
                          }
                          errors++;
                        } else {
                          errors = _errs86;
                          if (vErrors !== null) {
                            if (_errs86) {
                              vErrors.length = _errs86;
                            } else {
                              vErrors = null;
                            }
                          }
                        }
                      }
                    } else {
                      const err100 = { instancePath, schemaPath: "#/anyOf/7/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                      if (vErrors === null) {
                        vErrors = [err100];
                      } else {
                        vErrors.push(err100);
                      }
                      errors++;
                    }
                    var _valid0 = _errs79 === errors;
                    valid0 = valid0 || _valid0;
                    if (!valid0) {
                      const _errs101 = errors;
                      if (data && typeof data == "object" && !Array.isArray(data)) {
                        if (data.kind === void 0) {
                          const err101 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                          if (vErrors === null) {
                            vErrors = [err101];
                          } else {
                            vErrors.push(err101);
                          }
                          errors++;
                        }
                        if (data.result === void 0) {
                          const err102 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "result" }, message: "must have required property 'result'" };
                          if (vErrors === null) {
                            vErrors = [err102];
                          } else {
                            vErrors.push(err102);
                          }
                          errors++;
                        }
                        for (const key14 in data) {
                          if (!(key14 === "kind" || key14 === "result")) {
                            const err103 = { instancePath, schemaPath: "#/anyOf/8/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key14 }, message: "must NOT have additional properties" };
                            if (vErrors === null) {
                              vErrors = [err103];
                            } else {
                              vErrors.push(err103);
                            }
                            errors++;
                          }
                        }
                        if (data.kind !== void 0) {
                          let data30 = data.kind;
                          if (typeof data30 !== "string") {
                            const err104 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/8/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err104];
                            } else {
                              vErrors.push(err104);
                            }
                            errors++;
                          }
                          if ("action_review" !== data30) {
                            const err105 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/8/properties/kind/const", keyword: "const", params: { allowedValue: "action_review" }, message: "must be equal to constant" };
                            if (vErrors === null) {
                              vErrors = [err105];
                            } else {
                              vErrors.push(err105);
                            }
                            errors++;
                          }
                        }
                        if (data.result !== void 0) {
                          if (!validate28(data.result, { instancePath: instancePath + "/result", parentData: data, parentDataProperty: "result", rootData })) {
                            vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
                            errors = vErrors.length;
                          }
                        }
                      } else {
                        const err106 = { instancePath, schemaPath: "#/anyOf/8/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                        if (vErrors === null) {
                          vErrors = [err106];
                        } else {
                          vErrors.push(err106);
                        }
                        errors++;
                      }
                      var _valid0 = _errs101 === errors;
                      valid0 = valid0 || _valid0;
                    }
                  }
                }
              }
            }
          }
        }
      }
      if (!valid0) {
        const err107 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err107];
        } else {
          vErrors.push(err107);
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
        if (data.intentId === void 0) {
          const err0 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "intentId" }, message: "must have required property 'intentId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.status === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.result === void 0) {
          const err2 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "result" }, message: "must have required property 'result'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "intentId" || key0 === "status" || key0 === "result")) {
            const err3 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.intentId !== void 0) {
          if (typeof data.intentId !== "string") {
            const err4 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/0/properties/intentId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.status !== void 0) {
          let data1 = data.status;
          if (typeof data1 !== "string") {
            const err5 = { instancePath: instancePath + "/status", schemaPath: "#/anyOf/0/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if (!(data1 === "accepted" || data1 === "existing")) {
            const err6 = { instancePath: instancePath + "/status", schemaPath: "#/anyOf/0/properties/status/enum", keyword: "enum", params: { allowedValues: schema12.anyOf[0].properties.status.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.result !== void 0) {
          if (!validate12(data.result, { instancePath: instancePath + "/result", parentData: data, parentDataProperty: "result", rootData })) {
            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
            errors = vErrors.length;
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
        const _errs9 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.intentId === void 0) {
            const err8 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "intentId" }, message: "must have required property 'intentId'" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (data.status === void 0) {
            const err9 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          if (data.error === void 0) {
            const err10 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "intentId" || key1 === "status" || key1 === "error" || key1 === "refresh" || key1 === "actualRevision")) {
              const err11 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          }
          if (data.intentId !== void 0) {
            if (typeof data.intentId !== "string") {
              const err12 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/1/properties/intentId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          }
          if (data.status !== void 0) {
            let data4 = data.status;
            if (typeof data4 !== "string") {
              const err13 = { instancePath: instancePath + "/status", schemaPath: "#/anyOf/1/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            if ("rejected" !== data4) {
              const err14 = { instancePath: instancePath + "/status", schemaPath: "#/anyOf/1/properties/status/const", keyword: "const", params: { allowedValue: "rejected" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          }
          if (data.error !== void 0) {
            if (typeof data.error !== "string") {
              const err15 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          }
          if (data.refresh !== void 0) {
            if (typeof data.refresh !== "boolean") {
              const err16 = { instancePath: instancePath + "/refresh", schemaPath: "#/anyOf/1/properties/refresh/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
          if (data.actualRevision !== void 0) {
            let data7 = data.actualRevision;
            if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
              const err17 = { instancePath: instancePath + "/actualRevision", schemaPath: "#/anyOf/1/properties/actualRevision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if (typeof data7 == "number" && isFinite(data7)) {
              if (data7 > 9007199254740991 || isNaN(data7)) {
                const err18 = { instancePath: instancePath + "/actualRevision", schemaPath: "#/anyOf/1/properties/actualRevision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
          }
        } else {
          const err19 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
        var _valid0 = _errs9 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs22 = errors;
          if (data && typeof data == "object" && !Array.isArray(data)) {
            if (data.intentId === void 0) {
              const err20 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "intentId" }, message: "must have required property 'intentId'" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
            if (data.status === void 0) {
              const err21 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
            for (const key2 in data) {
              if (!(key2 === "intentId" || key2 === "status")) {
                const err22 = { instancePath, schemaPath: "#/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
            }
            if (data.intentId !== void 0) {
              if (typeof data.intentId !== "string") {
                const err23 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/2/properties/intentId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
            }
            if (data.status !== void 0) {
              let data9 = data.status;
              if (typeof data9 !== "string") {
                const err24 = { instancePath: instancePath + "/status", schemaPath: "#/anyOf/2/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err24];
                } else {
                  vErrors.push(err24);
                }
                errors++;
              }
              if ("unknown" !== data9) {
                const err25 = { instancePath: instancePath + "/status", schemaPath: "#/anyOf/2/properties/status/const", keyword: "const", params: { allowedValue: "unknown" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err25];
                } else {
                  vErrors.push(err25);
                }
                errors++;
              }
            }
          } else {
            const err26 = { instancePath, schemaPath: "#/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
          var _valid0 = _errs22 === errors;
          valid0 = valid0 || _valid0;
        }
      }
      if (!valid0) {
        const err27 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
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
export default require_BrowserControlReceipt_validator();
