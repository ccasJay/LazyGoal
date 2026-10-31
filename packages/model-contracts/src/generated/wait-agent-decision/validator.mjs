var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// WaitAgentDecision-validator.cjs
var require_WaitAgentDecision_validator = __commonJS({
  "WaitAgentDecision-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema19 = { "type": "string", "enum": ["stable", "last_observed"], "description": "Fact \u7684\u6301\u7EED\u6027\u7A33\u5B9A\u6027\u3002" };
    var schema21 = { "type": "string", "enum": ["goal", "phase"], "description": "Working Memory \u6761\u76EE\u4F5C\u7528\u57DF\u3002" };
    var schema17 = { "type": ["string", "number", "boolean", "null"], "description": "Fact \u6807\u91CF\u503C\u3002" };
    function validate15(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (typeof data !== "string" && !(typeof data == "number" && isFinite(data)) && typeof data !== "boolean" && data !== null) {
        const err0 = { instancePath, schemaPath: "#/definitions/FactScalar/type", keyword: "type", params: { type: schema17.type }, message: "must be string,number,boolean,null" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs4 = errors;
        if (Array.isArray(data)) {
          const len0 = data.length;
          for (let i0 = 0; i0 < len0; i0++) {
            let data0 = data[i0];
            if (typeof data0 !== "string" && !(typeof data0 == "number" && isFinite(data0)) && typeof data0 !== "boolean" && data0 !== null) {
              const err1 = { instancePath: instancePath + "/" + i0, schemaPath: "#/definitions/FactScalar/type", keyword: "type", params: { type: schema17.type }, message: "must be string,number,boolean,null" };
              if (vErrors === null) {
                vErrors = [err1];
              } else {
                vErrors.push(err1);
              }
              errors++;
            }
          }
        } else {
          const err2 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "array" }, message: "must be array" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        var _valid0 = _errs4 === errors;
        valid0 = valid0 || _valid0;
      }
      if (!valid0) {
        const err3 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
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
      validate15.errors = vErrors;
      return errors === 0;
    }
    function validate14(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.subject === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "subject" }, message: "must have required property 'subject'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.predicate === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "predicate" }, message: "must have required property 'predicate'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.value === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "value" }, message: "must have required property 'value'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.stability === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stability" }, message: "must have required property 'stability'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.evidenceSequences === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "evidenceSequences" }, message: "must have required property 'evidenceSequences'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "subject" || key0 === "predicate" || key0 === "value" || key0 === "stability" || key0 === "evidenceSequences" || key0 === "scope")) {
            const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.subject !== void 0) {
          if (typeof data.subject !== "string") {
            const err6 = { instancePath: instancePath + "/subject", schemaPath: "#/properties/subject/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.predicate !== void 0) {
          if (typeof data.predicate !== "string") {
            const err7 = { instancePath: instancePath + "/predicate", schemaPath: "#/properties/predicate/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.value !== void 0) {
          if (!validate15(data.value, { instancePath: instancePath + "/value", parentData: data, parentDataProperty: "value", rootData })) {
            vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
            errors = vErrors.length;
          }
        }
        if (data.stability !== void 0) {
          let data3 = data.stability;
          if (typeof data3 !== "string") {
            const err8 = { instancePath: instancePath + "/stability", schemaPath: "#/definitions/FactStability/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (!(data3 === "stable" || data3 === "last_observed")) {
            const err9 = { instancePath: instancePath + "/stability", schemaPath: "#/definitions/FactStability/enum", keyword: "enum", params: { allowedValues: schema19.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.evidenceSequences !== void 0) {
          let data4 = data.evidenceSequences;
          if (Array.isArray(data4)) {
            if (data4.length < 1) {
              const err10 = { instancePath: instancePath + "/evidenceSequences", schemaPath: "#/properties/evidenceSequences/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
            const len0 = data4.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data5 = data4[i0];
              if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
                const err11 = { instancePath: instancePath + "/evidenceSequences/" + i0, schemaPath: "#/definitions/NonNegativeInteger/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
              if (typeof data5 == "number" && isFinite(data5)) {
                if (data5 < 0 || isNaN(data5)) {
                  const err12 = { instancePath: instancePath + "/evidenceSequences/" + i0, schemaPath: "#/definitions/NonNegativeInteger/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
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
            const err13 = { instancePath: instancePath + "/evidenceSequences", schemaPath: "#/properties/evidenceSequences/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.scope !== void 0) {
          let data6 = data.scope;
          if (typeof data6 !== "string") {
            const err14 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/MemoryEntryScope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          if (!(data6 === "goal" || data6 === "phase")) {
            const err15 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/MemoryEntryScope/enum", keyword: "enum", params: { allowedValues: schema21.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
      } else {
        const err16 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
      validate14.errors = vErrors;
      return errors === 0;
    }
    function validate18(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (data.evidenceSequences === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "evidenceSequences" }, message: "must have required property 'evidenceSequences'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "id" || key0 === "evidenceSequences")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.id !== void 0) {
          if (typeof data.id !== "string") {
            const err3 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.evidenceSequences !== void 0) {
          let data1 = data.evidenceSequences;
          if (Array.isArray(data1)) {
            if (data1.length < 1) {
              const err4 = { instancePath: instancePath + "/evidenceSequences", schemaPath: "#/properties/evidenceSequences/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
            const len0 = data1.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data2 = data1[i0];
              if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
                const err5 = { instancePath: instancePath + "/evidenceSequences/" + i0, schemaPath: "#/definitions/NonNegativeInteger/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err5];
                } else {
                  vErrors.push(err5);
                }
                errors++;
              }
              if (typeof data2 == "number" && isFinite(data2)) {
                if (data2 < 0 || isNaN(data2)) {
                  const err6 = { instancePath: instancePath + "/evidenceSequences/" + i0, schemaPath: "#/definitions/NonNegativeInteger/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
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
            const err7 = { instancePath: instancePath + "/evidenceSequences", schemaPath: "#/properties/evidenceSequences/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
      } else {
        const err8 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
      validate18.errors = vErrors;
      return errors === 0;
    }
    function validate20(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.statement === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "statement" }, message: "must have required property 'statement'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "statement" || key0 === "scope")) {
            const err1 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.statement !== void 0) {
          if (typeof data.statement !== "string") {
            const err2 = { instancePath: instancePath + "/statement", schemaPath: "#/properties/statement/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.scope !== void 0) {
          let data1 = data.scope;
          if (typeof data1 !== "string") {
            const err3 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/MemoryEntryScope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (!(data1 === "goal" || data1 === "phase")) {
            const err4 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/MemoryEntryScope/enum", keyword: "enum", params: { allowedValues: schema21.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
      } else {
        const err5 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
      validate20.errors = vErrors;
      return errors === 0;
    }
    var schema27 = { "type": "string", "enum": ["active", "resolved", "superseded"], "description": "Working Memory \u6761\u76EE\u72B6\u6001\u3002" };
    function validate22(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        for (const key0 in data) {
          if (!(key0 === "id" || key0 === "statement" || key0 === "status")) {
            const err1 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.id !== void 0) {
          if (typeof data.id !== "string") {
            const err2 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.statement !== void 0) {
          if (typeof data.statement !== "string") {
            const err3 = { instancePath: instancePath + "/statement", schemaPath: "#/properties/statement/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.status !== void 0) {
          let data2 = data.status;
          if (typeof data2 !== "string") {
            const err4 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/MemoryEntryStatus/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if (!(data2 === "active" || data2 === "resolved" || data2 === "superseded")) {
            const err5 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/MemoryEntryStatus/enum", keyword: "enum", params: { allowedValues: schema27.enum }, message: "must be equal to one of the allowed values" };
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
      validate22.errors = vErrors;
      return errors === 0;
    }
    function validate24(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.description === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "description" }, message: "must have required property 'description'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "description" || key0 === "scope")) {
            const err1 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.description !== void 0) {
          if (typeof data.description !== "string") {
            const err2 = { instancePath: instancePath + "/description", schemaPath: "#/properties/description/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.scope !== void 0) {
          let data1 = data.scope;
          if (typeof data1 !== "string") {
            const err3 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/MemoryEntryScope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (!(data1 === "goal" || data1 === "phase")) {
            const err4 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/MemoryEntryScope/enum", keyword: "enum", params: { allowedValues: schema21.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
      } else {
        const err5 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
      validate24.errors = vErrors;
      return errors === 0;
    }
    function validate26(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        for (const key0 in data) {
          if (!(key0 === "id" || key0 === "description" || key0 === "status")) {
            const err1 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.id !== void 0) {
          if (typeof data.id !== "string") {
            const err2 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.description !== void 0) {
          if (typeof data.description !== "string") {
            const err3 = { instancePath: instancePath + "/description", schemaPath: "#/properties/description/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.status !== void 0) {
          let data2 = data.status;
          if (typeof data2 !== "string") {
            const err4 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/MemoryEntryStatus/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if (!(data2 === "active" || data2 === "resolved" || data2 === "superseded")) {
            const err5 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/MemoryEntryStatus/enum", keyword: "enum", params: { allowedValues: schema27.enum }, message: "must be equal to one of the allowed values" };
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
      validate26.errors = vErrors;
      return errors === 0;
    }
    function validate13(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.type === void 0) {
          const err0 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.fact === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "fact" }, message: "must have required property 'fact'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "type" || key0 === "fact")) {
            const err2 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.type !== void 0) {
          let data0 = data.type;
          if (typeof data0 !== "string") {
            const err3 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/0/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if ("upsert_fact" !== data0) {
            const err4 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/0/properties/type/const", keyword: "const", params: { allowedValue: "upsert_fact" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.fact !== void 0) {
          if (!validate14(data.fact, { instancePath: instancePath + "/fact", parentData: data, parentDataProperty: "fact", rootData })) {
            vErrors = vErrors === null ? validate14.errors : vErrors.concat(validate14.errors);
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
          if (data.type === void 0) {
            const err6 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if (data.fact === void 0) {
            const err7 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "fact" }, message: "must have required property 'fact'" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "type" || key1 === "fact")) {
              const err8 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          }
          if (data.type !== void 0) {
            let data2 = data.type;
            if (typeof data2 !== "string") {
              const err9 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/1/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            if ("retire_fact" !== data2) {
              const err10 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/1/properties/type/const", keyword: "const", params: { allowedValue: "retire_fact" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
          if (data.fact !== void 0) {
            if (!validate18(data.fact, { instancePath: instancePath + "/fact", parentData: data, parentDataProperty: "fact", rootData })) {
              vErrors = vErrors === null ? validate18.errors : vErrors.concat(validate18.errors);
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
            if (data.type === void 0) {
              const err12 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            if (data.hypothesis === void 0) {
              const err13 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "hypothesis" }, message: "must have required property 'hypothesis'" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            for (const key2 in data) {
              if (!(key2 === "type" || key2 === "hypothesis")) {
                const err14 = { instancePath, schemaPath: "#/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
            }
            if (data.type !== void 0) {
              let data4 = data.type;
              if (typeof data4 !== "string") {
                const err15 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/2/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
              if ("create_hypothesis" !== data4) {
                const err16 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/2/properties/type/const", keyword: "const", params: { allowedValue: "create_hypothesis" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
            if (data.hypothesis !== void 0) {
              if (!validate20(data.hypothesis, { instancePath: instancePath + "/hypothesis", parentData: data, parentDataProperty: "hypothesis", rootData })) {
                vErrors = vErrors === null ? validate20.errors : vErrors.concat(validate20.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err17 = { instancePath, schemaPath: "#/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
          var _valid0 = _errs13 === errors;
          valid0 = valid0 || _valid0;
          if (!valid0) {
            const _errs19 = errors;
            if (data && typeof data == "object" && !Array.isArray(data)) {
              if (data.type === void 0) {
                const err18 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
              if (data.hypothesis === void 0) {
                const err19 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "hypothesis" }, message: "must have required property 'hypothesis'" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
              for (const key3 in data) {
                if (!(key3 === "type" || key3 === "hypothesis")) {
                  const err20 = { instancePath, schemaPath: "#/anyOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err20];
                  } else {
                    vErrors.push(err20);
                  }
                  errors++;
                }
              }
              if (data.type !== void 0) {
                let data6 = data.type;
                if (typeof data6 !== "string") {
                  const err21 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/3/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err21];
                  } else {
                    vErrors.push(err21);
                  }
                  errors++;
                }
                if ("update_hypothesis" !== data6) {
                  const err22 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/3/properties/type/const", keyword: "const", params: { allowedValue: "update_hypothesis" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                }
              }
              if (data.hypothesis !== void 0) {
                if (!validate22(data.hypothesis, { instancePath: instancePath + "/hypothesis", parentData: data, parentDataProperty: "hypothesis", rootData })) {
                  vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
                  errors = vErrors.length;
                }
              }
            } else {
              const err23 = { instancePath, schemaPath: "#/anyOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
            var _valid0 = _errs19 === errors;
            valid0 = valid0 || _valid0;
            if (!valid0) {
              const _errs25 = errors;
              if (data && typeof data == "object" && !Array.isArray(data)) {
                if (data.type === void 0) {
                  const err24 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                  if (vErrors === null) {
                    vErrors = [err24];
                  } else {
                    vErrors.push(err24);
                  }
                  errors++;
                }
                if (data.blocker === void 0) {
                  const err25 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "blocker" }, message: "must have required property 'blocker'" };
                  if (vErrors === null) {
                    vErrors = [err25];
                  } else {
                    vErrors.push(err25);
                  }
                  errors++;
                }
                for (const key4 in data) {
                  if (!(key4 === "type" || key4 === "blocker")) {
                    const err26 = { instancePath, schemaPath: "#/anyOf/4/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err26];
                    } else {
                      vErrors.push(err26);
                    }
                    errors++;
                  }
                }
                if (data.type !== void 0) {
                  let data8 = data.type;
                  if (typeof data8 !== "string") {
                    const err27 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/4/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err27];
                    } else {
                      vErrors.push(err27);
                    }
                    errors++;
                  }
                  if ("create_blocker" !== data8) {
                    const err28 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/4/properties/type/const", keyword: "const", params: { allowedValue: "create_blocker" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err28];
                    } else {
                      vErrors.push(err28);
                    }
                    errors++;
                  }
                }
                if (data.blocker !== void 0) {
                  if (!validate24(data.blocker, { instancePath: instancePath + "/blocker", parentData: data, parentDataProperty: "blocker", rootData })) {
                    vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
                    errors = vErrors.length;
                  }
                }
              } else {
                const err29 = { instancePath, schemaPath: "#/anyOf/4/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err29];
                } else {
                  vErrors.push(err29);
                }
                errors++;
              }
              var _valid0 = _errs25 === errors;
              valid0 = valid0 || _valid0;
              if (!valid0) {
                const _errs31 = errors;
                if (data && typeof data == "object" && !Array.isArray(data)) {
                  if (data.type === void 0) {
                    const err30 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
                    if (vErrors === null) {
                      vErrors = [err30];
                    } else {
                      vErrors.push(err30);
                    }
                    errors++;
                  }
                  if (data.blocker === void 0) {
                    const err31 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "blocker" }, message: "must have required property 'blocker'" };
                    if (vErrors === null) {
                      vErrors = [err31];
                    } else {
                      vErrors.push(err31);
                    }
                    errors++;
                  }
                  for (const key5 in data) {
                    if (!(key5 === "type" || key5 === "blocker")) {
                      const err32 = { instancePath, schemaPath: "#/anyOf/5/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err32];
                      } else {
                        vErrors.push(err32);
                      }
                      errors++;
                    }
                  }
                  if (data.type !== void 0) {
                    let data10 = data.type;
                    if (typeof data10 !== "string") {
                      const err33 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/5/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err33];
                      } else {
                        vErrors.push(err33);
                      }
                      errors++;
                    }
                    if ("update_blocker" !== data10) {
                      const err34 = { instancePath: instancePath + "/type", schemaPath: "#/anyOf/5/properties/type/const", keyword: "const", params: { allowedValue: "update_blocker" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err34];
                      } else {
                        vErrors.push(err34);
                      }
                      errors++;
                    }
                  }
                  if (data.blocker !== void 0) {
                    if (!validate26(data.blocker, { instancePath: instancePath + "/blocker", parentData: data, parentDataProperty: "blocker", rootData })) {
                      vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
                      errors = vErrors.length;
                    }
                  }
                } else {
                  const err35 = { instancePath, schemaPath: "#/anyOf/5/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err35];
                  } else {
                    vErrors.push(err35);
                  }
                  errors++;
                }
                var _valid0 = _errs31 === errors;
                valid0 = valid0 || _valid0;
              }
            }
          }
        }
      }
      if (!valid0) {
        const err36 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
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
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.protocolVersion === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "protocolVersion" }, message: "must have required property 'protocolVersion'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.operations === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "operations" }, message: "must have required property 'operations'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "protocolVersion" || key0 === "operations")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.protocolVersion !== void 0) {
          let data0 = data.protocolVersion;
          if (!(typeof data0 == "number" && isFinite(data0))) {
            const err3 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/properties/protocolVersion/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (1 !== data0) {
            const err4 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/properties/protocolVersion/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.operations !== void 0) {
          let data1 = data.operations;
          if (Array.isArray(data1)) {
            const len0 = data1.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate13(data1[i0], { instancePath: instancePath + "/operations/" + i0, parentData: data1, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err5 = { instancePath: instancePath + "/operations", schemaPath: "#/properties/operations/type", keyword: "type", params: { type: "array" }, message: "must be array" };
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
      validate12.errors = vErrors;
      return errors === 0;
    }
    var schema33 = { "type": "string", "enum": ["decision", "user_emphasis"], "description": "\u91CD\u8981\u4FE1\u606F\u8BB0\u5F55\u7C7B\u522B\u3002" };
    function validate30(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.category === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "category" }, message: "must have required property 'category'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.content === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.source === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "category" || key0 === "content" || key0 === "reason" || key0 === "stageId" || key0 === "noteId" || key0 === "baseRevision" || key0 === "supersedesNoteId" || key0 === "source")) {
            const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.category !== void 0) {
          let data0 = data.category;
          if (typeof data0 !== "string") {
            const err4 = { instancePath: instancePath + "/category", schemaPath: "#/definitions/ContextNoteCategory/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if (!(data0 === "decision" || data0 === "user_emphasis")) {
            const err5 = { instancePath: instancePath + "/category", schemaPath: "#/definitions/ContextNoteCategory/enum", keyword: "enum", params: { allowedValues: schema33.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.content !== void 0) {
          if (typeof data.content !== "string") {
            const err6 = { instancePath: instancePath + "/content", schemaPath: "#/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.reason !== void 0) {
          if (typeof data.reason !== "string") {
            const err7 = { instancePath: instancePath + "/reason", schemaPath: "#/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.stageId !== void 0) {
          if (typeof data.stageId !== "string") {
            const err8 = { instancePath: instancePath + "/stageId", schemaPath: "#/properties/stageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.noteId !== void 0) {
          if (typeof data.noteId !== "string") {
            const err9 = { instancePath: instancePath + "/noteId", schemaPath: "#/properties/noteId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.baseRevision !== void 0) {
          let data5 = data.baseRevision;
          if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
            const err10 = { instancePath: instancePath + "/baseRevision", schemaPath: "#/definitions/PositiveInteger/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
          if (typeof data5 == "number" && isFinite(data5)) {
            if (data5 < 1 || isNaN(data5)) {
              const err11 = { instancePath: instancePath + "/baseRevision", schemaPath: "#/definitions/PositiveInteger/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          }
        }
        if (data.supersedesNoteId !== void 0) {
          if (typeof data.supersedesNoteId !== "string") {
            const err12 = { instancePath: instancePath + "/supersedesNoteId", schemaPath: "#/properties/supersedesNoteId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.source !== void 0) {
          let data7 = data.source;
          const _errs20 = errors;
          let valid4 = false;
          const _errs21 = errors;
          if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
            if (data7.kind === void 0) {
              const err13 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/ContextNoteSource/anyOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            if (data7.messageId === void 0) {
              const err14 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/ContextNoteSource/anyOf/0/required", keyword: "required", params: { missingProperty: "messageId" }, message: "must have required property 'messageId'" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            if (data7.verbatimSnippet === void 0) {
              const err15 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/ContextNoteSource/anyOf/0/required", keyword: "required", params: { missingProperty: "verbatimSnippet" }, message: "must have required property 'verbatimSnippet'" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            for (const key1 in data7) {
              if (!(key1 === "kind" || key1 === "messageId" || key1 === "verbatimSnippet" || key1 === "summary")) {
                const err16 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/ContextNoteSource/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
            if (data7.kind !== void 0) {
              let data8 = data7.kind;
              if (typeof data8 !== "string") {
                const err17 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/ContextNoteSource/anyOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
              if ("user_message" !== data8) {
                const err18 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/ContextNoteSource/anyOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "user_message" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
            if (data7.messageId !== void 0) {
              if (typeof data7.messageId !== "string") {
                const err19 = { instancePath: instancePath + "/source/messageId", schemaPath: "#/definitions/ContextNoteSource/anyOf/0/properties/messageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
            if (data7.verbatimSnippet !== void 0) {
              if (typeof data7.verbatimSnippet !== "string") {
                const err20 = { instancePath: instancePath + "/source/verbatimSnippet", schemaPath: "#/definitions/ContextNoteSource/anyOf/0/properties/verbatimSnippet/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            }
            if (data7.summary !== void 0) {
              if (typeof data7.summary !== "string") {
                const err21 = { instancePath: instancePath + "/source/summary", schemaPath: "#/definitions/ContextNoteSource/anyOf/0/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            }
          } else {
            const err22 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/ContextNoteSource/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
          var _valid0 = _errs21 === errors;
          valid4 = valid4 || _valid0;
          if (!valid4) {
            const _errs32 = errors;
            if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
              if (data7.kind === void 0) {
                const err23 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/ContextNoteSource/anyOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
              for (const key2 in data7) {
                if (!(key2 === "kind" || key2 === "messageId" || key2 === "summary")) {
                  const err24 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/ContextNoteSource/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err24];
                  } else {
                    vErrors.push(err24);
                  }
                  errors++;
                }
              }
              if (data7.kind !== void 0) {
                let data12 = data7.kind;
                if (typeof data12 !== "string") {
                  const err25 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/ContextNoteSource/anyOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err25];
                  } else {
                    vErrors.push(err25);
                  }
                  errors++;
                }
                if ("user_decision" !== data12) {
                  const err26 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/ContextNoteSource/anyOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "user_decision" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err26];
                  } else {
                    vErrors.push(err26);
                  }
                  errors++;
                }
              }
              if (data7.messageId !== void 0) {
                if (typeof data7.messageId !== "string") {
                  const err27 = { instancePath: instancePath + "/source/messageId", schemaPath: "#/definitions/ContextNoteSource/anyOf/1/properties/messageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err27];
                  } else {
                    vErrors.push(err27);
                  }
                  errors++;
                }
              }
              if (data7.summary !== void 0) {
                if (typeof data7.summary !== "string") {
                  const err28 = { instancePath: instancePath + "/source/summary", schemaPath: "#/definitions/ContextNoteSource/anyOf/1/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err28];
                  } else {
                    vErrors.push(err28);
                  }
                  errors++;
                }
              }
            } else {
              const err29 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/ContextNoteSource/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err29];
              } else {
                vErrors.push(err29);
              }
              errors++;
            }
            var _valid0 = _errs32 === errors;
            valid4 = valid4 || _valid0;
            if (!valid4) {
              const _errs41 = errors;
              if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
                if (data7.kind === void 0) {
                  const err30 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/ContextNoteSource/anyOf/2/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err30];
                  } else {
                    vErrors.push(err30);
                  }
                  errors++;
                }
                for (const key3 in data7) {
                  if (!(key3 === "kind" || key3 === "actionId" || key3 === "summary")) {
                    const err31 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/ContextNoteSource/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err31];
                    } else {
                      vErrors.push(err31);
                    }
                    errors++;
                  }
                }
                if (data7.kind !== void 0) {
                  let data15 = data7.kind;
                  if (typeof data15 !== "string") {
                    const err32 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/ContextNoteSource/anyOf/2/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err32];
                    } else {
                      vErrors.push(err32);
                    }
                    errors++;
                  }
                  if ("agent_decision" !== data15) {
                    const err33 = { instancePath: instancePath + "/source/kind", schemaPath: "#/definitions/ContextNoteSource/anyOf/2/properties/kind/const", keyword: "const", params: { allowedValue: "agent_decision" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err33];
                    } else {
                      vErrors.push(err33);
                    }
                    errors++;
                  }
                }
                if (data7.actionId !== void 0) {
                  if (typeof data7.actionId !== "string") {
                    const err34 = { instancePath: instancePath + "/source/actionId", schemaPath: "#/definitions/ContextNoteSource/anyOf/2/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err34];
                    } else {
                      vErrors.push(err34);
                    }
                    errors++;
                  }
                }
                if (data7.summary !== void 0) {
                  if (typeof data7.summary !== "string") {
                    const err35 = { instancePath: instancePath + "/source/summary", schemaPath: "#/definitions/ContextNoteSource/anyOf/2/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err35];
                    } else {
                      vErrors.push(err35);
                    }
                    errors++;
                  }
                }
              } else {
                const err36 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/ContextNoteSource/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err36];
                } else {
                  vErrors.push(err36);
                }
                errors++;
              }
              var _valid0 = _errs41 === errors;
              valid4 = valid4 || _valid0;
            }
          }
          if (!valid4) {
            const err37 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/ContextNoteSource/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
            if (vErrors === null) {
              vErrors = [err37];
            } else {
              vErrors.push(err37);
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
        const err38 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err38];
        } else {
          vErrors.push(err38);
        }
        errors++;
      }
      validate30.errors = vErrors;
      return errors === 0;
    }
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.kind === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
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
        for (const key0 in data) {
          if (!(key0 === "kind" || key0 === "reason" || key0 === "memoryPatch" || key0 === "contextNotes")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
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
            const err3 = { instancePath: instancePath + "/kind", schemaPath: "#/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if ("wait" !== data0) {
            const err4 = { instancePath: instancePath + "/kind", schemaPath: "#/properties/kind/const", keyword: "const", params: { allowedValue: "wait" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.reason !== void 0) {
          if (typeof data.reason !== "string") {
            const err5 = { instancePath: instancePath + "/reason", schemaPath: "#/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.memoryPatch !== void 0) {
          if (!validate12(data.memoryPatch, { instancePath: instancePath + "/memoryPatch", parentData: data, parentDataProperty: "memoryPatch", rootData })) {
            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
            errors = vErrors.length;
          }
        }
        if (data.contextNotes !== void 0) {
          let data3 = data.contextNotes;
          if (Array.isArray(data3)) {
            const len0 = data3.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate30(data3[i0], { instancePath: instancePath + "/contextNotes/" + i0, parentData: data3, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err6 = { instancePath: instancePath + "/contextNotes", schemaPath: "#/properties/contextNotes/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
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
export default require_WaitAgentDecision_validator();
